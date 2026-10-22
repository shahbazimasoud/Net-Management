import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StringDecoder } from 'string_decoder';
import { WebSocketServer, WebSocket } from 'ws';
import { Client, ConnectConfig } from 'ssh2';
import { resolveSshBackend } from './sshBackendResolver';

/**
 * Safely decrypts Fernet-encrypted tokens ('enc:fernet:...') using Node.js crypto
 */
function decryptFernetCredential(encrypted: string, projectRoot: string): string {
  if (!encrypted || typeof encrypted !== 'string') return '';
  if (!encrypted.startsWith('enc:fernet:')) return encrypted;

  const tokenStr = encrypted.replace(/^enc:fernet:/, '');
  try {
    const raw = Buffer.from(tokenStr.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (raw.length < 57) return encrypted;

    // Collect candidate 32-byte encryption keys
    const candidateKeys: Buffer[] = [];
    const envKey = process.env.NETTOP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (envKey) {
      try {
        const b = Buffer.from(envKey.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        if (b.length === 32) candidateKeys.push(b);
      } catch {}
    }

    const keyPath = path.resolve(projectRoot, 'backend', 'security', '.secret.key');
    if (fs.existsSync(keyPath)) {
      try {
        const rawKey = fs.readFileSync(keyPath, 'utf-8').trim();
        const b = Buffer.from(rawKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        if (b.length === 32) candidateKeys.push(b);
      } catch {}
    }

    const seedSecrets = [
      process.env.VAULT_SECRET,
      process.env.JWT_SECRET,
      'nettopology_vault_master_key_2026_aes256gcm_safe',
      'nettopology_super_secret_jwt_key_2026_cisco_ops',
    ];
    for (const s of seedSecrets) {
      if (s) {
        candidateKeys.push(crypto.createHash('sha256').update(s).digest());
      }
    }

    const iv = raw.subarray(9, 25);
    const ciphertext = raw.subarray(25, raw.length - 32);

    for (const keyBuffer of candidateKeys) {
      try {
        const encKey = keyBuffer.subarray(16, 32);
        const decipher = crypto.createDecipheriv('aes-128-cbc', encKey, iv);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
        decrypted += decipher.final('utf-8');
        if (decrypted && decrypted.length > 0) {
          return decrypted;
        }
      } catch {}
    }
    return encrypted;
  } catch {
    return encrypted;
  }
}

/**
 * Zero-leak sanitizer for command line audit logging (Rule 14)
 * Masks plain-text passwords or secret tokens in command strings
 */
function sanitizeCommandForAudit(cmd: string): string {
  if (!cmd) return '';
  return cmd
    .replace(/(-p|--password=)\s*['"]?[^\s'"]+['"]?/gi, '$1 ******')
    .replace(/(PASS|PASSWORD|SECRET|TOKEN|KEY)=['"]?[^\s'"]+['"]?/gi, '$1=******')
    .replace(/(echo\s+['"])([^'"]+)(['"]\s*\|\s*sudo\s+-S)/gi, '$1******$3');
}

/**
 * Classifies command risk level and generates bilingual audit summaries
 */
function classifySshCommandRisk(cmd: string): { riskLevel: 'low' | 'medium' | 'high' | 'critical'; summary: string; summaryEn: string } {
  const c = cmd.trim();
  const lower = c.toLowerCase();

  // Critical commands: destructive, reboot, or total security disable
  if (
    /(\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|\s+.*-r.*)(\/|(\/\*)|~|\.|\.\.)\b)|(\bmkfs(\.[a-z0-9]+)?\b)|(\bdd\s+if=)|(\bwipefs\b)|(\bfdisk\b)|(\bparted\b)|(\bshutdown\b)|(\breboot\b)|(\bpoweroff\b)|(\binit\s+[06]\b)|(\bufw\s+disable\b)|(\biptables\s+-F\b)|(\bformat\s+[a-z]:)/i.test(lower)
  ) {
    return {
      riskLevel: 'critical',
      summary: `دستور حیاتی یا پرخطر با اثر تخریبی یا راه‌اندازی مجدد: ${c.substring(0, 80)}`,
      summaryEn: `Critical high-impact system or destructive command: ${c.substring(0, 80)}`,
    };
  }

  // High risk commands: permissions, user deletion, service termination, packet filtering rules
  if (
    /(\brm\s+-[a-zA-Z]*r)|(\bchmod\s+(-R\s+)?(777|000|u\+s))\b|(\bchown\s+-R\b)|(\buserdel\b)|(\bgroupdel\b)|(\bpasswd\b)|(\bvisudo\b)|(\bsystemctl\s+(stop|disable|mask)\b)|(\bservice\s+\S+\s+stop\b)|(\bpkill\b)|(\bkillall\b)|(\bkill\s+-9\b)|(\btruncate\b)|(\bdrop\s+(database|table)\b)|(\biptables\b)|(\bufw\s+(delete|reset|deny)\b)|(\bwr\s+mem\b)|(\berase\s+startup-config\b)|(\breload\b)/i.test(lower)
  ) {
    return {
      riskLevel: 'high',
      summary: `دستور با سطح حساسیت بالا در مدیریت سرویس‌ها یا امنیت: ${c.substring(0, 80)}`,
      summaryEn: `High-sensitivity service management or security alteration command: ${c.substring(0, 80)}`,
    };
  }

  // Medium risk commands: elevated privileges, package installs, restarts, container management
  if (
    /(\bsudo\b)|(\bsu\b)|(\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b)|(\byum\s+(install|remove|update)\b)|(\bdnf\s+(install|remove)\b)|(\bpacman\s+-S)\b|(\bsystemctl\s+(restart|start|reload)\b)|(\bservice\s+\S+\s+(start|restart|reload)\b)|(\bdocker\s+(run|stop|rm|rmi|exec)\b)|(\bgit\s+(push|reset|checkout)\b)|(\bsed\s+-i\b)|(\bmv\b)|(\bcp\s+-r\b)|(\bchmod\b)|(\bchown\b)|(\bnano\b)|(\bvim?\b)|(\bcrontab\b)/i.test(lower)
  ) {
    return {
      riskLevel: 'medium',
      summary: `دستور پیکربندی، بسته‌های نرم‌افزاری یا تغییر دسترسی: ${c.substring(0, 80)}`,
      summaryEn: `Configuration, package management, or file modification command: ${c.substring(0, 80)}`,
    };
  }

  // Low risk: standard telemetry, read-only inspection, navigation
  return {
    riskLevel: 'low',
    summary: `دستور مانیتورینگ، بررسی وضعیت یا پیمایش شل: ${c.substring(0, 80)}`,
    summaryEn: `Read-only, telemetry, navigation, or shell inspection command: ${c.substring(0, 80)}`,
  };
}

/**
 * Terminal WebSocket Gateway
 * Supports native direct ssh2 client for real switches (Cisco, MikroTik) and Linux servers
 * with full interactive PTY streaming, broad cipher suite negotiation, input forwarding,
 * and seamless credential resolution.
 */
export function setupTerminalWebSocket(
  server: http.Server,
  pythonPort: number,
  projectRoot: string,
  pythonWsPort: number = 5002
) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (
      url.startsWith('/ws/terminal') ||
      url.startsWith('/api/terminal/ws') ||
      url.startsWith('/ws/ssh') ||
      url.startsWith('/ssh')
    ) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);

    // Extract device_id from path /ws/ssh/:deviceId, /ws/terminal/:deviceId, /ssh/:deviceId or query params
    let deviceId = '';
    const cleanPath = parsedUrl.pathname.replace(/^\/+/, '');
    const parts = cleanPath.split('/');
    if (parts.length >= 3 && parts[0] === 'ws' && (parts[1] === 'ssh' || parts[1] === 'terminal')) {
      deviceId = parts[2];
    } else if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'terminal' && parts[2] === 'ws') {
      deviceId = parts[3];
    } else if (parts.length >= 2 && (parts[0] === 'ssh' || parts[0] === 'terminal')) {
      deviceId = parts[1];
    }

    if (!deviceId) {
      deviceId = parsedUrl.searchParams.get('deviceId') || parsedUrl.searchParams.get('device_id') || '';
    }

    let rawHost = parsedUrl.searchParams.get('host') || parsedUrl.searchParams.get('ip') || '';
    let host = rawHost === 'undefined' || rawHost === 'null' ? '' : rawHost.trim();
    let portStr = parsedUrl.searchParams.get('port') || '22';
    let port = parseInt(portStr === 'undefined' || portStr === 'null' ? '22' : portStr, 10) || 22;
    let rawUser = (parsedUrl.searchParams.get('username') || parsedUrl.searchParams.get('user') || '').trim();
    let username = rawUser === 'undefined' || rawUser === 'null' ? '' : rawUser;
    let rawPassword = parsedUrl.searchParams.get('password') || '';
    let password = rawPassword === 'undefined' || rawPassword === 'null' ? '' : rawPassword;
    const shell = parsedUrl.searchParams.get('shell') || 'bash';
    let devPlatform = parsedUrl.searchParams.get('platform') || '';
    let devSshVersion = parsedUrl.searchParams.get('ssh_version') || parsedUrl.searchParams.get('sshVersion') || '';

    // Extract language preference
    const rawLang = parsedUrl.searchParams.get('lang') || parsedUrl.searchParams.get('language') || 'fa';
    const isEn = rawLang.toLowerCase() === 'en';

    // Extract operator user context & client IP
    const clientIp = (
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1'
    ).replace(/^::ffff:/, '');

    const token = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('auth') || '';
    let operatorUserId = '';
    let operatorUserName = parsedUrl.searchParams.get('operator_user') || 'admin';
    let operatorUserRole = parsedUrl.searchParams.get('operator_role') || 'Super Administrator';

    if (token) {
      try {
        const { verifyToken } = await import('./auth');
        const payload = verifyToken(token);
        if (payload) {
          operatorUserId = payload.userId || '';
          operatorUserName = payload.username || payload.fullName || operatorUserName;
          operatorUserRole = payload.role || operatorUserRole;
        }
      } catch (authErr: any) {
        console.warn('[TerminalWs] Token decode notice:', authErr?.message);
      }
    }

    let srv: any = null;
    let dev: any = null;

    // Authoritative lookup: First directly from PostgreSQL, then fallback to JSON stores
    try {

      // 1. Authoritative lookup in PostgreSQL database
      try {
        const { getDeviceById, getRemoteServerById, getAllDevices, getAllRemoteServers } = await import('./db');
        if (deviceId) {
          dev = await getDeviceById(deviceId);
          if (!dev) {
            srv = await getRemoteServerById(deviceId);
          }
        }
        if (!dev && !srv && host) {
          const allDevs = await getAllDevices();
          dev = allDevs.find(
            (d: any) =>
              (deviceId && (d.id === deviceId || d.name === deviceId)) ||
              (host && (d.ip === host || d.ssh_host === host || d.connection?.host === host))
          );
          if (!dev) {
            const allSrvs = await getAllRemoteServers();
            srv = allSrvs.find(
              (s: any) =>
                (deviceId && (s.id === deviceId || s.name === deviceId || s.hostname === deviceId)) ||
                (host && (s.ip === host || s.hostname === host))
            );
          }
        }
      } catch (pgErr: any) {
        console.warn('[TerminalWs] PostgreSQL authoritative lookup notice:', pgErr.message);
      }

      // 2. Fallback to file stores if not found in PostgreSQL
      if (!srv && !dev) {
        const storePaths = [
          path.resolve(projectRoot, 'backend', 'database_store.json'),
          path.resolve(projectRoot, 'backend', 'network_data.json'),
        ];

        for (const storePath of storePaths) {
          if (!fs.existsSync(storePath)) continue;
          const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));

          if (!srv) {
            srv = (store.remote_servers || []).find(
              (s: any) =>
                (deviceId && (s.id === deviceId || s.name === deviceId || s.hostname === deviceId)) ||
                (host && (s.ip === host || s.hostname === host))
            );
          }

          if (!dev) {
            dev = (store.devices || []).find(
              (d: any) =>
                (deviceId && (d.id === deviceId || d.name === deviceId)) ||
                (host && (d.ip === host || d.ssh_host === host || d.connection?.host === host))
            );
          }

          if (srv || dev) break;
        }
      }

      // 3. Process Remote Server if resolved
      if (srv) {
        if (!host) host = srv.ip || srv.hostname || '';
        if (!port || port === 22) port = srv.ssh_port || 22;
        if (!username) username = srv.ssh_username || 'root';
        if (!password && !srv.prompt_password_on_connect) {
          // Dynamic Credential Resolver: Live Vault binding first
          if (srv.ssh_vault_item_id) {
            try {
              const { resolveDynamicVaultPassword } = await import('./db');
              const vaultPass = await resolveDynamicVaultPassword(srv.ssh_vault_item_id);
              if (vaultPass) password = vaultPass;
            } catch (vaultErr: any) {
              console.warn('[TerminalWs] Dynamic vault resolution notice for server:', vaultErr.message);
            }
          }
          if (!password) {
            password = srv.ssh_password || '';
          }
        }
        if (!devPlatform) devPlatform = 'generic_linux';

        // Authoritative server scope check in PostgreSQL
        const token = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('auth') || '';
        if (token) {
          try {
            const { verifyToken } = await import('./auth');
            const payload = verifyToken(token);
            if (payload) {
              const { getEffectivePolicyForUser, isServerActionPermitted } = await import('./db');
              const eff = await getEffectivePolicyForUser(payload);
              const cleanU = (payload.username || '').toLowerCase();
              const cleanR = (payload.role || '').toLowerCase();
              const isSuper = cleanU === 'admin' || cleanR.includes('super admin') || cleanR.includes('administrator');
              if (!isSuper && eff) {
                if (Array.isArray(eff.allowedServerIds)) {
                  const allowedSet = new Set(eff.allowedServerIds.map((id: string) => (id || '').trim().toLowerCase()));
                  if (!allowedSet.has((srv.id || '').toLowerCase()) && !allowedSet.has((srv.name || '').toLowerCase())) {
                    clientWs.send(JSON.stringify({ type: 'output', data: '\r\n\x1b[31m[Access Denied]: You do not have permission to access this server based on your assigned Device Groups in PostgreSQL.\x1b[0m\r\n' }));
                    clientWs.close(4003, 'Forbidden');
                    return;
                  }
                }
                if (!isServerActionPermitted(eff, srv.id, 'terminal')) {
                  clientWs.send(JSON.stringify({ type: 'output', data: '\r\n\x1b[31m[Access Denied]: Terminal and remote shell access to this server is prohibited by your RBAC access policy.\x1b[0m\r\n' }));
                  clientWs.close(4003, 'Forbidden');
                  return;
                }
              }
            }
          } catch (authErr: any) {
            console.warn('[TerminalWs] Scope verification notice:', authErr.message);
          }
        }
      } else if (dev) {
        // 4. Process Network Device (Cisco, MikroTik, switches, routers)
        if (!host) host = dev.ssh_host || dev.connection?.host || dev.ip || '';
        if (!port || port === 22) port = dev.connection?.port || dev.ssh_port || 22;
        if (!username) username = dev.connection?.username || dev.ssh_username || 'admin';
        if (!password) {
          // Dynamic Credential Resolver: Live Vault binding first
          if (dev.ssh_vault_item_id) {
            try {
              const { resolveDynamicVaultPassword } = await import('./db');
              const vaultPass = await resolveDynamicVaultPassword(dev.ssh_vault_item_id);
              if (vaultPass) password = vaultPass;
            } catch (vaultErr: any) {
              console.warn('[TerminalWs] Dynamic vault resolution notice for device:', vaultErr.message);
            }
          }
          if (!password) {
            password = dev.ssh_password || dev.connection?.password || '';
          }
        }
        if (!devPlatform) {
          devPlatform = dev.platform || dev.device_type || '';
        }
        if (!devSshVersion) {
          devSshVersion = dev.ssh_version || dev.sshVersion || (dev.platform?.includes('modern') ? 'modern' : 'legacy');
        }

        // Authoritative network equipment scope & terminal permission check in PostgreSQL
        const token = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('auth') || '';
        if (token) {
          try {
            const { verifyToken } = await import('./auth');
            const payload = verifyToken(token);
            if (payload) {
              const { getEffectivePolicyForUser, isDeviceActionPermitted } = await import('./db');
              const eff = await getEffectivePolicyForUser(payload);
              const cleanU = (payload.username || '').toLowerCase();
              const cleanR = (payload.role || '').toLowerCase();
              const isSuper = cleanU === 'admin' || cleanR.includes('super admin') || cleanR.includes('administrator');
              if (!isSuper && eff) {
                if (Array.isArray(eff.allowedDeviceIds)) {
                  const allowedSet = new Set(eff.allowedDeviceIds.map((id: string) => (id || '').trim().toLowerCase()));
                  if (!allowedSet.has((dev.id || '').toLowerCase()) && !allowedSet.has((dev.name || '').toLowerCase())) {
                    clientWs.send(JSON.stringify({
                      type: 'output',
                      data: '\r\n\x1b[31m[Access Denied]: You do not have permission to access this network device based on your assigned Device Groups in PostgreSQL.\x1b[0m\r\n'
                    }));
                    clientWs.close(4003, 'Forbidden');
                    return;
                  }
                }
                if (!isDeviceActionPermitted(eff, dev.id, 'terminal')) {
                  clientWs.send(JSON.stringify({
                    type: 'output',
                    data: '\r\n\x1b[31m[Access Denied]: Terminal and interactive CLI access to this network device is prohibited by your RBAC access policy in PostgreSQL.\x1b[0m\r\n'
                  }));
                  clientWs.close(4003, 'Forbidden');
                  return;
                }
              }
            }
          } catch (authErr: any) {
            console.warn('[TerminalWs] Device scope verification notice:', authErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('[TerminalWs] Database store lookup warning:', err);
    }

    // Decrypt credentials if stored encrypted (AES-256-GCM enc:v1: or legacy Fernet enc:fernet:)
    if (password && password.startsWith('enc:v1:')) {
      try {
        const { decryptServerSecret } = await import('./vaultCrypto');
        password = decryptServerSecret(password);
      } catch (decErr: any) {
        console.warn('[TerminalWs] AES-256-GCM secret decryption notice:', decErr.message);
      }
    } else if (password && password.startsWith('enc:fernet:')) {
      try {
        const { decryptFernetToken } = await import('./db');
        const dec = decryptFernetToken(password);
        if (dec && !dec.startsWith('enc:fernet:')) {
          password = dec;
        } else {
          password = decryptFernetCredential(password, projectRoot);
        }
      } catch {
        password = decryptFernetCredential(password, projectRoot);
      }
    }

    // Ensure username is never empty and appropriately defaulted
    if (!username) {
      const isLinux = devPlatform.toLowerCase().includes('linux') || shell === 'bash';
      username = isLinux ? 'root' : 'admin';
    }

    const sendClient = (payload: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        if (typeof payload === 'string') {
          clientWs.send(payload);
        } else {
          clientWs.send(JSON.stringify(payload));
        }
      }
    };

    const formatTerminalError = (err: string): string => {
      const eLower = (err || '').toLowerCase();
      if (
        eLower.includes('no existing session') ||
        eLower.includes('illegal info request') ||
        eLower.includes('keyboard-interactive') ||
        eLower.includes('session closed') ||
        eLower.includes('session reset')
      ) {
        return isEn
          ? 'Interactive session challenge (Keyboard-Interactive authentication required by device)'
          : 'چالش نشست تعاملی (نیاز به احراز هویت تعاملی Keyboard-Interactive توسط تجهیز)';
      }
      if (eLower.includes('authentication') || eLower.includes('denied') || eLower.includes('invalid username') || eLower.includes('auth failed')) {
        const uDisplay = (username || '').trim() || 'admin';
        return isEn
          ? `Authentication failed: Invalid username or password for user '${uDisplay}'`
          : `احراز هویت ناموفق بود: نام کاربری یا کلمه عبور کاربر '${uDisplay}' نادرست است`;
      }
      if (eLower.includes('timed out') || eLower.includes('timeout')) {
        return isEn
          ? `Connection timed out connecting to ${host}:${port}`
          : `مهلت زمان اتصال به ${host}:${port} به پایان رسید`;
      }
      if (eLower.includes('refused')) {
        return isEn
          ? `Connection refused by ${host}:${port}`
          : `اتصال توسط پورت ${port} در ${host} رد شد (Connection refused)`;
      }
      if (eLower.includes('unreachable') || eLower.includes('no route')) {
        return isEn
          ? `Host ${host} is unreachable`
          : `آدرس ${host} در شبکه در دسترس نیست`;
      }
      return err;
    };

    // If host is configured, establish live interactive SSH session via native Node.js ssh2 client
    if (host && host !== '0.0.0.0') {
      const queryCols = parseInt(parsedUrl.searchParams.get('cols') || '', 10);
      const queryRows = parseInt(parsedUrl.searchParams.get('rows') || '', 10);
      let currentCols = queryCols > 0 && queryCols <= 500 ? queryCols : 120;
      let currentRows = queryRows > 0 && queryRows <= 200 ? queryRows : 36;

      sendClient({
        type: 'status',
        status: 'connecting',
        host,
        port,
        ssh_version: devSshVersion || 'v2',
        message: isEn
          ? `Connecting to ${host}:${port} via SSH v2 (${devSshVersion === 'modern' ? 'Modern' : 'Adaptive'})...`
          : `در حال اتصال به ${host}:${port} از طریق SSH v2 (${devSshVersion === 'modern' ? 'مدرن' : 'تطبیقی'})...`,
      });

      const sshConn = new Client();
      let activeStream: any = null;
      let isConnected = false;
      let isCleanedUp = false;

      // Phase 3: SSH Session & Command Line Tracking State
      const sessionId = `ssh-sess-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const sessionStartTime = Date.now();
      let commandsExecutedCount = 0;
      let sessionOpenedLogged = false;
      let sessionClosedLogged = false;
      let lineBuffer = '';
      let recentOutputTail = '';
      let isExpectingPassword = false;

      const logSessionOpened = async () => {
        if (sessionOpenedLogged) return;
        sessionOpenedLogged = true;
        try {
          const { addServerCommandLog } = await import('./db');
          await addServerCommandLog({
            userId: operatorUserId,
            userName: operatorUserName,
            userRole: operatorUserRole,
            clientIp,
            serverId: srv?.id || deviceId || '',
            serverName: srv?.name || dev?.name || deviceId || host,
            serverIp: host,
            osType: srv?.os_type || (dev ? (dev.platform || 'network_device') : 'linux'),
            osDistro: srv?.os_distro || srv?.distro || '',
            serverEnvironment: srv?.environment || srv?.server_environment || 'production',
            channel: 'SSH_SHELL',
            actionModule: 'SSH_SESSION',
            actionName: `برقراری نشست SSH با حساب ${username}`,
            actionNameEn: `SSH session opened with account ${username}`,
            command: `SSH ${username}@${host}:${port}`,
            parameters: {
              sessionId,
              account: username,
              port,
              term: 'xterm-256color',
              cols: currentCols,
              rows: currentRows,
              sshVersion: devSshVersion || 'v2',
              event: 'SESSION_OPENED',
            },
            riskLevel: 'low',
            status: 'SUCCESS',
            outputSummary: `نشست ترمینال تعاملی SSH توسط اپراتور ${operatorUserName} روی سرور ${srv?.name || dev?.name || host} آغاز شد.`,
            outputSummaryEn: `Interactive SSH terminal session started by operator ${operatorUserName} on server ${srv?.name || dev?.name || host}.`,
            durationMs: 0,
            metadata: {
              sessionId,
              account: username,
              port,
              clientIp,
              devPlatform,
            },
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          console.warn('[TerminalWs] Failed to log session opened:', err?.message);
        }
      };

      const logSessionFailed = async (errMsg: string) => {
        try {
          const { addServerCommandLog } = await import('./db');
          await addServerCommandLog({
            userId: operatorUserId,
            userName: operatorUserName,
            userRole: operatorUserRole,
            clientIp,
            serverId: srv?.id || deviceId || '',
            serverName: srv?.name || dev?.name || deviceId || host,
            serverIp: host,
            osType: srv?.os_type || (dev ? (dev.platform || 'network_device') : 'linux'),
            osDistro: srv?.os_distro || srv?.distro || '',
            serverEnvironment: srv?.environment || srv?.server_environment || 'production',
            channel: 'SSH_SHELL',
            actionModule: 'SSH_SESSION',
            actionName: `شکست در برقراری ارتباط SSH با حساب ${username}`,
            actionNameEn: `SSH session connection failed for account ${username}`,
            command: `SSH ${username}@${host}:${port}`,
            parameters: {
              sessionId,
              account: username,
              port,
              error: errMsg,
              event: 'SESSION_FAILED',
            },
            riskLevel: 'medium',
            status: 'FAILED',
            outputSummary: `اتصال SSH به سرور ${srv?.name || dev?.name || host} ناموفق بود: ${errMsg}`,
            outputSummaryEn: `SSH connection to server ${srv?.name || dev?.name || host} failed: ${errMsg}`,
            durationMs: Date.now() - sessionStartTime,
            metadata: {
              sessionId,
              account: username,
              clientIp,
              error: errMsg,
            },
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          console.warn('[TerminalWs] Failed to log session failed:', err?.message);
        }
      };

      const logSessionClosed = async () => {
        if (sessionClosedLogged || !isConnected) return;
        sessionClosedLogged = true;
        const durationMs = Date.now() - sessionStartTime;
        try {
          const { addServerCommandLog } = await import('./db');
          await addServerCommandLog({
            userId: operatorUserId,
            userName: operatorUserName,
            userRole: operatorUserRole,
            clientIp,
            serverId: srv?.id || deviceId || '',
            serverName: srv?.name || dev?.name || deviceId || host,
            serverIp: host,
            osType: srv?.os_type || (dev ? (dev.platform || 'network_device') : 'linux'),
            osDistro: srv?.os_distro || srv?.distro || '',
            serverEnvironment: srv?.environment || srv?.server_environment || 'production',
            channel: 'SSH_SHELL',
            actionModule: 'SSH_SESSION',
            actionName: `خاتمه نشست SSH (${username})`,
            actionNameEn: `SSH session terminated (${username})`,
            command: `EXIT SESSION (${commandsExecutedCount} commands executed)`,
            parameters: {
              sessionId,
              account: username,
              totalCommands: commandsExecutedCount,
              durationSeconds: Math.round(durationMs / 1000),
              event: 'SESSION_CLOSED',
            },
            riskLevel: 'low',
            status: 'SUCCESS',
            outputSummary: `نشست SSH پس از ${Math.round(durationMs / 1000)} ثانیه و اجرای ${commandsExecutedCount} دستور پایان یافت.`,
            outputSummaryEn: `SSH session closed after ${Math.round(durationMs / 1000)}s and ${commandsExecutedCount} commands executed.`,
            durationMs,
            metadata: {
              sessionId,
              account: username,
              clientIp,
              totalCommands: commandsExecutedCount,
            },
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          console.warn('[TerminalWs] Failed to log session closed:', err?.message);
        }
      };

      const recordSshCommand = async (rawCmd: string) => {
        const cleanCmd = rawCmd.trim();
        if (!cleanCmd) return;

        commandsExecutedCount++;
        const sanitized = sanitizeCommandForAudit(cleanCmd);
        const { riskLevel, summary, summaryEn } = classifySshCommandRisk(sanitized);
        const cmdFirstToken = sanitized.split(/\s+/)[0] || 'cmd';

        try {
          const { addServerCommandLog } = await import('./db');
          await addServerCommandLog({
            userId: operatorUserId,
            userName: operatorUserName,
            userRole: operatorUserRole,
            clientIp,
            serverId: srv?.id || deviceId || '',
            serverName: srv?.name || dev?.name || deviceId || host,
            serverIp: host,
            osType: srv?.os_type || (dev ? (dev.platform || 'network_device') : 'linux'),
            osDistro: srv?.os_distro || srv?.distro || '',
            serverEnvironment: srv?.environment || srv?.server_environment || 'production',
            channel: 'SSH_SHELL',
            actionModule: 'SSH_TERMINAL',
            actionName: `اجرای دستور: ${cmdFirstToken}`,
            actionNameEn: `Execute command: ${cmdFirstToken}`,
            command: sanitized,
            parameters: {
              sessionId,
              account: username,
              commandIndex: commandsExecutedCount,
            },
            riskLevel,
            status: 'SUCCESS',
            outputSummary: summary,
            outputSummaryEn: summaryEn,
            durationMs: 0,
            metadata: {
              sessionId,
              account: username,
              clientIp,
            },
            timestamp: new Date().toISOString(),
          });
        } catch (logErr: any) {
          console.warn('[TerminalWs] Failed to record SSH command audit log:', logErr?.message);
        }
      };

      const processInputBuffer = (inputText: string) => {
        for (let i = 0; i < inputText.length; i++) {
          const char = inputText[i];
          if (char === '\r' || char === '\n') {
            if (isExpectingPassword) {
              // Rule 14 (Zero-Leak): completely discard password strings from command buffer
              lineBuffer = '';
              isExpectingPassword = false;
            } else {
              const fullCmd = lineBuffer;
              lineBuffer = '';
              if (fullCmd.trim()) {
                recordSshCommand(fullCmd).catch(() => {});
              }
            }
          } else if (char === '\x7f' || char === '\b') {
            if (lineBuffer.length > 0) {
              lineBuffer = lineBuffer.slice(0, -1);
            }
          } else if (char === '\x15') {
            // Ctrl+U
            lineBuffer = '';
          } else if (char === '\x03') {
            // Ctrl+C
            lineBuffer = '';
          } else if (char === '\x1b') {
            // Skip escape sequence
            while (i + 1 < inputText.length && !/[a-zA-Z~]/.test(inputText[i + 1])) {
              i++;
            }
            if (i + 1 < inputText.length) i++;
          } else {
            const code = char.charCodeAt(0);
            if (code >= 32 || char === '\t') {
              lineBuffer += char;
            }
          }
        }
      };

      const cleanup = () => {
        if (!isCleanedUp) {
          isCleanedUp = true;
          logSessionClosed().catch(() => {});
          try {
            if (activeStream) {
              activeStream.removeAllListeners();
              activeStream.end();
              if (typeof activeStream.destroy === 'function') {
                activeStream.destroy();
              }
            }
          } catch {}
          try {
            sshConn.removeAllListeners();
            sshConn.end();
            if (typeof (sshConn as any).destroy === 'function') {
              (sshConn as any).destroy();
            }
          } catch {}
          activeStream = null;
        }
      };

      sshConn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        const answers = prompts.map((p) => {
          if (/user/i.test(p.prompt)) return username;
          return password;
        });
        finish(answers.length > 0 ? answers : [password]);
      });

      sshConn.on('error', (err: any) => {
        if (!isConnected) {
          const rawErr = err?.message || 'SSH connection error';
          logSessionFailed(rawErr).catch(() => {});
          const formatted = formatTerminalError(rawErr);
          sendClient({
            type: 'status',
            status: 'failed',
            error: rawErr,
            message: isEn ? `SSH Connection Failed: ${formatted}` : `خطای اتصال SSH: ${formatted}`,
          });
          sendClient({
            type: 'error',
            error: rawErr,
          });
          sendClient({
            type: 'data',
            data: `\r\n\x1b[31m[${isEn ? 'SSH Connection Failed' : 'خطای اتصال SSH'}]\x1b[0m ${rawErr}\r\n`,
          });
        }
        cleanup();
      });

      sshConn.on('ready', () => {
        isConnected = true;
        sshConn.shell(
          {
            term: 'xterm-256color',
            cols: currentCols,
            rows: currentRows,
          },
          (err: any, stream: any) => {
            if (err) {
              const rawErr = err.message || 'Failed to allocate terminal shell';
              logSessionFailed(rawErr).catch(() => {});
              const formatted = formatTerminalError(rawErr);
              sendClient({
                type: 'status',
                status: 'failed',
                error: rawErr,
                message: isEn ? `Failed to allocate terminal shell: ${formatted}` : `خطا در ایجاد پوسته ترمینال: ${formatted}`,
              });
              sendClient({
                type: 'error',
                error: rawErr,
              });
              sendClient({
                type: 'data',
                data: `\r\n\x1b[31m[Shell Allocation Error]\x1b[0m ${rawErr}\r\n`,
              });
              cleanup();
              return;
            }

            activeStream = stream;
            logSessionOpened().catch(() => {});

            sendClient({
              type: 'status',
              status: 'connected',
              is_real: true,
              host,
              port,
              username,
              ssh_version: devSshVersion || 'v2',
              message: isEn
                ? `Live SSH connected to ${host}:${port}`
                : `ارتباط زنده SSH با ${host}:${port} برقرار شد`,
            });

            // Stream stdout & stderr as raw bytes, unbuffered, without line splitting or ANSI alteration
            const stdoutDecoder = new StringDecoder('utf-8');
            const stderrDecoder = new StringDecoder('utf-8');

            stream.on('data', (chunk: Buffer) => {
              const text = stdoutDecoder.write(chunk);
              if (text) {
                sendClient({
                  type: 'data',
                  data: text,
                });
                recentOutputTail = (recentOutputTail + text).slice(-300);
                if (/(?:password|passphrase|رمز عبور|passwd|\[sudo\] password for [^:]+):\s*$/i.test(recentOutputTail.trim())) {
                  isExpectingPassword = true;
                }
              }
            });

            if (stream.stderr) {
              stream.stderr.on('data', (chunk: Buffer) => {
                const text = stderrDecoder.write(chunk);
                if (text) {
                  sendClient({
                    type: 'data',
                    data: text,
                  });
                  recentOutputTail = (recentOutputTail + text).slice(-300);
                  if (/(?:password|passphrase|رمز عبور|passwd|\[sudo\] password for [^:]+):\s*$/i.test(recentOutputTail.trim())) {
                    isExpectingPassword = true;
                  }
                }
              });
            }

            stream.on('end', () => {
              const remainingStdout = stdoutDecoder.end();
              if (remainingStdout) {
                sendClient({ type: 'data', data: remainingStdout });
              }
              const remainingStderr = stderrDecoder.end();
              if (remainingStderr) {
                sendClient({ type: 'data', data: remainingStderr });
              }
            });

            stream.on('error', (streamErr: any) => {
              const rawErr = streamErr?.message || 'SSH stream error';
              sendClient({
                type: 'data',
                data: `\r\n\x1b[31m[SSH Stream Error]\x1b[0m ${rawErr}\r\n`,
              });
              cleanup();
            });

            stream.on('close', () => {
              sendClient({
                type: 'status',
                status: 'disconnected',
                message: isEn ? `SSH session closed.` : `نشست SSH بسته شد.`,
              });
              cleanup();
            });
          }
        );
      });

      sshConn.on('close', () => {
        if (isConnected) {
          sendClient({
            type: 'status',
            status: 'disconnected',
            message: isEn ? `SSH connection closed.` : `ارتباط با تجهیز قطع شد.`,
          });
        }
        cleanup();
      });

      // Handle messages from browser WebSocket: raw keystrokes and JSON control messages
      clientWs.on('message', (raw: WebSocket.Data) => {
        try {
          // Normalize raw WebSocket data into text
          let text = '';
          if (typeof raw === 'string') {
            text = raw;
          } else if (Buffer.isBuffer(raw)) {
            text = raw.toString('utf-8');
          } else if (Array.isArray(raw)) {
            text = Buffer.concat(raw).toString('utf-8');
          } else if (raw instanceof ArrayBuffer) {
            text = Buffer.from(raw).toString('utf-8');
          } else {
            text = String(raw);
          }

          let handledAsControl = false;
          const trimmed = text.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === 'object') {
                if (parsed.type === 'ping') {
                  sendClient({ type: 'pong' });
                  return;
                } else if (parsed.type === 'resize') {
                  handledAsControl = true;
                  const cols = parseInt(parsed.cols, 10) || 120;
                  const rows = parseInt(parsed.rows, 10) || 36;
                  currentCols = cols;
                  currentRows = rows;
                  if (activeStream && typeof activeStream.setWindow === 'function') {
                    try {
                      activeStream.setWindow(rows, cols, 0, 0);
                    } catch (resizeErr: any) {
                      console.warn('[TerminalWs] setWindow resize error:', resizeErr?.message);
                    }
                  }
                  return;
                } else if (parsed.type === 'close') {
                  handledAsControl = true;
                  cleanup();
                  return;
                } else if (parsed.type === 'input' || parsed.type === 'stdin') {
                  handledAsControl = true;
                  const inputData = parsed.data !== undefined ? parsed.data : '';
                  processInputBuffer(typeof inputData === 'string' ? inputData : String(inputData));
                  if (activeStream && activeStream.writable) {
                    activeStream.write(typeof inputData === 'string' ? inputData : String(inputData));
                  }
                  return;
                }
              }
            } catch {
              // Not valid JSON: proceed to treat as raw keystroke data
            }
          }

          // Not a recognized JSON control message: send raw input directly to active PTY stream
          if (!handledAsControl && activeStream && activeStream.writable) {
            processInputBuffer(text);
            if (Buffer.isBuffer(raw)) {
              activeStream.write(raw);
            } else {
              activeStream.write(text);
            }
          }
        } catch (writeErr: any) {
          console.warn('[TerminalWs] Input write error:', writeErr.message);
        }
      });

      clientWs.on('close', cleanup);
      clientWs.on('error', cleanup);

      // Connect with broad, adaptive cipher suites covering modern and legacy equipment
      const connectOptions: ConnectConfig = {
        host,
        port,
        username,
        password,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
        tryKeyboard: true,
        algorithms: {
          kex: [
            'curve25519-sha256',
            'curve25519-sha256@libssh.org',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group16-sha512',
            'diffie-hellman-group18-sha512',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group1-sha1',
          ],
          cipher: [
            'chacha20-poly1305@openssh.com',
            'aes256-gcm@openssh.com',
            'aes128-gcm@openssh.com',
            'aes256-gcm',
            'aes128-gcm',
            'aes256-ctr',
            'aes192-ctr',
            'aes128-ctr',
            'aes256-cbc',
            'aes192-cbc',
            'aes128-cbc',
            '3des-cbc',
          ],
          serverHostKey: [
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-rsa',
            'ssh-dss',
          ],
          hmac: [
            'hmac-sha2-256-etm@openssh.com',
            'hmac-sha2-512-etm@openssh.com',
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1',
            'hmac-sha1-96',
            'hmac-md5',
          ],
        },
      };

      try {
        sshConn.connect(connectOptions);
      } catch (connErr: any) {
        const formatted = formatTerminalError(connErr.message);
        sendClient({
          type: 'status',
          status: 'failed',
          error: formatted,
          message: isEn ? `SSH Connection Failed: ${formatted}` : `خطای اتصال SSH: ${formatted}`,
        });
        sendClient({
          type: 'error',
          error: formatted,
        });
      }
      return;
    }

    // Explicit error when no target host or IP is configured
    sendClient({
      type: 'status',
      status: 'failed',
      error: isEn ? 'No target device host or IP configured for SSH connection.' : 'آدرس IP یا هاست مقصد جهت اتصال SSH تنظیم نشده است.',
      message: isEn ? 'No target device host or IP configured for SSH connection.' : 'آدرس IP یا هاست مقصد جهت اتصال SSH تنظیم نشده است.',
    });
  });
}
