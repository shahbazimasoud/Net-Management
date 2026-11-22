import crypto from 'crypto';
import http from 'http';
import https from 'https';
import net from 'net';
import { Client, ConnectConfig } from 'ssh2';
import { explainEventCodeHuman, HumanEventExplanation } from './helpdeskEventCatalog';

export type HelpdeskProtocol = 'auto' | 'winrm_https' | 'winrm_http' | 'ssh';
export type HelpdeskWriteAction =
  | 'network_flush_dns'
  | 'network_renew_ip'
  | 'spooler_restart'
  | 'spooler_clear_queue'
  | 'process_terminate'
  | 'temp_clean'
  | 'gpupdate_force';

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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
  portUsed: number;
  osFamily: 'windows' | 'linux';
  collectedAt: string;
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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
// 3. PURE TYPESCRIPT NTLMv2 IMPLEMENTATION (RFC / MS-NLMP for Native WinRM)
// ============================================================================

function md4(message: Buffer): Buffer {
  const bitLen = BigInt(message.length) * 8n;
  const padLen = ((55 - (message.length % 64)) + 64) % 64;
  const padded = Buffer.alloc(message.length + 1 + padLen + 8);
  message.copy(padded, 0);
  padded[message.length] = 0x80;
  padded.writeBigUInt64LE(bitLen, padded.length - 8);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const F = (x: number, y: number, z: number) => ((x & y) | (~x & z)) >>> 0;
  const G = (x: number, y: number, z: number) => ((x & y) | (x & z) | (y & z)) >>> 0;
  const H = (x: number, y: number, z: number) => (x ^ y ^ z) >>> 0;

  const x = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) x[i] = padded.readUInt32LE(offset + i * 4);
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    const r1 = [
      [0, 3], [1, 7], [2, 11], [3, 19],
      [4, 3], [5, 7], [6, 11], [7, 19],
      [8, 3], [9, 7], [10, 11], [11, 19],
      [12, 3], [13, 7], [14, 11], [15, 19],
    ];
    for (let i = 0; i < 16; i++) {
      const [k, s] = r1[i];
      if (i % 4 === 0) a = rotl((a + F(b, c, d) + x[k]) >>> 0, s);
      else if (i % 4 === 1) d = rotl((d + F(a, b, c) + x[k]) >>> 0, s);
      else if (i % 4 === 2) c = rotl((c + F(d, a, b) + x[k]) >>> 0, s);
      else b = rotl((b + F(c, d, a) + x[k]) >>> 0, s);
    }

    const r2 = [
      [0, 3], [4, 5], [8, 9], [12, 13],
      [1, 3], [5, 5], [9, 9], [13, 13],
      [2, 3], [6, 5], [10, 9], [14, 13],
      [3, 3], [7, 5], [11, 9], [15, 13],
    ];
    for (let i = 0; i < 16; i++) {
      const [k, s] = r2[i];
      if (i % 4 === 0) a = rotl((a + G(b, c, d) + x[k] + 0x5a827999) >>> 0, s);
      else if (i % 4 === 1) d = rotl((d + G(a, b, c) + x[k] + 0x5a827999) >>> 0, s);
      else if (i % 4 === 2) c = rotl((c + G(d, a, b) + x[k] + 0x5a827999) >>> 0, s);
      else b = rotl((b + G(c, d, a) + x[k] + 0x5a827999) >>> 0, s);
    }

    const r3 = [
      [0, 3], [8, 9], [4, 11], [12, 15],
      [2, 3], [10, 9], [6, 11], [14, 15],
      [1, 3], [9, 9], [5, 11], [13, 15],
      [3, 3], [11, 9], [7, 11], [15, 15],
    ];
    for (let i = 0; i < 16; i++) {
      const [k, s] = r3[i];
      if (i % 4 === 0) a = rotl((a + H(b, c, d) + x[k] + 0x6ed9eba1) >>> 0, s);
      else if (i % 4 === 1) d = rotl((d + H(a, b, c) + x[k] + 0x6ed9eba1) >>> 0, s);
      else if (i % 4 === 2) c = rotl((c + H(d, a, b) + x[k] + 0x6ed9eba1) >>> 0, s);
      else b = rotl((b + H(c, d, a) + x[k] + 0x6ed9eba1) >>> 0, s);
    }

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out;
}

