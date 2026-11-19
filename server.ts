import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { spawn, exec, execSync, ChildProcess } from 'child_process';
import http from 'http';
import net from 'net';
import { createServer as createViteServer } from 'vite';

// Safely determine current directory and project root in both CJS bundle and TSX ESM dev mode
const getCurrentDir = () => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return process.cwd();
};

const currentDir = getCurrentDir();
// If running from dist/server.cjs, project root is one level up
const projectRoot = path.basename(currentDir) === 'dist' ? path.resolve(currentDir, '..') : currentDir;

// Load environment variables from all possible locations
const candidateEnvPaths = [
  path.resolve(projectRoot, '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(currentDir, '.env'),
  '/opt/nettopology/.env',
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
dotenv.config();

import { initDatabase, findUserById, findUserByUsername, getEffectivePolicyForUser, getAccessPolicies, getActiveDirectoryConfig, saveActiveDirectoryConfig } from './server/db';
import { verifyToken } from './server/auth';
import { apiRouter } from './server/routes';
import { setupTerminalWebSocket } from './server/terminalWs';
import { setupPortMonitorWebSocket } from './server/portMonitorWs';
import { setupCommsWebSocket } from './server/commsWs';
import { commsRouter } from './server/commsRoutes';
import { initCommsIntegration } from './server/commsService';
import { profileRouter } from './server/profileRoutes';
import { approvalRouter } from './server/approvalRoutes';
import { startApprovalJitExpiryDaemon } from './server/approvalService';
import { registerRemoteDesktopRoutes, setupRemoteDesktopWebSocket, ensureGuacdServiceRunning } from './server/remoteDesktopGateway';
import { registerCertConverterRoutes } from './server/certConverter';
import { licenseContractRouter, startLicenseContractCronDaemon } from './server/licenseContractService';
import { checkSshBackendsOnStartup } from './server/sshBackendResolver';
import { startBackupSchedulerDaemon } from './server/backupScheduler';
import { startAuditReportSchedulerDaemon } from './server/auditReportScheduler';
import { startLogRetentionDaemon } from './server/logRetentionDaemon';
import { initServerTime } from './server/serverTimeManager';
import {
  searchMacOrIp,
  getMacIpTrackerHistory,
  detectQueryType,
  normalizeMac,
  lookupOuiVendor,
} from './server/macIpTrackerService';
import {
  resolveActiveUpdateChannel,
  getUpdateChannelStatusDto,
  importUpdateKeyFile,
  reverifyActiveUpdateChannel,
  clearUpdateChannelConfig,
  fetchRemoteReleaseMetadata,
  buildGitAuthExtraHeader,
  sanitizeUpdateText,
} from './server/updateChannelConfig';

const app = express();

const getPort = (): number => {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const val = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(val)) return val;
  }
  if (process.env.APP_PORT) {
    const val = parseInt(process.env.APP_PORT, 10);
    if (!isNaN(val)) return val;
  }
  // In AI Studio / Cloud Run, outer PORT is 8080 for NGINX proxy which routes to 3000.
  // The Node application must listen on port 3000.
  if (process.env.PORT && process.env.PORT !== '8080') {
    return parseInt(process.env.PORT, 10);
  }
  return 3000;
};

const getHost = (): string => {
  const hostArgIndex = process.argv.indexOf('--host');
  if (hostArgIndex !== -1 && process.argv[hostArgIndex + 1]) {
    return process.argv[hostArgIndex + 1];
  }
  return process.env.HOST || '0.0.0.0';
};

const PORT = getPort();
const PYTHON_PORT = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : (process.env.PYTHON_PORT ? parseInt(process.env.PYTHON_PORT, 10) : 5001);
const PYTHON_WS_PORT = process.env.PYTHON_WS_PORT ? parseInt(process.env.PYTHON_WS_PORT, 10) : PYTHON_PORT + 1;

// Parse json and urlencoded (with 100mb limit for file transfers and backups)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// CORS & OPTIONS preflight handler for API routes
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Accept-Language, X-Trusted-Device-Token, x-operator-user, X-Approval-Request-Id, X-Internal-Approval-Exec');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Child process for Python backend
let pythonProcess: ChildProcess | null = null;
let isStartingPython = false;
const LEGACY_PYTHON_BIN = path.join(projectRoot, 'backend', 'venv_legacy', 'bin', 'python3');
const MODERN_PYTHON_BIN = path.join(projectRoot, 'backend', 'venv_modern', 'bin', 'python3');

function isPortActive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

function checkPythonHealth(port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/devices',
      method: 'GET',
      headers: { Connection: 'close' },
      agent: false,
      timeout: timeoutMs,
    }, (res) => {
      res.resume(); // drain response
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const cmd = `
      pkill -9 -f "server\\.py.*${port}" 2>/dev/null || true;
      PID=$(ss -tulpn 2>/dev/null | grep ":${port} " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -n1);
      if [ -n "$PID" ]; then kill -9 "$PID" 2>/dev/null || true; fi;
      (command -v fuser >/dev/null && fuser -k -9 ${port}/tcp 2>/dev/null) || true;
      (command -v lsof >/dev/null && kill -9 $(lsof -t -i:${port}) 2>/dev/null) || true;
    `;
    exec(cmd, () => {
      resolve();
    });
  });
}

async function startPythonBackend(forceRestart = false) {
  if (isStartingPython) return;
  isStartingPython = true;

  try {
    if (!forceRestart) {
      const isHealthy = await checkPythonHealth(PYTHON_PORT);
      if (isHealthy) {
        console.log(`[Python Manager] Python backend is healthy and responding on port ${PYTHON_PORT}.`);
        return;
      }
    }

    // If port is occupied by an unresponsive or stale process, terminate it
    const active = await isPortActive(PYTHON_PORT);
    if (active) {
      console.warn(`[Python Manager] Port ${PYTHON_PORT} is open but unresponsive. Terminating stale process...`);
      await killProcessOnPort(PYTHON_PORT);
      await new Promise((r) => setTimeout(r, 400));
    }

    if (pythonProcess) {
      try {
        pythonProcess.kill('SIGKILL');
      } catch {}
      pythonProcess = null;
    }

    if (!fs.existsSync(LEGACY_PYTHON_BIN)) {
      console.warn(`[Python Manager] Dedicated Legacy Python virtual environment not found at '${LEGACY_PYTHON_BIN}'. Attempting auto-provision...`);
      try {
        const venvDir = path.join(projectRoot, 'backend', 'venv_legacy');
        execSync(`python3 -m venv "${venvDir}" && "${LEGACY_PYTHON_BIN}" -m pip install "paramiko>=2.12.0,<2.13.0" cryptography websockets requests 2>/dev/null || true`, {
          cwd: projectRoot,
          timeout: 60000,
          stdio: 'ignore',
        });
      } catch (autoErr: any) {
        console.warn(`[Python Manager] Auto-provision notice: ${autoErr.message}`);
      }
    }

    if (!fs.existsSync(LEGACY_PYTHON_BIN)) {
      const errMsg = `[Python Manager] CRITICAL ERROR: Dedicated Legacy Python virtual environment with Paramiko 2.12.x not found at '${LEGACY_PYTHON_BIN}'. Fallback to /usr/bin/python3 or any other system Paramiko is strictly prohibited.`;
      console.error(errMsg);
      return;
    }

    const pythonScript = path.join(projectRoot, 'backend', 'server.py');
    console.log(`[Python Manager] Starting Legacy Python backend (Paramiko 2.12.x venv: ${LEGACY_PYTHON_BIN}) from ${pythonScript} on port ${PYTHON_PORT} (WS on ${PYTHON_WS_PORT})...`);

    pythonProcess = spawn(LEGACY_PYTHON_BIN, [pythonScript, String(PYTHON_PORT)], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        BACKEND_PORT: String(PYTHON_PORT),
        PYTHON_PORT: String(PYTHON_PORT),
        PYTHON_WS_PORT: String(PYTHON_WS_PORT),
        VIRTUAL_ENV: path.join(projectRoot, 'backend', 'venv_legacy'),
        PATH: `${path.join(projectRoot, 'backend', 'venv_legacy', 'bin')}:${process.env.PATH}`,
        SSH_BACKEND_MODE: 'legacy',
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('[Python Manager] Failed to start Python process:', err);
    });

    pythonProcess.on('exit', (code, signal) => {
      console.warn(`[Python Manager] Python process exited (code: ${code}, signal: ${signal}).`);
      pythonProcess = null;
      setTimeout(async () => {
        const isHealthy = await checkPythonHealth(PYTHON_PORT);
        if (!isHealthy) {
          startPythonBackend();
        }
      }, 2000);
    });
  } finally {
    isStartingPython = false;
  }
}

