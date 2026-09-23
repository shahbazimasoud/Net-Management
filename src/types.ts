export type DeviceType = 'switch' | 'router' | 'access_point' | 'firewall';

export type DevicePlatform =
  | 'cisco_ios_xe'
  | 'cisco_ios'
  | 'mikrotik_routeros'
  | 'generic_linux';

export type ConnectionMode = 'ssh' | 'simulator';

export interface DeviceConnection {
  protocol: 'ssh' | 'telnet';
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key?: string;
  connection_timeout?: number;
}

export interface PlatformCapabilities {
  vlan: boolean;
  interface_enable_disable: boolean;
  port_security: boolean;
  switchport_mode: boolean;
  trunk: boolean;
  save_config: boolean;
  interface_description: boolean;
  speed_duplex: boolean;
  poe: boolean;
  lldp_cdp: boolean;
}

export interface CommandGuideItem {
  cmd: string;
  desc: string;
  descEn?: string;
  category: 'show' | 'config' | 'action';
  mode: string;
}

export interface DevicePlatformInfo {
  platform: DevicePlatform;
  platform_name: string;
  capabilities: PlatformCapabilities;
  command_guide: CommandGuideItem[];
}

export function isMikroTikDevice(device?: Partial<Device> | null): boolean {
  if (!device) return false;
  if (device.platform === 'mikrotik_routeros') return true;
  const m = (device.model || '').toLowerCase();
  const n = (device.name || '').toLowerCase();
  const f = (device.firmware || '').toLowerCase();
  return (
    m.includes('mikrotik') ||
    m.includes('routerboard') ||
    m.includes('crs') ||
    m.includes('ccr') ||
    m.includes('hex') ||
    m.includes('hap') ||
    m.includes('rb') ||
    n.includes('mikrotik') ||
    n.includes('routerboard') ||
    f.includes('routeros')
  );
}

export function isGenericLinuxDevice(device?: Partial<Device> | null): boolean {
  if (!device) return false;
  return device.platform === 'generic_linux';
}

export interface Device {
  id: string;
  name: string;
  ip: string;
  type: DeviceType;
  role: string;
  model: string;
  platform?: DevicePlatform;
  connection_mode?: ConnectionMode;
  connection_protocol?: 'ssh' | 'telnet';
  connection?: DeviceConnection;
  mac: string;
  building: string;
  floor: string;
  unit: string;
  rack?: string;
  is_online: boolean;
  latency_ms?: number | null;
  packet_loss?: number;
  uptime?: string;
  cdp_enabled: boolean;
  lldp_enabled: boolean;
  snmp_community?: string;
  firmware?: string;
  last_seen?: string;
  total_ports: number;
  has_unsaved_changes?: boolean;
  last_modified_time?: string;
  last_write_memory_time?: string;
  pending_changes?: Array<{
    port_id?: string;
    type?: string;
    description?: string;
    command?: string;
    timestamp?: string;
  }>;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  enable_password?: string;
  ssh_status?: 'connected' | 'authenticated' | 'disconnected' | 'failed';
  ssh_connected?: boolean;
  power_supplies?: number;
  power_watts?: number;
  serial_number?: string;
  vendor?: string;
  master_session_id?: string;
  detected_ports?: SwitchPort[];
  web_configs?: DeviceWebConfig[];
  winbox_port?: number;
}

export interface DeviceWebConfig {
  id?: string;
  title: string;
  url: string;
}

export interface SwitchPort {
  id?: string;
  port?: string;
  port_id: string;
  name: string;
  mac_address?: string;
  status: 'up' | 'down';
  admin_status: 'enabled' | 'disabled';
  mode: 'trunk' | 'access';
  vlan: number;
  allowed_vlans: string;
  speed: string;
  duplex: string;
  connected_device: string;
  connected_type?: 'Switch' | 'Router' | 'Access Point' | 'Server' | 'Workstation' | 'Printer' | 'VoIP Phone' | 'Host' | 'None';
  poe_status?: 'delivering' | 'off' | 'disabled' | 'n/a';
  poe_power?: number;
  description?: string;
  // Cisco Port Security
  port_security_enabled?: boolean;
  port_security_max_mac?: number;
  port_security_mode?: 'sticky' | 'configured' | 'dynamic';
  port_security_configured_mac?: string;
  port_security_violation?: 'shutdown' | 'restrict' | 'protect';
  port_security_status?: 'secure-up' | 'secure-down' | 'secure-shutdown' | 'disabled';
  port_security_learned_macs?: string[];
}

export interface CdpLldpNeighbor {
  local_device_id: string;
  local_port: string;
  neighbor_name: string;
  neighbor_ip: string;
  neighbor_port: string;
  neighbor_model: string;
  protocol: 'CDP' | 'LLDP';
  capabilities: string;
  vlan: number;
  holdtime: number;
  timestamp?: string;
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  source_port: string;
  target_port: string;
  type: 'trunk' | 'access';
  vlan?: number;
  speed?: string;
  protocol?: 'CDP' | 'LLDP';
  status: 'active' | 'down';
}

export interface CustomTopologyLink {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourcePort: string;
  targetPort: string;
  sourceIp?: string;
  targetIp?: string;
  sourceMode: 'trunk' | 'access';
  targetMode: 'trunk' | 'access';
  sourceVlan?: number;
  targetVlan?: number;
  speed?: string;
  cableType?: 'copper' | 'fiber' | 'serial' | 'direct';
  notes?: string;
  status: 'active' | 'down' | 'testing';
}

export type RackUnitSize = 12 | 16 | 21 | 24 | 28 | 32 | 36 | 40 | 42 | 44 | 48 | number;
export type RackDepth = 60 | 80 | 100 | 120;
export type RackViewMode = 'front' | 'rear';

export type NetworkPortType =
  | '1GbE RJ45'
  | '2.5GbE RJ45'
  | '10GbE RJ45'
  | '1GbE SFP'
  | '10G SFP+'
  | '25G SFP28'
  | '40G QSFP+'
  | '100G QSFP28'
  | '8G FC'
  | '16G FC'
  | '32G FC';

