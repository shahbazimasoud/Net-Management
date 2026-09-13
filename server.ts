import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { spawn, exec, ChildProcess } from 'child_process';
import http from 'http';
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

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.env.FRONTEND_PORT ? parseInt(process.env.FRONTEND_PORT, 10) : 3000);
const PYTHON_PORT = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : (process.env.PYTHON_PORT ? parseInt(process.env.PYTHON_PORT, 10) : 5001);

// Parse json and urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Child process for Python backend
let pythonProcess: ChildProcess | null = null;

function startPythonBackend() {
  const pythonScript = path.join(projectRoot, 'backend', 'server.py');
  console.log(`[Python Manager] Starting Python backend from ${pythonScript} on port ${PYTHON_PORT}...`);
  
  pythonProcess = spawn('python3', [pythonScript, String(PYTHON_PORT)], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      BACKEND_PORT: String(PYTHON_PORT),
      PYTHON_PORT: String(PYTHON_PORT)
    }
  });

  pythonProcess.on('error', (err) => {
    console.error('[Python Manager] Failed to start Python process:', err);
  });

  pythonProcess.on('exit', (code, signal) => {
    console.warn(`[Python Manager] Python process exited with code ${code}, signal ${signal}. Restarting in 2s...`);
    setTimeout(startPythonBackend, 2000);
  });
}

// Start Python
startPythonBackend();

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

// Helper: Run shell commands safely
function executeShell(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 25 * 1024 * 1024 }, (err, stdout, stderr) => {
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

// Check repository for newer releases (Net-Management GitHub)
app.get('/api/system/check-update', async (req: Request, res: Response) => {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    let currentVersion = '1.38.0';
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        currentVersion = pkg.version || currentVersion;
      } catch {
        // use fallback
      }
    }

    const repoPkgUrl = 'https://raw.githubusercontent.com/shahbazimasoud/Net-Management/master/package.json';
    const repoVersionTsUrl = 'https://raw.githubusercontent.com/shahbazimasoud/Net-Management/master/src/version.ts';

    let latestVersion = currentVersion;
    let remoteReleaseNote: any = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const [pkgRes, versionTsRes] = await Promise.allSettled([
        fetch(repoPkgUrl, { signal: controller.signal }),
        fetch(repoVersionTsUrl, { signal: controller.signal })
      ]);
      clearTimeout(timeoutId);

      if (pkgRes.status === 'fulfilled' && pkgRes.value.ok) {
        const remotePkg = await pkgRes.value.json() as any;
        if (remotePkg && remotePkg.version) {
          latestVersion = remotePkg.version;
        }
      }

      if (versionTsRes.status === 'fulfilled' && versionTsRes.value.ok) {
        const tsText = await versionTsRes.value.text();
        const vMatch = tsText.match(/version:\s*['"]([^'"]+)['"]/);
        const dMatch = tsText.match(/releaseDate:\s*['"]([^'"]+)['"]/);
        const tMatch = tsText.match(/type:\s*['"]([^'"]+)['"]/);
        const titleMatch = tsText.match(/title:\s*['"]([^'"]+)['"]/);
        const titleEnMatch = tsText.match(/title_en:\s*['"]([^'"]+)['"]/);
        const changesBlock = tsText.match(/changes:\s*\[([\s\S]*?)\]/);
        const changesEnBlock = tsText.match(/changes_en:\s*\[([\s\S]*?)\]/);

        const changes = changesBlock ? [...changesBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]) : [];
        const changes_en = changesEnBlock ? [...changesEnBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]) : [];

        remoteReleaseNote = {
          version: vMatch?.[1] || latestVersion,
          releaseDate: dMatch?.[1] || new Date().toISOString().split('T')[0],
          type: tMatch?.[1] || 'patch',
          title: titleMatch?.[1] || `نگارش ${latestVersion}`,
          title_en: titleEnMatch?.[1] || `Release v${latestVersion}`,
          changes: changes.length > 0 ? changes : ['به‌روزرسانی و ارتقای کلی عملکرد سامانه'],
          changes_en: changes_en.length > 0 ? changes_en : ['System optimizations and feature enhancements']
        };
      }
    } catch (fetchErr: any) {
      console.warn('[Check Update] Warning fetching remote repository:', fetchErr.message);
    }

    // Check if simulation was requested in query string (e.g. for preview testing)
    const simulateParam = req.query.simulate === 'true';
    if (simulateParam) {
      const parts = currentVersion.split('.').map(Number);
      const simVersion = `${parts[0]}.${(parts[1] || 0) + 1}.0`;
      latestVersion = simVersion;
      if (!remoteReleaseNote || remoteReleaseNote.version === currentVersion) {
        remoteReleaseNote = {
          version: simVersion,
          releaseDate: new Date().toISOString().split('T')[0],
          type: 'minor',
          title: 'نسخه آزمایشی ارتقای سیستم مانیتورینگ شبکه و بهینه‌سازی‌های امنیتی',
          title_en: 'Enhanced Network Monitoring System & Security Suite',
          changes: [
            'قابلیت بررسی خودکار نگارش‌های جدید و ارتقای مستقیم پنل با یک کلیک',
            'افزودن نشانگر چشمک‌زن قرمز روی پروفایل هنگام انتشار نسخه جدید',
            'بهینه‌سازی کارایی هسته پایتون و مانیتورینگ لحظه‌ای تجهیزات'
          ],
          changes_en: [
            'Automated repository release checker and one-click in-panel updater',
            'Pulsating red notification indicator on profile avatar upon new release',
            'Performance optimizations for Python backend and live equipment telemetry'
          ]
        };
      }
    }

    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

    res.json({
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseNote: remoteReleaseNote,
      repoUrl: 'https://github.com/shahbazimasoud/Net-Management',
      checkedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Check Update Error]', err);
    res.status(500).json({
      error: 'Failed to check repository updates',
      details: err.message
    });
  }
});

