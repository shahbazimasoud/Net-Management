import {
  Device,
  SwitchPort,
  CdpLldpNeighbor,
  TopologyData,
  VlanInfo,
  ConfigTemplate,
  TemplateApplyResult,
  DeviceConfigExtractRequest,
  DeviceConfigExtractResult,
  DeviceGroup,
  ActiveDirectoryConfig,
  AccessPolicy,
  RemoteServer,
  SslCertificateItem,
  SslCertificatesSummary,
  SslCertificateProbeResult,
  HelpdeskNotificationConfig,
  HelpdeskExceptionRule,
  HelpdeskExceptionRuleType,
  RemoteServerTagSummary,
  PostgresConnectionTestResult,
  PostgresRemediateConnectionResult,
  PostgresEngineOverview,
  MysqlConnectionTestResult,
  MysqlAutoFixResult,
  MysqlUserPrivilegesAuditResult,
  MysqlAutoGrantResult,
  MysqlOverview,
  MysqlDatabaseItem,
  MysqlDatabaseDetails,
  MysqlDatabaseObjects,
  MysqlUserItem,
  MysqlProcessItem,
  MysqlVariableItem,
  MysqlQueryResult,
  MysqlSqlQuerySafetyReport,
  MysqlTableStructure,
  MysqlTableDataRequest,
  MysqlTableDataResult,
  MysqlRowInsertRequest,
  MysqlRowUpdateRequest,
  MysqlRowDeleteRequest,
  MysqlRowMutationResult,
  MysqlUserCreateRequest,
  MysqlUserUpdateRequest,
  MysqlUserPasswordChangeRequest,
  MysqlUserLockRequest,
  MysqlUserExpirePasswordRequest,
  MysqlUserDropRequest,
  MysqlUserGrantsResponse,
  MysqlPermissionsMatrixResponse,
  MysqlApplyPermissionsRequest,
  MysqlApplyPermissionsResult,
  MysqlPrivilegeScope,
  MysqlRoutineType,
  MysqlKillType,
  MysqlProcesslistResponse,
  MysqlKillProcessResult,
  MysqlTableColumnDefinition,
  MysqlCreateTableRequest,
  MysqlRenameTableRequest,
  MysqlAlterTableOptionsRequest,
  MysqlDropTableRequest,
  MysqlTruncateTableRequest,
  MysqlAddColumnRequest,
  MysqlModifyColumnRequest,
  MysqlRenameColumnRequest,
  MysqlDropColumnRequest,
  MysqlCreateIndexRequest,
  MysqlDropIndexRequest,
  MysqlAddForeignKeyRequest,
  MysqlDropForeignKeyRequest,
  MysqlManagePrimaryKeyRequest,
  MysqlDdlOperationResult,
  MysqlCreateViewRequest,
  MysqlDropViewRequest,
  MysqlCreateProcedureRequest,
  MysqlDropProcedureRequest,
  MysqlExecuteProcedureRequest,
  MysqlExecuteProcedureResult,
  MysqlCreateFunctionRequest,
  MysqlDropFunctionRequest,
  MysqlCreateTriggerRequest,
  MysqlDropTriggerRequest,
  MysqlEventSchedulerStatus,
  MysqlSetEventSchedulerRequest,
  MysqlCreateEventRequest,
  MysqlAlterEventStatusRequest,
  MysqlDropEventRequest,
  MysqlDumpOptions,
  MysqlDumpResult,
  MysqlCnfBackupItem,
  MysqlCnfFileMetadata,
  MysqlCnfParameter,
  MysqlClientHostAccessRule,
  MysqlClientAuthConfigData,
  MysqlClientAuthSaveRequest,
  MysqlClientAuthSaveResult,
  MysqlHostRuleUpdateRequest,
  MysqlDynamicVariableUpdateRequest,
  MysqlBackupItem,
  MysqlCreateBackupRequest,
  MysqlCreateBackupResult,
  MysqlValidateRestoreRequest,
  MysqlValidateRestoreResult,
  MysqlRestoreBackupRequest,
  MysqlRestoreBackupResult,
  MysqlBackupPreviewResult,
  MysqlMaintenanceRequest,
  MysqlMaintenanceResult,
  MysqlTableBloatMetric,
  MysqlActiveMaintenanceProgress,
  MysqlReplicationOverview,
  MysqlReplicationActionRequest,
  MysqlReplicationActionResult,
  MysqlSecurityAuditReport,
  MysqlHardeningRemediationRequest,
  MysqlHardeningRemediationResult,
  MysqlAuditLogsResponse,
  PostgresDatabaseItem,
  PostgresRoleItem,
  PostgresDatabaseTree,
  PostgresTableStructure,
  PostgresTableDataResult,
  PostgresTableDataRequest,
  PostgresRowInsertRequest,
  PostgresRowUpdateRequest,
  PostgresRowDeleteRequest,
  PostgresRowMutationResult,
  PostgresQueryExecutionRequest,
  PostgresQueryExecutionResponse,
  LinuxServerLiveMetrics,
  LinuxSystemService,
  LinuxSystemUser,
  LinuxSystemGroup,
  LinuxUserSecurityInfo,
  LinuxLoggedInUser,
  LinuxNetworkInterfaceDetail,
  LinuxNetworkStackInfo,
  LinuxInterfaceConfigPayload,
  LinuxSystemDetailedInfo,
  LinuxProxyConfig,
  LinuxBlockDevice,
  LinuxMountPayload,
  LinuxStorageOverview,
  LinuxDiskFormatMountPayload,
  LinuxLvmOverview,
  LinuxLvmExtendPayload,
  LinuxLvmCreatePayload,
  LinuxLvmCreateVgPayload,
  LinuxLvmShrinkPayload,
  LinuxServiceWatchdogRule,
  LinuxDirectoryPolicyRule,
  LinuxDnsConfig,
  LinuxFail2banStatus,
  LinuxHostEntry,
  LinuxHostnameInfo,
  LinuxSshConfig,
  LinuxTimeInfo,
  LinuxTcpWrapperRule,
  LinuxTcpWrappersData,
  LinuxLogCategory,
  LinuxSystemLogsResponse,
  LinuxPackageItem,
  LinuxPackageUpdateOverview,
  PackageUpdateJobStatus,
  PackageUpdateJobStep,
  LinuxFirewallInfo,
  LinuxFirewallRule,
  LinuxFirewallRulePayload,
  LinuxFsListResult,
  LinuxFsItem,
  LinuxQuickDir,
  LinuxFileContentResult,
  LinuxItemProperties,
  LinuxCronJob,
  LinuxCronJobPayload,
  LinuxCronOverview,
  LinuxCronExecutionResult,
  EmailConfig,
  EmailTestResult,
  AuditReportScheduleConfig,
  AuditReportPreviewResult,
  AuditReportSendResult,
  ServerTimeInfo,
  TelegramAlertConfig,
  TelegramTestResult,
  LicenseItem,
  ContractItem,
  AttachmentFile,
  ApprovalEligibleCandidatesResponse,
} from '../types';

const API_BASE = '/api';

function getAuthToken(): string | null {
  try {
    return (
      sessionStorage.getItem('nettopology_auth_token_v1') ||
      localStorage.getItem('nettopology_auth_token_v1') ||
      null
    );
  } catch {
    return null;
  }
}

function getActiveUsername(): string | null {
  try {
    const active =
      sessionStorage.getItem('nettopology_active_user_v1') ||
      localStorage.getItem('nettopology_active_user_v1');
    if (active) {
      const parsed = JSON.parse(active);
      if (parsed?.username) return parsed.username;
    }
    const token = getAuthToken();
    if (token && token.includes('.')) {
      const parts = token.split('.');
      const payloadBase64Url = parts.length >= 3 ? parts[1] : parts[0];
      const base64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const parsed = JSON.parse(jsonStr);
      const candidate = (parsed?.username || parsed?.samAccountName || parsed?.user?.username || parsed?.email || '').trim();
      if (candidate) return candidate;
    }
  } catch {}
  return null;
}

/**
 * Resilient fetch wrapper with automatic backoff for 503 (backend starting up) and network blips
 * Automatically injects PostgreSQL Bearer token and active role simulation headers
 */
async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  const token = getAuthToken();
  const reqHeaders = new Headers(options?.headers || {});
  if (token && !reqHeaders.has('Authorization')) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }
  const activeUser = getActiveUsername();
  if (activeUser) {
    if (!reqHeaders.has('x-user-name')) reqHeaders.set('x-user-name', activeUser);
    if (!reqHeaders.has('x-operator-user')) reqHeaders.set('x-operator-user', activeUser);
  }
  const updatedOptions: RequestInit = {
    ...options,
    headers: reqHeaders,
  };

  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, updatedOptions);
      if (res.status === 503 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 500));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }
  }
  throw lastError || new Error(`Network request to ${url} failed`);
}

async function parseErrorAndThrow(res: Response, fallbackMessage: string): Promise<never> {
  const errData = await res.json().catch(() => ({} as any));
  const err: any = new Error(errData?.error || errData?.message || fallbackMessage);
  if (errData?.approvalHandled || res.headers.get('X-Approval-Handled') === 'true') {
    err.approvalHandled = true;
  }
  if (errData?.submittedApprovalId) {
    err.submittedApprovalId = errData.submittedApprovalId;
  }
  if (errData?.cancelled) {
    err.cancelled = true;
  }
  if (errData?.code) {
    err.code = errData.code;
  }
  if (errData?.errorFa) {
    err.errorFa = errData.errorFa;
  }
  if (errData?.blockedByException) {
    err.blockedByException = true;
    err.ruleId = errData.ruleId;
    err.ruleType = errData.ruleType;
    err.matchedValue = errData.matchedValue;
  }
  err.status = res.status;
  throw err;
}

export async function fetchHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchDevices(): Promise<{ devices: Device[]; total: number; online_count: number; offline_count: number }> {
  const res = await fetchWithRetry(`${API_BASE}/devices`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function addDevice(device: Partial<Device>): Promise<{ device: Device; message: string }> {
  const res = await fetchWithRetry(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to add device');
  return res.json();
}

export async function updateDevice(id: string, updates: Partial<Device>): Promise<{ device: Device; message: string }> {
  const res = await fetchWithRetry(`${API_BASE}/devices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update device');
  return res.json();
}

export async function deleteDevice(id: string): Promise<{ message: string }> {
  const res = await fetchWithRetry(`${API_BASE}/devices/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to delete device');
  return res.json();
}

export async function fetchDeviceCapabilities(deviceId: string): Promise<import('../types').DevicePlatformInfo> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/capabilities`);
  if (!res.ok) throw new Error('Failed to fetch device capabilities');
  return res.json();
}

export async function fetchDeviceConnection(deviceId: string): Promise<{
  connected: boolean;
  platform: string;
  protocol: string;
  latency_ms?: number;
  sessionId?: string;
  isReal?: boolean;
  banner?: string;
  mode?: string;
}> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/connection`);
  if (!res.ok) throw new Error('Failed to fetch device connection state');
  return res.json();
}

export async function connectDevice(deviceId: string): Promise<{
  success: boolean;
  connected: boolean;
  sessionId: string;
  platform: string;
  isReal: boolean;
  latency_ms: number;
  banner: string;
  mode?: string;
}> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to connect to device');
  return res.json();
}

export async function disconnectDevice(deviceId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/connection`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to disconnect device');
  return res.json();
}

export async function executeDeviceOperation(
  deviceId: string,
  operation: string,
  iface?: string,
  params?: Record<string, any>,
  userRole?: string
): Promise<{
  success: boolean;
  cli_command: string;
  output: string;
  isReal: boolean;
  durationMs: number;
  port?: SwitchPort;
  message?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/devices/${deviceId}/operations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userRole ? { 'X-User-Role': userRole } : {}),
    },
    body: JSON.stringify({ operation, interface: iface, params, user_role: userRole }),
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'Operation failed on device');
  }
  return res.json();
}

export async function executeDeviceTerminal(
  deviceId: string,
  command: string,
  userRole?: string
): Promise<{
  success: boolean;
  output: string;
  isReal: boolean;
  durationMs: number;
  exitCode?: number;
}> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/terminal/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userRole ? { 'X-User-Role': userRole } : {}),
    },
    body: JSON.stringify({ command, user_role: userRole }),
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'Failed to execute command on device');
  }
  return res.json();
}

export async function fetchDevicePorts(
  deviceId: string,
  live = false
): Promise<{
  device: Device;
  ports: SwitchPort[];
  active_count: number;
  inactive_count: number;
  admin_disabled_count: number;
  is_live?: boolean;
  cached?: boolean;
  mode?: string;
  error?: string;
  message?: string;
}> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = live ? `${API_BASE}/devices/${deviceId}/ports?live=true` : `${API_BASE}/devices/${deviceId}/ports`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to fetch ports');
  }
  return res.json();
}

export async function syncDevicePorts(deviceId: string): Promise<{
  device: Device;
  ports: SwitchPort[];
  active_count?: number;
  inactive_count?: number;
  admin_disabled_count?: number;
  is_live: boolean;
  sync_source?: string;
  error?: string;
  message?: string;
}> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/devices/${deviceId}/ports/sync`, {
    method: 'POST',
    headers,
  });
  if (res.ok) {
    const data = await res.json();
    if (data && Array.isArray(data.ports)) {
      return data;
    }
  }

  const errData = await res.json().catch(() => ({}));
  throw new Error(errData.message || errData.error || 'Port synchronization failed');
}

export interface DeviceLogsResponse {
  success: boolean;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  platform?: string;
  commandExecuted?: string;
  logs: string[];
  rawOutput?: string;
  totalLines?: number;
  error?: string;
}

export async function fetchDeviceLogs(deviceId: string, lines: number = 150): Promise<DeviceLogsResponse> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/devices/${deviceId}/logs?lines=${lines}`, {
    method: 'GET',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success) {
    return data;
  }
  throw new Error(data.error || data.message || 'Failed to fetch device logs');
}

export async function clearDeviceLogs(deviceId: string): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/devices/${deviceId}/logs/clear`, {
    method: 'POST',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success) {
    return data;
  }
  throw new Error(data.error || data.message || 'Failed to clear device logs');
}

export interface DeviceSessionResponse {
  success: boolean;
  sessionId?: string;
  deviceId?: string;
  deviceName?: string;
  status?: string;
  banner?: string;
  isExisting?: boolean;
  error?: string;
}

export async function openDeviceSessionApi(deviceId: string): Promise<DeviceSessionResponse> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/devices/${deviceId}/session/open`, {
    method: 'POST',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success) {
    return data;
  }
  throw new Error(data.error || 'Failed to establish persistent session');
}

export async function closeDeviceSessionApi(deviceId: string, reason?: string): Promise<{ success: boolean; closed: boolean }> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/session/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: reason || 'Port modal closed' }),
    });
    return await res.json().catch(() => ({ success: true, closed: true }));
  } catch {
    return { success: false, closed: false };
  }
}

export async function checkDeviceSessionStatusApi(deviceId: string): Promise<{ success: boolean; active: boolean; sessionId?: string; status?: string }> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/devices/${deviceId}/session/status`, {
    method: 'GET',
    headers,
  });
  return await res.json().catch(() => ({ success: false, active: false }));
}

export async function updateSwitchPort(
  deviceId: string,
  portId: string,
  updates: Partial<SwitchPort> & { interface?: string },
  options?: { clientAuditLogged?: boolean }
): Promise<{ port: SwitchPort; message: string; success?: boolean; cli_output?: string }> {
  const cleanId = String(
    portId ||
    updates.port_id ||
    updates.port ||
    updates.name ||
    updates.interface ||
    ''
  ).trim();

  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.clientAuditLogged) {
    reqHeaders['x-client-audit-logged'] = 'true';
  }

  const res = await fetchWithRetry(`${API_BASE}/devices/${deviceId}/ports/${encodeURIComponent(cleanId)}`, {
    method: 'PUT',
    headers: reqHeaders,
    body: JSON.stringify({ ...updates, port_id: cleanId, interface: cleanId }),
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'Failed to update port');
  }
  return res.json();
}

