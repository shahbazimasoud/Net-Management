import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

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
}

/**
 * Shell diagnostic script to inspect the Linux environment and discover real Nginx topology.
 * Does NOT assume Ubuntu/Debian paths. Discovers running binary via /proc/PID/exe or which/type.
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
# Check master process first
pgrep -f "nginx: master process" 2>/dev/null || true
echo "---WORKERS---"
pgrep -f "nginx: worker process" 2>/dev/null || true

echo "===PROC_BINARY==="
# If master process is running, determine real running binary from procfs
MASTER_PID=$(pgrep -f "nginx: master process" 2>/dev/null | head -n 1 || true)
if [ -n "$MASTER_PID" ] && [ -e "/proc/$MASTER_PID/exe" ]; then
  readlink -f "/proc/$MASTER_PID/exe" 2>/dev/null || true
fi

echo "===WHICH_BINARY==="
which nginx 2>/dev/null || type -p nginx 2>/dev/null || true
# Check standard alternative paths if not found
for p in /usr/sbin/nginx /usr/local/nginx/sbin/nginx /opt/nginx/sbin/nginx /usr/bin/nginx /sbin/nginx; do
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

echo "===END_DISCOVERY==="
`;

/**
 * Execute dynamic discovery of Nginx on a real Linux server.
 */
export async function discoverNginxInstallation(
  server: RemoteServer,
  ephemeralPassword?: string
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

    // 3. Resolve Real Binary Path
    let chosenBinary = '';
    if (rawOut.includes('===PROC_BINARY===')) {
      const procBin = rawOut.split('===PROC_BINARY===')[1].split('===WHICH_BINARY===')[0].trim();
      if (procBin && !procBin.includes('not found') && !procBin.includes('cannot')) {
        chosenBinary = procBin.split('\n')[0].trim();
      }
    }

    if (!chosenBinary && rawOut.includes('===WHICH_BINARY===')) {
      const whichBin = rawOut.split('===WHICH_BINARY===')[1].split('===SERVICE_MANAGER===')[0].trim();
      const lines = whichBin.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const candidate of lines) {
        if (candidate.endsWith('nginx')) {
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

    // 5. If binary found, query version and build arguments (`nginx -V`)
    if (chosenBinary) {
      details.isInstalled = true;
      details.binaryPath = chosenBinary;

      const vCmd = `${chosenBinary} -V 2>&1`;
      try {
        const vOutput = await runAdaptiveSshCommand(server, vCmd, ephemeralPassword, 8000);
        parseNginxBuildInfo(vOutput, details);
      } catch (err: any) {
        // Continue even if -V errored
      }

      // 6. Run safe configuration test (`nginx -t`) using discovered binary and discovered confPath
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
    }
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
