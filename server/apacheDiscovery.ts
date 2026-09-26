import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

export interface ApacheInstanceInfo {
  id: string;
  name: string;
  binaryPath: string;
  confPath?: string;
  serverRoot?: string;
  masterPid?: number;
  workerCount: number;
  user?: string;
  serviceName?: string;
  isPrimary: boolean;
  version?: string;
  status: 'active' | 'inactive' | 'unknown';
  commandLine?: string;
}

export interface ApacheInstallationDetails {
  isInstalled: boolean;
  version?: string;
  binaryPath?: string;
  controlBinaryPath?: string;
  serverRoot?: string;
  confPath?: string;
  pidPath?: string;
  errorLogPath?: string;
  accessLogPath?: string;
  modulesPath?: string;
  serviceName?: string;
  serviceManager: 'systemd' | 'openrc' | 'init.d' | 'manual' | 'unknown';
  serviceActive: 'active' | 'inactive' | 'failed' | 'unknown';
  serviceEnabled: 'enabled' | 'disabled' | 'unknown';
  masterPid?: number;
  workerPids: number[];
  workerCount: number;
  activeMpm?: string;
  compiledModules: string[];
  loadedModules: string[];
  buildArguments: string[];
  osDistro?: string;
  osRelease?: string;
  osFamily: 'debian' | 'rhel' | 'alpine' | 'suse' | 'arch' | 'generic';
  packageManager?: 'apt' | 'dnf' | 'yum' | 'apk' | 'zypper' | 'source' | 'unknown';
  testedAt: string;
  configTestOk: boolean;
  configTestOutput?: string;
  instances?: ApacheInstanceInfo[];
}

/**
 * Strict validator to guarantee the discovered binary is genuinely Apache HTTP Server.
 * Strictly prevents system shells (/bin/bash, /bin/sh) or other tools from being treated as Apache.
 */
export function isLikelyApacheBinary(binPath?: string): boolean {
  if (!binPath || typeof binPath !== 'string') return false;
  const clean = binPath.trim();
  if (!clean || clean.length < 3) return false;
  const base = clean.split('/').pop() || clean;
  if (
    base !== 'apache2' &&
    base !== 'httpd' &&
    base !== 'httpd2' &&
    base !== 'apachectl' &&
    base !== 'apache2ctl'
  ) {
    return false;
  }
  if (
    clean.includes('bash') ||
    clean.includes('/sh') ||
    clean === 'sh' ||
    clean.includes('python') ||
    clean.includes('perl') ||
    clean.includes('grep') ||
    clean.includes('awk') ||
    clean.includes('sed')
  ) {
    return false;
  }
  return true;
}

/**
 * Shell diagnostic script to inspect the Linux environment and discover real Apache topology.
 * Process inspection isolates comm field to match ONLY real 'httpd', 'apache2', or 'httpd2' executables,
 * preventing subshells or running scripts from being mistaken for Apache master processes.
 */