export async function batchUpdateSwitchPorts(
  deviceId: string,
  portIds: string[],
  updates: Partial<SwitchPort>,
  options?: { clientAuditLogged?: boolean }
): Promise<{ success: boolean; updatedCount: number; message: string; ports: SwitchPort[] }> {
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.clientAuditLogged) {
    reqHeaders['x-client-audit-logged'] = 'true';
  }

  const res = await fetchWithRetry(`${API_BASE}/devices/${deviceId}/ports/batch`, {
    method: 'PUT',
    headers: reqHeaders,
    body: JSON.stringify({ port_ids: portIds, updates }),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to batch update ports');
  return res.json();
}

export interface DiscoveredHardware {
  hostname?: string;
  model?: string;
  serial_number?: string;
  mac_address?: string;
  os_version?: string;
  uptime?: string;
  cpu_model?: string;
  total_ports?: number;
  memory_total_mb?: number;
  memory_free_mb?: number;
  device_type?: 'switch' | 'router' | 'access_point';
  platform_detected?: string;
}

export interface DiscoveredPower {
  power_supplies: number;
  power_watts: number;
  source: string;
}

export async function testDeviceConnection(data: {
  ip: string;
  port?: number;
  username?: string;
  password?: string;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  enable_password?: string;
  protocol?: 'ssh' | 'telnet';
  connection_protocol?: 'ssh' | 'telnet';
  platform?: string;
  connection_mode?: string;
  simulate?: boolean;
  lang?: string;
  ssh_version?: 'legacy' | 'modern' | string;
  sshVersion?: 'legacy' | 'modern' | string;
}): Promise<{
  success: boolean;
  message: string;
  message_en?: string;
  message_fa?: string;
  latency_ms?: number;
  banner?: string;
  protocol?: string;
  ssh_protocol?: string;
  paramiko_version?: string;
  ssh_version?: string;
  negotiation?: {
    kex?: string;
    cipher?: string;
    key_type?: string;
    mac?: string;
    tier?: string;
  };
  ssh_negotiation?: {
    kex?: string;
    cipher?: string;
    key_type?: string;
    mac?: string;
    tier?: string;
  };
  library_used?: string;
  ssh_suite?: string;
  error?: string;
  hostname?: string;
  model?: string;
  total_ports?: number;
  ports?: SwitchPort[];
  raw_status_output?: string;
  live_discovery?: boolean;
  simulated?: boolean;
  hardware?: DiscoveredHardware;
  power?: DiscoveredPower;
  master_session_id?: string;
  serial_number?: string;
  mac?: string;
  uptime?: string;
  firmware?: string;
}> {
  const res = await fetch(`${API_BASE}/devices/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export interface SnmpTestParams {
  host: string;
  ip?: string;
  port?: number;
  version?: 'v1' | 'v2c' | 'v3';
  community?: string;
  community_vault_item_id?: string;
  v3_user?: string;
  v3_security_level?: 'noAuthNoPriv' | 'authNoPriv' | 'authPriv';
  v3_auth_protocol?: 'MD5' | 'SHA-1' | 'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  v3_auth_password?: string;
  v3_auth_vault_item_id?: string;
  v3_priv_protocol?: 'DES' | 'AES-128' | 'AES-192' | 'AES-256' | '3DES';
  v3_priv_password?: string;
  v3_priv_vault_item_id?: string;
  v3_context?: string;
  timeout?: number;
  retries?: number;
  is_en?: boolean;
}

export interface SnmpTestResult {
  success: boolean;
  version: 'v1' | 'v2c' | 'v3';
  port: number;
  target: string;
  latency_ms?: number;
  sysName?: string;
  sysDescr?: string;
  sysObjectID?: string;
  sysUpTime?: string;
  error?: string;
  errorFa?: string;
  message?: string;
}

export async function testSnmpConnection(params: SnmpTestParams): Promise<SnmpTestResult> {
  const res = await fetch(`${API_BASE}/devices/test-snmp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}


export function getTerminalWebSocketUrl(
  deviceId: string,
  protocol?: 'ssh' | 'telnet',
  role?: string,
  deviceInfo?: {
    ip?: string;
    ssh_host?: string;
    ssh_port?: number;
    ssh_username?: string;
    ssh_password?: string;
    password?: string;
    enable_password?: string;
    platform?: string;
    ssh_version?: 'legacy' | 'modern' | string;
    approval_request_id?: string;
  }
): string {
  const loc = window.location;
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  query.set('deviceId', deviceId);
  if (protocol) query.set('protocol', protocol);
  if (role) query.set('role', role);
  if (deviceInfo) {
    const h = (deviceInfo.ssh_host || deviceInfo.ip || '').trim();
    if (h) query.set('host', h);
    if (deviceInfo.ssh_port) query.set('port', String(deviceInfo.ssh_port));
    const u = (deviceInfo.ssh_username || '').trim();
    if (u) query.set('username', u);
    const pass = deviceInfo.ssh_password || deviceInfo.password || '';
    if (pass) query.set('password', pass);
    if (deviceInfo.enable_password) query.set('enable_password', deviceInfo.enable_password);
    if (deviceInfo.platform) query.set('platform', deviceInfo.platform);
    if (deviceInfo.ssh_version) query.set('ssh_version', deviceInfo.ssh_version);
    if (deviceInfo.approval_request_id) query.set('approvalRequestId', deviceInfo.approval_request_id);
  }
  const token = getAuthToken();
  if (token) query.set('token', token);
  return `${wsProto}//${loc.host}/ws/ssh/${encodeURIComponent(deviceId)}?${query.toString()}`;
}

export const getSshWebSocketUrl = getTerminalWebSocketUrl;

export async function closeDeviceTerminalSession(deviceId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/terminal`, {
    method: 'DELETE',
  });
  return res.json().catch(() => ({ success: true, message: 'Terminal closed' }));
}

export interface DeviceUnsavedChangesInfo {
  has_unsaved_changes: boolean;
  pending_changes?: Array<{
    port_id?: string;
    type?: string;
    description?: string;
    command?: string;
    timestamp?: string;
  }>;
  modified_ports?: Array<{
    port_id: string;
    mode: string;
    vlan: number;
    status: string;
    admin_status?: string;
    description: string;
    port_security_enabled?: boolean;
    change_summary?: string;
  }>;
  last_modified_time?: string;
  cli_diff?: string;
}

export async function fetchDeviceUnsavedChanges(deviceId: string): Promise<DeviceUnsavedChangesInfo> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/unsaved-changes`);
  if (!res.ok) {
    return { has_unsaved_changes: true, pending_changes: [] };
  }
  return res.json();
}

export async function writeMemory(
  deviceId: string,
  options?: { clientAuditLogged?: boolean }
): Promise<{ success: boolean; device: Device; message: string }> {
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.clientAuditLogged) {
    reqHeaders['x-client-audit-logged'] = 'true';
  }

  const res = await fetchWithRetry(`${API_BASE}/devices/${deviceId}/write-memory`, {
    method: 'POST',
    headers: reqHeaders,
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to write memory');
  return res.json();
}

export async function fetchTopology(): Promise<TopologyData> {
  const res = await fetchWithRetry(`${API_BASE}/topology`);
  if (!res.ok) throw new Error('Failed to fetch topology');
  return res.json();
}

export async function fetchCdpLldpNeighbors(protocol?: 'CDP' | 'LLDP'): Promise<{
  neighbors: CdpLldpNeighbor[];
  total: number;
  cdp_count: number;
  lldp_count: number;
}> {
  const url = protocol ? `${API_BASE}/cdp-lldp/neighbors?protocol=${protocol}` : `${API_BASE}/cdp-lldp/neighbors`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch CDP/LLDP neighbors');
  return res.json();
}

export async function runCdpLldpScan(): Promise<{
  success: boolean;
  message: string;
  neighbors: CdpLldpNeighbor[];
  links: any[];
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/scan/cdp-lldp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to run CDP/LLDP scan');
  return res.json();
}

export async function pingAllDevices(deviceIds?: string[]): Promise<{
  success?: boolean;
  message: string;
  message_en?: string;
  online_count?: number;
  offline_count?: number;
  results: Array<{
    id: string;
    name: string;
    ip: string;
    is_online: boolean;
    latency_ms: number | null;
    packet_loss: number;
    last_seen?: string;
    probe_method?: 'icmp' | 'tcp';
  }>;
}> {
  const res = await fetchWithRetry(`${API_BASE}/ping-all`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: Array.isArray(deviceIds) && deviceIds.length > 0 ? JSON.stringify({ deviceIds }) : undefined,
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to ping devices');
  return res.json();
}

export async function pingDevice(id: string): Promise<{
  success?: boolean;
  device: Device;
  ping_result: {
    ip: string;
    is_online: boolean;
    latency_ms: number | null;
    packet_loss: number;
    probe_method?: 'icmp' | 'tcp';
  };
}> {
  const res = await fetchWithRetry(`${API_BASE}/ping/${encodeURIComponent(id)}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to ping device');
  return res.json();
}

export async function authorizeSchematicExport(payload: {
  mapId?: string;
  mapName: string;
  exportMode: 'card' | 'physical' | 'both';
  deviceCount: number;
  linkCount: number;
  vlanCount: number;
  rackCount: number;
  towerCount: number;
}): Promise<{
  success: boolean;
  authorized: boolean;
  exportedBy: string;
  exportedAt: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/schematic/export-authorize`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Not authorized to export schematic topology');
  return res.json();
}

export interface HelpdeskConnectionPayload {
  targetIp: string;
  protocol: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  port?: number;
  username: string;
  password: string;
  jeaConfigName?: string;
  skipHistory?: boolean;
}

export interface HelpdeskConnectionHistoryItem {
  id: string;
  targetIp: string;
  hostname: string;
  osName: string;
  osFamily: 'windows' | 'linux' | 'unknown';
  loggedInUser: string;
  sessionUsername: string;
  protocolRequested: string;
  protocolUsed: string;
  portUsed: number;
  jeaConfigName?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  actorName: string;
  actorRole: string;
  connectedAt: string;
}

export interface HelpdeskConnectionHistoryResponse {
  success: boolean;
  scope?: 'all' | 'own';
  items: HelpdeskConnectionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    totalConnections: number;
    uniqueHosts: number;
    successCount: number;
    failedCount: number;
    lastConnectedAt: string | null;
    lastTargetIp: string | null;
    lastHostname: string | null;
  };
}

export async function fetchHelpdeskStatus(): Promise<{
  success: boolean;
  permissions: {
    canViewHelpdesk: boolean;
    canViewHelpdeskUsers?: boolean;
    canViewHelpdeskGroups?: boolean;
    canRunHelpdeskDiagnostics: boolean;
    canExecuteHelpdeskActions: boolean;
    canViewHelpdeskEventViewer: boolean;
    canTerminateHelpdeskProcesses: boolean;
    canCleanHelpdeskTemp: boolean;
    canRunHelpdeskGpupdate: boolean;
    canRunHelpdeskSystemRepair: boolean;
    canInspectHelpdeskDomainUsers: boolean;
    canUnlockHelpdeskDomainUsers?: boolean;
    canPowerControlHelpdeskEndpoints: boolean;
    canManageHelpdeskExceptions: boolean;
    canSendHelpdeskMessage: boolean;
    canViewAllHelpdeskHistory: boolean;
  };
  rateLimit: {
    windowMinutes: number;
    maxWriteActions: number;
    maxDistinctHosts: number;
    usedWriteActions: number;
    remainingWriteActions: number;
    distinctHostsUsed: number;
    isFrozen: boolean;
    freezeUntilIso: string | null;
  };
  jeaTemplates: {
    jeaConfigName: string;
    roleCapabilityScript: string;
    registerSessionScript: string;
  };
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/status`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to fetch HelpDesk status');
  return res.json();
}

export async function fetchHelpdeskEndpointHealth(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/health`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to collect endpoint health telemetry');
  return res.json();
}

export async function fetchHelpdeskConnectionHistory(params: {
  search?: string;
  status?: 'all' | 'success' | 'failed';
  protocol?: string;
  page?: number;
  pageSize?: number;
}): Promise<HelpdeskConnectionHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.protocol) qs.set('protocol', params.protocol);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/history?${qs.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to fetch HelpDesk connection history');
  return res.json();
}

export async function deleteHelpdeskConnectionHistoryItem(id: string): Promise<{ success: boolean }> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to delete HelpDesk connection history record');
  return res.json();
}

export async function clearHelpdeskConnectionHistory(): Promise<{
  success: boolean;
  clearedCount: number;
  scope?: 'all' | 'own';
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/history`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to clear HelpDesk connection history');
  return res.json();
}

export async function fetchHelpdeskNetworkSnapshot(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/snapshot`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect endpoint network adapters');
  return res.json();
}

export async function runHelpdeskNetworkProbe(
  payload: HelpdeskConnectionPayload & {
    probeType: 'ping' | 'port' | 'dns' | 'nslookup' | 'tracert' | 'http' | 'arp';
    probeTarget: string;
    probePort?: number;
    dnsRecordType?: string;
    dnsServer?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/probe`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Endpoint diagnostic probe failed');
  return res.json();
}

export async function executeHelpdeskNetworkAction(
  payload: HelpdeskConnectionPayload & {
    action: 'network_flush_dns' | 'network_renew_ip';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Safe network reset action failed');
  return res.json();
}

export async function updateHelpdeskAdapterNetworkConfig(
  payload: HelpdeskConnectionPayload & {
    adapterName: string;
    interfaceIndex?: number;
    ipMode: 'keep' | 'dhcp' | 'static';
    ipAddress?: string;
    subnetMask?: string;
    prefixLength?: number;
    gateway?: string;
    dnsMode: 'keep' | 'dhcp' | 'static';
    dnsPrimary?: string;
    dnsSecondary?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/adapter`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update endpoint NIC IP/DNS configuration');
  return res.json();
}

export async function manageHelpdeskHostsEntry(
  payload: HelpdeskConnectionPayload & {
    operation: 'add' | 'toggle' | 'delete';
    ip?: string;
    hostnames?: string;
    comment?: string;
    lineIndex?: number;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/hosts`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update endpoint hosts file');
  return res.json();
}

export async function updateHelpdeskProxySettings(
  payload: HelpdeskConnectionPayload & {
    scope: 'user' | 'winhttp' | 'both';
    enabled: boolean;
    server?: string;
    override?: string;
    autoConfigUrl?: string;
    autoDetect?: boolean;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/proxy`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update OS proxy configuration');
  return res.json();
}

export async function manageHelpdeskStaticRoute(
  payload: HelpdeskConnectionPayload & {
    operation: 'add' | 'delete';
    destination: string;
    netmask?: string;
    prefixLength?: number;
    gateway?: string;
    interfaceIndex?: number;
    metric?: number;
    persistent?: boolean;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/route`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Static route operation failed');
  return res.json();
}

export async function manageHelpdeskVpnConnection(
  payload: HelpdeskConnectionPayload & {
    operation: 'create' | 'delete' | 'connect' | 'disconnect';
    name: string;
    originalName?: string;
    serverAddress?: string;
    tunnelType?: 'Automatic' | 'L2tp' | 'Ikev2' | 'Sstp' | 'Pptp';
    l2tpPsk?: string;
    useWinlogonCredential?: boolean;
    splitTunneling?: boolean;
    allUserConnection?: boolean;
    dnsSuffix?: string;
    customUsername?: string;
    customPassword?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/network/vpn`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Endpoint VPN operation failed');
  return res.json();
}

export async function fetchHelpdeskPrinterStatus(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/printers/status`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect endpoint printers and spooler');
  return res.json();
}

export async function executeHelpdeskPrinterAction(
  payload: HelpdeskConnectionPayload & {
    action: 'spooler_restart' | 'spooler_clear_queue';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/printers/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Print Spooler repair action failed');
  return res.json();
}

export async function setHelpdeskDefaultPrinter(
  payload: HelpdeskConnectionPayload & {
    printerName: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/printers/set-default`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to set default printer');
  return res.json();
}

export async function sendHelpdeskPrinterTestPage(
  payload: HelpdeskConnectionPayload & {
    printerName: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/printers/test-print`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to send test print page');
  return res.json();
}

export async function renameHelpdeskComputer(
  payload: HelpdeskConnectionPayload & {
    newHostname: string;
    restartAfter?: boolean;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/computer/rename`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to rename computer');
  return res.json();
}

export async function deleteHelpdeskPrinter(
  payload: HelpdeskConnectionPayload & {
    printerName: string;
    scope?: 'machine' | 'user' | 'auto';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/printers/delete`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to remove printer');
  return res.json();
}

export async function fetchHelpdeskPrintServerPrinters(
  payload: HelpdeskConnectionPayload & {
    printServer: string;
    printServerUsername?: string;
    printServerPassword?: string;
  }
): Promise<{
  success: boolean;
  data: {
    targetIp: string;
    printServer: string;
    protocolUsed: string;
    osFamily: string;
    loggedInUser: string;
    collectedAt: string;
    printers: Array<{
      name: string;
      shareName: string;
      uncPath: string;
      driverName: string;
      portName: string;
      location: string;
      comment: string;
      status: string;
      shared: boolean;
      alreadyInstalled: boolean;
    }>;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/printers/server/list`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to query print server printers');
  return res.json();
}

export async function installHelpdeskPrintServerPrinter(
  payload: HelpdeskConnectionPayload & {
    printServer: string;
    shareName: string;
    installScope?: 'active_user' | 'all_users';
    setAsDefault?: boolean;
    printServerUsername?: string;
    printServerPassword?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/printers/install`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to install printer from print server');
  return res.json();
}

export async function fetchHelpdeskEndpointShares(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: {
    targetIp: string;
    protocolUsed: string;
    portUsed: number;
    osFamily: 'windows' | 'linux';
    hostname: string;
    loggedInUser: string;
    loggedInUserSid: string;
    collectedAt: string;
    userProfiles: Array<{
      username: string;
      sid: string;
      profilePath: string;
      isLoaded: boolean;
      isActiveLoggedIn: boolean;
    }>;
    shares: Array<{
      id: string;
      driveLetter: string;
      remotePath: string;
      label: string;
      status: string;
      persistent: boolean;
      scope: 'user' | 'all_users' | 'machine';
      ownerUser: string;
      ownerSid: string;
      provider: string;
      managedRuleName?: string;
    }>;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/shares/status`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect mapped network shares');
  return res.json();
}

export async function fetchHelpdeskFileServerShares(
  payload: HelpdeskConnectionPayload & {
    fileServer: string;
    fileServerUsername?: string;
    fileServerPassword?: string;
  }
): Promise<{
  success: boolean;
  data: {
    targetIp: string;
    fileServer: string;
    protocolUsed: string;
    osFamily: 'windows' | 'linux';
    loggedInUser: string;
    collectedAt: string;
    shares: Array<{
      name: string;
      uncPath: string;
      description: string;
      shareType: string;
      isAdminShare: boolean;
      alreadyMapped: boolean;
      mappedDriveLetter: string;
    }>;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/shares/server/list`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to query file server shares');
  return res.json();
}

export async function mapHelpdeskEndpointShare(
  payload: HelpdeskConnectionPayload & {
    remotePath: string;
    driveLetter?: string;
    scope: 'active_user' | 'specific_user' | 'all_users';
    targetSids?: string[];
    persistent?: boolean;
    label?: string;
    shareUsername?: string;
    sharePassword?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/shares/map`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to map network share');
  return res.json();
}

export async function disconnectHelpdeskEndpointShare(
  payload: HelpdeskConnectionPayload & {
    remotePath: string;
    driveLetter?: string;
    scope?: 'user' | 'all_users' | 'machine' | 'auto';
    ownerSid?: string;
    managedRuleName?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/shares/disconnect`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to disconnect network share');
  return res.json();
}

export async function fetchHelpdeskEndpointLogons(
  payload: HelpdeskConnectionPayload & {
    hoursBack?: number;
    maxEvents?: number;
  }
): Promise<{
  success: boolean;
  data: {
    targetIp: string;
    protocolUsed: string;
    portUsed: number;
    osFamily: 'windows' | 'linux';
    hostname: string;
    collectedAt: string;
    hoursBack: number;
    isAnyoneLoggedIn: boolean;
    activeLoggedInUser: string;
    isScreenLocked: boolean;
    securityLogAccessible: boolean;
    securityLogNote?: string;
    activeSessions: Array<{
      username: string;
      domain: string;
      sessionName: string;
      sessionId: string;
      state: 'active' | 'disconnected' | 'locked' | 'idle';
      logonType: string;
      idleTime: string;
      logonTime: string;
      logonTimeDisplay: string;
      sourceIp: string;
      isCurrentConsoleOwner: boolean;
    }>;
    userSummaries: Array<{
      username: string;
      sid: string;
      profilePath: string;
      isCurrentlyLoggedIn: boolean;
      currentState: 'active' | 'disconnected' | 'locked' | 'offline';
      currentSessionName: string;
      lastLogonTime: string;
      lastLogoffTime: string;
      lastSourceIp: string;
      lastLogonType: string;
      logonCountInWindow: number;
      totalLogonsOnSystem: number;
      failedCountInWindow: number;
    }>;
    events: Array<{
      id: string;
      timestamp: string;
      eventType:
        | 'logon'
        | 'logoff'
        | 'lock'
        | 'unlock'
        | 'rdp_disconnect'
        | 'rdp_reconnect'
        | 'failed';
      eventId: number;
      channel: string;
      username: string;
      domain: string;
      logonTypeCode: number;
      logonTypeLabel: string;
      logonTypeLabelFa: string;
      sourceIp: string;
      sourceHost: string;
      sessionName: string;
      failureReason?: string;
    }>;
    summary: {
      activeUsersCount: number;
      disconnectedCount: number;
      distinctUsersCount: number;
      totalLogonEvents: number;
      totalFailedEvents: number;
      lastLoginUser: string;
      lastLoginTime: string;
    };
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/logons`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to collect endpoint user login & session report');
  return res.json();
}

export async function executeHelpdeskUserSessionAction(
  payload: HelpdeskConnectionPayload & {
    action: 'lock' | 'logoff';
    sessionId?: string;
    targetUsername?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/logons/session-action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to execute user session action');
  return res.json();
}

export async function sendHelpdeskEndpointMessage(
  payload: HelpdeskConnectionPayload & {
    message: string;
    title?: string;
    recipient?: string;
    displaySeconds?: number;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/message`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to deliver interactive endpoint message');
  return res.json();
}

export async function fetchHelpdeskEventLogs(
  payload: HelpdeskConnectionPayload & {
    channel?: 'All' | 'System' | 'Application';
    hoursBack?: number;
    maxEvents?: number;
    severity?: 'all' | 'critical_error';
    diagnosticFocus?: 'all' | 'bsod';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/events`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to read endpoint Event Viewer logs');
  return res.json();
}

export async function terminateHelpdeskProcess(
  payload: HelpdeskConnectionPayload & {
    pid: number;
    processName: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/process/terminate`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Safe user process termination failed');
  return res.json();
}

export async function scanHelpdeskTemp(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/temp/scan`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to scan endpoint Temp folders');
  return res.json();
}

export async function cleanHelpdeskTemp(
  payload: HelpdeskConnectionPayload & {
    scope: 'user_temp' | 'windows_temp' | 'both' | 'recycle_bin' | 'all';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/temp/clean`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Safe Temp cleanup failed');
  return res.json();
}

export async function fetchHelpdeskGpoStatus(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/gpo/status`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect Group Policy status');
  return res.json();
}

export async function runHelpdeskGpupdate(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/gpo/refresh`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Group Policy refresh (gpupdate /force) failed');
  return res.json();
}

export async function fetchHelpdeskSystemInfo(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/sysinfo`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to collect detailed system info and updates');
  return res.json();
}

export async function fetchHelpdeskUpdateStatus(
  payload: HelpdeskConnectionPayload & {
    sourceMode?: 'auto' | 'wsus' | 'internet';
    withOnlineScan?: boolean;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/updates/status`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect Windows Update & WSUS policy');
  return res.json();
}

export async function installHelpdeskWindowsUpdates(
  payload: HelpdeskConnectionPayload & {
    source?: 'auto' | 'wsus' | 'internet';
    kbFilter?: string[];
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/updates/install`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Windows Update installation failed');
  return res.json();
}

export async function uninstallHelpdeskHotfix(
  payload: HelpdeskConnectionPayload & {
    kbId: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/updates/uninstall`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to uninstall Windows Update KB');
  return res.json();
}

export async function fetchHelpdeskPrograms(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/programs/list`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to load installed programs from endpoint');
  return res.json();
}

export async function uninstallHelpdeskProgram(
  payload: HelpdeskConnectionPayload & {
    programName?: string;
    registryHive: 'HKLM64' | 'HKLM32' | 'HKCU' | 'HKU' | 'linux_pkg';
    registryKeyName: string;
    ownerSid?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/programs/uninstall`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to uninstall application from endpoint');
  return res.json();
}

export async function fetchHelpdeskHardwareInventory(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/hardware/inventory`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect endpoint hardware inventory');
  return res.json();
}

export async function fetchHelpdeskServicesAndStartup(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/services-startup/list`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to load services and startup programs from endpoint');
  return res.json();
}

export async function executeHelpdeskServiceAction(
  payload: HelpdeskConnectionPayload & {
    serviceName: string;
    action: 'start' | 'stop' | 'restart' | 'pause' | 'resume' | 'set_startup';
    startupType?: 'Automatic' | 'AutomaticDelayed' | 'Manual' | 'Disabled';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/services/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to execute Windows service action');
  return res.json();
}

export async function executeHelpdeskStartupAction(
  payload: HelpdeskConnectionPayload & {
    action: 'enable' | 'disable' | 'delete' | 'add';
    sourceType: 'registry_run' | 'registry_runonce' | 'startup_folder' | 'scheduled_task';
    locationHive:
      | 'HKLM64_Run'
      | 'HKLM32_Run'
      | 'HKLM64_RunOnce'
      | 'HKCU_Run'
      | 'HKU_Run'
      | 'HKU_RunOnce'
      | 'CommonStartupFolder'
      | 'UserStartupFolder'
      | 'ScheduledTask'
      | 'linux_autostart';
    itemName: string;
    ownerSid?: string;
    taskPath?: string;
    command?: string;
    startupScope?: 'machine' | 'user';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/startup/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to manage endpoint startup item');
  return res.json();
}

export async function fetchHelpdeskMsconfigAndEnv(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/msconfig-env/list`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to load MSConfig boot options and environment variables');
  return res.json();
}

export async function updateHelpdeskMsconfig(
  payload: HelpdeskConnectionPayload & {
    operation: 'set_boot_options' | 'launch_msconfig_tool';
    timeoutSeconds?: number;
    safeBootMode?: 'none' | 'minimal' | 'network' | 'dsrepair' | 'alternateshell';
    noGuiBoot?: boolean;
    bootLog?: boolean;
    baseVideo?: boolean;
    osBootInfo?: boolean;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/msconfig/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update MSConfig boot configuration');
  return res.json();
}

export async function manageHelpdeskEnvVar(
  payload: HelpdeskConnectionPayload & {
    action: 'set' | 'delete';
    scope: 'system' | 'user';
    name: string;
    value?: string;
    expandSz?: boolean;
    ownerSid?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/env-vars/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update environment variable');
  return res.json();
}

export async function fetchHelpdeskRegionAndFonts(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/region-fonts/list`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to load region, time, languages and fonts from endpoint');
  return res.json();
}

export async function updateHelpdeskDateTime(
  payload: HelpdeskConnectionPayload & {
    operation: 'set_timezone' | 'set_datetime' | 'sync_ntp' | 'toggle_ntp';
    timezoneId?: string;
    localDate?: string;
    localTime?: string;
    ntpEnabled?: boolean;
    ntpServer?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/region/datetime`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update endpoint date, time, or timezone');
  return res.json();
}

export async function updateHelpdeskLanguagesAndLocale(
  payload: HelpdeskConnectionPayload & {
    operation: 'set_languages' | 'set_locale';
    languageTags?: string[];
    activeUserSid?: string;
    systemLocale?: string;
    currentCulture?: string;
    homeLocationGeoId?: number | null;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/region/languages`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update endpoint languages or regional settings');
  return res.json();
}

export async function installHelpdeskFont(
  payload: HelpdeskConnectionPayload & {
    fileName: string;
    fileBase64: string;
    fontDisplayName?: string;
    installScope?: 'system' | 'user';
    activeUserSid?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/fonts/install`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to install font on endpoint');
  return res.json();
}

export async function deleteHelpdeskFont(
  payload: HelpdeskConnectionPayload & {
    fileName: string;
    registryValueName: string;
    scope: 'system' | 'user';
    ownerSid?: string;
    filePath?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/fonts/delete`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to delete font from endpoint');
  return res.json();
}

export async function exportHelpdeskFont(
  payload: HelpdeskConnectionPayload & {
    fileName: string;
    scope?: 'system' | 'user';
    ownerSid?: string;
    filePath?: string;
  }
): Promise<{
  success: boolean;
  data: {
    fileName: string;
    mimeType: string;
    fileBase64: string;
    sizeBytes: number;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/fonts/export`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to export font from endpoint');
  return res.json();
}

export async function exportHelpdeskFontsArchive(
  payload: HelpdeskConnectionPayload & {
    items: Array<{
      fileName: string;
      scope?: 'system' | 'user';
      ownerSid?: string;
      filePath?: string;
    }>;
  }
): Promise<{
  success: boolean;
  data: {
    archiveFileName: string;
    zipBase64: string;
    sizeBytes: number;
    exportedCount: number;
    skippedCount: number;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/fonts/export-archive`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to export fonts archive from endpoint');
  return res.json();
}

export type HelpdeskDiagnosticCheckId =
  | 'ip_dns'
  | 'gateway_ping'
  | 'nic_link_speed'
  | 'routing_table'
  | 'proxy_status'
  | 'internet_connectivity'
  | 'vpn_status'
  | 'os_drive_cleanup'
  | 'windows_integrity'
  | 'windows_update_last'
  | 'active_directory_policy'
  | 'drivers_status'
  | 'cpu_ram_usage'
  | 'top_resource_apps';

export const ALL_HELPDESK_DIAGNOSTIC_CHECKS: HelpdeskDiagnosticCheckId[] = [
  'ip_dns',
  'gateway_ping',
  'nic_link_speed',
  'routing_table',
  'proxy_status',
  'internet_connectivity',
  'vpn_status',
  'os_drive_cleanup',
  'windows_integrity',
  'windows_update_last',
  'active_directory_policy',
  'drivers_status',
  'cpu_ram_usage',
  'top_resource_apps',
];

export async function runHelpdeskDiagnosticsSuite(
  payload: HelpdeskConnectionPayload & { checks?: HelpdeskDiagnosticCheckId[] }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/diagnostics/run`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to execute HelpDesk diagnostics suite');
  return res.json();
}

export async function fetchHelpdeskSecurityAndAv(
  payload: HelpdeskConnectionPayload
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/security-av/inspect`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect endpoint firewall and antivirus');
  return res.json();
}

export async function controlHelpdeskAntivirus(
  payload: HelpdeskConnectionPayload & {
    productId: string;
    serviceName?: string;
    action: 'start' | 'stop' | 'restart' | 'enable_realtime' | 'disable_realtime';
    unlockPassword?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/security-av/antivirus/control`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to control endpoint antivirus');
  return res.json();
}

export async function toggleHelpdeskFirewallProfile(
  payload: HelpdeskConnectionPayload & {
    profile: 'Domain' | 'Private' | 'Public' | 'All' | 'UFW' | 'Firewalld';
    enabled: boolean;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/security-av/firewall/profile`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to toggle firewall profile');
  return res.json();
}

export async function createHelpdeskFirewallRule(
  payload: HelpdeskConnectionPayload & {
    displayName: string;
    direction: 'Inbound' | 'Outbound';
    action: 'Allow' | 'Block';
    ruleProtocol?: 'TCP' | 'UDP' | 'Any' | 'ICMPv4' | 'ICMPv6';
    localPort?: string;
    remotePort?: string;
    remoteAddress?: string;
    program?: string;
    profiles?: Array<'Domain' | 'Private' | 'Public'>;
    description?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/security-av/firewall/rules/create`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to create firewall rule');
  return res.json();
}

export async function manageHelpdeskFirewallRule(
  payload: HelpdeskConnectionPayload & {
    ruleName: string;
    displayName?: string;
    action: 'enable' | 'disable' | 'allow' | 'block' | 'delete';
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/security-av/firewall/rules/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update firewall rule');
  return res.json();
}

export interface HelpdeskExceptionAdCatalog {
  enabled: boolean;
  domain: string;
  syncedUsers: Array<{
    samAccountName: string;
    displayName: string;
    email?: string;
    department?: string;
    groups?: string[];
  }>;
  syncedGroups: Array<{
    name: string;
    dn?: string;
  }>;
}

export interface HelpdeskEndpointIdentitySnapshot {
  targetIp: string;
  hostname: string;
  fqdn: string;
  domain: string;
  partOfDomain: boolean;
  primaryIps: string[];
  loggedInUsers: string[];
  lastLoggedOnUser: string;
  localUsers: string[];
  adUsers: string[];
  adGroups: string[];
  collectedAt: string;
}

export async function fetchHelpdeskExceptions(): Promise<{
  success: boolean;
  rules: HelpdeskExceptionRule[];
  canManage: boolean;
  adCatalog: HelpdeskExceptionAdCatalog;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/exceptions`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to load HelpDesk exception rules');
  return res.json();
}

export async function createHelpdeskException(payload: {
  ruleType: HelpdeskExceptionRuleType;
  targetValue: string;
  domainName?: string;
  description?: string;
  enabled?: boolean;
}): Promise<{ success: boolean; rule: HelpdeskExceptionRule }> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/exceptions`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to create HelpDesk exception rule');
  return res.json();
}

export async function updateHelpdeskException(
  id: string,
  patch: Partial<{
    ruleType: HelpdeskExceptionRuleType;
    targetValue: string;
    domainName: string;
    description: string;
    enabled: boolean;
  }>
): Promise<{ success: boolean; rule: HelpdeskExceptionRule }> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/exceptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update HelpDesk exception rule');
  return res.json();
}

export async function deleteHelpdeskException(id: string): Promise<{ success: boolean }> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/exceptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to delete HelpDesk exception rule');
  return res.json();
}

export async function inspectHelpdeskEndpointForExceptions(
  payload: HelpdeskConnectionPayload
): Promise<{ success: boolean; snapshot: HelpdeskEndpointIdentitySnapshot }> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/exceptions/inspect-endpoint`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect target workstation users and AD groups');
  return res.json();
}

export async function fetchHelpdeskDiskHealth(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/disks/status`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to detect endpoint disk media and health');
  return res.json();
}

export type HelpdeskProfileActionType =
  | 'clean_temp'
  | 'delete_profile'
  | 'repair_bak'
  | 'unload_hive';

export interface HelpdeskUserProfileFolderBreakdown {
  key: 'desktop' | 'documents' | 'downloads' | 'appdata' | 'temp' | 'media_other';
  labelEn: string;
  labelFa: string;
  sizeBytes: number;
  sizeMb: number;
}

export interface HelpdeskUserProfileItem {
  id: string;
  username: string;
  shortName: string;
  sid: string;
  accountType: 'domain' | 'local' | 'system' | 'orphan';
  profilePath: string;
  pathExists: boolean;
  isLoaded: boolean;
  isActiveLoggedIn: boolean;
  isCurrentSessionUser: boolean;
  isProtected: boolean;
  protectionReasonEn: string;
  protectionReasonFa: string;
  statusCode: 'healthy' | 'loaded' | 'temp_profile' | 'bak_corrupt' | 'orphan_folder' | 'missing_folder' | 'roaming';
  roamingConfigured: boolean;
  roamingPath: string;
  hasBakRegistryKey: boolean;
  isTemporaryProfile: boolean;
  lastUseTime: string | null;
  ntUserDatSizeMb: number | null;
  sizeBytes: number;
  sizeMb: number;
  reclaimableTempBytes: number;
  reclaimableTempMb: number;
  fileCount: number;
  folders: HelpdeskUserProfileFolderBreakdown[];
  shell?: string;
  uid?: number;
}

export interface HelpdeskUserProfilesResult {
  targetIp: string;
  protocolUsed: string;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  domain: string;
  loggedInUser: string;
  osDriveFreeGb: number;
  osDriveTotalGb: number;
  totalProfilesSizeBytes: number;
  totalProfilesSizeMb: number;
  totalReclaimableTempMb: number;
  profiles: HelpdeskUserProfileItem[];
  collectedAt: string;
}

export async function fetchHelpdeskUserProfiles(
  payload: HelpdeskConnectionPayload
): Promise<{
  success: boolean;
  data: HelpdeskUserProfilesResult;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/profiles/list`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect endpoint user profiles');
  return res.json();
}

export async function manageHelpdeskUserProfile(
  payload: HelpdeskConnectionPayload & {
    action: HelpdeskProfileActionType;
    profileSid: string;
    profileUsername?: string;
  }
): Promise<{
  success: boolean;
  data: {
    targetIp: string;
    protocolUsed: string;
    portUsed: number;
    osFamily: 'windows' | 'linux';
    action: HelpdeskProfileActionType;
    profileSid: string;
    profileUsername: string;
    success: boolean;
    deletedFiles?: number;
    freedMb?: number;
    skippedLockedFiles?: number;
    message: string;
    messageFa: string;
    rawOutput?: string;
    executedAt: string;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/profiles/action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to manage user profile');
  return res.json();
}

export type HelpdeskVirtualMemoryAction =
  | 'enable_auto'
  | 'set_custom'
  | 'set_system_managed_drive'
  | 'remove_drive'
  | 'set_swappiness';

export interface HelpdeskVirtualMemoryAllocation {
  id: string;
  driveOrMount: string;
  filePath: string;
  kind: 'pagefile' | 'swap_file' | 'swap_partition' | 'zram';
  managementMode: 'system_managed' | 'custom_size' | 'automatic' | 'active';
  initialSizeMb: number;
  maximumSizeMb: number;
  currentAllocatedMb: number;
  currentUsedMb: number;
  peakUsedMb: number;
  usagePercent: number;
  tempPageFile: boolean;
  persistentInFstab: boolean;
  removable: boolean;
}

export interface HelpdeskVirtualMemoryEligibleDrive {
  driveOrMount: string;
  label: string;
  fileSystem: string;
  totalGb: number;
  freeGb: number;
  freeMb: number;
  hasAllocation: boolean;
}

export interface HelpdeskVirtualMemoryResult {
  targetIp: string;
  protocolUsed: string;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  physicalRamTotalMb: number;
  physicalRamTotalGb: number;
  physicalRamUsedMb: number;
  physicalRamFreeMb: number;
  automaticManagedPagefile: boolean;
  commitLimitMb: number;
  commitTotalMb: number;
  totalVirtualAllocatedMb: number;
  totalVirtualUsedMb: number;
  recommendedMinMb: number;
  recommendedMaxMb: number;
  swappiness: number | null;
  pendingRebootRecommended: boolean;
  allocations: HelpdeskVirtualMemoryAllocation[];
  eligibleDrives: HelpdeskVirtualMemoryEligibleDrive[];
  collectedAt: string;
}

export async function fetchHelpdeskVirtualMemory(
  payload: HelpdeskConnectionPayload
): Promise<{
  success: boolean;
  data: HelpdeskVirtualMemoryResult;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/virtual-memory/status`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to inspect endpoint virtual memory settings');
  return res.json();
}

export async function manageHelpdeskVirtualMemory(
  payload: HelpdeskConnectionPayload & {
    action: HelpdeskVirtualMemoryAction;
    driveOrMount?: string;
    filePath?: string;
    initialSizeMb?: number;
    maximumSizeMb?: number;
    persistent?: boolean;
    swappiness?: number;
  }
): Promise<{
  success: boolean;
  data: {
    targetIp: string;
    protocolUsed: string;
    portUsed: number;
    osFamily: 'windows' | 'linux';
    action: HelpdeskVirtualMemoryAction;
    driveOrMount?: string;
    filePath?: string;
    success: boolean;
    pendingRebootRecommended: boolean;
    message: string;
    messageFa: string;
    rawOutput?: string;
    executedAt: string;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/virtual-memory/manage`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update endpoint virtual memory configuration');
  return res.json();
}

export async function executeHelpdeskSystemRepair(
  payload: HelpdeskConnectionPayload & {
    mode:
      | 'sfc_verify'
      | 'sfc_scannow'
      | 'dism_check'
      | 'dism_scan'
      | 'dism_restore'
      | 'chkdsk_readonly'
      | 'chkdsk_hdd_badsector';
    driveLetter?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/repair/system`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'System integrity or disk repair execution failed');
  return res.json();
}

export async function inspectHelpdeskDomainUser(
  payload: HelpdeskConnectionPayload & {
    domainUsername: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/ad/user`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Active Directory domain user lookup failed');
  return res.json();
}

export interface HelpdeskTargetUserRequestPayload {
  targetUsername: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: 'auto' | 'ldaps' | 'ldap';
  exchangeServer?: string;
  winrmProtocol?: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  includeMailbox?: boolean;
  historyId?: string;
  skipHistory?: boolean;
}

export interface HelpdeskUserRelatedPerson {
  dn: string;
  samAccountName: string;
  displayName: string;
  title: string;
  department: string;
  email: string;
}

export interface HelpdeskUserMailboxInfo {
  hasMailbox: boolean;
  source: 'exchange_ps' | 'ad_only' | 'none';
  liveStatsRetrieved: boolean;
  exchangeHostTried?: string;
  exchangeHostUsed?: string;
  exchangeStatusMessage?: string;
  exchangeStatusMessageFa?: string;
  databaseName: string;
  serverName: string;
  mailNickname: string;
  recipientType?: string;
  storageLimitStatus?: string;
  useDatabaseQuotaDefaults: boolean | null;
  totalUsedBytes: number | null;
  deletedItemsBytes: number | null;
  itemCount: number | null;
  deletedItemCount: number | null;
  issueWarningQuotaBytes: number | null;
  prohibitSendQuotaBytes: number | null;
  prohibitSendReceiveQuotaBytes: number | null;
  effectiveQuotaBytes: number | null;
  usedPercent: number | null;
  isUnlimitedQuota: boolean;
  lastLogonTime: string | null;
  archiveEnabled: boolean;
  archiveStatus?: string;
  archiveGuid?: string;
  archiveUsedBytes?: number | null;
  archiveQuotaBytes?: number | null;
  forwardingAddress?: string;
  forwardingSmtpAddress?: string;
  deliverToMailboxAndForward?: boolean;
}

export interface HelpdeskUserDcLockoutEntry {
  dcHost: string;
  isPdc: boolean;
  reachable: boolean;
  accountLocked: boolean;
  lockoutTimeRaw: string;
  lockedAt: string | null;
  badPwdCount: number;
  badPasswordTime: string | null;
  lastLogon: string | null;
}

export interface HelpdeskUserLockoutEventEntry {
  eventId: number;
  eventType: 'locked_out' | 'unlocked' | 'bad_password' | 'logon_failed';
  timestamp: string;
  dcHost: string;
  callerComputer?: string;
  sourceIp?: string;
  actor?: string;
  subStatus?: string;
  message?: string;
}

export interface HelpdeskUserInspectionData {
  found: boolean;
  collectedAt: string;
  queryTarget: string;
  connectionInfo: {
    method: 'ldaps' | 'ldap' | 'winrm_adsi';
    domainController: string;
    port: number;
    domainName: string;
    baseDn: string;
    pdcEmulator?: string;
  };
  profile: {
    samAccountName: string;
    userPrincipalName: string;
    displayName: string;
    cn: string;
    firstName: string;
    lastName: string;
    middleName: string;
    initials: string;
    description: string;
    jobTitle: string;
    department: string;
    company: string;
    office: string;
    division: string;
    employeeId: string;
    employeeNumber: string;
    manager: HelpdeskUserRelatedPerson | null;
    directReports: HelpdeskUserRelatedPerson[];
    distinguishedName: string;
    organizationalUnit: string;
    objectSid: string;
    objectGuid: string;
    whenCreated: string | null;
    whenChanged: string | null;
    thumbnailPhotoDataUrl: string | null;
    notes: string;
  };
  contact: {
    primaryEmail: string;
    emailAliases: Array<{ address: string; protocol: string; isPrimary: boolean }>;
    internalPhones: string[];
    mobileNumbers: string[];
    homePhones: string[];
    faxNumber: string;
    webPage: string;
  };
  security: {
    accountEnabled: boolean;
    accountLocked: boolean;
    lockoutState?: 'locked' | 'auto_expired_pending_clear' | 'unlocked';
    lockoutTimeRaw: string;
    lockedAt: string | null;
    lockoutExpiresAt?: string | null;
    lockoutRemainingMinutes?: number | null;
    lockoutSourceNote?: string;
    badPwdCount: number;
    badPwdSourceDc?: string;
    badPasswordTime: string | null;
    passwordLastSet: string | null;
    passwordAgeDays: number | null;
    passwordExpiresAt: string | null;
    passwordExpired: boolean;
    passwordNeverExpires: boolean;
    mustChangePasswordAtNextLogon: boolean;
    userCannotChangePassword: boolean;
    accountExpiresAt: string | null;
    accountNeverExpires: boolean;
    accountExpired: boolean;
    lastLogon: string | null;
    logonCount: number;
    userAccountControl: number;
    uacFlags: string[];
    domainPolicy: {
      domainName: string;
      source: 'pso' | 'domain_root' | 'unknown';
      psoName?: string;
      maxPasswordAgeDays: number | null;
      minPasswordAgeDays: number | null;
      minPasswordLength: number | null;
      lockoutThreshold: number | null;
      lockoutDurationMinutes: number | null;
      lockoutObservationWindowMinutes: number | null;
    };
    dcLockoutBreakdown?: HelpdeskUserDcLockoutEntry[];
    lockoutEventsStatus?: 'available' | 'empty' | 'unavailable';
    lockoutEventsNote?: string;
    lockoutEventsNoteFa?: string;
    lockoutEvents?: HelpdeskUserLockoutEventEntry[];
  };
  groups: Array<{ cn: string; dn: string; isPrimary?: boolean }>;
  mailbox: HelpdeskUserMailboxInfo;
  logonAndProfile?: {
    userWorkstationsRaw: string;
    allowedWorkstations: string[];
    workstationRestrictionMode: 'unrestricted' | 'restricted';
    profilePath: string;
    profileType: 'roaming' | 'local';
    scriptPath: string;
    homeDirectory: string;
    homeDrive: string;
    logonHoursMode: 'unrestricted_24_7' | 'restricted' | 'unknown';
    logonHoursAllowedHoursCount: number | null;
    logonHoursSummaryEn: string;
    logonHoursSummaryFa: string;
    dcInteractiveRights: {
      status: 'available' | 'unavailable';
      dcHost: string;
      allowLocalOnDc: boolean | null;
      denyLocalOnDc: boolean | null;
      allowRdpOnDc: boolean | null;
      denyRdpOnDc: boolean | null;
      matchedAllowLocalTrustees: string[];
      matchedDenyLocalTrustees: string[];
      matchedAllowRdpTrustees: string[];
      matchedDenyRdpTrustees: string[];
      noteEn: string;
      noteFa: string;
    };
  };
}

export interface HelpdeskUserSearchHit {
  samAccountName: string;
  userPrincipalName: string;
  displayName: string;
  cn: string;
  distinguishedName: string;
  organizationalUnit: string;
  department: string;
  jobTitle: string;
  email: string;
  accountEnabled: boolean;
  accountLocked: boolean;
  whenCreated: string | null;
}

export async function searchHelpdeskDomainUsers(payload: {
  query?: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: 'auto' | 'ldaps' | 'ldap';
  winrmProtocol?: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  limit?: number;
}): Promise<{
  success: boolean;
  data: {
    domainController: string;
    domainName: string;
    method: 'ldaps' | 'ldap' | 'winrm_adsi';
    port: number;
    users: HelpdeskUserSearchHit[];
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/user/search`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Active Directory user search failed');
  return res.json();
}

export async function inspectHelpdeskTargetUser(
  payload: HelpdeskTargetUserRequestPayload
): Promise<{
  success: boolean;
  data: HelpdeskUserInspectionData;
  historyId?: string;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/user/inspect`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Active Directory user lookup failed');
  return res.json();
}

export async function refreshHelpdeskTargetMailbox(
  payload: HelpdeskTargetUserRequestPayload
): Promise<{
  success: boolean;
  data: HelpdeskUserMailboxInfo;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/user/mailbox`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Exchange mailbox query failed');
  return res.json();
}

export async function unlockHelpdeskTargetUser(
  payload: HelpdeskTargetUserRequestPayload
): Promise<{
  success: boolean;
  data: {
    unlocked: boolean;
    wasLocked: boolean;
    stillLockedAfter: boolean;
    samAccountName: string;
    displayName: string;
    distinguishedName: string;
    domainController: string;
    methodUsed: string;
    message: string;
    messageFa: string;
    unlockedAt: string;
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/user/unlock`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to unlock AD user account');
  return res.json();
}

export interface HelpdeskUserHistoryItem {
  id: string;
  queryTarget: string;
  samAccountName: string;
  displayName: string;
  department: string;
  jobTitle: string;
  primaryEmail: string;
  domainName: string;
  domainController: string;
  methodUsed: 'ldaps' | 'ldap' | 'winrm_adsi' | 'unknown';
  portUsed: number;
  accountEnabled: boolean | null;
  accountLocked: boolean | null;
  passwordExpired: boolean | null;
  mailboxUsedBytes: number | null;
  mailboxQuotaBytes: number | null;
  mailboxUsedPercent: number | null;
  status: 'success' | 'failed';
  errorMessage?: string;
  actionType: 'inspect' | 'unlock';
  actorName: string;
  actorRole: string;
  checkedAt: string;
}

export interface HelpdeskUserHistoryResponse {
  success: boolean;
  scope?: 'all' | 'own';
  items: HelpdeskUserHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    totalChecks: number;
    uniqueUsers: number;
    successCount: number;
    failedCount: number;
    lockedSeenCount: number;
    lastCheckedAt: string | null;
    lastSamAccountName: string | null;
  };
}

export async function fetchHelpdeskUserHistory(params: {
  search?: string;
  status?: 'all' | 'success' | 'failed';
  actionType?: 'all' | 'inspect' | 'unlock';
  page?: number;
  pageSize?: number;
}): Promise<HelpdeskUserHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.actionType) qs.set('actionType', params.actionType);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/user/history?${qs.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to fetch HelpDesk user check history');
  return res.json();
}

export async function deleteHelpdeskUserHistoryItem(id: string): Promise<{ success: boolean }> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/user/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to delete HelpDesk user check history record');
  return res.json();
}

export async function clearHelpdeskUserHistory(): Promise<{
  success: boolean;
  clearedCount: number;
  scope?: 'all' | 'own';
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/user/history`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to clear HelpDesk user check history');
  return res.json();
}

// ============================================================================
// Active Directory & Group Support HelpDesk API
// ============================================================================

export type AdGroupScope = 'Global' | 'DomainLocal' | 'Universal' | 'BuiltinLocal' | 'Unknown';
export type AdGroupCategory = 'Security' | 'Distribution';

export interface HelpdeskTargetGroupRequestPayload {
  targetGroup: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: 'auto' | 'ldaps' | 'ldap';
  winrmProtocol?: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  skipHistory?: boolean;
}

export interface HelpdeskGroupSearchHit {
  cn: string;
  samAccountName: string;
  displayName: string;
  distinguishedName: string;
  organizationalUnit: string;
  description: string;
  mail: string;
  groupScope: AdGroupScope;
  groupCategory: AdGroupCategory;
  isPrivileged: boolean;
  adminCount: boolean;
  memberCountEstimate: number;
  whenCreated: string | null;
}

export interface HelpdeskGroupMemberEntry {
  dn: string;
  cn: string;
  samAccountName: string;
  displayName: string;
  objectType: 'user' | 'group' | 'computer' | 'contact' | 'foreign_principal' | 'unknown';
  department: string;
  jobTitle: string;
  description?: string;
  email: string;
  organizationalUnit: string;
  accountEnabled: boolean | null;
  accountLocked: boolean | null;
  isPrimaryGroupMember?: boolean;
  nestedScope?: AdGroupScope;
  nestedCategory?: AdGroupCategory;
  isInherited?: boolean;
  viaGroupCn?: string;
  viaGroupDn?: string;
}

export interface HelpdeskGroupParentEntry {
  cn: string;
  samAccountName: string;
  dn: string;
  ou: string;
  groupScope: AdGroupScope;
  groupCategory: AdGroupCategory;
  isPrivileged: boolean;
  isDirect: boolean;
  description: string;
}

export interface HelpdeskGroupPermissionInsight {
  id: string;
  category:
    | 'privileged_role'
    | 'inherited_role'
    | 'admin_sd_holder'
    | 'gpo_target'
    | 'password_policy'
    | 'mail_exchange'
    | 'delegation'
    | 'scope_rule';
  severity: 'critical' | 'high' | 'medium' | 'info';
  titleEn: string;
  titleFa: string;
  summaryEn: string;
  summaryFa: string;
  howItWorksEn: string;
  howItWorksFa: string;
  sourceLabel?: string;
}

export interface HelpdeskGroupAclEntry {
  trustee: string;
  trusteeSid: string;
  accessType: 'Allow' | 'Deny';
  rightsLabelEn: string;
  rightsLabelFa: string;
  scopeNoteEn: string;
  scopeNoteFa: string;
  isInherited: boolean;
  isPrivilegeWrite: boolean;
}

export interface HelpdeskGroupGpoLink {
  gpoName: string;
  gpoId: string;
  gpoStatus: string;
  permissionLevel: string;
  linkedOus: string[];
}

export interface HelpdeskGroupAuditEvent {
  eventId: number;
  eventType: 'created' | 'member_added' | 'member_removed' | 'group_changed' | 'deleted';
  timestamp: string;
  dcHost: string;
  actor: string;
  targetMember?: string;
  summaryEn: string;
  summaryFa: string;
}

export interface HelpdeskGroupInspectionData {
  found: boolean;
  collectedAt: string;
  queryTarget: string;
  connectionInfo: {
    method: 'ldaps' | 'ldap' | 'winrm_adsi';
    domainController: string;
    port: number;
    domainName: string;
    baseDn: string;
    pdcEmulator?: string;
  };
  identity: {
    cn: string;
    samAccountName: string;
    displayName: string;
    description: string;
    notes: string;
    distinguishedName: string;
    organizationalUnit: string;
    ouSegments: string[];
    domainName: string;
    objectSid: string;
    objectGuid: string;
    groupTypeRaw: number;
    groupScope: AdGroupScope;
    groupCategory: AdGroupCategory;
    primaryGroupToken: number | null;
    adminCount: boolean;
    isBuiltinCritical: boolean;
    isPrivileged: boolean;
    privilegeLevel: 'critical' | 'elevated' | 'standard' | 'distribution';
  };
  lifecycleAndOwnership: {
    whenCreated: string | null;
    whenChanged: string | null;
    createdAgeDays: number | null;
    usnCreated: string;
    objectOwner: string;
    objectOwnerSid: string;
    creatorAccount: string;
    creatorTimestamp: string | null;
    creatorDc: string;
    creatorSource: 'security_event_log' | 'ad_owner_fallback' | 'unavailable';
    creatorNoteEn: string;
    creatorNoteFa: string;
    managedBy: {
      dn: string;
      cn: string;
      samAccountName: string;
      displayName: string;
      department: string;
      jobTitle: string;
      email: string;
      ou: string;
    } | null;
    managerCanUpdateMembershipList: boolean | null;
  };
  mailAndExchange: {
    isMailEnabled: boolean;
    primaryEmail: string;
    mailNickname: string;
    emailAliases: Array<{ address: string; protocol: string; isPrimary: boolean }>;
    requireSenderAuthentication: boolean | null;
    hideFromAddressLists: boolean | null;
    deliveryRestrictionNoteEn: string;
    deliveryRestrictionNoteFa: string;
  };
  membershipSummary: {
    totalDirectMembers: number;
    totalPrimaryGroupMembers: number;
    totalInheritedUsers: number;
    directUsersCount: number;
    directGroupsCount: number;
    directComputersCount: number;
    directContactsCount: number;
    disabledMembersCount: number;
    lockedMembersCount: number;
    membersTruncated: boolean;
    primaryMembersTruncated: boolean;
    inheritedTruncated: boolean;
  };
  directMembers: HelpdeskGroupMemberEntry[];
  primaryGroupMembers: HelpdeskGroupMemberEntry[];
  nestedChildGroups: HelpdeskGroupMemberEntry[];
  effectiveInheritedMembers: HelpdeskGroupMemberEntry[];
  parentGroups: HelpdeskGroupParentEntry[];
  permissions: {
    plainSummaryEn: string;
    plainSummaryFa: string;
    insights: HelpdeskGroupPermissionInsight[];
    linkedGpos: HelpdeskGroupGpoLink[];
    appliedPasswordPolicies: Array<{
      name: string;
      precedence: number | null;
      minLength: number | null;
      lockoutThreshold: number | null;
      maxPasswordAgeDays: number | null;
    }>;
    aclEntries: HelpdeskGroupAclEntry[];
    aclSource: 'ldap_sd' | 'winrm_acl' | 'unavailable';
  };
  auditEventsStatus: 'available' | 'empty' | 'unavailable';
  auditEventsNoteEn: string;
  auditEventsNoteFa: string;
  auditEvents: HelpdeskGroupAuditEvent[];
}

export interface HelpdeskGroupMemberActionResult {
  success: boolean;
  action: 'add_member' | 'remove_member';
  groupSamAccountName: string;
  groupCn: string;
  groupDn: string;
  memberSamAccountName: string;
  memberDisplayName: string;
  memberDn: string;
  domainController: string;
  methodUsed: 'ldaps_modify' | 'ldap_modify' | 'winrm_adsi';
  message: string;
  messageFa: string;
  executedAt: string;
}

export interface HelpdeskGroupHistoryItem {
  id: string;
  queryTarget: string;
  samAccountName: string;
  cn: string;
  distinguishedName: string;
  organizationalUnit: string;
  groupScope: AdGroupScope;
  groupCategory: AdGroupCategory;
  domainName: string;
  domainController: string;
  methodUsed: 'ldaps' | 'ldap' | 'winrm_adsi' | 'unknown';
  portUsed: number;
  memberCount: number | null;
  nestedGroupCount: number | null;
  parentGroupCount: number | null;
  isPrivileged: boolean;
  adminCount: boolean;
  whenCreated: string | null;
  creatorDisplay: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  actionType: 'inspect' | 'add_member' | 'remove_member';
  actionTargetMember?: string;
  actorName: string;
  actorRole: string;
  checkedAt: string;
}

export interface HelpdeskGroupHistoryResponse {
  success: boolean;
  scope?: 'all' | 'own';
  items: HelpdeskGroupHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    totalChecks: number;
    uniqueGroups: number;
    successCount: number;
    failedCount: number;
    privilegedSeenCount: number;
    lastCheckedAt: string | null;
    lastGroupName: string | null;
  };
}

export async function searchHelpdeskDomainGroups(payload: {
  query?: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: 'auto' | 'ldaps' | 'ldap';
  limit?: number;
}): Promise<{
  success: boolean;
  data: {
    domainController: string;
    domainName: string;
    method: 'ldaps' | 'ldap';
    port: number;
    groups: HelpdeskGroupSearchHit[];
  };
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/group/search`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Active Directory group search failed');
  return res.json();
}

export async function inspectHelpdeskTargetGroup(
  payload: HelpdeskTargetGroupRequestPayload
): Promise<{
  success: boolean;
  data: HelpdeskGroupInspectionData;
  historyId?: string;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/group/inspect`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Active Directory group inspection failed');
  return res.json();
}

export async function manageHelpdeskGroupMember(
  payload: HelpdeskTargetGroupRequestPayload & {
    action: 'add_member' | 'remove_member';
    memberIdentifier: string;
  }
): Promise<{
  success: boolean;
  data: HelpdeskGroupMemberActionResult;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/group/member-action`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update AD group membership');
  return res.json();
}

export async function fetchHelpdeskGroupHistory(params: {
  search?: string;
  status?: 'all' | 'success' | 'failed';
  actionType?: 'all' | 'inspect' | 'add_member' | 'remove_member';
  page?: number;
  pageSize?: number;
}): Promise<HelpdeskGroupHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.actionType) qs.set('actionType', params.actionType);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/group/history?${qs.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to fetch HelpDesk group check history');
  return res.json();
}

export async function deleteHelpdeskGroupHistoryItem(id: string): Promise<{ success: boolean }> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/group/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to delete HelpDesk group check history record');
  return res.json();
}

export async function clearHelpdeskGroupHistory(): Promise<{
  success: boolean;
  clearedCount: number;
  scope?: 'all' | 'own';
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/group/history`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to clear HelpDesk group check history');
  return res.json();
}

export async function executeHelpdeskPowerControl(
  payload: HelpdeskConnectionPayload & {
    powerAction: 'restart_now' | 'restart_scheduled' | 'shutdown_force' | 'shutdown_scheduled' | 'abort';
    delaySeconds?: number;
    reason?: string;
  }
): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/power`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Remote power control execution failed');
  return res.json();
}

export async function fetchHelpdeskBatteryReport(payload: HelpdeskConnectionPayload): Promise<{
  success: boolean;
  data: any;
  rateLimit?: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/helpdesk/battery`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to collect laptop battery health report');
  return res.json();
}

export async function fetchHelpdeskNotificationConfigApi(): Promise<{
  success: boolean;
  config: HelpdeskNotificationConfig;
  smtpConfigured: boolean;
  canEdit: boolean;
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/helpdesk-notifications`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to load HelpDesk notification settings');
  return res.json();
}

export async function saveHelpdeskNotificationConfigApi(
  config: Partial<HelpdeskNotificationConfig>
): Promise<{
  success: boolean;
  config: HelpdeskNotificationConfig;
  message?: string;
  message_fa?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/helpdesk-notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to save HelpDesk notification settings');
  return res.json();
}

export async function pingHost(host: string, count: number = 2, timeout: number = 2): Promise<{ success: boolean; latency_ms?: number; packet_loss?: number; message?: string; output?: string; is_online?: boolean }> {
  const res = await fetch(`${API_BASE}/tools/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, count, timeout }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ping failed' }));
    throw new Error(err.error || err.message || 'Ping failed');
  }
  return res.json();
}

export async function fetchVlans(): Promise<{ vlans: VlanInfo[] }> {
  const res = await fetch(`${API_BASE}/vlans`);
  if (!res.ok) throw new Error('Failed to fetch VLANs');
  return res.json();
}

export async function fetchDeviceVlans(deviceId: string): Promise<{ vlans: VlanInfo[]; device_id?: string; device_name?: string }> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vlans`);
  if (!res.ok) throw new Error('Failed to fetch device VLANs');
  return res.json();
}

export async function resetDemoData(): Promise<any> {
  const res = await fetch(`${API_BASE}/reset-demo`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reset demo');
  return res.json();
}

export async function fetchTemplates(): Promise<{ templates: ConfigTemplate[]; total: number }> {
  const res = await fetch(`${API_BASE}/templates`);
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

export async function exportTemplatesPackage(): Promise<{ success: boolean; templates: ConfigTemplate[]; exported_at: string; total: number }> {
  const token = localStorage.getItem('token') || localStorage.getItem('nettopology_auth_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/templates/export-package`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.errorFa || 'Failed to export templates package');
  }
  return res.json();
}

export async function importTemplatesPackage(templates: Partial<ConfigTemplate>[]): Promise<{ success: boolean; importedCount: number; message: string }> {
  const token = localStorage.getItem('token') || localStorage.getItem('nettopology_auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/templates/import-package`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ templates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.errorFa || 'Failed to import templates package');
  }
  return res.json();
}

export async function fetchTemplate(id: string): Promise<{ template: ConfigTemplate }> {
  const res = await fetch(`${API_BASE}/templates/${id}`);
  if (!res.ok) throw new Error('Failed to fetch template');
  return res.json();
}

export async function createTemplate(template: Partial<ConfigTemplate>): Promise<{ template: ConfigTemplate; message: string }> {
  const res = await fetch(`${API_BASE}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to create template');
  return res.json();
}

export async function updateTemplate(
  id: string,
  updates: Partial<ConfigTemplate>
): Promise<{ template: ConfigTemplate; message: string }> {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to update template');
  return res.json();
}

export async function deleteTemplate(id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) await parseErrorAndThrow(res, 'Failed to delete template');
  return res.json();
}

export async function applyTemplateToDevice(params: {
  device_id: string;
  template_id: string;
  resolved_variables: Record<string, string | number>;
  credentials?: {
    username?: string;
    password?: string;
    enable_password?: string;
  };
}): Promise<TemplateApplyResult> {
  const res = await fetch(`${API_BASE}/templates/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'Failed to apply template to device');
  }
  return res.json();
}

export async function extractConfigFromDevice(
  params: DeviceConfigExtractRequest
): Promise<DeviceConfigExtractResult> {
  const res = await fetch(`${API_BASE}/templates/extract-from-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'خطا در اتصال به تجهیز و استخراج کانفیگ');
  }
  return res.json();
}

export async function sshConnect(params: {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  enable_password?: string;
  deviceId?: string;
  protocol?: 'ssh' | 'telnet';
  timeout?: number;
}): Promise<{
  success: boolean;
  sessionId?: string;
  session_id?: string;
  mode: 'real_ssh' | 'unreachable';
  isReal?: boolean;
  banner?: string;
  cipher?: string;
  latency_ms?: number;
  error?: string;
  code?: string;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/ssh/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function sshExecute(params: {
  deviceId?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  command: string;
  sessionId?: string;
  timeout?: number;
}): Promise<{
  success: boolean;
  output: string;
  isReal: boolean;
  exitCode?: number;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/ssh/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function sshDisconnect(params: {
  sessionId?: string;
  deviceId?: string;
  host?: string;
  port?: number;
}): Promise<{
  success: boolean;
  closed_sessions?: string[];
  message: string;
}> {
  const res = await fetch(`${API_BASE}/ssh/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function fetchActiveSshSessions(): Promise<{
  total_active: number;
  sessions: Array<{
    session_id: string;
    sessionId: string;
    host: string;
    port: number;
    username: string;
    device_id?: string;
    mode: string;
    is_real: boolean;
    connected_at: string;
    last_activity: number;
    latency_ms: number;
    status: string;
    banner: string;
  }>;
}> {
  const res = await fetch(`${API_BASE}/ssh/sessions`);
  if (!res.ok) throw new Error('Failed to fetch active SSH sessions');
  return res.json();
}

// ---------------------------------------------------------------------------
// Settings & Access Control (Device Groups, Active Directory & RBAC) APIs
// ---------------------------------------------------------------------------

export async function fetchDeviceGroups(): Promise<{ groups: DeviceGroup[]; total: number }> {
  const res = await fetch(`${API_BASE}/device-groups`);
  if (!res.ok) throw new Error('Failed to fetch device groups');
  return res.json();
}

export async function saveDeviceGroupsApi(groups: DeviceGroup[]): Promise<{ success: boolean; groups: DeviceGroup[] }> {
  const res = await fetch(`${API_BASE}/device-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups }),
  });
  if (!res.ok) throw new Error('Failed to save device groups');
  return res.json();
}

export async function fetchActiveDirectoryConfig(): Promise<{ config: ActiveDirectoryConfig }> {
  const res = await fetchWithRetry(`${API_BASE}/settings/active-directory`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to fetch active directory config from PostgreSQL');
  }
  return res.json();
}

export async function saveActiveDirectoryConfigApi(
  config: ActiveDirectoryConfig,
  options?: { replaceSyncedObjects?: boolean }
): Promise<{ success: boolean; config: ActiveDirectoryConfig }> {
  const res = await fetchWithRetry(`${API_BASE}/settings/active-directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      replaceSyncedObjects: options?.replaceSyncedObjects === true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to save active directory config to PostgreSQL');
  }
  return res.json();
}

export async function testActiveDirectoryConnectionApi(config: ActiveDirectoryConfig): Promise<{
  success: boolean;
  latency_ms: number;
  message: string;
  serverBanner?: string;
  sslValid?: boolean;
  bindSuccess?: boolean;
  logs: string[];
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/active-directory/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Active Directory connection test failed');
  }
  return res.json();
}

export async function syncActiveDirectoryApi(config: ActiveDirectoryConfig): Promise<{
  success: boolean;
  groups: import('../types').ADSecurityGroup[];
  users: import('../types').ADUser[];
  message?: string;
  warnings?: string[];
  error?: string;
  config?: ActiveDirectoryConfig;
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/active-directory/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Active Directory synchronization request failed');
  }
  return res.json();
}

export async function fetchAccessPolicies(): Promise<{ policies: AccessPolicy[]; total: number }> {
  const res = await fetchWithRetry(`${API_BASE}/access-policies`);
  if (!res.ok) throw new Error('Failed to fetch access policies');
  return res.json();
}

export async function saveAccessPoliciesApi(policies: AccessPolicy[]): Promise<{ success: boolean; policies: AccessPolicy[] }> {
  const res = await fetchWithRetry(`${API_BASE}/access-policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policies }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to save access policies');
  }
  return res.json();
}

export async function fetchEligibleApproversApi(): Promise<ApprovalEligibleCandidatesResponse> {
  const res = await fetchWithRetry(`${API_BASE}/approvals/eligible-approvers`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to load eligible approvers');
  }
  return res.json();
}

// -------------------------------------------------------------
// MikroTik VPN Management Suite APIs
// -------------------------------------------------------------

export async function fetchMikroTikVPNCapabilities(deviceId: string): Promise<import('../types').MikroTikVPNCapabilities> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vpn/capabilities`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch VPN capabilities');
  }
  return res.json();
}

export async function fetchMikroTikVPNList(deviceId: string): Promise<{
  device_id: string;
  platform: string;
  connection_mode: string;
  is_real: boolean;
  total: number;
  vpns: import('../types').MikroTikVPNItem[];
}> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vpn`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to query VPN status (${res.status})`);
  }
  return res.json();
}

export async function validateMikroTikVPN(
  deviceId: string,
  vpnType: string,
  mode: string,
  config: Record<string, any>
): Promise<import('../types').VPNValidationResult> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vpn/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vpn_type: vpnType, mode, config }),
  });
  const data = await res.json().catch(() => ({ valid: false, errors: ['Request failed'], warnings: [] }));
  return data;
}

export async function previewMikroTikVPN(
  deviceId: string,
  vpnType: string,
  mode: string,
  config: Record<string, any>
): Promise<import('../types').VPNPreviewResult> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vpn/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vpn_type: vpnType, mode, config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.errors?.join(', ') || 'Failed to generate VPN configuration preview');
  }
  return res.json();
}

export async function applyMikroTikVPN(
  deviceId: string,
  vpnType: string,
  mode: string,
  config: Record<string, any>,
  userRole?: string
): Promise<import('../types').VPNApplyResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userRole) {
    headers['X-User-Role'] = userRole;
  }
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vpn/apply`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ vpn_type: vpnType, mode, config, user_role: userRole }),
  });
  const data = await res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
  if (!res.ok && data.success === undefined) {
    data.success = false;
  }
  return data;
}

export async function verifyMikroTikVPN(
  deviceId: string,
  vpnId: string,
  vpnType?: string,
  config?: Record<string, any>
): Promise<import('../types').VPNVerificationDetails> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vpn/${encodeURIComponent(vpnId)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vpn_type: vpnType, config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Verification query failed on router');
  }
  return res.json();
}

export async function deleteMikroTikVPN(
  deviceId: string,
  vpnId: string,
  vpnType?: string,
  userRole?: string
): Promise<import('../types').VPNDeleteResult> {
  const headers: Record<string, string> = {};
  if (userRole) {
    headers['X-User-Role'] = userRole;
  }
  const q = vpnType ? `?vpn_type=${encodeURIComponent(vpnType)}` : '';
  const res = await fetch(`${API_BASE}/devices/${deviceId}/vpn/${encodeURIComponent(vpnId)}${q}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json().catch(() => ({ success: false, message: 'Delete request failed' }));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to delete VPN configuration from router');
  }
  return data;
}

