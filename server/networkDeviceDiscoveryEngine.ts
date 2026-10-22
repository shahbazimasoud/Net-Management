import net from 'net';
import dns from 'dns';
import { getAllDevices } from './db';
import {
  ipToInt,
  intToIp,
  MAX_SCAN_IPS,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  ParsedIpRangeResult,
  DiscoveryValidationError,
} from './discoveryEngine';
import { DevicePlatform, DeviceType } from '../src/types';

export interface DiscoveredNetworkPortDetail {
  port: number;
  service: string;
  banner?: string;
  state: 'open' | 'closed' | 'filtered';
  latencyMs?: number;
}

export interface DiscoveredNetworkDevice {
  ip: string;
  hostname: string | null;
  deviceType: DeviceType;
  platform: DevicePlatform;
  suggestedRole: string;
  suggestedModel: string;
  openPorts: number[];
  portDetails: DiscoveredNetworkPortDetail[];
  preferredProtocol: 'ssh' | 'telnet';
  latencyMs: number;
  alreadyInInventory: boolean;
  existingDeviceId?: string | null;
  existingDeviceName?: string | null;
  discoveredAt: string;
  isRefusedOnly?: boolean;
}

export interface NetworkDeviceDiscoveryScanOptions {
  ipRange: string;
  ports?: number[]; // default: [22, 23, 80, 443]
  timeoutMs?: number; // default: 800ms (300ms - 3000ms)
  concurrency?: number; // default: 300 (50 - 500)
  chunkSize?: number; // default: 256
}

export interface ActiveNetworkScanState {
  scanId: string;
  startTime: number;
  requested: number;
  total: number;
  scanned: number;
  found: number;
  aborted: boolean;
  activeSockets: Set<net.Socket>;
  results: DiscoveredNetworkDevice[];
}

const activeNetworkScans = new Map<string, ActiveNetworkScanState>();