const APACHE_DISCOVERY_SCRIPT = `export LC_ALL=C
echo "===DISTRO_INFO==="
if [ -f /etc/os-release ]; then
  cat /etc/os-release 2>/dev/null
elif [ -f /etc/redhat-release ]; then
  cat /etc/redhat-release 2>/dev/null
elif [ -f /etc/alpine-release ]; then
  echo "NAME=Alpine Linux"
  cat /etc/alpine-release 2>/dev/null
fi

echo "===PROCESSES==="
# Find master PID safely without matching bash or subshell (comm must be httpd, apache2, or httpd2, ppid=1)
MASTER_PID=$(ps -eo pid,ppid,user,comm,args 2>/dev/null | awk '$4 ~ /^(httpd|apache2|httpd2)$/ && $2 == 1 {print $1; exit}' || true)
if [ -z "$MASTER_PID" ]; then
  # Fallback if container or custom launcher: master process is the oldest root-owned httpd/apache2
  MASTER_PID=$(ps -eo pid,user,comm,args 2>/dev/null | awk '$3 ~ /^(httpd|apache2|httpd2)$/ && $2 ~ /^(root|0)$/ {print $1; exit}' || true)
fi

if [ -n "$MASTER_PID" ]; then
  echo "MASTER:$MASTER_PID"
  echo "---WORKERS---"
  ps -eo pid,ppid,comm 2>/dev/null | awk -v m="$MASTER_PID" '$3 ~ /^(httpd|apache2|httpd2)$/ && $2 == m {print $1}' || true
else
  echo "MASTER:NONE"
  echo "---WORKERS---"
fi

echo "===PROC_BINARY==="
# If master process is running, determine real running binary from procfs
if [ -n "$MASTER_PID" ] && [ -e "/proc/$MASTER_PID/exe" ]; then
  READ_EXE=$(readlink -f "/proc/$MASTER_PID/exe" 2>/dev/null || true)
  case "$READ_EXE" in
    */httpd|*/apache2|*/httpd2|httpd|apache2|httpd2)
      echo "$READ_EXE"
      ;;
  esac
fi

echo "===WHICH_BINARY==="
which apache2 2>/dev/null || type -p apache2 2>/dev/null || true
which httpd 2>/dev/null || type -p httpd 2>/dev/null || true
which httpd2 2>/dev/null || type -p httpd2 2>/dev/null || true
which apachectl 2>/dev/null || type -p apachectl 2>/dev/null || true
which apache2ctl 2>/dev/null || type -p apache2ctl 2>/dev/null || true
# Check standard candidate paths across Linux distributions
for p in /usr/sbin/apache2 /usr/sbin/httpd /usr/local/apache2/bin/httpd /opt/apache/bin/httpd /opt/apache2/bin/httpd /usr/sbin/httpd2 /usr/bin/apache2 /usr/bin/httpd /sbin/httpd /sbin/apache2; do
  if [ -x "$p" ]; then
    echo "$p"
  fi
done

echo "===CONTROL_BINARY==="
for c in /usr/sbin/apache2ctl /usr/sbin/apachectl /usr/local/apache2/bin/apachectl /opt/apache/bin/apachectl /usr/bin/apache2ctl /usr/bin/apachectl; do
  if [ -x "$c" ]; then
    echo "$c"
    break
  fi
done

echo "===SERVICE_MANAGER==="
if command -v systemctl >/dev/null 2>&1; then
  echo "systemd"
  echo "---SVC_NAME---"
  # Find service unit matching apache2 or httpd
  systemctl list-unit-files --type=service 2>/dev/null | grep -iE "(apache2|httpd)" | head -n 1 | awk '{print $1}' || echo "apache2.service"
  echo "---SVC_ACTIVE---"
  systemctl is-active apache2 2>/dev/null || systemctl is-active httpd 2>/dev/null || systemctl is-active apache 2>/dev/null || echo "unknown"
  echo "---SVC_ENABLED---"
  systemctl is-enabled apache2 2>/dev/null || systemctl is-enabled httpd 2>/dev/null || systemctl is-enabled apache 2>/dev/null || echo "unknown"
elif command -v rc-service >/dev/null 2>&1; then
  echo "openrc"
  echo "---SVC_NAME---"
  echo "apache2"
  echo "---SVC_ACTIVE---"
  rc-service apache2 status 2>&1 || rc-service httpd status 2>&1 || echo "unknown"
  echo "---SVC_ENABLED---"
  rc-update show 2>/dev/null | grep -E "(apache2|httpd)" || echo "unknown"
elif command -v service >/dev/null 2>&1; then
  echo "init.d"
  echo "---SVC_NAME---"
  echo "apache2"
  echo "---SVC_ACTIVE---"
  service apache2 status 2>&1 || service httpd status 2>&1 || echo "unknown"
  echo "---SVC_ENABLED---"
  echo "unknown"
else
  echo "manual"
fi

echo "===MULTI_INSTANCES==="
ps -eo pid,ppid,comm,user,args 2>/dev/null | awk '$3 ~ /^(httpd|apache2|httpd2)$/ && $2 == 1 {print $1, $4, substr($0, index($0,$5))}' || true
echo "---ALL_UNITS---"
systemctl list-unit-files --type=service 2>/dev/null | grep -iE "(apache2|httpd)" | awk '{print $1}' || true
echo "---ALL_BINARIES---"
which -a apache2 2>/dev/null || true
which -a httpd 2>/dev/null || true
which -a httpd2 2>/dev/null || true
for p in /usr/sbin/apache2 /usr/sbin/httpd /usr/local/apache2/bin/httpd /opt/apache/bin/httpd /usr/sbin/httpd2 /usr/bin/apache2 /usr/bin/httpd; do
  if [ -x "$p" ]; then
    echo "$p"
  fi
done 2>/dev/null | sort -u

echo "===END_DISCOVERY==="
`;

/**
 * Execute dynamic discovery of Apache HTTP Server on a real Linux server.
 */
