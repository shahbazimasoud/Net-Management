import net from 'net';
import dns from 'dns';
import { getAllRemoteServers } from './db';

export const MAX_SCAN_IPS = 65536; // 2^16 addresses (/16 maximum)
export const DEFAULT_CHUNK_SIZE = 256;
export const DEFAULT_CONCURRENCY = 300;
export const MIN_CONCURRENCY = 50;
export const MAX_CONCURRENCY = 500;
export const DEFAULT_TIMEOUT_MS = 800;
export const MIN_TIMEOUT_MS = 300;
export const MAX_TIMEOUT_MS = 3000;

export interface DiscoveredPort {
  port: number;
  service: string;
  banner?: string;
  state: 'open' | 'closed' | 'filtered';
  latencyMs?: number;
}

export interface DiscoveredHost {
  ip: string;
  hostname: string | null;
  osType: 'linux' | 'windows' | 'hybrid' | 'unknown';
  osDetail: string;
  openPorts: number[];
  portDetails: DiscoveredPort[];
  latencyMs: number;
  alreadyInFleet: boolean;
  existingServerId?: string | null;
  existingServerName?: string | null;
  discoveredAt: string;
  isRefusedOnly?: boolean; // ECONNREFUSED on all answered ports (alive host with closed ports)
}

export interface DiscoveryScanOptions {
  ipRange: string;
  ports?: number[]; // Phase 1 ports (default: 22, 3389)
  timeoutMs?: number; // default: 800ms (300ms - 3000ms)
  concurrency?: number; // default: 300 (50 - 500)
  chunkSize?: number; // default: 256
}

export interface IpInterval {
  start: number;
  end: number;
}

export interface ParsedIpRangeResult {
  requested: number;
  total: number;
  intervals: IpInterval[];
}

export class DiscoveryValidationError extends Error {
  public errorFa: string;
  public requested: number;
  public limit: number;

  constructor(messageEn: string, messageFa: string, requested = 0, limit = MAX_SCAN_IPS) {
    super(messageEn);
    this.name = 'DiscoveryValidationError';
    this.errorFa = messageFa;
    this.requested = requested;
    this.limit = limit;
  }
}

export interface ActiveScanState {
  scanId: string;
  startTime: number;
  requested: number;
  total: number;
  scanned: number;
  found: number;
  aborted: boolean;
  activeSockets: Set<net.Socket>;
  results: DiscoveredHost[];
}

const activeScans = new Map<string, ActiveScanState>();

// Periodic garbage collection for active scans older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, scan] of activeScans.entries()) {
    if (now - scan.startTime > 30 * 60 * 1000) {
      if (scan.activeSockets && scan.activeSockets.size > 0) {
        for (const sock of scan.activeSockets) {
          try {
            sock.destroy();
          } catch {}
        }
        scan.activeSockets.clear();
      }
      activeScans.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * Converts IP address string to 32-bit unsigned integer
 */
export function ipToInt(ip: string): number {
  return ip
    .trim()
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

/**
 * Converts 32-bit unsigned integer to IP address string
 */
export function intToIp(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join('.');
}

/**
 * Validates strict IPv4 address format (4 octets, 0-255, no leading zeros unless 0)
 */
export function isValidIPv4(ip: string): boolean {
  const trimmed = ip.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255 && String(n) === p;
  });
}

/**
 * Parses, validates, and bounds user IP input.
 * Rejects:
 * - IPv6 addresses (with clear statement)
 * - Prefixes below /16 (e.g. /15, /8)
 * - Invalid octets & reversed ranges
 * - Total requested > 65,536 IPs
 * Skips network and broadcast addresses for CIDR blocks of /30 or larger (keeps /31 and /32).
 * Merges overlapping intervals to eliminate duplicate addresses without storing 65k strings in memory.
 */