// Periodic garbage collection for active scans older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, scan] of activeNetworkScans.entries()) {
    if (now - scan.startTime > 30 * 60 * 1000) {
      if (scan.activeSockets && scan.activeSockets.size > 0) {
        for (const sock of scan.activeSockets) {
          try {
            sock.destroy();
          } catch {}
        }
        scan.activeSockets.clear();
      }
      activeNetworkScans.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function abortNetworkDeviceDiscoveryScan(scanId: string): boolean {
  const scan = activeNetworkScans.get(scanId);
  if (!scan) return false;
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

/**
 * Returns service name label based on port
 */
export function getNetworkServiceName(port: number): string {
  switch (port) {
    case 22:
      return 'SSH';
    case 23:
      return 'Telnet';
    case 80:
      return 'HTTP (Web)';
    case 443:
      return 'HTTPS (Web)';
    case 161:
      return 'SNMP';
    case 8291:
      return 'WinBox';
    case 8080:
      return 'HTTP-Alt';
    case 8443:
      return 'HTTPS-Alt';
    default:
      return `TCP/${port}`;
  }
}

/**
 * Probes a single port on target host using raw TCP Socket.
 * Captures banners for SSH (22), Telnet (23), and HTTP (80/443).
 */
export function probeNetworkPort(
  host: string,
  port: number,
  timeoutMs: number,
  activeSocketsSet?: Set<net.Socket>
): Promise<DiscoveredNetworkPortDetail> {
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
      const service = getNetworkServiceName(port);

      // Port 22 (SSH): wait briefly for SSH identification string
      if (port === 22) {
        let bannerText: string | undefined;
        const bannerTimer = setTimeout(() => {
          cleanup();
          resolve({ port, service, state: 'open', banner: bannerText, latencyMs: latency });
        }, Math.min(350, timeoutMs));

        socket.on('data', (chunk) => {
          clearTimeout(bannerTimer);
          const text = chunk.toString('utf-8').trim();
          if (text.startsWith('SSH-')) {
            bannerText = text.split('\r')[0].split('\n')[0];
          }
          cleanup();
          resolve({ port, service, state: 'open', banner: bannerText, latencyMs: latency });
        });
        return;
      }

      // Port 23 (Telnet): Cisco/network switches send IAC negotiation bytes or greeting banner
      if (port === 23) {
        let bannerText: string | undefined;
        const telnetTimer = setTimeout(() => {
          cleanup();
          resolve({ port, service, state: 'open', banner: bannerText || 'Telnet CLI Active', latencyMs: latency });
        }, Math.min(350, timeoutMs));

        socket.on('data', (chunk) => {
          clearTimeout(telnetTimer);
          // Check for IAC (0xFF) or printable text
          const rawText = chunk.toString('utf-8').replace(/[^\x20-\x7E\r\n]/g, '').trim();
          if (rawText.length > 0) {
            bannerText = rawText.split('\n')[0].substring(0, 80).trim();
          } else {
            bannerText = 'Telnet Protocol (IAC Negotiating)';
          }
          cleanup();
          resolve({ port, service, state: 'open', banner: bannerText, latencyMs: latency });
        });
        return;
      }

      // Port 80 (HTTP): send lightweight HEAD request to capture Server header
      if (port === 80) {
        let bannerText: string | undefined;
        try {
          socket.write(`HEAD / HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: NetTopology-Discovery\r\nConnection: close\r\n\r\n`);
        } catch {}

        const httpTimer = setTimeout(() => {
          cleanup();
          resolve({ port, service, state: 'open', banner: bannerText || 'HTTP Web Management', latencyMs: latency });
        }, Math.min(300, timeoutMs));

        socket.on('data', (chunk) => {
          clearTimeout(httpTimer);
          const text = chunk.toString('utf-8');
          const serverMatch = text.match(/Server:\s*([^\r\n]+)/i);
          if (serverMatch) {
            bannerText = `Server: ${serverMatch[1].trim()}`;
          } else {
            const firstLine = text.split('\r')[0].split('\n')[0].trim();
            if (firstLine.startsWith('HTTP/')) {
              bannerText = firstLine;
            }
          }
          cleanup();
          resolve({ port, service, state: 'open', banner: bannerText || 'HTTP Web Management', latencyMs: latency });
        });
        return;
      }

      // Port 443 (HTTPS) / 8291 (WinBox) / Custom ports: immediate connection
      cleanup();
      resolve({ port, service, state: 'open', latencyMs: latency });
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ port, service: getNetworkServiceName(port), state: 'filtered', latencyMs: timeoutMs });
    });

    socket.on('error', (err: any) => {
      const latency = Math.max(1, Date.now() - startTime);
      const isRefused = err?.code === 'ECONNREFUSED';
      cleanup();
      resolve({
        port,
        service: getNetworkServiceName(port),
        state: isRefused ? 'closed' : 'filtered',
        latencyMs: latency,
      });
    });

    try {
      socket.connect(port, host);
    } catch {
      cleanup();
      resolve({ port, service: getNetworkServiceName(port), state: 'filtered', latencyMs: timeoutMs });
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
 * Fingerprints network device based on banners, ports, and hostname heuristics
 */
export function fingerprintNetworkDevice(
  ip: string,
  openPorts: number[],
  portDetails: DiscoveredNetworkPortDetail[],
  hostname: string | null
): {
  deviceType: DeviceType;
  platform: DevicePlatform;
  suggestedRole: string;
  suggestedModel: string;
  preferredProtocol: 'ssh' | 'telnet';
} {
  const banners = portDetails.map((p) => (p.banner || '').toLowerCase()).join(' ');
  const hostStr = (hostname || '').toLowerCase();
  const allText = `${banners} ${hostStr}`;

  let platform: DevicePlatform = 'cisco_ios';
  let deviceType: DeviceType = 'switch';
  let suggestedRole = 'Access';
  let suggestedModel = 'Cisco Catalyst Switch';
  let preferredProtocol: 'ssh' | 'telnet' = openPorts.includes(22) ? 'ssh' : openPorts.includes(23) ? 'telnet' : 'ssh';

  // 1. MikroTik Detection
  if (allText.includes('mikrotik') || allText.includes('routeros') || openPorts.includes(8291)) {
    platform = 'mikrotik_routeros';
    deviceType = 'router';
    suggestedRole = 'Edge';
    suggestedModel = 'MikroTik Cloud Router';
    preferredProtocol = 'ssh';
    return { deviceType, platform, suggestedRole, suggestedModel, preferredProtocol };
  }

  // 2. Cisco IOS-XE vs Cisco IOS vs Cisco NX-OS Detection
  if (allText.includes('ios-xe') || allText.includes('catalyst 9') || allText.includes('c9300') || allText.includes('c9200')) {
    platform = 'cisco_ios_xe';
    deviceType = 'switch';
    suggestedRole = 'Distribution';
    suggestedModel = 'Cisco Catalyst 9000 Series';
  } else if (allText.includes('nexus') || allText.includes('nx-os')) {
    platform = 'cisco_ios_xe';
    deviceType = 'switch';
    suggestedRole = 'Core';
    suggestedModel = 'Cisco Nexus Switch';
  } else if (allText.includes('cisco') || allText.includes('catalyst') || allText.includes('user access verification') || openPorts.includes(23)) {
    platform = 'cisco_ios';
    deviceType = 'switch';
    suggestedRole = 'Access';
    suggestedModel = 'Cisco Catalyst 2960 / 3850';
  }

  // 3. Router heuristics
  if (allText.includes('router') || allText.includes('isr') || allText.includes('asr') || allText.includes('gateway') || hostStr.includes('rtr') || hostStr.includes('gw')) {
    deviceType = 'router';
    suggestedRole = 'Edge';
    suggestedModel = 'Cisco Integrated Services Router';
  }

  // 4. Firewall heuristics
  if (allText.includes('asa') || allText.includes('firepower') || allText.includes('fortigate') || allText.includes('firewall') || hostStr.includes('fw')) {
    deviceType = 'firewall';
    suggestedRole = 'Perimeter';
    suggestedModel = 'Cisco Adaptive Security Appliance';
  }

  // 5. Model extraction from banner if available
  const catalystMatch = banners.match(/(ws-c\d{4}[a-z0-9\-]*|c\d{4}[a-z0-9\-]*|isr\d{4}|asr\d{4})/i);
  if (catalystMatch) {
    suggestedModel = `Cisco ${catalystMatch[1].toUpperCase()}`;
  }

  return { deviceType, platform, suggestedRole, suggestedModel, preferredProtocol };
}

/**
 * Probes a target IP address across specified network ports
 */
export async function probeNetworkDevice(
  ip: string,
  targetPorts: number[] = [22, 23, 80, 443],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  existingDeviceMap = new Map<string, { id: string; name: string }>(),
  activeSocketsSet?: Set<net.Socket>
): Promise<DiscoveredNetworkDevice | null> {
  const probePromises = targetPorts.map((p) => probeNetworkPort(ip, p, timeoutMs, activeSocketsSet));
  const portResults = await Promise.all(probePromises);

  const openPortDetails = portResults.filter((r) => r.state === 'open');
  const hasClosed = portResults.some((r) => r.state === 'closed');

  // If host did not answer on any port (all 'filtered' / timed out), skip host
  if (openPortDetails.length === 0 && !hasClosed) {
    return null;
  }

  const openPorts = openPortDetails.map((r) => r.port).sort((a, b) => a - b);
  const minLatency = openPortDetails.length > 0
    ? Math.min(...openPortDetails.map((r) => r.latencyMs || timeoutMs))
    : timeoutMs;

  // Resolve hostname via fast reverse DNS
  const hostname = await resolveHostnameFast(ip);

  // Check inventory presence
  const existing = existingDeviceMap.get(ip);
  const alreadyInInventory = Boolean(existing);
  const existingDeviceId = existing?.id || null;
  const existingDeviceName = existing?.name || null;

  // Fingerprint device type, platform and role
  const fp = fingerprintNetworkDevice(ip, openPorts, openPortDetails, hostname);

  return {
    ip,
    hostname,
    deviceType: fp.deviceType,
    platform: fp.platform,
    suggestedRole: fp.suggestedRole,
    suggestedModel: fp.suggestedModel,
    openPorts,
    portDetails: openPortDetails,
    preferredProtocol: fp.preferredProtocol,
    latencyMs: minLatency,
    alreadyInInventory,
    existingDeviceId,
    existingDeviceName,
    discoveredAt: new Date().toISOString(),
    isRefusedOnly: openPorts.length === 0 && hasClosed,
  };
}

/**
 * Executes a chunked discovery scan across IP range with real-time SSE progress callbacks
 */
export async function executeChunkedNetworkDeviceDiscoveryScan(
  scanId: string,
  parsedRange: ParsedIpRangeResult,
  options: {
    ports?: number[];
    timeoutMs?: number;
    concurrency?: number;
    chunkSize?: number;
    onProgress?: (evt: {
      scanId: string;
      requested: number;
      total: number;
      scanned: number;
      found: number;
      currentChunk: number;
      totalChunks: number;
    }) => void;
    onDeviceFound?: (device: DiscoveredNetworkDevice) => void;
  }
): Promise<DiscoveredNetworkDevice[]> {
  const ports = options.ports && options.ports.length > 0 ? options.ports : [22, 23, 80, 443];
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;

  const scanState: ActiveNetworkScanState = {
    scanId,
    startTime: Date.now(),
    requested: parsedRange.requested,
    total: parsedRange.total,
    scanned: 0,
    found: 0,
    aborted: false,
    activeSockets: new Set(),
    results: [],
  };
  activeNetworkScans.set(scanId, scanState);

  // Load existing devices to flag alreadyInInventory
  let existingDevices: any[] = [];
  try {
    existingDevices = await getAllDevices();
  } catch (err) {
    console.warn('[Network Discovery: Warning reading existing devices]', err);
  }

  const existingDeviceMap = new Map<string, { id: string; name: string }>();
  for (const dev of existingDevices) {
    const ip = (dev.ip || dev.ssh_host || '').trim();
    if (ip) {
      existingDeviceMap.set(ip, { id: dev.id, name: dev.name });
    }
  }

  // Generate chunks from intervals
  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const interval of parsedRange.intervals) {
    for (let intVal = interval.start; intVal <= interval.end; intVal++) {
      currentChunk.push(intToIp(intVal));
      if (currentChunk.length >= chunkSize) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const totalChunks = Math.max(1, chunks.length);

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    if (scanState.aborted) {
      break;
    }

    const chunkIps = chunks[cIdx];

    // Concurrently process IPs within chunk using a sliding worker pool
    const queue = [...chunkIps];
    const workerPromises: Promise<void>[] = [];

    const worker = async () => {
      while (queue.length > 0) {
        if (scanState.aborted) break;
        const ip = queue.shift();
        if (!ip) break;

        try {
          const device = await probeNetworkDevice(
            ip,
            ports,
            timeoutMs,
            existingDeviceMap,
            scanState.activeSockets
          );

          scanState.scanned += 1;

          if (device) {
            scanState.found += 1;
            scanState.results.push(device);
            options.onDeviceFound?.(device);
          }
        } catch {
          scanState.scanned += 1;
        }
      }
    };

    const workerCount = Math.min(concurrency, chunkIps.length);
    for (let w = 0; w < workerCount; w++) {
      workerPromises.push(worker());
    }

    await Promise.all(workerPromises);

    options.onProgress?.({
      scanId,
      requested: scanState.requested,
      total: scanState.total,
      scanned: scanState.scanned,
      found: scanState.found,
      currentChunk: cIdx + 1,
      totalChunks,
    });
  }

  activeNetworkScans.delete(scanId);
  return scanState.results;
}