export interface CiscoSnmpOidDetail {
  oid: string;
  name: string;
  value: string | number;
  description: string;
}

export interface CiscoSystemResourcesResponse {
  success: boolean;
  is_live: boolean;
  connected?: boolean;
  telemetry_source?: 'snmp' | 'ssh';
  snmp_version?: 'v1' | 'v2c' | 'v3';
  snmpOidsQueried?: CiscoSnmpOidDetail[];
  snmp_attempted?: boolean;
  ssh_attempted?: boolean;
  device_id?: string;
  host?: string;
  timestamp?: string;
  warning?: string;
  error?: string;
  errorFa?: string;
  latency_ms?: number | null;
  cpu: {
    cpuLoad5s: number;
    cpuLoad1m: number;
    cpuLoad5m: number;
    interrupts: number;
    cpuArch: string;
    topProcesses: Array<{
      pid: number;
      name: string;
      cpu5s: number;
      cpu1m: number;
      cpu5m: number;
    }>;
  };
  ram: {
    totalRamMB: number;
    usedRamMB: number;
    freeRamMB: number;
    ramPercent: number;
    ioBuffersMB: number;
  };
  storage: {
    totalFlashMB: number;
    usedFlashMB: number;
    freeFlashMB: number;
    flashPercent: number;
    nvramKB: number;
    usedNvramKB: number;
  };
  thermal: {
    currentTemp: number;
    tempThreshold: number;
    tempState: string;
    inletTemp: number;
    exhaustTemp: number;
  };
  poe: {
    maxPoeWatts: number;
    totalPoeWatts: number;
    remainingPoeWatts: number;
    poePercent: number;
    poeDeliveringPortsCount: number;
  };
  cooling: {
    fansCount: number;
    fanSpeeds: string;
    fanStatus: string;
    airflow: string;
    psuStatus: string;
  };
  hardware: {
    hostname: string;
    model: string;
    iosVersion: string;
    uptime: string;
    processorBoardId: string;
    lastReloadReason: string;
    systemImageFile: string;
    totalPortsCount: number;
    upPortsCount: number;
    macTableCount: number;
    vlanCapacity: number;
    asicForwardingMpps: number;
    bandwidthGbps: number;
  };
  cliOutputs: {
    cpu: { cmd: string; output: string };
    memory: { cmd: string; output: string };
    env: { cmd: string; output: string };
    power: { cmd: string; output: string };
    version: { cmd: string; output: string };
  };
}