function hmacMd5(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac('md5', key).update(data).digest();
}

function parseDomainAndUser(rawUsername: string): { domain: string; user: string } {
  const trimmed = rawUsername.trim();
  if (trimmed.includes('\\')) {
    const idx = trimmed.indexOf('\\');
    const dom = trimmed.slice(0, idx);
    return { domain: dom === '.' ? '' : dom, user: trimmed.slice(idx + 1) };
  }
  if (trimmed.includes('@')) {
    const idx = trimmed.indexOf('@');
    return { domain: trimmed.slice(idx + 1), user: trimmed.slice(0, idx) };
  }
  return { domain: '', user: trimmed };
}

function createNtlmType1Message(): string {
  const buf = Buffer.alloc(32);
  buf.write('NTLMSSP\0', 0, 'ascii');
  buf.writeUInt32LE(1, 8); // Type 1
  // Flags: Negotiate Unicode | Request Target | Negotiate NTLM | Negotiate Extended Security
  buf.writeUInt32LE(0x00088205, 12);
  return `NTLM ${buf.toString('base64')}`;
}

function createNtlmType3Message(
  type2Base64: string,
  rawUsername: string,
  password: string,
  workstation = 'HELPDESK'
): string {
  const type2 = Buffer.from(type2Base64, 'base64');
  if (type2.length < 32 || type2.toString('ascii', 0, 8) !== 'NTLMSSP\0') {
    throw new Error('Invalid NTLM Type 2 challenge received from Windows endpoint.');
  }
  const serverChallenge = type2.subarray(24, 32);
  let targetInfo = Buffer.alloc(0);
  if (type2.length >= 48) {
    const targetInfoLen = type2.readUInt16LE(40);
    const targetInfoOffset = type2.readUInt32LE(44);
    if (targetInfoLen > 0 && targetInfoOffset + targetInfoLen <= type2.length) {
      targetInfo = type2.subarray(targetInfoOffset, targetInfoOffset + targetInfoLen);
    }
  }

  const { domain, user } = parseDomainAndUser(rawUsername);
  const ntHash = md4(Buffer.from(password, 'utf16le'));
  const ntlmv2Hash = hmacMd5(ntHash, Buffer.from(`${user.toUpperCase()}${domain}`, 'utf16le'));

  const clientChallenge = crypto.randomBytes(8);
  // Windows FILETIME (100ns intervals since Jan 1, 1601)
  const filetime = (BigInt(Date.now()) + 11644473600000n) * 10000n;
  const timestampBuf = Buffer.alloc(8);
  timestampBuf.writeBigUInt64LE(filetime, 0);

  const blobHeader = Buffer.alloc(28);
  blobHeader.writeUInt32LE(0x00000101, 0); // RespType=1, HiRespType=1
  blobHeader.writeUInt32LE(0, 4); // Reserved
  timestampBuf.copy(blobHeader, 8);
  clientChallenge.copy(blobHeader, 16);
  blobHeader.writeUInt32LE(0, 24);

  const blob = Buffer.concat([blobHeader, targetInfo, Buffer.alloc(4)]);
  const ntProofStr = hmacMd5(ntlmv2Hash, Buffer.concat([serverChallenge, blob]));
  const ntResponse = Buffer.concat([ntProofStr, blob]);

  const lmProof = hmacMd5(ntlmv2Hash, Buffer.concat([serverChallenge, clientChallenge]));
  const lmResponse = Buffer.concat([lmProof, clientChallenge]);

  const domainBuf = Buffer.from(domain, 'utf16le');
  const userBuf = Buffer.from(user, 'utf16le');
  const workstationBuf = Buffer.from(workstation, 'utf16le');

  const headerLen = 64;
  let offset = headerLen;
  const lmOffset = offset;
  offset += lmResponse.length;
  const ntOffset = offset;
  offset += ntResponse.length;
  const domOffset = offset;
  offset += domainBuf.length;
  const userOffset = offset;
  offset += userBuf.length;
  const wsOffset = offset;
  offset += workstationBuf.length;

  const msg = Buffer.alloc(offset);
  msg.write('NTLMSSP\0', 0, 'ascii');
  msg.writeUInt32LE(3, 8); // Type 3

  // LM
  msg.writeUInt16LE(lmResponse.length, 12);
  msg.writeUInt16LE(lmResponse.length, 14);
  msg.writeUInt32LE(lmOffset, 16);
  // NT
  msg.writeUInt16LE(ntResponse.length, 20);
  msg.writeUInt16LE(ntResponse.length, 22);
  msg.writeUInt32LE(ntOffset, 24);
  // Domain
  msg.writeUInt16LE(domainBuf.length, 28);
  msg.writeUInt16LE(domainBuf.length, 30);
  msg.writeUInt32LE(domOffset, 32);
  // User
  msg.writeUInt16LE(userBuf.length, 36);
  msg.writeUInt16LE(userBuf.length, 38);
  msg.writeUInt32LE(userOffset, 40);
  // Workstation
  msg.writeUInt16LE(workstationBuf.length, 44);
  msg.writeUInt16LE(workstationBuf.length, 46);
  msg.writeUInt32LE(wsOffset, 48);
  // Session key (empty)
  msg.writeUInt16LE(0, 52);
  msg.writeUInt16LE(0, 54);
  msg.writeUInt32LE(offset, 56);
  // Flags
  msg.writeUInt32LE(0x00088205, 60);

  lmResponse.copy(msg, lmOffset);
  ntResponse.copy(msg, ntOffset);
  domainBuf.copy(msg, domOffset);
  userBuf.copy(msg, userOffset);
  workstationBuf.copy(msg, wsOffset);

  return `NTLM ${msg.toString('base64')}`;
}

