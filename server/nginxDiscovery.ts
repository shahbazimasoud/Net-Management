import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

export interface NginxInstanceInfo {
  id: string;
  name: string;
  binaryPath: string;
  confPath?: string;
  prefixPath?: string;
  masterPid?: number;
  workerCount: number;
  user?: string;
  serviceName?: string;
  isPrimary: boolean;
  version?: string;
  status: 'active' | 'inactive' | 'unknown';
  commandLine?: string;
}

export interface NginxInstallationDetails {
  isInstalled: boolean;
  version?: string;
  binaryPath?: string;
  prefixPath?: string;
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
  compiledModules: string[];
  buildArguments: string[];
  osDistro?: string;
  osRelease?: string;
  osFamily: 'debian' | 'rhel' | 'alpine' | 'suse' | 'arch' | 'generic';
  packageManager?: 'apt' | 'dnf' | 'yum' | 'apk' | 'zypper' | 'source' | 'unknown';
  testedAt: string;
  configTestOk: boolean;
  configTestOutput?: string;
  instances?: NginxInstanceInfo[];
}

/**
 * Strict validator to guarantee the discovered binary is genuinely Nginx or OpenResty.
 * Strictly prevents system shells (/bin/bash, /bin/sh) or other tools from being treated as Nginx.
 */
