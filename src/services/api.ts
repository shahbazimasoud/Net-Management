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
  RemoteServerTagSummary,
  LinuxServerLiveMetrics,
  LinuxSystemService,
  LinuxSystemUser,
  LinuxSystemGroup,
  LinuxLoggedInUser,
  LinuxNetworkInterfaceDetail,
  LinuxSystemDetailedInfo,
  LinuxProxyConfig,
  LinuxBlockDevice,
  LinuxMountPayload,
  LinuxLvmOverview,
  LinuxLvmExtendPayload,
  LinuxLvmCreatePayload,
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
} from '../types';

const API_BASE = '/api';

/**
 * Resilient fetch wrapper with automatic backoff for 503 (backend starting up) and network blips
 */
async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
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

export async function fetchHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchDevices(): Promise<{ devices: Device[]; total: number; online_count: number; offline_count: number }> {
  const res = await fetchWithRetry(`${API_BASE}/devices`);
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function addDevice(device: Partial<Device>): Promise<{ device: Device; message: string }> {
  const res = await fetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device),
  });
  if (!res.ok) throw new Error('Failed to add device');
  return res.json();
}

export async function updateDevice(id: string, updates: Partial<Device>): Promise<{ device: Device; message: string }> {
  const res = await fetch(`${API_BASE}/devices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update device');
  return res.json();
}

export async function deleteDevice(id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/devices/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete device');
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
  const res = await fetch(`${API_BASE}/devices/${deviceId}/operations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userRole ? { 'X-User-Role': userRole } : {}),
    },
    body: JSON.stringify({ operation, interface: iface, params, user_role: userRole }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Operation failed on device');
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to execute command on device');
  }
  return res.json();
}

export async function fetchDevicePorts(deviceId: string): Promise<{
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
  const res = await fetch(`${API_BASE}/devices/${deviceId}/ports`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to fetch ports');
  }
  return res.json();
}

export async function syncDevicePorts(deviceId: string): Promise<{
  device: Device;
  ports: SwitchPort[];
  active_count: number;
  inactive_count: number;
  admin_disabled_count: number;
  is_live: boolean;
  sync_source: string;
  error?: string;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/ports/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    return fetchDevicePorts(deviceId) as any;
  }
  return res.json();
}

export async function updateSwitchPort(
  deviceId: string,
  portId: string,
  updates: Partial<SwitchPort>
): Promise<{ port: SwitchPort; message: string; success?: boolean; cli_output?: string }> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/ports/${encodeURIComponent(portId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || 'Failed to update port');
  }
  return res.json();
}

export async function batchUpdateSwitchPorts(
  deviceId: string,
  portIds: string[],
  updates: Partial<SwitchPort>
): Promise<{ success: boolean; updatedCount: number; message: string; ports: SwitchPort[] }> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/ports/batch`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port_ids: portIds, updates }),
  });
  if (!res.ok) throw new Error('Failed to batch update ports');
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
}): Promise<{
  success: boolean;
  message: string;
  message_en?: string;
  message_fa?: string;
  latency_ms?: number;
  banner?: string;
  protocol?: string;
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
  }
): string {
  const loc = window.location;
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  query.set('deviceId', deviceId);
  if (protocol) query.set('protocol', protocol);
  if (role) query.set('role', role);
  if (deviceInfo) {
    const h = deviceInfo.ssh_host || deviceInfo.ip;
    if (h) query.set('host', h);
    if (deviceInfo.ssh_port) query.set('port', String(deviceInfo.ssh_port));
    if (deviceInfo.ssh_username) query.set('username', deviceInfo.ssh_username);
    const pass = deviceInfo.ssh_password || deviceInfo.password;
    if (pass) query.set('password', pass);
    if (deviceInfo.enable_password) query.set('enable_password', deviceInfo.enable_password);
    if (deviceInfo.platform) query.set('platform', deviceInfo.platform);
  }
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

export async function writeMemory(deviceId: string): Promise<{ success: boolean; device: Device; message: string }> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/write-memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to write memory');
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
  if (!res.ok) throw new Error('Failed to run CDP/LLDP scan');
  return res.json();
}

export async function pingAllDevices(): Promise<{ message: string; results: any[] }> {
  const res = await fetch(`${API_BASE}/ping-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to ping devices');
  return res.json();
}