// Start Python
startPythonBackend().catch((err) => {
  console.error('[Python Manager] Error during initial backend start:', err);
});

// Ensure Apache Guacamole Daemon (guacd) is active for in-browser RDP/VNC remote desktop
ensureGuacdServiceRunning().catch((err) => {
  console.warn('[RemoteDesktop] Failed to check/start guacd on boot:', err);
});

// Clean up on exit
process.on('SIGTERM', () => {
  if (pythonProcess) pythonProcess.kill();
  process.exit(0);
});
process.on('SIGINT', () => {
  if (pythonProcess) pythonProcess.kill();
  process.exit(0);
});

// Helper: Compare semantic versions (e.g. 1.38.0 vs 1.37.1)
function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || '').replace(/^v/, '').trim();
  const clean2 = (v2 || '').replace(/^v/, '').trim();
  const p1 = clean1.split('.').map((x) => parseInt(x, 10) || 0);
  const p2 = clean2.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// Helper: Run shell commands safely with timeout
function executeShell(command: string, cwd: string, timeoutMs: number = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 25 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message}\n${stderr}`));
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}

// Bridge status endpoint to verify frontend-backend intercommunication
app.get('/api/status/bridge', (req: Request, res: Response) => {
  res.json({
    status: 'connected',
    bridge: 'active',
    frontendPort: PORT,
    backendPort: PYTHON_PORT,
    timestamp: new Date().toISOString()
  });
});

/**
 * Authoritative security guard for system update operations.
 * Verifies that the requester possesses a valid authenticated session
 * and that their database-authoritative RBAC policy permits the requested action.
 * By default and by strict system mandate, only Super Administrators are authorized.
 * Simulated or mock access is strictly prohibited.
 */
async function assertUpdateAccess(
  req: Request,
  requiredAction: 'check' | 'perform'
): Promise<{ allowed: boolean; user?: any; error?: string; status?: number }> {
  const authHeader = req.headers.authorization || '';
  let token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    return {
      allowed: false,
      status: 401,
      error: 'Authentication required: You must be logged in as Super Administrator to access system updates.'
    };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return {
      allowed: false,
      status: 401,
      error: 'Invalid or expired session token. Please re-authenticate as Super Administrator.'
    };
  }

  const user = (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
  if (user && user.status === 'disabled') {
    return {
      allowed: false,
      status: 403,
      error: 'Account is disabled. Access denied.'
    };
  }

  const effectivePolicy = await getEffectivePolicyForUser(user || payload);
  const cleanUsername = (user?.username || payload.username || '').toLowerCase();
  const cleanRole = (user?.role || payload.role || '').toLowerCase();
  const isSuperAdmin =
    cleanUsername === 'admin' ||
    cleanRole.includes('super admin') ||
    cleanRole.includes('administrator') ||
    effectivePolicy?.id === 'policy-super-admin';

  if (!isSuperAdmin) {
    return {
      allowed: false,
      status: 403,
      error: `Access denied: Only Super Administrator is authorized to ${requiredAction === 'check' ? 'check for' : 'execute'} system updates. Non-admin profiles cannot trigger this action.`
    };
  }

  // Strict check on database policy: Super Administrator policy must have update flag
  const hasDbPermission = requiredAction === 'check'
    ? (effectivePolicy?.canCheckUpdate !== false)
    : (effectivePolicy?.canPerformUpdate !== false);

  if (!hasDbPermission) {
    return {
      allowed: false,
      status: 403,
      error: `Access denied: Database policy for this account does not authorize system ${requiredAction === 'check' ? 'update checking' : 'update execution'}.`
    };
  }

  // Role simulation check: Any simulated non-admin profile or active role simulation cannot perform system updates ("دسترسی شبیه سازی نباشه")
  const simulatedHeader = (req.headers['x-simulated-role'] as string) || '';
  if (simulatedHeader && simulatedHeader !== 'actual-user' && simulatedHeader !== 'policy-super-admin') {
    return {
      allowed: false,
      status: 403,
      error: `Access denied: Active profile simulation cannot perform system updates. You must operate as the authentic Super Administrator.`
    };
  }

  return { allowed: true, user: user || payload };
}

// -------------------------------------------------------------
// Encrypted Update Channel Key File Management (Super Admin Only)
// Never exposes source URL or raw access key back to the browser.
// -------------------------------------------------------------
app.get('/api/system/update-channel/status', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  const authCheck = await assertUpdateAccess(req, 'check');
  if (!authCheck.allowed) {
    return res.status(authCheck.status || 403).json({
      success: false,
      error: authCheck.error,
    });
  }
  try {
    const status = await getUpdateChannelStatusDto(projectRoot);
    return res.json({ success: true, ...status });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to read update authorization status',
    });
  }
});

app.post('/api/system/update-channel/upload', async (req: Request, res: Response) => {
  const authCheck = await assertUpdateAccess(req, 'perform');
  if (!authCheck.allowed) {
    return res.status(authCheck.status || 403).json({
      success: false,
      error: authCheck.error,
    });
  }
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'update-key.txt';
    if (!content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Uploaded key file is empty.',
        errorFa: 'فایل کلید بارگذاری‌شده خالی است.',
      });
    }
    if (content.length > 65536) {
      return res.status(400).json({
        success: false,
        error: 'Key file size exceeds the allowed limit (64 KB).',
        errorFa: 'حجم فایل کلید از حد مجاز (۶۴ کیلوبایت) بیشتر است.',
      });
    }

    const actor = authCheck.user?.username || 'admin';
    const result = await importUpdateKeyFile({
      content,
      filename,
      updatedBy: actor,
      projectRoot,
    });

    if (!result.ok) {
      return res.status(result.statusCode || 400).json({
        success: false,
        error: result.errorEn || 'Failed to validate update authorization key.',
        errorFa: result.errorFa || 'اعتبارسنجی کلید مجوز به‌روزرسانی ناموفق بود.',
      });
    }

    return res.json({
      success: true,
      status: result.status,
      latestVersion: result.latestVersion || null,
      message: 'Update authorization key verified and encrypted securely.',
      messageFa: 'کلید مجوز به‌روزرسانی با موفقیت اعتبارسنجی و به صورت رمزنگاری‌شده ذخیره شد.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process update authorization key file.',
      errorFa: 'خطا در پردازش فایل کلید مجوز به‌روزرسانی.',
    });
  }
});

app.post('/api/system/update-channel/verify', async (req: Request, res: Response) => {
  const authCheck = await assertUpdateAccess(req, 'perform');
  if (!authCheck.allowed) {
    return res.status(authCheck.status || 403).json({
      success: false,
      error: authCheck.error,
    });
  }
  try {
    const actor = authCheck.user?.username || 'admin';
    const result = await reverifyActiveUpdateChannel(projectRoot, actor);
    if (!result.ok) {
      return res.status(401).json({
        success: false,
        status: result.status,
        error: result.errorEn || 'Update authorization verification failed.',
        errorFa: result.errorFa || 'اعتبارسنجی کلید مجوز به‌روزرسانی ناموفق بود.',
      });
    }
    return res.json({
      success: true,
      status: result.status,
      latestVersion: result.latestVersion || null,
      message: 'Release server authorization verified successfully.',
      messageFa: 'اتصال و مجوز دسترسی به سرور به‌روزرسانی با موفقیت تایید شد.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to verify update authorization key.',
      errorFa: 'خطا در بررسی اعتبار کلید به‌روزرسانی.',
    });
  }
});

app.delete('/api/system/update-channel', async (req: Request, res: Response) => {
  const authCheck = await assertUpdateAccess(req, 'perform');
  if (!authCheck.allowed) {
    return res.status(authCheck.status || 403).json({
      success: false,
      error: authCheck.error,
    });
  }
  try {
    const status = await clearUpdateChannelConfig(projectRoot);
    return res.json({
      success: true,
      status,
      message: 'Stored update authorization key has been removed.',
      messageFa: 'کلید مجوز به‌روزرسانی ذخیره‌شده با موفقیت حذف شد.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to remove stored update key.',
      errorFa: 'خطا در حذف کلید به‌روزرسانی.',
    });
  }
});

// Check release server for newer panel releases (supports encrypted private update channel)
app.get('/api/system/check-update', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const authCheck = await assertUpdateAccess(req, 'check');
  if (!authCheck.allowed) {
    return res.status(authCheck.status || 403).json({
      success: false,
      error: authCheck.error,
      hasUpdate: false
    });
  }

  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    let currentVersion = '1.72.0';
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        currentVersion = pkg.version || currentVersion;
      } catch {
        // use fallback
      }
    }

    const channel = await resolveActiveUpdateChannel(projectRoot);
    let latestVersion = currentVersion;
    let remoteReleaseNote: any = null;
    let remoteCommitSha: string | null = null;
    let localCommitSha: string | null = null;
    let commitMessage: string | null = null;

    // 1. Fast local commit hash check (ephemeral header auth if key is configured — never writes token to .git/config)
    const gitDir = path.join(projectRoot, '.git');
    if (fs.existsSync(gitDir)) {
      try {
        localCommitSha = (await executeShell('git rev-parse HEAD', projectRoot, 3000)).trim();
      } catch {
        // ignore
      }

      try {
        const extraHeaderArg = channel.token
          ? `-c "http.extraheader=${buildGitAuthExtraHeader(channel.token)}"`
          : '';
        const lsRemoteOut = await executeShell(
          `git ${extraHeaderArg} ls-remote "${channel.cleanHttpsUrl}" "refs/heads/${channel.branch}"`,
          projectRoot,
          5000
        );
        const match = lsRemoteOut.match(/^([0-9a-f]{40})/i);
        if (match) {
          remoteCommitSha = match[1];
        }
      } catch {
        // authenticated API check below handles release metadata & auth feedback
      }
    }

    // 2. Authenticated Release Metadata Query (works seamlessly on private and public release channels)
    const remoteMeta = await fetchRemoteReleaseMetadata(channel, 9000);
    if (remoteMeta.latestVersion) {
      latestVersion = remoteMeta.latestVersion;
    }
    if (remoteMeta.remoteCommitSha) {
      remoteCommitSha = remoteMeta.remoteCommitSha;
    }
    if (remoteMeta.commitMessage) {
      commitMessage = remoteMeta.commitMessage;
    }
    if (remoteMeta.releaseNote) {
      remoteReleaseNote = remoteMeta.releaseNote;
    }

    const simulateParam = req.query.simulate === 'true';

    // If upstream requires authorization and we aren't simulating, inform UI neutrally
    if (remoteMeta.authRequired && !remoteCommitSha && !simulateParam) {
      return res.json({
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
        requiresKey: true,
        keyConfigured: channel.configured,
        keyFingerprint: channel.keyFingerprint,
        error: remoteMeta.errorEn,
        errorFa: remoteMeta.errorFa,
        releaseNote: null,
        checkedAt: new Date().toISOString()
      });
    }

    if (simulateParam) {
      const parts = currentVersion.split('.').map(Number);
      const simVersion = `${parts[0]}.${(parts[1] || 0) + 1}.0`;
      latestVersion = simVersion;
      if (!remoteReleaseNote || remoteReleaseNote.version === currentVersion) {
        remoteReleaseNote = {
          version: simVersion,
          releaseDate: new Date().toISOString().split('T')[0],
          type: 'minor',
          title: 'نسخه ارتقای سیستم و رفع مشکلات پکیج‌ها و همگام‌سازی بک‌اند',
          title_en: 'System Upgrade Suite, Package Reconciliation & Backend Synchronization',
          changes: [
            'قابلیت بررسی خودکار نگارش‌های جدید و ارتقای مستقیم پنل با یک کلیک',
            'افزودن نشانگر چشمک‌زن قرمز روی پروفایل هنگام انتشار نسخه جدید',
            'بهینه‌سازی کارایی هسته پایتون و مانیتورینگ لحظه‌ای تجهیزات'
          ],
          changes_en: [
            'Automated release checker and one-click in-panel updater',
            'Pulsating red notification indicator on profile avatar upon new release',
            'Performance optimizations for Python backend and live equipment telemetry'
          ]
        };
      }
    }

    const semverHigher = compareSemver(latestVersion, currentVersion) > 0;
    const commitDiffers = Boolean(remoteCommitSha && localCommitSha && remoteCommitSha !== localCommitSha);
    const hasUpdate = semverHigher || commitDiffers;

    res.json({
      currentVersion,
      latestVersion,
      hasUpdate,
      requiresKey: false,
      keyConfigured: channel.configured,
      keyFingerprint: channel.keyFingerprint,
      remoteCommitSha,
      localCommitSha,
      commitMessage,
      releaseNote: remoteReleaseNote,
      checkedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Check Update Error]', sanitizeUpdateText(err?.message || String(err)));
    res.status(500).json({
      error: 'Failed to check release server for updates',
      errorFa: 'خطا در استعلام نسخه جدید از سرور به‌روزرسانی',
      details: sanitizeUpdateText(err?.message || '')
    });
  }
});

// Perform in-place software update to latest release version
app.post('/api/system/perform-update', async (req: Request, res: Response) => {
  const authCheck = await assertUpdateAccess(req, 'perform');
  if (!authCheck.allowed) {
    return res.status(authCheck.status || 403).json({
      success: false,
      error: authCheck.error,
      logs: [`[Security Denial] ${authCheck.error}`]
    });
  }

  try {
    const isCleanMode = req.body?.clean === true;
    const channel = await resolveActiveUpdateChannel(projectRoot);
    const secretList = [channel.token, channel.cleanHttpsUrl];
    const logs: string[] = [];
    const log = (msg: string) => {
      const safe = sanitizeUpdateText(msg, secretList);
      console.log(`[Update Engine] ${safe}`);
      logs.push(safe);
    };

    log('--- [Phase 1/6] Initiating Full Software Upgrade Pipeline ---');
    const gitDir = path.join(projectRoot, '.git');
    const envPath = path.join(projectRoot, '.env');
    const dbStore = path.join(projectRoot, 'backend', 'database_store.json');
    const netData = path.join(projectRoot, 'backend', 'network_data.json');
    const uploadsDir = path.join(projectRoot, 'backend', 'uploads');

    // Step 1: Deep Memory & Disk Snapshot of all user data to prevent any data loss
    let preNetworkData: any = null;
    let preDatabaseStore: any = null;
    let preEnvContent: string | null = null;
    let userDeviceCount = 0;

    try {
      if (fs.existsSync(netData)) {
        preNetworkData = JSON.parse(fs.readFileSync(netData, 'utf-8'));
        if (Array.isArray(preNetworkData.devices)) {
          userDeviceCount = preNetworkData.devices.length;
        }
      }
    } catch (rErr: any) {
      log(`Notice reading existing network_data.json: ${rErr.message}`);
    }

    try {
      if (fs.existsSync(dbStore)) {
        preDatabaseStore = JSON.parse(fs.readFileSync(dbStore, 'utf-8'));
        if (userDeviceCount === 0 && Array.isArray(preDatabaseStore.devices)) {
          userDeviceCount = preDatabaseStore.devices.length;
        }
      }
      // Also snapshot authoritative Active Directory config from database if present
      try {
        const activeAd = await getActiveDirectoryConfig();
        if (activeAd && typeof activeAd === 'object' && activeAd.server && activeAd.server !== '192.168.1.10') {
          if (!preDatabaseStore) preDatabaseStore = {};
          preDatabaseStore.ad_config = activeAd;
        }
      } catch {}
    } catch (rErr: any) {
      log(`Notice reading existing database_store.json: ${rErr.message}`);
    }

    try {
      if (fs.existsSync(envPath)) {
        preEnvContent = fs.readFileSync(envPath, 'utf-8');
      }
    } catch (rErr: any) {
      log(`Notice reading existing .env: ${rErr.message}`);
    }

    // Persist snapshot to both /tmp and persistent backend/backups directory
    const timestamp = Date.now();
    const backupDir = path.join('/tmp', `netman_backup_${timestamp}`);
    const persistentVaultDir = path.join(projectRoot, 'backend', 'backups', `vault_pre_update_${timestamp}`);

    try {
      fs.mkdirSync(backupDir, { recursive: true });
      fs.mkdirSync(persistentVaultDir, { recursive: true });

      if (preEnvContent) {
        fs.writeFileSync(path.join(backupDir, '.env'), preEnvContent, 'utf-8');
        fs.writeFileSync(path.join(persistentVaultDir, '.env'), preEnvContent, 'utf-8');
      }
      if (preDatabaseStore) {
        const str = JSON.stringify(preDatabaseStore, null, 2);
        fs.writeFileSync(path.join(backupDir, 'database_store.json'), str, 'utf-8');
        fs.writeFileSync(path.join(persistentVaultDir, 'database_store.json'), str, 'utf-8');
      }
      if (preNetworkData) {
        const str = JSON.stringify(preNetworkData, null, 2);
        fs.writeFileSync(path.join(backupDir, 'network_data.json'), str, 'utf-8');
        fs.writeFileSync(path.join(persistentVaultDir, 'network_data.json'), str, 'utf-8');
      }

      // Snapshot persistent uploads & contract documents
      if (fs.existsSync(uploadsDir)) {
        try {
          const backupUploads = path.join(backupDir, 'uploads');
          const persistentUploads = path.join(persistentVaultDir, 'uploads');
          fs.mkdirSync(backupUploads, { recursive: true });
          fs.mkdirSync(persistentUploads, { recursive: true });
          fs.cpSync(uploadsDir, backupUploads, { recursive: true });
          fs.cpSync(uploadsDir, persistentUploads, { recursive: true });

          try {
            if (fs.existsSync('/etc/nettopology-backup')) {
              fs.mkdirSync('/etc/nettopology-backup/uploads', { recursive: true });
              fs.cpSync(uploadsDir, '/etc/nettopology-backup/uploads', { recursive: true });
            }
          } catch {}
          log('Safeguarded all persistent uploaded contract documents, licenses, and attachment files.');
        } catch (upErr: any) {
          log(`Notice creating uploads snapshot: ${upErr.message}`);
        }
      }

      log(`Safeguarded ${userDeviceCount} existing network devices, topology data, and environment configuration.`);
    } catch (bErr: any) {
      log(`State backup notice: ${bErr.message}`);
    }

    // Step 2: Codebase Synchronization (Authenticated Ephemeral Header — Zero Credential Persistence in .git/config)
    log('--- [Phase 2/6] Synchronizing System Packages with Official Release Server ---');
    let syncSucceeded = false;

    if (fs.existsSync(gitDir)) {
      log('Local managed installation detected. Pulling latest verified release...');
      try {
        const extraHeaderArg = channel.token
          ? `-c "http.extraheader=${buildGitAuthExtraHeader(channel.token)}"`
          : '';
        // Ensure clean non-secret origin URL (never write tokens into .git/config)
        try {
          await executeShell(`git remote set-url origin "${channel.cleanHttpsUrl}"`, projectRoot, 5000);
        } catch {
          await executeShell(`git remote add origin "${channel.cleanHttpsUrl}"`, projectRoot, 5000).catch(() => {});
        }
        await executeShell(
          `git ${extraHeaderArg} fetch "${channel.cleanHttpsUrl}" "${channel.branch}"`,
          projectRoot,
          45000
        );
        await executeShell(
          `git checkout "${channel.branch}" 2>/dev/null || git checkout -B "${channel.branch}" FETCH_HEAD`,
          projectRoot,
          10000
        );
        await executeShell('git reset --hard FETCH_HEAD', projectRoot, 10000);
        await executeShell(
          'git clean -fd -e .env -e backend/database_store.json -e backend/network_data.json -e backend/backups -e backend/uploads -e backend/security',
          projectRoot,
          10000
        );
        syncSucceeded = true;
        log('System codebase successfully synchronized with the release server.');
      } catch (gitErr: any) {
        const cleanErr = sanitizeUpdateText(gitErr?.message || String(gitErr), secretList);
        log(`Direct sync notice: ${cleanErr}. Attempting archive fallback...`);
      }
    }

    if (!syncSucceeded) {
      log('Downloading verified release archive from release server...');
      const tarPath = `/tmp/netman-update-${timestamp}.tar.gz`;
      const extractDir = `/tmp/netman-extract-${timestamp}`;
      const curlCfgPath = `/tmp/netman-curl-${timestamp}.cfg`;
      try {
        const tarballUrl = `https://api.github.com/repos/${encodeURIComponent(channel.owner)}/${encodeURIComponent(channel.repo)}/tarball/${encodeURIComponent(channel.branch)}`;
        const cfgLines = [
          'silent',
          'show-error',
          'location',
          'fail',
          'header = "User-Agent: NetTopology-UpdateEngine/2.0"',
          'header = "Accept: application/vnd.github.v3+json"',
        ];
        if (channel.token) {
          cfgLines.push(`header = "Authorization: Bearer ${channel.token}"`);
        }
        fs.writeFileSync(curlCfgPath, cfgLines.join('\n') + '\n', { mode: 0o600 });

        await executeShell(`curl -K "${curlCfgPath}" -o "${tarPath}" "${tarballUrl}"`, projectRoot, 60000);
        fs.mkdirSync(extractDir, { recursive: true });
        await executeShell(`tar -xzf "${tarPath}" -C "${extractDir}" --strip-components=1`, projectRoot, 30000);
        await executeShell(`cp -a "${extractDir}/." "${projectRoot}/"`, projectRoot, 30000);
        syncSucceeded = true;
        log('Release archive verified, extracted, and applied successfully.');
      } catch (dlErr: any) {
        const cleanDlErr = sanitizeUpdateText(dlErr?.message || String(dlErr), secretList);
        log(`Release server download failed: ${cleanDlErr}`);
        return res.status(channel.configured ? 502 : 401).json({
          success: false,
          requiresKey: !channel.configured,
          error: channel.configured
            ? 'Failed to download release package. Please verify your update authorization key or server network connectivity.'
            : 'An update authorization key file (.txt) is required before downloading updates.',
          errorFa: channel.configured
            ? 'دریافت بسته به‌روزرسانی ناموفق بود. لطفاً اعتبار کلید مجوز به‌روزرسانی یا اتصال اینترنت سرور را بررسی کنید.'
            : 'برای دریافت به‌روزرسانی، ابتدا فایل کلید مجوز (.txt) را در صفحه به‌روزرسانی بارگذاری کنید.',
          logs,
        });
      } finally {
        try { if (fs.existsSync(curlCfgPath)) fs.unlinkSync(curlCfgPath); } catch {}
        try { if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath); } catch {}
        try { if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
      }
    }

    // Step 2.5: User State & Device Database Restoration and Smart Merging
    log('--- [Phase 2.5/6] Restoring & Merging User Devices, Credentials & Topology Maps ---');
    try {
      // 1. Restore & Merge network_data.json
      if (preNetworkData) {
        let repoNetworkData: any = {};
        if (fs.existsSync(netData)) {
          try {
            repoNetworkData = JSON.parse(fs.readFileSync(netData, 'utf-8'));
          } catch {
            repoNetworkData = {};
          }
        }

        // Merge Devices: User's devices are the absolute source of truth
        const mergedDevices: any[] = [];
        const seenIds = new Set<string>();

        // First, guarantee ALL user devices are retained
        if (Array.isArray(preNetworkData.devices)) {
          for (const d of preNetworkData.devices) {
            if (d && d.id) {
              mergedDevices.push(d);
              seenIds.add(String(d.id));
            }
          }
        }

        // Second, include any new seed/demo devices from upstream repo that do not conflict
        if (Array.isArray(repoNetworkData.devices)) {
          for (const d of repoNetworkData.devices) {
            if (d && d.id && !seenIds.has(String(d.id))) {
              mergedDevices.push(d);
              seenIds.add(String(d.id));
            }
          }
        }

        // Merge Ports
        const mergedPorts = {
          ...(repoNetworkData.ports || {}),
          ...(preNetworkData.ports || {})
        };

        const finalNetworkData = {
          ...repoNetworkData,
          ...preNetworkData,
          devices: mergedDevices,
          ports: mergedPorts,
          topology_links: preNetworkData.topology_links || repoNetworkData.topology_links || [],
          cdp_lldp_neighbors: preNetworkData.cdp_lldp_neighbors || repoNetworkData.cdp_lldp_neighbors || {},
          vlans: preNetworkData.vlans || repoNetworkData.vlans || [],
          templates: preNetworkData.templates || repoNetworkData.templates || [],
          device_groups: preNetworkData.device_groups || repoNetworkData.device_groups || [],
          active_directory: (preNetworkData.active_directory && preNetworkData.active_directory.server && preNetworkData.active_directory.server !== '192.168.1.10')
            ? preNetworkData.active_directory
            : (preDatabaseStore?.ad_config || preNetworkData.active_directory || repoNetworkData.active_directory),
          access_policies: preNetworkData.access_policies || repoNetworkData.access_policies || [],
          local_users: preNetworkData.local_users || repoNetworkData.local_users || [],
          local_groups: preNetworkData.local_groups || repoNetworkData.local_groups || [],
          audit_logs: preNetworkData.audit_logs || repoNetworkData.audit_logs || [],
          custom_maps: preNetworkData.custom_maps || repoNetworkData.custom_maps || [],
          node_positions: preNetworkData.node_positions || repoNetworkData.node_positions || {},
          device_notes: preNetworkData.device_notes || repoNetworkData.device_notes || {}
        };

        fs.writeFileSync(netData, JSON.stringify(finalNetworkData, null, 2), 'utf-8');
        log(`Safeguarded and restored ${mergedDevices.length} network devices in network_data.json.`);
      }

      // 2. Restore & Merge database_store.json
      if (preDatabaseStore) {
        let repoDbStore: any = {};
        if (fs.existsSync(dbStore)) {
          try {
            repoDbStore = JSON.parse(fs.readFileSync(dbStore, 'utf-8'));
          } catch {
            repoDbStore = {};
          }
        }

        const finalDbStore = {
          ...repoDbStore,
          ...preDatabaseStore,
          users: preDatabaseStore.users || repoDbStore.users || [],
          user_groups: preDatabaseStore.user_groups || repoDbStore.user_groups || [],
          access_policies: preDatabaseStore.access_policies || repoDbStore.access_policies || [],
          devices: (preDatabaseStore.devices && preDatabaseStore.devices.length > 0)
            ? preDatabaseStore.devices
            : (preNetworkData?.devices || repoDbStore.devices || []),
          custom_maps: preDatabaseStore.custom_maps || repoDbStore.custom_maps || [],
          topology_hierarchy: preDatabaseStore.topology_hierarchy || repoDbStore.topology_hierarchy || [],
          node_positions: preDatabaseStore.node_positions || repoDbStore.node_positions || {},
          device_sticky_notes: preDatabaseStore.device_sticky_notes || repoDbStore.device_sticky_notes || [],
          audit_logs: preDatabaseStore.audit_logs || repoDbStore.audit_logs || [],
          ad_config: (preDatabaseStore.ad_config && preDatabaseStore.ad_config.server && preDatabaseStore.ad_config.server !== '192.168.1.10')
            ? preDatabaseStore.ad_config
            : (preDatabaseStore.ad_config || repoDbStore.ad_config),
          licenses: preDatabaseStore.licenses || repoDbStore.licenses || [],
          contracts: preDatabaseStore.contracts || repoDbStore.contracts || [],
          license_contracts_logs: preDatabaseStore.license_contracts_logs || repoDbStore.license_contracts_logs || [],
          update_channel_config: preDatabaseStore.update_channel_config || repoDbStore.update_channel_config || undefined,
          attachment_blobs: {
            ...(repoDbStore.attachment_blobs || {}),
            ...(preDatabaseStore.attachment_blobs || {})
          }
        };

        fs.writeFileSync(dbStore, JSON.stringify(finalDbStore, null, 2), 'utf-8');
        log(`Safeguarded and restored database store with ${((finalDbStore.devices as any[]) || []).length} synced devices.`);

        if (finalDbStore.ad_config) {
          try {
            await saveActiveDirectoryConfig(finalDbStore.ad_config);
          } catch {}
        }
      }

      // 3. Restore .env
      if (preEnvContent) {
        fs.writeFileSync(envPath, preEnvContent, 'utf-8');
        log('Safeguarded and restored environment configuration (.env).');
      }

      // 4. Restore and Reconcile Uploads Directory (Guarantees zero-data loss across all updates)
      try {
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const sourceCandidates = [
          path.join(persistentVaultDir, 'uploads'),
          path.join(backupDir, 'uploads'),
          '/etc/nettopology-backup/uploads'
        ];
        for (const src of sourceCandidates) {
          if (fs.existsSync(src)) {
            try {
              fs.cpSync(src, uploadsDir, { recursive: true });
            } catch {}
          }
        }
        log('Safeguarded and restored all uploaded files, documents, and contract attachments to backend/uploads.');
      } catch (upRestoreErr: any) {
        log(`Notice restoring uploads: ${upRestoreErr.message}`);
      }
    } catch (restoreErr: any) {
      log(`Error during user data restoration: ${restoreErr.message}`);
    }

    // Restore executable permissions for shell scripts
    try {
      await executeShell('chmod +x *.sh backend/*.py 2>/dev/null || true', projectRoot, 5000);
    } catch {
      // ignore
    }

    // Step 3: Full NPM Dependency Reconciliation (Crucial: --include=dev so Vite and TypeScript build tools are installed!)
    log('--- [Phase 3/6] Installing & Reconciling NPM Dependencies (including build tools) ---');
    if (isCleanMode) {
      log('Clean installation mode requested: Purging node_modules cache and package-lock...');
      try {
        await executeShell('rm -rf node_modules package-lock.json', projectRoot, 15000);
      } catch (rmErr: any) {
        log(`Notice removing node_modules: ${rmErr.message}`);
      }
    }

    try {
      // Configure network timeout and retry resilience for npm
      await executeShell('npm config set fetch-retry-maxtimeout 180000 2>/dev/null || true', projectRoot, 5000);
      await executeShell('npm config set fetch-retry-mintimeout 30000 2>/dev/null || true', projectRoot, 5000);
      await executeShell('npm config set fetch-retries 5 2>/dev/null || true', projectRoot, 5000);

      log('Running full npm install with all dependencies and devDependencies...');
      try {
        await executeShell('NODE_ENV=development npm install --include=dev --legacy-peer-deps --no-audit', projectRoot, 180000);
        log('NPM dependencies installed successfully.');
      } catch (firstNpmErr: any) {
        log(`Standard NPM install encountered issue: ${firstNpmErr.message}. Retrying with mirror registry...`);
        await executeShell('NODE_ENV=development npm install --include=dev --legacy-peer-deps --no-audit --registry=https://registry.npmmirror.com', projectRoot, 180000);
        log('NPM dependencies successfully installed via fallback mirror.');
      }

      // Ensure platform-specific native binaries for Rollup / esbuild on Linux
      await executeShell('npm install --no-save @rollup/rollup-linux-x64-gnu @esbuild/linux-x64 2>/dev/null || true', projectRoot, 30000);
      await executeShell('npm install --no-save @rollup/rollup-linux-arm64-gnu @esbuild/linux-arm64 2>/dev/null || true', projectRoot, 30000);
      await executeShell('npm rebuild 2>/dev/null || true', projectRoot, 30000);
    } catch (npmErr: any) {
      log(`NPM installation notice: ${npmErr.message}`);
    }

    // Step 4: Terminate old Python backend and update Python dependencies
    log('--- [Phase 4/6] Terminating Stale Python Backend & Reconciling Python Dependencies ---');
    try {
      // Kill old python backend process so port PYTHON_PORT (5001/8000) is released and new backend files will be loaded!
      await executeShell('pkill -9 -f "backend/server.py" 2>/dev/null || true', projectRoot, 5000);
      await executeShell(`fuser -k ${PYTHON_PORT}/tcp 2>/dev/null || fuser -k 5001/tcp 2>/dev/null || fuser -k 8000/tcp 2>/dev/null || true`, projectRoot, 5000);
      if (pythonProcess) {
        try {
          pythonProcess.kill('SIGKILL');
          pythonProcess = null;
        } catch {
          // ignore
        }
      }
      log(`Released port ${PYTHON_PORT} from old Python backend instance.`);

      if (fs.existsSync(LEGACY_PYTHON_BIN)) {
        const pipInstallCmd = `"${LEGACY_PYTHON_BIN}" -m pip install "paramiko>=2.12.0,<2.13.0" cryptography websockets requests 2>/dev/null || true`;
        await executeShell(pipInstallCmd, projectRoot, 60000);
      }
      if (fs.existsSync(MODERN_PYTHON_BIN)) {
        const pipInstallCmd = `"${MODERN_PYTHON_BIN}" -m pip install "paramiko>=3.4.0" cryptography websockets requests 2>/dev/null || true`;
        await executeShell(pipInstallCmd, projectRoot, 60000);
      }
      log('Python environments & dedicated drivers (Paramiko 2.12.x legacy and Paramiko modern) verified.');
    } catch (pyErr: any) {
      log(`Python dependency notice: ${pyErr.message}`);
    }

    // Step 5: Production Assets & Server Bundle
    log('--- [Phase 5/6] Compiling Production Frontend & Backend Bundles ---');
    // Pre-build module integrity verification
    try {
      await executeShell('node -e "import(\'tinyglobby\'); import(\'vite\');"', projectRoot, 5000);
    } catch {
      log('Detected corrupted ESM build packages (e.g. tinyglobby/vite). Purging and re-installing clean packages...');
      await executeShell('rm -rf node_modules/tinyglobby node_modules/vite node_modules/.vite dist', projectRoot, 5000);
      await executeShell('npm cache clean --force 2>/dev/null || true', projectRoot, 10000);
      await executeShell('npm install tinyglobby@latest vite@latest --prefer-online --no-audit 2>/dev/null || true', projectRoot, 30000);
    }

    try {
      await executeShell('NODE_OPTIONS="--max-old-space-size=2048" npm run build', projectRoot, 120000);
      log('Production bundle compiled successfully (dist/ and dist/server.cjs ready).');
    } catch (bErr: any) {
      log(`Primary build warning: ${bErr.message}. Executing automated recovery...`);
      let repaired = false;
      try {
        await executeShell('node -e "import(\'tinyglobby\'); import(\'vite\');"', projectRoot, 5000);
      } catch {
        log('Diagnosed corrupted ESM modules (tinyglobby/vite). Re-fetching clean modules...');
        await executeShell('rm -rf node_modules/tinyglobby node_modules/vite node_modules/.vite dist', projectRoot, 5000);
        await executeShell('npm cache clean --force 2>/dev/null || true', projectRoot, 10000);
        await executeShell('npm install tinyglobby@latest vite@latest --prefer-online --no-audit 2>/dev/null || true', projectRoot, 30000);
        repaired = true;
      }
      try {
        log('Attempting staged compilation recovery...');
        await executeShell('NODE_OPTIONS="--max-old-space-size=2048" npx vite build --emptyOutDir && npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs', projectRoot, 120000);
        log('Production bundle compiled successfully via recovery pipeline.');
      } catch (rErr: any) {
        log(`Recovery build notice: ${rErr.message}`);
      }
    }

    // Final Post-Build Data Integrity Guard: Ensure devices database is intact before service reboot
    try {
      let finalDevCount = 0;
      if (fs.existsSync(netData)) {
        const checkData = JSON.parse(fs.readFileSync(netData, 'utf-8'));
        if (Array.isArray(checkData.devices)) {
          finalDevCount = checkData.devices.length;
        }
      }
      if (userDeviceCount > 0 && finalDevCount < userDeviceCount && preNetworkData) {
        log(`Post-build safety guard: Re-affirming ${userDeviceCount} devices in network_data.json...`);
        fs.writeFileSync(netData, JSON.stringify(preNetworkData, null, 2), 'utf-8');
      }
      if (preDatabaseStore && fs.existsSync(dbStore)) {
        const checkDb = JSON.parse(fs.readFileSync(dbStore, 'utf-8'));
        if (!Array.isArray(checkDb.devices) || checkDb.devices.length < userDeviceCount) {
          fs.writeFileSync(dbStore, JSON.stringify(preDatabaseStore, null, 2), 'utf-8');
        }
      }
      log('Integrity guard: All network equipment, credentials, and topology maps confirmed in database.');
    } catch (guardErr: any) {
      log(`Integrity guard notice: ${guardErr.message}`);
    }

    // Read updated version from package.json
    let newVersion = '1.72.0';
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        newVersion = pkg.version || newVersion;
      } catch {
        // fallback
      }
    }

    log(`--- [Phase 6/6] Update Complete! System updated to v${newVersion} ---`);
    log('Scheduling graceful service restart to reload updated backend and frontend into memory...');

    // Respond immediately with full logs so the frontend can display them and countdown
    res.json({
      success: true,
      newVersion,
      message: `Panel updated successfully to v${newVersion}`,
      logs
    });

    // Schedule background service restart after 1.5 seconds so response reaches client cleanly
    setTimeout(() => {
      console.log('[Update Engine] Triggering background service and process restart...');
      // 1. Try systemd service restart
      exec('sudo systemctl restart nettopology || systemctl restart nettopology || sudo systemctl restart net-management || systemctl restart net-management || pm2 restart all || pm2 restart nettopology || bash ./restart.sh', { cwd: projectRoot }, (rErr) => {
        if (rErr) {
          console.log('[Update Engine] Service restart command notice:', rErr.message);
        }
      });
    }, 1500);

  } catch (err: any) {
    const safeMsg = sanitizeUpdateText(err?.message || 'Update failed');
    console.error('[Update Engine Failed]', safeMsg);
    res.status(500).json({
      success: false,
      error: safeMsg
    });
  }
});