export async function fetchCiscoSystemResources(
  deviceId: string,
  credentials?: { host?: string; username?: string; password?: string; protocol?: 'auto' | 'snmp' | 'ssh' }
): Promise<CiscoSystemResourcesResponse> {
  const protocol = credentials?.protocol || 'auto';
  const queryParam = protocol !== 'auto' ? `?protocol=${encodeURIComponent(protocol)}` : '';
  const options: RequestInit = credentials
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }
    : {
        method: 'GET',
      };

  const res = await fetch(`${API_BASE}/devices/${deviceId}/cisco-resources${queryParam}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch Cisco system resources' }));
    throw new Error(err.error || err.warning || err.message || 'Failed to fetch Cisco system resources');
  }
  return res.json();
}

/**
 * Polls real-time Cisco MIB telemetry directly via SNMP endpoint
 * GET/POST /api/devices/:id/snmp-telemetry
 */
export async function fetchDeviceSnmpTelemetry(
  deviceId: string,
  overrides?: Partial<SnmpTestParams>
): Promise<CiscoSystemResourcesResponse> {
  const url = `${API_BASE}/devices/${encodeURIComponent(deviceId)}/snmp-telemetry`;
  const options: RequestInit = overrides && Object.keys(overrides).length > 0
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      }
    : {
        method: 'GET',
      };

  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch SNMP telemetry' }));
    throw new Error(err.error || err.warning || err.message || 'Failed to fetch SNMP telemetry');
  }
  return res.json();
}

/**
 * Fetches real-time authentic Cisco IOS switch configuration state
 * GET /api/devices/:id/cisco-config
 */
export async function fetchCiscoConfig(deviceId: string): Promise<any> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}/cisco-config`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch Cisco configuration' }));
    throw new Error(err.error || err.errorFa || err.message || 'Failed to fetch Cisco configuration');
  }
  return res.json();
}

/**
 * Deploys updates for a specific Cisco switch configuration tab
 * POST /api/devices/:id/cisco-config/:tab
 */
export async function updateCiscoConfigTab(
  deviceId: string,
  tab: string,
  payload: any
): Promise<any> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}/cisco-config/${encodeURIComponent(tab)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Failed to update Cisco ${tab} configuration` }));
    throw new Error(err.error || err.errorFa || err.message || `Failed to update Cisco ${tab} configuration`);
  }
  return res.json();
}

/**
 * Commits active Cisco switch configuration to NVRAM (write memory)
 * POST /api/devices/:id/cisco-config/write_memory
 */
export async function saveCiscoConfigNvram(deviceId: string): Promise<any> {
  return updateCiscoConfigTab(deviceId, 'write_memory', {});
}

export interface MikroTikSystemResourcesResponse {
  device_id: string;
  is_live: boolean;
  connected: boolean;
  latency_ms?: number | null;
  timestamp: string;
  host?: string;
  warning?: string;
  error?: string;
  cpu: {
    cpuArch: string;
    cpuCores: number;
    cpuFrequency: string;
    cpuLoad: number;
    cpuTemp?: number;
  };
  ram: {
    totalRamMB: number;
    usedRamMB: number;
    freeRamMB: number;
    ramPercent: number;
  };
  storage: {
    totalHddMB: number;
    usedHddMB: number;
    freeHddMB: number;
    hddPercent: number;
    badBlocks: string;
    writeSectSinceReboot: number;
    writeSectTotal: number;
  };
  health: {
    voltage: string;
    current: string;
    boardTemp: number;
    cpuTemp: number;
    sfpTemp: number;
    fanStatus: string;
    fanSpeeds: string;
    psuStatus: string;
  };
  routerboard: {
    isRouterboard: boolean;
    model: string;
    serialNumber: string;
    currentFirmware: string;
    upgradeFirmware: string;
    firmwareType: string;
    factorySoftware: string;
  };
  system: {
    identity: string;
    uptime: string;
    version: string;
    architecture: string;
    boardName: string;
    softwareId: string;
    licenseLevel: string;
    totalInterfaces: number;
    runningInterfaces: number;
  };
  cliOutputs: {
    resource: { cmd: string; output: string };
    health: { cmd: string; output: string };
    routerboard: { cmd: string; output: string };
    license: { cmd: string; output: string };
    package: { cmd: string; output: string };
    interface: { cmd: string; output: string };
  };
}

export async function fetchMikroTikSystemResources(
  deviceId: string,
  credentials?: { host?: string; username?: string; password?: string }
): Promise<MikroTikSystemResourcesResponse> {
  const options: RequestInit = credentials
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }
    : {
        method: 'GET',
      };

  const res = await fetch(`${API_BASE}/devices/${deviceId}/mikrotik-resources`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch MikroTik system resources' }));
    throw new Error(err.error || err.warning || err.message || 'Failed to fetch MikroTik system resources');
  }
  return res.json();
}

// ----------------------------------------------------------------------
// Remote Server Fleet & Automation Tags Client APIs
// ----------------------------------------------------------------------

export async function fetchRemoteServers(params?: {
  os?: string;
  env?: string;
  category?: string;
  tag?: string;
  search?: string;
}): Promise<{ success: boolean; count: number; servers: RemoteServer[] }> {
  const query = new URLSearchParams();
  if (params?.os) query.set('os', params.os);
  if (params?.env) query.set('env', params.env);
  if (params?.category) query.set('category', params.category);
  if (params?.tag) query.set('tag', params.tag);
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  const url = `${API_BASE}/remote-servers${qs ? `?${qs}` : ''}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch remote servers' }));
    throw new Error(err.error || 'Failed to fetch remote servers');
  }
  return res.json();
}

export async function fetchRemoteServerTags(): Promise<{ success: boolean; tags: RemoteServerTagSummary[] }> {
  const res = await fetchWithRetry(`${API_BASE}/remote-servers/tags`);
  if (!res.ok) {
    throw new Error('Failed to fetch remote server tags');
  }
  return res.json();
}

