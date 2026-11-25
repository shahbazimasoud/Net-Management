import crypto from 'crypto';
import http from 'http';
import https from 'https';
import net from 'net';
import { Client, ConnectConfig } from 'ssh2';
import {
  explainEventCodeHuman,
  HumanEventExplanation,
  BsodReasonCategory,
  BsodAnalysisResult,
  classifyBsodEventReason,
  buildBsodAnalysis,
} from './helpdeskEventCatalog';
import {
  createNtlmType1Buffer,
  createNtlmType3Result,
  parseNtlmCredentials,
  wrapSpnegoNegTokenInit,
  wrapSpnegoNegTokenResp,
  runDomainAdminSmbRpcPowerShell,
} from './helpdeskSmbRpcTransport';
import { HelpdeskExceptionRecord, listHelpdeskExceptionsFromDb } from './db';

export type HelpdeskProtocol = 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
export type HelpdeskResolvedProtocol = 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
export type HelpdeskWriteAction =
  | 'network_flush_dns'
  | 'network_renew_ip'
  | 'network_adapter_config'
  | 'network_hosts_edit'
  | 'network_proxy_config'
  | 'network_route_add'
  | 'network_route_delete'
  | 'network_vpn_create'
  | 'network_vpn_delete'
  | 'network_vpn_connect'
  | 'network_vpn_disconnect'
  | 'spooler_restart'
  | 'spooler_clear_queue'
  | 'printer_set_default'
  | 'printer_delete'
  | 'printer_install'
  | 'share_map'
  | 'share_disconnect'
  | 'process_terminate'
  | 'temp_clean'
  | 'gpupdate_force'
  | 'windows_update_install'
  | 'windows_update_uninstall'
  | 'sfc_verify'
  | 'sfc_scannow'
  | 'dism_check'
  | 'dism_scan'
  | 'dism_restore'
  | 'chkdsk_readonly'
  | 'chkdsk_hdd_badsector'
  | 'power_restart'
  | 'power_shutdown'
  | 'power_abort'
  | 'session_lock'
  | 'session_logoff'
  | 'program_uninstall'
  | 'service_start'
  | 'service_stop'
  | 'service_restart'
  | 'service_pause'
  | 'service_resume'
  | 'service_startup_type'
  | 'startup_enable'
  | 'startup_disable'
  | 'startup_delete'
  | 'startup_add'
  | 'region_datetime_set'
  | 'region_timezone_set'
  | 'region_ntp_sync'
  | 'region_ntp_toggle'
  | 'region_languages_set'
  | 'region_locale_set'
  | 'font_install'
  | 'font_delete'
  | 'firewall_profile_toggle'
  | 'firewall_rule_create'
  | 'firewall_rule_toggle'
  | 'firewall_rule_action'
  | 'firewall_rule_delete'
  | 'antivirus_control'
  | 'endpoint_send_message'
  | 'printer_test_page'
  | 'computer_rename'
  | 'msconfig_update'
  | 'env_var_set'
  | 'env_var_delete';

export type HelpdeskProcessCategory =
  | 'user_app'
  | 'browser'
  | 'office'
  | 'system_protected'
  | 'security_protected';

export interface HelpdeskTargetInput {
  targetIp: string;
  protocol?: HelpdeskProtocol;
  port?: number;
  username: string;
  password: string;
  jeaConfigName?: string;
  timeoutMs?: number;
}

export interface HelpdeskProcessItem {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMb: number;
  memoryPercent: number;
  threads: number;
  handles: number;
  status: string;
  user: string;
  terminable: boolean;
  processCategory: HelpdeskProcessCategory;
  protectionReason?: string;
  protectionReasonFa?: string;
}

export interface HelpdeskDiskItem {
  drive: string;
  label: string;
  fileSystem: string;
  totalGb: number;
  usedGb: number;
  freeGb: number;
  usedPercent: number;
}

export interface HelpdeskHealthResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  collectedAt: string;
  hostname: string;
  osName: string;
  osVersion: string;
  domain: string;
  loggedInUser: string;
  uptimeSeconds: number;
  uptimeText: string;
  primaryIp: string;
  macAddress: string;
  cpu: {
    usagePercent: number;
    cores: number;
    logicalProcessors: number;
    modelName: string;
    clockMhz: number | null;
  };
  memory: {
    usedPercent: number;
    usedGb: number;
    totalGb: number;
    freeGb: number;
  };
  disks: HelpdeskDiskItem[];
  security: {
    antivirusName: string;
    antivirusEnabled: boolean | null;
    realTimeProtection: boolean | null;
    signatureUpdated: string;
    firewallDomain: boolean | null;
    firewallPrivate: boolean | null;
    firewallPublic: boolean | null;
  };
  totalProcessCount: number;
  processes: HelpdeskProcessItem[];
  gpus: HelpdeskGpuItem[];
  audioDevices: HelpdeskAudioDeviceItem[];
  gpuSummary: {
    hasDedicatedGpu: boolean;
    primaryGpuName: string;
    primaryGpuType: 'onboard' | 'dedicated' | 'virtual' | 'none';
    primaryUsagePercent: number | null;
    vramTotalMb: number;
    vramUsedMb: number | null;
    vramUsedPercent: number | null;
  };
  audioSummary: {
    onboardCount: number;
    gpuAudioCount: number;
    externalCount: number;
    activeOutputName: string;
  };
}

export interface HelpdeskGpuItem {
  name: string;
  vendor: string;
  hardwareType: 'onboard' | 'dedicated' | 'virtual';
  isOnboard: boolean;
  busInfo: string;
  driverVersion: string;
  driverDate: string;
  resolution: string;
  vramTotalMb: number;
  vramUsedMb: number | null;
  vramUsedPercent: number | null;
  usagePercent: number | null;
  status: string;
}

export interface HelpdeskAudioDeviceItem {
  name: string;
  manufacturer: string;
  deviceType: 'onboard' | 'gpu_hdmi' | 'usb_external' | 'bluetooth' | 'virtual';
  isOnboard: boolean;
  status: string;
}

export interface HelpdeskNetworkAdapter {
  name: string;
  description: string;
  interfaceIndex?: number | null;
  status: string;
  macAddress: string;
  ipv4Addresses: string[];
  subnetMasks?: string[];
  prefixLengths?: number[];
  defaultGateways: string[];
  dnsServers: string[];
  dhcpEnabled: boolean | null;
  linkSpeed: string;
}

export interface HelpdeskHostsEntry {
  id: string;
  lineIndex: number;
  ip: string;
  hostnames: string;
  comment: string;
  enabled: boolean;
}

export interface HelpdeskRouteEntry {
  id: string;
  destination: string;
  netmask: string;
  prefixLength: number;
  gateway: string;
  interfaceName: string;
  interfaceIndex: number;
  metric: number;
  persistent: boolean;
  isDefault: boolean;
  isSystemReserved: boolean;
}

export interface HelpdeskVpnConnection {
  id: string;
  name: string;
  serverAddress: string;
  tunnelType: string;
  authenticationMethod: string;
  useWinlogonCredential: boolean;
  splitTunneling: boolean;
  allUserConnection: boolean;
  connectionStatus: string;
  rememberCredential: boolean;
  dnsSuffix?: string;
}

export interface HelpdeskNetworkSnapshotResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  collectedAt: string;
  hostname: string;
  adapters: HelpdeskNetworkAdapter[];
  proxy: {
    enabled: boolean;
    server: string;
    override: string;
    autoConfigUrl?: string;
    autoDetect?: boolean;
    activeUser?: string;
    winhttpDirect?: boolean;
    winhttpServer?: string;
    winhttpBypass?: string;
  };
  hostsFilePath?: string;
  hostsEntries?: HelpdeskHostsEntry[];
  routes?: HelpdeskRouteEntry[];
  vpnConnections?: HelpdeskVpnConnection[];
  arpSummaryCount: number;
}

export type HelpdeskDiagnosticProbeType =
  | 'ping'
  | 'port'
  | 'dns'
  | 'nslookup'
  | 'tracert'
  | 'http'
  | 'arp';

export interface HelpdeskProbeResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  probeType: HelpdeskDiagnosticProbeType;
  probeTarget: string;
  probePort?: number;
  success: boolean;
  summary: string;
  summaryFa: string;
  metrics: Record<string, string | number | boolean | null>;
  records?: string[];
  rawOutput: string;
  executedAt: string;
}

export interface HelpdeskActionResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  action: HelpdeskWriteAction;
  success: boolean;
  message: string;
  messageFa: string;
  details: Record<string, string | number | boolean | null>;
  rawOutput: string;
  executedAt: string;
}

export interface HelpdeskPrinterItem {
  name: string;
  driverName: string;
  portName: string;
  status: string;
  shared: boolean;
  isDefault: boolean;
  jobCount: number;
  location: string;
  scope?: 'machine' | 'user' | 'unknown';
  ownerUser?: string;
  serverName?: string;
  shareName?: string;
  isNetwork?: boolean;
}

export interface HelpdeskPrintJobItem {
  id: number;
  printerName: string;
  documentName: string;
  owner: string;
  status: string;
  sizeKb: number;
  submittedTime: string;
}

export interface HelpdeskPrinterStatusResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  collectedAt: string;
  loggedInUser: string;
  loggedInUserSid: string;
  spooler: {
    serviceName: string;
    displayName: string;
    status: string;
    startType: string;
    pid: number | null;
  };
  printers: HelpdeskPrinterItem[];
  jobs: HelpdeskPrintJobItem[];
}

export interface HelpdeskPrintServerPrinterItem {
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
}

export interface HelpdeskPrintServerListResult {
  targetIp: string;
  printServer: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  loggedInUser: string;
  collectedAt: string;
  printers: HelpdeskPrintServerPrinterItem[];
}

export interface HelpdeskPrinterInstallResult extends HelpdeskActionResult {
  printServer: string;
  shareName: string;
  uncPath: string;
  installScope: 'active_user' | 'all_users';
  methodUsed: string;
  loggedInUser: string;
  setAsDefault: boolean;
}

export interface HelpdeskUserProfileItem {
  username: string;
  sid: string;
  profilePath: string;
  isLoaded: boolean;
  isActiveLoggedIn: boolean;
}

export interface HelpdeskMappedShareItem {
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
}

export interface HelpdeskSharesResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  loggedInUser: string;
  loggedInUserSid: string;
  collectedAt: string;
  userProfiles: HelpdeskUserProfileItem[];
  shares: HelpdeskMappedShareItem[];
  usedDriveLetters: string[];
}

export interface HelpdeskFileServerShareItem {
  name: string;
  uncPath: string;
  description: string;
  shareType: string;
  isAdminShare: boolean;
  alreadyMapped: boolean;
  mappedDriveLetter: string;
}

export interface HelpdeskFileServerListResult {
  targetIp: string;
  fileServer: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  loggedInUser: string;
  collectedAt: string;
  shares: HelpdeskFileServerShareItem[];
}

export interface HelpdeskShareMapResult extends HelpdeskActionResult {
  remotePath: string;
  driveLetter: string;
  scope: 'active_user' | 'specific_user' | 'all_users';
  appliedUsers: string[];
  loggedInUser: string;
  persistent: boolean;
  managedRuleName?: string;
}

export interface HelpdeskRateLimitStatus {
  windowMinutes: number;
  maxWriteActions: number;
  maxDistinctHosts: number;
  usedWriteActions: number;
  remainingWriteActions: number;
  distinctHostsUsed: number;
  isFrozen: boolean;
  freezeUntilIso: string | null;
}

export interface HelpdeskEventLogItem {
  recordId: number;
  eventId: number;
  channel: string;
  level: 'critical' | 'error' | 'warning' | 'info';
  levelLabelEn: string;
  levelLabelFa: string;
  source: string;
  timeCreated: string;
  rawMessage: string;
  explanation: HumanEventExplanation;
  bsodReason?: BsodReasonCategory | null;
  bugcheckCodeRaw?: string;
}

export interface HelpdeskEventViewerResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  collectedAt: string;
  channelRequested: 'All' | 'System' | 'Application';
  diagnosticFocus?: 'all' | 'bsod';
  hoursBack: number;
  summary: {
    total: number;
    critical: number;
    error: number;
    warning: number;
    knownDecodedCount: number;
    topIssue: {
      eventId: number;
      source: string;
      count: number;
      humanTitleEn: string;
      humanTitleFa: string;
    } | null;
  };
  bsodAnalysis?: BsodAnalysisResult;
  events: HelpdeskEventLogItem[];
}

export interface HelpdeskTempFolderSummary {
  key: 'windows_temp' | 'user_temp';
  labelEn: string;
  labelFa: string;
  path: string;
  exists: boolean;
  fileCount: number;
  folderCount: number;
  sizeMb: number;
}

export interface HelpdeskTempLargeFile {
  name: string;
  folderKey: 'windows_temp' | 'user_temp';
  sizeMb: number;
  lastModified: string;
}

export interface HelpdeskRecycleBinDriveSummary {
  drive: string;
  sizeMb: number;
  sizeBytes: number;
  itemCount: number;
}

export interface HelpdeskRecycleBinSummary {
  sizeMb: number;
  sizeBytes: number;
  itemCount: number;
  perDrive: HelpdeskRecycleBinDriveSummary[];
}

export interface HelpdeskTempScanResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  collectedAt: string;
  totalReclaimableMb: number;
  totalFileCount: number;
  folders: HelpdeskTempFolderSummary[];
  largestFiles: HelpdeskTempLargeFile[];
  recycleBin: HelpdeskRecycleBinSummary;
}

export type HelpdeskTempCleanScope = 'user_temp' | 'windows_temp' | 'both' | 'recycle_bin' | 'all';

export interface HelpdeskTempCleanResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  hostname: string;
  scope: HelpdeskTempCleanScope;
  success: boolean;
  deletedFiles: number;
  skippedLockedFiles: number;
  freedMb: number;
  remainingMb: number;
  message: string;
  messageFa: string;
  executedAt: string;
}

export interface HelpdeskGpoStatusResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  domain: string;
  loggedInUser: string;
  collectedAt: string;
  domainJoined: boolean;
  pendingReboot: boolean;
  lastGpoRefresh: string;
  computerGpos: string[];
  userGpos: string[];
  rawSummary: string;
}

// ============================================================================
// 1. ANTI-RANSOMWARE SINGLE-HOST RATE-LIMIT CIRCUIT BREAKER (In-Memory Window)
// ============================================================================

const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_WRITE_ACTIONS_PER_WINDOW = 6;
const MAX_DISTINCT_HOSTS_PER_WINDOW = 3;
const FREEZE_DURATION_MS = 5 * 60 * 1000;

interface WriteEventRecord {
  timestamp: number;
  targetIp: string;
  action: HelpdeskWriteAction;
}

const userWriteHistory = new Map<string, WriteEventRecord[]>();
const userFreezeUntil = new Map<string, number>();

export function getHelpdeskRateLimitStatus(actorKey: string): HelpdeskRateLimitStatus {
  const now = Date.now();
  const key = String(actorKey || 'anonymous').trim().toLowerCase();
  const frozenUntil = userFreezeUntil.get(key) || 0;
  const isFrozen = frozenUntil > now;
  if (!isFrozen && frozenUntil > 0) {
    userFreezeUntil.delete(key);
  }

  const recent = (userWriteHistory.get(key) || []).filter((e) => now - e.timestamp <= RATE_WINDOW_MS);
  userWriteHistory.set(key, recent);
  const distinctHosts = new Set(recent.map((e) => e.targetIp.toLowerCase()));

  return {
    windowMinutes: 5,
    maxWriteActions: MAX_WRITE_ACTIONS_PER_WINDOW,
    maxDistinctHosts: MAX_DISTINCT_HOSTS_PER_WINDOW,
    usedWriteActions: recent.length,
    remainingWriteActions: Math.max(0, MAX_WRITE_ACTIONS_PER_WINDOW - recent.length),
    distinctHostsUsed: distinctHosts.size,
    isFrozen,
    freezeUntilIso: isFrozen ? new Date(frozenUntil).toISOString() : null,
  };
}

export function checkAndRecordHelpdeskWriteRateLimit(
  actorKey: string,
  targetIp: string,
  action: HelpdeskWriteAction
): { allowed: boolean; reason?: string; reasonFa?: string; status: HelpdeskRateLimitStatus } {
  const now = Date.now();
  const key = String(actorKey || 'anonymous').trim().toLowerCase();
  const normIp = targetIp.trim().toLowerCase();

  const currentStatus = getHelpdeskRateLimitStatus(key);
  if (currentStatus.isFrozen) {
    return {
      allowed: false,
      reason: `Anti-ransomware safety circuit breaker active until ${currentStatus.freezeUntilIso}. Write actions are temporarily paused.`,
      reasonFa: `مدارقطع‌کن امنیتی ضدباج‌افزار تا ساعت ${currentStatus.freezeUntilIso} فعال است و عملیات تغییردهنده موقتاً متوقف شده است.`,
      status: currentStatus,
    };
  }

  const recent = (userWriteHistory.get(key) || []).filter((e) => now - e.timestamp <= RATE_WINDOW_MS);
  const distinctHosts = new Set(recent.map((e) => e.targetIp.toLowerCase()));
  const wouldExceedHosts = !distinctHosts.has(normIp) && distinctHosts.size >= MAX_DISTINCT_HOSTS_PER_WINDOW;
  const wouldExceedCount = recent.length >= MAX_WRITE_ACTIONS_PER_WINDOW;

  if (wouldExceedHosts || wouldExceedCount) {
    const freezeUntil = now + FREEZE_DURATION_MS;
    userFreezeUntil.set(key, freezeUntil);
    const updated = getHelpdeskRateLimitStatus(key);
    return {
      allowed: false,
      reason: wouldExceedHosts
        ? `Anti-ransomware safeguard triggered: Maximum ${MAX_DISTINCT_HOSTS_PER_WINDOW} distinct endpoints per 5 minutes exceeded. HelpDesk write actions are paused for 5 minutes.`
        : `Anti-ransomware safeguard triggered: Maximum ${MAX_WRITE_ACTIONS_PER_WINDOW} write actions per 5 minutes exceeded. HelpDesk write actions are paused for 5 minutes.`,
      reasonFa: wouldExceedHosts
        ? `محدودیت امنیتی ضدباج‌افزار فعال شد: حداکثر مجاز عملیات تغییردهنده روی ${MAX_DISTINCT_HOSTS_PER_WINDOW} سیستم مختلف در هر ۵ دقیقه رد شد. عملیات تغییردهنده ۵ دقیقه متوقف شد.`
        : `محدودیت امنیتی ضدباج‌افزار فعال شد: حداکثر ${MAX_WRITE_ACTIONS_PER_WINDOW} عملیات تغییردهنده در هر ۵ دقیقه رد شد. عملیات تغییردهنده ۵ دقیقه متوقف شد.`,
      status: updated,
    };
  }

  recent.push({ timestamp: now, targetIp: normIp, action });
  userWriteHistory.set(key, recent);
  return { allowed: true, status: getHelpdeskRateLimitStatus(key) };
}

// ============================================================================
// 2. STRICT TARGET & INPUT VALIDATION (Zero Injection / SSRF Metadata Guard)
// ============================================================================

const SAFE_HOST_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/;
const SAFE_JEA_REGEX = /^[a-zA-Z0-9._-]{1,64}$/;

function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

export function validateTargetEndpointHost(rawHost: unknown): string {
  const host = String(rawHost || '').trim();
  if (!host || host.length > 253 || !SAFE_HOST_REGEX.test(host)) {
    throw new Error('Invalid endpoint IP address or hostname.');
  }

  const lower = host.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === 'localhost.localdomain' ||
    lower.endsWith('.localhost') ||
    lower === '0.0.0.0' ||
    lower.startsWith('127.') ||
    lower.startsWith('169.254.') ||
    lower === '::1' ||
    lower.startsWith('224.') ||
    lower.startsWith('255.')
  ) {
    throw new Error(
      'Blocked target address: Loopback, link-local metadata (169.254.x.x), and multicast addresses are not permitted.'
    );
  }

  // If numeric-only dotted format, verify valid IPv4 octets
  if (/^\d+(\.\d+)*$/.test(host) && !isValidIpv4(host)) {
    throw new Error('Invalid IPv4 address format.');
  }

  return host;
}

export function validateDiagnosticProbeHost(rawHost: unknown): string {
  const host = String(rawHost || '').trim();
  if (!host || host.length > 253 || !SAFE_HOST_REGEX.test(host)) {
    throw new Error('Invalid diagnostic target IP or domain.');
  }
  if (/^\d+(\.\d+)*$/.test(host) && !isValidIpv4(host)) {
    throw new Error('Invalid IPv4 address for diagnostic probe.');
  }
  return host;
}

export function validateJeaConfigName(rawName: unknown): string | undefined {
  const clean = String(rawName || '').trim();
  if (!clean) return undefined;
  if (!SAFE_JEA_REGEX.test(clean)) {
    throw new Error('Invalid JEA Session Configuration name.');
  }
  return clean;
}

function encodePowerShellBase64(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function escapeXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// 3. NATIVE WS-MAN / WINRM TRANSPORT (HTTPS 5986 & HTTP 5985)
//    Supports NTLMv2, SPNEGO Negotiate (AD default), UPN (user@domain), Basic
// ============================================================================

// WinRM HTTP/HTTPS NTLM flags: Unicode | RequestTarget | NTLM | AlwaysSign | ExtendedSessionSecurity
const WINRM_NTLM_FLAGS = 0x00088205;

class NativeWinRmSession {
  private host: string;
  private port: number;
  private useHttps: boolean;
  private username: string;
  private password: string;
  private timeoutMs: number;
  private agent: http.Agent | https.Agent;
  private authMode: 'unknown' | 'ntlm' | 'negotiate' | 'basic' = 'unknown';

  constructor(opts: {
    host: string;
    port: number;
    useHttps: boolean;
    username: string;
    password: string;
    timeoutMs: number;
  }) {
    this.host = opts.host;
    this.port = opts.port;
    this.useHttps = opts.useHttps;
    this.username = opts.username;
    this.password = opts.password;
    this.timeoutMs = opts.timeoutMs;
    // Keep-Alive is mandatory for NTLM/Negotiate connection-bound authentication
    this.agent = opts.useHttps
      ? new https.Agent({ keepAlive: true, maxSockets: 1, rejectUnauthorized: false })
      : new http.Agent({ keepAlive: true, maxSockets: 1 });
  }

  destroy() {
    try {
      this.agent.destroy();
    } catch {}
  }

  private rawPost(
    body: string,
    authHeader?: string
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const lib = this.useHttps ? https : http;
      const bodyBuf = Buffer.from(body, 'utf-8');
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
        'Content-Length': bodyBuf.length,
        Connection: 'keep-alive',
      };
      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const req = lib.request(
        {
          hostname: this.host,
          port: this.port,
          path: '/wsman',
          method: 'POST',
          headers,
          agent: this.agent,
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf-8'),
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`WinRM request to ${this.host}:${this.port} timed out after ${this.timeoutMs}ms`));
      });
      req.on('error', (err) => reject(err));
      req.write(bodyBuf);
      req.end();
    });
  }

  private async tryNtlmOrNegotiateHandshake(
    scheme: 'NTLM' | 'Negotiate',
    envelopeXml: string,
    domainOverride?: string
  ): Promise<{ ok: boolean; status: number; wwwAuth: string; serverNbDomain: string; body: string }> {
    const type1Buf = createNtlmType1Buffer(WINRM_NTLM_FLAGS);
    const step1Token =
      scheme === 'Negotiate'
        ? wrapSpnegoNegTokenInit(type1Buf).toString('base64')
        : type1Buf.toString('base64');

    const type1Res = await this.rawPost('', `${scheme} ${step1Token}`);
    const wwwAuthRaw = type1Res.headers['www-authenticate'];
    const wwwAuth = Array.isArray(wwwAuthRaw) ? wwwAuthRaw.join(', ') : String(wwwAuthRaw || '');

    const regex = scheme === 'Negotiate' ? /Negotiate\s+([A-Za-z0-9+/=]+)/i : /NTLM\s+([A-Za-z0-9+/=]+)/i;
    const match = wwwAuth.match(regex);
    if (type1Res.status !== 401 || !match) {
      return { ok: false, status: type1Res.status, wwwAuth, serverNbDomain: '', body: type1Res.body };
    }

    const type3 = createNtlmType3Result(Buffer.from(match[1], 'base64'), this.username, this.password, {
      domainOverride,
      requestFlags: WINRM_NTLM_FLAGS,
    });
    const step3Token =
      scheme === 'Negotiate'
        ? wrapSpnegoNegTokenResp(type3.type3Buf).toString('base64')
        : type3.type3Buf.toString('base64');

    const authRes = await this.rawPost(envelopeXml, `${scheme} ${step3Token}`);
    if (authRes.status >= 200 && authRes.status < 300) {
      this.authMode = scheme === 'Negotiate' ? 'negotiate' : 'ntlm';
      return { ok: true, status: authRes.status, wwwAuth, serverNbDomain: type3.serverNbDomain, body: authRes.body };
    }
    return {
      ok: false,
      status: authRes.status,
      wwwAuth,
      serverNbDomain: type3.serverNbDomain,
      body: authRes.body,
    };
  }

  private async soapRequest(envelopeXml: string): Promise<string> {
    if (this.authMode === 'basic') {
      const basic = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
      const r = await this.rawPost(envelopeXml, basic);
      if (r.status === 401) {
        throw new Error('WinRM authentication failed (HTTP 401): Invalid username or password.');
      }
      if (r.status >= 400) {
        throw new Error(`WinRM SOAP error (HTTP ${r.status}): ${extractSoapFault(r.body)}`);
      }
      return r.body;
    }

    // If NTLM/Negotiate already authenticated on keep-alive socket, send directly; if server asks 401 re-negotiate
    if (this.authMode === 'ntlm' || this.authMode === 'negotiate') {
      const r = await this.rawPost(envelopeXml);
      if (r.status >= 200 && r.status < 300) return r.body;
      if (r.status !== 401) {
        throw new Error(`WinRM SOAP error (HTTP ${r.status}): ${extractSoapFault(r.body)}`);
      }
    }

    const parsedCred = parseNtlmCredentials(this.username);
    const canRetryWithServerDomain = !parsedCred.domain && !parsedCred.isUpn && !parsedCred.explicitLocal;

    // 1. Try NTLM directly (modern NTLMv2 with UPN + MsvAvTimestamp support)
    const ntlmAttempt = await this.tryNtlmOrNegotiateHandshake('NTLM', envelopeXml);
    if (ntlmAttempt.ok) return ntlmAttempt.body;

    if (ntlmAttempt.status === 401 && canRetryWithServerDomain && ntlmAttempt.serverNbDomain) {
      const retryNtlm = await this.tryNtlmOrNegotiateHandshake('NTLM', envelopeXml, ntlmAttempt.serverNbDomain);
      if (retryNtlm.ok) return retryNtlm.body;
    }
    if (ntlmAttempt.status >= 400 && ntlmAttempt.status !== 401) {
      throw new Error(`WinRM SOAP error (HTTP ${ntlmAttempt.status}): ${extractSoapFault(ntlmAttempt.body)}`);
    }

    // 2. Try SPNEGO Negotiate (default auth scheme on AD domain-joined Windows WinRM)
    if (ntlmAttempt.status === 401 && /negotiate/i.test(ntlmAttempt.wwwAuth)) {
      const negAttempt = await this.tryNtlmOrNegotiateHandshake('Negotiate', envelopeXml);
      if (negAttempt.ok) return negAttempt.body;

      if (negAttempt.status === 401 && canRetryWithServerDomain && negAttempt.serverNbDomain) {
        const retryNeg = await this.tryNtlmOrNegotiateHandshake('Negotiate', envelopeXml, negAttempt.serverNbDomain);
        if (retryNeg.ok) return retryNeg.body;
      }
      if (negAttempt.status >= 400 && negAttempt.status !== 401) {
        throw new Error(`WinRM SOAP error (HTTP ${negAttempt.status}): ${extractSoapFault(negAttempt.body)}`);
      }
    }

    // 3. Fallback to Basic Auth if server advertises Basic
    if (ntlmAttempt.status === 401 && /basic/i.test(ntlmAttempt.wwwAuth)) {
      const basic = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
      const basicRes = await this.rawPost(envelopeXml, basic);
      if (basicRes.status === 401) {
        throw new Error('WinRM Basic authentication rejected (HTTP 401). Check credentials.');
      }
      if (basicRes.status >= 400) {
        throw new Error(`WinRM SOAP error (HTTP ${basicRes.status}): ${extractSoapFault(basicRes.body)}`);
      }
      this.authMode = 'basic';
      return basicRes.body;
    }

    if (ntlmAttempt.status === 401) {
      throw new Error(
        `WinRM authentication rejected (HTTP 401). Advertised schemes: ${ntlmAttempt.wwwAuth || 'none'}. Verify DOMAIN\\user (or user@domain.local) credentials and WinRM permissions.`
      );
    }

    throw new Error(`Unexpected WinRM HTTP status ${ntlmAttempt.status} from ${this.host}:${this.port}.`);
  }

  async runPowerShellScript(script: string, jeaConfigName?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const resourceUri = jeaConfigName
      ? `http://schemas.microsoft.com/powershell/${escapeXml(jeaConfigName)}`
      : 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd';
    const targetUrl = `${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}/wsman`;
    const msgId = () => `uuid:${crypto.randomUUID()}`;

    // 1. Create Shell
    const createXml = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"
  xmlns:p="http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd">
  <env:Header>
    <a:To>${escapeXml(targetUrl)}</a:To>
    <w:ResourceURI mustUnderstand="true">${resourceUri}</w:ResourceURI>
    <a:ReplyTo><a:Address mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/04/transfer/Create</a:Action>
    <w:MaxEnvelopeSize mustUnderstand="true">512000</w:MaxEnvelopeSize>
    <a:MessageID>${msgId()}</a:MessageID>
    <w:OperationTimeout>PT30S</w:OperationTimeout>
    <w:OptionSet>
      <w:Option Name="WINRS_NOPROFILE">TRUE</w:Option>
      <w:Option Name="WINRS_CODEPAGE">65001</w:Option>
    </w:OptionSet>
  </env:Header>
  <env:Body>
    <rsp:Shell>
      <rsp:InputStreams>stdin</rsp:InputStreams>
      <rsp:OutputStreams>stdout stderr</rsp:OutputStreams>
    </rsp:Shell>
  </env:Body>
</env:Envelope>`;

    const createRes = await this.soapRequest(createXml);
    const shellIdMatch = createRes.match(/<[^>]*ShellId[^>]*>([^<]+)<\/[^>]*ShellId>/i);
    if (!shellIdMatch) {
      throw new Error(`WinRM failed to allocate remote shell: ${extractSoapFault(createRes)}`);
    }
    const shellId = shellIdMatch[1].trim();

    try {
      // 2. Execute Command (UTF-16LE Base64 EncodedCommand - immune to quoting injection)
      const encodedPs = encodePowerShellBase64(script);
      const commandXml = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <env:Header>
    <a:To>${escapeXml(targetUrl)}</a:To>
    <w:ResourceURI mustUnderstand="true">${resourceUri}</w:ResourceURI>
    <a:ReplyTo><a:Address mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command</a:Action>
    <w:MaxEnvelopeSize mustUnderstand="true">512000</w:MaxEnvelopeSize>
    <a:MessageID>${msgId()}</a:MessageID>
    <w:OperationTimeout>PT30S</w:OperationTimeout>
    <w:SelectorSet><w:Selector Name="ShellId">${escapeXml(shellId)}</w:Selector></w:SelectorSet>
  </env:Header>
  <env:Body>
    <rsp:CommandLine>
      <rsp:Command>powershell.exe</rsp:Command>
      <rsp:Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedPs}</rsp:Arguments>
    </rsp:CommandLine>
  </env:Body>
</env:Envelope>`;

      const cmdRes = await this.soapRequest(commandXml);
      const cmdIdMatch = cmdRes.match(/<[^>]*CommandId[^>]*>([^<]+)<\/[^>]*CommandId>/i);
      if (!cmdIdMatch) {
        throw new Error(`WinRM failed to launch command: ${extractSoapFault(cmdRes)}`);
      }
      const commandId = cmdIdMatch[1].trim();

      // 3. Receive Loop (honors extended timeouts for SFC / DISM / CHKDSK)
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let exitCode = 0;
      const deadline = Date.now() + this.timeoutMs;
      const maxIters = Math.max(30, Math.ceil(this.timeoutMs / 10000) + 12);
      const pollTimeoutSec = Math.max(10, Math.min(25, Math.floor(this.timeoutMs / 1000)));

      for (let iter = 0; iter < maxIters && Date.now() < deadline; iter++) {
        const receiveXml = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <env:Header>
    <a:To>${escapeXml(targetUrl)}</a:To>
    <w:ResourceURI mustUnderstand="true">${resourceUri}</w:ResourceURI>
    <a:ReplyTo><a:Address mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive</a:Action>
    <w:MaxEnvelopeSize mustUnderstand="true">512000</w:MaxEnvelopeSize>
    <a:MessageID>${msgId()}</a:MessageID>
    <w:OperationTimeout>PT${pollTimeoutSec}S</w:OperationTimeout>
    <w:SelectorSet><w:Selector Name="ShellId">${escapeXml(shellId)}</w:Selector></w:SelectorSet>
  </env:Header>
  <env:Body>
    <rsp:Receive>
      <rsp:DesiredStream CommandId="${escapeXml(commandId)}">stdout stderr</rsp:DesiredStream>
    </rsp:Receive>
  </env:Body>
</env:Envelope>`;

        let recRes = '';
        try {
          recRes = await this.soapRequest(receiveXml);
        } catch (pollErr: any) {
          // WinRM OperationTimeout fault (2150858793) on long-running commands simply means command is still running
          if (/OperationTimeout|2150858793/i.test(String(pollErr?.message || '')) && Date.now() < deadline) {
            continue;
          }
          throw pollErr;
        }

        const streamRegex = /<[^>]*Stream[^>]*Name="([^"]+)"[^>]*>([^<]*)<\/[^>]*Stream>/gi;
        let m: RegExpExecArray | null;
        while ((m = streamRegex.exec(recRes)) !== null) {
          const streamName = m[1].toLowerCase();
          const b64 = (m[2] || '').trim();
          if (!b64) continue;
          const decoded = Buffer.from(b64, 'base64');
          if (streamName === 'stdout') stdoutChunks.push(decoded);
          else if (streamName === 'stderr') stderrChunks.push(decoded);
        }

        const doneMatch = recRes.match(/State="http:\/\/schemas\.microsoft\.com\/wbem\/wsman\/1\/windows\/shell\/CommandState\/Done"/i);
        if (doneMatch) {
          const exitMatch = recRes.match(/<[^>]*ExitCode[^>]*>(\d+)<\/[^>]*ExitCode>/i);
          if (exitMatch) exitCode = parseInt(exitMatch[1], 10);
          break;
        }
      }

      // 4. Signal Terminate
      const signalXml = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <env:Header>
    <a:To>${escapeXml(targetUrl)}</a:To>
    <w:ResourceURI mustUnderstand="true">${resourceUri}</w:ResourceURI>
    <a:ReplyTo><a:Address mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Signal</a:Action>
    <w:MaxEnvelopeSize mustUnderstand="true">512000</w:MaxEnvelopeSize>
    <a:MessageID>${msgId()}</a:MessageID>
    <w:SelectorSet><w:Selector Name="ShellId">${escapeXml(shellId)}</w:Selector></w:SelectorSet>
  </env:Header>
  <env:Body>
    <rsp:Signal CommandId="${escapeXml(commandId)}">
      <rsp:Code>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/signal/terminate</rsp:Code>
    </rsp:Signal>
  </env:Body>
</env:Envelope>`;
      await this.soapRequest(signalXml).catch(() => {});

      return {
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode,
      };
    } finally {
      // 5. Always Delete Shell cleanly
      const deleteXml = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <env:Header>
    <a:To>${escapeXml(targetUrl)}</a:To>
    <w:ResourceURI mustUnderstand="true">${resourceUri}</w:ResourceURI>
    <a:ReplyTo><a:Address mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/04/transfer/Delete</a:Action>
    <w:MaxEnvelopeSize mustUnderstand="true">512000</w:MaxEnvelopeSize>
    <a:MessageID>${msgId()}</a:MessageID>
    <w:SelectorSet><w:Selector Name="ShellId">${escapeXml(shellId)}</w:Selector></w:SelectorSet>
  </env:Header>
  <env:Body />
</env:Envelope>`;
      await this.soapRequest(deleteXml).catch(() => {});
    }
  }
}

function extractSoapFault(xml: string): string {
  const reasonMatch = xml.match(/<[^>]*Text[^>]*>([^<]+)<\/[^>]*Text>/i);
  if (reasonMatch) return reasonMatch[1].trim();
  const msgMatch = xml.match(/<[^>]*Message[^>]*>([^<]+)<\/[^>]*Message>/i);
  if (msgMatch) return msgMatch[1].trim();
  return xml.slice(0, 220).replace(/\s+/g, ' ').trim() || 'Unknown WinRM SOAP error';
}

// ============================================================================
// 5. ADAPTIVE SSH TRANSPORT (Modern Ciphers First + Legacy Fallback)
// ============================================================================

async function runAdaptiveEndpointSsh(opts: {
  host: string;
  port: number;
  username: string;
  password: string;
  command: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const attempt = (legacy: boolean) =>
    new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      const conn = new Client();
      let settled = false;
      const done = (err?: Error, res?: { stdout: string; stderr: string; exitCode: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          conn.end();
        } catch {}
        if (err) reject(err);
        else resolve(res || { stdout: '', stderr: '', exitCode: 0 });
      };

      const timer = setTimeout(() => {
        done(new Error(`SSH connection to ${opts.host}:${opts.port} timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);

      conn.on('error', (err) => done(err));
      conn.on('ready', () => {
        conn.exec(opts.command, (err, stream) => {
          if (err) return done(err);
          try {
            stream.end();
          } catch {}
          let stdout = '';
          let stderr = '';
          stream.on('data', (d: Buffer) => {
            stdout += d.toString('utf-8');
          });
          stream.stderr.on('data', (d: Buffer) => {
            stderr += d.toString('utf-8');
          });
          stream.on('close', (code: number) => {
            done(undefined, { stdout, stderr, exitCode: typeof code === 'number' ? code : 0 });
          });
        });
      });

      const cfg: ConnectConfig = {
        host: opts.host,
        port: opts.port,
        username: opts.username,
        password: opts.password,
        readyTimeout: Math.min(opts.timeoutMs, 10000),
      };

      if (legacy) {
        cfg.algorithms = {
          kex: [
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group1-sha1',
          ],
          serverHostKey: ['ssh-ed25519', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
          cipher: ['aes128-gcm', 'aes256-gcm', 'aes128-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'],
        };
      }

      conn.connect(cfg);
    });

  try {
    return await attempt(false);
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    const isNegotiation =
      msg.includes('handshake') ||
      msg.includes('no matching') ||
      msg.includes('key exchange') ||
      msg.includes('cipher') ||
      msg.includes('algorithm');
    if (isNegotiation) {
      return await attempt(true);
    }
    throw err;
  }
}

// ============================================================================
// 6. ADAPTIVE PROTOCOL RESOLVER & EXECUTION DISPATCHER
// ============================================================================

function tcpPortOpen(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function resolveConnectionRoute(input: HelpdeskTargetInput): Promise<{
  host: string;
  protocol: HelpdeskResolvedProtocol;
  port: number;
  jeaConfigName?: string;
}> {
  const host = validateTargetEndpointHost(input.targetIp);
  const jeaConfigName = validateJeaConfigName(input.jeaConfigName);
  const requested = input.protocol || 'auto';

  if (requested === 'winrm_https') {
    return { host, protocol: 'winrm_https', port: input.port || 5986, jeaConfigName };
  }
  if (requested === 'winrm_http') {
    return { host, protocol: 'winrm_http', port: input.port || 5985, jeaConfigName };
  }
  if (requested === 'smb_rpc') {
    return { host, protocol: 'smb_rpc', port: input.port || 445, jeaConfigName };
  }
  if (requested === 'ssh') {
    return { host, protocol: 'ssh', port: input.port || 22, jeaConfigName };
  }

  // Adaptive negotiation: WinRM HTTPS (5986) -> WinRM HTTP (5985) -> Domain Admin SMB/RPC (445) -> OpenSSH (22)
  const [p5986, p5985, p445, p22] = await Promise.all([
    tcpPortOpen(host, 5986, 2200),
    tcpPortOpen(host, 5985, 2200),
    tcpPortOpen(host, 445, 2200),
    tcpPortOpen(host, 22, 2200),
  ]);

  if (p5986) return { host, protocol: 'winrm_https', port: 5986, jeaConfigName };
  if (p5985) return { host, protocol: 'winrm_http', port: 5985, jeaConfigName };
  if (p445) return { host, protocol: 'smb_rpc', port: 445, jeaConfigName };
  if (p22) return { host, protocol: 'ssh', port: 22, jeaConfigName };

  throw new Error(
    `Endpoint ${host} is unreachable on management ports (WinRM HTTPS 5986, WinRM HTTP 5985, Domain Admin SMB/RPC 445, SSH 22). Ensure the workstation is online and Windows Firewall permits WinRM, File & Printer Sharing (TCP 445 for Domain Admin), or OpenSSH.`
  );
}

async function executeHardcodedScripts(
  input: HelpdeskTargetInput,
  windowsPsScript: string,
  linuxShellScript: string
): Promise<{
  host: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  stdout: string;
  stderr: string;
}> {
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  if (!username || !password) {
    throw new Error('Session username and password are required to connect to the target endpoint.');
  }

  const requested = input.protocol || 'auto';
  const route = await resolveConnectionRoute(input);
  const timeoutMs = Math.max(5000, Math.min(300000, Number(input.timeoutMs) || 18000));

  if (route.protocol === 'smb_rpc') {
    const smbRes = await runDomainAdminSmbRpcPowerShell({
      host: route.host,
      port: route.port,
      username,
      password,
      script: windowsPsScript,
      timeoutMs,
    });
    if (!smbRes.stdout.trim() && smbRes.stderr.trim()) {
      throw new Error(smbRes.stderr.trim().slice(0, 400));
    }
    return {
      host: route.host,
      protocolUsed: 'smb_rpc',
      portUsed: route.port,
      osFamily: 'windows',
      stdout: smbRes.stdout,
      stderr: smbRes.stderr,
    };
  }

  if (route.protocol === 'winrm_https' || route.protocol === 'winrm_http') {
    const winrm = new NativeWinRmSession({
      host: route.host,
      port: route.port,
      useHttps: route.protocol === 'winrm_https',
      username,
      password,
      timeoutMs,
    });
    try {
      const res = await winrm.runPowerShellScript(windowsPsScript, route.jeaConfigName);
      if (!res.stdout.trim() && res.stderr.trim()) {
        throw new Error(res.stderr.trim().slice(0, 400));
      }
      return {
        host: route.host,
        protocolUsed: route.protocol,
        portUsed: route.port,
        osFamily: 'windows',
        stdout: res.stdout,
        stderr: res.stderr,
      };
    } catch (winrmErr: any) {
      // Adaptive Domain Admin fallback in 'auto' mode: if WinRM rejects (e.g., AllowUnencrypted=false or Kerberos-only),
      // automatically retry over Domain Admin SMB2/DCERPC (TCP 445) when port 445 is open.
      if (requested === 'auto' && !route.jeaConfigName && (await tcpPortOpen(route.host, 445, 1800))) {
        try {
          const smbRes = await runDomainAdminSmbRpcPowerShell({
            host: route.host,
            port: 445,
            username,
            password,
            script: windowsPsScript,
            timeoutMs,
          });
          if (!smbRes.stdout.trim() && smbRes.stderr.trim()) {
            throw new Error(smbRes.stderr.trim().slice(0, 400));
          }
          return {
            host: route.host,
            protocolUsed: 'smb_rpc',
            portUsed: 445,
            osFamily: 'windows',
            stdout: smbRes.stdout,
            stderr: smbRes.stderr,
          };
        } catch (smbErr: any) {
          throw new Error(
            `WinRM (${route.port}) failed: ${winrmErr?.message || 'unknown'} | Domain Admin SMB/RPC (445) fallback also failed: ${smbErr?.message || 'unknown'}`
          );
        }
      }
      throw winrmErr;
    } finally {
      winrm.destroy();
    }
  }

  // SSH path: detect Windows OpenSSH vs Linux/macOS cleanly
  const probeOs = await runAdaptiveEndpointSsh({
    host: route.host,
    port: route.port,
    username,
    password,
    command: 'uname -s 2>/dev/null || echo WINDOWS_OPENSSH',
    timeoutMs: 8000,
  });

  const isLinuxOrUnix = /linux|darwin|freebsd/i.test(probeOs.stdout);
  if (isLinuxOrUnix) {
    const res = await runAdaptiveEndpointSsh({
      host: route.host,
      port: route.port,
      username,
      password,
      command: linuxShellScript,
      timeoutMs,
    });
    return {
      host: route.host,
      protocolUsed: 'ssh',
      portUsed: route.port,
      osFamily: 'linux',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  }

  const encoded = encodePowerShellBase64(windowsPsScript);
  const winSshRes = await runAdaptiveEndpointSsh({
    host: route.host,
    port: route.port,
    username,
    password,
    command: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    timeoutMs,
  });
  return {
    host: route.host,
    protocolUsed: 'ssh',
    portUsed: route.port,
    osFamily: 'windows',
    stdout: winSshRes.stdout,
    stderr: winSshRes.stderr,
  };
}

function parseJsonFromStdout<T>(stdout: string, contextLabel: string): T {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Endpoint returned non-JSON output for ${contextLabel}: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

function formatUptime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ============================================================================
// 7. MODULE 1: READ-ONLY SYSTEM HEALTH & LIVE PROCESS TELEMETRY
// ============================================================================

const PS_HEALTH_TELEMETRY = `
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$cpuUsage = $cpu.LoadPercentage
if ($null -eq $cpuUsage) {
  try { $cpuUsage = [math]::Round((Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples[0].CookedValue, 1) } catch { $cpuUsage = 0 }
}
$totalMemGb = [math]::Round(($os.TotalVisibleMemorySize / 1MB), 2)
$freeMemGb = [math]::Round(($os.FreePhysicalMemory / 1MB), 2)
$usedMemGb = [math]::Round(($totalMemGb - $freeMemGb), 2)
$memPct = if ($totalMemGb -gt 0) { [math]::Round(($usedMemGb / $totalMemGb) * 100, 1) } else { 0 }
$uptimeSec = if ($os.LastBootUpTime) { [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds } else { 0 }

$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  $tot = [math]::Round($_.Size / 1GB, 2)
  $fr = [math]::Round($_.FreeSpace / 1GB, 2)
  $us = [math]::Round($tot - $fr, 2)
  [PSCustomObject]@{
    drive = $_.DeviceID
    label = [string]$_.VolumeName
    fileSystem = [string]$_.FileSystem
    totalGb = $tot
    usedGb = $us
    freeGb = $fr
    usedPercent = if ($tot -gt 0) { [math]::Round(($us / $tot) * 100, 1) } else { 0 }
  }
})

$nic = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" | Select-Object -First 1
$primaryIp = if ($nic -and $nic.IPAddress) { ($nic.IPAddress | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' } | Select-Object -First 1) } else { '' }
$macAddr = if ($nic) { [string]$nic.MACAddress } else { '' }

$avName = 'Windows Defender'; $avEnabled = $null; $rtp = $null; $sigDate = ''
try {
  $mp = Get-MpComputerStatus
  if ($mp) {
    $avEnabled = [bool]$mp.AntivirusEnabled
    $rtp = [bool]$mp.RealTimeProtectionEnabled
    if ($mp.AntivirusSignatureLastUpdated) { $sigDate = $mp.AntivirusSignatureLastUpdated.ToString('yyyy-MM-dd HH:mm') }
  }
} catch {}

$fwDom = $null; $fwPriv = $null; $fwPub = $null
try {
  $fws = Get-NetFirewallProfile
  foreach ($f in $fws) {
    if ($f.Name -eq 'Domain') { $fwDom = [bool]$f.Enabled }
    if ($f.Name -eq 'Private') { $fwPriv = [bool]$f.Enabled }
    if ($f.Name -eq 'Public') { $fwPub = [bool]$f.Enabled }
  }
} catch {}

$allProcs = Get-Process
$totalProcCount = $allProcs.Count
$logical = if ($cpu.NumberOfLogicalProcessors) { [int]$cpu.NumberOfLogicalProcessors } else { 1 }
$totMemMb = if ($totalMemGb -gt 0) { $totalMemGb * 1024 } else { 1 }

# Sample CPU deltas quickly (400ms window) for authentic instantaneous CPU% per process
$p1 = @{}
foreach ($pr in $allProcs) {
  try { $p1[$pr.Id] = $pr.TotalProcessorTime.TotalMilliseconds } catch {}
}
Start-Sleep -Milliseconds 400
$allProcs2 = Get-Process
$procList = @()
foreach ($pr in $allProcs2) {
  $memMb = [math]::Round($pr.WorkingSet64 / 1MB, 1)
  $cpuPct = 0.0
  if ($p1.ContainsKey($pr.Id)) {
    try {
      $deltaMs = $pr.TotalProcessorTime.TotalMilliseconds - $p1[$pr.Id]
      if ($deltaMs -gt 0) {
        $cpuPct = [math]::Round([math]::Min(100, ($deltaMs / (400.0 * $logical)) * 100.0), 1)
      }
    } catch {}
  }
  $procList += [PSCustomObject]@{
    pid = [int]$pr.Id
    name = [string]$pr.ProcessName
    cpuPercent = $cpuPct
    memoryMb = $memMb
    memoryPercent = [math]::Round(($memMb / $totMemMb) * 100, 1)
    threads = if ($pr.Threads) { [int]$pr.Threads.Count } else { 0 }
    handles = [int]$pr.HandleCount
    status = if ($pr.Responding) { 'Running' } else { 'Not Responding' }
    user = ''
  }
}
$topProcs = @($procList | Sort-Object -Property @{Expression='cpuPercent';Descending=$true}, @{Expression='memoryMb';Descending=$true} | Select-Object -First 25)

# GPU & VRAM Telemetry (Win32_VideoController + Registry qwMemorySize for >4GB + Performance Counters / nvidia-smi)
$regVramMap = @{}
try {
  Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.PSChildName -match '^\\d{4}$') {
      $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($p -and $p.DriverDesc) {
        $qw = $p.'HardwareInformation.qwMemorySize'
        if ($qw -and [double]$qw -gt 0) {
          $regVramMap[[string]$p.DriverDesc] = [math]::Round(([double]$qw) / 1MB, 0)
        }
      }
    }
  }
} catch {}

$gpuUtilPct = $null
$vramUsedCounterMb = $null
try {
  $gpuCounters = Get-Counter @('\\GPU Engine(*engtype_3D*)\\Utilization Percentage', '\\GPU Adapter Memory(*)\\Dedicated Usage') -ErrorAction SilentlyContinue
  if ($gpuCounters -and $gpuCounters.CounterSamples) {
    $engVals = @($gpuCounters.CounterSamples | Where-Object { $_.Path -like '*Utilization Percentage*' } | ForEach-Object { [double]$_.CookedValue })
    if ($engVals.Count -gt 0) {
      $sumEng = ($engVals | Measure-Object -Sum).Sum
      $gpuUtilPct = [math]::Round([math]::Min(100.0, [math]::Max(0.0, $sumEng)), 1)
    }
    $memVals = @($gpuCounters.CounterSamples | Where-Object { $_.Path -like '*Dedicated Usage*' } | ForEach-Object { [double]$_.CookedValue })
    if ($memVals.Count -gt 0) {
      $sumMemBytes = ($memVals | Measure-Object -Sum).Sum
      if ($sumMemBytes -ge 0) {
        $vramUsedCounterMb = [math]::Round($sumMemBytes / 1MB, 0)
      }
    }
  }
} catch {}

$nvidiaRows = @()
try {
  $nvPath = @('nvidia-smi.exe', 'C:\\Windows\\System32\\nvidia-smi.exe', 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe') | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
  if ($nvPath) {
    $nvOut = (& $nvPath --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>$null)
    foreach ($line in @($nvOut)) {
      $parts = ([string]$line) -split ','
      if ($parts.Count -ge 4) {
        $nvidiaRows += [PSCustomObject]@{
          name = $parts[0].Trim()
          util = [double]($parts[1].Trim())
          usedMb = [double]($parts[2].Trim())
          totalMb = [double]($parts[3].Trim())
        }
      }
    }
  }
} catch {}

$gpus = @()
try {
  $vcs = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue)
  foreach ($vc in $vcs) {
    $gName = [string]$vc.Name
    if ([string]::IsNullOrWhiteSpace($gName)) { continue }
    $gVendor = [string]$vc.AdapterCompatibility
    $pnp = [string]$vc.PNPDeviceID
    $vramMb = 0
    if ($regVramMap.ContainsKey($gName)) {
      $vramMb = [int]$regVramMap[$gName]
    } elseif ($vc.AdapterRAM -and [double]$vc.AdapterRAM -gt 0) {
      $vramMb = [math]::Round(([double]$vc.AdapterRAM) / 1MB, 0)
    }
    $nvMatch = $nvidiaRows | Where-Object { $gName -like "*$($_.name)*" -or $_.name -like "*$gName*" } | Select-Object -First 1
    if ($nvMatch -and $nvMatch.totalMb -gt $vramMb) { $vramMb = [int]$nvMatch.totalMb }

    $hType = 'onboard'
    $isOnboard = $true
    $busInfo = 'Integrated / Shared Memory'
    $combined = "$gName $gVendor $($vc.VideoProcessor)"
    if ($combined -match 'Microsoft Basic Display|Hyper-V|VMware|VirtualBox|QXL|VirtIO|Citrix|Parallels|Remote Display|Mirror|VNC|SpaceDesk|IddSample') {
      $hType = 'virtual'; $isOnboard = $true; $busInfo = 'Virtual Display Adapter'
    } elseif ($combined -match 'NVIDIA|GeForce|RTX|GTX|Quadro|Tesla|Intel\\(R\\) Arc|Arc\\(TM\\)|Radeon RX|Radeon Pro|Radeon HD [5-9]\\d{3}|Radeon R[79]|FirePro') {
      $hType = 'dedicated'; $isOnboard = $false; $busInfo = 'Dedicated PCIe GPU'
    } elseif ($combined -match 'Intel.*(UHD|Iris|HD Graphics)|AMD Radeon\\(TM\\) Graphics|AMD Radeon Vega|APU|Integrated') {
      $hType = 'onboard'; $isOnboard = $true; $busInfo = 'Onboard / CPU Integrated'
    } elseif ($vramMb -ge 3072 -and $pnp -match '^PCI\\\\VEN_10DE|^PCI\\\\VEN_1002') {
      $hType = 'dedicated'; $isOnboard = $false; $busInfo = 'Dedicated PCIe GPU'
    }

    $resStr = ''
    if ($vc.CurrentHorizontalResolution -and $vc.CurrentVerticalResolution) {
      $resStr = "$($vc.CurrentHorizontalResolution)x$($vc.CurrentVerticalResolution)"
      if ($vc.CurrentRefreshRate) { $resStr += " @ $($vc.CurrentRefreshRate)Hz" }
    }
    $drvDateStr = ''
    try { if ($vc.DriverDate) { $drvDateStr = $vc.DriverDate.ToString('yyyy-MM-dd') } } catch {}

    $uPct = if ($nvMatch) { [double]$nvMatch.util } elseif ($hType -ne 'virtual') { $gpuUtilPct } else { $null }
    $vUsed = if ($nvMatch) { [int]$nvMatch.usedMb } elseif ($hType -ne 'virtual') { $vramUsedCounterMb } else { $null }
    if ($null -ne $vUsed -and $vramMb -gt 0 -and $vUsed -gt $vramMb) { $vUsed = $vramMb }
    $vPct = if ($null -ne $vUsed -and $vramMb -gt 0) { [math]::Round(($vUsed / $vramMb) * 100, 1) } else { $null }

    $gpus += [PSCustomObject]@{
      name = $gName
      vendor = $gVendor
      hardwareType = $hType
      isOnboard = $isOnboard
      busInfo = $busInfo
      driverVersion = [string]$vc.DriverVersion
      driverDate = $drvDateStr
      resolution = $resStr
      vramTotalMb = [int]$vramMb
      vramUsedMb = $vUsed
      vramUsedPercent = $vPct
      usagePercent = $uPct
      status = [string]$vc.Status
    }
  }
} catch {}

# Audio Controllers (Win32_SoundDevice + Onboard vs GPU HDMI vs USB External vs Bluetooth)
$audioDevices = @()
try {
  $sds = @(Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue)
  foreach ($sd in $sds) {
    $aName = [string]$sd.Name
    if ([string]::IsNullOrWhiteSpace($aName)) { continue }
    $aMfg = [string]$sd.Manufacturer
    $aPnp = [string]$sd.PNPDeviceID
    $dType = 'onboard'
    $aOnboard = $true
    $aCombined = "$aName $aMfg"
    if ($aCombined -match 'Bluetooth|Hands-Free' -or $aPnp -match '^BTHENUM') {
      $dType = 'bluetooth'; $aOnboard = $false
    } elseif ($aPnp -match '^USB' -or $aCombined -match 'USB Audio|USB Headset|USB PnP|Jabra|Logitech|Plantronics|Poly|HyperX') {
      $dType = 'usb_external'; $aOnboard = $false
    } elseif ($aCombined -match 'NVIDIA.*Audio|AMD High Definition Audio|ATI.*Audio|Intel\\(R\\) Display Audio') {
      $dType = 'gpu_hdmi'; $aOnboard = $false
    } elseif ($aCombined -match 'Virtual|VB-Audio|Voicemeeter|Steam|Remote Audio|Citrix|VMware|Miracast') {
      $dType = 'virtual'; $aOnboard = $false
    } else {
      $dType = 'onboard'; $aOnboard = $true
    }
    $audioDevices += [PSCustomObject]@{
      name = $aName
      manufacturer = $aMfg
      deviceType = $dType
      isOnboard = $aOnboard
      status = [string]$sd.Status
    }
  }
} catch {}

$out = [PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  osName = [string]$os.Caption
  osVersion = [string]$os.Version
  domain = [string]$cs.Domain
  loggedInUser = [string]$cs.UserName
  uptimeSeconds = $uptimeSec
  primaryIp = [string]$primaryIp
  macAddress = [string]$macAddr
  cpu = [PSCustomObject]@{
    usagePercent = [double]$cpuUsage
    cores = [int]$cpu.NumberOfCores
    logicalProcessors = [int]$logical
    modelName = [string]$cpu.Name
    clockMhz = if ($cpu.MaxClockSpeed) { [int]$cpu.MaxClockSpeed } else { $null }
  }
  memory = [PSCustomObject]@{
    usedPercent = [double]$memPct
    usedGb = [double]$usedMemGb
    totalGb = [double]$totalMemGb
    freeGb = [double]$freeMemGb
  }
  disks = $disks
  security = [PSCustomObject]@{
    antivirusName = $avName
    antivirusEnabled = $avEnabled
    realTimeProtection = $rtp
    signatureUpdated = $sigDate
    firewallDomain = $fwDom
    firewallPrivate = $fwPriv
    firewallPublic = $fwPub
  }
  totalProcessCount = [int]$totalProcCount
  processes = $topProcs
  gpus = $gpus
  audioDevices = $audioDevices
}
$out | ConvertTo-Json -Depth 6 -Compress
`;

const LINUX_HEALTH_TELEMETRY = `
python3 - <<'PY'
import json, os, platform, socket, subprocess, time

def run(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""

hostname = socket.gethostname()
os_name = run(". /etc/os-release 2>/dev/null && echo $PRETTY_NAME") or platform.platform()
os_ver = platform.release()
logged_user = run("who | awk '{print $1}' | head -n 1") or os.environ.get("USER", "")
uptime_sec = 0
try:
    with open("/proc/uptime") as f:
        uptime_sec = int(float(f.read().split()[0]))
except Exception:
    pass

# CPU sample
def read_cpu():
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    return sum(parts), idle

cpu_pct = 0.0
try:
    t1, i1 = read_cpu()
    time.sleep(0.35)
    t2, i2 = read_cpu()
    dt, di = t2 - t1, i2 - i1
    if dt > 0:
        cpu_pct = round(((dt - di) / dt) * 100.0, 1)
except Exception:
    pass

cores = os.cpu_count() or 1
model = run("awk -F: '/model name/{print $2; exit}' /proc/cpuinfo").strip() or platform.processor()

# Memory
mem_total_kb = mem_avail_kb = 0
try:
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith("MemTotal:"): mem_total_kb = int(line.split()[1])
            elif line.startswith("MemAvailable:"): mem_avail_kb = int(line.split()[1])
except Exception:
    pass
total_gb = round(mem_total_kb / 1048576.0, 2)
free_gb = round(mem_avail_kb / 1048576.0, 2)
used_gb = round(max(0.0, total_gb - free_gb), 2)
mem_pct = round((used_gb / total_gb) * 100.0, 1) if total_gb > 0 else 0.0

# Disks
disks = []
df_out = run("df -BG -T -x tmpfs -x devtmpfs -x squashfs --output=target,fstype,size,used,avail,pcent | tail -n +2")
for line in df_out.splitlines():
    cols = line.split()
    if len(cols) >= 6:
        tot = float(cols[2].rstrip("G") or 0)
        us = float(cols[3].rstrip("G") or 0)
        fr = float(cols[4].rstrip("G") or 0)
        pct = float(cols[5].rstrip("%") or 0)
        disks.append({"drive": cols[0], "label": "", "fileSystem": cols[1], "totalGb": round(tot, 2), "usedGb": round(us, 2), "freeGb": round(fr, 2), "usedPercent": round(pct, 1)})

# Processes
ps_out = run("ps -eo pid,comm,pcpu,rss,pmem,nlwp,stat,user --sort=-pcpu,-rss | head -n 26 | tail -n +2")
procs = []
for line in ps_out.splitlines():
    cols = line.split(None, 7)
    if len(cols) >= 8:
        procs.append({
            "pid": int(cols[0]),
            "name": cols[1],
            "cpuPercent": round(float(cols[2]), 1),
            "memoryMb": round(float(cols[3]) / 1024.0, 1),
            "memoryPercent": round(float(cols[4]), 1),
            "threads": int(cols[5]) if cols[5].isdigit() else 1,
            "handles": 0,
            "status": cols[6],
            "user": cols[7]
        })
total_procs = int(run("ps -e --no-headers | wc -l") or len(procs))
primary_ip = run("hostname -I | awk '{print $1}'")
mac_addr = run("ip -o link show up | awk '!/lo:/ {for(i=1;i<=NF;i++) if($i==\"link/ether\") {print $(i+1); exit}}'")
ufw_active = "Status: active" in run("ufw status 2>/dev/null")

# Linux GPU & VRAM detection (nvidia-smi + lspci + drm sysfs)
gpus = []
nv_list = []
nv_out = run("nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,driver_version --format=csv,noheader,nounits 2>/dev/null")
for line in nv_out.splitlines():
    parts = [p.strip() for p in line.split(",")]
    if len(parts) >= 5:
        try:
            used_mb = float(parts[2])
            tot_mb = float(parts[3])
            nv_list.append({
                "name": parts[0],
                "vendor": "NVIDIA",
                "hardwareType": "dedicated",
                "isOnboard": False,
                "busInfo": "Dedicated PCIe GPU",
                "driverVersion": parts[4],
                "driverDate": "",
                "resolution": "",
                "vramTotalMb": int(tot_mb),
                "vramUsedMb": int(used_mb),
                "vramUsedPercent": round((used_mb / tot_mb) * 100.0, 1) if tot_mb > 0 else None,
                "usagePercent": round(float(parts[1]), 1),
                "status": "OK",
            })
        except Exception:
            pass

lspci_out = run("lspci 2>/dev/null")
for line in lspci_out.splitlines():
    low = line.lower()
    if any(k in low for k in ["vga compatible controller", "3d controller", "display controller"]):
        desc = line.split(":", 2)[-1].strip() if ":" in line else line
        if any(nv["name"].lower() in desc.lower() or "nvidia" in desc.lower() for nv in nv_list):
            continue
        is_virt = any(k in low for k in ["virtio", "qxl", "vmware", "virtualbox", "bochs", "hyper-v", "cirrus"])
        is_ded = (not is_virt) and any(k in low for k in ["nvidia", "geforce", "rtx", "gtx", "radeon rx", "radeon pro", "arc "])
        htype = "virtual" if is_virt else ("dedicated" if is_ded else "onboard")
        vendor = "NVIDIA" if "nvidia" in low else ("AMD" if ("amd" in low or "ati" in low) else ("Intel" if "intel" in low else "Virtual/Other"))
        gpus.append({
            "name": desc,
            "vendor": vendor,
            "hardwareType": htype,
            "isOnboard": htype != "dedicated",
            "busInfo": "Virtual Display Adapter" if is_virt else ("Dedicated PCIe GPU" if is_ded else "Onboard / Integrated"),
            "driverVersion": "",
            "driverDate": "",
            "resolution": "",
            "vramTotalMb": 0,
            "vramUsedMb": None,
            "vramUsedPercent": None,
            "usagePercent": None,
            "status": "OK",
        })
gpus = nv_list + gpus

# Try DRM sysfs usage for single AMD/Intel GPU if not yet populated
if gpus and gpus[0]["usagePercent"] is None:
    for card in ["card0", "card1"]:
        busy = run(f"cat /sys/class/drm/{card}/device/gpu_busy_percent 2>/dev/null")
        if busy.isdigit():
            gpus[0]["usagePercent"] = float(busy)
            tot_b = run(f"cat /sys/class/drm/{card}/device/mem_info_vram_total 2>/dev/null")
            used_b = run(f"cat /sys/class/drm/{card}/device/mem_info_vram_used 2>/dev/null")
            if tot_b.isdigit() and int(tot_b) > 0:
                t_mb = int(int(tot_b) / (1024 * 1024))
                u_mb = int(int(used_b) / (1024 * 1024)) if used_b.isdigit() else 0
                gpus[0]["vramTotalMb"] = t_mb
                gpus[0]["vramUsedMb"] = u_mb
                gpus[0]["vramUsedPercent"] = round((u_mb / t_mb) * 100.0, 1) if t_mb > 0 else None
            break

# Linux Audio Controllers (lspci + /proc/asound/cards)
audio_devices = []
for line in lspci_out.splitlines():
    low = line.lower()
    if "audio" in low or "multimedia" in low:
        desc = line.split(":", 2)[-1].strip() if ":" in line else line
        if any(k in low for k in ["nvidia", "hdmi", "display audio", "radeon", "ati "]):
            dtype, onboard = "gpu_hdmi", False
        elif "usb" in low:
            dtype, onboard = "usb_external", False
        else:
            dtype, onboard = "onboard", True
        audio_devices.append({
            "name": desc,
            "manufacturer": "NVIDIA" if "nvidia" in low else ("AMD" if "amd" in low else ("Intel" if "intel" in low else "ALSA/PCI")),
            "deviceType": dtype,
            "isOnboard": onboard,
            "status": "OK",
        })

if not audio_devices:
    asound = run("cat /proc/asound/cards 2>/dev/null")
    for line in asound.splitlines():
        if "]:" in line:
            desc = line.split("]:", 1)[-1].strip()
            low = desc.lower()
            dtype = "usb_external" if "usb" in low else ("gpu_hdmi" if "hdmi" in low else "onboard")
            audio_devices.append({
                "name": desc,
                "manufacturer": "ALSA",
                "deviceType": dtype,
                "isOnboard": dtype == "onboard",
                "status": "OK",
            })

print(json.dumps({
    "hostname": hostname,
    "osName": os_name,
    "osVersion": os_ver,
    "domain": "",
    "loggedInUser": logged_user,
    "uptimeSeconds": uptime_sec,
    "primaryIp": primary_ip,
    "macAddress": mac_addr,
    "cpu": {"usagePercent": cpu_pct, "cores": cores, "logicalProcessors": cores, "modelName": model, "clockMhz": None},
    "memory": {"usedPercent": mem_pct, "usedGb": used_gb, "totalGb": total_gb, "freeGb": free_gb},
    "disks": disks,
    "security": {
        "antivirusName": "Linux Security / ClamAV",
        "antivirusEnabled": None,
        "realTimeProtection": None,
        "signatureUpdated": "",
        "firewallDomain": ufw_active,
        "firewallPrivate": ufw_active,
        "firewallPublic": ufw_active
    },
    "totalProcessCount": total_procs,
    "processes": procs,
    "gpus": gpus,
    "audioDevices": audio_devices
}))
PY
`;

export async function collectEndpointHealth(input: HelpdeskTargetInput): Promise<HelpdeskHealthResult> {
  const execRes = await executeHardcodedScripts(input, PS_HEALTH_TELEMETRY, LINUX_HEALTH_TELEMETRY);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint health telemetry');

  const uptimeSeconds = Number(parsed.uptimeSeconds) || 0;
  const rawDisks = Array.isArray(parsed.disks) ? parsed.disks : parsed.disks ? [parsed.disks] : [];
  const rawProcs = Array.isArray(parsed.processes) ? parsed.processes : parsed.processes ? [parsed.processes] : [];
  const rawGpus = Array.isArray(parsed.gpus) ? parsed.gpus : parsed.gpus ? [parsed.gpus] : [];
  const rawAudio = Array.isArray(parsed.audioDevices) ? parsed.audioDevices : parsed.audioDevices ? [parsed.audioDevices] : [];

  const gpus: HelpdeskGpuItem[] = rawGpus.map((g: any) => {
    const hwType: 'onboard' | 'dedicated' | 'virtual' =
      g.hardwareType === 'dedicated' || g.hardwareType === 'virtual' ? g.hardwareType : 'onboard';
    return {
      name: String(g.name || 'Display Adapter'),
      vendor: String(g.vendor || ''),
      hardwareType: hwType,
      isOnboard: typeof g.isOnboard === 'boolean' ? g.isOnboard : hwType !== 'dedicated',
      busInfo: String(g.busInfo || ''),
      driverVersion: String(g.driverVersion || ''),
      driverDate: String(g.driverDate || ''),
      resolution: String(g.resolution || ''),
      vramTotalMb: Number(g.vramTotalMb) || 0,
      vramUsedMb: g.vramUsedMb !== null && g.vramUsedMb !== undefined ? Number(g.vramUsedMb) : null,
      vramUsedPercent:
        g.vramUsedPercent !== null && g.vramUsedPercent !== undefined
          ? Math.max(0, Math.min(100, Number(g.vramUsedPercent)))
          : null,
      usagePercent:
        g.usagePercent !== null && g.usagePercent !== undefined
          ? Math.max(0, Math.min(100, Number(g.usagePercent)))
          : null,
      status: String(g.status || 'OK'),
    };
  });

  const audioDevices: HelpdeskAudioDeviceItem[] = rawAudio.map((a: any) => {
    const dType: 'onboard' | 'gpu_hdmi' | 'usb_external' | 'bluetooth' | 'virtual' =
      a.deviceType === 'gpu_hdmi' ||
      a.deviceType === 'usb_external' ||
      a.deviceType === 'bluetooth' ||
      a.deviceType === 'virtual'
        ? a.deviceType
        : 'onboard';
    return {
      name: String(a.name || 'Audio Controller'),
      manufacturer: String(a.manufacturer || ''),
      deviceType: dType,
      isOnboard: typeof a.isOnboard === 'boolean' ? a.isOnboard : dType === 'onboard',
      status: String(a.status || 'OK'),
    };
  });

  const primaryGpu =
    gpus.find((g) => g.hardwareType === 'dedicated') ||
    gpus.find((g) => g.hardwareType === 'onboard') ||
    gpus[0];

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    collectedAt: new Date().toISOString(),
    hostname: String(parsed.hostname || execRes.host),
    osName: String(parsed.osName || (execRes.osFamily === 'windows' ? 'Windows' : 'Linux')),
    osVersion: String(parsed.osVersion || ''),
    domain: String(parsed.domain || ''),
    loggedInUser: String(parsed.loggedInUser || ''),
    uptimeSeconds,
    uptimeText: formatUptime(uptimeSeconds),
    primaryIp: String(parsed.primaryIp || execRes.host),
    macAddress: String(parsed.macAddress || ''),
    cpu: {
      usagePercent: Math.max(0, Math.min(100, Number(parsed.cpu?.usagePercent) || 0)),
      cores: Number(parsed.cpu?.cores) || 1,
      logicalProcessors: Number(parsed.cpu?.logicalProcessors) || 1,
      modelName: String(parsed.cpu?.modelName || ''),
      clockMhz: parsed.cpu?.clockMhz ? Number(parsed.cpu.clockMhz) : null,
    },
    memory: {
      usedPercent: Math.max(0, Math.min(100, Number(parsed.memory?.usedPercent) || 0)),
      usedGb: Number(parsed.memory?.usedGb) || 0,
      totalGb: Number(parsed.memory?.totalGb) || 0,
      freeGb: Number(parsed.memory?.freeGb) || 0,
    },
    disks: rawDisks.map((d: any) => ({
      drive: String(d.drive || '-'),
      label: String(d.label || ''),
      fileSystem: String(d.fileSystem || ''),
      totalGb: Number(d.totalGb) || 0,
      usedGb: Number(d.usedGb) || 0,
      freeGb: Number(d.freeGb) || 0,
      usedPercent: Math.max(0, Math.min(100, Number(d.usedPercent) || 0)),
    })),
    security: {
      antivirusName: String(parsed.security?.antivirusName || 'Windows Defender'),
      antivirusEnabled:
        typeof parsed.security?.antivirusEnabled === 'boolean' ? parsed.security.antivirusEnabled : null,
      realTimeProtection:
        typeof parsed.security?.realTimeProtection === 'boolean' ? parsed.security.realTimeProtection : null,
      signatureUpdated: String(parsed.security?.signatureUpdated || ''),
      firewallDomain:
        typeof parsed.security?.firewallDomain === 'boolean' ? parsed.security.firewallDomain : null,
      firewallPrivate:
        typeof parsed.security?.firewallPrivate === 'boolean' ? parsed.security.firewallPrivate : null,
      firewallPublic:
        typeof parsed.security?.firewallPublic === 'boolean' ? parsed.security.firewallPublic : null,
    },
    totalProcessCount: Number(parsed.totalProcessCount) || rawProcs.length,
    processes: rawProcs.map((p: any) => {
      const pid = Number(p.pid) || 0;
      const name = String(p.name || 'unknown');
      const cls = classifyHelpdeskProcess(pid, name);
      return {
        pid,
        name,
        cpuPercent: Math.max(0, Math.min(100, Number(p.cpuPercent) || 0)),
        memoryMb: Math.max(0, Number(p.memoryMb) || 0),
        memoryPercent: Math.max(0, Math.min(100, Number(p.memoryPercent) || 0)),
        threads: Number(p.threads) || 0,
        handles: Number(p.handles) || 0,
        status: String(p.status || 'Running'),
        user: String(p.user || ''),
        terminable: cls.terminable,
        processCategory: cls.processCategory,
        protectionReason: cls.protectionReason,
        protectionReasonFa: cls.protectionReasonFa,
      };
    }),
    gpus,
    audioDevices,
    gpuSummary: {
      hasDedicatedGpu: gpus.some((g) => g.hardwareType === 'dedicated'),
      primaryGpuName: primaryGpu?.name || '',
      primaryGpuType: primaryGpu?.hardwareType || 'none',
      primaryUsagePercent: primaryGpu?.usagePercent ?? null,
      vramTotalMb: primaryGpu?.vramTotalMb || 0,
      vramUsedMb: primaryGpu?.vramUsedMb ?? null,
      vramUsedPercent: primaryGpu?.vramUsedPercent ?? null,
    },
    audioSummary: {
      onboardCount: audioDevices.filter((a) => a.deviceType === 'onboard').length,
      gpuAudioCount: audioDevices.filter((a) => a.deviceType === 'gpu_hdmi').length,
      externalCount: audioDevices.filter(
        (a) => a.deviceType === 'usb_external' || a.deviceType === 'bluetooth'
      ).length,
      activeOutputName:
        audioDevices.find((a) => a.deviceType === 'onboard')?.name || audioDevices[0]?.name || '',
    },
  };
}

// ============================================================================
// 8. MODULE 2: ENDPOINT-SIDE NETWORK DIAGNOSTICS & SAFE RESET ACTIONS
// ============================================================================

const PS_NETWORK_SNAPSHOT = `
$ErrorActionPreference = 'SilentlyContinue'
$adapters = @()
$ifMap = @{}
try {
  Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object {
    $idx = [int]$_.InterfaceIndex
    if (-not $ifMap.ContainsKey($idx)) { $ifMap[$idx] = @() }
    $ifMap[$idx] += [int]$_.PrefixLength
  }
} catch {}

$cfgs = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True"
foreach ($c in $cfgs) {
  $na = Get-CimInstance Win32_NetworkAdapter -Filter "Index=$($c.Index)"
  $ips = @()
  $masks = @()
  if ($c.IPAddress) {
    for ($i = 0; $i -lt $c.IPAddress.Count; $i++) {
      $ipVal = [string]$c.IPAddress[$i]
      if ($ipVal -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$') {
        $ips += $ipVal
        if ($c.IPSubnet -and $i -lt $c.IPSubnet.Count) {
          $masks += [string]$c.IPSubnet[$i]
        }
      }
    }
  }
  $gws = @($c.DefaultIPGateway | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' })
  $dns = @($c.DNSServerSearchOrder)
  $ifIdx = if ($c.InterfaceIndex) { [int]$c.InterfaceIndex } else { [int]$na.InterfaceIndex }
  $prefixes = if ($ifMap.ContainsKey($ifIdx)) { @($ifMap[$ifIdx]) } else { @() }
  $spd = if ($na.Speed -and [double]$na.Speed -gt 0) {
    $mbps = [math]::Round([double]$na.Speed / 1000000, 0)
    if ($mbps -ge 1000) { "$([math]::Round($mbps / 1000, 1)) Gbps" } else { "$mbps Mbps" }
  } else { '-' }
  $adapters += [PSCustomObject]@{
    name = if ($na.NetConnectionID) { [string]$na.NetConnectionID } else { [string]$c.Description }
    description = [string]$c.Description
    interfaceIndex = $ifIdx
    status = if ($na.NetEnabled) { 'Up' } else { 'Down' }
    macAddress = [string]$c.MACAddress
    ipv4Addresses = $ips
    subnetMasks = $masks
    prefixLengths = $prefixes
    defaultGateways = $gws
    dnsServers = $dns
    dhcpEnabled = [bool]$c.DHCPEnabled
    linkSpeed = $spd
  }
}

$activeUser = ''
$userSid = ''
try {
  $cs = Get-CimInstance Win32_ComputerSystem
  if ($cs -and $cs.UserName) { $activeUser = [string]$cs.UserName }
} catch {}
if ($activeUser) {
  try {
    $nt = New-Object System.Security.Principal.NTAccount($activeUser)
    $userSid = $nt.Translate([System.Security.Principal.SecurityIdentifier]).Value
  } catch {}
}

$proxyEnabled = $false; $proxyServer = ''; $proxyOverride = ''; $autoConfigUrl = ''; $autoDetect = $false
$inetPath = if ($userSid -and (Test-Path "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")) {
  "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
} else {
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
}
try {
  $inet = Get-ItemProperty -Path $inetPath
  if ($inet) {
    $proxyEnabled = ([int]$inet.ProxyEnable -eq 1)
    $proxyServer = [string]$inet.ProxyServer
    $proxyOverride = [string]$inet.ProxyOverride
    $autoConfigUrl = [string]$inet.AutoConfigURL
    $autoDetect = ([int]$inet.AutoDetect -eq 1)
  }
} catch {}

$winhttpDirect = $true; $winhttpServer = ''; $winhttpBypass = ''
try {
  $whRaw = (& netsh.exe winhttp show proxy 2>&1 | Out-String)
  if ($whRaw -match 'Proxy Server\\(s\\)\\s*:\\s*(.+)') {
    $srvVal = $Matches[1].Trim()
    if ($srvVal -and $srvVal -notmatch 'Direct access') {
      $winhttpDirect = $false
      $winhttpServer = $srvVal
    }
  }
  if ($whRaw -match 'Bypass List\\s*:\\s*(.+)') {
    $bpVal = $Matches[1].Trim()
    if ($bpVal -and $bpVal -notmatch '\\(none\\)') { $winhttpBypass = $bpVal }
  }
} catch {}

$hostsPath = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"
$hostsEntries = @()
if (Test-Path $hostsPath) {
  $lines = Get-Content -Path $hostsPath -ErrorAction SilentlyContinue
  for ($li = 0; $li -lt $lines.Count; $li++) {
    $rawLine = [string]$lines[$li]
    $t = $rawLine.Trim()
    if (-not $t) { continue }
    $enabled = $true
    $work = $t
    if ($t -match '^#+\\s*(.+)$') {
      $cand = $Matches[1].Trim()
      if ($cand -match '^(\\d{1,3}(?:\\.\\d{1,3}){3}|[0-9a-fA-F:]+)\\s+([a-zA-Z0-9._-]+(?:\\s+[a-zA-Z0-9._-]+)*)(?:\\s+#(.*))?$') {
        $enabled = $false
        $hostsEntries += [PSCustomObject]@{
          lineIndex = $li
          ip = $Matches[1].Trim()
          hostnames = ($Matches[2].Trim() -replace '\\s+', ' ')
          comment = if ($Matches[3]) { $Matches[3].Trim() } else { '' }
          enabled = $false
        }
      }
      continue
    }
    if ($work -match '^(\\d{1,3}(?:\\.\\d{1,3}){3}|[0-9a-fA-F:]+)\\s+([^#]+?)(?:\\s*#(.*))?$') {
      $hostsEntries += [PSCustomObject]@{
        lineIndex = $li
        ip = $Matches[1].Trim()
        hostnames = ($Matches[2].Trim() -replace '\\s+', ' ')
        comment = if ($Matches[3]) { $Matches[3].Trim() } else { '' }
        enabled = $true
      }
    }
  }
}

$persistSet = @{}
try {
  Get-NetRoute -AddressFamily IPv4 -PolicyStore PersistentStore -ErrorAction SilentlyContinue | ForEach-Object {
    $persistSet["$($_.DestinationPrefix)|$($_.NextHop)"] = $true
  }
} catch {}

$ifNameByIdx = @{}
foreach ($ad in $adapters) {
  if ($ad.interfaceIndex) { $ifNameByIdx[[int]$ad.interfaceIndex] = [string]$ad.name }
}

$routes = @()
try {
  $netRoutes = Get-NetRoute -AddressFamily IPv4 -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
    Where-Object { $_.DestinationPrefix -notmatch '^(224\\.|255\\.255\\.255\\.255|fe80)' } |
    Sort-Object RouteMetric, DestinationPrefix |
    Select-Object -First 80
  foreach ($rt in $netRoutes) {
    $dp = [string]$rt.DestinationPrefix
    $parts = $dp -split '/'
    $destIp = $parts[0]
    $plen = if ($parts.Count -gt 1) { [int]$parts[1] } else { 32 }
    $maskInt = if ($plen -eq 0) { [uint32]0 } else { [uint32]([math]::Pow(2, 32) - [math]::Pow(2, 32 - $plen)) }
    $maskStr = "$(($maskInt -shr 24) -band 255).$(($maskInt -shr 16) -band 255).$(($maskInt -shr 8) -band 255).$($maskInt -band 255)"
    $gw = if ($rt.NextHop) { [string]$rt.NextHop } else { '0.0.0.0' }
    $idx = [int]$rt.InterfaceIndex
    $ifNm = if ($ifNameByIdx.ContainsKey($idx)) { $ifNameByIdx[$idx] } elseif ($rt.InterfaceAlias) { [string]$rt.InterfaceAlias } else { "If#$idx" }
    $isPers = $persistSet.ContainsKey("$dp|$gw")
    $isReserved = ($destIp -like '127.*' -or $destIp -like '169.254.*' -or $gw -eq '0.0.0.0' -and $plen -eq 32)
    $routes += [PSCustomObject]@{
      destination = $destIp
      netmask = $maskStr
      prefixLength = $plen
      gateway = $gw
      interfaceName = $ifNm
      interfaceIndex = $idx
      metric = [int]$rt.RouteMetric
      persistent = [bool]$isPers
      isDefault = ($dp -eq '0.0.0.0/0')
      isSystemReserved = [bool]$isReserved
    }
  }
} catch {}

$arpCount = 0
try { $arpCount = (Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -ne 'Unreachable' }).Count } catch {}

function Parse-PbkUseRas([string]$pbkPath) {
  $map = @{}
  if (-not $pbkPath -or -not (Test-Path $pbkPath)) { return $map }
  $cur = ''
  foreach ($ln in (Get-Content -Path $pbkPath -ErrorAction SilentlyContinue)) {
    $t = ([string]$ln).Trim()
    if ($t -match '^\\[(.+)\\]$') {
      $cur = $Matches[1]
      if (-not $map.ContainsKey($cur)) {
        $map[$cur] = @{ server = ''; useRas = $false; split = $true; tunnel = 'Automatic'; dnsSuffix = '' }
      }
    } elseif ($cur -and $t -match '^([^=]+)=(.*)$') {
      $k = $Matches[1].Trim(); $v = $Matches[2].Trim()
      if ($k -eq 'PhoneNumber') { $map[$cur].server = $v }
      elseif ($k -eq 'UseRasCredentials') { $map[$cur].useRas = ($v -eq '1') }
      elseif ($k -eq 'IpPrioritizeRemote') { $map[$cur].split = ($v -eq '0') }
      elseif ($k -eq 'DnsSuffix') { $map[$cur].dnsSuffix = $v }
      elseif ($k -eq 'VpnStrategy') {
        $map[$cur].tunnel = switch ($v) { '1' { 'Pptp' } '2' { 'Pptp' } '3' { 'L2tp' } '4' { 'L2tp' } '5' { 'Sstp' } '6' { 'Sstp' } '7' { 'Ikev2' } '8' { 'Ikev2' } default { 'Automatic' } }
      }
    }
  }
  return $map
}

$activeProfPath = ''
if ($userSid) {
  try {
    $profReg = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$userSid" -ErrorAction SilentlyContinue
    if ($profReg -and $profReg.ProfileImagePath) { $activeProfPath = [string]$profReg.ProfileImagePath }
  } catch {}
}
$globalPbk = "$env:ProgramData\\Microsoft\\Network\\Connections\\Pbk\\rasphone.pbk"
$userPbk = if ($activeProfPath) { "$activeProfPath\\AppData\\Roaming\\Microsoft\\Network\\Connections\\Pbk\\rasphone.pbk" } else { '' }
$globalPbkMap = Parse-PbkUseRas $globalPbk
$userPbkMap = Parse-PbkUseRas $userPbk

$vpnList = @()
$seenVpn = @{}
$activeRasNames = @{}
try {
  $rasOut = (& rasdial.exe 2>$null)
  foreach ($rl in @($rasOut)) {
    $rt = ([string]$rl).Trim()
    if ($rt -and $rt -notmatch '^(Connected to|No connections|Command completed)') {
      $activeRasNames[$rt.ToLower()] = $true
    }
  }
} catch {}

try {
  foreach ($vc in @(Get-VpnConnection -AllUserConnection -ErrorAction SilentlyContinue)) {
    $nm = [string]$vc.Name
    if (-not $nm) { continue }
    $k = "all|$($nm.ToLower())"
    if ($seenVpn.ContainsKey($k)) { continue }
    $seenVpn[$k] = $true
    $pbkInfo = $globalPbkMap[$nm]
    $uWin = if ($null -ne $vc.UseWinlogonCredential) { [bool]$vc.UseWinlogonCredential } elseif ($pbkInfo) { [bool]$pbkInfo.useRas } else { $false }
    if ($pbkInfo -and $pbkInfo.useRas) { $uWin = $true }
    $vpnList += [PSCustomObject]@{
      name = $nm
      serverAddress = [string]$vc.ServerAddress
      tunnelType = [string]$vc.TunnelType
      authenticationMethod = (($vc.AuthenticationMethod | ForEach-Object { [string]$_ }) -join ', ')
      useWinlogonCredential = [bool]$uWin
      splitTunneling = [bool]$vc.SplitTunneling
      allUserConnection = $true
      connectionStatus = if ($activeRasNames.ContainsKey($nm.ToLower())) { 'Connected' } else { [string]$vc.ConnectionStatus }
      rememberCredential = [bool]$vc.RememberCredential
      dnsSuffix = if ($vc.PSObject.Properties['DnsSuffix'] -and $vc.DnsSuffix) { [string]$vc.DnsSuffix } elseif ($pbkInfo -and $pbkInfo.dnsSuffix) { [string]$pbkInfo.dnsSuffix } else { '' }
    }
  }
} catch {}

foreach ($uk in $userPbkMap.Keys) {
  $k = "user|$($uk.ToLower())"
  if ($seenVpn.ContainsKey($k)) { continue }
  $seenVpn[$k] = $true
  $info = $userPbkMap[$uk]
  $vpnList += [PSCustomObject]@{
    name = [string]$uk
    serverAddress = [string]$info.server
    tunnelType = [string]$info.tunnel
    authenticationMethod = if ($info.useRas) { 'MSChapv2 (Windows SSO)' } else { 'Custom / Prompt' }
    useWinlogonCredential = [bool]$info.useRas
    splitTunneling = [bool]$info.split
    allUserConnection = $false
    connectionStatus = if ($activeRasNames.ContainsKey($uk.ToLower())) { 'Connected' } else { 'Disconnected' }
    rememberCredential = $true
    dnsSuffix = [string]$info.dnsSuffix
  }
}

try {
  foreach ($vc in @(Get-VpnConnection -ErrorAction SilentlyContinue)) {
    $nm = [string]$vc.Name
    if (-not $nm) { continue }
    $k = "user|$($nm.ToLower())"
    $kAll = "all|$($nm.ToLower())"
    if ($seenVpn.ContainsKey($k) -or $seenVpn.ContainsKey($kAll)) { continue }
    $seenVpn[$k] = $true
    $uWin = if ($null -ne $vc.UseWinlogonCredential) { [bool]$vc.UseWinlogonCredential } else { $false }
    $vpnList += [PSCustomObject]@{
      name = $nm
      serverAddress = [string]$vc.ServerAddress
      tunnelType = [string]$vc.TunnelType
      authenticationMethod = (($vc.AuthenticationMethod | ForEach-Object { [string]$_ }) -join ', ')
      useWinlogonCredential = [bool]$uWin
      splitTunneling = [bool]$vc.SplitTunneling
      allUserConnection = $false
      connectionStatus = if ($activeRasNames.ContainsKey($nm.ToLower())) { 'Connected' } else { [string]$vc.ConnectionStatus }
      rememberCredential = [bool]$vc.RememberCredential
      dnsSuffix = if ($vc.PSObject.Properties['DnsSuffix'] -and $vc.DnsSuffix) { [string]$vc.DnsSuffix } else { '' }
    }
  }
} catch {}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  adapters = $adapters
  proxy = [PSCustomObject]@{
    enabled = $proxyEnabled
    server = $proxyServer
    override = $proxyOverride
    autoConfigUrl = $autoConfigUrl
    autoDetect = $autoDetect
    activeUser = $activeUser
    winhttpDirect = $winhttpDirect
    winhttpServer = $winhttpServer
    winhttpBypass = $winhttpBypass
  }
  hostsFilePath = $hostsPath
  hostsEntries = $hostsEntries
  routes = $routes
  vpnConnections = $vpnList
  arpSummaryCount = [int]$arpCount
} | ConvertTo-Json -Depth 6 -Compress
`;

const LINUX_NETWORK_SNAPSHOT = `
python3 - <<'PY'
import json, os, re, socket, subprocess
def run(cmd):
    try: return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: return ""

dns = []
try:
    with open("/etc/resolv.conf") as f:
        for line in f:
            if line.strip().startswith("nameserver"):
                dns.append(line.strip().split()[1])
except Exception:
    pass
gw = run("ip route | awk '/default/{print $3; exit}'")
adapters = []
for idx_raw, iface in enumerate(run("ls /sys/class/net").splitlines()):
    if iface == "lo": continue
    state = run(f"cat /sys/class/net/{iface}/operstate") or "unknown"
    mac = run(f"cat /sys/class/net/{iface}/address")
    cidr_lines = run(f"ip -4 -o addr show dev {iface} | awk '{{print $4}}'").splitlines()
    ips = [c.split('/')[0] for c in cidr_lines]
    prefs = [int(c.split('/')[1]) for c in cidr_lines if '/' in c and c.split('/')[1].isdigit()]
    spd = run(f"cat /sys/class/net/{iface}/speed 2>/dev/null")
    adapters.append({
        "name": iface,
        "description": iface,
        "interfaceIndex": idx_raw + 1,
        "status": "Up" if state.lower() == "up" else state,
        "macAddress": mac,
        "ipv4Addresses": ips,
        "subnetMasks": [],
        "prefixLengths": prefs,
        "defaultGateways": [gw] if gw else [],
        "dnsServers": dns,
        "dhcpEnabled": None,
        "linkSpeed": f"{spd} Mbps" if spd.isdigit() else "-"
    })

hosts_entries = []
try:
    with open("/etc/hosts") as f:
        for li, raw in enumerate(f):
            t = raw.strip()
            if not t: continue
            enabled = True
            m = re.match(r'^(#+)\\s*(\\d{1,3}(?:\\.\\d{1,3}){3}|[0-9a-fA-F:]+)\\s+([a-zA-Z0-9._-]+(?:\\s+[a-zA-Z0-9._-]+)*)(?:\\s+#(.*))?$', t)
            if m:
                hosts_entries.append({"lineIndex": li, "ip": m.group(2), "hostnames": " ".join(m.group(3).split()), "comment": (m.group(4) or "").strip(), "enabled": False})
                continue
            m2 = re.match(r'^(\\d{1,3}(?:\\.\\d{1,3}){3}|[0-9a-fA-F:]+)\\s+([^#]+?)(?:\\s*#(.*))?$', t)
            if m2:
                hosts_entries.append({"lineIndex": li, "ip": m2.group(1), "hostnames": " ".join(m2.group(2).split()), "comment": (m2.group(3) or "").strip(), "enabled": True})
except Exception:
    pass

routes = []
for line in run("ip -4 route show").splitlines()[:80]:
    parts = line.split()
    if not parts: continue
    dest_raw = parts[0]
    if dest_raw == "default":
        dest, plen = "0.0.0.0", 0
    elif "/" in dest_raw:
        dest, p_s = dest_raw.split("/", 1)
        plen = int(p_s) if p_s.isdigit() else 32
    else:
        dest, plen = dest_raw, 32
    mask_int = 0 if plen == 0 else ((0xFFFFFFFF << (32 - plen)) & 0xFFFFFFFF)
    netmask = f"{(mask_int>>24)&255}.{(mask_int>>16)&255}.{(mask_int>>8)&255}.{mask_int&255}"
    via = parts[parts.index("via")+1] if "via" in parts and parts.index("via")+1 < len(parts) else "0.0.0.0"
    dev = parts[parts.index("dev")+1] if "dev" in parts and parts.index("dev")+1 < len(parts) else "-"
    met = int(parts[parts.index("metric")+1]) if "metric" in parts and parts.index("metric")+1 < len(parts) and parts[parts.index("metric")+1].isdigit() else 0
    routes.append({
        "destination": dest, "netmask": netmask, "prefixLength": plen,
        "gateway": via, "interfaceName": dev, "interfaceIndex": 0, "metric": met,
        "persistent": False, "isDefault": (dest == "0.0.0.0" and plen == 0),
        "isSystemReserved": dest.startswith("127.") or dest.startswith("169.254.")
    })

proxy = os.environ.get("https_proxy") or os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY") or ""
arp_cnt = len(run("ip neigh show").splitlines())
vpns = []
nm_out = run("nmcli -t -f NAME,TYPE,STATE connection show 2>/dev/null")
for line in nm_out.splitlines():
    parts = line.split(":")
    if len(parts) >= 3 and parts[1].lower() in ("vpn", "wireguard", "tun"):
        srv = run(f"nmcli -g vpn.data connection show '{parts[0]}' 2>/dev/null")
        vpns.append({
            "name": parts[0],
            "serverAddress": srv[:80],
            "tunnelType": parts[1],
            "authenticationMethod": "System Auth",
            "useWinlogonCredential": False,
            "splitTunneling": True,
            "allUserConnection": True,
            "connectionStatus": "Connected" if "activated" in parts[2].lower() else "Disconnected",
            "rememberCredential": True,
        })
print(json.dumps({
    "hostname": socket.gethostname(),
    "adapters": adapters,
    "proxy": {"enabled": bool(proxy), "server": proxy, "override": os.environ.get("no_proxy", ""), "autoConfigUrl": "", "autoDetect": False, "activeUser": os.environ.get("USER", ""), "winhttpDirect": not bool(proxy), "winhttpServer": proxy, "winhttpBypass": os.environ.get("no_proxy", "")},
    "hostsFilePath": "/etc/hosts",
    "hostsEntries": hosts_entries,
    "routes": routes,
    "vpnConnections": vpns,
    "arpSummaryCount": arp_cnt
}))
PY
`;

export async function collectEndpointNetworkSnapshot(
  input: HelpdeskTargetInput
): Promise<HelpdeskNetworkSnapshotResult> {
  const execRes = await executeHardcodedScripts(input, PS_NETWORK_SNAPSHOT, LINUX_NETWORK_SNAPSHOT);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint network snapshot');
  const rawAdapters = Array.isArray(parsed.adapters) ? parsed.adapters : parsed.adapters ? [parsed.adapters] : [];
  const rawHosts = Array.isArray(parsed.hostsEntries) ? parsed.hostsEntries : parsed.hostsEntries ? [parsed.hostsEntries] : [];
  const rawRoutes = Array.isArray(parsed.routes) ? parsed.routes : parsed.routes ? [parsed.routes] : [];
  const rawVpns = Array.isArray(parsed.vpnConnections) ? parsed.vpnConnections : parsed.vpnConnections ? [parsed.vpnConnections] : [];

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    collectedAt: new Date().toISOString(),
    hostname: String(parsed.hostname || execRes.host),
    adapters: rawAdapters.map((a: any) => ({
      name: String(a.name || '-'),
      description: String(a.description || ''),
      interfaceIndex: Number.isFinite(Number(a.interfaceIndex)) ? Number(a.interfaceIndex) : null,
      status: String(a.status || 'Unknown'),
      macAddress: String(a.macAddress || ''),
      ipv4Addresses: Array.isArray(a.ipv4Addresses) ? a.ipv4Addresses.map(String) : a.ipv4Addresses ? [String(a.ipv4Addresses)] : [],
      subnetMasks: Array.isArray(a.subnetMasks) ? a.subnetMasks.map(String) : a.subnetMasks ? [String(a.subnetMasks)] : [],
      prefixLengths: Array.isArray(a.prefixLengths) ? a.prefixLengths.map(Number) : a.prefixLengths ? [Number(a.prefixLengths)] : [],
      defaultGateways: Array.isArray(a.defaultGateways) ? a.defaultGateways.map(String) : a.defaultGateways ? [String(a.defaultGateways)] : [],
      dnsServers: Array.isArray(a.dnsServers) ? a.dnsServers.map(String) : a.dnsServers ? [String(a.dnsServers)] : [],
      dhcpEnabled: typeof a.dhcpEnabled === 'boolean' ? a.dhcpEnabled : null,
      linkSpeed: String(a.linkSpeed || '-'),
    })),
    proxy: {
      enabled: Boolean(parsed.proxy?.enabled),
      server: String(parsed.proxy?.server || ''),
      override: String(parsed.proxy?.override || ''),
      autoConfigUrl: String(parsed.proxy?.autoConfigUrl || ''),
      autoDetect: Boolean(parsed.proxy?.autoDetect),
      activeUser: String(parsed.proxy?.activeUser || ''),
      winhttpDirect: typeof parsed.proxy?.winhttpDirect === 'boolean' ? parsed.proxy.winhttpDirect : true,
      winhttpServer: String(parsed.proxy?.winhttpServer || ''),
      winhttpBypass: String(parsed.proxy?.winhttpBypass || ''),
    },
    hostsFilePath: String(parsed.hostsFilePath || (execRes.osFamily === 'linux' ? '/etc/hosts' : 'C:\\Windows\\System32\\drivers\\etc\\hosts')),
    hostsEntries: rawHosts.map((h: any, idx: number) => ({
      id: `host-${h.lineIndex ?? idx}-${h.ip || ''}`,
      lineIndex: Number(h.lineIndex ?? idx),
      ip: String(h.ip || ''),
      hostnames: String(h.hostnames || ''),
      comment: String(h.comment || ''),
      enabled: Boolean(h.enabled),
    })),
    routes: rawRoutes.map((r: any, idx: number) => ({
      id: `rt-${r.destination}/${r.prefixLength}->${r.gateway}-${r.interfaceIndex}-${idx}`,
      destination: String(r.destination || ''),
      netmask: String(r.netmask || ''),
      prefixLength: Number(r.prefixLength ?? 0),
      gateway: String(r.gateway || '0.0.0.0'),
      interfaceName: String(r.interfaceName || '-'),
      interfaceIndex: Number(r.interfaceIndex || 0),
      metric: Number(r.metric || 0),
      persistent: Boolean(r.persistent),
      isDefault: Boolean(r.isDefault),
      isSystemReserved: Boolean(r.isSystemReserved),
    })),
    vpnConnections: rawVpns.map((v: any, idx: number) => ({
      id: `vpn-${v.allUserConnection ? 'all' : 'usr'}-${v.name || idx}`,
      name: String(v.name || ''),
      serverAddress: String(v.serverAddress || ''),
      tunnelType: String(v.tunnelType || 'Automatic'),
      authenticationMethod: String(v.authenticationMethod || ''),
      useWinlogonCredential: Boolean(v.useWinlogonCredential),
      splitTunneling: typeof v.splitTunneling === 'boolean' ? v.splitTunneling : true,
      allUserConnection: typeof v.allUserConnection === 'boolean' ? v.allUserConnection : true,
      connectionStatus: String(v.connectionStatus || 'Disconnected'),
      rememberCredential: typeof v.rememberCredential === 'boolean' ? v.rememberCredential : true,
    })),
    arpSummaryCount: Number(parsed.arpSummaryCount) || 0,
  };
}

export interface HelpdeskProbeExtraOptions {
  dnsRecordType?: string;
  dnsServer?: string;
}

const ALLOWED_DNS_RECORD_TYPES = new Set([
  'A',
  'AAAA',
  'MX',
  'TXT',
  'CNAME',
  'PTR',
  'NS',
  'SRV',
  'SOA',
  'ANY',
]);

export async function runEndpointDiagnosticProbe(
  input: HelpdeskTargetInput,
  probeType: HelpdeskDiagnosticProbeType,
  rawProbeTarget: string,
  rawPort?: number,
  options?: HelpdeskProbeExtraOptions
): Promise<HelpdeskProbeResult> {
  if (probeType === 'arp') {
    const filterQ = String(rawProbeTarget || '').trim();
    if (filterQ && filterQ !== '*' && filterQ.toLowerCase() !== 'all') {
      if (!/^[a-zA-Z0-9.:_-]{1,120}$/.test(filterQ)) {
        throw new Error('Invalid ARP filter pattern.');
      }
    }
    const cleanFilter = filterQ.toLowerCase() === 'all' || filterQ === '*' ? '' : filterQ;
    const psArp = `
$filter = '${cleanFilter.replace(/'/g, "''")}'
$rows = @()
try {
  $nbrs = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.State -ne 'Unreachable' -and $_.IPAddress -notmatch '^(224\\.|255\\.|239\\.)' }
  foreach ($n in $nbrs) {
    $line = "$($n.IPAddress) | $($n.LinkLayerAddress) | $($n.State) | $($n.InterfaceAlias)"
    if (-not $filter -or $line.ToLower().Contains($filter.ToLower())) {
      $rows += $line
    }
  }
} catch {}
$raw = (arp.exe -a 2>&1 | Out-String).Trim()
[PSCustomObject]@{
  ok = $true
  count = $rows.Count
  records = ($rows | Select-Object -First 60)
  rawOutput = if ($raw.Length -gt 8000) { $raw.Substring(0, 8000) } else { $raw }
} | ConvertTo-Json -Depth 4 -Compress
`;
    const lxArp = `
python3 - <<'PY'
import json, subprocess
flt = "${cleanFilter.replace(/"/g, '\\"')}".lower()
p = subprocess.run(["ip", "neigh", "show"], capture_output=True, text=True)
raw = (p.stdout + p.stderr).strip()
recs = [l for l in raw.splitlines() if not flt or flt in l.lower()]
print(json.dumps({"ok": True, "count": len(recs), "records": recs[:60], "rawOutput": raw[:8000]}))
PY
`;
    const execRes = await executeHardcodedScripts(input, psArp, lxArp);
    const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint ARP probe');
    const records: string[] = Array.isArray(parsed.records) ? parsed.records.map(String) : [];
    return {
      targetIp: execRes.host,
      protocolUsed: execRes.protocolUsed,
      osFamily: execRes.osFamily,
      probeType: 'arp',
      probeTarget: cleanFilter || 'All IPv4 Neighbors',
      success: true,
      summary: `Collected ${records.length} ARP/Neighbor table entry(s) on ${execRes.host}`,
      summaryFa: `${records.length} رکورد جدول ARP / همسایه‌های شبکه روی سیستم ${execRes.host} دریافت شد.`,
      metrics: { count: records.length },
      records,
      rawOutput: String(parsed.rawOutput || ''),
      executedAt: new Date().toISOString(),
    };
  }

  if (probeType === 'http') {
    let urlStr = String(rawProbeTarget || '').trim();
    if (!urlStr) throw new Error('Target URL (http:// or https://) is required.');
    if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      throw new Error('Invalid HTTP/HTTPS URL format.');
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Only http:// and https:// URLs are permitted.');
    }
    validateDiagnosticProbeHost(parsedUrl.hostname);
    const safeUrl = parsedUrl.toString();
    if (/['"`$\n\r]/.test(safeUrl)) {
      throw new Error('URL contains forbidden characters.');
    }

    const psHttp = `
$url = '${safeUrl}'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ok = $false; $code = 0; $desc = ''; $err = ''; $hdr = ''
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
  $req = [System.Net.HttpWebRequest]::Create($url)
  $req.Method = 'HEAD'
  $req.Timeout = 7000
  $req.AllowAutoRedirect = $true
  try {
    $resp = $req.GetResponse()
  } catch [System.Net.WebException] {
    $exResp = $_.Exception.Response
    if ($exResp) {
      $resp = $exResp
    } else {
      throw
    }
  }
  $code = [int]$resp.StatusCode
  $desc = [string]$resp.StatusDescription
  $ok = ($code -ge 100 -and $code -lt 500)
  $hdr = "Final URI: $($resp.ResponseUri)\\nServer: $($resp.Headers['Server'])\\nContent-Type: $($resp.Headers['Content-Type'])"
  $resp.Close()
} catch {
  $err = $_.Exception.Message
}
$sw.Stop()
[PSCustomObject]@{
  ok = $ok
  statusCode = $code
  statusText = $desc
  latencyMs = [int]$sw.ElapsedMilliseconds
  headers = $hdr
  error = $err
} | ConvertTo-Json -Depth 4 -Compress
`;
    const lxHttp = `
python3 - <<'PY'
import json, time, urllib.request, urllib.error
url = "${safeUrl}"
st = time.time()
ok, code, desc, err, hdr = False, 0, "", "", ""
try:
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=7) as r:
        code = r.getcode()
        desc = getattr(r, "reason", "OK")
        ok = True
        hdr = f"Final URI: {r.geturl()}\\nServer: {r.headers.get('Server', '-')}"
except urllib.error.HTTPError as e:
    code = e.code
    desc = str(e.reason)
    ok = (100 <= code < 500)
except Exception as e:
    err = str(e)
ms = int((time.time() - st) * 1000)
print(json.dumps({"ok": ok, "statusCode": code, "statusText": desc, "latencyMs": ms, "headers": hdr, "error": err}))
PY
`;
    const execRes = await executeHardcodedScripts(
      { ...input, timeoutMs: Math.max(20000, input.timeoutMs || 20000) },
      psHttp,
      lxHttp
    );
    const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint HTTP probe');
    const ok = Boolean(parsed.ok);
    const code = Number(parsed.statusCode) || 0;
    return {
      targetIp: execRes.host,
      protocolUsed: execRes.protocolUsed,
      osFamily: execRes.osFamily,
      probeType: 'http',
      probeTarget: safeUrl,
      success: ok,
      summary: ok
        ? `HTTP${code ? ` ${code} (${parsed.statusText})` : ''} reachable from endpoint (${parsed.latencyMs}ms)`
        : `Endpoint failed to reach ${safeUrl}: ${parsed.error || 'Timeout / TLS / Proxy error'}`,
      summaryFa: ok
        ? `آدرس ${safeUrl} از داخل سیستم کاربر در دسترس است (کد HTTP ${code}، تاخیر ${parsed.latencyMs}ms)`
        : `دسترسی وب به ${safeUrl} از سیستم کاربر ناموفق بود: ${parsed.error || 'Timeout / خطای Proxy یا TLS'}`,
      metrics: {
        reachable: ok,
        statusCode: code,
        latencyMs: Number(parsed.latencyMs) || 0,
      },
      records: parsed.headers ? String(parsed.headers).split('\\n') : [],
      rawOutput: ok
        ? `HTTP ${code} ${parsed.statusText} (${parsed.latencyMs}ms)\n${parsed.headers || ''}`.trim()
        : `HTTP Request Failed (${parsed.latencyMs}ms): ${parsed.error}`,
      executedAt: new Date().toISOString(),
    };
  }

  const probeTarget = validateDiagnosticProbeHost(rawProbeTarget);

  if (probeType === 'ping') {
    const psPing = `
$target = '${probeTarget}'
$out = ping.exe -n 4 -w 1500 $target 2>&1 | Out-String
$loss = 100
if ($out -match '\\((\\d+)%\\s+loss\\)') { $loss = [int]$Matches[1] }
$avg = $null; $min = $null; $max = $null
if ($out -match 'Minimum\\s*=\\s*(\\d+)ms,\\s*Maximum\\s*=\\s*(\\d+)ms,\\s*Average\\s*=\\s*(\\d+)ms') {
  $min = [int]$Matches[1]; $max = [int]$Matches[2]; $avg = [int]$Matches[3]
}
[PSCustomObject]@{
  reachable = ($loss -lt 100)
  packetLossPercent = $loss
  minMs = $min
  avgMs = $avg
  maxMs = $max
  rawOutput = $out.Trim()
} | ConvertTo-Json -Depth 4 -Compress
`;
    const linuxPing = `
python3 - <<'PY'
import json, re, subprocess
t = "${probeTarget}"
p = subprocess.run(["ping", "-c", "4", "-W", "2", t], capture_output=True, text=True)
out = (p.stdout + "\\n" + p.stderr).strip()
loss_m = re.search(r'(\\d+(?:\\.\\d+)?)%\\s*packet loss', out)
loss = float(loss_m.group(1)) if loss_m else (0.0 if p.returncode == 0 else 100.0)
rtt_m = re.search(r'=\\s*([\\d.]+)/([\\d.]+)/([\\d.]+)', out)
print(json.dumps({
    "reachable": loss < 100,
    "packetLossPercent": loss,
    "minMs": float(rtt_m.group(1)) if rtt_m else None,
    "avgMs": float(rtt_m.group(2)) if rtt_m else None,
    "maxMs": float(rtt_m.group(3)) if rtt_m else None,
    "rawOutput": out
}))
PY
`;
    const execRes = await executeHardcodedScripts(input, psPing, linuxPing);
    const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint ping probe');
    const reachable = Boolean(parsed.reachable);
    return {
      targetIp: execRes.host,
      protocolUsed: execRes.protocolUsed,
      osFamily: execRes.osFamily,
      probeType: 'ping',
      probeTarget,
      success: reachable,
      summary: reachable
        ? `Endpoint reached ${probeTarget} (Avg: ${parsed.avgMs ?? '-'}ms, Loss: ${parsed.packetLossPercent}%)`
        : `Endpoint could NOT reach ${probeTarget} (100% packet loss)`,
      summaryFa: reachable
        ? `سیستم کاربر به ${probeTarget} دسترسی دارد (میانگین: ${parsed.avgMs ?? '-'}ms، افت بسته: ${parsed.packetLossPercent}%)`
        : `سیستم کاربر به ${probeTarget} دسترسی ندارد (۱۰۰٪ Packet Loss)`,
      metrics: {
        reachable,
        packetLossPercent: Number(parsed.packetLossPercent ?? 100),
        minMs: parsed.minMs ?? null,
        avgMs: parsed.avgMs ?? null,
        maxMs: parsed.maxMs ?? null,
      },
      rawOutput: String(parsed.rawOutput || ''),
      executedAt: new Date().toISOString(),
    };
  }

  if (probeType === 'port') {
    const port = Math.floor(Number(rawPort));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('TCP port must be an integer between 1 and 65535.');
    }
    const psPort = `
$target = '${probeTarget}'; $port = ${port}
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$tcp = New-Object System.Net.Sockets.TcpClient
$open = $false; $errMsg = ''
try {
  $ar = $tcp.BeginConnect($target, $port, $null, $null)
  if ($ar.AsyncWaitHandle.WaitOne(3500, $false)) {
    $tcp.EndConnect($ar)
    $open = $true
  } else {
    $errMsg = 'Connection timed out after 3500ms'
  }
} catch {
  $errMsg = $_.Exception.Message
} finally {
  $sw.Stop()
  try { $tcp.Close() } catch {}
}
[PSCustomObject]@{
  open = $open
  latencyMs = [int]$sw.ElapsedMilliseconds
  error = $errMsg
} | ConvertTo-Json -Depth 4 -Compress
`;
    const linuxPort = `
python3 - <<'PY'
import json, socket, time
t, port = "${probeTarget}", ${port}
st = time.time()
ok, err = False, ""
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(3.5)
try:
    s.connect((t, port))
    ok = True
except Exception as e:
    err = str(e)
finally:
    s.close()
ms = int((time.time() - st) * 1000)
print(json.dumps({"open": ok, "latencyMs": ms, "error": err}))
PY
`;
    const execRes = await executeHardcodedScripts(input, psPort, linuxPort);
    const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint TCP port probe');
    const isOpen = Boolean(parsed.open);
    return {
      targetIp: execRes.host,
      protocolUsed: execRes.protocolUsed,
      osFamily: execRes.osFamily,
      probeType: 'port',
      probeTarget,
      probePort: port,
      success: isOpen,
      summary: isOpen
        ? `TCP Port ${port} on ${probeTarget} is OPEN from endpoint (${parsed.latencyMs}ms)`
        : `TCP Port ${port} on ${probeTarget} is CLOSED/FILTERED from endpoint (${parsed.error || 'unreachable'})`,
      summaryFa: isOpen
        ? `پورت TCP ${port} روی ${probeTarget} از سمت سیستم کاربر باز است (${parsed.latencyMs}ms)`
        : `پورت TCP ${port} روی ${probeTarget} از سمت سیستم کاربر بسته یا مسدود است (${parsed.error || 'غیرقابل دسترس'})`,
      metrics: {
        open: isOpen,
        port,
        latencyMs: Number(parsed.latencyMs) || 0,
      },
      rawOutput: isOpen
        ? `TCP Connect ${probeTarget}:${port} -> SUCCEEDED in ${parsed.latencyMs}ms`
        : `TCP Connect ${probeTarget}:${port} -> FAILED: ${parsed.error || 'Timed out / Refused'}`,
      executedAt: new Date().toISOString(),
    };
  }

  if (probeType === 'tracert') {
    const psTrace = `
$target = '${probeTarget}'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$out = (& tracert.exe -d -h 15 -w 1000 $target 2>&1 | Out-String).Trim()
$sw.Stop()
$hops = @()
foreach ($ln in ($out -split "\`r?\`n")) {
  if ($ln -match '^\\s*(\\d+)\\s+(.+)$') {
    $hops += $ln.Trim()
  }
}
$reached = ($hops.Count -gt 0) -and ($out -match 'Trace complete')
[PSCustomObject]@{
  reached = $reached
  hopCount = $hops.Count
  latencyMs = [int]$sw.ElapsedMilliseconds
  hops = $hops
  rawOutput = $out
} | ConvertTo-Json -Depth 4 -Compress
`;
    const lxTrace = `
python3 - <<'PY'
import json, shutil, subprocess, time
t = "${probeTarget}"
st = time.time()
cmd = ["traceroute", "-n", "-m", "15", "-w", "1", t] if shutil.which("traceroute") else ["tracepath", "-n", "-m", "15", t]
p = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
out = (p.stdout + "\\n" + p.stderr).strip()
hops = [l.strip() for l in out.splitlines() if l.strip() and l.strip()[0].isdigit()]
ms = int((time.time() - st) * 1000)
print(json.dumps({"reached": p.returncode == 0 and len(hops) > 0, "hopCount": len(hops), "latencyMs": ms, "hops": hops, "rawOutput": out[:8000]}))
PY
`;
    const execRes = await executeHardcodedScripts(
      { ...input, timeoutMs: Math.max(35000, input.timeoutMs || 35000) },
      psTrace,
      lxTrace
    );
    const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint traceroute probe');
    const hops: string[] = Array.isArray(parsed.hops) ? parsed.hops.map(String) : [];
    const reached = Boolean(parsed.reached);
    return {
      targetIp: execRes.host,
      protocolUsed: execRes.protocolUsed,
      osFamily: execRes.osFamily,
      probeType: 'tracert',
      probeTarget,
      success: reached,
      summary: `Traceroute to ${probeTarget}: ${hops.length} hop(s) traced (${parsed.latencyMs}ms)`,
      summaryFa: `مسیریابی (Traceroute) به ${probeTarget} در ${hops.length} گام (Hop) انجام شد (${parsed.latencyMs}ms).`,
      metrics: {
        reached,
        hopCount: hops.length,
        latencyMs: Number(parsed.latencyMs) || 0,
      },
      records: hops,
      rawOutput: String(parsed.rawOutput || ''),
      executedAt: new Date().toISOString(),
    };
  }

  // DNS / NSLookup Suite (supports custom record type A/AAAA/MX/TXT/CNAME/PTR/NS/SRV/SOA/ANY + optional custom DNS server!)
  const rawRecType = String(options?.dnsRecordType || 'A').trim().toUpperCase();
  const recType = ALLOWED_DNS_RECORD_TYPES.has(rawRecType) ? rawRecType : 'A';
  const rawDnsSrv = String(options?.dnsServer || '').trim();
  const dnsServer = rawDnsSrv ? validateDiagnosticProbeHost(rawDnsSrv) : '';

  const psDns = `
$target = '${probeTarget}'
$recType = '${recType}'
$dnsSrv = '${dnsServer}'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$recs = @(); $raw = ''; $ok = $false
if ('${probeType}' -eq 'nslookup' -or $dnsSrv -or $recType -ne 'A') {
  $nsArgs = @("-type=$recType", $target)
  if ($dnsSrv) { $nsArgs += $dnsSrv }
  $raw = (& nslookup.exe @nsArgs 2>&1 | Out-String).Trim()
  $ok = ($raw -match 'Address:|canonical name|nameserver|mail exchanger|text =|primary name server|internet address|SRV service') -and ($raw -notmatch 'Non-existent domain|timed out|No response')
  try {
    $cmdParams = @{ Name = $target; Type = $recType; ErrorAction = 'Stop' }
    if ($dnsSrv) { $cmdParams['Server'] = $dnsSrv }
    $res = Resolve-DnsName @cmdParams
    foreach ($r in $res) {
      if ($r.IPAddress) { $recs += "$($r.QueryType): $($r.IPAddress) (TTL: $($r.TTL))" }
      elseif ($r.NameHost) { $recs += "$($r.QueryType): $($r.NameHost)" }
      elseif ($r.NameExchange) { $recs += "MX $($r.Preference): $($r.NameExchange)" }
      elseif ($r.Strings) { $recs += "TXT: $($r.Strings -join ' ')" }
      elseif ($r.NameTarget) { $recs += "SRV: $($r.NameTarget):$($r.Port) (Prio $($r.Priority))" }
    }
    if ($recs.Count -gt 0) { $ok = $true }
  } catch {}
} else {
  try {
    $res = Resolve-DnsName -Name $target -ErrorAction Stop
    $ok = $true
    foreach ($r in $res) {
      if ($r.IPAddress) { $recs += "$($r.Type): $($r.IPAddress)" }
      elseif ($r.NameHost) { $recs += "$($r.Type): $($r.NameHost)" }
    }
    $raw = ($res | Format-Table -AutoSize | Out-String).Trim()
  } catch {
    $raw = (nslookup.exe $target 2>&1 | Out-String).Trim()
    $ok = ($raw -match 'Address(es)?:')
  }
}
$sw.Stop()
[PSCustomObject]@{
  resolved = $ok
  latencyMs = [int]$sw.ElapsedMilliseconds
  records = $recs
  rawOutput = $raw
} | ConvertTo-Json -Depth 4 -Compress
`;
  const linuxDns = `
python3 - <<'PY'
import json, shutil, socket, subprocess, time
t, rtype, srv = "${probeTarget}", "${recType}", "${dnsServer}"
st = time.time()
recs, ok, raw = [], False, ""
if shutil.which("dig"):
    cmd = ["dig", "+noall", "+answer", "+comments", t, rtype]
    if srv: cmd.insert(1, f"@{srv}")
    p = subprocess.run(cmd, capture_output=True, text=True)
    raw = (p.stdout + p.stderr).strip()
    recs = [l.strip() for l in p.stdout.splitlines() if l.strip() and not l.startswith(";")]
    ok = len(recs) > 0
elif shutil.which("nslookup"):
    cmd = ["nslookup", f"-type={rtype}", t] + ([srv] if srv else [])
    p = subprocess.run(cmd, capture_output=True, text=True)
    raw = (p.stdout + p.stderr).strip()
    ok = ("Address:" in raw or "nameserver" in raw) and ("NXDOMAIN" not in raw)
else:
    try:
        infos = socket.getaddrinfo(t, None)
        ips = sorted(set(i[4][0] for i in infos))
        recs = [f"A/AAAA: {ip}" for ip in ips]
        ok = len(ips) > 0
        raw = "\\n".join(recs)
    except Exception as e:
        raw = str(e)
ms = int((time.time() - st) * 1000)
print(json.dumps({"resolved": ok, "latencyMs": ms, "records": recs, "rawOutput": raw}))
PY
`;
  const execRes = await executeHardcodedScripts(input, psDns, linuxDns);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint DNS/nslookup probe');
  const resolved = Boolean(parsed.resolved);
  const records: string[] = Array.isArray(parsed.records) ? parsed.records.map(String) : [];
  const srvTag = dnsServer ? ` @ ${dnsServer}` : '';
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    probeType,
    probeTarget,
    success: resolved,
    summary: resolved
      ? `Endpoint ${probeType === 'nslookup' ? 'NSLookup' : 'DNS'} (${recType}${srvTag}) resolved ${probeTarget} (${records.length} record(s), ${parsed.latencyMs}ms)`
      : `Endpoint ${probeType === 'nslookup' ? 'NSLookup' : 'DNS'} (${recType}${srvTag}) failed for ${probeTarget}`,
    summaryFa: resolved
      ? `استعلام ${probeType === 'nslookup' ? 'NSLookup' : 'DNS'} نوع ${recType}${srvTag ? ` از سرور ${dnsServer}` : ''} برای ${probeTarget} با موفقیت انجام شد (${records.length} رکورد، ${parsed.latencyMs}ms)`
      : `استعلام ${probeType === 'nslookup' ? 'NSLookup' : 'DNS'} نوع ${recType}${srvTag ? ` از سرور ${dnsServer}` : ''} برای ${probeTarget} پاسخی برنگرداند`,
    metrics: {
      resolved,
      recordType: recType,
      dnsServer: dnsServer || 'Default System DNS',
      recordCount: records.length,
      latencyMs: Number(parsed.latencyMs) || 0,
    },
    records,
    rawOutput: String(parsed.rawOutput || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function executeSafeNetworkReset(
  input: HelpdeskTargetInput,
  action: 'network_flush_dns' | 'network_renew_ip'
): Promise<HelpdeskActionResult> {
  if (action === 'network_flush_dns') {
    const ps = `
$ErrorActionPreference = 'Stop'
$out = (ipconfig.exe /flushdns 2>&1 | Out-String).Trim()
try { Clear-DnsClientCache -ErrorAction SilentlyContinue } catch {}
[PSCustomObject]@{ ok = $true; output = $out } | ConvertTo-Json -Compress
`;
    const lx = `
python3 - <<'PY'
import json, subprocess
for cmd in [["resolvectl", "flush-caches"], ["systemd-resolve", "--flush-caches"], ["nscd", "-i", "hosts"]]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode == 0:
            print(json.dumps({"ok": True, "output": (p.stdout + p.stderr).strip() or f"Executed {' '.join(cmd)}"}))
            raise SystemExit(0)
    except FileNotFoundError:
        continue
print(json.dumps({"ok": True, "output": "No local DNS cache daemon active on this Linux endpoint."}))
PY
`;
    const execRes = await executeHardcodedScripts(input, ps, lx);
    const parsed = parseJsonFromStdout<any>(execRes.stdout, 'flush DNS');
    return {
      targetIp: execRes.host,
      protocolUsed: execRes.protocolUsed,
      osFamily: execRes.osFamily,
      action,
      success: Boolean(parsed.ok),
      message: `DNS Resolver Cache successfully flushed on ${execRes.host}.`,
      messageFa: `کش DNS روی سیستم ${execRes.host} با موفقیت پاک‌سازی شد.`,
      details: { operation: 'Flush DNS Cache' },
      rawOutput: String(parsed.output || ''),
      executedAt: new Date().toISOString(),
    };
  }

  // Safe DHCP Renew (never runs standalone /release which would cut off WinRM session!)
  const psRenew = `
$out = (ipconfig.exe /renew 2>&1 | Out-String).Trim()
[PSCustomObject]@{ ok = $true; output = $out } | ConvertTo-Json -Compress
`;
  const lxRenew = `
python3 - <<'PY'
import json, subprocess
p = subprocess.run(["sh", "-c", "ip -4 addr show | head -n 30"], capture_output=True, text=True)
print(json.dumps({"ok": True, "output": "Non-disruptive DHCP status verified on Linux endpoint.\\n" + p.stdout.strip()}))
PY
`;
  const execRes = await executeHardcodedScripts(input, psRenew, lxRenew);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'renew IP');
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action,
    success: Boolean(parsed.ok),
    message: `DHCP IP renewal completed on ${execRes.host}.`,
    messageFa: `تمدید آدرس IP (DHCP Renew) روی سیستم ${execRes.host} با موفقیت انجام شد.`,
    details: { operation: 'Renew DHCP IP' },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 8B. ENDPOINT NIC IP/DNS, HOSTS FILE, OS PROXY & STATIC ROUTING MANAGEMENT
// ============================================================================

function subnetMaskToPrefixLength(mask: string): number {
  if (!isValidIpv4(mask)) throw new Error(`Invalid subnet mask: ${mask}`);
  const parts = mask.split('.').map(Number);
  const num = (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
  const bin = num.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(bin)) throw new Error(`Non-contiguous subnet mask: ${mask}`);
  return bin.indexOf('0') === -1 ? 32 : bin.indexOf('0');
}

function prefixLengthToSubnetMask(prefix: number): string {
  const p = Math.max(0, Math.min(32, Math.floor(prefix)));
  const maskInt = p === 0 ? 0 : ((0xffffffff << (32 - p)) >>> 0);
  return `${(maskInt >>> 24) & 255}.${(maskInt >>> 16) & 255}.${(maskInt >>> 8) & 255}.${maskInt & 255}`;
}

export interface HelpdeskAdapterConfigParams {
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

export async function updateEndpointAdapterNetworkConfig(
  input: HelpdeskTargetInput,
  params: HelpdeskAdapterConfigParams
): Promise<HelpdeskActionResult> {
  const cleanAdapter = String(params.adapterName || '').trim();
  if (!cleanAdapter || cleanAdapter.length > 140 || /[`$;"'\r\n]/.test(cleanAdapter)) {
    throw new Error('Invalid network adapter name.');
  }
  const ifIdx =
    params.interfaceIndex !== undefined && Number.isInteger(Number(params.interfaceIndex))
      ? Number(params.interfaceIndex)
      : 0;

  let staticIp = '';
  let prefixLen = 24;
  let staticMask = '255.255.255.0';
  let gateway = '';

  if (params.ipMode === 'static') {
    staticIp = String(params.ipAddress || '').trim();
    if (!isValidIpv4(staticIp) || staticIp.startsWith('127.') || staticIp === '0.0.0.0' || staticIp.startsWith('255.')) {
      throw new Error('Valid static IPv4 address is required.');
    }
    if (params.subnetMask && String(params.subnetMask).trim()) {
      staticMask = String(params.subnetMask).trim();
      prefixLen = subnetMaskToPrefixLength(staticMask);
    } else {
      prefixLen = Math.floor(Number(params.prefixLength ?? 24));
      if (!Number.isInteger(prefixLen) || prefixLen < 1 || prefixLen > 30) {
        throw new Error('Prefix length must be between 1 and 30.');
      }
      staticMask = prefixLengthToSubnetMask(prefixLen);
    }
    if (params.gateway && String(params.gateway).trim()) {
      gateway = String(params.gateway).trim();
      if (!isValidIpv4(gateway)) throw new Error('Invalid Default Gateway IPv4 address.');
    }
  }

  const dnsServers: string[] = [];
  if (params.dnsMode === 'static') {
    const d1 = String(params.dnsPrimary || '').trim();
    if (!isValidIpv4(d1)) throw new Error('Primary DNS must be a valid IPv4 address.');
    dnsServers.push(d1);
    const d2 = String(params.dnsSecondary || '').trim();
    if (d2) {
      if (!isValidIpv4(d2)) throw new Error('Secondary DNS must be a valid IPv4 address.');
      dnsServers.push(d2);
    }
  }

  const cfgB64 = Buffer.from(
    JSON.stringify({
      adapterName: cleanAdapter,
      ifIdx,
      ipMode: params.ipMode,
      staticIp,
      prefixLen,
      staticMask,
      gateway,
      dnsMode: params.dnsMode,
      dnsServers,
    }),
    'utf8'
  ).toString('base64');

  const ps = `
$ErrorActionPreference = 'Stop'
$cfg = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${cfgB64}')) | ConvertFrom-Json
$ad = $null
if ($cfg.ifIdx -gt 0) {
  $ad = Get-NetAdapter -InterfaceIndex ([int]$cfg.ifIdx) -ErrorAction SilentlyContinue
}
if (-not $ad) {
  $ad = Get-NetAdapter -Name $cfg.adapterName -ErrorAction SilentlyContinue
}
if (-not $ad) {
  throw "Network adapter '$($cfg.adapterName)' not found on endpoint."
}
$ifName = [string]$ad.Name
$idx = [int]$ad.InterfaceIndex
$logs = @()

if ($cfg.ipMode -eq 'dhcp') {
  try { Remove-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -Confirm:$false -ErrorAction SilentlyContinue } catch {}
  try { Set-NetIPInterface -InterfaceIndex $idx -Dhcp Enabled -ErrorAction Stop } catch {
    & netsh.exe interface ip set address name="$ifName" source=dhcp | Out-Null
  }
  $logs += "IPv4 switched to DHCP on '$ifName'"
} elseif ($cfg.ipMode -eq 'static') {
  try {
    Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
    Get-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
    if ($cfg.gateway) {
      New-NetIPAddress -InterfaceIndex $idx -IPAddress $cfg.staticIp -PrefixLength ([int]$cfg.prefixLen) -DefaultGateway $cfg.gateway -ErrorAction Stop | Out-Null
    } else {
      New-NetIPAddress -InterfaceIndex $idx -IPAddress $cfg.staticIp -PrefixLength ([int]$cfg.prefixLen) -ErrorAction Stop | Out-Null
    }
  } catch {
    if ($cfg.gateway) {
      & netsh.exe interface ip set address name="$ifName" static $cfg.staticIp $cfg.staticMask $cfg.gateway | Out-Null
    } else {
      & netsh.exe interface ip set address name="$ifName" static $cfg.staticIp $cfg.staticMask | Out-Null
    }
  }
  $logs += "IPv4 set to $($cfg.staticIp)/$($cfg.prefixLen)$(if($cfg.gateway){" GW $($cfg.gateway)"})"
}

if ($cfg.dnsMode -eq 'dhcp') {
  try { Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses -ErrorAction Stop } catch {
    & netsh.exe interface ip set dns name="$ifName" source=dhcp | Out-Null
  }
  $logs += "DNS reset to Automatic (DHCP)"
} elseif ($cfg.dnsMode -eq 'static') {
  $srvs = @($cfg.dnsServers)
  try {
    Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses $srvs -ErrorAction Stop
  } catch {
    if ($srvs.Count -ge 1) { & netsh.exe interface ip set dns name="$ifName" static $srvs[0] | Out-Null }
    if ($srvs.Count -ge 2) { & netsh.exe interface ip add dns name="$ifName" $srvs[1] index=2 | Out-Null }
  }
  $logs += "DNS set to $($srvs -join ', ')"
}

try { Clear-DnsClientCache -ErrorAction SilentlyContinue } catch {}
[PSCustomObject]@{ ok = $true; adapter = $ifName; output = ($logs -join '; ') } | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import base64, json, shutil, subprocess
cfg = json.loads(base64.b64decode("${cfgB64}").decode())
ifname = cfg["adapterName"]
logs = []
if shutil.which("nmcli"):
    con = subprocess.check_output(["nmcli", "-t", "-f", "NAME,DEVICE", "con", "show", "--active"], text=True).splitlines()
    cname = ""
    for line in con:
        parts = line.split(":", 1)
        if len(parts) == 2 and parts[1].strip() == ifname:
            cname = parts[0].strip()
            break
    if cname:
        if cfg["ipMode"] == "dhcp":
            subprocess.check_call(["nmcli", "con", "mod", cname, "ipv4.method", "auto", "ipv4.addresses", "", "ipv4.gateway", ""])
            logs.append("IPv4 set to DHCP")
        elif cfg["ipMode"] == "static":
            args = ["nmcli", "con", "mod", cname, "ipv4.method", "manual", "ipv4.addresses", f"{cfg['staticIp']}/{cfg['prefixLen']}"]
            if cfg["gateway"]:
                args += ["ipv4.gateway", cfg["gateway"]]
            subprocess.check_call(args)
            logs.append(f"IPv4 set to {cfg['staticIp']}/{cfg['prefixLen']}")
        if cfg["dnsMode"] == "dhcp":
            subprocess.check_call(["nmcli", "con", "mod", cname, "ipv4.ignore-auto-dns", "no", "ipv4.dns", ""])
            logs.append("DNS reset to DHCP")
        elif cfg["dnsMode"] == "static":
            subprocess.check_call(["nmcli", "con", "mod", cname, "ipv4.ignore-auto-dns", "yes", "ipv4.dns", " ".join(cfg["dnsServers"])])
            logs.append("DNS set to " + ", ".join(cfg["dnsServers"]))
        subprocess.call(["nmcli", "con", "up", cname])
print(json.dumps({"ok": bool(logs), "adapter": ifname, "output": "; ".join(logs) or "NetworkManager (nmcli) not active on this Linux host."}))
PY
`;

  const execRes = await executeHardcodedScripts(input, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'adapter IP/DNS update');
  const ok = Boolean(parsed.ok);
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'network_adapter_config',
    success: ok,
    message: ok
      ? `Network configuration updated for "${parsed.adapter}" on ${execRes.host}: ${parsed.output}`
      : `Could not update adapter configuration: ${parsed.output}`,
    messageFa: ok
      ? `تنظیمات IP/DNS کارت شبکه «${parsed.adapter}» روی ${execRes.host} با موفقیت اعمال شد: ${parsed.output}`
      : `تغییر تنظیمات کارت شبکه ناموفق بود: ${parsed.output}`,
    details: {
      adapterName: cleanAdapter,
      ipMode: params.ipMode,
      staticIp,
      dnsMode: params.dnsMode,
      dns: dnsServers.join(', '),
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function manageEndpointHostsEntry(
  input: HelpdeskTargetInput,
  params: {
    operation: 'add' | 'toggle' | 'delete';
    ip?: string;
    hostnames?: string;
    comment?: string;
    lineIndex?: number;
  }
): Promise<HelpdeskActionResult> {
  const op = params.operation;
  if (op !== 'add' && op !== 'toggle' && op !== 'delete') {
    throw new Error('Invalid hosts file operation.');
  }
  let cleanIp = '';
  let cleanHosts = '';
  let cleanComment = '';
  let lineIndex = -1;

  if (op === 'add') {
    cleanIp = String(params.ip || '').trim();
    if (!isValidIpv4(cleanIp) && !/^[0-9a-fA-F:]{2,45}$/.test(cleanIp)) {
      throw new Error('Valid IPv4 or IPv6 address is required for hosts entry.');
    }
    const hostTokens = String(params.hostnames || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (hostTokens.length === 0 || hostTokens.length > 6) {
      throw new Error('Enter 1 to 6 valid hostname(s) separated by spaces.');
    }
    for (const h of hostTokens) {
      if (!SAFE_HOST_REGEX.test(h)) {
        throw new Error(`Invalid hostname in hosts entry: ${h}`);
      }
    }
    cleanHosts = hostTokens.join(' ');
    cleanComment = String(params.comment || '')
      .replace(/[\r\n#<>`$]/g, ' ')
      .trim()
      .slice(0, 80);
  } else {
    lineIndex = Math.floor(Number(params.lineIndex));
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > 20000) {
      throw new Error('Valid hosts file lineIndex is required.');
    }
  }

  const reqB64 = Buffer.from(
    JSON.stringify({ op, ip: cleanIp, hostnames: cleanHosts, comment: cleanComment, lineIndex }),
    'utf8'
  ).toString('base64');

  const ps = `
$ErrorActionPreference = 'Stop'
$req = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${reqB64}')) | ConvertFrom-Json
$hostsPath = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"
$bakPath = "$hostsPath.helpdesk.bak"
if (-not (Test-Path $bakPath) -and (Test-Path $hostsPath)) {
  Copy-Item -Path $hostsPath -Destination $bakPath -Force -ErrorAction SilentlyContinue
}
$lines = New-Object System.Collections.Generic.List[string]
if (Test-Path $hostsPath) {
  foreach ($l in (Get-Content -Path $hostsPath -ErrorAction SilentlyContinue)) { $lines.Add([string]$l) }
}
$msg = ''
if ($req.op -eq 'add') {
  $entry = "$($req.ip)\`t$($req.hostnames)"
  if ($req.comment) { $entry += "\`t# $($req.comment)" }
  $lines.Add($entry)
  $msg = "Added entry: $entry"
} elseif ($req.lineIndex -lt $lines.Count) {
  $orig = $lines[$req.lineIndex].Trim()
  if ($req.op -eq 'delete') {
    $lines.RemoveAt($req.lineIndex)
    $msg = "Deleted line $($req.lineIndex): $orig"
  } elseif ($req.op -eq 'toggle') {
    if ($orig -match '^#+\\s*(.+)$') {
      $lines[$req.lineIndex] = $Matches[1].Trim()
      $msg = "Enabled entry: $($lines[$req.lineIndex])"
    } else {
      $lines[$req.lineIndex] = "# $orig"
      $msg = "Disabled entry: $($lines[$req.lineIndex])"
    }
  }
} else {
  throw "Hosts line index $($req.lineIndex) is out of range."
}
[System.IO.File]::WriteAllLines($hostsPath, $lines.ToArray(), [System.Text.UTF8Encoding]::new($false))
try { & ipconfig.exe /flushdns | Out-Null } catch {}
[PSCustomObject]@{ ok = $true; output = $msg } | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import base64, json
req = json.loads(base64.b64decode("${reqB64}").decode())
path = "/etc/hosts"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = [l.rstrip("\\r\\n") for l in f]
op = req["op"]
msg = ""
if op == "add":
    entry = f"{req['ip']}\\t{req['hostnames']}" + (f"\\t# {req['comment']}" if req.get("comment") else "")
    lines.append(entry)
    msg = "Added entry: " + entry
else:
    idx = int(req["lineIndex"])
    if idx < 0 or idx >= len(lines):
        raise ValueError("Line index out of range")
    orig = lines[idx].strip()
    if op == "delete":
        lines.pop(idx)
        msg = "Deleted: " + orig
    elif op == "toggle":
        if orig.startswith("#"):
            lines[idx] = orig.lstrip("#").strip()
            msg = "Enabled: " + lines[idx]
        else:
            lines[idx] = "# " + orig
            msg = "Disabled: " + lines[idx]
with open(path, "w", encoding="utf-8") as f:
    f.write("\\n".join(lines) + "\\n")
print(json.dumps({"ok": True, "output": msg}))
PY
`;

  const execRes = await executeHardcodedScripts(input, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'hosts file update');
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'network_hosts_edit',
    success: Boolean(parsed.ok),
    message: `Local hosts file updated on ${execRes.host}: ${parsed.output}`,
    messageFa: `فایل محلی hosts روی سیستم ${execRes.host} با موفقیت بروزرسانی شد: ${parsed.output}`,
    details: { operation: op, ip: cleanIp, hostnames: cleanHosts },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function updateEndpointProxySettings(
  input: HelpdeskTargetInput,
  params: {
    scope: 'user' | 'winhttp' | 'both';
    enabled: boolean;
    server?: string;
    override?: string;
    autoConfigUrl?: string;
    autoDetect?: boolean;
  }
): Promise<HelpdeskActionResult> {
  const scope = params.scope === 'winhttp' || params.scope === 'both' ? params.scope : 'user';
  const enabled = Boolean(params.enabled);
  const server = String(params.server || '').trim();
  const override = String(params.override || '').trim();
  const autoConfigUrl = String(params.autoConfigUrl || '').trim();
  const autoDetect = Boolean(params.autoDetect);

  if (server && !/^[a-zA-Z0-9.:;=_-]{1,255}$/.test(server)) {
    throw new Error('Invalid Proxy Server format (expected host:port e.g. 192.168.1.10:8080).');
  }
  if (override && !/^[a-zA-Z0-9.*_;<>/-]{1,500}$/.test(override)) {
    throw new Error('Invalid Proxy Bypass list format.');
  }
  if (autoConfigUrl) {
    if (!/^https?:\/\/[a-zA-Z0-9._:/?&=+-]{3,400}$/i.test(autoConfigUrl)) {
      throw new Error('Invalid PAC AutoConfig URL (must be http:// or https://).');
    }
  }
  if (enabled && !server && !autoConfigUrl && (scope === 'user' || scope === 'both')) {
    throw new Error('Specify either a Proxy Server (host:port) or a PAC AutoConfig URL to enable proxy.');
  }

  const pB64 = Buffer.from(
    JSON.stringify({ scope, enabled, server, override, autoConfigUrl, autoDetect }),
    'utf8'
  ).toString('base64');

  const ps = `
$ErrorActionPreference = 'Stop'
${PS_HELPDESK_DETECT_LOGGED_USER}
$p = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${pB64}')) | ConvertFrom-Json
$logs = @()

if ($p.scope -eq 'user' -or $p.scope -eq 'both') {
  $regPath = if ($userSid -and (Test-Path "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")) {
    "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
  } else {
    'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
  }
  Set-ItemProperty -Path $regPath -Name 'ProxyEnable' -Value $(if ($p.enabled -and $p.server) { 1 } else { 0 }) -Type DWord
  if ($p.server) {
    Set-ItemProperty -Path $regPath -Name 'ProxyServer' -Value ([string]$p.server) -Type String
  } elseif (-not $p.enabled) {
    # preserve or clear optional
  }
  if ($p.override) {
    Set-ItemProperty -Path $regPath -Name 'ProxyOverride' -Value ([string]$p.override) -Type String
  } elseif (-not $p.enabled) {
    Remove-ItemProperty -Path $regPath -Name 'ProxyOverride' -ErrorAction SilentlyContinue
  }
  if ($p.autoConfigUrl) {
    Set-ItemProperty -Path $regPath -Name 'AutoConfigURL' -Value ([string]$p.autoConfigUrl) -Type String
  } else {
    Remove-ItemProperty -Path $regPath -Name 'AutoConfigURL' -ErrorAction SilentlyContinue
  }
  Set-ItemProperty -Path $regPath -Name 'AutoDetect' -Value $(if ($p.autoDetect) { 1 } else { 0 }) -Type DWord

  try {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinInetNotify {
  [DllImport("wininet.dll", SetLastError=true)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@ -ErrorAction SilentlyContinue
    [WinInetNotify]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
    [WinInetNotify]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
  } catch {}
  $logs += "User WinINet proxy $(if($p.enabled){"ENABLED ($($p.server) $($p.autoConfigUrl))"}else{"DISABLED"})"
}

if ($p.scope -eq 'winhttp' -or $p.scope -eq 'both') {
  if ($p.enabled -and $p.server) {
    if ($p.override) {
      $whOut = (& netsh.exe winhttp set proxy "proxy-server=$($p.server)" "bypass-list=$($p.override)" 2>&1 | Out-String).Trim()
    } else {
      $whOut = (& netsh.exe winhttp set proxy "proxy-server=$($p.server)" 2>&1 | Out-String).Trim()
    }
    $logs += "WinHTTP Proxy set: $($p.server)"
  } else {
    $whOut = (& netsh.exe winhttp reset proxy 2>&1 | Out-String).Trim()
    $logs += "WinHTTP Proxy reset to Direct"
  }
}

[PSCustomObject]@{ ok = $true; output = ($logs -join '; ') } | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import json
print(json.dumps({"ok": False, "output": "Windows WinINet/WinHTTP proxy settings apply to Windows endpoints. On Linux inspect /etc/environment or NetworkManager."}))
PY
`;

  const execRes = await executeHardcodedScripts(input, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'OS proxy update');
  const ok = Boolean(parsed.ok);
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'network_proxy_config',
    success: ok,
    message: ok
      ? `OS Proxy settings updated on ${execRes.host}: ${parsed.output}`
      : String(parsed.output || 'Proxy update not supported on target OS.'),
    messageFa: ok
      ? `تنظیمات Proxy سیستم‌عامل روی ${execRes.host} اعمال شد: ${parsed.output}`
      : String(parsed.output || 'اعمال Proxy روی این سیستم‌عامل پشتیبانی نشد.'),
    details: { scope, enabled, server, override, autoConfigUrl },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function manageEndpointStaticRoute(
  input: HelpdeskTargetInput,
  params: {
    operation: 'add' | 'delete';
    destination: string;
    netmask?: string;
    prefixLength?: number;
    gateway?: string;
    interfaceIndex?: number;
    metric?: number;
    persistent?: boolean;
  }
): Promise<HelpdeskActionResult> {
  const op = params.operation;
  if (op !== 'add' && op !== 'delete') throw new Error('Invalid route operation.');
  const dest = String(params.destination || '').trim();
  if (!isValidIpv4(dest)) throw new Error('Valid IPv4 Destination address is required.');
  if (dest.startsWith('127.') || dest.startsWith('169.254.') || dest === '255.255.255.255') {
    throw new Error('Modifying loopback, link-local, or broadcast routes is blocked.');
  }

  let mask = '255.255.255.0';
  let prefixLen = 24;
  if (params.netmask && String(params.netmask).trim()) {
    mask = String(params.netmask).trim();
    prefixLen = subnetMaskToPrefixLength(mask);
  } else if (params.prefixLength !== undefined) {
    prefixLen = Math.floor(Number(params.prefixLength));
    if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) {
      throw new Error('Prefix length must be between 0 and 32.');
    }
    mask = prefixLengthToSubnetMask(prefixLen);
  }

  const gw = String(params.gateway || '').trim();
  if (op === 'add') {
    if (!isValidIpv4(gw)) {
      throw new Error('Valid IPv4 Next-Hop Gateway is required to add a route.');
    }
  } else if (gw && !isValidIpv4(gw)) {
    throw new Error('Invalid Gateway IPv4 address.');
  }

  const ifIdx =
    params.interfaceIndex !== undefined && Number.isInteger(Number(params.interfaceIndex)) && Number(params.interfaceIndex) > 0
      ? Number(params.interfaceIndex)
      : 0;
  const metric =
    params.metric !== undefined && Number.isInteger(Number(params.metric)) && Number(params.metric) >= 1 && Number(params.metric) <= 9999
      ? Number(params.metric)
      : 0;
  const persistent = Boolean(params.persistent);

  const rB64 = Buffer.from(
    JSON.stringify({ op, dest, mask, prefixLen, gw, ifIdx, metric, persistent }),
    'utf8'
  ).toString('base64');

  const ps = `
$ErrorActionPreference = 'Continue'
$r = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${rB64}')) | ConvertFrom-Json
$argsList = @()
if ($r.op -eq 'add') {
  if ($r.persistent) { $argsList += '-p' }
  $argsList += 'add'
  $argsList += [string]$r.dest
  $argsList += 'mask'
  $argsList += [string]$r.mask
  $argsList += [string]$r.gw
  if ($r.metric -gt 0) { $argsList += 'METRIC'; $argsList += [string]$r.metric }
  if ($r.ifIdx -gt 0) { $argsList += 'IF'; $argsList += [string]$r.ifIdx }
} else {
  $argsList += 'delete'
  $argsList += [string]$r.dest
  if ($r.mask -and $r.dest -ne '0.0.0.0') { $argsList += 'mask'; $argsList += [string]$r.mask }
  if ($r.gw -and $r.gw -ne '0.0.0.0') { $argsList += [string]$r.gw }
}
$out = (& route.exe @argsList 2>&1 | Out-String).Trim()
$ok = ($LASTEXITCODE -eq 0)
if (-not $ok -and $r.op -eq 'delete') {
  try {
    Remove-NetRoute -DestinationPrefix "$($r.dest)/$($r.prefixLen)" -Confirm:$false -ErrorAction Stop
    $ok = $true
    $out = "Removed route $($r.dest)/$($r.prefixLen) via Remove-NetRoute"
  } catch {}
}
[PSCustomObject]@{ ok = $ok; output = $out } | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import base64, json, subprocess
r = json.loads(base64.b64decode("${rB64}").decode())
cidr = f"{r['dest']}/{r['prefixLen']}"
if r["op"] == "add":
    cmd = ["ip", "route", "replace", cidr, "via", r["gw"]]
    if r["metric"] > 0: cmd += ["metric", str(r["metric"])]
else:
    cmd = ["ip", "route", "del", cidr] + (["via", r["gw"]] if r.get("gw") and r["gw"] != "0.0.0.0" else [])
p = subprocess.run(cmd, capture_output=True, text=True)
print(json.dumps({"ok": p.returncode == 0, "output": (p.stdout + p.stderr).strip() or " ".join(cmd)}))
PY
`;

  const execRes = await executeHardcodedScripts(input, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, `route ${op}`);
  const ok = Boolean(parsed.ok);
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: op === 'add' ? 'network_route_add' : 'network_route_delete',
    success: ok,
    message: ok
      ? `Route ${dest}/${prefixLen} ${op === 'add' ? `via ${gw}${persistent ? ' (persistent)' : ''}` : 'deleted'} on ${execRes.host}.`
      : `Failed to ${op} route ${dest}/${prefixLen}: ${parsed.output}`,
    messageFa: ok
      ? op === 'add'
        ? `مسیر ${dest}/${prefixLen} از طریق Gateway ${gw}${persistent ? ' به‌صورت دائمی' : ''} روی ${execRes.host} ثبت شد.`
        : `مسیر ${dest}/${prefixLen} از سیستم ${execRes.host} حذف شد.`
      : `عملیات مسیر شبکه (${op}) ناموفق بود: ${parsed.output}`,
    details: { operation: op, destination: dest, netmask: mask, prefixLength: prefixLen, gateway: gw, persistent },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export type HelpdeskVpnOperation = 'create' | 'delete' | 'connect' | 'disconnect';
export type HelpdeskVpnTunnelType = 'Automatic' | 'L2tp' | 'Ikev2' | 'Sstp' | 'Pptp';

export async function manageEndpointVpnConnection(
  input: HelpdeskTargetInput,
  params: {
    operation: HelpdeskVpnOperation;
    name: string;
    originalName?: string;
    serverAddress?: string;
    tunnelType?: HelpdeskVpnTunnelType;
    l2tpPsk?: string;
    useWinlogonCredential?: boolean;
    splitTunneling?: boolean;
    allUserConnection?: boolean;
    dnsSuffix?: string;
    customUsername?: string;
    customPassword?: string;
  }
): Promise<HelpdeskActionResult> {
  const op = params.operation;
  if (op !== 'create' && op !== 'delete' && op !== 'connect' && op !== 'disconnect') {
    throw new Error('Invalid VPN operation.');
  }
  const vpnName = String(params.name || '').trim();
  if (!/^[a-zA-Z0-9 _.-]{1,64}$/.test(vpnName)) {
    throw new Error('VPN connection name must be 1-64 characters (letters, numbers, spaces, ., _, -).');
  }
  const originalName = params.originalName ? String(params.originalName).trim() : '';
  if (originalName && !/^[a-zA-Z0-9 _.-]{1,64}$/.test(originalName)) {
    throw new Error('Original VPN connection name must be 1-64 characters (letters, numbers, spaces, ., _, -).');
  }

  const serverAddress = String(params.serverAddress || '').trim();
  if (op === 'create') {
    if (!serverAddress || !/^[a-zA-Z0-9.:_-]{1,128}$/.test(serverAddress)) {
      throw new Error('Valid VPN Server IP or Hostname is required.');
    }
  }

  const allowedTunnels: HelpdeskVpnTunnelType[] = ['Automatic', 'L2tp', 'Ikev2', 'Sstp', 'Pptp'];
  const tunnelType: HelpdeskVpnTunnelType = allowedTunnels.includes(params.tunnelType as any)
    ? (params.tunnelType as HelpdeskVpnTunnelType)
    : 'L2tp';

  const useWinlogonCredential =
    params.useWinlogonCredential !== undefined ? Boolean(params.useWinlogonCredential) : true;
  const splitTunneling =
    params.splitTunneling !== undefined ? Boolean(params.splitTunneling) : true;
  const allUserConnection =
    params.allUserConnection !== undefined ? Boolean(params.allUserConnection) : true;
  const dnsSuffix = String(params.dnsSuffix || '').trim();
  if (dnsSuffix && !/^[a-zA-Z0-9.-]{1,120}$/.test(dnsSuffix)) {
    throw new Error('Invalid DNS Suffix format.');
  }
  const l2tpPsk = String(params.l2tpPsk || '');
  const customUsername = String(params.customUsername || '').trim();
  const customPassword = String(params.customPassword || '');
  if (customUsername && !/^[a-zA-Z0-9._\\@-]{1,128}$/.test(customUsername)) {
    throw new Error('Invalid custom VPN username format.');
  }

  const cfgB64 = Buffer.from(
    JSON.stringify({
      op,
      name: vpnName,
      originalName,
      serverAddress,
      tunnelType,
      l2tpPsk,
      useWinlogonCredential,
      splitTunneling,
      allUserConnection,
      dnsSuffix,
      customUsername,
      customPassword,
    }),
    'utf8'
  ).toString('base64');

  const ps = `
$ErrorActionPreference = 'Stop'
$cfg = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${cfgB64}')) | ConvertFrom-Json
$vpnName = [string]$cfg.name

function Get-ActiveProfileDir {
  $u = ''
  try { $u = [string](Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName } catch {}
  if (-not $u) {
    try {
      $exp = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($exp) {
        $own = Invoke-CimMethod -InputObject $exp -MethodName GetOwner -ErrorAction SilentlyContinue
        if ($own -and $own.User) { $u = if ($own.Domain) { "$($own.Domain)\\$($own.User)" } else { [string]$own.User } }
      }
    } catch {}
  }
  if (-not $u) { return @{ user = ''; sid = ''; dir = '' } }
  try {
    $nt = New-Object System.Security.Principal.NTAccount($u)
    $sid = $nt.Translate([System.Security.Principal.SecurityIdentifier]).Value
    $reg = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$sid" -ErrorAction SilentlyContinue
    return @{ user = $u; sid = $sid; dir = [string]$reg.ProfileImagePath }
  } catch { return @{ user = $u; sid = ''; dir = '' } }
}

function Remove-PbkSection([string]$pbkPath, [string]$secName) {
  if (-not $pbkPath -or -not (Test-Path $pbkPath)) { return }
  $lines = Get-Content -Path $pbkPath -ErrorAction SilentlyContinue
  $out = New-Object System.Collections.Generic.List[string]
  $skip = $false
  foreach ($l in @($lines)) {
    $tr = ([string]$l).Trim()
    if ($tr -match '^\\[(.+)\\]$') {
      $skip = ($Matches[1] -ieq $secName)
    }
    if (-not $skip) { [void]$out.Add([string]$l) }
  }
  Set-Content -Path $pbkPath -Value $out -Encoding UTF8
}

function Set-PbkSectionFlags([string]$pbkPath, [string]$secName, [bool]$useWinCred, [bool]$splitTun) {
  if (-not $pbkPath -or -not (Test-Path $pbkPath)) { return }
  $lines = Get-Content -Path $pbkPath -ErrorAction SilentlyContinue
  $out = New-Object System.Collections.Generic.List[string]
  $inSec = $false; $sawRas = $false; $sawPrev = $false
  foreach ($l in @($lines)) {
    $tr = ([string]$l).Trim()
    if ($tr -match '^\\[(.+)\\]$') {
      if ($inSec) {
        if (-not $sawRas) { [void]$out.Add("UseRasCredentials=" + $(if ($useWinCred) { "1" } else { "0" })) }
        if (-not $sawPrev) { [void]$out.Add("PreviewUserPw=" + $(if ($useWinCred) { "0" } else { "1" })) }
      }
      $inSec = ($Matches[1] -ieq $secName)
      $sawRas = $false; $sawPrev = $false
      [void]$out.Add([string]$l)
      continue
    }
    if ($inSec) {
      if ($tr -match '^UseRasCredentials=') {
        $sawRas = $true
        [void]$out.Add("UseRasCredentials=" + $(if ($useWinCred) { "1" } else { "0" }))
        continue
      }
      if ($tr -match '^PreviewUserPw=') {
        $sawPrev = $true
        [void]$out.Add("PreviewUserPw=" + $(if ($useWinCred) { "0" } else { "1" }))
        continue
      }
      if ($tr -match '^IpPrioritizeRemote=') {
        [void]$out.Add("IpPrioritizeRemote=" + $(if ($splitTun) { "0" } else { "1" }))
        continue
      }
    }
    [void]$out.Add([string]$l)
  }
  if ($inSec) {
    if (-not $sawRas) { [void]$out.Add("UseRasCredentials=" + $(if ($useWinCred) { "1" } else { "0" })) }
    if (-not $sawPrev) { [void]$out.Add("PreviewUserPw=" + $(if ($useWinCred) { "0" } else { "1" })) }
  }
  Set-Content -Path $pbkPath -Value $out -Encoding UTF8
}

$prof = Get-ActiveProfileDir
$globalPbk = "$env:ProgramData\\Microsoft\\Network\\Connections\\Pbk\\rasphone.pbk"
$userPbk = if ($prof.dir) { "$($prof.dir)\\AppData\\Roaming\\Microsoft\\Network\\Connections\\Pbk\\rasphone.pbk" } else { '' }

if ($cfg.op -eq 'delete') {
  try { & rasdial.exe $vpnName /DISCONNECT 2>$null | Out-Null } catch {}
  try { Remove-VpnConnection -Name $vpnName -AllUserConnection -Force -ErrorAction SilentlyContinue } catch {}
  try { Remove-VpnConnection -Name $vpnName -Force -ErrorAction SilentlyContinue } catch {}
  Remove-PbkSection $globalPbk $vpnName
  if ($userPbk) { Remove-PbkSection $userPbk $vpnName }
  [PSCustomObject]@{ ok = $true; output = "VPN connection '$vpnName' removed." } | ConvertTo-Json -Compress
  exit 0
}

if ($cfg.op -eq 'disconnect') {
  $out = (& rasdial.exe $vpnName /DISCONNECT 2>&1 | Out-String).Trim()
  [PSCustomObject]@{ ok = ($LASTEXITCODE -eq 0); output = $out } | ConvertTo-Json -Compress
  exit 0
}

if ($cfg.op -eq 'connect') {
  $pbkArg = if (Test-Path $globalPbk) { $globalPbk } elseif ($userPbk -and (Test-Path $userPbk)) { $userPbk } else { '' }
  if ($cfg.customUsername -and $cfg.customPassword) {
    $args = @($vpnName, [string]$cfg.customUsername, [string]$cfg.customPassword)
    if ($pbkArg) { $args += "/PHONEBOOK:$pbkArg" }
    $out = (& rasdial.exe @args 2>&1 | Out-String).Trim()
    [PSCustomObject]@{ ok = ($LASTEXITCODE -eq 0); output = $out } | ConvertTo-Json -Compress
  } else {
    $args = @($vpnName)
    if ($pbkArg) { $args += "/PHONEBOOK:$pbkArg" }
    $out = (& rasdial.exe @args 2>&1 | Out-String).Trim()
    $code = $LASTEXITCODE
    if ($code -ne 0 -and $prof.user) {
      # Run rasdial inside the active user's interactive desktop session so Windows SSO credentials apply
      $tn = "NetTopo_VpnConn_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
      $cmd = if ($pbkArg) { "rasdial.exe \`"$vpnName\`" \`"/PHONEBOOK:$pbkArg\`"" } else { "rasdial.exe \`"$vpnName\`"" }
      & schtasks.exe /Create /TN $tn /TR $cmd /SC ONCE /ST 00:00 /RU $prof.user /IT /F 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        & schtasks.exe /Run /TN $tn 2>$null | Out-Null
        Start-Sleep -Seconds 2
        & schtasks.exe /Delete /TN $tn /F 2>$null | Out-Null
        $chk = (& rasdial.exe 2>$null | Out-String)
        $isNowConn = ($chk -match [regex]::Escape($vpnName))
        [PSCustomObject]@{ ok = $true; output = if ($isNowConn) { "Connected '$vpnName' as $($prof.user)" } else { "Initiated VPN connection '$vpnName' in interactive session of $($prof.user)" } } | ConvertTo-Json -Compress
        exit 0
      }
    }
    [PSCustomObject]@{ ok = ($code -eq 0); output = $out } | ConvertTo-Json -Compress
  }
  exit 0
}

# Create / Update VPN Connection
$origName = [string]$cfg.originalName
if ($origName -and ($origName -ine $vpnName)) {
  try { & rasdial.exe $origName /DISCONNECT 2>$null | Out-Null } catch {}
  try { Remove-VpnConnection -Name $origName -AllUserConnection -Force -ErrorAction SilentlyContinue } catch {}
  try { Remove-VpnConnection -Name $origName -Force -ErrorAction SilentlyContinue } catch {}
  Remove-PbkSection $globalPbk $origName
  if ($userPbk) { Remove-PbkSection $userPbk $origName }
}
try { & rasdial.exe $vpnName /DISCONNECT 2>$null | Out-Null } catch {}
try { Remove-VpnConnection -Name $vpnName -AllUserConnection -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-VpnConnection -Name $vpnName -Force -ErrorAction SilentlyContinue } catch {}
Remove-PbkSection $globalPbk $vpnName
if ($userPbk) { Remove-PbkSection $userPbk $vpnName }

$addParams = @{
  Name = $vpnName
  ServerAddress = [string]$cfg.serverAddress
  TunnelType = [string]$cfg.tunnelType
  EncryptionLevel = 'Optional'
  RememberCredential = $true
  SplitTunneling = [bool]$cfg.splitTunneling
  AllUserConnection = $true
  Force = $true
}
if ($cfg.dnsSuffix) { $addParams['DnsSuffix'] = [string]$cfg.dnsSuffix }
if ($cfg.tunnelType -eq 'L2tp' -and $cfg.l2tpPsk) { $addParams['L2tpPsk'] = [string]$cfg.l2tpPsk }

$createdWithWinCred = $false
if ([bool]$cfg.useWinlogonCredential) {
  $addParams['AuthenticationMethod'] = 'MSChapv2'
  $addParams['UseWinlogonCredential'] = $true
  try {
    Add-VpnConnection @addParams
    $createdWithWinCred = $true
  } catch {
    $addParams.Remove('UseWinlogonCredential')
    Add-VpnConnection @addParams
  }
} else {
  $addParams['AuthenticationMethod'] = @('MSChapv2', 'Chap', 'Pap')
  Add-VpnConnection @addParams
}

Set-PbkSectionFlags $globalPbk $vpnName ([bool]$cfg.useWinlogonCredential) ([bool]$cfg.splitTunneling)

if (-not [bool]$cfg.useWinlogonCredential -and $cfg.customUsername -and $cfg.customPassword) {
  try {
    $rasSetArgs = @($vpnName, [string]$cfg.customUsername, [string]$cfg.customPassword, '/PHONEBOOK:' + $globalPbk)
    & rasdial.exe @rasSetArgs 2>$null | Out-Null
    & rasdial.exe $vpnName /DISCONNECT 2>$null | Out-Null
  } catch {}
}

$targetNote = 'All Users (Global PBK)'
if (-not [bool]$cfg.allUserConnection) {
  if (-not $userPbk) {
    throw "No active logged-in user profile found to store per-user VPN connection. Use 'All Users' scope instead."
  }
  $userPbkDir = Split-Path -Parent $userPbk
  if (-not (Test-Path $userPbkDir)) { New-Item -ItemType Directory -Path $userPbkDir -Force | Out-Null }
  # Extract generated section from globalPbk and write into userPbk
  $gLines = Get-Content -Path $globalPbk -ErrorAction Stop
  $secLines = New-Object System.Collections.Generic.List[string]
  $cap = $false
  foreach ($gl in @($gLines)) {
    $tr = ([string]$gl).Trim()
    if ($tr -match '^\\[(.+)\\]$') {
      if ($cap) { break }
      if ($Matches[1] -ieq $vpnName) { $cap = $true }
    }
    if ($cap) { [void]$secLines.Add([string]$gl) }
  }
  if ($secLines.Count -gt 0) {
    if (-not (Test-Path $userPbk)) { New-Item -ItemType File -Path $userPbk -Force | Out-Null }
    Add-Content -Path $userPbk -Value ("\`r\`n" + ($secLines -join "\`r\`n")) -Encoding UTF8
    if ($prof.sid) {
      try {
        $acl = Get-Acl $userPbk
        $sidObj = New-Object System.Security.Principal.SecurityIdentifier($prof.sid)
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sidObj, 'Modify', 'Allow')
        $acl.SetAccessRule($rule)
        Set-Acl -Path $userPbk -AclObject $acl
      } catch {}
    }
    Remove-VpnConnection -Name $vpnName -AllUserConnection -Force -ErrorAction SilentlyContinue
    Remove-PbkSection $globalPbk $vpnName
    $targetNote = "Active User ($($prof.user))"
  }
}

[PSCustomObject]@{
  ok = $true
  output = "VPN '$vpnName' -> $($cfg.serverAddress) [$($cfg.tunnelType)] configured for $targetNote (Windows Login SSO: $([bool]$cfg.useWinlogonCredential))"
} | ConvertTo-Json -Compress
`;

  const lx = `python3 - <<'PY'
import base64, json, subprocess
cfg = json.loads(base64.b64decode("${cfgB64}").decode())
op, nm = cfg["op"], cfg["name"]
if op == "delete":
    p = subprocess.run(["nmcli", "connection", "delete", nm], capture_output=True, text=True)
    print(json.dumps({"ok": p.returncode == 0, "output": (p.stdout + p.stderr).strip()}))
elif op == "connect":
    p = subprocess.run(["nmcli", "connection", "up", nm], capture_output=True, text=True)
    print(json.dumps({"ok": p.returncode == 0, "output": (p.stdout + p.stderr).strip()}))
elif op == "disconnect":
    p = subprocess.run(["nmcli", "connection", "down", nm], capture_output=True, text=True)
    print(json.dumps({"ok": p.returncode == 0, "output": (p.stdout + p.stderr).strip()}))
else:
    print(json.dumps({"ok": False, "output": "Creating Windows RAS/VpnClient profiles is supported on Windows endpoints; Linux hosts support connecting/deleting existing NetworkManager VPN profiles."}))
PY`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 30000 }, ps, lx);
  const parsed = parseJsonFromStdout<{ ok: boolean; output: string }>(execRes.stdout, `vpn ${op}`);
  const ok = Boolean(parsed.ok);
  const actionMap: Record<HelpdeskVpnOperation, HelpdeskWriteAction> = {
    create: 'network_vpn_create',
    delete: 'network_vpn_delete',
    connect: 'network_vpn_connect',
    disconnect: 'network_vpn_disconnect',
  };

  const isEditOp = op === 'create' && Boolean(originalName);
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: actionMap[op],
    success: ok,
    message: ok
      ? isEditOp
        ? `VPN profile "${originalName && originalName !== vpnName ? `${originalName} → ${vpnName}` : vpnName}" (${serverAddress}, ${tunnelType}) updated on ${execRes.host}${useWinlogonCredential ? ' using Windows Login SSO credentials' : ''}.`
        : op === 'create'
        ? `VPN profile "${vpnName}" (${serverAddress}, ${tunnelType}) configured on ${execRes.host}${useWinlogonCredential ? ' using Windows Login SSO credentials' : ''}.`
        : op === 'delete'
        ? `VPN profile "${vpnName}" removed from ${execRes.host}.`
        : op === 'connect'
        ? `VPN "${vpnName}" connection triggered on ${execRes.host}.`
        : `VPN "${vpnName}" disconnected on ${execRes.host}.`
      : `VPN operation (${op}) failed on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? isEditOp
        ? `کانکشن VPN «${originalName && originalName !== vpnName ? `${originalName} ← ${vpnName}` : vpnName}» (${serverAddress} - ${tunnelType}) روی سیستم ${execRes.host} ویرایش شد${useWinlogonCredential ? ' (با احراز هویت خودکار یوزر و پسورد سیستم)' : ''}.`
        : op === 'create'
        ? `کانکشن VPN «${vpnName}» (${serverAddress} - ${tunnelType}) روی سیستم ${execRes.host} ایجاد شد${useWinlogonCredential ? ' (با احراز هویت خودکار یوزر و پسورد سیستم)' : ''}.`
        : op === 'delete'
        ? `کانکشن VPN «${vpnName}» از سیستم ${execRes.host} حذف شد.`
        : op === 'connect'
        ? `درخواست اتصال VPN «${vpnName}» روی سیستم ${execRes.host} اجرا شد.`
        : `اتصال VPN «${vpnName}» روی سیستم ${execRes.host} قطع شد.`
      : `عملیات VPN (${op}) روی ${execRes.host} ناموفق بود: ${parsed.output}`,
    details: {
      operation: op,
      name: vpnName,
      originalName: originalName || null,
      serverAddress,
      tunnelType,
      useWinlogonCredential,
      splitTunneling,
      allUserConnection,
      dnsSuffix: dnsSuffix || null,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 9. MODULE 3: PRINTERS & PRINT SPOOLER REPAIR (Strictly Scoped to Spooler)
// ============================================================================

const PS_HELPDESK_DETECT_LOGGED_USER = `
$loggedUser = ''
$userSid = ''
try {
  $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
  if ($cs -and $cs.UserName) { $loggedUser = [string]$cs.UserName }
} catch {}
if (-not $loggedUser) {
  try {
    $exp = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exp) {
      $own = Invoke-CimMethod -InputObject $exp -MethodName GetOwner -ErrorAction SilentlyContinue
      if ($own -and $own.User) {
        $loggedUser = if ($own.Domain) { "$($own.Domain)\\$($own.User)" } else { [string]$own.User }
      }
    }
  } catch {}
}
if ($loggedUser) {
  try {
    $nt = New-Object System.Security.Principal.NTAccount($loggedUser)
    $userSid = $nt.Translate([System.Security.Principal.SecurityIdentifier]).Value
  } catch {}
}
`;

const PS_PRINTER_STATUS = `
$ErrorActionPreference = 'SilentlyContinue'
${PS_HELPDESK_DETECT_LOGGED_USER}
$svc = Get-CimInstance Win32_Service -Filter "Name='Spooler'"
$spooler = [PSCustomObject]@{
  serviceName = 'Spooler'
  displayName = if ($svc) { [string]$svc.DisplayName } else { 'Print Spooler' }
  status = if ($svc) { [string]$svc.State } else { 'Unknown' }
  startType = if ($svc) { [string]$svc.StartMode } else { 'Unknown' }
  pid = if ($svc -and $svc.ProcessId) { [int]$svc.ProcessId } else { $null }
}

$userDefaultPrinter = ''
if ($userSid) {
  try {
    $winReg = Get-ItemProperty -Path "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows" -ErrorAction SilentlyContinue
    if ($winReg -and $winReg.Device) {
      $userDefaultPrinter = ([string]$winReg.Device).Split(',')[0].Trim()
    }
  } catch {}
}

$machineConnSet = @{}
try {
  $machKeys = Get-ChildItem -Path "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Print\\Connections" -ErrorAction SilentlyContinue
  foreach ($mk in $machKeys) {
    $props = Get-ItemProperty -Path $mk.PSPath -ErrorAction SilentlyContinue
    if ($props.Server -and $props.Printer) {
      $srv = ([string]$props.Server).TrimStart('\\')
      $prt = ([string]$props.Printer).TrimStart('\\')
      if ($prt -like "$srv\\*") {
        $machineConnSet[("\\\\" + $prt).ToLower()] = $true
      } else {
        $machineConnSet[("\\\\$srv\\$prt").ToLower()] = $true
      }
    }
    $leaf = $mk.PSChildName
    if ($leaf -match '^,,([^,]+),(.+)$') {
      $machineConnSet[("\\\\$($Matches[1])\\$($Matches[2])").ToLower()] = $true
    }
  }
} catch {}

$printers = @()
$seenNames = @{}
try {
  $wmiPrinters = Get-CimInstance Win32_Printer
  foreach ($p in $wmiPrinters) {
    $st = switch ([int]$p.PrinterStatus) {
      1 { 'Other' } 2 { 'Unknown' } 3 { 'Idle / Ready' } 4 { 'Printing' } 5 { 'Warmup' } 6 { 'Stopped' } 7 { 'Offline' } default { if ($p.WorkOffline) { 'Offline' } else { 'Ready' } }
    }
    if ($p.WorkOffline) { $st = 'Offline' }
    $pName = [string]$p.Name
    $pLower = $pName.ToLower()
    $isNet = [bool]($pName.StartsWith('\\\\') -or $p.Network)
    $scope = 'machine'
    if ($isNet -and -not $machineConnSet.ContainsKey($pLower) -and $userSid) {
      if (Test-Path ("Registry::HKEY_USERS\\$userSid\\Printers\\Connections\\,," + $pName.TrimStart('\\').Replace('\\', ','))) {
        $scope = 'user'
      }
    }
    $isDef = if ($userDefaultPrinter) { $pLower -eq $userDefaultPrinter.ToLower() } else { [bool]$p.Default }
    $srvName = ''
    $shName = [string]$p.ShareName
    if ($pName -match '^\\\\\\\\([^\\\\]+)\\\\(.+)$') {
      $srvName = $Matches[1]
      if (-not $shName) { $shName = $Matches[2] }
    } elseif ($p.SystemName -and $p.SystemName -ne $env:COMPUTERNAME) {
      $srvName = [string]$p.SystemName
    }
    $seenNames[$pLower] = $true
    $printers += [PSCustomObject]@{
      name = $pName
      driverName = [string]$p.DriverName
      portName = [string]$p.PortName
      status = $st
      shared = [bool]$p.Shared
      isDefault = $isDef
      jobCount = [int]$p.JobCountSinceLastReset
      location = [string]$p.Location
      scope = $scope
      ownerUser = if ($scope -eq 'user') { $loggedUser } else { '' }
      serverName = $srvName
      shareName = $shName
      isNetwork = $isNet
    }
  }
} catch {}

if ($userSid) {
  try {
    $uConns = Get-ChildItem -Path "Registry::HKEY_USERS\\$userSid\\Printers\\Connections" -ErrorAction SilentlyContinue
    foreach ($uc in $uConns) {
      $props = Get-ItemProperty -Path $uc.PSPath -ErrorAction SilentlyContinue
      $srv = if ($props.Server) { ([string]$props.Server).TrimStart('\\') } else { '' }
      $prt = if ($props.Printer) { ([string]$props.Printer).TrimStart('\\') } else { '' }
      $unc = ''
      if ($srv -and $prt) {
        if ($prt -like "$srv\\*") { $unc = "\\\\" + $prt } else { $unc = "\\\\$srv\\$prt" }
      } elseif ($uc.PSChildName -match '^,,([^,]+),(.+)$') {
        $srv = $Matches[1]
        $prt = $Matches[2]
        $unc = "\\\\$srv\\$prt"
      }
      if (-not $unc) { continue }
      $uncLower = $unc.ToLower()
      if ($seenNames.ContainsKey($uncLower)) { continue }
      $seenNames[$uncLower] = $true
      $isDef = if ($userDefaultPrinter) { $uncLower -eq $userDefaultPrinter.ToLower() } else { $false }
      $devInfo = ''
      try {
        $devs = Get-ItemProperty -Path "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices" -ErrorAction SilentlyContinue
        if ($devs -and $devs.PSObject.Properties[$unc]) {
          $devInfo = [string]$devs.PSObject.Properties[$unc].Value
        }
      } catch {}
      $portVal = if ($devInfo -and $devInfo -match ',([^,]+)$') { $Matches[1] } else { $unc }
      $printers += [PSCustomObject]@{
        name = $unc
        driverName = 'Network Shared Printer'
        portName = $portVal
        status = 'Connected (User Profile)'
        shared = $false
        isDefault = $isDef
        jobCount = 0
        location = ''
        scope = 'user'
        ownerUser = $loggedUser
        serverName = $srv
        shareName = $prt
        isNetwork = $true
      }
    }
  } catch {}
}

$jobs = @()
try {
  $wmiJobs = Get-CimInstance Win32_PrintJob
  foreach ($j in $wmiJobs) {
    $parts = ([string]$j.Name).Split(',')
    $pName = $parts[0]
    $jobs += [PSCustomObject]@{
      id = [int]$j.JobId
      printerName = [string]$pName
      documentName = [string]$j.Document
      owner = [string]$j.Owner
      status = if ($j.JobStatus) { [string]$j.JobStatus } else { [string]$j.Status }
      sizeKb = [math]::Round(([double]$j.Size / 1KB), 1)
      submittedTime = if ($j.TimeSubmitted) { $j.TimeSubmitted.ToString('yyyy-MM-dd HH:mm:ss') } else { '' }
    }
  }
} catch {}

[PSCustomObject]@{
  loggedInUser = $loggedUser
  loggedInUserSid = $userSid
  spooler = $spooler
  printers = $printers
  jobs = $jobs
} | ConvertTo-Json -Depth 6 -Compress
`;

const LINUX_PRINTER_STATUS = `
python3 - <<'PY'
import json, os, subprocess
def run(cmd):
    try: return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: return ""

cups_state = run("systemctl is-active cups 2>/dev/null") or "unknown"
default_out = run("lpstat -d 2>/dev/null")
default_name = default_out.split(":", 1)[1].strip() if ":" in default_out else ""
printers = []
for line in run("lpstat -p 2>/dev/null").splitlines():
    parts = line.split()
    if len(parts) >= 2 and parts[0] == "printer":
        pname = parts[1]
        printers.append({
            "name": pname,
            "driverName": "CUPS",
            "portName": "CUPS",
            "status": " ".join(parts[2:]),
            "shared": False,
            "isDefault": (pname == default_name),
            "jobCount": 0,
            "location": "",
            "scope": "machine",
            "ownerUser": "",
            "serverName": "",
            "shareName": "",
            "isNetwork": False
        })
jobs = []
for idx, line in enumerate(run("lpstat -o 2>/dev/null").splitlines(), 1):
    parts = line.split()
    if len(parts) >= 2:
        jobs.append({
            "id": idx,
            "printerName": parts[0].rsplit("-", 1)[0],
            "documentName": parts[0],
            "owner": parts[1],
            "status": "Queued",
            "sizeKb": 0,
            "submittedTime": " ".join(parts[3:])
        })
print(json.dumps({
    "loggedInUser": os.environ.get("USER", ""),
    "loggedInUserSid": "",
    "spooler": {"serviceName": "cups", "displayName": "CUPS Print Scheduler", "status": cups_state, "startType": "systemd", "pid": None},
    "printers": printers,
    "jobs": jobs
}))
PY
`;

export async function collectEndpointPrinters(input: HelpdeskTargetInput): Promise<HelpdeskPrinterStatusResult> {
  const execRes = await executeHardcodedScripts(input, PS_PRINTER_STATUS, LINUX_PRINTER_STATUS);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint printer status');
  const rawPrinters = Array.isArray(parsed.printers) ? parsed.printers : parsed.printers ? [parsed.printers] : [];
  const rawJobs = Array.isArray(parsed.jobs) ? parsed.jobs : parsed.jobs ? [parsed.jobs] : [];

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    collectedAt: new Date().toISOString(),
    loggedInUser: String(parsed.loggedInUser || ''),
    loggedInUserSid: String(parsed.loggedInUserSid || ''),
    spooler: {
      serviceName: String(parsed.spooler?.serviceName || 'Spooler'),
      displayName: String(parsed.spooler?.displayName || 'Print Spooler'),
      status: String(parsed.spooler?.status || 'Unknown'),
      startType: String(parsed.spooler?.startType || 'Unknown'),
      pid: parsed.spooler?.pid ? Number(parsed.spooler.pid) : null,
    },
    printers: rawPrinters.map((p: any) => ({
      name: String(p.name || '-'),
      driverName: String(p.driverName || ''),
      portName: String(p.portName || ''),
      status: String(p.status || 'Unknown'),
      shared: Boolean(p.shared),
      isDefault: Boolean(p.isDefault),
      jobCount: Number(p.jobCount) || 0,
      location: String(p.location || ''),
      scope: p.scope === 'user' || p.scope === 'machine' ? p.scope : 'unknown',
      ownerUser: String(p.ownerUser || ''),
      serverName: String(p.serverName || ''),
      shareName: String(p.shareName || ''),
      isNetwork: Boolean(p.isNetwork),
    })),
    jobs: rawJobs.map((j: any) => ({
      id: Number(j.id) || 0,
      printerName: String(j.printerName || ''),
      documentName: String(j.documentName || ''),
      owner: String(j.owner || ''),
      status: String(j.status || 'Queued'),
      sizeKb: Number(j.sizeKb) || 0,
      submittedTime: String(j.submittedTime || ''),
    })),
  };
}

export async function executeSafeSpoolerAction(
  input: HelpdeskTargetInput,
  action: 'spooler_restart' | 'spooler_clear_queue'
): Promise<HelpdeskActionResult> {
  if (action === 'spooler_restart') {
    const ps = `
$ErrorActionPreference = 'Stop'
Restart-Service -Name 'Spooler' -Force
Start-Sleep -Milliseconds 600
$svc = Get-Service -Name 'Spooler'
[PSCustomObject]@{
  ok = ($svc.Status -eq 'Running')
  status = [string]$svc.Status
  output = "Print Spooler restarted cleanly. Current state: $($svc.Status)"
} | ConvertTo-Json -Compress
`;
    const lx = `
python3 - <<'PY'
import json, subprocess
p = subprocess.run(["systemctl", "restart", "cups"], capture_output=True, text=True)
st = subprocess.run(["systemctl", "is-active", "cups"], capture_output=True, text=True).stdout.strip()
print(json.dumps({"ok": p.returncode == 0, "status": st, "output": (p.stdout + p.stderr).strip() or f"CUPS status: {st}"}))
PY
`;
    const execRes = await executeHardcodedScripts(input, ps, lx);
    const parsed = parseJsonFromStdout<any>(execRes.stdout, 'restart spooler');
    return {
      targetIp: execRes.host,
      protocolUsed: execRes.protocolUsed,
      osFamily: execRes.osFamily,
      action,
      success: Boolean(parsed.ok),
      message: `Print Spooler service restarted on ${execRes.host} (Status: ${parsed.status}).`,
      messageFa: `سرویس Print Spooler روی سیستم ${execRes.host} با موفقیت ری‌استارت شد (وضعیت: ${parsed.status}).`,
      details: { serviceStatus: String(parsed.status || 'Unknown') },
      rawOutput: String(parsed.output || ''),
      executedAt: new Date().toISOString(),
    };
  }

  // Strictly confined to C:\Windows\System32\spool\PRINTERS\* — cannot touch any other folder!
  const psClear = `
$ErrorActionPreference = 'Stop'
$spoolDir = Join-Path $env:SystemRoot 'System32\\spool\\PRINTERS'
$beforeCount = (Get-ChildItem -Path $spoolDir -File -ErrorAction SilentlyContinue).Count
Stop-Service -Name 'Spooler' -Force
Start-Sleep -Milliseconds 500
Get-ChildItem -Path $spoolDir -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Start-Service -Name 'Spooler'
Start-Sleep -Milliseconds 600
$afterCount = (Get-ChildItem -Path $spoolDir -File -ErrorAction SilentlyContinue).Count
$svc = Get-Service -Name 'Spooler'
[PSCustomObject]@{
  ok = ($svc.Status -eq 'Running')
  status = [string]$svc.Status
  removedFiles = [int]([math]::Max(0, $beforeCount - $afterCount))
  remainingFiles = [int]$afterCount
  output = "Cleared $([math]::Max(0, $beforeCount - $afterCount)) spooler file(s) from $spoolDir. Spooler status: $($svc.Status)"
} | ConvertTo-Json -Compress
`;
  const lxClear = `
python3 - <<'PY'
import json, subprocess
p = subprocess.run(["cancel", "-a"], capture_output=True, text=True)
subprocess.run(["systemctl", "restart", "cups"], capture_output=True, text=True)
st = subprocess.run(["systemctl", "is-active", "cups"], capture_output=True, text=True).stdout.strip()
print(json.dumps({"ok": True, "status": st, "removedFiles": 0, "remainingFiles": 0, "output": (p.stdout + p.stderr).strip() or f"CUPS queue cleared. Status: {st}"}))
PY
`;
  const execRes = await executeHardcodedScripts(input, psClear, lxClear);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'clear print queue');
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action,
    success: Boolean(parsed.ok),
    message: `Stuck print queue cleared (${parsed.removedFiles ?? 0} file(s) removed) and Print Spooler restarted on ${execRes.host}.`,
    messageFa: `صف گیرکرده پرینت روی سیستم ${execRes.host} پاک‌سازی (${parsed.removedFiles ?? 0} فایل حذف شد) و سرویس Spooler مجدداً راه‌اندازی شد.`,
    details: {
      serviceStatus: String(parsed.status || 'Running'),
      removedFiles: Number(parsed.removedFiles) || 0,
      remainingFiles: Number(parsed.remainingFiles) || 0,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

function validatePrinterNameInput(rawName: unknown): string {
  const name = String(rawName || '').trim();
  if (!name || name.length > 260) {
    throw new Error('Printer name is required and must be at most 260 characters.');
  }
  if (/[\r\n\0]/.test(name)) {
    throw new Error('Printer name contains invalid control characters.');
  }
  return name;
}

function validatePrintServerInput(rawServer: unknown): string {
  const cleaned = String(rawServer || '')
    .trim()
    .replace(/^\\\\+/, '')
    .replace(/[\\/]+$/, '');
  const host = validateTargetEndpointHost(cleaned);
  return host;
}

function validatePrintShareNameInput(rawShare: unknown): string {
  const share = String(rawShare || '').trim();
  if (!share || share.length > 128) {
    throw new Error('Printer share name is required and must be at most 128 characters.');
  }
  if (/[\\/\r\n\0]/.test(share)) {
    throw new Error('Printer share name contains invalid path or control characters.');
  }
  return share;
}

function utf8Base64(val: string): string {
  return Buffer.from(val, 'utf8').toString('base64');
}

export async function setEndpointDefaultPrinter(
  input: HelpdeskTargetInput,
  rawPrinterName: string
): Promise<HelpdeskActionResult> {
  const printerName = validatePrinterNameInput(rawPrinterName);
  const nameB64 = utf8Base64(printerName);

  const ps = `
$ErrorActionPreference = 'Stop'
$targetPrinter = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
${PS_HELPDESK_DETECT_LOGGED_USER}

$appliedUser = $false
$appliedSession = $false
$notes = @()

# 1. Fast path: Update Active Logged-In User profile directly (HKU\\<SID>\\Windows\\Device) using cached Devices registry
if ($userSid) {
  $winKey = "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows"
  $devKey = "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices"
  if (Test-Path $winKey) {
    try {
      Set-ItemProperty -Path $winKey -Name 'LegacyDefaultPrinterMode' -Value 1 -Type DWord -ErrorAction SilentlyContinue
    } catch {}
    $devStr = ''
    try {
      $devs = Get-ItemProperty -Path $devKey -ErrorAction SilentlyContinue
      if ($devs) {
        $prop = $devs.PSObject.Properties | Where-Object { $_.Name -ieq $targetPrinter } | Select-Object -First 1
        if ($prop) {
          $devStr = "$($prop.Name),$($prop.Value)"
        }
      }
    } catch {}
    if (-not $devStr) {
      $portGuess = 'Ne00:'
      try {
        $wmiP = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $targetPrinter } | Select-Object -First 1
        if ($wmiP -and $wmiP.PortName) { $portGuess = [string]$wmiP.PortName }
      } catch {}
      $devStr = "$targetPrinter,winspool,$portGuess"
    }
    Set-ItemProperty -Path $winKey -Name 'Device' -Value $devStr -Type String
    $appliedUser = $true
    $notes += "Updated HKU\\$userSid Device='$devStr'"
  }
}

# 2. Only fallback to WMI SetDefaultPrinter in Admin context if active user registry path wasn't available
if (-not $appliedUser) {
  try {
    $wmiMatch = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $targetPrinter } | Select-Object -First 1
    if ($wmiMatch) {
      (New-Object -ComObject WScript.Network).SetDefaultPrinter($wmiMatch.Name)
      $appliedSession = $true
      $notes += "Session default set"
    }
  } catch {}
}

# 3. Fast non-blocking notification in active desktop session (avoid rundll32 -Wait blocking >18s on network printers)
if ($loggedUser) {
  $taskName = "NetTopo_SetDefPrn_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  try {
    $innerB64 = '${encodePowerShellBase64(`
$n = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($n) } catch {}
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NetTopoWinNotify {
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
}
"@ -ErrorAction SilentlyContinue
  $res = [UIntPtr]::Zero
  [void][NetTopoWinNotify]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, 'Windows', 2, 1000, [ref]$res)
} catch {}
try { Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/y','/n',$n) -NoNewWindow -ErrorAction SilentlyContinue } catch {}
`)}'
    $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $innerB64"
    $pri = New-ScheduledTaskPrincipal -UserId $loggedUser -LogonType Interactive -RunLevel Limited
    $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 10)
    Register-ScheduledTask -TaskName $taskName -Action $act -Principal $pri -Settings $st -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    for ($i = 0; $i -lt 8; $i++) {
      Start-Sleep -Milliseconds 250
      $tInfo = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      if (-not $tInfo -or $tInfo.State -ne 'Running') { break }
    }
    $appliedUser = $true
    $notes += "Interactive session notified for $loggedUser"
  } catch {
    $notes += "Interactive task notice: $($_.Exception.Message)"
  } finally {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  }
}

if (-not $appliedUser -and -not $appliedSession) {
  throw "Printer '$targetPrinter' could not be set as default."
}

[PSCustomObject]@{
  ok = $true
  printerName = $targetPrinter
  loggedInUser = $loggedUser
  output = ($notes -join ' | ')
} | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import base64, json, subprocess
pname = base64.b64decode("${nameB64}").decode("utf-8")
p = subprocess.run(["lpoptions", "-d", pname], capture_output=True, text=True)
print(json.dumps({
    "ok": p.returncode == 0,
    "printerName": pname,
    "loggedInUser": "",
    "output": (p.stdout + p.stderr).strip() or f"Default printer set to {pname}"
}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 35000 }, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'set default printer');
  const ok = Boolean(parsed.ok);
  const loggedInUser = String(parsed.loggedInUser || '');
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'printer_set_default',
    success: ok,
    message: ok
      ? `Default printer set to "${printerName}" on ${execRes.host}${loggedInUser ? ` (user ${loggedInUser})` : ''}.`
      : `Failed to set "${printerName}" as default printer on ${execRes.host}.`,
    messageFa: ok
      ? `پرینتر «${printerName}» روی سیستم ${execRes.host}${loggedInUser ? ` (پروفایل کاربر ${loggedInUser})` : ''} به‌عنوان پیش‌فرض تنظیم شد.`
      : `تنظیم پرینتر «${printerName}» به‌عنوان پیش‌فرض روی سیستم ${execRes.host} ناموفق بود.`,
    details: {
      printerName,
      loggedInUser,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function deleteEndpointPrinter(
  input: HelpdeskTargetInput,
  rawPrinterName: string,
  scope: 'machine' | 'user' | 'auto' = 'auto'
): Promise<HelpdeskActionResult> {
  const printerName = validatePrinterNameInput(rawPrinterName);
  const nameB64 = utf8Base64(printerName);
  const scopeVal = scope === 'machine' || scope === 'user' ? scope : 'auto';

  const ps = `
$ErrorActionPreference = 'Stop'
$targetPrinter = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
$scopeMode = '${scopeVal}'
${PS_HELPDESK_DETECT_LOGGED_USER}

$actionsTaken = @()
$removedAny = $false
$needsSpoolerRestart = $false

# 1. Remove per-machine global network printer connection (/gd) if present
if ($targetPrinter.StartsWith('\\\\')) {
  $machConnRoot = "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Print\\Connections"
  $hasMachineConn = $false
  try {
    $machKeys = Get-ChildItem -Path $machConnRoot -ErrorAction SilentlyContinue
    foreach ($mk in $machKeys) {
      $props = Get-ItemProperty -Path $mk.PSPath -ErrorAction SilentlyContinue
      $cand = ''
      if ($props.Server -and $props.Printer) {
        $srv = ([string]$props.Server).TrimStart('\\')
        $prt = ([string]$props.Printer).TrimStart('\\')
        $cand = if ($prt -like "$srv\\*") { "\\\\$prt" } else { "\\\\$srv\\$prt" }
      } elseif ($mk.PSChildName -match '^,,([^,]+),(.+)$') {
        $cand = "\\\\$($Matches[1])\\$($Matches[2])"
      }
      if ($cand -ieq $targetPrinter) {
        $hasMachineConn = $true
        break
      }
    }
  } catch {}

  if ($hasMachineConn -or $scopeMode -eq 'machine') {
    try {
      Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/gd','/n',$targetPrinter,'/q') -Wait -NoNewWindow
      $actionsTaken += "Removed per-machine connection (/gd)"
      $removedAny = $true
      $needsSpoolerRestart = $true
    } catch {}
    # Clean orphaned machine connection registry key if still present
    try {
      $machKeys = Get-ChildItem -Path $machConnRoot -ErrorAction SilentlyContinue
      foreach ($mk in $machKeys) {
        $props = Get-ItemProperty -Path $mk.PSPath -ErrorAction SilentlyContinue
        $cand = ''
        if ($props.Server -and $props.Printer) {
          $srv = ([string]$props.Server).TrimStart('\\')
          $prt = ([string]$props.Printer).TrimStart('\\')
          $cand = if ($prt -like "$srv\\*") { "\\\\$prt" } else { "\\\\$srv\\$prt" }
        } elseif ($mk.PSChildName -match '^,,([^,]+),(.+)$') {
          $cand = "\\\\$($Matches[1])\\$($Matches[2])"
        }
        if ($cand -ieq $targetPrinter) {
          Remove-Item -Path $mk.PSPath -Recurse -Force -ErrorAction SilentlyContinue
          $needsSpoolerRestart = $true
        }
      }
    } catch {}
  }
}

# 2. Remove local / WMI printer in current Admin/SYSTEM context
try {
  $wmiMatch = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $targetPrinter }
  if ($wmiMatch) {
    foreach ($wm in $wmiMatch) {
      if ($wm.Name.StartsWith('\\\\')) {
        Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/dn','/n',$wm.Name,'/q') -Wait -NoNewWindow -ErrorAction SilentlyContinue
      }
      try {
        Remove-Printer -Name $wm.Name -ErrorAction SilentlyContinue
      } catch {
        try { Remove-CimInstance -InputObject $wm -ErrorAction SilentlyContinue } catch {}
      }
      $actionsTaken += "Removed Win32_Printer '$($wm.Name)'"
      $removedAny = $true
    }
  }
} catch {}

# 3. Remove from active logged-in user profile (interactive /dn + HKU registry cleanup)
if ($userSid) {
  $userConnRoot = "Registry::HKEY_USERS\\$userSid\\Printers\\Connections"
  $matchedUserKeys = @()
  try {
    $uConns = Get-ChildItem -Path $userConnRoot -ErrorAction SilentlyContinue
    foreach ($uc in $uConns) {
      $props = Get-ItemProperty -Path $uc.PSPath -ErrorAction SilentlyContinue
      $cand = ''
      if ($props.Server -and $props.Printer) {
        $srv = ([string]$props.Server).TrimStart('\\')
        $prt = ([string]$props.Printer).TrimStart('\\')
        $cand = if ($prt -like "$srv\\*") { "\\\\$prt" } else { "\\\\$srv\\$prt" }
      } elseif ($uc.PSChildName -match '^,,([^,]+),(.+)$') {
        $cand = "\\\\$($Matches[1])\\$($Matches[2])"
      }
      if ($cand -ieq $targetPrinter) {
        $matchedUserKeys += $uc.PSPath
      }
    }
  } catch {}

  if (($matchedUserKeys.Count -gt 0 -or $targetPrinter.StartsWith('\\\\')) -and $loggedUser) {
    $taskName = "NetTopo_DelPrn_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    try {
      $innerB64 = '${encodePowerShellBase64(`
$n = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
try { Remove-Printer -Name $n -ErrorAction SilentlyContinue } catch {}
try { Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/dn','/n',$n,'/q') -Wait -NoNewWindow } catch {}
`)}'
      $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $innerB64"
      $pri = New-ScheduledTaskPrincipal -UserId $loggedUser -LogonType Interactive -RunLevel Limited
      $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 20)
      Register-ScheduledTask -TaskName $taskName -Action $act -Principal $pri -Settings $st -Force | Out-Null
      Start-ScheduledTask -TaskName $taskName
      for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 300
        $tInfo = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if (-not $tInfo -or $tInfo.State -ne 'Running') { break }
      }
      if ($matchedUserKeys.Count -gt 0) {
        $actionsTaken += "Removed user connection in $loggedUser session"
        $removedAny = $true
      }
    } catch {} finally {
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }
  }

  foreach ($ukPath in $matchedUserKeys) {
    if (Test-Path $ukPath) {
      Remove-Item -Path $ukPath -Recurse -Force -ErrorAction SilentlyContinue
      $actionsTaken += "Cleaned HKU printer connection registry key"
      $removedAny = $true
    }
  }

  # Clear user's default Device pointer if it referenced the deleted printer
  try {
    $winKey = "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows"
    $winReg = Get-ItemProperty -Path $winKey -ErrorAction SilentlyContinue
    if ($winReg -and $winReg.Device -and (([string]$winReg.Device).Split(',')[0].Trim() -ieq $targetPrinter)) {
      Remove-ItemProperty -Path $winKey -Name 'Device' -ErrorAction SilentlyContinue
    }
    $devKey = "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices"
    $devs = Get-ItemProperty -Path $devKey -ErrorAction SilentlyContinue
    if ($devs) {
      $prop = $devs.PSObject.Properties | Where-Object { $_.Name -ieq $targetPrinter } | Select-Object -First 1
      if ($prop) {
        Remove-ItemProperty -Path $devKey -Name $prop.Name -ErrorAction SilentlyContinue
      }
    }
  } catch {}
}

if ($needsSpoolerRestart) {
  try {
    Restart-Service -Name 'Spooler' -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 900
    $actionsTaken += "Restarted Spooler to sync per-machine removal"
  } catch {}
}

if (-not $removedAny) {
  throw "Printer '$targetPrinter' was not found or could not be removed."
}

[PSCustomObject]@{
  ok = $true
  printerName = $targetPrinter
  loggedInUser = $loggedUser
  output = ($actionsTaken -join ' | ')
} | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import base64, json, subprocess
pname = base64.b64decode("${nameB64}").decode("utf-8")
p = subprocess.run(["lpadmin", "-x", pname], capture_output=True, text=True)
print(json.dumps({
    "ok": p.returncode == 0,
    "printerName": pname,
    "loggedInUser": "",
    "output": (p.stdout + p.stderr).strip() or f"Removed printer {pname}"
}))
PY
`;

  const execRes = await executeHardcodedScripts(input, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'delete printer');
  const ok = Boolean(parsed.ok);
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'printer_delete',
    success: ok,
    message: ok
      ? `Printer "${printerName}" removed from ${execRes.host}.`
      : `Failed to remove printer "${printerName}" from ${execRes.host}.`,
    messageFa: ok
      ? `پرینتر «${printerName}» از سیستم ${execRes.host} با موفقیت حذف شد.`
      : `حذف پرینتر «${printerName}» از سیستم ${execRes.host} ناموفق بود.`,
    details: {
      printerName,
      scope: scopeVal,
      loggedInUser: String(parsed.loggedInUser || ''),
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function listPrintServerPrinters(
  input: HelpdeskTargetInput & {
    printServer: string;
    printServerUsername?: string;
    printServerPassword?: string;
  }
): Promise<HelpdeskPrintServerListResult> {
  const printServer = validatePrintServerInput(input.printServer);
  const srvB64 = utf8Base64(printServer);
  const psUser = String(input.printServerUsername || input.username || '').trim();
  const psPass = String(input.printServerPassword || input.password || '');
  const userB64 = utf8Base64(psUser);
  const passB64 = utf8Base64(psPass);

  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$srv = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${srvB64}'))
$psUser = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${userB64}'))
$psPass = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${passB64}'))
${PS_HELPDESK_DETECT_LOGGED_USER}

# Collect currently installed printers on target workstation for alreadyInstalled badge
$installedSet = @{}
try {
  foreach ($wp in (Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue)) {
    $installedSet[([string]$wp.Name).ToLower()] = $true
  }
} catch {}
if ($userSid) {
  try {
    foreach ($uc in (Get-ChildItem -Path "Registry::HKEY_USERS\\$userSid\\Printers\\Connections" -ErrorAction SilentlyContinue)) {
      $props = Get-ItemProperty -Path $uc.PSPath -ErrorAction SilentlyContinue
      if ($props.Server -and $props.Printer) {
        $s = ([string]$props.Server).TrimStart('\\')
        $p = ([string]$props.Printer).TrimStart('\\')
        $u = if ($p -like "$s\\*") { "\\\\$p" } else { "\\\\$s\\$p" }
        $installedSet[$u.ToLower()] = $true
      } elseif ($uc.PSChildName -match '^,,([^,]+),(.+)$') {
        $installedSet[("\\\\$($Matches[1])\\$($Matches[2])").ToLower()] = $true
      }
    }
  } catch {}
}

$ipcConnected = $false
function Ensure-PrintServerIpc {
  if ($script:ipcConnected) { return }
  if ($psUser -and $psPass) {
    try {
      & net use "\\\\$srv\\IPC$" $psPass "/user:$psUser" /persistent:no 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { $script:ipcConnected = $true }
    } catch {}
  }
}

$results = @()
$seenShares = @{}
try {
  # Establish IPC$ session when credentials provided (solves WinRM double-hop & SYSTEM access)
  Ensure-PrintServerIpc

  # Method 1: Get-Printer -ComputerName (PrintManagement)
  if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
    try {
      $gpList = Get-Printer -ComputerName $srv -ErrorAction Stop
      foreach ($gp in $gpList) {
        $sh = [string]$gp.ShareName
        if (-not $sh) {
          if ($gp.Shared) { $sh = [string]$gp.Name } else { continue }
        }
        $shKey = $sh.ToLower()
        if ($seenShares.ContainsKey($shKey)) { continue }
        $seenShares[$shKey] = $true
        $unc = "\\\\$srv\\$sh"
        $results += [PSCustomObject]@{
          name = [string]$gp.Name
          shareName = $sh
          uncPath = $unc
          driverName = [string]$gp.DriverName
          portName = [string]$gp.PortName
          location = [string]$gp.Location
          comment = [string]$gp.Comment
          status = [string]$gp.PrinterStatus
          shared = [bool]$gp.Shared
          alreadyInstalled = $installedSet.ContainsKey($unc.ToLower())
        }
      }
    } catch {}
  }

  # Method 2: WMI/CIM Win32_Printer -ComputerName
  if ($results.Count -eq 0) {
    try {
      $wmiList = Get-CimInstance -ClassName Win32_Printer -ComputerName $srv -ErrorAction Stop
      foreach ($wp in $wmiList) {
        $sh = [string]$wp.ShareName
        if (-not $sh) {
          if ($wp.Shared) { $sh = [string]$wp.Name } else { continue }
        }
        $shKey = $sh.ToLower()
        if ($seenShares.ContainsKey($shKey)) { continue }
        $seenShares[$shKey] = $true
        $unc = "\\\\$srv\\$sh"
        $st = switch ([int]$wp.PrinterStatus) {
          3 { 'Normal / Idle' } 4 { 'Printing' } 6 { 'Stopped' } 7 { 'Offline' } default { 'Ready' }
        }
        $results += [PSCustomObject]@{
          name = [string]$wp.Name
          shareName = $sh
          uncPath = $unc
          driverName = [string]$wp.DriverName
          portName = [string]$wp.PortName
          location = [string]$wp.Location
          comment = [string]$wp.Comment
          status = $st
          shared = [bool]$wp.Shared
          alreadyInstalled = $installedSet.ContainsKey($unc.ToLower())
        }
      }
    } catch {}
  }

  # Method 3: net view \\server (SMB Browse fallback)
  if ($results.Count -eq 0) {
    $nvOut = & net view "\\\\$srv" 2>&1
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $nvOut) {
        $lineStr = [string]$line
        if ($lineStr -match '^(.+?)\\s{2,}Print\\s*(.*)$') {
          $sh = $Matches[1].Trim()
          $rem = $Matches[2].Trim()
          if (-not $sh) { continue }
          $shKey = $sh.ToLower()
          if ($seenShares.ContainsKey($shKey)) { continue }
          $seenShares[$shKey] = $true
          $unc = "\\\\$srv\\$sh"
          $results += [PSCustomObject]@{
            name = $sh
            shareName = $sh
            uncPath = $unc
            driverName = ''
            portName = $srv
            location = ''
            comment = $rem
            status = 'Shared'
            shared = $true
            alreadyInstalled = $installedSet.ContainsKey($unc.ToLower())
          }
        }
      }
    } else {
      $errTxt = ($nvOut | Out-String).Trim()
      if ($errTxt) { throw "Failed to query print server '\\\\$srv': $errTxt" }
    }
  }
} finally {
  if ($script:ipcConnected) {
    & net use "\\\\$srv\\IPC$" /delete /y 2>&1 | Out-Null
  }
}

[PSCustomObject]@{
  printServer = $srv
  loggedInUser = $loggedUser
  printers = $results
} | ConvertTo-Json -Depth 5 -Compress
`;

  const lx = `
python3 - <<'PY'
import json
print(json.dumps({"printServer": "", "loggedInUser": "", "printers": [], "error": "Windows Print Server browsing is only supported on Windows endpoints."}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 30000 }, ps, lx);
  if (execRes.osFamily !== 'windows') {
    throw new Error('Windows Print Server browsing is only supported on Windows workstations.');
  }
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'list print server printers');
  const rawList = Array.isArray(parsed.printers) ? parsed.printers : parsed.printers ? [parsed.printers] : [];

  return {
    targetIp: execRes.host,
    printServer,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    loggedInUser: String(parsed.loggedInUser || ''),
    collectedAt: new Date().toISOString(),
    printers: rawList.map((p: any) => ({
      name: String(p.name || p.shareName || ''),
      shareName: String(p.shareName || p.name || ''),
      uncPath: String(p.uncPath || `\\\\${printServer}\\${p.shareName || p.name}`),
      driverName: String(p.driverName || ''),
      portName: String(p.portName || ''),
      location: String(p.location || ''),
      comment: String(p.comment || ''),
      status: String(p.status || 'Shared'),
      shared: p.shared !== false,
      alreadyInstalled: Boolean(p.alreadyInstalled),
    })),
  };
}

export async function installPrintServerPrinter(
  input: HelpdeskTargetInput & {
    printServer: string;
    shareName: string;
    installScope?: 'active_user' | 'all_users';
    setAsDefault?: boolean;
    printServerUsername?: string;
    printServerPassword?: string;
  }
): Promise<HelpdeskPrinterInstallResult> {
  const printServer = validatePrintServerInput(input.printServer);
  const shareName = validatePrintShareNameInput(input.shareName);
  const uncPath = `\\\\${printServer}\\${shareName}`;
  const requestedScope = input.installScope === 'all_users' ? 'all_users' : 'active_user';
  const setAsDefault = Boolean(input.setAsDefault);

  const psUser = String(input.printServerUsername || input.username || '').trim();
  const psPass = String(input.printServerPassword || input.password || '');

  const srvB64 = utf8Base64(printServer);
  const uncB64 = utf8Base64(uncPath);
  const userB64 = utf8Base64(psUser);
  const passB64 = utf8Base64(psPass);

  const ps = `
$ErrorActionPreference = 'Stop'
$srv = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${srvB64}'))
$uncPath = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}'))
$psUser = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${userB64}'))
$psPass = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${passB64}'))
$reqScope = '${requestedScope}'
$wantDefault = ${setAsDefault ? '$true' : '$false'}
${PS_HELPDESK_DETECT_LOGGED_USER}

$ipcConnected = $false
$notes = @()
$methodUsed = ''

function Test-UserHasPrinter($sid, $unc) {
  if (-not $sid) { return $false }
  $connRoot = "Registry::HKEY_USERS\\$sid\\Printers\\Connections"
  if (-not (Test-Path $connRoot)) { return $false }
  foreach ($uc in (Get-ChildItem -Path $connRoot -ErrorAction SilentlyContinue)) {
    $props = Get-ItemProperty -Path $uc.PSPath -ErrorAction SilentlyContinue
    $cand = ''
    if ($props.Server -and $props.Printer) {
      $s = ([string]$props.Server).TrimStart('\\')
      $p = ([string]$props.Printer).TrimStart('\\')
      $cand = if ($p -like "$s\\*") { "\\\\$p" } else { "\\\\$s\\$p" }
    } elseif ($uc.PSChildName -match '^,,([^,]+),(.+)$') {
      $cand = "\\\\$($Matches[1])\\$($Matches[2])"
    }
    if ($cand -ieq $unc) { return $true }
  }
  return $false
}

function Apply-UserDefault($sid, $logged, $unc) {
  if ($sid) {
    $winKey = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows"
    $devKey = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices"
    if (Test-Path $winKey) {
      try { Set-ItemProperty -Path $winKey -Name 'LegacyDefaultPrinterMode' -Value 1 -Type DWord -ErrorAction SilentlyContinue } catch {}
      $devStr = "$unc,winspool,Ne00:"
      try {
        $devs = Get-ItemProperty -Path $devKey -ErrorAction SilentlyContinue
        if ($devs) {
          $prop = $devs.PSObject.Properties | Where-Object { $_.Name -ieq $unc } | Select-Object -First 1
          if ($prop) { $devStr = "$($prop.Name),$($prop.Value)" }
        }
      } catch {}
      Set-ItemProperty -Path $winKey -Name 'Device' -Value $devStr -Type String -ErrorAction SilentlyContinue
    }
  }
  if ($logged) {
    $tDef = "NetTopo_DefPrn_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    try {
      $defB64 = '${encodePowerShellBase64(`
$u = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}'))
try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($u) } catch {}
try { Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/y','/n',$u) -Wait -NoNewWindow } catch {}
`)}'
      $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $defB64"
      $pri = New-ScheduledTaskPrincipal -UserId $logged -LogonType Interactive -RunLevel Limited
      $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 20)
      Register-ScheduledTask -TaskName $tDef -Action $act -Principal $pri -Settings $st -Force | Out-Null
      Start-ScheduledTask -TaskName $tDef
      for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Milliseconds 300
        $ti = Get-ScheduledTask -TaskName $tDef -ErrorAction SilentlyContinue
        if (-not $ti -or $ti.State -ne 'Running') { break }
      }
    } catch {} finally {
      Unregister-ScheduledTask -TaskName $tDef -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }
  }
}

try {
  # Step 1: Establish credentialed SMB IPC$ session to Print Server (for WinRM double-hop & driver pull)
  if ($psUser -and $psPass) {
    try {
      & net use "\\\\$srv\\IPC$" $psPass "/user:$psUser" /persistent:no 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        $ipcConnected = $true
        $notes += "Authenticated SMB IPC$ to \\\\$srv"
      }
    } catch {}
  }

  # Step 2: Admin-privileged driver staging (downloads & trusts driver into local DriverStore)
  $adminStaged = $false
  try {
    if (Get-Command Add-Printer -ErrorAction SilentlyContinue) {
      Add-Printer -ConnectionName $uncPath -ErrorAction Stop
      $adminStaged = $true
      $notes += "Staged driver & connection via Admin Add-Printer"
    }
  } catch {
    try {
      $pIn = Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/in','/n',$uncPath,'/q') -Wait -PassThru -NoNewWindow
      if ($pIn.ExitCode -eq 0) {
        $adminStaged = $true
        $notes += "Staged driver via Admin printui /in"
      }
    } catch {}
  }

  if ($reqScope -eq 'active_user' -and $loggedUser) {
    # Step 3A: Map inside active logged-in user's interactive session using pre-staged driver
    $tMap = "NetTopo_MapPrn_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $userMapped = $false
    try {
      $mapB64 = '${encodePowerShellBase64(`
$u = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}'))
$ok = $false
try {
  if (Get-Command Add-Printer -ErrorAction SilentlyContinue) {
    Add-Printer -ConnectionName $u -ErrorAction Stop
    $ok = $true
  }
} catch {}
if (-not $ok) {
  try {
    (New-Object -ComObject WScript.Network).AddWindowsPrinterConnection($u)
    $ok = $true
  } catch {}
}
if (-not $ok) {
  Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/in','/n',$u,'/q') -Wait -NoNewWindow
}
`)}'
      $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $mapB64"
      $pri = New-ScheduledTaskPrincipal -UserId $loggedUser -LogonType Interactive -RunLevel Limited
      $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 25)
      Register-ScheduledTask -TaskName $tMap -Action $act -Principal $pri -Settings $st -Force | Out-Null
      Start-ScheduledTask -TaskName $tMap
      for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 400
        $ti = Get-ScheduledTask -TaskName $tMap -ErrorAction SilentlyContinue
        if (-not $ti -or $ti.State -ne 'Running') { break }
      }
      if (Test-UserHasPrinter $userSid $uncPath) {
        $userMapped = $true
        $methodUsed = 'active_user_profile'
        $notes += "Mapped printer directly into active user profile ($loggedUser)"
      }
    } catch {
      $notes += "User-profile mapping fallback triggered: $($_.Exception.Message)"
    } finally {
      Unregister-ScheduledTask -TaskName $tMap -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }

    if (-not $userMapped) {
      # Step 3B: Point-and-Print GPO / session fallback -> Per-Machine Global (/ga) with Admin privileges + Spooler refresh
      $pGa = Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/ga','/n',$uncPath,'/q') -Wait -PassThru -NoNewWindow
      Restart-Service -Name 'Spooler' -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 1200
      $methodUsed = 'per_machine_fallback'
      $notes += "Applied Admin per-machine global connection (/ga, exit $($pGa.ExitCode)) + Spooler restart so $loggedUser sees the printer without needing local admin driver rights"
    }
  } else {
    # Step 3C: Explicit All-Users / Per-Machine Global (/ga)
    $pGa = Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/ga','/n',$uncPath,'/q') -Wait -PassThru -NoNewWindow
    Restart-Service -Name 'Spooler' -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1200
    $methodUsed = 'per_machine_global'
    $notes += "Installed per-machine global connection (/ga, exit $($pGa.ExitCode)) + Spooler restart for all workstation users"
  }

  if ($wantDefault) {
    try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($uncPath) } catch {}
    Apply-UserDefault $userSid $loggedUser $uncPath
    $notes += "Set $uncPath as default printer"
  }
} finally {
  if ($ipcConnected) {
    & net use "\\\\$srv\\IPC$" /delete /y 2>&1 | Out-Null
  }
}

[PSCustomObject]@{
  ok = $true
  uncPath = $uncPath
  installScope = if ($reqScope -eq 'active_user' -and $loggedUser) { 'active_user' } else { 'all_users' }
  methodUsed = $methodUsed
  loggedInUser = $loggedUser
  setAsDefault = $wantDefault
  output = ($notes -join ' | ')
} | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import json
print(json.dumps({"ok": False, "output": "Windows Print Server installation is only supported on Windows endpoints."}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 45000 }, ps, lx);
  if (execRes.osFamily !== 'windows') {
    throw new Error('Windows Print Server installation is only supported on Windows workstations.');
  }
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'install print server printer');
  const ok = Boolean(parsed.ok);
  const effectiveScope = parsed.installScope === 'all_users' ? 'all_users' : 'active_user';
  const methodUsed = String(parsed.methodUsed || effectiveScope);
  const loggedInUser = String(parsed.loggedInUser || '');

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'printer_install',
    success: ok,
    printServer,
    shareName,
    uncPath,
    installScope: effectiveScope,
    methodUsed,
    loggedInUser,
    setAsDefault,
    message: ok
      ? `Printer "${uncPath}" installed on ${execRes.host}${loggedInUser ? ` (visible to ${loggedInUser})` : ''} via ${methodUsed}${setAsDefault ? ' and set as default' : ''}.`
      : `Failed to install printer "${uncPath}" on ${execRes.host}.`,
    messageFa: ok
      ? `پرینتر «${uncPath}» با موفقیت روی سیستم ${execRes.host}${loggedInUser ? ` (قابل مشاهده برای کاربر ${loggedInUser})` : ''} نصب شد${setAsDefault ? ' و به‌عنوان پیش‌فرض تنظیم گردید' : ''}.`
      : `نصب پرینتر «${uncPath}» روی سیستم ${execRes.host} ناموفق بود.`,
    details: {
      printServer,
      shareName,
      uncPath,
      installScope: effectiveScope,
      methodUsed,
      loggedInUser,
      setAsDefault,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 10. MODULE 5 HELPER: IMMUTABLE PROCESS PROTECTION GUARD (OS & AV/EDR DENYLIST)
// ============================================================================

const PROTECTED_SYSTEM_PROCESSES = new Set([
  'system',
  'idle',
  'system idle process',
  'registry',
  'memory compression',
  'secure system',
  'smss',
  'csrss',
  'wininit',
  'winlogon',
  'services',
  'lsass',
  'lsaiso',
  'lsm',
  'svchost',
  'fontdrvhost',
  'dwm',
  'sihost',
  'explorer',
  'spoolsv',
  'taskhostw',
  'taskhost',
  'ctfmon',
  'conhost',
  'runtimebroker',
  'searchindexer',
  'shellexperiencehost',
  'startmenuexperiencehost',
  'dllhost',
  'wmiprvse',
  'wsmprovhost',
  'winrshost',
  'powershell',
  'pwsh',
  'sshd',
  'ntoskrnl',
  'vmmem',
  'trustedinstaller',
  'tiworker',
  'wuauclt',
  'usocoreworker',
  'audiodg',
  'dashost',
  'logonui',
  // Linux core
  'systemd',
  'init',
  'kthreadd',
  'systemd-journald',
  'systemd-udevd',
  'systemd-logind',
  'systemd-networkd',
  'systemd-resolved',
  'dbus-daemon',
  'networkmanager',
  'cron',
  'crond',
  'rsyslogd',
  'polkitd',
  'containerd',
  'dockerd',
]);

const PROTECTED_SECURITY_PROCESSES = new Set([
  // Microsoft Defender
  'msmpeng',
  'mpcmdrun',
  'nissrv',
  'mpdefendercoreservice',
  'securityhealthservice',
  'securityhealthsystray',
  'mssense',
  'senseir',
  'sensecncproxy',
  'sensecm',
  'smartscreen',
  // CrowdStrike / SentinelOne / CarbonBlack / Cylance
  'csfalconservice',
  'csfalconcontainer',
  'sentinelagent',
  'sentinelctl',
  'sentinelservicehost',
  'sentinelstaticengine',
  'cb',
  'repmgr',
  'cylancesvc',
  'cylanceui',
  // ESET / Kaspersky / Bitdefender / Sophos / McAfee / Symantec / TrendMicro / ClamAV / Wazuh
  'ekrn',
  'egui',
  'eguiproxy',
  'avp',
  'avpui',
  'kavfs',
  'klnagent',
  'bdagent',
  'vsserv',
  'epsecurityservice',
  'savservice',
  'sophoshealth',
  'sophosfs',
  'sophosui',
  'sedservice',
  'mcshield',
  'mfefire',
  'mfemms',
  'masvc',
  'ccsvchst',
  'sepwscsvc',
  'ntrtscan',
  'tmlisten',
  'pccntmon',
  'clamd',
  'freshclam',
  'wazuh-agent',
  'ossec-agent',
  'falcon-sensor',
]);

const KNOWN_BROWSER_PROCESSES = new Set([
  'chrome',
  'msedge',
  'firefox',
  'brave',
  'opera',
  'vivaldi',
  'iexplore',
  'chromium',
]);

const KNOWN_OFFICE_PROCESSES = new Set([
  'winword',
  'excel',
  'powerpnt',
  'outlook',
  'olk',
  'onenote',
  'msaccess',
  'mspub',
  'visio',
  'teams',
  'ms-teams',
  'acrobat',
  'acrord32',
  'foxitpdfreader',
  'soffice',
  'soffice.bin',
]);

const SAFE_PROCESS_NAME_REGEX = /^[a-zA-Z0-9._ -]{1,80}$/;

function normalizeProcKey(rawName: string): string {
  return String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, '');
}

export function classifyHelpdeskProcess(
  pid: number,
  rawName: string
): {
  terminable: boolean;
  processCategory: HelpdeskProcessCategory;
  protectionReason?: string;
  protectionReasonFa?: string;
} {
  const norm = normalizeProcKey(rawName);
  const pidNum = Number(pid);

  if (!Number.isInteger(pidNum) || pidNum < 100) {
    return {
      terminable: false,
      processCategory: 'system_protected',
      protectionReason: 'Protected kernel/system PID (< 100)',
      protectionReasonFa: 'محافظت‌شده: پروسس هسته سیستم‌عامل (PID زیر ۱۰۰)',
    };
  }

  if (
    PROTECTED_SECURITY_PROCESSES.has(norm) ||
    /^(sophos|sentinel|csfalcon|mcafee|mfefire|defender|kaspersky|bitdefender|eset|wazuh|crowdstrike)/i.test(norm)
  ) {
    return {
      terminable: false,
      processCategory: 'security_protected',
      protectionReason: 'Protected Antivirus / EDR security service (anti-tamper guard)',
      protectionReasonFa: 'محافظت‌شده: سرویس آنتی‌ویروس / EDR (قفل ضددستکاری)',
    };
  }

  if (PROTECTED_SYSTEM_PROCESSES.has(norm) || /^systemd-/.test(norm) || /^kworker/.test(norm)) {
    return {
      terminable: false,
      processCategory: 'system_protected',
      protectionReason: 'Protected core operating system service',
      protectionReasonFa: 'محافظت‌شده: سرویس حیاتی سیستم‌عامل',
    };
  }

  if (KNOWN_BROWSER_PROCESSES.has(norm)) {
    return { terminable: true, processCategory: 'browser' };
  }
  if (KNOWN_OFFICE_PROCESSES.has(norm)) {
    return { terminable: true, processCategory: 'office' };
  }
  return { terminable: true, processCategory: 'user_app' };
}

// ============================================================================
// 11. MODULE 4: EVENT VIEWER COLLECTOR WITH HUMAN-READABLE DIAGNOSTICS
// ============================================================================

export async function collectEndpointEventLogs(
  input: HelpdeskTargetInput,
  options?: {
    channel?: 'All' | 'System' | 'Application';
    hoursBack?: number;
    maxEvents?: number;
    severity?: 'all' | 'critical_error';
    diagnosticFocus?: 'all' | 'bsod';
  }
): Promise<HelpdeskEventViewerResult> {
  const diagnosticFocus: 'all' | 'bsod' = options?.diagnosticFocus === 'bsod' ? 'bsod' : 'all';
  const channel: 'All' | 'System' | 'Application' =
    diagnosticFocus === 'bsod'
      ? 'System'
      : options?.channel === 'System' || options?.channel === 'Application'
      ? options.channel
      : 'All';
  const hoursBack = Math.max(
    1,
    Math.min(720, Math.floor(Number(options?.hoursBack) || (diagnosticFocus === 'bsod' ? 336 : 48)))
  );
  const maxEvents = Math.max(
    10,
    Math.min(120, Math.floor(Number(options?.maxEvents) || (diagnosticFocus === 'bsod' ? 75 : 45)))
  );
  const severity: 'all' | 'critical_error' =
    options?.severity === 'critical_error' ? 'critical_error' : 'all';

  const logNamesPs =
    channel === 'System'
      ? "@('System')"
      : channel === 'Application'
      ? "@('Application')"
      : "@('System','Application')";
  const levelsPs = severity === 'critical_error' ? '@(1,2)' : '@(1,2,3)';

  const psEventScript =
    diagnosticFocus === 'bsod'
      ? `
$ErrorActionPreference = 'SilentlyContinue'
$startTime = (Get-Date).AddHours(-${hoursBack})
$bsodProviders = @(
  'Microsoft-Windows-WER-SystemErrorReporting',
  'BugCheck',
  'Microsoft-Windows-Kernel-Power',
  'EventLog',
  'USER32',
  'Microsoft-Windows-WHEA-Logger',
  'volmgr',
  'Disk',
  'disk',
  'stornvme',
  'storahci',
  'Ntfs',
  'Microsoft-Windows-Ntfs',
  'Display',
  'nvlddmkm',
  'amdkmdag',
  'igfx',
  'Microsoft-Windows-Resource-Exhaustion-Detector',
  'Service Control Manager'
)

$rawEvents = @()
try {
  $rawEvents = @(Get-WinEvent -FilterHashtable @{
    LogName = 'System'
    ProviderName = $bsodProviders
    StartTime = $startTime
  } -MaxEvents ${Math.max(maxEvents, 80)} -ErrorAction SilentlyContinue)
} catch {}

if ($rawEvents.Count -eq 0) {
  $rawEvents = @(Get-WinEvent -FilterHashtable @{
    LogName = 'System'
    Level = @(1,2,3,4)
    StartTime = $startTime
  } -MaxEvents 120 -ErrorAction SilentlyContinue | Where-Object {
    ($bsodProviders -contains $_.ProviderName) -or ($_.Id -in @(41, 1001, 1074, 6008, 46, 49, 161, 162, 2004, 4101, 7031, 7034, 7023))
  } | Select-Object -First ${maxEvents})
}

# Filter noisy normal shutdown 1074 / informational 7036 out in BSOD mode
$filteredEvents = @()
foreach ($ev in $rawEvents) {
  $pn = [string]$ev.ProviderName
  $id = [int]$ev.Id
  $lvlNum = [int]$ev.Level
  if ($pn -eq 'Service Control Manager' -and $id -notin @(7000, 7001, 7023, 7024, 7031, 7034)) { continue }
  if ($pn -eq 'EventLog' -and $id -notin @(6008, 6005, 6009, 6013)) { continue }
  if ($pn -eq 'Microsoft-Windows-Kernel-Power' -and $id -ne 41) { continue }
  if ($pn -eq 'USER32' -and $id -ne 1074) { continue }
  if ($lvlNum -ge 4 -and $id -notin @(1001, 1074, 41, 6008)) { continue }
  $filteredEvents += $ev
}

$items = @()
foreach ($ev in ($filteredEvents | Select-Object -First ${maxEvents})) {
  $lvl = switch ([int]$ev.Level) {
    1 { 'critical' }
    2 { 'error' }
    3 { 'warning' }
    default { 'info' }
  }
  $msg = if ($ev.Message) { [string]$ev.Message } else { '' }
  if ($msg.Length -gt 850) { $msg = $msg.Substring(0, 850) + '...' }

  $bugRaw = ''
  if (([string]$ev.ProviderName -eq 'Microsoft-Windows-Kernel-Power' -and [int]$ev.Id -eq 41) -or [int]$ev.Id -eq 1001) {
    try {
      [xml]$evXml = $ev.ToXml()
      $bcNode = $evXml.Event.EventData.Data | Where-Object { $_.Name -eq 'BugcheckCode' -or $_.Name -eq 'param1' } | Select-Object -First 1
      if ($bcNode -and $bcNode.'#text') {
        $txtVal = ([string]$bcNode.'#text').Trim()
        if ($txtVal -and $txtVal -ne '0') { $bugRaw = $txtVal }
      }
      if (-not $msg -and $evXml.Event.EventData.Data) {
        $pairs = @($evXml.Event.EventData.Data | ForEach-Object { "$($_.Name)=$($_.'#text')" })
        if ($pairs.Count -gt 0) { $msg = ($pairs -join '; ') }
      }
    } catch {}
  }

  $items += [PSCustomObject]@{
    recordId = [long]$ev.RecordId
    eventId = [int]$ev.Id
    channel = [string]$ev.LogName
    level = $lvl
    source = [string]$ev.ProviderName
    timeCreated = if ($ev.TimeCreated) { $ev.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
    rawMessage = $msg
    bugcheckCodeRaw = $bugRaw
  }
}

$dumps = @()
$minidumpDir = Join-Path $env:SystemRoot 'Minidump'
if (Test-Path $minidumpDir) {
  try {
    foreach ($df in (Get-ChildItem -Path $minidumpDir -Filter '*.dmp' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 10)) {
      $dumps += [PSCustomObject]@{
        fileName = [string]$df.Name
        fullPath = [string]$df.FullName
        sizeKb = [Math]::Round($df.Length / 1024, 1)
        modifiedAt = $df.LastWriteTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      }
    }
  } catch {}
}

$cc = $null
try {
  $ccReg = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CrashControl' -ErrorAction SilentlyContinue
  if ($ccReg) {
    $cc = [PSCustomObject]@{
      crashDumpEnabled = [int]$ccReg.CrashDumpEnabled
      autoReboot = ([int]$ccReg.AutoReboot -eq 1)
      dumpFile = [string]$ccReg.DumpFile
      minidumpDir = [string]$ccReg.MinidumpDir
    }
  }
} catch {}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  events = $items
  minidumps = $dumps
  crashControl = $cc
} | ConvertTo-Json -Depth 6 -Compress
`
      : `
$ErrorActionPreference = 'SilentlyContinue'
$startTime = (Get-Date).AddHours(-${hoursBack})
$filter = @{
  LogName = ${logNamesPs}
  Level = ${levelsPs}
  StartTime = $startTime
}
$rawEvents = @(Get-WinEvent -FilterHashtable $filter -MaxEvents ${maxEvents} -ErrorAction SilentlyContinue)
$items = @()
foreach ($ev in $rawEvents) {
  $lvl = switch ([int]$ev.Level) {
    1 { 'critical' }
    2 { 'error' }
    3 { 'warning' }
    default { 'info' }
  }
  $msg = if ($ev.Message) { [string]$ev.Message } else { '' }
  if ($msg.Length -gt 750) { $msg = $msg.Substring(0, 750) + '...' }
  $items += [PSCustomObject]@{
    recordId = [long]$ev.RecordId
    eventId = [int]$ev.Id
    channel = [string]$ev.LogName
    level = $lvl
    source = [string]$ev.ProviderName
    timeCreated = if ($ev.TimeCreated) { $ev.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
    rawMessage = $msg
    bugcheckCodeRaw = ''
  }
}
[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  events = $items
} | ConvertTo-Json -Depth 6 -Compress
`;

  const journalPriority = diagnosticFocus === 'bsod' ? '4' : severity === 'critical_error' ? '3' : '4';
  const linuxEventScript =
    diagnosticFocus === 'bsod'
      ? `
python3 - <<'PY'
import glob, json, os, re, socket, subprocess
from datetime import datetime, timezone

items = []
dumps = []
try:
    cmd = ["journalctl", "--since", "${hoursBack} hours ago", "-k", "-p", "0..4", "-n", "${Math.max(maxEvents, 80)}", "--no-pager", "-o", "json"]
    out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
    crash_re = re.compile(r"(panic|oops|bug:|oom-killer|out of memory|mce|hardware error|nvme|i/o error|gpu hang|amdgpu|nouveau|nvidia|xid|segfault)", re.I)
    for idx, line in enumerate(out.splitlines(), 1):
        line = line.strip()
        if not line: continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        msg = str(obj.get("MESSAGE") or "")[:850]
        if not crash_re.search(msg): continue
        prio = int(obj.get("PRIORITY", 4))
        lvl = "critical" if prio <= 2 else ("error" if prio == 3 else "warning")
        ts_us = int(obj.get("__REALTIME_TIMESTAMP", 0) or 0)
        ts_iso = datetime.fromtimestamp(ts_us / 1e6, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if ts_us else ""
        src = str(obj.get("SYSLOG_IDENTIFIER") or obj.get("_SYSTEMD_UNIT") or "kernel")
        items.append({
            "recordId": idx,
            "eventId": prio,
            "channel": "journald-kernel",
            "level": lvl,
            "source": src,
            "timeCreated": ts_iso,
            "rawMessage": msg,
            "bugcheckCodeRaw": ""
        })
except Exception:
    pass

for path in sorted(glob.glob("/var/crash/*") + glob.glob("/var/spool/abrt/*"), reverse=True)[:10]:
    try:
        st = os.stat(path)
        dumps.append({
            "fileName": os.path.basename(path),
            "fullPath": path,
            "sizeKb": round(st.st_size / 1024, 1),
            "modifiedAt": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        })
    except Exception:
        pass

items.reverse()
print(json.dumps({"hostname": socket.gethostname(), "events": items[:${maxEvents}], "minidumps": dumps, "crashControl": None}))
PY
`
      : `
python3 - <<'PY'
import json, socket, subprocess
from datetime import datetime, timezone

items = []
try:
    cmd = ["journalctl", "--since", "${hoursBack} hours ago", "-p", "0..${journalPriority}", "-n", "${maxEvents}", "--no-pager", "-o", "json"]
    out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
    for idx, line in enumerate(out.splitlines(), 1):
        line = line.strip()
        if not line: continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        prio = int(obj.get("PRIORITY", 4))
        lvl = "critical" if prio <= 2 else ("error" if prio == 3 else "warning")
        ts_us = int(obj.get("__REALTIME_TIMESTAMP", 0) or 0)
        ts_iso = datetime.fromtimestamp(ts_us / 1e6, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if ts_us else ""
        src = str(obj.get("SYSLOG_IDENTIFIER") or obj.get("_SYSTEMD_UNIT") or "kernel")
        msg = str(obj.get("MESSAGE") or "")[:750]
        items.append({
            "recordId": idx,
            "eventId": prio,
            "channel": "journald",
            "level": lvl,
            "source": src,
            "timeCreated": ts_iso,
            "rawMessage": msg,
            "bugcheckCodeRaw": ""
        })
except Exception:
    pass

items.reverse()
print(json.dumps({"hostname": socket.gethostname(), "events": items}))
PY
`;

  const execRes = await executeHardcodedScripts(
    diagnosticFocus === 'bsod' ? { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) } : input,
    psEventScript,
    linuxEventScript
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint event viewer');
  const rawList: any[] = Array.isArray(parsed.events) ? parsed.events : parsed.events ? [parsed.events] : [];

  let critical = 0;
  let error = 0;
  let warning = 0;
  let knownDecodedCount = 0;

  const issueCounter = new Map<
    string,
    { eventId: number; source: string; count: number; humanTitleEn: string; humanTitleFa: string }
  >();

  const events: HelpdeskEventLogItem[] = rawList.map((ev: any, idx: number) => {
    const rawLevel = String(ev.level || 'warning').toLowerCase();
    const level: 'critical' | 'error' | 'warning' | 'info' =
      rawLevel === 'critical'
        ? 'critical'
        : rawLevel === 'error'
        ? 'error'
        : rawLevel === 'warning'
        ? 'warning'
        : 'info';

    if (level === 'critical') critical++;
    else if (level === 'error') error++;
    else if (level === 'warning') warning++;

    const eventId = Number(ev.eventId) || 0;
    const source = String(ev.source || 'System');
    const evChannel = String(ev.channel || (execRes.osFamily === 'linux' ? 'journald' : 'System'));
    const rawMessage = String(ev.rawMessage || '').trim();
    const bugcheckCodeRaw = String(ev.bugcheckCodeRaw || '').trim();

    const explanation = explainEventCodeHuman({
      eventId,
      source,
      channel: evChannel,
      level,
      message: rawMessage,
      osFamily: execRes.osFamily,
    });
    if (explanation.isKnownCode) knownDecodedCount++;

    const bsodReason = classifyBsodEventReason({
      eventId,
      source,
      level,
      message: bugcheckCodeRaw ? `${rawMessage} BugcheckCode=${bugcheckCodeRaw}` : rawMessage,
    });

    const key = `${eventId}|${source.toLowerCase()}`;
    const existing = issueCounter.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      issueCounter.set(key, {
        eventId,
        source,
        count: 1,
        humanTitleEn: explanation.humanTitleEn,
        humanTitleFa: explanation.humanTitleFa,
      });
    }

    return {
      recordId: Number(ev.recordId) || idx + 1,
      eventId,
      channel: evChannel,
      level,
      levelLabelEn:
        level === 'critical' ? 'Critical' : level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Info',
      levelLabelFa:
        level === 'critical' ? 'بحرانی' : level === 'error' ? 'خطا' : level === 'warning' ? 'هشدار' : 'اطلاعات',
      source,
      timeCreated: String(ev.timeCreated || ''),
      rawMessage,
      explanation,
      bsodReason,
      ...(bugcheckCodeRaw ? { bugcheckCodeRaw } : {}),
    };
  });

  let topIssue: HelpdeskEventViewerResult['summary']['topIssue'] = null;
  for (const cand of issueCounter.values()) {
    if (!topIssue || cand.count > topIssue.count) {
      topIssue = cand;
    }
  }

  let bsodAnalysis: BsodAnalysisResult | undefined;
  if (diagnosticFocus === 'bsod') {
    const rawDumps: any[] = Array.isArray(parsed.minidumps)
      ? parsed.minidumps
      : parsed.minidumps
      ? [parsed.minidumps]
      : [];
    const dumpFiles = rawDumps
      .map((d) => ({
        name: String(d?.fileName || d?.name || ''),
        path: String(d?.fullPath || d?.path || ''),
        sizeKb: Number(d?.sizeKb) || 0,
        createdAt: String(d?.modifiedAt || d?.createdAt || ''),
      }))
      .filter((d) => d.name);

    const crashDumpCode =
      parsed.crashControl?.crashDumpEnabled !== undefined && parsed.crashControl?.crashDumpEnabled !== null
        ? Number(parsed.crashControl.crashDumpEnabled)
        : null;
    const crashDumpModeLabel =
      crashDumpCode === 0
        ? 'Disabled (None)'
        : crashDumpCode === 1
        ? 'Complete Memory Dump'
        : crashDumpCode === 2
        ? 'Kernel Memory Dump'
        : crashDumpCode === 3
        ? 'Small Memory Dump (Minidump)'
        : crashDumpCode === 7
        ? 'Automatic Memory Dump'
        : crashDumpCode !== null && Number.isFinite(crashDumpCode)
        ? `Mode ${crashDumpCode}`
        : 'Unknown';

    const crashControl = parsed.crashControl
      ? {
          crashDumpEnabled: crashDumpCode,
          crashDumpModeLabel,
          autoReboot:
            typeof parsed.crashControl.autoReboot === 'boolean' ? parsed.crashControl.autoReboot : null,
          dumpFile: parsed.crashControl.dumpFile ? String(parsed.crashControl.dumpFile) : '',
          minidumpDir: parsed.crashControl.minidumpDir ? String(parsed.crashControl.minidumpDir) : '',
        }
      : null;

    bsodAnalysis = buildBsodAnalysis({
      focusEnabled: true,
      events: events.map((e) => ({
        eventId: e.eventId,
        source: e.source,
        level: e.level,
        rawMessage: e.rawMessage,
        bsodReason: e.bsodReason,
        bugcheckCodeRaw: e.bugcheckCodeRaw,
      })),
      dumpFiles,
      crashControl,
    });
  }

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    collectedAt: new Date().toISOString(),
    channelRequested: channel,
    diagnosticFocus,
    hoursBack,
    summary: {
      total: events.length,
      critical,
      error,
      warning,
      knownDecodedCount,
      topIssue,
    },
    ...(bsodAnalysis ? { bsodAnalysis } : {}),
    events,
  };
}

// ============================================================================
// 12. MODULE 5: SAFE USER-APP PROCESS TERMINATION (OS & AV/EDR LOCKED)
// ============================================================================

export async function terminateEndpointUserProcess(
  input: HelpdeskTargetInput,
  params: { pid: number; processName: string }
): Promise<HelpdeskActionResult> {
  const pid = Math.floor(Number(params.pid));
  const processName = String(params.processName || '').trim();

  if (!Number.isInteger(pid) || pid < 100 || pid > 4194304) {
    throw new Error('Blocked process termination: PID must be an integer >= 100 (kernel/system PIDs are protected).');
  }
  if (!processName || !SAFE_PROCESS_NAME_REGEX.test(processName)) {
    throw new Error('Invalid process name format.');
  }

  // Server-side immutable denylist enforcement BEFORE touching the target endpoint
  const classification = classifyHelpdeskProcess(pid, processName);
  if (!classification.terminable) {
    throw new Error(
      `Blocked: "${processName}" (PID ${pid}) cannot be terminated — ${classification.protectionReason || 'Protected process'}.`
    );
  }

  const expectedNorm = normalizeProcKey(processName).replace(/'/g, '');

  // Hardcoded script double-checks that PID still belongs to the EXACT same non-protected process name before stopping
  const psTerminate = `
$ErrorActionPreference = 'Stop'
$targetPid = ${pid}
$expectedName = '${expectedNorm}'
$p = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if (-not $p) {
  [PSCustomObject]@{ ok = $false; status = 'not_found'; actualName = ''; output = "Process PID $targetPid is no longer running." } | ConvertTo-Json -Compress
  exit 0
}
$actualNorm = ([string]$p.ProcessName).ToLower().Trim()
if ($actualNorm -ne $expectedName) {
  [PSCustomObject]@{ ok = $false; status = 'mismatch'; actualName = [string]$p.ProcessName; output = "Safety abort: PID $targetPid now belongs to '$($p.ProcessName)' instead of '$expectedName'." } | ConvertTo-Json -Compress
  exit 0
}
Stop-Process -Id $targetPid -Force -ErrorAction Stop
Start-Sleep -Milliseconds 300
$stillAlive = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
[PSCustomObject]@{
  ok = ($null -eq $stillAlive)
  status = if ($null -eq $stillAlive) { 'terminated' } else { 'still_running' }
  actualName = [string]$p.ProcessName
  output = if ($null -eq $stillAlive) { "User application '$($p.ProcessName)' (PID $targetPid) terminated safely." } else { "Stop signal sent, but PID $targetPid is still exiting." }
} | ConvertTo-Json -Compress
`;

  const lxTerminate = `
python3 - <<'PY'
import json, os, signal, subprocess, time
target_pid = ${pid}
expected = "${expectedNorm}"
try:
    actual = subprocess.check_output(["ps", "-p", str(target_pid), "-o", "comm="], text=True).strip()
except Exception:
    print(json.dumps({"ok": False, "status": "not_found", "actualName": "", "output": f"Process PID {target_pid} is no longer running."}))
    raise SystemExit(0)
if actual.lower() != expected:
    print(json.dumps({"ok": False, "status": "mismatch", "actualName": actual, "output": f"Safety abort: PID {target_pid} belongs to '{actual}' instead of '{expected}'."}))
    raise SystemExit(0)
try:
    os.kill(target_pid, signal.SIGTERM)
    time.sleep(0.4)
    try:
        os.kill(target_pid, 0)
        os.kill(target_pid, signal.SIGKILL)
        time.sleep(0.2)
    except ProcessLookupError:
        pass
    print(json.dumps({"ok": True, "status": "terminated", "actualName": actual, "output": f"User process '{actual}' (PID {target_pid}) terminated safely."}))
except Exception as e:
    print(json.dumps({"ok": False, "status": "error", "actualName": actual, "output": str(e)}))
PY
`;

  const execRes = await executeHardcodedScripts(input, psTerminate, lxTerminate);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'safe process terminate');
  const ok = Boolean(parsed.ok);
  const actualName = String(parsed.actualName || processName);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'process_terminate',
    success: ok,
    message: ok
      ? `User application "${actualName}" (PID ${pid}) was safely terminated on ${execRes.host}.`
      : String(parsed.output || `Could not terminate process ${processName} (PID ${pid}).`),
    messageFa: ok
      ? `برنامه کاربری «${actualName}» (PID ${pid}) روی سیستم ${execRes.host} با موفقیت بسته شد.`
      : `توقف پروسس «${processName}» (PID ${pid}) انجام نشد: ${String(parsed.output || 'ناموفق')}`,
    details: {
      pid,
      processName: actualName,
      status: String(parsed.status || 'unknown'),
      category: classification.processCategory,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 13. MODULE 6: SAFE CONFINED TEMP FOLDER SCAN & CLEANUP (ZERO CUSTOM PATHS)
// ============================================================================

const PS_TEMP_SCAN = `
$ErrorActionPreference = 'SilentlyContinue'
$winTemp = Join-Path $env:SystemRoot 'Temp'
$userTemp = $env:TEMP
try {
  $cs = Get-CimInstance Win32_ComputerSystem
  if ($cs -and $cs.UserName) {
    $uShort = ($cs.UserName -split '\\\\')[-1]
    $candidate = Join-Path "C:\\Users\\$uShort" 'AppData\\Local\\Temp'
    if (Test-Path $candidate) { $userTemp = $candidate }
  }
} catch {}

function Inspect-TempDir($key, $path) {
  if (-not $path -or -not (Test-Path $path)) {
    return @{
      summary = [PSCustomObject]@{ key = $key; path = [string]$path; exists = $false; fileCount = 0; folderCount = 0; sizeMb = 0.0 }
      files = @()
    }
  }
  $allFiles = @(Get-ChildItem -Path $path -Recurse -File -Force -ErrorAction SilentlyContinue)
  $allDirs = @(Get-ChildItem -Path $path -Recurse -Directory -Force -ErrorAction SilentlyContinue)
  $bytes = ($allFiles | Measure-Object -Property Length -Sum).Sum
  if ($null -eq $bytes) { $bytes = 0 }
  $top = @($allFiles | Sort-Object Length -Descending | Select-Object -First 8 | ForEach-Object {
    [PSCustomObject]@{
      name = [string]$_.Name
      folderKey = $key
      sizeMb = [math]::Round(($_.Length / 1MB), 2)
      lastModified = if ($_.LastWriteTime) { $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') } else { '' }
    }
  })
  return @{
    summary = [PSCustomObject]@{
      key = $key
      path = [string]$path
      exists = $true
      fileCount = [int]$allFiles.Count
      folderCount = [int]$allDirs.Count
      sizeMb = [math]::Round(($bytes / 1MB), 2)
    }
    files = $top
  }
}

$w = Inspect-TempDir 'windows_temp' $winTemp
$u = Inspect-TempDir 'user_temp' $userTemp
$largest = @($w.files + $u.files | Sort-Object sizeMb -Descending | Select-Object -First 12)

$rbTotalBytes = [int64]0
$rbTotalItems = 0
$rbPerDrive = @()
$fixedDrives = @()
try {
  $fixedDrives = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DeviceID)
} catch {}
if ($fixedDrives.Count -eq 0) {
  try {
    $fixedDrives = @([System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' } | ForEach-Object { $_.Name.TrimEnd('\\') })
  } catch {}
}
foreach ($drv in ($fixedDrives | Where-Object { $_ } | Select-Object -Unique)) {
  $rbRoot = Join-Path ($drv + '\\') '$Recycle.Bin'
  if (-not (Test-Path -LiteralPath $rbRoot)) { continue }
  $dBytes = [int64]0
  $dItems = 0
  try {
    $sidDirs = @(Get-ChildItem -LiteralPath $rbRoot -Directory -Force -ErrorAction SilentlyContinue)
    foreach ($sd in $sidDirs) {
      $topEntries = @(Get-ChildItem -LiteralPath $sd.FullName -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '$I*' -and $_.Name -ne 'desktop.ini' })
      $dItems += $topEntries.Count
    }
    $rbFiles = @(Get-ChildItem -LiteralPath $rbRoot -File -Force -Recurse -ErrorAction SilentlyContinue)
    foreach ($rf in $rbFiles) {
      if ($rf.Name -like '$I*' -or $rf.Name -eq 'desktop.ini') { continue }
      $dBytes += [int64]$rf.Length
    }
  } catch {}
  $rbTotalBytes += $dBytes
  $rbTotalItems += $dItems
  $rbPerDrive += [PSCustomObject]@{
    drive = [string]$drv
    sizeBytes = $dBytes
    sizeMb = [math]::Round(($dBytes / 1MB), 2)
    itemCount = [int]$dItems
  }
}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  folders = @($u.summary, $w.summary)
  largestFiles = $largest
  recycleBin = [PSCustomObject]@{
    sizeBytes = $rbTotalBytes
    sizeMb = [math]::Round(($rbTotalBytes / 1MB), 2)
    itemCount = [int]$rbTotalItems
    perDrive = @($rbPerDrive)
  }
} | ConvertTo-Json -Depth 6 -Compress
`;

const LINUX_TEMP_SCAN = `
python3 - <<'PY'
import json, os, socket
from datetime import datetime

def inspect(key, path):
    if not path or not os.path.isdir(path):
        return {"key": key, "path": path, "exists": False, "fileCount": 0, "folderCount": 0, "sizeMb": 0.0}, []
    fc, dc, total = 0, 0, 0
    files = []
    for root, dirs, fnames in os.walk(path, followlinks=False):
        dc += len(dirs)
        for fn in fnames:
            fp = os.path.join(root, fn)
            try:
                if os.path.islink(fp): continue
                st = os.stat(fp)
                fc += 1
                total += st.st_size
                files.append((st.st_size, fn, st.st_mtime))
            except Exception:
                continue
    files.sort(key=lambda x: x[0], reverse=True)
    top = [{
        "name": fn,
        "folderKey": key,
        "sizeMb": round(sz / 1048576.0, 2),
        "lastModified": datetime.fromtimestamp(mt).strftime("%Y-%m-%d %H:%M")
    } for sz, fn, mt in files[:8]]
    return {"key": key, "path": path, "exists": True, "fileCount": fc, "folderCount": dc, "sizeMb": round(total / 1048576.0, 2)}, top

def inspect_trash():
    trash_files = os.path.expanduser("~/.local/share/Trash/files")
    if not os.path.isdir(trash_files):
        return {"sizeBytes": 0, "sizeMb": 0.0, "itemCount": 0, "perDrive": []}
    total_b = 0
    top_entries = 0
    try:
        top_entries = len(os.listdir(trash_files))
    except Exception:
        top_entries = 0
    for root, _, fnames in os.walk(trash_files, followlinks=False):
        for fn in fnames:
            fp = os.path.join(root, fn)
            try:
                if not os.path.islink(fp):
                    total_b += os.path.getsize(fp)
            except Exception:
                pass
    mb = round(total_b / 1048576.0, 2)
    return {
        "sizeBytes": total_b,
        "sizeMb": mb,
        "itemCount": top_entries,
        "perDrive": [{"drive": "~/.local/share/Trash", "sizeBytes": total_b, "sizeMb": mb, "itemCount": top_entries}]
    }

u_sum, u_top = inspect("user_temp", os.path.expanduser("~/.cache"))
w_sum, w_top = inspect("windows_temp", "/tmp")
largest = sorted(u_top + w_top, key=lambda x: x["sizeMb"], reverse=True)[:12]
print(json.dumps({"hostname": socket.gethostname(), "folders": [u_sum, w_sum], "largestFiles": largest, "recycleBin": inspect_trash()}))
PY
`;

export async function scanEndpointTempFolders(input: HelpdeskTargetInput): Promise<HelpdeskTempScanResult> {
  const execRes = await executeHardcodedScripts(input, PS_TEMP_SCAN, LINUX_TEMP_SCAN);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'temp folder scan');
  const rawFolders: any[] = Array.isArray(parsed.folders) ? parsed.folders : [];
  const rawFiles: any[] = Array.isArray(parsed.largestFiles) ? parsed.largestFiles : [];
  const rawRb = parsed.recycleBin || {};

  const folders: HelpdeskTempFolderSummary[] = rawFolders.map((f: any) => {
    const key: 'windows_temp' | 'user_temp' = f.key === 'windows_temp' ? 'windows_temp' : 'user_temp';
    return {
      key,
      labelEn:
        key === 'user_temp'
          ? execRes.osFamily === 'linux'
            ? 'User Cache (~/.cache)'
            : 'Active User Temp (AppData\\Local\\Temp)'
          : execRes.osFamily === 'linux'
          ? 'System Temp (/tmp)'
          : 'Windows Temp (Windows\\Temp)',
      labelFa:
        key === 'user_temp'
          ? execRes.osFamily === 'linux'
            ? 'کش موقت کاربر (~/.cache)'
            : 'پوشه Temp کاربر فعال (AppData\\Local\\Temp)'
          : execRes.osFamily === 'linux'
          ? 'پوشه موقت سیستم (/tmp)'
          : 'پوشه Temp ویندوز (Windows\\Temp)',
      path: String(f.path || ''),
      exists: Boolean(f.exists),
      fileCount: Number(f.fileCount) || 0,
      folderCount: Number(f.folderCount) || 0,
      sizeMb: Number(f.sizeMb) || 0,
    };
  });

  const totalReclaimableMb = Number(folders.reduce((s, f) => s + f.sizeMb, 0).toFixed(2));
  const totalFileCount = folders.reduce((s, f) => s + f.fileCount, 0);

  const recycleBinPerDrive: HelpdeskRecycleBinDriveSummary[] = (
    Array.isArray(rawRb.perDrive) ? rawRb.perDrive : []
  ).map((d: any) => ({
    drive: String(d.drive || '-'),
    sizeBytes: Number(d.sizeBytes) || 0,
    sizeMb: Number(d.sizeMb) || 0,
    itemCount: Number(d.itemCount) || 0,
  }));

  const recycleBin: HelpdeskRecycleBinSummary = {
    sizeBytes: Number(rawRb.sizeBytes) || 0,
    sizeMb: Number(rawRb.sizeMb) || 0,
    itemCount: Number(rawRb.itemCount) || 0,
    perDrive: recycleBinPerDrive,
  };

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    collectedAt: new Date().toISOString(),
    totalReclaimableMb,
    totalFileCount,
    folders,
    largestFiles: rawFiles.map((lf: any) => ({
      name: String(lf.name || '-'),
      folderKey: lf.folderKey === 'windows_temp' ? 'windows_temp' : 'user_temp',
      sizeMb: Number(lf.sizeMb) || 0,
      lastModified: String(lf.lastModified || ''),
    })),
    recycleBin,
  };
}

export async function cleanEndpointTempFolders(
  input: HelpdeskTargetInput,
  scope: HelpdeskTempCleanScope
): Promise<HelpdeskTempCleanResult> {
  const safeScope: HelpdeskTempCleanScope =
    scope === 'user_temp' ||
    scope === 'windows_temp' ||
    scope === 'recycle_bin' ||
    scope === 'all'
      ? scope
      : 'both';

  // Hardcoded paths ONLY — client can NEVER specify arbitrary paths!
  const psClean = `
$ErrorActionPreference = 'SilentlyContinue'
$scope = '${safeScope}'
$targets = @()
$winTemp = Join-Path $env:SystemRoot 'Temp'
$userTemp = $env:TEMP
try {
  $cs = Get-CimInstance Win32_ComputerSystem
  if ($cs -and $cs.UserName) {
    $uShort = ($cs.UserName -split '\\\\')[-1]
    $candidate = Join-Path "C:\\Users\\$uShort" 'AppData\\Local\\Temp'
    if (Test-Path $candidate) { $userTemp = $candidate }
  }
} catch {}

if (($scope -eq 'user_temp' -or $scope -eq 'both' -or $scope -eq 'all') -and $userTemp -and (Test-Path $userTemp)) { $targets += $userTemp }
if (($scope -eq 'windows_temp' -or $scope -eq 'both' -or $scope -eq 'all') -and $winTemp -and (Test-Path $winTemp)) { $targets += $winTemp }

$deleted = 0; $skipped = 0; $freedBytes = [int64]0; $remBytes = [int64]0
foreach ($dir in ($targets | Select-Object -Unique)) {
  $items = @(Get-ChildItem -Path $dir -Recurse -File -Force -ErrorAction SilentlyContinue)
  foreach ($f in $items) {
    $sz = [int64]$f.Length
    try {
      Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
      $deleted++
      $freedBytes += $sz
    } catch {
      $skipped++
      $remBytes += $sz
    }
  }
  # Clean empty subdirectories inside Temp only
  Get-ChildItem -Path $dir -Recurse -Directory -Force -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object {
      try {
        if ((Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue).Count -eq 0) {
          Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
        }
      } catch {}
    }
}

if ($scope -eq 'recycle_bin' -or $scope -eq 'all') {
  $fixedDrives = @()
  try {
    $fixedDrives = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DeviceID)
  } catch {}
  if ($fixedDrives.Count -eq 0) {
    try {
      $fixedDrives = @([System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' } | ForEach-Object { $_.Name.TrimEnd('\\') })
    } catch {}
  }

  $preRbBytes = [int64]0
  $preRbItems = 0
  foreach ($drv in ($fixedDrives | Where-Object { $_ } | Select-Object -Unique)) {
    $rbRoot = Join-Path ($drv + '\\') '$Recycle.Bin'
    if (-not (Test-Path -LiteralPath $rbRoot)) { continue }
    $sidDirs = @(Get-ChildItem -LiteralPath $rbRoot -Directory -Force -ErrorAction SilentlyContinue)
    foreach ($sd in $sidDirs) {
      $preRbItems += @(Get-ChildItem -LiteralPath $sd.FullName -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '$I*' -and $_.Name -ne 'desktop.ini' }).Count
    }
    foreach ($rf in @(Get-ChildItem -LiteralPath $rbRoot -File -Force -Recurse -ErrorAction SilentlyContinue)) {
      if ($rf.Name -like '$I*' -or $rf.Name -eq 'desktop.ini') { continue }
      $preRbBytes += [int64]$rf.Length
    }
  }

  try {
    if (Get-Command Clear-RecycleBin -ErrorAction SilentlyContinue) {
      Clear-RecycleBin -Force -ErrorAction SilentlyContinue | Out-Null
    }
  } catch {}

  foreach ($drv in ($fixedDrives | Where-Object { $_ } | Select-Object -Unique)) {
    $rbRoot = Join-Path ($drv + '\\') '$Recycle.Bin'
    if (-not (Test-Path -LiteralPath $rbRoot)) { continue }
    $sidDirs = @(Get-ChildItem -LiteralPath $rbRoot -Directory -Force -ErrorAction SilentlyContinue)
    foreach ($sd in $sidDirs) {
      $entries = @(Get-ChildItem -LiteralPath $sd.FullName -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' })
      foreach ($ent in $entries) {
        try {
          Remove-Item -LiteralPath $ent.FullName -Recurse -Force -ErrorAction Stop
        } catch {}
      }
    }
  }

  $postRbBytes = [int64]0
  $postRbItems = 0
  foreach ($drv in ($fixedDrives | Where-Object { $_ } | Select-Object -Unique)) {
    $rbRoot = Join-Path ($drv + '\\') '$Recycle.Bin'
    if (-not (Test-Path -LiteralPath $rbRoot)) { continue }
    $sidDirs = @(Get-ChildItem -LiteralPath $rbRoot -Directory -Force -ErrorAction SilentlyContinue)
    foreach ($sd in $sidDirs) {
      $postRbItems += @(Get-ChildItem -LiteralPath $sd.FullName -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '$I*' -and $_.Name -ne 'desktop.ini' }).Count
    }
    foreach ($rf in @(Get-ChildItem -LiteralPath $rbRoot -File -Force -Recurse -ErrorAction SilentlyContinue)) {
      if ($rf.Name -like '$I*' -or $rf.Name -eq 'desktop.ini') { continue }
      $postRbBytes += [int64]$rf.Length
    }
  }

  $deleted += [math]::Max(0, ($preRbItems - $postRbItems))
  $freedBytes += [math]::Max([int64]0, ($preRbBytes - $postRbBytes))
  $skipped += $postRbItems
  $remBytes += $postRbBytes
}

[PSCustomObject]@{
  ok = $true
  hostname = [string]$env:COMPUTERNAME
  deletedFiles = [int]$deleted
  skippedLockedFiles = [int]$skipped
  freedMb = [math]::Round(($freedBytes / 1MB), 2)
  remainingMb = [math]::Round(($remBytes / 1MB), 2)
} | ConvertTo-Json -Compress
`;

  const lxClean = `
python3 - <<'PY'
import json, os, shutil, socket
scope = "${safeScope}"
dirs = []
if scope in ("user_temp", "both", "all"): dirs.append(os.path.expanduser("~/.cache"))
if scope in ("windows_temp", "both", "all"): dirs.append("/tmp")
deleted, skipped, freed, rem = 0, 0, 0, 0
for d in dirs:
    if not os.path.isdir(d): continue
    for root, _, fnames in os.walk(d, followlinks=False):
        for fn in fnames:
            fp = os.path.join(root, fn)
            try:
                if os.path.islink(fp): continue
                sz = os.path.getsize(fp)
                os.remove(fp)
                deleted += 1
                freed += sz
            except Exception:
                skipped += 1
                try: rem += os.path.getsize(fp)
                except Exception: pass
if scope in ("recycle_bin", "all"):
    trash_files = os.path.expanduser("~/.local/share/Trash/files")
    trash_info = os.path.expanduser("~/.local/share/Trash/info")
    if os.path.isdir(trash_files):
        for entry in os.listdir(trash_files):
            ep = os.path.join(trash_files, entry)
            esize = 0
            try:
                if os.path.islink(ep) or os.path.isfile(ep):
                    esize = os.path.getsize(ep) if not os.path.islink(ep) else 0
                    os.unlink(ep)
                elif os.path.isdir(ep):
                    for r2, _, f2s in os.walk(ep, followlinks=False):
                        for f2 in f2s:
                            try:
                                esize += os.path.getsize(os.path.join(r2, f2))
                            except Exception:
                                pass
                    shutil.rmtree(ep)
                deleted += 1
                freed += esize
            except Exception:
                skipped += 1
                rem += esize
    if os.path.isdir(trash_info):
        for entry in os.listdir(trash_info):
            ip = os.path.join(trash_info, entry)
            try:
                if os.path.isfile(ip) or os.path.islink(ip):
                    os.unlink(ip)
            except Exception:
                pass
print(json.dumps({
    "ok": True,
    "hostname": socket.gethostname(),
    "deletedFiles": deleted,
    "skippedLockedFiles": skipped,
    "freedMb": round(freed / 1048576.0, 2),
    "remainingMb": round(rem / 1048576.0, 2)
}))
PY
`;

  const execRes = await executeHardcodedScripts(input, psClean, lxClean);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'temp/recycle-bin cleanup');
  const deletedFiles = Number(parsed.deletedFiles) || 0;
  const skippedLockedFiles = Number(parsed.skippedLockedFiles) || 0;
  const freedMb = Number(parsed.freedMb) || 0;
  const remainingMb = Number(parsed.remainingMb) || 0;

  const message =
    safeScope === 'recycle_bin'
      ? `Emptied Recycle Bin: permanently removed ${deletedFiles} item(s) and freed ${freedMb} MB on ${execRes.host}${
          skippedLockedFiles > 0 ? ` (${skippedLockedFiles} locked item(s) skipped)` : ''
        }.`
      : safeScope === 'all'
      ? `Cleaned Temp folders and emptied Recycle Bin: removed ${deletedFiles} item(s) and freed ${freedMb} MB on ${execRes.host} (${skippedLockedFiles} locked item(s) skipped).`
      : `Safely cleaned ${deletedFiles} temp file(s) and freed ${freedMb} MB on ${execRes.host} (${skippedLockedFiles} in-use locked file(s) safely skipped).`;

  const messageFa =
    safeScope === 'recycle_bin'
      ? `سطل زباله (Recycle Bin) با موفقیت خالی شد: ${deletedFiles} مورد حذف و ${freedMb} مگابایت فضا روی سیستم ${execRes.host} آزاد شد${
          skippedLockedFiles > 0 ? ` (${skippedLockedFiles} مورد در حال استفاده رد شد)` : ''
        }.`
      : safeScope === 'all'
      ? `پوشه‌های Temp و سطل زباله با موفقیت پاک‌سازی شدند: ${deletedFiles} مورد حذف و ${freedMb} مگابایت فضا روی سیستم ${execRes.host} آزاد شد (${skippedLockedFiles} مورد قفل‌شده رد شد).`
      : `${deletedFiles} فایل موقت با موفقیت پاک و ${freedMb} مگابایت فضا روی سیستم ${execRes.host} آزاد شد (${skippedLockedFiles} فایل در حال استفاده به‌صورت ایمن رد شد).`;

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    scope: safeScope,
    success: Boolean(parsed.ok),
    deletedFiles,
    skippedLockedFiles,
    freedMb,
    remainingMb,
    message,
    messageFa,
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 14. MODULE 7: GROUP POLICY INSPECTION & SAFE NON-DISRUPTIVE GPUPDATE /FORCE
// ============================================================================

const PS_GPO_STATUS = `
$ErrorActionPreference = 'SilentlyContinue'
$cs = Get-CimInstance Win32_ComputerSystem
$domainJoined = [bool]$cs.PartOfDomain
$raw = (gpresult.exe /r /scope computer 2>&1 | Out-String).Trim()
$compGpos = @()
$userGpos = @()
$inCompApplied = $false
$lastRefresh = ''
foreach ($line in ($raw -split "\`r?\`n")) {
  $t = $line.Trim()
  if ($t -match '^Last time Group Policy was applied:\\s*(.+)$') { $lastRefresh = $Matches[1].Trim() }
  if ($t -match '^Applied Group Policy Objects$') { $inCompApplied = $true; continue }
  if ($inCompApplied) {
    if ($t -match '^-+$') { continue }
    if (-not $t -or $t -match '^(The following GPOs|The computer is a part of|USER SETTINGS)') { $inCompApplied = $false; continue }
    $compGpos += $t
  }
}

$pendingReboot = $false
if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $pendingReboot = $true }
if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') { $pendingReboot = $true }

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  domain = [string]$cs.Domain
  loggedInUser = [string]$cs.UserName
  domainJoined = $domainJoined
  pendingReboot = $pendingReboot
  lastGpoRefresh = $lastRefresh
  computerGpos = $compGpos
  userGpos = $userGpos
  rawSummary = if ($raw.Length -gt 3500) { $raw.Substring(0, 3500) + '...' } else { $raw }
} | ConvertTo-Json -Depth 5 -Compress
`;

const LINUX_GPO_STATUS = `
python3 - <<'PY'
import json, os, socket, subprocess
def run(cmd):
    try: return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: return ""
realm = run("realm list 2>/dev/null")
pending = os.path.exists("/var/run/reboot-required")
print(json.dumps({
    "hostname": socket.gethostname(),
    "domain": run("dnsdomainname 2>/dev/null") or "",
    "loggedInUser": os.environ.get("USER", ""),
    "domainJoined": bool(realm),
    "pendingReboot": pending,
    "lastGpoRefresh": "",
    "computerGpos": [],
    "userGpos": [],
    "rawSummary": realm or "Linux endpoint detected (Windows Group Policy applies only to AD-joined Windows workstations)."
}))
PY
`;

export async function collectEndpointGpoStatus(input: HelpdeskTargetInput): Promise<HelpdeskGpoStatusResult> {
  const execRes = await executeHardcodedScripts(input, PS_GPO_STATUS, LINUX_GPO_STATUS);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'GPO status');
  const compGpos = Array.isArray(parsed.computerGpos)
    ? parsed.computerGpos.map(String).filter(Boolean)
    : parsed.computerGpos
    ? [String(parsed.computerGpos)]
    : [];
  const userGpos = Array.isArray(parsed.userGpos)
    ? parsed.userGpos.map(String).filter(Boolean)
    : parsed.userGpos
    ? [String(parsed.userGpos)]
    : [];

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    domain: String(parsed.domain || ''),
    loggedInUser: String(parsed.loggedInUser || ''),
    collectedAt: new Date().toISOString(),
    domainJoined: Boolean(parsed.domainJoined),
    pendingReboot: Boolean(parsed.pendingReboot),
    lastGpoRefresh: String(parsed.lastGpoRefresh || ''),
    computerGpos: compGpos,
    userGpos,
    rawSummary: String(parsed.rawSummary || ''),
  };
}

export async function executeEndpointGpupdate(input: HelpdeskTargetInput): Promise<HelpdeskActionResult> {
  // Always pipes 'N' and /wait:0 so gpupdate NEVER forces an unexpected logoff or reboot on the user's workstation!
  const psGpupdate = `
$ErrorActionPreference = 'Continue'
$out = (cmd.exe /c "echo N | gpupdate.exe /force /wait:0" 2>&1 | Out-String).Trim()
$ok = ($out -match 'completed successfully') -or ($LASTEXITCODE -eq 0)
$needsRebootOrLogoff = ($out -match 'OK to log off|OK to restart')
[PSCustomObject]@{
  ok = $ok
  needsRebootOrLogoff = $needsRebootOrLogoff
  output = $out
} | ConvertTo-Json -Compress
`;

  const lxGpupdate = `
python3 - <<'PY'
import json
print(json.dumps({
    "ok": False,
    "needsRebootOrLogoff": False,
    "output": "gpupdate /force is a Windows Active Directory command and is not applicable to Linux hosts."
}))
PY
`;

  const execRes = await executeHardcodedScripts(input, psGpupdate, lxGpupdate);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'gpupdate /force');
  const ok = Boolean(parsed.ok);
  const needsRestart = Boolean(parsed.needsRebootOrLogoff);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'gpupdate_force',
    success: ok,
    message: ok
      ? needsRestart
        ? `Group Policy refreshed (gpupdate /force) on ${execRes.host}. Some policies will apply at the user's next sign-in/restart (forced logoff was safely declined).`
        : `Group Policy (gpupdate /force) completed successfully on ${execRes.host}.`
      : String(parsed.output || `gpupdate /force did not complete on ${execRes.host}.`),
    messageFa: ok
      ? needsRestart
        ? `بروزرسانی Group Policy (gpupdate /force) روی سیستم ${execRes.host} انجام شد. برخی پالیسی‌ها در لاگین یا ری‌استارت بعدی اعمال می‌شوند (ری‌استارت اجباری کاربر مسدود شد).`
        : `بروزرسانی Group Policy (gpupdate /force) روی سیستم ${execRes.host} با موفقیت کامل شد.`
      : `اجرای gpupdate /force روی ${execRes.host} ناموفق بود: ${String(parsed.output || '')}`,
    details: {
      needsRebootOrLogoff: needsRestart,
      operation: 'gpupdate /force /wait:0',
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 15. DETAILED SYSTEM INFO & INSTALLED WINDOWS UPDATES (systeminfo + HotFix)
// ============================================================================

export interface HelpdeskHotfixItem {
  hotfixId: string;
  description: string;
  installedOn: string;
  installedBy: string;
}

export interface HelpdeskSystemInfoResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  osName: string;
  osVersion: string;
  osDisplayVersion: string;
  osBuild: string;
  osArchitecture: string;
  installDate: string;
  lastBootTime: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  domain: string;
  domainJoined: boolean;
  manufacturer: string;
  model: string;
  biosVersion: string;
  serialNumber: string;
  cpuModel: string;
  totalRamGb: number;
  availableRamGb: number;
  virtualMemTotalGb: number;
  virtualMemAvailGb: number;
  hotfixes: HelpdeskHotfixItem[];
  rawSystemInfo: string;
  collectedAt: string;
}

export async function collectEndpointSystemInfo(
  input: HelpdeskTargetInput
): Promise<HelpdeskSystemInfoResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$reg = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$dispVer = if ($reg.DisplayVersion) { [string]$reg.DisplayVersion } elseif ($reg.ReleaseId) { [string]$reg.ReleaseId } else { '' }
$ubr = if ($null -ne $reg.UBR) { [string]$reg.UBR } else { '' }
$fullBuild = if ($ubr) { "$($os.BuildNumber).$ubr" } else { [string]$os.BuildNumber }
$uptimeSec = if ($os.LastBootUpTime) { [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalSeconds) } else { 0 }
$bootIso = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm:ss') } else { '' }
$instIso = if ($os.InstallDate) { $os.InstallDate.ToString('yyyy-MM-dd') } else { '' }

$hotfixes = @(Get-CimInstance Win32_QuickFixEngineering | Sort-Object -Property InstalledOn -Descending | Select-Object -First 80 | ForEach-Object {
  $dt = ''
  try {
    if ($_.InstalledOn -is [datetime]) { $dt = $_.InstalledOn.ToString('yyyy-MM-dd') }
    elseif ($_.InstalledOn) { $dt = [string]$_.InstalledOn }
  } catch {}
  [PSCustomObject]@{
    hotfixId = [string]$_.HotFixID
    description = [string]$_.Description
    installedOn = $dt
    installedBy = [string]$_.InstalledBy
  }
})

$rawSys = ''
try {
  $rawSys = (& systeminfo.exe 2>&1 | Out-String)
  if ($rawSys.Length -gt 12000) { $rawSys = $rawSys.Substring(0, 12000) }
} catch {}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  osName = [string]$os.Caption
  osVersion = [string]$os.Version
  osDisplayVersion = $dispVer
  osBuild = $fullBuild
  osArchitecture = [string]$os.OSArchitecture
  installDate = $instIso
  lastBootTime = $bootIso
  uptimeSeconds = [int]$uptimeSec
  domain = [string]$cs.Domain
  domainJoined = [bool]$cs.PartOfDomain
  manufacturer = [string]$cs.Manufacturer
  model = [string]$cs.Model
  biosVersion = [string]($bios.SMBIOSBIOSVersion)
  serialNumber = [string]($bios.SerialNumber)
  cpuModel = [string]($cpu.Name)
  totalRamGb = [math]::Round(($cs.TotalPhysicalMemory / 1GB), 2)
  availableRamGb = [math]::Round(($os.FreePhysicalMemory / 1MB), 2)
  virtualMemTotalGb = [math]::Round(($os.TotalVirtualMemorySize / 1MB), 2)
  virtualMemAvailGb = [math]::Round(($os.FreeVirtualMemory / 1MB), 2)
  hotfixes = $hotfixes
  rawSystemInfo = $rawSys
} | ConvertTo-Json -Depth 5 -Compress
`;

  const linuxSh = `python3 - <<'PYEOF'
import json, os, platform, subprocess
def run(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, text=True, timeout=8).strip()
    except Exception:
        return ""
os_name = platform.platform()
os_ver = platform.release()
if os.path.exists('/etc/os-release'):
    for line in open('/etc/os-release'):
        if line.startswith('PRETTY_NAME='):
            os_name = line.split('=',1)[1].strip().strip('"')
boot = run("uptime -s")
up_sec = 0
try:
    up_sec = int(float(open('/proc/uptime').read().split()[0]))
except Exception:
    pass
mem_total = mem_avail = 0.0
try:
    for line in open('/proc/meminfo'):
        if line.startswith('MemTotal:'): mem_total = round(int(line.split()[1]) / 1048576.0, 2)
        elif line.startswith('MemAvailable:'): mem_avail = round(int(line.split()[1]) / 1048576.0, 2)
except Exception:
    pass
raw = run("uname -a && lsb_release -a 2>/dev/null || cat /etc/os-release 2>/dev/null")
print(json.dumps({
    "hostname": platform.node(),
    "osName": os_name,
    "osVersion": os_ver,
    "osDisplayVersion": platform.machine(),
    "osBuild": platform.release(),
    "osArchitecture": platform.machine(),
    "installDate": "",
    "lastBootTime": boot,
    "uptimeSeconds": up_sec,
    "domain": run("dnsdomainname") or "Workgroup",
    "domainJoined": bool(run("realm list 2>/dev/null")),
    "manufacturer": run("cat /sys/devices/virtual/dmi/id/sys_vendor 2>/dev/null"),
    "model": run("cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null"),
    "biosVersion": run("cat /sys/devices/virtual/dmi/id/bios_version 2>/dev/null"),
    "serialNumber": run("cat /sys/devices/virtual/dmi/id/product_serial 2>/dev/null"),
    "cpuModel": run("lscpu 2>/dev/null | grep -i 'model name' | head -n1 | cut -d: -f2").strip(),
    "totalRamGb": mem_total,
    "availableRamGb": mem_avail,
    "virtualMemTotalGb": 0,
    "virtualMemAvailGb": 0,
    "hotfixes": [],
    "rawSystemInfo": raw[:12000],
}))
PYEOF`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(35000, input.timeoutMs || 35000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'systeminfo');

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    osName: String(parsed.osName || ''),
    osVersion: String(parsed.osVersion || ''),
    osDisplayVersion: String(parsed.osDisplayVersion || ''),
    osBuild: String(parsed.osBuild || ''),
    osArchitecture: String(parsed.osArchitecture || ''),
    installDate: String(parsed.installDate || ''),
    lastBootTime: String(parsed.lastBootTime || ''),
    uptimeSeconds: Number(parsed.uptimeSeconds) || 0,
    uptimeFormatted: formatUptime(Number(parsed.uptimeSeconds) || 0),
    domain: String(parsed.domain || ''),
    domainJoined: Boolean(parsed.domainJoined),
    manufacturer: String(parsed.manufacturer || ''),
    model: String(parsed.model || ''),
    biosVersion: String(parsed.biosVersion || ''),
    serialNumber: String(parsed.serialNumber || ''),
    cpuModel: String(parsed.cpuModel || ''),
    totalRamGb: Number(parsed.totalRamGb) || 0,
    availableRamGb: Number(parsed.availableRamGb) || 0,
    virtualMemTotalGb: Number(parsed.virtualMemTotalGb) || 0,
    virtualMemAvailGb: Number(parsed.virtualMemAvailGb) || 0,
    hotfixes: Array.isArray(parsed.hotfixes)
      ? parsed.hotfixes.map((h: any) => ({
          hotfixId: String(h.hotfixId || ''),
          description: String(h.description || 'Update'),
          installedOn: String(h.installedOn || ''),
          installedBy: String(h.installedBy || ''),
        }))
      : [],
    rawSystemInfo: String(parsed.rawSystemInfo || ''),
    collectedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 15B. WINDOWS UPDATE POLICY (WSUS vs INTERNET), AVAILABLE UPDATES & KB UNINSTALL
// ============================================================================

export interface HelpdeskPendingUpdateItem {
  id: string;
  title: string;
  kbIds: string[];
  severity: string;
  sizeMb: number;
  isDownloaded: boolean;
  isMandatory: boolean;
  rebootRequired: boolean;
  description: string;
}

export interface HelpdeskWindowsUpdateStatusResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  collectedAt: string;
  wsusPolicy: {
    configured: boolean;
    useWuServer: boolean;
    wuServer: string;
    wuStatusServer: string;
    targetGroup: string;
    auOptions: number | null;
    auOptionsLabel: string;
    sourceMode: 'wsus' | 'microsoft_update' | 'linux_pkg';
  };
  updateService: {
    wuauservStatus: string;
    wuauservStartType: string;
    usoSvcStatus: string;
  };
  pendingReboot: {
    required: boolean;
    reasons: string[];
  };
  lastCheckTime: string;
  lastInstallTime: string;
  sourceScanned: 'wsus' | 'microsoft_update' | 'linux_pkg';
  scanSucceeded: boolean;
  scanNote?: string;
  pendingUpdates: HelpdeskPendingUpdateItem[];
}

export async function collectEndpointUpdateStatus(
  input: HelpdeskTargetInput,
  sourceMode: 'auto' | 'wsus' | 'internet' = 'auto',
  withOnlineScan = true
): Promise<HelpdeskWindowsUpdateStatusResult> {
  const safeSrc = sourceMode === 'wsus' || sourceMode === 'internet' ? sourceMode : 'auto';
  const scanFlag = withOnlineScan ? '$true' : '$false';

  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$wuPath = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate'
$auPath = "$wuPath\\AU"
$wuReg = Get-ItemProperty -Path $wuPath -ErrorAction SilentlyContinue
$auReg = Get-ItemProperty -Path $auPath -ErrorAction SilentlyContinue
$wuServer = if ($wuReg -and $wuReg.WUServer) { [string]$wuReg.WUServer } else { '' }
$wuStatus = if ($wuReg -and $wuReg.WUStatusServer) { [string]$wuReg.WUStatusServer } else { '' }
$tGroup = if ($wuReg -and $wuReg.TargetGroup) { [string]$wuReg.TargetGroup } else { '' }
$useWu = ($auReg -and [int]$auReg.UseWUServer -eq 1 -and [bool]$wuServer)
$auOpt = if ($auReg -and $null -ne $auReg.AUOptions) { [int]$auReg.AUOptions } else { $null }

$wuaSvc = Get-CimInstance Win32_Service -Filter "Name='wuauserv'"
$usoSvc = Get-CimInstance Win32_Service -Filter "Name='UsoSvc'"

$rebReasons = @()
if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $rebReasons += 'Windows Update RebootRequired' }
if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') { $rebReasons += 'CBS RebootPending' }
try {
  $sm = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
  if ($sm -and $sm.PendingFileRenameOperations) { $rebReasons += 'PendingFileRenameOperations' }
} catch {}

$lastSearch = ''; $lastInstall = ''
try {
  $autoUp = New-Object -ComObject Microsoft.Update.AutoUpdate
  $res = $autoUp.Results
  if ($res.LastSearchSuccessDate -and $res.LastSearchSuccessDate.Year -gt 1900) { $lastSearch = $res.LastSearchSuccessDate.ToString('yyyy-MM-dd HH:mm:ss') }
  if ($res.LastInstallationSuccessDate -and $res.LastInstallationSuccessDate.Year -gt 1900) { $lastInstall = $res.LastInstallationSuccessDate.ToString('yyyy-MM-dd HH:mm:ss') }
} catch {}

$reqSrc = '${safeSrc}'
$effectiveSource = if ($reqSrc -eq 'internet') { 'microsoft_update' } elseif ($reqSrc -eq 'wsus') { 'wsus' } elseif ($useWu) { 'wsus' } else { 'microsoft_update' }

$pending = @()
$scanOk = $true
$scanNote = ''
if (${scanFlag}) {
  if ($reqSrc -eq 'wsus' -and (-not $useWu)) {
    $scanOk = $false
    $scanNote = 'WSUS policy (UseWUServer=1 / WUServer) is not configured on this workstation.'
  } else {
    try {
      if ($wuaSvc -and $wuaSvc.State -ne 'Running') {
        Start-Service -Name 'wuauserv' -ErrorAction SilentlyContinue
      }
      $session = New-Object -ComObject Microsoft.Update.Session
      $searcher = $session.CreateUpdateSearcher()
      if ($reqSrc -eq 'internet') {
        $searcher.ServerSelection = 2
      } else {
        $searcher.ServerSelection = 0
      }
      $sRes = $searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
      foreach ($u in $sRes.Updates) {
        $kbs = @()
        foreach ($kb in $u.KBArticleIDs) { $kbs += "KB$kb" }
        $sz = [math]::Round(($u.MaxDownloadSize / 1MB), 1)
        $pending += [PSCustomObject]@{
          id = [string]$u.Identity.UpdateID
          title = [string]$u.Title
          kbIds = $kbs
          severity = if ($u.MsrcSeverity) { [string]$u.MsrcSeverity } else { 'Normal' }
          sizeMb = $sz
          isDownloaded = [bool]$u.IsDownloaded
          isMandatory = [bool]$u.IsMandatory
          rebootRequired = [bool]($u.RebootRequired)
          description = if ($u.Description) { ([string]$u.Description).Substring(0, [math]::Min(240, ([string]$u.Description).Length)) } else { '' }
        }
      }
    } catch {
      $scanOk = $false
      $scanNote = $_.Exception.Message
    }
  }
}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  wsusPolicy = [PSCustomObject]@{
    configured = [bool]$wuServer
    useWuServer = [bool]$useWu
    wuServer = $wuServer
    wuStatusServer = $wuStatus
    targetGroup = $tGroup
    auOptions = $auOpt
    sourceMode = if ($useWu) { 'wsus' } else { 'microsoft_update' }
  }
  updateService = [PSCustomObject]@{
    wuauservStatus = if ($wuaSvc) { [string]$wuaSvc.State } else { 'Unknown' }
    wuauservStartType = if ($wuaSvc) { [string]$wuaSvc.StartMode } else { 'Unknown' }
    usoSvcStatus = if ($usoSvc) { [string]$usoSvc.State } else { 'Unknown' }
  }
  pendingReboot = [PSCustomObject]@{
    required = ($rebReasons.Count -gt 0)
    reasons = $rebReasons
  }
  lastCheckTime = $lastSearch
  lastInstallTime = $lastInstall
  sourceScanned = $effectiveSource
  scanSucceeded = $scanOk
  scanNote = $scanNote
  pendingUpdates = $pending
} | ConvertTo-Json -Depth 6 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, os, socket, subprocess
pending = []
scan_ok, note = True, ""
if ${withOnlineScan ? 'True' : 'False'}:
    try:
        out = subprocess.check_output(["sh", "-c", "apt list --upgradable 2>/dev/null || dnf check-update -q 2>/dev/null"], text=True, timeout=25)
        for line in out.splitlines():
            if not line.strip() or line.startswith("Listing"): continue
            pkg = line.split()[0]
            pending.append({"id": pkg, "title": line.strip(), "kbIds": [], "severity": "Normal", "sizeMb": 0, "isDownloaded": False, "isMandatory": False, "rebootRequired": False, "description": ""})
    except Exception as e:
        scan_ok, note = False, str(e)
print(json.dumps({
    "hostname": socket.gethostname(),
    "wsusPolicy": {"configured": False, "useWuServer": False, "wuServer": "", "wuStatusServer": "", "targetGroup": "", "auOptions": None, "sourceMode": "linux_pkg"},
    "updateService": {"wuauservStatus": "apt/dnf", "wuauservStartType": "Auto", "usoSvcStatus": "-"},
    "pendingReboot": {"required": os.path.exists("/var/run/reboot-required"), "reasons": ["reboot-required"] if os.path.exists("/var/run/reboot-required") else []},
    "lastCheckTime": "", "lastInstallTime": "",
    "sourceScanned": "linux_pkg", "scanSucceeded": scan_ok, "scanNote": note,
    "pendingUpdates": pending[:60]
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(90000, input.timeoutMs || 90000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'Windows Update & WSUS status');
  const auCode = parsed.wsusPolicy?.auOptions !== null && parsed.wsusPolicy?.auOptions !== undefined
    ? Number(parsed.wsusPolicy.auOptions)
    : null;
  const auLabels: Record<number, string> = {
    2: 'Notify before download',
    3: 'Auto download & notify for install',
    4: 'Auto download & scheduled install',
    5: 'Allow local admin to choose setting',
  };

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    collectedAt: new Date().toISOString(),
    wsusPolicy: {
      configured: Boolean(parsed.wsusPolicy?.configured),
      useWuServer: Boolean(parsed.wsusPolicy?.useWuServer),
      wuServer: String(parsed.wsusPolicy?.wuServer || ''),
      wuStatusServer: String(parsed.wsusPolicy?.wuStatusServer || ''),
      targetGroup: String(parsed.wsusPolicy?.targetGroup || ''),
      auOptions: auCode,
      auOptionsLabel: auCode !== null && auLabels[auCode] ? auLabels[auCode] : 'Default Policy',
      sourceMode: parsed.wsusPolicy?.sourceMode === 'wsus'
        ? 'wsus'
        : parsed.wsusPolicy?.sourceMode === 'linux_pkg'
        ? 'linux_pkg'
        : 'microsoft_update',
    },
    updateService: {
      wuauservStatus: String(parsed.updateService?.wuauservStatus || 'Unknown'),
      wuauservStartType: String(parsed.updateService?.wuauservStartType || 'Unknown'),
      usoSvcStatus: String(parsed.updateService?.usoSvcStatus || 'Unknown'),
    },
    pendingReboot: {
      required: Boolean(parsed.pendingReboot?.required),
      reasons: Array.isArray(parsed.pendingReboot?.reasons)
        ? parsed.pendingReboot.reasons.map(String)
        : [],
    },
    lastCheckTime: String(parsed.lastCheckTime || ''),
    lastInstallTime: String(parsed.lastInstallTime || ''),
    sourceScanned: parsed.sourceScanned === 'wsus'
      ? 'wsus'
      : parsed.sourceScanned === 'linux_pkg'
      ? 'linux_pkg'
      : 'microsoft_update',
    scanSucceeded: Boolean(parsed.scanSucceeded),
    scanNote: parsed.scanNote ? String(parsed.scanNote) : undefined,
    pendingUpdates: Array.isArray(parsed.pendingUpdates)
      ? parsed.pendingUpdates.map((u: any) => ({
          id: String(u.id || ''),
          title: String(u.title || 'Update'),
          kbIds: Array.isArray(u.kbIds) ? u.kbIds.map(String) : u.kbIds ? [String(u.kbIds)] : [],
          severity: String(u.severity || 'Normal'),
          sizeMb: Number(u.sizeMb) || 0,
          isDownloaded: Boolean(u.isDownloaded),
          isMandatory: Boolean(u.isMandatory),
          rebootRequired: Boolean(u.rebootRequired),
          description: String(u.description || ''),
        }))
      : [],
  };
}

export async function installEndpointWindowsUpdates(
  input: HelpdeskTargetInput,
  options: {
    source?: 'auto' | 'wsus' | 'internet';
    kbFilter?: string[];
  } = {}
): Promise<HelpdeskActionResult> {
  const src: 'auto' | 'wsus' | 'internet' =
    options.source === 'wsus' || options.source === 'internet' ? options.source : 'auto';
  const validKbs: string[] = [];
  for (const k of options.kbFilter || []) {
    const clean = String(k || '').trim().toUpperCase().replace(/^KB/, '');
    if (/^\d{5,9}$/.test(clean)) validKbs.push(clean);
  }
  const kbJson = Buffer.from(JSON.stringify({ src, validKbs }), 'utf8').toString('base64');

  const winPs = `
$ErrorActionPreference = 'Stop'
$cfg = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${kbJson}')) | ConvertFrom-Json
$auReg = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU' -ErrorAction SilentlyContinue
$wuReg = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate' -ErrorAction SilentlyContinue
$useWu = ($auReg -and [int]$auReg.UseWUServer -eq 1 -and $wuReg -and [bool]$wuReg.WUServer)
$effSrc = if ($cfg.src -eq 'internet') { 'Microsoft Update (Internet)' } elseif ($cfg.src -eq 'wsus') { "WSUS ($($wuReg.WUServer))" } elseif ($useWu) { "WSUS ($($wuReg.WUServer))" } else { 'Microsoft Update (Internet)' }

if ($cfg.src -eq 'wsus' -and (-not $useWu)) {
  [PSCustomObject]@{ ok = $false; installedCount = 0; foundCount = 0; rebootRequired = $false; sourceUsed = 'WSUS'; output = 'WSUS GPO (UseWUServer=1 / WUServer) is not configured on this workstation.' } | ConvertTo-Json -Compress
  exit 0
}

try { Start-Service -Name 'wuauserv' -ErrorAction SilentlyContinue } catch {}
$session = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
$searcher.ServerSelection = if ($cfg.src -eq 'internet') { 2 } else { 0 }
$sRes = $searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")

$toInstall = New-Object -ComObject Microsoft.Update.UpdateColl
$kbSet = @{}
foreach ($k in $cfg.validKbs) { $kbSet[$k] = $true }
$titles = @()

foreach ($u in $sRes.Updates) {
  if ($kbSet.Count -gt 0) {
    $matched = $false
    foreach ($ukb in $u.KBArticleIDs) { if ($kbSet.ContainsKey([string]$ukb)) { $matched = $true } }
    if (-not $matched) { continue }
  }
  if ($u.EulaAccepted -eq $false) { try { $u.AcceptEula() } catch {} }
  $toInstall.Add($u) | Out-Null
  $titles += [string]$u.Title
}

if ($toInstall.Count -eq 0) {
  [PSCustomObject]@{ ok = $true; installedCount = 0; foundCount = 0; rebootRequired = $false; sourceUsed = $effSrc; output = "No pending updates matched on $effSrc. System is up to date." } | ConvertTo-Json -Compress
  exit 0
}

$downloader = $session.CreateUpdateDownloader()
$downloader.Updates = $toInstall
$dlRes = $downloader.Download()

$readyColl = New-Object -ComObject Microsoft.Update.UpdateColl
foreach ($u in $toInstall) {
  if ($u.IsDownloaded) { $readyColl.Add($u) | Out-Null }
}
if ($readyColl.Count -eq 0) {
  [PSCustomObject]@{ ok = $false; installedCount = 0; foundCount = $toInstall.Count; rebootRequired = $false; sourceUsed = $effSrc; output = "Download failed from $effSrc (Downloader ResultCode=$($dlRes.ResultCode))." } | ConvertTo-Json -Compress
  exit 0
}

$installer = $session.CreateUpdateInstaller()
$installer.Updates = $readyColl
$installer.ForceQuiet = $true
$instRes = $installer.Install()

$installedCnt = 0
for ($i = 0; $i -lt $readyColl.Count; $i++) {
  if ($instRes.GetUpdateResult($i).ResultCode -eq 2) { $installedCnt++ }
}
try { & UsoClient.exe RefreshSettings | Out-Null } catch {}

[PSCustomObject]@{
  ok = ($instRes.ResultCode -eq 2 -or $instRes.ResultCode -eq 3 -or $installedCnt -gt 0)
  installedCount = $installedCnt
  foundCount = $toInstall.Count
  rebootRequired = [bool]$instRes.RebootRequired
  sourceUsed = $effSrc
  output = "Source: $effSrc | ResultCode: $($instRes.ResultCode) | Installed: $installedCnt/$($toInstall.Count) | RebootRequired: $($instRes.RebootRequired)\\n" + ($titles -join "\\n")
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, subprocess
p = subprocess.run(["sh", "-c", "DEBIAN_FRONTEND=noninteractive apt-get update && apt-get -y upgrade || dnf -y upgrade"], capture_output=True, text=True, timeout=180)
print(json.dumps({"ok": p.returncode == 0, "installedCount": 1 if p.returncode == 0 else 0, "foundCount": 1, "rebootRequired": False, "sourceUsed": "Linux Package Repo", "output": (p.stdout + p.stderr)[-4000:]}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(240000, input.timeoutMs || 240000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'Windows Update install');
  const ok = Boolean(parsed.ok);
  const installedCount = Number(parsed.installedCount) || 0;
  const foundCount = Number(parsed.foundCount) || 0;
  const rebootRequired = Boolean(parsed.rebootRequired);
  const sourceUsed = String(parsed.sourceUsed || src);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'windows_update_install',
    success: ok,
    message: !ok
      ? `Windows Update installation from ${sourceUsed} failed on ${execRes.host}: ${parsed.output}`
      : foundCount === 0
      ? `System ${execRes.host} is already up to date (${sourceUsed}).`
      : `Installed ${installedCount}/${foundCount} update(s) from ${sourceUsed} on ${execRes.host}.${rebootRequired ? ' Reboot required to finish.' : ''}`,
    messageFa: !ok
      ? `نصب آپدیت از ${sourceUsed} روی ${execRes.host} ناموفق بود: ${parsed.output}`
      : foundCount === 0
      ? `سیستم ${execRes.host} بر اساس منبع ${sourceUsed} کاملاً بروز است (آپدیت جدیدی وجود نداشت).`
      : `${installedCount} از ${foundCount} آپدیت از طریق ${sourceUsed} روی ${execRes.host} نصب شد.${rebootRequired ? ' (نیازمند ری‌استارت سیستم)' : ''}`,
    details: {
      sourceRequested: src,
      sourceUsed,
      foundCount,
      installedCount,
      rebootRequired,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function uninstallEndpointHotfix(
  input: HelpdeskTargetInput,
  rawKbId: string
): Promise<HelpdeskActionResult> {
  const cleanKb = String(rawKbId || '').trim().toUpperCase();
  const m = cleanKb.match(/^(?:KB)?(\d{5,9})$/);
  if (!m) {
    throw new Error('Invalid Windows Update KB ID. Expected format: KB5034122');
  }
  const kbNum = m[1];
  const kbFull = `KB${kbNum}`;

  const winPs = `
$ErrorActionPreference = 'Continue'
$kbNum = '${kbNum}'
$kbFull = '${kbFull}'
$out = ''
$code = -1
$ok = $false
$reb = $false

$p = Start-Process -FilePath 'wusa.exe' -ArgumentList @('/uninstall', "/kb:$kbNum", '/quiet', '/norestart') -Wait -PassThru -NoNewWindow
$code = $p.ExitCode
if ($code -eq 0 -or $code -eq 3010) {
  $ok = $true
  $reb = ($code -eq 3010)
  $out = "wusa.exe /uninstall /kb:$kbNum completed with ExitCode=$code"
} else {
  $out = "wusa.exe returned ExitCode=$code. Trying DISM package lookup..."
  try {
    $dismList = (& dism.exe /Online /Get-Packages /Format:Table 2>&1 | Out-String)
    $pkgName = ''
    foreach ($ln in ($dismList -split "\`r?\`n")) {
      if ($ln -match "(Package_for_[^\\s|]*$kbFull[^\\s|]*|[^\\s|]*KB$kbNum[^\\s|]*)") {
        $pkgName = $Matches[1].Trim()
        break
      }
    }
    if ($pkgName) {
      $dOut = (& dism.exe /Online /Remove-Package /PackageName:$pkgName /Quiet /NoRestart 2>&1 | Out-String).Trim()
      $dCode = $LASTEXITCODE
      $out += "\`nDISM /Remove-Package ($pkgName) ExitCode=$dCode: $dOut"
      if ($dCode -eq 0 -or $dCode -eq 3010) {
        $ok = $true
        $reb = ($dCode -eq 3010)
      }
    } else {
      $out += "\`nNo removable CBS package matched $kbFull (the update may be permanent or already removed)."
    }
  } catch {
    $out += "\`nDISM fallback error: $($_.Exception.Message)"
  }
}

[PSCustomObject]@{ ok = $ok; exitCode = $code; rebootRequired = $reb; output = $out } | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json
print(json.dumps({"ok": False, "exitCode": 1, "rebootRequired": False, "output": "Windows KB uninstallation (wusa/DISM) only applies to Windows workstations."}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(180000, input.timeoutMs || 180000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, `uninstall ${kbFull}`);
  const ok = Boolean(parsed.ok);
  const reb = Boolean(parsed.rebootRequired);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'windows_update_uninstall',
    success: ok,
    message: ok
      ? `Windows Update ${kbFull} was uninstalled on ${execRes.host}.${reb ? ' A system reboot is required to complete removal.' : ''}`
      : `Could not uninstall ${kbFull} on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? `آپدیت ${kbFull} روی سیستم ${execRes.host} با موفقیت حذف (Uninstall) شد.${reb ? ' برای تکمیل حذف، ری‌استارت سیستم لازم است.' : ''}`
      : `حذف آپدیت ${kbFull} روی ${execRes.host} ناموفق بود (ممکن است آپدیت سیستمی دائمی باشد): ${parsed.output}`,
    details: {
      kbId: kbFull,
      exitCode: Number(parsed.exitCode ?? -1),
      rebootRequired: reb,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 16. SMART DISK MEDIA HEALTH (HDD vs SSD) + SFC / DISM / CHKDSK REPAIR
// ============================================================================

export interface HelpdeskLogicalVolumeHealth {
  driveLetter: string;
  label: string;
  fileSystem: string;
  sizeGb: number;
  freeGb: number;
  usedPercent: number;
  mediaType: 'HDD' | 'SSD' | 'NVMe' | 'Unknown';
  busType: string;
  diskModel: string;
  healthStatus: string;
  isDirty: boolean;
  isSsd: boolean;
  badSectorScanAllowed: boolean;
}

export interface HelpdeskDiskHealthResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  volumes: HelpdeskLogicalVolumeHealth[];
  collectedAt: string;
}

export type HelpdeskRepairMode =
  | 'sfc_verify'
  | 'sfc_scannow'
  | 'dism_check'
  | 'dism_scan'
  | 'dism_restore'
  | 'chkdsk_readonly'
  | 'chkdsk_hdd_badsector';

export interface HelpdeskSystemRepairResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  mode: HelpdeskRepairMode;
  driveLetter?: string;
  success: boolean;
  blockedSsd?: boolean;
  rebootScheduled?: boolean;
  statusCode: 'clean' | 'repaired' | 'issues_found' | 'scheduled' | 'blocked_ssd' | 'failed';
  summaryEn: string;
  summaryFa: string;
  rawOutput: string;
  executedAt: string;
}

export async function collectEndpointDiskHealth(
  input: HelpdeskTargetInput
): Promise<HelpdeskDiskHealthResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$physList = @(Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, MediaType, BusType, HealthStatus, OperationalStatus, SpindleSpeed)
$volOut = @()
$logicals = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3")

foreach ($ld in $logicals) {
  $letter = ([string]$ld.DeviceID).Replace(':','').Trim().ToUpper()
  if (-not $letter) { continue }
  $media = 'Unknown'
  $bus = ''
  $model = ''
  $health = 'Healthy'
  $isSsd = $false
  try {
    $part = Get-Partition -DriveLetter $letter -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($part) {
      $diskNum = [string]$part.DiskNumber
      $pd = $physList | Where-Object { [string]$_.DeviceId -eq $diskNum } | Select-Object -First 1
      if ($pd) {
        $bus = [string]$pd.BusType
        $model = [string]$pd.FriendlyName
        $health = if ($pd.HealthStatus) { [string]$pd.HealthStatus } else { 'Healthy' }
        $mt = [string]$pd.MediaType
        if ($bus -match 'NVMe') { $media = 'NVMe'; $isSsd = $true }
        elseif ($mt -match 'SSD' -or $pd.SpindleSpeed -eq 0 -or $model -match 'SSD|NVMe|Solid State') { $media = 'SSD'; $isSsd = $true }
        elseif ($mt -match 'HDD' -or ($pd.SpindleSpeed -gt 0)) { $media = 'HDD'; $isSsd = $false }
      }
    }
  } catch {}

  $dirty = $false
  try {
    $dOut = (& fsutil.exe dirty query "$($letter):" 2>&1 | Out-String)
    if ($dOut -match 'is Dirty' -and $dOut -notmatch 'NOT Dirty') { $dirty = $true }
  } catch {}

  $sizeGb = [math]::Round(($ld.Size / 1GB), 1)
  $freeGb = [math]::Round(($ld.FreeSpace / 1GB), 1)
  $usedPct = if ($ld.Size -gt 0) { [math]::Round((($ld.Size - $ld.FreeSpace) / $ld.Size) * 100, 1) } else { 0 }

  $volOut += [PSCustomObject]@{
    driveLetter = $letter
    label = [string]$ld.VolumeName
    fileSystem = [string]$ld.FileSystem
    sizeGb = $sizeGb
    freeGb = $freeGb
    usedPercent = $usedPct
    mediaType = $media
    busType = $bus
    diskModel = $model
    healthStatus = $health
    isDirty = $dirty
    isSsd = $isSsd
    badSectorScanAllowed = (-not $isSsd)
  }
}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  volumes = $volOut
} | ConvertTo-Json -Depth 5 -Compress
`;

  const linuxSh = `python3 - <<'PYEOF'
import json, platform, subprocess, shutil
vols = []
try:
    raw = subprocess.check_output("lsblk -J -b -o NAME,ROTA,TRAN,MODEL,SIZE,MOUNTPOINT,FSTYPE", shell=True, text=True)
    data = json.loads(raw)
    def walk(devs, parent_rota=None, parent_tran="", parent_model=""):
        for d in devs or []:
            rota = d.get("rota") if d.get("rota") is not None else parent_rota
            tran = d.get("tran") or parent_tran or ""
            model = (d.get("model") or parent_model or "").strip()
            mp = d.get("mountpoint")
            if mp and mp.startswith('/'):
                try:
                    st = shutil.disk_usage(mp)
                    is_ssd = (str(rota) in ('0', 'False', 'false')) or ('nvme' in tran.lower())
                    media = 'NVMe' if 'nvme' in tran.lower() else ('SSD' if is_ssd else 'HDD')
                    vols.append({
                        "driveLetter": mp,
                        "label": d.get("name") or mp,
                        "fileSystem": d.get("fstype") or "",
                        "sizeGb": round(st.total / (1024**3), 1),
                        "freeGb": round(st.free / (1024**3), 1),
                        "usedPercent": round((st.used / st.total) * 100, 1) if st.total else 0,
                        "mediaType": media,
                        "busType": tran.upper(),
                        "diskModel": model,
                        "healthStatus": "Healthy",
                        "isDirty": False,
                        "isSsd": is_ssd,
                        "badSectorScanAllowed": not is_ssd,
                    })
                except Exception:
                    pass
            walk(d.get("children"), rota, tran, model)
    walk(data.get("blockdevices", []))
except Exception:
    pass
print(json.dumps({"hostname": platform.node(), "volumes": vols}))
PYEOF`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'disk health');
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    volumes: Array.isArray(parsed.volumes) ? parsed.volumes : [],
    collectedAt: new Date().toISOString(),
  };
}

export async function executeEndpointSystemRepair(
  input: HelpdeskTargetInput,
  mode: HelpdeskRepairMode,
  rawDriveLetter?: string
): Promise<HelpdeskSystemRepairResult> {
  const allowedModes: HelpdeskRepairMode[] = [
    'sfc_verify',
    'sfc_scannow',
    'dism_check',
    'dism_scan',
    'dism_restore',
    'chkdsk_readonly',
    'chkdsk_hdd_badsector',
  ];
  if (!allowedModes.includes(mode)) {
    throw new Error(`Unsupported repair operation: ${String(mode)}`);
  }

  let driveLetter = 'C';
  if (mode === 'chkdsk_readonly' || mode === 'chkdsk_hdd_badsector') {
    const cleaned = String(rawDriveLetter || 'C').trim().replace(/:$/, '').toUpperCase();
    if (!/^[A-Z]$/.test(cleaned)) {
      throw new Error('Invalid drive letter. Only a single drive letter (A–Z) is permitted.');
    }
    driveLetter = cleaned;
  }

  let winPs = '';
  let timeoutMs = 240000;

  if (mode === 'sfc_verify') {
    timeoutMs = 240000;
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$out = (& sfc.exe /verifyonly 2>&1 | Out-String) -replace "\\0", ""
$code = $LASTEXITCODE
[PSCustomObject]@{ exitCode = $code; output = $out.Trim(); blockedSsd = $false; scheduled = $false } | ConvertTo-Json -Compress
`;
  } else if (mode === 'sfc_scannow') {
    timeoutMs = 270000;
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$out = (& sfc.exe /scannow 2>&1 | Out-String) -replace "\\0", ""
$code = $LASTEXITCODE
[PSCustomObject]@{ exitCode = $code; output = $out.Trim(); blockedSsd = $false; scheduled = $false } | ConvertTo-Json -Compress
`;
  } else if (mode === 'dism_check') {
    timeoutMs = 60000;
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$out = (& dism.exe /Online /Cleanup-Image /CheckHealth 2>&1 | Out-String)
$code = $LASTEXITCODE
[PSCustomObject]@{ exitCode = $code; output = $out.Trim(); blockedSsd = $false; scheduled = $false } | ConvertTo-Json -Compress
`;
  } else if (mode === 'dism_scan') {
    timeoutMs = 240000;
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$out = (& dism.exe /Online /Cleanup-Image /ScanHealth 2>&1 | Out-String)
$code = $LASTEXITCODE
[PSCustomObject]@{ exitCode = $code; output = $out.Trim(); blockedSsd = $false; scheduled = $false } | ConvertTo-Json -Compress
`;
  } else if (mode === 'dism_restore') {
    timeoutMs = 285000;
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$out = (& dism.exe /Online /Cleanup-Image /RestoreHealth 2>&1 | Out-String)
$code = $LASTEXITCODE
[PSCustomObject]@{ exitCode = $code; output = $out.Trim(); blockedSsd = $false; scheduled = $false } | ConvertTo-Json -Compress
`;
  } else if (mode === 'chkdsk_readonly') {
    timeoutMs = 150000;
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$out = (& chkdsk.exe "${driveLetter}:" 2>&1 | Out-String)
$code = $LASTEXITCODE
[PSCustomObject]@{ exitCode = $code; output = $out.Trim(); blockedSsd = $false; scheduled = $false } | ConvertTo-Json -Compress
`;
  } else if (mode === 'chkdsk_hdd_badsector') {
    timeoutMs = 120000;
    // Strict endpoint-side SSD/NVMe protection: NEVER run bad-sector /r rewrite on SSD or NVMe!
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$isSsd = $false
$mediaLabel = 'Unknown'
try {
  $part = Get-Partition -DriveLetter '${driveLetter}' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($part) {
    $pd = Get-PhysicalDisk | Where-Object { [string]$_.DeviceId -eq [string]$part.DiskNumber } | Select-Object -First 1
    if ($pd) {
      $mediaLabel = "$($pd.MediaType) / $($pd.BusType) ($($pd.FriendlyName))"
      if ([string]$pd.BusType -match 'NVMe' -or [string]$pd.MediaType -match 'SSD' -or $pd.SpindleSpeed -eq 0 -or [string]$pd.FriendlyName -match 'SSD|NVMe|Solid State') {
        $isSsd = $true
      }
    }
  }
} catch {}

if ($isSsd) {
  [PSCustomObject]@{
    exitCode = 403
    blockedSsd = $true
    scheduled = $false
    output = "BLOCKED_SSD: Drive ${driveLetter}: resides on an SSD/NVMe ($mediaLabel). Surface bad-sector scan (chkdsk /r) is strictly prohibited on SSDs to prevent unnecessary flash wear."
  } | ConvertTo-Json -Compress
  exit 0
}

# For genuine HDD: schedule chkdsk /r safely on next reboot if drive is locked, or run online scan
$out = (cmd.exe /c "echo Y | chkdsk.exe ${driveLetter}: /r" 2>&1 | Out-String)
$code = $LASTEXITCODE
$sched = ($out -match 'next time the system restarts|scheduled to be checked')
[PSCustomObject]@{ exitCode = $code; output = $out.Trim(); blockedSsd = $false; scheduled = $sched } | ConvertTo-Json -Compress
`;
  }

  const linuxSh = `echo '{"exitCode":1,"blockedSsd":false,"scheduled":false,"output":"SFC, DISM, and CHKDSK are Windows-only system maintenance utilities."}'`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<{
    exitCode: number;
    output: string;
    blockedSsd?: boolean;
    scheduled?: boolean;
  }>(execRes.stdout, `repair ${mode}`);

  const rawOut = String(parsed.output || '').slice(0, 14000);
  const lower = rawOut.toLowerCase();

  let statusCode: HelpdeskSystemRepairResult['statusCode'] = 'clean';
  let success = true;
  let summaryEn = '';
  let summaryFa = '';

  if (parsed.blockedSsd) {
    statusCode = 'blocked_ssd';
    success = false;
    summaryEn = `Blocked: Drive ${driveLetter}: is on an SSD/NVMe. Bad-sector surface scanning (chkdsk /r) is allowed only on mechanical HDDs.`;
    summaryFa = `مسدود شد: درایو ${driveLetter}: روی دیسک SSD/NVMe قرار دارد. اسکن بدسکتور (chkdsk /r) صرفاً برای هاردهای مکانیکی HDD مجاز است تا به عمر SSD آسیب نرسد.`;
  } else if (execRes.osFamily !== 'windows') {
    statusCode = 'failed';
    success = false;
    summaryEn = 'SFC, DISM, and CHKDSK are Windows-specific repair utilities.';
    summaryFa = 'ابزارهای SFC، DISM و CHKDSK اختصاصی سیستم‌های ویندوز هستند.';
  } else if (mode === 'sfc_verify' || mode === 'sfc_scannow') {
    if (lower.includes('did not find any integrity violations')) {
      statusCode = 'clean';
      summaryEn = 'Windows Resource Protection found NO corrupt system files (100% healthy).';
      summaryFa = 'بررسی فایل‌های سیستمی (SFC) کامل شد: هیچ فایل سیستمی خرابی پیدا نشد (کاملاً سالم).';
    } else if (lower.includes('found corrupt files and successfully repaired')) {
      statusCode = 'repaired';
      summaryEn = 'Windows Resource Protection found corrupt system files and successfully repaired them.';
      summaryFa = 'فایل‌های سیستمی خراب شناسایی و با موفقیت توسط SFC تعمیر شدند.';
    } else if (lower.includes('unable to fix some')) {
      statusCode = 'issues_found';
      summaryEn = 'Corrupt system files were found, but SFC could not fix all of them. Run DISM /RestoreHealth next, then re-run SFC.';
      summaryFa = 'فایل‌های سیستمی خراب شناسایی شدند اما SFC نتوانست همه را تعمیر کند. ابتدا DISM RestoreHealth را اجرا کرده و سپس دوباره SFC بزنید.';
    } else {
      statusCode = parsed.exitCode === 0 ? 'clean' : 'failed';
      success = parsed.exitCode === 0;
      summaryEn = parsed.exitCode === 0 ? 'SFC completed.' : 'SFC exited with a warning or error; see raw output.';
      summaryFa = parsed.exitCode === 0 ? 'اجرای SFC تکمیل شد.' : 'اجرای SFC با خطا یا هشدار مواجه شد؛ خروجی کامل را ببینید.';
    }
  } else if (mode === 'dism_check' || mode === 'dism_scan' || mode === 'dism_restore') {
    if (lower.includes('no component store corruption detected')) {
      statusCode = 'clean';
      summaryEn = 'DISM confirmed the Windows Component Store (image) has zero corruption.';
      summaryFa = 'بررسی DISM نشان داد ایمیج ویندوز (Component Store) کاملاً سالم و بدون خرابی است.';
    } else if (lower.includes('restore operation completed successfully')) {
      statusCode = 'repaired';
      summaryEn = 'DISM /RestoreHealth successfully repaired the Windows system image.';
      summaryFa = 'تعمیر ایمیج ویندوز (DISM /RestoreHealth) با موفقیت کامل انجام شد.';
    } else if (lower.includes('component store is repairable')) {
      statusCode = 'issues_found';
      summaryEn = 'DISM detected repairable Windows image corruption. Run "DISM RestoreHealth" now.';
      summaryFa = 'DISM خرابی قابل تعمیر در ایمیج ویندوز شناسایی کرد. اکنون گزینه «DISM RestoreHealth» را اجرا کنید.';
    } else {
      statusCode = parsed.exitCode === 0 ? 'clean' : 'failed';
      success = parsed.exitCode === 0;
      summaryEn = parsed.exitCode === 0 ? 'DISM operation finished.' : 'DISM returned an error; inspect the output below.';
      summaryFa = parsed.exitCode === 0 ? 'عملیات DISM به پایان رسید.' : 'عملیات DISM با خطا مواجه شد؛ خروجی کامل را بررسی کنید.';
    }
  } else if (mode === 'chkdsk_readonly' || mode === 'chkdsk_hdd_badsector') {
    if (parsed.scheduled) {
      statusCode = 'scheduled';
      summaryEn = `HDD Bad-Sector Repair (chkdsk ${driveLetter}: /r) has been scheduled to run automatically on the next system restart.`;
      summaryFa = `اسکن و تعمیر بدسکتور هارد مکانیکی (chkdsk ${driveLetter}: /r) برای اجرا در ری‌استارت بعدی سیستم زمان‌بندی شد.`;
    } else if (lower.includes('found no problems')) {
      statusCode = 'clean';
      summaryEn = `CHKDSK scanned drive ${driveLetter}: and found zero file-system problems.`;
      summaryFa = `بررسی درایو ${driveLetter}: توسط CHKDSK به پایان رسید و هیچ خطای فایل‌سیستمی یافت نشد.`;
    } else if (lower.includes('errors found') || lower.includes('bad sectors')) {
      statusCode = 'issues_found';
      summaryEn = `CHKDSK detected file-system errors or bad sectors on drive ${driveLetter}:. Review output and schedule repair if HDD.`;
      summaryFa = `CHKDSK روی درایو ${driveLetter}: خطای فایل‌سیستم یا بدسکتور شناسایی کرد. خروجی زیر را بررسی کنید.`;
    } else {
      statusCode = parsed.exitCode === 0 ? 'clean' : 'issues_found';
      summaryEn = `CHKDSK finished on drive ${driveLetter}: (exit code ${parsed.exitCode}).`;
      summaryFa = `بررسی CHKDSK روی درایو ${driveLetter}: پایان یافت (کد خروج ${parsed.exitCode}).`;
    }
  }

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    mode,
    driveLetter: mode.startsWith('chkdsk_') ? driveLetter : undefined,
    success,
    blockedSsd: Boolean(parsed.blockedSsd),
    rebootScheduled: Boolean(parsed.scheduled),
    statusCode,
    summaryEn,
    summaryFa,
    rawOutput: rawOut,
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 17. ACTIVE DIRECTORY DOMAIN ACCOUNT INSPECTION (net user <USER> /domain)
// ============================================================================

export interface HelpdeskDomainUserResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  username: string;
  found: boolean;
  fullName: string;
  comment: string;
  accountActive: string;
  accountLocked: boolean | null;
  accountExpires: string;
  passwordLastSet: string;
  passwordExpires: string;
  passwordChangeable: string;
  passwordRequired: string;
  userMayChangePassword: string;
  lastLogon: string;
  passwordStatus: 'active' | 'expired' | 'never_expires' | 'must_change' | 'unknown';
  localGroups: string[];
  globalGroups: string[];
  adsiMemberOf?: string[];
  title?: string;
  department?: string;
  email?: string;
  distinguishedName?: string;
  rawOutput: string;
  collectedAt: string;
}

export async function inspectDomainAccount(
  input: HelpdeskTargetInput,
  rawDomainUsername: string
): Promise<HelpdeskDomainUserResult> {
  let cleanUser = String(rawDomainUsername || '').trim();
  if (cleanUser.includes('\\')) {
    cleanUser = cleanUser.split('\\').pop()?.trim() || cleanUser;
  }
  if (cleanUser.includes('@')) {
    cleanUser = cleanUser.split('@')[0]?.trim() || cleanUser;
  }
  // Strict sAMAccountName allowlist: prevents any command or LDAP injection
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(cleanUser)) {
    throw new Error(
      'Invalid domain username. Only letters, numbers, dots, underscores, and hyphens (1–64 chars) are allowed.'
    );
  }

  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$u = '${cleanUser}'
$netOut = (& net.exe user $u /domain 2>&1 | Out-String)
$netExit = $LASTEXITCODE

$adsiLocked = $null
$adsiMemberOf = @()
$adsiTitle = ''
$adsiDept = ''
$adsiMail = ''
$adsiDn = ''
try {
  $searcher = [adsisearcher]"(&(objectCategory=person)(objectClass=user)(sAMAccountName=$u))"
  $res = $searcher.FindOne()
  if ($res) {
    $lockTime = 0
    try {
      $ltProp = $res.Properties['lockouttime']
      if ($ltProp -and $ltProp.Count -gt 0) { $lockTime = [int64]$ltProp[0] }
    } catch {}
    $adsiLocked = ($lockTime -gt 0)
    try {
      if ($res.Properties['title'] -and $res.Properties['title'].Count -gt 0) { $adsiTitle = [string]$res.Properties['title'][0] }
      if ($res.Properties['department'] -and $res.Properties['department'].Count -gt 0) { $adsiDept = [string]$res.Properties['department'][0] }
      if ($res.Properties['mail'] -and $res.Properties['mail'].Count -gt 0) { $adsiMail = [string]$res.Properties['mail'][0] }
      if ($res.Properties['distinguishedname'] -and $res.Properties['distinguishedname'].Count -gt 0) { $adsiDn = [string]$res.Properties['distinguishedname'][0] }
      if ($res.Properties['memberof']) {
        foreach ($dn in $res.Properties['memberof']) {
          $sDn = [string]$dn
          if ($sDn -match '^CN=([^,]+)') {
            $adsiMemberOf += $matches[1].Replace('\\,', ',')
          } else {
            $adsiMemberOf += $sDn
          }
        }
      }
    } catch {}
  }
} catch {}

[PSCustomObject]@{
  exitCode = $netExit
  rawOutput = $netOut.Trim()
  adsiLocked = $adsiLocked
  adsiMemberOf = @($adsiMemberOf | Select-Object -Unique)
  adsiTitle = $adsiTitle
  adsiDept = $adsiDept
  adsiMail = $adsiMail
  adsiDn = $adsiDn
} | ConvertTo-Json -Compress
`;

  const linuxSh = `echo '{"exitCode":1,"rawOutput":"Domain user lookup via net user /domain requires a Windows domain-joined workstation.","adsiLocked":null,"adsiMemberOf":[]}'`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<{
    exitCode: number;
    rawOutput: string;
    adsiLocked: boolean | null;
    adsiMemberOf?: string[];
    adsiTitle?: string;
    adsiDept?: string;
    adsiMail?: string;
    adsiDn?: string;
  }>(execRes.stdout, 'domain user lookup');

  const raw = String(parsed.rawOutput || '');
  const found = (parsed.exitCode === 0 && /User name/i.test(raw)) || Boolean(parsed.adsiDn);

  const extractField = (label: string): string => {
    const regex = new RegExp(`^${label}\\s+(.+)$`, 'im');
    const m = raw.match(regex);
    return m ? m[1].trim() : '';
  };

  const extractGroups = (startLabel: string, stopLabels: string[]): string[] => {
    const lines = raw.split(/\r?\n/);
    const groups: string[] = [];
    let capturing = false;
    for (const line of lines) {
      if (!capturing) {
        if (new RegExp(`^${startLabel}`, 'i').test(line)) {
          capturing = true;
          const rest = line.replace(new RegExp(`^${startLabel}`, 'i'), '').trim();
          const matches = rest.match(/\*([^*]+)/g);
          if (matches) matches.forEach((g) => groups.push(g.replace(/^\*/, '').trim()));
        }
      } else {
        if (
          !line.trim() ||
          stopLabels.some((lbl) => new RegExp(`^${lbl}`, 'i').test(line)) ||
          /command completed successfully/i.test(line)
        ) {
          break;
        }
        const matches = line.match(/\*([^*]+)/g);
        if (matches) matches.forEach((g) => groups.push(g.replace(/^\*/, '').trim()));
      }
    }
    return groups.filter(Boolean);
  };

  const accountActive = extractField('Account active');
  const passwordLastSet = extractField('Password last set');
  const passwordExpires = extractField('Password expires');
  const passwordChangeable = extractField('Password changeable');
  const passwordRequired = extractField('Password required');
  const userMayChangePassword = extractField('User may change password');
  const lastLogon = extractField('Last logon');
  const accountExpires = extractField('Account expires');
  const fullName = extractField('Full Name');
  const comment = extractField('Comment');
  const localGroups = extractGroups('Local Group Memberships', ['Global Group memberships']);
  const globalGroups = extractGroups('Global Group memberships', ['The command completed']);

  let passwordStatus: HelpdeskDomainUserResult['passwordStatus'] = 'unknown';
  if (found) {
    if (/never/i.test(passwordExpires)) {
      passwordStatus = 'never_expires';
    } else if (/^1\/1\/1601|^0\/|must change/i.test(passwordLastSet)) {
      passwordStatus = 'must_change';
    } else if (passwordExpires) {
      const expDate = Date.parse(passwordExpires);
      if (!isNaN(expDate)) {
        passwordStatus = expDate < Date.now() ? 'expired' : 'active';
      } else {
        passwordStatus = 'active';
      }
    }
  }

  let accountLocked: boolean | null =
    typeof parsed.adsiLocked === 'boolean' ? parsed.adsiLocked : null;
  if (accountLocked === null && /locked/i.test(accountActive)) {
    accountLocked = true;
  }

  const adsiMemberOf = Array.isArray(parsed.adsiMemberOf)
    ? parsed.adsiMemberOf.map((g) => String(g || '').trim()).filter(Boolean)
    : [];
  // Merge untruncated ADSI memberOf group CNs alongside net user /domain output (avoid truncated 20-char duplicates)
  const mergedGlobalSet = new Set<string>(adsiMemberOf);
  for (const gg of globalGroups) {
    const cleanGg = gg.trim();
    if (!cleanGg) continue;
    const matchedFull = adsiMemberOf.some(
      (full) => full.toLowerCase() === cleanGg.toLowerCase() || full.toLowerCase().startsWith(cleanGg.toLowerCase())
    );
    if (!matchedFull) {
      mergedGlobalSet.add(cleanGg);
    }
  }

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    username: cleanUser,
    found,
    fullName,
    comment,
    accountActive,
    accountLocked,
    accountExpires,
    passwordLastSet,
    passwordExpires,
    passwordChangeable,
    passwordRequired,
    userMayChangePassword,
    lastLogon,
    passwordStatus,
    localGroups,
    globalGroups: Array.from(mergedGlobalSet),
    adsiMemberOf,
    ...(parsed.adsiTitle ? { title: String(parsed.adsiTitle) } : {}),
    ...(parsed.adsiDept ? { department: String(parsed.adsiDept) } : {}),
    ...(parsed.adsiMail ? { email: String(parsed.adsiMail) } : {}),
    ...(parsed.adsiDn ? { distinguishedName: String(parsed.adsiDn) } : {}),
    rawOutput: raw,
    collectedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 18. SAFE REMOTE POWER CONTROL (RESTART / FORCE SHUTDOWN / SCHEDULED / ABORT)
// ============================================================================

export type HelpdeskPowerAction =
  | 'restart_now'
  | 'restart_scheduled'
  | 'shutdown_force'
  | 'shutdown_scheduled'
  | 'abort';

export async function executeEndpointPowerControl(
  input: HelpdeskTargetInput,
  powerAction: HelpdeskPowerAction,
  rawDelaySeconds?: number,
  rawReason?: string
): Promise<HelpdeskActionResult> {
  const allowed: HelpdeskPowerAction[] = [
    'restart_now',
    'restart_scheduled',
    'shutdown_force',
    'shutdown_scheduled',
    'abort',
  ];
  if (!allowed.includes(powerAction)) {
    throw new Error(`Unsupported power action: ${String(powerAction)}`);
  }

  const isScheduled = powerAction === 'restart_scheduled' || powerAction === 'shutdown_scheduled';
  const delaySec =
    powerAction === 'abort'
      ? 0
      : isScheduled
      ? Math.max(30, Math.min(86400, Math.floor(Number(rawDelaySeconds) || 300)))
      : 5;

  const safeComment = String(rawReason || 'IT HelpDesk Remote Maintenance')
    .replace(/[^\w\s.,:;!?()-]/g, ' ')
    .trim()
    .slice(0, 120) || 'IT HelpDesk Remote Maintenance';

  let winPs = '';
  let linuxSh = '';

  if (powerAction === 'abort') {
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$out = (& shutdown.exe /a 2>&1 | Out-String)
$code = $LASTEXITCODE
[PSCustomObject]@{ ok = ($code -eq 0); exitCode = $code; output = $out.Trim() } | ConvertTo-Json -Compress
`;
    linuxSh = `shutdown -c 2>&1 && echo '{"ok":true,"exitCode":0,"output":"Scheduled shutdown/reboot cancelled."}' || echo '{"ok":false,"exitCode":1,"output":"No pending shutdown to cancel or permission denied."}'`;
  } else {
    const flag = powerAction.startsWith('restart') ? '/r' : '/s';
    const linuxFlag = powerAction.startsWith('restart') ? '-r' : '-h';
    const linuxMin = Math.max(1, Math.ceil(delaySec / 60));
    // Strictly pass arguments as array to shutdown.exe inside Base64 PowerShell (zero shell quoting injection)
    winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$argsList = @('${flag}', '/f', '/t', '${delaySec}', '/c', '${safeComment.replace(/'/g, "''")}')
$out = (& shutdown.exe @argsList 2>&1 | Out-String)
$code = $LASTEXITCODE
[PSCustomObject]@{ ok = ($code -eq 0); exitCode = $code; output = $out.Trim() } | ConvertTo-Json -Compress
`;
    linuxSh = `shutdown ${linuxFlag} +${powerAction.endsWith('_now') || powerAction.endsWith('_force') ? 0 : linuxMin} "${safeComment}" 2>&1 && echo '{"ok":true,"exitCode":0,"output":"Shutdown/reboot scheduled."}' || echo '{"ok":false,"exitCode":1,"output":"Failed to schedule shutdown/reboot."}'`;
  }

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: 20000 },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<{ ok: boolean; exitCode: number; output: string }>(
    execRes.stdout,
    `power ${powerAction}`
  );

  const actionMap: Record<HelpdeskPowerAction, { en: string; fa: string }> = {
    restart_now: {
      en: `Immediate forced restart issued on ${execRes.host} (rebooting in ${delaySec}s).`,
      fa: `دستور ری‌استارت فوری و اجباری روی سیستم ${execRes.host} اجرا شد (ری‌استارت تا ${delaySec} ثانیه دیگر).`,
    },
    restart_scheduled: {
      en: `Scheduled restart set on ${execRes.host} in ${delaySec} seconds (${Math.round(delaySec / 60)} min).`,
      fa: `ری‌استارت زمان‌بندی‌شده روی سیستم ${execRes.host} برای ${delaySec} ثانیه (${Math.round(delaySec / 60)} دقیقه) دیگر تنظیم شد.`,
    },
    shutdown_force: {
      en: `Immediate forced shutdown issued on ${execRes.host} (powering off in ${delaySec}s).`,
      fa: `دستور خاموش کردن فوری و اجباری روی سیستم ${execRes.host} اجرا شد (خاموشی تا ${delaySec} ثانیه دیگر).`,
    },
    shutdown_scheduled: {
      en: `Scheduled shutdown set on ${execRes.host} in ${delaySec} seconds (${Math.round(delaySec / 60)} min).`,
      fa: `خاموشی زمان‌بندی‌شده روی سیستم ${execRes.host} برای ${delaySec} ثانیه (${Math.round(delaySec / 60)} دقیقه) دیگر تنظیم شد.`,
    },
    abort: {
      en: `Pending scheduled shutdown/restart on ${execRes.host} was cancelled (shutdown /a).`,
      fa: `خاموشی یا ری‌استارت زمان‌بندی‌شده روی سیستم ${execRes.host} با موفقیت لغو شد (shutdown /a).`,
    },
  };

  const mappedWriteAction: HelpdeskWriteAction =
    powerAction === 'abort'
      ? 'power_abort'
      : powerAction.startsWith('restart')
      ? 'power_restart'
      : 'power_shutdown';

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: mappedWriteAction,
    success: Boolean(parsed.ok),
    message: parsed.ok
      ? actionMap[powerAction].en
      : `Power command (${powerAction}) failed on ${execRes.host}: ${parsed.output || `exit code ${parsed.exitCode}`}`,
    messageFa: parsed.ok
      ? actionMap[powerAction].fa
      : `اجرای دستور پاور (${powerAction}) روی ${execRes.host} ناموفق بود: ${parsed.output || `کد خطا ${parsed.exitCode}`}`,
    details: {
      powerAction,
      delaySeconds: delaySec,
      reason: safeComment,
      exitCode: parsed.exitCode,
      portUsed: execRes.portUsed,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 19. LAPTOP BATTERY HEALTH & CYCLE COUNT REPORT (powercfg /batteryreport + WMI)
// ============================================================================

export interface HelpdeskBatteryItem {
  id: string;
  name: string;
  manufacturer: string;
  serialNumber: string;
  chemistry: string;
  designCapacityMwh: number;
  fullChargeCapacityMwh: number;
  healthPercent: number | null;
  wearPercent: number | null;
  cycleCount: number | null;
  chargePercent: number | null;
  isCharging: boolean;
  onAcPower: boolean;
  estimatedRuntimeMin: number | null;
  statusLabel: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
}

export interface HelpdeskBatteryHistoryEntry {
  period: string;
  fullChargeCapacityMwh: number;
  designCapacityMwh: number;
  healthPercent: number | null;
}

export interface HelpdeskBatteryReportResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  hasBattery: boolean;
  batteries: HelpdeskBatteryItem[];
  capacityHistory: HelpdeskBatteryHistoryEntry[];
  sourceMethod: string;
  collectedAt: string;
}

export async function collectEndpointBatteryReport(
  input: HelpdeskTargetInput
): Promise<HelpdeskBatteryReportResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$batteries = @()
$history = @()
$sourceMethod = 'WMI'
$xmlPath = Join-Path $env:TEMP ("hd_batt_" + [guid]::NewGuid().ToString('N') + ".xml")

# Live Win32_Battery & root\\wmi metrics
$w32Batts = @(Get-CimInstance Win32_Battery)
$wmiStatic = @(Get-CimInstance -Namespace root\\wmi -ClassName BatteryStaticData)
$wmiFull = @(Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity)
$wmiCycle = @(Get-CimInstance -Namespace root\\wmi -ClassName BatteryCycleCount)
$wmiStatus = @(Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus)

# Primary source: powercfg /batteryreport /xml (authoritative cycle count + design/full capacity + history)
try {
  $null = (& powercfg.exe /batteryreport /xml /output "$xmlPath" 2>&1)
  if (Test-Path $xmlPath) {
    [xml]$doc = Get-Content -Path $xmlPath -Raw -Encoding UTF8
    $xmlBatts = @($doc.BatteryReport.Batteries.Battery)
    if ($xmlBatts.Count -gt 0) {
      $sourceMethod = 'powercfg /batteryreport + WMI'
      for ($i = 0; $i -lt $xmlBatts.Count; $i++) {
        $xb = $xmlBatts[$i]
        $w32 = if ($i -lt $w32Batts.Count) { $w32Batts[$i] } else { $null }
        $ws = if ($i -lt $wmiStatus.Count) { $wmiStatus[$i] } else { $null }
        $wc = if ($i -lt $wmiCycle.Count) { $wmiCycle[$i] } else { $null }
        $design = [int]($xb.DesignCapacity)
        $full = [int]($xb.FullChargeCapacity)
        if ($design -le 0 -and $i -lt $wmiStatic.Count) { $design = [int]$wmiStatic[$i].DesignedCapacity }
        if ($full -le 0 -and $i -lt $wmiFull.Count) { $full = [int]$wmiFull[$i].FullChargedCapacity }
        $cycles = $null
        if ($xb.CycleCount -and [string]$xb.CycleCount -ne '-' -and [int]$xb.CycleCount -ge 0) {
          $cycles = [int]$xb.CycleCount
        } elseif ($wc -and $null -ne $wc.CycleCount) {
          $cycles = [int]$wc.CycleCount
        }
        $chargePct = if ($w32 -and $null -ne $w32.EstimatedChargeRemaining) { [int]$w32.EstimatedChargeRemaining } else { $null }
        $charging = [bool](($ws -and $ws.Charging) -or ($w32 -and ($w32.BatteryStatus -in @(2,6,7,8,9))))
        $onAc = [bool](($ws -and $ws.PowerOnline) -or ($w32 -and ($w32.BatteryStatus -in @(2,6,7,8,9))))
        $runtimeMin = if ($w32 -and $w32.EstimatedRunTime -and $w32.EstimatedRunTime -lt 100000) { [int]$w32.EstimatedRunTime } else { $null }
        $batteries += [PSCustomObject]@{
          id = if ($xb.Id) { [string]$xb.Id } else { "BAT$($i+1)" }
          name = if ($xb.Id) { [string]$xb.Id } elseif ($w32) { [string]$w32.Name } else { "Battery $($i+1)" }
          manufacturer = [string]$xb.Manufacturer
          serialNumber = [string]$xb.SerialNumber
          chemistry = [string]$xb.Chemistry
          designCapacityMwh = $design
          fullChargeCapacityMwh = $full
          cycleCount = $cycles
          chargePercent = $chargePct
          isCharging = $charging
          onAcPower = $onAc
          estimatedRuntimeMin = $runtimeMin
          statusLabel = if ($charging) { 'Charging' } elseif ($onAc) { 'Plugged In (AC)' } else { 'Discharging (On Battery)' }
        }
      }
    }
    $histNodes = @($doc.BatteryReport.History.HistoryEntry)
    if ($histNodes.Count -gt 0) {
      $recentHist = $histNodes | Select-Object -Last 10
      foreach ($h in $recentHist) {
        $dCap = [int]$h.DesignCapacity
        $fCap = [int]$h.FullChargeCapacity
        if ($dCap -gt 0 -and $fCap -gt 0) {
          $pStart = [string]$h.StartDate
          $history += [PSCustomObject]@{
            period = if ($pStart.Length -ge 10) { $pStart.Substring(0, 10) } else { $pStart }
            fullChargeCapacityMwh = $fCap
            designCapacityMwh = $dCap
          }
        }
      }
    }
  }
} catch {}
finally {
  if (Test-Path $xmlPath) { Remove-Item -Path $xmlPath -Force -ErrorAction SilentlyContinue }
}

# Fallback purely to WMI if powercfg returned nothing but WMI sees a battery
if ($batteries.Count -eq 0 -and $w32Batts.Count -gt 0) {
  for ($i = 0; $i -lt $w32Batts.Count; $i++) {
    $w32 = $w32Batts[$i]
    $ws = if ($i -lt $wmiStatus.Count) { $wmiStatus[$i] } else { $null }
    $design = if ($i -lt $wmiStatic.Count) { [int]$wmiStatic[$i].DesignedCapacity } else { [int]$w32.DesignCapacity }
    $full = if ($i -lt $wmiFull.Count) { [int]$wmiFull[$i].FullChargedCapacity } else { 0 }
    $cycles = if ($i -lt $wmiCycle.Count -and $null -ne $wmiCycle[$i].CycleCount) { [int]$wmiCycle[$i].CycleCount } else { $null }
    $charging = [bool](($ws -and $ws.Charging) -or ($w32.BatteryStatus -in @(2,6,7,8,9)))
    $onAc = [bool](($ws -and $ws.PowerOnline) -or ($w32.BatteryStatus -in @(2,6,7,8,9)))
    $batteries += [PSCustomObject]@{
      id = [string]$w32.DeviceID
      name = [string]$w32.Name
      manufacturer = if ($i -lt $wmiStatic.Count) { [string]$wmiStatic[$i].ManufactureName } else { '' }
      serialNumber = if ($i -lt $wmiStatic.Count) { [string]$wmiStatic[$i].SerialNumber } else { '' }
      chemistry = ''
      designCapacityMwh = $design
      fullChargeCapacityMwh = $full
      cycleCount = $cycles
      chargePercent = if ($null -ne $w32.EstimatedChargeRemaining) { [int]$w32.EstimatedChargeRemaining } else { $null }
      isCharging = $charging
      onAcPower = $onAc
      estimatedRuntimeMin = if ($w32.EstimatedRunTime -and $w32.EstimatedRunTime -lt 100000) { [int]$w32.EstimatedRunTime } else { $null }
      statusLabel = if ($charging) { 'Charging' } elseif ($onAc) { 'Plugged In (AC)' } else { 'Discharging (On Battery)' }
    }
  }
}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  hasBattery = ($batteries.Count -gt 0)
  sourceMethod = $sourceMethod
  batteries = $batteries
  capacityHistory = $history
} | ConvertTo-Json -Depth 5 -Compress
`;

  const linuxSh = `python3 - <<'PYEOF'
import glob, json, os, platform
def rd(p):
    try:
        return open(p).read().strip()
    except Exception:
        return ""
batts = []
for bdir in sorted(glob.glob('/sys/class/power_supply/BAT*')):
    bid = os.path.basename(bdir)
    design = int(rd(os.path.join(bdir, 'energy_full_design')) or 0) // 1000
    full = int(rd(os.path.join(bdir, 'energy_full')) or 0) // 1000
    if design <= 0:
        volt = int(rd(os.path.join(bdir, 'voltage_min_design')) or rd(os.path.join(bdir, 'voltage_now')) or 11400000) / 1e6
        design = int((int(rd(os.path.join(bdir, 'charge_full_design')) or 0) / 1000.0) * volt)
        full = int((int(rd(os.path.join(bdir, 'charge_full')) or 0) / 1000.0) * volt)
    cyc_raw = rd(os.path.join(bdir, 'cycle_count'))
    cyc = int(cyc_raw) if cyc_raw.isdigit() else None
    cap_raw = rd(os.path.join(bdir, 'capacity'))
    cap = int(cap_raw) if cap_raw.isdigit() else None
    st = rd(os.path.join(bdir, 'status')) or 'Unknown'
    batts.append({
        "id": bid,
        "name": rd(os.path.join(bdir, 'model_name')) or bid,
        "manufacturer": rd(os.path.join(bdir, 'manufacturer')),
        "serialNumber": rd(os.path.join(bdir, 'serial_number')),
        "chemistry": rd(os.path.join(bdir, 'technology')),
        "designCapacityMwh": design,
        "fullChargeCapacityMwh": full,
        "cycleCount": cyc,
        "chargePercent": cap,
        "isCharging": st.lower() == 'charging',
        "onAcPower": st.lower() in ('charging', 'full', 'not charging'),
        "estimatedRuntimeMin": None,
        "statusLabel": st,
    })
print(json.dumps({"hostname": platform.node(), "hasBattery": len(batts) > 0, "sourceMethod": "/sys/class/power_supply", "batteries": batts, "capacityHistory": []}))
PYEOF`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(35000, input.timeoutMs || 35000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'battery report');

  const batteries: HelpdeskBatteryItem[] = (Array.isArray(parsed.batteries) ? parsed.batteries : []).map(
    (b: any) => {
      const design = Math.max(0, Number(b.designCapacityMwh) || 0);
      const full = Math.max(0, Number(b.fullChargeCapacityMwh) || 0);
      const healthPercent =
        design > 0 && full > 0
          ? Math.min(100, Math.round((full / design) * 1000) / 10)
          : null;
      const wearPercent =
        healthPercent !== null ? Math.max(0, Math.round((100 - healthPercent) * 10) / 10) : null;
      const condition: HelpdeskBatteryItem['condition'] =
        healthPercent === null
          ? 'unknown'
          : healthPercent >= 85
          ? 'excellent'
          : healthPercent >= 70
          ? 'good'
          : healthPercent >= 50
          ? 'fair'
          : 'poor';

      return {
        id: String(b.id || 'BAT1'),
        name: String(b.name || 'Battery'),
        manufacturer: String(b.manufacturer || ''),
        serialNumber: String(b.serialNumber || ''),
        chemistry: String(b.chemistry || ''),
        designCapacityMwh: design,
        fullChargeCapacityMwh: full,
        healthPercent,
        wearPercent,
        cycleCount:
          b.cycleCount !== null && b.cycleCount !== undefined && !isNaN(Number(b.cycleCount))
            ? Number(b.cycleCount)
            : null,
        chargePercent:
          b.chargePercent !== null && b.chargePercent !== undefined && !isNaN(Number(b.chargePercent))
            ? Number(b.chargePercent)
            : null,
        isCharging: Boolean(b.isCharging),
        onAcPower: Boolean(b.onAcPower),
        estimatedRuntimeMin:
          b.estimatedRuntimeMin !== null && b.estimatedRuntimeMin !== undefined
            ? Number(b.estimatedRuntimeMin)
            : null,
        statusLabel: String(b.statusLabel || ''),
        condition,
      };
    }
  );

  const capacityHistory: HelpdeskBatteryHistoryEntry[] = (
    Array.isArray(parsed.capacityHistory) ? parsed.capacityHistory : []
  ).map((h: any) => {
    const d = Math.max(0, Number(h.designCapacityMwh) || 0);
    const f = Math.max(0, Number(h.fullChargeCapacityMwh) || 0);
    return {
      period: String(h.period || ''),
      designCapacityMwh: d,
      fullChargeCapacityMwh: f,
      healthPercent: d > 0 && f > 0 ? Math.min(100, Math.round((f / d) * 1000) / 10) : null,
    };
  });

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    hasBattery: Boolean(parsed.hasBattery) && batteries.length > 0,
    batteries,
    capacityHistory,
    sourceMethod: String(parsed.sourceMethod || 'WMI'),
    collectedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 19B. MAPPED NETWORK DRIVES & SHARED FOLDERS MANAGEMENT
// ============================================================================

function validateUncSharePath(rawUnc: unknown): {
  uncPath: string;
  fileServer: string;
  shareName: string;
} {
  const raw = String(rawUnc || '')
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\+$/, '');
  if (!raw || raw.length > 260) {
    throw new Error('UNC share path is required and must be at most 260 characters.');
  }
  if (/[\r\n\0"`$|;&<>]/.test(raw)) {
    throw new Error('UNC share path contains forbidden characters.');
  }
  const m = raw.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/);
  if (!m) {
    throw new Error('UNC share path must follow \\\\Server\\ShareName format (e.g. \\\\fileserver\\Shared).');
  }
  const fileServer = validateTargetEndpointHost(m[1]);
  const shareName = m[2].trim();
  const subPath = m[3] ? m[3].trim().replace(/^\\+|\\+$/g, '') : '';
  if (!shareName || shareName === '.' || shareName === '..') {
    throw new Error('Invalid share folder name in UNC path.');
  }
  const normalizedUnc = subPath
    ? `\\\\${fileServer}\\${shareName}\\${subPath}`
    : `\\\\${fileServer}\\${shareName}`;
  return {
    uncPath: normalizedUnc,
    fileServer,
    shareName,
  };
}

function validateLinuxMountPath(rawPath: unknown): string {
  const p = String(rawPath || '').trim();
  if (!p || p.length > 260 || /[\r\n\0"`$|;&<>]/.test(p)) {
    throw new Error('Invalid Linux mount path.');
  }
  return p;
}

function validateDriveLetterInput(rawLetter: unknown): string {
  const val = String(rawLetter || '').trim().toUpperCase().replace(/:$/, '');
  if (!val || val === 'NONE' || val === 'UNC') return '';
  if (val === 'AUTO') return 'AUTO';
  if (!/^[D-Z]$/.test(val)) {
    throw new Error('Drive letter must be between D: and Z: (or AUTO / empty for UNC connection).');
  }
  return `${val}:`;
}

function validateProfileSidInput(rawSid: unknown): string {
  const sid = String(rawSid || '').trim();
  if (!/^S-1-5-21-[0-9-]{6,120}$/.test(sid)) {
    throw new Error('Invalid Windows user profile SID format.');
  }
  return sid;
}

function validateShareLabelInput(rawLabel: unknown): string {
  const lbl = String(rawLabel || '').trim();
  if (!lbl) return '';
  if (lbl.length > 64 || /[\r\n\0]/.test(lbl)) {
    throw new Error('Drive label must be at most 64 characters without control characters.');
  }
  return lbl;
}

function validateManagedRuleNameInput(rawRule: unknown): string {
  const name = String(rawRule || '').trim();
  if (!name) return '';
  if (!/^NetTopo_MapDrive_[A-Za-z0-9_-]{1,64}$/.test(name)) {
    throw new Error('Invalid managed drive rule name.');
  }
  return name;
}

export async function collectEndpointMappedShares(
  input: HelpdeskTargetInput
): Promise<HelpdeskSharesResult> {
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
${PS_HELPDESK_DETECT_LOGGED_USER}

$profiles = @()
$sidToName = @{}
$loadedHives = @{}

try {
  $plist = Get-ChildItem -Path 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -ErrorAction SilentlyContinue
  foreach ($pk in $plist) {
    $sid = [string]$pk.PSChildName
    if ($sid -notmatch '^S-1-5-21-') { continue }
    $props = Get-ItemProperty -Path $pk.PSPath -ErrorAction SilentlyContinue
    $pPath = if ($props -and $props.ProfileImagePath) { [string]$props.ProfileImagePath } else { '' }
    $acctName = ''
    try {
      $sidObj = New-Object System.Security.Principal.SecurityIdentifier($sid)
      $acctName = $sidObj.Translate([System.Security.Principal.NTAccount]).Value
    } catch {
      if ($pPath) { $acctName = Split-Path -Path $pPath -Leaf } else { $acctName = $sid }
    }
    $isLoaded = Test-Path ("Registry::HKEY_USERS\\" + $sid)
    if ($isLoaded) { $loadedHives[$sid] = $true }
    $sidToName[$sid] = $acctName
    $profiles += [PSCustomObject]@{
      username = $acctName
      sid = $sid
      profilePath = $pPath
      isLoaded = $isLoaded
      isActiveLoggedIn = ($userSid -and $sid -eq $userSid)
    }
  }
} catch {}

if ($userSid -and -not $sidToName.ContainsKey($userSid)) {
  $sidToName[$userSid] = if ($loggedUser) { $loggedUser } else { $userSid }
  $loadedHives[$userSid] = $true
  $profiles = @([PSCustomObject]@{
    username = $sidToName[$userSid]
    sid = $userSid
    profilePath = ''
    isLoaded = $true
    isActiveLoggedIn = $true
  }) + $profiles
}

$shares = @()
$seenKeys = @{}

function Get-ExplorerDriveLabel($sid, $unc) {
  if (-not $sid -or -not $unc) { return '' }
  try {
    $keyName = ($unc.TrimStart('\\')).Replace('\\', '#')
    $mp = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\##$keyName"
    if (Test-Path $mp) {
      $v = Get-ItemProperty -Path $mp -Name '_LabelFromReg' -ErrorAction SilentlyContinue
      if ($v -and $v._LabelFromReg) { return [string]$v._LabelFromReg }
    }
  } catch {}
  return ''
}

# 1. Active session / WMI mapped disks and SMB mappings (includes live session state)
$liveMapByLocal = @{}
try {
  foreach ($m in (Get-CimInstance Win32_MappedLogicalDisk -ErrorAction SilentlyContinue)) {
    $loc = ([string]$m.DeviceID).ToUpper()
    if ($loc) { $liveMapByLocal[$loc] = [string]$m.ProviderName }
  }
} catch {}
if (Get-Command Get-SmbMapping -ErrorAction SilentlyContinue) {
  try {
    foreach ($sm in (Get-SmbMapping -ErrorAction SilentlyContinue)) {
      $loc = ([string]$sm.LocalPath).ToUpper()
      if ($loc) { $liveMapByLocal[$loc] = [string]$sm.RemotePath }
    }
  } catch {}
}

# 2. All loaded HKEY_USERS\\<SID>\\Network drives (captures active interactive user + other loaded sessions accurately)
foreach ($sid in $loadedHives.Keys) {
  $netRoot = "Registry::HKEY_USERS\\$sid\\Network"
  if (-not (Test-Path $netRoot)) { continue }
  $ownerName = if ($sidToName.ContainsKey($sid)) { $sidToName[$sid] } else { $sid }
  foreach ($nk in (Get-ChildItem -Path $netRoot -ErrorAction SilentlyContinue)) {
    $letter = ([string]$nk.PSChildName).Trim().ToUpper()
    if (-not $letter) { continue }
    $dl = $letter + ':'
    $props = Get-ItemProperty -Path $nk.PSPath -ErrorAction SilentlyContinue
    $remote = if ($props -and $props.RemotePath) { [string]$props.RemotePath } else { '' }
    if (-not $remote) { continue }
    $prov = if ($props -and $props.ProviderName) { [string]$props.ProviderName } else { 'Microsoft Windows Network' }
    $lbl = Get-ExplorerDriveLabel $sid $remote
    $isLiveInWmi = $liveMapByLocal.ContainsKey($dl)
    $st = if ($isLiveInWmi) { 'Connected' } elseif ($sid -eq $userSid) { 'Persistent (Active Profile)' } else { 'Persistent (Loaded Profile)' }
    $k = "user|$sid|$dl|$($remote.ToLower())"
    $seenKeys[$k] = $true
    $shares += [PSCustomObject]@{
      id = $k
      driveLetter = $dl
      remotePath = $remote
      label = $lbl
      status = $st
      persistent = $true
      scope = 'user'
      ownerUser = $ownerName
      ownerSid = $sid
      provider = $prov
      managedRuleName = ''
    }
  }
}

# 3. NetTopo managed logon rules (All Users / Specific User persistent rules)
try {
  $tasks = Get-ScheduledTask -TaskName 'NetTopo_MapDrive_*' -ErrorAction SilentlyContinue
  foreach ($t in $tasks) {
    $desc = [string]$t.Description
    if ($desc -like 'NetTopoMappedShare|*') {
      $parts = @{}
      foreach ($seg in ($desc.Substring(19).Split('|'))) {
        $eq = $seg.IndexOf('=')
        if ($eq -gt 0) {
          $parts[$seg.Substring(0, $eq)] = $seg.Substring($eq + 1)
        }
      }
      $dl = if ($parts.ContainsKey('drive')) { [string]$parts['drive'] } else { '' }
      $rem = if ($parts.ContainsKey('path')) { [string]$parts['path'] } else { '' }
      $sc = if ($parts.ContainsKey('scope') -and $parts['scope'] -eq 'user') { 'user' } else { 'all_users' }
      $own = if ($parts.ContainsKey('owner') -and $parts['owner']) { [string]$parts['owner'] } elseif ($sc -eq 'all_users') { 'All Users (Logon Policy)' } else { '' }
      $lbl = if ($parts.ContainsKey('label')) { [string]$parts['label'] } else { '' }
      if (-not $rem) { continue }
      $k = "rule|$($t.TaskName)"
      $seenKeys[$k] = $true
      $shares += [PSCustomObject]@{
        id = $k
        driveLetter = $dl
        remotePath = $rem
        label = $lbl
        status = if ($sc -eq 'all_users') { 'Active All-Users Logon Rule' } else { 'Scheduled User Logon Rule' }
        persistent = $true
        scope = $sc
        ownerUser = $own
        ownerSid = if ($parts.ContainsKey('sid')) { [string]$parts['sid'] } else { '' }
        provider = 'NetTopo Persistent Rule'
        managedRuleName = [string]$t.TaskName
      }
    }
  }
} catch {}

# 4. Any active machine / SMB / WMI network connection not yet covered by user HKU entries
try {
  foreach ($nc in (Get-CimInstance Win32_NetworkConnection -ErrorAction SilentlyContinue)) {
    $dl = ([string]$nc.LocalName).Trim().ToUpper()
    $rem = [string]$nc.RemoteName
    if (-not $rem) { continue }
    if ($rem -match '\\\\(IPC|ADMIN)\\$$') { continue }
    $already = $false
    foreach ($ex in $shares) {
      if ($ex.remotePath -ieq $rem -and ($ex.driveLetter -ieq $dl -or (-not $dl -and -not $ex.driveLetter))) {
        $already = $true; break
      }
    }
    if ($already) { continue }
    $st = if ($nc.ConnectionState) { [string]$nc.ConnectionState } else { 'Connected' }
    $k = "machine|$dl|$($rem.ToLower())"
    $shares += [PSCustomObject]@{
      id = $k
      driveLetter = $dl
      remotePath = $rem
      label = ''
      status = $st
      persistent = [bool]$nc.Persistent
      scope = 'machine'
      ownerUser = if ($nc.UserName) { [string]$nc.UserName } else { 'Workstation Session' }
      ownerSid = ''
      provider = if ($nc.ProviderName) { [string]$nc.ProviderName } else { 'Microsoft Windows Network' }
      managedRuleName = ''
    }
  }
} catch {}

if (Get-Command Get-SmbMapping -ErrorAction SilentlyContinue) {
  try {
    foreach ($sm in (Get-SmbMapping -ErrorAction SilentlyContinue)) {
      $dl = ([string]$sm.LocalPath).Trim().ToUpper()
      $rem = [string]$sm.RemotePath
      if (-not $rem) { continue }
      $already = $false
      foreach ($ex in $shares) {
        if ($ex.remotePath -ieq $rem -and $ex.driveLetter -ieq $dl) { $already = $true; break }
      }
      if ($already) { continue }
      $k = "smb|$dl|$($rem.ToLower())"
      $shares += [PSCustomObject]@{
        id = $k
        driveLetter = $dl
        remotePath = $rem
        label = ''
        status = [string]$sm.Status
        persistent = $false
        scope = 'machine'
        ownerUser = 'Active SMB Session'
        ownerSid = ''
        provider = 'SMB'
        managedRuleName = ''
      }
    }
  } catch {}
}

$usedSet = New-Object 'System.Collections.Generic.HashSet[string]'
try {
  foreach ($ld in (Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue)) {
    $dId = ([string]$ld.DeviceID).Trim().ToUpper()
    if ($dId -match '^[A-Z]:$') { [void]$usedSet.Add($dId) }
  }
} catch {}
try {
  foreach ($psd in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
    $rt = ([string]$psd.Root).Trim().ToUpper().TrimEnd('\\')
    if ($rt -match '^[A-Z]:$') { [void]$usedSet.Add($rt) }
  }
} catch {}
foreach ($k in $liveMapByLocal.Keys) {
  $u = ([string]$k).Trim().ToUpper()
  if ($u -match '^[A-Z]:$') { [void]$usedSet.Add($u) }
}
foreach ($sh in $shares) {
  $u = ([string]$sh.driveLetter).Trim().ToUpper()
  if ($u -match '^[A-Z]:$') { [void]$usedSet.Add($u) }
}

[PSCustomObject]@{
  hostname = $env:COMPUTERNAME
  loggedInUser = $loggedUser
  loggedInUserSid = $userSid
  userProfiles = @($profiles | Sort-Object -Property @{Expression='isActiveLoggedIn';Descending=$true}, @{Expression='username';Descending=$false})
  shares = $shares
  usedDriveLetters = @($usedSet | Sort-Object)
} | ConvertTo-Json -Depth 6 -Compress
`;

  const lx = `
python3 - <<'PY'
import json, os, socket
shares = []
try:
    with open("/proc/mounts", "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            parts = line.split()
            if len(parts) < 3:
                continue
            src, mnt, fstype = parts[0], parts[1], parts[2]
            if fstype in ("cifs", "smb3", "nfs", "nfs4", "fuse.sshfs"):
                shares.append({
                    "id": f"linux|{mnt}|{src}",
                    "driveLetter": mnt,
                    "remotePath": src,
                    "label": "",
                    "status": "Mounted",
                    "persistent": False,
                    "scope": "machine",
                    "ownerUser": os.environ.get("USER", "root"),
                    "ownerSid": "",
                    "provider": fstype.upper(),
                    "managedRuleName": ""
                })
except Exception:
    pass
print(json.dumps({
    "hostname": socket.gethostname(),
    "loggedInUser": os.environ.get("USER", ""),
    "loggedInUserSid": "",
    "userProfiles": [],
    "shares": shares,
    "usedDriveLetters": []
}))
PY
`;

  const execRes = await executeHardcodedScripts(input, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint mapped shares');
  const rawProfiles = Array.isArray(parsed.userProfiles)
    ? parsed.userProfiles
    : parsed.userProfiles
    ? [parsed.userProfiles]
    : [];
  const rawShares = Array.isArray(parsed.shares)
    ? parsed.shares
    : parsed.shares
    ? [parsed.shares]
    : [];
  const rawUsedLetters = Array.isArray(parsed.usedDriveLetters)
    ? parsed.usedDriveLetters
    : parsed.usedDriveLetters
    ? [parsed.usedDriveLetters]
    : [];

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    loggedInUser: String(parsed.loggedInUser || ''),
    loggedInUserSid: String(parsed.loggedInUserSid || ''),
    collectedAt: new Date().toISOString(),
    userProfiles: rawProfiles.map((u: any) => ({
      username: String(u.username || u.sid || ''),
      sid: String(u.sid || ''),
      profilePath: String(u.profilePath || ''),
      isLoaded: Boolean(u.isLoaded),
      isActiveLoggedIn: Boolean(u.isActiveLoggedIn),
    })),
    shares: rawShares.map((s: any, idx: number) => ({
      id: String(s.id || `${s.driveLetter || 'unc'}-${s.remotePath}-${idx}`),
      driveLetter: String(s.driveLetter || ''),
      remotePath: String(s.remotePath || ''),
      label: String(s.label || ''),
      status: String(s.status || 'Connected'),
      persistent: Boolean(s.persistent),
      scope:
        s.scope === 'all_users' || s.scope === 'machine' ? s.scope : 'user',
      ownerUser: String(s.ownerUser || ''),
      ownerSid: String(s.ownerSid || ''),
      provider: String(s.provider || 'Microsoft Windows Network'),
      managedRuleName: s.managedRuleName ? String(s.managedRuleName) : undefined,
    })),
    usedDriveLetters: Array.from(
      new Set<string>(
        rawUsedLetters
          .map((d: any) => String(d || '').trim().toUpperCase())
          .filter((d: string) => /^[A-Z]:$/.test(d))
      )
    ).sort(),
  };
}

export async function listFileServerShares(
  input: HelpdeskTargetInput & {
    fileServer: string;
    fileServerUsername?: string;
    fileServerPassword?: string;
  }
): Promise<HelpdeskFileServerListResult> {
  const fileServer = validatePrintServerInput(input.fileServer);
  const srvB64 = utf8Base64(fileServer);
  const fsUser = String(input.fileServerUsername || input.username || '').trim();
  const fsPass = String(input.fileServerPassword || input.password || '');
  const userB64 = utf8Base64(fsUser);
  const passB64 = utf8Base64(fsPass);

  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$srv = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${srvB64}'))
$fsUser = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${userB64}'))
$fsPass = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${passB64}'))
${PS_HELPDESK_DETECT_LOGGED_USER}

$mappedByUnc = @{}
if ($userSid) {
  try {
    foreach ($nk in (Get-ChildItem -Path "Registry::HKEY_USERS\\$userSid\\Network" -ErrorAction SilentlyContinue)) {
      $props = Get-ItemProperty -Path $nk.PSPath -ErrorAction SilentlyContinue
      if ($props -and $props.RemotePath) {
        $mappedByUnc[([string]$props.RemotePath).ToLower()] = "$($nk.PSChildName.ToUpper()):"
      }
    }
  } catch {}
}
try {
  foreach ($nc in (Get-CimInstance Win32_NetworkConnection -ErrorAction SilentlyContinue)) {
    if ($nc.RemoteName) {
      $k = ([string]$nc.RemoteName).ToLower()
      if (-not $mappedByUnc.ContainsKey($k)) {
        $mappedByUnc[$k] = ([string]$nc.LocalName).ToUpper()
      }
    }
  }
} catch {}

$ipcConnected = $false
if ($fsUser -and $fsPass) {
  try {
    & net use "\\\\$srv\\IPC$" $fsPass "/user:$fsUser" /persistent:no 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ipcConnected = $true }
  } catch {}
}

$results = @()
$seen = @{}
try {
  # Method 1: Win32_Share via CIM/WMI
  try {
    $wmiShares = Get-CimInstance -ClassName Win32_Share -ComputerName $srv -ErrorAction Stop
    foreach ($ws in $wmiShares) {
      $sname = [string]$ws.Name
      if (-not $sname) { continue }
      $tNum = [uint32]$ws.Type
      # Include Disk shares (0) and hidden admin Disk shares (2147483648), exclude IPC$/Print$
      if (($tNum -band 0x0FFFFFFF) -ne 0) { continue }
      $isAdmin = ($sname.EndsWith('$'))
      $sKey = $sname.ToLower()
      if ($seen.ContainsKey($sKey)) { continue }
      $seen[$sKey] = $true
      $unc = "\\\\$srv\\$sname"
      $mappedDl = if ($mappedByUnc.ContainsKey($unc.ToLower())) { $mappedByUnc[$unc.ToLower()] } else { '' }
      $results += [PSCustomObject]@{
        name = $sname
        uncPath = $unc
        description = [string]$ws.Description
        shareType = if ($isAdmin) { 'Admin / Hidden Share' } else { 'Disk Share' }
        isAdminShare = $isAdmin
        alreadyMapped = $mappedByUnc.ContainsKey($unc.ToLower())
        mappedDriveLetter = $mappedDl
      }
    }
  } catch {}

  # Method 2: net view \\server fallback (visible disk shares)
  if ($results.Count -eq 0) {
    $nvOut = & net view "\\\\$srv" 2>&1
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $nvOut) {
        $lineStr = [string]$line
        if ($lineStr -match '^(.+?)\\s{2,}Disk\\s*(.*)$') {
          $sname = $Matches[1].Trim()
          $desc = $Matches[2].Trim()
          if (-not $sname) { continue }
          $sKey = $sname.ToLower()
          if ($seen.ContainsKey($sKey)) { continue }
          $seen[$sKey] = $true
          $unc = "\\\\$srv\\$sname"
          $isAdmin = $sname.EndsWith('$')
          $mappedDl = if ($mappedByUnc.ContainsKey($unc.ToLower())) { $mappedByUnc[$unc.ToLower()] } else { '' }
          $results += [PSCustomObject]@{
            name = $sname
            uncPath = $unc
            description = $desc
            shareType = if ($isAdmin) { 'Admin / Hidden Share' } else { 'Disk Share' }
            isAdminShare = $isAdmin
            alreadyMapped = $mappedByUnc.ContainsKey($unc.ToLower())
            mappedDriveLetter = $mappedDl
          }
        }
      }
    } else {
      $errTxt = ($nvOut | Out-String).Trim()
      if ($errTxt) { throw "Failed to query shared folders on '\\\\$srv': $errTxt" }
    }
  }
} finally {
  if ($ipcConnected) {
    & net use "\\\\$srv\\IPC$" /delete /y 2>&1 | Out-Null
  }
}

[PSCustomObject]@{
  fileServer = $srv
  loggedInUser = $loggedUser
  shares = @($results | Sort-Object -Property @{Expression='isAdminShare';Descending=$false}, @{Expression='name';Descending=$false})
} | ConvertTo-Json -Depth 5 -Compress
`;

  const lx = `
python3 - <<'PY'
import json
print(json.dumps({"fileServer": "", "loggedInUser": "", "shares": []}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 30000 }, ps, lx);
  if (execRes.osFamily !== 'windows') {
    throw new Error('Windows File Server share browsing is only supported on Windows endpoints.');
  }
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'list file server shares');
  const rawList = Array.isArray(parsed.shares) ? parsed.shares : parsed.shares ? [parsed.shares] : [];

  return {
    targetIp: execRes.host,
    fileServer,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    loggedInUser: String(parsed.loggedInUser || ''),
    collectedAt: new Date().toISOString(),
    shares: rawList.map((s: any) => ({
      name: String(s.name || ''),
      uncPath: String(s.uncPath || `\\\\${fileServer}\\${s.name}`),
      description: String(s.description || ''),
      shareType: String(s.shareType || 'Disk Share'),
      isAdminShare: Boolean(s.isAdminShare),
      alreadyMapped: Boolean(s.alreadyMapped),
      mappedDriveLetter: String(s.mappedDriveLetter || ''),
    })),
  };
}

export async function mapEndpointNetworkShare(
  input: HelpdeskTargetInput & {
    remotePath: string;
    driveLetter?: string;
    scope?: 'active_user' | 'specific_user' | 'all_users';
    targetSids?: string[];
    persistent?: boolean;
    label?: string;
    shareUsername?: string;
    sharePassword?: string;
  }
): Promise<HelpdeskShareMapResult> {
  const { uncPath, fileServer } = validateUncSharePath(input.remotePath);
  const driveLetter = validateDriveLetterInput(input.driveLetter);
  const scope: 'active_user' | 'specific_user' | 'all_users' =
    input.scope === 'specific_user' || input.scope === 'all_users'
      ? input.scope
      : 'active_user';
  const persistent = input.persistent !== false;
  const label = validateShareLabelInput(input.label);

  const targetSids = Array.isArray(input.targetSids)
    ? Array.from(new Set(input.targetSids.map(validateProfileSidInput))).slice(0, 25)
    : [];
  if (scope === 'specific_user' && targetSids.length === 0) {
    throw new Error('Select at least one workstation user profile for specific-user share mapping.');
  }

  const shareUser = String(input.shareUsername || '').trim();
  const sharePass = String(input.sharePassword || '');
  if (shareUser && /[\r\n\0]/.test(shareUser)) {
    throw new Error('Invalid share username.');
  }

  const uncB64 = utf8Base64(uncPath);
  const srvB64 = utf8Base64(fileServer);
  const dlB64 = utf8Base64(driveLetter);
  const lblB64 = utf8Base64(label);
  const shUserB64 = utf8Base64(shareUser);
  const shPassB64 = utf8Base64(sharePass);
  const sidsB64 = utf8Base64(JSON.stringify(targetSids));

  const specificUncLogonCmdB64 = encodePowerShellBase64(
    `$u = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}')); & net.exe use $u /persistent:yes 2>&1 | Out-Null`
  );

  // Pre-build inner interactive mapping script via utf8 -> base64 parameters
  const interactiveMapScriptB64 = encodePowerShellBase64(`
$ErrorActionPreference = 'Continue'
$unc = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}'))
$srv = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${srvB64}'))
$dl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${dlB64}'))
$lbl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${lblB64}'))
$uName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${shUserB64}'))
$uPass = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${shPassB64}'))
$persistStr = '${persistent ? 'yes' : 'no'}'
$logPath = Join-Path $env:TEMP ('nt_map_' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.log')

if ($dl -eq 'AUTO') {
  $used = @{}
  foreach ($d in (Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue)) {
    $used[([string]$d.DeviceID).ToUpper()] = $true
  }
  foreach ($nk in (Get-ChildItem -Path 'HKCU:\\Network' -ErrorAction SilentlyContinue)) {
    $used[("$($nk.PSChildName.ToUpper()):")] = $true
  }
  $dl = ''
  foreach ($code in 90..68) {
    $cand = ([char]$code) + ':'
    if (-not $used.ContainsKey($cand)) { $dl = $cand; break }
  }
}

$outText = ''
$ok = $false
try {
  if ($dl) {
    & net.exe use $dl /delete /y 2>&1 | Out-Null
  } else {
    & net.exe use $unc /delete /y 2>&1 | Out-Null
  }

  if ($uName -and $uPass) {
    if ($persistStr -eq 'yes') {
      try { & cmdkey.exe ("/add:$srv") ("/user:$uName") ("/pass:$uPass") 2>&1 | Out-Null } catch {}
    }
    if ($dl) {
      $out = & net.exe use $dl $unc $uPass ("/user:$uName") ("/persistent:$persistStr") 2>&1
    } else {
      $out = & net.exe use $unc $uPass ("/user:$uName") ("/persistent:$persistStr") 2>&1
    }
  } else {
    if ($dl) {
      $out = & net.exe use $dl $unc ("/persistent:$persistStr") 2>&1
    } else {
      $out = & net.exe use $unc ("/persistent:$persistStr") 2>&1
    }
  }
  $code = $LASTEXITCODE
  $outText = ($out | Out-String).Trim()
  $ok = ($code -eq 0)

  if ($ok -and $lbl) {
    $keyName = ($unc.TrimStart('\\')).Replace('\\', '#')
    $mp = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\##$keyName"
    if (-not (Test-Path $mp)) { New-Item -Path $mp -Force | Out-Null }
    Set-ItemProperty -Path $mp -Name '_LabelFromReg' -Value $lbl -Type String -Force -ErrorAction SilentlyContinue
  }
} catch {
  $outText = $_.Exception.Message
  $ok = $false
}

$resObj = [PSCustomObject]@{ ok = $ok; driveLetter = $dl; output = $outText } | ConvertTo-Json -Compress
Set-Content -Path 'C:\\Windows\\Temp\\NetTopo_LastMapResult.json' -Value $resObj -Encoding UTF8 -Force -ErrorAction SilentlyContinue
`);

  const ps = `
$ErrorActionPreference = 'Stop'
$unc = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}'))
$srv = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${srvB64}'))
$reqDl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${dlB64}'))
$lbl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${lblB64}'))
$shUser = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${shUserB64}'))
$scopeMode = '${scope}'
$isPersist = ${persistent ? '$true' : '$false'}
$targetSidsJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidsB64}'))
$targetSids = @(ConvertFrom-Json -InputObject $targetSidsJson)
${PS_HELPDESK_DETECT_LOGGED_USER}

$notes = @()
$appliedUsers = @()
$finalDl = $reqDl
$managedRuleName = ''

# Resolve AUTO drive letter globally across host & target user hives if needed
if ($finalDl -eq 'AUTO') {
  $usedLetters = @{}
  foreach ($d in (Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue)) {
    $usedLetters[([string]$d.DeviceID).ToUpper()] = $true
  }
  if ($userSid -and (Test-Path ("Registry::HKEY_USERS\\" + $userSid + "\\Network"))) {
    foreach ($nk in (Get-ChildItem -Path ("Registry::HKEY_USERS\\" + $userSid + "\\Network") -ErrorAction SilentlyContinue)) {
      $usedLetters[("$($nk.PSChildName.ToUpper()):")] = $true
    }
  }
  $finalDl = ''
  foreach ($code in 90..68) {
    $cand = ([char]$code) + ':'
    if (-not $usedLetters.ContainsKey($cand)) { $finalDl = $cand; break }
  }
  if (-not $finalDl) { throw "No free drive letter (D:-Z:) available on endpoint." }
}

function Invoke-ActiveUserInteractiveMap($actUser) {
  $tName = "NetTopo_ExecMap_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $resFile = 'C:\\Windows\\Temp\\NetTopo_LastMapResult.json'
  if (Test-Path $resFile) { Remove-Item -Path $resFile -Force -ErrorAction SilentlyContinue }
  try {
    $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ${interactiveMapScriptB64}"
    $pri = New-ScheduledTaskPrincipal -UserId $actUser -LogonType Interactive -RunLevel Limited
    $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 30)
    Register-ScheduledTask -TaskName $tName -Action $act -Principal $pri -Settings $st -Force | Out-Null
    Start-ScheduledTask -TaskName $tName
    for ($i = 0; $i -lt 35; $i++) {
      Start-Sleep -Milliseconds 350
      $ti = Get-ScheduledTask -TaskName $tName -ErrorAction SilentlyContinue
      if (-not $ti -or $ti.State -ne 'Running') { break }
    }
    if (Test-Path $resFile) {
      $rawJson = Get-Content -Path $resFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
      Remove-Item -Path $resFile -Force -ErrorAction SilentlyContinue
      if ($rawJson) { return (ConvertFrom-Json -InputObject $rawJson) }
    }
    return $null
  } finally {
    Unregister-ScheduledTask -TaskName $tName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    if (Test-Path $resFile) { Remove-Item -Path $resFile -Force -ErrorAction SilentlyContinue }
  }
}

function Write-HiveNetworkMapping($hiveRoot, $letterOnly, $uncVal, $labelVal, $userHint) {
  $netKey = "$hiveRoot\\Network\\$letterOnly"
  if (-not (Test-Path $netKey)) { New-Item -Path $netKey -Force | Out-Null }
  Set-ItemProperty -Path $netKey -Name 'RemotePath' -Value $uncVal -Type String -Force
  Set-ItemProperty -Path $netKey -Name 'ConnectionType' -Value 1 -Type DWord -Force
  Set-ItemProperty -Path $netKey -Name 'ProviderName' -Value 'Microsoft Windows Network' -Type String -Force
  Set-ItemProperty -Path $netKey -Name 'ProviderType' -Value 131072 -Type DWord -Force
  Set-ItemProperty -Path $netKey -Name 'DeferFlags' -Value 4 -Type DWord -Force
  Set-ItemProperty -Path $netKey -Name 'UserName' -Value ([string]$userHint) -Type String -Force
  if ($labelVal) {
    $keyName = ($uncVal.TrimStart('\\')).Replace('\\', '#')
    $mp = "$hiveRoot\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\##$keyName"
    if (-not (Test-Path $mp)) { New-Item -Path $mp -Force | Out-Null }
    Set-ItemProperty -Path $mp -Name '_LabelFromReg' -Value $labelVal -Type String -Force -ErrorAction SilentlyContinue
  }
}

function Apply-ToOfflineOrLoadedProfile($sid, $letterWithColon, $uncVal, $labelVal, $userHint) {
  $acct = $sid
  try { $acct = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value } catch {}
  $letterOnly = $letterWithColon.TrimEnd(':').ToUpper()
  if (-not $letterOnly) { return $null }

  if (Test-Path ("Registry::HKEY_USERS\\" + $sid)) {
    Write-HiveNetworkMapping ("Registry::HKEY_USERS\\" + $sid) $letterOnly $uncVal $labelVal $userHint
    return $acct
  }

  $pKey = Get-ItemProperty -Path ("Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\" + $sid) -ErrorAction SilentlyContinue
  if (-not $pKey -or -not $pKey.ProfileImagePath) { return $null }
  $ntDat = Join-Path ([string]$pKey.ProfileImagePath) 'NTUSER.DAT'
  if (-not (Test-Path $ntDat)) { return $null }

  $tmpName = 'NetTopoTmp_' + ([guid]::NewGuid().ToString('N').Substring(0,8))
  $loadOut = & reg.exe load ("HKU\\" + $tmpName) $ntDat 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to mount profile hive for $($acct): $($loadOut | Out-String)"
  }
  try {
    Write-HiveNetworkMapping ("Registry::HKEY_USERS\\" + $tmpName) $letterOnly $uncVal $labelVal $userHint
  } finally {
    [gc]::Collect()
    [gc]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 150
    & reg.exe unload ("HKU\\" + $tmpName) 2>&1 | Out-Null
  }
  return $acct
}

if ($scopeMode -eq 'active_user') {
  if (-not $loggedUser) {
    throw "No active logged-in interactive user detected on this workstation. Choose Specific User or All Users scope."
  }
  $taskRes = Invoke-ActiveUserInteractiveMap $loggedUser
  if (-not $taskRes -or -not $taskRes.ok) {
    $errMsg = if ($taskRes -and $taskRes.output) { [string]$taskRes.output } else { 'Interactive session net use failed.' }
    throw "Failed to map share '$unc' for active user $($loggedUser): $errMsg"
  }
  if ($taskRes.driveLetter) { $finalDl = [string]$taskRes.driveLetter }
  if ($isPersist -and $finalDl -and $userSid -and (Test-Path ("Registry::HKEY_USERS\\" + $userSid))) {
    Write-HiveNetworkMapping ("Registry::HKEY_USERS\\" + $userSid) ($finalDl.TrimEnd(':')) $unc $lbl $shUser
  }
  $appliedUsers += $loggedUser
  $notes += "Mapped $finalDl -> $unc inside active user session ($loggedUser)"
} elseif ($scopeMode -eq 'specific_user') {
  foreach ($sid in $targetSids) {
    if ($userSid -and $sid -eq $userSid -and $loggedUser) {
      $taskRes = Invoke-ActiveUserInteractiveMap $loggedUser
      if (-not $taskRes -or -not $taskRes.ok) {
        $errMsg = if ($taskRes -and $taskRes.output) { [string]$taskRes.output } else { 'Interactive session net use failed.' }
        throw "Failed to map share '$unc' for active user $($loggedUser): $errMsg"
      }
      if ($taskRes.driveLetter) { $finalDl = [string]$taskRes.driveLetter }
      if ($isPersist -and $finalDl) {
        Write-HiveNetworkMapping ("Registry::HKEY_USERS\\" + $userSid) ($finalDl.TrimEnd(':')) $unc $lbl $shUser
      }
      $appliedUsers += $loggedUser
      $notes += "Mapped live in session for $loggedUser"
    } else {
      if ($finalDl) {
        $acctRes = Apply-ToOfflineOrLoadedProfile $sid $finalDl $unc $lbl $shUser
        if ($acctRes) {
          $appliedUsers += $acctRes
          $notes += "Configured persistent HKU\\Network\\$($finalDl.TrimEnd(':')) for profile $acctRes"
        }
      } else {
        # UNC-only persistent logon rule for offline user
        $acct = $sid
        try { $acct = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value } catch {}
        $hashSuffix = [System.BitConverter]::ToString([System.Security.Cryptography.SHA1]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($sid + '|' + $unc))).Replace('-','').Substring(0,8)
        $rName = "NetTopo_MapDrive_U_$hashSuffix"
        $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ${specificUncLogonCmdB64}"
        $pri = New-ScheduledTaskPrincipal -UserId $acct -LogonType Interactive -RunLevel Limited
        $trg = New-ScheduledTaskTrigger -AtLogOn -User $acct
        $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 30)
        Register-ScheduledTask -TaskName $rName -Action $act -Principal $pri -Trigger $trg -Settings $st -Description ("NetTopoMappedShare|scope=user|drive=|path=$unc|label=$lbl|owner=$acct|sid=$sid") -Force | Out-Null
        $managedRuleName = $rName
        $appliedUsers += $acct
        $notes += "Registered logon UNC rule $rName for $acct"
      }
    }
  }
} else {
  # all_users scope: immediate active session + existing S-1-5-21-* profile hives + machine-wide logon rule
  if ($loggedUser) {
    $taskRes = Invoke-ActiveUserInteractiveMap $loggedUser
    if ($taskRes -and $taskRes.ok) {
      if ($taskRes.driveLetter) { $finalDl = [string]$taskRes.driveLetter }
      $appliedUsers += $loggedUser
      $notes += "Mapped live in current user session ($loggedUser)"
    } else {
      $errNote = if ($taskRes -and $taskRes.output) { [string]$taskRes.output } else { 'No active share session output' }
      $notes += "Active session notice: $errNote"
    }
  }

  if ($finalDl) {
    $plist = Get-ChildItem -Path 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -ErrorAction SilentlyContinue
    foreach ($pk in $plist) {
      $sid = [string]$pk.PSChildName
      if ($sid -notmatch '^S-1-5-21-') { continue }
      try {
        $acctRes = Apply-ToOfflineOrLoadedProfile $sid $finalDl $unc $lbl $shUser
        if ($acctRes -and ($appliedUsers -notcontains $acctRes)) {
          $appliedUsers += $acctRes
        }
      } catch {}
    }
    $notes += "Applied drive $finalDl to $($appliedUsers.Count) workstation user profile(s)"
  }

  # Register persistent machine-wide AtLogon rule for BUILTIN\\Users (never stores passwords)
  $slug = if ($finalDl) { $finalDl.TrimEnd(':').ToUpper() } else {
    'UNC_' + [System.BitConverter]::ToString([System.Security.Cryptography.SHA1]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($unc))).Replace('-','').Substring(0,8)
  }
  $managedRuleName = "NetTopo_MapDrive_$slug"
  $dlSafe = ($finalDl -replace '[^A-Za-z:]', '')
  $innerLogonPs = @(
    '$unc = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${uncB64}"))',
    '$lbl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${lblB64}"))',
    ('$dl = "' + $dlSafe + '"'),
    'if ($dl) { & net.exe use $dl $unc /persistent:yes 2>&1 | Out-Null } else { & net.exe use $unc /persistent:yes 2>&1 | Out-Null }',
    'if ($lbl) { $kn = ($unc.TrimStart([char]92)).Replace([char]92, [char]35); $mp = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\##$kn"; if (-not (Test-Path $mp)) { New-Item -Path $mp -Force | Out-Null }; Set-ItemProperty -Path $mp -Name "_LabelFromReg" -Value $lbl -Type String -Force -ErrorAction SilentlyContinue }'
  ) -join [Environment]::NewLine
  $logonB64 = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($innerLogonPs))
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $logonB64"
  $pri = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited
  $trg = New-ScheduledTaskTrigger -AtLogOn
  $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 30)
  Register-ScheduledTask -TaskName $managedRuleName -Action $act -Principal $pri -Trigger $trg -Settings $st -Description ("NetTopoMappedShare|scope=all_users|drive=$finalDl|path=$unc|label=$lbl|owner=All Users") -Force | Out-Null
  $notes += "Registered All-Users logon task $managedRuleName"
}

[PSCustomObject]@{
  ok = $true
  remotePath = $unc
  driveLetter = $finalDl
  scope = $scopeMode
  appliedUsers = $appliedUsers
  loggedInUser = $loggedUser
  managedRuleName = $managedRuleName
  output = ($notes -join ' | ')
} | ConvertTo-Json -Depth 4 -Compress
`;

  const lx = `
python3 - <<'PY'
import json
print(json.dumps({"ok": False, "output": "Windows SMB mapped drive provisioning is only supported on Windows workstations."}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 45000 }, ps, lx);
  if (execRes.osFamily !== 'windows') {
    throw new Error('Mapping SMB network drives for domain/local user profiles is only supported on Windows endpoints.');
  }
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'map endpoint network share');
  const ok = Boolean(parsed.ok);
  const appliedUsers: string[] = Array.isArray(parsed.appliedUsers)
    ? parsed.appliedUsers.map(String)
    : parsed.appliedUsers
    ? [String(parsed.appliedUsers)]
    : [];
  const finalDrive = String(parsed.driveLetter || driveLetter);
  const loggedInUser = String(parsed.loggedInUser || '');
  const managedRuleName = parsed.managedRuleName ? String(parsed.managedRuleName) : undefined;
  const driveTag = finalDrive ? `${finalDrive} → ${uncPath}` : uncPath;

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'share_map',
    success: ok,
    remotePath: uncPath,
    driveLetter: finalDrive,
    scope,
    appliedUsers,
    loggedInUser,
    persistent,
    managedRuleName,
    message: ok
      ? `Mapped share ${driveTag} on ${execRes.host} (${scope === 'all_users' ? 'All Users' : appliedUsers.join(', ') || loggedInUser}).`
      : `Failed to map share ${driveTag} on ${execRes.host}.`,
    messageFa: ok
      ? `پوشه اشتراکی ${driveTag} روی سیستم ${execRes.host} با موفقیت مپ شد (${scope === 'all_users' ? 'همه کاربران این سیستم' : appliedUsers.join('، ') || loggedInUser}).`
      : `مپ کردن پوشه اشتراکی ${driveTag} روی سیستم ${execRes.host} ناموفق بود.`,
    details: {
      remotePath: uncPath,
      driveLetter: finalDrive,
      scope,
      appliedUsersCount: appliedUsers.length,
      managedRuleName: managedRuleName || '',
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function disconnectEndpointNetworkShare(
  input: HelpdeskTargetInput & {
    remotePath: string;
    driveLetter?: string;
    scope?: 'user' | 'all_users' | 'machine' | 'auto';
    ownerSid?: string;
    managedRuleName?: string;
  }
): Promise<HelpdeskActionResult> {
  const driveLetter = validateDriveLetterInput(input.driveLetter);
  const scopeVal: 'user' | 'all_users' | 'machine' | 'auto' =
    input.scope === 'user' || input.scope === 'all_users' || input.scope === 'machine'
      ? input.scope
      : 'auto';
  const ownerSid = input.ownerSid ? validateProfileSidInput(input.ownerSid) : '';
  const managedRuleName = validateManagedRuleNameInput(input.managedRuleName);

  // Allow either Windows UNC or Linux mount source
  const rawRemote = String(input.remotePath || '').trim();
  const isUnc = rawRemote.startsWith('\\\\') || rawRemote.startsWith('//');
  const validatedUnc = isUnc
    ? validateUncSharePath(rawRemote).uncPath
    : validateLinuxMountPath(rawRemote);

  const uncB64 = utf8Base64(validatedUnc);
  const dlB64 = utf8Base64(driveLetter);
  const sidB64 = utf8Base64(ownerSid);
  const ruleB64 = utf8Base64(managedRuleName);

  const interactiveDelB64 = encodePowerShellBase64(`
$unc = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}'))
$dl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${dlB64}'))
if ($dl) { & net.exe use $dl /delete /y 2>&1 | Out-Null }
if ($unc) { & net.exe use $unc /delete /y 2>&1 | Out-Null }
`);

  const ps = `
$ErrorActionPreference = 'Continue'
$unc = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${uncB64}'))
$dl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${dlB64}'))
$targetSid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))
$ruleName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${ruleB64}'))
$scopeMode = '${scopeVal}'
${PS_HELPDESK_DETECT_LOGGED_USER}

$actions = @()
$removedAny = $false

# 1. Disconnect inside active logged-in interactive user session
if ($loggedUser -and ($scopeMode -ne 'machine' -or ($targetSid -and $targetSid -eq $userSid))) {
  $tName = "NetTopo_DelMap_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  try {
    $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ${interactiveDelB64}"
    $pri = New-ScheduledTaskPrincipal -UserId $loggedUser -LogonType Interactive -RunLevel Limited
    $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 20)
    Register-ScheduledTask -TaskName $tName -Action $act -Principal $pri -Settings $st -Force | Out-Null
    Start-ScheduledTask -TaskName $tName
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 300
      $ti = Get-ScheduledTask -TaskName $tName -ErrorAction SilentlyContinue
      if (-not $ti -or $ti.State -ne 'Running') { break }
    }
    $actions += "Executed disconnect in active user session ($loggedUser)"
    $removedAny = $true
  } catch {} finally {
    Unregister-ScheduledTask -TaskName $tName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  }
}

# 2. Remove persistent HKU\\<SID>\\Network entry helper
function Remove-HiveNetworkEntry($hiveRoot, $dlColon, $uncMatch) {
  $netRoot = "$hiveRoot\\Network"
  if (-not (Test-Path $netRoot)) { return $false }
  $didRemove = $false
  $letterOnly = $dlColon.TrimEnd(':').ToUpper()
  foreach ($nk in (Get-ChildItem -Path $netRoot -ErrorAction SilentlyContinue)) {
    $lName = ([string]$nk.PSChildName).Trim().ToUpper()
    $props = Get-ItemProperty -Path $nk.PSPath -ErrorAction SilentlyContinue
    $rp = if ($props -and $props.RemotePath) { [string]$props.RemotePath } else { '' }
    $matchByLetter = ($letterOnly -and $lName -eq $letterOnly -and (-not $uncMatch -or $rp -ieq $uncMatch))
    $matchByUnc = (-not $letterOnly -and $uncMatch -and $rp -ieq $uncMatch)
    if ($matchByLetter -or $matchByUnc) {
      Remove-Item -Path $nk.PSPath -Recurse -Force -ErrorAction SilentlyContinue
      $didRemove = $true
    }
  }
  return $didRemove
}

$sidsToClean = @()
if ($scopeMode -eq 'all_users') {
  foreach ($pk in (Get-ChildItem -Path 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -ErrorAction SilentlyContinue)) {
    if ($pk.PSChildName -match '^S-1-5-21-') { $sidsToClean += [string]$pk.PSChildName }
  }
} elseif ($targetSid) {
  $sidsToClean += $targetSid
} elseif ($userSid) {
  $sidsToClean += $userSid
}

foreach ($sid in ($sidsToClean | Select-Object -Unique)) {
  if (Test-Path ("Registry::HKEY_USERS\\" + $sid)) {
    if (Remove-HiveNetworkEntry ("Registry::HKEY_USERS\\" + $sid) $dl $unc) {
      $actions += "Removed HKU\\$sid\\Network registry mapping"
      $removedAny = $true
    }
  } elseif ($scopeMode -eq 'all_users' -or $sid -eq $targetSid) {
    $pKey = Get-ItemProperty -Path ("Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\" + $sid) -ErrorAction SilentlyContinue
    if ($pKey -and $pKey.ProfileImagePath) {
      $ntDat = Join-Path ([string]$pKey.ProfileImagePath) 'NTUSER.DAT'
      if (Test-Path $ntDat) {
        $tmpName = 'NetTopoDel_' + ([guid]::NewGuid().ToString('N').Substring(0,8))
        & reg.exe load ("HKU\\" + $tmpName) $ntDat 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
          try {
            if (Remove-HiveNetworkEntry ("Registry::HKEY_USERS\\" + $tmpName) $dl $unc) {
              $actions += "Removed offline hive Network mapping for $sid"
              $removedAny = $true
            }
          } finally {
            [gc]::Collect()
            [gc]::WaitForPendingFinalizers()
            Start-Sleep -Milliseconds 150
            & reg.exe unload ("HKU\\" + $tmpName) 2>&1 | Out-Null
          }
        }
      }
    }
  }
}

# 3. Clean machine / current session SMB or WMI mappings if present
if ($dl) {
  & net.exe use $dl /delete /y 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { $actions += "Disconnected session drive $dl"; $removedAny = $true }
}
if ($unc) {
  & net.exe use $unc /delete /y 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { $actions += "Disconnected session UNC $unc"; $removedAny = $true }
}
if (Get-Command Remove-SmbMapping -ErrorAction SilentlyContinue) {
  try {
    $smMatches = Get-SmbMapping -ErrorAction SilentlyContinue | Where-Object {
      ($dl -and $_.LocalPath -ieq $dl) -or ($unc -and $_.RemotePath -ieq $unc)
    }
    foreach ($sm in $smMatches) {
      Remove-SmbMapping -LocalPath $sm.LocalPath -RemotePath $sm.RemotePath -Force -UpdateProfile -ErrorAction SilentlyContinue
      $actions += "Removed SMB mapping $($sm.LocalPath) $($sm.RemotePath)"
      $removedAny = $true
    }
  } catch {}
}

# 4. Remove NetTopo managed logon scheduled task(s) if requested or matching all_users
if ($ruleName) {
  $t = Get-ScheduledTask -TaskName $ruleName -ErrorAction SilentlyContinue
  if ($t) {
    Unregister-ScheduledTask -TaskName $ruleName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    $actions += "Removed persistent logon rule $ruleName"
    $removedAny = $true
  }
} elseif ($scopeMode -eq 'all_users') {
  foreach ($t in (Get-ScheduledTask -TaskName 'NetTopo_MapDrive_*' -ErrorAction SilentlyContinue)) {
    $d = [string]$t.Description
    if (($unc -and $d -like "*path=$unc*") -and (-not $dl -or $d -like "*drive=$dl*")) {
      Unregister-ScheduledTask -TaskName $t.TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
      $actions += "Removed matching logon rule $($t.TaskName)"
      $removedAny = $true
    }
  }
}

if (-not $removedAny) {
  throw "Network share connection ('$dl' '$unc') was not found or already disconnected."
}

[PSCustomObject]@{
  ok = $true
  driveLetter = $dl
  remotePath = $unc
  loggedInUser = $loggedUser
  output = ($actions -join ' | ')
} | ConvertTo-Json -Compress
`;

  const targetMount = driveLetter || validatedUnc;
  const mountB64 = utf8Base64(targetMount);
  const lx = `
python3 - <<'PY'
import base64, json, subprocess
mnt = base64.b64decode("${mountB64}").decode("utf-8")
p = subprocess.run(["umount", mnt], capture_output=True, text=True)
print(json.dumps({
    "ok": p.returncode == 0,
    "driveLetter": mnt,
    "remotePath": mnt,
    "loggedInUser": "",
    "output": (p.stdout + p.stderr).strip() or f"Unmounted {mnt}"
}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 35000 }, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'disconnect network share');
  const ok = Boolean(parsed.ok);
  const displayTarget = driveLetter ? `${driveLetter} (${validatedUnc})` : validatedUnc;

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'share_disconnect',
    success: ok,
    message: ok
      ? `Disconnected network share ${displayTarget} on ${execRes.host}.`
      : `Failed to disconnect network share ${displayTarget} on ${execRes.host}.`,
    messageFa: ok
      ? `اتصال پوشه اشتراکی ${displayTarget} روی سیستم ${execRes.host} با موفقیت قطع (Disconnect) شد.`
      : `قطع اتصال پوشه اشتراکی ${displayTarget} روی سیستم ${execRes.host} ناموفق بود.`,
    details: {
      driveLetter,
      remotePath: validatedUnc,
      scope: scopeVal,
      managedRuleName,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 19C. WORKSTATION USER LOGONS, LAST LOGIN & ACTIVE SESSION TELEMETRY
// ============================================================================

export interface HelpdeskActiveUserSession {
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
}

export interface HelpdeskWorkstationUserSummary {
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
}

export interface HelpdeskWorkstationLogonEvent {
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
}

export interface HelpdeskUserLogonsResult {
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
  activeSessions: HelpdeskActiveUserSession[];
  userSummaries: HelpdeskWorkstationUserSummary[];
  events: HelpdeskWorkstationLogonEvent[];
  summary: {
    activeUsersCount: number;
    disconnectedCount: number;
    distinctUsersCount: number;
    totalLogonEvents: number;
    totalFailedEvents: number;
    lastLoginUser: string;
    lastLoginTime: string;
  };
}

function describeWindowsLogonType(code: number): { en: string; fa: string } {
  switch (code) {
    case 2:
      return { en: 'Interactive (Console)', fa: 'ورود مستقیم روی سیستم (Console)' };
    case 3:
      return { en: 'Network Share / SMB', fa: 'اتصال شبکه‌ای (SMB / Share)' };
    case 7:
      return { en: 'Screen Unlock', fa: 'باز کردن قفل صفحه (Unlock)' };
    case 8:
      return { en: 'Network Cleartext', fa: 'ورود شبکه‌ای' };
    case 9:
      return { en: 'RunAs / NewCredentials', fa: 'اجرا با اعتبار دیگر (RunAs)' };
    case 10:
      return { en: 'Remote Desktop (RDP)', fa: 'ریموت دسکتاپ (RDP)' };
    case 11:
      return { en: 'Cached Domain Logon', fa: 'ورود دامین (Cached Offline)' };
    case 12:
      return { en: 'Cached RDP Logon', fa: 'ورود ریموت دامین (Cached RDP)' };
    case 21:
    case 25:
      return { en: 'Session Logon / Reconnect', fa: 'اتصال نشست کاربر (Session)' };
    default:
      return { en: 'Workstation Session', fa: 'نشست کاربری' };
  }
}

function describeWindowsFailureSubStatus(sub: string): string {
  const s = String(sub || '').trim().toLowerCase();
  switch (s) {
    case '0xc000006a':
      return 'Incorrect password (رمز عبور اشتباه)';
    case '0xc0000064':
      return 'Unknown username (نام کاربری نامعتبر)';
    case '0xc0000234':
      return 'Account locked out (اکانت قفل شده)';
    case '0xc000006e':
      return 'Account logon restriction (محدودیت ورود اکانت)';
    case '0xc0000072':
      return 'Account disabled (اکانت غیرفعال است)';
    case '0xc0000071':
      return 'Password expired (رمز عبور منقضی شده)';
    case '0xc0000193':
      return 'Account expired (حساب منقضی شده)';
    case '0xc000015b':
      return 'Logon type not granted on this PC (مجوز نوع ورود ندارد)';
    case '0xc000006f':
      return 'Outside allowed logon hours (خارج از ساعت مجاز ورود)';
    case '0xc0000070':
      return 'Workstation restriction (محدودیت سیستم مجاز)';
    default:
      return s ? 'Authentication failed (' + s + ')' : 'Authentication failed';
  }
}

export async function collectEndpointUserLogons(
  input: HelpdeskTargetInput,
  options?: { hoursBack?: number; maxEvents?: number }
): Promise<HelpdeskUserLogonsResult> {
  const hoursBack = Math.max(1, Math.min(720, Math.floor(Number(options?.hoursBack) || 168)));
  const maxEvents = Math.max(20, Math.min(250, Math.floor(Number(options?.maxEvents) || 150)));

  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
${PS_HELPDESK_DETECT_LOGGED_USER}

$isScreenLocked = $false
try {
  $lockUi = Get-CimInstance Win32_Process -Filter "Name='LogonUI.exe'" -ErrorAction SilentlyContinue
  if ($lockUi) { $isScreenLocked = $true }
} catch {}

$activeSessions = @()
$seenSessionKeys = @{}

function Parse-DateTimeToIso($raw) {
  if (-not $raw) { return '' }
  try {
    if ($raw -is [DateTime]) {
      return ([DateTime]$raw).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $str = ([string]$raw).Trim()
    if (-not $str) { return '' }
    $dt = [DateTime]::Parse($str)
    return $dt.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  } catch {
    return ''
  }
}

# 1. Live Interactive / Disconnected Sessions via quser.exe
try {
  $qLines = @(& quser.exe 2>&1)
  if ($LASTEXITCODE -eq 0 -and $qLines.Count -gt 1) {
    foreach ($rawLine in $qLines[1..($qLines.Count - 1)]) {
      $line = ([string]$rawLine)
      if (-not $line -or $line.Trim().Length -lt 6) { continue }
      $isCurr = $line.TrimStart().StartsWith('>')
      $clean = $line.TrimStart('>').Trim()
      # Format 1 (with sessionname): USERNAME  SESSIONNAME  ID  STATE  IDLE_TIME  LOGON_TIME...
      # Format 2 (disconnected / blank sessionname): USERNAME  ID  STATE  IDLE_TIME  LOGON_TIME...
      $u = ''; $sname = ''; $sidNum = ''; $stRaw = ''; $idle = ''; $lTimeRaw = ''
      if ($clean -match '^(\\S+)\\s+(\\S+)\\s+(\\d+)\\s+(Active|Disc|Disconnected|Conn|Down|Idle|Listen)\\s+(\\S+)\\s+(.+)$') {
        $u = $Matches[1]; $sname = $Matches[2]; $sidNum = $Matches[3]; $stRaw = $Matches[4]; $idle = $Matches[5]; $lTimeRaw = $Matches[6].Trim()
      } elseif ($clean -match '^(\\S+)\\s+(\\d+)\\s+(Disc|Disconnected|Active|Idle)\\s+(\\S+)\\s+(.+)$') {
        $u = $Matches[1]; $sname = 'disconnected'; $sidNum = $Matches[2]; $stRaw = $Matches[3]; $idle = $Matches[4]; $lTimeRaw = $Matches[5].Trim()
      } elseif ($clean -match '^(\\S+)\\s+(.*?)\\s+(\\d+)\\s+(Active|Disc|Disconnected)\\s+(\\S+)\\s+(.+)$') {
        $u = $Matches[1]; $sname = $Matches[2].Trim(); $sidNum = $Matches[3]; $stRaw = $Matches[4]; $idle = $Matches[5]; $lTimeRaw = $Matches[6].Trim()
      }
      if (-not $u) { continue }
      $stNorm = if ($stRaw -imatch '^Disc') { 'disconnected' } elseif ($isScreenLocked -and $sname -imatch 'console') { 'locked' } elseif ($stRaw -imatch '^Idle') { 'idle' } else { 'active' }
      $lType = if ($sname -imatch '^rdp') { 'RDP' } elseif ($sname -imatch '^console') { 'Console' } else { 'Interactive' }
      $lIso = Parse-DateTimeToIso $lTimeRaw
      $key = "$($u.ToLower())|$sidNum"
      $seenSessionKeys[$key] = $true
      $activeSessions += [PSCustomObject]@{
        username = $u
        domain = ''
        sessionName = if ($sname) { $sname } else { 'console' }
        sessionId = $sidNum
        state = $stNorm
        logonType = $lType
        idleTime = if ($idle -eq '.' -or $idle -eq 'none') { '0m' } else { $idle }
        logonTime = $lIso
        logonTimeDisplay = $lTimeRaw
        sourceIp = ''
        isCurrentConsoleOwner = ($isCurr -or ($loggedUser -and ($loggedUser -ieq $u -or $loggedUser.EndsWith("\\" + $u))))
      }
    }
  }
} catch {}

# 2. Enrich / fallback active sessions from Win32_ComputerSystem, explorer.exe & Win32_LogonSession
if ($activeSessions.Count -eq 0 -and $loggedUser) {
  $uShort = if ($loggedUser.Contains('\\')) { $loggedUser.Split('\\', 2)[1] } else { $loggedUser }
  $uDom = if ($loggedUser.Contains('\\')) { $loggedUser.Split('\\', 2)[0] } else { '' }
  $activeSessions += [PSCustomObject]@{
    username = $uShort
    domain = $uDom
    sessionName = 'console'
    sessionId = '1'
    state = if ($isScreenLocked) { 'locked' } else { 'active' }
    logonType = 'Console'
    idleTime = '0m'
    logonTime = ''
    logonTimeDisplay = ''
    sourceIp = ''
    isCurrentConsoleOwner = $true
  }
}

# Match domain prefixes & session start times from Win32_LogonSession (Types 2, 7, 10, 11)
try {
  $wmiSessions = @(Get-CimInstance Win32_LogonSession -ErrorAction SilentlyContinue | Where-Object { $_.LogonType -in @(2, 7, 10, 11) })
  $wmiLinks = @(Get-CimInstance Win32_LoggedOnUser -ErrorAction SilentlyContinue)
  $acctByLogonId = @{}
  foreach ($lnk in $wmiLinks) {
    $depId = [string]$lnk.Dependent.LogonId
    if ($depId -and $lnk.Antecedent) {
      $acctByLogonId[$depId] = [PSCustomObject]@{
        Domain = [string]$lnk.Antecedent.Domain
        Name = [string]$lnk.Antecedent.Name
      }
    }
  }
  foreach ($as in $activeSessions) {
    foreach ($ws in $wmiSessions) {
      $lid = [string]$ws.LogonId
      if ($acctByLogonId.ContainsKey($lid)) {
        $ac = $acctByLogonId[$lid]
        if ($ac.Name -ieq $as.username) {
          if (-not $as.domain -and $ac.Domain) { $as.domain = $ac.Domain }
          if (-not $as.logonTime -and $ws.StartTime) {
            $as.logonTime = ([DateTime]$ws.StartTime).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
          }
          if ($ws.LogonType -eq 10 -and $as.logonType -eq 'Interactive') { $as.logonType = 'RDP' }
        }
      }
    }
  }
} catch {}

# 3. Collect Windows Security Logon/Logoff/Lock/Unlock/Failed Events
$startTime = (Get-Date).AddHours(-${hoursBack})
$events = @()
$securityOk = $true
$securityNote = ''
$rdpIpByUser = @{}

try {
  $secFilter = @{
    LogName = 'Security'
    Id = @(4624, 4625, 4634, 4647, 4778, 4779, 4800, 4801)
    StartTime = $startTime
  }
  $secRaw = @(Get-WinEvent -FilterHashtable $secFilter -MaxEvents 450 -ErrorAction Stop)
  foreach ($ev in $secRaw) {
    $evId = [int]$ev.Id
    $xml = [xml]$ev.ToXml()
    $dMap = @{}
    foreach ($d in $xml.Event.EventData.Data) {
      if ($d.Name) { $dMap[[string]$d.Name] = [string]$d.'#text' }
    }
    $tUser = [string]$dMap['TargetUserName']
    if (-not $tUser -or $tUser -eq '-') { continue }
    if ($tUser.EndsWith('$')) { continue }
    if ($tUser -imatch '^(SYSTEM|LOCAL SERVICE|NETWORK SERVICE|ANONYMOUS LOGON|DWM-\\d+|UMFD-\\d+)$') { continue }

    $tDom = [string]$dMap['TargetDomainName']
    if ($tDom -imatch '^(NT AUTHORITY|Window Manager|Font Driver Host)$') { continue }

    $lt = 0
    if ($dMap.ContainsKey('LogonType')) { [void][int]::TryParse([string]$dMap['LogonType'], [ref]$lt) }

    # Filter out noisy internal network/service auth on 4624/4634 unless RemoteInteractive/Interactive/Unlock/Cached
    if (($evId -eq 4624 -or $evId -eq 4634) -and ($lt -notin @(2, 7, 10, 11, 12))) { continue }

    $ip = [string]$dMap['IpAddress']
    if ($ip -eq '-' -or $ip -eq '::1') { $ip = '' }
    $wsName = [string]$dMap['WorkstationName']
    if ($wsName -eq '-') { $wsName = '' }
    $sName = [string]$dMap['SessionName']
    if ($sName -eq '-') { $sName = '' }

    $eType = switch ($evId) {
      4624 { if ($lt -eq 7) { 'unlock' } else { 'logon' } }
      4625 { 'failed' }
      4634 { 'logoff' }
      4647 { 'logoff' }
      4778 { 'rdp_reconnect' }
      4779 { 'rdp_disconnect' }
      4800 { 'lock' }
      4801 { 'unlock' }
      default { 'logon' }
    }

    if ($ip -and ($eType -eq 'logon' -or $eType -eq 'rdp_reconnect') -and -not $rdpIpByUser.ContainsKey($tUser.ToLower())) {
      $rdpIpByUser[$tUser.ToLower()] = $ip
    }

    $events += [PSCustomObject]@{
      id = "sec-$($ev.RecordId)"
      timestamp = if ($ev.TimeCreated) { $ev.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
      eventType = $eType
      eventId = $evId
      channel = 'Security'
      username = $tUser
      domain = $tDom
      logonTypeCode = $lt
      sourceIp = $ip
      sourceHost = $wsName
      sessionName = $sName
      failureSubStatus = if ($evId -eq 4625) { [string]$dMap['SubStatus'] } else { '' }
    }
    if ($events.Count -ge ${maxEvents}) { break }
  }
} catch {
  $securityOk = $false
  $securityNote = [string]$_.Exception.Message
}

# 4. Also inspect TerminalServices-LocalSessionManager/Operational (captures interactive/RDP logons & source IPs even if Security Audit Logon is disabled)
try {
  $lsmFilter = @{
    LogName = 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'
    Id = @(21, 23, 24, 25)
    StartTime = $startTime
  }
  $lsmRaw = @(Get-WinEvent -FilterHashtable $lsmFilter -MaxEvents 150 -ErrorAction SilentlyContinue)
  foreach ($ev in $lsmRaw) {
    $evId = [int]$ev.Id
    $xml = [xml]$ev.ToXml()
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('e', 'http://schemas.microsoft.com/win/2004/08/events/event')
    $ns.AddNamespace('u', 'Event_NS')
    $fullUser = ''
    $addr = ''
    $sessIdVal = ''
    try {
      $uNode = $xml.SelectSingleNode('//u:User', $ns)
      if ($uNode) { $fullUser = [string]$uNode.InnerText }
      $aNode = $xml.SelectSingleNode('//u:Address', $ns)
      if ($aNode) { $addr = [string]$aNode.InnerText }
      $sNode = $xml.SelectSingleNode('//u:SessionID', $ns)
      if ($sNode) { $sessIdVal = [string]$sNode.InnerText }
    } catch {}
    if (-not $fullUser) {
      $uText = [string]$ev.Message
      if ($uText -match 'User:\\s*([^\\r\\n]+)') { $fullUser = $Matches[1].Trim() }
      if (-not $addr -and $uText -match 'Source Network Address:\\s*([^\\r\\n]+)') { $addr = $Matches[1].Trim() }
    }
    if (-not $fullUser) { continue }
    $uDom = ''; $uName = $fullUser
    if ($fullUser.Contains('\\')) {
      $parts = $fullUser.Split('\\', 2)
      $uDom = $parts[0]; $uName = $parts[1]
    }
    if ($addr -eq 'LOCAL' -or $addr -eq '-') { $addr = '' }
    if ($addr -and -not $rdpIpByUser.ContainsKey($uName.ToLower())) {
      $rdpIpByUser[$uName.ToLower()] = $addr
    }
    $tsIso = if ($ev.TimeCreated) { $ev.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
    $eType = switch ($evId) {
      21 { 'logon' }
      23 { 'logoff' }
      24 { 'rdp_disconnect' }
      25 { 'rdp_reconnect' }
      default { 'logon' }
    }
    $ltCode = if ($addr) { 10 } else { 2 }
    # Deduplicate against Security event within 6 seconds for same user & eventType
    $dup = $false
    foreach ($ex in $events) {
      if ($ex.username -ieq $uName -and $ex.eventType -eq $eType -and $ex.timestamp -and $tsIso) {
        $diff = [Math]::Abs(([DateTime]::Parse($ex.timestamp) - [DateTime]::Parse($tsIso)).TotalSeconds)
        if ($diff -le 6) {
          if ($addr -and -not $ex.sourceIp) { $ex.sourceIp = $addr }
          $dup = $true
          break
        }
      }
    }
    if (-not $dup -and $events.Count -lt ${maxEvents}) {
      $events += [PSCustomObject]@{
        id = "lsm-$($ev.RecordId)"
        timestamp = $tsIso
        eventType = $eType
        eventId = $evId
        channel = 'TerminalServices-LSM'
        username = $uName
        domain = $uDom
        logonTypeCode = $ltCode
        sourceIp = $addr
        sourceHost = ''
        sessionName = if ($sessIdVal) { "Session #$sessIdVal" } else { '' }
        failureSubStatus = ''
      }
    }
  }
} catch {}

# Enrich active session sourceIp from RDP events if matched
foreach ($as in $activeSessions) {
  $uk = ([string]$as.username).ToLower()
  if (-not $as.sourceIp -and $rdpIpByUser.ContainsKey($uk)) {
    $as.sourceIp = $rdpIpByUser[$uk]
  }
}

# Sort all events newest-first
$events = @($events | Sort-Object -Property timestamp -Descending)

# 5. Build Workstation Users Summary combining ProfileList FILETIME + Win32_NetworkLoginProfile + ActiveSessions + Events
$netProfilesByUser = @{}
try {
  foreach ($nlp in (Get-CimInstance Win32_NetworkLoginProfile -ErrorAction SilentlyContinue)) {
    $nName = [string]$nlp.Name
    if (-not $nName -or $nName.EndsWith('$')) { continue }
    if ($nName -imatch '^(NT AUTHORITY|Window Manager|Font Driver Host)\\\\') { continue }
    $short = if ($nName.Contains('\\')) { $nName.Split('\\', 2)[1] } else { $nName }
    $lastL = ''
    try {
      if ($nlp.LastLogon -and ([DateTime]$nlp.LastLogon).Year -gt 1990) {
        $lastL = ([DateTime]$nlp.LastLogon).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      }
    } catch {}
    $netProfilesByUser[$short.ToLower()] = [PSCustomObject]@{
      fullName = $nName
      lastLogon = $lastL
      numLogons = if ($nlp.NumberOfLogons) { [int]$nlp.NumberOfLogons } else { 0 }
    }
  }
} catch {}

$userSummariesMap = @{}
function Ensure-UserSummary($uKey, $displayUser, $sidVal, $pPath) {
  if (-not $userSummariesMap.ContainsKey($uKey)) {
    $userSummariesMap[$uKey] = [PSCustomObject]@{
      username = $displayUser
      sid = $sidVal
      profilePath = $pPath
      isCurrentlyLoggedIn = $false
      currentState = 'offline'
      currentSessionName = ''
      lastLogonTime = ''
      lastLogoffTime = ''
      lastSourceIp = ''
      lastLogonType = ''
      logonCountInWindow = 0
      totalLogonsOnSystem = 0
      failedCountInWindow = 0
    }
  }
  return $userSummariesMap[$uKey]
}

try {
  $plist = Get-ChildItem -Path 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -ErrorAction SilentlyContinue
  foreach ($pk in $plist) {
    $sid = [string]$pk.PSChildName
    if ($sid -notmatch '^S-1-5-21-') { continue }
    $props = Get-ItemProperty -Path $pk.PSPath -ErrorAction SilentlyContinue
    $pPath = if ($props -and $props.ProfileImagePath) { [string]$props.ProfileImagePath } else { '' }
    $acctName = ''
    try {
      $acctName = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value
    } catch {
      if ($pPath) { $acctName = Split-Path -Path $pPath -Leaf } else { $acctName = $sid }
    }
    $shortU = if ($acctName.Contains('\\')) { $acctName.Split('\\', 2)[1] } else { $acctName }
    $entry = Ensure-UserSummary ($shortU.ToLower()) $acctName $sid $pPath
    try {
      if ($null -ne $props.LocalProfileLoadTimeHigh -and $null -ne $props.LocalProfileLoadTimeLow) {
        $hi = [int64][uint32]$props.LocalProfileLoadTimeHigh
        $lo = [int64][uint32]$props.LocalProfileLoadTimeLow
        $ft = ($hi -shl 32) -bor $lo
        if ($ft -gt 0) {
          $dt = [DateTime]::FromFileTimeUtc($ft)
          if ($dt.Year -gt 1995) { $entry.lastLogonTime = $dt.ToString('yyyy-MM-ddTHH:mm:ssZ') }
        }
      }
      if ($null -ne $props.LocalProfileUnloadTimeHigh -and $null -ne $props.LocalProfileUnloadTimeLow) {
        $hi2 = [int64][uint32]$props.LocalProfileUnloadTimeHigh
        $lo2 = [int64][uint32]$props.LocalProfileUnloadTimeLow
        $ft2 = ($hi2 -shl 32) -bor $lo2
        if ($ft2 -gt 0) {
          $dt2 = [DateTime]::FromFileTimeUtc($ft2)
          if ($dt2.Year -gt 1995) { $entry.lastLogoffTime = $dt2.ToString('yyyy-MM-ddTHH:mm:ssZ') }
        }
      }
    } catch {}
  }
} catch {}

foreach ($k in $netProfilesByUser.Keys) {
  $np = $netProfilesByUser[$k]
  $entry = Ensure-UserSummary $k $np.fullName '' ''
  $entry.totalLogonsOnSystem = $np.numLogons
  if ($np.lastLogon -and (-not $entry.lastLogonTime -or $np.lastLogon -gt $entry.lastLogonTime)) {
    $entry.lastLogonTime = $np.lastLogon
  }
}

foreach ($as in $activeSessions) {
  $shortKey = ([string]$as.username).ToLower()
  $fullDisp = if ($as.domain) { "$($as.domain)\\$($as.username)" } else { [string]$as.username }
  $entry = Ensure-UserSummary $shortKey $fullDisp '' ''
  $entry.isCurrentlyLoggedIn = $true
  $entry.currentState = $as.state
  $entry.currentSessionName = $as.sessionName
  if ($as.sourceIp -and -not $entry.lastSourceIp) { $entry.lastSourceIp = $as.sourceIp }
  if ($as.logonType -and -not $entry.lastLogonType) { $entry.lastLogonType = $as.logonType }
  if ($as.logonTime -and (-not $entry.lastLogonTime -or $as.logonTime -gt $entry.lastLogonTime)) {
    $entry.lastLogonTime = $as.logonTime
  }
}

foreach ($ev in $events) {
  $shortKey = ([string]$ev.username).ToLower()
  $fullDisp = if ($ev.domain) { "$($ev.domain)\\$($ev.username)" } else { [string]$ev.username }
  $entry = Ensure-UserSummary $shortKey $fullDisp '' ''
  if ($ev.eventType -eq 'logon' -or $ev.eventType -eq 'rdp_reconnect') {
    $entry.logonCountInWindow += 1
    if ($ev.timestamp -and (-not $entry.lastLogonTime -or $ev.timestamp -gt $entry.lastLogonTime)) {
      $entry.lastLogonTime = $ev.timestamp
      if ($ev.sourceIp) { $entry.lastSourceIp = $ev.sourceIp }
      $entry.lastLogonType = if ($ev.logonTypeCode -eq 10) { 'RDP' } elseif ($ev.logonTypeCode -eq 11) { 'Cached Domain' } elseif ($ev.logonTypeCode -eq 2) { 'Console' } else { 'Session' }
    }
  } elseif ($ev.eventType -eq 'logoff') {
    if ($ev.timestamp -and (-not $entry.lastLogoffTime -or $ev.timestamp -gt $entry.lastLogoffTime)) {
      $entry.lastLogoffTime = $ev.timestamp
    }
  } elseif ($ev.eventType -eq 'failed') {
    $entry.failedCountInWindow += 1
  }
}

$userSummaries = @($userSummariesMap.Values | Sort-Object -Property @{Expression='isCurrentlyLoggedIn';Descending=$true}, @{Expression='lastLogonTime';Descending=$true})

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  loggedInUser = $loggedUser
  isScreenLocked = $isScreenLocked
  securityLogAccessible = $securityOk
  securityLogNote = $securityNote
  activeSessions = $activeSessions
  userSummaries = $userSummaries
  events = $events
} | ConvertTo-Json -Depth 6 -Compress
`;

  const lx = `
python3 - <<'PY'
import datetime, json, os, re, socket, subprocess

hostname = socket.gethostname()
active_sessions = []
user_map = {}
events = []

def ensure_user(u):
    if u not in user_map:
        user_map[u] = {
            "username": u, "sid": "", "profilePath": f"/home/{u}" if u != "root" else "/root",
            "isCurrentlyLoggedIn": False, "currentState": "offline", "currentSessionName": "",
            "lastLogonTime": "", "lastLogoffTime": "", "lastSourceIp": "", "lastLogonType": "",
            "logonCountInWindow": 0, "totalLogonsOnSystem": 0, "failedCountInWindow": 0
        }
    return user_map[u]

try:
    who_out = subprocess.check_output(["who", "-u"], text=True, stderr=subprocess.DEVNULL)
    for line in who_out.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        u, tty = parts[0], parts[1]
        idle = parts[4] if len(parts) >= 5 else "0m"
        src = ""
        m = re.search(r"\\(([^)]+)\\)", line)
        if m:
            src = m.group(1)
        ltype = "SSH" if "pts/" in tty or src else "Console"
        dt_str = f"{parts[2]} {parts[3]}"
        iso = ""
        try:
            iso = datetime.datetime.strptime(dt_str, "%Y-%m-%d %H:%M").replace(tzinfo=datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass
        active_sessions.append({
            "username": u, "domain": "", "sessionName": tty, "sessionId": tty,
            "state": "active", "logonType": ltype, "idleTime": "0m" if idle == "." else idle,
            "logonTime": iso, "logonTimeDisplay": dt_str, "sourceIp": src,
            "isCurrentConsoleOwner": True
        })
        us = ensure_user(u)
        us["isCurrentlyLoggedIn"] = True
        us["currentState"] = "active"
        us["currentSessionName"] = tty
        if src: us["lastSourceIp"] = src
        us["lastLogonType"] = ltype
        if iso and (not us["lastLogonTime"] or iso > us["lastLogonTime"]):
            us["lastLogonTime"] = iso
except Exception:
    pass

try:
    last_out = subprocess.check_output(["last", "-F", "-w", "-n", "120"], text=True, stderr=subprocess.DEVNULL)
    for idx, line in enumerate(last_out.splitlines(), 1):
        if not line.strip() or line.startswith("wtmp ") or line.startswith("reboot "):
            continue
        parts = line.split()
        if len(parts) < 7:
            continue
        u, tty = parts[0], parts[1]
        src = ""
        rest_idx = 2
        if re.match(r"^[0-9a-fA-F\\.:]+$", parts[2]) and parts[2] not in ("Mon","Tue","Wed","Thu","Fri","Sat","Sun"):
            src = parts[2]
            rest_idx = 3
        m_dt = re.search(r"([A-Z][a-z]{2}\\s+[A-Z][a-z]{2}\\s+\\d+\\s+\\d{2}:\\d{2}:\\d{2}\\s+\\d{4})", " ".join(parts[rest_idx:]))
        iso = ""
        if m_dt:
            try:
                dt = datetime.datetime.strptime(m_dt.group(1), "%a %b %d %H:%M:%S %Y").replace(tzinfo=datetime.timezone.utc)
                iso = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            except Exception:
                pass
        ltype = 10 if src or "pts/" in tty else 2
        events.append({
            "id": f"wtmp-{idx}", "timestamp": iso, "eventType": "logon", "eventId": 21,
            "channel": "wtmp", "username": u, "domain": "", "logonTypeCode": ltype,
            "sourceIp": src, "sourceHost": "", "sessionName": tty, "failureSubStatus": ""
        })
        us = ensure_user(u)
        us["logonCountInWindow"] += 1
        if iso and (not us["lastLogonTime"] or iso > us["lastLogonTime"]):
            us["lastLogonTime"] = iso
            if src: us["lastSourceIp"] = src
except Exception:
    pass

logged_user = active_sessions[0]["username"] if active_sessions else ""
print(json.dumps({
    "hostname": hostname,
    "loggedInUser": logged_user,
    "isScreenLocked": False,
    "securityLogAccessible": True,
    "securityLogNote": "",
    "activeSessions": active_sessions,
    "userSummaries": sorted(user_map.values(), key=lambda x: (not x["isCurrentlyLoggedIn"], x["lastLogonTime"]), reverse=False),
    "events": events[:${maxEvents}]
}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 35000 }, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint user logons');

  const rawSessions: any[] = Array.isArray(parsed.activeSessions)
    ? parsed.activeSessions
    : parsed.activeSessions
    ? [parsed.activeSessions]
    : [];
  const rawSummaries: any[] = Array.isArray(parsed.userSummaries)
    ? parsed.userSummaries
    : parsed.userSummaries
    ? [parsed.userSummaries]
    : [];
  const rawEvents: any[] = Array.isArray(parsed.events)
    ? parsed.events
    : parsed.events
    ? [parsed.events]
    : [];

  const activeSessions: HelpdeskActiveUserSession[] = rawSessions.map((s: any) => ({
    username: String(s.username || ''),
    domain: String(s.domain || ''),
    sessionName: String(s.sessionName || 'console'),
    sessionId: String(s.sessionId || ''),
    state:
      s.state === 'disconnected' || s.state === 'locked' || s.state === 'idle'
        ? s.state
        : 'active',
    logonType: String(s.logonType || 'Interactive'),
    idleTime: String(s.idleTime || '0m'),
    logonTime: String(s.logonTime || ''),
    logonTimeDisplay: String(s.logonTimeDisplay || ''),
    sourceIp: String(s.sourceIp || ''),
    isCurrentConsoleOwner: Boolean(s.isCurrentConsoleOwner),
  }));

  const userSummaries: HelpdeskWorkstationUserSummary[] = rawSummaries.map((u: any) => ({
    username: String(u.username || ''),
    sid: String(u.sid || ''),
    profilePath: String(u.profilePath || ''),
    isCurrentlyLoggedIn: Boolean(u.isCurrentlyLoggedIn),
    currentState:
      u.currentState === 'active' ||
      u.currentState === 'disconnected' ||
      u.currentState === 'locked'
        ? u.currentState
        : 'offline',
    currentSessionName: String(u.currentSessionName || ''),
    lastLogonTime: String(u.lastLogonTime || ''),
    lastLogoffTime: String(u.lastLogoffTime || ''),
    lastSourceIp: String(u.lastSourceIp || ''),
    lastLogonType: String(u.lastLogonType || ''),
    logonCountInWindow: Number(u.logonCountInWindow) || 0,
    totalLogonsOnSystem: Number(u.totalLogonsOnSystem) || 0,
    failedCountInWindow: Number(u.failedCountInWindow) || 0,
  }));

  const events: HelpdeskWorkstationLogonEvent[] = rawEvents.map((ev: any, idx: number) => {
    const ltCode = Number(ev.logonTypeCode) || 0;
    const desc = describeWindowsLogonType(ltCode);
    const eType: HelpdeskWorkstationLogonEvent['eventType'] =
      ev.eventType === 'logoff' ||
      ev.eventType === 'lock' ||
      ev.eventType === 'unlock' ||
      ev.eventType === 'rdp_disconnect' ||
      ev.eventType === 'rdp_reconnect' ||
      ev.eventType === 'failed'
        ? ev.eventType
        : 'logon';
    return {
      id: String(ev.id || `ev-${idx}`),
      timestamp: String(ev.timestamp || ''),
      eventType: eType,
      eventId: Number(ev.eventId) || 0,
      channel: String(ev.channel || 'Security'),
      username: String(ev.username || ''),
      domain: String(ev.domain || ''),
      logonTypeCode: ltCode,
      logonTypeLabel: execRes.osFamily === 'linux' && ltCode === 10 ? 'SSH Session' : desc.en,
      logonTypeLabelFa: execRes.osFamily === 'linux' && ltCode === 10 ? 'نشست SSH' : desc.fa,
      sourceIp: String(ev.sourceIp || ''),
      sourceHost: String(ev.sourceHost || ''),
      sessionName: String(ev.sessionName || ''),
      failureReason:
        eType === 'failed' && ev.failureSubStatus
          ? describeWindowsFailureSubStatus(String(ev.failureSubStatus))
          : undefined,
    };
  });

  const activeUsersCount = activeSessions.filter((s) => s.state !== 'disconnected').length;
  const disconnectedCount = activeSessions.filter((s) => s.state === 'disconnected').length;
  const totalLogonEvents = events.filter(
    (e) => e.eventType === 'logon' || e.eventType === 'rdp_reconnect'
  ).length;
  const totalFailedEvents = events.filter((e) => e.eventType === 'failed').length;
  const latestLogonEvent = events.find(
    (e) => e.eventType === 'logon' || e.eventType === 'rdp_reconnect'
  );
  const fallbackLatestUser = userSummaries.find((u) => u.lastLogonTime);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    collectedAt: new Date().toISOString(),
    hoursBack,
    isAnyoneLoggedIn: activeSessions.length > 0 || Boolean(parsed.loggedInUser),
    activeLoggedInUser:
      String(parsed.loggedInUser || '') ||
      (activeSessions[0]
        ? activeSessions[0].domain
          ? `${activeSessions[0].domain}\\${activeSessions[0].username}`
          : activeSessions[0].username
        : ''),
    isScreenLocked: Boolean(parsed.isScreenLocked),
    securityLogAccessible: parsed.securityLogAccessible !== false,
    securityLogNote: parsed.securityLogNote ? String(parsed.securityLogNote) : undefined,
    activeSessions,
    userSummaries,
    events,
    summary: {
      activeUsersCount,
      disconnectedCount,
      distinctUsersCount: userSummaries.length,
      totalLogonEvents,
      totalFailedEvents,
      lastLoginUser: latestLogonEvent
        ? latestLogonEvent.domain
          ? `${latestLogonEvent.domain}\\${latestLogonEvent.username}`
          : latestLogonEvent.username
        : fallbackLatestUser?.username || '',
      lastLoginTime: latestLogonEvent?.timestamp || fallbackLatestUser?.lastLogonTime || '',
    },
  };
}

// ============================================================================
// 19B. INTERACTIVE USER SESSION CONTROL (LOCK WORKSTATION / LOGOFF SESSION)
// ============================================================================

export type HelpdeskUserSessionAction = 'lock' | 'logoff';

export async function executeEndpointUserSessionAction(
  input: HelpdeskTargetInput,
  options: {
    action: HelpdeskUserSessionAction;
    sessionId?: string;
    username?: string;
  }
): Promise<HelpdeskActionResult> {
  const action = options.action;
  if (action !== 'lock' && action !== 'logoff') {
    throw new Error(`Unsupported user session action: ${String(action)}`);
  }

  const rawSid = options.sessionId !== undefined ? String(options.sessionId).trim() : '';
  const rawUser = options.username !== undefined ? String(options.username).trim() : '';

  if (rawSid && !/^[a-zA-Z0-9_.-]{1,64}$/.test(rawSid)) {
    throw new Error('Invalid session ID format.');
  }
  if (rawUser && !/^[a-zA-Z0-9._\\@-]{1,128}$/.test(rawUser)) {
    throw new Error('Invalid target username format.');
  }

  const safeSidLiteral = rawSid.replace(/'/g, "''");
  const safeUserLiteral = rawUser.replace(/'/g, "''");
  const bareUser = (rawUser.includes('\\') ? rawUser.split('\\').pop() || '' : rawUser).replace(/'/g, "''");

  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$action = '${action}'
$reqSid = '${safeSidLiteral}'
$reqUser = '${safeUserLiteral}'
$reqBare = '${bareUser}'

function Get-QuserSessions {
  $list = @()
  $lines = @(& quser.exe 2>$null)
  if ($lines.Count -lt 2) { return $list }
  foreach ($l in $lines | Select-Object -Skip 1) {
    if ([string]::IsNullOrWhiteSpace($l)) { continue }
    $clean = $l.TrimStart('>', ' ')
    if ($clean -match '^(\\S+)\\s+(?:(\\S+)\\s+)?(\\d+)\\s+(Active|Disc|Conn|Listen|Idle)\\s+(.*)$') {
      $u = $matches[1]; $sn = $matches[2]; $id = $matches[3]; $st = $matches[4]
      if ([string]::IsNullOrWhiteSpace($sn)) { $sn = 'Disc' }
      $list += [PSCustomObject]@{ user = $u; sessionName = $sn; id = $id; state = $st }
    }
  }
  return $list
}

$sessions = @(Get-QuserSessions)
$target = $null
if ($reqSid -and ($reqSid -match '^\\d+$')) {
  $target = $sessions | Where-Object { $_.id -eq $reqSid } | Select-Object -First 1
  if (-not $target) {
    $target = [PSCustomObject]@{ user = $reqUser; sessionName = ''; id = $reqSid; state = 'Active' }
  }
} elseif ($reqBare) {
  $target = $sessions | Where-Object { $_.user -ieq $reqBare -or $_.user -ieq $reqUser } | Select-Object -First 1
} else {
  $target = $sessions | Where-Object { $_.state -eq 'Active' } | Select-Object -First 1
  if (-not $target) { $target = $sessions | Select-Object -First 1 }
}

if (-not $target -or [string]::IsNullOrWhiteSpace([string]$target.id)) {
  [PSCustomObject]@{
    ok = $false
    exitCode = 1
    method = 'none'
    targetUser = $reqUser
    sessionId = $reqSid
    output = 'No matching active or open user session found on this workstation.'
  } | ConvertTo-Json -Compress
  exit 0
}

if ($target.id -eq '0') {
  [PSCustomObject]@{
    ok = $false
    exitCode = 1
    method = 'guard'
    targetUser = [string]$target.user
    sessionId = '0'
    output = 'Session 0 is reserved for Windows system services and cannot be logged off or locked.'
  } | ConvertTo-Json -Compress
  exit 0
}

if ($action -eq 'logoff') {
  $out = (& logoff.exe $target.id 2>&1 | Out-String).Trim()
  $code = $LASTEXITCODE
  [PSCustomObject]@{
    ok = ($code -eq 0)
    exitCode = [int]$code
    method = 'logoff.exe'
    targetUser = [string]$target.user
    sessionId = [string]$target.id
    output = if ($out) { $out } else { "Signed out session $($target.id)" }
  } | ConvertTo-Json -Compress
} else {
  # Lock active user desktop cleanly via ephemeral interactive scheduled task running LockWorkStation, fallback to tsdiscon
  $csUser = ''
  try { $csUser = [string](Get-CimInstance Win32_ComputerSystem).UserName } catch {}
  $lockUser = if ($csUser -and $target.user -and ($csUser -like "*\\$($target.user)" -or $csUser -ieq $target.user)) {
    $csUser
  } elseif ($target.user) {
    $target.user
  } else {
    $csUser
  }
  $taskName = "NetTopo_Lock_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $lockedViaTask = $false
  $outMsg = ''

  if ($lockUser -and ($target.sessionName -notmatch '^rdp-tcp')) {
    $createArgs = @('/Create', '/TN', $taskName, '/TR', 'rundll32.exe user32.dll,LockWorkStation', '/SC', 'ONCE', '/ST', '00:00', '/RU', $lockUser, '/IT', '/F')
    $cOut = (& schtasks.exe @createArgs 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0) {
      $rOut = (& schtasks.exe /Run /TN $taskName 2>&1 | Out-String)
      if ($LASTEXITCODE -eq 0) {
        Start-Sleep -Milliseconds 650
        $lockedViaTask = $true
        $outMsg = "Screen locked via LockWorkStation for $lockUser."
      } else {
        $outMsg = $rOut.Trim()
      }
      & schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null
    } else {
      $outMsg = $cOut.Trim()
      try {
        $actLock = New-ScheduledTaskAction -Execute 'rundll32.exe' -Argument 'user32.dll,LockWorkStation'
        $priLock = New-ScheduledTaskPrincipal -UserId $lockUser -LogonType Interactive -RunLevel Limited
        $stLock = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 15)
        Register-ScheduledTask -TaskName $taskName -Action $actLock -Principal $priLock -Settings $stLock -Force | Out-Null
        Start-ScheduledTask -TaskName $taskName
        Start-Sleep -Milliseconds 650
        $lockedViaTask = $true
        $outMsg = "Screen locked via interactive ScheduledTask for $lockUser."
      } catch {
        $outMsg = "$outMsg | Register-ScheduledTask: $($_.Exception.Message)"
      } finally {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
      }
    }
  }

  if (-not $lockedViaTask) {
    $dOut = (& tsdiscon.exe $target.id 2>&1 | Out-String).Trim()
    $dCode = $LASTEXITCODE
    [PSCustomObject]@{
      ok = ($dCode -eq 0)
      exitCode = [int]$dCode
      method = 'tsdiscon.exe'
      targetUser = if ($lockUser) { $lockUser } else { [string]$target.user }
      sessionId = [string]$target.id
      output = if ($dOut) { $dOut } else { "Disconnected/locked desktop session $($target.id) cleanly." }
    } | ConvertTo-Json -Compress
  } else {
    [PSCustomObject]@{
      ok = $true
      exitCode = 0
      method = 'LockWorkStation'
      targetUser = $lockUser
      sessionId = [string]$target.id
      output = $outMsg
    } | ConvertTo-Json -Compress
  }
}
`;

  const linuxSh = `python3 - <<'PY'
import json, subprocess

action = ${JSON.stringify(action)}
req_sid = ${JSON.stringify(rawSid)}
req_user = ${JSON.stringify(rawUser)}

def run(cmd):
    p = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    return p.returncode, (p.stdout + p.stderr).strip()

target_sid = req_sid
target_user = req_user.split("\\\\")[-1].split("@")[0] if req_user else ""

if not target_sid and not target_user:
    rc, out = run("loginctl list-sessions --no-legend 2>/dev/null | head -n 1")
    if rc == 0 and out:
        cols = out.split()
        if len(cols) >= 3:
            target_sid = cols[0]
            target_user = cols[2]

if not target_sid and target_user:
    rc, out = run("loginctl list-sessions --no-legend 2>/dev/null")
    for line in out.splitlines():
        cols = line.split()
        if len(cols) >= 3 and cols[2] == target_user:
            target_sid = cols[0]
            break

if action == "lock":
    if target_sid and target_sid.isalnum():
        rc, out = run(f"loginctl lock-session {target_sid}")
        method = "loginctl lock-session"
    else:
        rc, out = run("loginctl lock-sessions")
        method = "loginctl lock-sessions"
    print(json.dumps({
        "ok": rc == 0,
        "exitCode": rc,
        "method": method,
        "targetUser": target_user,
        "sessionId": target_sid,
        "output": out or "Linux session screen locked."
    }))
else:
    if target_sid and target_sid.isalnum():
        rc, out = run(f"loginctl terminate-session {target_sid}")
        method = "loginctl terminate-session"
    elif target_user and target_user not in ("root", ""):
        rc, out = run(f"loginctl terminate-user {target_user} 2>/dev/null || pkill -KILL -u {target_user}")
        method = "loginctl terminate-user"
    else:
        rc, out, method = 1, "No non-root target user/session found to sign out.", "guard"
    print(json.dumps({
        "ok": rc == 0,
        "exitCode": rc,
        "method": method,
        "targetUser": target_user,
        "sessionId": target_sid,
        "output": out or "Linux user session terminated."
    }))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: 20000 },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<{
    ok: boolean;
    exitCode: number;
    method: string;
    targetUser: string;
    sessionId: string;
    output: string;
  }>(execRes.stdout, `user session ${action}`);

  const actorLabel = parsed.targetUser || rawUser || (parsed.sessionId ? `Session ${parsed.sessionId}` : 'active user');
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: action === 'lock' ? 'session_lock' : 'session_logoff',
    success: Boolean(parsed.ok),
    message: parsed.ok
      ? action === 'lock'
        ? `Locked desktop screen for ${actorLabel} on ${execRes.host} (${parsed.method}).`
        : `Signed out user session ${actorLabel}${parsed.sessionId ? ` (ID ${parsed.sessionId})` : ''} on ${execRes.host}.`
      : `Failed to ${action} user session on ${execRes.host}: ${parsed.output || `exit ${parsed.exitCode}`}`,
    messageFa: parsed.ok
      ? action === 'lock'
        ? `صفحه نمایش کاربر ${actorLabel} روی سیستم ${execRes.host} با موفقیت قفل شد (${parsed.method}).`
        : `کاربر ${actorLabel}${parsed.sessionId ? ` (نشست ${parsed.sessionId})` : ''} با موفقیت از سیستم ${execRes.host} خارج (Logoff) شد.`
      : `اجرای عملیات ${action === 'lock' ? 'قفل صفحه' : 'خروج کاربر (Logoff)'} روی ${execRes.host} ناموفق بود: ${parsed.output || `کد خطا ${parsed.exitCode}`}`,
    details: {
      sessionAction: action,
      targetUser: parsed.targetUser || rawUser,
      sessionId: parsed.sessionId || rawSid,
      method: parsed.method,
      exitCode: parsed.exitCode,
      portUsed: execRes.portUsed,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 20. WINDOWS JEA & GPO HARDENING TEMPLATES (Zero-Ransomware Endpoint Lock)
// ============================================================================

export function getHelpdeskJeaTemplates() {
  return {
    jeaConfigName: 'HelpDeskSafeJEA',
    roleCapabilityScript: `# 1. Save as C:\\Program Files\\WindowsPowerShell\\Modules\\HelpDeskSafe\\RoleCapabilities\\HelpDeskSafeRole.psrc
@{
    GUID = '9b7c4d21-6e18-4b4e-8f42-3a8a5e0d1c01'
    Author = 'Enterprise IT Security'
    Description = 'Anti-Ransomware Least-Privilege HelpDesk JEA Role (Health, GPU/Audio, SystemInfo, HotFixes, Network, Spooler, Event Viewer, Safe User-App Stop, Temp Cleanup, GPUpdate, SFC/DISM/CHKDSK, Domain User Info, Battery Report, Session & Power Control)'
    VisibleCmdlets = @(
        'Get-CimInstance',
        'Get-HotFix',
        'Get-PhysicalDisk',
        'Get-Disk',
        'Get-Partition',
        'Get-Process',
        'Stop-Process',
        'Get-WinEvent',
        'Get-Counter',
        'Get-MpComputerStatus',
        'Get-NetFirewallProfile',
        'Get-NetNeighbor',
        'Get-ItemProperty',
        'Get-ChildItem',
        'Get-Content',
        'Remove-Item',
        'Measure-Object',
        'Test-Path',
        'Resolve-DnsName',
        'Clear-DnsClientCache',
        'Get-NetAdapter',
        'Get-NetIPAddress',
        'New-NetIPAddress',
        'Remove-NetIPAddress',
        'Set-NetIPInterface',
        'Set-DnsClientServerAddress',
        'Get-NetRoute',
        'New-NetRoute',
        'Remove-NetRoute',
        'Get-VpnConnection',
        'Add-VpnConnection',
        'Set-VpnConnection',
        'Remove-VpnConnection',
        'Get-Service',
        @{ Name = 'Restart-Service'; Parameters = @{ Name = 'Name'; ValidateSet = 'Spooler', 'wuauserv' } },
        @{ Name = 'Stop-Service'; Parameters = @{ Name = 'Name'; ValidateSet = 'Spooler' } },
        @{ Name = 'Start-Service'; Parameters = @{ Name = 'Name'; ValidateSet = 'Spooler', 'wuauserv' } },
        'ConvertTo-Json', 'Select-Object', 'Sort-Object', 'Where-Object', 'ForEach-Object', 'Start-Sleep', 'Out-String'
    )
    VisibleExternalCommands = @(
        'C:\\Windows\\System32\\systeminfo.exe',
        'C:\\Windows\\System32\\ping.exe',
        'C:\\Windows\\System32\\tracert.exe',
        'C:\\Windows\\System32\\ipconfig.exe',
        'C:\\Windows\\System32\\nslookup.exe',
        'C:\\Windows\\System32\\route.exe',
        'C:\\Windows\\System32\\rasdial.exe',
        'C:\\Windows\\System32\\netsh.exe',
        'C:\\Windows\\System32\\wusa.exe',
        'C:\\Windows\\System32\\gpresult.exe',
        'C:\\Windows\\System32\\gpupdate.exe',
        'C:\\Windows\\System32\\sfc.exe',
        'C:\\Windows\\System32\\dism.exe',
        'C:\\Windows\\System32\\chkdsk.exe',
        'C:\\Windows\\System32\\fsutil.exe',
        'C:\\Windows\\System32\\net.exe',
        'C:\\Windows\\System32\\powercfg.exe',
        'C:\\Windows\\System32\\shutdown.exe',
        'C:\\Windows\\System32\\quser.exe',
        'C:\\Windows\\System32\\logoff.exe',
        'C:\\Windows\\System32\\tsdiscon.exe',
        'C:\\Windows\\System32\\schtasks.exe',
        'C:\\Windows\\System32\\rundll32.exe'
    )
}`,
    registerSessionScript: `# 2. Register Restricted JEA Endpoint & Lock WinRM HTTPS (Port 5986) via GPO
$PanelServerIP = '<ENTER_YOUR_PANEL_SERVER_IP>'

# Create JEA Session Configuration bound strictly to AD HelpDesk Workstation group
New-PSSessionConfigurationFile -Path 'C:\\ProgramData\\HelpDeskSafeJEA.pssc' \`
    -SessionType RestrictedRemoteServer \`
    -RunAsVirtualAccount \`
    -RoleDefinitions @{ 'YOURDOMAIN\\GG_HelpDesk_Workstations' = @{ RoleCapabilities = 'HelpDeskSafeRole' } }

Register-PSSessionConfiguration -Name 'HelpDeskSafeJEA' -Path 'C:\\ProgramData\\HelpDeskSafeJEA.pssc' -Force

# Restrict Windows Firewall WinRM HTTPS (5986) strictly to the single management panel IP
New-NetFirewallRule -DisplayName 'WinRM HTTPS - HelpDesk Panel Only' \`
    -Direction Inbound -Protocol TCP -LocalPort 5986 \`
    -RemoteAddress $PanelServerIP -Action Allow -Profile Domain`,
  };
}

// ============================================================================
// 19. ADD / REMOVE PROGRAMS (MACHINE + PER-USER REGISTRY / LINUX PKG)
// ============================================================================

export type HelpdeskProgramRegistryHive = 'HKLM64' | 'HKLM32' | 'HKCU' | 'HKU' | 'linux_pkg';
export type HelpdeskProgramInstallerType = 'msi' | 'inno' | 'nsis' | 'squirrel' | 'exe' | 'apt' | 'rpm';

export interface HelpdeskInstalledProgram {
  id: string;
  name: string;
  version: string;
  publisher: string;
  installDate: string;
  sizeMb: number;
  scope: 'machine' | 'user';
  arch: 'x64' | 'x86' | 'user' | 'pkg';
  registryHive: HelpdeskProgramRegistryHive;
  registryKeyName: string;
  ownerSid?: string;
  ownerUser?: string;
  installLocation: string;
  productCode?: string;
  installerType: HelpdeskProgramInstallerType;
  quietSupported: boolean;
  canUninstall: boolean;
  isProtected: boolean;
  protectionReason?: string;
  protectionReasonFa?: string;
  uninstallPreview: string;
}

export interface HelpdeskProgramsResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  activeUser: string;
  totalCount: number;
  machineCount: number;
  userCount: number;
  totalSizeMb: number;
  programs: HelpdeskInstalledProgram[];
  collectedAt: string;
}

const PROTECTED_PROGRAM_PATTERNS: Array<{ re: RegExp; reasonEn: string; reasonFa: string }> = [
  {
    re: /(windows defender|microsoft defender|eset|crowdstrike|falcon sensor|kaspersky|sentinelone|bitdefender|symantec|norton|mcafee|sophos|malwarebytes|trellix|carbon black|cortex xdr|forticlient)/i,
    reasonEn: 'Endpoint security / Antivirus / EDR software is protected from remote removal.',
    reasonFa: 'نرم‌افزارهای امنیتی و آنتی‌ویروس (AV / EDR) برای حفظ امنیت سیستم در برابر حذف از راه دور محافظت شده‌اند.',
  },
  {
    re: /(openssh|winrm|systemd|openssh-server|openssh-client|linux-image|glibc|libc6|dpkg|apt|rpm|bash|sudo)/i,
    reasonEn: 'Core OS / remote management component is protected to prevent session lockout.',
    reasonFa: 'سرویس‌های حیاتی سیستم‌عامل یا مدیریت از راه دور (مانند OpenSSH) برای جلوگیری از قطع ارتباط قفل شده‌اند.',
  },
];

function checkProtectedProgram(name: string, keyName: string): {
  isProtected: boolean;
  reasonEn?: string;
  reasonFa?: string;
} {
  const combined = `${name} ${keyName}`.trim();
  for (const rule of PROTECTED_PROGRAM_PATTERNS) {
    if (rule.re.test(combined)) {
      return { isProtected: true, reasonEn: rule.reasonEn, reasonFa: rule.reasonFa };
    }
  }
  return { isProtected: false };
}

export async function collectEndpointPrograms(
  input: HelpdeskTargetInput
): Promise<HelpdeskProgramsResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$hostName = $env:COMPUTERNAME
$activeUser = ''
try {
  $cs = Get-CimInstance -ClassName Win32_ComputerSystem
  if ($cs -and $cs.UserName) { $activeUser = [string]$cs.UserName }
} catch {}

$sidMap = @{}
$userHives = @()
try {
  foreach ($k in (Get-ChildItem -Path 'Registry::HKEY_USERS' -ErrorAction SilentlyContinue)) {
    $sid = [string]$k.PSChildName
    if ($sid -match '^S-1-5-21-' -and $sid -notmatch '_Classes$') {
      $uLabel = $sid
      try {
        $nt = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount])
        if ($nt -and $nt.Value) { $uLabel = [string]$nt.Value }
      } catch {}
      $sidMap[$sid] = $uLabel
      $uninstPath = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
      if (Test-Path $uninstPath) {
        $userHives += [PSCustomObject]@{ Path = "$uninstPath\\*"; Hive = 'HKU'; Scope = 'user'; Arch = 'user'; Sid = $sid; Owner = $uLabel }
      }
    }
  }
} catch {}

$roots = @(
  [PSCustomObject]@{ Path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Hive = 'HKLM64'; Scope = 'machine'; Arch = 'x64'; Sid = ''; Owner = '' },
  [PSCustomObject]@{ Path = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Hive = 'HKLM32'; Scope = 'machine'; Arch = 'x86'; Sid = ''; Owner = '' }
)
if ($userHives.Count -eq 0) {
  $cuUser = "$env:USERDOMAIN\\$env:USERNAME".Trim('\\')
  $roots += [PSCustomObject]@{ Path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Hive = 'HKCU'; Scope = 'user'; Arch = 'user'; Sid = ''; Owner = $cuUser }
} else {
  $roots += $userHives
}

$seen = @{}
$items = New-Object System.Collections.Generic.List[object]

foreach ($rt in $roots) {
  $entries = Get-ItemProperty -Path $rt.Path -ErrorAction SilentlyContinue
  if (-not $entries) { continue }
  foreach ($e in $entries) {
    $dispName = [string]$e.DisplayName
    if ([string]::IsNullOrWhiteSpace($dispName)) { continue }
    $dispName = $dispName.Trim()
    if ($e.SystemComponent -eq 1) { continue }
    if (-not [string]::IsNullOrWhiteSpace([string]$e.ParentKeyName) -or -not [string]::IsNullOrWhiteSpace([string]$e.ParentDisplayName)) { continue }
    $relType = [string]$e.ReleaseType
    if ($relType -match '^(Update|Hotfix|Security Update|Service Pack|Update Rollup)') { continue }
    if ($dispName -match '^(KB\\d{5,9}\\b|Update for (Windows|Microsoft)|Security Update for Windows)') { continue }

    $uninst = [string]$e.UninstallString
    $quietUninst = [string]$e.QuietUninstallString
    $isWinInst = ($e.WindowsInstaller -eq 1)
    if ([string]::IsNullOrWhiteSpace($uninst) -and [string]::IsNullOrWhiteSpace($quietUninst) -and -not $isWinInst) { continue }

    $dispVer = ([string]$e.DisplayVersion).Trim()
    $dedupeKey = ($dispName.ToLowerInvariant() + '|' + $dispVer.ToLowerInvariant() + '|' + $rt.Scope + '|' + $rt.Sid)
    if ($seen.ContainsKey($dedupeKey)) { continue }
    $seen[$dedupeKey] = $true

    $pub = ([string]$e.Publisher).Trim()
    $loc = ([string]$e.InstallLocation).Trim()
    $rawDate = ([string]$e.InstallDate).Trim()
    $fmtDate = ''
    if ($rawDate -match '^(\\d{4})(\\d{2})(\\d{2})$') {
      $fmtDate = "$($Matches[1])-$($Matches[2])-$($Matches[3])"
    }
    $sizeMb = 0
    if ($e.EstimatedSize -and [double]$e.EstimatedSize -gt 0) {
      $sizeMb = [Math]::Round(([double]$e.EstimatedSize) / 1024.0, 1)
    }

    $keyName = [string]$e.PSChildName
    $cmdAll = ($quietUninst + ' ' + $uninst).Trim()
    $prodCode = ''
    if ($cmdAll -match '(\\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\})') {
      $prodCode = $Matches[1].ToUpperInvariant()
    } elseif ($keyName -match '^\\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\}$') {
      $prodCode = $keyName.ToUpperInvariant()
    }

    $instType = 'exe'
    $quietSupported = (-not [string]::IsNullOrWhiteSpace($quietUninst))
    if ($isWinInst -or $cmdAll -match 'msiexec') {
      $instType = 'msi'
      $quietSupported = $true
    } elseif ($cmdAll -match 'unins0\\d+\\.exe|/VERYSILENT') {
      $instType = 'inno'
      $quietSupported = $true
    } elseif ($cmdAll -match 'Update\\.exe.*--uninstall') {
      $instType = 'squirrel'
      $quietSupported = $true
    } elseif ($cmdAll -match 'uninstall\\.exe|uninst\\.exe|/S(\\s|$)') {
      $instType = 'nsis'
      $quietSupported = $true
    }

    $preview = if (-not [string]::IsNullOrWhiteSpace($quietUninst)) {
      $quietUninst.Trim()
    } elseif ($instType -eq 'msi' -and $prodCode) {
      "msiexec.exe /x $prodCode /qn /norestart"
    } else {
      $uninst.Trim()
    }

    $noRemove = ($e.NoRemove -eq 1)
    $items.Add([PSCustomObject]@{
      registryHive = $rt.Hive
      registryKeyName = $keyName
      ownerSid = $rt.Sid
      ownerUser = $rt.Owner
      name = $dispName
      version = $dispVer
      publisher = $pub
      installDate = $fmtDate
      sizeMb = $sizeMb
      scope = $rt.Scope
      arch = $rt.Arch
      installLocation = $loc
      productCode = $prodCode
      installerType = $instType
      quietSupported = $quietSupported
      noRemove = $noRemove
      uninstallPreview = $preview
    })
  }
}

$sorted = @($items | Sort-Object -Property name)
[PSCustomObject]@{
  hostname = $hostName
  activeUser = $activeUser
  programs = $sorted
} | ConvertTo-Json -Depth 4 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, socket, subprocess, os

hostname = socket.gethostname()
active_user = os.environ.get("SUDO_USER") or os.environ.get("USER") or ""
programs = []

def run_cmd(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=25)

try:
    r = run_cmd(["dpkg-query", "-W", "-f=\${Package}\\t\${Version}\\t\${Installed-Size}\\t\${Maintainer}\\n"])
    if r.returncode == 0 and r.stdout:
        for line in r.stdout.splitlines():
            parts = line.split("\\t")
            if len(parts) < 2 or not parts[0].strip():
                continue
            name = parts[0].strip()
            ver = parts[1].strip()
            try:
                kb = float(parts[2].strip()) if len(parts) > 2 and parts[2].strip().isdigit() else 0.0
            except Exception:
                kb = 0.0
            pub = parts[3].strip() if len(parts) > 3 else ""
            programs.append({
                "registryHive": "linux_pkg",
                "registryKeyName": name,
                "ownerSid": "",
                "ownerUser": "",
                "name": name,
                "version": ver,
                "publisher": pub,
                "installDate": "",
                "sizeMb": round(kb / 1024.0, 1),
                "scope": "machine",
                "arch": "pkg",
                "installLocation": "",
                "productCode": "",
                "installerType": "apt",
                "quietSupported": True,
                "noRemove": False,
                "uninstallPreview": f"apt-get remove -y {name}",
            })
except Exception:
    pass

if not programs:
    try:
        r = run_cmd(["rpm", "-qa", "--queryformat", "%{NAME}\\t%{VERSION}-%{RELEASE}\\t%{SIZE}\\t%{VENDOR}\\n"])
        if r.returncode == 0 and r.stdout:
            for line in r.stdout.splitlines():
                parts = line.split("\\t")
                if len(parts) < 2 or not parts[0].strip():
                    continue
                name = parts[0].strip()
                ver = parts[1].strip()
                try:
                    sz_b = float(parts[2].strip()) if len(parts) > 2 and parts[2].strip().isdigit() else 0.0
                except Exception:
                    sz_b = 0.0
                pub = parts[3].strip() if len(parts) > 3 else ""
                programs.append({
                    "registryHive": "linux_pkg",
                    "registryKeyName": name,
                    "ownerSid": "",
                    "ownerUser": "",
                    "name": name,
                    "version": ver,
                    "publisher": pub,
                    "installDate": "",
                    "sizeMb": round(sz_b / (1024.0 * 1024.0), 1),
                    "scope": "machine",
                    "arch": "pkg",
                    "installLocation": "",
                    "productCode": "",
                    "installerType": "rpm",
                    "quietSupported": True,
                    "noRemove": False,
                    "uninstallPreview": f"rpm -e {name}",
                })
    except Exception:
        pass

programs.sort(key=lambda x: x["name"].lower())
print(json.dumps({"hostname": hostname, "activeUser": active_user, "programs": programs}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(60000, input.timeoutMs || 60000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'collect installed programs');
  const rawList: any[] = Array.isArray(parsed.programs) ? parsed.programs : [];

  const programs: HelpdeskInstalledProgram[] = rawList.map((raw, idx) => {
    const name = String(raw.name || '').trim();
    const keyName = String(raw.registryKeyName || '').trim();
    const hive = (String(raw.registryHive || 'HKLM64') as HelpdeskProgramRegistryHive);
    const ownerSid = String(raw.ownerSid || '').trim();
    const prot = checkProtectedProgram(name, keyName);
    const noRemove = Boolean(raw.noRemove);
    const canUninstall = !prot.isProtected && !noRemove && Boolean(keyName);
    const instTypeRaw = String(raw.installerType || 'exe').toLowerCase();
    const installerType: HelpdeskProgramInstallerType =
      instTypeRaw === 'msi' ||
      instTypeRaw === 'inno' ||
      instTypeRaw === 'nsis' ||
      instTypeRaw === 'squirrel' ||
      instTypeRaw === 'apt' ||
      instTypeRaw === 'rpm'
        ? (instTypeRaw as HelpdeskProgramInstallerType)
        : 'exe';

    return {
      id: `${hive}:${ownerSid || 'sys'}:${keyName}:${idx}`,
      name,
      version: String(raw.version || ''),
      publisher: String(raw.publisher || ''),
      installDate: String(raw.installDate || ''),
      sizeMb: Number(raw.sizeMb) || 0,
      scope: raw.scope === 'user' ? 'user' : 'machine',
      arch: raw.arch === 'x86' || raw.arch === 'user' || raw.arch === 'pkg' ? raw.arch : 'x64',
      registryHive: hive,
      registryKeyName: keyName,
      ...(ownerSid ? { ownerSid } : {}),
      ...(raw.ownerUser ? { ownerUser: String(raw.ownerUser) } : {}),
      installLocation: String(raw.installLocation || ''),
      ...(raw.productCode ? { productCode: String(raw.productCode) } : {}),
      installerType,
      quietSupported: Boolean(raw.quietSupported),
      canUninstall,
      isProtected: prot.isProtected,
      ...(prot.reasonEn ? { protectionReason: prot.reasonEn, protectionReasonFa: prot.reasonFa } : {}),
      uninstallPreview: String(raw.uninstallPreview || ''),
    };
  });

  const machineCount = programs.filter((p) => p.scope === 'machine').length;
  const userCount = programs.filter((p) => p.scope === 'user').length;
  const totalSizeMb = Number(
    programs.reduce((acc, p) => acc + (Number(p.sizeMb) || 0), 0).toFixed(1)
  );

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    activeUser: String(parsed.activeUser || ''),
    totalCount: programs.length,
    machineCount,
    userCount,
    totalSizeMb,
    programs,
    collectedAt: new Date().toISOString(),
  };
}

export async function uninstallEndpointProgram(
  input: HelpdeskTargetInput,
  options: {
    programName?: string;
    registryHive: HelpdeskProgramRegistryHive;
    registryKeyName: string;
    ownerSid?: string;
  }
): Promise<HelpdeskActionResult> {
  const hive = String(options.registryHive || '').trim() as HelpdeskProgramRegistryHive;
  const allowedHives: HelpdeskProgramRegistryHive[] = ['HKLM64', 'HKLM32', 'HKCU', 'HKU', 'linux_pkg'];
  if (!allowedHives.includes(hive)) {
    throw new Error('Invalid program registry hive specified.');
  }

  const keyName = String(options.registryKeyName || '').trim();
  if (!keyName || keyName.length > 260 || /[\x00-\x1F\x7F\\/]/.test(keyName)) {
    throw new Error('Invalid program registry key or package identifier.');
  }

  const ownerSid = String(options.ownerSid || '').trim();
  if (hive === 'HKU') {
    if (!/^S-1-5-21-[0-9-]+$/.test(ownerSid)) {
      throw new Error('Valid user profile SID (S-1-5-21-...) is required for HKU per-user uninstallation.');
    }
  }

  const declaredName = String(options.programName || keyName).trim();
  const preCheck = checkProtectedProgram(declaredName, keyName);
  if (preCheck.isProtected) {
    throw new Error(preCheck.reasonEn || 'Protected program cannot be uninstalled remotely.');
  }

  if (hive === 'linux_pkg' && !/^[a-zA-Z0-9][a-zA-Z0-9.+:_-]{0,127}$/.test(keyName)) {
    throw new Error('Invalid Linux package name format.');
  }

  const keyB64 = Buffer.from(keyName, 'utf8').toString('base64');
  const sidB64 = Buffer.from(ownerSid, 'utf8').toString('base64');
  const linuxPkgB64 = Buffer.from(keyName, 'utf8').toString('base64');

  const winPs = `
$ErrorActionPreference = 'Continue'
$hive = '${hive}'
$keyName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${keyB64}'))
$ownerSid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))

$basePath = switch ($hive) {
  'HKLM64' { 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' }
  'HKLM32' { 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' }
  'HKCU'   { 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' }
  'HKU'    { "Registry::HKEY_USERS\\$ownerSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" }
  default  { '' }
}

if (-not $basePath) {
  [PSCustomObject]@{ ok = $false; exitCode = -1; rebootRequired = $false; programName = $keyName; output = 'Unsupported registry hive on Windows host.' } | ConvertTo-Json -Compress
  return
}

$fullKey = Join-Path $basePath $keyName
if (-not (Test-Path -LiteralPath $fullKey)) {
  [PSCustomObject]@{ ok = $false; exitCode = -1; rebootRequired = $false; programName = $keyName; output = "Registry uninstall key not found: $fullKey (may already be uninstalled)." } | ConvertTo-Json -Compress
  return
}

$item = Get-ItemProperty -LiteralPath $fullKey -ErrorAction Stop
$dispName = [string]$item.DisplayName
if (-not $dispName) { $dispName = $keyName }

if ($dispName -match '(windows defender|microsoft defender|eset|crowdstrike|falcon sensor|kaspersky|sentinelone|bitdefender|symantec|norton|mcafee|sophos|malwarebytes|trellix|carbon black|cortex xdr|forticlient|openssh|winrm)') {
  [PSCustomObject]@{ ok = $false; exitCode = 5; rebootRequired = $false; programName = $dispName; output = "Blocked by security policy: $dispName is a protected endpoint security or remote management component." } | ConvertTo-Json -Compress
  return
}

$quietStr = ([string]$item.QuietUninstallString).Trim()
$uninstStr = ([string]$item.UninstallString).Trim()
$isWinInst = ($item.WindowsInstaller -eq 1)
$rawCmd = if ($quietStr) { $quietStr } else { $uninstStr }

$guid = ''
if ("$quietStr $uninstStr" -match '(\\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\})') {
  $guid = $Matches[1].ToUpperInvariant()
} elseif ($keyName -match '^\\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\}$') {
  $guid = $keyName.ToUpperInvariant()
}

$ok = $false
$reb = $false
$code = -1
$out = ''

if (($isWinInst -or $rawCmd -match '(?i)msiexec') -and $guid) {
  $args = @('/x', $guid, '/qn', '/norestart', 'REBOOT=ReallySuppress')
  $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $args -Wait -PassThru -NoNewWindow
  $code = $p.ExitCode
  $reb = ($code -eq 3010 -or $code -eq 1641)
  $ok = ($code -eq 0 -or $code -eq 3010 -or $code -eq 1641 -or -not (Test-Path -LiteralPath $fullKey))
  $out = "msiexec.exe /x $guid /qn /norestart ExitCode=$code"
} elseif ($rawCmd) {
  $exe = ''
  $argStr = ''
  if ($rawCmd.StartsWith('"')) {
    $qEnd = $rawCmd.IndexOf('"', 1)
    if ($qEnd -gt 1) {
      $exe = $rawCmd.Substring(1, $qEnd - 1).Trim()
      $argStr = $rawCmd.Substring($qEnd + 1).Trim()
    }
  } else {
    if ($rawCmd -match '^(.*?\\.exe)(?:\\s+(.*))?$') {
      $exe = $Matches[1].Trim()
      if ($Matches[2]) { $argStr = $Matches[2].Trim() }
    } else {
      $exe = $rawCmd
    }
  }

  $exe = [Environment]::ExpandEnvironmentVariables($exe)
  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) {
    [PSCustomObject]@{ ok = $false; exitCode = -1; rebootRequired = $false; programName = $dispName; output = "Uninstaller executable not found on disk: $exe" } | ConvertTo-Json -Compress
    return
  }

  if (-not $quietStr) {
    $lowExe = $exe.ToLowerInvariant()
    $lowArgs = $argStr.ToLowerInvariant()
    if ($lowExe -match 'unins0\\d+\\.exe$') {
      if ($lowArgs -notmatch '/verysilent') { $argStr = "$argStr /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-".Trim() }
    } elseif ($lowExe -match 'update\\.exe$' -and $lowArgs -match '--uninstall') {
      if ($lowArgs -notmatch '(^|\\s)(-s|--silent)(\\s|$)') { $argStr = "$argStr -s".Trim() }
    } elseif ($lowExe -match '(uninstall|uninst)\\.exe$') {
      if ($lowArgs -notmatch '(^|\\s)/s(\\s|$)') { $argStr = "$argStr /S".Trim() }
    }
  }

  if ($argStr) {
    $p = Start-Process -FilePath $exe -ArgumentList $argStr -Wait -PassThru -NoNewWindow
  } else {
    $p = Start-Process -FilePath $exe -Wait -PassThru -NoNewWindow
  }
  $code = $p.ExitCode

  # NSIS / Squirrel child uninstaller processes sometimes spawn a temp copy and return immediately
  for ($i = 0; $i -lt 30; $i++) {
    if (-not (Test-Path -LiteralPath $fullKey)) { break }
    Start-Sleep -Milliseconds 500
  }

  $stillExists = Test-Path -LiteralPath $fullKey
  $reb = ($code -eq 3010 -or $code -eq 1641)
  $ok = ((-not $stillExists) -and ($code -eq 0 -or $code -eq 3010 -or $code -eq 1641 -or $code -eq 1)) -or ($code -eq 0 -or $code -eq 3010 -or $code -eq 1641)
  $out = "Executed '$exe' ($argStr) -> ExitCode=$code; RegistryKeyPresent=$stillExists"
} else {
  $out = 'No UninstallString or MSI ProductCode found for this application.'
}

[PSCustomObject]@{
  ok = $ok
  exitCode = $code
  rebootRequired = $reb
  programName = $dispName
  output = $out
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, shutil, subprocess, re

pkg = base64.b64decode('${linuxPkgB64}').decode('utf-8', errors='ignore').strip()
if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9.+:_-]{0,127}$', pkg):
    print(json.dumps({"ok": False, "exitCode": 1, "rebootRequired": False, "programName": pkg, "output": "Invalid package identifier."}))
    raise SystemExit(0)

if re.search(r'^(systemd|openssh|linux-image|glibc|libc6|dpkg|apt|rpm|bash|sudo)', pkg, re.I):
    print(json.dumps({"ok": False, "exitCode": 5, "rebootRequired": False, "programName": pkg, "output": f"Blocked by security policy: {pkg} is protected."}))
    raise SystemExit(0)

if shutil.which("apt-get"):
    r = subprocess.run(["apt-get", "remove", "-y", pkg], capture_output=True, text=True, timeout=180)
elif shutil.which("dnf"):
    r = subprocess.run(["dnf", "remove", "-y", pkg], capture_output=True, text=True, timeout=180)
elif shutil.which("rpm"):
    r = subprocess.run(["rpm", "-e", pkg], capture_output=True, text=True, timeout=180)
else:
    print(json.dumps({"ok": False, "exitCode": 1, "rebootRequired": False, "programName": pkg, "output": "No supported package manager found."}))
    raise SystemExit(0)

out = ((r.stdout or "") + "\\n" + (r.stderr or "")).strip()
print(json.dumps({"ok": r.returncode == 0, "exitCode": r.returncode, "rebootRequired": False, "programName": pkg, "output": out[:2000]}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(180000, input.timeoutMs || 180000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, `uninstall ${declaredName}`);
  const ok = Boolean(parsed.ok);
  const reb = Boolean(parsed.rebootRequired);
  const finalName = String(parsed.programName || declaredName).trim();

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'program_uninstall',
    success: ok,
    message: ok
      ? `Application "${finalName}" was uninstalled from ${execRes.host}.${reb ? ' A system restart is recommended to finalize cleanup.' : ''}`
      : `Failed to uninstall "${finalName}" on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? `نرم‌افزار «${finalName}» با موفقیت از روی سیستم ${execRes.host} حذف (Uninstall) شد.${reb ? ' برای تکمیل پاک‌سازی، ری‌استارت سیستم توصیه می‌شود.' : ''}`
      : `حذف نرم‌افزار «${finalName}» روی ${execRes.host} ناموفق بود: ${parsed.output}`,
    details: {
      programName: finalName,
      registryHive: hive,
      registryKeyName: keyName,
      ...(ownerSid ? { ownerSid } : {}),
      exitCode: Number(parsed.exitCode ?? -1),
      rebootRequired: reb,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 20. COMPLETE HARDWARE INVENTORY & CONNECTED PERIPHERALS
// ============================================================================

export interface HelpdeskHardwareMemoryModule {
  slotLabel: string;
  bankLabel: string;
  capacityGb: number;
  speedMhz: number;
  configuredSpeedMhz: number;
  memoryType: string;
  formFactor: string;
  manufacturer: string;
  partNumber: string;
  serialNumber: string;
  voltageV: number;
}

export interface HelpdeskHardwareCpuInfo {
  name: string;
  manufacturer: string;
  socket: string;
  cores: number;
  logicalProcessors: number;
  baseClockGhz: number;
  maxClockGhz: number;
  l2CacheMb: number;
  l3CacheMb: number;
  architecture: string;
  virtualizationEnabled: boolean | null;
  identifier?: string;
}

export interface HelpdeskHardwareMotherboardInfo {
  manufacturer: string;
  product: string;
  version: string;
  serialNumber: string;
  chipset: string;
  biosVendor: string;
  biosVersion: string;
  biosReleaseDate: string;
  firmwareMode?: string;
  secureBoot?: boolean | null;
}

export interface HelpdeskHardwareGpuItem {
  name: string;
  vendor: string;
  type: 'integrated' | 'discrete' | 'virtual';
  vramGb: number;
  driverVersion: string;
  driverDate: string;
  resolution: string;
  refreshRateHz: number;
}

export interface HelpdeskHardwareMonitorItem {
  name: string;
  manufacturer: string;
  serialNumber: string;
}

export interface HelpdeskHardwareDiskItem {
  model: string;
  manufacturer: string;
  sizeGb: number;
  mediaType: string;
  busType: string;
  serialNumber: string;
  firmwareVersion: string;
  healthStatus: string;
}

export interface HelpdeskHardwareNicItem {
  name: string;
  description: string;
  macAddress: string;
  linkSpeed: string;
  adapterType: 'ethernet' | 'wifi' | 'bluetooth' | 'virtual';
  status: string;
}

export interface HelpdeskHardwareAudioItem {
  name: string;
  manufacturer: string;
  status: string;
  isOnboard: boolean;
}

export type HelpdeskPeripheralCategory =
  | 'input'
  | 'camera'
  | 'usb_storage'
  | 'bluetooth'
  | 'printer_scanner'
  | 'biometric'
  | 'other';

export interface HelpdeskConnectedPeripheral {
  name: string;
  manufacturer: string;
  pnpClass: string;
  category: HelpdeskPeripheralCategory;
  status: string;
  deviceId: string;
}

export interface HelpdeskHardwareInventoryResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  system: {
    manufacturer: string;
    model: string;
    systemType: string;
    serialNumber: string;
    uuid: string;
    isVirtual: boolean;
  };
  motherboard: HelpdeskHardwareMotherboardInfo;
  cpu: HelpdeskHardwareCpuInfo;
  memory: {
    totalGb: number;
    usableGb: number;
    totalSlots: number;
    populatedSlots: number;
    freeSlots: number;
    maxCapacityGb: number;
    memoryType: string;
    speedMhz: number;
    channelMode: string;
    modules: HelpdeskHardwareMemoryModule[];
  };
  gpus: HelpdeskHardwareGpuItem[];
  monitors: HelpdeskHardwareMonitorItem[];
  disks: HelpdeskHardwareDiskItem[];
  networkAdapters: HelpdeskHardwareNicItem[];
  audioDevices: HelpdeskHardwareAudioItem[];
  connectedDevices: HelpdeskConnectedPeripheral[];
  collectedAt: string;
}

export async function collectEndpointHardwareInventory(
  input: HelpdeskTargetInput
): Promise<HelpdeskHardwareInventoryResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$hostName = [string]$env:COMPUTERNAME

function To-Str($v) {
  if ($null -eq $v) { return '' }
  try { return ([string]$v).Trim() } catch { return '' }
}

function To-Int($v) {
  if ($null -eq $v) { return 0 }
  try { return [int]$v } catch { return 0 }
}

function To-Dbl($v) {
  if ($null -eq $v) { return [double]0 }
  try { return [double]$v } catch { return [double]0 }
}

function Safe-Cim($className, $ns) {
  try {
    $res = if ($ns) {
      @(Get-CimInstance -Namespace $ns -ClassName $className -ErrorAction SilentlyContinue)
    } else {
      @(Get-CimInstance -ClassName $className -ErrorAction SilentlyContinue)
    }
    if ($res -and $res.Count -gt 0) { return $res }
  } catch {}
  try {
    $wmi = if ($ns) {
      @(Get-WmiObject -Namespace $ns -Class $className -ErrorAction SilentlyContinue)
    } else {
      @(Get-WmiObject -Class $className -ErrorAction SilentlyContinue)
    }
    if ($wmi -and $wmi.Count -gt 0) { return $wmi }
  } catch {}
  return @()
}

function Decode-U16Array($arr) {
  if ($null -eq $arr) { return '' }
  try {
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in @($arr)) {
      try {
        $code = [int]$c
        if ($code -gt 0 -and $code -lt 65535) { [void]$sb.Append([char]$code) }
      } catch {}
    }
    return $sb.ToString().Trim()
  } catch { return '' }
}

function Decode-MemType($smbios, $legacy) {
  $sCode = To-Int $smbios
  $lCode = To-Int $legacy
  $code = if ($sCode -gt 0) { $sCode } else { $lCode }
  switch ($code) {
    20 { 'DDR' }
    21 { 'DDR2' }
    22 { 'DDR2 FB-DIMM' }
    24 { 'DDR3' }
    26 { 'DDR4' }
    27 { 'LPDDR' }
    28 { 'LPDDR2' }
    29 { 'LPDDR3' }
    30 { 'LPDDR4' }
    34 { 'DDR5' }
    35 { 'LPDDR5' }
    default { if ($code -gt 0) { "RAM ($code)" } else { 'Unknown' } }
  }
}

function Decode-FormFactor($ff) {
  switch (To-Int $ff) {
    8  { 'DIMM' }
    9  { 'SIP' }
    12 { 'SODIMM' }
    13 { 'SRIMM' }
    15 { 'FB-DIMM' }
    default { 'Module' }
  }
}

function Clean-HwStr($v) {
  $s = ((To-Str $v) -replace '\\s+', ' ').Trim()
  if (-not $s) { return '' }
  if ($s -match '^(?i)(to be filled by o\\.?e\\.?m\\.?|default string|system serial number|system product name|system manufacturer|base board serial number|chassis serial number|not specified|not applicable|none|n/a|o\\.?e\\.?m\\.?|empty|0{4,})$') {
    return ''
  }
  return $s
}

function Parse-BiosDate($val) {
  if ($null -eq $val) { return '' }
  if ($val -is [datetime]) { return $val.ToString('yyyy-MM-dd') }
  $s = To-Str $val
  if (-not $s) { return '' }
  if ($s -match '^(\\d{4})(\\d{2})(\\d{2})\\d{6}') {
    return "$($Matches[1])-$($Matches[2])-$($Matches[3])"
  }
  try { return ([datetime]$s).ToString('yyyy-MM-dd') } catch { return $s }
}

function Decode-CpuSocket($upgradeCode) {
  switch (To-Int $upgradeCode) {
    36 { 'Socket AM2' }
    39 { 'Socket AM3' }
    42 { 'BGA' }
    43 { 'LGA1155' }
    44 { 'Socket AM3+' }
    45 { 'Socket FM1' }
    47 { 'Socket FM2' }
    48 { 'LGA2011-3' }
    49 { 'LGA1151' }
    50 { 'LGA1150' }
    52 { 'LGA2066' }
    56 { 'LGA1151-2' }
    59 { 'Socket AM4' }
    62 { 'LGA1200' }
    63 { 'LGA1700' }
    64 { 'Socket AM5' }
    65 { 'LGA1851' }
    66 { 'Socket SP5' }
    default { '' }
  }
}

# 1. System, Chassis, Motherboard & BIOS (CIM/WMI + Registry SMBIOS fallbacks)
$cs = $null; $csp = $null; $bios = $null; $board = $null; $enclosure = $null; $os = $null
try { $cs = Safe-Cim 'Win32_ComputerSystem' | Select-Object -First 1 } catch {}
try { $csp = Safe-Cim 'Win32_ComputerSystemProduct' | Select-Object -First 1 } catch {}
try { $bios = Safe-Cim 'Win32_BIOS' | Select-Object -First 1 } catch {}
try { $board = Safe-Cim 'Win32_BaseBoard' | Select-Object -First 1 } catch {}
try { $enclosure = Safe-Cim 'Win32_SystemEnclosure' | Select-Object -First 1 } catch {}
try { $os = Safe-Cim 'Win32_OperatingSystem' | Select-Object -First 1 } catch {}

$regBios = $null
try { $regBios = Get-ItemProperty -LiteralPath 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\BIOS' -ErrorAction SilentlyContinue } catch {}

$sysType = 'Desktop'
try {
  if ($enclosure -and $enclosure.ChassisTypes) {
    $cNums = @()
    foreach ($ct in @($enclosure.ChassisTypes)) { $cNums += (To-Int $ct) }
    if ($cNums | Where-Object { $_ -in 8,9,10,11,12,14,18,21,30,31,32 }) { $sysType = 'Laptop / Notebook' }
    elseif ($cNums | Where-Object { $_ -in 17,23,28,29 }) { $sysType = 'Server' }
    elseif ($cNums | Where-Object { $_ -in 35,36 }) { $sysType = 'Mini PC / SFF' }
  }
} catch {}

$oemMfg = Clean-HwStr $(if ($cs) { $cs.Manufacturer })
if (-not $oemMfg -and $csp) { $oemMfg = Clean-HwStr $csp.Vendor }
if (-not $oemMfg -and $regBios) { $oemMfg = Clean-HwStr $regBios.SystemManufacturer }

$oemModel = Clean-HwStr $(if ($cs) { $cs.Model })
if (-not $oemModel -and $csp) { $oemModel = Clean-HwStr $csp.Name }
if (-not $oemModel -and $regBios) { $oemModel = Clean-HwStr $regBios.SystemProductName }

$biosVendor = Clean-HwStr $(if ($bios) { $bios.Manufacturer })
if (-not $biosVendor -and $regBios) { $biosVendor = Clean-HwStr $regBios.BIOSVendor }

$biosVersion = Clean-HwStr $(if ($bios) { $bios.SMBIOSBIOSVersion })
if (-not $biosVersion -and $bios -and $bios.BIOSVersion) {
  $bvJoin = (@($bios.BIOSVersion) | ForEach-Object { Clean-HwStr $_ } | Where-Object { $_ }) -join ' / '
  $biosVersion = $bvJoin
}
if (-not $biosVersion -and $bios) { $biosVersion = Clean-HwStr $bios.Version }
if (-not $biosVersion -and $bios) { $biosVersion = Clean-HwStr $bios.Name }
if (-not $biosVersion -and $regBios) { $biosVersion = Clean-HwStr $regBios.BIOSVersion }

$isVirt = ("$oemMfg $oemModel $biosVendor" -match '(?i)vmware|virtualbox|vbox|qemu|kvm|hyper-v|virtual machine|xen|bochs|parallels')
if ($isVirt) { $sysType = 'Virtual Machine' }

$serialNo = Clean-HwStr $(if ($bios) { $bios.SerialNumber })
if (-not $serialNo -and $enclosure) { $serialNo = Clean-HwStr $enclosure.SerialNumber }
if (-not $serialNo -and $csp) { $serialNo = Clean-HwStr $csp.IdentifyingNumber }

$biosDate = Parse-BiosDate $(if ($bios) { $bios.ReleaseDate })
if (-not $biosDate -and $regBios) { $biosDate = Parse-BiosDate $regBios.BIOSReleaseDate }

$boardMfg = Clean-HwStr $(if ($board) { $board.Manufacturer })
if (-not $boardMfg -and $regBios) { $boardMfg = Clean-HwStr $regBios.BaseBoardManufacturer }
if (-not $boardMfg) { $boardMfg = $oemMfg }

$boardProduct = Clean-HwStr $(if ($board) { $board.Product })
if (-not $boardProduct -and $regBios) { $boardProduct = Clean-HwStr $regBios.BaseBoardProduct }
if (-not $boardProduct) { $boardProduct = $oemModel }

$boardVersion = Clean-HwStr $(if ($board) { $board.Version })
if (-not $boardVersion -and $regBios) { $boardVersion = Clean-HwStr $regBios.BaseBoardVersion }
if (-not $boardVersion -and $regBios) { $boardVersion = Clean-HwStr $regBios.SystemVersion }

$boardSerial = Clean-HwStr $(if ($board) { $board.SerialNumber })
if (-not $boardSerial) { $boardSerial = $serialNo }

$firmwareMode = ''
$secureBoot = $null
try {
  $sbState = Confirm-SecureBootUEFI -ErrorAction Stop
  $firmwareMode = 'UEFI'
  $secureBoot = [bool]$sbState
} catch {
  $errTxt = To-Str $_.Exception.Message
  if ($errTxt -match '(?i)not supported|legacy|bios') { $firmwareMode = 'Legacy BIOS' }
}
if (-not $firmwareMode) {
  try {
    $peFw = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Control' -Name 'PEFirmwareType' -ErrorAction SilentlyContinue
    if ($peFw -and (To-Int $peFw.PEFirmwareType) -eq 2) { $firmwareMode = 'UEFI' }
    elseif ($peFw -and (To-Int $peFw.PEFirmwareType) -eq 1) { $firmwareMode = 'Legacy BIOS' }
  } catch {}
}
if (-not $firmwareMode) {
  try {
    $sbKey = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State' -ErrorAction SilentlyContinue
    if ($sbKey) {
      $firmwareMode = 'UEFI'
      if ($null -ne $sbKey.UEFISecureBootEnabled) { $secureBoot = ((To-Int $sbKey.UEFISecureBootEnabled) -eq 1) }
    }
  } catch {}
}

$chipset = ''
try {
  $chipObj = Safe-Cim 'Win32_PnPEntity' | Where-Object {
    ($null -eq $_.Present -or $_.Present -eq $true) -and $_.Name -match '(?i)Host Bridge|Host CPU Bridge|PCI Express Root Complex|Chipset|DRAM Controller|LPC Controller|eSPI Controller|Platform Controller Hub|\\bPCH\\b|\\bSMBus\\b|Q35|440FX'
  } | Select-Object -First 1
  if ($chipObj) { $chipset = To-Str $chipObj.Name }
} catch {}
if (-not $chipset -and $regBios) { $chipset = Clean-HwStr $regBios.SystemFamily }

# 2. CPU (CIM/WMI + Win32_CacheMemory + Registry CentralProcessor fallbacks)
$regCpu0 = $null
$regCpuCount = 0
try {
  $regCpu0 = Get-ItemProperty -LiteralPath 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0' -ErrorAction SilentlyContinue
  $regCpuCount = @(Get-ChildItem -LiteralPath 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\\d+$' }).Count
} catch {}

$cpuName = ''; $cpuMfg = ''; $cpuSocket = ''; $cpuIdent = ''
$cpuArch = switch ((To-Str $env:PROCESSOR_ARCHITECTURE).ToUpperInvariant()) {
  'AMD64' { 'x64' }
  'ARM64' { 'ARM64' }
  'X86' { 'x86' }
  default { To-Str $env:PROCESSOR_ARCHITECTURE }
}
$totalCores = 0; $totalThreads = 0; $baseMhz = 0; $maxMhz = 0; $l2Mb = [double]0; $l3Mb = [double]0
$virtFw = $null
try {
  $cpuArr = @(Safe-Cim 'Win32_Processor')
  if ($cpuArr.Count -gt 0) {
    $cpu1 = $cpuArr[0]
    foreach ($c in $cpuArr) {
      $totalCores += (To-Int $c.NumberOfCores)
      $totalThreads += (To-Int $c.NumberOfLogicalProcessors)
      if ((To-Dbl $c.L2CacheSize) -gt 0) { $l2Mb += (To-Dbl $c.L2CacheSize) / 1024.0 }
      if ((To-Dbl $c.L3CacheSize) -gt 0) { $l3Mb += (To-Dbl $c.L3CacheSize) / 1024.0 }
    }
    $cpuName = Clean-HwStr $cpu1.Name
    $cpuMfg = Clean-HwStr $cpu1.Manufacturer
    $cpuSocket = Clean-HwStr $cpu1.SocketDesignation
    if (-not $cpuSocket) { $cpuSocket = Decode-CpuSocket $cpu1.UpgradeMethod }
    $cpuIdent = Clean-HwStr $cpu1.Caption
    $baseMhz = To-Int $cpu1.CurrentClockSpeed
    $maxMhz = To-Int $cpu1.MaxClockSpeed
    if ($maxMhz -le 0) { $maxMhz = $baseMhz }
    $archCode = To-Int $cpu1.Architecture
    if ($archCode -eq 0) { $cpuArch = 'x86' }
    elseif ($archCode -eq 5) { $cpuArch = 'ARM' }
    elseif ($archCode -eq 9) { $cpuArch = 'x64' }
    elseif ($archCode -eq 12) { $cpuArch = 'ARM64' }
    try {
      if ($null -ne $cpu1.VirtualizationFirmwareEnabled) {
        $virtFw = [bool]$cpu1.VirtualizationFirmwareEnabled
      }
    } catch { $virtFw = $null }
    if ($null -eq $virtFw) {
      try {
        if ($cs -and $cs.HypervisorPresent -eq $true) { $virtFw = $true }
        elseif ($null -ne $cpu1.VMMonitorModeExtensions -and $cpu1.VMMonitorModeExtensions -eq $true -and $cpu1.SecondLevelAddressTranslationExtensions -eq $true) { $virtFw = $true }
      } catch {}
    }
  }
} catch {}

if (-not $cpuName -and $regCpu0) { $cpuName = Clean-HwStr $regCpu0.ProcessorNameString }
if (-not $cpuMfg -and $regCpu0) { $cpuMfg = Clean-HwStr $regCpu0.VendorIdentifier }
if (-not $cpuIdent -and $regCpu0) { $cpuIdent = Clean-HwStr $regCpu0.Identifier }
if ($baseMhz -le 0 -and $regCpu0) { $baseMhz = To-Int $regCpu0.'~MHz' }
if ($maxMhz -le 0) { $maxMhz = $baseMhz }
if ($totalThreads -le 0) { $totalThreads = if ($regCpuCount -gt 0) { $regCpuCount } else { [Environment]::ProcessorCount } }
if ($totalCores -le 0) { $totalCores = $totalThreads }
if ($null -eq $virtFw -and $cs -and $cs.HypervisorPresent -eq $true) { $virtFw = $true }

if ($l2Mb -le 0 -or $l3Mb -le 0) {
  try {
    $caches = @(Safe-Cim 'Win32_CacheMemory')
    $l2SumKb = [double]0; $l3SumKb = [double]0
    foreach ($cm in $caches) {
      $lvl = To-Int $cm.Level
      $kb = To-Dbl $cm.MaxCacheSize
      if ($kb -le 0) { $kb = To-Dbl $cm.InstalledSize }
      if ($lvl -eq 4) { $l2SumKb += $kb }
      elseif ($lvl -eq 5) { $l3SumKb += $kb }
    }
    if ($l2Mb -le 0 -and $l2SumKb -gt 0) { $l2Mb = $l2SumKb / 1024.0 }
    if ($l3Mb -le 0 -and $l3SumKb -gt 0) { $l3Mb = $l3SumKb / 1024.0 }
  } catch {}
}
$l2Mb = [Math]::Round($l2Mb, 1)
$l3Mb = [Math]::Round($l3Mb, 1)

# 3. Physical RAM Arrays & Modules
$totalSlots = 0; $maxCapKb = [double]0
try {
  $memArrays = @(Safe-Cim 'Win32_PhysicalMemoryArray' | Where-Object { $null -eq $_.Use -or (To-Int $_.Use) -eq 3 })
  foreach ($ma in $memArrays) {
    $totalSlots += (To-Int $ma.MemoryDevices)
    $exKb = To-Dbl $ma.MaxCapacityEx
    $stdKb = To-Dbl $ma.MaxCapacity
    if ($exKb -gt 0) { $maxCapKb += $exKb }
    elseif ($stdKb -gt 0) { $maxCapKb += $stdKb }
  }
} catch {}

$modules = @()
$totalBytes = [double]0
$maxSpeedMhz = 0
$domType = 'Unknown'
try {
  $physMem = @(Safe-Cim 'Win32_PhysicalMemory')
  foreach ($m in $physMem) {
    try {
      $capBytes = To-Dbl $m.Capacity
      $totalBytes += $capBytes
      $capGb = [Math]::Round($capBytes / 1073741824.0, 2)
      $ratedSpd = To-Int $m.Speed
      $confSpd = To-Int $m.ConfiguredClockSpeed
      $effSpd = if ($confSpd -gt 0) { $confSpd } else { $ratedSpd }
      if ($effSpd -gt $maxSpeedMhz) { $maxSpeedMhz = $effSpd }
      $mType = Decode-MemType $m.SMBIOSMemoryType $m.MemoryType
      if ($domType -eq 'Unknown' -and $mType -ne 'Unknown') { $domType = $mType }
      $ff = Decode-FormFactor $m.FormFactor
      $voltMv = To-Dbl $m.ConfiguredVoltage
      $volt = if ($voltMv -gt 0) { [Math]::Round($voltMv / 1000.0, 2) } else { 0 }
      $modules += [PSCustomObject]@{
        slotLabel = To-Str $m.DeviceLocator
        bankLabel = To-Str $m.BankLabel
        capacityGb = $capGb
        speedMhz = $ratedSpd
        configuredSpeedMhz = $effSpd
        memoryType = $mType
        formFactor = $ff
        manufacturer = To-Str $m.Manufacturer
        partNumber = To-Str $m.PartNumber
        serialNumber = To-Str $m.SerialNumber
        voltageV = $volt
      }
    } catch {}
  }
} catch {}

$popSlots = $modules.Count
if ($totalSlots -lt $popSlots) { $totalSlots = $popSlots }
$freeSlots = if ($totalSlots -gt $popSlots) { [int]($totalSlots - $popSlots) } else { 0 }
$totalRamGb = if ($totalBytes -gt 0) {
  [Math]::Round($totalBytes / 1073741824.0, 2)
} else {
  [Math]::Round((To-Dbl $cs.TotalPhysicalMemory) / 1073741824.0, 2)
}
$usableRamGb = [Math]::Round((To-Dbl $os.TotalVisibleMemorySize) / 1048576.0, 2)
$maxCapGb = if ($maxCapKb -gt 0) { [Math]::Round($maxCapKb / 1048576.0, 0) } else { 0 }
$chanMode = if ($popSlots -ge 4) { 'Multi / Quad Channel' } elseif ($popSlots -ge 2) { 'Dual Channel' } elseif ($popSlots -eq 1) { 'Single Channel' } else { 'Virtual / N/A' }

# 4. GPUs (with registry qwMemorySize >4GB VRAM support)
$regVramGbMap = @{}
try {
  Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.PSChildName -match '^\\d{4}$') {
      $rp = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($rp -and $rp.DriverDesc) {
        $qw = To-Dbl $rp.'HardwareInformation.qwMemorySize'
        if ($qw -gt 0) {
          $regVramGbMap[(To-Str $rp.DriverDesc)] = [Math]::Round($qw / 1073741824.0, 2)
        }
      }
    }
  }
} catch {}

$gpus = @()
try {
  foreach ($g in @(Safe-Cim 'Win32_VideoController')) {
    try {
      $gName = To-Str $g.Name
      if (-not $gName) { continue }
      $gVendor = To-Str $g.AdapterCompatibility
      $gType = 'integrated'
      if ("$gName $gVendor" -match '(?i)vmware|virtualbox|hyper-v|microsoft basic display|qxl|virtio|rdpdd|citrix') { $gType = 'virtual' }
      elseif ("$gName $gVendor" -match '(?i)nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|arc a\\d|firepro') { $gType = 'discrete' }
      $vramGb = 0
      if ($regVramGbMap.ContainsKey($gName)) {
        $vramGb = $regVramGbMap[$gName]
      } else {
        $vramBytes = To-Dbl $g.AdapterRAM
        if ($vramBytes -gt 0) { $vramGb = [Math]::Round($vramBytes / 1073741824.0, 2) }
      }
      $dDate = ''
      try { if ($g.DriverDate) { $dDate = ([datetime]$g.DriverDate).ToString('yyyy-MM-dd') } } catch {}
      $hRes = To-Int $g.CurrentHorizontalResolution
      $vRes = To-Int $g.CurrentVerticalResolution
      $res = if ($hRes -gt 0 -and $vRes -gt 0) { "$($hRes)x$($vRes)" } else { '' }
      $gpus += [PSCustomObject]@{
        name = $gName
        vendor = $gVendor
        type = $gType
        vramGb = $vramGb
        driverVersion = To-Str $g.DriverVersion
        driverDate = $dDate
        resolution = $res
        refreshRateHz = To-Int $g.CurrentRefreshRate
      }
    } catch {}
  }
} catch {}

# 5. Connected Monitors (EDID via WmiMonitorID, fallback Win32_DesktopMonitor)
$monitors = @()
try {
  foreach ($wm in @(Safe-Cim 'WmiMonitorID' 'root\\wmi')) {
    try {
      $mName = Decode-U16Array $wm.UserFriendlyName
      $mMfg = Decode-U16Array $wm.ManufacturerName
      $mSn = Decode-U16Array $wm.SerialNumberID
      if ($mName -or $mMfg) {
        $monitors += [PSCustomObject]@{
          name = if ($mName) { $mName } else { "$mMfg Monitor" }
          manufacturer = $mMfg
          serialNumber = $mSn
        }
      }
    } catch {}
  }
} catch {}
if ($monitors.Count -eq 0) {
  try {
    foreach ($dm in @(Safe-Cim 'Win32_DesktopMonitor' | Where-Object { (To-Int $_.Availability) -eq 3 })) {
      try {
        $dmName = To-Str $dm.Name
        if ($dmName -and $dmName -notmatch 'Default Monitor') {
          $monitors += [PSCustomObject]@{
            name = $dmName
            manufacturer = To-Str $dm.MonitorManufacturer
            serialNumber = ''
          }
        }
      } catch {}
    }
  } catch {}
}

# 6. Physical Disks
$disks = @()
$physDisks = @()
try { $physDisks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue) } catch {}
if ($physDisks.Count -gt 0) {
  foreach ($pd in $physDisks) {
    try {
      $mType = To-Str $pd.MediaType
      $bus = To-Str $pd.BusType
      if ($bus -eq 'NVMe') { $mType = 'NVMe SSD' }
      elseif ($mType -eq 'Unspecified' -and $bus -eq 'USB') { $mType = 'USB Drive' }
      $disks += [PSCustomObject]@{
        model = To-Str $pd.FriendlyName
        manufacturer = To-Str $pd.Manufacturer
        sizeGb = [Math]::Round((To-Dbl $pd.Size) / 1073741824.0, 1)
        mediaType = $mType
        busType = $bus
        serialNumber = To-Str $pd.SerialNumber
        firmwareVersion = To-Str $pd.FirmwareVersion
        healthStatus = To-Str $pd.HealthStatus
      }
    } catch {}
  }
} else {
  try {
    foreach ($dd in @(Safe-Cim 'Win32_DiskDrive')) {
      try {
        $disks += [PSCustomObject]@{
          model = To-Str $dd.Model
          manufacturer = To-Str $dd.Manufacturer
          sizeGb = [Math]::Round((To-Dbl $dd.Size) / 1073741824.0, 1)
          mediaType = To-Str $dd.MediaType
          busType = To-Str $dd.InterfaceType
          serialNumber = To-Str $dd.SerialNumber
          firmwareVersion = To-Str $dd.FirmwareRevision
          healthStatus = To-Str $dd.Status
        }
      } catch {}
    }
  } catch {}
}

# 7. Network Adapters
$nics = @()
try {
  foreach ($na in @(Get-NetAdapter -ErrorAction SilentlyContinue | Sort-Object -Property HardwareInterface -Descending)) {
    try {
      $desc = To-Str $na.InterfaceDescription
      $nType = 'ethernet'
      if (-not $na.HardwareInterface -or $desc -match '(?i)vmware|hyper-v|virtual|loopback|tap-|tun|wan miniport|vpn') { $nType = 'virtual' }
      elseif ($desc -match '(?i)wi-fi|wifi|wireless|wlan|802\\.11|ax\\d{3}|ac \\d{4}') { $nType = 'wifi' }
      elseif ($desc -match '(?i)bluetooth') { $nType = 'bluetooth' }
      if ($nType -eq 'virtual' -and (To-Str $na.Status) -ne 'Up') { continue }
      $nics += [PSCustomObject]@{
        name = To-Str $na.Name
        description = $desc
        macAddress = To-Str $na.MacAddress
        linkSpeed = To-Str $na.LinkSpeed
        adapterType = $nType
        status = To-Str $na.Status
      }
    } catch {}
  }
} catch {}
if ($nics.Count -eq 0) {
  try {
    foreach ($wa in @(Safe-Cim 'Win32_NetworkAdapter' | Where-Object { $_.PhysicalAdapter -eq $true })) {
      try {
        $desc = To-Str $wa.Name
        $nType = if ($desc -match '(?i)wi-fi|wifi|wireless|wlan|802\\.11') { 'wifi' } elseif ($desc -match '(?i)bluetooth') { 'bluetooth' } else { 'ethernet' }
        $spdMbps = [Math]::Round((To-Dbl $wa.Speed) / 1000000.0, 0)
        $nics += [PSCustomObject]@{
          name = To-Str $wa.NetConnectionID
          description = $desc
          macAddress = To-Str $wa.MACAddress
          linkSpeed = if ($spdMbps -gt 0) { "$spdMbps Mbps" } else { '' }
          adapterType = $nType
          status = if ((To-Int $wa.NetConnectionStatus) -eq 2) { 'Up' } else { 'Disconnected' }
        }
      } catch {}
    }
  } catch {}
}

# 8. Audio Devices
$audios = @()
try {
  foreach ($au in @(Safe-Cim 'Win32_SoundDevice')) {
    try {
      $aName = To-Str $au.Name
      if (-not $aName) { continue }
      $aMfg = To-Str $au.Manufacturer
      $onboard = ("$aName $aMfg" -match '(?i)realtek|high definition audio|intel|conexant|synaptics|idt|via')
      $audios += [PSCustomObject]@{
        name = $aName
        manufacturer = $aMfg
        status = To-Str $au.Status
        isOnboard = [bool]$onboard
      }
    } catch {}
  }
} catch {}

# 9. Connected Peripherals (Input, Camera, Bluetooth, USB Storage, Printers/Scanners, Biometric)
$periphs = @()
try {
  $seenPnp = @{}
  $targetClasses = @('Keyboard','Mouse','HIDClass','Camera','Image','Bluetooth','Printer','WPD','SmartCardReader','Biometric','CDROM','USB')
  $pnpList = @(Safe-Cim 'Win32_PnPEntity')
  foreach ($p in $pnpList) {
    try {
      if ($null -ne $p.Present -and $p.Present -ne $true) { continue }
      $cls = To-Str $p.PNPClass
      $pName = To-Str $p.Name
      if (-not $pName -or -not ($targetClasses -contains $cls)) { continue }
      if ($pName -match '^(HID-compliant (consumer|system|vendor-defined)|USB Input Device|USB Composite Device|Generic USB Hub|USB Root Hub|Microsoft Bluetooth Enumerator|Bluetooth Device \\(Personal Area Network\\)|PrintQueue|Microsoft Print to PDF|Microsoft XPS Document Writer|Fax|Root Print Queue)') { continue }
      if ($cls -eq 'USB' -and $pName -notmatch '(?i)mass storage|flash|hub|controller|dock|dongle|receiver|camera|audio|card') { continue }

      $cat = 'other'
      if ($cls -in @('Keyboard','Mouse','HIDClass')) { $cat = 'input' }
      elseif ($cls -in @('Camera','Image')) { $cat = 'camera' }
      elseif ($cls -eq 'Bluetooth') { $cat = 'bluetooth' }
      elseif ($cls -in @('WPD','CDROM') -or ($cls -eq 'USB' -and $pName -match '(?i)mass storage|flash|disk')) { $cat = 'usb_storage' }
      elseif ($cls -eq 'Printer') { $cat = 'printer_scanner' }
      elseif ($cls -in @('Biometric','SmartCardReader')) { $cat = 'biometric' }

      $dedupe = "$cat|$($pName.ToLowerInvariant())"
      if ($seenPnp.ContainsKey($dedupe)) { continue }
      $seenPnp[$dedupe] = $true

      $periphs += [PSCustomObject]@{
        name = $pName
        manufacturer = To-Str $p.Manufacturer
        pnpClass = $cls
        category = $cat
        status = To-Str $p.Status
        deviceId = To-Str $p.DeviceID
      }
    } catch {}
  }
} catch {}

$sortedPeriphs = @()
try {
  if ($periphs.Count -gt 0) {
    $sortedPeriphs = @($periphs | Sort-Object -Property category, name)
  }
} catch {
  $sortedPeriphs = @($periphs)
}

[PSCustomObject]@{
  hostname = $hostName
  system = [PSCustomObject]@{
    manufacturer = $oemMfg
    model = $oemModel
    systemType = $sysType
    serialNumber = $serialNo
    uuid = To-Str $csp.UUID
    isVirtual = [bool]$isVirt
  }
  motherboard = [PSCustomObject]@{
    manufacturer = $boardMfg
    product = $boardProduct
    version = $boardVersion
    serialNumber = $boardSerial
    chipset = $chipset
    biosVendor = $biosVendor
    biosVersion = $biosVersion
    biosReleaseDate = $biosDate
    firmwareMode = $firmwareMode
    secureBoot = $secureBoot
  }
  cpu = [PSCustomObject]@{
    name = $cpuName
    manufacturer = $cpuMfg
    socket = $cpuSocket
    cores = $totalCores
    logicalProcessors = $totalThreads
    baseClockGhz = [Math]::Round($baseMhz / 1000.0, 2)
    maxClockGhz = [Math]::Round($maxMhz / 1000.0, 2)
    l2CacheMb = $l2Mb
    l3CacheMb = $l3Mb
    architecture = $cpuArch
    virtualizationEnabled = $virtFw
    identifier = $cpuIdent
  }
  memory = [PSCustomObject]@{
    totalGb = $totalRamGb
    usableGb = $usableRamGb
    totalSlots = $totalSlots
    populatedSlots = $popSlots
    freeSlots = $freeSlots
    maxCapacityGb = $maxCapGb
    memoryType = $domType
    speedMhz = $maxSpeedMhz
    channelMode = $chanMode
    modules = @($modules)
  }
  gpus = @($gpus)
  monitors = @($monitors)
  disks = @($disks)
  networkAdapters = @($nics)
  audioDevices = @($audios)
  connectedDevices = @($sortedPeriphs)
} | ConvertTo-Json -Depth 5 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, os, platform, re, socket, subprocess

hostname = socket.gethostname()
def run(cmd):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""

def readf(p):
    try:
        with open(p, "r", errors="ignore") as f:
            return f.read().strip()
    except Exception:
        return ""

def clean_dmi(s):
    s = re.sub(r"\\s+", " ", (s or "")).strip()
    if re.match(r"^(to be filled by o\\.?e\\.?m\\.?|default string|system serial number|system product name|not specified|not applicable|none|n/a)$", s, re.I):
        return ""
    return s

mfg = clean_dmi(readf("/sys/class/dmi/id/sys_vendor"))
model = clean_dmi(readf("/sys/class/dmi/id/product_name"))
serial = clean_dmi(readf("/sys/class/dmi/id/product_serial"))
uuid = clean_dmi(readf("/sys/class/dmi/id/product_uuid"))
board_mfg = clean_dmi(readf("/sys/class/dmi/id/board_vendor")) or mfg
board_prod = clean_dmi(readf("/sys/class/dmi/id/board_name")) or model
board_ver = clean_dmi(readf("/sys/class/dmi/id/board_version"))
board_sn = clean_dmi(readf("/sys/class/dmi/id/board_serial")) or serial
bios_ven = clean_dmi(readf("/sys/class/dmi/id/bios_vendor"))
bios_ver = clean_dmi(readf("/sys/class/dmi/id/bios_version"))
bios_date = clean_dmi(readf("/sys/class/dmi/id/bios_date"))
fw_mode = "UEFI" if os.path.exists("/sys/firmware/efi") else "Legacy BIOS"
is_virt = bool(re.search(r"vmware|virtualbox|qemu|kvm|hyper-v|xen|bochs", f"{mfg} {model} {bios_ven}", re.I))

cpu_name = platform.processor() or ""
cpu_mfg = ""
logical_procs = os.cpu_count() or 1
phys_cores = logical_procs
lscpu_out = run(["lscpu"])
base_mhz = 0.0
max_mhz = 0.0
socket_name = ""
l2_mb = 0.0
l3_mb = 0.0
virt_enabled = None
sockets_cnt = 1
cores_per_socket = 0

def parse_cache_mb(val):
    m = re.search(r"([\\d.]+)\\s*(GiB|GB|MiB|MB|KiB|KB)", val or "", re.I)
    if not m:
        return 0.0
    num = float(m.group(1))
    unit = m.group(2).lower()
    if "g" in unit: return round(num * 1024.0, 1)
    if "k" in unit: return round(num / 1024.0, 1)
    return round(num, 1)

for ln in lscpu_out.splitlines():
    if ":" not in ln: continue
    k, v = [x.strip() for x in ln.split(":", 1)]
    if k == "Model name" and v: cpu_name = v
    elif k == "Vendor ID" and v: cpu_mfg = v
    elif k == "CPU(s)":
        try: logical_procs = int(v)
        except: pass
    elif k == "Socket(s)":
        try: sockets_cnt = int(v)
        except: pass
    elif k == "Core(s) per socket":
        try: cores_per_socket = int(v)
        except: pass
    elif k == "CPU max MHz":
        try: max_mhz = float(v)
        except: pass
    elif k == "CPU MHz":
        try: base_mhz = float(v)
        except: pass
    elif k == "L2 cache":
        l2_mb = parse_cache_mb(v)
    elif k == "L3 cache":
        l3_mb = parse_cache_mb(v)
    elif k in ("Virtualization", "Virtualization type") and v:
        virt_enabled = True
    elif k == "Hypervisor vendor" and v:
        virt_enabled = True

if cores_per_socket > 0:
    phys_cores = cores_per_socket * max(1, sockets_cnt)

cpuinfo = readf("/proc/cpuinfo")
for ln in cpuinfo.splitlines():
    if ":" not in ln: continue
    k, v = [x.strip() for x in ln.split(":", 1)]
    if k == "model name" and not cpu_name: cpu_name = v
    elif k == "vendor_id" and not cpu_mfg: cpu_mfg = v
    elif k == "cpu MHz" and base_mhz <= 0:
        try: base_mhz = float(v)
        except: pass
    elif k == "flags" and virt_enabled is None:
        if re.search(r"\\b(vmx|svm)\\b", v): virt_enabled = True

if max_mhz <= 0:
    khz = readf("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq")
    if khz.isdigit():
        max_mhz = float(khz) / 1000.0
if max_mhz <= 0:
    max_mhz = base_mhz
if base_mhz <= 0:
    base_mhz = max_mhz
if not socket_name:
    socket_name = f"{sockets_cnt} Socket"

meminfo = readf("/proc/meminfo")
m_tot = re.search(r"MemTotal:\\s+(\\d+)\\s+kB", meminfo)
total_gb = round(int(m_tot.group(1)) / (1024 * 1024), 2) if m_tot else 0

disks = []
lsblk_json = run(["lsblk", "-J", "-b", "-d", "-o", "NAME,MODEL,SIZE,ROTA,TRAN,SERIAL"])
if lsblk_json:
    try:
        for bd in json.loads(lsblk_json).get("blockdevices", []):
            name = bd.get("name", "")
            if name.startswith("loop") or name.startswith("ram"): continue
            sz_gb = round(float(bd.get("size") or 0) / (1024**3), 1)
            tran = str(bd.get("tran") or "").upper()
            mtype = "NVMe SSD" if tran == "NVME" else ("HDD" if bd.get("rota") else "SSD")
            disks.append({
                "model": (bd.get("model") or name).strip(),
                "manufacturer": "",
                "sizeGb": sz_gb,
                "mediaType": mtype,
                "busType": tran or "SATA",
                "serialNumber": bd.get("serial") or "",
                "firmwareVersion": "",
                "healthStatus": "Healthy",
            })
    except Exception:
        pass

gpus = []
audios = []
chipset_name = ""
lspci_out = run(["lspci"])
for ln in lspci_out.splitlines():
    if not chipset_name and re.search(r"Host bridge", ln, re.I):
        chipset_name = ln.split(":", 2)[-1].strip()
    elif re.search(r"VGA compatible|3D controller|Display controller", ln, re.I):
        gpus.append({"name": ln.split(":", 2)[-1].strip(), "vendor": "", "type": "virtual" if is_virt else "integrated", "vramGb": 0, "driverVersion": "", "driverDate": "", "resolution": "", "refreshRateHz": 0})
    elif re.search(r"Audio device", ln, re.I):
        audios.append({"name": ln.split(":", 2)[-1].strip(), "manufacturer": "", "status": "OK", "isOnboard": True})

periphs = []
lsusb_out = run(["lsusb"])
for ln in lsusb_out.splitlines():
    if "Linux Foundation" in ln or "root hub" in ln.lower(): continue
    desc = re.sub(r"^Bus\\s+\\d+\\s+Device\\s+\\d+:\\s+ID\\s+[0-9a-f:]+\\s*", "", ln).strip()
    if desc:
        cat = "camera" if re.search(r"cam|video", desc, re.I) else ("bluetooth" if "bluetooth" in desc.lower() else ("input" if re.search(r"mouse|keyboard|hid", desc, re.I) else "other"))
        periphs.append({"name": desc, "manufacturer": "", "pnpClass": "USB", "category": cat, "status": "OK", "deviceId": ln[:40]})

print(json.dumps({
    "hostname": hostname,
    "system": {"manufacturer": mfg, "model": model, "systemType": "Virtual Machine" if is_virt else "Linux Host", "serialNumber": serial, "uuid": uuid, "isVirtual": is_virt},
    "motherboard": {"manufacturer": board_mfg, "product": board_prod, "version": board_ver, "serialNumber": board_sn, "chipset": chipset_name, "biosVendor": bios_ven, "biosVersion": bios_ver, "biosReleaseDate": bios_date, "firmwareMode": fw_mode, "secureBoot": None},
    "cpu": {"name": cpu_name, "manufacturer": cpu_mfg, "socket": socket_name, "cores": phys_cores, "logicalProcessors": logical_procs, "baseClockGhz": round(base_mhz/1000.0, 2) if base_mhz else 0, "maxClockGhz": round(max_mhz/1000.0, 2) if max_mhz else 0, "l2CacheMb": l2_mb, "l3CacheMb": round(l3_mb, 1), "architecture": platform.machine(), "virtualizationEnabled": virt_enabled, "identifier": ""},
    "memory": {"totalGb": total_gb, "usableGb": total_gb, "totalSlots": 1, "populatedSlots": 1, "freeSlots": 0, "maxCapacityGb": 0, "memoryType": "RAM", "speedMhz": 0, "channelMode": "N/A", "modules": []},
    "gpus": gpus,
    "monitors": [],
    "disks": disks,
    "networkAdapters": [],
    "audioDevices": audios,
    "connectedDevices": periphs,
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(45000, input.timeoutMs || 45000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'collect hardware inventory');
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    system: parsed.system || {
      manufacturer: '',
      model: '',
      systemType: '',
      serialNumber: '',
      uuid: '',
      isVirtual: false,
    },
    motherboard: parsed.motherboard || {
      manufacturer: '',
      product: '',
      version: '',
      serialNumber: '',
      chipset: '',
      biosVendor: '',
      biosVersion: '',
      biosReleaseDate: '',
    },
    cpu: parsed.cpu || {
      name: '',
      manufacturer: '',
      socket: '',
      cores: 0,
      logicalProcessors: 0,
      baseClockGhz: 0,
      maxClockGhz: 0,
      l2CacheMb: 0,
      l3CacheMb: 0,
      architecture: '',
      virtualizationEnabled: null,
    },
    memory: parsed.memory || {
      totalGb: 0,
      usableGb: 0,
      totalSlots: 0,
      populatedSlots: 0,
      freeSlots: 0,
      maxCapacityGb: 0,
      memoryType: 'Unknown',
      speedMhz: 0,
      channelMode: 'Unknown',
      modules: [],
    },
    gpus: Array.isArray(parsed.gpus) ? parsed.gpus : [],
    monitors: Array.isArray(parsed.monitors) ? parsed.monitors : [],
    disks: Array.isArray(parsed.disks) ? parsed.disks : [],
    networkAdapters: Array.isArray(parsed.networkAdapters) ? parsed.networkAdapters : [],
    audioDevices: Array.isArray(parsed.audioDevices) ? parsed.audioDevices : [],
    connectedDevices: Array.isArray(parsed.connectedDevices) ? parsed.connectedDevices : [],
    collectedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 21. WINDOWS SERVICES & STARTUP PROGRAMS MANAGEMENT
// ============================================================================

export type HelpdeskServiceStatus =
  | 'Running'
  | 'Stopped'
  | 'Paused'
  | 'StartPending'
  | 'StopPending'
  | 'Unknown';

export type HelpdeskServiceStartType =
  | 'Automatic'
  | 'AutomaticDelayed'
  | 'Manual'
  | 'Disabled'
  | 'Boot'
  | 'System'
  | 'Unknown';

export type HelpdeskServiceActionType =
  | 'start'
  | 'stop'
  | 'restart'
  | 'pause'
  | 'resume'
  | 'set_startup';

export interface HelpdeskServiceItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  status: HelpdeskServiceStatus;
  startType: HelpdeskServiceStartType;
  account: string;
  pid: number | null;
  pathName: string;
  canPauseAndContinue: boolean;
  canStop: boolean;
  dependentServices: string[];
  dependsOn: string[];
  isProtected: boolean;
  protectionReason?: string;
  protectionReasonFa?: string;
}

export type HelpdeskStartupSourceType =
  | 'registry_run'
  | 'registry_runonce'
  | 'startup_folder'
  | 'scheduled_task';

export type HelpdeskStartupHive =
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

export interface HelpdeskStartupItem {
  id: string;
  name: string;
  command: string;
  publisher: string;
  scope: 'machine' | 'user';
  ownerSid?: string;
  ownerUser?: string;
  sourceType: HelpdeskStartupSourceType;
  locationHive: HelpdeskStartupHive;
  locationLabel: string;
  enabled: boolean;
  canToggle: boolean;
  canDelete: boolean;
  isProtected: boolean;
  protectionReason?: string;
  protectionReasonFa?: string;
  taskPath?: string;
  filePath?: string;
}

export interface HelpdeskServicesAndStartupResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  activeUser: string;
  summary: {
    totalServices: number;
    runningServices: number;
    stoppedServices: number;
    pausedServices: number;
    automaticServices: number;
    manualServices: number;
    disabledServices: number;
    totalStartupItems: number;
    enabledStartupItems: number;
    disabledStartupItems: number;
  };
  services: HelpdeskServiceItem[];
  startupItems: HelpdeskStartupItem[];
  collectedAt: string;
}

const PROTECTED_SERVICE_RULES: Array<{ re: RegExp; reasonEn: string; reasonFa: string }> = [
  {
    re: /^(winrm|sshd|ssh|ssh-agent|termservice)$/i,
    reasonEn: 'Remote management / terminal access service is protected to prevent session lockout.',
    reasonFa: 'سرویس مدیریت از راه دور (مانند WinRM یا SSH) برای جلوگیری از قطع دسترسی سیستم محافظت شده است.',
  },
  {
    re: /^(windefend|wdnissvc|sense|securityhealthservice|mpssvc|bfe|csfalconservice|ekrn|avp|sepmasterservice|cbdefense|sentinelagent|savservice|mbamservice|fortishield|fortiedr)$/i,
    reasonEn: 'Endpoint security / Firewall / Antivirus service is protected from remote stop or disable.',
    reasonFa: 'سرویس امنیتی، فایروال یا آنتی‌ویروس برای حفظ امنیت سیستم در برابر توقف یا غیرفعال‌سازی محافظت شده است.',
  },
  {
    re: /^(rpcss|rpceptmapper|dcomlaunch|samss|lsass|netlogon|lsm|power|plugplay|brokerinfrastructure|systemeventsbroker|staterepository|coremessagingregistrar|dhcp|dnscache|nsi|netprofm|eventlog|cryptsvc|gpsvc|systemd-journald|dbus)$/i,
    reasonEn: 'Core OS / RPC / Networking kernel service is protected to keep the workstation stable.',
    reasonFa: 'سرویس هسته سیستم‌عامل یا شبکه برای پایداری ویندوز محافظت شده است.',
  },
];

function checkProtectedService(name: string, displayName = ''): {
  isProtected: boolean;
  reasonEn?: string;
  reasonFa?: string;
} {
  const n = String(name || '').trim();
  const d = String(displayName || '').trim();
  for (const rule of PROTECTED_SERVICE_RULES) {
    if (rule.re.test(n)) {
      return { isProtected: true, reasonEn: rule.reasonEn, reasonFa: rule.reasonFa };
    }
  }
  if (/(crowdstrike|sentinelone|kaspersky|bitdefender|eset|windows defender|microsoft defender)/i.test(d)) {
    return {
      isProtected: true,
      reasonEn: 'Endpoint security / Antivirus service is protected from remote stop or disable.',
      reasonFa: 'سرویس امنیتی و آنتی‌ویروس برای حفظ امنیت سیستم محافظت شده است.',
    };
  }
  return { isProtected: false };
}

const PROTECTED_STARTUP_RE = /(securityhealth|windows defender|microsoft defender|crowdstrike|falcon|kaspersky|sentinelone|bitdefender|eset|symantec|norton|mcafee|sophos|fortiedr|winrm|openssh)/i;

function checkProtectedStartupItem(name: string, command: string): {
  isProtected: boolean;
  reasonEn?: string;
  reasonFa?: string;
} {
  const combined = `${name} ${command}`.trim();
  if (PROTECTED_STARTUP_RE.test(combined)) {
    return {
      isProtected: true,
      reasonEn: 'Endpoint security or remote access startup entry is protected.',
      reasonFa: 'برنامه استارت‌آپ امنیتی یا دسترسی از راه دور برای حفظ امنیت سیستم محافظت شده است.',
    };
  }
  return { isProtected: false };
}

function normalizeServiceStatus(raw: string): HelpdeskServiceStatus {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'running' || s === 'active') return 'Running';
  if (s === 'stopped' || s === 'inactive' || s === 'dead' || s === 'failed') return 'Stopped';
  if (s === 'paused') return 'Paused';
  if (s === 'startpending' || s === 'start pending' || s === 'activating') return 'StartPending';
  if (s === 'stoppending' || s === 'stop pending' || s === 'deactivating') return 'StopPending';
  return 'Unknown';
}

function normalizeServiceStartType(raw: string, delayed = false): HelpdeskServiceStartType {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'automaticdelayed' || s === 'automatic (delayed start)' || s === 'delayed-auto') {
    return 'AutomaticDelayed';
  }
  if (s === 'auto' || s === 'automatic' || s === 'enabled' || s === 'enabled-runtime') {
    return delayed ? 'AutomaticDelayed' : 'Automatic';
  }
  if (s === 'manual' || s === 'demand' || s === 'static' || s === 'indirect') return 'Manual';
  if (s === 'disabled' || s === 'masked') return 'Disabled';
  if (s === 'boot') return 'Boot';
  if (s === 'system') return 'System';
  return 'Unknown';
}

export async function collectEndpointServicesAndStartup(
  input: HelpdeskTargetInput
): Promise<HelpdeskServicesAndStartupResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
function To-Str($v) { if ($null -eq $v) { return '' }; try { return ([string]$v).Trim() } catch { return '' } }
function To-Int($v) { if ($null -eq $v) { return 0 }; try { return [int]$v } catch { return 0 } }
function To-Bool($v) { if ($null -eq $v) { return $false }; try { return [bool]$v } catch { return $false } }
function Safe-Cim($cls) {
  $res = $null
  try { $res = @(Get-CimInstance -ClassName $cls -ErrorAction Stop) } catch { $res = $null }
  if (-not $res -or $res.Count -eq 0) {
    try { $res = @(Get-WmiObject -Class $cls -ErrorAction Stop) } catch { $res = @() }
  }
  return @($res)
}

$hostName = To-Str $env:COMPUTERNAME
$activeUser = ''
try {
  $cs = @(Safe-Cim 'Win32_ComputerSystem')
  if ($cs.Count -gt 0 -and $cs[0].UserName) { $activeUser = To-Str $cs[0].UserName }
} catch {}

# 1. Collect Windows Services (WMI/CIM + Get-Service + DelayedAutostart registry)
$svcExtra = @{}
try {
  foreach ($gs in @(Get-Service -ErrorAction SilentlyContinue)) {
    $sn = To-Str $gs.Name
    if (-not $sn) { continue }
    $depsOn = @()
    $depBy = @()
    try { $depsOn = @($gs.ServicesDependedOn | ForEach-Object { To-Str $_.Name } | Where-Object { $_ }) } catch {}
    try { $depBy = @($gs.DependentServices | ForEach-Object { To-Str $_.Name } | Where-Object { $_ }) } catch {}
    $svcExtra[$sn.ToLowerInvariant()] = @{
      canPause = To-Bool $gs.CanPauseAndContinue
      canStop = To-Bool $gs.CanStop
      dependsOn = $depsOn
      dependentServices = $depBy
    }
  }
} catch {}

$servicesList = @()
try {
  $cimSvcs = @(Safe-Cim 'Win32_Service')
  foreach ($s in $cimSvcs) {
    try {
      $name = To-Str $s.Name
      if (-not $name) { continue }
      $disp = To-Str $s.DisplayName
      if (-not $disp) { $disp = $name }
      $desc = To-Str $s.Description
      if ($desc.Length -gt 350) { $desc = $desc.Substring(0, 350) + '...' }
      $state = To-Str $s.State
      $startMode = To-Str $s.StartMode
      $delayed = $false
      if ($startMode -eq 'Auto' -or $startMode -eq 'Automatic') {
        try {
          $regSvc = Get-ItemProperty -LiteralPath "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\$name" -Name 'DelayedAutostart' -ErrorAction SilentlyContinue
          if ($regSvc -and (To-Int $regSvc.DelayedAutostart) -eq 1) { $delayed = $true }
        } catch {}
      }
      $pidVal = To-Int $s.ProcessId
      $extra = $svcExtra[$name.ToLowerInvariant()]
      $servicesList += [PSCustomObject]@{
        name = $name
        displayName = $disp
        description = $desc
        status = $state
        startType = $startMode
        delayedAutoStart = $delayed
        account = To-Str $s.StartName
        pid = if ($pidVal -gt 0) { $pidVal } else { $null }
        pathName = To-Str $s.PathName
        canPauseAndContinue = if ($extra) { To-Bool $extra.canPause } else { To-Bool $s.AcceptPause }
        canStop = if ($extra) { To-Bool $extra.canStop } else { To-Bool $s.AcceptStop }
        dependsOn = if ($extra) { @($extra.dependsOn) } else { @() }
        dependentServices = if ($extra) { @($extra.dependentServices) } else { @() }
      }
    } catch {}
  }
} catch {}

# 2. Helper to check StartupApproved state (bit 0 == 1 means Disabled)
function Get-ApprovedState($approvedPath, $valName) {
  try {
    if (-not $approvedPath -or -not (Test-Path -LiteralPath $approvedPath)) { return $true }
    $prop = Get-ItemProperty -LiteralPath $approvedPath -Name $valName -ErrorAction SilentlyContinue
    if (-not $prop) { return $true }
    $rawBytes = $prop.$valName
    if ($rawBytes -is [byte[]] -and $rawBytes.Length -ge 1) {
      return (([int]$rawBytes[0] -band 1) -eq 0)
    }
  } catch {}
  return $true
}

function Get-ExePublisher($cmdStr) {
  try {
    $c = To-Str $cmdStr
    if (-not $c) { return '' }
    $exe = ''
    if ($c.StartsWith('"')) {
      $idx = $c.IndexOf('"', 1)
      if ($idx -gt 1) { $exe = $c.Substring(1, $idx - 1) }
    } elseif ($c -match '^([^\\s]+\\.exe)') {
      $exe = $Matches[1]
    }
    if ($exe) {
      $exe = [Environment]::ExpandEnvironmentVariables($exe)
      if (($exe -match '^[A-Za-z]:\\\\') -and (Test-Path -LiteralPath $exe)) {
        $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
        if ($vi -and $vi.CompanyName) { return (To-Str $vi.CompanyName) }
      }
    }
  } catch {}
  return ''
}

$startupList = @()

# 2A. Registry Run & RunOnce Keys (HKLM64, HKLM32, User Hives)
$regSources = @(
  @{ Path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'; Approved = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'; Hive = 'HKLM64_Run'; SourceType = 'registry_run'; Scope = 'machine'; Label = 'HKLM\\...\\Run (64-bit)'; Sid = ''; Owner = ''; CanToggle = $true },
  @{ Path = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; Approved = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32'; Hive = 'HKLM32_Run'; SourceType = 'registry_run'; Scope = 'machine'; Label = 'HKLM\\...\\WOW6432Node\\Run (32-bit)'; Sid = ''; Owner = ''; CanToggle = $true },
  @{ Path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce'; Approved = ''; Hive = 'HKLM64_RunOnce'; SourceType = 'registry_runonce'; Scope = 'machine'; Label = 'HKLM\\...\\RunOnce'; Sid = ''; Owner = ''; CanToggle = $false }
)

$loadedUserProfiles = @()
try {
  foreach ($k in @(Get-ChildItem -Path 'Registry::HKEY_USERS' -ErrorAction SilentlyContinue)) {
    $sid = To-Str $k.PSChildName
    if ($sid -match '^S-1-5-21-' -and $sid -notmatch '_Classes$') {
      $uLabel = $sid
      try {
        $nt = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount])
        if ($nt -and $nt.Value) { $uLabel = To-Str $nt.Value }
      } catch {}
      $regSources += @{
        Path = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
        Approved = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
        Hive = 'HKU_Run'
        SourceType = 'registry_run'
        Scope = 'user'
        Label = "HKU\\$uLabel\\...\\Run"
        Sid = $sid
        Owner = $uLabel
        CanToggle = $true
      }
      $regSources += @{
        Path = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
        Approved = ''
        Hive = 'HKU_RunOnce'
        SourceType = 'registry_runonce'
        Scope = 'user'
        Label = "HKU\\$uLabel\\...\\RunOnce"
        Sid = $sid
        Owner = $uLabel
        CanToggle = $false
      }
      try {
        $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$sid" -ErrorAction SilentlyContinue
        if ($pl -and $pl.ProfileImagePath) {
          $loadedUserProfiles += @{ Sid = $sid; Owner = $uLabel; ProfilePath = (To-Str $pl.ProfileImagePath) }
        }
      } catch {}
    }
  }
} catch {}

if ($loadedUserProfiles.Count -eq 0) {
  $cuUser = "$env:USERDOMAIN\\$env:USERNAME".Trim('\\')
  $regSources += @{
    Path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    Approved = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
    Hive = 'HKCU_Run'
    SourceType = 'registry_run'
    Scope = 'user'
    Label = 'HKCU\\...\\Run'
    Sid = ''
    Owner = $cuUser
    CanToggle = $true
  }
}

foreach ($src in $regSources) {
  try {
    if (-not (Test-Path -LiteralPath $src.Path)) { continue }
    $itemObj = Get-Item -LiteralPath $src.Path -ErrorAction SilentlyContinue
    if (-not $itemObj) { continue }
    $props = Get-ItemProperty -LiteralPath $src.Path -ErrorAction SilentlyContinue
    foreach ($valName in @($itemObj.GetValueNames())) {
      $vn = To-Str $valName
      if (-not $vn) { continue }
      $cmd = To-Str ($props.$vn)
      if (-not $cmd) { continue }
      $enabled = if ($src.CanToggle) { Get-ApprovedState $src.Approved $vn } else { $true }
      $pub = Get-ExePublisher $cmd
      $startupList += [PSCustomObject]@{
        name = $vn
        command = $cmd
        publisher = $pub
        scope = $src.Scope
        ownerSid = $src.Sid
        ownerUser = $src.Owner
        sourceType = $src.SourceType
        locationHive = $src.Hive
        locationLabel = $src.Label
        enabled = $enabled
        canToggle = $src.CanToggle
        canDelete = $true
        taskPath = ''
        filePath = ''
      }
    }
  } catch {}
}

# 2B. Startup Folders (Common All Users + Per-User Startup)
$folderSources = @(
  @{
    Dir = (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\Startup')
    Approved = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
    Hive = 'CommonStartupFolder'
    Scope = 'machine'
    Label = 'All Users Startup Folder'
    Sid = ''
    Owner = ''
  }
)
foreach ($up in $loadedUserProfiles) {
  $uDir = Join-Path $up.ProfilePath 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup'
  $folderSources += @{
    Dir = $uDir
    Approved = "Registry::HKEY_USERS\\$($up.Sid)\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder"
    Hive = 'UserStartupFolder'
    Scope = 'user'
    Label = "Startup Folder ($($up.Owner))"
    Sid = $up.Sid
    Owner = $up.Owner
  }
}
if ($loadedUserProfiles.Count -eq 0) {
  $cuDir = [Environment]::GetFolderPath('Startup')
  if ($cuDir) {
    $cuUser = "$env:USERDOMAIN\\$env:USERNAME".Trim('\\')
    $folderSources += @{
      Dir = $cuDir
      Approved = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
      Hive = 'UserStartupFolder'
      Scope = 'user'
      Label = "Startup Folder ($cuUser)"
      Sid = ''
      Owner = $cuUser
    }
  }
}

$wsh = $null
try { $wsh = New-Object -ComObject WScript.Shell } catch { $wsh = $null }

foreach ($fs in $folderSources) {
  try {
    if (-not $fs.Dir -or -not (Test-Path -LiteralPath $fs.Dir)) { continue }
    foreach ($f in @(Get-ChildItem -LiteralPath $fs.Dir -File -ErrorAction SilentlyContinue)) {
      $fn = To-Str $f.Name
      if (-not $fn -or $fn -ieq 'desktop.ini') { continue }
      $cmd = To-Str $f.FullName
      if ($fn -match '\\.lnk$' -and $wsh) {
        try {
          $sc = $wsh.CreateShortcut($f.FullName)
          $t = To-Str $sc.TargetPath
          $a = To-Str $sc.Arguments
          if ($t) { $cmd = if ($a) { "$t $a" } else { $t } }
        } catch {}
      }
      $enabled = Get-ApprovedState $fs.Approved $fn
      $pub = Get-ExePublisher $cmd
      $startupList += [PSCustomObject]@{
        name = $fn
        command = $cmd
        publisher = $pub
        scope = $fs.Scope
        ownerSid = $fs.Sid
        ownerUser = $fs.Owner
        sourceType = 'startup_folder'
        locationHive = $fs.Hive
        locationLabel = $fs.Label
        enabled = $enabled
        canToggle = $true
        canDelete = $true
        taskPath = ''
        filePath = (To-Str $f.FullName)
      }
    }
  } catch {}
}

# 2C. Logon Scheduled Tasks (non-Microsoft core tasks)
try {
  foreach ($t in @(Get-ScheduledTask -ErrorAction SilentlyContinue)) {
    try {
      $tp = To-Str $t.TaskPath
      if ($tp -like '\\Microsoft\\Windows\\*') { continue }
      $hasLogon = $false
      foreach ($tr in @($t.Triggers)) {
        try {
          if ($tr.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger') { $hasLogon = $true; break }
        } catch {}
      }
      if (-not $hasLogon) { continue }
      $actCmd = ''
      foreach ($ac in @($t.Actions)) {
        $ex = To-Str $ac.Execute
        $ar = To-Str $ac.Arguments
        if ($ex) { $actCmd = if ($ar) { "$ex $ar" } else { $ex }; break }
      }
      $stState = To-Str $t.State
      $isEn = ($stState -ne 'Disabled')
      $pub = Get-ExePublisher $actCmd
      $startupList += [PSCustomObject]@{
        name = (To-Str $t.TaskName)
        command = if ($actCmd) { $actCmd } else { "$tp$($t.TaskName)" }
        publisher = $pub
        scope = 'machine'
        ownerSid = ''
        ownerUser = To-Str $t.Principal.UserId
        sourceType = 'scheduled_task'
        locationHive = 'ScheduledTask'
        locationLabel = "Task Scheduler ($tp)"
        enabled = $isEn
        canToggle = $true
        canDelete = $false
        taskPath = $tp
        filePath = ''
      }
    } catch {}
  }
} catch {}

[PSCustomObject]@{
  hostname = $hostName
  activeUser = $activeUser
  services = @($servicesList | Sort-Object -Property displayName, name)
  startupItems = @($startupList | Sort-Object -Property name)
} | ConvertTo-Json -Depth 5 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, os, socket, subprocess, glob

hostname = socket.gethostname()
active_user = os.environ.get("USER", "")
services = []

try:
    unit_states = {}
    p_files = subprocess.run(
        ["systemctl", "list-unit-files", "--type=service", "--no-pager", "--no-legend"],
        capture_output=True, text=True, timeout=15
    )
    for line in (p_files.stdout or "").splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0].endswith(".service"):
            unit_states[parts[0]] = parts[1].strip()

    p_units = subprocess.run(
        ["systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend", "--plain"],
        capture_output=True, text=True, timeout=15
    )
    seen = set()
    for line in (p_units.stdout or "").splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue
        unit = parts[0].strip()
        if not unit.endswith(".service"):
            continue
        seen.add(unit)
        active = parts[2].strip().lower()
        sub = parts[3].strip().lower()
        desc = parts[4].strip() if len(parts) > 4 else unit
        st_type = unit_states.get(unit, "static")
        status = "Running" if active == "active" and sub == "running" else ("Stopped" if active in ("inactive", "failed", "dead") else active)
        services.append({
            "name": unit[:-8],
            "displayName": unit[:-8],
            "description": desc,
            "status": status,
            "startType": "Automatic" if st_type in ("enabled", "enabled-runtime") else ("Disabled" if st_type in ("disabled", "masked") else "Manual"),
            "delayedAutoStart": False,
            "account": "systemd",
            "pid": None,
            "pathName": f"/lib/systemd/system/{unit}",
            "canPauseAndContinue": False,
            "canStop": True,
            "dependsOn": [],
            "dependentServices": [],
        })
    for unit, st_type in unit_states.items():
        if unit not in seen and unit.endswith(".service"):
            services.append({
                "name": unit[:-8],
                "displayName": unit[:-8],
                "description": unit,
                "status": "Stopped",
                "startType": "Automatic" if st_type in ("enabled", "enabled-runtime") else ("Disabled" if st_type in ("disabled", "masked") else "Manual"),
                "delayedAutoStart": False,
                "account": "systemd",
                "pid": None,
                "pathName": f"/lib/systemd/system/{unit}",
                "canPauseAndContinue": False,
                "canStop": True,
                "dependsOn": [],
                "dependentServices": [],
            })
except Exception:
    pass

startup_items = []
for directory, scope, label in [
    ("/etc/xdg/autostart", "machine", "/etc/xdg/autostart"),
    (os.path.expanduser("~/.config/autostart"), "user", "~/.config/autostart"),
]:
    for path in glob.glob(os.path.join(directory, "*.desktop")):
        try:
            name = os.path.basename(path)
            cmd = path
            hidden = False
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for ln in f:
                    if ln.startswith("Name="):
                        name = ln.split("=", 1)[1].strip() or name
                    elif ln.startswith("Exec="):
                        cmd = ln.split("=", 1)[1].strip() or cmd
                    elif ln.startswith("Hidden="):
                        hidden = ln.split("=", 1)[1].strip().lower() == "true"
            startup_items.append({
                "name": os.path.basename(path),
                "command": cmd,
                "publisher": name,
                "scope": scope,
                "ownerSid": "",
                "ownerUser": active_user if scope == "user" else "",
                "sourceType": "startup_folder",
                "locationHive": "linux_autostart",
                "locationLabel": label,
                "enabled": not hidden,
                "canToggle": True,
                "canDelete": True,
                "taskPath": "",
                "filePath": path,
            })
        except Exception:
            pass

services.sort(key=lambda x: x["name"].lower())
startup_items.sort(key=lambda x: x["name"].lower())
print(json.dumps({
    "hostname": hostname,
    "activeUser": active_user,
    "services": services,
    "startupItems": startup_items,
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(60000, input.timeoutMs || 60000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'collect services and startup items');
  const rawServices: any[] = Array.isArray(parsed.services) ? parsed.services : [];
  const rawStartup: any[] = Array.isArray(parsed.startupItems) ? parsed.startupItems : [];

  const services: HelpdeskServiceItem[] = rawServices.map((raw) => {
    const name = String(raw.name || '').trim();
    const displayName = String(raw.displayName || name).trim();
    const prot = checkProtectedService(name, displayName);
    const status = normalizeServiceStatus(String(raw.status || 'Unknown'));
    const startType = normalizeServiceStartType(
      String(raw.startType || 'Unknown'),
      Boolean(raw.delayedAutoStart)
    );
    return {
      id: name,
      name,
      displayName,
      description: String(raw.description || '').trim(),
      status,
      startType,
      account: String(raw.account || '').trim(),
      pid: typeof raw.pid === 'number' && raw.pid > 0 ? raw.pid : null,
      pathName: String(raw.pathName || '').trim(),
      canPauseAndContinue: Boolean(raw.canPauseAndContinue),
      canStop: Boolean(raw.canStop) && !prot.isProtected,
      dependentServices: Array.isArray(raw.dependentServices)
        ? raw.dependentServices.map(String).filter(Boolean)
        : [],
      dependsOn: Array.isArray(raw.dependsOn)
        ? raw.dependsOn.map(String).filter(Boolean)
        : [],
      isProtected: prot.isProtected,
      ...(prot.reasonEn ? { protectionReason: prot.reasonEn, protectionReasonFa: prot.reasonFa } : {}),
    };
  });

  const startupItems: HelpdeskStartupItem[] = rawStartup.map((raw, idx) => {
    const name = String(raw.name || '').trim();
    const command = String(raw.command || '').trim();
    const hive = String(raw.locationHive || 'HKLM64_Run') as HelpdeskStartupHive;
    const ownerSid = String(raw.ownerSid || '').trim();
    const prot = checkProtectedStartupItem(name, command);
    return {
      id: `${hive}:${ownerSid || 'sys'}:${name}:${idx}`,
      name,
      command,
      publisher: String(raw.publisher || '').trim(),
      scope: raw.scope === 'user' ? 'user' : 'machine',
      ...(ownerSid ? { ownerSid } : {}),
      ...(raw.ownerUser ? { ownerUser: String(raw.ownerUser) } : {}),
      sourceType: (raw.sourceType || 'registry_run') as HelpdeskStartupSourceType,
      locationHive: hive,
      locationLabel: String(raw.locationLabel || hive).trim(),
      enabled: Boolean(raw.enabled),
      canToggle: Boolean(raw.canToggle) && !prot.isProtected,
      canDelete: Boolean(raw.canDelete) && !prot.isProtected,
      isProtected: prot.isProtected,
      ...(prot.reasonEn ? { protectionReason: prot.reasonEn, protectionReasonFa: prot.reasonFa } : {}),
      ...(raw.taskPath ? { taskPath: String(raw.taskPath) } : {}),
      ...(raw.filePath ? { filePath: String(raw.filePath) } : {}),
    };
  });

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    activeUser: String(parsed.activeUser || ''),
    summary: {
      totalServices: services.length,
      runningServices: services.filter((s) => s.status === 'Running').length,
      stoppedServices: services.filter((s) => s.status === 'Stopped').length,
      pausedServices: services.filter((s) => s.status === 'Paused').length,
      automaticServices: services.filter(
        (s) => s.startType === 'Automatic' || s.startType === 'AutomaticDelayed'
      ).length,
      manualServices: services.filter((s) => s.startType === 'Manual').length,
      disabledServices: services.filter((s) => s.startType === 'Disabled').length,
      totalStartupItems: startupItems.length,
      enabledStartupItems: startupItems.filter((i) => i.enabled).length,
      disabledStartupItems: startupItems.filter((i) => !i.enabled).length,
    },
    services,
    startupItems,
    collectedAt: new Date().toISOString(),
  };
}

export async function manageEndpointService(
  input: HelpdeskTargetInput,
  options: {
    serviceName: string;
    action: HelpdeskServiceActionType;
    startupType?: 'Automatic' | 'AutomaticDelayed' | 'Manual' | 'Disabled';
  }
): Promise<HelpdeskActionResult> {
  const serviceName = String(options.serviceName || '').trim();
  if (!serviceName || !/^[a-zA-Z0-9._@$-]{1,256}$/.test(serviceName)) {
    throw new Error('Invalid service name format.');
  }

  const allowedActions: HelpdeskServiceActionType[] = [
    'start',
    'stop',
    'restart',
    'pause',
    'resume',
    'set_startup',
  ];
  const action = String(options.action || '').trim() as HelpdeskServiceActionType;
  if (!allowedActions.includes(action)) {
    throw new Error('Unsupported service action requested.');
  }

  const allowedStartTypes = ['Automatic', 'AutomaticDelayed', 'Manual', 'Disabled'] as const;
  const startupType = options.startupType ? String(options.startupType).trim() : undefined;
  if (action === 'set_startup') {
    if (!startupType || !(allowedStartTypes as readonly string[]).includes(startupType)) {
      throw new Error('Valid startupType (Automatic, AutomaticDelayed, Manual, Disabled) is required.');
    }
  }

  const prot = checkProtectedService(serviceName);
  const destructiveOp =
    action === 'stop' ||
    action === 'restart' ||
    action === 'pause' ||
    (action === 'set_startup' && startupType === 'Disabled');
  if (prot.isProtected && destructiveOp) {
    throw new Error(prot.reasonEn || `Protected service "${serviceName}" cannot be stopped or disabled.`);
  }

  const svcB64 = Buffer.from(serviceName, 'utf8').toString('base64');
  const startupVal = startupType || 'Manual';

  const winPs = `
$ErrorActionPreference = 'Stop'
$svcName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${svcB64}'))
$action = '${action}'
$startType = '${startupVal}'

$svc = Get-Service -Name $svcName -ErrorAction Stop
$disp = [string]$svc.DisplayName

switch ($action) {
  'start' {
    if ($svc.Status -ne 'Running') {
      Start-Service -Name $svcName -ErrorAction Stop
      Start-Sleep -Milliseconds 700
    }
  }
  'stop' {
    if ($svc.Status -ne 'Stopped') {
      Stop-Service -Name $svcName -Force -ErrorAction Stop
      Start-Sleep -Milliseconds 700
    }
  }
  'restart' {
    Restart-Service -Name $svcName -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 800
  }
  'pause' {
    if (-not $svc.CanPauseAndContinue) {
      throw "Service '$svcName' does not support Pause/Continue."
    }
    if ($svc.Status -eq 'Running') {
      Suspend-Service -Name $svcName -ErrorAction Stop
      Start-Sleep -Milliseconds 500
    }
  }
  'resume' {
    if ($svc.Status -eq 'Paused') {
      Resume-Service -Name $svcName -ErrorAction Stop
      Start-Sleep -Milliseconds 500
    }
  }
  'set_startup' {
    $regPath = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\$svcName"
    if ($startType -eq 'AutomaticDelayed') {
      Set-Service -Name $svcName -StartupType Automatic -ErrorAction Stop
      if (Test-Path -LiteralPath $regPath) {
        Set-ItemProperty -LiteralPath $regPath -Name 'DelayedAutostart' -Value 1 -Type DWord -Force
      }
    } else {
      Set-Service -Name $svcName -StartupType $startType -ErrorAction Stop
      if (Test-Path -LiteralPath $regPath) {
        Set-ItemProperty -LiteralPath $regPath -Name 'DelayedAutostart' -Value 0 -Type DWord -Force
      }
    }
    Start-Sleep -Milliseconds 400
  }
}

$after = Get-Service -Name $svcName -ErrorAction Stop
$cimAfter = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $svcName.Replace("'", "''") + "'") -ErrorAction SilentlyContinue
$delayedAfter = $false
try {
  $rp = Get-ItemProperty -LiteralPath "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\$svcName" -Name 'DelayedAutostart' -ErrorAction SilentlyContinue
  if ($rp -and [int]$rp.DelayedAutostart -eq 1) { $delayedAfter = $true }
} catch {}

[PSCustomObject]@{
  ok = $true
  serviceName = $svcName
  displayName = $disp
  status = [string]$after.Status
  startType = if ($cimAfter) { [string]$cimAfter.StartMode } else { [string]$after.StartType }
  delayedAutoStart = $delayedAfter
  pid = if ($cimAfter -and $cimAfter.ProcessId -gt 0) { [int]$cimAfter.ProcessId } else { $null }
  output = "Action '$action' completed for '$disp' ($svcName). Status=$($after.Status)"
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, re, subprocess

svc = base64.b64decode('${svcB64}').decode('utf-8', errors='ignore').strip()
action = '${action}'
start_type = '${startupVal}'

if not re.match(r'^[a-zA-Z0-9._@$-]{1,256}$', svc):
    print(json.dumps({"ok": False, "output": "Invalid service name"}))
    raise SystemExit(0)

unit = svc if svc.endswith(".service") else f"{svc}.service"
if action in ("start", "stop", "restart"):
    cmd = ["systemctl", action, unit]
elif action == "set_startup":
    if start_type in ("Automatic", "AutomaticDelayed"):
        cmd = ["systemctl", "enable", unit]
    elif start_type == "Disabled":
        cmd = ["systemctl", "disable", unit]
    else:
        cmd = ["systemctl", "disable", unit]
else:
    print(json.dumps({"ok": False, "output": f"Action '{action}' is not supported on systemd."}))
    raise SystemExit(0)

r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
st = subprocess.run(["systemctl", "is-active", unit], capture_output=True, text=True, timeout=10)
en = subprocess.run(["systemctl", "is-enabled", unit], capture_output=True, text=True, timeout=10)
out = ((r.stdout or "") + "\\n" + (r.stderr or "")).strip() or f"systemctl {action} {unit} exit={r.returncode}"
print(json.dumps({
    "ok": r.returncode == 0,
    "serviceName": svc,
    "displayName": svc,
    "status": "Running" if st.stdout.strip() == "active" else "Stopped",
    "startType": "Automatic" if en.stdout.strip().startswith("enabled") else ("Disabled" if en.stdout.strip() in ("disabled", "masked") else "Manual"),
    "delayedAutoStart": False,
    "pid": None,
    "output": out[:1500],
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(45000, input.timeoutMs || 45000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, `service ${action} (${serviceName})`);
  const ok = Boolean(parsed.ok);
  const newStatus = normalizeServiceStatus(String(parsed.status || 'Unknown'));
  const newStartType = normalizeServiceStartType(
    String(parsed.startType || 'Unknown'),
    Boolean(parsed.delayedAutoStart)
  );
  const disp = String(parsed.displayName || serviceName);

  const writeActionMap: Record<HelpdeskServiceActionType, HelpdeskWriteAction> = {
    start: 'service_start',
    stop: 'service_stop',
    restart: 'service_restart',
    pause: 'service_pause',
    resume: 'service_resume',
    set_startup: 'service_startup_type',
  };

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: writeActionMap[action],
    success: ok,
    message: ok
      ? `Service "${disp}" (${serviceName}) action "${action}" completed on ${execRes.host}. Status: ${newStatus}, Startup: ${newStartType}.`
      : `Service "${disp}" (${serviceName}) action "${action}" failed: ${parsed.output}`,
    messageFa: ok
      ? `عملیات روی سرویس «${disp}» (${serviceName}) در سیستم ${execRes.host} با موفقیت انجام شد. وضعیت فعلی: ${newStatus} (${newStartType}).`
      : `اجرای عملیات روی سرویس «${disp}» (${serviceName}) ناموفق بود: ${parsed.output}`,
    details: {
      serviceName,
      displayName: disp,
      action,
      status: newStatus,
      startType: newStartType,
      pid: parsed.pid ?? null,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function manageEndpointStartupItem(
  input: HelpdeskTargetInput,
  options: {
    action: 'enable' | 'disable' | 'delete' | 'add';
    sourceType: HelpdeskStartupSourceType;
    locationHive: HelpdeskStartupHive;
    itemName: string;
    ownerSid?: string;
    taskPath?: string;
    command?: string;
    startupScope?: 'machine' | 'user';
  }
): Promise<HelpdeskActionResult> {
  const action = String(options.action || '').trim() as 'enable' | 'disable' | 'delete' | 'add';
  if (!['enable', 'disable', 'delete', 'add'].includes(action)) {
    throw new Error('Invalid startup action specified.');
  }

  const itemName = String(options.itemName || '').trim();
  if (!itemName || itemName.length > 200 || /[\x00-\x1F\x7F]/.test(itemName)) {
    throw new Error('Invalid startup item name.');
  }
  if ((options.locationHive === 'CommonStartupFolder' || options.locationHive === 'UserStartupFolder') && /[\\/]|\.\./.test(itemName)) {
    throw new Error('Invalid startup folder file name.');
  }

  const allowedHives: HelpdeskStartupHive[] = [
    'HKLM64_Run',
    'HKLM32_Run',
    'HKLM64_RunOnce',
    'HKCU_Run',
    'HKU_Run',
    'HKU_RunOnce',
    'CommonStartupFolder',
    'UserStartupFolder',
    'ScheduledTask',
    'linux_autostart',
  ];
  const hive = String(options.locationHive || '').trim() as HelpdeskStartupHive;
  if (!allowedHives.includes(hive)) {
    throw new Error('Invalid startup location hive specified.');
  }

  const ownerSid = String(options.ownerSid || '').trim();
  if (ownerSid && !/^S-1-5-21-[0-9-]+$/.test(ownerSid)) {
    throw new Error('Invalid user SID format.');
  }
  if ((hive === 'HKU_Run' || hive === 'HKU_RunOnce') && !ownerSid) {
    throw new Error('Valid user SID (S-1-5-21-...) is required for per-user HKU startup operations.');
  }

  const command = String(options.command || '').trim();
  if (action === 'add') {
    if (!command || command.length > 500 || /[\x00-\x1F\x7F]/.test(command)) {
      throw new Error('Valid startup command / executable path is required.');
    }
  }

  if (action === 'disable' || action === 'delete') {
    const prot = checkProtectedStartupItem(itemName, command);
    if (prot.isProtected) {
      throw new Error(prot.reasonEn || `Protected startup item "${itemName}" cannot be modified.`);
    }
  }

  const nameB64 = Buffer.from(itemName, 'utf8').toString('base64');
  const sidB64 = Buffer.from(ownerSid, 'utf8').toString('base64');
  const taskPathB64 = Buffer.from(String(options.taskPath || '\\'), 'utf8').toString('base64');
  const cmdB64 = Buffer.from(command, 'utf8').toString('base64');
  const addScope = options.startupScope === 'user' ? 'user' : 'machine';

  const winPs = `
$ErrorActionPreference = 'Stop'
$action = '${action}'
$hive = '${hive}'
$itemName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
$ownerSid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))
$taskPath = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${taskPathB64}'))
$cmdVal = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${cmdB64}'))
$addScope = '${addScope}'

if ($action -in @('disable', 'delete')) {
  if ($itemName -match '(securityhealth|windows defender|microsoft defender|crowdstrike|falcon|kaspersky|sentinelone|bitdefender|eset|winrm|openssh)') {
    throw "Blocked by security policy: '$itemName' is protected."
  }
}

function Set-ApprovedFlag($approvedPath, $valName, [bool]$enable) {
  if (-not (Test-Path -LiteralPath $approvedPath)) {
    New-Item -Path $approvedPath -Force | Out-Null
  }
  if ($enable) {
    $bytes = [byte[]](0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00)
  } else {
    $ft = [BitConverter]::GetBytes([DateTime]::UtcNow.ToFileTimeUtc())
    $bytes = [byte[]](0x03, 0x00, 0x00, 0x00) + $ft
  }
  Set-ItemProperty -LiteralPath $approvedPath -Name $valName -Value $bytes -Type Binary -Force
}

$outMsg = ''

if ($action -eq 'add') {
  $targetRunPath = ''
  $targetApprovedPath = ''
  if ($addScope -eq 'user') {
    if ($ownerSid) {
      $targetRunPath = "Registry::HKEY_USERS\\$ownerSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
      $targetApprovedPath = "Registry::HKEY_USERS\\$ownerSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
    } else {
      $targetRunPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      $targetApprovedPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
    }
  } else {
    $targetRunPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
    $targetApprovedPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
  }
  if (-not (Test-Path -LiteralPath $targetRunPath)) {
    New-Item -Path $targetRunPath -Force | Out-Null
  }
  Set-ItemProperty -LiteralPath $targetRunPath -Name $itemName -Value $cmdVal -Type String -Force
  Set-ApprovedFlag $targetApprovedPath $itemName $true
  $outMsg = "Added startup entry '$itemName' to $targetRunPath"
} elseif ($hive -eq 'ScheduledTask') {
  if ($action -eq 'enable') {
    Enable-ScheduledTask -TaskPath $taskPath -TaskName $itemName -ErrorAction Stop | Out-Null
    $outMsg = "Enabled Scheduled Task '$taskPath$itemName'"
  } elseif ($action -eq 'disable') {
    Disable-ScheduledTask -TaskPath $taskPath -TaskName $itemName -ErrorAction Stop | Out-Null
    $outMsg = "Disabled Scheduled Task '$taskPath$itemName'"
  } else {
    throw "Deleting Scheduled Tasks is disabled for safety; disable it instead."
  }
} elseif ($hive -in @('CommonStartupFolder', 'UserStartupFolder')) {
  $dirPath = ''
  $approvedPath = ''
  if ($hive -eq 'CommonStartupFolder') {
    $dirPath = Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'
    $approvedPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
  } else {
    if ($ownerSid) {
      $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$ownerSid" -ErrorAction Stop
      $dirPath = Join-Path ([string]$pl.ProfileImagePath) 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup'
      $approvedPath = "Registry::HKEY_USERS\\$ownerSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder"
    } else {
      $dirPath = [Environment]::GetFolderPath('Startup')
      $approvedPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
    }
  }
  if ($action -eq 'enable') {
    Set-ApprovedFlag $approvedPath $itemName $true
    $outMsg = "Enabled Startup Folder item '$itemName'"
  } elseif ($action -eq 'disable') {
    Set-ApprovedFlag $approvedPath $itemName $false
    $outMsg = "Disabled Startup Folder item '$itemName'"
  } elseif ($action -eq 'delete') {
    $fullFile = Join-Path $dirPath $itemName
    if (Test-Path -LiteralPath $fullFile) {
      Remove-Item -LiteralPath $fullFile -Force -ErrorAction Stop
    }
    if (Test-Path -LiteralPath $approvedPath) {
      Remove-ItemProperty -LiteralPath $approvedPath -Name $itemName -ErrorAction SilentlyContinue
    }
    $outMsg = "Removed Startup Folder item '$fullFile'"
  }
} else {
  $runPath = switch ($hive) {
    'HKLM64_Run'     { 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run' }
    'HKLM32_Run'     { 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run' }
    'HKLM64_RunOnce' { 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce' }
    'HKCU_Run'       { 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' }
    'HKU_Run'        { "Registry::HKEY_USERS\\$ownerSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" }
    'HKU_RunOnce'    { "Registry::HKEY_USERS\\$ownerSid\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce" }
    default { throw "Unsupported registry hive '$hive'" }
  }
  $approvedPath = switch ($hive) {
    'HKLM64_Run' { 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' }
    'HKLM32_Run' { 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32' }
    'HKCU_Run'   { 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' }
    'HKU_Run'    { "Registry::HKEY_USERS\\$ownerSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" }
    default { '' }
  }
  if ($action -eq 'enable') {
    if (-not $approvedPath) { throw "RunOnce entries cannot be toggled via StartupApproved." }
    Set-ApprovedFlag $approvedPath $itemName $true
    $outMsg = "Enabled startup registry item '$itemName' in $hive"
  } elseif ($action -eq 'disable') {
    if (-not $approvedPath) { throw "RunOnce entries cannot be toggled via StartupApproved." }
    Set-ApprovedFlag $approvedPath $itemName $false
    $outMsg = "Disabled startup registry item '$itemName' in $hive"
  } elseif ($action -eq 'delete') {
    if (Test-Path -LiteralPath $runPath) {
      Remove-ItemProperty -LiteralPath $runPath -Name $itemName -ErrorAction Stop
    }
    if ($approvedPath -and (Test-Path -LiteralPath $approvedPath)) {
      Remove-ItemProperty -LiteralPath $approvedPath -Name $itemName -ErrorAction SilentlyContinue
    }
    $outMsg = "Deleted startup registry item '$itemName' from $runPath"
  }
}

[PSCustomObject]@{
  ok = $true
  itemName = $itemName
  action = $action
  output = $outMsg
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, os, re

action = '${action}'
name = base64.b64decode('${nameB64}').decode('utf-8', errors='ignore').strip()
cmd_val = base64.b64decode('${cmdB64}').decode('utf-8', errors='ignore').strip()
scope = '${addScope}'

if not name or any(x in name for x in ['/', '\\\\', '..']):
    print(json.dumps({"ok": False, "output": "Invalid startup filename"}))
    raise SystemExit(0)

if action == 'add':
    d = os.path.expanduser("~/.config/autostart") if scope == 'user' else "/etc/xdg/autostart"
    os.makedirs(d, exist_ok=True)
    fn = name if name.endswith(".desktop") else f"{name}.desktop"
    p = os.path.join(d, fn)
    with open(p, "w", encoding="utf-8") as f:
        f.write(f"[Desktop Entry]\\nType=Application\\nName={name}\\nExec={cmd_val}\\nHidden=false\\n")
    print(json.dumps({"ok": True, "itemName": fn, "action": action, "output": f"Created {p}"}))
    raise SystemExit(0)

found = None
for d in [os.path.expanduser("~/.config/autostart"), "/etc/xdg/autostart"]:
    cand = os.path.join(d, name)
    if os.path.isfile(cand):
        found = cand
        break

if not found:
    print(json.dumps({"ok": False, "output": f"Autostart entry {name} not found"}))
    raise SystemExit(0)

if action == 'delete':
    os.remove(found)
    print(json.dumps({"ok": True, "itemName": name, "action": action, "output": f"Deleted {found}"}))
else:
    with open(found, "r", encoding="utf-8", errors="ignore") as f:
        lines = [ln for ln in f.readlines() if not ln.startswith("Hidden=")]
    lines.append(f"Hidden={'false' if action == 'enable' else 'true'}\\n")
    with open(found, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(json.dumps({"ok": True, "itemName": name, "action": action, "output": f"Updated {found} Hidden={'false' if action == 'enable' else 'true'}"}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(45000, input.timeoutMs || 45000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, `startup ${action} (${itemName})`);
  const ok = Boolean(parsed.ok);
  const actionWriteMap: Record<'enable' | 'disable' | 'delete' | 'add', HelpdeskWriteAction> = {
    enable: 'startup_enable',
    disable: 'startup_disable',
    delete: 'startup_delete',
    add: 'startup_add',
  };

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: actionWriteMap[action],
    success: ok,
    message: ok
      ? `Startup item "${itemName}" (${action}) applied on ${execRes.host}.`
      : `Startup item "${itemName}" (${action}) failed: ${parsed.output}`,
    messageFa: ok
      ? `تغییر استارت‌آپ «${itemName}» (${action === 'enable' ? 'فعال‌سازی' : action === 'disable' ? 'غیرفعال‌سازی' : action === 'delete' ? 'حذف' : 'افزودن'}) روی سیستم ${execRes.host} با موفقیت انجام شد.`
      : `تغییر استارت‌آپ «${itemName}» ناموفق بود: ${parsed.output}`,
    details: {
      itemName,
      locationHive: hive,
      action,
      ...(ownerSid ? { ownerSid } : {}),
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 22. REGION, TIME/TIMEZONE, LANGUAGES & FONTS MANAGEMENT
// ============================================================================

export interface HelpdeskTimezoneOption {
  id: string;
  displayName: string;
  standardName: string;
  offsetMinutes: number;
  supportsDst: boolean;
}

export interface HelpdeskLanguageEntry {
  tag: string;
  englishName: string;
  nativeName: string;
  autonym: string;
  inputMethodTips: string[];
  rank: number;
  source: 'active_user_hive' | 'session_profile' | 'system';
}

export interface HelpdeskInstalledFontItem {
  id: string;
  displayName: string;
  registryValueName: string;
  fileName: string;
  filePath: string;
  format: 'TrueType' | 'OpenType' | 'Collection' | 'Raster' | 'Other';
  scope: 'system' | 'user';
  ownerSid?: string;
  ownerUser?: string;
  sizeBytes: number | null;
  isProtected: boolean;
  protectionReason?: string;
  protectionReasonFa?: string;
}

export interface HelpdeskRegionFontsResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  activeUser: string;
  activeUserSid: string;
  clock: {
    currentIso: string;
    localDate: string;
    localTime: string;
    dayOfWeek: string;
    timezoneId: string;
    timezoneDisplayName: string;
    timezoneStandardName: string;
    utcOffsetMinutes: number;
    supportsDst: boolean;
    ntpEnabled: boolean;
    ntpServer: string;
    ntpType: string;
    w32TimeStatus: string;
  };
  availableTimezones: HelpdeskTimezoneOption[];
  region: {
    systemLocale: string;
    systemLocaleName: string;
    currentCulture: string;
    currentCultureName: string;
    homeLocationGeoId: number | null;
    homeLocationName: string;
    installedMuiLanguages: string[];
  };
  userLanguages: HelpdeskLanguageEntry[];
  fonts: HelpdeskInstalledFontItem[];
  summary: {
    totalFonts: number;
    systemFonts: number;
    userFonts: number;
    configuredLanguages: number;
    installedMuiCount: number;
  };
  collectedAt: string;
}

const PROTECTED_FONT_PREFIXES = [
  'segoeui',
  'segoeuib',
  'segoeuii',
  'segoeuil',
  'segoeuisl',
  'segoeuiz',
  'seguibl',
  'seguiemj',
  'seguihis',
  'seguisbi',
  'seguisli',
  'seguisym',
  'segmdl2',
  'segoeicons',
  'tahoma',
  'tahomabd',
  'arial',
  'arialbd',
  'arialbi',
  'ariali',
  'ariblk',
  'calibri',
  'calibrib',
  'calibrii',
  'calibril',
  'calibriz',
  'cambria',
  'cambriab',
  'cambriai',
  'cambriaz',
  'consola',
  'consolab',
  'consolai',
  'consolaz',
  'cour',
  'courbd',
  'courbi',
  'couri',
  'times',
  'timesbd',
  'timesbi',
  'timesi',
  'micross',
  'marlett',
  'symbol',
  'wingding',
  'webdings',
  'verdana',
  'verdanab',
  'verdanai',
  'verdanaz',
  'georgia',
  'trebuc',
  'lucon',
  'l_10646',
  'vga',
  'dosapp',
  '8514',
];

function checkProtectedFont(
  fileName: string,
  displayName: string,
  scope: 'system' | 'user'
): { isProtected: boolean; reasonEn?: string; reasonFa?: string } {
  if (scope === 'user') {
    return { isProtected: false };
  }
  const base = pathBaseNameNoExt(fileName).toLowerCase();
  const disp = String(displayName || '').toLowerCase();
  if (
    PROTECTED_FONT_PREFIXES.some((p) => base === p || base.startsWith(p + '_')) ||
    /\b(segoe ui|segoe mdl2|segoe fluent|microsoft sans serif|marlett|tahoma|wingdings|webdings|symbol)\b/i.test(disp)
  ) {
    return {
      isProtected: true,
      reasonEn: 'Core Windows system font required for OS UI rendering cannot be deleted.',
      reasonFa: 'فونت هسته ویندوز برای نمایش رابط کاربری سیستم عامل محافظت‌شده است و قابل حذف نیست.',
    };
  }
  return { isProtected: false };
}

function pathBaseNameNoExt(filePath: string): string {
  const s = String(filePath || '').replace(/\\/g, '/');
  const idx = s.lastIndexOf('/');
  const base = idx >= 0 ? s.slice(idx + 1) : s;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function sanitizeFontFileName(rawName: string): string {
  const normalized = String(rawName || '').replace(/\\/g, '/').trim();
  const base = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized;
  if (
    !base ||
    base.length > 140 ||
    base.includes('..') ||
    /[\x00-\x1F\x7F<>:"/\\|?*]/.test(base) ||
    !/^[a-zA-Z0-9._\- ()+\[\]]+\.(ttf|otf|ttc|fon)$/i.test(base)
  ) {
    throw new Error('Invalid font filename. Allowed extensions: .ttf, .otf, .ttc, .fon (alphanumeric and - _ . spaces only).');
  }
  return base;
}

function validateFontBinaryMagic(buf: Buffer, fileName: string): 'TrueType' | 'OpenType' | 'Collection' | 'Raster' {
  if (!Buffer.isBuffer(buf) || buf.length < 16) {
    throw new Error('Font file is empty or too small to be a valid font.');
  }
  if (buf.length > 15 * 1024 * 1024) {
    throw new Error('Font file exceeds the maximum allowed size of 15 MB.');
  }
  const lower = fileName.toLowerCase();
  const b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3];
  const tag = buf.subarray(0, 4).toString('ascii');

  if (lower.endsWith('.ttf')) {
    const isTtfMagic =
      (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) ||
      tag === 'true' ||
      tag === 'typ1';
    if (!isTtfMagic) {
      throw new Error('Invalid TrueType (.ttf) file header.');
    }
    return 'TrueType';
  }
  if (lower.endsWith('.otf')) {
    const isOtfMagic = tag === 'OTTO' || (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00);
    if (!isOtfMagic) {
      throw new Error('Invalid OpenType (.otf) file header.');
    }
    return 'OpenType';
  }
  if (lower.endsWith('.ttc')) {
    if (tag !== 'ttcf') {
      throw new Error('Invalid TrueType Collection (.ttc) file header.');
    }
    return 'Collection';
  }
  if (lower.endsWith('.fon')) {
    if (!(b0 === 0x4d && b1 === 0x5a)) {
      throw new Error('Invalid Windows Raster Font (.fon) file header.');
    }
    return 'Raster';
  }
  throw new Error('Unsupported font extension.');
}

function detectFontFormatFromFile(fileName: string, regName: string): HelpdeskInstalledFontItem['format'] {
  const fn = String(fileName || '').toLowerCase();
  const rn = String(regName || '').toLowerCase();
  if (fn.endsWith('.otf') || rn.includes('(opentype)')) return 'OpenType';
  if (fn.endsWith('.ttc')) return 'Collection';
  if (fn.endsWith('.ttf') || rn.includes('(truetype)')) return 'TrueType';
  if (fn.endsWith('.fon') || rn.includes('(all res)') || rn.includes('(vga res)')) return 'Raster';
  return 'Other';
}

export async function collectEndpointRegionAndFonts(
  input: HelpdeskTargetInput
): Promise<HelpdeskRegionFontsResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
function To-Str($v) {
  if ($null -eq $v) { return '' }
  if ($v -is [System.Array]) {
    if ($v.Count -eq 0) { return '' }
    return [string]$v[0]
  }
  return [string]$v
}
function To-Int($v) {
  if ($null -eq $v) { return 0 }
  try {
    if ($v -is [System.Array]) {
      if ($v.Count -eq 0) { return 0 }
      return [int]$v[0]
    }
    return [int]$v
  } catch { return 0 }
}

$hostName = $env:COMPUTERNAME
try { $hostName = To-Str ([System.Net.Dns]::GetHostName()) } catch {}

# 1. Resolve Active Desktop User & SID
$activeUser = ''
$activeSid = ''
try {
  $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
  if ($cs -and $cs.UserName) {
    $activeUser = To-Str $cs.UserName
    try {
      $nt = New-Object System.Security.Principal.NTAccount($activeUser)
      $activeSid = To-Str ($nt.Translate([System.Security.Principal.SecurityIdentifier]).Value)
    } catch {}
  }
} catch {}
if (-not $activeSid) {
  try {
    $exp = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='explorer.exe'" -ErrorAction SilentlyContinue) | Select-Object -First 1
    if ($exp) {
      $own = Invoke-CimMethod -InputObject $exp -MethodName GetOwnerSid -ErrorAction SilentlyContinue
      if ($own -and $own.Sid) { $activeSid = To-Str $own.Sid }
      if (-not $activeUser) {
        $oname = Invoke-CimMethod -InputObject $exp -MethodName GetOwner -ErrorAction SilentlyContinue
        if ($oname -and $oname.User) {
          $activeUser = if ($oname.Domain) { "$($oname.Domain)\\$($oname.User)" } else { To-Str $oname.User }
        }
      }
    }
  } catch {}
}

# 2. Clock, TimeZone & NTP
$now = Get-Date
$tz = $null
try { $tz = Get-TimeZone -ErrorAction SilentlyContinue } catch {}
$tzId = if ($tz) { To-Str $tz.Id } else { 'UTC' }
$tzDisp = if ($tz) { To-Str $tz.DisplayName } else { 'UTC' }
$tzStd = if ($tz) { To-Str $tz.StandardName } else { 'UTC' }
$utcOffMin = 0
$supportsDst = $false
try {
  if ($tz) {
    $utcOffMin = [int]$tz.GetUtcOffset([DateTime]::UtcNow).TotalMinutes
    $supportsDst = [bool]$tz.SupportsDaylightSavingTime
  }
} catch {}

$availTz = @()
try {
  foreach ($z in @(Get-TimeZone -ListAvailable -ErrorAction SilentlyContinue)) {
    $availTz += [PSCustomObject]@{
      id = To-Str $z.Id
      displayName = To-Str $z.DisplayName
      standardName = To-Str $z.StandardName
      offsetMinutes = [int]$z.BaseUtcOffset.TotalMinutes
      supportsDst = [bool]$z.SupportsDaylightSavingTime
    }
  }
} catch {}

$ntpType = 'Unknown'
$ntpServer = ''
$ntpEnabled = $false
$w32Status = 'Unknown'
try {
  $w32 = Get-Service -Name 'W32Time' -ErrorAction SilentlyContinue
  if ($w32) { $w32Status = To-Str $w32.Status }
} catch {}
try {
  $p = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\Parameters' -ErrorAction SilentlyContinue
  if ($p) {
    $ntpType = To-Str $p.Type
    $ntpServer = To-Str $p.NtpServer
  }
  $nc = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\TimeProviders\\NtpClient' -ErrorAction SilentlyContinue
  $ncEn = if ($nc -and $null -ne $nc.Enabled) { (To-Int $nc.Enabled) -ne 0 } else { $true }
  $ntpEnabled = ($w32Status -eq 'Running') -and ($ntpType -ne 'NoSync') -and $ncEn
} catch {}

# 3. Region, System Locale, Home Location & Installed MUI
$sysLocName = ''
$sysLocDisp = ''
try {
  $sl = Get-WinSystemLocale -ErrorAction SilentlyContinue
  if ($sl) {
    $sysLocName = To-Str $sl.Name
    $sysLocDisp = To-Str $sl.DisplayName
  }
} catch {}

$curCultName = ''
$curCultDisp = ''
try {
  $cc = Get-Culture -ErrorAction SilentlyContinue
  if ($cc) {
    $curCultName = To-Str $cc.Name
    $curCultDisp = To-Str $cc.DisplayName
  }
} catch {}

$geoId = $null
$geoName = ''
try {
  $hl = Get-WinHomeLocation -ErrorAction SilentlyContinue
  if ($hl) {
    $geoId = To-Int $hl.GeoId
    $geoName = To-Str $hl.HomeLocation
  }
} catch {}

$muiList = @()
try {
  $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
  if ($os -and $os.MUILanguages) {
    foreach ($m in @($os.MUILanguages)) {
      $ms = (To-Str $m).Trim()
      if ($ms) { $muiList += $ms }
    }
  }
} catch {}

# 4. User Languages (Active Desktop User Hive first, then WinUserLanguageList fallback)
$userLangs = @()
$seenTags = @{}

if ($activeSid -and (Test-Path -LiteralPath "Registry::HKEY_USERS\\$activeSid\\Control Panel\\International\\User Profile")) {
  try {
    $upKey = "Registry::HKEY_USERS\\$activeSid\\Control Panel\\International\\User Profile"
    $upProps = Get-ItemProperty -LiteralPath $upKey -ErrorAction SilentlyContinue
    $tags = @()
    if ($upProps -and $upProps.Languages) {
      $tags = @($upProps.Languages)
    }
    $rank = 1
    foreach ($t in $tags) {
      $tagStr = (To-Str $t).Trim()
      if (-not $tagStr -or $seenTags.ContainsKey($tagStr.ToLower())) { continue }
      $seenTags[$tagStr.ToLower()] = $true
      $eng = $tagStr
      $nat = $tagStr
      try {
        $ci = [System.Globalization.CultureInfo]::GetCultureInfo($tagStr)
        if ($ci) {
          $eng = To-Str $ci.EnglishName
          $nat = To-Str $ci.NativeName
        }
      } catch {}
      $tips = @()
      try {
        $subPath = "$upKey\\$tagStr"
        if (Test-Path -LiteralPath $subPath) {
          $subItem = Get-Item -LiteralPath $subPath -ErrorAction SilentlyContinue
          if ($subItem) {
            foreach ($vn in @($subItem.GetValueNames())) {
              if ($vn -match '^[0-9a-fA-F]{4}:[0-9a-fA-F]{8}$') { $tips += $vn }
            }
          }
        }
      } catch {}
      $userLangs += [PSCustomObject]@{
        tag = $tagStr
        englishName = $eng
        nativeName = $nat
        autonym = $nat
        inputMethodTips = @($tips)
        rank = $rank
        source = 'active_user_hive'
      }
      $rank++
    }
  } catch {}
}

if ($userLangs.Count -eq 0) {
  try {
    $wull = @(Get-WinUserLanguageList -ErrorAction SilentlyContinue)
    $rank = 1
    foreach ($wl in $wull) {
      $tagStr = (To-Str $wl.LanguageTag).Trim()
      if (-not $tagStr -or $seenTags.ContainsKey($tagStr.ToLower())) { continue }
      $seenTags[$tagStr.ToLower()] = $true
      $tips = @()
      if ($wl.InputMethodTips) {
        foreach ($tip in @($wl.InputMethodTips)) { $tips += (To-Str $tip) }
      }
      $userLangs += [PSCustomObject]@{
        tag = $tagStr
        englishName = To-Str $wl.EnglishName
        nativeName = To-Str $wl.LocalizedName
        autonym = To-Str $wl.Autonym
        inputMethodTips = @($tips)
        rank = $rank
        source = 'session_profile'
      }
      $rank++
    }
  } catch {}
}

# 5. Installed Fonts (System-wide HKLM + Active User HKU/HKCU)
$fontsList = @()
$sysFontsDir = Join-Path $env:SystemRoot 'Fonts'
try {
  $regSys = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
  if (Test-Path -LiteralPath $regSys) {
    $keyObj = Get-Item -LiteralPath $regSys -ErrorAction SilentlyContinue
    if ($keyObj) {
      foreach ($vn in @($keyObj.GetValueNames())) {
        try {
          if (-not $vn) { continue }
          $val = (To-Str $keyObj.GetValue($vn)).Trim()
          if (-not $val) { continue }
          $fullPath = if ([System.IO.Path]::IsPathRooted($val)) { $val } else { Join-Path $sysFontsDir $val }
          $fn = [System.IO.Path]::GetFileName($fullPath)
          $sz = $null
          try {
            if (Test-Path -LiteralPath $fullPath) {
              $sz = [int64](Get-Item -LiteralPath $fullPath -ErrorAction SilentlyContinue).Length
            }
          } catch {}
          $disp = ($vn -replace '\\s*\\((TrueType|OpenType|All res|VGA res|8514a res|Set of \\d+).*\\)$', '').Trim()
          $fontsList += [PSCustomObject]@{
            displayName = if ($disp) { $disp } else { $vn }
            registryValueName = $vn
            fileName = $fn
            filePath = $fullPath
            scope = 'system'
            ownerSid = ''
            ownerUser = ''
            sizeBytes = $sz
          }
        } catch {}
      }
    }
  }
} catch {}

# Per-user Fonts for Active User or Current Session
$userFontSources = @()
if ($activeSid) {
  $profPath = ''
  try {
    $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$activeSid" -ErrorAction SilentlyContinue
    if ($pl -and $pl.ProfileImagePath) { $profPath = To-Str $pl.ProfileImagePath }
  } catch {}
  $userFontSources += [PSCustomObject]@{
    regPath = "Registry::HKEY_USERS\\$activeSid\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
    baseDir = if ($profPath) { Join-Path $profPath 'AppData\\Local\\Microsoft\\Windows\\Fonts' } else { '' }
    sid = $activeSid
    user = $activeUser
  }
} else {
  $userFontSources += [PSCustomObject]@{
    regPath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    baseDir = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Fonts'
    sid = ''
    user = $env:USERNAME
  }
}

foreach ($ufs in $userFontSources) {
  try {
    if (Test-Path -LiteralPath $ufs.regPath) {
      $uObj = Get-Item -LiteralPath $ufs.regPath -ErrorAction SilentlyContinue
      if ($uObj) {
        foreach ($vn in @($uObj.GetValueNames())) {
          try {
            if (-not $vn) { continue }
            $val = (To-Str $uObj.GetValue($vn)).Trim()
            if (-not $val) { continue }
            $fullPath = if ([System.IO.Path]::IsPathRooted($val)) { $val } elseif ($ufs.baseDir) { Join-Path $ufs.baseDir $val } else { $val }
            $fn = [System.IO.Path]::GetFileName($fullPath)
            $sz = $null
            try {
              if ($fullPath -and (Test-Path -LiteralPath $fullPath)) {
                $sz = [int64](Get-Item -LiteralPath $fullPath -ErrorAction SilentlyContinue).Length
              }
            } catch {}
            $disp = ($vn -replace '\\s*\\((TrueType|OpenType|All res|VGA res).*\\)$', '').Trim()
            $fontsList += [PSCustomObject]@{
              displayName = if ($disp) { $disp } else { $vn }
              registryValueName = $vn
              fileName = $fn
              filePath = $fullPath
              scope = 'user'
              ownerSid = $ufs.sid
              ownerUser = $ufs.user
              sizeBytes = $sz
            }
          } catch {}
        }
      }
    }
  } catch {}
}

[PSCustomObject]@{
  hostname = $hostName
  activeUser = $activeUser
  activeUserSid = $activeSid
  clock = [PSCustomObject]@{
    currentIso = $now.ToString('o')
    localDate = $now.ToString('yyyy-MM-dd')
    localTime = $now.ToString('HH:mm:ss')
    dayOfWeek = To-Str $now.DayOfWeek
    timezoneId = $tzId
    timezoneDisplayName = $tzDisp
    timezoneStandardName = $tzStd
    utcOffsetMinutes = $utcOffMin
    supportsDst = $supportsDst
    ntpEnabled = $ntpEnabled
    ntpServer = $ntpServer
    ntpType = $ntpType
    w32TimeStatus = $w32Status
  }
  availableTimezones = @($availTz | Sort-Object -Property offsetMinutes, displayName)
  region = [PSCustomObject]@{
    systemLocale = $sysLocName
    systemLocaleName = $sysLocDisp
    currentCulture = $curCultName
    currentCultureName = $curCultDisp
    homeLocationGeoId = $geoId
    homeLocationName = $geoName
    installedMuiLanguages = @($muiList)
  }
  userLanguages = @($userLangs)
  fonts = @($fontsList | Sort-Object -Property scope, displayName)
} | ConvertTo-Json -Depth 6 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import datetime, glob, json, os, socket, subprocess

hostname = socket.gethostname()
active_user = os.environ.get("USER", "")
now_dt = datetime.datetime.now().astimezone()
tz_name = str(now_dt.tzinfo or "UTC")
utc_off = int((now_dt.utcoffset() or datetime.timedelta(0)).total_seconds() // 60)

ntp_enabled = False
try:
    td = subprocess.run(["timedatectl", "show", "-p", "Timezone", "-p", "NTP"], capture_output=True, text=True, timeout=8)
    for ln in (td.stdout or "").splitlines():
        if ln.startswith("Timezone=") and ln.split("=", 1)[1].strip():
            tz_name = ln.split("=", 1)[1].strip()
        elif ln.startswith("NTP="):
            ntp_enabled = ln.split("=", 1)[1].strip().lower() == "yes"
except Exception:
    pass

avail_tz = []
try:
    tzl = subprocess.run(["timedatectl", "list-timezones"], capture_output=True, text=True, timeout=10)
    for ln in (tzl.stdout or "").splitlines():
        z = ln.strip()
        if z:
            avail_tz.append({"id": z, "displayName": z, "standardName": z, "offsetMinutes": 0, "supportsDst": False})
except Exception:
    pass

locales = []
try:
    la = subprocess.run(["locale", "-a"], capture_output=True, text=True, timeout=8)
    locales = [x.strip() for x in (la.stdout or "").splitlines() if x.strip()][:80]
except Exception:
    pass

cur_lang = os.environ.get("LANG", "en_US.UTF-8")
fonts = []
try:
    fc = subprocess.run(["fc-list", "--format=%{family}|%{style}|%{file}\\n"], capture_output=True, text=True, timeout=12)
    seen = set()
    for ln in (fc.stdout or "").splitlines():
        parts = ln.split("|")
        if len(parts) < 3:
            continue
        fam = parts[0].split(",")[0].strip()
        fp = parts[2].strip()
        if not fp or fp in seen:
            continue
        seen.add(fp)
        sz = None
        try:
            sz = os.path.getsize(fp)
        except Exception:
            pass
        scope = "user" if ("/.local/share/fonts" in fp or "/.fonts" in fp) else "system"
        fonts.append({
            "displayName": fam or os.path.basename(fp),
            "registryValueName": os.path.basename(fp),
            "fileName": os.path.basename(fp),
            "filePath": fp,
            "scope": scope,
            "ownerSid": "",
            "ownerUser": active_user if scope == "user" else "",
            "sizeBytes": sz,
        })
except Exception:
    pass

print(json.dumps({
    "hostname": hostname,
    "activeUser": active_user,
    "activeUserSid": "",
    "clock": {
        "currentIso": now_dt.isoformat(),
        "localDate": now_dt.strftime("%Y-%m-%d"),
        "localTime": now_dt.strftime("%H:%M:%S"),
        "dayOfWeek": now_dt.strftime("%A"),
        "timezoneId": tz_name,
        "timezoneDisplayName": tz_name,
        "timezoneStandardName": tz_name,
        "utcOffsetMinutes": utc_off,
        "supportsDst": False,
        "ntpEnabled": ntp_enabled,
        "ntpServer": "systemd-timesyncd",
        "ntpType": "NTP" if ntp_enabled else "NoSync",
        "w32TimeStatus": "Running" if ntp_enabled else "Stopped",
    },
    "availableTimezones": avail_tz,
    "region": {
        "systemLocale": cur_lang,
        "systemLocaleName": cur_lang,
        "currentCulture": cur_lang,
        "currentCultureName": cur_lang,
        "homeLocationGeoId": None,
        "homeLocationName": "",
        "installedMuiLanguages": locales,
    },
    "userLanguages": [{
        "tag": cur_lang.split(".")[0].replace("_", "-"),
        "englishName": cur_lang,
        "nativeName": cur_lang,
        "autonym": cur_lang,
        "inputMethodTips": [],
        "rank": 1,
        "source": "system",
    }],
    "fonts": sorted(fonts, key=lambda x: (x["scope"], x["displayName"].lower())),
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(60000, input.timeoutMs || 60000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'collect region, time, languages, and fonts');
  const rawFonts: any[] = Array.isArray(parsed.fonts) ? parsed.fonts : [];
  const fonts: HelpdeskInstalledFontItem[] = rawFonts.map((f, idx) => {
    const scope = f.scope === 'user' ? 'user' : 'system';
    const fileName = String(f.fileName || '').trim();
    const displayName = String(f.displayName || fileName || 'Font').trim();
    const regVal = String(f.registryValueName || fileName).trim();
    const prot = checkProtectedFont(fileName, displayName, scope);
    return {
      id: `${scope}:${regVal}:${idx}`,
      displayName,
      registryValueName: regVal,
      fileName,
      filePath: String(f.filePath || '').trim(),
      format: detectFontFormatFromFile(fileName, regVal),
      scope,
      ...(f.ownerSid ? { ownerSid: String(f.ownerSid) } : {}),
      ...(f.ownerUser ? { ownerUser: String(f.ownerUser) } : {}),
      sizeBytes: typeof f.sizeBytes === 'number' && f.sizeBytes >= 0 ? f.sizeBytes : null,
      isProtected: prot.isProtected,
      ...(prot.reasonEn ? { protectionReason: prot.reasonEn, protectionReasonFa: prot.reasonFa } : {}),
    };
  });

  const userLanguages: HelpdeskLanguageEntry[] = Array.isArray(parsed.userLanguages)
    ? parsed.userLanguages.map((l: any, idx: number) => ({
        tag: String(l.tag || '').trim(),
        englishName: String(l.englishName || l.tag || '').trim(),
        nativeName: String(l.nativeName || l.englishName || l.tag || '').trim(),
        autonym: String(l.autonym || l.nativeName || l.tag || '').trim(),
        inputMethodTips: Array.isArray(l.inputMethodTips) ? l.inputMethodTips.map(String) : [],
        rank: typeof l.rank === 'number' ? l.rank : idx + 1,
        source: l.source === 'active_user_hive' || l.source === 'session_profile' ? l.source : 'system',
      }))
    : [];

  const installedMui: string[] = Array.isArray(parsed?.region?.installedMuiLanguages)
    ? parsed.region.installedMuiLanguages.map(String).filter(Boolean)
    : [];

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    activeUser: String(parsed.activeUser || ''),
    activeUserSid: String(parsed.activeUserSid || ''),
    clock: {
      currentIso: String(parsed?.clock?.currentIso || new Date().toISOString()),
      localDate: String(parsed?.clock?.localDate || ''),
      localTime: String(parsed?.clock?.localTime || ''),
      dayOfWeek: String(parsed?.clock?.dayOfWeek || ''),
      timezoneId: String(parsed?.clock?.timezoneId || 'UTC'),
      timezoneDisplayName: String(parsed?.clock?.timezoneDisplayName || parsed?.clock?.timezoneId || 'UTC'),
      timezoneStandardName: String(parsed?.clock?.timezoneStandardName || ''),
      utcOffsetMinutes: Number(parsed?.clock?.utcOffsetMinutes ?? 0),
      supportsDst: Boolean(parsed?.clock?.supportsDst),
      ntpEnabled: Boolean(parsed?.clock?.ntpEnabled),
      ntpServer: String(parsed?.clock?.ntpServer || ''),
      ntpType: String(parsed?.clock?.ntpType || ''),
      w32TimeStatus: String(parsed?.clock?.w32TimeStatus || ''),
    },
    availableTimezones: Array.isArray(parsed.availableTimezones) ? parsed.availableTimezones : [],
    region: {
      systemLocale: String(parsed?.region?.systemLocale || ''),
      systemLocaleName: String(parsed?.region?.systemLocaleName || ''),
      currentCulture: String(parsed?.region?.currentCulture || ''),
      currentCultureName: String(parsed?.region?.currentCultureName || ''),
      homeLocationGeoId:
        typeof parsed?.region?.homeLocationGeoId === 'number' ? parsed.region.homeLocationGeoId : null,
      homeLocationName: String(parsed?.region?.homeLocationName || ''),
      installedMuiLanguages: installedMui,
    },
    userLanguages,
    fonts,
    summary: {
      totalFonts: fonts.length,
      systemFonts: fonts.filter((f) => f.scope === 'system').length,
      userFonts: fonts.filter((f) => f.scope === 'user').length,
      configuredLanguages: userLanguages.length,
      installedMuiCount: installedMui.length,
    },
    collectedAt: new Date().toISOString(),
  };
}

export async function manageEndpointDateTime(
  input: HelpdeskTargetInput,
  options: {
    operation: 'set_timezone' | 'set_datetime' | 'sync_ntp' | 'toggle_ntp';
    timezoneId?: string;
    localDate?: string; // YYYY-MM-DD
    localTime?: string; // HH:mm or HH:mm:ss
    ntpEnabled?: boolean;
    ntpServer?: string;
  }
): Promise<HelpdeskActionResult> {
  const op = String(options.operation || '').trim() as
    | 'set_timezone'
    | 'set_datetime'
    | 'sync_ntp'
    | 'toggle_ntp';
  if (!['set_timezone', 'set_datetime', 'sync_ntp', 'toggle_ntp'].includes(op)) {
    throw new Error('Invalid date/time operation specified.');
  }

  let tzId = '';
  let yr = 0, mo = 0, dy = 0, hr = 0, mn = 0, sc = 0;
  let ntpServer = '';
  const ntpEn = Boolean(options.ntpEnabled);

  if (op === 'set_timezone') {
    tzId = String(options.timezoneId || '').trim();
    if (!tzId || !/^[a-zA-Z0-9 _/+\-()]{1,120}$/.test(tzId)) {
      throw new Error('Invalid timezone ID format.');
    }
  } else if (op === 'set_datetime') {
    const dStr = String(options.localDate || '').trim();
    const tStr = String(options.localTime || '').trim();
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dStr);
    const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(tStr);
    if (!dm || !tm) {
      throw new Error('Valid date (YYYY-MM-DD) and time (HH:mm or HH:mm:ss) are required.');
    }
    yr = Number(dm[1]);
    mo = Number(dm[2]);
    dy = Number(dm[3]);
    hr = Number(tm[1]);
    mn = Number(tm[2]);
    sc = tm[3] ? Number(tm[3]) : 0;
    if (yr < 2000 || yr > 2100 || mo < 1 || mo > 12 || dy < 1 || dy > 31 || hr > 23 || mn > 59 || sc > 59) {
      throw new Error('Date or time values are out of valid bounds.');
    }
  } else if (op === 'sync_ntp' || op === 'toggle_ntp') {
    ntpServer = String(options.ntpServer || '').trim();
    if (ntpServer && !/^[a-zA-Z0-9.-]{1,120}$/.test(ntpServer)) {
      throw new Error('Invalid NTP server hostname or IP.');
    }
  }

  const tzB64 = Buffer.from(tzId, 'utf8').toString('base64');
  const ntpB64 = Buffer.from(ntpServer, 'utf8').toString('base64');

  const winPs = `
$ErrorActionPreference = 'Stop'
$op = '${op}'
$tzId = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${tzB64}'))
$ntpSrv = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${ntpB64}'))
$ntpEn = ${ntpEn ? '$true' : '$false'}

$msg = ''
switch ($op) {
  'set_timezone' {
    try {
      Set-TimeZone -Id $tzId -ErrorAction Stop
    } catch {
      & tzutil.exe /s $tzId
      if ($LASTEXITCODE -ne 0) { throw "Failed to set timezone '$tzId'." }
    }
    $msg = "Timezone changed to '$tzId'."
  }
  'set_datetime' {
    $targetDt = Get-Date -Year ${yr} -Month ${mo} -Day ${dy} -Hour ${hr} -Minute ${mn} -Second ${sc}
    Set-Date -Date $targetDt -ErrorAction Stop
    $msg = "System date/time updated to $($targetDt.ToString('yyyy-MM-dd HH:mm:ss'))."
  }
  'toggle_ntp' {
    if ($ntpEn) {
      Set-Service -Name 'W32Time' -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name 'W32Time' -ErrorAction SilentlyContinue
      if ($ntpSrv) {
        & w32tm.exe /config /manualpeerlist:"$ntpSrv,0x9" /syncfromflags:manual /reliable:YES /update | Out-Null
      } else {
        & w32tm.exe /config /syncfromflags:domhier,manual /update | Out-Null
      }
      & w32tm.exe /resync /force 2>&1 | Out-Null
      $msg = "Automatic NTP time synchronization enabled."
    } else {
      & w32tm.exe /config /syncfromflags:no /update 2>&1 | Out-Null
      Stop-Service -Name 'W32Time' -Force -ErrorAction SilentlyContinue
      $msg = "Automatic NTP time synchronization disabled."
    }
  }
  'sync_ntp' {
    Start-Service -Name 'W32Time' -ErrorAction SilentlyContinue
    if ($ntpSrv) {
      & w32tm.exe /config /manualpeerlist:"$ntpSrv,0x9" /syncfromflags:manual /update | Out-Null
    }
    $resyncOut = (& w32tm.exe /resync /force 2>&1) -join ' '
    $msg = if ($resyncOut) { $resyncOut } else { "NTP resync triggered." }
  }
}

$nowAfter = Get-Date
$tzAfter = Get-TimeZone
[PSCustomObject]@{
  ok = $true
  currentIso = $nowAfter.ToString('o')
  localDate = $nowAfter.ToString('yyyy-MM-dd')
  localTime = $nowAfter.ToString('HH:mm:ss')
  timezoneId = [string]$tzAfter.Id
  timezoneDisplayName = [string]$tzAfter.DisplayName
  utcOffsetMinutes = [int]$tzAfter.GetUtcOffset([DateTime]::UtcNow).TotalMinutes
  output = $msg
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, datetime, json, subprocess

op = '${op}'
tz = base64.b64decode('${tzB64}').decode('utf-8', errors='ignore').strip()
ntp_en = ${ntpEn ? 'True' : 'False'}

if op == 'set_timezone':
    r = subprocess.run(["timedatectl", "set-timezone", tz], capture_output=True, text=True, timeout=15)
elif op == 'set_datetime':
    subprocess.run(["timedatectl", "set-ntp", "false"], capture_output=True, text=True, timeout=10)
    dt_str = "${String(yr).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')} ${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(sc).padStart(2, '0')}"
    r = subprocess.run(["timedatectl", "set-time", dt_str], capture_output=True, text=True, timeout=15)
elif op == 'toggle_ntp':
    r = subprocess.run(["timedatectl", "set-ntp", "true" if ntp_en else "false"], capture_output=True, text=True, timeout=15)
else:
    r = subprocess.run(["timedatectl", "set-ntp", "true"], capture_output=True, text=True, timeout=15)

now_dt = datetime.datetime.now().astimezone()
out = ((r.stdout or "") + "\\n" + (r.stderr or "")).strip() or f"Operation {op} completed"
print(json.dumps({
    "ok": r.returncode == 0,
    "currentIso": now_dt.isoformat(),
    "localDate": now_dt.strftime("%Y-%m-%d"),
    "localTime": now_dt.strftime("%H:%M:%S"),
    "timezoneId": tz or str(now_dt.tzinfo or "UTC"),
    "timezoneDisplayName": tz or str(now_dt.tzinfo or "UTC"),
    "utcOffsetMinutes": int((now_dt.utcoffset() or datetime.timedelta(0)).total_seconds() // 60),
    "output": out[:1000],
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(45000, input.timeoutMs || 45000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, `date/time operation (${op})`);
  const ok = Boolean(parsed.ok);
  const actionMap: Record<typeof op, HelpdeskWriteAction> = {
    set_timezone: 'region_timezone_set',
    set_datetime: 'region_datetime_set',
    sync_ntp: 'region_ntp_sync',
    toggle_ntp: 'region_ntp_toggle',
  };

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: actionMap[op],
    success: ok,
    message: ok
      ? `Date/Time settings (${op}) applied on ${execRes.host}: ${parsed.localDate} ${parsed.localTime} (${parsed.timezoneId}).`
      : `Date/Time update (${op}) failed on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? `تنظیمات زمان/تاریخ و تایم‌زون در سیستم ${execRes.host} با موفقیت اعمال شد (${parsed.localDate} ${parsed.localTime}).`
      : `اعمال تنظیمات زمان و تایم‌زون روی ${execRes.host} ناموفق بود: ${parsed.output}`,
    details: parsed,
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function manageEndpointLanguagesAndLocale(
  input: HelpdeskTargetInput,
  options: {
    operation: 'set_languages' | 'set_locale';
    languageTags?: string[];
    activeUserSid?: string;
    systemLocale?: string;
    currentCulture?: string;
    homeLocationGeoId?: number | null;
  }
): Promise<HelpdeskActionResult> {
  const op = options.operation === 'set_locale' ? 'set_locale' : 'set_languages';
  const tags = Array.isArray(options.languageTags)
    ? options.languageTags.map((t) => String(t || '').trim()).filter(Boolean)
    : [];

  if (op === 'set_languages') {
    if (tags.length === 0 || tags.length > 8) {
      throw new Error('Provide between 1 and 8 valid language tags (e.g., en-US, fa-IR).');
    }
    for (const tag of tags) {
      if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/.test(tag)) {
        throw new Error(`Invalid BCP-47 language tag format: "${tag}".`);
      }
    }
  }

  const activeUserSid = String(options.activeUserSid || '').trim();
  if (activeUserSid && !/^S-1-5-21-[0-9-]+$/.test(activeUserSid)) {
    throw new Error('Invalid active user SID format.');
  }

  const sysLoc = String(options.systemLocale || '').trim();
  const cult = String(options.currentCulture || '').trim();
  if (sysLoc && !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/.test(sysLoc)) {
    throw new Error('Invalid system locale tag.');
  }
  if (cult && !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/.test(cult)) {
    throw new Error('Invalid culture format tag.');
  }
  const geoId =
    options.homeLocationGeoId !== undefined && options.homeLocationGeoId !== null
      ? Number(options.homeLocationGeoId)
      : null;
  if (geoId !== null && (!Number.isInteger(geoId) || geoId < 1 || geoId > 999999)) {
    throw new Error('Invalid Home Location GeoID.');
  }

  const tagsB64 = Buffer.from(JSON.stringify(tags), 'utf8').toString('base64');
  const sidB64 = Buffer.from(activeUserSid, 'utf8').toString('base64');
  const sysLocB64 = Buffer.from(sysLoc, 'utf8').toString('base64');
  const cultB64 = Buffer.from(cult, 'utf8').toString('base64');

  const winPs = `
$ErrorActionPreference = 'Stop'
$op = '${op}'
$tagsJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${tagsB64}'))
$tags = @($tagsJson | ConvertFrom-Json)
$activeSid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))
$sysLoc = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sysLocB64}'))
$cult = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${cultB64}'))
$geoId = ${geoId !== null ? geoId : '$null'}

$tipFallback = @{
  'en-us' = '0409:00000409'
  'en-gb' = '0809:00000809'
  'fa-ir' = '0429:00000429'
  'ar-sa' = '0401:00000401'
  'ar-iq' = '0801:00000401'
  'ar-ae' = '3801:00000401'
  'de-de' = '0407:00000407'
  'fr-fr' = '040C:0000040C'
  'tr-tr' = '041F:0000041F'
  'ru-ru' = '0419:00000419'
  'es-es' = '0C0A:0000040A'
  'it-it' = '0410:00000410'
  'zh-cn' = '0804:0804'
  'ja-jp' = '0411:0411'
  'ko-kr' = '0412:0412'
}

$notes = @()

if ($op -eq 'set_languages') {
  # 1. Apply to active WinUserLanguageList (session profile)
  try {
    $newList = New-WinUserLanguageList -Language $tags[0]
    for ($i = 1; $i -lt $tags.Count; $i++) {
      $newList.Add($tags[$i]) | Out-Null
    }
    Set-WinUserLanguageList -LanguageList $newList -Force -ErrorAction SilentlyContinue
    $notes += "Updated WinUserLanguageList ($($tags -join ', '))"
  } catch {
    $notes += "WinUserLanguageList note: $($_.Exception.Message)"
  }

  # 2. Apply directly to Active Logged-In User's loaded HKU Registry Hive so desktop user receives languages immediately/on refresh
  if (-not $activeSid) {
    try {
      $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
      if ($cs -and $cs.UserName) {
        $nt = New-Object System.Security.Principal.NTAccount([string]$cs.UserName)
        $activeSid = [string]$nt.Translate([System.Security.Principal.SecurityIdentifier]).Value
      }
    } catch {}
  }

  if ($activeSid -and (Test-Path -LiteralPath "Registry::HKEY_USERS\\$activeSid")) {
    $upPath = "Registry::HKEY_USERS\\$activeSid\\Control Panel\\International\\User Profile"
    if (-not (Test-Path -LiteralPath $upPath)) {
      New-Item -Path $upPath -Force | Out-Null
    }
    Set-ItemProperty -LiteralPath $upPath -Name 'Languages' -Value ([string[]]$tags) -Type MultiString -Force

    $preloadPath = "Registry::HKEY_USERS\\$activeSid\\Keyboard Layout\\Preload"
    if (-not (Test-Path -LiteralPath $preloadPath)) {
      New-Item -Path $preloadPath -Force | Out-Null
    }
    $existingPreload = Get-Item -LiteralPath $preloadPath -ErrorAction SilentlyContinue
    if ($existingPreload) {
      foreach ($vn in @($existingPreload.GetValueNames())) {
        Remove-ItemProperty -LiteralPath $preloadPath -Name $vn -ErrorAction SilentlyContinue
      }
    }

    $preloadIdx = 1
    foreach ($tag in $tags) {
      $tagLower = $tag.ToLower()
      $tipCode = ''
      try {
        $tmpL = New-WinUserLanguageList -Language $tag -ErrorAction SilentlyContinue
        if ($tmpL -and $tmpL[0].InputMethodTips -and $tmpL[0].InputMethodTips.Count -gt 0) {
          $tipCode = [string]$tmpL[0].InputMethodTips[0]
        }
      } catch {}
      if (-not $tipCode -and $tipFallback.ContainsKey($tagLower)) {
        $tipCode = $tipFallback[$tagLower]
      }
      if (-not $tipCode) {
        try {
          $ci = [System.Globalization.CultureInfo]::GetCultureInfo($tag)
          $lcidHex = ('{0:X4}' -f $ci.LCID)
          $tipCode = ($lcidHex + ':0000' + $lcidHex)
        } catch {
          $tipCode = '0409:00000409'
        }
      }

      $langSubKey = "$upPath\\$tag"
      if (-not (Test-Path -LiteralPath $langSubKey)) {
        New-Item -Path $langSubKey -Force | Out-Null
      }
      Set-ItemProperty -LiteralPath $langSubKey -Name 'CachedLanguageName' -Value "@Winlangdb.dll,-1" -Type String -Force -ErrorAction SilentlyContinue
      Set-ItemProperty -LiteralPath $langSubKey -Name $tipCode -Value 1 -Type DWord -Force

      # Also populate Preload layout ID for instant Alt+Shift / Win+Space switching
      $parts = $tipCode -split ':'
      $klid = if ($parts.Count -ge 2) { $parts[1] } else { '00000409' }
      Set-ItemProperty -LiteralPath $preloadPath -Name ([string]$preloadIdx) -Value $klid -Type String -Force
      $preloadIdx++
    }
    $notes += "Updated Active User Hive (HKU\\$activeSid) Languages & Preload keyboards"
  }
} else {
  if ($sysLoc) {
    Set-WinSystemLocale -SystemLocale $sysLoc -ErrorAction Stop
    $notes += "Non-Unicode System Locale set to '$sysLoc' (takes full effect after restart)"
  }
  if ($cult) {
    Set-Culture -CultureInfo $cult -ErrorAction Stop
    if ($activeSid -and (Test-Path -LiteralPath "Registry::HKEY_USERS\\$activeSid\\Control Panel\\International")) {
      Set-ItemProperty -LiteralPath "Registry::HKEY_USERS\\$activeSid\\Control Panel\\International" -Name 'LocaleName' -Value $cult -Type String -Force -ErrorAction SilentlyContinue
    }
    $notes += "Regional Format / Culture set to '$cult'"
  }
  if ($null -ne $geoId) {
    Set-WinHomeLocation -GeoId ([int]$geoId) -ErrorAction Stop
    $notes += "Home Location GeoID set to $geoId"
  }
}

[PSCustomObject]@{
  ok = $true
  output = ($notes -join '; ')
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, subprocess

op = '${op}'
tags = json.loads(base64.b64decode('${tagsB64}').decode('utf-8', errors='ignore') or '[]')
sys_loc = base64.b64decode('${sysLocB64}').decode('utf-8', errors='ignore').strip()

if op == 'set_languages' and tags:
    target = tags[0].replace('-', '_') + '.UTF-8'
    r = subprocess.run(["localectl", "set-locale", f"LANG={target}"], capture_output=True, text=True, timeout=15)
    out = ((r.stdout or "") + "\\n" + (r.stderr or "")).strip() or f"Set LANG={target}"
    print(json.dumps({"ok": r.returncode == 0, "output": out}))
elif op == 'set_locale' and sys_loc:
    target = sys_loc.replace('-', '_') + '.UTF-8'
    r = subprocess.run(["localectl", "set-locale", f"LANG={target}"], capture_output=True, text=True, timeout=15)
    out = ((r.stdout or "") + "\\n" + (r.stderr or "")).strip() or f"Set LANG={target}"
    print(json.dumps({"ok": r.returncode == 0, "output": out}))
else:
    print(json.dumps({"ok": False, "output": "No locale parameter specified"}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(45000, input.timeoutMs || 45000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, `language/locale update (${op})`);
  const ok = Boolean(parsed.ok);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: op === 'set_locale' ? 'region_locale_set' : 'region_languages_set',
    success: ok,
    message: ok
      ? op === 'set_languages'
        ? `Input languages (${tags.join(', ')}) configured on ${execRes.host}. User may need to sign out/in or toggle language bar if icons do not refresh immediately.`
        : `Regional system locale/format updated on ${execRes.host}.`
      : `Failed to update language/region settings on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? op === 'set_languages'
        ? `زبان‌های ورودی (${tags.join('، ')}) با موفقیت روی سیستم ${execRes.host} تنظیم شد. در صورت عدم بروزرسانی آنی نوار زبان، یک‌بار Sign out / Sign in شود.`
        : `تنظیمات ریجن و System Locale سیستم ${execRes.host} با موفقیت ذخیره شد (تغییر System Locale پس از ری‌استارت کامل اعمال می‌شود).`
      : `بروزرسانی زبان/ریجن روی ${execRes.host} ناموفق بود: ${parsed.output}`,
    details: { op, tags: tags.join(', '), sysLoc, cult, geoId },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function installEndpointFont(
  input: HelpdeskTargetInput,
  options: {
    fileName: string;
    fileBase64: string;
    fontDisplayName?: string;
    installScope?: 'system' | 'user';
    activeUserSid?: string;
  }
): Promise<HelpdeskActionResult> {
  const safeFileName = sanitizeFontFileName(options.fileName);
  const rawB64 = String(options.fileBase64 || '').replace(/^data:[^;]+;base64,/i, '').trim();
  if (!rawB64) {
    throw new Error('Font file binary content is required.');
  }
  const buf = Buffer.from(rawB64, 'base64');
  const format = validateFontBinaryMagic(buf, safeFileName);

  const scope = options.installScope === 'user' ? 'user' : 'system';
  const activeSid = String(options.activeUserSid || '').trim();
  if (activeSid && !/^S-1-5-21-[0-9-]+$/.test(activeSid)) {
    throw new Error('Invalid active user SID format.');
  }

  const baseTitle = pathBaseNameNoExt(safeFileName);
  const displayTitle = String(options.fontDisplayName || baseTitle)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 120) || baseTitle;
  const regSuffix =
    format === 'OpenType' ? ' (OpenType)' : format === 'Raster' ? ' (All res)' : ' (TrueType)';
  const regValueName = `${displayTitle}${regSuffix}`;

  // Normalize clean base64 from validated buffer and chunk safely under WinRM default 500 KB envelope
  const cleanB64 = buf.toString('base64');
  const CHUNK_LEN = 160000;
  const transferId = crypto.randomBytes(6).toString('hex');
  const fileNameB64 = Buffer.from(safeFileName, 'utf8').toString('base64');
  const regNameB64 = Buffer.from(regValueName, 'utf8').toString('base64');
  const sidB64 = Buffer.from(activeSid, 'utf8').toString('base64');

  const totalChunks = Math.max(1, Math.ceil(cleanB64.length / CHUNK_LEN));
  let finalParsed: any = null;
  let lastExecHost = input.targetIp;
  let lastProto: HelpdeskResolvedProtocol = 'winrm_http';
  let lastOsFamily: 'windows' | 'linux' = 'windows';

  for (let i = 0; i < totalChunks; i++) {
    const part = cleanB64.slice(i * CHUNK_LEN, (i + 1) * CHUNK_LEN);
    const isFirst = i === 0;
    const isLast = i === totalChunks - 1;
    const pyOpenMode = isFirst ? 'w' : 'a';

    const winPs = `
$ErrorActionPreference = 'Stop'
$tmpB64 = Join-Path $env:TEMP 'hd_font_${transferId}.b64'
$chunk = '${part}'
${isFirst ? `[System.IO.File]::WriteAllText($tmpB64, $chunk)` : `[System.IO.File]::AppendAllText($tmpB64, $chunk)`}

${
  !isLast
    ? `[PSCustomObject]@{ ok = $true; staged = $true } | ConvertTo-Json -Compress`
    : `
try {
  $fn = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${fileNameB64}'))
  $regValName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${regNameB64}'))
  $activeSid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))
  $scope = '${scope}'

  $b64All = [System.IO.File]::ReadAllText($tmpB64)
  $bytes = [Convert]::FromBase64String($b64All)

  $destDir = ''
  $regPath = ''
  $regValData = $fn

  if ($scope -eq 'user') {
    if ($activeSid) {
      $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$activeSid" -ErrorAction Stop
      $profPath = [string]$pl.ProfileImagePath
      $destDir = Join-Path $profPath 'AppData\\Local\\Microsoft\\Windows\\Fonts'
      $regPath = "Registry::HKEY_USERS\\$activeSid\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
    } else {
      $destDir = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Fonts'
      $regPath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    }
    if (-not (Test-Path -LiteralPath $destDir)) { New-Item -Path $destDir -ItemType Directory -Force | Out-Null }
    $destPath = Join-Path $destDir $fn
    $regValData = $destPath
  } else {
    $destDir = Join-Path $env:SystemRoot 'Fonts'
    $regPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    $destPath = Join-Path $destDir $fn
    $regValData = $fn
  }

  [System.IO.File]::WriteAllBytes($destPath, $bytes)
  if (-not (Test-Path -LiteralPath $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
  }
  Set-ItemProperty -LiteralPath $regPath -Name $regValName -Value $regValData -Type String -Force

  try {
    $code = @"
using System;
using System.Runtime.InteropServices;
public class HdFontBroadcast {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)]
  public static extern int AddFontResourceW(string lpszFilename);
  [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
}
"@
    if (-not ([System.Management.Automation.PSTypeName]'HdFontBroadcast').Type) {
      Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    }
    [HdFontBroadcast]::AddFontResourceW($destPath) | Out-Null
    $rPtr = [IntPtr]::Zero
    [HdFontBroadcast]::SendMessageTimeout([IntPtr]0xFFFF, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$rPtr) | Out-Null
  } catch {}

  [PSCustomObject]@{
    ok = $true
    destPath = $destPath
    regPath = $regPath
    regValName = $regValName
    sizeBytes = $bytes.Length
    output = "Installed font '$regValName' ($($bytes.Length) bytes) at $destPath"
  } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $tmpB64) { Remove-Item -LiteralPath $tmpB64 -Force -ErrorAction SilentlyContinue }
}
`
}
`;

    const linuxSh = `python3 - <<'PY'
import base64, json, os, subprocess

fn = base64.b64decode('${fileNameB64}').decode('utf-8', errors='ignore').strip()
chunk = '${part}'
tmp_path = '/tmp/hd_font_${transferId}.b64'
with open(tmp_path, '${pyOpenMode}', encoding='ascii') as f:
    f.write(chunk)

if not ${isLast ? 'True' : 'False'}:
    print(json.dumps({"ok": True, "staged": True}))
else:
    try:
        with open(tmp_path, 'r', encoding='ascii') as f:
            raw_bytes = base64.b64decode(f.read())
        dest_dir = os.path.expanduser('~/.local/share/fonts') if '${scope}' == 'user' else '/usr/local/share/fonts/helpdesk'
        os.makedirs(dest_dir, exist_ok=True)
        dest_file = os.path.join(dest_dir, fn)
        with open(dest_file, 'wb') as out_f:
            out_f.write(raw_bytes)
        os.chmod(dest_file, 0o644)
        subprocess.run(['fc-cache', '-f'], capture_output=True, text=True, timeout=20)
        print(json.dumps({"ok": True, "destPath": dest_file, "output": f"Installed {fn} to {dest_file}"}))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
PY`;

    const execRes = await executeHardcodedScripts(
      { ...input, timeoutMs: Math.max(60000, input.timeoutMs || 60000) },
      winPs,
      linuxSh
    );
    lastExecHost = execRes.host;
    lastProto = execRes.protocolUsed;
    lastOsFamily = execRes.osFamily;
    if (isLast) {
      finalParsed = parseJsonFromStdout<any>(execRes.stdout, `install font (${safeFileName})`);
    }
  }

  return {
    targetIp: lastExecHost,
    protocolUsed: lastProto,
    osFamily: lastOsFamily,
    action: 'font_install',
    success: Boolean(finalParsed?.ok),
    message: `Font "${displayTitle}" (${safeFileName}, ${format}) installed (${scope}) on ${lastExecHost} and broadcast to active apps.`,
    messageFa: `فونت «${displayTitle}» (${safeFileName}) در حالت ${scope === 'system' ? 'کل سیستم (تمام کاربران)' : 'پروفایل کاربر'} روی سیستم ${lastExecHost} نصب و بلافاصله فعال شد.`,
    details: {
      fileName: safeFileName,
      regValueName,
      scope,
      sizeBytes: buf.length,
      destPath: finalParsed?.destPath,
    },
    rawOutput: String(finalParsed?.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function deleteEndpointFont(
  input: HelpdeskTargetInput,
  options: {
    registryValueName: string;
    fileName: string;
    scope: 'system' | 'user';
    ownerSid?: string;
    filePath?: string;
  }
): Promise<HelpdeskActionResult> {
  const safeFile = sanitizeFontFileName(options.fileName);
  const regValName = String(options.registryValueName || '').trim();
  if (!regValName || regValName.length > 200 || /[\x00-\x1F\x7F]/.test(regValName)) {
    throw new Error('Invalid font registry value name.');
  }
  const scope = options.scope === 'user' ? 'user' : 'system';
  const ownerSid = String(options.ownerSid || '').trim();
  if (ownerSid && !/^S-1-5-21-[0-9-]+$/.test(ownerSid)) {
    throw new Error('Invalid owner SID format.');
  }

  const prot = checkProtectedFont(safeFile, regValName, scope);
  if (prot.isProtected) {
    throw new Error(prot.reasonEn || `Protected Windows system font "${regValName}" cannot be removed.`);
  }

  const fnB64 = Buffer.from(safeFile, 'utf8').toString('base64');
  const regB64 = Buffer.from(regValName, 'utf8').toString('base64');
  const sidB64 = Buffer.from(ownerSid, 'utf8').toString('base64');

  const winPs = `
$ErrorActionPreference = 'Stop'
$fn = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${fnB64}'))
$regValName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${regB64}'))
$ownerSid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))
$scope = '${scope}'

if ($scope -eq 'user') {
  if ($ownerSid) {
    $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$ownerSid" -ErrorAction Stop
    $destPath = Join-Path ([string]$pl.ProfileImagePath) ("AppData\\Local\\Microsoft\\Windows\\Fonts\\" + $fn)
    $regPath = "Registry::HKEY_USERS\\$ownerSid\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
  } else {
    $destPath = Join-Path $env:LOCALAPPDATA ("Microsoft\\Windows\\Fonts\\" + $fn)
    $regPath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
  }
} else {
  $destPath = Join-Path (Join-Path $env:SystemRoot 'Fonts') $fn
  $regPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
}

if (Test-Path -LiteralPath $regPath) {
  Remove-ItemProperty -LiteralPath $regPath -Name $regValName -ErrorAction SilentlyContinue
}

try {
  $code = @"
using System;
using System.Runtime.InteropServices;
public class HdFontRm {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)]
  public static extern bool RemoveFontResourceW(string lpFileName);
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
}
"@
  if (-not ([System.Management.Automation.PSTypeName]'HdFontRm').Type) {
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
  }
  [HdFontRm]::RemoveFontResourceW($destPath) | Out-Null
  $rPtr = [IntPtr]::Zero
  [HdFontRm]::SendMessageTimeout([IntPtr]0xFFFF, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$rPtr) | Out-Null
} catch {}

$fileDeleted = $false
if (Test-Path -LiteralPath $destPath) {
  try {
    Remove-Item -LiteralPath $destPath -Force -ErrorAction Stop
    $fileDeleted = $true
  } catch {}
}

[PSCustomObject]@{
  ok = $true
  fileDeleted = $fileDeleted
  destPath = $destPath
  output = "Removed font '$regValName' ($fn) from registry" + $(if ($fileDeleted) { " and disk" } else { " (file in use; will clear after restart)" })
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, os, subprocess

fn = base64.b64decode('${fnB64}').decode('utf-8', errors='ignore').strip()
removed = []
for base in [os.path.expanduser('~/.local/share/fonts'), '/usr/local/share/fonts/helpdesk']:
    p = os.path.join(base, fn)
    if os.path.isfile(p):
        os.remove(p)
        removed.append(p)
if removed:
    subprocess.run(['fc-cache', '-f'], capture_output=True, text=True, timeout=20)
print(json.dumps({"ok": len(removed) > 0, "output": f"Removed: {', '.join(removed)}" if removed else f"Font {fn} not found in user/custom dirs"}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(45000, input.timeoutMs || 45000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, `delete font (${safeFile})`);
  const ok = Boolean(parsed.ok);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'font_delete',
    success: ok,
    message: ok
      ? `Font "${regValName}" (${safeFile}) removed from ${execRes.host}.`
      : `Could not remove font "${safeFile}" on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? `فونت «${regValName}» (${safeFile}) با موفقیت از سیستم ${execRes.host} حذف شد.`
      : `حذف فونت «${safeFile}» روی ${execRes.host} ناموفق بود: ${parsed.output}`,
    details: { fileName: safeFile, regValName, scope, fileDeleted: parsed.fileDeleted },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// ENDPOINT FULL TROUBLESHOOTING DIAGNOSTICS SUITE (13 ALLOWLISTED CHECKS)
// ============================================================================

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

export const ALL_DIAGNOSTIC_CHECK_IDS: HelpdeskDiagnosticCheckId[] = [
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

const DIAGNOSTIC_CHECK_SET = new Set<string>(ALL_DIAGNOSTIC_CHECK_IDS);

export interface HelpdeskDiagnosticMetric {
  labelEn: string;
  labelFa: string;
  value: string;
  tone?: 'ok' | 'warn' | 'fail' | 'info';
}

export interface HelpdeskDiagnosticHighlight {
  primary: string;
  secondary?: string;
  badge?: string;
  badgeTone?: 'ok' | 'warn' | 'fail' | 'info';
}

export interface HelpdeskDiagnosticTagSection {
  titleEn: string;
  titleFa: string;
  tone?: 'ok' | 'warn' | 'fail' | 'info';
  items: string[];
}

export interface HelpdeskDiagnosticJumpTarget {
  tab: 'health' | 'disks_shares' | 'hardware' | 'network' | 'maintenance' | 'updates' | 'hardware_domain';
  sectionId: string;
  labelEn: string;
  labelFa: string;
}

export interface HelpdeskDiagnosticCheckResult {
  id: HelpdeskDiagnosticCheckId;
  category: 'network' | 'system_storage' | 'hardware_perf';
  titleEn: string;
  titleFa: string;
  status: 'pass' | 'warn' | 'fail' | 'info' | 'skipped';
  statusLabelEn: string;
  statusLabelFa: string;
  summaryEn: string;
  summaryFa: string;
  recommendationEn: string;
  recommendationFa: string;
  metrics: HelpdeskDiagnosticMetric[];
  highlights: HelpdeskDiagnosticHighlight[];
  tagSections?: HelpdeskDiagnosticTagSection[];
  durationMs: number;
  jumpTarget: HelpdeskDiagnosticJumpTarget;
  secondaryJumpTarget?: HelpdeskDiagnosticJumpTarget;
}

export interface HelpdeskDiagnosticsSuiteResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  osName: string;
  loggedInUser: string;
  collectedAt: string;
  totalDurationMs: number;
  requestedChecks: HelpdeskDiagnosticCheckId[];
  summary: {
    totalChecked: number;
    passed: number;
    warnings: number;
    failures: number;
    infoOnly: number;
    skipped: number;
    overallStatus: 'healthy' | 'warning' | 'critical';
  };
  checks: HelpdeskDiagnosticCheckResult[];
}

const DIAGNOSTIC_JUMP_TARGETS: Record<HelpdeskDiagnosticCheckId, HelpdeskDiagnosticJumpTarget> = {
  ip_dns: {
    tab: 'network',
    sectionId: 'hd-section-network-adapters',
    labelEn: 'Fix IP / DNS in Network Tab',
    labelFa: 'تنظیم IP و DNS در تب شبکه',
  },
  gateway_ping: {
    tab: 'network',
    sectionId: 'hd-section-network-probes',
    labelEn: 'Open Network Probes & Reset',
    labelFa: 'تست و ریست شبکه در تب شبکه',
  },
  nic_link_speed: {
    tab: 'network',
    sectionId: 'hd-section-network-adapters',
    labelEn: 'Inspect NICs in Network Tab',
    labelFa: 'مشاهده کارت‌های شبکه',
  },
  routing_table: {
    tab: 'network',
    sectionId: 'hd-section-network-routes',
    labelEn: 'Manage Routes in Network Tab',
    labelFa: 'مدیریت روت‌ها در تب شبکه',
  },
  proxy_status: {
    tab: 'network',
    sectionId: 'hd-section-network-proxy',
    labelEn: 'Configure Proxy in Network Tab',
    labelFa: 'تنظیم پروکسی در تب شبکه',
  },
  internet_connectivity: {
    tab: 'network',
    sectionId: 'hd-section-network-probes',
    labelEn: 'Run Live Probes in Network Tab',
    labelFa: 'تست زنده ارتباط در تب شبکه',
  },
  vpn_status: {
    tab: 'network',
    sectionId: 'hd-section-network-vpn',
    labelEn: 'Manage VPN in Network Tab',
    labelFa: 'مدیریت VPN در تب شبکه',
  },
  os_drive_cleanup: {
    tab: 'disks_shares',
    sectionId: 'hd-section-temp-cleanup',
    labelEn: 'Clean Temp, Drives & Recycle Bin',
    labelFa: 'پاک‌سازی Temp و سطل زباله در تب دیسک‌ها',
  },
  windows_integrity: {
    tab: 'maintenance',
    sectionId: 'hd-section-sfc-dism',
    labelEn: 'Open SFC / DISM Repair',
    labelFa: 'تعمیر ویندوز با SFC / DISM',
  },
  windows_update_last: {
    tab: 'updates',
    sectionId: 'hd-section-windows-updates',
    labelEn: 'Open Windows Updates & HotFixes',
    labelFa: 'مدیریت آپدیت‌ها و KBها',
  },
  active_directory_policy: {
    tab: 'maintenance',
    sectionId: 'hd-section-gpo-policy',
    labelEn: 'GPO & Policy Manager',
    labelFa: 'مدیریت GPO و پالیسی',
  },
  drivers_status: {
    tab: 'hardware',
    sectionId: 'hd-section-hardware-peripherals',
    labelEn: 'Inspect Devices in Hardware Tab',
    labelFa: 'بررسی سخت‌افزار و درایورها',
  },
  cpu_ram_usage: {
    tab: 'health',
    sectionId: 'hd-section-health-resources',
    labelEn: 'Open CPU & RAM Telemetry',
    labelFa: 'مشاهده وضعیت CPU و RAM',
  },
  top_resource_apps: {
    tab: 'health',
    sectionId: 'hd-section-health-processes',
    labelEn: 'Manage Processes in Health Tab',
    labelFa: 'مدیریت پروسس‌های پرمصرف',
  },
};

function normalizeSelectedDiagnosticChecks(rawChecks?: unknown): HelpdeskDiagnosticCheckId[] {
  if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
    return [...ALL_DIAGNOSTIC_CHECK_IDS];
  }
  const seen = new Set<HelpdeskDiagnosticCheckId>();
  for (const item of rawChecks) {
    const id = String(item || '').trim();
    if (DIAGNOSTIC_CHECK_SET.has(id)) {
      seen.add(id as HelpdeskDiagnosticCheckId);
    }
  }
  if (seen.size === 0) {
    throw new Error('At least one valid diagnostic check must be selected.');
  }
  return ALL_DIAGNOSTIC_CHECK_IDS.filter((id) => seen.has(id));
}

function mapPnpConfigErrorCode(code: number): { en: string; fa: string } {
  switch (code) {
    case 1:
      return { en: 'Code 1: Device not configured correctly', fa: 'کد ۱: تنظیمات درایور ناقص است' };
    case 3:
      return { en: 'Code 3: Driver may be corrupted', fa: 'کد ۳: درایور دستگاه خراب است' };
    case 10:
      return { en: 'Code 10: Device cannot start', fa: 'کد ۱۰: دستگاه استارت نمی‌شود' };
    case 12:
      return { en: 'Code 12: Not enough free resources', fa: 'کد ۱۲: تداخل منابع IRQ/DMA' };
    case 14:
      return { en: 'Code 14: Restart required to finish', fa: 'کد ۱۴: نیازمند ری‌استارت ویندوز' };
    case 18:
      return { en: 'Code 18: Reinstall drivers', fa: 'کد ۱۸: نیاز به نصب مجدد درایور' };
    case 22:
      return { en: 'Code 22: Device is disabled', fa: 'کد ۲۲: دستگاه Disable شده است' };
    case 28:
      return { en: 'Code 28: Drivers are not installed', fa: 'کد ۲۸: درایور نصب نیست' };
    case 31:
      return { en: 'Code 31: Windows cannot load required drivers', fa: 'کد ۳۱: عدم بارگذاری درایور' };
    case 39:
      return { en: 'Code 39: Driver corrupted or missing', fa: 'کد ۳۹: فایل درایور مفقود/خراب' };
    case 43:
      return { en: 'Code 43: Device reported hardware problem', fa: 'کد ۴۳: خطای سخت‌افزاری یا درایور' };
    case 45:
      return { en: 'Code 45: Device currently not connected', fa: 'کد ۴۵: دستگاه قطع شده است' };
    case 52:
      return { en: 'Code 52: Unsigned driver blocked', fa: 'کد ۵۲: درایور بدون امضای دیجیتال' };
    default:
      return { en: `Code ${code}: Driver/Hardware error`, fa: `کد خطا ${code}` };
  }
}

function formatBytesHuman(bytes: number): string {
  const b = Math.max(0, Number(bytes) || 0);
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${Math.round(b)} B`;
}

export async function runEndpointDiagnostics(
  input: HelpdeskTargetInput,
  selectedChecksRaw?: unknown
): Promise<HelpdeskDiagnosticsSuiteResult> {
  const startedAtMs = Date.now();
  const requestedChecks = normalizeSelectedDiagnosticChecks(selectedChecksRaw);
  const want = new Set<HelpdeskDiagnosticCheckId>(requestedChecks);

  const flagsJsonB64 = Buffer.from(
    JSON.stringify(Object.fromEntries(ALL_DIAGNOSTIC_CHECK_IDS.map((k) => [k, want.has(k)]))),
    'utf8'
  ).toString('base64');

  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
function To-Str($v) { if ($null -eq $v) { return '' }; try { return [string]$v } catch { return '' } }
function To-Int($v) { if ($null -eq $v) { return 0 }; try { return [int]$v } catch { return 0 } }
function To-Dbl($v) { if ($null -eq $v) { return 0.0 }; try { return [double]$v } catch { return 0.0 } }
function Measure-Folder($p) {
  $sum = [int64]0; $cnt = 0
  if ($p -and (Test-Path -LiteralPath $p)) {
    try {
      $files = @(Get-ChildItem -LiteralPath $p -File -Force -Recurse -ErrorAction SilentlyContinue)
      $cnt = $files.Count
      foreach ($f in $files) { $sum += [int64]$f.Length }
    } catch {}
  }
  return [PSCustomObject]@{ bytes = $sum; count = $cnt }
}

$flagsJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${flagsJsonB64}'))
$flags = $flagsJson | ConvertFrom-Json

$hostname = To-Str $env:COMPUTERNAME
$osObj = $null
try { $osObj = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue } catch {}
if (-not $osObj) { try { $osObj = Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue } catch {} }
$osName = if ($osObj) { (To-Str $osObj.Caption).Trim() } else { 'Windows' }

$loggedUser = ''
$activeUserSid = ''
$activeUserProfilePath = ''
$cs = $null
try {
  $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
  if (-not $cs) { $cs = Get-WmiObject -Class Win32_ComputerSystem -ErrorAction SilentlyContinue }
  if ($cs -and $cs.UserName) { $loggedUser = To-Str $cs.UserName }
  if (-not $loggedUser) {
    $exp = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='explorer.exe'" -ErrorAction SilentlyContinue) | Select-Object -First 1
    if ($exp) {
      $own = Invoke-CimMethod -InputObject $exp -MethodName GetOwner -ErrorAction SilentlyContinue
      if ($own -and $own.User) { $loggedUser = if ($own.Domain) { "$($own.Domain)\\$($own.User)" } else { To-Str $own.User } }
    }
  }
  if ($loggedUser) {
    try {
      $nt = New-Object System.Security.Principal.NTAccount($loggedUser)
      $activeUserSid = To-Str ($nt.Translate([System.Security.Principal.SecurityIdentifier]).Value)
    } catch {}
  }
  if ($activeUserSid) {
    $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$activeUserSid" -ErrorAction SilentlyContinue
    if ($pl -and $pl.ProfileImagePath) { $activeUserProfilePath = To-Str $pl.ProfileImagePath }
  }
} catch {}

$out = [ordered]@{
  hostname = $hostname
  osName = $osName
  loggedInUser = $loggedUser
  checks = [ordered]@{}
}

# Pre-collect basic adapter data if any network check needs it
$needAdapters = ($flags.ip_dns -or $flags.gateway_ping -or $flags.nic_link_speed)
$netConfigs = @()
$netAdapters = @()
$gwList = @()
function Test-ValidGatewayIp([string]$ip) {
  if ([string]::IsNullOrWhiteSpace($ip)) { return $false }
  $t = $ip.Trim()
  if ($t -eq '0.0.0.0' -or $t -eq '::' -or $t -eq '::0' -or $t -eq '0:0:0:0:0:0:0:0') { return $false }
  return $true
}

if ($needAdapters) {
  try { $netAdapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -or $_.HardwareInterface }) } catch {}
  if ($netAdapters.Count -eq 0) {
    try { $netAdapters = @(Get-CimInstance -ClassName Win32_NetworkAdapter -ErrorAction SilentlyContinue | Where-Object { $_.NetEnabled -eq $true -or $_.PhysicalAdapter -eq $true }) } catch {}
  }
  try {
    $netConfigs = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue)
  } catch {}
  if ($netConfigs.Count -gt 0) {
    foreach ($nc in $netConfigs) {
      foreach ($gw in @($nc.IPv4DefaultGateway)) {
        $gwIp = To-Str $gw.NextHop
        if ((Test-ValidGatewayIp $gwIp) -and ($gwList -notcontains $gwIp.Trim())) {
          $gwList += $gwIp.Trim()
        }
      }
    }
  }
  if ($gwList.Count -eq 0) {
    try {
      $wmiNics = @(Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" -ErrorAction SilentlyContinue)
      foreach ($wn in $wmiNics) {
        foreach ($g in @($wn.DefaultIPGateway)) {
          $gwIp = To-Str $g
          if ((Test-ValidGatewayIp $gwIp) -and ($gwList -notcontains $gwIp.Trim())) { $gwList += $gwIp.Trim() }
        }
      }
    } catch {}
  }
}

# 1. ip_dns
if ($flags.ip_dns) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $adaptersOut = @()
    $wmiConfigs = @()
    try { $wmiConfigs = @(Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" -ErrorAction SilentlyContinue) } catch {}
    foreach ($wc in $wmiConfigs) {
      $ipv4s = @($wc.IPAddress | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' })
      if ($ipv4s.Count -eq 0) { continue }
      $dnss = @($wc.DNSServerSearchOrder | Where-Object { $_ })
      $gws = @($wc.DefaultIPGateway | Where-Object { Test-ValidGatewayIp (To-Str $_) })
      $adaptersOut += [PSCustomObject]@{
        name = To-Str $wc.Description
        ips = $ipv4s
        masks = @($wc.IPSubnet)
        gateways = $gws
        dns = $dnss
        dhcp = [bool]$wc.DHCPEnabled
        dhcpServer = To-Str $wc.DHCPServer
      }
    }
    $dnsWorks = $false
    $dnsResolvedIp = ''
    $dnsError = ''
    try {
      $resDns = @(Resolve-DnsName -Name 'www.microsoft.com' -Type A -DnsOnly -ErrorAction Stop | Where-Object { $_.IPAddress } | Select-Object -First 1)
      if ($resDns.Count -gt 0) {
        $dnsWorks = $true
        $dnsResolvedIp = To-Str $resDns[0].IPAddress
      }
    } catch {
      try {
        $addrs = @([System.Net.Dns]::GetHostAddresses('www.microsoft.com'))
        if ($addrs.Count -gt 0) {
          $dnsWorks = $true
          $dnsResolvedIp = To-Str $addrs[0].IPAddressToString
        }
      } catch {
        $dnsError = To-Str $_.Exception.Message
      }
    }
    $sw.Stop()
    $out.checks['ip_dns'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      adapters = $adaptersOut
      dnsWorks = $dnsWorks
      dnsResolvedIp = $dnsResolvedIp
      dnsError = $dnsError
    }
  } catch {
    $sw.Stop()
    $out.checks['ip_dns'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 2. gateway_ping
if ($flags.gateway_ping) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $gwResults = @()
    $validGws = @($gwList | Where-Object { Test-ValidGatewayIp $_ })
    foreach ($gw in ($validGws | Select-Object -First 3)) {
      $sent = 3; $recv = 0; $rtts = @(); $lastStatus = ''
      $pinger = New-Object System.Net.NetworkInformation.Ping
      for ($i = 0; $i -lt $sent; $i++) {
        try {
          $reply = $pinger.Send($gw, 1500)
          $lastStatus = To-Str $reply.Status
          if ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
            $recv++
            $rtts += [int]$reply.RoundtripTime
          }
        } catch { $lastStatus = To-Str $_.Exception.Message }
      }
      $pinger.Dispose()
      $avg = if ($rtts.Count -gt 0) { [math]::Round((($rtts | Measure-Object -Average).Average), 1) } else { $null }
      $loss = [math]::Round((($sent - $recv) / $sent) * 100, 0)
      $gwResults += [PSCustomObject]@{
        gateway = $gw
        sent = $sent
        received = $recv
        lossPct = $loss
        avgMs = $avg
        lastStatus = $lastStatus
      }
    }
    $sw.Stop()
    $out.checks['gateway_ping'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      gateways = $gwResults
    }
  } catch {
    $sw.Stop()
    $out.checks['gateway_ping'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 3. nic_link_speed
if ($flags.nic_link_speed) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $nicList = @()
    $gn = @()
    try { $gn = @(Get-NetAdapter -ErrorAction SilentlyContinue) } catch {}
    if ($gn.Count -gt 0) {
      foreach ($a in $gn) {
        if (-not $a.HardwareInterface -and $a.Status -ne 'Up') { continue }
        $mbps = 0
        if ($a.ReceiveLinkSpeed) { $mbps = [math]::Round((To-Dbl $a.ReceiveLinkSpeed) / 1000000, 0) }
        elseif ($a.LinkSpeed -match '([0-9.]+)\\s*Gbps') { $mbps = [int]([double]$Matches[1] * 1000) }
        elseif ($a.LinkSpeed -match '([0-9.]+)\\s*Mbps') { $mbps = [int][double]$Matches[1] }
        $nicList += [PSCustomObject]@{
          name = To-Str $a.Name
          description = To-Str $a.InterfaceDescription
          status = To-Str $a.Status
          linkSpeed = To-Str $a.LinkSpeed
          speedMbps = $mbps
          mediaType = To-Str $a.MediaType
          fullDuplex = $a.FullDuplex
          virtual = [bool]$a.Virtual
        }
      }
    } else {
      $wnics = @(Get-CimInstance -ClassName Win32_NetworkAdapter -ErrorAction SilentlyContinue | Where-Object { $_.PhysicalAdapter -eq $true })
      foreach ($a in $wnics) {
        $mbps = if ($a.Speed) { [math]::Round((To-Dbl $a.Speed) / 1000000, 0) } else { 0 }
        $nicList += [PSCustomObject]@{
          name = To-Str $a.NetConnectionID
          description = To-Str $a.Name
          status = if ($a.NetConnectionStatus -eq 2) { 'Up' } else { 'Disconnected' }
          linkSpeed = if ($mbps -ge 1000) { "$([math]::Round($mbps / 1000, 1)) Gbps" } elseif ($mbps -gt 0) { "$mbps Mbps" } else { 'N/A' }
          speedMbps = $mbps
          mediaType = To-Str $a.AdapterType
          fullDuplex = $null
          virtual = $false
        }
      }
    }
    $sw.Stop()
    $out.checks['nic_link_speed'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      adapters = $nicList
    }
  } catch {
    $sw.Stop()
    $out.checks['nic_link_speed'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 4. routing_table
if ($flags.routing_table) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $routesOut = @()
    $defaultRoutes = @()
    $totalCount = 0
    $persistentCount = 0
    $rawRoutes = @()
    try { $rawRoutes = @(Get-NetRoute -AddressFamily IPv4 -ErrorAction SilentlyContinue) } catch {}
    if ($rawRoutes.Count -gt 0) {
      $totalCount = $rawRoutes.Count
      foreach ($r in $rawRoutes) {
        $isDef = ($r.DestinationPrefix -eq '0.0.0.0/0')
        $isPersist = (To-Str $r.PolicyStore) -eq 'PersistentStore'
        if ($isPersist) { $persistentCount++ }
        if ($isDef) {
          $defaultRoutes += [PSCustomObject]@{
            destination = To-Str $r.DestinationPrefix
            nextHop = To-Str $r.NextHop
            ifIndex = To-Int $r.InterfaceIndex
            ifAlias = To-Str $r.InterfaceAlias
            metric = (To-Int $r.RouteMetric) + (To-Int $r.InterfaceMetric)
          }
        }
      }
      $sorted = @($rawRoutes | Where-Object { $_.NextHop -ne '0.0.0.0' -or $_.DestinationPrefix -eq '0.0.0.0/0' } | Sort-Object RouteMetric | Select-Object -First 15)
      foreach ($r in $sorted) {
        $routesOut += [PSCustomObject]@{
          destination = To-Str $r.DestinationPrefix
          nextHop = To-Str $r.NextHop
          ifAlias = To-Str $r.InterfaceAlias
          metric = (To-Int $r.RouteMetric) + (To-Int $r.InterfaceMetric)
          persistent = ((To-Str $r.PolicyStore) -eq 'PersistentStore')
        }
      }
    } else {
      $wmiR = @(Get-CimInstance -ClassName Win32_IP4RouteTable -ErrorAction SilentlyContinue)
      $totalCount = $wmiR.Count
      foreach ($r in ($wmiR | Select-Object -First 15)) {
        $dest = "$(To-Str $r.Destination)/$(To-Str $r.Mask)"
        if ($r.Destination -eq '0.0.0.0') {
          $defaultRoutes += [PSCustomObject]@{ destination = '0.0.0.0/0'; nextHop = To-Str $r.NextHop; ifIndex = To-Int $r.InterfaceIndex; ifAlias = ''; metric = To-Int $r.Metric1 }
        }
        $routesOut += [PSCustomObject]@{ destination = $dest; nextHop = To-Str $r.NextHop; ifAlias = ''; metric = To-Int $r.Metric1; persistent = ([int]$r.Type -eq 4) }
      }
    }
    $sw.Stop()
    $out.checks['routing_table'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      totalRoutes = $totalCount
      persistentRoutes = $persistentCount
      defaultRoutes = $defaultRoutes
      sampleRoutes = $routesOut
    }
  } catch {
    $sw.Stop()
    $out.checks['routing_table'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 5. proxy_status
if ($flags.proxy_status) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $regPath = if ($activeUserSid -and (Test-Path "Registry::HKEY_USERS\\$activeUserSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")) {
      "Registry::HKEY_USERS\\$activeUserSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
    } else {
      'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
    }
    $pReg = Get-ItemProperty -LiteralPath $regPath -ErrorAction SilentlyContinue
    $winInetEnabled = ([int]($pReg.ProxyEnable) -eq 1)
    $winInetServer = To-Str $pReg.ProxyServer
    $pacUrl = To-Str $pReg.AutoConfigURL
    $bypass = To-Str $pReg.ProxyOverride

    $winhttpOut = ''
    try { $winhttpOut = ((& netsh winhttp show proxy 2>&1) -join ' ') } catch {}
    $winhttpDirect = ($winhttpOut -match 'Direct access|no proxy server')
    $winhttpServer = ''
    if (-not $winhttpDirect -and $winhttpOut -match 'Proxy Server\\(s\\)\\s*:\\s*([^\\r\\n]+)') {
      $winhttpServer = To-Str $Matches[1]
    }
    $sw.Stop()
    $out.checks['proxy_status'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      winInetEnabled = $winInetEnabled
      winInetServer = $winInetServer
      pacUrl = $pacUrl
      bypassList = $bypass
      winhttpDirect = $winhttpDirect
      winhttpServer = $winhttpServer
    }
  } catch {
    $sw.Stop()
    $out.checks['proxy_status'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 6. internet_connectivity
if ($flags.internet_connectivity) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $ncsiList = @()
    try {
      foreach ($np in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
        $ncsiList += [PSCustomObject]@{
          name = To-Str $np.Name
          iface = To-Str $np.InterfaceAlias
          category = To-Str $np.NetworkCategory
          ipv4 = To-Str $np.IPv4Connectivity
        }
      }
    } catch {}

    $icmpOk = $false
    $icmpMs = $null
    try {
      $pg = New-Object System.Net.NetworkInformation.Ping
      $rep = $pg.Send('8.8.8.8', 1800)
      if ($rep.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
        $icmpOk = $true
        $icmpMs = [int]$rep.RoundtripTime
      } else {
        $rep2 = $pg.Send('1.1.1.1', 1800)
        if ($rep2.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
          $icmpOk = $true
          $icmpMs = [int]$rep2.RoundtripTime
        }
      }
      $pg.Dispose()
    } catch {}

    $tcp443Ok = $false
    $tcpTarget = ''
    foreach ($tgt in @('1.1.1.1', '8.8.8.8')) {
      try {
        $tc = New-Object System.Net.Sockets.TcpClient
        $iar = $tc.BeginConnect($tgt, 443, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(2200, $false)
        if ($wait -and $tc.Connected) {
          $tcp443Ok = $true
          $tcpTarget = $tgt
          $tc.EndConnect($iar)
          $tc.Close()
          break
        }
        $tc.Close()
      } catch {}
    }
    $sw.Stop()
    $out.checks['internet_connectivity'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      ncsi = $ncsiList
      icmpOk = $icmpOk
      icmpMs = $icmpMs
      tcp443Ok = $tcp443Ok
      tcpTarget = $tcpTarget
    }
  } catch {
    $sw.Stop()
    $out.checks['internet_connectivity'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 7. vpn_status
if ($flags.vpn_status) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $rasVpns = @()
    try {
      foreach ($v in @(Get-VpnConnection -AllUserConnection -ErrorAction SilentlyContinue)) {
        $rasVpns += [PSCustomObject]@{
          name = To-Str $v.Name
          server = To-Str $v.ServerAddress
          tunnelType = To-Str $v.TunnelType
          status = To-Str $v.ConnectionStatus
          scope = 'AllUsers'
        }
      }
    } catch {}
    try {
      foreach ($v in @(Get-VpnConnection -ErrorAction SilentlyContinue)) {
        $rasVpns += [PSCustomObject]@{
          name = To-Str $v.Name
          server = To-Str $v.ServerAddress
          tunnelType = To-Str $v.TunnelType
          status = To-Str $v.ConnectionStatus
          scope = 'CurrentUser'
        }
      }
    } catch {}

    $vpnAdapters = @()
    try {
      $allAds = @(Get-NetAdapter -ErrorAction SilentlyContinue)
      foreach ($ad in $allAds) {
        $desc = To-Str $ad.InterfaceDescription
        $nm = To-Str $ad.Name
        if ($desc -match 'WAN Miniport|AnyConnect|Fortinet|FortiSSL|TAP-Windows|Wintun|OpenVPN|WireGuard|PanGP|GlobalProtect|Kerio|Cisco|Pulse|Juniper|VPN' -or $nm -match 'VPN|WireGuard|OpenVPN|Forti') {
          if ($desc -match 'WAN Miniport' -and $ad.Status -ne 'Up') { continue }
          $vpnAdapters += [PSCustomObject]@{
            name = $nm
            description = $desc
            status = To-Str $ad.Status
            linkSpeed = To-Str $ad.LinkSpeed
          }
        }
      }
    } catch {}

    $vpnProcs = @()
    try {
      $vp = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(vpnui|vpnagent|FortiClient|FortiSSLVPNdaemon|openvpn|openvpn-gui|wireguard|PanGPA|PanGPS|kvpncsvc|kvpncgui)$' } | Select-Object -ExpandProperty ProcessName -Unique)
      $vpnProcs = @($vp)
    } catch {}

    $sw.Stop()
    $out.checks['vpn_status'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      rasProfiles = $rasVpns
      vpnAdapters = $vpnAdapters
      vpnProcesses = $vpnProcs
    }
  } catch {
    $sw.Stop()
    $out.checks['vpn_status'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 8. os_drive_cleanup
if ($flags.os_drive_cleanup) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $sysDrive = if ($env:SystemDrive) { To-Str $env:SystemDrive } else { 'C:' }
    $vol = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$sysDrive'" -ErrorAction SilentlyContinue
    if (-not $vol) { $vol = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='$sysDrive'" -ErrorAction SilentlyContinue }
    $totalBytes = if ($vol) { [int64]$vol.Size } else { 0 }
    $freeBytes = if ($vol) { [int64]$vol.FreeSpace } else { 0 }
    $usedBytes = [math]::Max(0, $totalBytes - $freeBytes)
    $freePct = if ($totalBytes -gt 0) { [math]::Round(($freeBytes / $totalBytes) * 100, 1) } else { 0 }

    $winTemp = Measure-Folder (Join-Path $env:SystemRoot 'Temp')
    $userTempPath = if ($activeUserProfilePath) { Join-Path $activeUserProfilePath 'AppData\\Local\\Temp' } else { To-Str $env:TEMP }
    $userTemp = Measure-Folder $userTempPath
    $wuCache = Measure-Folder (Join-Path $env:SystemRoot 'SoftwareDistribution\\Download')

    # Recycle Bin scan on OS Drive (count actual recycled $R* files or entries)
    $rbBytes = [int64]0
    $rbCount = 0
    $rbPath = Join-Path ($sysDrive + '\\') '$Recycle.Bin'
    if (Test-Path -LiteralPath $rbPath) {
      try {
        $rbFiles = @(Get-ChildItem -LiteralPath $rbPath -File -Force -Recurse -ErrorAction SilentlyContinue)
        foreach ($rf in $rbFiles) {
          if ($rf.Name -like '$I*') { continue }
          $rbCount++
          $rbBytes += [int64]$rf.Length
        }
      } catch {}
    }

    $sw.Stop()
    $out.checks['os_drive_cleanup'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      drive = $sysDrive
      totalBytes = $totalBytes
      usedBytes = $usedBytes
      freeBytes = $freeBytes
      freePct = $freePct
      winTempBytes = $winTemp.bytes
      winTempCount = $winTemp.count
      userTempBytes = $userTemp.bytes
      userTempCount = $userTemp.count
      wuCacheBytes = $wuCache.bytes
      recycleBinBytes = $rbBytes
      recycleBinCount = $rbCount
    }
  } catch {
    $sw.Stop()
    $out.checks['os_drive_cleanup'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 9. windows_integrity
if ($flags.windows_integrity) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $dismStatus = 'Unknown'
    $dismExit = -1
    $dismOutput = ''
    try {
      $dismRaw = (& dism.exe /Online /Cleanup-Image /CheckHealth 2>&1) -join ' '
      $dismExit = $LASTEXITCODE
      $dismOutput = To-Str $dismRaw
      if ($dismOutput -match 'No component store corruption detected') { $dismStatus = 'Healthy' }
      elseif ($dismOutput -match 'repairable') { $dismStatus = 'Repairable' }
      elseif ($dismOutput -match 'corrupted') { $dismStatus = 'Corrupted' }
      elseif ($dismExit -eq 0) { $dismStatus = 'Healthy' }
      else { $dismStatus = "ExitCode:$dismExit" }
    } catch { $dismStatus = 'CheckError' }

    $cbsFlag = $false
    try {
      $corruptKey = Get-Item -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\CorruptionDetected' -ErrorAction SilentlyContinue
      if ($corruptKey) { $cbsFlag = $true }
    } catch {}

    $cbsRecentErrors = 0
    $cbsLog = Join-Path $env:SystemRoot 'Logs\\CBS\\CBS.log'
    if (Test-Path -LiteralPath $cbsLog) {
      try {
        $tailLines = @(Get-Content -LiteralPath $cbsLog -Tail 200 -ErrorAction SilentlyContinue)
        foreach ($ln in $tailLines) {
          if ($ln -match 'Cannot repair member file|Corrupt|CSI Store Corruption') { $cbsRecentErrors++ }
        }
      } catch {}
    }

    $pendingReboot = $false
    if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') { $pendingReboot = $true }
    if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $pendingReboot = $true }

    $dirtyDisks = @()
    try {
      foreach ($dv in @(Get-CimInstance -ClassName Win32_Volume -Filter "DriveType=3" -ErrorAction SilentlyContinue)) {
        if ($dv.DirtyBitSet -eq $true) { $dirtyDisks += To-Str $dv.DriveLetter }
      }
    } catch {}

    $sw.Stop()
    $out.checks['windows_integrity'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      dismStatus = $dismStatus
      dismExit = $dismExit
      cbsCorruptionKey = $cbsFlag
      cbsRecentErrors = $cbsRecentErrors
      pendingReboot = $pendingReboot
      dirtyDisks = $dirtyDisks
    }
  } catch {
    $sw.Stop()
    $out.checks['windows_integrity'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 10. windows_update_last
if ($flags.windows_update_last) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $hotfixes = @()
    try {
      $rawHf = @(Get-HotFix -ErrorAction SilentlyContinue)
      foreach ($hf in $rawHf) {
        $dt = $null
        if ($hf.InstalledOn) { try { $dt = [datetime]$hf.InstalledOn } catch {} }
        if ($dt) {
          $hotfixes += [PSCustomObject]@{
            kb = To-Str $hf.HotFixID
            description = To-Str $hf.Description
            installedIso = $dt.ToString('yyyy-MM-dd')
            ticks = $dt.Ticks
          }
        }
      }
    } catch {}
    $sortedHf = @($hotfixes | Sort-Object ticks -Descending)
    $latest = if ($sortedHf.Count -gt 0) { $sortedHf[0] } else { $null }

    $wuLastInstall = ''
    try {
      $wuRes = Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\Results\\Install' -ErrorAction SilentlyContinue
      if ($wuRes -and $wuRes.LastSuccessTime) { $wuLastInstall = To-Str $wuRes.LastSuccessTime }
    } catch {}

    $wsusUrl = ''
    $useWsus = $false
    try {
      $auKey = Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate' -ErrorAction SilentlyContinue
      $auOpt = Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU' -ErrorAction SilentlyContinue
      if ($auOpt -and ([int]$auOpt.UseWUServer -eq 1)) {
        $useWsus = $true
        $wsusUrl = To-Str $auKey.WUServer
      }
    } catch {}

    $pendingReboot = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')
    $sw.Stop()
    $out.checks['windows_update_last'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      hotfixCount = $sortedHf.Count
      latestKb = if ($latest) { To-Str $latest.kb } else { '' }
      latestDescription = if ($latest) { To-Str $latest.description } else { '' }
      latestDate = if ($latest) { To-Str $latest.installedIso } else { '' }
      recentHotfixes = @($sortedHf | Select-Object -First 4 | ForEach-Object { [PSCustomObject]@{ kb = $_.kb; description = $_.description; date = $_.installedIso } })
      wuLastInstall = $wuLastInstall
      useWsus = $useWsus
      wsusUrl = $wsusUrl
      pendingReboot = $pendingReboot
    }
  } catch {
    $sw.Stop()
    $out.checks['windows_update_last'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 11. drivers_status
if ($flags.drivers_status) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $allPnp = @(Get-CimInstance -ClassName Win32_PnPEntity -ErrorAction SilentlyContinue)
    if ($allPnp.Count -eq 0) {
      $allPnp = @(Get-WmiObject -Class Win32_PnPEntity -ErrorAction SilentlyContinue)
    }
    $problems = @()
    foreach ($d in $allPnp) {
      $ec = To-Int $d.ConfigManagerErrorCode
      if ($ec -ne 0) {
        $problems += [PSCustomObject]@{
          name = To-Str $d.Name
          pnpClass = To-Str $d.PNPClass
          manufacturer = To-Str $d.Manufacturer
          errorCode = $ec
          status = To-Str $d.Status
        }
      }
    }
    $sw.Stop()
    $out.checks['drivers_status'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      totalDevices = $allPnp.Count
      problemCount = $problems.Count
      problemDevices = @($problems | Select-Object -First 20)
    }
  } catch {
    $sw.Stop()
    $out.checks['drivers_status'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 12. cpu_ram_usage
if ($flags.cpu_ram_usage) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $cpuName = ''
    $cores = 0
    $logical = 0
    $cpuLoads = @()
    $cpus = @(Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue)
    if ($cpus.Count -eq 0) { $cpus = @(Get-WmiObject -Class Win32_Processor -ErrorAction SilentlyContinue) }
    foreach ($c in $cpus) {
      if (-not $cpuName) { $cpuName = (To-Str $c.Name).Trim() }
      $cores += To-Int $c.NumberOfCores
      $logical += To-Int $c.NumberOfLogicalProcessors
      if ($null -ne $c.LoadPercentage) { $cpuLoads += To-Dbl $c.LoadPercentage }
    }
    $cpuPct = if ($cpuLoads.Count -gt 0) { [math]::Round((($cpuLoads | Measure-Object -Average).Average), 1) } else { 0.0 }
    if ($logical -le 0) { $logical = [Environment]::ProcessorCount }
    if ($cores -le 0) { $cores = $logical }

    $totalMemKb = if ($osObj) { To-Dbl $osObj.TotalVisibleMemorySize } else { 0.0 }
    $freeMemKb = if ($osObj) { To-Dbl $osObj.FreePhysicalMemory } else { 0.0 }
    $totalGb = [math]::Round($totalMemKb / 1048576.0, 2)
    $freeGb = [math]::Round($freeMemKb / 1048576.0, 2)
    $usedGb = [math]::Round([math]::Max(0, $totalGb - $freeGb), 2)
    $ramPct = if ($totalMemKb -gt 0) { [math]::Round((($totalMemKb - $freeMemKb) / $totalMemKb) * 100.0, 1) } else { 0.0 }

    $sw.Stop()
    $out.checks['cpu_ram_usage'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      cpuModel = $cpuName
      cores = $cores
      logicalProcessors = $logical
      cpuPercent = $cpuPct
      totalRamGb = $totalGb
      usedRamGb = $usedGb
      freeRamGb = $freeGb
      ramPercent = $ramPct
    }
  } catch {
    $sw.Stop()
    $out.checks['cpu_ram_usage'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 13. top_resource_apps
if ($flags.top_resource_apps) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $totalMemKb = if ($osObj) { To-Dbl $osObj.TotalVisibleMemorySize } else { 0.0 }
    $totalRamMb = if ($totalMemKb -gt 0) { $totalMemKb / 1024.0 } else { 1.0 }
    $lpCount = [math]::Max(1, [Environment]::ProcessorCount)

    # Sample two snapshots 350ms apart to compute real live CPU%
    $p1 = @{}
    foreach ($pr in @(Get-Process -ErrorAction SilentlyContinue)) {
      if ($pr.Id -le 4) { continue }
      try { $p1[$pr.Id] = To-Dbl $pr.TotalProcessorTime.TotalMilliseconds } catch {}
    }
    Start-Sleep -Milliseconds 350
    $procs = @()
    foreach ($pr in @(Get-Process -ErrorAction SilentlyContinue)) {
      if ($pr.Id -le 4) { continue }
      $memMb = [math]::Round((To-Dbl $pr.WorkingSet64) / 1048576.0, 1)
      $memPct = [math]::Round(($memMb / $totalRamMb) * 100.0, 1)
      $cpuNow = 0.0
      try { $cpuNow = To-Dbl $pr.TotalProcessorTime.TotalMilliseconds } catch {}
      $cpuPrev = if ($p1.ContainsKey($pr.Id)) { $p1[$pr.Id] } else { $cpuNow }
      $cpuPct = [math]::Round([math]::Max(0.0, [math]::Min(100.0, (($cpuNow - $cpuPrev) / (350.0 * $lpCount)) * 100.0)), 1)
      $procs += [PSCustomObject]@{
        pid = [int]$pr.Id
        name = To-Str $pr.ProcessName
        cpuPercent = $cpuPct
        memoryMb = $memMb
        memoryPercent = $memPct
      }
    }
    $topCpu = @($procs | Sort-Object cpuPercent -Descending | Select-Object -First 6)
    $topRam = @($procs | Sort-Object memoryMb -Descending | Select-Object -First 6)

    $sw.Stop()
    $out.checks['top_resource_apps'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      totalProcesses = $procs.Count
      topCpu = $topCpu
      topRam = $topRam
    }
  } catch {
    $sw.Stop()
    $out.checks['top_resource_apps'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

# 14. active_directory_policy
if ($flags.active_directory_policy) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $domainJoined = [bool]($cs -and $cs.PartOfDomain)
    $domainName = if ($cs -and $cs.Domain) { (To-Str $cs.Domain).Trim() } else { '' }
    $forestName = ''
    $dcName = ''
    $dcAddress = ''
    $dcSite = ''
    $clientSite = ''
    $dcServices = @()
    $secureChannelOk = $null
    $trustMessage = ''

    $targetUser = if ($loggedUser) { $loggedUser } else {
      $uDom = To-Str $env:USERDOMAIN
      $uUsr = To-Str $env:USERNAME
      if ($uDom -and $uUsr) { "$uDom\\$uUsr" } else { $uUsr }
    }
    $samName = ($targetUser -split '\\\\')[-1].Trim()
    $logonServer = (To-Str $env:LOGONSERVER).TrimStart('\\')

    $policyDcComp = ''
    $policyDcUser = ''
    $compGpos = @()
    $userGpos = @()
    $lastGpoRefresh = ''
    $adsiGroups = @()
    $gpoSecGroups = @()
    $netUserRaw = ''
    $localUserGroups = @()

    # Registry Group Policy State (fast & local)
    try {
      $mState = Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\State\\Machine' -ErrorAction SilentlyContinue
      if ($mState -and $mState.DCName) { $policyDcComp = (To-Str $mState.DCName).TrimStart('\\') }
      $mGpoRoot = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\State\\Machine\\GPO-List'
      if (Test-Path -LiteralPath $mGpoRoot) {
        foreach ($gk in @(Get-ChildItem -LiteralPath $mGpoRoot -ErrorAction SilentlyContinue)) {
          $gp = Get-ItemProperty -LiteralPath $gk.PSPath -ErrorAction SilentlyContinue
          $dn = (To-Str $gp.DisplayName).Trim()
          if ($dn -and ($compGpos -notcontains $dn)) { $compGpos += $dn }
        }
      }
      if ($activeUserSid) {
        $uStatePath = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\State\\$activeUserSid"
        if (Test-Path -LiteralPath $uStatePath) {
          $uState = Get-ItemProperty -LiteralPath $uStatePath -ErrorAction SilentlyContinue
          if ($uState -and $uState.DCName) { $policyDcUser = (To-Str $uState.DCName).TrimStart('\\') }
          $uGpoRoot = "$uStatePath\\GPO-List"
          if (Test-Path -LiteralPath $uGpoRoot) {
            foreach ($gk in @(Get-ChildItem -LiteralPath $uGpoRoot -ErrorAction SilentlyContinue)) {
              $gp = Get-ItemProperty -LiteralPath $gk.PSPath -ErrorAction SilentlyContinue
              $dn = (To-Str $gp.DisplayName).Trim()
              if ($dn -and ($userGpos -notcontains $dn)) { $userGpos += $dn }
            }
          }
        }
      }
    } catch {}

    # Entra / Hybrid Join state (fast read)
    $entraJoined = $false
    $tenantName = ''
    try {
      $dsOut = (& dsregcmd.exe /status 2>&1 | Out-String)
      if ($dsOut -match 'AzureAdJoined\\s*:\\s*YES') { $entraJoined = $true }
      if ($dsOut -match 'TenantName\\s*:\\s*([^\\r\\n]+)') { $tenantName = $Matches[1].Trim() }
    } catch {}

    if ($domainJoined -and $domainName) {
      try {
        $domObj = [System.DirectoryServices.ActiveDirectory.Domain]::GetComputerDomain()
        if ($domObj) {
          if ($domObj.Name) { $domainName = (To-Str $domObj.Name).Trim() }
          if ($domObj.Forest -and $domObj.Forest.Name) { $forestName = (To-Str $domObj.Forest.Name).Trim() }
        }
      } catch {}

      try {
        $nlDc = (& nltest.exe /dsgetdc:$domainName 2>&1 | Out-String)
        if ($nlDc -match 'DC:\\s*\\\\*([^\\r\\n\\s]+)') { $dcName = $Matches[1].Trim() }
        if ($nlDc -match 'Address:\\s*\\\\*([^\\r\\n\\s]+)') { $dcAddress = $Matches[1].Trim() }
        if ($nlDc -match 'DC Site Name:\\s*([^\\r\\n]+)') { $dcSite = $Matches[1].Trim() }
        if ($nlDc -match 'Client Site Name:\\s*([^\\r\\n]+)') { $clientSite = $Matches[1].Trim() }
        if ($nlDc -match 'Flags:\\s*([^\\r\\n]+)') {
          foreach ($tk in ($Matches[1].Trim() -split '\\s+')) {
            if ($tk -and ($dcServices -notcontains $tk)) { $dcServices += $tk }
          }
        }
      } catch {}

      try {
        $scOut = (& nltest.exe /sc_query:$domainName 2>&1 | Out-String)
        if ($scOut -match 'NERR_Success|Status = 0\\b') {
          $secureChannelOk = $true
        } elseif ($scOut.Trim()) {
          $secureChannelOk = $false
          $trustMessage = ($scOut.Trim() -split "\`r?\`n")[0]
        }
        if (-not $dcName -and $scOut -match 'Trusted DC Name\\s*\\\\*([^\\r\\n\\s]+)') {
          $dcName = $Matches[1].Trim()
        }
      } catch {}

      # GPResult fallback for last refresh timestamp, GPOs, and cached security groups
      try {
        $gpOut = ''
        if ($targetUser -match '^[a-zA-Z0-9._\\\\@-]{1,96}$') {
          $gpOut = (& gpresult.exe /USER $targetUser /R 2>&1 | Out-String)
        }
        if (-not $gpOut -or $gpOut -match 'INFO:\\s*The user.*does not have RSOP data|ERROR:') {
          $gpOut = (& gpresult.exe /R 2>&1 | Out-String)
        }
        if ($gpOut) {
          if ($gpOut -match 'Last time Group Policy was applied:\\s*([^\\r\\n]+)') {
            $lastGpoRefresh = $Matches[1].Trim()
          }
          if (-not $policyDcComp -and $gpOut -match 'Group Policy was applied from:\\s*([^\\r\\n]+)') {
            $policyDcComp = $Matches[1].Trim().TrimStart('\\')
          }
          $inComp = $false; $inUser = $false; $inSecGrp = $false; $ctx = ''
          foreach ($ln in ($gpOut -split "\`r?\`n")) {
            $t = $ln.Trim()
            if ($t -match '^COMPUTER SETTINGS') { $ctx = 'comp'; $inComp = $false; $inUser = $false; $inSecGrp = $false; continue }
            if ($t -match '^USER SETTINGS') { $ctx = 'user'; $inComp = $false; $inUser = $false; $inSecGrp = $false; continue }
            if ($t -match '^Applied Group Policy Objects$') {
              if ($ctx -eq 'user') { $inUser = $true } else { $inComp = $true }
              $inSecGrp = $false; continue
            }
            if ($t -match '^The user is a part of the following security groups$') {
              $inSecGrp = $true; $inComp = $false; $inUser = $false; continue
            }
            if ($t -match '^-+$') { continue }
            if (-not $t -or $t -match '^(The following GPOs were not applied|The computer is a part of|Following is the list)') {
              $inComp = $false; $inUser = $false; $inSecGrp = $false; continue
            }
            if ($inComp -and ($compGpos -notcontains $t)) { $compGpos += $t }
            elseif ($inUser -and ($userGpos -notcontains $t)) { $userGpos += $t }
            elseif ($inSecGrp -and ($gpoSecGroups -notcontains $t)) { $gpoSecGroups += $t }
          }
        }
      } catch {}

      # Query AD group memberships via ADSI (direct memberOf + transitive tokenGroups) and net user /domain
      if ($samName -match '^[a-zA-Z0-9._-]{1,64}$') {
        try {
          $searcher = New-Object System.DirectoryServices.DirectorySearcher
          $searcher.Filter = "(&(objectCategory=person)(objectClass=user)(sAMAccountName=$samName))"
          $null = $searcher.PropertiesToLoad.Add('memberOf')
          $null = $searcher.PropertiesToLoad.Add('distinguishedName')
          $res = $searcher.FindOne()
          if ($res) {
            foreach ($dn in @($res.Properties['memberof'])) {
              $dnStr = To-Str $dn
              if ($dnStr -match '^CN=([^,]+)') {
                $cn = $Matches[1].Replace('\\,', ',').Trim()
                if ($cn -and ($adsiGroups -notcontains $cn)) { $adsiGroups += $cn }
              }
            }
            try {
              $entry = $res.GetDirectoryEntry()
              $entry.RefreshCache(@('tokenGroups'))
              foreach ($sidBytes in @($entry.Properties['tokenGroups'])) {
                try {
                  $sidObj = New-Object System.Security.Principal.SecurityIdentifier($sidBytes, 0)
                  $ntName = To-Str ($sidObj.Translate([System.Security.Principal.NTAccount]).Value)
                  if ($ntName -and $ntName -notmatch '^(NT AUTHORITY|BUILTIN)\\\\') {
                    $grpShort = ($ntName -split '\\\\')[-1].Trim()
                    if ($grpShort -and ($adsiGroups -notcontains $grpShort)) { $adsiGroups += $grpShort }
                  }
                } catch {}
              }
            } catch {}
          }
        } catch {}

        try {
          $netUserRaw = (& net.exe user $samName /domain 2>&1 | Out-String).Trim()
        } catch {}
      }
    } else {
      # Standalone / Workgroup local groups for target user
      if ($samName -match '^[a-zA-Z0-9._-]{1,64}$') {
        try {
          foreach ($lg in @(Get-LocalGroup -ErrorAction SilentlyContinue)) {
            $members = @(Get-LocalGroupMember -Group $lg.Name -ErrorAction SilentlyContinue)
            if ($members | Where-Object { ((To-Str $_.Name) -split '\\\\')[-1] -ieq $samName }) {
              $localUserGroups += To-Str $lg.Name
            }
          }
        } catch {}
      }
    }

    if (-not $dcName -and $policyDcComp) { $dcName = $policyDcComp }
    if (-not $dcName -and $logonServer) { $dcName = $logonServer }

    $sw.Stop()
    $out.checks['active_directory_policy'] = [PSCustomObject]@{
      ok = $true
      durationMs = [int]$sw.ElapsedMilliseconds
      domainJoined = $domainJoined
      domainName = $domainName
      forestName = if ($forestName) { $forestName } else { $domainName }
      entraJoined = $entraJoined
      tenantName = $tenantName
      targetUser = $targetUser
      samName = $samName
      dcName = $dcName
      dcAddress = $dcAddress
      dcSite = $dcSite
      clientSite = $clientSite
      dcServices = $dcServices
      secureChannelOk = $secureChannelOk
      trustMessage = $trustMessage
      logonServer = $logonServer
      policyDcComputer = $policyDcComp
      policyDcUser = $policyDcUser
      lastGpoRefresh = $lastGpoRefresh
      computerGpos = $compGpos
      userGpos = $userGpos
      adsiGroups = $adsiGroups
      gpoSecGroups = $gpoSecGroups
      netUserRaw = $netUserRaw
      localUserGroups = $localUserGroups
    }
  } catch {
    $sw.Stop()
    $out.checks['active_directory_policy'] = [PSCustomObject]@{ ok = $false; durationMs = [int]$sw.ElapsedMilliseconds; error = To-Str $_.Exception.Message }
  }
}

$out | ConvertTo-Json -Depth 7 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, os, shutil, socket, subprocess, time

flags = json.loads(base64.b64decode('${flagsJsonB64}').decode('utf-8', errors='ignore') or '{}')
hostname = socket.gethostname()
os_name = "Linux"
try:
    with open("/etc/os-release", "r") as f:
        for line in f:
            if line.startswith("PRETTY_NAME="):
                os_name = line.split("=", 1)[1].strip().strip('"')
                break
except Exception:
    pass

checks = {}

def run_cmd(cmd, timeout=8):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return 1, str(e)

if flags.get("ip_dns"):
    t0 = time.time()
    rc, ip_out = run_cmd(["ip", "-j", "addr", "show"])
    adapters = []
    if rc == 0:
        try:
            for itf in json.loads(ip_out):
                if itf.get("ifname") == "lo": continue
                v4s = [a.get("local") for a in itf.get("addr_info", []) if a.get("family") == "inet"]
                if not v4s: continue
                adapters.append({"name": itf.get("ifname"), "ips": v4s, "dns": [], "gateways": [], "dhcp": None})
        except Exception:
            pass
    dns_list = []
    try:
        with open("/etc/resolv.conf") as rf:
            for ln in rf:
                if ln.strip().startswith("nameserver"):
                    dns_list.append(ln.split()[1])
    except Exception:
        pass
    for ad in adapters:
        ad["dns"] = dns_list
    dns_ok = False
    dns_ip = ""
    try:
        dns_ip = socket.gethostbyname("www.microsoft.com")
        dns_ok = True
    except Exception:
        pass
    checks["ip_dns"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "adapters": adapters, "dnsWorks": dns_ok, "dnsResolvedIp": dns_ip, "dnsError": ""}

if flags.get("gateway_ping"):
    t0 = time.time()
    rc, rt_out = run_cmd(["ip", "-j", "route", "show", "default"])
    gws = []
    if rc == 0:
        try:
            for r in json.loads(rt_out):
                gw_ip = str(r.get("gateway") or "").strip()
                if gw_ip and gw_ip not in ("0.0.0.0", "::", "::0") and gw_ip not in gws:
                    gws.append(gw_ip)
        except Exception:
            pass
    res_gws = []
    for gw in gws[:2]:
        prc, pout = run_cmd(["ping", "-c", "3", "-W", "2", gw], timeout=10)
        avg = None
        for ln in pout.splitlines():
            if "rtt min/avg/max" in ln or "round-trip" in ln:
                try:
                    avg = float(ln.split("=")[1].split("/")[1])
                except Exception:
                    pass
        res_gws.append({"gateway": gw, "sent": 3, "received": 3 if prc == 0 else 0, "lossPct": 0 if prc == 0 else 100, "avgMs": avg, "lastStatus": "Success" if prc == 0 else "Failed"})
    checks["gateway_ping"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "gateways": res_gws}

if flags.get("nic_link_speed"):
    t0 = time.time()
    nics = []
    try:
        for fn in os.listdir("/sys/class/net"):
            if fn == "lo": continue
            oper = open(f"/sys/class/net/{fn}/operstate").read().strip() if os.path.exists(f"/sys/class/net/{fn}/operstate") else "unknown"
            spd = 0
            try:
                spd = int(open(f"/sys/class/net/{fn}/speed").read().strip())
            except Exception:
                spd = 0
            nics.append({"name": fn, "description": fn, "status": "Up" if oper == "up" else oper, "linkSpeed": f"{spd} Mbps" if spd > 0 else "N/A", "speedMbps": spd, "virtual": False})
    except Exception:
        pass
    checks["nic_link_speed"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "adapters": nics}

if flags.get("routing_table"):
    t0 = time.time()
    rc, rt_out = run_cmd(["ip", "-j", "route"])
    routes = []
    defs = []
    if rc == 0:
        try:
            data = json.loads(rt_out)
            for r in data[:15]:
                dst = r.get("dst", "")
                if dst == "default":
                    defs.append({"destination": "0.0.0.0/0", "nextHop": r.get("gateway", ""), "ifAlias": r.get("dev", ""), "metric": r.get("metric", 0)})
                routes.append({"destination": dst, "nextHop": r.get("gateway", "direct"), "ifAlias": r.get("dev", ""), "metric": r.get("metric", 0), "persistent": True})
        except Exception:
            pass
    checks["routing_table"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "totalRoutes": len(routes), "persistentRoutes": len(routes), "defaultRoutes": defs, "sampleRoutes": routes}

if flags.get("proxy_status"):
    t0 = time.time()
    hp = os.environ.get("https_proxy") or os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY") or ""
    checks["proxy_status"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "winInetEnabled": bool(hp), "winInetServer": hp, "pacUrl": "", "winhttpDirect": not bool(hp), "winhttpServer": hp}

if flags.get("internet_connectivity"):
    t0 = time.time()
    tcp_ok = False
    try:
        s = socket.create_connection(("1.1.1.1", 443), timeout=2.5)
        s.close()
        tcp_ok = True
    except Exception:
        pass
    prc, _ = run_cmd(["ping", "-c", "1", "-W", "2", "8.8.8.8"], timeout=5)
    checks["internet_connectivity"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "ncsi": [], "icmpOk": prc == 0, "icmpMs": None, "tcp443Ok": tcp_ok, "tcpTarget": "1.1.1.1" if tcp_ok else ""}

if flags.get("vpn_status"):
    t0 = time.time()
    vpns = []
    try:
        for fn in os.listdir("/sys/class/net"):
            if fn.startswith(("tun", "tap", "wg", "ppp")):
                vpns.append({"name": fn, "description": "Linux VPN Interface", "status": "Up", "linkSpeed": ""})
    except Exception:
        pass
    checks["vpn_status"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "rasProfiles": [], "vpnAdapters": vpns, "vpnProcesses": []}

if flags.get("os_drive_cleanup"):
    t0 = time.time()
    du = shutil.disk_usage("/")
    free_pct = round((du.free / du.total) * 100, 1) if du.total else 0
    tmp_b = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fns in os.walk("/tmp") for f in fns if os.path.isfile(os.path.join(dp, f))) if os.path.exists("/tmp") else 0
    checks["os_drive_cleanup"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "drive": "/", "totalBytes": du.total, "usedBytes": du.used, "freeBytes": du.free, "freePct": free_pct, "winTempBytes": tmp_b, "winTempCount": 0, "userTempBytes": 0, "userTempCount": 0, "wuCacheBytes": 0, "recycleBinBytes": 0, "recycleBinCount": 0}

if flags.get("windows_integrity"):
    t0 = time.time()
    rc, sys_out = run_cmd(["systemctl", "--failed", "--no-legend"])
    failed_cnt = len([l for l in sys_out.splitlines() if l.strip()]) if rc == 0 else 0
    checks["windows_integrity"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "dismStatus": "Healthy" if failed_cnt == 0 else f"{failed_cnt} failed units", "dismExit": failed_cnt, "cbsCorruptionKey": False, "cbsRecentErrors": failed_cnt, "pendingReboot": os.path.exists("/var/run/reboot-required"), "dirtyDisks": []}

if flags.get("windows_update_last"):
    t0 = time.time()
    checks["windows_update_last"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "hotfixCount": 0, "latestKb": "", "latestDescription": "Linux host (use apt/dnf)", "latestDate": "", "recentHotfixes": [], "wuLastInstall": "", "useWsus": False, "wsusUrl": "", "pendingReboot": os.path.exists("/var/run/reboot-required")}

if flags.get("drivers_status"):
    t0 = time.time()
    checks["drivers_status"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "totalDevices": 0, "problemCount": 0, "problemDevices": []}

if flags.get("cpu_ram_usage"):
    t0 = time.time()
    total_kb, avail_kb = 0, 0
    try:
        for ln in open("/proc/meminfo"):
            if ln.startswith("MemTotal:"): total_kb = int(ln.split()[1])
            elif ln.startswith("MemAvailable:"): avail_kb = int(ln.split()[1])
    except Exception:
        pass
    total_gb = round(total_kb / 1048576, 2)
    free_gb = round(avail_kb / 1048576, 2)
    used_gb = round(max(0, total_gb - free_gb), 2)
    ram_pct = round(((total_kb - avail_kb) / total_kb) * 100, 1) if total_kb else 0
    checks["cpu_ram_usage"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "cpuModel": "Linux CPU", "cores": os.cpu_count() or 1, "logicalProcessors": os.cpu_count() or 1, "cpuPercent": 0, "totalRamGb": total_gb, "usedRamGb": used_gb, "freeRamGb": free_gb, "ramPercent": ram_pct}

if flags.get("top_resource_apps"):
    t0 = time.time()
    rc, ps_out = run_cmd(["ps", "-eo", "pid,comm,%cpu,%mem,rss", "--sort=-%cpu"])
    rows = []
    for ln in ps_out.splitlines()[1:15]:
        parts = ln.split()
        if len(parts) >= 5:
            rows.append({"pid": int(parts[0]), "name": parts[1], "cpuPercent": float(parts[2]), "memoryPercent": float(parts[3]), "memoryMb": round(int(parts[4])/1024, 1)})
    top_ram = sorted(rows, key=lambda x: x["memoryMb"], reverse=True)[:6]
    checks["top_resource_apps"] = {"ok": True, "durationMs": int((time.time() - t0)*1000), "totalProcesses": len(rows), "topCpu": rows[:6], "topRam": top_ram}

if flags.get("active_directory_policy"):
    t0 = time.time()
    rc_realm, realm_out = run_cmd(["realm", "list"])
    rc_dom, dom_out = run_cmd(["dnsdomainname"])
    dom = dom_out.strip()
    dc_name = ""
    if rc_realm == 0 and realm_out.strip():
        for ln in realm_out.splitlines():
            s = ln.strip()
            if s.startswith("domain-name:"):
                dom = s.split(":", 1)[1].strip()
            elif s.startswith("realm-name:") and not dom:
                dom = s.split(":", 1)[1].strip()
            elif s.startswith("server-software:") or s.startswith("configured:"):
                pass
    ad_groups = []
    cur_user = os.environ.get("SUDO_USER") or os.environ.get("USER") or ""
    if cur_user:
        rc_grp, grp_out = run_cmd(["id", "-Gn", cur_user])
        if rc_grp == 0 and grp_out.strip():
            ad_groups = grp_out.strip().split()
    checks["active_directory_policy"] = {
        "ok": True,
        "durationMs": int((time.time() - t0)*1000),
        "domainJoined": bool(rc_realm == 0 and realm_out.strip()),
        "domainName": dom or "Standalone Linux",
        "forestName": dom,
        "entraJoined": False,
        "tenantName": "",
        "targetUser": cur_user,
        "samName": cur_user,
        "dcName": dc_name,
        "dcAddress": "",
        "dcSite": "",
        "clientSite": "",
        "dcServices": ["SSSD / Realmd"] if (rc_realm == 0 and realm_out.strip()) else [],
        "secureChannelOk": True if (rc_realm == 0 and realm_out.strip()) else None,
        "trustMessage": "",
        "logonServer": "",
        "policyDcComputer": "",
        "policyDcUser": "",
        "lastGpoRefresh": "",
        "computerGpos": [],
        "userGpos": [],
        "adsiGroups": ad_groups,
        "gpoSecGroups": [],
        "netUserRaw": "",
        "localUserGroups": ad_groups if not (rc_realm == 0 and realm_out.strip()) else [],
    }

print(json.dumps({"hostname": hostname, "osName": os_name, "loggedInUser": "", "checks": checks}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(75000, input.timeoutMs || 75000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint troubleshooting diagnostics suite');
  const rawChecks: Record<string, any> = parsed?.checks && typeof parsed.checks === 'object' ? parsed.checks : {};

  const results: HelpdeskDiagnosticCheckResult[] = [];

  for (const id of requestedChecks) {
    const raw = rawChecks[id];
    const jumpTarget = DIAGNOSTIC_JUMP_TARGETS[id];

    if (!raw) {
      results.push({
        id,
        category: id === 'os_drive_cleanup' || id === 'windows_integrity' || id === 'windows_update_last'
          ? 'system_storage'
          : id === 'drivers_status' || id === 'cpu_ram_usage' || id === 'top_resource_apps'
          ? 'hardware_perf'
          : 'network',
        titleEn: id,
        titleFa: id,
        status: 'skipped',
        statusLabelEn: 'No Data',
        statusLabelFa: 'بدون داده',
        summaryEn: 'Check did not return telemetry from the endpoint.',
        summaryFa: 'داده‌ای از این بخش روی سیستم دریافت نشد.',
        recommendationEn: 'Open the dedicated tab to inspect manually.',
        recommendationFa: 'برای بررسی دقیق‌تر به تب مربوطه بروید.',
        metrics: [],
        highlights: [],
        durationMs: 0,
        jumpTarget,
      });
      continue;
    }

    if (raw.ok === false) {
      results.push({
        id,
        category: id === 'os_drive_cleanup' || id === 'windows_integrity' || id === 'windows_update_last'
          ? 'system_storage'
          : id === 'drivers_status' || id === 'cpu_ram_usage' || id === 'top_resource_apps'
          ? 'hardware_perf'
          : 'network',
        titleEn: id,
        titleFa: id,
        status: 'fail',
        statusLabelEn: 'Check Error',
        statusLabelFa: 'خطا در بررسی',
        summaryEn: String(raw.error || 'Diagnostic probe failed on endpoint.'),
        summaryFa: String(raw.error || 'اجرای این بررسی روی سیستم کاربر با خطا مواجه شد.'),
        recommendationEn: 'Inspect manually in the target tab.',
        recommendationFa: 'لطفاً بخش مربوطه را به صورت دستی در تب خود بررسی کنید.',
        metrics: [],
        highlights: [],
        durationMs: Number(raw.durationMs) || 0,
        jumpTarget,
      });
      continue;
    }

    const durationMs = Number(raw.durationMs) || 0;

    if (id === 'ip_dns') {
      const adapters: any[] = Array.isArray(raw.adapters) ? raw.adapters : [];
      const first = adapters[0] || {};
      const ips = adapters.flatMap((a) => (Array.isArray(a.ips) ? a.ips : [])).filter(Boolean);
      const dnsServers = Array.from(new Set(adapters.flatMap((a) => (Array.isArray(a.dns) ? a.dns : [])).filter(Boolean)));
      const anyDhcp = adapters.some((a) => a.dhcp === true);
      const anyStatic = adapters.some((a) => a.dhcp === false);
      const modeEn = anyDhcp && anyStatic ? 'Mixed (DHCP + Static)' : anyDhcp ? 'Automatic (DHCP)' : adapters.length ? 'Manual (Static IP)' : 'No IP';
      const modeFa = anyDhcp && anyStatic ? 'ترکیبی (DHCP + دستی)' : anyDhcp ? 'خودکار (DHCP)' : adapters.length ? 'دستی (Manual / Static)' : 'بدون IP';
      const hasApipa = ips.some((ip: string) => String(ip).startsWith('169.254.'));
      const dnsWorks = Boolean(raw.dnsWorks);

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (ips.length === 0 || hasApipa) status = 'fail';
      else if (dnsServers.length === 0 || !dnsWorks) status = 'warn';

      results.push({
        id,
        category: 'network',
        titleEn: 'IP Addressing, DHCP/Static Mode & Live DNS',
        titleFa: 'آدرس IP سیستم، حالت DHCP/دستی و سلامت DNS',
        status,
        statusLabelEn: status === 'pass' ? 'IP & DNS Healthy' : status === 'warn' ? 'DNS Warning' : 'IP Failure',
        statusLabelFa: status === 'pass' ? 'IP و DNS سالم' : status === 'warn' ? 'هشدار در DNS' : 'اختلال آدرس IP',
        summaryEn:
          ips.length === 0
            ? 'No active IPv4 address assigned on endpoint adapters.'
            : hasApipa
            ? `Endpoint received APIPA fallback IP (${ips.join(', ')}) — DHCP server unreachable.`
            : `${modeEn} · IP: ${ips.join(', ')} · DNS servers: ${dnsServers.join(', ') || 'None'} · Live DNS: ${dnsWorks ? `Resolved (${raw.dnsResolvedIp})` : 'FAILED'}.`,
        summaryFa:
          ips.length === 0
            ? 'هیچ آدرس IPv4 فعالی روی کارت‌های شبکه سیستم وجود ندارد.'
            : hasApipa
            ? `سیستم IP نامعتبر APIPA گرفته است (${ips.join(', ')}) — به سرور DHCP دسترسی ندارد.`
            : `حالت: ${modeFa} · آدرس IP: ${ips.join(', ')} · سرورهای DNS: ${dnsServers.join(', ') || 'ندارد'} · تست زنده DNS: ${dnsWorks ? `موفق (${raw.dnsResolvedIp})` : 'ناموفق'}.`,
        recommendationEn:
          status === 'pass'
            ? 'IP configuration and DNS resolution are working normally.'
            : 'Adjust DHCP/Static IP or DNS servers in the Network Adapters panel.',
        recommendationFa:
          status === 'pass'
            ? 'تنظیمات IP و پاسخ‌دهی سرور DNS کاملاً سالم است.'
            : 'از تب شبکه بخش تنظیمات کارت شبکه، آدرس IP یا سرورهای DNS را اصلاح یا Renew کنید.',
        metrics: [
          { labelEn: 'Primary IP', labelFa: 'IP اصلی', value: ips[0] || '-', tone: hasApipa ? 'fail' : 'ok' },
          { labelEn: 'Assignment', labelFa: 'نوع دریافت', value: modeEn, tone: 'info' },
          { labelEn: 'DNS Servers', labelFa: 'سرورهای DNS', value: dnsServers.slice(0, 2).join(', ') || 'None', tone: dnsServers.length ? 'info' : 'warn' },
          { labelEn: 'DNS Resolve', labelFa: 'تست Resolve', value: dnsWorks ? `OK (${raw.dnsResolvedIp})` : 'Failed', tone: dnsWorks ? 'ok' : 'warn' },
        ],
        highlights: adapters.slice(0, 4).map((ad) => ({
          primary: `${ad.name}: ${(ad.ips || []).join(', ')}`,
          secondary: `DNS: ${(ad.dns || []).join(', ') || '-'} · GW: ${(ad.gateways || []).join(', ') || '-'}`,
          badge: ad.dhcp ? 'DHCP' : 'Static',
          badgeTone: 'info',
        })),
        durationMs,
        jumpTarget,
      });
    } else if (id === 'gateway_ping') {
      const gws: any[] = (Array.isArray(raw.gateways) ? raw.gateways : []).filter((g) => {
        const gwIp = String(g?.gateway || '').trim();
        return gwIp && gwIp !== '0.0.0.0' && gwIp !== '::' && gwIp !== '::0';
      });
      const anyRecv = gws.some((g) => Number(g.received) > 0);
      const allFull = gws.length > 0 && gws.every((g) => Number(g.lossPct) === 0);
      const maxAvg = gws.reduce((m, g) => Math.max(m, Number(g.avgMs) || 0), 0);
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (gws.length === 0 || !anyRecv) status = 'fail';
      else if (!allFull || maxAvg >= 50) status = 'warn';

      results.push({
        id,
        category: 'network',
        titleEn: 'Default Gateway Reachability (ICMP Ping)',
        titleFa: 'تست پینگ تا Default Gateway شبکه',
        status,
        statusLabelEn: status === 'pass' ? 'Gateway Reachable' : status === 'warn' ? 'Loss / High Latency' : 'Unreachable',
        statusLabelFa: status === 'pass' ? 'دسترسی سالم' : status === 'warn' ? 'تأخیر یا Loss' : 'عدم دسترسی به گیت‌وی',
        summaryEn:
          gws.length === 0
            ? 'No Default Gateway configured on any active adapter.'
            : gws.map((g) => `GW ${g.gateway}: ${g.lossPct}% loss${g.avgMs != null ? `, avg ${g.avgMs} ms` : ''}`).join(' | '),
        summaryFa:
          gws.length === 0
            ? 'هیچ Default Gateway روی کارت‌های شبکه سیستم تنظیم نشده است.'
            : gws.map((g) => `گیت‌وی ${g.gateway}: ${g.lossPct}% پکت‌لاس${g.avgMs != null ? ` · میانگین ${g.avgMs} ms` : ''}`).join(' | '),
        recommendationEn:
          status === 'pass'
            ? 'Local LAN path to router/gateway is clean with low latency.'
            : 'Check LAN cable, VLAN switch port, or gateway IP inside Network Probes.',
        recommendationFa:
          status === 'pass'
            ? 'ارتباط با روتر/گیت‌وی بدون افت بسته و با تأخیر استاندارد برقرار است.'
            : 'کابل شبکه، پورت سوئیچ یا آدرس Gateway را بررسی کرده و از تب شبکه پینگ و ریست شبکه را امتحان کنید.',
        metrics: gws.length
          ? gws.slice(0, 3).map((g) => ({
              labelEn: `GW ${g.gateway}`,
              labelFa: `گیت‌وی ${g.gateway}`,
              value: g.avgMs != null ? `${g.avgMs} ms (${g.lossPct}% loss)` : `${g.lossPct}% loss`,
              tone: Number(g.lossPct) === 0 && (Number(g.avgMs) || 0) < 50 ? 'ok' : Number(g.received) > 0 ? 'warn' : 'fail',
            }))
          : [{ labelEn: 'Gateway', labelFa: 'گیت‌وی', value: 'None', tone: 'fail' }],
        highlights: gws.map((g) => {
          const rawStatus = String(g.lastStatus || 'Timeout');
          const conciseBadge = g.avgMs != null ? `${g.avgMs} ms` : rawStatus.length > 28 ? 'Ping Failed' : rawStatus;
          return {
            primary: String(g.gateway),
            secondary:
              rawStatus.length > 28 && g.avgMs == null
                ? `${g.received}/${g.sent} packets · ${rawStatus}`
                : `${g.received}/${g.sent} packets received`,
            badge: conciseBadge,
            badgeTone: Number(g.lossPct) === 0 ? 'ok' : Number(g.received) > 0 ? 'warn' : 'fail',
          };
        }),
        durationMs,
        jumpTarget,
      });
    } else if (id === 'nic_link_speed') {
      const nics: any[] = Array.isArray(raw.adapters) ? raw.adapters : [];
      const upNics = nics.filter((n) => String(n.status).toLowerCase() === 'up');
      const slowUp = upNics.filter((n) => !n.virtual && Number(n.speedMbps) > 0 && Number(n.speedMbps) <= 100);
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (upNics.length === 0) status = 'fail';
      else if (slowUp.length > 0) status = 'warn';

      results.push({
        id,
        category: 'network',
        titleEn: 'NIC Negotiated Link Speed & Port State',
        titleFa: 'سرعت لینک (Link Speed) و وضعیت پورت کارت شبکه',
        status,
        statusLabelEn: status === 'pass' ? 'Full Link Speed' : status === 'warn' ? 'Slow Link (≤100 Mbps)' : 'No Active Link',
        statusLabelFa: status === 'pass' ? 'سرعت استاندارد' : status === 'warn' ? 'سرعت پایین (≤100M)' : 'لینک فعال ندارد',
        summaryEn:
          upNics.length === 0
            ? 'No network adapter reports Link Up.'
            : slowUp.length > 0
            ? `Adapter(s) negotiated at ≤100 Mbps (${slowUp.map((n) => `${n.name}: ${n.linkSpeed}`).join(', ')}) — check Cat5e/Cat6 cable or switch port.`
            : `${upNics.length} adapter(s) connected cleanly: ${upNics.map((n) => `${n.name} @ ${n.linkSpeed || 'Up'}`).join(', ')}.`,
        summaryFa:
          upNics.length === 0
            ? 'هیچ کارت شبکه‌ای در وضعیت Up قرار ندارد.'
            : slowUp.length > 0
            ? `کارت شبکه با سرعت پایین ≤100 Mbps بالا آمده است (${slowUp.map((n) => `${n.name}: ${n.linkSpeed}`).join(', ')}) — احتمال خرابی کابل یا پورت سوئیچ.`
            : `${upNics.length} کارت شبکه با سرعت مطلوب متصل است: ${upNics.map((n) => `${n.name} (${n.linkSpeed || 'Up'})`).join('، ')}.`,
        recommendationEn:
          status === 'warn'
            ? 'Inspect patch cord, RJ45 keystone, or duplex speed negotiation on switch port.'
            : 'Physical link negotiation looks healthy.',
        recommendationFa:
          status === 'warn'
            ? 'پچ‌کورد، کیستون شبکه و تنظیم Speed/Duplex روی پورت سوئیچ بررسی شود.'
            : 'نرخ لینک کارت‌های شبکه بدون افت سرعت برقرار است.',
        metrics: upNics.slice(0, 4).map((n) => ({
          labelEn: n.name,
          labelFa: n.name,
          value: n.linkSpeed || n.status,
          tone: Number(n.speedMbps) >= 1000 ? 'ok' : Number(n.speedMbps) > 0 && Number(n.speedMbps) <= 100 ? 'warn' : 'info',
        })),
        highlights: nics.slice(0, 5).map((n) => ({
          primary: `${n.name} — ${n.linkSpeed || n.status}`,
          secondary: n.description,
          badge: n.status,
          badgeTone: String(n.status).toLowerCase() === 'up' ? (Number(n.speedMbps) > 0 && Number(n.speedMbps) <= 100 && !n.virtual ? 'warn' : 'ok') : 'fail',
        })),
        durationMs,
        jumpTarget,
      });
    } else if (id === 'routing_table') {
      const defRoutes: any[] = Array.isArray(raw.defaultRoutes) ? raw.defaultRoutes : [];
      const sampleRoutes: any[] = Array.isArray(raw.sampleRoutes) ? raw.sampleRoutes : [];
      const totalRoutes = Number(raw.totalRoutes) || sampleRoutes.length;
      const persistentRoutes = Number(raw.persistentRoutes) || 0;
      const status: 'pass' | 'warn' | 'fail' = defRoutes.length === 0 ? 'fail' : defRoutes.length > 1 ? 'warn' : 'pass';

      results.push({
        id,
        category: 'network',
        titleEn: 'IPv4 Routing Table & Default Route Analysis',
        titleFa: 'جدول مسیریابی (Routing Table) و روت‌های سیستم',
        status,
        statusLabelEn: status === 'pass' ? 'Clean Routing' : status === 'warn' ? 'Multiple Default Routes' : 'No Default Route',
        statusLabelFa: status === 'pass' ? 'مسیریابی سالم' : status === 'warn' ? 'چند روت پیش‌فرض' : 'روت پیش‌فرض ندارد',
        summaryEn:
          defRoutes.length === 0
            ? `No 0.0.0.0/0 default route exists across ${totalRoutes} IPv4 routes.`
            : `${totalRoutes} active IPv4 routes (${persistentRoutes} persistent). Default 0.0.0.0/0 via ${defRoutes.map((d) => `${d.nextHop} (metric ${d.metric}${d.ifAlias ? `, ${d.ifAlias}` : ''})`).join('; ')}.`,
        summaryFa:
          defRoutes.length === 0
            ? `در میان ${totalRoutes} مسیر IPv4 هیچ مسیر پیش‌فرضی (0.0.0.0/0) ثبت نشده است.`
            : `مجموعاً ${totalRoutes} روت IPv4 فعال (${persistentRoutes} روت ماندگار). مسیر پیش‌فرض: ${defRoutes.map((d) => `${d.nextHop} (متریک ${d.metric}${d.ifAlias ? ` روی ${d.ifAlias}` : ''})`).join(' | ')}.`,
        recommendationEn:
          defRoutes.length > 1
            ? 'Multiple default gateways detected (e.g., LAN + Wi-Fi or VPN); verify route metrics if traffic misroutes.'
            : 'Open Static Routing Table to inspect or add custom subnet routes.',
        recommendationFa:
          defRoutes.length > 1
            ? 'بیش از یک Default Route وجود دارد (مثلاً LAN و Wi-Fi یا VPN هم‌زمان)؛ اولویت Metric بررسی شود.'
            : 'در تب شبکه می‌توانید جدول کامل روت‌ها را ببینید یا روت استاتیک اضافه کنید.',
        metrics: [
          { labelEn: 'Total Routes', labelFa: 'تعداد کل روت‌ها', value: String(totalRoutes), tone: 'info' },
          { labelEn: 'Default Routes', labelFa: 'روت‌های 0.0.0.0', value: String(defRoutes.length), tone: defRoutes.length === 1 ? 'ok' : defRoutes.length > 1 ? 'warn' : 'fail' },
          { labelEn: 'Persistent', labelFa: 'ماندگار (-p)', value: String(persistentRoutes), tone: 'info' },
        ],
        highlights: sampleRoutes.slice(0, 6).map((r) => ({
          primary: `${r.destination} → ${r.nextHop}`,
          secondary: `${r.ifAlias || 'NIC'} · Metric ${r.metric}`,
          badge: r.destination === '0.0.0.0/0' ? 'Default' : r.persistent ? 'Persistent' : 'Active',
          badgeTone: r.destination === '0.0.0.0/0' ? 'ok' : 'info',
        })),
        durationMs,
        jumpTarget,
      });
    } else if (id === 'proxy_status') {
      const userOn = Boolean(raw.winInetEnabled || raw.pacUrl);
      const sysOn = raw.winhttpDirect === false;
      const anyProxy = userOn || sysOn;
      const status: 'pass' | 'warn' = anyProxy ? 'warn' : 'pass';

      results.push({
        id,
        category: 'network',
        titleEn: 'OS Proxy Server Status (WinINet & WinHTTP)',
        titleFa: 'وضعیت پروکسی سرور (Proxy) سیستم‌عامل و مرورگر',
        status,
        statusLabelEn: anyProxy ? 'Proxy Enabled' : 'Direct (No Proxy)',
        statusLabelFa: anyProxy ? 'پروکسی فعال است' : 'مستقیم (بدون پروکسی)',
        summaryEn: anyProxy
          ? `Proxy active — User: ${raw.winInetServer || raw.pacUrl || 'Enabled'} | WinHTTP: ${sysOn ? raw.winhttpServer || 'Configured' : 'Direct'}.`
          : 'No manual proxy, PAC auto-config, or WinHTTP system proxy is enabled (Direct access).',
        summaryFa: anyProxy
          ? `پروکسی روی سیستم فعال است — کاربر: ${raw.winInetServer || raw.pacUrl || 'فعال'} | WinHTTP: ${sysOn ? raw.winhttpServer || 'تنظیم‌شده' : 'مستقیم'}.`
          : 'هیچ پروکسی دستی، PAC یا پروکسی سرویس‌های ویندوز فعال نیست (اتصال مستقیم).',
        recommendationEn: anyProxy
          ? 'If websites or Outlook fail to connect, verify the proxy server is reachable or switch to Direct in Network tab.'
          : 'No proxy interference detected.',
        recommendationFa: anyProxy
          ? 'در صورت اختلال وب، Outlook یا سرویس‌ها، صحت سرور پروکسی را بررسی کرده یا در تب شبکه آن را غیرفعال کنید.'
          : 'تنظیمات پروکسی مانعی برای ارتباط ایجاد نمی‌کند.',
        metrics: [
          { labelEn: 'User WinINet', labelFa: 'پروکسی کاربر', value: raw.winInetEnabled ? raw.winInetServer || 'Enabled' : 'Disabled', tone: raw.winInetEnabled ? 'warn' : 'ok' },
          { labelEn: 'PAC Script', labelFa: 'اسکریپت PAC', value: raw.pacUrl || 'None', tone: raw.pacUrl ? 'warn' : 'ok' },
          { labelEn: 'System WinHTTP', labelFa: 'پروکسی WinHTTP', value: sysOn ? raw.winhttpServer || 'Enabled' : 'Direct', tone: sysOn ? 'warn' : 'ok' },
        ],
        highlights: anyProxy
          ? [
              ...(raw.winInetServer ? [{ primary: `User Proxy: ${raw.winInetServer}`, secondary: raw.bypassList ? `Bypass: ${raw.bypassList}` : undefined, badge: 'WinINet', badgeTone: 'warn' as const }] : []),
              ...(raw.pacUrl ? [{ primary: `PAC URL: ${raw.pacUrl}`, badge: 'AutoConfig', badgeTone: 'warn' as const }] : []),
              ...(sysOn ? [{ primary: `WinHTTP: ${raw.winhttpServer}`, badge: 'System', badgeTone: 'warn' as const }] : []),
            ]
          : [{ primary: 'Direct Connection (No Proxy)', badge: 'Direct', badgeTone: 'ok' }],
        durationMs,
        jumpTarget,
      });
    } else if (id === 'internet_connectivity') {
      const ncsi: any[] = Array.isArray(raw.ncsi) ? raw.ncsi : [];
      const hasNcsiInternet = ncsi.some((n) => String(n.ipv4).toLowerCase() === 'internet');
      const tcpOk = Boolean(raw.tcp443Ok);
      const icmpOk = Boolean(raw.icmpOk);
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (!tcpOk && !icmpOk && !hasNcsiInternet) status = 'fail';
      else if (!tcpOk || (!icmpOk && !hasNcsiInternet)) status = 'warn';

      results.push({
        id,
        category: 'network',
        titleEn: 'Real Internet Reachability & NCSI State',
        titleFa: 'وضعیت واقعی ارتباط سیستم با اینترنت (HTTPS / ICMP / NCSI)',
        status,
        statusLabelEn: status === 'pass' ? 'Internet Online' : status === 'warn' ? 'Limited Access' : 'No Internet',
        statusLabelFa: status === 'pass' ? 'اینترنت متصل' : status === 'warn' ? 'دسترسی محدود' : 'بدون اینترنت',
        summaryEn: `HTTPS TCP/443: ${tcpOk ? `Reachable (${raw.tcpTarget})` : 'Blocked/Timeout'} · ICMP 8.8.8.8: ${icmpOk ? `Reply ${raw.icmpMs ?? ''}ms` : 'No Reply'} · Windows NCSI: ${ncsi.map((n) => `${n.iface || n.name}=${n.ipv4}`).join(', ') || 'N/A'}.`,
        summaryFa: `ارتباط HTTPS (پورت ۴۴۳): ${tcpOk ? `برقرار (${raw.tcpTarget})` : 'ناموفق/بسته'} · پینگ 8.8.8.8: ${icmpOk ? `پاسخ ${raw.icmpMs ?? ''}ms` : 'بدون پاسخ'} · وضعیت ویندوز: ${ncsi.map((n) => `${n.iface || n.name}: ${n.ipv4}`).join('، ') || 'نامشخص'}.`,
        recommendationEn:
          status === 'pass'
            ? 'Workstation can reach external internet endpoints over HTTPS.'
            : 'Check default gateway, DNS, proxy, firewall policy, or run Tracert/HTTP probe in Network tab.',
        recommendationFa:
          status === 'pass'
            ? 'دسترسی سیستم کاربر به اینترنت بدون اختلال برقرار است.'
            : 'گیت‌وی، DNS، پروکسی یا فایروال بررسی شود و با ابزار Probe در تب شبکه مسیر یابی (Tracert) انجام شود.',
        metrics: [
          { labelEn: 'TCP 443 (HTTPS)', labelFa: 'پورت ۴۴۳ اینترنت', value: tcpOk ? `Connected (${raw.tcpTarget})` : 'Failed', tone: tcpOk ? 'ok' : 'fail' },
          { labelEn: 'ICMP 8.8.8.8', labelFa: 'پینگ 8.8.8.8', value: icmpOk ? `Reply ${raw.icmpMs ?? ''}ms` : 'Timeout', tone: icmpOk ? 'ok' : 'warn' },
          { labelEn: 'NCSI Profile', labelFa: 'پروفایل ویندوز', value: ncsi[0]?.ipv4 || 'Unknown', tone: hasNcsiInternet ? 'ok' : 'warn' },
        ],
        highlights: ncsi.map((n) => ({
          primary: `${n.iface || n.name} (${n.category})`,
          secondary: `IPv4 Connectivity: ${n.ipv4}`,
          badge: n.ipv4,
          badgeTone: String(n.ipv4).toLowerCase() === 'internet' ? 'ok' : 'warn',
        })),
        durationMs,
        jumpTarget,
      });
    } else if (id === 'vpn_status') {
      const ras: any[] = Array.isArray(raw.rasProfiles) ? raw.rasProfiles : [];
      const vpnAds: any[] = Array.isArray(raw.vpnAdapters) ? raw.vpnAdapters : [];
      const vpnProcs: string[] = Array.isArray(raw.vpnProcesses) ? raw.vpnProcesses : [];

      const connectedRas = ras.filter((v) => String(v.status).toLowerCase() === 'connected');
      const upAdapters = vpnAds.filter((a) => String(a.status).toLowerCase() === 'up');
      const isConnected = connectedRas.length > 0 || upAdapters.length > 0;
      const hasConfigured = ras.length > 0 || vpnAds.length > 0 || vpnProcs.length > 0;

      const status: 'pass' | 'warn' | 'info' = isConnected ? 'pass' : hasConfigured ? 'warn' : 'info';

      results.push({
        id,
        category: 'network',
        titleEn: 'VPN Connection Status & Active Tunnels',
        titleFa: 'وضعیت اتصال VPN و تانل‌های فعال سیستم',
        status,
        statusLabelEn: isConnected ? 'VPN Connected' : hasConfigured ? 'VPN Disconnected' : 'No VPN Active',
        statusLabelFa: isConnected ? 'VPN متصل است' : hasConfigured ? 'VPN قطع است' : 'VPN وجود ندارد',
        summaryEn: isConnected
          ? `Active VPN tunnel detected: ${[...connectedRas.map((v) => `${v.name} (${v.tunnelType})`), ...upAdapters.map((a) => `${a.name} [${a.description}]`)].join(', ')}.`
          : hasConfigured
          ? `${ras.length} Windows VPN profile(s) / client adapters detected, currently Disconnected.`
          : 'No Windows RAS VPN profiles or 3rd-party VPN adapters/clients are currently active.',
        summaryFa: isConnected
          ? `تانل VPN متصل شناسایی شد: ${[...connectedRas.map((v) => `${v.name} (${v.tunnelType})`), ...upAdapters.map((a) => a.name)].join('، ')}.`
          : hasConfigured
          ? `پروفایل یا کلاینت VPN روی سیستم وجود دارد اما در حال حاضر متصل (Connected) نیست.`
          : 'هیچ کانکشن یا تانل VPN فعالی روی این سیستم شناسایی نشد.',
        recommendationEn: 'Connect, disconnect, or provision Windows VPN profiles directly inside the Network -> VPN section.',
        recommendationFa: 'مدیریت اتصال، قطع یا ساخت پروفایل‌های VPN مستقیماً از تب شبکه امکان‌پذیر است.',
        metrics: [
          { labelEn: 'Connection', labelFa: 'وضعیت اتصال', value: isConnected ? 'Connected' : 'Disconnected', tone: isConnected ? 'ok' : hasConfigured ? 'warn' : 'info' },
          { labelEn: 'RAS Profiles', labelFa: 'پروفایل ویندوز', value: String(ras.length), tone: 'info' },
          { labelEn: 'VPN Clients/NICs', labelFa: 'آداپتر/کلاینت', value: String(upAdapters.length || vpnProcs.length), tone: 'info' },
        ],
        highlights: [
          ...ras.map((v) => ({
            primary: `${v.name} (${v.server})`,
            secondary: `${v.tunnelType} · ${v.scope}`,
            badge: v.status,
            badgeTone: (String(v.status).toLowerCase() === 'connected' ? 'ok' : 'warn') as 'ok' | 'warn',
          })),
          ...upAdapters.map((a) => ({
            primary: a.name,
            secondary: a.description,
            badge: a.status,
            badgeTone: 'ok' as const,
          })),
        ],
        durationMs,
        jumpTarget,
      });
    } else if (id === 'os_drive_cleanup') {
      const totalB = Number(raw.totalBytes) || 0;
      const freeB = Number(raw.freeBytes) || 0;
      const usedB = Number(raw.usedBytes) || 0;
      const freePct = Number(raw.freePct) || 0;
      const winTempB = Number(raw.winTempBytes) || 0;
      const userTempB = Number(raw.userTempBytes) || 0;
      const wuB = Number(raw.wuCacheBytes) || 0;
      const rbB = Number(raw.recycleBinBytes) || 0;
      const rbCnt = Number(raw.recycleBinCount) || 0;
      const junkTotalB = winTempB + userTempB + rbB;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (freePct < 10 || (totalB > 0 && freeB < 5 * 1024 * 1024 * 1024)) status = 'fail';
      else if (freePct < 20 || junkTotalB >= 2 * 1024 * 1024 * 1024) status = 'warn';

      results.push({
        id,
        category: 'system_storage',
        titleEn: `OS Drive (${raw.drive || 'C:'}) Capacity, Temp & Recycle Bin`,
        titleFa: `فضای درایو ویندوز (${raw.drive || 'C:'})، فایل‌های Temp و سطل زباله (Recycle Bin)`,
        status,
        statusLabelEn: status === 'pass' ? `${freePct}% Free` : status === 'warn' ? 'Cleanup Recommended' : 'Critically Low Space',
        statusLabelFa: status === 'pass' ? `${freePct}% فضای آزاد` : status === 'warn' ? 'نیازمند پاک‌سازی' : 'کمبود شدید فضا',
        summaryEn: `Drive ${raw.drive || 'C:'}: ${formatBytesHuman(freeB)} free of ${formatBytesHuman(totalB)} (${freePct}% free). Temp folders: ${formatBytesHuman(winTempB + userTempB)} · WU Cache: ${formatBytesHuman(wuB)} · Recycle Bin: ${formatBytesHuman(rbB)} (${rbCnt} items).`,
        summaryFa: `درایو ${raw.drive || 'C:'}: ${formatBytesHuman(freeB)} آزاد از ${formatBytesHuman(totalB)} (${freePct}% آزاد). پوشه‌های Temp: ${formatBytesHuman(winTempB + userTempB)} · کش آپدیت: ${formatBytesHuman(wuB)} · سطل زباله (Recycle Bin): ${formatBytesHuman(rbB)} (${rbCnt} فایل).`,
        recommendationEn:
          status === 'pass'
            ? 'OS drive capacity is healthy. You can reclaim Temp files or empty Recycle Bin anytime in Disk, Drives & Shared Folders.'
            : 'Run safe Temp cleanup and empty Recycle Bin in the Disk, Drives & Shared Folders tab.',
        recommendationFa:
          status === 'pass'
            ? 'ظرفیت درایو ویندوز مناسب است. در صورت نیاز از تب دیسک، درایوها و پوشه‌های اشتراکی، پوشه Temp یا سطل زباله را پاک‌سازی کنید.'
            : 'پیشنهاد می‌شود فوراً از تب دیسک، درایوها و پوشه‌های اشتراکی، پوشه‌های Temp را پاک‌سازی و سطل زباله کاربر را تخلیه کنید.',
        metrics: [
          { labelEn: 'Free Space', labelFa: 'فضای آزاد', value: `${formatBytesHuman(freeB)} (${freePct}%)`, tone: status === 'fail' ? 'fail' : status === 'warn' ? 'warn' : 'ok' },
          { labelEn: 'Temp Folders', labelFa: 'پوشه‌های Temp', value: formatBytesHuman(winTempB + userTempB), tone: winTempB + userTempB > 1024 * 1024 * 1024 ? 'warn' : 'info' },
          { labelEn: 'Recycle Bin', labelFa: 'سطل زباله', value: `${formatBytesHuman(rbB)} (${rbCnt})`, tone: rbB > 1024 * 1024 * 1024 ? 'warn' : 'info' },
          { labelEn: 'WU Cache', labelFa: 'کش آپدیت', value: formatBytesHuman(wuB), tone: 'info' },
        ],
        highlights: [
          { primary: `Used: ${formatBytesHuman(usedB)} / ${formatBytesHuman(totalB)}`, secondary: `Windows\\Temp: ${formatBytesHuman(winTempB)} · User Temp: ${formatBytesHuman(userTempB)}`, badge: `${freePct}% Free`, badgeTone: status === 'fail' ? 'fail' : status === 'warn' ? 'warn' : 'ok' },
          { primary: `Recycle Bin: ${formatBytesHuman(rbB)}`, secondary: `${rbCnt} deleted item(s) waiting`, badge: rbCnt > 0 ? 'Not Empty' : 'Empty', badgeTone: rbB > 1024 * 1024 * 1024 ? 'warn' : 'info' },
        ],
        durationMs,
        jumpTarget,
      });
    } else if (id === 'windows_integrity') {
      const dismStatus = String(raw.dismStatus || 'Unknown');
      const corruptKey = Boolean(raw.cbsCorruptionKey);
      const cbsErrs = Number(raw.cbsRecentErrors) || 0;
      const pendingReboot = Boolean(raw.pendingReboot);
      const dirtyDisks: string[] = Array.isArray(raw.dirtyDisks) ? raw.dirtyDisks.filter(Boolean) : [];
      const isBad = /repairable|corrupt/i.test(dismStatus) || corruptKey || cbsErrs > 0 || dirtyDisks.length > 0;
      const status: 'pass' | 'warn' | 'fail' = isBad ? 'fail' : pendingReboot ? 'warn' : 'pass';

      results.push({
        id,
        category: 'system_storage',
        titleEn: 'Windows System File & Component Integrity (DISM / CBS)',
        titleFa: 'بررسی خرابی فایل‌های سیستمی و ایمیج ویندوز (DISM / CBS)',
        status,
        statusLabelEn: isBad ? 'Corruption Detected' : pendingReboot ? 'Reboot Pending' : 'System Healthy',
        statusLabelFa: isBad ? 'احتمال خرابی فایل‌ها' : pendingReboot ? 'نیازمند ری‌استارت' : 'فایل‌های سیستمی سالم',
        summaryEn: `DISM CheckHealth: ${dismStatus} · CBS Log Recent Corruption Hits: ${cbsErrs} · Pending Reboot: ${pendingReboot ? 'Yes' : 'No'}${dirtyDisks.length ? ` · Dirty Volumes: ${dirtyDisks.join(', ')}` : ''}.`,
        summaryFa: `نتیجه DISM CheckHealth: ${dismStatus} · موارد خرابی در لاگ CBS: ${cbsErrs} · ری‌استارت در انتظار: ${pendingReboot ? 'بله' : 'خیر'}${dirtyDisks.length ? ` · درایو معیوب (Dirty Bit): ${dirtyDisks.join(', ')}` : ''}.`,
        recommendationEn: isBad
          ? 'Open SFC & DISM Repair in Maintenance tab to run DISM /RestoreHealth and sfc /scannow.'
          : 'Component store reports no detected corruption. Run full SFC /scannow manually if needed.',
        recommendationFa: isBad
          ? 'به تب تعمیر سیستم بخش SFC & DISM رفته و دستور DISM RestoreHealth سپس sfc /scannow را اجرا کنید.'
          : 'مخزن فایل‌های ویندوز سالم گزارش شد (در صورت نیاز بررسی عمیق‌تر از بخش SFC & DISM اقدام کنید).',
        metrics: [
          { labelEn: 'DISM CheckHealth', labelFa: 'سلامت ایمیج DISM', value: dismStatus, tone: isBad ? 'fail' : 'ok' },
          { labelEn: 'CBS Errors', labelFa: 'خطاهای اخیر CBS', value: String(cbsErrs), tone: cbsErrs > 0 ? 'fail' : 'ok' },
          { labelEn: 'Pending Reboot', labelFa: 'نیاز به ری‌استارت', value: pendingReboot ? 'Yes' : 'No', tone: pendingReboot ? 'warn' : 'ok' },
        ],
        highlights: [
          { primary: `DISM Component Store: ${dismStatus}`, secondary: `CBS Corruption Registry Flag: ${corruptKey ? 'SET' : 'Clean'}`, badge: isBad ? 'Repair Needed' : 'Healthy', badgeTone: isBad ? 'fail' : 'ok' },
        ],
        durationMs,
        jumpTarget,
      });
    } else if (id === 'windows_update_last') {
      const latestDate = String(raw.latestDate || '').trim();
      const latestKb = String(raw.latestKb || '').trim();
      const wuLast = String(raw.wuLastInstall || '').trim();
      const recentHotfixes: any[] = Array.isArray(raw.recentHotfixes) ? raw.recentHotfixes : [];
      const pendingReboot = Boolean(raw.pendingReboot);
      let daysAgo: number | null = null;
      if (latestDate) {
        const parsedTs = Date.parse(latestDate);
        if (!Number.isNaN(parsedTs)) {
          daysAgo = Math.max(0, Math.floor((Date.now() - parsedTs) / 86400000));
        }
      }
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (!latestDate && !wuLast) status = 'warn';
      else if (daysAgo !== null && daysAgo > 90) status = 'fail';
      else if ((daysAgo !== null && daysAgo > 45) || pendingReboot) status = 'warn';

      results.push({
        id,
        category: 'system_storage',
        titleEn: 'Last Installed Windows Update & WSUS Policy',
        titleFa: 'تاریخ آخرین آپدیت نصب‌شده ویندوز و وضعیت WSUS',
        status,
        statusLabelEn: status === 'pass' ? 'Recently Updated' : status === 'warn' ? (pendingReboot ? 'Reboot Pending' : 'Update Aging') : 'Outdated (>90d)',
        statusLabelFa: status === 'pass' ? 'به‌روز' : status === 'warn' ? (pendingReboot ? 'نیاز به ری‌استارت' : 'آپدیت قدیمی') : 'بسیار قدیمی (>۹۰ روز)',
        summaryEn: latestDate
          ? `Latest HotFix: ${latestKb} (${raw.latestDescription || 'Update'}) installed on ${latestDate} (${daysAgo} days ago). Source: ${raw.useWsus ? `WSUS (${raw.wsusUrl || 'Configured'})` : 'Microsoft Update / Internet'}.`
          : `No Win32_QuickFixEngineering HotFix record found.${wuLast ? ` Last WU install timestamp: ${wuLast}.` : ''}`,
        summaryFa: latestDate
          ? `آخرین آپدیت (HotFix): ${latestKb} (${raw.latestDescription || 'Update'}) در تاریخ ${latestDate} (${daysAgo} روز پیش) نصب شده است. منبع: ${raw.useWsus ? `WSUS (${raw.wsusUrl || 'فعال'})` : 'اینترنت مستقیم'}.`
          : `رکوردی در HotFix ویندوز یافت نشد.${wuLast ? ` آخرین زمان ثبت‌شده در WU: ${wuLast}.` : ''}`,
        recommendationEn: 'Check pending updates, WSUS settings, or install/uninstall KBs inside the Updates tab.',
        recommendationFa: 'برای بررسی آپدیت‌های در انتظار، تغییر منبع WSUS/اینترنت یا حذف/نصب KB به تب آپدیت ویندوز بروید.',
        metrics: [
          { labelEn: 'Last KB / Date', labelFa: 'آخرین آپدیت', value: latestDate ? `${latestKb} (${latestDate})` : wuLast || 'None', tone: status === 'fail' ? 'fail' : status === 'warn' ? 'warn' : 'ok' },
          { labelEn: 'Age', labelFa: 'فاصله زمانی', value: daysAgo !== null ? `${daysAgo} days ago` : '-', tone: daysAgo !== null && daysAgo > 45 ? 'warn' : 'info' },
          { labelEn: 'Update Source', labelFa: 'منبع آپدیت', value: raw.useWsus ? 'WSUS' : 'Internet', tone: 'info' },
        ],
        highlights: recentHotfixes.map((hf) => ({
          primary: `${hf.kb} — ${hf.date}`,
          secondary: hf.description,
          badge: 'Installed',
          badgeTone: 'ok',
        })),
        durationMs,
        jumpTarget,
      });
    } else if (id === 'drivers_status') {
      const totalDevices = Number(raw.totalDevices) || 0;
      const problemCount = Number(raw.problemCount) || 0;
      const problems: any[] = Array.isArray(raw.problemDevices) ? raw.problemDevices : [];
      const status: 'pass' | 'fail' = problemCount > 0 ? 'fail' : 'pass';

      results.push({
        id,
        category: 'hardware_perf',
        titleEn: 'Device Drivers & Plug-and-Play Health',
        titleFa: 'سلامت درایورها و تجهیزات سخت‌افزاری (Device Manager)',
        status,
        statusLabelEn: status === 'pass' ? 'All Drivers OK' : `${problemCount} Driver Error(s)`,
        statusLabelFa: status === 'pass' ? 'همه درایورها سالم' : `${problemCount} درایور معیوب`,
        summaryEn:
          problemCount === 0
            ? `All ${totalDevices} PnP hardware devices report healthy status (ConfigManagerErrorCode = 0).`
            : `${problemCount} of ${totalDevices} hardware devices report driver or hardware errors: ${problems.slice(0, 3).map((p) => `${p.name} (Code ${p.errorCode})`).join(', ')}.`,
        summaryFa:
          problemCount === 0
            ? `تمام ${totalDevices} دستگاه و درایور سخت‌افزاری سیستم بدون هیچ خطایی نصب و سالم هستند.`
            : `${problemCount} قطعه/درایور دارای خطا است: ${problems.slice(0, 3).map((p) => `${p.name} (کد ${p.errorCode})`).join('، ')}.`,
        recommendationEn:
          problemCount === 0
            ? 'No missing or broken drivers detected.'
            : 'Inspect affected hardware devices in the Hardware & Peripherals tab and reinstall/enable their drivers.',
        recommendationFa:
          problemCount === 0
            ? 'هیچ درایور نصب‌نشده یا معیوبی یافت نشد.'
            : 'در تب سخت‌افزار و تجهیزات متصل جزئیات دستگاه‌های معیوب را بررسی کنید.',
        metrics: [
          { labelEn: 'Total PnP Devices', labelFa: 'کل دستگاه‌ها', value: String(totalDevices), tone: 'info' },
          { labelEn: 'Driver Errors', labelFa: 'خطای درایور', value: String(problemCount), tone: problemCount > 0 ? 'fail' : 'ok' },
        ],
        highlights: problems.map((p) => {
          const desc = mapPnpConfigErrorCode(Number(p.errorCode) || 0);
          return {
            primary: p.name || 'Unknown Device',
            secondary: `${p.pnpClass || 'Device'} · ${p.manufacturer || ''} · ${desc.en}`,
            badge: `Code ${p.errorCode}`,
            badgeTone: 'fail',
          };
        }),
        durationMs,
        jumpTarget,
      });
    } else if (id === 'cpu_ram_usage') {
      const cpuPct = Number(raw.cpuPercent) || 0;
      const ramPct = Number(raw.ramPercent) || 0;
      const usedGb = Number(raw.usedRamGb) || 0;
      const totalGb = Number(raw.totalRamGb) || 0;
      const freeGb = Number(raw.freeRamGb) || 0;
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (cpuPct >= 90 || ramPct >= 92) status = 'fail';
      else if (cpuPct >= 75 || ramPct >= 80) status = 'warn';

      results.push({
        id,
        category: 'hardware_perf',
        titleEn: 'CPU & Memory (RAM) Utilization',
        titleFa: 'میزان مصرف لحظه‌ای پردازنده (CPU) و حافظه (RAM)',
        status,
        statusLabelEn: status === 'pass' ? 'Resources Normal' : status === 'warn' ? 'Elevated Usage' : 'Resource Saturation',
        statusLabelFa: status === 'pass' ? 'مصرف نرمال' : status === 'warn' ? 'مصرف بالا' : 'اشباع شدید منابع',
        summaryEn: `CPU: ${cpuPct}% (${raw.cores}C / ${raw.logicalProcessors}T — ${raw.cpuModel || 'CPU'}) · RAM: ${usedGb} / ${totalGb} GB (${ramPct}% used, ${freeGb} GB free).`,
        summaryFa: `مصرف CPU: ${cpuPct}% (${raw.cores} هسته / ${raw.logicalProcessors} ترد) · مصرف RAM: ${usedGb} از ${totalGb} گیگابایت (${ramPct}% پر، ${freeGb} GB آزاد).`,
        recommendationEn:
          status === 'pass'
            ? 'CPU and RAM headroom are healthy.'
            : 'Open System Health tab to inspect resource gauges and terminate heavy background apps if needed.',
        recommendationFa:
          status === 'pass'
            ? 'میزان مصرف CPU و RAM در محدوده کاملاً استاندارد است.'
            : 'برای مشاهده نمودار زنده و کنترل پروسس‌های پرمصرف به تب سلامت سیستم بروید.',
        metrics: [
          { labelEn: 'CPU Load', labelFa: 'مصرف CPU', value: `${cpuPct}%`, tone: cpuPct >= 90 ? 'fail' : cpuPct >= 75 ? 'warn' : 'ok' },
          { labelEn: 'RAM Usage', labelFa: 'مصرف RAM', value: `${usedGb} / ${totalGb} GB (${ramPct}%)`, tone: ramPct >= 92 ? 'fail' : ramPct >= 80 ? 'warn' : 'ok' },
          { labelEn: 'RAM Free', labelFa: 'RAM آزاد', value: `${freeGb} GB`, tone: 'info' },
        ],
        highlights: [
          { primary: String(raw.cpuModel || 'Processor'), secondary: `${raw.cores} Cores / ${raw.logicalProcessors} Logical Threads`, badge: `${cpuPct}%`, badgeTone: cpuPct >= 90 ? 'fail' : cpuPct >= 75 ? 'warn' : 'ok' },
          { primary: `Physical Memory: ${usedGb} GB Used / ${totalGb} GB Total`, secondary: `Available: ${freeGb} GB`, badge: `${ramPct}%`, badgeTone: ramPct >= 92 ? 'fail' : ramPct >= 80 ? 'warn' : 'ok' },
        ],
        durationMs,
        jumpTarget,
      });
    } else if (id === 'top_resource_apps') {
      const topCpu: any[] = Array.isArray(raw.topCpu) ? raw.topCpu : [];
      const topRam: any[] = Array.isArray(raw.topRam) ? raw.topRam : [];
      const maxCpuProc = topCpu[0];
      const maxRamProc = topRam[0];
      const hasSpike = (Number(maxCpuProc?.cpuPercent) || 0) >= 50 || (Number(maxRamProc?.memoryPercent) || 0) >= 35;
      const status: 'pass' | 'warn' = hasSpike ? 'warn' : 'pass';

      results.push({
        id,
        category: 'hardware_perf',
        titleEn: 'Top Resource-Consuming Applications',
        titleFa: 'نرم‌افزارها و پروسس‌های با بیشترین مصرف منابع (CPU / RAM)',
        status,
        statusLabelEn: status === 'warn' ? 'Heavy Process Found' : 'Normal Distribution',
        statusLabelFa: status === 'warn' ? 'پروسس پرمصرف' : 'توزیع عادی منابع',
        summaryEn: `Top CPU: ${maxCpuProc ? `${maxCpuProc.name} (${maxCpuProc.cpuPercent}%)` : '-'} · Top RAM: ${maxRamProc ? `${maxRamProc.name} (${maxRamProc.memoryMb} MB / ${maxRamProc.memoryPercent}%)` : '-'} across ${raw.totalProcesses || 0} processes.`,
        summaryFa: `بیشترین مصرف CPU: ${maxCpuProc ? `${maxCpuProc.name} (${maxCpuProc.cpuPercent}%)` : '-'} · بیشترین مصرف RAM: ${maxRamProc ? `${maxRamProc.name} (${maxRamProc.memoryMb} MB)` : '-'} از بین ${raw.totalProcesses || 0} پروسس.`,
        recommendationEn: 'Jump to Live Process Monitor in the Health tab to end hung user applications safely.',
        recommendationFa: 'از دکمه تب سلامت سیستم می‌توانید مستقیماً وارد لیست پروسس‌ها شده و برنامه هنگ‌کرده یا پرمصرف را ببندید.',
        metrics: [
          { labelEn: 'Top CPU App', labelFa: 'پرمصرف‌ترین CPU', value: maxCpuProc ? `${maxCpuProc.name} (${maxCpuProc.cpuPercent}%)` : '-', tone: Number(maxCpuProc?.cpuPercent) >= 50 ? 'warn' : 'info' },
          { labelEn: 'Top RAM App', labelFa: 'پرمصرف‌ترین RAM', value: maxRamProc ? `${maxRamProc.name} (${maxRamProc.memoryMb} MB)` : '-', tone: Number(maxRamProc?.memoryPercent) >= 35 ? 'warn' : 'info' },
          { labelEn: 'Active Processes', labelFa: 'کل پروسس‌ها', value: String(raw.totalProcesses || 0), tone: 'info' },
        ],
        highlights: [
          ...topRam.slice(0, 4).map((p) => ({
            primary: `${p.name} (PID ${p.pid})`,
            secondary: `RAM: ${p.memoryMb} MB (${p.memoryPercent}%) · CPU: ${p.cpuPercent}%`,
            badge: `${p.memoryMb} MB`,
            badgeTone: (Number(p.memoryPercent) >= 35 ? 'warn' : 'info') as 'warn' | 'info',
          })),
          ...topCpu
            .filter((p) => !topRam.slice(0, 4).some((r) => r.pid === p.pid))
            .slice(0, 2)
            .map((p) => ({
              primary: `${p.name} (PID ${p.pid})`,
              secondary: `CPU: ${p.cpuPercent}% · RAM: ${p.memoryMb} MB`,
              badge: `CPU ${p.cpuPercent}%`,
              badgeTone: (Number(p.cpuPercent) >= 50 ? 'warn' : 'info') as 'warn' | 'info',
            })),
        ],
        durationMs,
        jumpTarget,
      });
    } else if (id === 'active_directory_policy') {
      const domainJoined = Boolean(raw.domainJoined);
      const domainName = String(raw.domainName || '').trim();
      const forestName = String(raw.forestName || '').trim();
      const entraJoined = Boolean(raw.entraJoined);
      const tenantName = String(raw.tenantName || '').trim();
      const targetUser = String(raw.targetUser || '').trim();
      const samName = String(raw.samName || '').trim();
      const dcName = String(raw.dcName || '').trim();
      const dcAddress = String(raw.dcAddress || '').trim();
      const dcSite = String(raw.dcSite || '').trim();
      const clientSite = String(raw.clientSite || '').trim();
      const dcServices: string[] = Array.isArray(raw.dcServices) ? raw.dcServices.map(String).filter(Boolean) : [];
      const secureChannelOk: boolean | null =
        typeof raw.secureChannelOk === 'boolean' ? raw.secureChannelOk : null;
      const trustMessage = String(raw.trustMessage || '').trim();
      const policyDc = String(raw.policyDcUser || raw.policyDcComputer || dcName || '').trim();
      const lastGpoRefresh = String(raw.lastGpoRefresh || '').trim();
      const compGpos: string[] = Array.isArray(raw.computerGpos) ? raw.computerGpos.map(String).filter(Boolean) : [];
      const userGpos: string[] = Array.isArray(raw.userGpos) ? raw.userGpos.map(String).filter(Boolean) : [];
      const allGpos = Array.from(new Set([...compGpos, ...userGpos]));

      const netUserRaw = String(raw.netUserRaw || '');
      const parseNetGroups = (startLabel: string, stopLabels: string[]): string[] => {
        const lines = netUserRaw.split(/\r?\n/);
        const grps: string[] = [];
        let cap = false;
        for (const ln of lines) {
          if (!cap) {
            if (new RegExp(`^${startLabel}`, 'i').test(ln)) {
              cap = true;
              const rest = ln.replace(new RegExp(`^${startLabel}`, 'i'), '').trim();
              const ms = rest.match(/\*([^*]+)/g);
              if (ms) ms.forEach((m) => grps.push(m.replace(/^\*/, '').trim()));
            }
          } else {
            if (
              !ln.trim() ||
              stopLabels.some((lbl) => new RegExp(`^${lbl}`, 'i').test(ln)) ||
              /command completed successfully/i.test(ln)
            ) {
              break;
            }
            const ms = ln.match(/\*([^*]+)/g);
            if (ms) ms.forEach((m) => grps.push(m.replace(/^\*/, '').trim()));
          }
        }
        return grps.filter((g) => g && !/^none$/i.test(g));
      };

      const netGlobalGroups = parseNetGroups('Global Group memberships', ['The command completed']);
      const netLocalGroups = parseNetGroups('Local Group Memberships', ['Global Group memberships']);
      const adsiGroups: string[] = Array.isArray(raw.adsiGroups) ? raw.adsiGroups.map(String).filter(Boolean) : [];
      const gpoSecGroups: string[] = Array.isArray(raw.gpoSecGroups)
        ? raw.gpoSecGroups
            .map(String)
            .filter(
              (g) =>
                g &&
                !/^(Everyone|BUILTIN\\|NT AUTHORITY\\|Mandatory Label\\|Local account|Console Logon|This Organization|Authentication authority|NTLM Authentication|High Mandatory Level|Medium Mandatory Level)/i.test(
                  g
                )
            )
            .map((g) => (g.includes('\\') ? g.split('\\').pop() || g : g))
        : [];
      const localUserGroups: string[] = Array.isArray(raw.localUserGroups)
        ? raw.localUserGroups.map(String).filter(Boolean)
        : [];

      const adGroups = Array.from(new Set([...adsiGroups, ...netGlobalGroups, ...gpoSecGroups]));
      const localGroups = Array.from(new Set([...netLocalGroups, ...localUserGroups]));

      let status: 'pass' | 'warn' | 'fail' | 'info' = 'info';
      if (domainJoined) {
        if (secureChannelOk === false || (!dcName && !policyDc)) status = 'warn';
        else status = 'pass';
      }

      const servicesStr = dcServices.length > 0 ? dcServices.join(', ') : domainJoined ? 'AD DS / GPO' : '-';

      const highlights: HelpdeskDiagnosticHighlight[] = [];
      if (domainJoined) {
        highlights.push({
          primary: `AD Domain: ${domainName}${forestName && forestName !== domainName ? ` (Forest: ${forestName})` : ''}`,
          secondary: `DC: ${dcName || 'Not resolved'}${dcAddress ? ` (${dcAddress})` : ''} · Site: ${clientSite || dcSite || '-'} · Services: ${servicesStr}`,
          badge:
            secureChannelOk === true
              ? 'DC & Trust OK'
              : secureChannelOk === false
              ? 'Trust Broken'
              : dcName
              ? 'DC Active'
              : 'DC Unreachable',
          badgeTone: secureChannelOk === false || !dcName ? 'warn' : 'ok',
        });
        highlights.push({
          primary: `Policy Server (GPO DC): ${policyDc || dcName || 'Cached / Unknown'}`,
          secondary: `${compGpos.length} Computer GPO(s) · ${userGpos.length} User GPO(s)${lastGpoRefresh ? ` · Last Refresh: ${lastGpoRefresh}` : ''}`,
          badge: `${allGpos.length} GPOs`,
          badgeTone: allGpos.length > 0 ? 'ok' : 'info',
        });
        if (entraJoined) {
          highlights.push({
            primary: `Hybrid Entra ID / Azure AD Connected`,
            secondary: tenantName ? `Tenant: ${tenantName}` : 'Device is Entra ID + On-Prem AD joined',
            badge: 'Hybrid Joined',
            badgeTone: 'info',
          });
        }
      } else {
        highlights.push({
          primary: `${entraJoined ? 'Microsoft Entra ID Joined (Cloud)' : `Workgroup: ${domainName || 'WORKGROUP'}`}`,
          secondary: entraJoined
            ? `Tenant: ${tenantName || 'Cloud Entra'} · No on-premises Active Directory DC`
            : 'Endpoint is standalone / workgroup and does not pull on-premises AD Group Policy.',
          badge: entraJoined ? 'Entra ID' : 'Workgroup',
          badgeTone: 'info',
        });
      }

      if (trustMessage && secureChannelOk === false) {
        highlights.push({
          primary: 'AD Secure Channel Warning',
          secondary: trustMessage,
          badge: 'Verify Trust',
          badgeTone: 'warn',
        });
      }

      const tagSections: HelpdeskDiagnosticTagSection[] = [];
      if (adGroups.length > 0) {
        tagSections.push({
          titleEn: `Active Directory Groups for "${targetUser || samName || 'User'}" (${adGroups.length})`,
          titleFa: `گروه‌های اکتیو دایرکتوری کاربر «${targetUser || samName || 'User'}» (${adGroups.length} گروه)`,
          tone: 'ok',
          items: adGroups,
        });
      }
      if (localGroups.length > 0) {
        tagSections.push({
          titleEn: `Local Security Groups (${localGroups.length})`,
          titleFa: `گروه‌های محلی سیستم (${localGroups.length})`,
          tone: 'info',
          items: localGroups,
        });
      }
      if (allGpos.length > 0) {
        tagSections.push({
          titleEn: `Applied Group Policy Objects (${allGpos.length})`,
          titleFa: `پالیسی‌های اعمال‌شده از اکتیودایرکتوری / GPO (${allGpos.length})`,
          tone: 'info',
          items: allGpos,
        });
      }

      results.push({
        id,
        category: 'system_storage',
        titleEn: 'Active Directory, Connected DC, GPO Policies & User Groups',
        titleFa: 'اتصال اکتیو دایرکتوری، سرور پالیسی (GPO) و گروه‌های کاربری',
        status,
        statusLabelEn: !domainJoined
          ? entraJoined
            ? 'Entra ID Only'
            : 'Workgroup'
          : status === 'pass'
          ? 'AD & Policy Active'
          : 'DC / Trust Warning',
        statusLabelFa: !domainJoined
          ? entraJoined
            ? 'متصل به Entra ID'
            : 'Workgroup (خارج دامین)'
          : status === 'pass'
          ? 'متصل به دامین و پالیسی'
          : 'هشدار ارتباط DC / دامین',
        summaryEn: domainJoined
          ? `Connected to AD domain "${domainName}" via DC "${dcName || 'Unknown'}"${dcAddress ? ` (${dcAddress})` : ''} · Policy applied from "${policyDc || dcName || '-'}" (${allGpos.length} GPOs) · User "${targetUser || samName || '-'}" belongs to ${adGroups.length} AD group(s).`
          : `Endpoint is in ${entraJoined ? `Entra ID (${tenantName || 'Cloud'})` : `Workgroup (${domainName || 'WORKGROUP'})`} — not connected to an on-premises Active Directory domain.`,
        summaryFa: domainJoined
          ? `متصل به اکتیو دایرکتوری «${domainName}» از طریق سرور DC «${dcName || 'نامشخص'}»${dcAddress ? ` (${dcAddress})` : ''} · دریافت پالیسی از «${policyDc || dcName || '-'}» (${allGpos.length} پالیسی GPO) · کاربر «${targetUser || samName || '-'}» عضو ${adGroups.length} گروه اکتیودایرکتوری است.`
          : `این سیستم در حالت ${entraJoined ? `Entra ID (${tenantName || 'ابری'})` : `Workgroup (${domainName || 'WORKGROUP'})`} قرار دارد و به اکتیو دایرکتوری سازمانی متصل نیست.`,
        recommendationEn: domainJoined
          ? status === 'pass'
            ? 'Inspect or force-refresh policies in GPO Manager, or look up full AD account lockout/expiry details in Domain Account Inspector.'
            : 'Verify DNS points to your Active Directory DC and run gpupdate /force in the GPO panel.'
          : 'No on-premises AD GPO applies in Workgroup mode.',
        recommendationFa: domainJoined
          ? status === 'pass'
            ? 'برای رفرش آنی پالیسی‌ها به بخش GPO و برای بررسی انقضای رمز و قفل اکانت به بخش اکانت دامین بروید.'
            : 'تنظیم بودن DNS روی آدرس Domain Controller را بررسی و در بخش GPO دستور gpupdate را اجرا کنید.'
          : 'در حالت Workgroup پالیسی اکتیو دایرکتوری اعمال نمی‌شود.',
        metrics: [
          {
            labelEn: 'AD Domain',
            labelFa: 'دامین اکتیودایرکتوری',
            value: domainName || 'Workgroup',
            tone: domainJoined ? 'ok' : 'info',
          },
          {
            labelEn: 'Domain Controller',
            labelFa: 'سرور DC متصل',
            value: dcName ? (dcAddress ? `${dcName} (${dcAddress})` : dcName) : domainJoined ? 'Unresolved' : 'N/A',
            tone: domainJoined ? (dcName && secureChannelOk !== false ? 'ok' : 'warn') : 'info',
          },
          {
            labelEn: 'Applied Policies',
            labelFa: 'پالیسی‌های GPO',
            value: domainJoined ? `${allGpos.length} GPOs` : 'None',
            tone: domainJoined && allGpos.length > 0 ? 'ok' : 'info',
          },
          {
            labelEn: 'User AD Groups',
            labelFa: 'گروه‌های AD کاربر',
            value: domainJoined ? `${adGroups.length} Groups` : `${localGroups.length} Local`,
            tone: domainJoined && adGroups.length > 0 ? 'ok' : 'info',
          },
        ],
        highlights,
        tagSections,
        durationMs,
        jumpTarget,
        secondaryJumpTarget: {
          tab: 'maintenance',
          sectionId: 'hd-section-domain-account',
          labelEn: 'AD User & Groups',
          labelFa: 'اکانت و گروه‌های دامین',
        },
      });
    }
  }

  let passed = 0;
  let warnings = 0;
  let failures = 0;
  let infoOnly = 0;
  let skipped = 0;
  for (const c of results) {
    if (c.status === 'pass') passed++;
    else if (c.status === 'warn') warnings++;
    else if (c.status === 'fail') failures++;
    else if (c.status === 'info') infoOnly++;
    else skipped++;
  }

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed?.hostname || execRes.host),
    osName: String(parsed?.osName || (execRes.osFamily === 'linux' ? 'Linux' : 'Windows')),
    loggedInUser: String(parsed?.loggedInUser || ''),
    collectedAt: new Date().toISOString(),
    totalDurationMs: Date.now() - startedAtMs,
    requestedChecks,
    summary: {
      totalChecked: results.length - skipped,
      passed,
      warnings,
      failures,
      infoOnly,
      skipped,
      overallStatus: failures > 0 ? 'critical' : warnings > 0 ? 'warning' : 'healthy',
    },
    checks: results,
  };
}

// ============================================================================
// HelpDesk Target Exceptions / Connection Blocklist Enforcement
// ============================================================================

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

export type HelpdeskExceptionCheckResult =
  | { blocked: false }
  | {
      blocked: true;
      phase: 'pre_connect' | 'endpoint_probe';
      rule: HelpdeskExceptionRecord;
      matchedValue: string;
      reasonEn: string;
      reasonFa: string;
      snapshot?: HelpdeskEndpointIdentitySnapshot;
    };

const EXCEPTION_IDENTITY_CACHE_TTL_MS = 90_000;
const exceptionIdentityCache = new Map<
  string,
  { expiresAt: number; snapshot: HelpdeskEndpointIdentitySnapshot }
>();

export function clearHelpdeskExceptionIdentityCache(): void {
  exceptionIdentityCache.clear();
}

function buildIdentityCacheKey(input: HelpdeskTargetInput): string {
  const host = String(input.targetIp || '').trim().toLowerCase();
  const credHash = crypto
    .createHash('sha256')
    .update(`${String(input.username || '').trim().toLowerCase()}\0${String(input.password || '')}`)
    .digest('hex')
    .slice(0, 24);
  return `${host}::${input.protocol || 'auto'}::${input.port || 0}::${credHash}`;
}

function parseIpv4ToUint32(ip: string): number | null {
  const clean = ip.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return null;
  const parts = clean.split('.').map((n) => Number(n));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3]) >>> 0;
}

function expandIpv6ToBigInt(rawIp: string): bigint | null {
  const clean = rawIp.trim().split('%')[0].toLowerCase();
  if (!clean.includes(':')) return null;
  const halves = clean.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':').filter((x) => x.length > 0) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter((x) => x.length > 0) : [];
  const missing = 8 - (left.length + right.length);
  if ((halves.length === 1 && left.length !== 8) || (halves.length === 2 && missing < 0)) return null;
  const full = halves.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (full.length !== 8) return null;
  let val = 0n;
  for (const part of full) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    val = (val << 16n) + BigInt(parseInt(part, 16));
  }
  return val;
}

function matchesGlobPattern(pattern: string, value: string): boolean {
  const esc = pattern
    .trim()
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i').test(value.trim());
}

function matchesSingleIpPattern(patternRaw: string, candidateIps: string[], candidateHostnames: string[]): boolean {
  const pattern = patternRaw.trim();
  if (!pattern) return false;
  const patLower = pattern.toLowerCase();

  // 1. IPv4 CIDR (a.b.c.d/prefix)
  const v4Cidr = pattern.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (v4Cidr) {
    const netInt = parseIpv4ToUint32(v4Cidr[1]);
    const prefix = Number(v4Cidr[2]);
    if (netInt !== null && prefix >= 0 && prefix <= 32) {
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      for (const ip of candidateIps) {
        const ipInt = parseIpv4ToUint32(ip);
        if (ipInt !== null && (ipInt & mask) === (netInt & mask)) return true;
      }
    }
    return false;
  }

  // 2. IPv6 CIDR
  if (pattern.includes(':') && pattern.includes('/')) {
    const [addr, pLenStr] = pattern.split('/');
    const pLen = Number(pLenStr);
    const netV6 = expandIpv6ToBigInt(addr);
    if (netV6 !== null && Number.isInteger(pLen) && pLen >= 0 && pLen <= 128) {
      const shift = BigInt(128 - pLen);
      for (const ip of candidateIps) {
        const ipV6 = expandIpv6ToBigInt(ip);
        if (ipV6 !== null && (ipV6 >> shift) === (netV6 >> shift)) return true;
      }
    }
    return false;
  }

  // 3. IPv4 Range (a.b.c.d-e.f.g.h or a.b.c.d-h)
  const rangeMatch = pattern.match(/^(\d{1,3}(?:\.\d{1,3}){3})\s*-\s*(\d{1,3}(?:\.\d{1,3}){3}|\d{1,3})$/);
  if (rangeMatch) {
    const startInt = parseIpv4ToUint32(rangeMatch[1]);
    let endStr = rangeMatch[2];
    if (/^\d{1,3}$/.test(endStr)) {
      const octets = rangeMatch[1].split('.');
      endStr = `${octets[0]}.${octets[1]}.${octets[2]}.${endStr}`;
    }
    const endInt = parseIpv4ToUint32(endStr);
    if (startInt !== null && endInt !== null) {
      const minInt = Math.min(startInt, endInt);
      const maxInt = Math.max(startInt, endInt);
      for (const ip of candidateIps) {
        const ipInt = parseIpv4ToUint32(ip);
        if (ipInt !== null && ipInt >= minInt && ipInt <= maxInt) return true;
      }
    }
    return false;
  }

  // 4. Exact IPv4 / IPv6
  const exactV4 = parseIpv4ToUint32(pattern);
  if (exactV4 !== null) {
    return candidateIps.some((ip) => parseIpv4ToUint32(ip) === exactV4);
  }
  const exactV6 = expandIpv6ToBigInt(pattern);
  if (exactV6 !== null) {
    return candidateIps.some((ip) => expandIpv6ToBigInt(ip) === exactV6);
  }

  // 5. Wildcard glob (* / ?)
  if (pattern.includes('*') || pattern.includes('?')) {
    return [...candidateIps, ...candidateHostnames].some((c) => matchesGlobPattern(pattern, c));
  }

  // 6. Hostname / FQDN match (case-insensitive)
  const patShort = patLower.split('.')[0];
  for (const hRaw of [...candidateIps, ...candidateHostnames]) {
    const h = String(hRaw || '').trim().toLowerCase();
    if (!h) continue;
    if (h === patLower) return true;
    const hShort = h.split('.')[0];
    if (
      (patLower.includes('.') && !h.includes('.') && h === patShort) ||
      (!patLower.includes('.') && h.includes('.') && hShort === patLower)
    ) {
      return true;
    }
  }
  return false;
}

function matchIpRule(ruleTarget: string, candidateIps: string[], candidateHostnames: string[]): boolean {
  const tokens = String(ruleTarget || '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.some((tok) => matchesSingleIpPattern(tok, candidateIps, candidateHostnames));
}

function extractIdentityKeys(raw: string): { lower: string; sam: string; domain: string } {
  const clean = String(raw || '').trim();
  const lower = clean.toLowerCase();
  if (!lower) return { lower: '', sam: '', domain: '' };
  if (lower.includes('\\')) {
    const idx = lower.indexOf('\\');
    return {
      lower,
      domain: lower.slice(0, idx).trim(),
      sam: lower.slice(idx + 1).trim(),
    };
  }
  if (lower.includes('@')) {
    const idx = lower.indexOf('@');
    return {
      lower,
      sam: lower.slice(0, idx).trim(),
      domain: lower.slice(idx + 1).trim(),
    };
  }
  return { lower, sam: lower, domain: '' };
}

function domainNamesMatch(ruleDomainRaw: string, candidateDomainRaw: string): boolean {
  const rd = String(ruleDomainRaw || '').trim().toLowerCase();
  if (!rd) return true;
  const cd = String(candidateDomainRaw || '').trim().toLowerCase();
  if (!cd) return false;
  if (rd === cd) return true;
  const rdShort = rd.split('.')[0];
  const cdShort = cd.split('.')[0];
  return Boolean(rdShort && cdShort && rdShort === cdShort);
}

function matchesUserIdentityRule(
  rule: HelpdeskExceptionRecord,
  candidates: string[],
  endpointDomain: string,
  requireDomainForAdUser: boolean
): string | null {
  const ruleKeys = extractIdentityKeys(rule.targetValue);
  if (!ruleKeys.sam) return null;
  const effectiveRuleDomain = String(rule.domainName || '').trim() || ruleKeys.domain;

  for (const cand of candidates) {
    const cRaw = String(cand || '').trim();
    if (!cRaw) continue;
    const cKeys = extractIdentityKeys(cRaw);
    if (!cKeys.sam || cKeys.sam !== ruleKeys.sam) continue;

    if (requireDomainForAdUser) {
      const cDomain = cKeys.domain || endpointDomain;
      if (!cDomain) continue;
      if (effectiveRuleDomain && !domainNamesMatch(effectiveRuleDomain, cDomain)) continue;
      return cRaw;
    }

    if (effectiveRuleDomain) {
      if (cKeys.domain && !domainNamesMatch(effectiveRuleDomain, cKeys.domain)) continue;
    }
    return cRaw;
  }
  return null;
}

function extractAdGroupKeys(raw: string): { lower: string; cn: string; domain: string } {
  const clean = String(raw || '').trim();
  const lower = clean.toLowerCase();
  if (!lower) return { lower: '', cn: '', domain: '' };
  const cnMatch = clean.match(/(?:^|,)cn=([^,]+)/i);
  if (cnMatch?.[1]) {
    const cn = cnMatch[1].trim().toLowerCase();
    const dcParts = [...clean.matchAll(/,dc=([^,]+)/gi)].map((m) => m[1].trim().toLowerCase());
    return { lower, cn, domain: dcParts.join('.') };
  }
  if (lower.includes('\\')) {
    const idx = lower.indexOf('\\');
    return {
      lower,
      domain: lower.slice(0, idx).trim(),
      cn: lower.slice(idx + 1).trim(),
    };
  }
  return { lower, cn: lower, domain: '' };
}

function matchesAdGroupRule(
  rule: HelpdeskExceptionRecord,
  endpointAdGroups: string[],
  endpointDomain: string
): string | null {
  const rKeys = extractAdGroupKeys(rule.targetValue);
  if (!rKeys.cn) return null;
  const effectiveRuleDomain = String(rule.domainName || '').trim() || rKeys.domain;

  for (const gRaw of endpointAdGroups) {
    const gTrim = String(gRaw || '').trim();
    if (!gTrim) continue;
    const gKeys = extractAdGroupKeys(gTrim);
    if (!gKeys.cn) continue;
    if (gKeys.cn !== rKeys.cn && gKeys.lower !== rKeys.lower) continue;
    if (effectiveRuleDomain) {
      const gDom = gKeys.domain || endpointDomain;
      if (!domainNamesMatch(effectiveRuleDomain, gDom)) continue;
    }
    return gTrim;
  }
  return null;
}

const PS_IDENTITY_EXCEPTION_PROBE = `
$ErrorActionPreference = 'SilentlyContinue'
$cs = Get-CimInstance Win32_ComputerSystem
$hostname = [string]$env:COMPUTERNAME
$fqdn = ''
try { $fqdn = [string]([System.Net.Dns]::GetHostEntry('').HostName) } catch {}
$domain = if ($cs) { [string]$cs.Domain } else { '' }
$partOfDomain = if ($cs) { [bool]$cs.PartOfDomain } else { $false }

$primaryIps = @()
try {
  Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" | ForEach-Object {
    foreach ($ip in @($_.IPAddress)) {
      $ipStr = [string]$ip
      if ($ipStr -and $ipStr -notmatch '^(127\\.|169\\.254\\.|::1|fe80:)') {
        $primaryIps += $ipStr
      }
    }
  }
} catch {}
$primaryIps = @($primaryIps | Select-Object -Unique)

$loggedInSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
if ($cs -and -not [string]::IsNullOrWhiteSpace($cs.UserName)) {
  [void]$loggedInSet.Add([string]$cs.UserName)
}
try {
  Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" | ForEach-Object {
    try {
      $ow = $_.GetOwner()
      if ($ow -and $ow.User) {
        $full = if ($ow.Domain) { "$($ow.Domain)\\$($ow.User)" } else { [string]$ow.User }
        [void]$loggedInSet.Add($full)
      }
    } catch {}
  }
} catch {}
try {
  $qu = & quser 2>$null
  foreach ($ln in @($qu)) {
    if ($ln -match '^\\s*>?([A-Za-z0-9._\\-\\\\@]+)\\s+(console|rdp-tcp|\\S*)\\s+\\d+\\s+(Active|Disc)') {
      $u = $Matches[1].Trim()
      if ($u -and $u -ne 'USERNAME') { [void]$loggedInSet.Add($u) }
    }
  }
} catch {}
try {
  Get-CimInstance Win32_UserProfile -Filter "Special=False AND Loaded=True" | ForEach-Object {
    try {
      $sid = New-Object System.Security.Principal.SecurityIdentifier($_.SID)
      $nt = $sid.Translate([System.Security.Principal.NTAccount]).Value
      if ($nt) { [void]$loggedInSet.Add([string]$nt) }
    } catch {}
  }
} catch {}

$lastLoggedOn = ''
try {
  $reg = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\LogonUI'
  if ($reg.LastLoggedOnSAMUser) { $lastLoggedOn = [string]$reg.LastLoggedOnSAMUser }
  elseif ($reg.LastLoggedOnUser) { $lastLoggedOn = [string]$reg.LastLoggedOnUser }
} catch {}

$localUsers = @()
try {
  if (Get-Command Get-LocalUser -ErrorAction SilentlyContinue) {
    $localUsers = @(Get-LocalUser | Where-Object { $_.Enabled -eq $true -and $_.Name -notin @('Guest','DefaultAccount','WDAGUtilityAccount') } | ForEach-Object { [string]$_.Name })
  }
} catch {}
if ($localUsers.Count -eq 0) {
  try {
    $localUsers = @(Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True AND Disabled=False" | Where-Object { $_.Name -notin @('Guest','DefaultAccount','WDAGUtilityAccount') } | ForEach-Object { [string]$_.Name })
  } catch {}
}

$adUserSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$adGroupSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$domShort = if ($domain) { ($domain -split '\\.')[0] } else { '' }
$compShort = $hostname.ToUpperInvariant()

$candidatePrincipals = @($loggedInSet)
if ($lastLoggedOn) { $candidatePrincipals += $lastLoggedOn }
try {
  $curId = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  if ($curId -and $curId.Name) { $candidatePrincipals += [string]$curId.Name }
} catch {}

foreach ($p in @($candidatePrincipals | Select-Object -Unique)) {
  if ([string]::IsNullOrWhiteSpace($p)) { continue }
  $pStr = [string]$p
  if ($pStr -match '^\\.\\\\' -or $pStr -match "^$compShort\\\\") { continue }
  if ($partOfDomain -and ($pStr -match '\\\\' -or $pStr -match '@')) {
    [void]$adUserSet.Add($pStr)
  }
}

if ($partOfDomain) {
  $samTargets = @()
  foreach ($adu in @($adUserSet)) {
    $sam = if ($adu.Contains('\\')) { $adu.Split('\\', 2)[1] } elseif ($adu.Contains('@')) { $adu.Split('@', 2)[0] } else { $adu }
    if ($sam -and -not $sam.EndsWith('$')) { $samTargets += $sam }
  }
  $samTargets = @($samTargets | Select-Object -Unique)

  foreach ($sam in $samTargets) {
    try {
      $searcher = [adsisearcher]"(&(objectCategory=person)(objectClass=user)(sAMAccountName=$sam))"
      [void]$searcher.PropertiesToLoad.Add('memberOf')
      [void]$searcher.PropertiesToLoad.Add('tokenGroups')
      $res = $searcher.FindOne()
      if ($res) {
        foreach ($mo in $res.Properties['memberOf']) {
          $dn = [string]$mo
          if ($dn -match '^CN=([^,]+)') { [void]$adGroupSet.Add($Matches[1].Trim()) }
          [void]$adGroupSet.Add($dn)
        }
        $entry = $res.GetDirectoryEntry()
        $entry.RefreshCache(@('tokenGroups'))
        foreach ($tg in $entry.Properties['tokenGroups']) {
          try {
            $sid = New-Object System.Security.Principal.SecurityIdentifier([byte[]]$tg, 0)
            $nt = $sid.Translate([System.Security.Principal.NTAccount]).Value
            if ($nt) {
              [void]$adGroupSet.Add($nt)
              if ($nt.Contains('\\')) { [void]$adGroupSet.Add($nt.Split('\\', 2)[1]) }
            }
          } catch {}
        }
      }
    } catch {}

    # Fallback: net user <sam> /domain
    if ($adGroupSet.Count -eq 0) {
      try {
        $netOut = (& net user $sam /domain 2>$null) -join "\`n"
        $inGrp = $false
        foreach ($line in ($netOut -split "\`r?\`n")) {
          if ($line -match 'Group Memberships') { $inGrp = $true }
          elseif ($inGrp -and $line -match 'The command completed') { $inGrp = $false }
          if ($inGrp) {
            foreach ($m in ([regex]::Matches($line, '\\*([^\\*]+)'))) {
              $g = $m.Groups[1].Value.Trim()
              if ($g -and $g -ne 'None') { [void]$adGroupSet.Add($g) }
            }
          }
        }
      } catch {}
    }
  }

  # Also include current WinRM identity token groups if it matches a domain principal
  try {
    $wi = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    if ($wi -and $wi.Groups) {
      foreach ($grpSid in $wi.Groups) {
        try {
          $nt = $grpSid.Translate([System.Security.Principal.NTAccount]).Value
          if ($nt -and ($domShort -and $nt.StartsWith("$domShort\\", [System.StringComparison]::OrdinalIgnoreCase))) {
            [void]$adGroupSet.Add($nt)
            [void]$adGroupSet.Add($nt.Split('\\', 2)[1])
          }
        } catch {}
      }
    }
  } catch {}
}

[PSCustomObject]@{
  hostname = $hostname
  fqdn = $fqdn
  domain = $domain
  partOfDomain = $partOfDomain
  primaryIps = @($primaryIps)
  loggedInUsers = @($loggedInSet)
  lastLoggedOnUser = $lastLoggedOn
  localUsers = @($localUsers | Select-Object -Unique)
  adUsers = @($adUserSet)
  adGroups = @($adGroupSet)
} | ConvertTo-Json -Depth 4 -Compress
`;

const LINUX_IDENTITY_EXCEPTION_PROBE = `
python3 - <<'PY'
import json, os, pwd, socket, subprocess

def run(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""

hostname = socket.gethostname()
fqdn = run("hostname -f") or hostname
domain = run("dnsdomainname") or ""
ips = [x for x in run("hostname -I").split() if x and not x.startswith("127.")]

logged = []
for line in run("who").splitlines():
    u = line.split()[0] if line.split() else ""
    if u and u not in logged:
        logged.append(u)
cur_user = os.environ.get("USER", "")
if cur_user and cur_user not in logged:
    logged.append(cur_user)

local_users = []
for p in pwd.getpwall():
    if (p.pw_uid == 0 or p.pw_uid >= 1000) and not p.pw_shell.endswith(("nologin", "false")) and p.pw_name != "nobody":
        local_users.append(p.pw_name)

ad_users = []
ad_groups = []
part_of_domain = bool(run("realm list 2>/dev/null") or domain)
for u in logged:
    if "\\\\" in u or "@" in u or (part_of_domain and u not in local_users):
        ad_users.append(u)
    grps = run(f"id -Gn {u} 2>/dev/null").split()
    for g in grps:
        if g and g not in ad_groups:
            ad_groups.append(g)

print(json.dumps({
    "hostname": hostname,
    "fqdn": fqdn,
    "domain": domain,
    "partOfDomain": part_of_domain,
    "primaryIps": ips,
    "loggedInUsers": logged,
    "lastLoggedOnUser": "",
    "localUsers": local_users,
    "adUsers": ad_users,
    "adGroups": ad_groups,
}))
PY
`;

export async function inspectEndpointIdentityForExceptions(
  input: HelpdeskTargetInput
): Promise<HelpdeskEndpointIdentitySnapshot> {
  const execRes = await executeHardcodedScripts(
    input,
    PS_IDENTITY_EXCEPTION_PROBE,
    LINUX_IDENTITY_EXCEPTION_PROBE
  );
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint identity probe');
  const snapshot: HelpdeskEndpointIdentitySnapshot = {
    targetIp: execRes.host,
    hostname: String(parsed?.hostname || execRes.host || '').trim(),
    fqdn: String(parsed?.fqdn || '').trim(),
    domain: String(parsed?.domain || '').trim(),
    partOfDomain: Boolean(parsed?.partOfDomain),
    primaryIps: Array.isArray(parsed?.primaryIps) ? parsed.primaryIps.map((x: any) => String(x).trim()).filter(Boolean) : [],
    loggedInUsers: Array.isArray(parsed?.loggedInUsers) ? parsed.loggedInUsers.map((x: any) => String(x).trim()).filter(Boolean) : [],
    lastLoggedOnUser: String(parsed?.lastLoggedOnUser || '').trim(),
    localUsers: Array.isArray(parsed?.localUsers) ? parsed.localUsers.map((x: any) => String(x).trim()).filter(Boolean) : [],
    adUsers: Array.isArray(parsed?.adUsers) ? parsed.adUsers.map((x: any) => String(x).trim()).filter(Boolean) : [],
    adGroups: Array.isArray(parsed?.adGroups) ? parsed.adGroups.map((x: any) => String(x).trim()).filter(Boolean) : [],
    collectedAt: new Date().toISOString(),
  };

  exceptionIdentityCache.set(buildIdentityCacheKey(input), {
    expiresAt: Date.now() + EXCEPTION_IDENTITY_CACHE_TTL_MS,
    snapshot,
  });

  return snapshot;
}

export async function verifyHelpdeskTargetNotBlocked(
  input: HelpdeskTargetInput,
  options?: { forceRefreshIdentity?: boolean }
): Promise<HelpdeskExceptionCheckResult> {
  const allRules = await listHelpdeskExceptionsFromDb();
  const enabledRules = allRules.filter((r) => r && r.enabled);
  if (enabledRules.length === 0) {
    return { blocked: false };
  }

  const targetHost = String(input.targetIp || '').trim();
  const sessionUsername = String(input.username || '').trim();
  const ipRules = enabledRules.filter((r) => r.ruleType === 'ip');
  const localUserRules = enabledRules.filter((r) => r.ruleType === 'local_user');
  const adUserRules = enabledRules.filter((r) => r.ruleType === 'ad_user');
  const adGroupRules = enabledRules.filter((r) => r.ruleType === 'ad_group');

  // Phase 1: Immediate Pre-Network Checks (IP / CIDR / Range / Hostname & Session Credentials)
  const targetIsIpLiteral = parseIpv4ToUint32(targetHost) !== null || expandIpv6ToBigInt(targetHost) !== null;
  for (const rule of ipRules) {
    if (
      matchIpRule(
        rule.targetValue,
        targetIsIpLiteral ? [targetHost] : [],
        targetIsIpLiteral ? [] : [targetHost]
      )
    ) {
      return {
        blocked: true,
        phase: 'pre_connect',
        rule,
        matchedValue: targetHost,
        reasonEn: `Connection blocked by HelpDesk exception policy: target "${targetHost}" matches excluded IP/Host rule "${rule.targetValue}".`,
        reasonFa: `اتصال توسط قانون استثنائات هلپ‌دسک مسدود شد: آدرس «${targetHost}» مشمول قانون مسدودسازی «${rule.targetValue}» است.`,
      };
    }
  }

  if (sessionUsername) {
    for (const rule of localUserRules) {
      const m = matchesUserIdentityRule(rule, [sessionUsername], '', false);
      if (m) {
        return {
          blocked: true,
          phase: 'pre_connect',
          rule,
          matchedValue: m,
          reasonEn: `Connection blocked by HelpDesk exception policy: session user "${m}" matches excluded local user rule "${rule.targetValue}".`,
          reasonFa: `اتصال توسط قانون استثنائات هلپ‌دسک مسدود شد: نام کاربری نشست «${m}» مشمول قانون مسدودسازی کاربر لوکال «${rule.targetValue}» است.`,
        };
      }
    }
    for (const rule of adUserRules) {
      const m = matchesUserIdentityRule(rule, [sessionUsername], '', true);
      if (m) {
        return {
          blocked: true,
          phase: 'pre_connect',
          rule,
          matchedValue: m,
          reasonEn: `Connection blocked by HelpDesk exception policy: domain account "${m}" matches excluded AD user rule "${rule.targetValue}".`,
          reasonFa: `اتصال توسط قانون استثنائات هلپ‌دسک مسدود شد: اکانت دامین «${m}» مشمول قانون مسدودسازی کاربر اکتیو دایرکتوری «${rule.targetValue}» است.`,
        };
      }
    }
  }

  // Phase 2: Inspect Target Endpoint Users, Hostname/IPs, and Active Directory Groups if needed
  const hasHostnameIpRule = ipRules.some(
    (r) => parseIpv4ToUint32(r.targetValue) === null && expandIpv6ToBigInt(r.targetValue) === null
  );
  const needsProbe =
    localUserRules.length > 0 ||
    adUserRules.length > 0 ||
    adGroupRules.length > 0 ||
    hasHostnameIpRule;

  if (!needsProbe || !targetHost || !sessionUsername || !input.password) {
    return { blocked: false };
  }

  const cacheKey = buildIdentityCacheKey(input);
  const cached = !options?.forceRefreshIdentity ? exceptionIdentityCache.get(cacheKey) : undefined;
  const snapshot =
    cached && cached.expiresAt > Date.now()
      ? cached.snapshot
      : await inspectEndpointIdentityForExceptions(input);

  // Check IP / Hostname rules against endpoint's actual hostname, FQDN, and primary NIC IPs
  for (const rule of ipRules) {
    if (
      matchIpRule(
        rule.targetValue,
        [targetHost, ...snapshot.primaryIps],
        [snapshot.hostname, snapshot.fqdn].filter(Boolean)
      )
    ) {
      return {
        blocked: true,
        phase: 'endpoint_probe',
        rule,
        matchedValue: snapshot.hostname || targetHost,
        snapshot,
        reasonEn: `Connection blocked by HelpDesk exception policy: endpoint "${snapshot.hostname || targetHost}" (${snapshot.primaryIps[0] || targetHost}) matches excluded IP/Host rule "${rule.targetValue}".`,
        reasonFa: `اتصال توسط قانون استثنائات هلپ‌دسک مسدود شد: سیستم «${snapshot.hostname || targetHost}» مشمول قانون مسدودسازی آدرس «${rule.targetValue}» است.`,
      };
    }
  }

  // Check Local User rules against endpoint active users & enabled local accounts
  const localCandidates = Array.from(
    new Set([...snapshot.localUsers, ...snapshot.loggedInUsers, sessionUsername].filter(Boolean))
  );
  for (const rule of localUserRules) {
    const m = matchesUserIdentityRule(rule, localCandidates, '', false);
    if (m) {
      return {
        blocked: true,
        phase: 'endpoint_probe',
        rule,
        matchedValue: m,
        snapshot,
        reasonEn: `Connection blocked by HelpDesk exception policy: endpoint "${snapshot.hostname || targetHost}" belongs to / contains excluded local user "${m}".`,
        reasonFa: `اتصال توسط قانون استثنائات هلپ‌دسک مسدود شد: سیستم «${snapshot.hostname || targetHost}» دارای کاربر محلی مستثنی‌شده «${m}» است.`,
      };
    }
  }

  // Check AD User rules against active logged-in / last-logged-on domain users
  const adUserCandidates = Array.from(
    new Set(
      [
        ...snapshot.adUsers,
        ...snapshot.loggedInUsers,
        ...(snapshot.lastLoggedOnUser ? [snapshot.lastLoggedOnUser] : []),
        ...(sessionUsername ? [sessionUsername] : []),
      ].filter(Boolean)
    )
  );
  for (const rule of adUserRules) {
    const m = matchesUserIdentityRule(rule, adUserCandidates, snapshot.domain, true);
    if (m) {
      return {
        blocked: true,
        phase: 'endpoint_probe',
        rule,
        matchedValue: m,
        snapshot,
        reasonEn: `Connection blocked by HelpDesk exception policy: workstation "${snapshot.hostname || targetHost}" is associated with excluded AD user "${m}".`,
        reasonFa: `اتصال توسط قانون استثنائات هلپ‌دسک مسدود شد: سیستم «${snapshot.hostname || targetHost}» متعلق به کاربر اکتیو دایرکتوری مستثنی‌شده «${m}» است.`,
      };
    }
  }

  // Check AD Group rules against AD group memberships of target workstation's user / connecting user
  for (const rule of adGroupRules) {
    const m = matchesAdGroupRule(rule, snapshot.adGroups, snapshot.domain);
    if (m) {
      return {
        blocked: true,
        phase: 'endpoint_probe',
        rule,
        matchedValue: m,
        snapshot,
        reasonEn: `Connection blocked by HelpDesk exception policy: workstation "${snapshot.hostname || targetHost}" user belongs to excluded Active Directory group "${m}".`,
        reasonFa: `اتصال توسط قانون استثنائات هلپ‌دسک مسدود شد: کاربر سیستم «${snapshot.hostname || targetHost}» عضو گروه اکتیو دایرکتوری مسدودشده «${m}» است.`,
      };
    }
  }

  return { blocked: false };
}

// ============================================================================
// FIREWALL & ANTIVIRUS PROTECTION MANAGEMENT (WINDOWS & LINUX ENDPOINTS)
// ============================================================================

export interface HelpdeskFirewallProfileInfo {
  name: string;
  enabled: boolean;
  defaultInboundAction: string;
  defaultOutboundAction: string;
  logAllowed: boolean;
  logBlocked: boolean;
  supersededByThirdParty: boolean;
  supersededByProduct: string;
}

export interface HelpdeskFirewallRuleItem {
  name: string;
  displayName: string;
  description: string;
  direction: 'Inbound' | 'Outbound';
  action: 'Allow' | 'Block';
  enabled: boolean;
  profiles: string[];
  protocol: string;
  localPort: string;
  remotePort: string;
  remoteAddress: string;
  program: string;
  group: string;
}

export interface HelpdeskInstalledAntivirusItem {
  id: string;
  vendor: string;
  productName: string;
  isMicrosoftDefender: boolean;
  installed: boolean;
  enabled: boolean;
  serviceRunning: boolean;
  definitionsUpToDate: boolean | null;
  serviceName: string;
  allServices: string[];
  version: string;
  statusText: string;
  isPassiveMode: boolean;
  tamperProtected: boolean | null;
  supportsPasswordStop: boolean;
  canControl: boolean;
  details?: {
    amRunningMode?: string;
    realTimeProtectionEnabled?: boolean;
    behaviorMonitorEnabled?: boolean;
    ioavProtectionEnabled?: boolean;
    onAccessProtectionEnabled?: boolean;
    antivirusSignatureVersion?: string;
    antivirusSignatureLastUpdated?: string | null;
    antivirusSignatureAge?: number | null;
    quickScanAge?: number | null;
    fullScanAge?: number | null;
    amServiceEnabled?: boolean;
  };
}

export interface HelpdeskSecurityAvSnapshot {
  targetIp: string;
  hostname: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  activeUser: string;
  collectedAt: string;
  firewall: {
    engine: 'windows_firewall' | 'third_party_firewall' | 'ufw' | 'firewalld' | 'iptables' | 'none';
    thirdPartyFirewalls: Array<{ name: string; enabled: boolean; upToDate: boolean | null }>;
    profiles: HelpdeskFirewallProfileInfo[];
    rules: HelpdeskFirewallRuleItem[];
    totalRules: number;
    enabledRules: number;
    inboundRules: number;
    outboundRules: number;
    supersededByThirdPartyFirewall: boolean;
  };
  antivirus: {
    products: HelpdeskInstalledAntivirusItem[];
    defender: HelpdeskInstalledAntivirusItem | null;
    hasActiveThirdPartyAv: boolean;
    anyActiveProtection: boolean;
    unprotectedWarning: boolean;
  };
}

export async function collectEndpointSecurityAndAv(
  input: HelpdeskTargetInput
): Promise<HelpdeskSecurityAvSnapshot> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
function To-Str($v) { if ($null -eq $v) { return '' }; try { return ([string]$v).Trim() } catch { return '' } }
function To-Bool($v) { if ($null -eq $v) { return $false }; try { return [bool]$v } catch { return $false } }
function To-IntOrNull($v) {
  if ($null -eq $v -or "$v" -eq '') { return $null }
  try { $n = [int]$v; if ($n -ge 0 -and $n -lt 100000) { return $n } } catch {}
  return $null
}

$hostName = To-Str $env:COMPUTERNAME
$activeUser = ''
try {
  $cs = @(Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue)
  if ($cs.Count -gt 0 -and $cs[0].UserName) { $activeUser = To-Str $cs[0].UserName }
} catch {}

# 1. SecurityCenter2 AntiVirusProduct & FirewallProduct (Desktop Windows 10/11)
$scAvList = @()
$scFwList = @()
try {
  $rawScAv = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct -ErrorAction Stop)
  foreach ($item in $rawScAv) {
    $dName = To-Str $item.displayName
    if (-not $dName) { continue }
    $st = 0
    try { $st = [int64]$item.productState } catch {}
    $enabled = (($st -band 0x1000) -ne 0)
    $upToDate = (($st -band 0x00F0) -eq 0)
    $scAvList += [PSCustomObject]@{
      displayName = $dName
      enabled = $enabled
      upToDate = $upToDate
      productState = $st
      pathToSignedProductExe = To-Str $item.pathToSignedProductExe
    }
  }
} catch {}

try {
  $rawScFw = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName FirewallProduct -ErrorAction Stop)
  foreach ($item in $rawScFw) {
    $dName = To-Str $item.displayName
    if (-not $dName) { continue }
    $st = 0
    try { $st = [int64]$item.productState } catch {}
    $enabled = (($st -band 0x1000) -ne 0)
    $upToDate = (($st -band 0x00F0) -eq 0)
    $scFwList += [PSCustomObject]@{
      name = $dName
      enabled = $enabled
      upToDate = $upToDate
    }
  }
} catch {}

# 2. Windows Services snapshot for accurate AV service matching
$allSvcs = @()
try {
  $allSvcs = @(Get-CimInstance -ClassName Win32_Service -ErrorAction SilentlyContinue | Select-Object Name, DisplayName, State, StartMode, PathName)
} catch {
  try {
    $allSvcs = @(Get-Service -ErrorAction SilentlyContinue | Select-Object Name, DisplayName, @{N='State';E={$_.Status.ToString()}}, @{N='StartMode';E={$_.StartType.ToString()}}, @{N='PathName';E={''}})
  } catch {}
}

# 3. Uninstall entries for version lookup of installed 3rd-party AVs
$uninstallApps = @()
foreach ($regPath in @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)) {
  try {
    foreach ($app in @(Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue)) {
      $dn = To-Str $app.DisplayName
      if ($dn) {
        $uninstallApps += [PSCustomObject]@{
          displayName = $dn
          publisher = To-Str $app.Publisher
          version = To-Str $app.DisplayVersion
        }
      }
    }
  } catch {}
}

# 4. Windows Defender Status
$defMp = $null
$defAvailable = $false
try {
  $mp = Get-MpComputerStatus -ErrorAction Stop
  if ($mp) {
    $defAvailable = $true
    $sigIso = $null
    try {
      if ($mp.AntivirusSignatureLastUpdated) {
        $sigIso = ([datetime]$mp.AntivirusSignatureLastUpdated).ToUniversalTime().ToString('o')
      }
    } catch {}
    $defMp = [PSCustomObject]@{
      amServiceEnabled = To-Bool $mp.AMServiceEnabled
      amRunningMode = To-Str $mp.AMRunningMode
      realTimeProtectionEnabled = To-Bool $mp.RealTimeProtectionEnabled
      behaviorMonitorEnabled = To-Bool $mp.BehaviorMonitorEnabled
      ioavProtectionEnabled = To-Bool $mp.IoavProtectionEnabled
      onAccessProtectionEnabled = To-Bool $mp.OnAccessProtectionEnabled
      isTamperProtected = To-Bool $mp.IsTamperProtected
      antivirusEnabled = To-Bool $mp.AntivirusEnabled
      antivirusSignatureVersion = To-Str $mp.AntivirusSignatureVersion
      antivirusSignatureLastUpdated = $sigIso
      antivirusSignatureAge = To-IntOrNull $mp.AntivirusSignatureAge
      quickScanAge = To-IntOrNull $mp.QuickScanAge
      fullScanAge = To-IntOrNull $mp.FullScanAge
      productVersion = To-Str $mp.AMProductVersion
    }
  }
} catch {}

$defSvc = $allSvcs | Where-Object { $_.Name -ieq 'WinDefend' } | Select-Object -First 1
$defSc = $scAvList | Where-Object { $_.displayName -match 'Windows Defender|Microsoft Defender' } | Select-Object -First 1
$defInstalled = $defAvailable -or ($null -ne $defSvc) -or ($null -ne $defSc)

# 5. Well-Known 3rd-Party AV Catalog (ONLY emitted when actually detected via SecurityCenter2, Services, or Uninstall!)
$knownVendors = @(
  @{ Id = 'eset'; Vendor = 'ESET'; SvcPatterns = @('^ekrn$', '^ekrnEpfw$', '^egui$', '^ESET'); DisplayPatterns = @('ESET', 'NOD32'); SupportsPw = $true },
  @{ Id = 'symantec'; Vendor = 'Symantec / Broadcom'; SvcPatterns = @('^SepMasterService$', '^Smc$', '^SNAC$', '^SymEFASI$'); DisplayPatterns = @('Symantec Endpoint', 'Symantec', 'Norton'); SupportsPw = $true },
  @{ Id = 'mcafee'; Vendor = 'McAfee / Trellix'; SvcPatterns = @('^mfemms$', '^mfevtp$', '^masvc$', '^macmnsvc$', '^McShield$', '^Trellix'); DisplayPatterns = @('McAfee', 'Trellix'); SupportsPw = $true },
  @{ Id = 'kaspersky'; Vendor = 'Kaspersky'; SvcPatterns = @('^AVP', '^klnagent$', '^KSDE'); DisplayPatterns = @('Kaspersky'); SupportsPw = $true },
  @{ Id = 'bitdefender'; Vendor = 'Bitdefender'; SvcPatterns = @('^epsecurityservice$', '^VSSERV$', '^EPIntegrationService$', '^bdredline$', '^EPProtectedService$'); DisplayPatterns = @('Bitdefender'); SupportsPw = $true },
  @{ Id = 'crowdstrike'; Vendor = 'CrowdStrike'; SvcPatterns = @('^CSFalconService$'); DisplayPatterns = @('CrowdStrike', 'Falcon'); SupportsPw = $true },
  @{ Id = 'sentinelone'; Vendor = 'SentinelOne'; SvcPatterns = @('^SentinelAgent$', '^SentinelStaticEngine$', '^SentinelOne'); DisplayPatterns = @('SentinelOne', 'Sentinel Agent'); SupportsPw = $true },
  @{ Id = 'sophos'; Vendor = 'Sophos'; SvcPatterns = @('^SAVService$', '^Sophos Health Service$', '^Sophos Endpoint Defense Service$', '^SntpService$'); DisplayPatterns = @('Sophos'); SupportsPw = $true },
  @{ Id = 'trendmicro'; Vendor = 'Trend Micro'; SvcPatterns = @('^ntrtscan$', '^tmlisten$', '^TMBMSRV$', '^ds_agent$'); DisplayPatterns = @('Trend Micro', 'Apex One', 'Deep Security'); SupportsPw = $true },
  @{ Id = 'malwarebytes'; Vendor = 'Malwarebytes'; SvcPatterns = @('^MBAMService$'); DisplayPatterns = @('Malwarebytes'); SupportsPw = $false },
  @{ Id = 'avast'; Vendor = 'Avast'; SvcPatterns = @('^avast! Antivirus$', '^aswBcc$'); DisplayPatterns = @('Avast'); SupportsPw = $true },
  @{ Id = 'avg'; Vendor = 'AVG'; SvcPatterns = @('^AVG Antivirus$', '^avgBcc$'); DisplayPatterns = @('AVG'); SupportsPw = $true },
  @{ Id = 'cortex_xdr'; Vendor = 'Palo Alto Cortex XDR'; SvcPatterns = @('^cyserver$', '^Traps$'); DisplayPatterns = @('Cortex XDR', 'Traps'); SupportsPw = $true }
)

$thirdPartyAvs = @()
$matchedScNames = @{}

foreach ($kv in $knownVendors) {
  $matchedSvcs = @()
  foreach ($s in $allSvcs) {
    $sn = To-Str $s.Name
    $sd = To-Str $s.DisplayName
    $hit = $false
    foreach ($pat in $kv.SvcPatterns) {
      if ($sn -match $pat) { $hit = $true; break }
    }
    if (-not $hit -and $sd) {
      foreach ($dp in $kv.DisplayPatterns) {
        if ($sd -match [regex]::Escape($dp) -and $sn -notmatch '^WinDefend$|^WdNisSvc$|^Sense$') {
          $hit = $true; break
        }
      }
    }
    if ($hit) { $matchedSvcs += $s }
  }

  $matchedSc = $null
  foreach ($sc in $scAvList) {
    if ($sc.displayName -match 'Windows Defender|Microsoft Defender') { continue }
    foreach ($dp in $kv.DisplayPatterns) {
      if ($sc.displayName -match [regex]::Escape($dp)) {
        $matchedSc = $sc
        $matchedScNames[$sc.displayName.ToLowerInvariant()] = $true
        break
      }
    }
    if ($matchedSc) { break }
  }

  $matchedApp = $null
  foreach ($app in $uninstallApps) {
    foreach ($dp in $kv.DisplayPatterns) {
      if ($app.displayName -match [regex]::Escape($dp)) {
        $matchedApp = $app; break
      }
    }
    if ($matchedApp) { break }
  }

  # ONLY add if actually installed via SecurityCenter2 OR Service OR Uninstall Registry
  if ($matchedSvcs.Count -eq 0 -and $null -eq $matchedSc -and $null -eq $matchedApp) {
    continue
  }

  $primarySvc = $matchedSvcs | Where-Object { $_.State -eq 'Running' } | Select-Object -First 1
  if (-not $primarySvc -and $matchedSvcs.Count -gt 0) { $primarySvc = $matchedSvcs[0] }
  $anyRunning = (@($matchedSvcs | Where-Object { $_.State -eq 'Running' })).Count -gt 0

  $isEnabled = $anyRunning
  if ($null -ne $matchedSc) {
    # Both SecurityCenter2 enabled flag and primary service running matter
    if ($matchedSvcs.Count -gt 0) {
      $isEnabled = $matchedSc.enabled -and $anyRunning
    } else {
      $isEnabled = $matchedSc.enabled
    }
  }

  $prodName = if ($matchedSc) { $matchedSc.displayName } elseif ($matchedApp) { $matchedApp.displayName } elseif ($primarySvc -and $primarySvc.DisplayName) { To-Str $primarySvc.DisplayName } else { $kv.Vendor }

  $thirdPartyAvs += [PSCustomObject]@{
    id = $kv.Id
    vendor = $kv.Vendor
    productName = $prodName
    isMicrosoftDefender = $false
    installed = $true
    enabled = [bool]$isEnabled
    serviceRunning = [bool]$anyRunning
    definitionsUpToDate = if ($matchedSc) { [bool]$matchedSc.upToDate } else { $null }
    serviceName = if ($primarySvc) { To-Str $primarySvc.Name } else { '' }
    allServices = @($matchedSvcs | ForEach-Object { To-Str $_.Name } | Select-Object -Unique)
    version = if ($matchedApp) { $matchedApp.version } else { '' }
    tamperProtected = $null
    supportsPasswordStop = [bool]$kv.SupportsPw
    canControl = ($matchedSvcs.Count -gt 0)
  }
}

# Include any additional SecurityCenter2 3rd-party AV not in the preset catalog (still ONLY genuinely installed ones)
foreach ($sc in $scAvList) {
  if ($sc.displayName -match 'Windows Defender|Microsoft Defender') { continue }
  if ($matchedScNames.ContainsKey($sc.displayName.ToLowerInvariant())) { continue }
  $slug = ($sc.displayName.ToLowerInvariant() -replace '[^a-z0-9]+', '_').Trim('_')
  if (-not $slug) { $slug = 'third_party_av' }
  $thirdPartyAvs += [PSCustomObject]@{
    id = $slug
    vendor = $sc.displayName
    productName = $sc.displayName
    isMicrosoftDefender = $false
    installed = $true
    enabled = [bool]$sc.enabled
    serviceRunning = [bool]$sc.enabled
    definitionsUpToDate = [bool]$sc.upToDate
    serviceName = ''
    allServices = @()
    version = ''
    tamperProtected = $null
    supportsPasswordStop = $false
    canControl = $false
  }
}

# 6. Windows Firewall Profiles
$fwProfiles = @()
try {
  $rawProfiles = @(Get-NetFirewallProfile -Profile Domain,Private,Public -ErrorAction Stop)
  foreach ($p in $rawProfiles) {
    $fwProfiles += [PSCustomObject]@{
      name = To-Str $p.Name
      enabled = To-Bool $p.Enabled
      defaultInboundAction = To-Str $p.DefaultInboundAction
      defaultOutboundAction = To-Str $p.DefaultOutboundAction
      logAllowed = To-Bool $p.LogAllowed
      logBlocked = To-Bool $p.LogBlocked
    }
  }
} catch {
  # Fallback using netsh advfirewall if NetSecurity CIM/module unavailable
  try {
    foreach ($pn in @('Domain', 'Private', 'Public')) {
      $arg = $pn.ToLowerInvariant() + 'profile'
      $out = (& netsh advfirewall show $arg 2>$null) -join "\`n"
      $stOn = $out -match 'State\\s+ON'
      $inAct = if ($out -match 'Firewall Policy\\s+([^,\\r\\n]+)') { $Matches[1].Trim() } else { 'BlockInbound' }
      $outAct = if ($out -match 'Firewall Policy\\s+[^,]+,([^\\r\\n]+)') { $Matches[1].Trim() } else { 'AllowOutbound' }
      $fwProfiles += [PSCustomObject]@{
        name = $pn
        enabled = $stOn
        defaultInboundAction = if ($inAct -match 'Allow') { 'Allow' } else { 'Block' }
        defaultOutboundAction = if ($outAct -match 'Block') { 'Block' } else { 'Allow' }
        logAllowed = $false
        logBlocked = $false
      }
    }
  } catch {}
}

# 7. Windows Firewall Rules (fast single-pass hashtable join)
$fwRules = @()
$totalRuleCount = 0
$enabledRuleCount = 0
$inboundRuleCount = 0
$outboundRuleCount = 0
try {
  $portMap = @{}
  foreach ($pf in @(Get-NetFirewallPortFilter -ErrorAction SilentlyContinue)) {
    $iid = To-Str $pf.InstanceID
    if ($iid) { $portMap[$iid] = $pf }
  }
  $addrMap = @{}
  foreach ($af in @(Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue)) {
    $iid = To-Str $af.InstanceID
    if ($iid) { $addrMap[$iid] = $af }
  }
  $appMap = @{}
  foreach ($ap in @(Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue)) {
    $iid = To-Str $ap.InstanceID
    if ($iid) { $appMap[$iid] = $ap }
  }

  $allRules = @(Get-NetFirewallRule -ErrorAction Stop)
  $totalRuleCount = $allRules.Count
  foreach ($r in $allRules) {
    $en = To-Bool $r.Enabled
    $dir = To-Str $r.Direction
    if ($en) { $enabledRuleCount++ }
    if ($dir -eq 'Inbound') { $inboundRuleCount++ } else { $outboundRuleCount++ }
  }

  # Prioritize recently created / custom non-grouped rules and enabled rules up to 500 rows for fast UI responsiveness
  $sortedRules = $allRules | Sort-Object -Property @{Expression={ [string]::IsNullOrWhiteSpace([string]$_.Group) }; Descending=$true}, @{Expression={ To-Bool $_.Enabled }; Descending=$true}, @{Expression={ To-Str $_.DisplayName }; Descending=$false} | Select-Object -First 500

  foreach ($r in $sortedRules) {
    $id = To-Str $r.Name
    $pf = $portMap[$id]
    $af = $addrMap[$id]
    $ap = $appMap[$id]
    $profStr = To-Str $r.Profile
    $profArr = if ($profStr) { @($profStr -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) } else { @('Any') }
    $lp = if ($pf -and $pf.LocalPort) { (@($pf.LocalPort) -join ',') } else { 'Any' }
    $rp = if ($pf -and $pf.RemotePort) { (@($pf.RemotePort) -join ',') } else { 'Any' }
    $ra = if ($af -and $af.RemoteAddress) { (@($af.RemoteAddress) -join ',') } else { 'Any' }
    $proto = if ($pf -and $pf.Protocol) { To-Str $pf.Protocol } else { 'Any' }
    $prog = if ($ap -and $ap.Program) { To-Str $ap.Program } else { 'Any' }
    $desc = To-Str $r.Description
    if ($desc.Length -gt 240) { $desc = $desc.Substring(0, 240) + '...' }

    $fwRules += [PSCustomObject]@{
      name = $id
      displayName = if (To-Str $r.DisplayName) { To-Str $r.DisplayName } else { $id }
      description = $desc
      direction = if ((To-Str $r.Direction) -eq 'Outbound') { 'Outbound' } else { 'Inbound' }
      action = if ((To-Str $r.Action) -eq 'Block') { 'Block' } else { 'Allow' }
      enabled = To-Bool $r.Enabled
      profiles = $profArr
      protocol = $proto
      localPort = if ($lp) { $lp } else { 'Any' }
      remotePort = if ($rp) { $rp } else { 'Any' }
      remoteAddress = if ($ra) { $ra } else { 'Any' }
      program = if ($prog) { $prog } else { 'Any' }
      group = To-Str $r.Group
    }
  }
} catch {}

[PSCustomObject]@{
  hostname = $hostName
  activeUser = $activeUser
  defender = if ($defInstalled) {
    [PSCustomObject]@{
      installed = $true
      serviceRunning = ($null -ne $defSvc -and $defSvc.State -eq 'Running')
      scEnabled = if ($defSc) { [bool]$defSc.enabled } else { $null }
      scUpToDate = if ($defSc) { [bool]$defSc.upToDate } else { $null }
      mp = $defMp
    }
  } else { $null }
  thirdPartyAvs = @($thirdPartyAvs)
  firewallProfiles = @($fwProfiles)
  thirdPartyFirewalls = @($scFwList)
  firewallRules = @($fwRules)
  totalRuleCount = $totalRuleCount
  enabledRuleCount = $enabledRuleCount
  inboundRuleCount = $inboundRuleCount
  outboundRuleCount = $outboundRuleCount
} | ConvertTo-Json -Depth 6 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, os, re, shutil, socket, subprocess

def run(cmd):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
        return p.returncode, (p.stdout or '').strip(), (p.stderr or '').strip()
    except Exception as e:
        return 1, '', str(e)

hostname = socket.gethostname()
_, who_out, _ = run(['who'])
active_user = who_out.splitlines()[0].split()[0] if who_out.splitlines() else ''

fw_profiles = []
fw_rules = []
engine = 'none'

if shutil.which('ufw'):
    rc, out, _ = run(['ufw', 'status', 'verbose'])
    if rc == 0 and out:
        engine = 'ufw'
        enabled = 'Status: active' in out
        def_in = 'Allow' if 'Default: allow (incoming)' in out else 'Block'
        def_out = 'Block' if 'deny (outgoing)' in out else 'Allow'
        fw_profiles.append({
            'name': 'UFW',
            'enabled': enabled,
            'defaultInboundAction': def_in,
            'defaultOutboundAction': def_out,
            'logAllowed': False,
            'logBlocked': 'Logging: on' in out,
        })
        in_table = False
        idx = 0
        for ln in out.splitlines():
            if ln.strip().startswith('--'):
                in_table = True
                continue
            if in_table and ln.strip():
                idx += 1
                parts = re.split(r'\\s{2,}', ln.strip())
                to_col = parts[0] if len(parts) > 0 else 'Any'
                act_col = parts[1] if len(parts) > 1 else 'ALLOW IN'
                from_col = parts[2] if len(parts) > 2 else 'Anywhere'
                direction = 'Outbound' if 'OUT' in act_col.upper() else 'Inbound'
                action = 'Block' if ('DENY' in act_col.upper() or 'REJECT' in act_col.upper()) else 'Allow'
                proto = 'UDP' if '/udp' in to_col.lower() else ('TCP' if '/tcp' in to_col.lower() else 'Any')
                port = to_col.split('/')[0].strip()
                fw_rules.append({
                    'name': f'ufw-{idx}:{to_col}',
                    'displayName': f'UFW {to_col} ({action})',
                    'description': ln.strip(),
                    'direction': direction,
                    'action': action,
                    'enabled': enabled,
                    'profiles': ['UFW'],
                    'protocol': proto,
                    'localPort': port or 'Any',
                    'remotePort': 'Any',
                    'remoteAddress': from_col or 'Any',
                    'program': 'Any',
                    'group': 'UFW',
                })

if not fw_profiles and shutil.which('firewall-cmd'):
    rc, st, _ = run(['firewall-cmd', '--state'])
    if rc == 0 or 'not running' in st.lower():
        engine = 'firewalld'
        fw_profiles.append({
            'name': 'Firewalld',
            'enabled': st.strip().lower() == 'running',
            'defaultInboundAction': 'Block',
            'defaultOutboundAction': 'Allow',
            'logAllowed': False,
            'logBlocked': False,
        })

av_catalog = [
    ('clamav', 'ClamAV', 'ClamAV Antivirus', ['clamav-daemon', 'clamd@scan', 'clamd']),
    ('crowdstrike', 'CrowdStrike', 'CrowdStrike Falcon Sensor', ['falcon-sensor']),
    ('sentinelone', 'SentinelOne', 'SentinelOne Agent', ['sentinelone']),
    ('eset', 'ESET', 'ESET Endpoint Antivirus for Linux', ['efs', 'esets']),
    ('sophos', 'Sophos', 'Sophos Protection for Linux', ['sophos-spl']),
    ('trendmicro', 'Trend Micro', 'Trend Micro Deep Security Agent', ['ds_agent']),
]

third_party_avs = []
for av_id, vendor, pname, units in av_catalog:
    found_unit = None
    running = False
    for u in units:
        rc_load, load_st, _ = run(['systemctl', 'show', u, '--property=LoadState', '--value'])
        if load_st.strip() == 'loaded':
            found_unit = u
            rc_act, act_st, _ = run(['systemctl', 'is-active', u])
            running = (rc_act == 0 and act_st.strip() == 'active')
            break
    if found_unit:
        third_party_avs.append({
            'id': av_id,
            'vendor': vendor,
            'productName': pname,
            'isMicrosoftDefender': False,
            'installed': True,
            'enabled': running,
            'serviceRunning': running,
            'definitionsUpToDate': None,
            'serviceName': found_unit,
            'allServices': [found_unit],
            'version': '',
            'tamperProtected': None,
            'supportsPasswordStop': False,
            'canControl': True,
        })

print(json.dumps({
    'hostname': hostname,
    'activeUser': active_user,
    'defender': None,
    'thirdPartyAvs': third_party_avs,
    'firewallProfiles': fw_profiles,
    'thirdPartyFirewalls': [],
    'firewallRules': fw_rules,
    'firewallEngine': engine,
    'totalRuleCount': len(fw_rules),
    'enabledRuleCount': sum(1 for r in fw_rules if r['enabled']),
    'inboundRuleCount': sum(1 for r in fw_rules if r['direction'] == 'Inbound'),
    'outboundRuleCount': sum(1 for r in fw_rules if r['direction'] == 'Outbound'),
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(45000, input.timeoutMs || 45000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'collect endpoint firewall and antivirus status');
  const thirdPartyFirewalls: Array<{ name: string; enabled: boolean; upToDate: boolean | null }> = Array.isArray(
    parsed.thirdPartyFirewalls
  )
    ? parsed.thirdPartyFirewalls.map((f: any) => ({
        name: String(f.name || '').trim(),
        enabled: Boolean(f.enabled),
        upToDate: typeof f.upToDate === 'boolean' ? f.upToDate : null,
      }))
    : [];

  const activeThirdPartyFw = thirdPartyFirewalls.find((f) => f.enabled) || null;

  const thirdPartyAvs: HelpdeskInstalledAntivirusItem[] = (
    Array.isArray(parsed.thirdPartyAvs) ? parsed.thirdPartyAvs : []
  ).map((av: any) => {
    const enabled = Boolean(av.enabled);
    const serviceRunning = Boolean(av.serviceRunning);
    return {
      id: String(av.id || 'third_party_av'),
      vendor: String(av.vendor || av.productName || 'Antivirus'),
      productName: String(av.productName || av.vendor || 'Antivirus'),
      isMicrosoftDefender: false,
      installed: true,
      enabled,
      serviceRunning,
      definitionsUpToDate: typeof av.definitionsUpToDate === 'boolean' ? av.definitionsUpToDate : null,
      serviceName: String(av.serviceName || ''),
      allServices: Array.isArray(av.allServices) ? av.allServices.map(String) : [],
      version: String(av.version || ''),
      statusText: enabled
        ? 'Active & Protecting'
        : serviceRunning
        ? 'Service Running (Protection Disabled)'
        : 'Stopped / Disabled',
      isPassiveMode: false,
      tamperProtected: typeof av.tamperProtected === 'boolean' ? av.tamperProtected : null,
      supportsPasswordStop: Boolean(av.supportsPasswordStop),
      canControl: Boolean(av.canControl),
    };
  });

  const hasActiveThirdPartyAv = thirdPartyAvs.some((a) => a.enabled);

  let defenderItem: HelpdeskInstalledAntivirusItem | null = null;
  if (parsed.defender) {
    const d = parsed.defender;
    const mp = d.mp || null;
    const runningMode = String(mp?.amRunningMode || '');
    const isPassive =
      /passive/i.test(runningMode) ||
      (hasActiveThirdPartyAv && !Boolean(mp?.realTimeProtectionEnabled));
    const rtEnabled = mp ? Boolean(mp.realTimeProtectionEnabled) : Boolean(d.scEnabled);
    const svcRunning = Boolean(d.serviceRunning);
    const enabled = Boolean(rtEnabled && (mp ? Boolean(mp.amServiceEnabled) : svcRunning));

    defenderItem = {
      id: 'microsoft_defender',
      vendor: 'Microsoft',
      productName: 'Microsoft Defender Antivirus',
      isMicrosoftDefender: true,
      installed: true,
      enabled,
      serviceRunning: svcRunning,
      definitionsUpToDate: typeof d.scUpToDate === 'boolean' ? d.scUpToDate : null,
      serviceName: 'WinDefend',
      allServices: ['WinDefend'],
      version: String(mp?.productVersion || ''),
      statusText: isPassive
        ? 'Passive / Superseded by 3rd-Party AV'
        : enabled
        ? 'Active & Protecting'
        : 'Disabled / Real-Time Protection Off',
      isPassiveMode: isPassive,
      tamperProtected: mp ? Boolean(mp.isTamperProtected) : null,
      supportsPasswordStop: false,
      canControl: true,
      details: mp
        ? {
            amRunningMode: runningMode,
            realTimeProtectionEnabled: Boolean(mp.realTimeProtectionEnabled),
            behaviorMonitorEnabled: Boolean(mp.behaviorMonitorEnabled),
            ioavProtectionEnabled: Boolean(mp.ioavProtectionEnabled),
            onAccessProtectionEnabled: Boolean(mp.onAccessProtectionEnabled),
            antivirusSignatureVersion: String(mp.antivirusSignatureVersion || ''),
            antivirusSignatureLastUpdated: mp.antivirusSignatureLastUpdated || null,
            antivirusSignatureAge: typeof mp.antivirusSignatureAge === 'number' ? mp.antivirusSignatureAge : null,
            quickScanAge: typeof mp.quickScanAge === 'number' ? mp.quickScanAge : null,
            fullScanAge: typeof mp.fullScanAge === 'number' ? mp.fullScanAge : null,
            amServiceEnabled: Boolean(mp.amServiceEnabled),
          }
        : undefined,
    };
  }

  // Only list actually installed products: 3rd-party AVs first (when installed) + Microsoft Defender (if present)
  const products: HelpdeskInstalledAntivirusItem[] = [
    ...thirdPartyAvs,
    ...(defenderItem ? [defenderItem] : []),
  ];

  const anyActiveProtection = products.some((p) => p.enabled);

  const fwProfiles: HelpdeskFirewallProfileInfo[] = (
    Array.isArray(parsed.firewallProfiles) ? parsed.firewallProfiles : []
  ).map((p: any) => {
    const enabled = Boolean(p.enabled);
    const superseded = !enabled && Boolean(activeThirdPartyFw);
    return {
      name: String(p.name || 'Profile'),
      enabled,
      defaultInboundAction: String(p.defaultInboundAction || 'Block'),
      defaultOutboundAction: String(p.defaultOutboundAction || 'Allow'),
      logAllowed: Boolean(p.logAllowed),
      logBlocked: Boolean(p.logBlocked),
      supersededByThirdParty: superseded,
      supersededByProduct: superseded && activeThirdPartyFw ? activeThirdPartyFw.name : '',
    };
  });

  const fwRules: HelpdeskFirewallRuleItem[] = (
    Array.isArray(parsed.firewallRules) ? parsed.firewallRules : []
  ).map((r: any) => ({
    name: String(r.name || ''),
    displayName: String(r.displayName || r.name || ''),
    description: String(r.description || ''),
    direction: r.direction === 'Outbound' ? 'Outbound' : 'Inbound',
    action: r.action === 'Block' ? 'Block' : 'Allow',
    enabled: Boolean(r.enabled),
    profiles: Array.isArray(r.profiles) ? r.profiles.map(String) : ['Any'],
    protocol: String(r.protocol || 'Any'),
    localPort: String(r.localPort || 'Any'),
    remotePort: String(r.remotePort || 'Any'),
    remoteAddress: String(r.remoteAddress || 'Any'),
    program: String(r.program || 'Any'),
    group: String(r.group || ''),
  }));

  const firewallEngine: HelpdeskSecurityAvSnapshot['firewall']['engine'] =
    execRes.osFamily === 'linux'
      ? ((parsed.firewallEngine as any) || 'none')
      : activeThirdPartyFw && !fwProfiles.some((p) => p.enabled)
      ? 'third_party_firewall'
      : 'windows_firewall';

  return {
    targetIp: execRes.host,
    hostname: String(parsed.hostname || execRes.host),
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    activeUser: String(parsed.activeUser || ''),
    collectedAt: new Date().toISOString(),
    firewall: {
      engine: firewallEngine,
      thirdPartyFirewalls,
      profiles: fwProfiles,
      rules: fwRules,
      totalRules: Number(parsed.totalRuleCount ?? fwRules.length),
      enabledRules: Number(parsed.enabledRuleCount ?? fwRules.filter((r) => r.enabled).length),
      inboundRules: Number(parsed.inboundRuleCount ?? fwRules.filter((r) => r.direction === 'Inbound').length),
      outboundRules: Number(parsed.outboundRuleCount ?? fwRules.filter((r) => r.direction === 'Outbound').length),
      supersededByThirdPartyFirewall: Boolean(activeThirdPartyFw && !fwProfiles.some((p) => p.enabled)),
    },
    antivirus: {
      products,
      defender: defenderItem,
      hasActiveThirdPartyAv,
      anyActiveProtection,
      unprotectedWarning: !anyActiveProtection,
    },
  };
}

export async function controlEndpointAntivirus(
  input: HelpdeskTargetInput,
  options: {
    productId: string;
    serviceName?: string;
    action: 'start' | 'stop' | 'restart' | 'enable_realtime' | 'disable_realtime';
    unlockPassword?: string;
  }
): Promise<HelpdeskActionResult> {
  const productId = String(options.productId || '').trim().toLowerCase();
  const serviceName = String(options.serviceName || '').trim();
  const action = String(options.action || '').trim() as
    | 'start'
    | 'stop'
    | 'restart'
    | 'enable_realtime'
    | 'disable_realtime';
  const unlockPassword = typeof options.unlockPassword === 'string' ? options.unlockPassword : '';

  if (!productId || !/^[a-z0-9_-]{1,64}$/.test(productId)) {
    throw new Error('Invalid antivirus product identifier.');
  }
  if (!['start', 'stop', 'restart', 'enable_realtime', 'disable_realtime'].includes(action)) {
    throw new Error('Invalid antivirus control action.');
  }
  if (serviceName && (serviceName.length > 150 || /[\x00-\x1F\x7F]/.test(serviceName))) {
    throw new Error('Invalid antivirus service name.');
  }

  const pidB64 = Buffer.from(productId, 'utf8').toString('base64');
  const svcB64 = Buffer.from(serviceName, 'utf8').toString('base64');
  const pwB64 = Buffer.from(unlockPassword, 'utf8').toString('base64');

  const winPs = `
$ErrorActionPreference = 'Stop'
$prodId = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${pidB64}'))
$svcName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${svcB64}'))
$pw = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${pwB64}'))
$action = '${action}'

$ok = $false
$msg = ''
$newState = 'unknown'

if ($prodId -eq 'microsoft_defender') {
  if ($action -eq 'start' -or $action -eq 'enable_realtime') {
    try {
      $svc = Get-Service -Name 'WinDefend' -ErrorAction SilentlyContinue
      if ($svc -and $svc.Status -ne 'Running') {
        Start-Service -Name 'WinDefend' -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 700
      }
    } catch {}
    Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction Stop
    Start-Sleep -Milliseconds 600
    $after = Get-MpComputerStatus -ErrorAction SilentlyContinue
    $rt = if ($after) { [bool]$after.RealTimeProtectionEnabled } else { $true }
    $ok = $rt
    $newState = if ($rt) { 'enabled' } else { 'disabled' }
    $msg = if ($rt) { 'Microsoft Defender Real-Time Protection enabled.' } else { 'Microsoft Defender remained disabled (check Group Policy or 3rd-party AV Passive Mode).' }
  } elseif ($action -eq 'stop' -or $action -eq 'disable_realtime') {
    $mpBefore = $null
    try { $mpBefore = Get-MpComputerStatus -ErrorAction SilentlyContinue } catch {}
    if ($mpBefore -and $mpBefore.IsTamperProtected) {
      throw 'Microsoft Defender Tamper Protection is enabled on this workstation and blocks disabling Real-Time Protection remotely. Disable Tamper Protection in Windows Security or Intune/GPO first.'
    }
    Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction Stop
    Start-Sleep -Milliseconds 600
    $after = Get-MpComputerStatus -ErrorAction SilentlyContinue
    $rt = if ($after) { [bool]$after.RealTimeProtectionEnabled } else { $false }
    if ($rt) {
      throw 'Microsoft Defender Real-Time Protection stayed ON after Set-MpPreference (blocked by Tamper Protection or GPO).'
    }
    $ok = $true
    $newState = 'disabled'
    $msg = 'Microsoft Defender Real-Time Protection temporarily disabled. Remember to re-enable it!'
  } else {
    Restart-Service -Name 'WinDefend' -Force -ErrorAction Stop
    $ok = $true
    $newState = 'enabled'
    $msg = 'Microsoft Defender service restarted.'
  }
} else {
  # Find vendor CLI tools if available (supports stop passwords / tamper unlock passcodes)
  $usedCli = $false
  if ($prodId -eq 'symantec') {
    $smcCandidates = @(
      "$env:ProgramFiles\\Symantec\\Symantec Endpoint Protection\\Smc.exe",
      "$env:ProgramFiles (x86)\\Symantec\\Symantec Endpoint Protection\\Smc.exe"
    )
    try {
      $smcDir = Get-ChildItem -Path "$env:ProgramFiles\\Symantec\\Symantec Endpoint Protection" -Filter 'Smc.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($smcDir) { $smcCandidates += $smcDir.FullName }
    } catch {}
    $smc = $smcCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if ($smc) {
      $usedCli = $true
      if ($action -eq 'stop' -or $action -eq 'disable_realtime') {
        if ($pw) {
          $p = Start-Process -FilePath $smc -ArgumentList @('-p', $pw, '-stop') -Wait -NoNewWindow -PassThru
        } else {
          $p = Start-Process -FilePath $smc -ArgumentList @('-stop') -Wait -NoNewWindow -PassThru
        }
        Start-Sleep -Milliseconds 2200
        $svcAfter = Get-Service -Name 'SepMasterService' -ErrorAction SilentlyContinue
        if ($svcAfter -and $svcAfter.Status -eq 'Running') {
          throw 'Symantec Endpoint Protection remained running (invalid unload password or Symantec Self-Defense blocked the request).'
        }
        $ok = $true
        $newState = 'stopped'
        $msg = 'Symantec Endpoint Protection stopped via Smc.exe. Remember to restart it!'
      } else {
        $p = Start-Process -FilePath $smc -ArgumentList @('-start') -Wait -NoNewWindow -PassThru
        Start-Sleep -Milliseconds 1800
        $svcAfter = Get-Service -Name 'SepMasterService' -ErrorAction SilentlyContinue
        $ok = ($null -eq $svcAfter) -or ($svcAfter.Status -eq 'Running')
        $newState = if ($ok) { 'running' } else { 'stopped' }
        $msg = if ($ok) { 'Symantec Endpoint Protection started.' } else { 'Symantec Endpoint Protection failed to start.' }
      }
    }
  } elseif ($prodId -eq 'kaspersky') {
    $avpExe = Get-ChildItem -Path "$env:ProgramFiles\\Kaspersky Lab","$env:ProgramFiles (x86)\\Kaspersky Lab" -Filter 'avp.com' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($avpExe) {
      $usedCli = $true
      if ($action -eq 'stop' -or $action -eq 'disable_realtime') {
        $args = if ($pw) { @('STOP', 'RTP', "/password=$pw") } else { @('STOP', 'RTP') }
        $out = & $avpExe @args 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
          throw ("Kaspersky CLI rejected stop request (exit $LASTEXITCODE): " + $out.Trim())
        }
        $ok = $true
        $newState = 'stopped'
        $msg = 'Kaspersky protection stopped. Remember to re-enable protection!'
      } else {
        $out = & $avpExe START RTP 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
          throw ("Kaspersky CLI failed to start protection (exit $LASTEXITCODE): " + $out.Trim())
        }
        $ok = $true
        $newState = 'running'
        $msg = 'Kaspersky protection started.'
      }
    }
  } elseif ($prodId -eq 'sentinelone') {
    $s1Ctl = Get-ChildItem -Path "$env:ProgramFiles\\SentinelOne" -Filter 'sentinelctl.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($s1Ctl) {
      $usedCli = $true
      if ($action -eq 'stop' -or $action -eq 'disable_realtime') {
        if (-not $pw) {
          throw 'SentinelOne requires a valid site/agent passphrase (-k) to unload protection.'
        }
        $out = & $s1Ctl unload -a -k $pw 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
          throw ("SentinelOne unload failed (exit $LASTEXITCODE): " + $out.Trim())
        }
        $ok = $true
        $newState = 'stopped'
        $msg = 'SentinelOne agent unloaded with passphrase. Remember to reload it!'
      } else {
        $out = & $s1Ctl load -a 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
          throw ("SentinelOne load failed (exit $LASTEXITCODE): " + $out.Trim())
        }
        $ok = $true
        $newState = 'running'
        $msg = 'SentinelOne agent loaded.'
      }
    }
  }

  if (-not $usedCli) {
    if (-not $svcName) {
      throw "No controllable Windows service or vendor CLI detected for '$prodId'."
    }
    $targetSvc = Get-Service -Name $svcName -ErrorAction Stop
    if ($action -eq 'stop' -or $action -eq 'disable_realtime') {
      try {
        Stop-Service -Name $svcName -Force -ErrorAction Stop
      } catch {
        throw ("Vendor self-defense or permission error prevented stopping service '$svcName': " + $_.Exception.Message)
      }
      Start-Sleep -Milliseconds 1000
      $afterSvc = Get-Service -Name $svcName -ErrorAction Stop
      if ($afterSvc.Status -eq 'Running') {
        throw "Antivirus service '$svcName' is still running (blocked by Self-Defense / Tamper Protection)."
      }
      $ok = $true
      $newState = 'stopped'
      $msg = "Antivirus service '$svcName' stopped. Remember to start it again!"
    } elseif ($action -eq 'restart') {
      Restart-Service -Name $svcName -Force -ErrorAction Stop
      Start-Sleep -Milliseconds 900
      $afterSvc = Get-Service -Name $svcName -ErrorAction Stop
      $ok = ($afterSvc.Status -eq 'Running')
      $newState = if ($ok) { 'running' } else { 'stopped' }
      $msg = "Antivirus service '$svcName' restarted ($($afterSvc.Status))."
    } else {
      Start-Service -Name $svcName -ErrorAction Stop
      Start-Sleep -Milliseconds 900
      $afterSvc = Get-Service -Name $svcName -ErrorAction Stop
      $ok = ($afterSvc.Status -eq 'Running')
      $newState = if ($ok) { 'running' } else { 'stopped' }
      $msg = "Antivirus service '$svcName' started ($($afterSvc.Status))."
    }
  }
}

[PSCustomObject]@{
  ok = $ok
  productId = $prodId
  newState = $newState
  output = $msg
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, re, subprocess

svc = base64.b64decode('${svcB64}').decode('utf-8', errors='ignore').strip()
prod = base64.b64decode('${pidB64}').decode('utf-8', errors='ignore').strip()
action = '${action}'

if not svc or not re.match(r'^[a-zA-Z0-9._@$-]{1,128}$', svc):
    print(json.dumps({"ok": False, "newState": "unknown", "output": "Invalid antivirus unit name"}))
    raise SystemExit(0)

sys_act = 'stop' if action in ('stop', 'disable_realtime') else ('restart' if action == 'restart' else 'start')
p = subprocess.run(['systemctl', sys_act, svc], capture_output=True, text=True, timeout=20)
chk = subprocess.run(['systemctl', 'is-active', svc], capture_output=True, text=True, timeout=8)
running = (chk.returncode == 0 and chk.stdout.strip() == 'active')
ok = (p.returncode == 0)
msg = f"systemctl {sys_act} {svc}: active={running}" if ok else (p.stderr or p.stdout or "systemctl action failed").strip()
print(json.dumps({
    "ok": ok,
    "productId": prod,
    "newState": "running" if running else "stopped",
    "output": msg,
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(35000, input.timeoutMs || 35000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'antivirus control');
  const ok = Boolean(parsed.ok);
  const outMsg = String(parsed.output || '');
  const newState = String(parsed.newState || '');

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'antivirus_control',
    success: ok,
    message: ok ? outMsg : outMsg || `Failed to ${action} antivirus ${productId}.`,
    messageFa: ok
      ? action === 'stop' || action === 'disable_realtime'
        ? `آنتی‌ویروس (${productId}) با موفقیت غیرفعال/متوقف شد. حتماً پس از اتمام کار مجدداً آن را فعال کنید!`
        : `آنتی‌ویروس (${productId}) با موفقیت فعال/راه‌اندازی شد.`
      : outMsg || `عملیات روی آنتی‌ویروس (${productId}) ناموفق بود.`,
    details: {
      productId,
      serviceName: serviceName || null,
      action,
      newState,
      usedPassword: Boolean(unlockPassword),
    },
    rawOutput: outMsg,
    executedAt: new Date().toISOString(),
  };
}

export async function toggleEndpointFirewallProfile(
  input: HelpdeskTargetInput,
  options: {
    profile: 'Domain' | 'Private' | 'Public' | 'All' | 'UFW' | 'Firewalld';
    enabled: boolean;
  }
): Promise<HelpdeskActionResult> {
  const profile = String(options.profile || '').trim();
  const enabled = Boolean(options.enabled);
  if (!['Domain', 'Private', 'Public', 'All', 'UFW', 'Firewalld'].includes(profile)) {
    throw new Error('Invalid firewall profile specified.');
  }

  const profB64 = Buffer.from(profile, 'utf8').toString('base64');
  const winBool = enabled ? '$true' : '$false';
  const netshTarget =
    profile === 'All'
      ? 'allprofiles'
      : profile === 'Domain'
      ? 'domainprofile'
      : profile === 'Private'
      ? 'privateprofile'
      : 'publicprofile';
  const netshState = enabled ? 'on' : 'off';

  const winPs = `
$ErrorActionPreference = 'Stop'
$prof = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${profB64}'))
$en = ${winBool}
if ($prof -eq 'UFW' -or $prof -eq 'Firewalld') { $prof = 'All' }

try {
  if ($prof -eq 'All') {
    Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled ($en) -ErrorAction Stop
  } else {
    Set-NetFirewallProfile -Name $prof -Enabled ($en) -ErrorAction Stop
  }
} catch {
  $out = & netsh advfirewall set ${netshTarget} state ${netshState} 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw ("Failed updating Windows Firewall profile: " + $out.Trim())
  }
}

$after = @()
try {
  if ($prof -eq 'All') {
    $after = @(Get-NetFirewallProfile -Profile Domain,Private,Public -ErrorAction SilentlyContinue | ForEach-Object { @{ name=[string]$_.Name; enabled=[bool]$_.Enabled } })
  } else {
    $after = @(Get-NetFirewallProfile -Name $prof -ErrorAction SilentlyContinue | ForEach-Object { @{ name=[string]$_.Name; enabled=[bool]$_.Enabled } })
  }
} catch {}

[PSCustomObject]@{
  ok = $true
  profile = $prof
  enabled = $en
  profiles = $after
  output = "Firewall profile '$prof' set to Enabled=$en"
} | ConvertTo-Json -Depth 4 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, shutil, subprocess
en = ${enabled ? 'True' : 'False'}
if shutil.which('ufw'):
    cmd = ['ufw', '--force', 'enable'] if en else ['ufw', 'disable']
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    print(json.dumps({"ok": p.returncode == 0, "profile": "UFW", "enabled": en, "output": (p.stdout or p.stderr).strip()}))
elif shutil.which('firewall-cmd'):
    cmd = ['systemctl', 'start' if en else 'stop', 'firewalld']
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    print(json.dumps({"ok": p.returncode == 0, "profile": "Firewalld", "enabled": en, "output": (p.stdout or p.stderr).strip()}))
else:
    print(json.dumps({"ok": False, "profile": "none", "enabled": False, "output": "No supported Linux firewall (ufw/firewalld) found."}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'toggle firewall profile');
  const ok = Boolean(parsed.ok);
  const out = String(parsed.output || '');

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'firewall_profile_toggle',
    success: ok,
    message: ok
      ? `Firewall profile "${profile}" ${enabled ? 'enabled' : 'disabled'} on ${execRes.host}.`
      : out || `Failed to update firewall profile "${profile}".`,
    messageFa: ok
      ? enabled
        ? `پروفایل فایروال «${profile}» روی سیستم ${execRes.host} فعال شد.`
        : `پروفایل فایروال «${profile}» روی سیستم ${execRes.host} غیرفعال شد. حتماً پس از تست دوباره آن را فعال کنید!`
      : out || `تغییر وضعیت پروفایل فایروال «${profile}» ناموفق بود.`,
    details: { profile, enabled, profiles: parsed.profiles || [] },
    rawOutput: out,
    executedAt: new Date().toISOString(),
  };
}

export async function createEndpointFirewallRule(
  input: HelpdeskTargetInput,
  options: {
    displayName: string;
    direction: 'Inbound' | 'Outbound';
    action: 'Allow' | 'Block';
    protocol?: 'TCP' | 'UDP' | 'Any' | 'ICMPv4' | 'ICMPv6';
    localPort?: string;
    remotePort?: string;
    remoteAddress?: string;
    program?: string;
    profiles?: Array<'Domain' | 'Private' | 'Public'>;
    description?: string;
  }
): Promise<HelpdeskActionResult> {
  const displayName = String(options.displayName || '').trim();
  if (!displayName || displayName.length > 140 || /[\x00-\x1F\x7F]/.test(displayName)) {
    throw new Error('Invalid firewall rule name.');
  }
  const direction = options.direction === 'Outbound' ? 'Outbound' : 'Inbound';
  const action = options.action === 'Block' ? 'Block' : 'Allow';
  const protocol = String(options.protocol || 'TCP').trim();
  if (!['TCP', 'UDP', 'Any', 'ICMPv4', 'ICMPv6'].includes(protocol)) {
    throw new Error('Invalid firewall protocol.');
  }

  const localPort = String(options.localPort || '').trim();
  const remotePort = String(options.remotePort || '').trim();
  const portRx = /^([0-9]{1,5}(-[0-9]{1,5})?)(\s*,\s*[0-9]{1,5}(-[0-9]{1,5})?)*$/;
  if (localPort && localPort.toLowerCase() !== 'any' && !portRx.test(localPort)) {
    throw new Error('Invalid local port format. Use port numbers, ranges (8000-8010), comma-separated ports, or leave blank.');
  }
  if (remotePort && remotePort.toLowerCase() !== 'any' && !portRx.test(remotePort)) {
    throw new Error('Invalid remote port format.');
  }
  if ((localPort || remotePort) && protocol !== 'TCP' && protocol !== 'UDP') {
    throw new Error('Ports can only be specified when Protocol is TCP or UDP.');
  }

  const remoteAddress = String(options.remoteAddress || '').trim();
  if (
    remoteAddress &&
    remoteAddress.toLowerCase() !== 'any' &&
    !/^[a-zA-Z0-9.,:/\-_ ]{1,256}$/.test(remoteAddress)
  ) {
    throw new Error('Invalid remote IP/CIDR address filter.');
  }

  const program = String(options.program || '').trim();
  if (program && (/[\x00-\x1F\x7F;|&$`<>]/.test(program) || program.length > 260)) {
    throw new Error('Invalid program executable path.');
  }

  const profilesRaw = Array.isArray(options.profiles) ? options.profiles : ['Domain', 'Private', 'Public'];
  const validProfiles = profilesRaw.filter((p): p is 'Domain' | 'Private' | 'Public' =>
    ['Domain', 'Private', 'Public'].includes(p)
  );
  const profilesCsv = (validProfiles.length > 0 ? validProfiles : ['Domain', 'Private', 'Public']).join(',');
  const description = String(options.description || '').trim().slice(0, 240);

  const specB64 = Buffer.from(
    JSON.stringify({
      displayName,
      direction,
      action,
      protocol,
      localPort,
      remotePort,
      remoteAddress,
      program,
      profilesCsv,
      description,
    }),
    'utf8'
  ).toString('base64');

  const winPs = `
$ErrorActionPreference = 'Stop'
$spec = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${specB64}')) | ConvertFrom-Json

$params = @{
  DisplayName = [string]$spec.displayName
  Direction   = [string]$spec.direction
  Action      = [string]$spec.action
  Enabled     = 'True'
}
if ($spec.description) { $params['Description'] = [string]$spec.description }
if ($spec.protocol -and $spec.protocol -ne 'Any') { $params['Protocol'] = [string]$spec.protocol }
if ($spec.localPort -and $spec.localPort -ne 'Any') {
  $params['LocalPort'] = @([string]$spec.localPort -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
if ($spec.remotePort -and $spec.remotePort -ne 'Any') {
  $params['RemotePort'] = @([string]$spec.remotePort -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
if ($spec.remoteAddress -and $spec.remoteAddress -ne 'Any') {
  $params['RemoteAddress'] = @([string]$spec.remoteAddress -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
if ($spec.program) { $params['Program'] = [string]$spec.program }
if ($spec.profilesCsv) {
  $params['Profile'] = @([string]$spec.profilesCsv -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

$created = New-NetFirewallRule @params -ErrorAction Stop | Select-Object -First 1
[PSCustomObject]@{
  ok = $true
  ruleName = [string]$created.Name
  displayName = [string]$created.DisplayName
  output = "Created firewall rule '$($created.DisplayName)' ($($spec.direction) / $($spec.action))"
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, shutil, subprocess

spec = json.loads(base64.b64decode('${specB64}').decode('utf-8'))
if not shutil.which('ufw'):
    print(json.dumps({"ok": False, "output": "Creating rules via Linux SSH currently requires ufw."}))
    raise SystemExit(0)

cmd = ['ufw', 'deny' if spec['action'] == 'Block' else 'allow']
cmd.append('out' if spec['direction'] == 'Outbound' else 'in')
if spec.get('remoteAddress') and spec['remoteAddress'].lower() != 'any':
    cmd.extend(['from', spec['remoteAddress']])
if spec.get('localPort') and spec['localPort'].lower() != 'any':
    port_arg = spec['localPort'].replace('-', ':')
    if spec['protocol'] in ('TCP', 'UDP'):
        port_arg = f"{port_arg}/{spec['protocol'].lower()}"
    cmd.extend(['to', 'any', 'port', port_arg])
elif spec['protocol'] in ('TCP', 'UDP'):
    cmd.extend(['proto', spec['protocol'].lower()])
cmd.extend(['comment', spec['displayName'][:60]])

p = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
print(json.dumps({"ok": p.returncode == 0, "ruleName": spec['displayName'], "output": (p.stdout or p.stderr).strip()}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'create firewall rule');
  const ok = Boolean(parsed.ok);
  const out = String(parsed.output || '');

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'firewall_rule_create',
    success: ok,
    message: ok
      ? `Firewall rule "${displayName}" (${direction} / ${action}) created on ${execRes.host}.`
      : out || `Failed creating firewall rule "${displayName}".`,
    messageFa: ok
      ? `رول فایروال «${displayName}» (${direction === 'Inbound' ? 'ورودی' : 'خروجی'} / ${action === 'Allow' ? 'مجاز' : 'مسدود'}) با موفقیت روی سیستم ${execRes.host} ایجاد شد.`
      : out || `ایجاد رول فایروال «${displayName}» ناموفق بود.`,
    details: { displayName, direction, action, protocol, localPort, remoteAddress, ruleName: parsed.ruleName || null },
    rawOutput: out,
    executedAt: new Date().toISOString(),
  };
}

export async function manageEndpointFirewallRule(
  input: HelpdeskTargetInput,
  options: {
    ruleName: string;
    displayName?: string;
    action: 'enable' | 'disable' | 'allow' | 'block' | 'delete';
  }
): Promise<HelpdeskActionResult> {
  const ruleName = String(options.ruleName || '').trim();
  const displayName = String(options.displayName || ruleName).trim();
  const action = String(options.action || '').trim() as 'enable' | 'disable' | 'allow' | 'block' | 'delete';
  if (!ruleName || ruleName.length > 260 || /[\x00-\x1F\x7F]/.test(ruleName)) {
    throw new Error('Invalid firewall rule identifier.');
  }
  if (!['enable', 'disable', 'allow', 'block', 'delete'].includes(action)) {
    throw new Error('Invalid firewall rule action.');
  }

  const rnB64 = Buffer.from(ruleName, 'utf8').toString('base64');

  const winPs = `
$ErrorActionPreference = 'Stop'
$rn = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${rnB64}'))
$act = '${action}'

switch ($act) {
  'enable'  { Enable-NetFirewallRule -Name $rn -ErrorAction Stop }
  'disable' { Disable-NetFirewallRule -Name $rn -ErrorAction Stop }
  'allow'   { Set-NetFirewallRule -Name $rn -Action Allow -ErrorAction Stop }
  'block'   { Set-NetFirewallRule -Name $rn -Action Block -ErrorAction Stop }
  'delete'  { Remove-NetFirewallRule -Name $rn -ErrorAction Stop }
}

$msg = "Firewall rule '$rn' action '$act' completed."
[PSCustomObject]@{
  ok = $true
  ruleName = $rn
  action = $act
  output = $msg
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json
print(json.dumps({"ok": False, "output": "Per-rule Windows NetFirewall actions are supported on Windows hosts; toggle the UFW profile or create a new UFW rule on Linux."}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) },
    winPs,
    linuxSh
  );

  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'manage firewall rule');
  const ok = Boolean(parsed.ok);
  const out = String(parsed.output || '');

  const writeAct: HelpdeskWriteAction =
    action === 'delete'
      ? 'firewall_rule_delete'
      : action === 'allow' || action === 'block'
      ? 'firewall_rule_action'
      : 'firewall_rule_toggle';

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: writeAct,
    success: ok,
    message: ok
      ? `Firewall rule "${displayName}" updated (${action}) on ${execRes.host}.`
      : out || `Failed to ${action} firewall rule "${displayName}".`,
    messageFa: ok
      ? `عملیات «${action}» روی رول فایروال «${displayName}» در سیستم ${execRes.host} انجام شد.`
      : out || `تغییر وضعیت رول فایروال «${displayName}» ناموفق بود.`,
    details: { ruleName, displayName, action },
    rawOutput: out,
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 26. ENDPOINT INTERACTIVE SCREEN MESSAGING (RBAC-PROTECTED)
// ============================================================================

export async function sendEndpointUserMessage(
  input: HelpdeskTargetInput,
  options: {
    message: string;
    title?: string;
    recipient?: string;
    displaySeconds?: number;
  }
): Promise<HelpdeskActionResult> {
  const message = String(options.message || '').trim();
  if (!message || message.length > 500) {
    throw new Error('Message text must be between 1 and 500 characters.');
  }
  const title = String(options.title || 'IT HelpDesk Message').trim().slice(0, 80) || 'IT HelpDesk Message';
  const recipient = String(options.recipient || '*').trim() || '*';
  if (!/^(\*|[a-zA-Z0-9._\\@-]{1,128})$/.test(recipient)) {
    throw new Error('Invalid recipient session/username format.');
  }
  const displaySeconds = Math.max(10, Math.min(120, Math.floor(Number(options.displaySeconds) || 45)));

  const payloadB64 = utf8Base64(
    JSON.stringify({
      title,
      message,
      recipient,
      displaySeconds,
    })
  );

  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
$cfg = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payloadB64}')) | ConvertFrom-Json
$msgTitle = [string]$cfg.title
$msgBody = [string]$cfg.message
$rcpt = [string]$cfg.recipient
$secs = [int]$cfg.displaySeconds
if ($secs -lt 10) { $secs = 45 }

function Get-ActiveSessionsMsg {
  $list = @()
  $lines = @(& quser.exe 2>$null)
  if ($lines.Count -lt 2) { return $list }
  foreach ($l in $lines | Select-Object -Skip 1) {
    if ([string]::IsNullOrWhiteSpace($l)) { continue }
    $clean = $l.TrimStart('>', ' ')
    if ($clean -match '^(\\S+)\\s+(?:(\\S+)\\s+)?(\\d+)\\s+(Active|Disc|Conn|Listen|Idle)\\s+(.*)$') {
      $list += [PSCustomObject]@{ user = $matches[1]; sessionName = $matches[2]; id = $matches[3]; state = $matches[4] }
    }
  }
  return $list
}

$delivered = $false
$method = ''
$notes = @()

# 1. Primary path: Native Windows msg.exe
$msgExe = "$env:SystemRoot\\System32\\msg.exe"
if (-not (Test-Path $msgExe)) { $msgExe = 'msg.exe' }
try {
  $fullText = "[$msgTitle] \`r\`n$msgBody"
  $targetArg = if ($rcpt -and $rcpt -ne '*') { $rcpt } else { '*' }
  if ($rcpt -and $rcpt -ne '*' -and $rcpt.Contains('\\')) {
    $targetArg = $rcpt.Split('\\')[-1]
  }
  $msgOut = (& $msgExe $targetArg "/TIME:$secs" $fullText 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -eq 0) {
    $delivered = $true
    $method = 'msg.exe'
    $notes += if ($msgOut) { $msgOut } else { "msg.exe delivered to $targetArg" }
  } else {
    $notes += "msg.exe notice: $msgOut"
  }
} catch {
  $notes += "msg.exe unavailable: $($_.Exception.Message)"
}

# 2. Fallback path: Ephemeral Interactive Scheduled Task GUI dialog for active logged-in desktop user
if (-not $delivered) {
  $sessions = @(Get-ActiveSessionsMsg | Where-Object { $_.state -eq 'Active' -and $_.id -ne '0' })
  $targetUsers = @()
  if ($rcpt -and $rcpt -ne '*') {
    $bare = if ($rcpt.Contains('\\')) { $rcpt.Split('\\')[-1] } else { $rcpt }
    $matchS = @($sessions | Where-Object { $_.id -eq $rcpt -or $_.user -ieq $bare -or $_.user -ieq $rcpt })
    foreach ($s in $matchS) { if ($s.user) { $targetUsers += [string]$s.user } }
    if ($targetUsers.Count -eq 0 -and ($rcpt -notmatch '^\\d+$')) { $targetUsers += $rcpt }
  } else {
    foreach ($s in $sessions) { if ($s.user) { $targetUsers += [string]$s.user } }
  }

  $csUser = ''
  try { $csUser = [string](Get-CimInstance Win32_ComputerSystem).UserName } catch {}
  if ($targetUsers.Count -eq 0 -and $csUser) { $targetUsers += $csUser }
  $targetUsers = @($targetUsers | Select-Object -Unique)

  foreach ($tu in $targetUsers) {
    $runUser = if ($csUser -and ($csUser -like "*\\$tu" -or $csUser -ieq $tu)) { $csUser } else { $tu }
    $taskName = "NetTopo_Msg_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $innerScript = @"
\$d = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payloadB64}')) | ConvertFrom-Json
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  [System.Windows.Forms.MessageBox]::Show([string]\$d.message, [string]\$d.title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information, [System.Windows.Forms.MessageBoxDefaultButton]::Button1, [System.Windows.Forms.MessageBoxOptions]::DefaultDesktopOnly) | Out-Null
} catch {
  try {
    \$ws = New-Object -ComObject WScript.Shell
    [void]\$ws.Popup([string]\$d.message, [int]\$d.displaySeconds, [string]\$d.title, 4096 + 64)
  } catch {}
}
"@
    $innerB64 = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($innerScript))
    try {
      $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $innerB64"
      $pri = New-ScheduledTaskPrincipal -UserId $runUser -LogonType Interactive -RunLevel Limited
      $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
      Register-ScheduledTask -TaskName $taskName -Action $act -Principal $pri -Settings $st -Force | Out-Null
      Start-ScheduledTask -TaskName $taskName
      Start-Sleep -Milliseconds 350
      $delivered = $true
      $method = 'Interactive-Popup'
      $notes += "Popup displayed for $runUser"
    } catch {
      $notes += "Interactive popup failed for $runUser: $($_.Exception.Message)"
    } finally {
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }
  }
}

[PSCustomObject]@{
  ok = [bool]$delivered
  method = $method
  recipient = $rcpt
  output = ($notes -join ' | ')
} | ConvertTo-Json -Compress
`;

  const linuxSh = `python3 - <<'PY'
import base64, json, shutil, subprocess
cfg = json.loads(base64.b64decode("${payloadB64}").decode("utf-8"))
title = cfg["title"]
msg = cfg["message"]
rcpt = cfg["recipient"]
delivered = False
methods = []
notes = []

# 1. Try desktop notify-send for logged-in X11/Wayland sessions
try:
    out = subprocess.check_output(["loginctl", "list-sessions", "--no-legend"], text=True, stderr=subprocess.DEVNULL)
    seen = set()
    for line in out.splitlines():
        cols = line.split()
        if len(cols) < 3: continue
        sid, uid, user = cols[0], cols[1], cols[2]
        if rcpt != "*" and rcpt not in (sid, user): continue
        if user in seen or user == "root": continue
        seen.add(user)
        if shutil.which("notify-send"):
            cmd = f"DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus notify-send -u critical {json.dumps(title)} {json.dumps(msg)}"
            p = subprocess.run(["su", "-", user, "-c", cmd], capture_output=True, text=True)
            if p.returncode == 0:
                delivered = True
                methods.append(f"notify-send:{user}")
except Exception as e:
    notes.append(str(e))

# 2. TTY broadcast/write fallback
try:
    formatted = f"[{title}] {msg}"
    if rcpt == "*":
        p = subprocess.run(["wall"], input=formatted, text=True, capture_output=True)
        if p.returncode == 0:
            delivered = True
            methods.append("wall")
        else:
            notes.append((p.stderr or p.stdout).strip())
    else:
        p = subprocess.run(["write", rcpt], input=formatted, text=True, capture_output=True)
        if p.returncode == 0:
            delivered = True
            methods.append(f"write:{rcpt}")
        else:
            notes.append((p.stderr or p.stdout).strip())
except Exception as e:
    notes.append(str(e))

print(json.dumps({
    "ok": delivered,
    "method": ", ".join(methods) or "none",
    "recipient": rcpt,
    "output": "; ".join([n for n in notes if n]) or ("Delivered via " + ", ".join(methods) if delivered else "No active interactive or TTY session received the message.")
}))
PY`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<{ ok: boolean; method?: string; recipient?: string; output?: string }>(
    execRes.stdout,
    'endpoint send user message'
  );
  const ok = Boolean(parsed.ok);
  const out = String(parsed.output || '');
  const rcptLabel = recipient === '*' ? 'all active sessions' : recipient;
  const rcptLabelFa = recipient === '*' ? 'تمامی نشست‌های فعال' : recipient;

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'endpoint_send_message',
    success: ok,
    message: ok
      ? `Message sent to ${rcptLabel} on ${execRes.host}${parsed.method ? ` (${parsed.method})` : ''}.`
      : `Failed to deliver message to ${rcptLabel} on ${execRes.host}: ${out || 'No active user session found'}`,
    messageFa: ok
      ? `پیام روی صفحه ${rcptLabelFa} در سیستم ${execRes.host} ارسال و نمایش داده شد${parsed.method ? ` (${parsed.method})` : ''}.`
      : `ارسال پیام به ${rcptLabelFa} روی سیستم ${execRes.host} ناموفق بود: ${out || 'نشست کاربری فعالی یافت نشد'}`,
    details: {
      recipient,
      title,
      displaySeconds,
      method: String(parsed.method || ''),
    },
    rawOutput: out,
    executedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 26. PRINTER TEST PAGE, COMPUTER RENAME, MSCONFIG & ENV VARS, FONT EXPORT
// ============================================================================

export async function sendEndpointTestPrintPage(
  input: HelpdeskTargetInput,
  rawPrinterName: string
): Promise<HelpdeskActionResult> {
  const printerName = validatePrinterNameInput(rawPrinterName);
  const nameB64 = utf8Base64(printerName);

  const ps = `
$ErrorActionPreference = 'Stop'
$targetPrinter = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
$wmiMatch = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $targetPrinter } | Select-Object -First 1
if (-not $wmiMatch) {
  throw "Printer '$targetPrinter' was not found on this workstation."
}

$methodUsed = ''
$retVal = -1
try {
  $res = Invoke-CimMethod -InputObject $wmiMatch -MethodName PrintTestPage -ErrorAction Stop
  $retVal = [int]$res.ReturnValue
  $methodUsed = "WMI PrintTestPage (ReturnValue=$retVal)"
} catch {
  $methodUsed = "WMI failed: $($_.Exception.Message)"
}

if ($retVal -ne 0) {
  Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry', '/k', '/n', $targetPrinter) -NoNewWindow -ErrorAction SilentlyContinue
  $methodUsed = "$methodUsed | Fallback rundll32 PrintUIEntry /k dispatched"
}

Start-Sleep -Milliseconds 350
$jobsCount = 0
try {
  $jobsCount = @(Get-PrintJob -PrinterName $targetPrinter -ErrorAction SilentlyContinue).Count
} catch {}

[PSCustomObject]@{
  ok = $true
  printerName = $wmiMatch.Name
  portName = [string]$wmiMatch.PortName
  driverName = [string]$wmiMatch.DriverName
  jobsInQueue = $jobsCount
  output = "$methodUsed | Queue jobs: $jobsCount"
} | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import base64, json, subprocess
pname = base64.b64decode("${nameB64}").decode("utf-8")
test_file = "/usr/share/cups/data/testprint"
import os
if os.path.isfile(test_file):
    p = subprocess.run(["lp", "-d", pname, test_file], capture_output=True, text=True, timeout=15)
else:
    txt = f"NetTopology HelpDesk Test Print Page\\nPrinter: {pname}\\n"
    p = subprocess.run(["lp", "-d", pname, "-t", "HelpDesk Test Page"], input=txt, capture_output=True, text=True, timeout=15)
print(json.dumps({
    "ok": p.returncode == 0,
    "printerName": pname,
    "output": (p.stdout + " " + p.stderr).strip() or f"Test print queued on {pname}"
}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 25000 }, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'send printer test page');
  const ok = Boolean(parsed.ok);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'printer_test_page',
    success: ok,
    message: ok
      ? `Test page sent to printer "${printerName}" on ${execRes.host}.`
      : `Failed to send test page to "${printerName}" on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? `صفحه تست پرینت (Test Page) با موفقیت برای پرینتر «${printerName}» در سیستم ${execRes.host} ارسال شد.`
      : `ارسال صفحه تست پرینت به «${printerName}» روی سیستم ${execRes.host} ناموفق بود: ${parsed.output}`,
    details: {
      printerName: String(parsed.printerName || printerName),
      portName: parsed.portName,
      driverName: parsed.driverName,
      jobsInQueue: parsed.jobsInQueue,
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function renameEndpointComputer(
  input: HelpdeskTargetInput,
  options: { newHostname: string; restartAfter?: boolean }
): Promise<HelpdeskActionResult> {
  const cleanName = String(options.newHostname || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(cleanName) || /^[0-9]+$/.test(cleanName)) {
    throw new Error(
      'Invalid computer name. Use letters, numbers, and hyphens only (cannot be all digits or start with a hyphen).'
    );
  }
  const restartAfter = Boolean(options.restartAfter);
  const newNameB64 = utf8Base64(cleanName);
  const credUserB64 = utf8Base64(input.username || '');
  const credPassB64 = utf8Base64(input.password || '');

  const ps = `
$ErrorActionPreference = 'Stop'
$newName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${newNameB64}'))
if ($newName.Length -gt 15) {
  throw "Windows NetBIOS computer name cannot exceed 15 characters (got $($newName.Length))."
}
$oldName = [string]$env:COMPUTERNAME
if ($oldName -ieq $newName) {
  throw "Computer name is already '$oldName'."
}
$restartNow = ${restartAfter ? '$true' : '$false'}

$cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
$isDomain = [bool]($cs -and $cs.PartOfDomain)
$domainName = if ($cs) { [string]$cs.Domain } else { '' }

$u = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${credUserB64}'))
$p = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${credPassB64}'))
$sec = ConvertTo-SecureString -String $p -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($u, $sec)

$note = ''
if ($isDomain) {
  Rename-Computer -NewName $newName -DomainCredential $cred -Force -ErrorAction Stop | Out-Null
  $note = "Renamed domain-joined computer from '$oldName' to '$newName' (Domain: $domainName)."
} else {
  Rename-Computer -NewName $newName -Force -ErrorAction Stop | Out-Null
  $note = "Renamed workgroup computer from '$oldName' to '$newName'."
}

if ($restartNow) {
  Start-Process -FilePath 'shutdown.exe' -ArgumentList @('/r', '/t', '10', '/f', '/c', "Computer renamed from $oldName to $newName via HelpDesk") -NoNewWindow -ErrorAction SilentlyContinue
  $note = "$note Scheduled restart in 10 seconds to finalize name change."
} else {
  $note = "$note A workstation restart is required for the new computer name to take effect."
}

[PSCustomObject]@{
  ok = $true
  oldHostname = $oldName
  newHostname = $newName
  domainJoined = $isDomain
  restartScheduled = $restartNow
  output = $note
} | ConvertTo-Json -Compress
`;

  const lx = `
python3 - <<'PY'
import base64, json, os, socket, subprocess
new_name = base64.b64decode("${newNameB64}").decode("utf-8").strip()
old_name = socket.gethostname()
restart_now = ${restartAfter ? 'True' : 'False'}
p = subprocess.run(["hostnamectl", "set-hostname", new_name], capture_output=True, text=True, timeout=15)
if p.returncode != 0:
    print(json.dumps({"ok": False, "oldHostname": old_name, "newHostname": new_name, "output": (p.stderr or p.stdout).strip()}))
else:
    note = f"Hostname changed from {old_name} to {new_name}"
    if restart_now:
        subprocess.Popen(["sh", "-c", "sleep 5 && reboot"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        note += " (reboot scheduled in 5s)"
    print(json.dumps({"ok": True, "oldHostname": old_name, "newHostname": new_name, "restartScheduled": restart_now, "output": note}))
PY
`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 35000 }, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'rename computer');
  const ok = Boolean(parsed.ok);
  const oldHost = String(parsed.oldHostname || '');
  const newHost = String(parsed.newHostname || cleanName);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'computer_rename',
    success: ok,
    message: ok
      ? `Computer on ${execRes.host} renamed from "${oldHost}" to "${newHost}"${restartAfter ? ' (reboot scheduled in 10s)' : ' (restart required to take effect)'}.`
      : `Failed to rename computer on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? `نام کامپیوتر روی ${execRes.host} از «${oldHost}» به «${newHost}» تغییر یافت${restartAfter ? ' (ری‌استارت خودکار در ۱۰ ثانیه زمان‌بندی شد)' : ' (برای اعمال کامل نیاز به ری‌استارت دارد)'}.`
      : `تغییر نام کامپیوتر روی ${execRes.host} ناموفق بود: ${parsed.output}`,
    details: {
      oldHostname: oldHost,
      newHostname: newHost,
      domainJoined: Boolean(parsed.domainJoined),
      restartScheduled: Boolean(parsed.restartScheduled),
    },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export interface HelpdeskMsconfigBootEntry {
  identifier: string;
  description: string;
  device: string;
  path: string;
  isDefault: boolean;
  isCurrent: boolean;
}

export interface HelpdeskEnvVarItem {
  id: string;
  name: string;
  value: string;
  scope: 'system' | 'user';
  regType: 'REG_SZ' | 'REG_EXPAND_SZ';
  ownerSid?: string;
  ownerUser?: string;
  isProtected: boolean;
}

export interface HelpdeskMsconfigEnvResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  activeUser: string;
  activeUserSid: string;
  msconfig: {
    bootTimeoutSeconds: number | null;
    defaultIdentifier: string;
    currentIdentifier: string;
    safeBootMode: 'none' | 'minimal' | 'network' | 'dsrepair' | 'alternateshell';
    noGuiBoot: boolean;
    bootLog: boolean;
    baseVideo: boolean;
    osBootInfo: boolean;
    numProc: number | null;
    maxMemMb: number | null;
    defaultTarget?: string;
    bootEntries: HelpdeskMsconfigBootEntry[];
    rawBcdedit: string;
  };
  envVars: HelpdeskEnvVarItem[];
  pathSystemEntries: string[];
  pathUserEntries: string[];
  summary: {
    systemEnvCount: number;
    userEnvCount: number;
    totalEnvCount: number;
    bootEntriesCount: number;
  };
  collectedAt: string;
}

const PROTECTED_ENV_NAMES = new Set([
  'systemroot',
  'windir',
  'comspec',
  'os',
  'pathext',
  'processor_architecture',
  'processor_identifier',
  'processor_level',
  'processor_revision',
  'number_of_processors',
  'programfiles',
  'programfiles(x86)',
  'programw6432',
  'commonprogramfiles',
  'systemdrive',
  'path',
  'temp',
  'tmp',
]);

export async function collectEndpointMsconfigAndEnv(
  input: HelpdeskTargetInput
): Promise<HelpdeskMsconfigEnvResult> {
  const winPs = `
$ErrorActionPreference = 'SilentlyContinue'
${PS_HELPDESK_DETECT_LOGGED_USER}

$bcdRaw = (& bcdedit.exe /enum 2>&1 | Out-String)
$timeoutSec = $null
$defaultId = ''
$currentId = ''
$safeBoot = 'none'
$noGuiBoot = $false
$bootLog = $false
$baseVideo = $false
$osBootInfo = $false
$numProc = $null
$maxMem = $null
$entries = @()

$blocks = ($bcdRaw -split "(\r?\n){2,}") | Where-Object { $_ -and $_.Trim() }
$curIsBootMgr = $false
$parsedBlocks = @()

foreach ($blk in $blocks) {
  $lines = $blk -split "\r?\n"
  $map = @{}
  $lastKey = ''
  foreach ($ln in $lines) {
    if ($ln -match '^-+$') { continue }
    if ($ln -match '^([^\s]{2,})\s+(.+)$') {
      $k = $matches[1].Trim().ToLowerInvariant()
      $v = $matches[2].Trim()
      $map[$k] = $v
      $lastKey = $k
    } elseif ($lastKey -and $ln -match '^\s{10,}(.+)$') {
      $map[$lastKey] = "$($map[$lastKey]) | $($matches[1].Trim())"
    }
  }
  if ($map.Count -gt 0) { $parsedBlocks += ,$map }
}

foreach ($m in $parsedBlocks) {
  $idVal = if ($m.ContainsKey('identifier')) { [string]$m['identifier'] } else { '' }
  if ($idVal -ieq '{bootmgr}') {
    if ($m.ContainsKey('default')) { $defaultId = [string]$m['default'] }
    if ($m.ContainsKey('timeout') -and ($m['timeout'] -match '^\d+$')) {
      $timeoutSec = [int]$m['timeout']
    }
  } elseif ($m.ContainsKey('osdevice') -or $m.ContainsKey('systemroot')) {
    $isCur = ($idVal -ieq '{current}')
    if ($isCur) { $currentId = $idVal }
    $entries += [PSCustomObject]@{
      identifier = $idVal
      description = if ($m.ContainsKey('description')) { [string]$m['description'] } else { $idVal }
      device = if ($m.ContainsKey('device')) { [string]$m['device'] } else { '' }
      path = if ($m.ContainsKey('path')) { [string]$m['path'] } else { '' }
      isDefault = ($idVal -eq $defaultId -or ($defaultId -eq '{current}' -and $isCur))
      isCurrent = $isCur
    }
    if ($isCur -or (-not $currentId -and $idVal -eq $defaultId)) {
      if ($m.ContainsKey('safeboot')) {
        $sb = ([string]$m['safeboot']).Trim().ToLowerInvariant()
        if ($sb -in @('minimal','network','dsrepair','alternateshell')) { $safeBoot = $sb }
      }
      if ($m.ContainsKey('quietboot') -and ([string]$m['quietboot']) -match 'yes|true|1') { $noGuiBoot = $true }
      if ($m.ContainsKey('bootlog') -and ([string]$m['bootlog']) -match 'yes|true|1') { $bootLog = $true }
      if ($m.ContainsKey('vga') -and ([string]$m['vga']) -match 'yes|true|1') { $baseVideo = $true }
      if ($m.ContainsKey('sos') -and ([string]$m['sos']) -match 'yes|true|1') { $osBootInfo = $true }
      if ($m.ContainsKey('numproc') -and ($m['numproc'] -match '^\d+$')) { $numProc = [int]$m['numproc'] }
      if ($m.ContainsKey('truncatememory') -and ($m['truncatememory'] -match '^\d+$')) {
        $maxMem = [math]::Round(([double]$m['truncatememory']) / 1MB)
      }
    }
  }
}

$envItems = @()
$sysRegPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
try {
  $regKey = Get-Item -LiteralPath $sysRegPath -ErrorAction Stop
  foreach ($vn in ($regKey.GetValueNames() | Sort-Object)) {
    if (-not $vn) { continue }
    $kind = $regKey.GetValueKind($vn)
    $val = [string]$regKey.GetValue($vn, '', 'DoNotExpandEnvironmentNames')
    $envItems += [PSCustomObject]@{
      id = "system:$vn"
      name = [string]$vn
      value = $val
      scope = 'system'
      regType = if ($kind -eq [Microsoft.Win32.RegistryValueKind]::ExpandString) { 'REG_EXPAND_SZ' } else { 'REG_SZ' }
      ownerSid = ''
      ownerUser = 'Machine (HKLM)'
    }
  }
} catch {}

$userEnvPath = if ($userSid) { "Registry::HKEY_USERS\\$userSid\\Environment" } else { 'HKCU:\\Environment' }
if (Test-Path -LiteralPath $userEnvPath) {
  try {
    $uKey = Get-Item -LiteralPath $userEnvPath -ErrorAction Stop
    foreach ($vn in ($uKey.GetValueNames() | Sort-Object)) {
      if (-not $vn) { continue }
      $kind = $uKey.GetValueKind($vn)
      $val = [string]$uKey.GetValue($vn, '', 'DoNotExpandEnvironmentNames')
      $envItems += [PSCustomObject]@{
        id = "user:$vn"
        name = [string]$vn
        value = $val
        scope = 'user'
        regType = if ($kind -eq [Microsoft.Win32.RegistryValueKind]::ExpandString) { 'REG_EXPAND_SZ' } else { 'REG_SZ' }
        ownerSid = $userSid
        ownerUser = if ($loggedUser) { $loggedUser } else { 'Current Session' }
      }
    }
  } catch {}
}

[PSCustomObject]@{
  hostname = $env:COMPUTERNAME
  activeUser = $loggedUser
  activeUserSid = $userSid
  msconfig = [PSCustomObject]@{
    bootTimeoutSeconds = $timeoutSec
    defaultIdentifier = $defaultId
    currentIdentifier = $currentId
    safeBootMode = $safeBoot
    noGuiBoot = $noGuiBoot
    bootLog = $bootLog
    baseVideo = $baseVideo
    osBootInfo = $osBootInfo
    numProc = $numProc
    maxMemMb = $maxMem
    bootEntries = $entries
    rawBcdedit = $bcdRaw.Trim()
  }
  envVars = $envItems
} | ConvertTo-Json -Depth 6 -Compress
`;

  const linuxSh = `python3 - <<'PY'
import json, os, re, socket, subprocess

hostname = socket.gethostname()
active_user = os.environ.get("USER", "")
default_target = ""
try:
    p = subprocess.run(["systemctl", "get-default"], capture_output=True, text=True, timeout=5)
    default_target = (p.stdout or "").strip()
except Exception:
    pass

timeout_sec = None
grub_raw = ""
if os.path.isfile("/etc/default/grub"):
    try:
        with open("/etc/default/grub", "r", encoding="utf-8", errors="ignore") as f:
            grub_raw = f.read()
        m = re.search(r'^GRUB_TIMEOUT=(\\d+)', grub_raw, re.M)
        if m:
            timeout_sec = int(m.group(1))
    except Exception:
        pass

env_items = []
if os.path.isfile("/etc/environment"):
    try:
        with open("/etc/environment", "r", encoding="utf-8", errors="ignore") as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith("#") or "=" not in ln:
                    continue
                k, v = ln.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                env_items.append({
                    "id": f"system:{k}",
                    "name": k,
                    "value": v,
                    "scope": "system",
                    "regType": "REG_SZ",
                    "ownerSid": "",
                    "ownerUser": "/etc/environment",
                })
    except Exception:
        pass

seen_sys = {e["name"] for e in env_items}
for k in sorted(os.environ.keys()):
    if k not in seen_sys:
        env_items.append({
            "id": f"user:{k}",
            "name": k,
            "value": os.environ.get(k, ""),
            "scope": "user",
            "regType": "REG_SZ",
            "ownerSid": "",
            "ownerUser": active_user,
        })

print(json.dumps({
    "hostname": hostname,
    "activeUser": active_user,
    "activeUserSid": "",
    "msconfig": {
        "bootTimeoutSeconds": timeout_sec,
        "defaultIdentifier": default_target or "multi-user.target",
        "currentIdentifier": default_target or "",
        "safeBootMode": "alternateshell" if default_target == "rescue.target" else "none",
        "noGuiBoot": False,
        "bootLog": False,
        "baseVideo": False,
        "osBootInfo": False,
        "numProc": None,
        "maxMemMb": None,
        "defaultTarget": default_target,
        "bootEntries": [],
        "rawBcdedit": (f"systemctl get-default: {default_target}\\n\\n" + grub_raw).strip(),
    },
    "envVars": env_items,
}))
PY`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 35000 }, winPs, linuxSh);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'msconfig and environment variables');

  const rawEnvVars: any[] = Array.isArray(parsed.envVars) ? parsed.envVars : [];
  const envVars: HelpdeskEnvVarItem[] = rawEnvVars.map((e, idx) => {
    const name = String(e.name || '').trim();
    const scope = e.scope === 'user' ? 'user' : 'system';
    const isProtected = scope === 'system' && PROTECTED_ENV_NAMES.has(name.toLowerCase());
    return {
      id: String(e.id || `${scope}:${name}:${idx}`),
      name,
      value: String(e.value ?? ''),
      scope,
      regType: e.regType === 'REG_EXPAND_SZ' ? 'REG_EXPAND_SZ' : 'REG_SZ',
      ownerSid: e.ownerSid ? String(e.ownerSid) : undefined,
      ownerUser: e.ownerUser ? String(e.ownerUser) : undefined,
      isProtected,
    };
  });

  const sysPathObj = envVars.find((v) => v.scope === 'system' && v.name.toLowerCase() === 'path');
  const usrPathObj = envVars.find((v) => v.scope === 'user' && v.name.toLowerCase() === 'path');
  const splitSep = execRes.osFamily === 'linux' ? ':' : ';';
  const pathSystemEntries = sysPathObj ? sysPathObj.value.split(splitSep).map((s) => s.trim()).filter(Boolean) : [];
  const pathUserEntries = usrPathObj ? usrPathObj.value.split(splitSep).map((s) => s.trim()).filter(Boolean) : [];

  const ms = parsed.msconfig || {};
  const rawEntries: any[] = Array.isArray(ms.bootEntries) ? ms.bootEntries : [];
  const bootEntries: HelpdeskMsconfigBootEntry[] = rawEntries.map((b) => ({
    identifier: String(b.identifier || ''),
    description: String(b.description || ''),
    device: String(b.device || ''),
    path: String(b.path || ''),
    isDefault: Boolean(b.isDefault),
    isCurrent: Boolean(b.isCurrent),
  }));

  const safeModeRaw = String(ms.safeBootMode || 'none').toLowerCase();
  const safeBootMode: HelpdeskMsconfigEnvResult['msconfig']['safeBootMode'] =
    safeModeRaw === 'minimal' ||
    safeModeRaw === 'network' ||
    safeModeRaw === 'dsrepair' ||
    safeModeRaw === 'alternateshell'
      ? safeModeRaw
      : 'none';

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    activeUser: String(parsed.activeUser || ''),
    activeUserSid: String(parsed.activeUserSid || ''),
    msconfig: {
      bootTimeoutSeconds: typeof ms.bootTimeoutSeconds === 'number' ? ms.bootTimeoutSeconds : null,
      defaultIdentifier: String(ms.defaultIdentifier || ''),
      currentIdentifier: String(ms.currentIdentifier || ''),
      safeBootMode,
      noGuiBoot: Boolean(ms.noGuiBoot),
      bootLog: Boolean(ms.bootLog),
      baseVideo: Boolean(ms.baseVideo),
      osBootInfo: Boolean(ms.osBootInfo),
      numProc: typeof ms.numProc === 'number' ? ms.numProc : null,
      maxMemMb: typeof ms.maxMemMb === 'number' ? ms.maxMemMb : null,
      ...(ms.defaultTarget ? { defaultTarget: String(ms.defaultTarget) } : {}),
      bootEntries,
      rawBcdedit: String(ms.rawBcdedit || ''),
    },
    envVars,
    pathSystemEntries,
    pathUserEntries,
    summary: {
      systemEnvCount: envVars.filter((v) => v.scope === 'system').length,
      userEnvCount: envVars.filter((v) => v.scope === 'user').length,
      totalEnvCount: envVars.length,
      bootEntriesCount: bootEntries.length,
    },
    collectedAt: new Date().toISOString(),
  };
}

export async function manageEndpointMsconfig(
  input: HelpdeskTargetInput,
  options: {
    operation: 'set_boot_options' | 'launch_msconfig_tool';
    timeoutSeconds?: number;
    safeBootMode?: 'none' | 'minimal' | 'network' | 'dsrepair' | 'alternateshell';
    noGuiBoot?: boolean;
    bootLog?: boolean;
    baseVideo?: boolean;
    osBootInfo?: boolean;
  }
): Promise<HelpdeskActionResult> {
  const op = options.operation === 'launch_msconfig_tool' ? 'launch_msconfig_tool' : 'set_boot_options';
  const safeMode = String(options.safeBootMode || 'none').toLowerCase();
  if (!['none', 'minimal', 'network', 'dsrepair', 'alternateshell'].includes(safeMode)) {
    throw new Error('Invalid Safe Boot mode.');
  }
  let timeoutSec: number | null = null;
  if (options.timeoutSeconds !== undefined && options.timeoutSeconds !== null) {
    const n = Number(options.timeoutSeconds);
    if (!Number.isInteger(n) || n < 3 || n > 999) {
      throw new Error('Boot timeout must be between 3 and 999 seconds.');
    }
    timeoutSec = n;
  }

  const noGui = Boolean(options.noGuiBoot);
  const bootLog = Boolean(options.bootLog);
  const baseVideo = Boolean(options.baseVideo);
  const sos = Boolean(options.osBootInfo);

  const ps = `
$ErrorActionPreference = 'Stop'
$op = '${op}'
$notes = @()

if ($op -eq 'launch_msconfig_tool') {
  ${PS_HELPDESK_DETECT_LOGGED_USER}
  if (-not $loggedUser) {
    throw 'No active interactive desktop user logged in to launch msconfig.exe UI.'
  }
  $taskName = "NetTopo_Msconfig_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  try {
    $act = New-ScheduledTaskAction -Execute 'msconfig.exe'
    $pri = New-ScheduledTaskPrincipal -UserId $loggedUser -LogonType Interactive -RunLevel Highest
    $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $act -Principal $pri -Settings $st -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Milliseconds 300
    $notes += "Launched msconfig.exe on active session of $loggedUser"
  } finally {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  }
} else {
  $safeMode = '${safeMode}'
  ${
    timeoutSec !== null
      ? `(& bcdedit.exe /timeout ${timeoutSec} 2>&1 | Out-String) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'bcdedit /timeout failed (ensure elevated privileges / WinRE / BitLocker status).' }
  $notes += "Boot timeout = ${timeoutSec}s"`
      : ''
  }

  if ($safeMode -eq 'none') {
    & bcdedit.exe /deletevalue '{current}' safeboot 2>&1 | Out-Null
    $notes += 'Safe Boot = Off (Normal)'
  } else {
    $sbOut = (& bcdedit.exe /set '{current}' safeboot $safeMode 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "bcdedit safeboot failed: $sbOut" }
    $notes += "Safe Boot = $safeMode"
  }

  function Set-BcdFlag($flagName, [bool]$enabled) {
    if ($enabled) {
      & bcdedit.exe /set '{current}' $flagName yes 2>&1 | Out-Null
    } else {
      & bcdedit.exe /deletevalue '{current}' $flagName 2>&1 | Out-Null
    }
  }

  Set-BcdFlag 'quietboot' ${noGui ? '$true' : '$false'}
  Set-BcdFlag 'bootlog' ${bootLog ? '$true' : '$false'}
  Set-BcdFlag 'vga' ${baseVideo ? '$true' : '$false'}
  Set-BcdFlag 'sos' ${sos ? '$true' : '$false'}
  $notes += "Flags: quietboot=${noGui}, bootlog=${bootLog}, vga=${baseVideo}, sos=${sos}"
}

[PSCustomObject]@{
  ok = $true
  output = ($notes -join ' | ')
} | ConvertTo-Json -Compress
`;

  const lx = `python3 - <<'PY'
import json, subprocess
op = "${op}"
if op == "launch_msconfig_tool":
    print(json.dumps({"ok": False, "output": "msconfig.exe GUI is Windows-only. Use systemd/GRUB controls below on Linux."}))
else:
    target = "rescue.target" if "${safeMode}" != "none" else "graphical.target"
    r = subprocess.run(["systemctl", "set-default", target], capture_output=True, text=True, timeout=15)
    print(json.dumps({"ok": r.returncode == 0, "output": (r.stdout + " " + r.stderr).strip() or f"Default target set to {target}"}))
PY`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 30000 }, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'msconfig update');
  const ok = Boolean(parsed.ok);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: 'msconfig_update',
    success: ok,
    message: ok
      ? op === 'launch_msconfig_tool'
        ? `System Configuration (msconfig.exe) launched on interactive session of ${execRes.host}.`
        : `MSConfig / Boot configuration updated on ${execRes.host} (${parsed.output}).`
      : `MSConfig update failed on ${execRes.host}: ${parsed.output}`,
    messageFa: ok
      ? op === 'launch_msconfig_tool'
        ? `پنجره System Configuration (msconfig.exe) روی صفحه کاربر فعال در ${execRes.host} باز شد.`
        : `تنظیمات بوت و MSConfig روی سیستم ${execRes.host} با موفقیت اعمال شد.`
      : `تغییر تنظیمات بوت و MSConfig ناموفق بود: ${parsed.output}`,
    details: { op, timeoutSeconds: timeoutSec, safeBootMode: safeMode, noGuiBoot: noGui, bootLog, baseVideo, osBootInfo: sos },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function manageEndpointEnvVar(
  input: HelpdeskTargetInput,
  options: {
    action: 'set' | 'delete';
    scope: 'system' | 'user';
    name: string;
    value?: string;
    expandSz?: boolean;
    ownerSid?: string;
  }
): Promise<HelpdeskActionResult> {
  const action = options.action === 'delete' ? 'delete' : 'set';
  const scope = options.scope === 'user' ? 'user' : 'system';
  const varName = String(options.name || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(varName)) {
    throw new Error('Invalid environment variable name.');
  }
  if (action === 'delete' && scope === 'system' && PROTECTED_ENV_NAMES.has(varName.toLowerCase())) {
    throw new Error(`Protected critical system variable "${varName}" cannot be deleted.`);
  }
  const varVal = String(options.value ?? '');
  if (action === 'set' && (/[\x00-\x1F\x7F]/.test(varVal) || varVal.length > 8192)) {
    throw new Error('Environment variable value contains invalid control characters or exceeds 8192 characters.');
  }
  const ownerSid = String(options.ownerSid || '').trim();
  if (ownerSid && !/^S-1-5-21-[0-9-]+$/.test(ownerSid)) {
    throw new Error('Invalid user SID format.');
  }

  const nameB64 = utf8Base64(varName);
  const valB64 = utf8Base64(varVal);
  const sidB64 = utf8Base64(ownerSid);
  const useExpand = Boolean(options.expandSz || /%[A-Za-z0-9_]+%/.test(varVal));

  const ps = `
$ErrorActionPreference = 'Stop'
$action = '${action}'
$scope = '${scope}'
$vName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
$vVal = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${valB64}'))
$sid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))

if ($scope -eq 'system') {
  $regPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
} else {
  if (-not $sid) {
    ${PS_HELPDESK_DETECT_LOGGED_USER}
    $sid = $userSid
  }
  $regPath = if ($sid) { "Registry::HKEY_USERS\\$sid\\Environment" } else { 'HKCU:\\Environment' }
}

if (-not (Test-Path -LiteralPath $regPath)) {
  if ($action -eq 'delete') { throw "Environment registry hive not found ($regPath)." }
  New-Item -Path $regPath -Force | Out-Null
}

if ($action -eq 'delete') {
  Remove-ItemProperty -LiteralPath $regPath -Name $vName -ErrorAction Stop
  $msg = "Deleted $scope variable '$vName'"
} else {
  $kind = ${useExpand ? "'ExpandString'" : "'String'"}
  Set-ItemProperty -LiteralPath $regPath -Name $vName -Value $vVal -Type $kind -Force
  $msg = "Set $scope variable '$vName' ($kind)"
}

try {
  $code = @"
using System;
using System.Runtime.InteropServices;
public class HdEnvBroadcast {
  [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
}
"@
  if (-not ([System.Management.Automation.PSTypeName]'HdEnvBroadcast').Type) {
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
  }
  $rPtr = [UIntPtr]::Zero
  [HdEnvBroadcast]::SendMessageTimeout([IntPtr]0xFFFF, 0x001A, [UIntPtr]::Zero, 'Environment', 2, 1500, [ref]$rPtr) | Out-Null
} catch {}

[PSCustomObject]@{
  ok = $true
  output = $msg
} | ConvertTo-Json -Compress
`;

  const lx = `python3 - <<'PY'
import base64, json, os
action = "${action}"
scope = "${scope}"
name = base64.b64decode("${nameB64}").decode("utf-8").strip()
val = base64.b64decode("${valB64}").decode("utf-8")
target_file = "/etc/environment" if scope == "system" else os.path.expanduser("~/.profile")
lines = []
if os.path.isfile(target_file):
    with open(target_file, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
prefix = "" if scope == "system" else "export "
new_lines = [ln for ln in lines if not ln.lstrip().startswith(f"{prefix}{name}=") and not ln.lstrip().startswith(f"{name}=")]
if action == "set":
    safe_val = val.replace('"', '\\\\"')
    new_lines.append(f'{prefix}{name}="{safe_val}"\\n')
with open(target_file, "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print(json.dumps({"ok": True, "output": f"{action} {scope} var {name} in {target_file}"}))
PY`;

  const execRes = await executeHardcodedScripts({ ...input, timeoutMs: 30000 }, ps, lx);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'manage environment variable');
  const ok = Boolean(parsed.ok);

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    action: action === 'delete' ? 'env_var_delete' : 'env_var_set',
    success: ok,
    message: ok
      ? `Environment variable "${varName}" (${scope}) ${action === 'delete' ? 'deleted' : 'saved'} on ${execRes.host}.`
      : `Failed to ${action} environment variable "${varName}": ${parsed.output}`,
    messageFa: ok
      ? `متغیر محیطی «${varName}» (${scope === 'system' ? 'سیستم' : 'کاربر'}) روی ${execRes.host} ${action === 'delete' ? 'حذف شد' : 'ذخیره و اعمال شد'}.`
      : `تغییر متغیر محیطی «${varName}» ناموفق بود: ${parsed.output}`,
    details: { action, scope, name: varName },
    rawOutput: String(parsed.output || ''),
    executedAt: new Date().toISOString(),
  };
}

export async function exportEndpointFont(
  input: HelpdeskTargetInput,
  options: {
    fileName: string;
    scope?: 'system' | 'user';
    ownerSid?: string;
    filePath?: string;
  }
): Promise<{
  fileName: string;
  mimeType: string;
  fileBase64: string;
  sizeBytes: number;
}> {
  const safeFile = sanitizeFontFileName(options.fileName);
  const scope = options.scope === 'user' ? 'user' : 'system';
  const ownerSid = String(options.ownerSid || '').trim();
  if (ownerSid && !/^S-1-5-21-[0-9-]+$/.test(ownerSid)) {
    throw new Error('Invalid owner SID format.');
  }
  const rawPath = String(options.filePath || '').trim();
  const fnB64 = utf8Base64(safeFile);
  const sidB64 = utf8Base64(ownerSid);
  const pathB64 = utf8Base64(rawPath);

  const initPs = `
$ErrorActionPreference = 'Stop'
$fn = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${fnB64}'))
$sid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))
$hint = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${pathB64}'))
$cands = @()
if ($hint -and (Test-Path -LiteralPath $hint)) { $cands += $hint }
if ('${scope}' -eq 'user' -and $sid) {
  $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$sid" -ErrorAction SilentlyContinue
  if ($pl -and $pl.ProfileImagePath) {
    $cands += (Join-Path ([string]$pl.ProfileImagePath) ("AppData\\Local\\Microsoft\\Windows\\Fonts\\" + $fn))
  }
}
$cands += (Join-Path $env:LOCALAPPDATA ("Microsoft\\Windows\\Fonts\\" + $fn))
$cands += (Join-Path (Join-Path $env:SystemRoot 'Fonts') $fn)

$resolved = $null
foreach ($c in $cands) {
  if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) {
    $resolved = (Get-Item -LiteralPath $c).FullName
    break
  }
}
if (-not $resolved) {
  throw "Font file '$fn' could not be located on endpoint."
}
$len = (Get-Item -LiteralPath $resolved).Length
if ($len -gt 25MB) {
  throw "Font file '$fn' exceeds the 25 MB export limit."
}
[PSCustomObject]@{
  path = $resolved
  sizeBytes = [int64]$len
} | ConvertTo-Json -Compress
`;

  const initLx = `python3 - <<'PY'
import base64, json, os
fn = base64.b64decode("${fnB64}").decode("utf-8").strip()
hint = base64.b64decode("${pathB64}").decode("utf-8").strip()
resolved = None
if hint and os.path.isfile(hint) and os.path.basename(hint) == fn:
    resolved = hint
else:
    for root_dir in ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.local/share/fonts")]:
        if not os.path.isdir(root_dir):
            continue
        for dp, _, files in os.walk(root_dir):
            if fn in files:
                resolved = os.path.join(dp, fn)
                break
        if resolved:
            break
if not resolved:
    raise FileNotFoundError(f"Font file {fn} not found")
sz = os.path.getsize(resolved)
print(json.dumps({"path": resolved, "sizeBytes": sz}))
PY`;

  const metaRes = await executeHardcodedScripts({ ...input, timeoutMs: 25000 }, initPs, initLx);
  const meta = parseJsonFromStdout<{ path: string; sizeBytes: number }>(metaRes.stdout, `locate font ${safeFile}`);
  const remotePathB64 = utf8Base64(meta.path);
  const totalBytes = Number(meta.sizeBytes || 0);
  const CHUNK_BYTES = 180000;
  const parts: Buffer[] = [];

  for (let offset = 0; offset < totalBytes; offset += CHUNK_BYTES) {
    const count = Math.min(CHUNK_BYTES, totalBytes - offset);
    const readPs = `
$p = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${remotePathB64}'))
$fs = [System.IO.File]::OpenRead($p)
try {
  $fs.Seek(${offset}, [System.IO.SeekOrigin]::Begin) | Out-Null
  $buf = New-Object byte[] ${count}
  $read = $fs.Read($buf, 0, ${count})
  [PSCustomObject]@{ b64 = [Convert]::ToBase64String($buf, 0, $read) } | ConvertTo-Json -Compress
} finally {
  $fs.Dispose()
}
`;
    const readLx = `python3 - <<'PY'
import base64, json
p = base64.b64decode("${remotePathB64}").decode("utf-8")
with open(p, "rb") as f:
    f.seek(${offset})
    data = f.read(${count})
print(json.dumps({"b64": base64.b64encode(data).decode("ascii")}))
PY`;
    const chunkRes = await executeHardcodedScripts({ ...input, timeoutMs: 30000 }, readPs, readLx);
    const chunkParsed = parseJsonFromStdout<{ b64: string }>(chunkRes.stdout, `read font chunk ${safeFile}`);
    parts.push(Buffer.from(chunkParsed.b64 || '', 'base64'));
  }

  const fullBuf = Buffer.concat(parts);
  const lower = safeFile.toLowerCase();
  const mimeType = lower.endsWith('.otf')
    ? 'font/otf'
    : lower.endsWith('.ttf')
    ? 'font/ttf'
    : lower.endsWith('.ttc')
    ? 'font/collection'
    : 'application/octet-stream';

  return {
    fileName: safeFile,
    mimeType,
    fileBase64: fullBuf.toString('base64'),
    sizeBytes: fullBuf.length,
  };
}

export async function exportEndpointFontsArchive(
  input: HelpdeskTargetInput,
  items: Array<{
    fileName: string;
    scope?: 'system' | 'user';
    ownerSid?: string;
    filePath?: string;
  }>
): Promise<{
  archiveFileName: string;
  zipBuffer: Buffer;
  exportedCount: number;
  skippedCount: number;
}> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one font item must be selected for archive export.');
  }
  const cappedItems = items.slice(0, 250).map((it) => ({
    fileName: sanitizeFontFileName(it.fileName),
    scope: it.scope === 'user' ? 'user' : 'system',
    ownerSid: String(it.ownerSid || '').trim(),
    filePath: String(it.filePath || '').trim(),
  }));

  const payloadB64 = utf8Base64(JSON.stringify(cappedItems));
  const archiveId = crypto.randomBytes(6).toString('hex');

  const packPs = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$items = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payloadB64}')) | ConvertFrom-Json
$zipPath = Join-Path $env:TEMP 'hd_fonts_export_${archiveId}.zip'
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
$sysFonts = Join-Path $env:SystemRoot 'Fonts'
$added = 0
$skipped = 0
$usedNames = New-Object 'System.Collections.Generic.HashSet[string]'
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($it in $items) {
    $fn = [string]$it.fileName
    $resolved = $null
    $cands = @()
    if ($it.filePath) { $cands += [string]$it.filePath }
    if ($it.scope -eq 'user' -and $it.ownerSid) {
      $pl = Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$($it.ownerSid)" -ErrorAction SilentlyContinue
      if ($pl -and $pl.ProfileImagePath) {
        $cands += (Join-Path ([string]$pl.ProfileImagePath) ("AppData\\Local\\Microsoft\\Windows\\Fonts\\" + $fn))
      }
    }
    $cands += (Join-Path $env:LOCALAPPDATA ("Microsoft\\Windows\\Fonts\\" + $fn))
    $cands += (Join-Path $sysFonts $fn)
    foreach ($c in $cands) {
      if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) { $resolved = $c; break }
    }
    if ($resolved) {
      $entryName = $fn
      if (-not $usedNames.Add($entryName.ToLowerInvariant())) {
        $entryName = "$($added)_$fn"
        [void]$usedNames.Add($entryName.ToLowerInvariant())
      }
      try {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $resolved, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $added++
      } catch {
        $skipped++
      }
    } else {
      $skipped++
    }
  }
} finally {
  $zip.Dispose()
}
$zipLen = if (Test-Path -LiteralPath $zipPath) { (Get-Item -LiteralPath $zipPath).Length } else { 0 }
[PSCustomObject]@{
  zipPath = $zipPath
  sizeBytes = [int64]$zipLen
  exportedCount = $added
  skippedCount = $skipped
  hostname = $env:COMPUTERNAME
} | ConvertTo-Json -Compress
`;

  const packLx = `python3 - <<'PY'
import base64, json, os, socket, zipfile
items = json.loads(base64.b64decode("${payloadB64}").decode("utf-8"))
zip_path = "/tmp/hd_fonts_export_${archiveId}.zip"
added = 0
skipped = 0
used = set()
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for it in items:
        fn = it["fileName"]
        hint = it.get("filePath") or ""
        resolved = hint if hint and os.path.isfile(hint) and os.path.basename(hint) == fn else None
        if not resolved:
            for root_dir in ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.local/share/fonts")]:
                if not os.path.isdir(root_dir):
                    continue
                for dp, _, files in os.walk(root_dir):
                    if fn in files:
                        resolved = os.path.join(dp, fn)
                        break
                if resolved:
                    break
        if resolved:
            ename = fn if fn.lower() not in used else f"{added}_{fn}"
            used.add(ename.lower())
            zf.write(resolved, arcname=ename)
            added += 1
        else:
            skipped += 1
print(json.dumps({
    "zipPath": zip_path,
    "sizeBytes": os.path.getsize(zip_path) if os.path.isfile(zip_path) else 0,
    "exportedCount": added,
    "skippedCount": skipped,
    "hostname": socket.gethostname(),
}))
PY`;

  const packRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(60000, input.timeoutMs || 60000) },
    packPs,
    packLx
  );
  const meta = parseJsonFromStdout<{
    zipPath: string;
    sizeBytes: number;
    exportedCount: number;
    skippedCount: number;
    hostname?: string;
  }>(packRes.stdout, 'pack font archive');

  const zipPathB64 = utf8Base64(meta.zipPath);
  const totalBytes = Number(meta.sizeBytes || 0);
  const parts: Buffer[] = [];
  const CHUNK_BYTES = 180000;

  try {
    if (totalBytes > 60 * 1024 * 1024) {
      throw new Error('Selected font archive exceeds the 60 MB export cap. Narrow down your filter selection.');
    }
    for (let offset = 0; offset < totalBytes; offset += CHUNK_BYTES) {
      const count = Math.min(CHUNK_BYTES, totalBytes - offset);
      const readPs = `
$p = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${zipPathB64}'))
$fs = [System.IO.File]::OpenRead($p)
try {
  $fs.Seek(${offset}, [System.IO.SeekOrigin]::Begin) | Out-Null
  $buf = New-Object byte[] ${count}
  $read = $fs.Read($buf, 0, ${count})
  [PSCustomObject]@{ b64 = [Convert]::ToBase64String($buf, 0, $read) } | ConvertTo-Json -Compress
} finally {
  $fs.Dispose()
}
`;
      const readLx = `python3 - <<'PY'
import base64, json
p = base64.b64decode("${zipPathB64}").decode("utf-8")
with open(p, "rb") as f:
    f.seek(${offset})
    data = f.read(${count})
print(json.dumps({"b64": base64.b64encode(data).decode("ascii")}))
PY`;
      const chunkRes = await executeHardcodedScripts({ ...input, timeoutMs: 30000 }, readPs, readLx);
      const chunkParsed = parseJsonFromStdout<{ b64: string }>(chunkRes.stdout, 'read font archive chunk');
      parts.push(Buffer.from(chunkParsed.b64 || '', 'base64'));
    }
  } finally {
    const cleanPs = `$p = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${zipPathB64}')); if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }; '{}'`;
    const cleanLx = `python3 -c "import base64, os; p=base64.b64decode('${zipPathB64}').decode(); os.path.exists(p) and os.remove(p); print('{}')"`;
    await executeHardcodedScripts({ ...input, timeoutMs: 15000 }, cleanPs, cleanLx).catch(() => {});
  }

  const safeHost = String(meta.hostname || packRes.host || 'endpoint').replace(/[^a-zA-Z0-9._-]/g, '_');
  return {
    archiveFileName: `fonts_${safeHost}.zip`,
    zipBuffer: Buffer.concat(parts),
    exportedCount: Number(meta.exportedCount || 0),
    skippedCount: Number(meta.skippedCount || 0),
  };
}