export async function pingDevice(id: string): Promise<{ device: Device; ping_result: any }> {
  const res = await fetch(`${API_BASE}/ping/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to ping device');
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
  if (!res.ok) throw new Error('Failed to create template');
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
  if (!res.ok) throw new Error('Failed to update template');
  return res.json();
}

export async function deleteTemplate(id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete template');
  return res.json();
}

export async function applyTemplateToDevice(params: {
  device_id: string;
  template_id: string;
  resolved_variables: Record<string, string | number>;
}): Promise<TemplateApplyResult> {
  const res = await fetch(`${API_BASE}/templates/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to apply template to device');
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
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'خطا در اتصال به تجهیز و استخراج کانفیگ');
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
  const res = await fetch(`${API_BASE}/active-directory`);
  if (!res.ok) throw new Error('Failed to fetch active directory config');
  return res.json();
}

export async function saveActiveDirectoryConfigApi(config: ActiveDirectoryConfig): Promise<{ success: boolean; config: ActiveDirectoryConfig }> {
  const res = await fetch(`${API_BASE}/active-directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error('Failed to save active directory config');
  return res.json();
}

export async function testActiveDirectoryConnectionApi(config: ActiveDirectoryConfig): Promise<{
  success: boolean;
  latency_ms: number;
  message: string;
  serverBanner: string;
  logs: string[];
}> {
  const res = await fetch(`${API_BASE}/active-directory/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error('Active directory test probe failed');
  return res.json();
}

export async function fetchAccessPolicies(): Promise<{ policies: AccessPolicy[]; total: number }> {
  const res = await fetch(`${API_BASE}/access-policies`);
  if (!res.ok) throw new Error('Failed to fetch access policies');
  return res.json();
}

export async function saveAccessPoliciesApi(policies: AccessPolicy[]): Promise<{ success: boolean; policies: AccessPolicy[] }> {
  const res = await fetch(`${API_BASE}/access-policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policies }),
  });
  if (!res.ok) throw new Error('Failed to save access policies');
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

export interface CiscoSystemResourcesResponse {
  success: boolean;
  is_live: boolean;
  connected?: boolean;
  device_id?: string;
  host?: string;
  timestamp?: string;
  warning?: string;
  error?: string;
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
  credentials?: { host?: string; username?: string; password?: string }
): Promise<CiscoSystemResourcesResponse> {
  const options: RequestInit = credentials
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }
    : {
        method: 'GET',
      };

  const res = await fetch(`${API_BASE}/devices/${deviceId}/cisco-resources`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch Cisco system resources' }));
    throw new Error(err.error || err.warning || err.message || 'Failed to fetch Cisco system resources');
  }
  return res.json();
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
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch remote servers' }));
    throw new Error(err.error || 'Failed to fetch remote servers');
  }
  return res.json();
}

export async function fetchRemoteServerTags(): Promise<{ success: boolean; tags: RemoteServerTagSummary[] }> {
  const res = await fetch(`${API_BASE}/remote-servers/tags`);
  if (!res.ok) {
    throw new Error('Failed to fetch remote server tags');
  }
  return res.json();
}

export async function fetchRemoteServerById(id: string): Promise<{ success: boolean; server: RemoteServer }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error('Server not found');
  }
  return res.json();
}

export async function createRemoteServer(server: Partial<RemoteServer>): Promise<{ success: boolean; server: RemoteServer }> {
  const res = await fetch(`${API_BASE}/remote-servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create server' }));
    throw new Error(err.error || 'Failed to create server');
  }
  return res.json();
}

export async function updateRemoteServer(
  id: string,
  server: Partial<RemoteServer>
): Promise<{ success: boolean; server: RemoteServer }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update server' }));
    throw new Error(err.error || 'Failed to update server');
  }
  return res.json();
}

export async function deleteRemoteServer(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete server');
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
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(id)}/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  }
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
  action: 'start' | 'stop' | 'restart' | 'enable' | 'disable',
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

export async function updateLinuxUserPassword(
  serverId: string,
  username: string,
  password: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/users/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, ephemeralPassword }),
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
}> {
  const res = await fetch(`${API_BASE}/remote-servers/${encodeURIComponent(serverId)}/send-message`, {
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

export async function configureLinuxServerNetwork(
  serverId: string,
  interfaceName: string,
  config: {
    state?: 'UP' | 'DOWN';
    ipv4?: string;
    cidr?: number;
    gateway?: string;
    mtu?: number;
  },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
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
// Linux LVM (Logical Volume Management) API
// ----------------------------------------------------

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