export interface NetworkCardConfig {
  id: string;
  name: string;
  portCount: number;
  portType: NetworkPortType;
  slot?: string;
}

export type HardwareCategory =
  | 'server_rack'
  | 'telecom_tower'
  | 'hpe_server'
  | 'asus_server'
  | 'cisco_server'
  | 'patch_panel'
  | 'cable_management'
  | 'cisco_switch'
  | 'cisco_router'
  | 'hpe_storage'
  | 'emc_storage'
  | 'qnap_storage'
  | 'rackmount_case'
  | 'mikrotik_router'
  | 'firewall_fortigate'
  | 'firewall_sophos'
  | 'pdu'
  | 'ups_rackmount'
  | 'kvm_console'
  | 'fan_unit'
  | 'blank_panel'
  | 'rack_shelf'
  | 'fiber_odf'
  | 'wireless_radio'
  | 'dish_antenna'
  | 'telecom_tower';

export type TowerType = 'guyed_g35' | 'guyed_g45' | 'self_supporting_3leg' | 'self_supporting_4leg' | 'monopole';

export interface MountedTowerDevice {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: 'wireless_radio' | 'dish_antenna';
  heightMeters: number; // Elevation height on tower, e.g. 36, 30, 24, 18, 12, 6
  azimuthDegrees?: number; // Compass heading in degrees 0° - 360°
  azimuthLabel?: string; // e.g. "North 0°", "East 90°", "South 180°", "West 270°"
  frequency?: string; // e.g. "5 GHz", "60 GHz", "24 GHz", "11 GHz"
  ip?: string;
  deviceId?: string;
  isOnline?: boolean;
  targetLink?: string; // e.g. "PTP to Central Branch", "Factory CCTV Link"
  powerWatts?: number;
  notes?: string;
}

export interface CustomTopologyTower {
  id: string;
  name: string;
  location?: string;
  type: TowerType;
  heightMeters: number; // e.g. 18, 24, 30, 36, 42, 48, 60
  x: number;
  y: number;
  devices: MountedTowerDevice[];
  color?: string;
}

export interface MountedHardwareDevice {
  id: string;
  name: string;
  label?: string;
  category: HardwareCategory;
  brand: string;
  model: string;
  generation?: string;
  heightU: number;
  startU: number; // 1-indexed bottom U position
  networkCards: NetworkCardConfig[];
  ip?: string;
  serialNumber?: string;
  powerWatts?: number;
  powerSupplyCount?: number;
  pduOutletsCount?: number;
  pduOutletType?: string;
  pduAmperage?: number;
  notes?: string;
}

export interface CustomTopologyRack {
  id: string;
  name: string;
  units: RackUnitSize;
  depth: RackDepth;
  viewMode: RackViewMode;
  x: number;
  y: number;
  devices: MountedHardwareDevice[];
  color?: string;
  widthPx?: number;
}

export type StickyNoteColor = 'yellow' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';

export interface CustomTopologyStickyNote {
  id: string;
  x: number;
  y: number;
  width?: number;
  title?: string;
  content: string;
  color: StickyNoteColor;
  linkedDeviceId?: string;
  createdAt: string;
  updatedAt: string;
  viewMode?: DeviceCanvasDisplayMode;
}

export type DeviceCanvasDisplayMode = 'card' | 'physical';

export type MapVisibility = 'public' | 'private' | 'restricted';

export interface CustomTopologyMap {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  nodes?: any[];
  devicePositions: Record<string, { x: number; y: number }>;
  physicalPositions?: Record<string, { x: number; y: number }>;
  deviceIds: string[];
  links: CustomTopologyLink[];
  racks?: CustomTopologyRack[];
  towers?: CustomTopologyTower[];
  stickyNotes?: CustomTopologyStickyNote[];
  deviceDisplayModes?: Record<string, DeviceCanvasDisplayMode>;
  visibility?: MapVisibility;
  ownerId?: string;
  ownerName?: string;
  allowedUsers?: string[];
}

export interface TopologyNode extends Device {}

export interface TopologyData {
  nodes: TopologyNode[];
  devices?: Device[];
  links: TopologyLink[];
  buildings: string[];
  floors: string[];
  summary: {
    total_nodes: number;
    total_links: number;
    core_switches: number;
    access_switches: number;
    routers: number;
    access_points: number;
  };
}

export interface VlanInfo {
  id: number;
  name: string;
  subnet?: string;
  color?: string;
  status?: string;
  ports_count?: number;
}

export type ThemeType = 'obsidian' | 'emerald' | 'cobalt' | 'rose' | 'amber' | 'light';

export type TemplateVendor = 'cisco' | 'mikrotik' | 'generic';
export type TemplateTargetType = 'switch' | 'router' | 'access_point' | 'all';

export interface TemplateVariable {
  name: string;
  label: string;
  description: string;
  default_value?: string;
  required: boolean;
  type: 'ip' | 'subnet' | 'gateway' | 'text' | 'number' | 'vlan' | 'password';
}

export interface ConfigTemplate {
  id: string;
  name: string;
  vendor: TemplateVendor;
  target_type: TemplateTargetType;
  target_platform?: string;
  category?: string;
  role: string;
  description: string;
  default_cli_mode?: string;
  commands: string;
  variables: TemplateVariable[];
  author?: string;
  created_at?: string;
  updated_at?: string;
  is_builtin?: boolean;
}

export interface TemplateExecutionLog {
  timestamp: string;
  command: string;
  prompt: string;
  output: string;
  status: 'ok' | 'info' | 'warn' | 'error';
}

export interface TemplateApplyResult {
  success: boolean;
  message: string;
  device: Device;
  rendered_script: string;
  logs: TemplateExecutionLog[];
}

export interface DeviceConfigExtractOptions {
  auto_parameterize?: boolean;
  sanitize_secrets?: boolean;
  strip_ephemeral?: boolean;
  mikrotik_compact?: boolean;
}

export interface DeviceConfigExtractRequest {
  device_id?: string;
  ip: string;
  port?: number;
  protocol?: 'ssh' | 'telnet';
  vendor: TemplateVendor;
  target_type: TemplateTargetType;
  username?: string;
  password?: string;
  enable_password?: string;
  options?: DeviceConfigExtractOptions;
}

