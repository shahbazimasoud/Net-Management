import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';

export type SshVersionMode = 'legacy' | 'modern';

export interface SshBackendResolution {
  version: SshVersionMode;
  pythonBin: string;
  scriptPath: string;
  venvDir: string;
  paramikoExpected: string;
  paramikoInstalled?: string;
  env: NodeJS.ProcessEnv;
}

/**
 * Safely and authoritatively determines the project root directory.
 * Checks environment variables (APP_DIR, INSTALL_DIR, PROJECT_ROOT),
 * directory structures (dist/, server/), and standard deployment locations (/opt/nettopology).
 */
export function getProjectRoot(): string {
  // 1. Explicit environment overrides
  const envDirs = [process.env.APP_DIR, process.env.INSTALL_DIR, process.env.PROJECT_ROOT];
  for (const envDir of envDirs) {
    if (envDir && fs.existsSync(path.join(envDir, 'backend', 'ssh_bridge.py'))) {
      return path.resolve(envDir);
    }
  }

  // 2. Derive from __dirname or process.cwd()
  const curDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [
    curDir,
    path.resolve(curDir, '..'),
    path.resolve(curDir, '../..'),
    process.cwd(),
    '/opt/nettopology',
    '/app/applet',
  ];

  for (const cand of candidates) {
    if (cand && fs.existsSync(path.join(cand, 'backend', 'ssh_bridge.py'))) {
      return path.resolve(cand);
    }
  }

  // Fallback to directory above if inside dist or server
  if (path.basename(curDir) === 'dist' || path.basename(curDir) === 'server') {
    return path.resolve(curDir, '..');
  }

  return path.resolve(curDir);
}

export const projectRoot = getProjectRoot();
export const SSH_BRIDGE_SCRIPT = path.resolve(projectRoot, 'backend', 'ssh_bridge.py');

/**
 * Finds an executable Python binary inside a virtual environment directory.
 * Checks bin/python, bin/python3, and Windows Scripts/python.exe.
 */
export function findVenvPython(venvDir: string): string | null {
  if (!venvDir) return null;
  const candidates = [
    path.join(venvDir, 'bin', 'python'),
    path.join(venvDir, 'bin', 'python3'),
    path.join(venvDir, 'Scripts', 'python.exe'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const stat = fs.statSync(c);
        if (stat.isFile()) {
          return path.resolve(c);
        }
      } catch {}
    }
  }
  return null;
}

/**
 * Verifies that Paramiko is installed and importable inside the given Python binary.
 * Ensures strict mode criteria (Paramiko 2.12.x for legacy, >=3.x for modern).
 */