export function parseAndValidateIpRange(
  input: string,
  maxLimit = MAX_SCAN_IPS
): ParsedIpRangeResult {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new DiscoveryValidationError(
      'Target IP range, subnet or list is required.',
      'وارد کردن محدوده آی‌پی، ساب‌نت یا لیست آدرس‌ها الزامی است.',
      0,
      maxLimit
    );
  }

  // IPv6 detection
  if (trimmed.includes(':')) {
    throw new DiscoveryValidationError(
      'IPv6 addresses are not supported. Only IPv4 addresses, ranges, and CIDR blocks (up to /16) are supported.',
      'آدرس‌های IPv6 پشتیبانی نمی‌شوند. تنها آدرس‌ها، رنج‌ها و ساب‌نت‌های IPv4 (حداکثر تا /16) پشتیبانی می‌شوند.',
      0,
      maxLimit
    );
  }

  const rawTokens = trimmed.split(/[\n,;]+/);
  const unmergedIntervals: IpInterval[] = [];
  let totalRequestedCount = 0;

  for (const rawToken of rawTokens) {
    const token = rawToken.trim();
    if (!token) continue;

    // Reject IPv6 in individual token
    if (token.includes(':')) {
      throw new DiscoveryValidationError(
        `IPv6 address '${token}' is not supported. Only IPv4 is supported.`,
        `آدرس IPv6 '${token}' پشتیبانی نمی‌شود. فقط پروتکل IPv4 پشتیبانی می‌گردد.`,
        totalRequestedCount,
        maxLimit
      );
    }

    // 1. CIDR notation: e.g. 172.16.0.0/16 or 192.168.1.0/24
    if (token.includes('/')) {
      const parts = token.split('/');
      if (parts.length !== 2) {
        throw new DiscoveryValidationError(
          `Invalid CIDR notation: '${token}'.`,
          `فرمت ساب‌نت نامعتبر است: '${token}'.`,
          totalRequestedCount,
          maxLimit
        );
      }
      const [baseIp, maskStr] = parts.map((s) => s.trim());
      if (!isValidIPv4(baseIp)) {
        throw new DiscoveryValidationError(
          `Invalid base IP '${baseIp}' in CIDR block '${token}'. Each octet must be between 0 and 255.`,
          `آدرس پایه نامعتبر '${baseIp}' در ساب‌نت '${token}'. هر بخش باید بین ۰ تا ۲۵۵ باشد.`,
          totalRequestedCount,
          maxLimit
        );
      }

      const mask = parseInt(maskStr, 10);
      if (isNaN(mask) || mask < 0 || mask > 32 || String(mask) !== maskStr) {
        throw new DiscoveryValidationError(
          `Invalid CIDR prefix '/${maskStr}' in '${token}'. Prefix must be an integer between 16 and 32.`,
          `پیشوند ساب‌نت نامعتبر '/${maskStr}' در '${token}'. پیشوند باید عدد بین ۱۶ تا ۳۲ باشد.`,
          totalRequestedCount,
          maxLimit
        );
      }

      // Check prefix below /16
      if (mask < 16) {
        const hostsRequested = Math.pow(2, 32 - mask);
        throw new DiscoveryValidationError(
          `CIDR prefix /${mask} requests ${hostsRequested.toLocaleString()} IP addresses, exceeding the maximum limit of ${maxLimit.toLocaleString()} IPs (/16). Prefixes below /16 are not allowed. Please split your target into smaller blocks (e.g. split into 10.X.0.0/16 subnets).`,
          `پیشوند ساب‌نت /${mask} شامل ${hostsRequested.toLocaleString()} آدرس است که از سقف مجاز ${maxLimit.toLocaleString()} آدرس (/16) فراتر است. ساب‌نت‌های بزرگتر از /16 مجاز نیستند. لطفاً آن را به بلوک‌های کوچکتر (مانند 10.X.0.0/16) تقسیم کنید.`,
          hostsRequested,
          maxLimit
        );
      }

      const hostBits = 32 - mask;
      const totalHosts = Math.pow(2, hostBits);
      totalRequestedCount += totalHosts;

      if (totalRequestedCount > maxLimit) {
        throw new DiscoveryValidationError(
          `Scan request for ${totalRequestedCount.toLocaleString()} addresses exceeds the maximum limit of ${maxLimit.toLocaleString()} IPs per scan (/16). Please split your target into smaller blocks (e.g. 10.0.0.0/8 into 10.X.0.0/16 blocks).`,
          `درخواست پویش برای ${totalRequestedCount.toLocaleString()} آدرس، از سقف مجاز ${maxLimit.toLocaleString()} آی‌پی در هر اسکن (/16) فراتر رفت. لطفاً هدف خود را به بلوک‌های کوچکتری (مانند 10.X.0.0/16) تقسیم کنید.`,
          totalRequestedCount,
          maxLimit
        );
      }

      const baseInt = ipToInt(baseIp);
      const netInt = (baseInt & (~((1 << hostBits) - 1))) >>> 0;

      if (mask <= 30) {
        // Skip network and broadcast addresses for /30 or larger
        const usableStart = (netInt + 1) >>> 0;
        const usableEnd = (netInt + totalHosts - 2) >>> 0;
        if (usableStart <= usableEnd) {
          unmergedIntervals.push({ start: usableStart, end: usableEnd });
        }
      } else if (mask === 31) {
        // RFC 3021: Point-to-point links have 2 usable addresses
        unmergedIntervals.push({ start: netInt, end: (netInt + 1) >>> 0 });
      } else {
        // /32: Single host
        unmergedIntervals.push({ start: netInt, end: netInt });
      }
      continue;
    }

    // 2. Dash range: e.g. 192.168.1.1 - 192.168.1.50 or 10.10.0.1-50
    if (token.includes('-')) {
      const rangeParts = token.split('-').map((s) => s.trim());
      if (rangeParts.length !== 2) {
        throw new DiscoveryValidationError(
          `Invalid range format: '${token}'.`,
          `فرمت رنج نامعتبر است: '${token}'.`,
          totalRequestedCount,
          maxLimit
        );
      }
      const [startPart, endPart] = rangeParts;
      if (!isValidIPv4(startPart)) {
        throw new DiscoveryValidationError(
          `Invalid start IP '${startPart}' in range '${token}'.`,
          `آدرس شروع نامعتبر '${startPart}' در رنج '${token}'.`,
          totalRequestedCount,
          maxLimit
        );
      }

      let resolvedEnd = endPart;
      if (!endPart.includes('.')) {
        // Short notation e.g. 192.168.1.1-50
        const prefix = startPart.substring(0, startPart.lastIndexOf('.') + 1);
        resolvedEnd = prefix + endPart;
      }

      if (!isValidIPv4(resolvedEnd)) {
        throw new DiscoveryValidationError(
          `Invalid end IP '${endPart}' in range '${token}'.`,
          `آدرس پایان نامعتبر '${endPart}' در رنج '${token}'.`,
          totalRequestedCount,
          maxLimit
        );
      }

      const startInt = ipToInt(startPart);
      const endInt = ipToInt(resolvedEnd);

      if (startInt > endInt) {
        throw new DiscoveryValidationError(
          `Invalid reversed IP range '${token}': start IP (${startPart}) is greater than end IP (${resolvedEnd}).`,
          `رنج آی‌پی معکوس نامعتبر '${token}': آی‌پی شروع (${startPart}) بزرگتر از آی‌پی پایان (${resolvedEnd}) است.`,
          totalRequestedCount,
          maxLimit
        );
      }

      const rangeCount = endInt - startInt + 1;
      totalRequestedCount += rangeCount;

      if (totalRequestedCount > maxLimit) {
        throw new DiscoveryValidationError(
          `Scan request for ${totalRequestedCount.toLocaleString()} addresses exceeds the maximum limit of ${maxLimit.toLocaleString()} IPs per scan (/16). Please split your target into smaller blocks (e.g. 10.0.0.0/8 into 10.X.0.0/16 blocks).`,
          `درخواست پویش برای ${totalRequestedCount.toLocaleString()} آدرس، از سقف مجاز ${maxLimit.toLocaleString()} آی‌پی در هر اسکن (/16) فراتر رفت. لطفاً هدف خود را به بلوک‌های کوچکتری (مانند 10.X.0.0/16) تقسیم کنید.`,
          totalRequestedCount,
          maxLimit
        );
      }

      unmergedIntervals.push({ start: startInt, end: endInt });
      continue;
    }

    // 3. Single IP or whitespace-separated single IPs
    const subParts = token.split(/\s+/).filter(Boolean);
    for (const sp of subParts) {
      if (!isValidIPv4(sp)) {
        throw new DiscoveryValidationError(
          `Invalid IPv4 address '${sp}'. Octets must be between 0 and 255.`,
          `آدرس IPv4 نامعتبر '${sp}'. هر بخش باید عدد بین ۰ تا ۲۵۵ باشد.`,
          totalRequestedCount,
          maxLimit
        );
      }
      totalRequestedCount += 1;
      if (totalRequestedCount > maxLimit) {
        throw new DiscoveryValidationError(
          `Scan request for ${totalRequestedCount.toLocaleString()} addresses exceeds the maximum limit of ${maxLimit.toLocaleString()} IPs per scan (/16). Please split your target into smaller blocks.`,
          `درخواست پویش برای ${totalRequestedCount.toLocaleString()} آدرس، از سقف مجاز ${maxLimit.toLocaleString()} آی‌پی فراتر رفت. لطفاً هدف را به بلوک‌های کوچکتری تقسیم کنید.`,
          totalRequestedCount,
          maxLimit
        );
      }
      const intVal = ipToInt(sp);
      unmergedIntervals.push({ start: intVal, end: intVal });
    }
  }

  if (unmergedIntervals.length === 0) {
    throw new DiscoveryValidationError(
      'No valid IPv4 addresses found in the provided input.',
      'هیچ آدرس معتبر IPv4 در ورودی داده‌شده یافت نشد.',
      0,
      maxLimit
    );
  }

  // Merge overlapping and adjacent intervals to deduplicate without storing all IPs in memory
  unmergedIntervals.sort((a, b) => a.start - b.start);
  const mergedIntervals: IpInterval[] = [];
  let current = { ...unmergedIntervals[0] };

  for (let i = 1; i < unmergedIntervals.length; i++) {
    const next = unmergedIntervals[i];
    if (next.start <= current.end + 1) {
      current.end = Math.max(current.end, next.end);
    } else {
      mergedIntervals.push(current);
      current = { ...next };
    }
  }
  mergedIntervals.push(current);

  // Calculate actual total unique usable IPs
  let totalUsable = 0;
  for (const iv of mergedIntervals) {
    totalUsable += iv.end - iv.start + 1;
  }

  if (totalUsable > maxLimit) {
    throw new DiscoveryValidationError(
      `Total usable addresses (${totalUsable.toLocaleString()}) exceeds the limit of ${maxLimit.toLocaleString()} IPs (/16). Please split your target into smaller blocks.`,
      `مجموع آدرس‌های قابل اسکن (${totalUsable.toLocaleString()}) از سقف مجاز ${maxLimit.toLocaleString()} آی‌پی (/16) فراتر است. لطفاً هدف را به بلوک‌های کوچکتری تقسیم کنید.`,
      totalUsable,
      maxLimit
    );
  }

  return {
    requested: totalRequestedCount,
    total: totalUsable,
    intervals: mergedIntervals,
  };
}

