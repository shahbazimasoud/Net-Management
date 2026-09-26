import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation, isLikelyApacheBinary } from './apacheDiscovery';
import { saveApacheConfigFileSafe, assertSafeApachePath } from './apacheSafeEditor';
import {
  ApacheScoreboardStats,
  ApacheModStatusTelemetry,
  ApacheCompressionStatus,
  ApacheCacheStatus,
  ApacheMpmTuningConfig,
  ApachePerformanceReport,
  ApachePerformanceTuneResult,
} from '../src/types';

/**
 * Shell script to inspect live Apache mod_status output, hardware memory/CPU,
 * worker process RSS memory usage, and compression/caching modules.
 */
const LIVE_PERFORMANCE_PROBE_SCRIPT = `export LC_ALL=C
echo "===HARDWARE_INFO==="
grep -E '^(MemTotal|MemAvailable|MemFree):' /proc/meminfo 2>/dev/null || true
echo "CPU_CORES:$(grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)"
echo "===WORKER_MEMORY==="
ps -eo rss,comm,args 2>/dev/null | awk '$2 ~ /^(apache2|httpd|httpd2)$/ {sum+=$1; count++} END {if (count>0) print count ":" int(sum/count) ":" sum; else print "0:0:0"}'
echo "===SERVER_STATUS_RAW==="
# Try curl on port 80 or 443 with Host header or localhost
curl -s --max-time 4 "http://127.0.0.1/server-status?auto" 2>/dev/null || \\
wget -qO- --timeout=4 "http://127.0.0.1/server-status?auto" 2>/dev/null || \\
curl -s --max-time 4 "http://localhost/server-status?auto" 2>/dev/null || \\
echo "UNAVAILABLE"
echo "===END_PERF_PROBE==="
`;

/**
 * Parses raw server-status?auto text output into structured telemetry metrics
 */
export function parseServerStatusOutput(rawText: string): {
  telemetry: ApacheModStatusTelemetry | null;
  scoreboard: ApacheScoreboardStats | null;
} {
  if (!rawText || rawText.includes('UNAVAILABLE') || !rawText.includes('Total Accesses:')) {
    return { telemetry: null, scoreboard: null };
  }

  const lines = rawText.split('\n');
  const map = new Map<string, string>();

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.substring(0, idx).trim();
      const v = line.substring(idx + 1).trim();
      map.set(k, v);
    }
  }

  const totalAccesses = parseInt(map.get('Total Accesses') || '0', 10);
  const totalKBytes = parseInt(map.get('Total kBytes') || '0', 10);
  const uptime = parseInt(map.get('Uptime') || '0', 10);
  const reqPerSec = parseFloat(map.get('ReqPerSec') || '0');
  const bytesPerSec = parseFloat(map.get('BytesPerSec') || '0');
  const bytesPerReq = parseFloat(map.get('BytesPerReq') || '0');
  const busyWorkers = parseInt(map.get('BusyWorkers') || '0', 10);
  const idleWorkers = parseInt(map.get('IdleWorkers') || '0', 10);
  const cpuLoad = parseFloat(map.get('CPULoad') || '0');
  const connsTotal = parseInt(map.get('ConnsTotal') || '0', 10);
  const connsAsyncWriting = parseInt(map.get('ConnsAsyncWriting') || '0', 10);
  const connsAsyncKeepAlive = parseInt(map.get('ConnsAsyncKeepAlive') || '0', 10);
  const connsAsyncClosing = parseInt(map.get('ConnsAsyncClosing') || '0', 10);
  const scoreboardStr = map.get('Scoreboard') || '';

  // Parse Scoreboard states
  const scoreboard: ApacheScoreboardStats = {
    raw: scoreboardStr,
    totalSlots: scoreboardStr.length,
    waitingForConnection: 0,
    startingUp: 0,
    readingRequest: 0,
    sendingReply: 0,
    keepalive: 0,
    dnsLookup: 0,
    closingConnection: 0,
    logging: 0,
    gracefullyFinishing: 0,
    idleCleanup: 0,
    openSlot: 0,
    activeWorkersCount: 0,
    utilizationPercent: 0,
  };

  for (let i = 0; i < scoreboardStr.length; i++) {
    const ch = scoreboardStr[i];
    switch (ch) {
      case '_':
        scoreboard.waitingForConnection++;
        break;
      case 'S':
        scoreboard.startingUp++;
        break;
      case 'R':
        scoreboard.readingRequest++;
        break;
      case 'W':
        scoreboard.sendingReply++;
        break;
      case 'K':
        scoreboard.keepalive++;
        break;
      case 'D':
        scoreboard.dnsLookup++;
        break;
      case 'C':
        scoreboard.closingConnection++;
        break;
      case 'L':
        scoreboard.logging++;
        break;
      case 'G':
        scoreboard.gracefullyFinishing++;
        break;
      case 'I':
        scoreboard.idleCleanup++;
        break;
      case '.':
      default:
        scoreboard.openSlot++;
        break;
    }
  }

  scoreboard.activeWorkersCount = busyWorkers > 0 ? busyWorkers : (
    scoreboard.readingRequest +
    scoreboard.sendingReply +
    scoreboard.keepalive +
    scoreboard.dnsLookup +
    scoreboard.closingConnection +
    scoreboard.logging
  );

  const nonOpenSlots = scoreboard.totalSlots - scoreboard.openSlot;
  scoreboard.utilizationPercent = nonOpenSlots > 0 ? Math.round((scoreboard.activeWorkersCount / nonOpenSlots) * 100) : 0;

  // Format uptime human string
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const uptimeHuman = `${days}d ${hours}h ${minutes}m`;

  const telemetry: ApacheModStatusTelemetry = {
    isStatusAvailable: true,
    totalAccesses,
    totalKBytes,
    totalMBytes: Math.round(totalKBytes / 1024),
    uptime,
    uptimeHuman,
    reqPerSec: Math.round(reqPerSec * 100) / 100,
    bytesPerSec: Math.round(bytesPerSec * 100) / 100,
    bytesPerReq: Math.round(bytesPerReq),
    busyWorkers,
    idleWorkers,
    cpuLoad,
    connsTotal,
    connsAsyncWriting,
    connsAsyncKeepAlive,
    connsAsyncClosing,
    testedAt: new Date().toISOString(),
  };

  return { telemetry, scoreboard };
}

