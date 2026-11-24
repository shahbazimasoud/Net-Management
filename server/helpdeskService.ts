import crypto from 'crypto';
import http from 'http';
import https from 'https';
import net from 'net';
import { Client, ConnectConfig } from 'ssh2';
import { explainEventCodeHuman, HumanEventExplanation } from './helpdeskEventCatalog';
import {
  createNtlmType1Buffer,
  createNtlmType3Result,
  parseNtlmCredentials,
  wrapSpnegoNegTokenInit,
  wrapSpnegoNegTokenResp,
  runDomainAdminSmbRpcPowerShell,
} from './helpdeskSmbRpcTransport';

export type HelpdeskProtocol = 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
export type HelpdeskResolvedProtocol = 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
export type HelpdeskWriteAction =
  | 'network_flush_dns'
  | 'network_renew_ip'
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
  | 'sfc_verify'
  | 'sfc_scannow'
  | 'dism_check'
  | 'dism_scan'
  | 'dism_restore'
  | 'chkdsk_readonly'
  | 'chkdsk_hdd_badsector'
  | 'power_restart'
  | 'power_shutdown'
  | 'power_abort';

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
}

export interface HelpdeskNetworkAdapter {
  name: string;
  description: string;
  status: string;
  macAddress: string;
  ipv4Addresses: string[];
  defaultGateways: string[];
  dnsServers: string[];
  dhcpEnabled: boolean | null;
  linkSpeed: string;
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
  };
  arpSummaryCount: number;
}

export interface HelpdeskProbeResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  probeType: 'ping' | 'port' | 'dns';
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
}

export interface HelpdeskEventViewerResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  portUsed: number;
  osFamily: 'windows' | 'linux';
  hostname: string;
  collectedAt: string;
  channelRequested: 'All' | 'System' | 'Application';
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
}

export interface HelpdeskTempCleanResult {
  targetIp: string;
  protocolUsed: HelpdeskResolvedProtocol;
  osFamily: 'windows' | 'linux';
  hostname: string;
  scope: 'user_temp' | 'windows_temp' | 'both';
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
    "processes": procs
}))
PY
`;

export async function collectEndpointHealth(input: HelpdeskTargetInput): Promise<HelpdeskHealthResult> {
  const execRes = await executeHardcodedScripts(input, PS_HEALTH_TELEMETRY, LINUX_HEALTH_TELEMETRY);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint health telemetry');

  const uptimeSeconds = Number(parsed.uptimeSeconds) || 0;
  const rawDisks = Array.isArray(parsed.disks) ? parsed.disks : parsed.disks ? [parsed.disks] : [];
  const rawProcs = Array.isArray(parsed.processes) ? parsed.processes : parsed.processes ? [parsed.processes] : [];

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
  };
}

// ============================================================================
// 8. MODULE 2: ENDPOINT-SIDE NETWORK DIAGNOSTICS & SAFE RESET ACTIONS
// ============================================================================

const PS_NETWORK_SNAPSHOT = `
$ErrorActionPreference = 'SilentlyContinue'
$adapters = @()
$cfgs = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True"
foreach ($c in $cfgs) {
  $na = Get-CimInstance Win32_NetworkAdapter -Filter "Index=$($c.Index)"
  $ips = @($c.IPAddress | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' })
  $gws = @($c.DefaultIPGateway | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' })
  $dns = @($c.DNSServerSearchOrder)
  $spd = if ($na.Speed -and [double]$na.Speed -gt 0) {
    $mbps = [math]::Round([double]$na.Speed / 1000000, 0)
    if ($mbps -ge 1000) { "$([math]::Round($mbps / 1000, 1)) Gbps" } else { "$mbps Mbps" }
  } else { '-' }
  $adapters += [PSCustomObject]@{
    name = if ($na.NetConnectionID) { [string]$na.NetConnectionID } else { [string]$c.Description }
    description = [string]$c.Description
    status = if ($na.NetEnabled) { 'Up' } else { 'Down' }
    macAddress = [string]$c.MACAddress
    ipv4Addresses = $ips
    defaultGateways = $gws
    dnsServers = $dns
    dhcpEnabled = [bool]$c.DHCPEnabled
    linkSpeed = $spd
  }
}

$proxyEnabled = $false; $proxyServer = ''; $proxyOverride = ''
try {
  $inet = Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
  if ($inet) {
    $proxyEnabled = ([int]$inet.ProxyEnable -eq 1)
    $proxyServer = [string]$inet.ProxyServer
    $proxyOverride = [string]$inet.ProxyOverride
  }
} catch {}

$arpCount = 0
try { $arpCount = (Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -ne 'Unreachable' }).Count } catch {}

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  adapters = $adapters
  proxy = [PSCustomObject]@{
    enabled = $proxyEnabled
    server = $proxyServer
    override = $proxyOverride
  }
  arpSummaryCount = [int]$arpCount
} | ConvertTo-Json -Depth 6 -Compress
`;

const LINUX_NETWORK_SNAPSHOT = `
python3 - <<'PY'
import json, os, socket, subprocess
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
for iface in run("ls /sys/class/net").splitlines():
    if iface == "lo": continue
    state = run(f"cat /sys/class/net/{iface}/operstate") or "unknown"
    mac = run(f"cat /sys/class/net/{iface}/address")
    ips = run(f"ip -4 -o addr show dev {iface} | awk '{{print $4}}'").splitlines()
    spd = run(f"cat /sys/class/net/{iface}/speed 2>/dev/null")
    adapters.append({
        "name": iface,
        "description": iface,
        "status": "Up" if state.lower() == "up" else state,
        "macAddress": mac,
        "ipv4Addresses": ips,
        "defaultGateways": [gw] if gw else [],
        "dnsServers": dns,
        "dhcpEnabled": None,
        "linkSpeed": f"{spd} Mbps" if spd.isdigit() else "-"
    })