export interface DeviceConfigExtractResult {
  success: boolean;
  message?: string;
  raw_config: string;
  parameterized_commands: string;
  detected_variables: TemplateVariable[];
  detected_device_name: string;
  suggested_template_name: string;
  vendor: TemplateVendor;
  target_type: TemplateTargetType;
  role: string;
  description: string;
  logs: string[];
}

// ==========================================
// Settings: Device Grouping & Tagging
// ==========================================
export type GroupColor = 'amber' | 'indigo' | 'emerald' | 'cyan' | 'rose' | 'purple' | 'blue' | 'slate';

export interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  color: GroupColor;
  icon?: string;
  deviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Settings: Active Directory / LDAP Integration
// ==========================================
export interface ADSecurityGroup {
  dn: string;
  cn: string;
  description: string;
  memberCount: number;
}

export interface ADUser {
  dn: string;
  samAccountName: string;
  displayName: string;
  email: string;
  department: string;
  title: string;
  groups: string[];
  enabled: boolean;
}

export interface ActiveDirectoryConfig {
  enabled: boolean;
  server: string;
  port: number;
  useSsl: boolean;
  domain: string;
  baseDn: string;
  bindUser: string;
  bindPassword?: string;
  userSearchBase: string;
  groupSearchBase: string;
  lastSyncStatus: 'idle' | 'testing' | 'success' | 'failed';
  lastSyncMessage?: string;
  lastSyncTime?: string | null;
  syncedGroups: ADSecurityGroup[];
  syncedUsers: ADUser[];
}

export interface ADTestResult {
  success: boolean;
  latency_ms: number;
  message: string;
  serverBanner?: string;
  sslValid?: boolean;
  bindSuccess?: boolean;
  logs: string[];
}

// ==========================================
// Settings: Role-Based Access Control (RBAC) & Local Identity
// ==========================================
export interface LocalGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  memberUserIds: string[];
  createdAt: string;
  updatedAt: string;
  isBuiltin?: boolean;
}

export interface LocalUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  status: 'active' | 'disabled';
  role?: string;
  groupIds?: string[];
  passwordHash?: string;
  createdAt?: string;
  lastLogin?: string;
  isBuiltin?: boolean;
}

export interface AccessPolicy {
  id: string;
  name: string;
  description: string;
  isBuiltin?: boolean;
  priority: number;
  // Subject: Who does this policy apply to?
  subjectType: 'local_user' | 'local_group' | 'ad_group' | 'ad_user';
  subjectId: string;
  subjectName: string;
  // Target: Which devices does this cover?
  targetScope: 'all' | 'groups' | 'specific';
  targetGroupIds: string[];
  targetDeviceIds: string[];
  // Page / Module Access: Where can they go?
  canViewDashboard: boolean;
  canViewTopology: boolean;
  canViewDevices: boolean;
  canViewPorts: boolean;
  canViewScanner: boolean;
  canViewTemplates: boolean;
  canViewSettings: boolean;

  // 1. Cisco IOS / IOS-XE Granular Capabilities
  terminalAccess: 'none' | 'view_only' | 'full';
  canToggleAdminStatus: boolean;      // shutdown / no shutdown
  canChangeVlan: boolean;             // assign VLAN
  canEditDescription: boolean;        // set port description
  canTogglePortSecurity: boolean;     // port security enable/disable
  canWriteMemory: boolean;            // copy run start / write memory

  // 2. MikroTik RouterOS Granular Capabilities
  mikrotikTerminalAccess?: 'none' | 'view_only' | 'full';
  canMikrotikToggleInterface?: boolean; // /interface/set disabled=yes/no
  canMikrotikBridgeVlan?: boolean;       // /interface/bridge/vlan & PVID
  canMikrotikComment?: boolean;          // /interface/set comment=...
  canMikrotikIpPool?: boolean;           // /ip/address & /ip/pool
  canMikrotikFirewall?: boolean;         // /ip/firewall filter/nat
  canMikrotikBackup?: boolean;           // /system/backup & /export
  canMikrotikSafeMode?: boolean;         // RouterOS Safe Mode Protection

  // 3. Generic & Linux Network Appliances
  genericTerminalAccess?: 'none' | 'view_only' | 'full';
  canGenericToggleLink?: boolean;        // ip link set dev up/down
  canGenericDiagnostics?: boolean;       // ping, traceroute, mtr
  canGenericConfigBackup?: boolean;      // system config snapshot

  // 4. Global Infrastructure Operations
  canManageDevices: boolean;          // add, edit, delete device
  canApplyTemplates: boolean;         // apply config template
  canBatchOperate: boolean;           // batch port configuration

  // 5. Backup & Disaster Recovery Operations
  canExportBackup?: boolean;          // Export full or partial network backup package
  canImportBackup?: boolean;          // Import and restore network backup package
  permissions?: any;
}

export type BackupScope = 'full' | 'devices_topology' | 'security_rbac' | 'templates_only';

export interface BackupMetadata {
  version: string;
  appVersion: string;
  timestamp: string;
  createdAt: string;
  createdBy: string;
  createdRole: string;
  scope: BackupScope;
  scopeLabel: string;
  isEncrypted: boolean;
  isSanitized: boolean; // Passwords & secrets removed/masked
  checksumSha256: string;
  counts: {
    devices: number;
    customMaps: number;
    deviceGroups: number;
    localUsers: number;
    localGroups: number;
    accessPolicies: number;
    templates: number;
    hasActiveDirectory: boolean;
    hasCustomHierarchy: boolean;
  };
  environment?: {
    hostname?: string;
    userAgent?: string;
  };
}