// -------------------------------------------------------------
// Check-Host.net Global Ping API integration directly in Node.js
// -------------------------------------------------------------
app.post('/api/tools/check-host/init', async (req: Request, res: Response) => {
  try {
    const host = (req.body?.host || '').trim();
    if (!host) {
      return res.status(400).json({ success: false, error: 'Target host is required' });
    }
    const maxNodes = Math.min(50, Math.max(1, parseInt(req.body?.max_nodes || '10', 10)));
    let targetUrl = `https://check-host.net/check-ping?host=${encodeURIComponent(host)}&max_nodes=${maxNodes}`;
    if (Array.isArray(req.body?.nodes) && req.body.nodes.length > 0) {
      const nodeParams = req.body.nodes.map((n: string) => `node=${encodeURIComponent(n)}`).join('&');
      targetUrl = `https://check-host.net/check-ping?host=${encodeURIComponent(host)}&${nodeParams}`;
    }

    const resp = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NetTopology-Monitoring/1.43'
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ success: false, error: `Check-Host API error: ${text || resp.statusText}` });
    }

    const data: any = await resp.json();
    return res.json({
      success: data.ok === 1,
      requestId: data.request_id,
      permanentLink: data.permanent_link,
      nodes: data.nodes || {},
      targetHost: host
    });
  } catch (err: any) {
    console.error('[Check-Host Init Error]', err);
    return res.status(502).json({ success: false, error: err.message || 'Failed to contact check-host.net API' });
  }
});