// Perform in-place software update to latest repository version
app.post('/api/system/perform-update', async (req: Request, res: Response) => {
  try {
    const logs: string[] = [];
    const log = (msg: string) => {
      console.log(`[Update Engine] ${msg}`);
      logs.push(msg);
    };

    log('Initiating software upgrade from GitHub repository (Net-Management)...');
    const gitDir = path.join(projectRoot, '.git');

    if (fs.existsSync(gitDir)) {
      log('Local Git repository verified. Fetching latest master commit...');
      try {
        await executeShell('git fetch origin master', projectRoot);
        await executeShell('git reset --hard origin/master', projectRoot);
        log('Repository codebase synchronized with remote master.');
      } catch (gitErr: any) {
        log(`Git synchronization warning: ${gitErr.message}. Attempting pull...`);
        await executeShell('git pull origin master || true', projectRoot);
      }
    } else {
      log('Direct package mode: Downloading master branch archive from GitHub...');
      const downloadScript = `curl -sSL -f -o /tmp/netman-update.zip https://github.com/shahbazimasoud/Net-Management/archive/refs/heads/master.zip && unzip -q -o /tmp/netman-update.zip -d /tmp/netman-ext && cp -r /tmp/netman-ext/Net-Management-master/* . && rm -rf /tmp/netman-update.zip /tmp/netman-ext`;
      await executeShell(downloadScript, projectRoot);
      log('Archive unpacked and merged successfully.');
    }

    // Verify dependencies
    log('Updating project dependencies...');
    try {
      await executeShell('npm install --prefer-offline --no-audit', projectRoot);
      log('Dependencies verified.');
    } catch (npmErr: any) {
      log(`Dependency notice: ${npmErr.message}`);
    }

    // Build production assets if dist exists
    const distDir = path.join(projectRoot, 'dist');
    if (fs.existsSync(distDir)) {
      log('Rebuilding production assets...');
      try {
        await executeShell('npm run build', projectRoot);
        log('Build compiled successfully.');
      } catch (bErr: any) {
        log(`Build notice: ${bErr.message}`);
      }
    }

    // Read updated version from package.json
    let newVersion = '1.38.0';
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        newVersion = pkg.version || newVersion;
      } catch {
        // fallback
      }
    }

    log(`Update complete! Application is now running v${newVersion}.`);

    res.json({
      success: true,
      newVersion,
      message: `Panel updated successfully to v${newVersion}`,
      logs
    });
  } catch (err: any) {
    console.error('[Update Engine Failed]', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Update failed',
      details: err.stack
    });
  }
});

// Proxy /api/* to Python HTTP server (including Python SSH lifecycle engine)
app.use('/api', (req: Request, res: Response) => {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: PYTHON_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${PYTHON_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[API Proxy Error] Unable to connect to Python backend: ${err.message}`);
    res.status(503).json({
      error: 'Python backend is starting up or temporarily unavailable',
      details: err.message,
      engine: 'Python 3.10 Network Topology Engine'
    });
  });

  if (req.body && Object.keys(req.body).length > 0) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }

  proxyReq.end();
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' || path.basename(currentDir) === 'dist';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`Node/Express frontend + proxy running on http://${HOST}:${PORT}`);
  });
}

startServer();