export interface NetworkBackupPackage {
  format: 'nettopology-backup-v1';
  metadata: BackupMetadata;
  // Payload items (optionally omitted depending on scope)
  devices?: Device[];
  topologyData?: TopologyData;
  customMaps?: any[];
  nodePositions?: Record<string, { x: number; y: number }>;
  viewport?: { zoom: number; pan: { x: number; y: number } };
  physicalHierarchy?: {
    buildings: string[];
    floors: Record<string, string[]>;
    units: Record<string, string[]>;
    racks: Record<string, string[]>;
  };
  deviceGroups?: DeviceGroup[];
  localUsers?: LocalUser[];
  localGroups?: LocalGroup[];
  activeDirectory?: ActiveDirectoryConfig;
  accessPolicies?: AccessPolicy[];
  templates?: ConfigTemplate[];
  // If encrypted, the encrypted payload blob
  encryptedData?: string;
  salt?: string;
  iv?: string;
}

export interface BackupAuditEntry {
  id: string;
  timestamp: string;
  action: 'export' | 'export_blocked' | 'import_success' | 'import_failed' | 'import_blocked' | 'rollback';
  username: string;
  role: string;
  fileName?: string;
  fileSizeKb?: number;
  scope: string;
  itemCount: number;
  status: 'success' | 'warning' | 'error';
  details: string;
  checksum?: string;
}

// ==========================================
// Centralized Enterprise Audit & Activity Logs System
// ==========================================

export type AuditLogCategory = 
  | 'user_management'
  | 'rbac_policy'
  | 'device_inventory'
  | 'backup_recovery'
  | 'topology_network'
  | 'port_interface'
  | 'system_auth';

export type AuditLogSeverity = 'info' | 'notice' | 'warning' | 'critical';
export type AuditLogStatus = 'success' | 'failed' | 'denied';

export interface AuditActor {
  username: string;
  role: string;
  ipAddress?: string;
}

export interface AuditTarget {
  type: 'user' | 'group' | 'policy' | 'device' | 'backup' | 'map' | 'port' | 'template';
  id?: string;
  name: string;
  ip?: string;
  model?: string;
  vendor?: string;
  location?: string; // e.g. "ساختمان مرکزی > طبقه ۲ > اتاق IT > رک B02"
  portsCount?: number;
  metadata?: Record<string, any>;
}

export interface PortalAuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  category: AuditLogCategory;
  action: string;
  title: string;
  title_en: string;
  actor: AuditActor;
  target: AuditTarget;
  severity: AuditLogSeverity;
  status: AuditLogStatus;
  details: string;
  details_en: string;
  changesDiff?: {
    field: string;
    before?: any;
    after?: any;
  }[];
}

export type CommandRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type CommandChannel = 
  | 'terminal_interactive'
  | 'template_push'
  | 'port_context_menu'
  | 'batch_config'
  | 'api_script';

export interface DeviceCommandLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  actor: AuditActor;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  deviceVendor: 'cisco' | 'mikrotik' | 'linux' | 'generic';
  deviceModel?: string;
  deviceLocation: string;
  channel: CommandChannel;
  command: string;
  riskLevel: CommandRiskLevel;
  status: 'success' | 'failed' | 'denied';
  outputSummary?: string;
  durationMs?: number;
  notes?: string;
}

// -------------------------------------------------------------
// MikroTik VPN Types & Protocols Suite
// -------------------------------------------------------------

export type VPNType =
  | 'l2tp_ipsec'
  | 'gre'
  | 'wireguard'
  | 'openvpn'
  | 'sstp'
  | 'pptp'
  | 'ipsec'
  | 'ipsec_site_to_site'
  | 'eoip'
  | 'vxlan';

export type VPNMode = 'remote_access' | 'site_to_site' | 'tunnel' | 'client' | 'overlay';

export interface VPNUserConfig {
  username: string;
  password?: string;
  comment?: string;
  disabled?: boolean;
}

export interface VPNRouteConfig {
  dst: string;
  gateway?: string;
  distance?: number;
  comment?: string;
}

export interface WireGuardPeerConfig {
  public_key: string;
  allowed_address?: string;
  allowed_ips?: string;
  endpoint_address?: string;
  endpoint_port?: number;
  preshared_key?: string;
  comment?: string;
}

export interface VXLANVtepConfig {
  remote_ip: string;
  port?: number;
}

export interface RouterCertificate {
  name: string;
  common_name: string;
  ca: boolean;
  expired: boolean;
}

export interface VPNConfigPayload {
  name?: string;
  role?: 'server' | 'client';
  pool_name?: string;
  pool_ranges?: string;
  pool_start?: string;
  pool_end?: string;
  local_address?: string;
  remote_address?: string;
  connect_to?: string;
  tunnel_ip?: string;
  mtu?: number;
  port?: number;
  listen_port?: number;
  keepalive?: string;
  ipsec_secret?: string;
  secret?: string;
  profile_name?: string;
  dns_servers?: string[];
  users?: VPNUserConfig[];
  routes?: VPNRouteConfig[];
  comment?: string;
  user?: string;
  password?: string;
  // Certificate & SSL
  certificate?: string;
  require_client_certificate?: boolean;
  protocol?: 'tcp' | 'udp';
  auth?: string;
  cipher?: string;
  // WireGuard
  private_key?: string;
  public_key?: string;
  peers?: WireGuardPeerConfig[];
  // IPsec Site-to-Site
  peer_address?: string;
  preshared_key?: string;
  local_subnet?: string;
  remote_subnet?: string;
  exchange_mode?: string;
  ike_version?: string;
  auth_algorithm?: string;
  enc_algorithm?: string;
  proposal_enc_algorithms?: string[];
  proposal_auth_algorithms?: string[];
  proposal_pfs_group?: string;
  nat_traversal?: boolean;
  // EoIP & L2
  tunnel_id?: number;
  bridge?: string;
  mac_address?: string;
  // VXLAN
  vni?: number;
  vteps?: VXLANVtepConfig[];
}

export interface VPNItem {
  id: string;
  name: string;
  type: VPNType;
  mode: VPNMode;
  status: 'up' | 'standby' | 'down' | 'disabled';
  interface: string;
  profile?: string;
  ipsec_enabled?: boolean;
  active_sessions?: number;
  details?: Record<string, any>;
}