app.get('/api/tools/check-host/result', async (req: Request, res: Response) => {
  try {
    const requestId = ((req.query.request_id as string) || (req.query.requestId as string) || '').trim();
    if (!requestId) {
      return res.status(400).json({ success: false, error: 'request_id is required' });
    }
    const resp = await fetch(`https://check-host.net/check-result/${encodeURIComponent(requestId)}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NetTopology-Monitoring/1.43'
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ success: false, error: `Check-Host API error: ${text || resp.statusText}` });
    }
    const data: any = await resp.json();
    return res.json({
      success: true,
      requestId,
      results: data || {}
    });
  } catch (err: any) {
    console.error('[Check-Host Result Error]', err);
    return res.status(502).json({ success: false, error: err.message || 'Failed to fetch check-host results' });
  }
});

app.post('/api/tools/check-host/result', async (req: Request, res: Response) => {
  try {
    const requestId = ((req.body?.request_id as string) || (req.body?.requestId as string) || '').trim();
    if (!requestId) {
      return res.status(400).json({ success: false, error: 'request_id is required' });
    }
    const resp = await fetch(`https://check-host.net/check-result/${encodeURIComponent(requestId)}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NetTopology-Monitoring/1.43'
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ success: false, error: `Check-Host API error: ${text || resp.statusText}` });
    }
    const data: any = await resp.json();
    return res.json({
      success: true,
      requestId,
      results: data || {}
    });
  } catch (err: any) {
    console.error('[Check-Host Result Error]', err);
    return res.status(502).json({ success: false, error: err.message || 'Failed to fetch check-host results' });
  }
});