/**
 * Lazy generator that yields IP address strings one-by-one from intervals.
 * Never stores a 65,536 string array in memory.
 */
export function* generateIpRange(intervals: IpInterval[]): Generator<string> {
  for (const interval of intervals) {
    for (let current = interval.start; current <= interval.end; current++) {
      yield intToIp(current);
    }
  }
}

/**
 * Backward compatible parser: returns array of IPs up to maxIps
 */
export function parseIpRange(input: string, maxIps = MAX_SCAN_IPS): string[] {
  try {
    const parsed = parseAndValidateIpRange(input, maxIps);
    const ips: string[] = [];
    for (const ip of generateIpRange(parsed.intervals)) {
      ips.push(ip);
      if (ips.length >= maxIps) break;
    }
    return ips;
  } catch {
    return [];
  }
}

/**
 * Standard X.224 Connection Request PDU for RDP probe
 */
const RDP_CONNECTION_REQUEST = Buffer.from([
  0x03, 0x00, 0x00, 0x13, // TPKT Header (length 19)
  0x0e,                   // ISO 8073 length 14
  0xe0,                   // Connection Request
  0x00, 0x00,             // Destination reference
  0x00, 0x01,             // Source reference
  0x00,                   // Class 0
  0x08, 0x00, 0x03, 0x00, 0x00, 0x00 // RDP negotiation request (protocol RDP/TLS)
]);