export interface VPNCapabilitiesResponse {
  platform: string;
  platform_name: string;
  firmware: string;
  routeros_major_version: number;
  phase: number;
  available_vpns: Array<{
    vpn_type: string;
    name: string;
    description: string;
    supported_modes: Array<{
      mode: string;
      label: string;
      description: string;
      default_port?: number;
      default_mtu?: number;
    }>;
    ipsec_profiles?: string[];
    supported_ciphers?: string[];
    supports_keepalive?: boolean;
    supports_ipsec_secret?: boolean;
    default_mtu?: number;
  }>;
  supported_catalog: Array<{
    type: string;
    name: string;
    description: string;
    status: 'available' | 'coming_soon' | 'disabled';
    modes: string[];
    phase: number;
    recommended_for?: string[];
    note?: string;
  }>;
}

export interface VPNValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface VPNPreviewResult {
  vpn_type: string;
  mode: string;
  commands: string[];
  script?: string;
  count: number;
}

export interface VPNAppliedStep {
  step: number;
  command: string;
  status: 'success' | 'failed';
}

export interface VPNVerificationDetails {
  vpn_id: string;
  vpn_type: string;
  operational_status: 'up' | 'standby' | 'down' | 'disabled';
  server_enabled?: boolean;
  active_users_count?: number;
  active_users?: Array<{ name: string; service: string; caller_id: string }>;
  ipsec_phase2_up?: boolean;
  raw_server_output?: string;
  verified_at?: string;
  interface_exists?: boolean;
  is_running?: boolean;
  is_disabled?: boolean;
  actual_mtu?: number;
  assigned_ip?: string;
  routes_count?: number;
}

export interface VPNApplyResult {
  success: boolean;
  vpn_id?: string;
  vpn_type?: string;
  mode?: string;
  applied_steps?: VPNAppliedStep[];
  verification?: VPNVerificationDetails;
  message?: string;
  error?: string;
  failed_step?: {
    step_index: number;
    command: string;
    error: string;
  };
  rollback?: {
    attempted: boolean;
    success: boolean;
    steps: Array<{ action: string; success: boolean; error?: string }>;
  };
}

export interface MikroTikVPNItem {
  id: string;
  name: string;
  type: 'wireguard' | 'l2tp_ipsec' | 'ipsec_site_to_site' | 'gre' | 'eoip' | 'sstp' | 'openvpn' | 'vxlan' | 'pptp' | string;
  mode: 'remote_access' | 'site_to_site' | 'tunnel' | 'overlay' | string;
  status: 'up' | 'standby' | 'down' | 'disabled' | string;
  interface?: string;
  profile?: string;
  ipsec_enabled?: boolean;
  active_sessions?: number;
  details?: Record<string, any>;
}

export interface MikroTikVPNCapabilities {
  platform: string;
  platform_name: string;
  firmware: string;
  routeros_major_version: number;
  vpn: {
    wireguard: boolean;
    l2tp_ipsec: boolean;
    ipsec_site_to_site: boolean;
    gre: boolean;
    eoip: boolean;
    sstp: boolean;
    openvpn: boolean;
    vxlan: boolean;
    pptp: boolean;
    [key: string]: boolean;
  };
  available_vpns: Array<{
    type: string;
    name: string;
    description: string;
    supported_modes: string[];
    [key: string]: any;
  }>;
  supported_catalog: Array<{
    type: string;
    name: string;
    description: string;
    status: 'available' | 'unsupported' | string;
    unsupported_reason?: string | null;
    modes: string[];
    recommended?: boolean;
    recommended_for?: string[];
  }>;
}

export interface VPNDeleteResult {
  success: boolean;
  vpn_id: string;
  message: string;
  steps?: Array<{ command: string; success: boolean }>;
}