proxy = os.environ.get("https_proxy") or os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY") or ""
arp_cnt = len(run("ip neigh show").splitlines())
print(json.dumps({
    "hostname": socket.gethostname(),
    "adapters": adapters,
    "proxy": {"enabled": bool(proxy), "server": proxy, "override": os.environ.get("no_proxy", "")},
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
      status: String(a.status || 'Unknown'),
      macAddress: String(a.macAddress || ''),
      ipv4Addresses: Array.isArray(a.ipv4Addresses) ? a.ipv4Addresses.map(String) : a.ipv4Addresses ? [String(a.ipv4Addresses)] : [],
      defaultGateways: Array.isArray(a.defaultGateways) ? a.defaultGateways.map(String) : a.defaultGateways ? [String(a.defaultGateways)] : [],
      dnsServers: Array.isArray(a.dnsServers) ? a.dnsServers.map(String) : a.dnsServers ? [String(a.dnsServers)] : [],
      dhcpEnabled: typeof a.dhcpEnabled === 'boolean' ? a.dhcpEnabled : null,
      linkSpeed: String(a.linkSpeed || '-'),
    })),
    proxy: {
      enabled: Boolean(parsed.proxy?.enabled),
      server: String(parsed.proxy?.server || ''),
      override: String(parsed.proxy?.override || ''),
    },
    arpSummaryCount: Number(parsed.arpSummaryCount) || 0,
  };
}

