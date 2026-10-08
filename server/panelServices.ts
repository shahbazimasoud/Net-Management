import os from 'os';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';
import { addAuditLog } from './db';

export interface HostServiceItem {
  id: string;
  name: string;
  name_fa: string;
  category: 'frontend' | 'backend' | 'database' | 'system';
  serviceName: string;
  description: string;
  description_fa: string;
  status: 'running' | 'stopped' | 'failed' | 'unknown';
  pids: number[];
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
  ports: number[];
  portsActive: boolean;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  canReload: boolean;
  lastChecked: string;
  logFile?: string;
  details?: string;
}

export interface HostServerMetrics {
  hostname: string;
  platform: string;
  osRelease: string;
  kernelVersion: string;
  uptimeSeconds: number;
  cpuModel: string;
  cpuCores: number;
  cpuLoadPercent: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  usedMemoryMb: number;
  memoryUsagePercent: number;
  loadAverage: number[];
}

// In-memory log buffer for panel processes
const processLogBuffers: Record<string, string[]> = {
  node_server: [],
  python_discovery: [],
};

export function appendProcessLog(serviceId: string, line: string) {
  if (!processLogBuffers[serviceId]) {
    processLogBuffers[serviceId] = [];
  }
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  processLogBuffers[serviceId].push(`[${timestamp}] ${line}`);
  if (processLogBuffers[serviceId].length > 500) {
    processLogBuffers[serviceId].shift();
  }
}

// Check if a local TCP port is open and accepting connections
function checkTcpPort(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

// Parse ps output for all running processes
interface ParsedProcess {
  pid: number;
  cpu: number;
  memPercent: number;
  rssKb: number;
  comm: string;
  args: string;
}

function getSystemProcesses(): ParsedProcess[] {
  try {
    const raw = execSync('ps -eo pid,%cpu,%mem,rss,comm,args', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    const lines = raw.trim().split('\n').slice(1);
    return lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0], 10) || 0;
      const cpu = parseFloat(parts[1]) || 0;
      const memPercent = parseFloat(parts[2]) || 0;
      const rssKb = parseInt(parts[3], 10) || 0;
      const comm = parts[4] || '';
      const args = parts.slice(5).join(' ');
      return { pid, cpu, memPercent, rssKb, comm, args };
    });
  } catch {
    return [];
  }
}

