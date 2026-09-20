import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { Client, ConnectConfig } from 'ssh2';

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

  wss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);

    // Extract device_id from path /ws/ssh/:deviceId or query params
    let deviceId = '';
    const cleanPath = parsedUrl.pathname.replace(/^\/+/, '');
    const parts = cleanPath.split('/');
    if (parts.length >= 3 && parts[0] === 'ws' && parts[1] === 'ssh') {
      deviceId = parts[2];
    } else if (parts.length >= 2 && parts[0] === 'ssh') {
      deviceId = parts[1];
    }

    if (!deviceId) {
      deviceId = parsedUrl.searchParams.get('deviceId') || parsedUrl.searchParams.get('device_id') || '';
    }

    let host = parsedUrl.searchParams.get('host') || parsedUrl.searchParams.get('ip') || '';
    let port = parseInt(parsedUrl.searchParams.get('port') || '22', 10);
    let username = parsedUrl.searchParams.get('username') || parsedUrl.searchParams.get('user') || 'root';
    let password = parsedUrl.searchParams.get('password') || '';
    const shell = parsedUrl.searchParams.get('shell') || 'bash';

    // If host is not in query params, look up in database_store.json
    if (!host && deviceId) {
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
            if (!srv.prompt_password_on_connect) {
              password = srv.ssh_password || '';
            }
          } else {
            const dev = (store.devices || []).find((d: any) => d.id === deviceId || d.name === deviceId);
            if (dev) {
              host = dev.ip || '';
              port = dev.connection?.port || dev.ssh_port || 22;
              username = dev.connection?.username || dev.ssh_username || 'admin';
              password = dev.connection?.password || dev.ssh_password || '';
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

    // If host is configured, attempt native ssh2 client connection directly
    if (host && host !== '0.0.0.0') {
      const sshClient = new Client();
      let isSshConnected = false;

      sendClient({
        type: 'status',
        status: 'connecting',
        host,
        port,
        message: `Connecting to ${host}:${port} via SSH2 Native Engine...`,
      });

      sshClient.on('ready', () => {
        isSshConnected = true;
        sshClient.shell(
          { term: 'xterm-256color', cols: 120, rows: 36 },
          (err, stream) => {
            if (err) {
              console.warn(`[TerminalWs] PTY Shell creation error on ${host}:`, err.message);
              sendClient({
                type: 'status',
                status: 'failed',
                error: err.message,
                message: `Failed to open PTY shell on ${host}: ${err.message}`,
              });
              return;
            }

            sendClient({
              type: 'status',
              status: 'connected',
              is_real: true,
              host,
              port,
              username,
              message: `Live SSH connected to ${host}:${port} (${shell})`,
            });

            stream.on('data', (chunk: Buffer) => {
              sendClient({
                type: 'data',
                data: chunk.toString('utf-8'),
              });
            });

            stream.on('close', () => {
              sendClient({
                type: 'status',
                status: 'disconnected',
                message: `SSH stream from ${host} closed.`,
              });
              try {
                sshClient.end();
              } catch {}
            });

            clientWs.on('message', (raw: WebSocket.Data) => {
              try {
                const text = raw.toString();
                let msgData = text;
                try {
                  const parsed = JSON.parse(text);
                  if (parsed.type === 'input' || parsed.type === 'stdin') {
                    msgData = parsed.data || '';
                  } else if (parsed.type === 'resize') {
                    stream.setWindow(parsed.rows || 36, parsed.cols || 120, 0, 0);
                    return;
                  }
                } catch {}
                stream.write(msgData);
              } catch (writeErr: any) {
                console.warn('[TerminalWs] Stream write error:', writeErr.message);
              }
            });
          }
        );
      });

      sshClient.on('error', (err: Error) => {
        console.warn(`[TerminalWs] SSH2 connection error to ${host}:${port}:`, err.message);
        sendClient({
          type: 'status',
          status: 'failed',
          error: err.message,
          message: `Connection failed: ${err.message}`,
        });
        sendClient({
          type: 'data',
          data: `\r\n\x1b[33m[SSH Notice]\x1b[0m Direct SSH to ${host}:${port} unreachable (${err.message}).\r\n\x1b[90mActive in interactive terminal emulator runtime.\x1b[0m\r\n`,
        });
      });

      sshClient.on('close', () => {
        if (isSshConnected) {
          sendClient({
            type: 'status',
            status: 'disconnected',
            message: 'SSH connection terminated.',
          });
        }
      });

      clientWs.on('close', () => {
        try {
          sshClient.end();
        } catch {}
      });

      const connectConfig: ConnectConfig = {
        host,
        port,
        username,
        readyTimeout: 7000,
        keepaliveInterval: 10000,
      };

      if (password) {
        connectConfig.password = password;
      }

      try {
        sshClient.connect(connectConfig);
      } catch (connErr: any) {
        sendClient({
          type: 'status',
          status: 'failed',
          error: connErr.message,
        });
      }
      return;
    }

    // Default fallback when no specific host is configured
    sendClient({
      type: 'status',
      status: 'connected',
      is_real: false,
      message: 'Connected to interactive terminal emulator runtime.',
    });
  });
}