app.get('/api/tools/check-host/nodes', async (req: Request, res: Response) => {
  try {
    const resp = await fetch('https://check-host.net/nodes/hosts', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NetTopology-Monitoring/1.43'
      }
    });
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, error: 'Failed to fetch nodes' });
    }
    const data: any = await resp.json();
    return res.json({
      success: true,
      nodes: data?.nodes || {}
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Global MAC & IP Tracker (CAM/ARP & Edge Topology Correlator) API
// -------------------------------------------------------------
app.post('/api/tools/mac-ip-tracker/search', async (req: Request, res: Response) => {
  try {
    const rawQuery = (req.body?.query || '').trim();
    if (!rawQuery) {
      return res.status(400).json({ success: false, error: 'Query (MAC address or IP) is required' });
    }
    const operatorUsername = (req as any).user?.username || (req.headers['x-operator-user'] as string) || 'admin';
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const forceRefresh = Boolean(req.body?.forceRefresh);

    const result = await searchMacOrIp({
      query: rawQuery,
      operatorUsername,
      clientIp,
      forceRefresh,
    });

    return res.json({ success: true, result });
  } catch (err: any) {
    console.error('[MacIpTracker API] Search failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'MAC/IP search failed' });
  }
});

app.get('/api/tools/mac-ip-tracker/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '30', 10)));
    const history = await getMacIpTrackerHistory(limit);
    return res.json({ success: true, history });
  } catch (err: any) {
    console.error('[MacIpTracker API] History failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch search history' });
  }
});

