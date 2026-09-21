import { Client, ConnectConfig } from 'ssh2';
import { getRemoteServerById } from './db';
import { RemoteServer } from '../src/types';

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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i] || 'B'}`;
}

function formatUptime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

const TELEMETRY_SHELL_SCRIPT = `export LC_ALL=C
echo "---OS---"
uname -s 2>/dev/null || echo "Linux"
uname -r 2>/dev/null || echo "unknown"
uname -m 2>/dev/null || echo "x86_64"
if [ -f /etc/os-release ]; then
  cat /etc/os-release 2>/dev/null
elif [ -f /etc/redhat-release ]; then
  cat /etc/redhat-release 2>/dev/null
fi
echo "---HOSTNAME---"
hostname 2>/dev/null || cat /etc/hostname 2>/dev/null || echo "linux-host"
echo "---UPTIME---"
cat /proc/uptime 2>/dev/null || uptime 2>/dev/null || echo "0 0"
echo "---CPU_INFO---"
nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1
grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^[ \t]*//' || echo "Generic CPU"
cat /proc/loadavg 2>/dev/null || echo "0.00 0.00 0.00"
echo "---CPU_STAT---"
head -n 1 /proc/stat 2>/dev/null
sleep 0.25
head -n 1 /proc/stat 2>/dev/null
echo "---MEM---"
cat /proc/meminfo 2>/dev/null
echo "---DISK---"
df -k -P -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null || df -k -P 2>/dev/null
echo "---NET---"
cat /proc/net/dev 2>/dev/null
echo "---PROCS---"
ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu 2>/dev/null | head -n 11 || ps aux 2>/dev/null | awk 'NR>1 {print $2,$1,$3,$4,$11}' | head -n 10
echo "---END---"`;

export function parseLinuxTelemetry(rawOutput: string, host: string, port: number): LinuxServerLiveMetrics {
  const sections: Record<string, string[]> = {};
  let currentSection = '';

  const lines = rawOutput.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSection = trimmed.replace(/---/g, '').trim();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // 1. OS & Distro
  const osLines = sections['OS'] || [];
  const system = osLines[0]?.trim() || 'Linux';
  const kernel = osLines[1]?.trim() || '';
  const arch = osLines[2]?.trim() || 'x86_64';
  let distro = 'Linux';
  for (let i = 3; i < osLines.length; i++) {
    const l = osLines[i].trim();
    if (l.startsWith('PRETTY_NAME=')) {
      distro = l.replace(/^PRETTY_NAME=["']?/, '').replace(/["']?$/, '');
      break;
    } else if (l.startsWith('NAME=')) {
      distro = l.replace(/^NAME=["']?/, '').replace(/["']?$/, '');
    }
  }

  // 2. Hostname
  const hostLines = sections['HOSTNAME'] || [];
  const hostname = hostLines[0]?.trim() || host;

  // 3. Uptime
  const uptimeLines = sections['UPTIME'] || [];
  const uptimeRaw = (uptimeLines[0] || '').trim();
  const uptimeSecMatch = uptimeRaw.match(/^([0-9.]+)/);
  const uptimeSeconds = uptimeSecMatch ? Math.floor(parseFloat(uptimeSecMatch[1])) : 0;
  const uptimeFormatted = formatUptime(uptimeSeconds);

  // 4. CPU Info & Load Average
  const cpuInfoLines = sections['CPU_INFO'] || [];
  const cores = Math.max(1, parseInt(cpuInfoLines[0]?.trim() || '1', 10) || 1);
  const cpuModel = cpuInfoLines[1]?.trim() || 'Generic x86 CPU';
  const loadLine = (cpuInfoLines[2] || '').trim();
  const loadParts = loadLine.split(/\s+/);
  const loadAvg: [number, number, number] = [
    parseFloat(loadParts[0]) || 0,
    parseFloat(loadParts[1]) || 0,
    parseFloat(loadParts[2]) || 0,
  ];

  // 5. CPU Usage calculation from /proc/stat lines
  const cpuStatLines = sections['CPU_STAT'] || [];
  let usagePercent = 0;
  if (cpuStatLines.length >= 2) {
    const parseCpuStat = (row: string) => {
      const parts = row.trim().split(/\s+/).slice(1).map(Number);
      const idle = (parts[3] || 0) + (parts[4] || 0); // idle + iowait
      const total = parts.reduce((acc, val) => acc + (val || 0), 0);
      return { idle, total };
    };

    const s1 = parseCpuStat(cpuStatLines[0]);
    const s2 = parseCpuStat(cpuStatLines[1]);
    const idleDelta = s2.idle - s1.idle;
    const totalDelta = s2.total - s1.total;

    if (totalDelta > 0) {
      const rawPerc = ((totalDelta - idleDelta) / totalDelta) * 100;
      usagePercent = Math.max(0, Math.min(100, Math.round(rawPerc * 10) / 10));
    }
  } else if (loadAvg[0] > 0) {
    usagePercent = Math.max(0, Math.min(100, Math.round((loadAvg[0] / cores) * 1000) / 10));
  }

  // 6. Memory & Swap from /proc/meminfo
  const memLines = sections['MEM'] || [];
  let memTotalKb = 0;
  let memFreeKb = 0;
  let memAvailableKb = 0;
  let swapTotalKb = 0;
  let swapFreeKb = 0;

  for (const mLine of memLines) {
    const match = mLine.match(/^([A-Za-z0-9_()]+):\s+(\d+)\s+kB/);
    if (match) {
      const key = match[1];
      const val = parseInt(match[2], 10);
      if (key === 'MemTotal') memTotalKb = val;
      else if (key === 'MemFree') memFreeKb = val;
      else if (key === 'MemAvailable') memAvailableKb = val;
      else if (key === 'SwapTotal') swapTotalKb = val;
      else if (key === 'SwapFree') swapFreeKb = val;
    }
  }

  if (memAvailableKb === 0 && memTotalKb > 0) {
    memAvailableKb = memFreeKb;
  }

  const memTotalBytes = memTotalKb * 1024;
  const memAvailBytes = memAvailableKb * 1024;
  const memUsedBytes = Math.max(0, memTotalBytes - memAvailBytes);
  const memFreeBytes = memFreeKb * 1024;
  const memUsagePercent = memTotalBytes > 0 ? Math.round((memUsedBytes / memTotalBytes) * 1000) / 10 : 0;

  const swapTotalBytes = swapTotalKb * 1024;
  const swapUsedBytes = Math.max(0, (swapTotalKb - swapFreeKb) * 1024);
  const swapUsagePercent = swapTotalBytes > 0 ? Math.round((swapUsedBytes / swapTotalBytes) * 1000) / 10 : 0;

  // 7. Disks from df
  const diskLines = sections['DISK'] || [];
  const disks: LinuxServerDiskMetric[] = [];
  for (let i = 1; i < diskLines.length; i++) {
    const row = diskLines[i].trim();
    if (!row) continue;
    const parts = row.split(/\s+/);
    if (parts.length >= 6) {
      const filesystem = parts[0];
      const totalBlocks = parseInt(parts[1], 10) || 0;
      const usedBlocks = parseInt(parts[2], 10) || 0;
      const availBlocks = parseInt(parts[3], 10) || 0;
      const percStr = parts[4].replace('%', '');
      const mount = parts.slice(5).join(' ');

      const sizeBytes = totalBlocks * 1024;
      const usedBytes = usedBlocks * 1024;
      const availBytes = availBlocks * 1024;
      const usagePercent = parseInt(percStr, 10) || (sizeBytes > 0 ? Math.round((usedBytes / sizeBytes) * 100) : 0);

      disks.push({
        filesystem,
        mount,
        sizeBytes,
        usedBytes,
        availBytes,
        usagePercent,
        sizeHuman: formatBytes(sizeBytes),
        usedHuman: formatBytes(usedBytes),
        availHuman: formatBytes(availBytes),
      });
    }
  }

  // 8. Network Interfaces from /proc/net/dev
  const netLines = sections['NET'] || [];
  const networks: LinuxServerNetMetric[] = [];
  for (let i = 2; i < netLines.length; i++) {
    const row = netLines[i].trim();
    if (!row) continue;
    const colonIdx = row.indexOf(':');
    if (colonIdx === -1) continue;
    const ifaceName = row.substring(0, colonIdx).trim();
    if (ifaceName === 'lo') continue; // Skip loopback

    const dataParts = row.substring(colonIdx + 1).trim().split(/\s+/).map(Number);
    const rxBytes = dataParts[0] || 0;
    const rxPackets = dataParts[1] || 0;
    const txBytes = dataParts[8] || 0;
    const txPackets = dataParts[9] || 0;

    networks.push({
      interface: ifaceName,
      rxBytes,
      txBytes,
      rxPackets,
      txPackets,
      rxHuman: formatBytes(rxBytes),
      txHuman: formatBytes(txBytes),
    });
  }

  // 9. Top Processes from ps
  const procLines = sections['PROCS'] || [];
  const processes: LinuxServerProcessMetric[] = [];
  for (let i = 1; i < procLines.length; i++) {
    const row = procLines[i].trim();
    if (!row) continue;
    const parts = row.split(/\s+/);
    if (parts.length >= 5) {
      const pid = parseInt(parts[0], 10) || 0;
      const user = parts[1] || 'root';
      const cpuP = parseFloat(parts[2]) || 0;
      const memP = parseFloat(parts[3]) || 0;
      const command = parts.slice(4).join(' ');

      processes.push({
        pid,
        user,
        cpuPercent: cpuP,
        memPercent: memP,
        command,
      });
    }
  }

  return {
    timestamp: Date.now(),
    host,
    port,
    hostname,
    uptimeSeconds,
    uptimeFormatted,
    os: {
      system,
      kernel,
      arch,
      distro,
    },
    cpu: {
      usagePercent,
      cores,
      model: cpuModel,
      loadAvg,
    },
    memory: {
      totalBytes: memTotalBytes,
      usedBytes: memUsedBytes,
      freeBytes: memFreeBytes,
      availableBytes: memAvailBytes,
      usagePercent: memUsagePercent,
      totalHuman: formatBytes(memTotalBytes),
      usedHuman: formatBytes(memUsedBytes),
      freeHuman: formatBytes(memFreeBytes),
      swapTotalBytes,
      swapUsedBytes,
      swapUsagePercent,
      swapTotalHuman: formatBytes(swapTotalBytes),
      swapUsedHuman: formatBytes(swapUsedBytes),
    },
    disks,
    networks,
    processes,
  };
}

/**
 * Connects directly to the physical/virtual remote Linux server via SSH
 * and collects live, authentic system telemetry without any mock/simulated fallback.
 * Strictly adheres to Adaptive Protocol Negotiation (modern first, legacy fallback).
 */
export async function executeLinuxTelemetrySSH(
  server: RemoteServer,
  ephemeralPassword?: string,
  timeoutMs: number = 8000
): Promise<LinuxServerLiveMetrics> {
  const host = (server.ip || server.hostname || '').trim();
  const port = server.ssh_port || 22;
  const username = server.ssh_username || 'root';
  const password = ephemeralPassword || server.ssh_password || '';

  if (!host) {
    throw new Error('Server target IP or Hostname is not configured.');
  }

  const runAttempt = (useLegacyAlgorithms: boolean): Promise<string> => {
    return new Promise((resolve, reject) => {
      const client = new Client();
      let timer: NodeJS.Timeout | null = null;
      let settled = false;

      const finish = (err?: Error, output?: string) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          client.end();
        } catch {}
        if (err) reject(err);
        else resolve(output || '');
      };

      timer = setTimeout(() => {
        finish(new Error(`SSH connection to ${host}:${port} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      client.on('error', (err) => {
        finish(err);
      });

      client.on('ready', () => {
        client.exec(TELEMETRY_SHELL_SCRIPT, (err, stream) => {
          if (err) {
            return finish(err);
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data: Buffer) => {
            stdout += data.toString('utf-8');
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString('utf-8');
          });

          stream.on('close', (code: number) => {
            if (code !== 0 && !stdout.includes('---OS---')) {
              finish(new Error(`Telemetry command exited with code ${code}: ${stderr.trim()}`));
            } else {
              finish(undefined, stdout);
            }
          });
        });
      });

      const connectConfig: ConnectConfig = {
        host,
        port,
        username,
        readyTimeout: Math.min(timeoutMs, 10000),
      };

      if (password) {
        connectConfig.password = password;
      }

      if (useLegacyAlgorithms) {
        connectConfig.algorithms = {
          kex: [
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group-exchange-sha256',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-gcm',
            'aes128-gcm@openssh.com',
            'aes256-gcm',
            'aes256-gcm@openssh.com',
            'aes256-cbc',
            'aes192-cbc',
            'aes128-cbc',
            '3des-cbc',
          ],
          serverHostKey: [
            'ssh-rsa',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-dss',
            'ecdsa-sha2-nistp256',
            'ssh-ed25519',
          ],
        };
      }

      try {
        client.connect(connectConfig);
      } catch (e: any) {
        finish(e);
      }
    });
  };

  try {
    // 1. Attempt with standard modern ciphers and key exchanges
    const rawOutput = await runAttempt(false);
    return parseLinuxTelemetry(rawOutput, host, port);
  } catch (modernErr: any) {
    const errMsg = (modernErr?.message || '').toLowerCase();
    // Check if error is related to cipher or protocol mismatch
    const isCryptoMismatch =
      errMsg.includes('handshake') ||
      errMsg.includes('kex') ||
      errMsg.includes('cipher') ||
      errMsg.includes('key exchange') ||
      errMsg.includes('algorithm') ||
      errMsg.includes('no matching');

    if (isCryptoMismatch) {
      console.log(`[LinuxMonitor] Modern SSH handshake failed for ${host}:${port}, retrying with legacy-compatible algorithms...`);
      const legacyOutput = await runAttempt(true);
      return parseLinuxTelemetry(legacyOutput, host, port);
    }

    throw modernErr;
  }
}