export interface RawPortProbeResult {
  port: number;
  state: 'open' | 'closed' | 'filtered';
  banner?: string;
  latencyMs: number;
}

/**
 * Probes a single port on target host using raw TCP Socket.
 * Accurately distinguishes:
 * - 'open': TCP handshake completed (connect event)
 * - 'closed': ECONNREFUSED received (host OS kernel rejected port -> host is alive!)
 * - 'filtered': Timeout / ETIMEDOUT / EHOSTUNREACH / ENETUNREACH (no response)
 * Guaranteed socket cleanup without leaks.
 */
export function probePort(
  host: string,
  port: number,
  timeoutMs: number,
  activeSocketsSet?: Set<net.Socket>
): Promise<RawPortProbeResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let resolved = false;

    if (activeSocketsSet) {
      activeSocketsSet.add(socket);
    }

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        if (activeSocketsSet) {
          activeSocketsSet.delete(socket);
        }
        socket.removeAllListeners();
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latency = Math.max(1, Date.now() - startTime);

      // Port 22 (SSH): wait briefly for banner
      if (port === 22) {
        let bannerText: string | undefined;
        const bannerTimer = setTimeout(() => {
          cleanup();
          resolve({ port, state: 'open', banner: bannerText, latencyMs: latency });
        }, Math.min(350, timeoutMs));

        socket.on('data', (chunk) => {
          clearTimeout(bannerTimer);
          const text = chunk.toString('utf-8').trim();
          if (text.startsWith('SSH-')) {
            bannerText = text.split('\r')[0].split('\n')[0];
          }
          cleanup();
          resolve({ port, state: 'open', banner: bannerText, latencyMs: latency });
        });
        return;
      }

      // Port 3389 (RDP): send Connection Request PDU
      if (port === 3389) {
        try {
          socket.write(RDP_CONNECTION_REQUEST);
        } catch {}

        const rdpTimer = setTimeout(() => {
          cleanup();
          resolve({ port, state: 'open', banner: 'Microsoft RDP (Port 3389 Active)', latencyMs: latency });
        }, Math.min(300, timeoutMs));

        socket.on('data', () => {
          clearTimeout(rdpTimer);
          cleanup();
          resolve({ port, state: 'open', banner: 'Microsoft RDP (Port 3389 Active)', latencyMs: latency });
        });
        return;
      }

      // Other ports (445, 5985, etc.): immediate success upon TCP connect
      cleanup();
      resolve({ port, state: 'open', latencyMs: latency });
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ port, state: 'filtered', latencyMs: timeoutMs });
    });

    socket.on('error', (err: any) => {
      const latency = Math.max(1, Date.now() - startTime);
      // ECONNREFUSED indicates the host is alive and responded with TCP RST!
      const isRefused = err?.code === 'ECONNREFUSED';
      cleanup();
      resolve({
        port,
        state: isRefused ? 'closed' : 'filtered',
        latencyMs: latency,
      });
    });

    try {
      socket.connect(port, host);
    } catch {
      cleanup();
      resolve({ port, state: 'filtered', latencyMs: timeoutMs });
    }
  });
}