/**
 * Discovers live performance metrics, mod_status telemetry, compression,
 * caching policies, and hardware-tailored MPM recommendations.
 */
export async function getApachePerformanceReport(
  server: RemoteServer,
  ephemeralPassword?: string,
  targetConfPath?: string
): Promise<ApachePerformanceReport> {
  const discovery = await discoverApacheInstallation(
    server,
    ephemeralPassword,
    targetConfPath ? { targetConfPath } : undefined
  );

  let rawStatusText = '';
  let totalMemKb = 1048576; // default 1GB
  let availMemKb = 524288;
  let cpuCores = 1;
  let workerCount = 0;
  let avgWorkerRssKb = 25600; // ~25MB default

  try {
    const rawOut = await runAdaptiveSshCommand(server, LIVE_PERFORMANCE_PROBE_SCRIPT, ephemeralPassword, 12000);
    
    if (rawOut.includes('===HARDWARE_INFO===')) {
      const hwSection = rawOut.split('===HARDWARE_INFO===')[1].split('===WORKER_MEMORY===')[0];
      const memMatch = /MemTotal:\s+(\d+)\s+kB/i.exec(hwSection);
      if (memMatch) totalMemKb = parseInt(memMatch[1], 10);
      const availMatch = /MemAvailable:\s+(\d+)\s+kB/i.exec(hwSection);
      if (availMatch) availMemKb = parseInt(availMatch[1], 10);
      const cpuMatch = /CPU_CORES:(\d+)/i.exec(hwSection);
      if (cpuMatch) cpuCores = Math.max(1, parseInt(cpuMatch[1], 10));
    }

    if (rawOut.includes('===WORKER_MEMORY===')) {
      const memSec = rawOut.split('===WORKER_MEMORY===')[1].split('===SERVER_STATUS_RAW===')[0].trim();
      const parts = memSec.split(':');
      if (parts.length >= 2) {
        workerCount = parseInt(parts[0], 10) || 0;
        avgWorkerRssKb = Math.max(1024, parseInt(parts[1], 10) || 25600);
      }
    }

    if (rawOut.includes('===SERVER_STATUS_RAW===')) {
      rawStatusText = rawOut.split('===SERVER_STATUS_RAW===')[1].split('===END_PERF_PROBE===')[0].trim();
    }
  } catch (err: any) {
    console.warn('[Apache Performance SSH Probe Error]:', err?.message || err);
  }

  // Parse server status output
  const { telemetry, scoreboard } = parseServerStatusOutput(rawStatusText);

  // Analyze Compression Status (mod_deflate / mod_brotli)
  const isDeflateLoaded = discovery.loadedModules.includes('mod_deflate') || discovery.loadedModules.includes('deflate');
  const isBrotliLoaded = discovery.loadedModules.includes('mod_brotli') || discovery.loadedModules.includes('brotli');

  const compression: ApacheCompressionStatus = {
    deflateEnabled: isDeflateLoaded,
    brotliEnabled: isBrotliLoaded,
    compressionLevel: 6,
    compressedMimeTypes: [
      'text/html',
      'text/plain',
      'text/xml',
      'text/css',
      'text/javascript',
      'application/javascript',
      'application/json',
      'application/xml',
      'image/svg+xml',
      'font/woff2',
    ],
    recommendedSnippet: `# Enable Production Compression (Gzip / Deflate & Brotli)
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json application/xml image/svg+xml
    DeflateCompressionLevel 6
</IfModule>
<IfModule mod_brotli.c>
    AddOutputFilterByType BROTLI_COMPRESS text/html text/plain text/xml text/css text/javascript application/javascript application/json application/xml image/svg+xml
</IfModule>`,
  };

  // Analyze Browser & Disk Caching (mod_expires, mod_headers, mod_cache)
  const isExpiresLoaded = discovery.loadedModules.includes('mod_expires') || discovery.loadedModules.includes('expires');
  const isHeadersLoaded = discovery.loadedModules.includes('mod_headers') || discovery.loadedModules.includes('headers');
  const isCacheLoaded = discovery.loadedModules.includes('mod_cache') || discovery.loadedModules.includes('cache');

  const cache: ApacheCacheStatus = {
    expiresEnabled: isExpiresLoaded,
    headersEnabled: isHeadersLoaded,
    diskCacheEnabled: isCacheLoaded,
    defaultExpiresHuman: '1 month',
    recommendedSnippet: `# High-Performance Browser Caching
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresDefault "access plus 1 month"
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/webp "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 year"
    ExpiresByType font/woff2 "access plus 1 year"
</IfModule>`,
  };

  // Compute Concurrency & Hardware Limits Tuning
  const activeMpm = discovery.activeMpm || 'event';
  const totalRamMb = Math.round(totalMemKb / 1024);
  const availRamMb = Math.round(availMemKb / 1024);
  const workerRssMb = Math.max(15, Math.round(avgWorkerRssKb / 1024));

  // Balanced calculation: Reserve 25% of RAM for OS and other daemons
  const ramForApacheMb = Math.max(256, Math.round(totalRamMb * 0.70));

  let recommendedStartServers = Math.min(cpuCores * 2, 4);
  let recommendedThreadsPerChild = 25;
  let recommendedMaxRequestWorkers = 150;
  let recommendedServerLimit = 16;
  let recommendedMaxConnectionsPerChild = 10000;

  if (activeMpm === 'prefork') {
    // In prefork, 1 worker process = 1 thread. MaxRequestWorkers must not exceed available RAM
    recommendedMaxRequestWorkers = Math.max(10, Math.min(400, Math.floor(ramForApacheMb / workerRssMb)));
    recommendedServerLimit = recommendedMaxRequestWorkers;
    recommendedStartServers = Math.max(4, cpuCores * 2);
    recommendedThreadsPerChild = 1;
  } else {
    // In event or worker MPM: threadsPerChild is usually 25 to 64
    recommendedThreadsPerChild = 25;
    const maxProcesses = Math.max(4, Math.floor(ramForApacheMb / (workerRssMb * 1.5)));
    recommendedMaxRequestWorkers = Math.min(1000, maxProcesses * recommendedThreadsPerChild);
    recommendedServerLimit = Math.ceil(recommendedMaxRequestWorkers / recommendedThreadsPerChild);
    recommendedStartServers = Math.max(2, Math.min(cpuCores, 4));
  }

  const mpmTuning: ApacheMpmTuningConfig = {
    activeMpm,
    hardware: {
      totalRamMb,
      availRamMb,
      cpuCores,
      averageWorkerRssMb: workerRssMb,
      currentActiveWorkers: workerCount,
    },
    currentDirectives: {
      startServers: recommendedStartServers,
      threadsPerChild: recommendedThreadsPerChild,
      maxRequestWorkers: recommendedMaxRequestWorkers,
      serverLimit: recommendedServerLimit,
      maxConnectionsPerChild: recommendedMaxConnectionsPerChild,
    },
    recommendedDirectives: {
      startServers: recommendedStartServers,
      minSpareThreads: 25,
      maxSpareThreads: 75,
      threadsPerChild: recommendedThreadsPerChild,
      maxRequestWorkers: recommendedMaxRequestWorkers,
      serverLimit: recommendedServerLimit,
      maxConnectionsPerChild: recommendedMaxConnectionsPerChild,
    },
    recommendedSnippet: `# Hardware-Tailored Concurrency Tuning for ${activeMpm.toUpperCase()} MPM (${cpuCores} Cores, ${totalRamMb} MB RAM)
<IfModule mpm_${activeMpm}_module>
    StartServers             ${recommendedStartServers}
    MinSpareThreads          25
    MaxSpareThreads          75
    ThreadLimit              64
    ThreadsPerChild          ${recommendedThreadsPerChild}
    MaxRequestWorkers        ${recommendedMaxRequestWorkers}
    MaxConnectionsPerChild   ${recommendedMaxConnectionsPerChild}
</IfModule>`,
  };

  return {
    testedAt: new Date().toISOString(),
    isStatusModuleLoaded: discovery.loadedModules.includes('mod_status') || discovery.loadedModules.includes('status'),
    isStatusAvailable: Boolean(telemetry && telemetry.isStatusAvailable),
    telemetry,
    scoreboard,
    compression,
    cache,
    mpmTuning,
  };
}

