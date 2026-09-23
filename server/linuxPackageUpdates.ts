import { exec } from 'child_process';
import { RemoteServer, LinuxPackageItem, LinuxPackageUpdateOverview, PackageUpdateJobStatus, PackageUpdateJobStep, LinuxPackageManagerType } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

/**
 * Execute command on target server:
 * If remote server, uses adaptive SSH.
 * If server is localhost (127.0.0.1 or localhost), tries SSH first, and if connection refused,
 * transparently executes locally via child_process so containerized or local servers always work.
 */
export async function executeServerCommand(
  server: RemoteServer,
  command: string,
  ephemeralPassword?: string,
  timeoutMs: number = 60000
): Promise<string> {
  const host = (server.ip || server.hostname || '').trim();
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';

  try {
    return await runAdaptiveSshCommand(server, command, ephemeralPassword, timeoutMs);
  } catch (sshErr: any) {
    if (isLocal) {
      // Execute command locally on host container
      return new Promise<string>((resolve, reject) => {
        exec(command, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err && !stdout) {
            return reject(new Error(stderr || err.message));
          }
          resolve(stdout || stderr || '');
        });
      });
    }
    throw sshErr;
  }
}

/**
 * Script to detect OS, package manager, upgradable packages, and installed packages
 */
const PACKAGE_INSPECTION_SCRIPT = `
export LC_ALL=C
export DEBIAN_FRONTEND=noninteractive

echo "---OS_INFO---"
cat /etc/os-release 2>/dev/null
uname -r
uname -m
hostname
uptime -p 2>/dev/null || uptime 2>/dev/null

echo "---PKG_MGR---"
if command -v apt-get >/dev/null 2>&1; then
  echo "apt"
elif command -v dnf >/dev/null 2>&1; then
  echo "dnf"
elif command -v yum >/dev/null 2>&1; then
  echo "yum"
elif command -v pacman >/dev/null 2>&1; then
  echo "pacman"
elif command -v apk >/dev/null 2>&1; then
  echo "apk"
elif command -v zypper >/dev/null 2>&1; then
  echo "zypper"
else
  echo "generic"
fi

echo "---UPGRADABLE---"
if command -v apt >/dev/null 2>&1; then
  apt list --upgradable 2>/dev/null
elif command -v dnf >/dev/null 2>&1; then
  dnf check-update 2>/dev/null
elif command -v yum >/dev/null 2>&1; then
  yum check-update 2>/dev/null
elif command -v pacman >/dev/null 2>&1; then
  pacman -Qu 2>/dev/null
fi

echo "---INSTALLED---"
if command -v dpkg-query >/dev/null 2>&1; then
  dpkg-query -W -f='\${Package}\\t\${Version}\\t\${Architecture}\\t\${binary:Summary}\\n' 2>/dev/null
elif command -v rpm >/dev/null 2>&1; then
  rpm -qa --qf '%{NAME}\\t%{VERSION}-%{RELEASE}\\t%{ARCH}\\t%{SUMMARY}\\n' 2>/dev/null
elif command -v pacman >/dev/null 2>&1; then
  pacman -Q 2>/dev/null | awk '{print $1 "\\t" $2 "\\tunknown\\tPackage installed via pacman"}'
elif command -v apk >/dev/null 2>&1; then
  apk info -v 2>/dev/null | sed -E 's/(.*)-([0-9].*)/\\1\\t\\2\\tunknown\\tAlpine package/'
fi
echo "---END---"
`;

/**
 * Fetch package updates and installed software list from Linux server
 */