export function verifyParamikoInPython(
  pythonBin: string,
  expectedMode: SshVersionMode
): { ok: boolean; version?: string; error?: string } {
  if (!pythonBin || !fs.existsSync(pythonBin)) {
    return { ok: false, error: `Python binary does not exist at '${pythonBin}'` };
  }

  try {
    const cmd = `"${pythonBin}" -c "import paramiko; print(paramiko.__version__)"`;
    const out = execSync(cmd, {
      timeout: 6000,
      env: { ...process.env, PYTHONWARNINGS: 'ignore' },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

    const ver = out.split('\n').filter(Boolean).pop()?.trim() || '';
    if (!ver) {
      return { ok: false, error: 'Empty output from Paramiko import check' };
    }

    if (expectedMode === 'legacy') {
      if (!ver.startsWith('2.12.')) {
        console.warn(`[SSH Backend Resolver] Warning: Legacy backend expected Paramiko 2.12.x, detected ${ver}`);
      }
    } else {
      const major = parseInt(ver.split('.')[0], 10);
      if (isNaN(major) || major < 3) {
        console.warn(`[SSH Backend Resolver] Warning: Modern backend expected Paramiko >=3.x, detected ${ver}`);
      }
    }

    return { ok: true, version: ver };
  } catch (err: any) {
    const errText = err.stderr ? String(err.stderr).trim() : err.message;
    return { ok: false, error: errText || 'Paramiko import failed' };
  }
}

/**
 * Resolves the candidate directory for a given backend version mode.
 */
export function getVenvDirForMode(version: SshVersionMode): { venvDir: string; pythonBin: string | null } {
  const root = getProjectRoot();
  const venvName = version === 'modern' ? 'venv_modern' : 'venv_legacy';

  // 1. Direct explicit Python binary environment variable
  const envPython =
    version === 'modern' ? process.env.SSH_VENV_MODERN_PYTHON : process.env.SSH_VENV_LEGACY_PYTHON;
  if (envPython && fs.existsSync(envPython)) {
    const resolvedPy = path.resolve(envPython);
    return { venvDir: path.dirname(path.dirname(resolvedPy)), pythonBin: resolvedPy };
  }

  // 2. Direct explicit VENV directory environment variable
  const envVenv = version === 'modern' ? process.env.SSH_VENV_MODERN : process.env.SSH_VENV_LEGACY;
  if (envVenv && fs.existsSync(envVenv)) {
    const py = findVenvPython(envVenv);
    if (py) {
      return { venvDir: path.resolve(envVenv), pythonBin: py };
    }
  }

  // 3. Search standard candidate locations
  const candidateDirs = [
    path.resolve(root, 'backend', venvName),
    path.resolve(root, venvName),
    path.resolve('/opt/nettopology/backend', venvName),
    path.resolve('/opt/nettopology', venvName),
  ];

  for (const cand of candidateDirs) {
    if (fs.existsSync(cand)) {
      const py = findVenvPython(cand);
      if (py) {
        return { venvDir: cand, pythonBin: py };
      }
    }
  }

  // Default target directory for creation
  const defaultDir = path.resolve(root, 'backend', venvName);
  return { venvDir: defaultDir, pythonBin: findVenvPython(defaultDir) };
}

export const LEGACY_PYTHON_BIN = getVenvDirForMode('legacy').pythonBin || path.resolve(projectRoot, 'backend', 'venv_legacy', 'bin', 'python');
export const MODERN_PYTHON_BIN = getVenvDirForMode('modern').pythonBin || path.resolve(projectRoot, 'backend', 'venv_modern', 'bin', 'python');

let isAutoProvisioning = false;

/**
 * Single Authoritative Backend Resolver:
 * Given an ssh_version value ("legacy" | "modern"), returns the correct
 * Python executable and script with absolute paths. All SSH code paths (Test & Fetch, Terminal,
 * Port modal) must use this resolver, with strictly NO fallback to system Python.
 */
export function resolveSshBackend(sshVersion?: string | null): SshBackendResolution {
  const clean = String(sshVersion || '').toLowerCase().trim();
  const version: SshVersionMode = clean.includes('modern') ? 'modern' : 'legacy';

  let { venvDir, pythonBin } = getVenvDirForMode(version);
  const scriptPath = SSH_BRIDGE_SCRIPT;

  // Verify whether pythonBin exists and Paramiko is functional
  let verifyResult = pythonBin ? verifyParamikoInPython(pythonBin, version) : { ok: false, error: 'No python binary' };

  // If missing or broken, attempt auto-provisioning via setup script
  if (!verifyResult.ok && !isAutoProvisioning) {
    const setupScript = path.resolve(getProjectRoot(), 'scripts', 'setup-ssh-venvs.sh');
    if (fs.existsSync(setupScript)) {
      console.warn(`[SSH Backend Resolver] Dedicated ${version.toUpperCase()} Python venv with Paramiko not verified at '${pythonBin || venvDir}'. Running setup script: ${setupScript}...`);
      try {
        isAutoProvisioning = true;
        execSync(`bash "${setupScript}" "${getProjectRoot()}"`, {
          timeout: 120000,
          stdio: 'inherit',
        });
      } catch (provErr: any) {
        console.error(`[SSH Backend Resolver] Auto-provision script error: ${provErr.message}`);
      } finally {
        isAutoProvisioning = false;
      }

      // Re-check after auto-provision attempt
      const refreshed = getVenvDirForMode(version);
      venvDir = refreshed.venvDir;
      pythonBin = refreshed.pythonBin;
      if (pythonBin) {
        verifyResult = verifyParamikoInPython(pythonBin, version);
      }
    }
  }

  // Absolute Prohibition of Fallback to System Python
  if (!pythonBin || !verifyResult.ok) {
    const errMsg = `SSH backend '${version}' is not installed: run scripts/setup-ssh-venvs.sh`;
    console.error(`[SSH Backend Resolver] CRITICAL ERROR: ${errMsg} (Detected error: ${verifyResult.error})`);
    throw new Error(errMsg);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VIRTUAL_ENV: venvDir,
    PATH: `${path.join(venvDir, 'bin')}:${process.env.PATH || ''}`,
    SSH_BACKEND_MODE: version,
    PYTHONUNBUFFERED: '1',
    PYTHONWARNINGS: 'ignore',
  };

  return {
    version,
    pythonBin,
    scriptPath,
    venvDir,
    paramikoExpected: version === 'modern' ? '>=3.4.0' : '2.12.x',
    paramikoInstalled: verifyResult.version,
    env,
  };
}

/**
 * Startup health check for both Legacy and Modern SSH backends.
 * Runs on Node backend boot and logs Paramiko version or clear instructions.
 */
export function checkSshBackendsOnStartup(): {
  legacyOk: boolean;
  modernOk: boolean;
  legacyVersion?: string;
  modernVersion?: string;
  errors: string[];
} {
  console.log('[SSH Backend Startup] Verifying dedicated SSH virtual environments...');
  const modes: SshVersionMode[] = ['legacy', 'modern'];
  const errors: string[] = [];
  let legacyOk = false;
  let modernOk = false;
  let legacyVersion: string | undefined;
  let modernVersion: string | undefined;

  for (const mode of modes) {
    try {
      const resolution = resolveSshBackend(mode);
      if (mode === 'legacy') {
        legacyOk = true;
        legacyVersion = resolution.paramikoInstalled;
        console.log(
          `[SSH Backend Startup] Legacy backend OK: Python '${resolution.pythonBin}' (Paramiko ${legacyVersion || '2.12.x'})`
        );
      } else {
        modernOk = true;
        modernVersion = resolution.paramikoInstalled;
        console.log(
          `[SSH Backend Startup] Modern backend OK: Python '${resolution.pythonBin}' (Paramiko ${modernVersion || '>=3.4.0'})`
        );
      }
    } catch (err: any) {
      const msg = `SSH backend '${mode}' is not installed: run scripts/setup-ssh-venvs.sh`;
      errors.push(msg);
      console.error(`[SSH Backend Startup] CRITICAL: ${msg}`);
    }
  }

  return { legacyOk, modernOk, legacyVersion, modernVersion, errors };
}

/**
 * Executes an authentic SSH Bridge action (test-connection, ports-sync)
 * using the designated virtual environment without fallback.
 */
export async function executeSshBridgeAction(
  action: 'test-connection' | 'probe' | 'ports-sync' | 'info' | 'port-action',
  payload: any,
  sshVersion?: string | null,
  timeoutMs: number = 18000
): Promise<any> {
  let backend: SshBackendResolution;
  try {
    backend = resolveSshBackend(sshVersion);
  } catch (err: any) {
    const errMsg = err?.message || `SSH backend '${sshVersion || 'legacy'}' is not installed: run scripts/setup-ssh-venvs.sh`;
    console.error(`[SSH Backend Resolver] Execution aborted: ${errMsg}`);
    return {
      success: false,
      connected: false,
      error: errMsg,
      message: errMsg,
      ssh_version: String(sshVersion || '').toLowerCase().includes('modern') ? 'modern' : 'legacy',
    };
  }

  const root = getProjectRoot();

  return new Promise((resolve, reject) => {
    const proc = spawn(backend.pythonBin, [backend.scriptPath, action], {
      cwd: root,
      env: backend.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill('SIGKILL');
      } catch {}
      reject(new Error(`SSH execution timed out after ${timeoutMs}ms for action '${action}'`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      // Extract JSON from stdout (ignoring deprecation warnings)
      const trimmed = stdout.trim();
      const lastLine = trimmed.split('\n').filter((l) => l.trim().startsWith('{')).pop();
      if (lastLine) {
        try {
          const parsed = JSON.parse(lastLine);
          return resolve(parsed);
        } catch {
          // fallback to full stdout parse
        }
      }

      try {
        const parsed = JSON.parse(trimmed);
        return resolve(parsed);
      } catch {
        if (code !== 0 || !stdout) {
          const errDetail = stderr.trim() || stdout.trim() || `Process exited with code ${code}`;
          return resolve({
            success: false,
            connected: false,
            error: errDetail,
            message: errDetail,
            ssh_version: backend.version,
          });
        }
        resolve({
          success: false,
          error: 'Unparseable response from SSH bridge',
          raw: stdout,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Write input payload via stdin and close stdin
    if (payload !== undefined && payload !== null) {
      const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      proc.stdin.write(jsonStr);
    }
    proc.stdin.end();
  });
}