export function isLikelyNginxBinary(binPath?: string): boolean {
  if (!binPath || typeof binPath !== 'string') return false;
  const clean = binPath.trim();
  if (!clean || clean.length < 3) return false;
  const base = clean.split('/').pop() || clean;
  if (base !== 'nginx' && base !== 'openresty' && !base.endsWith('nginx') && !base.endsWith('openresty')) {
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
 * Shell diagnostic script to inspect the Linux environment and discover real Nginx topology.
 * Process inspection isolates comm field to match ONLY real 'nginx' or 'openresty' executables,
 * preventing subshells or running scripts from being mistaken for Nginx master processes.
 */
const NGINX_DISCOVERY_SCRIPT = `export LC_ALL=C
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
# Find master PID safely without matching bash or subshell (comm must be nginx or openresty)
ps -eo pid,comm,args 2>/dev/null | awk '$2 ~ /^(nginx|openresty)$/ && /master/ {print $1}' || true
echo "---WORKERS---"
ps -eo pid,comm,args 2>/dev/null | awk '$2 ~ /^(nginx|openresty)$/ && /worker/ {print $1}' || true

echo "===PROC_BINARY==="
# If master process is running, determine real running binary from procfs
# Ensure we ONLY pick a real nginx/openresty executable, NEVER bash or shell running this script
REAL_MASTER_PID=$(ps -eo pid,comm,args 2>/dev/null | awk '$2 ~ /^(nginx|openresty)$/ && /master/ {print $1}' | head -n 1 || true)
if [ -z "$REAL_MASTER_PID" ]; then
  for p in $(pgrep -x nginx 2>/dev/null || true) $(pgrep -x openresty 2>/dev/null || true); do
    REAL_MASTER_PID="$p"
    break
  done
fi

if [ -n "$REAL_MASTER_PID" ] && [ -e "/proc/$REAL_MASTER_PID/exe" ]; then
  READ_EXE=$(readlink -f "/proc/$REAL_MASTER_PID/exe" 2>/dev/null || true)
  case "$READ_EXE" in
    */nginx|*/openresty|nginx|openresty)
      echo "$READ_EXE"
      ;;
  esac
fi

echo "===WHICH_BINARY==="
which nginx 2>/dev/null || type -p nginx 2>/dev/null || which openresty 2>/dev/null || true
# Check standard alternative paths
for p in /usr/sbin/nginx /usr/local/nginx/sbin/nginx /opt/nginx/sbin/nginx /usr/bin/nginx /sbin/nginx /usr/local/openresty/nginx/sbin/nginx; do
  if [ -x "$p" ]; then
    echo "$p"
  fi
done

echo "===SERVICE_MANAGER==="
if command -v systemctl >/dev/null 2>&1; then
  echo "systemd"
  echo "---SVC_NAME---"
  # Check unit files matching nginx
  systemctl list-unit-files --type=service 2>/dev/null | grep -i nginx | head -n 1 | awk '{print $1}' || echo "nginx.service"
  echo "---SVC_ACTIVE---"
  systemctl is-active nginx 2>/dev/null || systemctl is-active nginx.service 2>/dev/null || echo "unknown"
  echo "---SVC_ENABLED---"
  systemctl is-enabled nginx 2>/dev/null || systemctl is-enabled nginx.service 2>/dev/null || echo "unknown"
elif command -v rc-service >/dev/null 2>&1; then
  echo "openrc"
  echo "---SVC_NAME---"
  echo "nginx"
  echo "---SVC_ACTIVE---"
  rc-service nginx status 2>&1 || echo "unknown"
  echo "---SVC_ENABLED---"
  rc-update show 2>/dev/null | grep nginx || echo "unknown"
elif command -v service >/dev/null 2>&1; then
  echo "init.d"
  echo "---SVC_NAME---"
  echo "nginx"
  echo "---SVC_ACTIVE---"
  service nginx status 2>&1 || echo "unknown"
  echo "---SVC_ENABLED---"
  echo "unknown"
else
  echo "manual"
fi

echo "===MULTI_INSTANCES==="
ps -eo pid,comm,user,args 2>/dev/null | awk '$2 ~ /^(nginx|openresty)$/ && /master/ {print $1, $3, substr($0, index($0,$4))}' || true
echo "---ALL_UNITS---"
systemctl list-unit-files --type=service 2>/dev/null | grep -iE "(nginx|openresty)" | awk '{print $1}' || true
echo "---ALL_BINARIES---"
which -a nginx 2>/dev/null || true
which -a openresty 2>/dev/null || true
for p in /usr/sbin/nginx /usr/local/nginx/sbin/nginx /opt/nginx/sbin/nginx /usr/local/openresty/nginx/sbin/nginx /usr/bin/nginx /sbin/nginx; do
  if [ -x "$p" ]; then
    echo "$p"
  fi
done 2>/dev/null | sort -u

echo "===END_DISCOVERY==="
`;

/**
 * Execute dynamic discovery of Nginx on a real Linux server.
 */
export async function discoverNginxInstallation(
  server: RemoteServer,
  ephemeralPassword?: string,
  options?: { targetConfPath?: string; targetBinaryPath?: string }
): Promise<NginxInstallationDetails> {
  const testedAt = new Date().toISOString();

  // Initial skeleton
  const details: NginxInstallationDetails = {
    isInstalled: false,
    serviceManager: 'unknown',
    serviceActive: 'unknown',
    serviceEnabled: 'unknown',
    workerPids: [],
    workerCount: 0,
    compiledModules: [],
    buildArguments: [],
    osFamily: 'generic',
    testedAt,
    configTestOk: false,
    instances: [],
  };

  try {
    const rawOut = await runAdaptiveSshCommand(server, NGINX_DISCOVERY_SCRIPT, ephemeralPassword, 12000);

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
    }

    // 2. Parse Processes
    if (rawOut.includes('===PROCESSES===')) {
      const procPart = rawOut.split('===PROCESSES===')[1].split('===PROC_BINARY===')[0] || '';
      const masterPart = procPart.split('---WORKERS---')[0] || '';
      const workersPart = procPart.split('---WORKERS---')[1] || '';

      const masterPidNum = parseInt(masterPart.trim().split(/\s+/)[0], 10);
      if (!isNaN(masterPidNum) && masterPidNum > 0) {
        details.masterPid = masterPidNum;
      }

      const workers = workersPart
        .trim()
        .split(/\s+/)
        .map((p) => parseInt(p, 10))
        .filter((p) => !isNaN(p) && p > 0);

      details.workerPids = workers;
      details.workerCount = workers.length;
    }

    // 3. Resolve Real Binary Path (guaranteed to be genuine Nginx / OpenResty)
    let chosenBinary = '';
    if (rawOut.includes('===PROC_BINARY===')) {
      const procBin = rawOut.split('===PROC_BINARY===')[1].split('===WHICH_BINARY===')[0].trim();
      const lines = procBin.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (isLikelyNginxBinary(line)) {
          chosenBinary = line;
          break;
        }
      }
    }

    if (!chosenBinary && rawOut.includes('===WHICH_BINARY===')) {
      const whichBin = rawOut.split('===WHICH_BINARY===')[1].split('===SERVICE_MANAGER===')[0].trim();
      const lines = whichBin.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const candidate of lines) {
        if (isLikelyNginxBinary(candidate)) {
          chosenBinary = candidate;
          break;
        }
      }
    }

    // 4. Parse Service Manager & Status
    if (rawOut.includes('===SERVICE_MANAGER===')) {
      const svcBlock = rawOut.split('===SERVICE_MANAGER===')[1].split('===END_DISCOVERY===')[0] || '';
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

      details.serviceName = svcNameStr ? svcNameStr.replace(/\.service$/, '') : 'nginx';

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

    // 5. If verified Nginx binary found, query version and build arguments (`nginx -V`)
    if (chosenBinary && isLikelyNginxBinary(chosenBinary)) {
      details.isInstalled = true;
      details.binaryPath = chosenBinary;

      const vCmd = `${chosenBinary} -V 2>&1`;
      try {
        const vOutput = await runAdaptiveSshCommand(server, vCmd, ephemeralPassword, 8000);
        parseNginxBuildInfo(vOutput, details);
      } catch (err: any) {
        // Continue even if -V errored
      }

      // 6. Override target paths if requested
      if (options?.targetConfPath) {
        details.confPath = options.targetConfPath;
      }
      if (options?.targetBinaryPath && isLikelyNginxBinary(options.targetBinaryPath)) {
        chosenBinary = options.targetBinaryPath;
        details.binaryPath = chosenBinary;
      }

      // 7. Run safe configuration test (`nginx -t`) strictly using verified Nginx binary
      const testArgs = details.confPath ? `-c "${details.confPath}"` : '';
      const tCmd = `${chosenBinary} ${testArgs} -t 2>&1`;
      try {
        const tOutput = await runAdaptiveSshCommand(server, tCmd, ephemeralPassword, 8000);
        details.configTestOutput = tOutput.trim();
        details.configTestOk = tOutput.includes('syntax is ok') && tOutput.includes('test is successful');
      } catch (err: any) {
        details.configTestOk = false;
        details.configTestOutput = err?.message || 'Failed to execute configuration syntax test';
      }
    } else {
      details.isInstalled = false;
      details.configTestOk = false;
      details.configTestOutput = 'Nginx is not installed or binary not found in standard system paths.';
    }

    // 8. Parse Multi-Instances from procfs, systemd & binaries
    const instances: NginxInstanceInfo[] = [];
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
            let prefixPath: string | undefined;

            const cMatch = cmdLine.match(/-c\s*["']?([^\s"']+)["']?/);
            if (cMatch) confPath = cMatch[1];

            const pMatch = cmdLine.match(/-p\s*["']?([^\s"']+)["']?/);
            if (pMatch) prefixPath = pMatch[1];

            const isResty = cmdLine.toLowerCase().includes('openresty');
            const binMatch = cmdLine.match(/(\/[^\s]+nginx|\/[^\s]+openresty|[a-zA-Z0-9_\-\/]+nginx)/);
            const instanceBin = (binMatch && isLikelyNginxBinary(binMatch[1])) ? binMatch[1] : (details.binaryPath || '/usr/sbin/nginx');

            const isPrimary = pid === details.masterPid || instances.length === 0;
            const workerCount = pid === details.masterPid ? details.workerCount : 1;

            const name = isResty
              ? `OpenResty Instance (PID ${pid})`
              : confPath
              ? `Nginx [${confPath}] (PID ${pid})`
              : isPrimary
              ? `Primary System Nginx (PID ${pid})`
              : `Nginx Worker/Instance (PID ${pid})`;

            instances.push({
              id: `inst-${pid}`,
              name,
              binaryPath: instanceBin,
              confPath: confPath || (isPrimary ? details.confPath : undefined),
              prefixPath: prefixPath || (isPrimary ? details.prefixPath : undefined),
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
          if (unitName !== 'nginx' || instances.length === 0) {
            instances.push({
              id: `unit-${unitName}`,
              name: `Service Unit: ${unit}`,
              binaryPath: details.binaryPath || '/usr/sbin/nginx',
              serviceName: unitName,
              workerCount: 0,
              isPrimary: instances.length === 0,
              status: 'inactive',
            });
          }
        }
      }

      for (const bin of discoveredBinaries) {
        if (isLikelyNginxBinary(bin) && !instances.some((i) => i.binaryPath === bin)) {
          const isResty = bin.includes('openresty');
          instances.push({
            id: `bin-${bin.replace(/[^a-zA-Z0-9]/g, '_')}`,
            name: isResty ? `OpenResty (${bin})` : `Installed Binary (${bin})`,
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
        name: 'Primary System Nginx',
        binaryPath: details.binaryPath,
        confPath: details.confPath,
        prefixPath: details.prefixPath,
        masterPid: details.masterPid,
        workerCount: details.workerCount,
        serviceName: details.serviceName,
        isPrimary: true,
        status: details.serviceActive === 'active' ? 'active' : 'inactive',
      });
    }

    details.instances = instances;
  } catch (err: any) {
    details.configTestOutput = err?.message || 'SSH connection failure during Nginx discovery';
  }

  return details;
}

/**
 * Parses the raw output of `nginx -V`
 */
function parseNginxBuildInfo(output: string, details: NginxInstallationDetails) {
  // Version match: nginx version: nginx/1.24.0 or openresty/1.21.4.1
  const verMatch = output.match(/nginx version:\s*([^\r\n]+)/i);
  if (verMatch) {
    details.version = verMatch[1].trim();
  }

  // Prefix path match: --prefix=/etc/nginx or --prefix=/usr/share/nginx
  const prefixMatch = output.match(/--prefix=([^\s]+)/);
  if (prefixMatch) {
    details.prefixPath = prefixMatch[1].trim();
  }

  // Conf path match: --conf-path=/etc/nginx/nginx.conf
  const confMatch = output.match(/--conf-path=([^\s]+)/);
  if (confMatch) {
    details.confPath = confMatch[1].trim();
  } else if (details.prefixPath) {
    details.confPath = `${details.prefixPath}/conf/nginx.conf`;
  }

  // PID path match: --pid-path=/run/nginx.pid or /var/run/nginx.pid
  const pidMatch = output.match(/--pid-path=([^\s]+)/);
  if (pidMatch) {
    details.pidPath = pidMatch[1].trim();
  }

  // Error log match: --error-log-path=/var/log/nginx/error.log
  const errLogMatch = output.match(/--error-log-path=([^\s]+)/);
  if (errLogMatch) {
    details.errorLogPath = errLogMatch[1].trim();
  }

  // Access log match: --http-log-path=/var/log/nginx/access.log
  const accLogMatch = output.match(/--http-log-path=([^\s]+)/);
  if (accLogMatch) {
    details.accessLogPath = accLogMatch[1].trim();
  }

  // Modules path match: --modules-path=/usr/lib/nginx/modules
  const modMatch = output.match(/--modules-path=([^\s]+)/);
  if (modMatch) {
    details.modulesPath = modMatch[1].trim();
  }

  // Configure arguments
  const argsMatch = output.match(/configure arguments:\s*([^\r\n]+)/i);
  if (argsMatch) {
    const rawArgs = argsMatch[1].trim();
    const argList = rawArgs.split(/\s+/).filter(Boolean);
    details.buildArguments = argList;

    // Extract compiled-in modules (--with-http_ssl_module, etc.)
    const mods = argList
      .filter((a) => a.startsWith('--with-') || a.startsWith('--add-module='))
      .map((a) => a.replace('--with-', '').replace('--add-module=', ''));
    details.compiledModules = mods;
  }
}