export async function discoverApacheInstallation(
  server: RemoteServer,
  ephemeralPassword?: string,
  options?: { targetConfPath?: string; targetBinaryPath?: string }
): Promise<ApacheInstallationDetails> {
  const testedAt = new Date().toISOString();

  // Initial skeleton
  const details: ApacheInstallationDetails = {
    isInstalled: false,
    serviceManager: 'unknown',
    serviceActive: 'unknown',
    serviceEnabled: 'unknown',
    workerPids: [],
    workerCount: 0,
    activeMpm: undefined,
    compiledModules: [],
    loadedModules: [],
    buildArguments: [],
    osFamily: 'generic',
    testedAt,
    configTestOk: false,
    instances: [],
  };

  try {
    const rawOut = await runAdaptiveSshCommand(server, APACHE_DISCOVERY_SCRIPT, ephemeralPassword, 12000);

    // 1. Parse Distro
    let distroBlock = '';
    if (rawOut.includes('===DISTRO_INFO===')) {
      distroBlock = rawOut.split('===DISTRO_INFO===')[1].split('===PROCESSES===')[0] || '';
    }

    const distroNameMatch = distroBlock.match(/^NAME="?([^"\n]+)"?/m);
    const distroVerMatch = distroBlock.match(/^VERSION_ID="?([^"\n]+)"?/m) || distroBlock.match(/^VERSION="?([^"\n]+)"?/m);
    const distroIdMatch = distroBlock.match(/^ID="?([^"\n]+)"?/m);
    const idLikeMatch = distroBlock.match(/^ID_LIKE="?([^"\n]+)"?/m);

    details.osDistro = distroNameMatch ? distroNameMatch[1] : undefined;
    details.osRelease = distroVerMatch ? distroVerMatch[1] : undefined;

    const idStr = ((distroIdMatch ? distroIdMatch[1] : '') + ' ' + (idLikeMatch ? idLikeMatch[1] : '') + ' ' + distroBlock).toLowerCase();
    if (idStr.includes('debian') || idStr.includes('ubuntu')) {
      details.osFamily = 'debian';
      details.packageManager = 'apt';
    } else if (idStr.includes('rhel') || idStr.includes('centos') || idStr.includes('rocky') || idStr.includes('alma') || idStr.includes('fedora')) {
      details.osFamily = 'rhel';
      details.packageManager = idStr.includes('fedora') || idStr.includes('rocky') || idStr.includes('alma') ? 'dnf' : 'yum';
    } else if (idStr.includes('alpine')) {
      details.osFamily = 'alpine';
      details.packageManager = 'apk';
    } else if (idStr.includes('suse')) {
      details.osFamily = 'suse';
      details.packageManager = 'zypper';
    } else if (idStr.includes('arch')) {
      details.osFamily = 'arch';
      details.packageManager = 'source';
    }

    // 2. Parse Processes
    if (rawOut.includes('===PROCESSES===')) {
      const procPart = rawOut.split('===PROCESSES===')[1].split('===PROC_BINARY===')[0] || '';
      const masterLine = procPart.split('---WORKERS---')[0] || '';
      const workersPart = procPart.split('---WORKERS---')[1] || '';

      const masterMatch = masterLine.match(/MASTER:(\d+)/);
      if (masterMatch) {
        const masterPidNum = parseInt(masterMatch[1], 10);
        if (!isNaN(masterPidNum) && masterPidNum > 0) {
          details.masterPid = masterPidNum;
        }
      }

      const workers = workersPart
        .trim()
        .split(/\s+/)
        .map((p) => parseInt(p, 10))
        .filter((p) => !isNaN(p) && p > 0);

      details.workerPids = workers;
      details.workerCount = workers.length;
    }

    // 3. Resolve Real Binary Path (guaranteed to be genuine Apache / httpd)
    let chosenBinary = '';
    if (rawOut.includes('===PROC_BINARY===')) {
      const procBin = rawOut.split('===PROC_BINARY===')[1].split('===WHICH_BINARY===')[0].trim();
      const lines = procBin.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (isLikelyApacheBinary(line)) {
          chosenBinary = line;
          break;
        }
      }
    }

    if (!chosenBinary && rawOut.includes('===WHICH_BINARY===')) {
      const whichBin = rawOut.split('===WHICH_BINARY===')[1].split('===CONTROL_BINARY===')[0].trim();
      const lines = whichBin.split('\n').map((l) => l.trim()).filter(Boolean);
      // Prefer server daemons (httpd or apache2) over control wrappers (apachectl)
      const sortedCandidates = [...lines].sort((a, b) => {
        const aIsDaemon = a.endsWith('/httpd') || a.endsWith('/apache2');
        const bIsDaemon = b.endsWith('/httpd') || b.endsWith('/apache2');
        if (aIsDaemon && !bIsDaemon) return -1;
        if (!aIsDaemon && bIsDaemon) return 1;
        return 0;
      });

      for (const candidate of sortedCandidates) {
        if (isLikelyApacheBinary(candidate)) {
          chosenBinary = candidate;
          break;
        }
      }
    }

    // Control Utility
    if (rawOut.includes('===CONTROL_BINARY===')) {
      const cBin = rawOut.split('===CONTROL_BINARY===')[1].split('===SERVICE_MANAGER===')[0].trim();
      const lines = cBin.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (isLikelyApacheBinary(line)) {
          details.controlBinaryPath = line;
          break;
        }
      }
    }

    // 4. Parse Service Manager & Status
    if (rawOut.includes('===SERVICE_MANAGER===')) {
      const svcBlock = rawOut.split('===SERVICE_MANAGER===')[1].split('===MULTI_INSTANCES===')[0] || '';
      const svcLines = svcBlock.split('\n').map((l) => l.trim()).filter(Boolean);
      const svcType = svcLines[0];

      if (svcType === 'systemd' || svcType === 'openrc' || svcType === 'init.d' || svcType === 'manual') {
        details.serviceManager = svcType;
      }

      let activeStr = '';
      let enabledStr = '';
      let svcNameStr = '';

      if (svcBlock.includes('---SVC_NAME---')) {
        svcNameStr = svcBlock.split('---SVC_NAME---')[1].split('---SVC_ACTIVE---')[0].trim();
      }
      if (svcBlock.includes('---SVC_ACTIVE---')) {
        activeStr = svcBlock.split('---SVC_ACTIVE---')[1].split('---SVC_ENABLED---')[0].trim().toLowerCase();
      }
      if (svcBlock.includes('---SVC_ENABLED---')) {
        enabledStr = svcBlock.split('---SVC_ENABLED---')[1].trim().toLowerCase();
      }

      details.serviceName = svcNameStr ? svcNameStr.replace(/\.service$/, '') : 'apache2';

      if (activeStr.includes('active') && !activeStr.includes('inactive')) {
        details.serviceActive = 'active';
      } else if (activeStr.includes('inactive') || activeStr.includes('dead') || activeStr.includes('stopped')) {
        details.serviceActive = 'inactive';
      } else if (activeStr.includes('failed')) {
        details.serviceActive = 'failed';
      }

      if (enabledStr.includes('enabled')) {
        details.serviceEnabled = 'enabled';
      } else if (enabledStr.includes('disabled')) {
        details.serviceEnabled = 'disabled';
      }
    }

    // If masterPid was found, service is active
    if (details.masterPid) {
      details.serviceActive = 'active';
    }

    // 5. If verified Apache binary found, query version and build arguments (`httpd -V` / `apache2 -V`)
    if (chosenBinary && isLikelyApacheBinary(chosenBinary)) {
      details.isInstalled = true;
      details.binaryPath = chosenBinary;

      // 5a. Query build parameters & MPM: `binary -V`
      const vCmd = `${chosenBinary} -V 2>&1`;
      try {
        const vOutput = await runAdaptiveSshCommand(server, vCmd, ephemeralPassword, 8000);
        parseApacheBuildInfo(vOutput, details);
      } catch (err: any) {
        // Continue even if -V errored
      }

      // 5b. Query loaded modules: `binary -M`
      const mCmd = `${chosenBinary} -M 2>&1`;
      try {
        const mOutput = await runAdaptiveSshCommand(server, mCmd, ephemeralPassword, 8000);
        parseApacheModules(mOutput, details);
      } catch (err: any) {
        // Continue even if -M errored
      }

      // 6. Override target paths if requested by user
      if (options?.targetConfPath) {
        details.confPath = options.targetConfPath;
      }
      if (options?.targetBinaryPath && isLikelyApacheBinary(options.targetBinaryPath)) {
        chosenBinary = options.targetBinaryPath;
        details.binaryPath = chosenBinary;
      }

      // 7. Run safe configuration test (`httpd -t` / `apache2 -t`) strictly using verified Apache binary
      const testArgs = details.confPath ? `-f "${details.confPath}"` : '';
      const tCmd = `${chosenBinary} ${testArgs} -t 2>&1`;
      try {
        const tOutput = await runAdaptiveSshCommand(server, tCmd, ephemeralPassword, 8000);
        details.configTestOutput = tOutput.trim();
        details.configTestOk = tOutput.toLowerCase().includes('syntax ok');
      } catch (err: any) {
        details.configTestOk = false;
        details.configTestOutput = err?.message || 'Failed to execute Apache configuration syntax test';
      }
    } else {
      details.isInstalled = false;
      details.configTestOk = false;
      details.configTestOutput = 'Apache is not installed or binary not found in standard system paths.';
    }

    // 8. Parse Multi-Instances from procfs, systemd & binaries
    const instances: ApacheInstanceInfo[] = [];
    if (rawOut.includes('===MULTI_INSTANCES===')) {
      const multiPart = rawOut.split('===MULTI_INSTANCES===')[1].split('===END_DISCOVERY===')[0] || '';
      const procLines = multiPart.split('---ALL_UNITS---')[0].trim().split('\n').filter(Boolean);
      const unitsBlock = multiPart.split('---ALL_UNITS---')[1]?.split('---ALL_BINARIES---')[0] || '';
      const binariesBlock = multiPart.split('---ALL_BINARIES---')[1] || '';

      const discoveredUnits = unitsBlock.split('\n').map((u) => u.trim()).filter(Boolean);
      const discoveredBinaries = binariesBlock.split('\n').map((b) => b.trim()).filter(Boolean);

      // Parse running master processes
      for (const line of procLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const pid = parseInt(parts[0], 10);
          const user = parts[1];
          const cmdLine = parts.slice(2).join(' ');

          if (!isNaN(pid) && pid > 0) {
            let confPath: string | undefined;
            let serverRoot: string | undefined;

            const fMatch = cmdLine.match(/-f\s*["']?([^\s"']+)["']?/);
            if (fMatch) confPath = fMatch[1];

            const dMatch = cmdLine.match(/-d\s*["']?([^\s"']+)["']?/);
            if (dMatch) serverRoot = dMatch[1];

            const binMatch = cmdLine.match(/(\/[^\s]+apache2|\/[^\s]+httpd|\/[^\s]+httpd2|[a-zA-Z0-9_\-\/]+httpd)/);
            const instanceBin = (binMatch && isLikelyApacheBinary(binMatch[1])) ? binMatch[1] : (details.binaryPath || '/usr/sbin/apache2');

            const isPrimary = pid === details.masterPid || instances.length === 0;
            const workerCount = pid === details.masterPid ? details.workerCount : 1;

            const name = confPath
              ? `Apache [${confPath}] (PID ${pid})`
              : isPrimary
              ? `Primary System Apache (PID ${pid})`
              : `Apache Instance (PID ${pid})`;

            instances.push({
              id: `inst-${pid}`,
              name,
              binaryPath: instanceBin,
              confPath: confPath || (isPrimary ? details.confPath : undefined),
              serverRoot: serverRoot || (isPrimary ? details.serverRoot : undefined),
              masterPid: pid,
              workerCount,
              user,
              isPrimary,
              status: 'active',
              commandLine: cmdLine,
            });
          }
        }
      }

      // Check inactive units/binaries if not already in running instances
      for (const unit of discoveredUnits) {
        if (!instances.some((i) => i.serviceName === unit || i.name.toLowerCase().includes(unit.toLowerCase()))) {
          const unitName = unit.replace(/\.service$/, '');
          if ((unitName !== 'apache2' && unitName !== 'httpd') || instances.length === 0) {
            instances.push({
              id: `unit-${unitName}`,
              name: `Service Unit: ${unit}`,
              binaryPath: details.binaryPath || '/usr/sbin/apache2',
              serviceName: unitName,
              workerCount: 0,
              isPrimary: instances.length === 0,
              status: 'inactive',
            });
          }
        }
      }

      for (const bin of discoveredBinaries) {
        if (isLikelyApacheBinary(bin) && !instances.some((i) => i.binaryPath === bin)) {
          instances.push({
            id: `bin-${bin.replace(/[^a-zA-Z0-9]/g, '_')}`,
            name: `Installed Binary (${bin})`,
            binaryPath: bin,
            workerCount: 0,
            isPrimary: instances.length === 0,
            status: 'inactive',
          });
        }
      }
    }

    if (instances.length === 0 && details.isInstalled && details.binaryPath) {
      instances.push({
        id: 'inst-primary',
        name: 'Primary System Apache',
        binaryPath: details.binaryPath,
        confPath: details.confPath,
        serverRoot: details.serverRoot,
        masterPid: details.masterPid,
        workerCount: details.workerCount,
        serviceName: details.serviceName,
        isPrimary: true,
        status: details.serviceActive === 'active' ? 'active' : 'inactive',
      });
    }

    details.instances = instances;
  } catch (err: any) {
    details.configTestOutput = err?.message || 'SSH connection failure during Apache discovery';
  }

  return details;
}