export async function runEndpointDiagnosticProbe(
  input: HelpdeskTargetInput,
  probeType: 'ping' | 'port' | 'dns',
  rawProbeTarget: string,
  rawPort?: number
): Promise<HelpdeskProbeResult> {
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

  // DNS Lookup from inside endpoint
  const psDns = `
$target = '${probeTarget}'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$recs = @(); $raw = ''; $ok = $false
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
import json, socket, time
t = "${probeTarget}"
st = time.time()
recs, ok, raw = [], False, ""
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
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'endpoint DNS probe');
  const resolved = Boolean(parsed.resolved);
  const records: string[] = Array.isArray(parsed.records) ? parsed.records.map(String) : [];
  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    osFamily: execRes.osFamily,
    probeType: 'dns',
    probeTarget,
    success: resolved,
    summary: resolved
      ? `Endpoint resolved ${probeTarget} (${records.length} record(s), ${parsed.latencyMs}ms)`
      : `Endpoint failed to resolve DNS name ${probeTarget}`,
    summaryFa: resolved
      ? `نام دامنه ${probeTarget} از سمت سیستم کاربر با موفقیت ترجمه شد (${records.length} رکورد، ${parsed.latencyMs}ms)`
      : `سیستم کاربر نتوانست دامنه ${probeTarget} را از طریق DNS ترجمه کند`,
    metrics: {
      resolved,
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

# 1. Apply in current Admin/WMI context if printer is visible in Win32_Printer
try {
  $wmiMatch = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $targetPrinter } | Select-Object -First 1
  if ($wmiMatch) {
    (New-Object -ComObject WScript.Network).SetDefaultPrinter($wmiMatch.Name)
    $appliedSession = $true
    $notes += "Session default set"
  }
} catch {}

# 2. Apply directly to Active Logged-In User profile (HKU\\<SID> + interactive session notification)
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

# 3. Notify active interactive desktop session via one-shot Limited Scheduled Task (so apps update immediately)
if ($loggedUser) {
  $taskName = "NetTopo_SetDefPrn_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  try {
    $innerB64 = '${encodePowerShellBase64(`
$n = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($n) } catch {}
try { Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry','/y','/n',$n) -Wait -NoNewWindow } catch {}
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
    $appliedUser = $true
    $notes += "Interactive session updated for $loggedUser"
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

  const execRes = await executeHardcodedScripts(input, ps, lx);
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
  }
): Promise<HelpdeskEventViewerResult> {
  const channel: 'All' | 'System' | 'Application' =
    options?.channel === 'System' || options?.channel === 'Application' ? options.channel : 'All';
  const hoursBack = Math.max(1, Math.min(168, Math.floor(Number(options?.hoursBack) || 48)));
  const maxEvents = Math.max(10, Math.min(100, Math.floor(Number(options?.maxEvents) || 45)));
  const severity: 'all' | 'critical_error' =
    options?.severity === 'critical_error' ? 'critical_error' : 'all';

  const logNamesPs =
    channel === 'System'
      ? "@('System')"
      : channel === 'Application'
      ? "@('Application')"
      : "@('System','Application')";
  const levelsPs = severity === 'critical_error' ? '@(1,2)' : '@(1,2,3)';

  const psEventScript = `
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
  }
}
[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  events = $items
} | ConvertTo-Json -Depth 6 -Compress
`;

  const journalPriority = severity === 'critical_error' ? '3' : '4';
  const linuxEventScript = `
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
            "rawMessage": msg
        })
except Exception:
    pass

items.reverse()
print(json.dumps({"hostname": socket.gethostname(), "events": items}))
PY
`;

  const execRes = await executeHardcodedScripts(input, psEventScript, linuxEventScript);
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

    const explanation = explainEventCodeHuman({
      eventId,
      source,
      channel: evChannel,
      level,
      message: rawMessage,
      osFamily: execRes.osFamily,
    });
    if (explanation.isKnownCode) knownDecodedCount++;

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
    };
  });

  let topIssue: HelpdeskEventViewerResult['summary']['topIssue'] = null;
  for (const cand of issueCounter.values()) {
    if (!topIssue || cand.count > topIssue.count) {
      topIssue = cand;
    }
  }

  return {
    targetIp: execRes.host,
    protocolUsed: execRes.protocolUsed,
    portUsed: execRes.portUsed,
    osFamily: execRes.osFamily,
    hostname: String(parsed.hostname || execRes.host),
    collectedAt: new Date().toISOString(),
    channelRequested: channel,
    hoursBack,
    summary: {
      total: events.length,
      critical,
      error,
      warning,
      knownDecodedCount,
      topIssue,
    },
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

[PSCustomObject]@{
  hostname = [string]$env:COMPUTERNAME
  folders = @($u.summary, $w.summary)
  largestFiles = $largest
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

u_sum, u_top = inspect("user_temp", os.path.expanduser("~/.cache"))
w_sum, w_top = inspect("windows_temp", "/tmp")
largest = sorted(u_top + w_top, key=lambda x: x["sizeMb"], reverse=True)[:12]
print(json.dumps({"hostname": socket.gethostname(), "folders": [u_sum, w_sum], "largestFiles": largest}))
PY
`;

export async function scanEndpointTempFolders(input: HelpdeskTargetInput): Promise<HelpdeskTempScanResult> {
  const execRes = await executeHardcodedScripts(input, PS_TEMP_SCAN, LINUX_TEMP_SCAN);
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'temp folder scan');
  const rawFolders: any[] = Array.isArray(parsed.folders) ? parsed.folders : [];
  const rawFiles: any[] = Array.isArray(parsed.largestFiles) ? parsed.largestFiles : [];

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
  };
}

export async function cleanEndpointTempFolders(
  input: HelpdeskTargetInput,
  scope: 'user_temp' | 'windows_temp' | 'both'
): Promise<HelpdeskTempCleanResult> {
  const safeScope: 'user_temp' | 'windows_temp' | 'both' =
    scope === 'user_temp' || scope === 'windows_temp' ? scope : 'both';

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

if (($scope -eq 'user_temp' -or $scope -eq 'both') -and $userTemp -and (Test-Path $userTemp)) { $targets += $userTemp }
if (($scope -eq 'windows_temp' -or $scope -eq 'both') -and $winTemp -and (Test-Path $winTemp)) { $targets += $winTemp }

$deleted = 0; $skipped = 0; $freedBytes = 0; $remBytes = 0
foreach ($dir in ($targets | Select-Object -Unique)) {
  $items = @(Get-ChildItem -Path $dir -Recurse -File -Force -ErrorAction SilentlyContinue)
  foreach ($f in $items) {
    $sz = $f.Length
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
import json, os, socket
scope = "${safeScope}"
dirs = []
if scope in ("user_temp", "both"): dirs.append(os.path.expanduser("~/.cache"))
if scope in ("windows_temp", "both"): dirs.append("/tmp")
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
  const parsed = parseJsonFromStdout<any>(execRes.stdout, 'temp folder cleanup');
  const deletedFiles = Number(parsed.deletedFiles) || 0;
  const skippedLockedFiles = Number(parsed.skippedLockedFiles) || 0;
  const freedMb = Number(parsed.freedMb) || 0;
  const remainingMb = Number(parsed.remainingMb) || 0;

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
    message: `Safely cleaned ${deletedFiles} temp file(s) and freed ${freedMb} MB on ${execRes.host} (${skippedLockedFiles} in-use locked file(s) safely skipped).`,
    messageFa: `${deletedFiles} فایل موقت با موفقیت پاک و ${freedMb} مگابایت فضا روی سیستم ${execRes.host} آزاد شد (${skippedLockedFiles} فایل در حال استفاده به‌صورت ایمن رد شد).`,
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
  rawOutput: string;
  collectedAt: string;
}

export async function inspectDomainAccount(
  input: HelpdeskTargetInput,
  rawDomainUsername: string
): Promise<HelpdeskDomainUserResult> {
  const cleanUser = String(rawDomainUsername || '').trim();
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
$adsiPwdExpired = $null
try {
  $searcher = [adsisearcher]"(&(objectCategory=person)(objectClass=user)(sAMAccountName=$u))"
  $res = $searcher.FindOne()
  if ($res) {
    $entry = $res.GetDirectoryEntry()
    $lockTime = 0
    try {
      $ltProp = $res.Properties['lockouttime']
      if ($ltProp -and $ltProp.Count -gt 0) { $lockTime = [int64]$ltProp[0] }
    } catch {}
    $adsiLocked = ($lockTime -gt 0)
  }
} catch {}

[PSCustomObject]@{
  exitCode = $netExit
  rawOutput = $netOut.Trim()
  adsiLocked = $adsiLocked
} | ConvertTo-Json -Compress
`;

  const linuxSh = `echo '{"exitCode":1,"rawOutput":"Domain user lookup via net user /domain requires a Windows domain-joined workstation.","adsiLocked":null}'`;

  const execRes = await executeHardcodedScripts(
    { ...input, timeoutMs: Math.max(25000, input.timeoutMs || 25000) },
    winPs,
    linuxSh
  );
  const parsed = parseJsonFromStdout<{
    exitCode: number;
    rawOutput: string;
    adsiLocked: boolean | null;
  }>(execRes.stdout, 'domain user lookup');

  const raw = String(parsed.rawOutput || '');
  const found = parsed.exitCode === 0 && /User name/i.test(raw);

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
    globalGroups,
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

[PSCustomObject]@{
  hostname = $env:COMPUTERNAME
  loggedInUser = $loggedUser
  loggedInUserSid = $userSid
  userProfiles = @($profiles | Sort-Object -Property @{Expression='isActiveLoggedIn';Descending=$true}, @{Expression='username';Descending=$false})
  shares = $shares
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
    "shares": shares
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
// 20. WINDOWS JEA & GPO HARDENING TEMPLATES (Zero-Ransomware Endpoint Lock)
// ============================================================================

export function getHelpdeskJeaTemplates() {
  return {
    jeaConfigName: 'HelpDeskSafeJEA',
    roleCapabilityScript: `# 1. Save as C:\\Program Files\\WindowsPowerShell\\Modules\\HelpDeskSafe\\RoleCapabilities\\HelpDeskSafeRole.psrc
@{
    GUID = '9b7c4d21-6e18-4b4e-8f42-3a8a5e0d1c01'
    Author = 'Enterprise IT Security'
    Description = 'Anti-Ransomware Least-Privilege HelpDesk JEA Role (Health, SystemInfo, HotFixes, Network, Spooler, Event Viewer, Safe User-App Stop, Temp Cleanup, GPUpdate, SFC/DISM/CHKDSK, Domain User Info, Battery Report, Power Control)'
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
        'Get-Service',
        @{ Name = 'Restart-Service'; Parameters = @{ Name = 'Name'; ValidateSet = 'Spooler' } },
        @{ Name = 'Stop-Service'; Parameters = @{ Name = 'Name'; ValidateSet = 'Spooler' } },
        @{ Name = 'Start-Service'; Parameters = @{ Name = 'Name'; ValidateSet = 'Spooler' } },
        'ConvertTo-Json', 'Select-Object', 'Sort-Object', 'Where-Object', 'ForEach-Object', 'Start-Sleep', 'Out-String'
    )
    VisibleExternalCommands = @(
        'C:\\Windows\\System32\\systeminfo.exe',
        'C:\\Windows\\System32\\ping.exe',
        'C:\\Windows\\System32\\ipconfig.exe',
        'C:\\Windows\\System32\\nslookup.exe',
        'C:\\Windows\\System32\\gpresult.exe',
        'C:\\Windows\\System32\\gpupdate.exe',
        'C:\\Windows\\System32\\sfc.exe',
        'C:\\Windows\\System32\\dism.exe',
        'C:\\Windows\\System32\\chkdsk.exe',
        'C:\\Windows\\System32\\fsutil.exe',
        'C:\\Windows\\System32\\net.exe',
        'C:\\Windows\\System32\\powercfg.exe',
        'C:\\Windows\\System32\\shutdown.exe'
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