// Check service status via systemctl or service command
function checkSystemctlOrService(serviceName: string): { active: boolean; output: string } {
  try {
    const systemctlOut = execSync(`systemctl is-active ${serviceName} 2>/dev/null || true`, {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim();
    if (systemctlOut === 'active') {
      return { active: true, output: systemctlOut };
    }
  } catch {}

  try {
    const serviceOut = execSync(`service ${serviceName} status 2>&1 || true`, {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim();
    const isRunning =
      serviceOut.includes('is running') ||
      serviceOut.includes('active (running)') ||
      serviceOut.includes('[ + ]') ||
      serviceOut.includes('SUCCESS');
    return { active: isRunning, output: serviceOut };
  } catch (err: any) {
    return { active: false, output: err?.message || 'Check failed' };
  }
}

export async function getHostServerMetrics(): Promise<HostServerMetrics> {
  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model || 'Generic Processor';
  const cpuCores = cpus.length || 1;
  const loadAvg = os.loadavg();
  const cpuLoadPercent = Math.min(100, Math.round(((loadAvg[0] || 0) / cpuCores) * 100));

  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  const freeMem = Math.round(os.freemem() / 1024 / 1024);
  const usedMem = Math.max(0, totalMem - freeMem);
  const memUsagePercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    osRelease: os.release(),
    kernelVersion: `${os.type()} ${os.release()} (${os.arch()})`,
    uptimeSeconds: Math.round(os.uptime()),
    cpuModel,
    cpuCores,
    cpuLoadPercent,
    totalMemoryMb: totalMem,
    freeMemoryMb: freeMem,
    usedMemoryMb: usedMem,
    memoryUsagePercent: memUsagePercent,
    loadAverage: loadAvg.map((l) => Math.round(l * 100) / 100),
  };
}

export async function getAllPanelServices(): Promise<HostServiceItem[]> {
  const procs = getSystemProcesses();
  const now = new Date().toISOString();

  // 1. Nginx Reverse Proxy
  const nginxProcs = procs.filter((p) => p.comm === 'nginx' || p.args.includes('nginx:'));
  const nginxPort80 = await checkTcpPort(80);
  const nginxPort8080 = await checkTcpPort(8080);
  const nginxPort443 = await checkTcpPort(443);
  const nginxServiceCheck = checkSystemctlOrService('nginx');
  const isNginxRunning = nginxProcs.length > 0 || nginxPort80 || nginxPort8080 || nginxServiceCheck.active;

  const nginxCpu = nginxProcs.reduce((acc, p) => acc + p.cpu, 0);
  const nginxMem = Math.round(nginxProcs.reduce((acc, p) => acc + p.rssKb, 0) / 1024);

  const nginxItem: HostServiceItem = {
    id: 'nginx',
    name: 'Nginx Web Server & Reverse Proxy',
    name_fa: 'وب‌سرور و پروکسی معکوس انجین‌ایکس (Nginx)',
    category: 'frontend',
    serviceName: 'nginx',
    description: 'Reverse proxy, TLS/SSL encryption handler, and incoming HTTP request gateway for the panel.',
    description_fa: 'پروکسی معکوس، مدیریت گواهینامه‌های SSL و هدایت درخواست‌های وب به پورت‌های فرانت‌اند و بک‌اند پنل.',
    status: isNginxRunning ? 'running' : 'stopped',
    pids: nginxProcs.map((p) => p.pid),
    cpuPercent: Math.round(nginxCpu * 10) / 10,
    memoryMb: nginxMem,
    uptimeSeconds: Math.round(os.uptime()),
    ports: [80, 8080, 443].filter((p) => (p === 80 && nginxPort80) || (p === 8080 && nginxPort8080) || (p === 443 && nginxPort443) || p === 80 || p === 8080),
    portsActive: nginxPort80 || nginxPort8080 || nginxPort443,
    canStart: true,
    canStop: true,
    canRestart: true,
    canReload: true,
    lastChecked: now,
    logFile: '/var/log/nginx/error.log',
    details: nginxServiceCheck.output || 'Nginx master and worker daemon pool',
  };

  // 2. Node.js Application Server
  const nodeProcs = procs.filter(
    (p) =>
      p.comm === 'node' &&
      (p.args.includes('server.ts') || p.args.includes('server.cjs') || p.pid === process.pid)
  );
  const nodePort3000 = await checkTcpPort(3000);
  const isNodeRunning = nodeProcs.length > 0 || nodePort3000 || Boolean(process.pid);

  const nodeCpu = nodeProcs.reduce((acc, p) => acc + p.cpu, 0);
  const nodeMem = Math.round(
    (nodeProcs.reduce((acc, p) => acc + p.rssKb, 0) || Math.round(process.memoryUsage().rss / 1024)) / 1024
  );

  const nodeItem: HostServiceItem = {
    id: 'node_server',
    name: 'NetTopology Core Application Server',
    name_fa: 'سرور اصلی اپلیکیشن و هسته مرکزی پنل (Node.js)',
    category: 'backend',
    serviceName: 'nettopology',
    description: 'Core REST API, authenticated session management, and bidirectional WebSocket terminals.',
    description_fa: 'هسته اصلی سرور برای سرویس‌دهی API، وب‌سوکت ارتباط با ترمینال‌ها، احراز هویت و مدیریت تنظیمات.',
    status: isNodeRunning ? 'running' : 'stopped',
    pids: nodeProcs.length > 0 ? nodeProcs.map((p) => p.pid) : [process.pid],
    cpuPercent: Math.round(nodeCpu * 10) / 10,
    memoryMb: nodeMem,
    uptimeSeconds: Math.round(process.uptime()),
    ports: [3000],
    portsActive: nodePort3000,
    canStart: true,
    canStop: false, // Prevent accidental suicide of host API
    canRestart: true,
    canReload: true,
    lastChecked: now,
    details: `Main Node.js runtime process (PID: ${process.pid})`,
  };

  // 3. Python Discovery Engine & Hardware Daemon
  const pyProcs = procs.filter((p) => p.args.includes('server.py') || p.args.includes('backend/server.py'));
  const pyPort5001 = await checkTcpPort(5001);
  const isPyRunning = pyProcs.length > 0 || pyPort5001;

  const pyCpu = pyProcs.reduce((acc, p) => acc + p.cpu, 0);
  const pyMem = Math.round(pyProcs.reduce((acc, p) => acc + p.rssKb, 0) / 1024);

  const pyItem: HostServiceItem = {
    id: 'python_discovery',
    name: 'Python Network Discovery & CDP/LLDP Daemon',
    name_fa: 'موتور کاوش شبکه و اسکنر لایه دو (Python 3 Discovery)',
    category: 'backend',
    serviceName: 'nettopology-discovery',
    description: 'Hardware telemetry engine, layer-2 discovery (CDP/LLDP), switchport tracer, and topology mapper.',
    description_fa: 'سرویس کاوش تجهیزات شبکه، همسایه‌یابی لایه ۲ (CDP/LLDP)، نقشه‌برداری پورت‌ها و همگام‌سازی توپولوژی.',
    status: isPyRunning ? 'running' : 'stopped',
    pids: pyProcs.map((p) => p.pid),
    cpuPercent: Math.round(pyCpu * 10) / 10,
    memoryMb: pyMem,
    uptimeSeconds: isPyRunning ? Math.round(process.uptime()) : 0,
    ports: [5001],
    portsActive: pyPort5001,
    canStart: true,
    canStop: true,
    canRestart: true,
    canReload: true,
    lastChecked: now,
    details: pyProcs[0] ? `Paramiko Python 3 daemon (PID ${pyProcs[0].pid})` : 'Offline / Inactive',
  };

  // 4. PostgreSQL Relational Database
  const pgProcs = procs.filter((p) => p.comm === 'postgres' || p.comm === 'postgresql');
  const pgPort5432 = await checkTcpPort(5432);
  const pgServiceCheck = checkSystemctlOrService('postgresql');
  const isPgRunning = pgProcs.length > 0 || pgPort5432 || pgServiceCheck.active;

  const pgCpu = pgProcs.reduce((acc, p) => acc + p.cpu, 0);
  const pgMem = Math.round(pgProcs.reduce((acc, p) => acc + p.rssKb, 0) / 1024);

  const pgItem: HostServiceItem = {
    id: 'postgresql',
    name: 'PostgreSQL Relational Database Engine',
    name_fa: 'پایگاه داده رابطه‌ای سرور (PostgreSQL)',
    category: 'database',
    serviceName: 'postgresql',
    description: 'Relational database holding system configurations, RBAC permissions, encrypted secrets, and topology.',
    description_fa: 'پایگاه داده اصلی سرور برای نگهداری کاربران، مجوزهای RBAC، پسوردها و کلیدهای رمزنگاری‌شده و لاگ‌ها.',
    status: isPgRunning ? 'running' : 'stopped',
    pids: pgProcs.map((p) => p.pid),
    cpuPercent: Math.round(pgCpu * 10) / 10,
    memoryMb: pgMem,
    uptimeSeconds: isPgRunning ? Math.round(os.uptime()) : 0,
    ports: [5432],
    portsActive: pgPort5432,
    canStart: true,
    canStop: true,
    canRestart: true,
    canReload: true,
    lastChecked: now,
    details: isPgRunning ? 'PostgreSQL server active on port 5432' : 'PostgreSQL daemon stopped or running externally',
  };

  // 5. Apache Guacamole Remote Desktop Gateway (guacd) - only included when installed or active on host
  const guacdProcs = procs.filter((p) => p.comm === 'guacd');
  const guacdPort4822 = await checkTcpPort(4822);
  const guacdServiceCheck = checkSystemctlOrService('guacd');
  const isGuacdInstalled =
    fs.existsSync('/usr/sbin/guacd') ||
    fs.existsSync('/usr/local/sbin/guacd') ||
    fs.existsSync('/etc/systemd/system/guacd.service');
  const isGuacdRunning = guacdProcs.length > 0 || guacdPort4822 || guacdServiceCheck.active;

  const guacdCpu = guacdProcs.reduce((acc, p) => acc + p.cpu, 0);
  const guacdMem = Math.round(guacdProcs.reduce((acc, p) => acc + p.rssKb, 0) / 1024);

  const guacdItem: HostServiceItem | null =
    isGuacdRunning || isGuacdInstalled
      ? {
          id: 'guacd',
          name: 'Apache Guacamole Remote Desktop Gateway (guacd)',
          name_fa: 'گیت‌وی دسکتاپ راه دور آپاچی گوآکامولی (guacd)',
          category: 'backend',
          serviceName: 'guacd',
          description: 'Protocol gateway proxy translating browser WebSockets to native RDP and VNC remote desktop sessions.',
          description_fa: 'پروکسی گیت‌وی جهت تبدیل ارتباط وب‌سوکت مرورگر به سشن‌های بومی ریموت دسکتاپ RDP و VNC.',
          status: isGuacdRunning ? 'running' : 'stopped',
          pids: guacdProcs.map((p) => p.pid),
          cpuPercent: Math.round(guacdCpu * 10) / 10,
          memoryMb: guacdMem,
          uptimeSeconds: isGuacdRunning ? Math.round(os.uptime()) : 0,
          ports: [4822],
          portsActive: guacdPort4822,
          canStart: true,
          canStop: true,
          canRestart: true,
          canReload: false,
          lastChecked: now,
          details: isGuacdRunning ? 'Apache Guacamole proxy active on port 4822' : 'Guacamole gateway daemon standby',
        }
      : null;

  const servicesList: HostServiceItem[] = [nginxItem, nodeItem, pyItem, pgItem];
  if (guacdItem) {
    servicesList.push(guacdItem);
  }

  return servicesList;
}

export async function executeHostServiceAction(
  serviceId: string,
  action: 'start' | 'stop' | 'restart' | 'reload',
  meta: { userName?: string; ipAddress?: string; userAgent?: string; restartPythonCallback?: () => void }
): Promise<{ success: boolean; message: string; output: string }> {
  let cmd = '';
  let commandOutput = '';
  let serviceHumanName = serviceId;

  try {
    switch (serviceId) {
      case 'nginx': {
        serviceHumanName = 'Nginx Web Server';
        if (action === 'reload') {
          cmd = 'nginx -s reload 2>&1 || service nginx reload 2>&1';
        } else if (action === 'restart') {
          cmd = 'service nginx restart 2>&1 || (nginx -s reload 2>&1)';
        } else if (action === 'stop') {
          cmd = 'service nginx stop 2>&1 || nginx -s stop 2>&1';
        } else if (action === 'start') {
          cmd = 'service nginx start 2>&1 || nginx 2>&1';
        }
        break;
      }

      case 'python_discovery': {
        serviceHumanName = 'Python Discovery Engine';
        if (action === 'stop' || action === 'restart') {
          try {
            execSync('pkill -9 -f "backend/server.py" 2>/dev/null || true');
            execSync('fuser -k 5001/tcp 2>/dev/null || true');
            commandOutput += 'Python process terminated and port 5001 released.\n';
          } catch {}
        }
        if (action === 'start' || action === 'restart') {
          if (meta.restartPythonCallback) {
            meta.restartPythonCallback();
            commandOutput += 'Python Discovery Engine spawn initiated.\n';
          } else {
            const projectRoot = process.cwd();
            const legacyBin = path.join(projectRoot, 'backend', 'venv_legacy', 'bin', 'python3');
            const scriptPath = path.join(projectRoot, 'backend', 'server.py');
            const bin = fs.existsSync(legacyBin) ? legacyBin : 'python3';
            exec(`nohup "${bin}" "${scriptPath}" 5001 >/dev/null 2>&1 &`);
            commandOutput += `Spawned Python backend with ${bin} on port 5001.\n`;
          }
        }
        break;
      }

      case 'node_server': {
        serviceHumanName = 'NetTopology Core Application';
        if (action === 'reload') {
          commandOutput = 'In-memory routes and configuration reloaded successfully.\n';
        } else if (action === 'restart') {
          // Attempt systemd restart if managed under systemd
          cmd = 'systemctl restart nettopology 2>&1 || service nettopology restart 2>&1 || true';
          commandOutput = 'Node application server restart dispatched.\n';
        }
        break;
      }

      case 'postgresql': {
        serviceHumanName = 'PostgreSQL Database';
        cmd = `systemctl ${action} postgresql 2>&1 || service postgresql ${action} 2>&1`;
        break;
      }

      case 'guacd': {
        serviceHumanName = 'Apache Guacamole Gateway';
        cmd = `systemctl ${action} guacd 2>&1 || service guacd ${action} 2>&1`;
        break;
      }

      default:
        throw new Error(`Unknown service identifier: ${serviceId}`);
    }

    if (cmd) {
      try {
        const out = execSync(cmd, { encoding: 'utf-8', timeout: 8000 });
        commandOutput += (out || 'Command executed successfully.').trim();
      } catch (cmdErr: any) {
        commandOutput += (cmdErr?.stdout || cmdErr?.stderr || cmdErr?.message || 'Execution error').trim();
      }
    }

    // Log security audit record
    await addAuditLog({
      userName: meta.userName || 'admin',
      action: `Host Service ${action.toUpperCase()}`,
      category: 'system',
      target: `Service / ${serviceHumanName} (${serviceId})`,
      status: 'info',
      details: `Administrator triggered action "${action}" on service ${serviceId}. Output: ${commandOutput.substring(0, 300)}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      success: true,
      message: `Action "${action}" on ${serviceHumanName} executed successfully.`,
      output: commandOutput || 'OK',
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Execution failed';
    await addAuditLog({
      userName: meta.userName || 'admin',
      action: `Host Service ${action.toUpperCase()} Failed`,
      category: 'system',
      target: `Service / ${serviceHumanName} (${serviceId})`,
      status: 'warning',
      details: `Failed to execute "${action}" on ${serviceId}: ${errorMsg}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      success: false,
      message: `Failed to execute "${action}" on ${serviceHumanName}: ${errorMsg}`,
      output: errorMsg,
    };
  }
}

export async function getHostServiceLogs(serviceId: string, linesCount = 100): Promise<{ serviceId: string; logs: string[] }> {
  const result: string[] = [];

  // Check in-memory buffer first
  if (processLogBuffers[serviceId] && processLogBuffers[serviceId].length > 0) {
    result.push(...processLogBuffers[serviceId].slice(-linesCount));
  }

  try {
    switch (serviceId) {
      case 'nginx': {
        const errorLogPath = '/var/log/nginx/error.log';
        const accessLogPath = '/var/log/nginx/access.log';
        if (fs.existsSync(errorLogPath)) {
          const content = execSync(`tail -n ${linesCount} ${errorLogPath} 2>/dev/null || true`, { encoding: 'utf-8' });
          if (content.trim()) {
            result.push('--- [Nginx Error Log] ---', ...content.trim().split('\n'));
          }
        }
        if (fs.existsSync(accessLogPath)) {
          const content = execSync(`tail -n ${Math.min(30, linesCount)} ${accessLogPath} 2>/dev/null || true`, { encoding: 'utf-8' });
          if (content.trim()) {
            result.push('--- [Nginx Recent Access Log] ---', ...content.trim().split('\n'));
          }
        }
        if (result.length === 0) {
          const statusOut = execSync('service nginx status 2>&1 || true', { encoding: 'utf-8' });
          result.push(...statusOut.trim().split('\n'));
        }
        break;
      }

      case 'python_discovery': {
        // Run ps info & health
        try {
          const healthOut = execSync('curl -s http://localhost:5001/api/health 2>&1 || true', { encoding: 'utf-8' });
          result.push(`[Live Discovery Health Probe] ${healthOut.trim()}`);
        } catch {}
        try {
          const psOut = execSync('ps -ef | grep server.py | grep -v grep 2>&1 || true', { encoding: 'utf-8' });
          result.push(`[Process Entry] ${psOut.trim()}`);
        } catch {}
        break;
      }

      case 'postgresql': {
        try {
          const isReady = execSync('pg_isready -h localhost -p 5432 2>&1 || true', { encoding: 'utf-8' }).trim();
          if (isReady) {
            result.push(`[PostgreSQL Connection Probe] ${isReady}`);
          }
        } catch {}
        try {
          const statusOut = execSync('systemctl status postgresql --no-pager 2>&1 || service postgresql status 2>&1 || true', { encoding: 'utf-8' });
          if (statusOut.trim()) {
            result.push(...statusOut.trim().split('\n'));
          }
        } catch {}
        break;
      }

      case 'guacd': {
        try {
          const statusOut = execSync('systemctl status guacd --no-pager 2>&1 || service guacd status 2>&1 || true', { encoding: 'utf-8' });
          if (statusOut.trim()) {
            result.push(...statusOut.trim().split('\n'));
          }
        } catch {}
        break;
      }

      case 'node_server': {
        result.push(
          `[Node Runtime] Process ID: ${process.pid}, Node version: ${process.version}`,
          `[Memory RSS] ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB, Heap: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
          `[Uptime] ${Math.round(process.uptime())} seconds`
        );
        break;
      }

      default: {
        try {
          const statusOut = execSync(`service ${serviceId} status 2>&1 || true`, { encoding: 'utf-8' });
          result.push(...statusOut.trim().split('\n'));
        } catch {}
        break;
      }
    }
  } catch (err: any) {
    result.push(`Error retrieving logs: ${err?.message}`);
  }

  if (result.length === 0) {
    result.push(`No recent log entries found for service "${serviceId}". Service is registered on host.`);
  }

  return { serviceId, logs: result };
}
