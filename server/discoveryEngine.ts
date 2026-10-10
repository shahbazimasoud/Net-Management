import net from 'net';
import dns from 'dns';
import { getAllRemoteServers } from './db';

export interface DiscoveredPort {
  port: number;
  service: string;
  banner?: string;
  state: 'open' | 'closed' | 'filtered';
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
}

export interface DiscoveryScanOptions {
  ipRange: string;
  ports?: number[];
  timeoutMs?: number;
  concurrency?: number;
}

export interface ActiveScanState {
  scanId: string;
  startTime: number;
  total: number;
  scanned: number;
  aborted: boolean;
  results: DiscoveredHost[];
}

const activeScans = new Map<string, ActiveScanState>();

// Clean up old scan states after 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, scan] of activeScans.entries()) {
    if (now - scan.startTime > 30 * 60 * 1000) {
      activeScans.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * Converts IP address string to 32-bit unsigned integer
 */
function ipToInt(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

/**
 * Converts 32-bit unsigned integer to IP address string
 */
function intToIp(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join('.');
}

/**
 * Validates IPv4 address string
 */
function isValidIPv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

/**
 * Parses user input IP range into an array of IP addresses
 * Supports:
 * - CIDR: "192.168.1.0/24" (max /22 or 1024 IPs, capped at 512 for safety)
 * - Range: "192.168.1.1 - 192.168.1.50"
 * - Comma/space/newline separated IPs: "192.168.1.10, 192.168.1.11"
 */
export function parseIpRange(input: string, maxIps = 512): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const ips: string[] = [];
  const seen = new Set<string>();

  const addIp = (ip: string) => {
    const clean = ip.trim();
    if (isValidIPv4(clean) && !seen.has(clean) && ips.length < maxIps) {
      seen.add(clean);
      ips.push(clean);
    }
  };

  // Split by comma, semicolon or newline first
  const tokens = trimmed.split(/[\n,;]+/);

  for (const token of tokens) {
    const raw = token.trim();
    if (!raw) continue;

    // 1. CIDR notation: e.g. 192.168.1.0/24
    if (raw.includes('/')) {
      const [baseIp, maskStr] = raw.split('/');
      const mask = parseInt(maskStr, 10);
      if (isValidIPv4(baseIp) && !isNaN(mask) && mask >= 16 && mask <= 32) {
        const baseInt = ipToInt(baseIp);
        const hostBits = 32 - mask;
        const totalHosts = Math.pow(2, hostBits);
        const netInt = (baseInt & (~((1 << hostBits) - 1))) >>> 0;

        if (mask === 32) {
          addIp(intToIp(netInt));
        } else if (mask === 31) {
          addIp(intToIp(netInt));
          addIp(intToIp(netInt + 1));
        } else {
          // Standard /24 etc: skip network (0) and broadcast (255) if >= 4 hosts
          const count = Math.min(totalHosts - 2, maxIps - ips.length);
          for (let i = 1; i <= count; i++) {
            addIp(intToIp(netInt + i));
            if (ips.length >= maxIps) break;
          }
        }
      }
      continue;
    }

    // 2. Dash range notation: e.g. 192.168.1.1-192.168.1.50 or 192.168.1.1 - 50
    if (raw.includes('-')) {
      const [startPart, endPart] = raw.split('-').map((s) => s.trim());
      if (isValidIPv4(startPart)) {
        let endIp = endPart;
        // If end part is just the last octet (e.g. 192.168.1.1-50)
        if (!endPart.includes('.') && !isNaN(Number(endPart))) {
          const prefix = startPart.substring(0, startPart.lastIndexOf('.') + 1);
          endIp = prefix + endPart;
        }

        if (isValidIPv4(endIp)) {
          const startInt = ipToInt(startPart);
          const endInt = ipToInt(endIp);
          const low = Math.min(startInt, endInt);
          const high = Math.max(startInt, endInt);
          const rangeCount = Math.min(high - low + 1, maxIps - ips.length);

          for (let i = 0; i < rangeCount; i++) {
            addIp(intToIp(low + i));
            if (ips.length >= maxIps) break;
          }
        }
      }
      continue;
    }

    // 3. Single IP or space-separated
    const subParts = raw.split(/\s+/);
    for (const sp of subParts) {
      if (isValidIPv4(sp)) {
        addIp(sp);
      }
    }
  }

  return ips;
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

/**
 * Probes a specific port on a target host using raw TCP Socket
 */
function probePort(
  host: string,
  port: number,
  timeoutMs: number
): Promise<{ open: boolean; banner?: string; latencyMs: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let banner: string | undefined;
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.removeAllListeners();
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latency = Date.now() - startTime;

      // Port 22 (SSH): wait briefly for banner
      if (port === 22) {
        const bannerTimer = setTimeout(() => {
          cleanup();
          resolve({ open: true, banner, latencyMs: latency });
        }, Math.min(400, timeoutMs));

        socket.on('data', (chunk) => {
          clearTimeout(bannerTimer);
          const text = chunk.toString('utf-8').trim();
          if (text.startsWith('SSH-')) {
            banner = text.split('\r')[0].split('\n')[0];
          }
          cleanup();
          resolve({ open: true, banner, latencyMs: latency });
        });
        return;
      }

      // Port 3389 (RDP): send Connection Request PDU
      if (port === 3389) {
        socket.write(RDP_CONNECTION_REQUEST);
        const rdpTimer = setTimeout(() => {
          cleanup();
          resolve({ open: true, banner: 'RDP Service (Remote Desktop)', latencyMs: latency });
        }, Math.min(350, timeoutMs));

        socket.on('data', () => {
          clearTimeout(rdpTimer);
          cleanup();
          resolve({ open: true, banner: 'Microsoft RDP (Port 3389 Active)', latencyMs: latency });
        });
        return;
      }

      // Other ports (445, 5985, etc): instant success upon TCP connect
      cleanup();
      resolve({ open: true, banner: undefined, latencyMs: latency });
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ open: false, latencyMs: timeoutMs });
    });

    socket.on('error', () => {
      cleanup();
      resolve({ open: false, latencyMs: timeoutMs });
    });

    try {
      socket.connect(port, host);
    } catch {
      cleanup();
      resolve({ open: false, latencyMs: timeoutMs });
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
 * Probes a single host across multiple candidate server ports
 */
export async function probeSingleHost(
  ip: string,
  portsToProbe: number[] = [22, 3389, 445, 5985],
  timeoutMs = 700,
  existingFleetMap = new Map<string, { id: string; name: string }>()
): Promise<DiscoveredHost | null> {
  const probePromises = portsToProbe.map(async (port) => {
    const res = await probePort(ip, port, timeoutMs);
    let serviceName = `Port ${port}`;
    if (port === 22) serviceName = 'SSH';
    else if (port === 3389) serviceName = 'RDP';
    else if (port === 445) serviceName = 'SMB';
    else if (port === 5985 || port === 5986) serviceName = 'WinRM';
    else if (port === 80) serviceName = 'HTTP';
    else if (port === 443) serviceName = 'HTTPS';

    return {
      port,
      service: serviceName,
      state: res.open ? ('open' as const) : ('closed' as const),
      banner: res.banner,
      latencyMs: res.latencyMs,
    };
  });

  const probeResults = await Promise.all(probePromises);
  const openResults = probeResults.filter((p) => p.state === 'open');

  // If no ports are open, host is not a remote compute server or not responding
  if (openResults.length === 0) {
    return null;
  }

  const openPortNumbers = openResults.map((p) => p.port);
  const lowestLatency = Math.min(...openResults.map((p) => p.latencyMs));

  // Reverse DNS lookup
  const hostname = await resolveHostnameFast(ip);

  // OS Classification heuristics
  const hasSsh = openPortNumbers.includes(22);
  const hasRdp = openPortNumbers.includes(3389);
  const hasSmb = openPortNumbers.includes(445);
  const hasWinRm = openPortNumbers.includes(5985) || openPortNumbers.includes(5986);

  let osType: 'linux' | 'windows' | 'hybrid' | 'unknown' = 'unknown';
  let osDetail = 'Discovered Host';

  const sshProbe = openResults.find((p) => p.port === 22);

  if (hasSsh && !hasRdp && !hasSmb && !hasWinRm) {
    osType = 'linux';
    if (sshProbe?.banner) {
      if (sshProbe.banner.toLowerCase().includes('ubuntu')) osDetail = 'Ubuntu Linux (SSH)';
      else if (sshProbe.banner.toLowerCase().includes('debian')) osDetail = 'Debian Linux (SSH)';
      else if (sshProbe.banner.toLowerCase().includes('centos') || sshProbe.banner.toLowerCase().includes('redhat'))
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

  const existing = existingFleetMap.get(ip);

  return {
    ip,
    hostname,
    osType,
    osDetail,
    openPorts: openPortNumbers,
    portDetails: openResults,
    latencyMs: lowestLatency,
    alreadyInFleet: !!existing,
    existingServerId: existing?.id || null,
    existingServerName: existing?.name || null,
    discoveredAt: new Date().toISOString(),
  };
}

/**
 * Runs a full discovery scan over a list of IP addresses with concurrency pooling
 */
export async function executeDiscoveryScan(
  scanId: string,
  ips: string[],
  ports: number[] = [22, 3389, 445, 5985],
  timeoutMs = 700,
  concurrency = 16,
  onProgress?: (host: DiscoveredHost | null, scanned: number, total: number) => void
): Promise<DiscoveredHost[]> {
  // Fetch existing fleet to mark already registered servers
  const allFleetServers = await getAllRemoteServers();
  const fleetMap = new Map<string, { id: string; name: string }>();
  for (const s of allFleetServers) {
    if (s.ip) fleetMap.set(s.ip.trim(), { id: s.id, name: s.name });
  }

  const scanState: ActiveScanState = {
    scanId,
    startTime: Date.now(),
    total: ips.length,
    scanned: 0,
    aborted: false,
    results: [],
  };
  activeScans.set(scanId, scanState);

  const results: DiscoveredHost[] = [];
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < ips.length) {
      if (scanState.aborted) break;

      const idx = currentIndex++;
      const targetIp = ips[idx];

      try {
        const hostResult = await probeSingleHost(targetIp, ports, timeoutMs, fleetMap);
        scanState.scanned++;

        if (hostResult) {
          scanState.results.push(hostResult);
          results.push(hostResult);
        }

        if (onProgress) {
          onProgress(hostResult, scanState.scanned, scanState.total);
        }
      } catch {
        scanState.scanned++;
        if (onProgress) {
          onProgress(null, scanState.scanned, scanState.total);
        }
      }
    }
  }

  const workerPromises: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, ips.length);
  for (let w = 0; w < workerCount; w++) {
    workerPromises.push(worker());
  }

  await Promise.all(workerPromises);

  // Sort results: Linux and Windows hosts first, then by IP
  results.sort((a, b) => {
    if (a.alreadyInFleet !== b.alreadyInFleet) {
      return a.alreadyInFleet ? 1 : -1; // un-enrolled first
    }
    return ipToInt(a.ip) - ipToInt(b.ip);
  });

  return results;
}

/**
 * Aborts an active scan
 */
export function abortDiscoveryScan(scanId: string): boolean {
  const scan = activeScans.get(scanId);
  if (scan) {
    scan.aborted = true;
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
