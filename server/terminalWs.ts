import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { resolveSshBackend } from './sshBackendResolver';

/**
 * Terminal WebSocket Gateway
 * Supports native direct ssh2 client for real Linux remote servers and switches
 * with full interactive PTY streaming, input forwarding, and clean fallback.
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
    let host = rawHost === 'undefined' || rawHost === 'null' ? '' : rawHost;
    let portStr = parsedUrl.searchParams.get('port') || '22';
    let port = parseInt(portStr === 'undefined' || portStr === 'null' ? '22' : portStr, 10) || 22;
    let rawUser = parsedUrl.searchParams.get('username') || parsedUrl.searchParams.get('user') || 'root';
    let username = rawUser === 'undefined' || rawUser === 'null' ? 'root' : rawUser;
    let rawPassword = parsedUrl.searchParams.get('password') || '';
    let password = rawPassword === 'undefined' || rawPassword === 'null' ? '' : rawPassword;
    const shell = parsedUrl.searchParams.get('shell') || 'bash';

    // If host is not in query params or empty, look up in database_store.json
    if (!host && deviceId && deviceId !== 'undefined' && deviceId !== 'null') {
      try {
        const storePath = path.resolve(projectRoot, 'backend', 'database_store.json');
        if (fs.existsSync(storePath)) {
          const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
          const srv = (store.remote_servers || []).find(
            (s: any) => s.id === deviceId || s.name === deviceId || s.hostname === deviceId
          );
          if (srv) {
            host = srv.ip || srv.hostname || '';
            port = srv.ssh_port || 22;
            username = srv.ssh_username || 'root';
            if (!password && !srv.prompt_password_on_connect) {
              password = srv.ssh_password || '';
            }

            // Authoritative server scope check
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
          } else {
            const dev = (store.devices || []).find((d: any) => d.id === deviceId || d.name === deviceId);
            if (dev) {
              host = dev.ip || '';
              port = dev.connection?.port || dev.ssh_port || 22;
              username = dev.connection?.username || dev.ssh_username || 'admin';
              if (!password) {
                password = dev.connection?.password || dev.ssh_password || '';
              }

              // Authoritative network equipment scope & terminal permission check
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
                      // 1. Device scope check (PostgreSQL device groups)
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
                      // 2. Granular device terminal action check
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
          }
        }
      } catch (err) {
        console.warn('[TerminalWs] Database store lookup warning:', err);
      }
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

    // Resolve device platform and SSH backend version (legacy vs modern) using single backend resolver
    let devPlatform = parsedUrl.searchParams.get('platform') || '';
    let devSshVersion = parsedUrl.searchParams.get('ssh_version') || parsedUrl.searchParams.get('sshVersion') || '';
    if ((!devPlatform || !devSshVersion) && deviceId) {
      try {
        const storePath = path.resolve(projectRoot, 'backend', 'database_store.json');
        if (fs.existsSync(storePath)) {
          const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
          const foundDev = (store.devices || []).find((d: any) => d.id === deviceId || d.name === deviceId);
          if (foundDev) {
            if (!devPlatform) {
              devPlatform = foundDev.platform || foundDev.device_type || '';
            }
            if (!devSshVersion) {
              devSshVersion = foundDev.ssh_version || foundDev.sshVersion || (foundDev.platform?.includes('modern') ? 'modern' : 'legacy');
            }
          }
        }
      } catch {}
    }
    const backendRes = resolveSshBackend(devSshVersion);

    // If host is configured, establish live interactive SSH session via resolved Python Paramiko backend
    if (host && host !== '0.0.0.0') {
      sendClient({
        type: 'status',
        status: 'connecting',
        host,
        port,
        ssh_version: backendRes.version,
        message: `Connecting to ${host}:${port} via SSH v2 (${backendRes.version === 'modern' ? 'Modern' : 'Legacy'})...`,
      });

      const configPayload = {
        host,
        port,
        username,
        password,
        platform: devPlatform || 'cisco_ios_xe',
        term: 'xterm-256color',
        cols: 120,
        rows: 36,
        ssh_version: backendRes.version,
      };
      const configJson = JSON.stringify(configPayload);

      let isSshOpen = false;
      let hasReportedError = false;
      let isProcessExited = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const proc: ChildProcess = spawn(backendRes.pythonBin, [backendRes.scriptPath, 'terminal', configJson], {
        cwd: projectRoot,
        env: backendRes.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdout?.on('data', (chunk: Buffer) => {
        if (!isSshOpen) {
          stdoutBuffer += chunk.toString('utf-8');
          if (stdoutBuffer.includes('__NETMGMT_SSH_OPEN__:')) {
            const lines = stdoutBuffer.split('\n');
            let remaining = '';
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.startsWith('__NETMGMT_SSH_OPEN__:')) {
                isSshOpen = true;
                try {
                  const meta = JSON.parse(line.replace('__NETMGMT_SSH_OPEN__:', '').trim());
                  sendClient({
                    type: 'status',
                    status: 'connected',
                    is_real: true,
                    host,
                    port,
                    username,
                    ssh_version: backendRes.version,
                    kex: meta.kex,
                    paramiko_version: meta.version,
                    message: `Live SSH connected to ${host}:${port} (${backendRes.version === 'modern' ? 'Modern' : 'Legacy'})`,
                  });
                } catch {
                  sendClient({
                    type: 'status',
                    status: 'connected',
                    is_real: true,
                    host,
                    port,
                    username,
                    ssh_version: backendRes.version,
                    message: `Live SSH connected to ${host}:${port}`,
                  });
                }
                remaining = lines.slice(i + 1).join('\n');
                break;
              } else if (line.startsWith('__NETMGMT_SSH_ERROR__:')) {
                hasReportedError = true;
                try {
                  const errMeta = JSON.parse(line.replace('__NETMGMT_SSH_ERROR__:', '').trim());
                  sendClient({
                    type: 'status',
                    status: 'failed',
                    error: errMeta.error,
                    message: `SSH Connection Failed: ${errMeta.error}`,
                  });
                  sendClient({
                    type: 'error',
                    error: errMeta.error,
                  });
                } catch {
                  sendClient({
                    type: 'status',
                    status: 'failed',
                    error: line,
                    message: line,
                  });
                }
                return;
              }
            }
            if (isSshOpen && remaining) {
              sendClient({
                type: 'data',
                data: remaining,
              });
            }
          } else if (stdoutBuffer.includes('__NETMGMT_SSH_ERROR__:')) {
            hasReportedError = true;
            const errLine = stdoutBuffer.split('\n').find((l) => l.startsWith('__NETMGMT_SSH_ERROR__:')) || '';
            try {
              const errMeta = JSON.parse(errLine.replace('__NETMGMT_SSH_ERROR__:', '').trim());
              sendClient({
                type: 'status',
                status: 'failed',
                error: errMeta.error,
                message: `SSH Connection Failed: ${errMeta.error}`,
              });
              sendClient({
                type: 'error',
                error: errMeta.error,
              });
            } catch {
              sendClient({
                type: 'status',
                status: 'failed',
                error: stdoutBuffer.trim(),
                message: stdoutBuffer.trim(),
              });
            }
          }
        } else {
          // Stream device output live: SSH channel -> Python -> Node -> WebSocket
          // Raw bytes/chunks as they arrive, no buffering
          const dataStr = chunk.toString('utf-8');
          sendClient({
            type: 'data',
            data: dataStr,
          });
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        stderrBuffer += text;
        if (!text.includes('CryptographyDeprecationWarning')) {
          console.warn(`[TerminalWs Python Stderr]:`, text.trim());
        }
      });

      proc.on('close', (code) => {
        isProcessExited = true;
        if (!isSshOpen) {
          if (!hasReportedError) {
            hasReportedError = true;
            const isWarningLine = (l: string) =>
              l.includes('CryptographyDeprecationWarning') ||
              l.includes('TripleDES') ||
              l.includes('cryptography.hazmat') ||
              l.includes('site-packages/paramiko');
            const cleanErr =
              stderrBuffer
                .split('\n')
                .filter((l) => !isWarningLine(l) && l.trim())
                .join('\n')
                .trim() || `Process exited with code ${code}`;
            sendClient({
              type: 'status',
              status: 'failed',
              error: cleanErr,
              message: `SSH connection failed: ${cleanErr}`,
            });
            sendClient({
              type: 'error',
              error: cleanErr,
            });
            sendClient({
              type: 'data',
              data: `\r\n\x1b[31m[SSH Connection Failed]\x1b[0m ${cleanErr}\r\n`,
            });
          }
        } else {
          sendClient({
            type: 'status',
            status: 'disconnected',
            message: `SSH session closed (exit code ${code}).`,
          });
          sendClient({
            type: 'data',
            data: `\r\n\x1b[33m[SSH Notice]\x1b[0m Connection to ${host}:${port} closed.\r\n`,
          });
        }
      });

      proc.on('error', (err) => {
        console.error('[TerminalWs] Python process spawn error:', err);
        sendClient({
          type: 'status',
          status: 'failed',
          error: err.message,
          message: `Failed to launch SSH Python backend: ${err.message}`,
        });
        sendClient({
          type: 'error',
          error: err.message,
        });
      });

      clientWs.on('message', (raw: WebSocket.Data) => {
        if (isProcessExited || !proc.stdin || !proc.stdin.writable) return;
        try {
          const text = typeof raw === 'string' ? raw : raw.toString();
          let handledAsControl = false;
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
              if (parsed.type === 'ping') {
                sendClient({ type: 'pong' });
                return;
              } else if (parsed.type === 'resize') {
                handledAsControl = true;
                const cols = parsed.cols || 120;
                const rows = parsed.rows || 36;
                proc.stdin.write(`\x00__NETMGMT_CTL__:${JSON.stringify({ action: 'resize', cols, rows })}\n`);
                return;
              } else if (parsed.type === 'close') {
                handledAsControl = true;
                proc.stdin.write(`\x00__NETMGMT_CTL__:${JSON.stringify({ action: 'close' })}\n`);
                setTimeout(() => {
                  try { proc.kill('SIGTERM'); } catch {}
                }, 300);
                return;
              } else if (parsed.type === 'input' || parsed.type === 'stdin') {
                handledAsControl = true;
                const inputData = parsed.data ?? '';
                if (typeof inputData === 'string') {
                  proc.stdin.write(inputData);
                } else {
                  proc.stdin.write(String(inputData));
                }
                return;
              }
            }
          } catch {
            // Not a JSON control message, fall through to raw writing
          }

          if (!handledAsControl) {
            proc.stdin.write(raw as any);
          }
        } catch (writeErr: any) {
          console.warn('[TerminalWs] Input write error:', writeErr.message);
        }
      });

      const cleanup = () => {
        if (!isProcessExited) {
          isProcessExited = true;
          try {
            if (proc.stdin && proc.stdin.writable) {
              proc.stdin.write(`\x00__NETMGMT_CTL__:${JSON.stringify({ action: 'close' })}\n`);
              proc.stdin.end();
            }
          } catch {}
          setTimeout(() => {
            try { proc.kill('SIGTERM'); } catch {}
            setTimeout(() => {
              try { proc.kill('SIGKILL'); } catch {}
            }, 1000);
          }, 300);
        }
      };

      clientWs.on('close', cleanup);
      clientWs.on('error', cleanup);
      return;
    }

    // Explicit error when no target host or IP is configured
    sendClient({
      type: 'status',
      status: 'failed',
      error: 'No target device host or IP configured for SSH connection.',
      message: 'No target device host or IP configured for SSH connection.',
    });
  });
}