export async function fetchRemoteServerById(id: string): Promise<{ success: boolean; server: RemoteServer }> {
  const res = await fetchWithRetry(`${API_BASE}/remote-servers/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error('Server not found');
  }
  return res.json();
}

export async function createRemoteServer(server: Partial<RemoteServer>): Promise<{ success: boolean; server: RemoteServer }> {
  const res = await fetchWithRetry(`${API_BASE}/remote-servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'Failed to create server');
  }
  return res.json();
}

export async function updateRemoteServer(
  id: string,
  server: Partial<RemoteServer>
): Promise<{ success: boolean; server: RemoteServer }> {
  const res = await fetchWithRetry(`${API_BASE}/remote-servers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'Failed to update server');
  }
  return res.json();
}

export async function deleteRemoteServer(id: string): Promise<{ success: boolean }> {
  const res = await fetchWithRetry(`${API_BASE}/remote-servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    await parseErrorAndThrow(res, 'Failed to delete server');
  }
  return res.json();
}

export async function updateRemoteServerTags(
  id: string,
  tags: string[]
): Promise<{ success: boolean; server: RemoteServer }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) {
    throw new Error('Failed to update server tags');
  }
  return res.json();
}

export async function testRemoteServerConnection(id: string): Promise<{
  success: boolean;
  reachable: boolean;
  host: string;
  port: number;
  latency_ms: number;
  protocol?: string;
  error?: string;
  message: string;
  server?: RemoteServer;
  hardware?: {
    cpu_cores?: number;
    ram_gb?: number;
    disk_gb?: number;
    uptime_str?: string;
  };
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function testRemoteServerPostgresConnection(
  id: string,
  data?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<PostgresConnectionTestResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresPanelIp(id: string): Promise<{
  success: boolean;
  panelIp: string;
  clientIp?: string;
  localIp?: string;
  serverPort: number;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/panel-ip`);
  return res.json();
}

export async function remediateRemoteServerPostgresConnection(
  id: string,
  data?: {
    panelIp?: string;
    port?: number;
    sessionPassword?: string;
    password?: string;
    user?: string;
    database?: string;
  }
): Promise<PostgresRemediateConnectionResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/remediate-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

export async function updateRemoteServerPostgresCredentials(
  id: string,
  data: {
    user?: string;
    password?: string;
    port?: number;
    database?: string;
  }
): Promise<{ success: boolean; message: string; messageFa?: string; server?: RemoteServer }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/credentials`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function testStandaloneMysqlConnection(data: {
  host: string;
  port?: number;
  user?: string;
  database?: string;
  password?: string;
}): Promise<MysqlConnectionTestResult> {
  const res = await fetch(`${API_BASE}/remote-servers/test-mysql-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function testRemoteServerMysqlConnection(
  id: string,
  data?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<MysqlConnectionTestResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

export async function autoFixRemoteServerMysqlAccess(
  id: string,
  ephemeralSshPassword?: string
): Promise<MysqlAutoFixResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/auto-fix-remote-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ephemeralSshPassword }),
  });
  return res.json();
}

export async function auditRemoteServerMysqlUserPrivileges(
  id: string,
  ephemeralSshPassword?: string
): Promise<MysqlUserPrivilegesAuditResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/audit-user-privileges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ephemeralSshPassword }),
  });
  return res.json();
}

export async function autoGrantRemoteServerMysqlUserPrivileges(
  id: string,
  options?: { database?: string; ephemeralSshPassword?: string }
): Promise<MysqlAutoGrantResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/auto-grant-user-privileges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  return res.json();
}

export async function fetchRemoteServerMysqlOverview(
  id: string
): Promise<{ success: boolean; overview?: MysqlOverview; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/overview`);
  return res.json();
}

export async function fetchRemoteServerMysqlDatabases(
  id: string
): Promise<{ success: boolean; databases?: MysqlDatabaseItem[]; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/databases`);
  return res.json();
}

export async function fetchRemoteServerMysqlDatabaseDetails(
  id: string,
  databaseName: string
): Promise<{ success: boolean; details?: MysqlDatabaseDetails; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/databases/${encodeURIComponent(databaseName)}`);
  return res.json();
}

export async function fetchRemoteServerMysqlDatabaseObjects(
  id: string,
  databaseName: string
): Promise<{ success: boolean; objects?: MysqlDatabaseObjects; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/databases/${encodeURIComponent(databaseName)}/objects`);
  return res.json();
}

export async function fetchRemoteServerMysqlTableStructure(
  id: string,
  databaseName: string,
  tableName: string
): Promise<{ success: boolean; structure?: MysqlTableStructure; error?: string }> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/structure`
  );
  return res.json();
}

export async function fetchRemoteServerMysqlTableData(
  id: string,
  databaseName: string,
  tableName: string,
  request: MysqlTableDataRequest
): Promise<{ success: boolean; data?: MysqlTableDataResult; error?: string }> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/data`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
  return res.json();
}

export async function insertRemoteServerMysqlTableRow(
  id: string,
  params: MysqlRowInsertRequest
): Promise<MysqlRowMutationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/table-row/insert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function updateRemoteServerMysqlTableRow(
  id: string,
  params: MysqlRowUpdateRequest
): Promise<MysqlRowMutationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/table-row/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function deleteRemoteServerMysqlTableRow(
  id: string,
  params: MysqlRowDeleteRequest
): Promise<MysqlRowMutationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/table-row/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

// ==========================================
// Phase 13: Table, Column, Index & Constraint Management Client APIs
// ==========================================

export async function createRemoteServerMysqlTable(
  id: string,
  req: MysqlCreateTableRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/tables/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function renameRemoteServerMysqlTable(
  id: string,
  req: MysqlRenameTableRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/tables/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function alterRemoteServerMysqlTableOptions(
  id: string,
  req: MysqlAlterTableOptionsRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/tables/alter-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlTable(
  id: string,
  req: MysqlDropTableRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/tables/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function truncateRemoteServerMysqlTable(
  id: string,
  req: MysqlTruncateTableRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/tables/truncate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function addRemoteServerMysqlColumn(
  id: string,
  req: MysqlAddColumnRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/columns/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function modifyRemoteServerMysqlColumn(
  id: string,
  req: MysqlModifyColumnRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/columns/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function renameRemoteServerMysqlColumn(
  id: string,
  req: MysqlRenameColumnRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/columns/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlColumn(
  id: string,
  req: MysqlDropColumnRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/columns/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function createRemoteServerMysqlIndex(
  id: string,
  req: MysqlCreateIndexRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/indexes/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlIndex(
  id: string,
  req: MysqlDropIndexRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/indexes/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function addRemoteServerMysqlForeignKey(
  id: string,
  req: MysqlAddForeignKeyRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/foreign-keys/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlForeignKey(
  id: string,
  req: MysqlDropForeignKeyRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/foreign-keys/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function manageRemoteServerMysqlPrimaryKey(
  id: string,
  req: MysqlManagePrimaryKeyRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/primary-key/manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

// ==========================================
// Phase 14: Views, Stored Procedures, Functions, Triggers & Events
// ==========================================

export async function createRemoteServerMysqlView(
  id: string,
  req: MysqlCreateViewRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/views/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlView(
  id: string,
  req: MysqlDropViewRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/views/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function createRemoteServerMysqlProcedure(
  id: string,
  req: MysqlCreateProcedureRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/procedures/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlProcedure(
  id: string,
  req: MysqlDropProcedureRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/procedures/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function executeRemoteServerMysqlProcedure(
  id: string,
  req: MysqlExecuteProcedureRequest
): Promise<MysqlExecuteProcedureResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/procedures/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function createRemoteServerMysqlFunction(
  id: string,
  req: MysqlCreateFunctionRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/functions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlFunction(
  id: string,
  req: MysqlDropFunctionRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/functions/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function createRemoteServerMysqlTrigger(
  id: string,
  req: MysqlCreateTriggerRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/triggers/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlTrigger(
  id: string,
  req: MysqlDropTriggerRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/triggers/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function getRemoteServerMysqlEventSchedulerStatus(
  id: string
): Promise<MysqlEventSchedulerStatus> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/events/scheduler-status`);
  return res.json();
}

export async function setRemoteServerMysqlEventSchedulerStatus(
  id: string,
  req: MysqlSetEventSchedulerRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/events/scheduler-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function createRemoteServerMysqlEvent(
  id: string,
  req: MysqlCreateEventRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/events/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function alterRemoteServerMysqlEventStatus(
  id: string,
  req: MysqlAlterEventStatusRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/events/alter-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function dropRemoteServerMysqlEvent(
  id: string,
  req: MysqlDropEventRequest
): Promise<MysqlDdlOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/events/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

// ==========================================
// Phase 15: MySQL Full Database & Table Backup, Dump & Export Suite
// ==========================================

export async function generateRemoteServerMysqlDump(
  id: string,
  options: MysqlDumpOptions
): Promise<MysqlDumpResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backup/dump`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return res.json();
}

// ==========================================
// Phase 16: MySQL Client Authentication, Network Host Access & my.cnf Configuration Suite
// ==========================================

export async function fetchRemoteServerMysqlClientAuthConfig(
  id: string,
  options?: { password?: string }
): Promise<{ success: boolean; data?: MysqlClientAuthConfigData; error?: string; errorFa?: string }> {
  const query = options?.password ? `?password=${encodeURIComponent(options.password)}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/client-auth${query}`);
  return res.json();
}

export async function saveRemoteServerMysqlClientAuthConfig(
  id: string,
  payload: MysqlClientAuthSaveRequest
): Promise<MysqlClientAuthSaveResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/client-auth/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function restoreRemoteServerMysqlCnfBackup(
  id: string,
  backupFileName: string,
  reloadService?: boolean,
  sessionPassword?: string
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/client-auth/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backupFileName, reloadService, sessionPassword }),
  });
  return res.json();
}

export async function updateRemoteServerMysqlHostRule(
  id: string,
  payload: MysqlHostRuleUpdateRequest
): Promise<{ success: boolean; user?: string; host?: string; message?: string; messageFa?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/client-auth/update-host`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateRemoteServerMysqlDynamicVariable(
  id: string,
  payload: MysqlDynamicVariableUpdateRequest
): Promise<{ success: boolean; name?: string; value?: string; persist?: boolean; message?: string; messageFa?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/client-auth/update-variable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function flushRemoteServerMysqlPrivileges(
  id: string,
  options?: { password?: string }
): Promise<{ success: boolean; message?: string; messageFa?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/client-auth/flush-privileges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: options?.password }),
  });
  return res.json();
}

// ==========================================
// Phase 17: MySQL Advanced Database & Configuration Backup & Restore API
// ==========================================

export async function fetchRemoteServerMysqlBackups(
  id: string,
  options?: { password?: string }
): Promise<{ success: boolean; backups?: MysqlBackupItem[]; error?: string; errorFa?: string }> {
  const query = options?.password ? `?password=${encodeURIComponent(options.password)}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backups${query}`);
  return res.json();
}

export async function createRemoteServerMysqlBackup(
  id: string,
  payload: MysqlCreateBackupRequest
): Promise<MysqlCreateBackupResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backups/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function validateRemoteServerMysqlRestore(
  id: string,
  payload: MysqlValidateRestoreRequest
): Promise<MysqlValidateRestoreResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backups/validate-restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function restoreRemoteServerMysqlBackup(
  id: string,
  payload: MysqlRestoreBackupRequest
): Promise<MysqlRestoreBackupResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function previewRemoteServerMysqlBackup(
  id: string,
  filename: string
): Promise<MysqlBackupPreviewResult> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backups/${encodeURIComponent(filename)}/preview`
  );
  return res.json();
}

export async function deleteRemoteServerMysqlBackup(
  id: string,
  filename: string
): Promise<{ success: boolean; message?: string; messageFa?: string; error?: string; errorFa?: string }> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backups/${encodeURIComponent(filename)}`,
    {
      method: 'DELETE',
    }
  );
  return res.json();
}

export async function uploadRemoteServerMysqlBackup(
  id: string,
  filename: string,
  content: string
): Promise<{ success: boolean; backup?: MysqlBackupItem; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/backups/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content }),
  });
  return res.json();
}

// ==========================================
// Phase 18: MySQL Database Maintenance & Optimization API
// ==========================================

export async function runRemoteServerMysqlMaintenance(
  id: string,
  params: MysqlMaintenanceRequest
): Promise<MysqlMaintenanceResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/maintenance/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function fetchRemoteServerMysqlBloatMetrics(
  id: string,
  database?: string,
  options?: { password?: string }
): Promise<{ success: boolean; metrics?: MysqlTableBloatMetric[]; error?: string; errorFa?: string }> {
  const query = new URLSearchParams();
  if (database) query.set('database', database);
  if (options?.password) query.set('password', options.password);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/maintenance/bloat${qStr}`);
  return res.json();
}

export async function fetchRemoteServerMysqlActiveMaintenance(
  id: string,
  database?: string,
  options?: { password?: string }
): Promise<{ success: boolean; active?: MysqlActiveMaintenanceProgress[]; error?: string; errorFa?: string }> {
  const query = new URLSearchParams();
  if (database) query.set('database', database);
  if (options?.password) query.set('password', options.password);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/maintenance/active${qStr}`);
  return res.json();
}

export async function fetchRemoteServerMysqlReplicationOverview(
  id: string,
  force?: boolean
): Promise<{ success: boolean; overview?: MysqlReplicationOverview; error?: string; errorFa?: string }> {
  const query = force ? '?force=true' : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/replication${query}`);
  return res.json();
}

export async function executeRemoteServerMysqlReplicationAction(
  id: string,
  request: MysqlReplicationActionRequest
): Promise<MysqlReplicationActionResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/replication/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return res.json();
}

// ==========================================
// Phase 20: MySQL Security Audit & Safety Hardening API
// ==========================================

export async function fetchRemoteServerMysqlSecurityAudit(
  id: string,
  options?: { port?: number; user?: string; password?: string }
): Promise<{ success: boolean; report?: MysqlSecurityAuditReport; error?: string; errorFa?: string }> {
  const query = new URLSearchParams();
  if (options?.port) query.set('port', String(options.port));
  if (options?.user) query.set('user', options.user);
  if (options?.password) query.set('password', options.password);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/security-audit${qStr}`);
  return res.json();
}

export async function executeRemoteServerMysqlHardeningRemediation(
  id: string,
  request: MysqlHardeningRemediationRequest
): Promise<MysqlHardeningRemediationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/security-audit/remediate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function fetchRemoteServerMysqlAuditLogs(
  id: string,
  limit: number = 100
): Promise<MysqlAuditLogsResponse> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/audit-logs?limit=${limit}`);
  return res.json();
}

export async function fetchRemoteServerMysqlUsers(
  id: string
): Promise<{ success: boolean; users?: MysqlUserItem[]; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/users`);
  return res.json();
}

export async function createRemoteServerMysqlUser(
  id: string,
  payload: MysqlUserCreateRequest
): Promise<{ success: boolean; user?: string; host?: string; message?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/users/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateRemoteServerMysqlUser(
  id: string,
  payload: MysqlUserUpdateRequest
): Promise<{ success: boolean; user?: string; host?: string; message?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/users/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function changeRemoteServerMysqlUserPassword(
  id: string,
  payload: MysqlUserPasswordChangeRequest
): Promise<{ success: boolean; user?: string; host?: string; message?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/users/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function lockRemoteServerMysqlUser(
  id: string,
  payload: MysqlUserLockRequest
): Promise<{ success: boolean; user?: string; host?: string; locked?: boolean; message?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/users/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function setRemoteServerMysqlUserExpiration(
  id: string,
  payload: MysqlUserExpirePasswordRequest
): Promise<{ success: boolean; user?: string; host?: string; message?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/users/expire-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function dropRemoteServerMysqlUser(
  id: string,
  payload: MysqlUserDropRequest
): Promise<{ success: boolean; user?: string; host?: string; message?: string; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/users/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchRemoteServerMysqlGrants(
  id: string,
  user: string,
  host: string = '%'
): Promise<MysqlUserGrantsResponse> {
  const params = new URLSearchParams({ user, host });
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/grants?${params.toString()}`);
  return res.json();
}

export async function fetchRemoteServerMysqlPermissions(
  id: string,
  options: {
    scope: MysqlPrivilegeScope;
    database?: string;
    table?: string;
    column?: string;
    routineType?: MysqlRoutineType;
    routineName?: string;
  }
): Promise<MysqlPermissionsMatrixResponse> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return res.json();
}

export async function applyRemoteServerMysqlPermissions(
  id: string,
  payload: MysqlApplyPermissionsRequest
): Promise<MysqlApplyPermissionsResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/permissions/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function executeRemoteServerMysqlQuery(
  id: string,
  query: string,
  database?: string,
  options?: {
    confirmedDestructive?: boolean;
    auditNotes?: string;
    maxRows?: number;
  }
): Promise<MysqlQueryResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      database,
      confirmedDestructive: options?.confirmedDestructive,
      auditNotes: options?.auditNotes,
      maxRows: options?.maxRows,
    }),
  });
  return res.json();
}

export async function checkRemoteServerMysqlQuerySafety(
  id: string,
  query: string
): Promise<{ success: boolean; safetyReport: MysqlSqlQuerySafetyReport; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/query/safety-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

export async function fetchRemoteServerMysqlProcesslist(
  id: string
): Promise<MysqlProcesslistResponse> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/processlist`);
  return res.json();
}

export async function killRemoteServerMysqlProcess(
  id: string,
  processId: number,
  type: MysqlKillType = 'connection'
): Promise<MysqlKillProcessResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/kill-process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ processId, type }),
  });
  return res.json();
}