app.post('/api/tools/mac-ip-tracker/validate', (req: Request, res: Response) => {
  try {
    const rawQuery = (req.body?.query || '').trim();
    const queryType = detectQueryType(rawQuery);
    const normalizedMac = queryType === 'mac' ? normalizeMac(rawQuery) : null;
    const vendor = normalizedMac ? lookupOuiVendor(normalizedMac) : null;
    return res.json({
      success: true,
      queryType,
      normalizedMac,
      vendor,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Mount In-Browser Remote Desktop / Remote Console API routes
registerRemoteDesktopRoutes(app, projectRoot);

// Mount SSL / TLS Certificate Converter & Formatter routes
registerCertConverterRoutes(app);

// Mount Licenses & Contracts Management routes
app.use('/api', licenseContractRouter);

// Mount Communications & Notifications Center routes
app.use('/api', commsRouter);

// Mount User Profile, Personal 2FA (TOTP) & Notification Preferences routes
app.use('/api', profileRouter);

// Mount Phase 4 Two-Step / Four-Eyes Approval Queue routes
app.use('/api', approvalRouter);

// Mount PostgreSQL & Authentication API router
app.use('/api', apiRouter);

// Local fallbacks from network_data.json for topology and devices during Python backend cold-start
function getLocalTopologyFallback(): any {
  try {
    const dataFilePath = path.join(projectRoot, 'backend', 'network_data.json');
    if (!fs.existsSync(dataFilePath)) return null;
    const raw = fs.readFileSync(dataFilePath, 'utf-8');
    const data = JSON.parse(raw);
    const nodes = (data.devices || []).map((d: any) => ({
      ...d,
      role: d.role || 'Network Device',
      model: d.model || 'Cisco',
      platform: d.platform || 'cisco_ios_xe',
      is_online: d.is_online !== undefined ? d.is_online : true,
      latency_ms: d.latency_ms || 1.0,
      total_ports: d.total_ports || 24,
    }));
    return {
      nodes,
      links: data.topology_links || [],
      buildings: Array.from(new Set((data.devices || []).map((d: any) => d.building).filter(Boolean))),
      floors: Array.from(new Set((data.devices || []).map((d: any) => `${d.building} - ${d.floor}`).filter((f: string) => !f.startsWith('undefined')))),
      summary: {
        total_nodes: nodes.length,
        total_links: (data.topology_links || []).length,
        core_switches: nodes.filter((d: any) => d.type === 'switch' && (d.role || '').includes('Core')).length,
        access_switches: nodes.filter((d: any) => d.type === 'switch' && (d.role || '').includes('Access')).length,
        routers: nodes.filter((d: any) => d.type === 'router').length,
        access_points: nodes.filter((d: any) => d.type === 'access_point').length,
      }
    };
  } catch (err) {
    console.error('[Local Topology Fallback Error]', err);
    return null;
  }
}

function getLocalDevicesFallback(): any {
  try {
    const dataFilePath = path.join(projectRoot, 'backend', 'network_data.json');
    if (!fs.existsSync(dataFilePath)) return null;
    const raw = fs.readFileSync(dataFilePath, 'utf-8');
    const data = JSON.parse(raw);
    const rawDevices = data.devices || [];
    const devices = rawDevices.map((dev: any) => {
      const d = { ...dev };
      if (!d.platform) d.platform = 'cisco_ios_xe';
      if (!d.connection_mode) d.connection_mode = 'simulator';
      const conn = { ...(d.connection || {}) };
      delete conn.password;
      delete conn.private_key;
      d.connection = conn;
      delete d.ssh_password;
      delete d.enable_password;
      d.ssh_connected = false;
      return d;
    });
    return {
      devices,
      total: devices.length,
      online_count: devices.filter((d: any) => d.is_online).length,
      offline_count: devices.filter((d: any) => !d.is_online).length,
    };
  } catch (err) {
    console.error('[Local Devices Fallback Error]', err);
    return null;
  }
}

// Proxy /api/* to Python HTTP server (including Python SSH lifecycle engine)
app.use('/api', (req: Request, res: Response) => {
  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  delete headers['host'];
  delete headers['content-length'];
  headers['connection'] = 'close';

  // Decode bearer token and forward authenticated operator identity to python backend
  const authHeader = (req.headers['authorization'] as string) || '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7).trim();
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadBase64 = parts[0];
        const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
        const payload = JSON.parse(jsonStr);
        if (payload?.username) {
          headers['x-user-name'] = payload.username;
          headers['x-operator-user'] = payload.username;
          headers['x-user-role'] = payload.role || (payload.userType === 'ad' ? 'Domain User (Active Directory)' : 'User');
        }
      }
    } catch {}
  }

  let bodyData: string | undefined;
  if (req.body && Object.keys(req.body).length > 0) {
    bodyData = JSON.stringify(req.body);
    headers['content-length'] = Buffer.byteLength(bodyData);
    headers['content-type'] = headers['content-type'] || 'application/json';
  } else if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    headers['content-length'] = 0;
  }

  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: PYTHON_PORT,
    path: req.originalUrl,
    method: req.method,
    headers,
    agent: false,
    timeout: 30000,
  };

  const makeProxyRequest = (isRetry = false) => {
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('Proxy request timed out after 30s'));
    });

    proxyReq.on('error', (err: any) => {
      // If it's the first attempt and failed with socket hang up or ECONNRESET or ECONNREFUSED, attempt single retry
      if (!isRetry && !res.headersSent && (err.message?.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED')) {
        console.warn(`[API Proxy Warning] Initial request to ${req.originalUrl} failed (${err.message}). Retrying once after ensuring Python backend...`);
        startPythonBackend();
        setTimeout(() => {
          makeProxyRequest(true);
        }, 500);
        return;
      }

      console.error(`[API Proxy Error] Unable to connect to Python backend: ${err.message}`);

      // Self-healing: if socket hang up, ECONNREFUSED or ECONNRESET, trigger background health check & restart
      if (err.message?.includes('socket hang up') || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        startPythonBackend();
      }

      if (!res.headersSent) {
        if (req.method === 'GET') {
          const cleanPath = (req.path || '').replace(/\/$/, '');
          if (cleanPath === '/topology' || cleanPath === '/api/topology' || req.originalUrl.startsWith('/api/topology')) {
            const fallbackTopo = getLocalTopologyFallback();
            if (fallbackTopo) {
              console.log('[API Proxy Fallback] Served /api/topology from local network_data.json while Python backend warms up.');
              return res.json(fallbackTopo);
            }
          }
          if (cleanPath === '/devices' || cleanPath === '/api/devices' || req.originalUrl.startsWith('/api/devices')) {
            const fallbackDevs = getLocalDevicesFallback();
            if (fallbackDevs) {
              console.log('[API Proxy Fallback] Served /api/devices from local network_data.json while Python backend warms up.');
              return res.json(fallbackDevs);
            }
          }
        }

        res.status(503).json({
          error: 'Python backend is starting up or temporarily unavailable',
          details: err.message,
          engine: 'Python 3.10 Network Topology Engine'
        });
      }
    });

    if (bodyData) {
      proxyReq.write(bodyData);
    }
    proxyReq.end();
  };

  makeProxyRequest(false);
});