// -------------------------------------------------------------
// Bulk Device Configuration Interfaces
// -------------------------------------------------------------
export interface BulkConfigParameter {
  name: string;
  labelFa: string;
  labelEn: string;
  type: 'string' | 'number' | 'password' | 'select' | 'textarea' | 'boolean';
  required: boolean;
  placeholder?: string;
  default?: any;
  options?: Array<{ value: string; labelFa: string; labelEn: string }>;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkConfigTemplate {
  id: string;
  category: string;
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  icon: string;
  parameters: BulkConfigParameter[];
  is_dangerous: boolean;
  confirmation_keyword: string;
  supports_backup: boolean;
  supports_idempotency: boolean;
  default_timeout_sec: number;
  requires_save_step: boolean;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkDevicePreviewStep {
  name: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  mode: string;
}

export interface BulkDevicePreviewItem {
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  platform: string;
  mapperName: string;
  preCheckCommand: string | null;
  backupCommand: string | null;
  steps: BulkDevicePreviewStep[];
  saveCommand: string | null;
  isDangerous: boolean;
  confirmationKeyword: string;
  estimatedTimeoutSec: number;
}

export interface BulkDeviceStepDetail {
  stepIndex: number;
  stepName: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  status: 'running' | 'success' | 'failed';
  output?: string;
  errorType?: string;
  errorMessageFa?: string;
  errorMessageEn?: string;
  durationMs?: number;
}

export interface BulkDeviceExecutionResult {
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  platform: string;
  status: 'success' | 'failed' | 'partial' | 'skipped';
  errorType?: string;
  errorMessageFa?: string;
  errorMessageEn?: string;
  stepsTotal: number;
  stepsCompleted: number;
  stepsDetail: BulkDeviceStepDetail[];
  rawOutput?: string;
  backupId?: string;
  backupSuccess?: boolean;
  backupPreview?: string;
  durationMs: number;
  retryCount: number;
  executedAt: number;
}

export interface BulkJobLog {
  timestamp: number;
  timeStr: string;
  level: 'info' | 'warning' | 'error' | 'success';
  messageFa: string;
  messageEn: string;
  deviceId?: string;
}

export interface BulkJobStatus {
  jobId: string;
  templateId: string;
  templateTitle: string;
  templateTitleEn: string;
  parameters: Record<string, any>;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalDevices: number;
  completedDevices: number;
  percentage: number;
  currentDeviceIndex: number;
  currentDeviceName: string;
  currentStepName: string;
  successCount: number;
  failedCount: number;
  partialCount: number;
  skippedCount: number;
  options: {
    timeoutSec: number;
    delayMs: number;
    autoBackup: boolean;
    saveAfterApply: boolean;
  };
  results: Record<string, BulkDeviceExecutionResult>;
  logs: BulkJobLog[];
}

// -------------------------------------------------------------
// Bulk Linux Server Configuration Interfaces
// -------------------------------------------------------------
export interface BulkServerParameter {
  name: string;
  labelFa: string;
  labelEn: string;
  type: 'string' | 'number' | 'password' | 'select' | 'textarea' | 'boolean';
  required: boolean;
  placeholder?: string;
  default?: any;
  options?: Array<{ value: string; labelFa: string; labelEn: string }>;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkServerTemplate {
  id: string;
  category: 'maintenance' | 'security' | 'network' | 'users' | 'cron' | 'storage' | 'firewall' | 'services' | 'docker' | 'custom' | string;
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  icon: string;
  parameters: BulkServerParameter[];
  is_dangerous: boolean;
  confirmation_keyword: string;
  default_timeout_sec: number;
  supported_distros?: string[];
  idempotent?: boolean;
  requires_sudo?: boolean;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkServerPreviewStep {
  name: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  distro: string;
  requiresSudo?: boolean;
}

export interface BulkServerPreviewItem {
  serverId: string;
  serverName: string;
  serverIp: string;
  osType: string;
  osDistro: string;
  distroFamily: string;
  steps: BulkServerPreviewStep[];
  isDangerous: boolean;
  confirmationKeyword: string;
  estimatedTimeoutSec: number;
  distroMapperName?: string;
  idempotencyCheck?: string;
  rollbackCommand?: string;
}

export interface BulkServerStepDetail {
  stepIndex: number;
  stepName: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  errorMessageFa?: string;
  errorMessageEn?: string;
}

export interface BulkServerExecutionResult {
  serverId: string;
  serverName: string;
  serverIp: string;
  osType: string;
  osDistro: string;
  distroFamily: string;
  status: 'success' | 'failed' | 'partial' | 'skipped';
  stepsTotal: number;
  stepsCompleted: number;
  stepsDetail: BulkServerStepDetail[];
  rawOutput?: string;
  durationMs: number;
  executedAt: number;
  errorType?: string;
  errorMessageFa?: string;
  errorMessageEn?: string;
}

export interface BulkServerJobLog {
  timestamp: number;
  timeStr: string;
  level: 'info' | 'warning' | 'error' | 'success';
  messageFa: string;
  messageEn: string;
  serverId?: string;
}

export interface BulkServerJobStatus {
  jobId: string;
  templateId: string;
  templateTitle: string;
  templateTitleEn: string;
  parameters: Record<string, any>;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalServers: number;
  completedServers: number;
  percentage: number;
  currentServerIndex: number;
  currentServerName: string;
  currentStepName: string;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  partialCount?: number;
  options: {
    timeoutSec: number;
    delayMs: number;
    dangerConfirmation?: string;
  };
  results: Record<string, BulkServerExecutionResult>;
  logs: BulkServerJobLog[];
}

export interface RemoteServer {
  id: string;
  name: string;
  hostname?: string;
  ip: string;
  os_type: 'linux' | 'windows';
  os_distro?: string;
  category: 'Infrastructure' | 'Database' | 'Kubernetes' | 'Web / App' | 'Monitoring' | 'Active Directory' | 'General' | string;
  environment: 'Production' | 'Staging' | 'Development' | 'DMZ' | string;
  tags: string[];
  role?: string;
  description?: string;
  status: 'online' | 'offline' | 'unreachable' | 'maintenance' | 'untested';
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  default_shell?: 'bash' | 'zsh' | 'sh';
  win_protocol?: 'rdp' | 'powershell' | 'winrm' | 'ssh';
  win_port?: number;
  win_domain?: string;
  win_username?: string;
  win_password?: string;
  vnc_port?: number;
  vnc_username?: string;
  vnc_password?: string;
  prompt_password_on_connect?: boolean;
  cpu_cores?: number;
  ram_gb?: number;
  disk_gb?: number;
  uptime_str?: string;
  location?: string;
  notes?: string;
  watchdogs?: LinuxServiceWatchdogRule[];
  created_at?: string;
  updated_at?: string;
}

export interface RemoteServerTagSummary {
  tag: string;
  count: number;
}

export interface ServerCategory {
  id: string;
  name: string;
  name_fa?: string;
  description?: string;
  color?: string;
  serverCount?: number;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LinuxServerDiskMetric {
  filesystem: string;
  mount: string;
  sizeBytes: number;
  usedBytes: number;
  availBytes: number;
  usagePercent: number;
  sizeHuman: string;
  usedHuman: string;
  availHuman: string;
}

export interface LinuxServerNetMetric {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxHuman: string;
  txHuman: string;
}

export interface LinuxServerProcessMetric {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

export interface LinuxServerLiveMetrics {
  timestamp: number;
  host: string;
  port: number;
  hostname: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  os: {
    system: string;
    kernel: string;
    arch: string;
    distro: string;
  };
  cpu: {
    usagePercent: number;
    cores: number;
    model: string;
    loadAvg: [number, number, number];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    usagePercent: number;
    totalHuman: string;
    usedHuman: string;
    freeHuman: string;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapUsagePercent: number;
    swapTotalHuman: string;
    swapUsedHuman: string;
  };
  disks: LinuxServerDiskMetric[];
  networks: LinuxServerNetMetric[];
  processes: LinuxServerProcessMetric[];
}

export interface LinuxServiceWatchdogRule {
  id: string;
  serviceName: string;
  enabled: boolean;
  checkIntervalSeconds: number;
  maxRestartAttempts: number;
  cooldownPeriodSeconds: number;
  rebootOnPersistentFailure: boolean;
  rebootCooldownMinutes: number;
  minUptimeBeforeRebootMinutes: number;
  maxRebootsPerDay?: number;
  customPreRestartCommand?: string;
  createdAt: string;
  updatedAt: string;
  // Live state returned from destination Linux host
  status?: 'active' | 'inactive' | 'recovering' | 'anti_loop_halted' | 'failed' | 'unknown';
  consecutiveFailures?: number;
  lastCheckTimestamp?: number;
  lastRestartTimestamp?: number;
  lastRebootTimestamp?: number;
  lastActionMessage?: string;
  systemdUnitActive?: boolean;
}

export type LinuxDirectoryActionType = 'cleanup' | 'backup' | 'size_cap' | 'sync';

export interface LinuxDirectoryPolicyRule {
  id: string;
  name: string;
  targetPath: string;
  actionType: LinuxDirectoryActionType;
  enabled: boolean;
  schedulePreset: 'hourly' | 'every_6h' | 'daily' | 'weekly' | 'monthly' | 'custom';
  scheduleCron: string;
  // Retention & Cleanup options
  cleanupAgeDays?: number;
  cleanupFilePattern?: string;
  cleanupRemoveEmptyDirs?: boolean;
  // Backup & Archive options
  backupFormat?: 'tar.gz' | 'tar.bz2' | 'tar.xz' | 'zip';
  backupDestinationPath?: string;
  backupKeepSourceFiles?: boolean;
  backupPreserveAll?: boolean;
  backupMaxRetainedCount?: number;
  // Size-Capped Pruning options
  sizeCapMb?: number;
  // Directory Sync / Mirror options
  syncDestinationPath?: string;
  syncDeleteExtraneous?: boolean;
  // Live Status & Audit
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'running' | 'never';
  lastRunMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinuxSystemService {
  name: string;
  loadState: string;
  activeState: string;
  subState: string;
  unitFileState?: string;
  description: string;
  hasWatchdog?: boolean;
  watchdogStatus?: 'active' | 'inactive' | 'recovering' | 'anti_loop_halted' | 'failed' | 'unknown';
}

export interface LinuxSystemGroup {
  name: string;
  gid: number;
  members: string[];
}

export interface LinuxSystemUser {
  username: string;
  uid: number;
  gid: number;
  comment: string;
  homeDir: string;
  shell: string;
  isSystem: boolean;
  primaryGroup?: string;
  groups?: string[];
  isLocked?: boolean;
}

export interface LinuxLoggedInUser {
  user: string;
  tty: string;
  from: string;
  loginTime: string;
  idleTime: string;
  what: string;
}

export interface LinuxNetworkInterfaceDetail {
  name: string;
  state: 'UP' | 'DOWN' | 'UNKNOWN';
  mac: string;
  ipv4: string;
  netmask: string;
  cidr: number;
  ipv6: string;
  gateway: string;
  mtu: number;
  speed?: string;
  rxBytes: number;
  txBytes: number;
}

export interface LinuxSystemDetailedInfo {
  distro: string;
  distroVersion: string;
  distroId: string;
  kernelRelease: string;
  kernelVersion: string;
  arch: string;
  hostname: string;
  fqdn: string;
  bootTime: string;
  uptime: string;
  currentSshPort: number;
  proxy: {
    httpProxy: string;
    httpsProxy: string;
    ftpProxy: string;
    noProxy: string;
    enabled: boolean;
  };
}

export interface LinuxProxyConfig {
  httpProxy: string;
  httpsProxy: string;
  ftpProxy: string;
  noProxy: string;
  enabled: boolean;
}

export interface LinuxBlockDevice {
  name: string;
  size: string;
  type: string;
  mountpoint: string | null;
  fstype: string | null;
  label?: string | null;
}

export interface LinuxMountedFilesystem {
  mountPoint: string;
  device: string;
  fsType: string;
  totalSize: string;
  usedSize: string;
  freeSize: string;
  usagePercent: number;
  status: 'Mounted' | 'Unmounted';
  isReadOnly: boolean;
  isLvm: boolean;
  lvName: string | null;
  vgName: string | null;
  options?: string;
}

export interface LinuxPartition {
  name: string;
  size: string;
  fsType: string | null;
  mountPoint: string | null;
  uuid: string | null;
  partLabel: string | null;
  isInLvm: boolean;
}

export interface LinuxPhysicalDisk {
  name: string;
  model: string | null;
  serial: string | null;
  size: string;
  type: string; // 'disk'
  mediaType: 'SSD' | 'HDD' | 'NVMe' | 'Unknown';
  transport: string | null; // 'sata' | 'nvme' | 'scsi' | 'virtio' | 'usb'
  health: string | null;
  partitionCount: number;
  isUsed: boolean;
  isInLvm: boolean;
  isAvailable: boolean; // "New / Available" (no partitions, no mounts, not in LVM)
  partitions: LinuxPartition[];
}

export interface LinuxPhysicalVolume {
  name: string;
  device: string;
  parentDisk: string;
  size: string;
  allocated: string;
  free: string;
  vgName: string;
  format?: string;
  status: string;
}

export interface LinuxVolumeGroup {
  name: string;
  totalSize: string;
  allocatedSize: string;
  freeSize: string;
  pvCount: number;
  lvCount: number;
  pvs: string[];
  lvs: string[];
}

export interface LinuxLogicalVolume {
  name: string;
  vgName: string;
  path: string;
  size: string;
  fsType: string | null;
  mountPoint: string | null;
  usedSize?: string;
  freeSize?: string;
  usagePercent?: number;
  isMounted: boolean;
  isReadOnly?: boolean;
  status: string;
}

export interface LinuxStorageSummary {
  totalDiskCount: number;
  availableDiskCount: number;
  totalMountedCount: number;
  totalVgCount: number;
  totalLvCount: number;
  totalStorageHuman?: string;
  usedStorageHuman?: string;
}

export interface LinuxStorageOverview {
  filesystems: LinuxMountedFilesystem[];
  physicalDisks: LinuxPhysicalDisk[];
  physicalVolumes: LinuxPhysicalVolume[];
  volumeGroups: LinuxVolumeGroup[];
  logicalVolumes: LinuxLogicalVolume[];
  lvmInstalled: boolean;
  summary: LinuxStorageSummary;
  // Backward compatibility fields
  pvs: LinuxLvmPv[];
  vgs: LinuxLvmVg[];
  lvs: LinuxLvmLv[];
  availableDisks: LinuxRawDisk[];
}

export interface LinuxLvmPv {
  name: string;
  vgName: string;
  size: string;
  free: string;
  used: string;
  format?: string;
  device?: string;
  parentDisk?: string;
}

export interface LinuxLvmVg {
  name: string;
  pvCount: number;
  lvCount: number;
  size: string;
  free: string;
  allocatedSize?: string;
  pvs?: string[];
  lvs?: string[];
}

export interface LinuxLvmLv {
  name: string;
  vgName: string;
  path: string;
  size: string;
  mountPoint?: string | null;
  fsType?: string | null;
  usagePercent?: number;
  isMounted?: boolean;
  isReadOnly?: boolean;
  usedSize?: string;
  freeSize?: string;
}

export interface LinuxRawDisk {
  name: string;
  size: string;
  type: string;
  fstype?: string | null;
  mountpoint?: string | null;
  model?: string;
  isInLvm?: boolean;
  isAvailable?: boolean;
}

export type LinuxLvmOverview = LinuxStorageOverview;

export interface LinuxDiskFormatMountPayload {
  diskPath: string; // e.g. "/dev/sdb"
  partition?: boolean; // true to create GPT partition
  fsType: 'ext4' | 'xfs' | 'btrfs';
  mountPath: string; // e.g. "/data" or "/backup"
  label?: string;
  persistInFstab?: boolean;
}

export interface LinuxLvmExtendPayload {
  lvPath: string;
  vgName: string;
  addSize: string; // e.g. "10G" or "100%FREE"
  diskToAddToVg?: string; // Optional raw disk e.g. "/dev/sdb" to pvcreate & vgextend
  fsType?: string;
  mountPoint?: string;
}

export interface LinuxLvmCreatePayload {
  isNewVg: boolean;
  vgName: string;
  selectedDisks?: string[]; // raw disks to pvcreate and use for VG
  lvName: string;
  size: string; // e.g. "20G" or "100%FREE"
  fsType: 'ext4' | 'xfs' | 'btrfs';
  mountPath?: string;
  persistInFstab?: boolean;
}

export interface LinuxLvmCreateVgPayload {
  vgName: string;
  selectedDisks: string[]; // block devices e.g. ["/dev/sdb", "/dev/sdc"]
  peSize?: string; // e.g. "4M", "8M", "16M"
  force?: boolean;
}

export interface LinuxLvmShrinkPayload {
  lvPath: string;
  vgName: string;
  reduceAmount: string; // e.g. "5G"
  mountPoint?: string;
  fsType?: string;
}

export interface LinuxMountPayload {
  device: string;
  mountPoint: string;
  fsType?: string;
  options?: string;
  persistInFstab?: boolean;
  createDirectory?: boolean;
}

export interface LinuxSshConfig {
  port: number;
  permitRootLogin: 'yes' | 'no' | 'prohibit-password' | 'without-password';
  passwordAuthentication: 'yes' | 'no';
  maxAuthTries: number;
  clientAliveInterval: number;
  clientAliveCountMax: number;
  x11Forwarding: 'yes' | 'no';
  allowedIps: string[];
}

export interface LinuxDnsConfig {
  nameservers: string[];
  searchDomains?: string[];
  source?: string;
  status?: string;
}

export interface LinuxFail2banJailInfo {
  name: string;
  currentlyBanned?: number;
  totalBanned?: number;
  currentlyFailed?: number;
  bannedIps?: string[];
}

export interface LinuxFail2banStatus {
  installed: boolean;
  running: boolean;
  active?: boolean;
  version?: string;
  jails: LinuxFail2banJailInfo[];
  bannedIps?: { jail: string; ip: string; timestamp?: string }[];
  totalBanned?: number;
}

export interface LinuxHostEntry {
  ip: string;
  hostname?: string;
  hostnames?: string[];
  aliases?: string[];
  comment?: string;
  id?: string;
}

export interface LinuxHostnameInfo {
  currentHostname: string;
  staticHostname?: string;
  transientHostname?: string;
  fqdn?: string;
  prettyHostname?: string;
  iconName?: string;
  chassis?: string;
  deployment?: string;
}

export interface LinuxTimeInfo {
  localTime: string;
  utcTime: string;
  universalTime?: string;
  timezone: string;
  tzIdentifier?: string;
  timeZone?: string;
  ntpActive: boolean;
  ntpSynchronized: boolean;
  ntpEnabled?: boolean;
  rtcTime?: string;
}

export interface LinuxTcpWrapperRule {
  id: string;
  daemon: string;
  clients: string[];
  options?: string;
  comment?: string;
  raw?: string;
  lineIndex?: number;
}

export interface LinuxTcpWrappersData {
  allowRules: LinuxTcpWrapperRule[];
  denyRules: LinuxTcpWrapperRule[];
  rawAllow: string;
  rawDeny: string;
}

export type LinuxLogCategory =
  | 'journal'
  | 'auth'
  | 'syslog'
  | 'dmesg'
  | 'nginx'
  | 'apache'
  | 'dpkg'
  | 'cron'
  | 'fail2ban'
  | 'boot'
  | 'custom';

export interface LinuxLogEntry {
  id: string;
  raw: string;
  timestamp?: string;
  hostname?: string;
  service?: string;
  level?: 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';
  message: string;
}

export interface LinuxLogFileMetadata {
  path: string;
  exists: boolean;
  sizeHuman?: string;
  sizeBytes?: number;
  lastModified?: string;
  lineCount?: number;
}

export interface LinuxSystemLogsResponse {
  success: boolean;
  category: LinuxLogCategory;
  filePath: string;
  logs: LinuxLogEntry[];
  rawText: string;
  lineCount: number;
  errorCount: number;
  warnCount: number;
  fileMetadata?: LinuxLogFileMetadata;
  availableLogFiles?: LinuxLogFileMetadata[];
  error?: string;
}

export interface LinuxLogCategoryDetail {
  id: LinuxLogCategory;
  name: string;
  name_en: string;
  shortDesc: string;
  shortDesc_en: string;
  defaultPaths: string[];
  whatSitsHere: string;
  whatSitsHere_en: string;
  whyNeeded: string;
  whyNeeded_en: string;
  practicalExamples: string[];
  practicalExamples_en: string[];
  commandsUsed: string[];
}