export async function fetchRemoteServerMysqlVariables(
  id: string,
  filter?: string
): Promise<{ success: boolean; variables?: MysqlVariableItem[]; error?: string }> {
  const url = filter
    ? `${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/variables?filter=${encodeURIComponent(filter)}`
    : `${API_BASE}/remote-servers/${encodeURIComponent(id)}/mysql/variables`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchRemoteServerPostgresOverview(
  id: string,
  data?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<{ success: boolean; data?: PostgresEngineOverview; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresDatabases(
  id: string,
  data?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
    includeTemplates?: boolean;
  }
): Promise<{ success: boolean; databases?: PostgresDatabaseItem[]; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/databases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresRoles(
  id: string,
  data?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<{ success: boolean; roles?: PostgresRoleItem[]; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

export async function createRemoteServerPostgresRole(
  id: string,
  data: import('../types').PostgresRoleCreateRequest
): Promise<import('../types').PostgresRoleOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/roles/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRemoteServerPostgresRole(
  id: string,
  data: import('../types').PostgresRoleUpdateRequest
): Promise<import('../types').PostgresRoleOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/roles/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function changeRemoteServerPostgresRolePassword(
  id: string,
  data: import('../types').PostgresRolePasswordChangeRequest
): Promise<import('../types').PostgresRoleOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/roles/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function manageRemoteServerPostgresRoleMembership(
  id: string,
  data: import('../types').PostgresRoleMembershipRequest
): Promise<import('../types').PostgresRoleOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/roles/membership`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function dropRemoteServerPostgresRole(
  id: string,
  data: import('../types').PostgresRoleDropRequest
): Promise<import('../types').PostgresRoleOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/roles/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresPermissions(
  id: string,
  params: {
    scope: import('../types').PostgresObjectScope;
    database: string;
    schema?: string;
    objectName: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{
  success: boolean;
  data?: import('../types').PostgresObjectPermissionsInfo;
  error?: string;
  errorFa?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function applyRemoteServerPostgresPermissions(
  id: string,
  data: import('../types').PostgresApplyPermissionsRequest
): Promise<import('../types').PostgresApplyPermissionsResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/permissions/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function createRemoteServerPostgresDatabase(
  id: string,
  data: import('../types').PostgresCreateDatabaseRequest
): Promise<import('../types').PostgresDbLifecycleResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/databases/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRemoteServerPostgresDatabase(
  id: string,
  data: import('../types').PostgresUpdateDatabaseRequest
): Promise<import('../types').PostgresDbLifecycleResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/databases/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function dropRemoteServerPostgresDatabase(
  id: string,
  data: import('../types').PostgresDropDatabaseRequest
): Promise<import('../types').PostgresDbLifecycleResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/databases/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresSchemas(
  id: string,
  params: {
    database: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; schemas?: import('../types').PostgresSchemaItem[]; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/schemas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function createRemoteServerPostgresSchema(
  id: string,
  data: import('../types').PostgresCreateSchemaRequest
): Promise<import('../types').PostgresDbLifecycleResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/schemas/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRemoteServerPostgresSchema(
  id: string,
  data: import('../types').PostgresUpdateSchemaRequest
): Promise<import('../types').PostgresDbLifecycleResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/schemas/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function dropRemoteServerPostgresSchema(
  id: string,
  data: import('../types').PostgresDropSchemaRequest
): Promise<import('../types').PostgresDbLifecycleResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/schemas/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// ==========================================
// Phase 13: Backup & Restore Management API
// ==========================================

export async function fetchRemoteServerPostgresBackups(
  id: string
): Promise<{ success: boolean; backups: import('../types').PostgresBackupItem[]; count: number; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/backups`);
  return res.json();
}

export async function createRemoteServerPostgresBackup(
  id: string,
  data: import('../types').PostgresCreateBackupRequest
): Promise<import('../types').PostgresCreateBackupResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/backups/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function restoreRemoteServerPostgresBackup(
  id: string,
  data: import('../types').PostgresRestoreBackupRequest
): Promise<import('../types').PostgresRestoreBackupResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function validateRemoteServerPostgresRestore(
  id: string,
  data: import('../types').PostgresValidateRestoreRequest
): Promise<import('../types').PostgresValidateRestoreResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/backups/validate-restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function previewRemoteServerPostgresBackup(
  id: string,
  filename: string
): Promise<import('../types').PostgresBackupPreviewResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/backups/${encodeURIComponent(filename)}/preview`);
  return res.json();
}

export async function deleteRemoteServerPostgresBackup(
  id: string,
  filename: string
): Promise<{ success: boolean; message: string; messageFa: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/backups/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  return res.json();
}

// ==========================================
// Phase 14: Extensions Management API
// ==========================================

export async function fetchRemoteServerPostgresExtensions(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{
  success: boolean;
  database?: string;
  extensions: import('../types').PostgresExtensionItem[];
  totalCount: number;
  installedCount: number;
  updatableCount: number;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/extensions${queryStr}`);
  return res.json();
}

export async function installRemoteServerPostgresExtension(
  id: string,
  data: import('../types').PostgresInstallExtensionRequest
): Promise<import('../types').PostgresExtensionOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/extensions/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRemoteServerPostgresExtension(
  id: string,
  data: import('../types').PostgresUpdateExtensionRequest
): Promise<import('../types').PostgresExtensionOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/extensions/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function dropRemoteServerPostgresExtension(
  id: string,
  data: import('../types').PostgresDropExtensionRequest
): Promise<import('../types').PostgresExtensionOperationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/extensions/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// ==========================================
// Phase 15: Health Check & Security Audit API
// ==========================================

export async function fetchRemoteServerPostgresHealthAudit(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{
  success: boolean;
  report?: import('../types').PostgresHealthAuditReport;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/health-audit${queryStr}`);
  return res.json();
}

// ==========================================
// Phase 16: pg_hba.conf Client Authentication API
// ==========================================

export async function fetchRemoteServerPostgresHbaConfig(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{
  success: boolean;
  data?: import('../types').PostgresHbaConfigData;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/hba${queryStr}`);
  return res.json();
}

export async function saveRemoteServerPostgresHbaConfig(
  id: string,
  req: import('../types').PostgresHbaSaveRequest
): Promise<import('../types').PostgresHbaSaveResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/hba/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function restoreRemoteServerPostgresHbaBackup(
  id: string,
  req: import('../types').PostgresHbaRestoreRequest
): Promise<import('../types').PostgresHbaSaveResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/hba/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function reloadRemoteServerPostgresHbaConfig(
  id: string,
  data?: {
    database?: string;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa?: string; errors?: string[] }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/hba/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

// ==========================================
// Phase 18: Database Maintenance & Optimization API
// ==========================================

export async function runRemoteServerPostgresMaintenance(
  id: string,
  params: import('../types').PostgresMaintenanceRequest
): Promise<import('../types').PostgresMaintenanceResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/maintenance/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresBloatMetrics(
  id: string,
  params: {
    database: string;
    schema?: string;
    table?: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{
  success: boolean;
  database: string;
  metrics: import('../types').PostgresTableBloatMetric[];
  error?: string;
  errorFa?: string;
}> {
  const q = new URLSearchParams();
  q.append('database', params.database);
  if (params.schema) q.append('schema', params.schema);
  if (params.table) q.append('table', params.table);
  if (params.port) q.append('port', String(params.port));
  if (params.user) q.append('user', params.user);
  if (params.password) q.append('password', params.password);

  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/maintenance/bloat?${q.toString()}`);
  return res.json();
}

export async function fetchRemoteServerPostgresActiveMaintenance(
  id: string,
  params: {
    database: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{
  success: boolean;
  database: string;
  activeTasks: import('../types').PostgresActiveMaintenanceProgress[];
  error?: string;
  errorFa?: string;
}> {
  const q = new URLSearchParams();
  q.append('database', params.database);
  if (params.port) q.append('port', String(params.port));
  if (params.user) q.append('user', params.user);
  if (params.password) q.append('password', params.password);

  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/maintenance/active?${q.toString()}`);
  return res.json();
}

// ==========================================
// Phase 20: Lock & Deadlock Inspector API
// ==========================================
export async function fetchRemoteServerPostgresLocks(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{
  success: boolean;
  data?: import('../types').PostgresLocksOverview;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/locks${queryStr}`);
  return res.json();
}

export async function terminateRemoteServerPostgresSession(
  id: string,
  req: import('../types').PostgresSessionTerminateRequest
): Promise<import('../types').PostgresSessionTerminateResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/locks/terminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

// ==========================================
// Phase 21: Live Activity & Query Performance API
// ==========================================
export async function fetchRemoteServerPostgresPerformance(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{
  success: boolean;
  data?: import('../types').PostgresPerformanceOverview;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/performance${queryStr}`);
  return res.json();
}

export async function resetRemoteServerPostgresStatStatements(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/performance/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  return res.json();
}

// ==========================================
// Phase 22: Replication & High-Availability API
// ==========================================
export async function fetchRemoteServerPostgresReplication(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{
  success: boolean;
  data?: import('../types').PostgresReplicationOverview;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/replication${queryStr}`);
  return res.json();
}

export async function manageRemoteServerPostgresReplicationSlot(
  id: string,
  req: import('../types').PostgresReplicationSlotActionRequest
): Promise<{ success: boolean; message: string; messageFa: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/replication/slot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function controlRemoteServerPostgresWalReplay(
  id: string,
  req: import('../types').PostgresReplicationReplayControlRequest
): Promise<{ success: boolean; message: string; messageFa: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/replication/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

// ==========================================
// Phase 23: Postgres Server Logs Explorer API
// ==========================================
export async function fetchRemoteServerPostgresLogs(
  id: string,
  options?: import('../types').PostgresLogsFilterOptions
): Promise<{
  success: boolean;
  data?: import('../types').PostgresLogsOverview;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);
  if (options?.logFileName) params.append('logFileName', options.logFileName);
  if (options?.maxLines) params.append('maxLines', String(options.maxLines));
  if (options?.severity && options.severity !== 'ALL') params.append('severity', options.severity);
  if (options?.searchTerm) params.append('searchTerm', options.searchTerm);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/logs${queryStr}`);
  return res.json();
}

export async function fetchRemoteServerPostgresLoggingSettings(
  id: string,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<{
  success: boolean;
  data?: import('../types').PostgresLoggingSettings;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/logs/settings${queryStr}`);
  return res.json();
}

// ==========================================
// Phase 24: Postgres Configuration Tuner API
// ==========================================
export async function fetchRemoteServerPostgresTuningReport(
  id: string,
  options?: {
    database?: string;
    port?: number;
    user?: string;
    password?: string;
    workload?: import('../types').PostgresWorkloadType;
    storage?: import('../types').PostgresStorageType;
    customRamGb?: number;
    customCores?: number;
    maxConnections?: number;
  }
): Promise<{
  success: boolean;
  data?: import('../types').PostgresTuningRecommendationReport;
  error?: string;
  errorFa?: string;
}> {
  const params = new URLSearchParams();
  if (options?.database) params.append('database', options.database);
  if (options?.port) params.append('port', String(options.port));
  if (options?.user) params.append('user', options.user);
  if (options?.password) params.append('password', options.password);
  if (options?.workload) params.append('workload', options.workload);
  if (options?.storage) params.append('storage', options.storage);
  if (options?.customRamGb) params.append('customRamGb', String(options.customRamGb));
  if (options?.customCores) params.append('customCores', String(options.customCores));
  if (options?.maxConnections) params.append('maxConnections', String(options.maxConnections));

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/tuning${queryStr}`);
  return res.json();
}

export async function applyRemoteServerPostgresTuning(
  id: string,
  body: import('../types').PostgresApplyTuningRequest & {
    database?: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  messageFa: string;
  appliedCount?: number;
  requiresRestart?: boolean;
  error?: string;
  errorFa?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/tuning/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresDatabaseTree(
  id: string,
  database: string,
  data?: {
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; tree?: PostgresDatabaseTree; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/database-tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(data || {}), database }),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresTableStructure(
  id: string,
  params: {
    database: string;
    schema: string;
    table: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; structure?: PostgresTableStructure; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/table-structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function fetchRemoteServerPostgresTableData(
  id: string,
  params: PostgresTableDataRequest & {
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; data?: PostgresTableDataResult; error?: string; errorFa?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/table-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function insertRemoteServerPostgresTableRow(
  id: string,
  params: PostgresRowInsertRequest
): Promise<PostgresRowMutationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/table-row/insert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function updateRemoteServerPostgresTableRow(
  id: string,
  params: PostgresRowUpdateRequest
): Promise<PostgresRowMutationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/table-row/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function deleteRemoteServerPostgresTableRow(
  id: string,
  params: PostgresRowDeleteRequest
): Promise<PostgresRowMutationResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/table-row/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function executeRemoteServerPostgresQuery(
  id: string,
  params: PostgresQueryExecutionRequest
): Promise<PostgresQueryExecutionResponse> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function analyzeRemoteServerPostgresQuery(
  id: string,
  query: string
): Promise<{ success: boolean; report?: any; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/postgres/query/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

export function getRemoteServerWebSocketUrl(
  serverId: string,
  shell: 'bash' | 'zsh' = 'bash',
  serverInfo?: {
    ip?: string;
    ssh_port?: number;
    ssh_username?: string;
    ssh_password?: string;
    approval_request_id?: string;
  }
): string {
  const loc = window.location;
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  query.set('deviceId', serverId);
  query.set('protocol', 'ssh');
  query.set('platform', 'linux');
  query.set('shell', shell);
  if (serverInfo) {
    if (serverInfo.ip) query.set('host', serverInfo.ip);
    if (serverInfo.ssh_port) query.set('port', String(serverInfo.ssh_port));
    if (serverInfo.ssh_username) query.set('username', serverInfo.ssh_username);
    if (serverInfo.ssh_password) query.set('password', serverInfo.ssh_password);
    if (serverInfo.approval_request_id) query.set('approvalRequestId', serverInfo.approval_request_id);
  }
  const token = getAuthToken();
  if (token) query.set('token', token);
  return `${wsProto}//${loc.host}/ws/ssh/${encodeURIComponent(serverId)}?${query.toString()}`;
}

export async function fetchLinuxServerLiveMetrics(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  metrics: LinuxServerLiveMetrics;
  error?: string;
  requires_password?: boolean;
}> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword }),
    });
    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse response from server',
    }));
    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return {
      success: false,
      metrics: null as any,
      error: err?.message || 'Network connection failed or aborted',
    };
  }
}

export async function fetchLinuxServerServices(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  services: LinuxSystemService[];
  error?: string;
  requires_password?: boolean;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function controlLinuxServerService(
  serverId: string,
  serviceName: string,
  action: 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable',
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/service-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName, action, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function discoverNginxTopology(
  serverId: string,
  ephemeralPassword?: string,
  options?: { targetConfPath?: string; targetBinaryPath?: string }
): Promise<{
  success: boolean;
  discovery?: import('../types').NginxInstallationDetails;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-discovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: ephemeralPassword,
      targetConfPath: options?.targetConfPath,
      targetBinaryPath: options?.targetBinaryPath,
    }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function discoverApacheTopology(
  serverId: string,
  ephemeralPassword?: string,
  options?: { targetConfPath?: string; targetBinaryPath?: string }
): Promise<{
  success: boolean;
  discovery?: import('../types').ApacheInstallationDetails;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-discovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: ephemeralPassword,
      targetConfPath: options?.targetConfPath,
      targetBinaryPath: options?.targetBinaryPath,
    }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheConfigTopology(
  serverId: string,
  ephemeralPassword?: string,
  confPath?: string,
  serverRoot?: string
): Promise<{
  success: boolean;
  topology?: import('../types').ApacheConfigTopologyTree;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-config-topology`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, confPath, serverRoot }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheVirtualHosts(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  summary?: import('../types').ApacheVirtualHostsSummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-vhosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function toggleApacheVirtualHostStatus(
  serverId: string,
  siteName: string,
  enable: boolean,
  filePath?: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-vhost-toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, siteName, enable, filePath }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function createApacheVirtualHost(
  serverId: string,
  params: import('../types').CreateApacheVirtualHostParams,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  filePath?: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-vhost-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, params }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function deleteApacheVirtualHost(
  serverId: string,
  siteName: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-vhost-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, siteName, filePath }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheProxyArchitecture(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  summary?: import('../types').ApacheProxySummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function enableApacheProxyModules(
  serverId: string,
  modules: string[],
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-proxy-modules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, modules }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function createApacheProxyRoute(
  serverId: string,
  params: import('../types').CreateApacheProxyRouteParams,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  filePath?: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-proxy-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, params }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function deleteApacheProxyRoute(
  serverId: string,
  routeId: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-proxy-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, routeId, filePath }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheModulesArchitecture(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  summary?: import('../types').ApacheModulesSummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-modules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function toggleApacheModule(
  serverId: string,
  moduleName: string,
  action: 'enable' | 'disable',
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-module-toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, moduleName, action }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function switchApacheMpm(
  serverId: string,
  targetMpm: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-mpm-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, targetMpm }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheCertificates(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  sslData?: import('../types').ApacheSslSummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-certificates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function generateApacheSelfSignedCert(
  serverId: string,
  params: import('../types').GenerateApacheSelfSignedCertParams,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  certPath?: string;
  keyPath?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-ssl-generate-selfsigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, ...params }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function attachApacheSslCert(
  serverId: string,
  params: import('../types').AttachApacheSslCertParams,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-ssl-attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, ...params }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function enableApacheModernSslProfile(
  serverId: string,
  vhostId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-ssl-modern-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, vhostId }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheLogFiles(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  logs?: import('../types').ApacheLogsDiscoverySummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-logs-discovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheLogStream(
  serverId: string,
  params: {
    filePath: string;
    lines?: number;
    search?: string;
    statusCode?: string;
    level?: string;
  },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  stream?: import('../types').ApacheLogStreamResponse;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-logs-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: ephemeralPassword,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function readApacheConfigFile(
  serverId: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  content: string;
  sizeBytes: number;
  lastModified?: string;
  permissions?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-config-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    content: '',
    sizeBytes: 0,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function testApacheConfigFileCandidate(
  serverId: string,
  filePath: string,
  candidateContent: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  test?: import('../types').ApacheEditorTestResult;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-config-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, candidateContent, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function saveApacheConfigFileSafe(
  serverId: string,
  filePath: string,
  newContent: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<import('../types').ApacheEditorSaveResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-config-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, newContent, autoReload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath,
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function listApacheFileBackups(
  serverId: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  backups?: import('../types').ApacheConfigFileBackup[];
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-config-backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    backups: [],
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function restoreApacheFileBackup(
  serverId: string,
  filePath: string,
  backupPath: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<import('../types').ApacheEditorSaveResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-config-restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, backupPath, autoReload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath,
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function manageApacheService(
  serverId: string,
  action: import('../types').ApacheServiceAction,
  ephemeralPassword?: string
): Promise<import('../types').ApacheServiceActionResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-service-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    action,
    serviceName: 'apache2',
    serviceManager: 'systemd',
    output: 'Failed to parse response from server',
    error: 'Network or parsing error',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheSecurityAudit(
  serverId: string,
  ephemeralPassword?: string,
  targetConfPath?: string
): Promise<{
  success: boolean;
  report?: import('../types').ApacheSecurityAuditReport;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-security-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, targetConfPath }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function applyApacheSecurityHardening(
  serverId: string,
  targetFilePath?: string,
  customContent?: string,
  ephemeralPassword?: string
): Promise<import('../types').ApacheSecurityApplyFixResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-security-apply-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetFilePath, customContent, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath: targetFilePath || '',
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApachePerformanceReport(
  serverId: string,
  ephemeralPassword?: string,
  targetConfPath?: string
): Promise<{
  success: boolean;
  report?: import('../types').ApachePerformanceReport;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-performance-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, targetConfPath }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function enableApacheModStatus(
  serverId: string,
  ephemeralPassword?: string
): Promise<import('../types').ApachePerformanceTuneResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-performance-enable-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath: '',
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function applyApachePerformanceTuning(
  serverId: string,
  customContent: string,
  targetFilePath?: string,
  ephemeralPassword?: string
): Promise<import('../types').ApachePerformanceTuneResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-performance-apply-tuning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customContent, targetFilePath, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath: targetFilePath || '',
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchApacheRewriteSummary(
  serverId: string,
  ephemeralPassword?: string,
  targetConfPath?: string
): Promise<{
  success: boolean;
  summary?: import('../types').ApacheRewriteHtaccessSummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-rewrite-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, targetConfPath }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function enableApacheRewriteModule(
  serverId: string,
  ephemeralPassword?: string
): Promise<import('../types').ApacheDeployRewriteResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-rewrite-enable-module`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath: '',
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function saveApacheHtaccessFile(
  serverId: string,
  targetDirectory: string,
  content: string,
  ephemeralPassword?: string
): Promise<import('../types').ApacheDeployRewriteResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-htaccess-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDirectory, content, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath: targetDirectory,
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function setupApacheBasicAuth(
  serverId: string,
  params: {
    targetDirectory: string;
    authName: string;
    username: string;
    password?: string;
    authUserFilePath?: string;
  },
  sessionPassword?: string
): Promise<import('../types').ApacheDeployRewriteResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-basic-auth-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, sessionPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath: params.targetDirectory,
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function deployApacheCustomErrorDocs(
  serverId: string,
  errorDocs: import('../types').ApacheCustomErrorDoc[],
  ephemeralPassword?: string
): Promise<import('../types').ApacheDeployRewriteResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/apache-error-docs-deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ errorDocs, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    filePath: '',
    syntaxTestPassed: false,
    syntaxOutput: '',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchNginxConfigTopology(
  serverId: string,
  ephemeralPassword?: string,
  confPath?: string,
  prefixPath?: string
): Promise<{
  success: boolean;
  topology?: import('../types').NginxConfigTopologyTree;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-config-topology`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, confPath, prefixPath }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchNginxSites(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  sites?: import('../types').NginxSitesSummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchNginxProxy(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  proxy?: import('../types').NginxProxySummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchNginxCertificates(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  ssl?: import('../types').NginxSslSummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-certificates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchNginxLogsDiscovery(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  logs?: import('../types').NginxLogsDiscoverySummary;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-logs-discovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchNginxLogStream(
  serverId: string,
  params: {
    filePath: string;
    lines?: number;
    search?: string;
    statusCode?: string;
    level?: string;
  },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  stream?: import('../types').NginxLogStreamResponse;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-logs-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: ephemeralPassword,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function testNginxSite(
  serverId: string,
  config: import('../types').NginxNewSiteConfig,
  ephemeralPassword?: string
): Promise<import('../types').NginxSiteTestResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-site-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      password: ephemeralPassword,
    }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    isValid: false,
    testOutput: 'Failed to parse response from server',
    generatedConfig: '',
    targetFilePath: '',
    error: 'Failed to parse response',
  }));
  return data;
}

export async function deployNginxSite(
  serverId: string,
  config: import('../types').NginxNewSiteConfig,
  ephemeralPassword?: string
): Promise<import('../types').NginxSiteDeployResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-site-deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      password: ephemeralPassword,
    }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    deployedFilePath: '',
    syntaxTestPassed: false,
    syntaxOutput: 'Failed to parse server response',
    serviceReloaded: false,
    error: 'Failed to parse response',
  }));
  return data;
}

export async function toggleNginxSite(
  serverId: string,
  siteFilePath: string,
  enable: boolean,
  ephemeralPassword?: string
): Promise<{ success: boolean; isEnabled?: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-site-toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteFilePath,
      enable,
      password: ephemeralPassword,
    }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function deleteNginxSite(
  serverId: string,
  siteFilePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-site-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteFilePath,
      password: ephemeralPassword,
    }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function readNginxFile(
  serverId: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; content: string; sizeBytes: number; lastModified?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-file-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, content: '', sizeBytes: 0, error: 'Failed to parse response' }));
}

export async function testNginxFileCandidate(
  serverId: string,
  filePath: string,
  candidateContent: string,
  ephemeralPassword?: string
): Promise<import('../types').NginxEditorTestResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-file-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, candidateContent, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ isValid: false, output: 'Failed to parse response', error: 'Failed to parse response' }));
}

export async function saveNginxFileSafe(
  serverId: string,
  filePath: string,
  newContent: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<import('../types').NginxEditorSaveResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-file-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, newContent, autoReload, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({
    success: false,
    filePath,
    syntaxTestPassed: false,
    syntaxOutput: 'Failed to parse response',
    serviceReloaded: false,
    error: 'Failed to parse response',
  }));
}

export async function fetchNginxFileBackups(
  serverId: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; backups: import('../types').NginxConfigFileBackup[]; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-file-backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, backups: [], error: 'Failed to parse response' }));
}

export async function restoreNginxFileBackup(
  serverId: string,
  filePath: string,
  backupPath: string,
  autoReload: boolean = true,
  ephemeralPassword?: string
): Promise<import('../types').NginxEditorSaveResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-file-restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, backupPath, autoReload, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({
    success: false,
    filePath,
    syntaxTestPassed: false,
    syntaxOutput: 'Failed to parse response',
    serviceReloaded: false,
    error: 'Failed to parse response',
  }));
}

export async function fetchNginxSecurityAudit(
  serverId: string,
  targetConfPath?: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  report?: import('../types').NginxSecurityAuditReport;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-security-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetConfPath, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
}

export async function applyNginxSecurityFix(
  serverId: string,
  targetFilePath?: string,
  customContent?: string,
  ephemeralPassword?: string
): Promise<import('../types').NginxSecurityApplyFixResult> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/nginx-security-apply-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetFilePath, customContent, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({
    success: false,
    filePath: targetFilePath || '',
    syntaxTestPassed: false,
    syntaxOutput: 'Failed to parse response',
    serviceReloaded: false,
    error: 'Failed to parse response from server',
  }));
}

export async function fetchLinuxServiceWatchdogs(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  watchdogs: LinuxServiceWatchdogRule[];
  error?: string;
}> {
  const params = new URLSearchParams();
  if (ephemeralPassword) {
    params.set('password', ephemeralPassword);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/service-watchdogs${qs}`);
  const data = await res.json().catch(() => ({
    success: false,
    watchdogs: [],
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function saveLinuxServiceWatchdog(
  serverId: string,
  rule: LinuxServiceWatchdogRule,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  rule?: LinuxServiceWatchdogRule;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/service-watchdogs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function deleteLinuxServiceWatchdog(
  serverId: string,
  serviceName: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/service-watchdogs/${encodeURIComponent(serviceName)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword }),
    }
  );
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function testLinuxServiceWatchdog(
  serverId: string,
  serviceName: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/service-watchdogs/${encodeURIComponent(serviceName)}/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword }),
    }
  );
  const data = await res.json().catch(() => ({
    success: false,
    output: '',
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function resetLinuxServiceWatchdogAntiLoop(
  serverId: string,
  serviceName: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/service-watchdogs/${encodeURIComponent(serviceName)}/reset-loop`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword }),
    }
  );
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxWatchdogLogs(
  serverId: string,
  lines: number = 100,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  logs: string;
  error?: string;
}> {
  const params = new URLSearchParams();
  params.set('lines', String(lines));
  if (ephemeralPassword) {
    params.set('password', ephemeralPassword);
  }
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/service-watchdog-logs?${params.toString()}`
  );
  const data = await res.json().catch(() => ({
    success: false,
    logs: '',
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxDirectoryPolicies(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  policies: LinuxDirectoryPolicyRule[];
  error?: string;
}> {
  const params = new URLSearchParams();
  if (ephemeralPassword) {
    params.set('password', ephemeralPassword);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/directory-policies${qs}`);
  const data = await res.json().catch(() => ({
    success: false,
    policies: [],
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function saveLinuxDirectoryPolicy(
  serverId: string,
  rule: LinuxDirectoryPolicyRule,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  rule?: LinuxDirectoryPolicyRule;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/directory-policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function deleteLinuxDirectoryPolicy(
  serverId: string,
  ruleId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/directory-policies/${encodeURIComponent(ruleId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword }),
    }
  );
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function runLinuxDirectoryPolicyNow(
  serverId: string,
  ruleId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}> {
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/directory-policies/${encodeURIComponent(ruleId)}/run-now`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword }),
    }
  );
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxDirectoryPolicyLogs(
  serverId: string,
  lines: number = 100,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  logs: string;
  error?: string;
}> {
  const params = new URLSearchParams();
  params.set('lines', String(lines));
  if (ephemeralPassword) {
    params.set('password', ephemeralPassword);
  }
  const res = await fetch(
    `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/directory-policy-logs?${params.toString()}`
  );
  const data = await res.json().catch(() => ({
    success: false,
    logs: '',
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function controlLinuxServerProcess(
  serverId: string,
  pid: number,
  action: 'kill' | 'renice',
  options: { signal?: number; nice?: number },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/process-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid, action, signal: options.signal, nice: options.nice, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxServerUsers(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  loggedInUsers: LinuxLoggedInUser[];
  systemUsers: LinuxSystemUser[];
  systemGroups: LinuxSystemGroup[];
  error?: string;
  requires_password?: boolean;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function createLinuxUser(
  serverId: string,
  params: {
    username: string;
    password?: string;
    comment?: string;
    homeDir?: string;
    shell?: string;
    groups?: string[];
    createHome?: boolean;
    expireDate?: string;
    forcePasswordChange?: boolean;
  },
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function updateLinuxUser(
  serverId: string,
  params: {
    username: string;
    comment?: string;
    homeDir?: string;
    shell?: string;
    groups?: string[];
    newPassword?: string;
    forcePasswordChange?: boolean;
    expireDate?: string;
    isLocked?: boolean;
  },
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxUserSecurityInfo(
  serverId: string,
  username: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; data?: LinuxUserSecurityInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/${encodeURIComponent(username)}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function updateLinuxUserPassword(
  serverId: string,
  username: string,
  password: string,
  ephemeralPassword?: string,
  forcePasswordChange?: boolean
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, ephemeralPassword, forcePasswordChange }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function toggleLinuxUserLock(
  serverId: string,
  username: string,
  lock: boolean,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/toggle-lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, lock, ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function updateLinuxUserGroups(
  serverId: string,
  username: string,
  groups: string[],
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, groups, ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function createLinuxGroup(
  serverId: string,
  name: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/groups/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function deleteLinuxUser(
  serverId: string,
  username: string,
  removeHome: boolean,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, removeHome, ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function sendLinuxServerUserMessage(
  serverId: string,
  target: string,
  message: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
  errorFa?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, message, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function logoutLinuxServerUserSession(
  serverId: string,
  params: {
    username: string;
    tty?: string;
    delaySeconds?: number;
    message?: string;
    force?: boolean;
    allSessions?: boolean;
  },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/logout-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = data.message || `HTTP Error ${res.status}`;
  }
  return data;
}

export async function restartRemoteServer(
  serverId: string,
  params: {
    actionType?: 'restart' | 'poweroff';
    delayMinutes?: number;
    notifyUsers?: boolean;
    message?: string;
    force?: boolean;
    cancelPending?: boolean;
  },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  command?: string;
  output?: string;
  error?: string;
  requires_password?: boolean;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/restart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = data.message || `HTTP Error ${res.status}`;
  }
  return data;
}

export async function executeBulkServerPower(params: {
  serverIds: string[];
  actionType?: 'restart' | 'poweroff';
  delayMinutes?: number;
  notifyUsers?: boolean;
  message?: string;
  force?: boolean;
  cancelPending?: boolean;
  password?: string;
}): Promise<{
  success: boolean;
  results: Array<{
    serverId: string;
    serverName: string;
    ip: string;
    osType: string;
    success: boolean;
    message: string;
    command?: string;
    output?: string;
    error?: string;
  }>;
  error?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/remote-servers/bulk-power`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({
    success: false,
    results: [],
  }));
  if (!res.ok && !data.error) {
    data.error = data.message || `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxServerSysConfig(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  sysInfo: LinuxSystemDetailedInfo;
  interfaces: LinuxNetworkInterfaceDetail[];
  error?: string;
  requires_password?: boolean;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/sysconfig`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxNetworkStack(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  stackInfo: LinuxNetworkStackInfo;
  interfaces: LinuxNetworkInterfaceDetail[];
  error?: string;
  requires_password?: boolean;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/network-stack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function configureLinuxServerNetwork(
  serverId: string,
  interfaceName: string,
  config: LinuxInterfaceConfigPayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
  providerUsed?: string;
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
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/network-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interfaceName, config, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function restartLinuxNetworkService(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  serviceRestarted?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/restart-network`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function setLinuxInterfaceState(
  serverId: string,
  interfaceName: string,
  state: 'UP' | 'DOWN',
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  currentState?: 'UP' | 'DOWN';
  warning?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/interface-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interfaceName, state, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function configureLinuxServerProxy(
  serverId: string,
  proxyConfig: LinuxProxyConfig,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/proxy-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxyConfig, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function testLinuxServerProxy(
  serverId: string,
  proxyUrl: string,
  testTarget?: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  statusCode?: number;
  latencyMs?: number;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/proxy-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxyUrl, testTarget, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function changeLinuxServerSshPort(
  serverId: string,
  newPort: number,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/ssh-port`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPort, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxBlockDevices(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  devices?: LinuxBlockDevice[];
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/block-devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function mountLinuxFilesystem(
  serverId: string,
  payload: LinuxMountPayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/mount-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function unmountLinuxFilesystem(
  serverId: string,
  mountPoint: string,
  force?: boolean,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/unmount-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mountPoint, force, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

// ----------------------------------------------------
// Linux Storage & LVM Management API
// ----------------------------------------------------

export async function fetchLinuxStorageOverview(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  filesystems?: LinuxStorageOverview['filesystems'];
  physicalDisks?: LinuxStorageOverview['physicalDisks'];
  physicalVolumes?: LinuxStorageOverview['physicalVolumes'];
  volumeGroups?: LinuxStorageOverview['volumeGroups'];
  logicalVolumes?: LinuxStorageOverview['logicalVolumes'];
  summary?: LinuxStorageOverview['summary'];
  pvs?: LinuxStorageOverview['pvs'];
  vgs?: LinuxStorageOverview['vgs'];
  lvs?: LinuxStorageOverview['lvs'];
  availableDisks?: LinuxStorageOverview['availableDisks'];
  lvmInstalled?: boolean;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/storage-overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function formatAndMountLinuxDisk(
  serverId: string,
  payload: LinuxDiskFormatMountPayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  targetDevice?: string;
  mountPoint?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/disk-format-mount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function fetchLinuxLvmOverview(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  pvs?: LinuxLvmOverview['pvs'];
  vgs?: LinuxLvmOverview['vgs'];
  lvs?: LinuxLvmOverview['lvs'];
  availableDisks?: LinuxLvmOverview['availableDisks'];
  lvmInstalled?: boolean;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function rescanLinuxStorageDisks(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  scannedCount?: number;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-rescan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function extendLinuxLvVolume(
  serverId: string,
  payload: LinuxLvmExtendPayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function createLinuxLvmVolume(
  serverId: string,
  payload: LinuxLvmCreatePayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  lvPath?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

export async function shrinkLinuxLvVolume(
  serverId: string,
  payload: LinuxLvmShrinkPayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-shrink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

/**
 * Adds an unassigned raw disk or partition to an existing Volume Group (pvcreate + vgextend)
 */
export async function addDiskToLinuxVg(
  serverId: string,
  payload: { vgName: string; diskPath: string },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-add-disk-to-vg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

/**
 * Creates a new LVM Volume Group (vgcreate) on the server using one or more block devices
 */
export async function createLinuxVolumeGroup(
  serverId: string,
  payload: LinuxLvmCreateVgPayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  vgName?: string;
  vgSize?: string;
  vgFree?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-create-vg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

/**
 * Initializes a raw block device or disk as an LVM Physical Volume (pvcreate)
 */
export async function initializeLinuxPv(
  serverId: string,
  payload: { diskPath: string; force?: boolean },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  pvName?: string;
  pvSize?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/lvm-create-pv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));
  if (!res.ok && !data.error) {
    data.error = `HTTP Error ${res.status}`;
  }
  return data;
}

// ----------------------------------------------------
// Linux Sysconfig API (DNS, Fail2ban, Hostname, SSH, Time)
// ----------------------------------------------------

export async function fetchLinuxDnsConfig(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; config?: LinuxDnsConfig; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/dns`, {
    headers: { 'Content-Type': 'application/json' },
    ...(ephemeralPassword ? { method: 'POST', body: JSON.stringify({ password: ephemeralPassword }) } : {}),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function updateLinuxDnsConfig(
  serverId: string,
  config: LinuxDnsConfig,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string; testResult?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/dns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function fetchLinuxFail2ban(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; status?: LinuxFail2banStatus; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fail2ban`, {
    headers: { 'Content-Type': 'application/json' },
    ...(ephemeralPassword ? { method: 'POST', body: JSON.stringify({ password: ephemeralPassword }) } : {}),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function controlLinuxFail2ban(
  serverId: string,
  action: 'start' | 'stop' | 'restart' | 'reload' | 'enable',
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fail2ban/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function ipActionLinuxFail2ban(
  serverId: string,
  action: 'ban' | 'unban' | string,
  ip: string,
  jail?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fail2ban/ip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ip, jail, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function installLinuxFail2ban(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fail2ban/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function fetchLinuxHostname(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; info?: LinuxHostnameInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/hostname`, {
    headers: { 'Content-Type': 'application/json' },
    ...(ephemeralPassword ? { method: 'POST', body: JSON.stringify({ password: ephemeralPassword }) } : {}),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function updateLinuxHostname(
  serverId: string,
  hostname: string,
  updateHostsOrPassword?: boolean | string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const updateHosts = typeof updateHostsOrPassword === 'boolean' ? updateHostsOrPassword : false;
  const password = typeof updateHostsOrPassword === 'string' ? updateHostsOrPassword : ephemeralPassword;
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/hostname`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname, updateHosts, password }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function fetchLinuxHostsFile(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; entries?: LinuxHostEntry[]; rawContent?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/hosts`, {
    headers: { 'Content-Type': 'application/json' },
    ...(ephemeralPassword ? { method: 'POST', body: JSON.stringify({ password: ephemeralPassword }) } : {}),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function updateLinuxHostsFile(
  serverId: string,
  payload: any,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string; entries?: LinuxHostEntry[]; rawContent?: string }> {
  const body =
    typeof payload === 'object' && payload !== null
      ? { ...payload, password: ephemeralPassword }
      : { entries: payload, password: ephemeralPassword };

  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/hosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function fetchLinuxTcpWrappers(
  serverId: string,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  allowRules?: LinuxTcpWrapperRule[];
  denyRules?: LinuxTcpWrapperRule[];
  rawAllow?: string;
  rawDeny?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/tcp-wrappers`, {
    headers: { 'Content-Type': 'application/json' },
    ...(ephemeralPassword ? { method: 'POST', body: JSON.stringify({ password: ephemeralPassword }) } : {}),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function updateLinuxTcpWrappers(
  serverId: string,
  payload: {
    target: 'allow' | 'deny';
    action: 'add' | 'edit' | 'delete' | 'save-raw';
    rule?: Partial<LinuxTcpWrapperRule>;
    ruleId?: string;
    oldRuleId?: string;
    ruleIndex?: number;
    rawContent?: string;
    raw?: string;
  },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  allowRules?: LinuxTcpWrapperRule[];
  denyRules?: LinuxTcpWrapperRule[];
  rawAllow?: string;
  rawDeny?: string;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/tcp-wrappers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function fetchLinuxSshConfig(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; config?: LinuxSshConfig; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/ssh-config`, {
      headers: { 'Content-Type': 'application/json' },
      ...(ephemeralPassword ? { method: 'POST', body: JSON.stringify({ password: ephemeralPassword }) } : {}),
    });
    const data = await res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed or aborted' };
  }
}

export async function updateLinuxSshConfig(
  serverId: string,
  config: LinuxSshConfig,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/ssh-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, password: ephemeralPassword }),
    });
    const data = await res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed or aborted' };
  }
}

export async function fetchLinuxTimeInfo(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; timeInfo?: LinuxTimeInfo; info?: LinuxTimeInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/time`, {
    headers: { 'Content-Type': 'application/json' },
    ...(ephemeralPassword ? { method: 'POST', body: JSON.stringify({ password: ephemeralPassword }) } : {}),
  });
  const data = await res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
  if (data && data.timeInfo && !data.info) {
    data.info = data.timeInfo;
  }
  return data;
}

export async function updateLinuxTimezone(
  serverId: string,
  timezone: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/time/timezone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function updateLinuxNtp(
  serverId: string,
  enabled: boolean,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/time/ntp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function updateLinuxTime(
  serverId: string,
  datetime: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/time/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datetime, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

export async function fetchLinuxServerLogs(
  serverId: string,
  options: {
    category?: LinuxLogCategory;
    lines?: number;
    grepFilter?: string;
    customPath?: string;
    priority?: string;
    unit?: string;
    since?: string;
  } = {},
  ephemeralPassword?: string
): Promise<LinuxSystemLogsResponse> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: options.category || 'journal',
      lines: options.lines || 200,
      grepFilter: options.grepFilter || '',
      customPath: options.customPath || '',
      priority: options.priority || '',
      unit: options.unit || '',
      since: options.since || '',
      password: ephemeralPassword,
    }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    category: options.category || 'journal',
    filePath: '',
    logs: [],
    rawText: '',
    lineCount: 0,
    errorCount: 0,
    warnCount: 0,
    error: 'Failed to parse logs response from server',
  }));
  return data;
}

export async function truncateLinuxServerLog(
  serverId: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/logs/truncate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to parse response' }));
}

// ========================================================
// LINUX PACKAGE MANAGEMENT & SYSTEM UPGRADE API METHODS
// ========================================================

export async function fetchLinuxPackageOverview(
  serverId: string,
  ephemeralPassword?: string,
  refresh?: boolean
): Promise<{
  success: boolean;
  osInfo?: LinuxPackageUpdateOverview['osInfo'];
  totalInstalled?: number;
  upgradableCount?: number;
  securityCount?: number;
  packages?: LinuxPackageItem[];
  upgradablePackages?: LinuxPackageItem[];
  error?: string;
  requires_password?: boolean;
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword, refresh: !!refresh }),
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: 'Failed to parse package response from server',
  }));
  return data;
}

export async function updateAllLinuxPackages(
  serverId: string,
  distUpgrade: boolean = false,
  ephemeralPassword?: string
): Promise<{ success: boolean; job?: PackageUpdateJobStatus; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages/update-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distUpgrade, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to initiate bulk package upgrade' }));
}

export async function updateSelectedLinuxPackages(
  serverId: string,
  packages: Array<{ name: string; currentVersion?: string; targetVersion?: string }>,
  ephemeralPassword?: string
): Promise<{ success: boolean; job?: PackageUpdateJobStatus; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages/update-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packages, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to initiate selected packages upgrade' }));
}

export async function updateSingleLinuxPackage(
  serverId: string,
  packageName: string,
  currentVersion?: string,
  targetVersion?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; job?: PackageUpdateJobStatus; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages/update-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageName, currentVersion, targetVersion, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to initiate package update' }));
}

export async function refreshLinuxPackageRepo(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; job?: PackageUpdateJobStatus; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages/repo-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to refresh repository metadata' }));
}

export async function autoremoveLinuxPackages(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; job?: PackageUpdateJobStatus; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages/autoremove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to run autoremove cleanup' }));
}

export async function fetchPackageUpdateJobStatus(
  serverId: string,
  jobId: string
): Promise<{ success: boolean; job?: PackageUpdateJobStatus; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages/job/${encodeURIComponent(jobId)}`);
  return res.json().catch(() => ({ success: false, error: 'Failed to fetch update job progress' }));
}

export async function cancelPackageUpdateJob(
  serverId: string,
  jobId: string
): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/packages/job/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to cancel update job' }));
}

// ========================================================
// LINUX FIREWALL SERVICES (UFW, FIREWALLD, NFTABLES, IPTABLES)
// ========================================================

export async function fetchLinuxFirewallInfo(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; error?: string; requires_password?: boolean } & Partial<LinuxFirewallInfo>> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/firewall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, error: 'Failed to fetch firewall details' }));
}

export async function addLinuxFirewallRule(
  serverId: string,
  rule: LinuxFirewallRulePayload,
  backend: string,
  activeZone?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; info?: LinuxFirewallInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/firewall/rule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule, backend, activeZone, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, message: 'Network error', error: 'Failed to add firewall rule' }));
}

export async function deleteLinuxFirewallRule(
  serverId: string,
  rule: LinuxFirewallRule,
  activeZone?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; info?: LinuxFirewallInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/firewall/rule/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule, activeZone, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, message: 'Network error', error: 'Failed to delete firewall rule' }));
}

export async function updateLinuxFirewallRule(
  serverId: string,
  newRule: LinuxFirewallRulePayload,
  oldRule?: LinuxFirewallRule,
  backend?: string,
  activeZone?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; info?: LinuxFirewallInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/firewall/rule/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newRule, oldRule, backend, activeZone, password: ephemeralPassword }),
  });
  return res.json().catch(() => ({ success: false, message: 'Network error', error: 'Failed to update firewall rule' }));
}

// ============================================================================
// LINUX FILE EXPLORER CLIENT API
// ============================================================================

export async function fetchLinuxDirectory(
  serverId: string,
  path: string = '/',
  ephemeralPassword?: string
): Promise<{ success: boolean; result?: LinuxFsListResult; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(
      `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/list?path=${encodeURIComponent(path)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, password: ephemeralPassword }),
      }
    );
    const data = await res.json().catch(() => ({ success: false, error: 'Network parsing error' }));
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Connection failed' };
  }
}

export async function fetchLinuxQuickDirs(
  serverId: string
): Promise<{ success: boolean; quickDirs: LinuxQuickDir[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/quick-dirs`);
    return await res.json().catch(() => ({ success: false, quickDirs: [], error: 'Failed to parse quick dirs' }));
  } catch (err: any) {
    return { success: false, quickDirs: [], error: err?.message || 'Failed to fetch quick dirs' };
  }
}

export async function readLinuxRemoteFile(
  serverId: string,
  path: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; file?: LinuxFileContentResult; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(
      `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/read?path=${encodeURIComponent(path)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, password: ephemeralPassword }),
      }
    );
    return await res.json().catch(() => ({ success: false, error: 'Failed to parse file response' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to read file' };
  }
}

export async function writeLinuxRemoteFile(
  serverId: string,
  path: string,
  content: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; bytesWritten?: number; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content, password: ephemeralPassword }),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to write file' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to write file' };
  }
}

export async function createLinuxRemoteDirectory(
  serverId: string,
  path: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; path?: string; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, password: ephemeralPassword }),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to create directory' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create directory' };
  }
}

export async function createLinuxRemoteEmptyFile(
  serverId: string,
  path: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; path?: string; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/touch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, password: ephemeralPassword }),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to create file' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create file' };
  }
}

export async function renameLinuxRemoteItem(
  serverId: string,
  oldPath: string,
  newPath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; oldPath?: string; newPath?: string; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath, password: ephemeralPassword }),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to rename item' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to rename item' };
  }
}

export async function pasteLinuxItems(
  serverId: string,
  sourcePaths: string[],
  targetDirectory: string,
  operation: 'copy' | 'cut',
  ephemeralPassword?: string
): Promise<{ success: boolean; processedCount?: number; message?: string; error?: string; failures?: string[] }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePaths, targetDirectory, operation, password: ephemeralPassword }),
    });
    const data = await res.json().catch(() => ({ success: false, error: 'Failed to parse paste response' }));
    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to paste items' };
  }
}

export async function compressLinuxRemoteItems(
  serverId: string,
  options: {
    sourcePaths: string[];
    archiveName: string;
    destinationDir: string;
    format?: 'tar.gz' | 'zip' | 'tar.bz2' | 'tar.xz' | 'tar';
    compressionLevel?: number;
    deleteSource?: boolean;
    password?: string;
  }
): Promise<{ success: boolean; archivePath?: string; sizeHuman?: string; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/compress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to compress items' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to compress items' };
  }
}

export async function extractLinuxRemoteArchive(
  serverId: string,
  options: {
    archivePath: string;
    destinationDir: string;
    createSubfolder?: boolean;
    overwrite?: boolean;
    deleteArchiveAfterExtract?: boolean;
    password?: string;
  }
): Promise<{ success: boolean; extractedTo?: string; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to extract archive' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to extract archive' };
  }
}

export async function deleteLinuxRemoteItems(
  serverId: string,
  paths: string[],
  isRecursive: boolean = true,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  deletedCount?: number;
  message?: string;
  error?: string;
  failures?: string[];
  requires_password?: boolean;
}> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, isRecursive, password: ephemeralPassword }),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to delete item(s)' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete item(s)' };
  }
}

export async function deleteLinuxRemoteItem(
  serverId: string,
  path: string,
  isRecursive: boolean = true,
  ephemeralPassword?: string
): Promise<{ success: boolean; path?: string; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, isRecursive, password: ephemeralPassword }),
    });
    return await res.json().catch(() => ({ success: false, error: 'Failed to delete item' }));
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete item' };
  }
}

export async function downloadLinuxFiles(
  serverId: string,
  paths: string[],
  ephemeralPassword?: string,
  forceArchive: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, password: ephemeralPassword, archive: forceArchive }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => null);
      return { success: false, error: errorJson?.error || `Download failed with HTTP ${res.status}` };
    }

    const disposition = res.headers.get('Content-Disposition');
    let filename = paths.length === 1 ? paths[0].split('/').filter(Boolean).pop() || 'download' : 'archive.zip';
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      }
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to download file(s)' };
  }
}

export async function uploadLinuxFile(
  serverId: string,
  targetDirectory: string,
  file: File,
  ephemeralPassword?: string
): Promise<{ success: boolean; path?: string; bytesUploaded?: number; error?: string }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)) as unknown as number[]);
    }
    const fileBase64 = btoa(binary);

    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetDirectory,
        fileName: file.name,
        fileBase64,
        password: ephemeralPassword,
      }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse response from server',
    }));

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload file' };
  }
}

export async function fetchLinuxItemProperties(
  serverId: string,
  path: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; properties?: LinuxItemProperties; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(
      `${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/properties?path=${encodeURIComponent(path)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, password: ephemeralPassword }),
      }
    );

    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse properties response',
    }));

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch properties' };
  }
}

export async function updateLinuxItemAttributes(
  serverId: string,
  payload: {
    path: string;
    mode?: string;
    owner?: string;
    group?: string;
    recursive?: boolean;
    password?: string;
  }
): Promise<{ success: boolean; message?: string; error?: string; properties?: LinuxItemProperties }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/update-attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse response from server',
    }));

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update file attributes' };
  }
}