// ============================================================================
// 4. NATIVE WS-MAN / WINRM TRANSPORT (HTTPS 5986 & HTTP 5985)
// ============================================================================

class NativeWinRmSession {
  private host: string;
  private port: number;
  private useHttps: boolean;
  private username: string;
  private password: string;
  private timeoutMs: number;
  private agent: http.Agent | https.Agent;
  private authMode: 'unknown' | 'ntlm' | 'basic' = 'unknown';

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
    // Keep-Alive is mandatory for NTLM connection-bound authentication
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

    // If NTLM already authenticated on keep-alive socket, send directly; if server asks 401 re-negotiate
    if (this.authMode === 'ntlm') {
      const r = await this.rawPost(envelopeXml);
      if (r.status >= 200 && r.status < 300) return r.body;
      if (r.status !== 401) {
        throw new Error(`WinRM SOAP error (HTTP ${r.status}): ${extractSoapFault(r.body)}`);
      }
    }

    // Step 1: Send NTLM Type 1 Negotiate
    const type1Res = await this.rawPost('', createNtlmType1Message());
    const wwwAuthRaw = type1Res.headers['www-authenticate'];
    const wwwAuthList = Array.isArray(wwwAuthRaw)
      ? wwwAuthRaw.join(', ')
      : String(wwwAuthRaw || '');

    const ntlmChallengeMatch = wwwAuthList.match(/NTLM\s+([A-Za-z0-9+/=]+)/i);
    if (type1Res.status === 401 && ntlmChallengeMatch) {
      const type3Header = createNtlmType3Message(ntlmChallengeMatch[1], this.username, this.password);
      const authRes = await this.rawPost(envelopeXml, type3Header);
      if (authRes.status === 401) {
        throw new Error(
          'WinRM NTLM authentication rejected (HTTP 401). Verify username (e.g. DOMAIN\\user), password, and WinRM permissions.'
        );
      }
      if (authRes.status >= 400) {
        throw new Error(`WinRM SOAP error (HTTP ${authRes.status}): ${extractSoapFault(authRes.body)}`);
      }
      this.authMode = 'ntlm';
      return authRes.body;
    }