/**
 * Resolves reverse DNS PTR hostname for an IP with a fast timeout
 */
async function resolveHostnameFast(ip: string, timeoutMs = 500): Promise<string | null> {
  try {
    const promise = dns.promises.reverse(ip);
    const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
    const result = await Promise.race([promise, timeoutPromise]);
    if (Array.isArray(result) && result.length > 0) {
      return result[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Two-phase host discovery:
 * Phase 1: Probes ONLY selected primary ports (default 22 & 3389).
 * If all ports return 'filtered' (no response), the host is dead/unresponsive -> returns null immediately!
 * Extra checks (445, 5985, banner inspection, reverse DNS) are run ONLY for hosts that answered.
 * If all answered ports are 'closed' (ECONNREFUSED), marks host as isRefusedOnly.
 */
export async function probeHostWithTwoPhases(
  ip: string,
  phase1Ports: number[] = [22, 3389],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  existingFleetMap = new Map<string, { id: string; name: string }>(),
  activeSocketsSet?: Set<net.Socket>
): Promise<DiscoveredHost | null> {
  // Phase 1: Probe selected primary ports
  const p1Promises = phase1Ports.map((p) => probePort(ip, p, timeoutMs, activeSocketsSet));
  const p1Results = await Promise.all(p1Promises);

  // Check if host answered on at least one port
  const hasOpen = p1Results.some((r) => r.state === 'open');
  const hasClosed = p1Results.some((r) => r.state === 'closed');

  // If host did not answer on any port (all 'filtered' / timed out), skip host
  if (!hasOpen && !hasClosed) {
    return null;
  }

  const portDetails: DiscoveredPort[] = [];
  const openPortNumbers: number[] = [];

  for (const r of p1Results) {
    let service = `Port ${r.port}`;
    if (r.port === 22) service = 'SSH';
    else if (r.port === 3389) service = 'RDP';
    else if (r.port === 445) service = 'SMB';
    else if (r.port === 5985 || r.port === 5986) service = 'WinRM';

    if (r.state === 'open') {
      openPortNumbers.push(r.port);
    }

    portDetails.push({
      port: r.port,
      service,
      state: r.state,
      banner: r.banner,
      latencyMs: r.latencyMs,
    });
  }

  // Phase 2: Run extra checks ONLY if host answered
  const hostname = await resolveHostnameFast(ip, 500);
  const existing = existingFleetMap.get(ip);
  const latencies = p1Results
    .filter((r) => r.state === 'open' || r.state === 'closed')
    .map((r) => r.latencyMs);
  const lowestLatency = latencies.length > 0 ? Math.min(...latencies) : timeoutMs;

  // Case A: ECONNREFUSED-only host (host alive, but no open ports found)
  if (!hasOpen && hasClosed) {
    return {
      ip,
      hostname,
      osType: 'unknown',
      osDetail: 'Host Alive (Ports Closed / ECONNREFUSED)',
      openPorts: [],
      portDetails,
      latencyMs: lowestLatency,
      alreadyInFleet: !!existing,
      existingServerId: existing?.id || null,
      existingServerName: existing?.name || null,
      discoveredAt: new Date().toISOString(),
      isRefusedOnly: true,
    };
  }

  // Case B: At least one port is open -> probe auxiliary ports for accurate OS classification if not already tested
  const extraPortsToProbe = [445, 5985].filter((p) => !phase1Ports.includes(p));
  if (extraPortsToProbe.length > 0) {
    const extraResults = await Promise.all(
      extraPortsToProbe.map((p) => probePort(ip, p, Math.min(timeoutMs, 600), activeSocketsSet))
    );
    for (const r of extraResults) {
      let service = `Port ${r.port}`;
      if (r.port === 445) service = 'SMB';
      else if (r.port === 5985) service = 'WinRM';

      if (r.state === 'open') {
        openPortNumbers.push(r.port);
      }
      portDetails.push({
        port: r.port,
        service,
        state: r.state,
        banner: r.banner,
        latencyMs: r.latencyMs,
      });
    }
  }

  // OS Classification heuristics
  const hasSsh = openPortNumbers.includes(22);
  const hasRdp = openPortNumbers.includes(3389);
  const hasSmb = openPortNumbers.includes(445);
  const hasWinRm = openPortNumbers.includes(5985) || openPortNumbers.includes(5986);

  let osType: 'linux' | 'windows' | 'hybrid' | 'unknown' = 'unknown';
  let osDetail = 'Discovered Host';

  const sshProbe = portDetails.find((p) => p.port === 22 && p.state === 'open');

  if (hasSsh && !hasRdp && !hasSmb && !hasWinRm) {
    osType = 'linux';
    if (sshProbe?.banner) {
      const bLower = sshProbe.banner.toLowerCase();
      if (bLower.includes('ubuntu')) osDetail = 'Ubuntu Linux (SSH)';
      else if (bLower.includes('debian')) osDetail = 'Debian Linux (SSH)';
      else if (bLower.includes('centos') || bLower.includes('redhat') || bLower.includes('rhel'))
        osDetail = 'RHEL/CentOS Linux (SSH)';
      else osDetail = `Linux (${sshProbe.banner.substring(0, 32)})`;
    } else {
      osDetail = 'Linux Server (SSH Open)';
    }
  } else if ((hasRdp || hasSmb || hasWinRm) && !hasSsh) {
    osType = 'windows';
    if (hasRdp && hasSmb) osDetail = 'Windows Server (RDP & SMB Active)';
    else if (hasRdp) osDetail = 'Windows Server (RDP 3389 Active)';
    else if (hasWinRm) osDetail = 'Windows Server (WinRM Active)';
    else osDetail = 'Windows Host (SMB 445 Active)';
  } else if (hasSsh && (hasRdp || hasWinRm || hasSmb)) {
    osType = 'hybrid';
    osDetail = 'Hybrid Host (SSH & Windows Services Open)';
  } else {
    osType = 'unknown';
    osDetail = `Host (Open Ports: ${openPortNumbers.join(', ')})`;
  }

  return {
    ip,
    hostname,
    osType,
    osDetail,
    openPorts: openPortNumbers,
    portDetails,
    latencyMs: lowestLatency,
    alreadyInFleet: !!existing,
    existingServerId: existing?.id || null,
    existingServerName: existing?.name || null,
    discoveredAt: new Date().toISOString(),
    isRefusedOnly: false,
  };
}

export interface DiscoveryProgressEvent {
  scanId: string;
  requested: number;
  total: number;
  scanned: number;
  found: number;
  elapsed: number;
  host?: DiscoveredHost | null;
}

/**
 * Runs a full range-independent discovery scan over parsed intervals.
 * - Processes in chunks of 256 IPs
 * - Controls worker concurrency (default 300, capped 50-500)
 * - Streams progress and individual hosts live
 * - Stops immediately on abort and destroys all open sockets
 */
export async function executeChunkedDiscoveryScan(
  scanId: string,
  parsedRange: ParsedIpRangeResult,
  options: {
    ports?: number[];
    timeoutMs?: number;
    concurrency?: number;
    chunkSize?: number;
    onProgress?: (event: DiscoveryProgressEvent) => void;
    onHostFound?: (host: DiscoveredHost) => void;
  }
): Promise<DiscoveredHost[]> {
  const {
    ports = [22, 3389],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    chunkSize = DEFAULT_CHUNK_SIZE,
    onProgress,
    onHostFound,
  } = options;

  const boundedConcurrency = Math.min(Math.max(concurrency, MIN_CONCURRENCY), MAX_CONCURRENCY);
  const boundedTimeout = Math.min(Math.max(timeoutMs, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
  const boundedChunkSize = Math.max(16, Math.min(chunkSize, 1024));

  // Load existing fleet map for enrollment status
  const allFleetServers = await getAllRemoteServers().catch(() => []);
  const fleetMap = new Map<string, { id: string; name: string }>();
  for (const s of allFleetServers) {
    if (s.ip) fleetMap.set(s.ip.trim(), { id: s.id, name: s.name });
  }

  const scanState: ActiveScanState = {
    scanId,
    startTime: Date.now(),
    requested: parsedRange.requested,
    total: parsedRange.total,
    scanned: 0,
    found: 0,
    aborted: false,
    activeSockets: new Set<net.Socket>(),
    results: [],
  };
  activeScans.set(scanId, scanState);

  const totalChunks = Math.ceil(parsedRange.total / boundedChunkSize);
  console.log(
    `[Discovery] [${scanId}] Initiated: requested=${parsedRange.requested}, total=${parsedRange.total}, chunks=${totalChunks} (chunkSize=${boundedChunkSize}), concurrency=${boundedConcurrency}, timeout=${boundedTimeout}ms, phase1Ports=[${ports.join(', ')}]`
  );

  const ipGenerator = generateIpRange(parsedRange.intervals);
  let isGeneratorDone = false;

  const pullNextChunk = (): string[] => {
    const chunk: string[] = [];
    while (chunk.length < boundedChunkSize) {
      const next = ipGenerator.next();
      if (next.done) {
        isGeneratorDone = true;
        break;
      }
      chunk.push(next.value);
    }
    return chunk;
  };

  let chunkIndex = 0;

  try {
    while (!isGeneratorDone && !scanState.aborted) {
      const chunk = pullNextChunk();
      if (chunk.length === 0) break;
      chunkIndex++;

      // Concurrency worker pool for the current chunk
      let chunkCursor = 0;
      const workerCount = Math.min(boundedConcurrency, chunk.length);

      const worker = async () => {
        while (chunkCursor < chunk.length) {
          if (scanState.aborted) break;
          const idx = chunkCursor++;
          const targetIp = chunk[idx];

          try {
            const hostResult = await probeHostWithTwoPhases(
              targetIp,
              ports,
              boundedTimeout,
              fleetMap,
              scanState.activeSockets
            );

            scanState.scanned++;

            if (hostResult) {
              scanState.found++;
              scanState.results.push(hostResult);
              if (onHostFound) {
                onHostFound(hostResult);
              }
            }

            if (onProgress) {
              const elapsed = Math.floor((Date.now() - scanState.startTime) / 1000);
              onProgress({
                scanId,
                requested: scanState.requested,
                total: scanState.total,
                scanned: scanState.scanned,
                found: scanState.found,
                elapsed,
                host: hostResult,
              });
            }
          } catch {
            scanState.scanned++;
            if (onProgress) {
              const elapsed = Math.floor((Date.now() - scanState.startTime) / 1000);
              onProgress({
                scanId,
                requested: scanState.requested,
                total: scanState.total,
                scanned: scanState.scanned,
                found: scanState.found,
                elapsed,
                host: null,
              });
            }
          }
        }
      };

      const workers: Promise<void>[] = [];
      for (let w = 0; w < workerCount; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if (scanState.aborted) {
        break;
      }
    }
  } finally {
    // Ensure all remaining sockets are destroyed
    if (scanState.activeSockets.size > 0) {
      for (const sock of scanState.activeSockets) {
        try {
          sock.destroy();
        } catch {}
      }
      scanState.activeSockets.clear();
    }
  }

  const elapsedSeconds = Math.floor((Date.now() - scanState.startTime) / 1000);
  const openCount = scanState.results.filter((r) => !r.isRefusedOnly).length;
  const refusedCount = scanState.results.filter((r) => r.isRefusedOnly).length;

  console.log(
    `[Discovery] [${scanId}] ${scanState.aborted ? 'Aborted' : 'Completed'} in ${elapsedSeconds}s: scanned=${scanState.scanned}/${scanState.total}, found=${scanState.found} active hosts (open: ${openCount}, refused-only: ${refusedCount})`
  );

  // Sort results: un-enrolled first, then active open ports over refused-only, then by IP
  scanState.results.sort((a, b) => {
    if (a.alreadyInFleet !== b.alreadyInFleet) {
      return a.alreadyInFleet ? 1 : -1;
    }
    if (!!a.isRefusedOnly !== !!b.isRefusedOnly) {
      return a.isRefusedOnly ? 1 : -1;
    }
    return ipToInt(a.ip) - ipToInt(b.ip);
  });

  return scanState.results;
}

/**
 * Aborts an active scan immediately and tears down all open sockets
 */
export function abortDiscoveryScan(scanId: string): boolean {
  const scan = activeScans.get(scanId);
  if (scan) {
    scan.aborted = true;
    if (scan.activeSockets && scan.activeSockets.size > 0) {
      for (const sock of scan.activeSockets) {
        try {
          sock.destroy();
        } catch {}
      }
      scan.activeSockets.clear();
    }
    return true;
  }
  return false;
}

/**
 * Gets status of an active or recent scan
 */
export function getDiscoveryScanStatus(scanId: string): ActiveScanState | null {
  return activeScans.get(scanId) || null;
}

/**
 * Legacy wrapper for backward compatibility
 */
export async function executeDiscoveryScan(
  scanId: string,
  ips: string[],
  ports: number[] = [22, 3389],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
  onProgress?: (host: DiscoveredHost | null, scanned: number, total: number) => void
): Promise<DiscoveredHost[]> {
  const intervals: IpInterval[] = [];
  for (const ip of ips) {
    if (isValidIPv4(ip)) {
      const num = ipToInt(ip);
      intervals.push({ start: num, end: num });
    }
  }

  return executeChunkedDiscoveryScan(
    scanId,
    {
      requested: ips.length,
      total: intervals.length,
      intervals,
    },
    {
      ports,
      timeoutMs,
      concurrency,
      onProgress: (evt) => {
        if (onProgress) {
          onProgress(evt.host || null, evt.scanned, evt.total);
        }
      },
    }
  );
}