export async function fetchLinuxSystemUsersAndGroups(
  serverId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; users?: string[]; groups?: string[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/fs/users-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse users and groups response',
    }));

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch users and groups' };
  }
}

// ==========================================
// LINUX CRON JOBS API CLIENT METHODS
// ==========================================

export async function fetchLinuxCronOverview(
  serverId: string,
  ephemeralPassword?: string,
  targetUser?: string
): Promise<LinuxCronOverview & { success: boolean; error?: string; requires_password?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/cron-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ephemeralPassword, user: targetUser }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse cron response',
    }));

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return {
      success: false,
      jobs: [],
      systemUsers: [],
      cronDaemonStatus: { serviceName: 'cron', active: false, running: false, enabled: false },
      currentUser: 'root',
      error: err?.message || 'Failed to contact server',
    };
  }
}

export async function saveLinuxCronJob(
  serverId: string,
  payload: LinuxCronJobPayload,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/cron-jobs/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, password: ephemeralPassword }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      message: 'Failed to parse response',
    }));

    if (!res.ok && !data.error) {
      data.error = data.message || `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network request failed', error: err?.message };
  }
}

export async function toggleLinuxCronJob(
  serverId: string,
  payload: { user: string; schedule: string; command: string; enable: boolean },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/cron-jobs/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, password: ephemeralPassword }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      message: 'Failed to parse response',
    }));

    if (!res.ok && !data.error) {
      data.error = data.message || `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network request failed', error: err?.message };
  }
}

export async function deleteLinuxCronJob(
  serverId: string,
  payload: { user: string; schedule: string; command: string },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/cron-jobs/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, password: ephemeralPassword }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      message: 'Failed to parse response',
    }));

    if (!res.ok && !data.error) {
      data.error = data.message || `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network request failed', error: err?.message };
  }
}

export async function runLinuxCronJobNow(
  serverId: string,
  payload: { user: string; command: string },
  ephemeralPassword?: string
): Promise<{ success: boolean; result?: LinuxCronExecutionResult; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/cron-jobs/run-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, password: ephemeralPassword }),
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse execution response',
    }));

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to trigger cron execution' };
  }
}

// ========================================================
// PERSONAL PASSWORD VAULT API CLIENT HELPERS
// ========================================================

export function getVaultAuthHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('nettopology_auth_token_v1') ||
    sessionStorage.getItem('nettopology_auth_token_v1') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    '';

  let userId = '';
  let username = '';
  const rawUser =
    localStorage.getItem('nettopology_auth_user_v1') ||
    sessionStorage.getItem('nettopology_auth_user_v1');
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser);
      userId = parsed.id || '';
      username = parsed.username || '';
    } catch {}
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (userId) {
    headers['x-user-id'] = userId;
  }
  if (username) {
    headers['x-username'] = username;
  }
  return headers;
}

export interface SaveVaultSecretPayload {
  name: string;
  username?: string;
  password: string;
  category?: string;
  targetHost?: string;
  notes?: string;
  tags?: string[];
  strength?: string;
}

export async function saveSecretToVault(
  payload: SaveVaultSecretPayload
): Promise<{ success: boolean; item?: any; error?: string; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}/vault`, {
      method: 'POST',
      headers: getVaultAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse server response',
    }));

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}: Failed to store password in vault`;
    }
    return data;
  } catch (err: any) {
    console.error('[saveSecretToVault error]', err);
    return { success: false, error: err?.message || 'Failed to save secret to vault' };
  }
}

export async function fetchVaultItems(): Promise<{ success: boolean; items?: any[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/vault`, {
      headers: getVaultAuthHeaders(),
    });
    const data = await res.json().catch(() => ({
      success: false,
      error: 'Failed to parse response',
    }));
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch vault items' };
  }
}

// ----------------------------------------------------------------------------
// Host Server Services & Daemons API
// ----------------------------------------------------------------------------