/**
 * Parses the raw output of `httpd -V` or `apache2 -V`
 */
function parseApacheBuildInfo(output: string, details: ApacheInstallationDetails) {
  // Version match: Server version: Apache/2.4.58 (Ubuntu) or Apache/2.4.57 (Red Hat Enterprise Linux)
  const verMatch = output.match(/Server version:\s*([^\r\n]+)/i);
  if (verMatch) {
    details.version = verMatch[1].trim();
  }

  // Active MPM match: Server MPM: event / worker / prefork
  const mpmMatch = output.match(/Server MPM:\s*([^\r\n]+)/i);
  if (mpmMatch) {
    details.activeMpm = mpmMatch[1].trim().toLowerCase();
  }

  // ServerRoot match: -D HTTPD_ROOT="/etc/apache2" or "/etc/httpd"
  const rootMatch = output.match(/-D\s+HTTPD_ROOT="([^"]+)"/);
  if (rootMatch) {
    details.serverRoot = rootMatch[1].trim();
  }

  // Config file match: -D SERVER_CONFIG_FILE="apache2.conf" or "conf/httpd.conf"
  const confMatch = output.match(/-D\s+SERVER_CONFIG_FILE="([^"]+)"/);
  if (confMatch) {
    const rawConf = confMatch[1].trim();
    if (rawConf.startsWith('/')) {
      details.confPath = rawConf;
    } else if (details.serverRoot) {
      details.confPath = `${details.serverRoot.replace(/\/$/, '')}/${rawConf}`;
    } else {
      details.confPath = rawConf;
    }
  }

  // Default PidLog: -D DEFAULT_PIDLOG="/var/run/apache2/apache2.pid" or "logs/httpd.pid"
  const pidMatch = output.match(/-D\s+DEFAULT_PIDLOG="([^"]+)"/);
  if (pidMatch) {
    const rawPid = pidMatch[1].trim();
    if (rawPid.startsWith('/')) {
      details.pidPath = rawPid;
    } else if (details.serverRoot) {
      details.pidPath = `${details.serverRoot.replace(/\/$/, '')}/${rawPid}`;
    } else {
      details.pidPath = rawPid;
    }
  }

  // Default ErrorLog: -D DEFAULT_ERRORLOG="logs/error_log" or "logs/error.log"
  const errLogMatch = output.match(/-D\s+DEFAULT_ERRORLOG="([^"]+)"/);
  if (errLogMatch) {
    const rawErr = errLogMatch[1].trim();
    if (rawErr.startsWith('/')) {
      details.errorLogPath = rawErr;
    } else if (details.serverRoot) {
      details.errorLogPath = `${details.serverRoot.replace(/\/$/, '')}/${rawErr}`;
    } else {
      details.errorLogPath = rawErr;
    }
  }

  // Collect compiler definitions (-D ...)
  const defMatches = output.match(/-D\s+([^\r\n]+)/g);
  if (defMatches) {
    details.buildArguments = defMatches.map((d) => d.replace(/^-D\s+/, '').trim());
  }
}

/**
 * Parses the raw output of `httpd -M` or `apache2 -M`
 */
function parseApacheModules(output: string, details: ApacheInstallationDetails) {
  const loaded: string[] = [];
  const compiled: string[] = [];

  const lines = output.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Matches e.g. "core_module (static)" or "ssl_module (shared)"
    const modMatch = line.match(/^([a-zA-Z0-9_]+)\s*\((static|shared)\)/i);
    if (modMatch) {
      const modName = modMatch[1];
      const modType = modMatch[2].toLowerCase();
      loaded.push(`${modName} (${modType})`);
      if (modType === 'static') {
        compiled.push(modName);
      }
    }
  }

  if (loaded.length > 0) {
    details.loadedModules = loaded;
  }
  if (compiled.length > 0) {
    details.compiledModules = compiled;
  }
}