/**
 * Enables and configures mod_status with local-only access restrictions
 */
export async function enableApacheModStatus(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<ApachePerformanceTuneResult> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);

  let targetPath = '';
  if (discovery.osFamily === 'debian') {
    targetPath = '/etc/apache2/conf-available/status.conf';
  } else if (discovery.osFamily === 'rhel' || discovery.osFamily === 'alpine') {
    targetPath = '/etc/httpd/conf.d/status.conf';
  } else {
    targetPath = '/etc/apache2/conf-available/status.conf';
  }

  const statusConfigContent = `# Enable Apache Server Status Handler with strict local IP access
<IfModule mod_status.c>
    <Location /server-status>
        SetHandler server-status
        Require local
        Require ip 127.0.0.1 ::1
    </Location>
    ExtendedStatus On
</IfModule>
`;

  const saveRes = await saveApacheConfigFileSafe(
    server,
    targetPath,
    statusConfigContent,
    true,
    ephemeralPassword
  );

  // On Debian/Ubuntu, ensure module and config are enabled via a2enmod / a2enconf
  if (saveRes.success && discovery.osFamily === 'debian') {
    try {
      const enableScript = `if command -v a2enmod >/dev/null 2>&1; then
        a2enmod status 2>&1 || true
        a2enconf status 2>&1 || true
        systemctl reload ${discovery.serviceName || 'apache2'} 2>&1 || true
      fi`;
      await runAdaptiveSshCommand(server, enableScript, ephemeralPassword, 8000);
    } catch {
      // Best effort
    }
  }

  return {
    success: saveRes.success,
    filePath: saveRes.filePath,
    syntaxTestPassed: saveRes.syntaxTestPassed,
    syntaxOutput: saveRes.syntaxOutput,
    serviceReloaded: saveRes.serviceReloaded,
    error: saveRes.error,
  };
}