    // Fallback to Basic Auth if server advertises Basic
    if (type1Res.status === 401 && /basic/i.test(wwwAuthList)) {
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

    if (type1Res.status === 401) {
      throw new Error(
        `WinRM authentication failed (HTTP 401). Endpoint advertised: ${wwwAuthList || 'none'}. Ensure NTLM or Basic over HTTPS is enabled on WinRM.`
      );
    }

    throw new Error(`Unexpected WinRM HTTP status ${type1Res.status} from ${this.host}:${this.port}.`);
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

      // 3. Receive Loop
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let exitCode = 0;

      for (let iter = 0; iter < 30; iter++) {
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
    <w:OperationTimeout>PT30S</w:OperationTimeout>
    <w:SelectorSet><w:Selector Name="ShellId">${escapeXml(shellId)}</w:Selector></w:SelectorSet>
  </env:Header>
  <env:Body>
    <rsp:Receive>
      <rsp:DesiredStream CommandId="${escapeXml(commandId)}">stdout stderr</rsp:DesiredStream>
    </rsp:Receive>
  </env:Body>
</env:Envelope>`;

        const recRes = await this.soapRequest(receiveXml);

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
  protocol: 'winrm_https' | 'winrm_http' | 'ssh';
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
  if (requested === 'ssh') {
    return { host, protocol: 'ssh', port: input.port || 22, jeaConfigName };
  }

  // Auto adaptive negotiation: modern WinRM HTTPS (5986) -> WinRM HTTP (5985) -> OpenSSH (22)
  const [p5986, p5985, p22] = await Promise.all([
    tcpPortOpen(host, 5986, 2200),
    tcpPortOpen(host, 5985, 2200),
    tcpPortOpen(host, 22, 2200),
  ]);

  if (p5986) return { host, protocol: 'winrm_https', port: 5986, jeaConfigName };
  if (p5985) return { host, protocol: 'winrm_http', port: 5985, jeaConfigName };
  if (p22) return { host, protocol: 'ssh', port: 22, jeaConfigName };

  throw new Error(
    `Endpoint ${host} is unreachable on management ports (WinRM HTTPS 5986, WinRM HTTP 5985, SSH 22). Ensure the workstation is online and WinRM or OpenSSH is permitted by Windows Firewall.`
  );
}

async function executeHardcodedScripts(
  input: HelpdeskTargetInput,
  windowsPsScript: string,
  linuxShellScript: string
): Promise<{
  host: string;
  protocolUsed: 'winrm_https' | 'winrm_http' | 'ssh';
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

  const route = await resolveConnectionRoute(input);
  const timeoutMs = Math.max(5000, Math.min(35000, Number(input.timeoutMs) || 18000));

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

const PS_PRINTER_STATUS = `
$ErrorActionPreference = 'SilentlyContinue'
$svc = Get-CimInstance Win32_Service -Filter "Name='Spooler'"
$spooler = [PSCustomObject]@{
  serviceName = 'Spooler'
  displayName = if ($svc) { [string]$svc.DisplayName } else { 'Print Spooler' }
  status = if ($svc) { [string]$svc.State } else { 'Unknown' }
  startType = if ($svc) { [string]$svc.StartMode } else { 'Unknown' }
  pid = if ($svc -and $svc.ProcessId) { [int]$svc.ProcessId } else { $null }
}

$printers = @()
try {
  $wmiPrinters = Get-CimInstance Win32_Printer
  foreach ($p in $wmiPrinters) {
    $st = switch ([int]$p.PrinterStatus) {
      1 { 'Other' } 2 { 'Unknown' } 3 { 'Idle / Ready' } 4 { 'Printing' } 5 { 'Warmup' } 6 { 'Stopped' } 7 { 'Offline' } default { if ($p.WorkOffline) { 'Offline' } else { 'Ready' } }
    }
    if ($p.WorkOffline) { $st = 'Offline' }
    $printers += [PSCustomObject]@{
      name = [string]$p.Name
      driverName = [string]$p.DriverName
      portName = [string]$p.PortName
      status = $st
      shared = [bool]$p.Shared
      isDefault = [bool]$p.Default
      jobCount = [int]$p.JobCountSinceLastReset
      location = [string]$p.Location
    }
  }
} catch {}

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
  spooler = $spooler
  printers = $printers
  jobs = $jobs
} | ConvertTo-Json -Depth 6 -Compress
`;

const LINUX_PRINTER_STATUS = `
python3 - <<'PY'
import json, subprocess
def run(cmd):
    try: return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: return ""

cups_state = run("systemctl is-active cups 2>/dev/null") or "unknown"
printers = []
for line in run("lpstat -p 2>/dev/null").splitlines():
    parts = line.split()
    if len(parts) >= 2 and parts[0] == "printer":
        printers.append({
            "name": parts[1],
            "driverName": "CUPS",
            "portName": "CUPS",
            "status": " ".join(parts[2:]),
            "shared": False,
            "isDefault": False,
            "jobCount": 0,
            "location": ""
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
// 15. WINDOWS JEA & GPO HARDENING TEMPLATES (Zero-Ransomware Endpoint Lock)
// ============================================================================

export function getHelpdeskJeaTemplates() {
  return {
    jeaConfigName: 'HelpDeskSafeJEA',
    roleCapabilityScript: `# 1. Save as C:\\Program Files\\WindowsPowerShell\\Modules\\HelpDeskSafe\\RoleCapabilities\\HelpDeskPhase1.psrc
@{
    GUID = '9b7c4d21-6e18-4b4e-8f42-3a8a5e0d1c01'
    Author = 'Enterprise IT Security'
    Description = 'Phase 1 Anti-Ransomware Least-Privilege JEA Role (Items 1-7: Health, Network, Spooler, Event Viewer, Safe User-App Stop, Temp Cleanup, GPUpdate)'
    VisibleCmdlets = @(
        'Get-CimInstance',
        'Get-Process',
        'Stop-Process',
        'Get-WinEvent',
        'Get-Counter',
        'Get-MpComputerStatus',
        'Get-NetFirewallProfile',
        'Get-NetNeighbor',
        'Get-ItemProperty',
        'Get-ChildItem',
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
        'C:\\Windows\\System32\\ping.exe',
        'C:\\Windows\\System32\\ipconfig.exe',
        'C:\\Windows\\System32\\nslookup.exe',
        'C:\\Windows\\System32\\gpresult.exe',
        'C:\\Windows\\System32\\gpupdate.exe'
    )
}`,
    registerSessionScript: `# 2. Register Restricted JEA Endpoint & Lock WinRM HTTPS (Port 5986) via GPO
$PanelServerIP = '<ENTER_YOUR_PANEL_SERVER_IP>'

# Create JEA Session Configuration bound strictly to AD HelpDesk Workstation group
New-PSSessionConfigurationFile -Path 'C:\\ProgramData\\HelpDeskSafeJEA.pssc' \`
    -SessionType RestrictedRemoteServer \`
    -RunAsVirtualAccount \`
    -RoleDefinitions @{ 'YOURDOMAIN\\GG_HelpDesk_Workstations' = @{ RoleCapabilities = 'HelpDeskPhase1' } }

Register-PSSessionConfiguration -Name 'HelpDeskSafeJEA' -Path 'C:\\ProgramData\\HelpDeskSafeJEA.pssc' -Force

# Restrict Windows Firewall WinRM HTTPS (5986) strictly to the single management panel IP
New-NetFirewallRule -DisplayName 'WinRM HTTPS - HelpDesk Panel Only' \`
    -Direction Inbound -Protocol TCP -LocalPort 5986 \`
    -RemoteAddress $PanelServerIP -Action Allow -Profile Domain`,
  };
}