export async function fetchLinuxPackageOverview(
  server: RemoteServer,
  ephemeralPassword?: string,
  refreshMetadata?: boolean
): Promise<LinuxPackageUpdateOverview> {
  // If user requested metadata refresh (apt update), run it first
  if (refreshMetadata) {
    const refreshCmd = 'sudo DEBIAN_FRONTEND=noninteractive apt-get update -y 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get update -y 2>&1 || dnf check-update 2>&1 || true';
    try {
      await executeServerCommand(server, refreshCmd, ephemeralPassword, 45000);
    } catch (e: any) {
      console.warn(`[PackageOverview] Refresh metadata warning for ${server.name}:`, e?.message);
    }
  }

  const rawOutput = await executeServerCommand(server, PACKAGE_INSPECTION_SCRIPT, ephemeralPassword, 35000);

  const sections: Record<string, string[]> = {};
  let currentSec = '';

  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSec = trimmed.replace(/---/g, '').trim();
      sections[currentSec] = [];
    } else if (currentSec) {
      sections[currentSec].push(line);
    }
  }

  // 1. Parse OS Info
  const osLines = sections['OS_INFO'] || [];
  let prettyName = 'Linux';
  let kernel = '';
  let arch = 'x86_64';
  let hostname = server.ip || 'linux-server';
  let uptime = '';

  for (const l of osLines) {
    const trimmed = l.trim();
    if (trimmed.startsWith('PRETTY_NAME=')) {
      prettyName = trimmed.replace(/^PRETTY_NAME=["']?/, '').replace(/["']?$/, '');
    }
  }
  if (osLines.length >= 2) kernel = osLines[osLines.length - 4]?.trim() || '';
  if (osLines.length >= 3) arch = osLines[osLines.length - 3]?.trim() || 'x86_64';
  if (osLines.length >= 4) hostname = osLines[osLines.length - 2]?.trim() || hostname;
  if (osLines.length >= 5) uptime = osLines[osLines.length - 1]?.trim() || '';

  // 2. Package Manager
  const pkgMgrStr = (sections['PKG_MGR']?.[0]?.trim() || 'apt') as LinuxPackageManagerType;
  const packageManager: LinuxPackageManagerType = ['apt', 'dnf', 'yum', 'pacman', 'zypper', 'apk'].includes(pkgMgrStr)
    ? pkgMgrStr
    : 'generic';

  // 3. Upgradable Packages parsing
  const upgradableMap = new Map<string, { candidateVersion: string; architecture?: string; isSecurity?: boolean }>();
  const upgradableLines = sections['UPGRADABLE'] || [];

  for (const line of upgradableLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Listing...') || trimmed.startsWith('Inst ') || trimmed.startsWith('Conf ')) {
      continue;
    }

    // APT format: curl/bookworm-security 7.88.1-10+deb12u16 amd64 [upgradable from: 7.88.1-10+deb12u15]
    // or: curl/jammy-updates 7.81.0-1ubuntu1.17 amd64 [upgradable from: 7.81.0-1ubuntu1.16]
    const aptMatch = trimmed.match(/^([^\/\s]+)\/([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+\[upgradable from:\s+([^\]]+)\]/i);
    if (aptMatch) {
      const pkgName = aptMatch[1];
      const repoDistro = aptMatch[2].toLowerCase();
      const candidateVer = aptMatch[3];
      const pkgArch = aptMatch[4];
      const isSecurity = repoDistro.includes('security') || repoDistro.includes('-sec');

      upgradableMap.set(pkgName, {
        candidateVersion: candidateVer,
        architecture: pkgArch,
        isSecurity,
      });
      continue;
    }

    // DNF / YUM format: package.x86_64   2.0.1-1.el9   repo
    const dnfMatch = trimmed.match(/^([^\s]+)\.([^\s]+)\s+([^\s]+)\s+([^\s]+)/);
    if (dnfMatch) {
      const pkgName = dnfMatch[1];
      const pkgArch = dnfMatch[2];
      const candidateVer = dnfMatch[3];
      const repo = dnfMatch[4].toLowerCase();
      const isSecurity = repo.includes('security');

      upgradableMap.set(pkgName, {
        candidateVersion: candidateVer,
        architecture: pkgArch,
        isSecurity,
      });
      continue;
    }

    // Generic match: name current -> target
    const genericMatch = trimmed.match(/^([^\s]+)\s+([^\s]+)\s*->\s*([^\s]+)/);
    if (genericMatch) {
      upgradableMap.set(genericMatch[1], {
        candidateVersion: genericMatch[3],
        isSecurity: false,
      });
    }
  }

  // 4. Installed Packages parsing
  const installedLines = sections['INSTALLED'] || [];
  const packages: LinuxPackageItem[] = [];
  const upgradablePackages: LinuxPackageItem[] = [];
  let securityCount = 0;

  for (const line of installedLines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const name = (parts[0] || '').trim();
    if (!name) continue;

    const currentVersion = (parts[1] || '').trim();
    const architecture = (parts[2] || '').trim();
    const summary = (parts[3] || '').trim();

    const upgradeInfo = upgradableMap.get(name);
    const isUpgradable = !!upgradeInfo;
    const isSecurity = upgradeInfo?.isSecurity || false;
    if (isSecurity) securityCount++;

    const status: LinuxPackageItem['status'] = isSecurity
      ? 'security_update'
      : isUpgradable
      ? 'update_available'
      : 'up_to_date';

    const item: LinuxPackageItem = {
      name,
      currentVersion,
      candidateVersion: upgradeInfo?.candidateVersion,
      architecture: architecture || upgradeInfo?.architecture,
      summary: summary || undefined,
      status,
      isSecurityUpdate: isSecurity,
      packageManager,
    };

    packages.push(item);
    if (isUpgradable) {
      upgradablePackages.push(item);
    }
  }

  // Sort upgradable packages first by security, then by name
  upgradablePackages.sort((a, b) => {
    if (a.isSecurityUpdate && !b.isSecurityUpdate) return -1;
    if (!a.isSecurityUpdate && b.isSecurityUpdate) return 1;
    return a.name.localeCompare(b.name);
  });

  // Sort full packages list
  packages.sort((a, b) => {
    if (a.status !== 'up_to_date' && b.status === 'up_to_date') return -1;
    if (a.status === 'up_to_date' && b.status !== 'up_to_date') return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    osInfo: {
      prettyName: prettyName || 'Linux Operating System',
      kernel: kernel || 'Linux Kernel',
      arch: arch || 'x86_64',
      hostname,
      packageManager,
      lastUpdated: new Date().toISOString(),
      uptime,
    },
    totalInstalled: packages.length,
    upgradableCount: upgradablePackages.length,
    securityCount,
    packages,
    upgradablePackages,
  };
}

// ========================================================
// ACTIVE PACKAGE UPDATE JOBS ENGINE
// ========================================================

const jobsStore = new Map<string, PackageUpdateJobStatus>();
const jobAbortControllers = new Map<string, { aborted: boolean }>();

export function getPackageUpdateJob(jobId: string): PackageUpdateJobStatus | null {
  return jobsStore.get(jobId) || null;
}

export function cancelPackageUpdateJob(jobId: string): boolean {
  const ctrl = jobAbortControllers.get(jobId);
  if (ctrl) {
    ctrl.aborted = true;
  }
  const job = jobsStore.get(jobId);
  if (job && job.status === 'running') {
    job.status = 'cancelled';
    job.currentStepDescription = 'Job cancelled by user';
    job.finishedAt = Date.now();
    return true;
  }
  return false;
}

export interface StartPackageUpdateOptions {
  mode: 'single' | 'selected' | 'all' | 'dist-upgrade' | 'repo-update' | 'autoremove';
  packages?: Array<{ name: string; currentVersion?: string; targetVersion?: string }>;
}

export function startPackageUpdateJob(
  server: RemoteServer,
  options: StartPackageUpdateOptions,
  ephemeralPassword?: string
): PackageUpdateJobStatus {
  const jobId = `pkg-job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const abortCtrl = { aborted: false };
  jobAbortControllers.set(jobId, abortCtrl);

  const initialSteps: PackageUpdateJobStep[] = (options.packages || []).map((p) => ({
    packageName: p.name,
    currentVersion: p.currentVersion || 'current',
    targetVersion: p.targetVersion || 'latest',
    status: 'pending',
  }));

  const job: PackageUpdateJobStatus = {
    jobId,
    status: 'running',
    mode: options.mode,
    totalPackages: options.mode === 'all' || options.mode === 'dist-upgrade' || options.mode === 'repo-update' || options.mode === 'autoremove'
      ? 1
      : Math.max(1, initialSteps.length),
    completedPackages: 0,
    successCount: 0,
    failedCount: 0,
    percentage: 0,
    currentPackageName: initialSteps[0]?.packageName || (options.mode === 'all' ? 'All Packages' : 'System'),
    currentStepDescription: 'Initiating package manager...',
    steps: initialSteps,
    startedAt: Date.now(),
    fullLog: '',
  };

  jobsStore.set(jobId, job);

  // Run in background asynchronously
  runJobExecution(server, job, options, ephemeralPassword, abortCtrl).catch((err) => {
    console.error(`[PackageUpdateJob ${jobId}] Uncaught error:`, err);
    job.status = 'failed';
    job.finishedAt = Date.now();
    job.fullLog += `\nFATAL JOB ERROR: ${err?.message || err}`;
  });

  return job;
}

async function runJobExecution(
  server: RemoteServer,
  job: PackageUpdateJobStatus,
  options: StartPackageUpdateOptions,
  ephemeralPassword: string | undefined,
  abortCtrl: { aborted: boolean }
) {
  const appendLog = (text: string) => {
    job.fullLog = (job.fullLog || '') + text + '\n';
  };

  appendLog(`[${new Date().toLocaleTimeString()}] Starting package update job: ${job.mode.toUpperCase()}`);
  appendLog(`Target server: ${server.name} (${server.ip || server.hostname})`);

  try {
    if (options.mode === 'repo-update') {
      job.currentStepDescription = 'Refreshing repository metadata (apt update / dnf check-update)...';
      job.percentage = 20;

      const cmd = 'sudo DEBIAN_FRONTEND=noninteractive apt-get update -y 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get update -y 2>&1 || dnf check-update 2>&1 || pacman -Sy 2>&1 || true';
      const output = await executeServerCommand(server, cmd, ephemeralPassword, 60000);
      appendLog(output);

      job.completedPackages = 1;
      job.successCount = 1;
      job.percentage = 100;
      job.status = 'completed';
      job.currentStepDescription = 'Repository update completed successfully.';
      job.finishedAt = Date.now();
      return;
    }

    if (options.mode === 'autoremove') {
      job.currentStepDescription = 'Cleaning unused dependencies and obsolete kernels (autoremove)...';
      job.percentage = 30;

      const cmd = 'sudo DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>&1 || dnf autoremove -y 2>&1 || true';
      const output = await executeServerCommand(server, cmd, ephemeralPassword, 90000);
      appendLog(output);

      job.completedPackages = 1;
      job.successCount = 1;
      job.percentage = 100;
      job.status = 'completed';
      job.currentStepDescription = 'Obsolete packages cleaned successfully.';
      job.finishedAt = Date.now();
      return;
    }

    if (options.mode === 'all' || options.mode === 'dist-upgrade') {
      const isDist = options.mode === 'dist-upgrade';
      job.currentStepDescription = isDist
        ? 'Executing full OS distribution upgrade (apt-get dist-upgrade)...'
        : 'Upgrading all packages across system (apt-get upgrade)...';
      job.percentage = 15;

      const upgradeCmd = isDist
        ? 'sudo DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y 2>&1 || dnf upgrade -y 2>&1 || pacman -Syu --noconfirm 2>&1'
        : 'sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get upgrade -y 2>&1 || dnf upgrade -y 2>&1 || pacman -Syu --noconfirm 2>&1';

      job.percentage = 40;
      const output = await executeServerCommand(server, upgradeCmd, ephemeralPassword, 180000);
      appendLog(output);

      job.completedPackages = 1;
      job.successCount = 1;
      job.percentage = 100;
      job.status = 'completed';
      job.currentStepDescription = isDist ? 'Full system distribution upgrade completed!' : 'All packages upgraded successfully!';
      job.finishedAt = Date.now();
      return;
    }

    // Individual or Selected Packages Upgrade
    const steps = job.steps;
    const total = steps.length;

    for (let i = 0; i < total; i++) {
      if (abortCtrl.aborted) {
        job.status = 'cancelled';
        job.currentStepDescription = 'Cancelled by user';
        appendLog(`[${new Date().toLocaleTimeString()}] Operation stopped by user.`);
        job.finishedAt = Date.now();
        return;
      }

      const step = steps[i];
      step.status = 'running';
      step.startTime = Date.now();
      job.currentPackageName = step.packageName;
      job.currentStepDescription = `Upgrading ${step.packageName} (${i + 1}/${total})...`;
      job.percentage = Math.floor((i / total) * 100);

      appendLog(`\n[${new Date().toLocaleTimeString()}] ---> Upgrading package: ${step.packageName}`);

      const installCmd = `sudo DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${step.packageName} 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${step.packageName} 2>&1 || dnf upgrade -y ${step.packageName} 2>&1 || pacman -S --noconfirm ${step.packageName} 2>&1`;

      try {
        const stepOutput = await executeServerCommand(server, installCmd, ephemeralPassword, 60000);
        step.output = stepOutput;
        step.endTime = Date.now();
        step.durationSec = Number(((step.endTime - step.startTime) / 1000).toFixed(1));
        step.status = 'success';
        job.successCount++;
        appendLog(stepOutput);
      } catch (err: any) {
        step.error = err.message || 'Package update failed';
        step.endTime = Date.now();
        step.durationSec = Number(((step.endTime - step.startTime) / 1000).toFixed(1));
        step.status = 'failed';
        job.failedCount++;
        appendLog(`ERROR updating ${step.packageName}: ${err.message}`);
      }

      job.completedPackages++;
      job.percentage = Math.floor((job.completedPackages / total) * 100);
    }

    job.status = job.failedCount > 0 ? (job.successCount > 0 ? 'completed' : 'failed') : 'completed';
    job.percentage = 100;
    job.currentStepDescription = `Completed ${job.successCount} of ${total} packages updated.`;
    job.finishedAt = Date.now();
    appendLog(`\n[${new Date().toLocaleTimeString()}] All steps finished. Success: ${job.successCount}, Failed: ${job.failedCount}`);
  } catch (err: any) {
    job.status = 'failed';
    job.currentStepDescription = `Execution halted: ${err.message || err}`;
    job.finishedAt = Date.now();
    appendLog(`FATAL ERROR: ${err.message || err}`);
  }
}