/**
 * Safely writes tuned performance, caching, or compression configuration,
 * tests syntax, and reloads gracefully with automatic rollback.
 */
export async function applyApachePerformanceTuning(
  server: RemoteServer,
  customContent: string,
  targetFilePath?: string,
  ephemeralPassword?: string
): Promise<ApachePerformanceTuneResult> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);

  let filePath = targetFilePath;
  if (!filePath) {
    if (discovery.osFamily === 'debian') {
      filePath = '/etc/apache2/conf-available/performance-tuning.conf';
    } else if (discovery.osFamily === 'rhel' || discovery.osFamily === 'alpine') {
      filePath = '/etc/httpd/conf.d/performance-tuning.conf';
    } else {
      filePath = discovery.confPath || '/etc/apache2/conf-available/performance-tuning.conf';
    }
  }

  const safeTarget = assertSafeApachePath(filePath);

  const saveRes = await saveApacheConfigFileSafe(
    server,
    safeTarget,
    customContent,
    true,
    ephemeralPassword
  );

  if (saveRes.success && safeTarget.includes('conf-available') && discovery.osFamily === 'debian') {
    try {
      const enableScript = `if command -v a2enconf >/dev/null 2>&1; then
        a2enconf performance-tuning 2>&1 || true
        systemctl reload ${discovery.serviceName || 'apache2'} 2>&1 || true
      fi`;
      await runAdaptiveSshCommand(server, enableScript, ephemeralPassword, 8000);
    } catch {
      // Best effort
    }
  }

  return {
    success: saveRes.success,
    filePath: saveRes.filePath,
    syntaxTestPassed: saveRes.syntaxTestPassed,
    syntaxOutput: saveRes.syntaxOutput,
    serviceReloaded: saveRes.serviceReloaded,
    error: saveRes.error,
  };
}
