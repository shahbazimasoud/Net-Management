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

    // Resolve 32-byte encryption key
    let keyBuffer: Buffer | null = null;
    const envKey = process.env.NETTOP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (envKey) {
      keyBuffer = Buffer.from(envKey.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    } else {
      const keyPath = path.resolve(projectRoot, 'backend', 'security', '.secret.key');
      if (fs.existsSync(keyPath)) {
        const rawKey = fs.readFileSync(keyPath, 'utf-8').trim();
        keyBuffer = Buffer.from(rawKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      }
    }

    if (!keyBuffer || keyBuffer.length !== 32) return encrypted;

    const encKey = keyBuffer.subarray(16, 32);
    const iv = raw.subarray(9, 25);
    const ciphertext = raw.subarray(25, raw.length - 32);

    const decipher = crypto.createDecipheriv('aes-128-cbc', encKey, iv);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch {
    return encrypted;
  }
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

    // Authoritative lookup in database_store.json and network_data.json
    try {
      const storePaths = [
        path.resolve(projectRoot, 'backend', 'database_store.json'),
        path.resolve(projectRoot, 'backend', 'network_data.json'),
      ];

      for (const storePath of storePaths) {
        if (!fs.existsSync(storePath)) continue;
        const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));

        // Check remote Linux/Windows servers
        const srv = (store.remote_servers || []).find(
          (s: any) =>
            (deviceId && (s.id === deviceId || s.name === deviceId || s.hostname === deviceId)) ||
            (host && (s.ip === host || s.hostname === host))
        );

        if (srv) {
          if (!host) host = srv.ip || srv.hostname || '';
          if (!port || port === 22) port = srv.ssh_port || 22;
          if (!username) username = srv.ssh_username || 'root';
          if (!password && !srv.prompt_password_on_connect) {
            password = srv.ssh_password || '';
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
          break;
        }

        // Check network devices (Cisco, MikroTik, switches, routers)
        const dev = (store.devices || []).find(
          (d: any) =>
            (deviceId && (d.id === deviceId || d.name === deviceId)) ||
            (host && (d.ip === host || d.ssh_host === host || d.connection?.host === host))
        );

        if (dev) {
          if (!host) host = dev.ssh_host || dev.connection?.host || dev.ip || '';
          if (!port || port === 22) port = dev.connection?.port || dev.ssh_port || 22;
          if (!username) username = dev.connection?.username || dev.ssh_username || 'admin';
          if (!password) {
            password = dev.connection?.password || dev.ssh_password || '';
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
          break;
        }
      }
    } catch (err) {
      console.warn('[TerminalWs] Database store lookup warning:', err);
    }

    // Decrypt credentials if stored encrypted
    if (password && password.startsWith('enc:fernet:')) {
      password = decryptFernetCredential(password, projectRoot);
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

      const cleanup = () => {
        if (!isCleanedUp) {
          isCleanedUp = true;
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
          if (Buffer.isBuffer(raw)) {
            if (activeStream && activeStream.writable) {
              activeStream.write(raw);
              return;
            }
          }

          const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf-8') : String(raw);
          let handledAsControl = false;
          try {
            const parsed = JSON.parse(text);
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
                const inputData = parsed.data ?? '';
                if (activeStream && activeStream.writable) {
                  activeStream.write(typeof inputData === 'string' ? inputData : String(inputData));
                }
                return;
              }
            }
          } catch {
            // Not a JSON control message: treat as raw keystroke data
          }

          if (!handledAsControl && activeStream && activeStream.writable) {
            activeStream.write(text);
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