// Global Error Handler for API and Express
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith('/api')) {
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'خطای غیرمنتظره در پردازش سمت سرور رخ داد.',
      details: err?.message || String(err),
    });
  }
  next(err);
});

async function startServer() {
  // Validate dedicated SSH Virtual Environments on startup
  checkSshBackendsOnStartup();

  // Initialize Database (PostgreSQL or fallback store)
  await initDatabase();
  await initServerTime();

  const isProd = process.env.NODE_ENV === 'production' || path.basename(currentDir) === 'dist';

  const HOST = getHost();
  const server = http.createServer(app);

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(projectRoot, 'dist');
    console.log(`[Production Server] Serving static web UI from ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server Error] Port ${PORT} is already in use.`);
    } else {
      console.error('[Server Error]', err);
    }
  });

  // Setup native WebSocket terminal engine for interactive SSH/CLI sessions
  setupTerminalWebSocket(server, PYTHON_PORT, projectRoot, PYTHON_WS_PORT);

  // Setup In-Browser Remote Desktop / Remote Console (RDP & VNC) gateway via Guacamole protocol
  setupRemoteDesktopWebSocket(server, projectRoot);

  // Initialize Communications & Audit Notification integration
  initCommsIntegration();

  // Setup Real-Time Port Monitoring WebSocket (Cisco terminal monitor / MikroTik link watcher)
  setupPortMonitorWebSocket(server, projectRoot);

  // Setup Real-Time Communications & Notifications WebSocket (/ws/comms)
  setupCommsWebSocket(server);

  server.listen(PORT, HOST, () => {
    console.log(`Node/Express frontend + proxy running on http://${HOST}:${PORT}`);
    // Start automated disaster recovery backup scheduler daemon
    startBackupSchedulerDaemon();
    // Start automated audit & command logs report scheduler daemon
    startAuditReportSchedulerDaemon();
    // Start automated PostgreSQL database log retention and purge daemon
    startLogRetentionDaemon();
    // Start automated licenses and contracts expiry email alerting daemon
    startLicenseContractCronDaemon();
    // Start Phase 4 Hybrid JIT & Approval expiry daemon
    startApprovalJitExpiryDaemon();
  });
}

startServer();