export interface PanelServiceDto {
  id: string;
  name: string;
  name_fa: string;
  category: 'frontend' | 'backend' | 'database' | 'system';
  serviceName: string;
  description: string;
  description_fa: string;
  status: 'running' | 'stopped' | 'failed' | 'unknown';
  pids: number[];
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
  ports: number[];
  portsActive: boolean;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  canReload: boolean;
  lastChecked: string;
  logFile?: string;
  details?: string;
}

export interface PanelServerMetricsDto {
  hostname: string;
  platform: string;
  osRelease: string;
  kernelVersion: string;
  uptimeSeconds: number;
  cpuModel: string;
  cpuCores: number;
  cpuLoadPercent: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  usedMemoryMb: number;
  memoryUsagePercent: number;
  loadAverage: number[];
}

export async function fetchPanelServices(): Promise<{
  success: boolean;
  services: PanelServiceDto[];
  metrics: PanelServerMetricsDto;
  timestamp: string;
  error?: string;
}> {
  try {
    const token =
      localStorage.getItem('nettopology_auth_token_v1') ||
      sessionStorage.getItem('nettopology_auth_token_v1');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/panel/services`, { headers });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('[fetchPanelServices error]', err);
    return {
      success: false,
      services: [],
      metrics: {
        hostname: 'localhost',
        platform: 'linux',
        osRelease: '',
        kernelVersion: '',
        uptimeSeconds: 0,
        cpuModel: '',
        cpuCores: 1,
        cpuLoadPercent: 0,
        totalMemoryMb: 0,
        freeMemoryMb: 0,
        usedMemoryMb: 0,
        memoryUsagePercent: 0,
        loadAverage: [0, 0, 0],
      },
      timestamp: new Date().toISOString(),
      error: err?.message || 'Failed to fetch host services',
    };
  }
}

export async function executePanelServiceAction(
  serviceId: string,
  action: 'start' | 'stop' | 'restart' | 'reload'
): Promise<{
  success: boolean;
  message: string;
  output: string;
  error?: string;
}> {
  try {
    const token =
      localStorage.getItem('nettopology_auth_token_v1') ||
      sessionStorage.getItem('nettopology_auth_token_v1');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/panel/services/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ serviceId, action }),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('[executePanelServiceAction error]', err);
    return {
      success: false,
      message: err?.message || 'Failed to execute service action',
      output: err?.message || '',
      error: err?.message,
    };
  }
}

export async function fetchPanelServiceLogs(
  serviceId: string,
  lines = 80
): Promise<{
  success: boolean;
  serviceId: string;
  logs: string[];
  error?: string;
}> {
  try {
    const token =
      localStorage.getItem('nettopology_auth_token_v1') ||
      sessionStorage.getItem('nettopology_auth_token_v1');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(
      `${API_BASE}/panel/services/logs?serviceId=${encodeURIComponent(serviceId)}&lines=${lines}`,
      { headers }
    );
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('[fetchPanelServiceLogs error]', err);
    return {
      success: false,
      serviceId,
      logs: [`Error fetching logs: ${err?.message}`],
      error: err?.message,
    };
  }
}

// ==============================================================================
// Phase 1: Disaster Recovery (DR) Engine API Client
// ==============================================================================

export interface ExportDrBackupParams {
  scope?: string;
  sanitize?: boolean;
  encrypt?: boolean;
  passphrase?: string;
  format?: 'json' | 'sql';
  customNote?: string;
}

export async function exportDatabaseBackupApi(params: ExportDrBackupParams = {}): Promise<{
  success: boolean;
  filename?: string;
  metadata?: any;
  package?: any;
  sqlContent?: string;
  error?: string;
}> {
  const searchParams = new URLSearchParams();
  if (params.scope) searchParams.set('scope', params.scope);
  if (params.sanitize) searchParams.set('sanitize', 'true');
  if (params.encrypt) searchParams.set('encrypt', 'true');
  if (params.passphrase) searchParams.set('passphrase', params.passphrase);
  if (params.format) searchParams.set('format', params.format);
  if (params.customNote) searchParams.set('customNote', params.customNote);

  const res = await fetchWithRetry(`${API_BASE}/backup/export?${searchParams.toString()}`);
  if (params.format === 'sql') {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || `Export failed with status ${res.status}`);
    }
    const sqlContent = await res.text();
    return { success: true, sqlContent };
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Export failed with status ${res.status}`);
  }
  return data;
}

export async function restoreDatabaseBackupApi(payload: {
  package: any;
  passphrase?: string;
  mode?: 'overwrite' | 'merge';
  selectedScopes?: string[];
}): Promise<{
  success: boolean;
  mode: string;
  snapshotId: string;
  restoredCounts: Record<string, number>;
  durationMs: number;
  message: string;
  message_en: string;
  error?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Restore failed with status ${res.status}`);
  }
  return data;
}

export async function fetchDrSnapshotApi(): Promise<{
  success: boolean;
  hasSnapshot: boolean;
  snapshot?: any;
  message?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/snapshot`);
  return res.json();
}

export async function rollbackDrSnapshotApi(snapshotId?: string): Promise<{
  success: boolean;
  message: string;
  message_en: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Rollback failed');
  }
  return data;
}

export async function fetchDrStatusApi(): Promise<{
  success: boolean;
  engine: string;
  isPostgresReady: boolean;
  tablesCount: number;
  recordsCount: Record<string, number>;
  latestSnapshot: any;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/status`);
  return res.json();
}

// ==============================================================================
// Phase 2: Server Storage Archive & Automated Scheduler Client APIs
// ==============================================================================

export async function fetchServerArchiveBackupsApi(): Promise<{
  success: boolean;
  backups: any[];
  totalCount: number;
  timestamp: string;
  error?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/server-archive`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch server backup archive');
  }
  return data;
}

export function getServerArchiveDownloadUrl(fileId: string): string {
  return `${API_BASE}/backup/server-archive/${encodeURIComponent(fileId)}/download`;
}

export async function deleteServerArchiveBackupApi(fileId: string): Promise<{
  success: boolean;
  message: string;
  message_en: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/server-archive/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete backup from server archive');
  }
  return data;
}

export async function restoreServerArchiveBackupApi(
  fileId: string,
  options: { passphrase?: string; mode?: 'overwrite' | 'merge' } = {}
): Promise<{
  success: boolean;
  mode: string;
  snapshotId: string;
  restoredCounts: Record<string, number>;
  durationMs: number;
  message: string;
  message_en: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/server-archive/${encodeURIComponent(fileId)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to restore backup from server archive');
  }
  return data;
}

export async function createManualServerArchiveBackupApi(options: {
  scope?: string;
  sanitize?: boolean;
  encrypt?: boolean;
  passphrase?: string;
  customNote?: string;
} = {}): Promise<{
  success: boolean;
  filename: string;
  metadata: any;
  message: string;
  message_en: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/server-archive/create-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create server archive backup');
  }
  return data;
}

export async function fetchBackupSchedulesApi(): Promise<{
  success: boolean;
  jobs: any[];
  totalCount: number;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/schedules`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch backup schedules');
  }
  return data;
}

export async function createBackupScheduleApi(jobData: any): Promise<{
  success: boolean;
  job: any;
  message: string;
  message_en: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobData),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create backup schedule');
  }
  return data;
}

export async function updateBackupScheduleApi(id: string, jobData: any): Promise<{
  success: boolean;
  job: any;
  message: string;
  message_en: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/schedules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobData),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update backup schedule');
  }
  return data;
}

export async function deleteBackupScheduleApi(id: string): Promise<{
  success: boolean;
  message: string;
  message_en: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete backup schedule');
  }
  return data;
}

export async function runBackupScheduleNowApi(id: string): Promise<{
  success: boolean;
  backupFile: string;
  durationMs: number;
  message: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/backup/schedules/${encodeURIComponent(id)}/run-now`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to run backup schedule');
  }
  return data;
}

// ==============================================================================
// Outgoing Email (SMTP) Configuration APIs
// ==============================================================================

export async function fetchEmailConfigApi(): Promise<{
  success: boolean;
  config: EmailConfig;
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/email`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch email settings');
  }
  return data;
}

export async function saveEmailConfigApi(config: Partial<EmailConfig>): Promise<{
  success: boolean;
  config: EmailConfig;
  message?: string;
  message_fa?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to save email settings');
  }
  return data;
}

export async function testEmailConfigApi(payload: {
  config?: Partial<EmailConfig>;
  to: string;
  subject?: string;
  notes?: string;
}): Promise<EmailTestResult> {
  const res = await fetchWithRetry(`${API_BASE}/settings/email/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return data;
}

// ==============================================================================
// Automated Audit & Command Logs Scheduled Reporting APIs
// ==============================================================================

export async function fetchAuditReportConfigApi(): Promise<{
  success: boolean;
  config: AuditReportScheduleConfig;
  smtpConfigured: boolean;
  smtpFrom: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/config`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch audit report schedule configuration');
  }
  return data;
}

export async function saveAuditReportConfigApi(config: Partial<AuditReportScheduleConfig>): Promise<{
  success: boolean;
  config: AuditReportScheduleConfig;
  message?: string;
  message_fa?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to save audit report schedule configuration');
  }
  return data;
}

export async function previewAuditReportApi(payload: {
  config?: Partial<AuditReportScheduleConfig>;
  portalLogs?: any[];
  commandLogs?: any[];
  serverCommandLogs?: any[];
  isEn?: boolean;
}): Promise<AuditReportPreviewResult> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to generate audit report preview');
  }
  return data;
}

export async function sendAuditReportNowApi(payload: {
  config?: Partial<AuditReportScheduleConfig>;
  portalLogs?: any[];
  commandLogs?: any[];
  serverCommandLogs?: any[];
  isEn?: boolean;
}): Promise<AuditReportSendResult> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/send-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return data;
}

export async function getAuditEmailReportsListApi(): Promise<{
  success: boolean;
  reports: AuditReportScheduleConfig[];
  smtpConfigured: boolean;
  smtpFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/list`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch email reports list');
  }
  return data;
}

export async function saveAuditEmailReportApi(config: Partial<AuditReportScheduleConfig>): Promise<{
  success: boolean;
  report: AuditReportScheduleConfig;
  message?: string;
  message_fa?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to save email report');
  }
  return data;
}

export async function deleteAuditEmailReportApi(id: string): Promise<{
  success: boolean;
  message?: string;
  message_fa?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete email report');
  }
  return data;
}

export async function toggleAuditEmailReportApi(id: string, enabled: boolean): Promise<{
  success: boolean;
  report: AuditReportScheduleConfig;
}> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to toggle email report state');
  }
  return data;
}

export async function sendAuditEmailReportByIdNowApi(id: string, payload: {
  portalLogs?: any[];
  commandLogs?: any[];
  serverCommandLogs?: any[];
  isEn?: boolean;
}): Promise<AuditReportSendResult> {
  const res = await fetchWithRetry(`${API_BASE}/audit-reports/${encodeURIComponent(id)}/send-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return data;
}

// -------------------------------------------------------------
// Server Time & Regional API
// -------------------------------------------------------------

export async function fetchServerTimeApi(): Promise<ServerTimeInfo> {
  const res = await fetchWithRetry(`${API_BASE}/system/time`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch server time information');
  }
  return data;
}

export async function updateServerTimezoneApi(timezone: string): Promise<{
  success: boolean;
  timezone: string;
  serverTime: ServerTimeInfo;
  message?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/system/time/timezone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update server timezone');
  }
  return data;
}

export async function syncServerNtpApi(ntpServer?: string): Promise<{
  success: boolean;
  ntpServer: string;
  latencyMs: number;
  offsetMs?: number;
  message: string;
  message_fa: string;
  serverTime: ServerTimeInfo;
}> {
  const res = await fetchWithRetry(`${API_BASE}/system/time/sync-ntp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ntpServer }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to trigger NTP synchronization');
  }
  return data;
}

export async function setServerManualTimeApi(targetTime: string | number): Promise<{
  success: boolean;
  message: string;
  message_fa: string;
  serverTime: ServerTimeInfo;
}> {
  const res = await fetchWithRetry(`${API_BASE}/system/time/set-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetTime }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to adjust server time');
  }
  return data;
}

// ==============================================================================
// Incident Alerting & Telegram Notifications API Suite
// ==============================================================================

export async function fetchTelegramConfigApi(): Promise<{
  success: boolean;
  config: TelegramAlertConfig;
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/telegram`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch Telegram alerting settings');
  }
  return data;
}

export async function saveTelegramConfigApi(config: Partial<TelegramAlertConfig>): Promise<{
  success: boolean;
  config: TelegramAlertConfig;
  message?: string;
  message_fa?: string;
}> {
  const res = await fetchWithRetry(`${API_BASE}/settings/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to save Telegram alerting settings');
  }
  return data;
}

export async function testTelegramConfigApi(payload: {
  config?: Partial<TelegramAlertConfig>;
  botToken?: string;
  chatId?: string;
  proxyUrl?: string;
  bot_token?: string;
  chat_id?: string;
  proxy_url?: string;
}): Promise<TelegramTestResult> {
  const res = await fetchWithRetry(`${API_BASE}/settings/telegram/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return data;
}

// ==========================================
// Authoritative Database Audit Logs & Retention APIs (Phase 2 & 3)
// ==========================================

export async function fetchDeviceCommandLogsApi(options: {
  deviceId?: string;
  operatorUsername?: string;
  riskLevel?: string;
  channel?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ success: boolean; logs: any[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (options.deviceId) params.append('deviceId', options.deviceId);
  if (options.operatorUsername) params.append('operatorUsername', options.operatorUsername);
  if (options.riskLevel && options.riskLevel !== 'all') params.append('riskLevel', options.riskLevel);
  if (options.channel && options.channel !== 'all') params.append('channel', options.channel);
  if (options.search) params.append('search', options.search);
  if (options.limit) params.append('limit', String(options.limit));
  if (options.offset) params.append('offset', String(options.offset));

  const res = await fetchWithRetry(`${API_BASE}/audit-logs/devices?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function recordDeviceCommandLogApi(log: any): Promise<{ success: boolean; log: any }> {
  const res = await fetchWithRetry(`${API_BASE}/audit-logs/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(log),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function fetchPortalAuditLogsApi(options: {
  category?: string;
  severity?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ success: boolean; logs: any[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (options.category && options.category !== 'all') params.append('category', options.category);
  if (options.severity && options.severity !== 'all') params.append('severity', options.severity);
  if (options.status && options.status !== 'all') params.append('status', options.status);
  if (options.search) params.append('search', options.search);
  if (options.limit) params.append('limit', String(options.limit));
  if (options.offset) params.append('offset', String(options.offset));

  const res = await fetchWithRetry(`${API_BASE}/audit-logs/portal?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function recordPortalAuditLogApi(log: any): Promise<{ success: boolean; log: any }> {
  const res = await fetchWithRetry(`${API_BASE}/audit-logs/portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(log),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function fetchAuditStorageStatsApi(): Promise<{ success: boolean; stats: any }> {
  const res = await fetchWithRetry(`${API_BASE}/audit-logs/stats`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function fetchUserLoginReportsApi(options: {
  timeframe?: 'all' | '1h' | '24h' | '7d' | '30d';
  username?: string;
  outcome?: string;
  authMethod?: string;
  search?: string;
  limit?: number;
} = {}): Promise<any> {
  const params = new URLSearchParams();
  if (options.timeframe && options.timeframe !== 'all') params.append('timeframe', options.timeframe);
  if (options.username && options.username !== 'all') params.append('username', options.username);
  if (options.outcome && options.outcome !== 'all') params.append('outcome', options.outcome);
  if (options.authMethod && options.authMethod !== 'all') params.append('authMethod', options.authMethod);
  if (options.search) params.append('search', options.search);
  if (options.limit) params.append('limit', String(options.limit));

  const res = await fetchWithRetry(`${API_BASE}/audit-logs/logins?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `HTTP error ${res.status}`);
  }
  return data;
}

export async function fetchAuthBlocklistApi(options: {
  status?: 'active' | 'history' | 'all';
  targetType?: 'ip' | 'user' | 'all';
  search?: string;
} = {}): Promise<any> {
  const params = new URLSearchParams();
  if (options.status) params.append('status', options.status);
  if (options.targetType && options.targetType !== 'all') params.append('targetType', options.targetType);
  if (options.search) params.append('search', options.search);

  const qs = params.toString();
  const res = await fetchWithRetry(`${API_BASE}/security/blocklist${qs ? `?${qs}` : ''}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `HTTP error ${res.status}`);
  }
  return data;
}

export async function blockAuthTargetApi(payload: {
  targetType: 'ip' | 'user';
  targetValue: string;
  reason?: string;
  durationMinutes?: number | null;
  expiresAt?: string | null;
}): Promise<any> {
  const res = await fetchWithRetry(`${API_BASE}/security/blocklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `HTTP error ${res.status}`);
  }
  return data;
}

export async function unblockAuthTargetApi(
  id: string,
  unblockReason?: string
): Promise<any> {
  const res = await fetchWithRetry(`${API_BASE}/security/blocklist/${encodeURIComponent(id)}/unblock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unblockReason: unblockReason || '' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `HTTP error ${res.status}`);
  }
  return data;
}

export async function fetchLogRetentionConfigApi(): Promise<{ success: boolean; config: any; stats?: any }> {
  const res = await fetchWithRetry(`${API_BASE}/settings/log-retention`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function saveLogRetentionConfigApi(config: any): Promise<{ success: boolean; config: any }> {
  const res = await fetchWithRetry(`${API_BASE}/settings/log-retention`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function purgeLogRetentionNowApi(options: { retentionDays?: number; backupBeforePurge?: boolean } = {}): Promise<{ success: boolean; result: any }> {
  const res = await fetchWithRetry(`${API_BASE}/settings/log-retention/purge-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

// ==============================================================================
// Licenses and Contracts API Client
// ==============================================================================

export async function fetchLicensesApi(): Promise<{
  success: boolean;
  licenses: LicenseItem[];
  total: number;
  summary: { total: number; active: number; expiring_soon: number; expired: number; renewed: number };
}> {
  const res = await fetchWithRetry(`${API_BASE}/licenses`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Failed to fetch licenses (${res.status})`);
  }
  return await res.json();
}

export async function createLicenseApi(data: Partial<LicenseItem>): Promise<{ success: boolean; license: LicenseItem }> {
  const res = await fetchWithRetry(`${API_BASE}/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to create license (${res.status})`);
  }
  return json;
}

export async function updateLicenseApi(id: string, data: Partial<LicenseItem>): Promise<{ success: boolean; license: LicenseItem }> {
  const res = await fetchWithRetry(`${API_BASE}/licenses/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to update license (${res.status})`);
  }
  return json;
}

export async function deleteLicenseApi(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithRetry(`${API_BASE}/licenses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to delete license (${res.status})`);
  }
  return json;
}

export async function fetchContractsApi(): Promise<{
  success: boolean;
  contracts: ContractItem[];
  total: number;
  summary: { total: number; active: number; expiring_soon: number; expired: number; in_renewal: number };
}> {
  const res = await fetchWithRetry(`${API_BASE}/contracts`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Failed to fetch contracts (${res.status})`);
  }
  return await res.json();
}

export async function createContractApi(data: Partial<ContractItem>): Promise<{ success: boolean; contract: ContractItem }> {
  const res = await fetchWithRetry(`${API_BASE}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to create contract (${res.status})`);
  }
  return json;
}

export async function updateContractApi(id: string, data: Partial<ContractItem>): Promise<{ success: boolean; contract: ContractItem }> {
  const res = await fetchWithRetry(`${API_BASE}/contracts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to update contract (${res.status})`);
  }
  return json;
}

export async function deleteContractApi(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithRetry(`${API_BASE}/contracts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to delete contract (${res.status})`);
  }
  return json;
}

export async function renewLicenseApi(
  id: string,
  data: Partial<LicenseItem>
): Promise<{ success: boolean; license: LicenseItem; previousLicense: LicenseItem }> {
  const res = await fetchWithRetry(`${API_BASE}/licenses/${encodeURIComponent(id)}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to renew license (${res.status})`);
  }
  return json;
}

export async function fetchLicenseHistoryApi(
  id: string
): Promise<{ success: boolean; history: LicenseItem[]; currentId: string; chainLength: number }> {
  const res = await fetchWithRetry(`${API_BASE}/licenses/${encodeURIComponent(id)}/history`);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to fetch license history (${res.status})`);
  }
  return json;
}

export async function renewContractApi(
  id: string,
  data: Partial<ContractItem>
): Promise<{ success: boolean; contract: ContractItem; previousContract: ContractItem }> {
  const res = await fetchWithRetry(`${API_BASE}/contracts/${encodeURIComponent(id)}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to renew contract (${res.status})`);
  }
  return json;
}

export async function fetchContractHistoryApi(
  id: string
): Promise<{ success: boolean; history: ContractItem[]; currentId: string; chainLength: number }> {
  const res = await fetchWithRetry(`${API_BASE}/contracts/${encodeURIComponent(id)}/history`);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to fetch contract history (${res.status})`);
  }
  return json;
}

export async function uploadContractAttachmentApi(payload: {
  fileName: string;
  fileType: string;
  dataBase64: string;
}): Promise<{ success: boolean; attachment: AttachmentFile }> {
  const res = await fetchWithRetry(`${API_BASE}/licenses-contracts/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to upload attachment (${res.status})`);
  }
  return json;
}

export async function testLicenseContractAlertApi(payload: {
  type: 'license' | 'contract';
  id: string;
  targetEmail?: string;
}): Promise<{ success: boolean; message: string; messageId?: string }> {
  const res = await fetchWithRetry(`${API_BASE}/licenses-contracts/test-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to send test alert (${res.status})`);
  }
  return json;
}

export async function runLicenseContractCronNowApi(): Promise<{
  success: boolean;
  checkedLicenses: number;
  checkedContracts: number;
  alertsSent: number;
  errors: string[];
}> {
  const res = await fetchWithRetry(`${API_BASE}/licenses-contracts/run-cron-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to execute license/contract cron (${res.status})`);
  }
  return json;
}

// =========================================================================
// SSL / TLS Certificate Lifecycle & Expiration Monitoring API
// =========================================================================

export async function fetchSslCertificatesApi(): Promise<{
  success: boolean;
  certificates: SslCertificateItem[];
  total: number;
  summary: SslCertificatesSummary;
}> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates`);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to load SSL certificates (${res.status})`);
  }
  return json;
}

export async function probeSslCertificateApi(payload: {
  sourceType: 'domain' | 'manual_pem';
  domain?: string;
  port?: number;
  sniHost?: string;
  pemCertificate?: string;
}): Promise<SslCertificateProbeResult> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!res.ok && !json.error) {
    throw new Error(`SSL probe failed (${res.status})`);
  }
  return json;
}

export async function createSslCertificateApi(
  payload: Partial<SslCertificateItem> & { runInitialCheck?: boolean }
): Promise<{ success: boolean; certificate: SslCertificateItem }> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to create SSL certificate (${res.status})`);
  }
  return json;
}

export async function updateSslCertificateApi(
  id: string,
  payload: Partial<SslCertificateItem> & { recheckAfterSave?: boolean }
): Promise<{ success: boolean; certificate: SslCertificateItem }> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to update SSL certificate (${res.status})`);
  }
  return json;
}

export async function deleteSslCertificateApi(id: string): Promise<{ success: boolean; deletedId: string }> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to delete SSL certificate (${res.status})`);
  }
  return json;
}

export async function checkSslCertificateNowApi(
  id: string
): Promise<{ success: boolean; certificate: SslCertificateItem }> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates/${encodeURIComponent(id)}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to check SSL certificate (${res.status})`);
  }
  return json;
}

export async function checkAllSslCertificatesNowApi(): Promise<{
  success: boolean;
  checkedCount: number;
  failedCount: number;
  expiringOrExpired: number;
  certificates: SslCertificateItem[];
  summary: SslCertificatesSummary;
}> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates/check-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to run bulk SSL check (${res.status})`);
  }
  return json;
}

export async function testSslCertificateAlertApi(
  id: string,
  targetEmail?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const res = await fetchWithRetry(`${API_BASE}/ssl-certificates/${encodeURIComponent(id)}/test-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetEmail }),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Failed to send SSL test alert (${res.status})`);
  }
  return json;
}



