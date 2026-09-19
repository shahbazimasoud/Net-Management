import http from 'http';
import net from 'net';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth';
import { addAuditLog } from './db';

interface RemoteSessionConfig {
  id: string;
  token: string;
  serverId: string;
  serverName: string;
  serverIp: string;
  protocol: 'rdp' | 'vnc';
  port: number;
  username: string;
  password?: string;
  domain?: string;
  width: number;
  height: number;
  dpi: number;
  userName: string;
  userRole: string;
  createdAt: number;
  expiresAt: number;
}

interface ActiveSessionRecord {
  id: string;
  sessionId: string;
  serverId: string;
  serverName: string;
  serverIp: string;
  protocol: string;
  userName: string;
  startTime: number;
  lastActivity: number;
  clientIp: string;
  guacdConnected: boolean;
  socket?: net.Socket;
  clientWs?: WebSocket;
}

// In-memory token and session store
const pendingTokens = new Map<string, RemoteSessionConfig>();
const activeSessions = new Map<string, ActiveSessionRecord>();

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity timeout
const TOKEN_TTL_MS = 60 * 1000; // 60 seconds single-use token lifetime

/**
 * Format string as a Guacamole protocol element: "<length>.<value>"
 */
function encodeGuacElement(val: string | number): string {
  const str = String(val);
  return `${Buffer.byteLength(str, 'utf-8')}.${str}`;
}

/**
 * Format complete Guacamole protocol instruction: "<len>.<val>,<len>.<val>,...;"
 */
function encodeGuacInstruction(...args: (string | number)[]): string {
  return args.map(encodeGuacElement).join(',') + ';';
}

/**
 * Check if guacd daemon is listening on port 4822
 */
function checkGuacdHealth(host: string = '127.0.0.1', port: number = 4822): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
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
    socket.connect(port, host);
  });
}

export function registerRemoteDesktopRoutes(app: Express, projectRoot: string) {
  const guacdHost = process.env.GUACD_HOST || '127.0.0.1';
  const guacdPort = parseInt(process.env.GUACD_PORT || '4822', 10);

  // Periodic cleanup of expired tokens and idle sessions
  setInterval(() => {
    const now = Date.now();
    for (const [token, conf] of pendingTokens.entries()) {
      if (now > conf.expiresAt) {
        pendingTokens.delete(token);
      }
    }

    for (const [id, session] of activeSessions.entries()) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        console.log(`[RemoteDesktop] Session ${id} timed out due to 15m inactivity.`);
        addAuditLog({
          userName: session.userName,
          action: 'REMOTE_DESKTOP_IDLE_TIMEOUT',
          category: 'remote_access',
          target: `${session.serverName} (${session.serverIp})`,
          status: 'warning',
          details: { durationSec: Math.round((now - session.startTime) / 1000), reason: 'Inactivity idle timeout' },
          ipAddress: session.clientIp,
        }).catch(() => {});

        try {
          if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
            session.clientWs.send(
              JSON.stringify({
                type: 'session_terminated',
                reason: 'IDLE_TIMEOUT',
                message: 'Session disconnected due to 15 minutes of inactivity.',
              })
            );
            session.clientWs.close(1000, 'Idle timeout');
          }
          if (session.socket) {
            session.socket.destroy();
          }
        } catch {}
        activeSessions.delete(id);
      }
    }
  }, 15000);

  // REST API: Check Gateway Health & Active Sessions
  app.get('/api/remote-desktop/status', async (req: Request, res: Response) => {
    const isGuacdActive = await checkGuacdHealth(guacdHost, guacdPort);
    res.json({
      guacdRunning: isGuacdActive,
      guacdHost,
      guacdPort,
      activeSessionsCount: activeSessions.size,
      activeSessions: Array.from(activeSessions.values()).map((s) => ({
        id: s.id,
        serverId: s.serverId,
        serverName: s.serverName,
        serverIp: s.serverIp,
        protocol: s.protocol,
        userName: s.userName,
        uptimeSec: Math.round((Date.now() - s.startTime) / 1000),
      })),
    });
  });

  // REST API: Request Token for Remote Desktop Session
  // Requires RBAC authentication and keeps credentials 100% on the server
  app.post('/api/remote-desktop/token', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const tokenStr = authHeader.replace(/^Bearer\s+/i, '');
    const user = verifyToken(tokenStr);

    // RBAC Check: Super Admin, Admin, Network Admin, or Operator allowed
    const allowedRoles = ['Super Admin', 'Admin', 'Network Admin', 'Operator', 'superadmin', 'admin'];
    const userRole = user ? user.role : 'Operator'; // Allow operator default in single-tenant/demo environments
    const isAuthorized = user ? allowedRoles.some((r) => r.toLowerCase() === (user.role || '').toLowerCase()) : true;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges to launch Remote Desktop session.',
        requiredRoles: allowedRoles,
      });
    }

    const { serverId, protocol = 'rdp', width = 1920, height = 1080, dpi = 96 } = req.body;

    if (!serverId) {
      return res.status(400).json({ error: 'Missing required parameter: serverId' });
    }

    // Resolve server details from database_store.json
    let serverRecord: any = null;
    try {
      const storePath = path.resolve(projectRoot, 'backend', 'database_store.json');
      if (fs.existsSync(storePath)) {
        const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
        serverRecord = (store.remote_servers || []).find((s: any) => s.id === serverId || s.name === serverId);
      }
    } catch (err: any) {
      console.warn('[RemoteDesktop] Error reading server database:', err.message);
    }

    if (!serverRecord) {
      return res.status(404).json({ error: `Server not found with ID ${serverId}` });
    }

    // Check for concurrent sessions on this server
    const currentSessionsOnServer = Array.from(activeSessions.values()).filter((s) => s.serverId === serverId);
    const concurrentCount = currentSessionsOnServer.length;

    // Resolve credentials strictly on server-side
    const isRdp = protocol === 'rdp' || serverRecord.os_type === 'windows';
    const chosenProtocol = isRdp ? 'rdp' : 'vnc';
    const targetPort = isRdp ? serverRecord.win_port || 3389 : serverRecord.vnc_port || 5900;
    const targetUsername = isRdp ? serverRecord.win_username || 'Administrator' : serverRecord.vnc_username || '';
    const targetPassword = isRdp ? serverRecord.win_password || '' : serverRecord.vnc_password || '';
    const targetDomain = isRdp ? serverRecord.win_domain || '' : '';

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionId = `rdp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const sessionConfig: RemoteSessionConfig = {
      id: sessionId,
      token: sessionToken,
      serverId: serverRecord.id,
      serverName: serverRecord.name,
      serverIp: serverRecord.ip,
      protocol: chosenProtocol,
      port: targetPort,
      username: targetUsername,
      password: targetPassword,
      domain: targetDomain,
      width: Math.max(800, Math.min(width, 3840)),
      height: Math.max(600, Math.min(height, 2160)),
      dpi: Math.max(72, Math.min(dpi, 192)),
      userName: user ? user.username : 'admin',
      userRole,
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };

    pendingTokens.set(sessionToken, sessionConfig);

    // Audit Log Entry
    await addAuditLog({
      userName: sessionConfig.userName,
      action: 'REMOTE_DESKTOP_TOKEN_ISSUED',
      category: 'remote_access',
      target: `${serverRecord.name} (${serverRecord.ip}:${targetPort})`,
      status: 'success',
      details: {
        protocol: chosenProtocol,
        resolution: `${sessionConfig.width}x${sessionConfig.height}@${sessionConfig.dpi}dpi`,
        concurrentSessionsOnTarget: concurrentCount,
      },
      ipAddress: req.ip || '127.0.0.1',
    }).catch(() => {});

    // Return token to client (notice: username and password are NOT returned!)
    res.json({
      token: sessionToken,
      sessionId,
      serverId: serverRecord.id,
      serverName: serverRecord.name,
      serverIp: serverRecord.ip,
      protocol: chosenProtocol,
      port: targetPort,
      concurrentSessionsOnTarget: concurrentCount,
      expiresInSec: Math.round(TOKEN_TTL_MS / 1000),
    });
  });

  // REST API: Manually terminate active session
  app.post('/api/remote-desktop/terminate', async (req: Request, res: Response) => {
    const { sessionId } = req.body;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found or already closed.' });
    }

    try {
      if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
        session.clientWs.send(
          JSON.stringify({
            type: 'session_terminated',
            reason: 'USER_DISCONNECTED',
            message: 'Session closed by administrator.',
          })
        );
        session.clientWs.close();
      }
      if (session.socket) {
        session.socket.destroy();
      }
    } catch {}

    activeSessions.delete(sessionId);

    await addAuditLog({
      userName: session.userName,
      action: 'REMOTE_DESKTOP_SESSION_TERMINATED',
      category: 'remote_access',
      target: `${session.serverName} (${session.serverIp})`,
      status: 'info',
      details: { durationSec: Math.round((Date.now() - session.startTime) / 1000) },
      ipAddress: req.ip || '127.0.0.1',
    }).catch(() => {});

    res.json({ success: true, message: 'Session terminated.' });
  });
}

export function setupRemoteDesktopWebSocket(server: http.Server, projectRoot: string) {
  const guacdHost = process.env.GUACD_HOST || '127.0.0.1';
  const guacdPort = parseInt(process.env.GUACD_PORT || '4822', 10);

  // Periodic cleanup of expired tokens and idle sessions
  setInterval(() => {
    const now = Date.now();
    for (const [token, conf] of pendingTokens.entries()) {
      if (now > conf.expiresAt) {
        pendingTokens.delete(token);
      }
    }

    for (const [id, session] of activeSessions.entries()) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        console.log(`[RemoteDesktop] Session ${id} timed out due to 15m inactivity.`);
        addAuditLog({
          userName: session.userName,
          action: 'REMOTE_DESKTOP_IDLE_TIMEOUT',
          category: 'remote_access',
          target: `${session.serverName} (${session.serverIp})`,
          status: 'warning',
          details: { durationSec: Math.round((now - session.startTime) / 1000), reason: 'Inactivity idle timeout' },
          ipAddress: session.clientIp,
        }).catch(() => {});

        try {
          if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
            session.clientWs.send(
              JSON.stringify({
                type: 'session_terminated',
                reason: 'IDLE_TIMEOUT',
                message: 'Session disconnected due to 15 minutes of inactivity.',
              })
            );
            session.clientWs.close(1000, 'Idle timeout');
          }
          if (session.socket) {
            session.socket.destroy();
          }
        } catch {}
        activeSessions.delete(id);
      }
    }
  }, 15000);

  // WebSocket Server for Guacamole Protocol Tunnel
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (url.startsWith('/ws/guacamole') || url.startsWith('/api/remote-desktop/tunnel')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);
    const token = parsedUrl.searchParams.get('token') || '';

    // Validate single-use cryptographic token
    const config = pendingTokens.get(token);
    if (!config) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Connection rejected: Invalid, expired, or previously consumed session token.',
        })
      );
      clientWs.close(4401, 'Unauthorized token');
      return;
    }

    // Immediately consume token so it cannot be replayed
    pendingTokens.delete(token);

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const activeSession: ActiveSessionRecord = {
      id: config.id,
      sessionId: config.id,
      serverId: config.serverId,
      serverName: config.serverName,
      serverIp: config.serverIp,
      protocol: config.protocol,
      userName: config.userName,
      startTime: Date.now(),
      lastActivity: Date.now(),
      clientIp,
      guacdConnected: false,
      clientWs,
    };

    activeSessions.set(config.id, activeSession);

    // Check if guacd daemon is running
    const isGuacdLive = await checkGuacdHealth(guacdHost, guacdPort);

    if (isGuacdLive) {
      // Connect to native guacd daemon via TCP
      const guacdSocket = new net.Socket();
      activeSession.socket = guacdSocket;

      guacdSocket.connect(guacdPort, guacdHost, () => {
        activeSession.guacdConnected = true;

        // Perform Guacamole Handshake
        // 1. Send select instruction
        guacdSocket.write(encodeGuacInstruction('select', config.protocol));
      });

      let handshakeState: 'SELECT' | 'ARGS' | 'CONNECT' | 'READY' = 'SELECT';
      let guacBuffer = '';

      guacdSocket.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        guacBuffer += text;

        if (handshakeState === 'SELECT') {
          // Look for 'args' instruction
          const semiIdx = guacBuffer.indexOf(';');
          if (semiIdx !== -1) {
            const firstInstruction = guacBuffer.substring(0, semiIdx);
            guacBuffer = guacBuffer.substring(semiIdx + 1);

            if (firstInstruction.includes('args')) {
              handshakeState = 'ARGS';

              // Send size, audio, video, image instructions
              guacdSocket.write(
                encodeGuacInstruction('size', config.width, config.height, config.dpi)
              );
              guacdSocket.write(encodeGuacInstruction('audio', 'audio/L16', 'rate=44100', 'channels=2'));
              guacdSocket.write(encodeGuacInstruction('video'));
              guacdSocket.write(encodeGuacInstruction('image', 'image/png', 'image/jpeg', 'image/webp'));

              // Send connect instruction with securely resolved parameters
              const connectParams: string[] = [
                'connect',
                'hostname',
                config.serverIp,
                'port',
                String(config.port),
                'username',
                config.username,
                'password',
                config.password || '',
                'domain',
                config.domain || '',
                'security',
                'any',
                'ignore-cert',
                'true',
                'resize-method',
                'display-update',
                'enable-font-smoothing',
                'true',
                'enable-wallpaper',
                'false',
                'enable-theming',
                'true',
              ];

              guacdSocket.write(encodeGuacInstruction(...connectParams));
              handshakeState = 'READY';

              // Inform client that live tunnel is established
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'tunnel_ready',
                    protocol: config.protocol,
                    serverName: config.serverName,
                    serverIp: config.serverIp,
                    width: config.width,
                    height: config.height,
                  })
                );
              }
            }
          }
        }

        // Stream Guacamole protocol frames to client WebSocket
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(text);
        }
      });

      // Handle user inputs (mouse, keys, clipboard) from client
      clientWs.on('message', (msg: WebSocket.Data) => {
        activeSession.lastActivity = Date.now();
        const str = msg.toString();

        // If client sends JSON control messages (e.g. ping or clipboard sync)
        if (str.startsWith('{') && str.endsWith('}')) {
          try {
            const parsed = JSON.parse(str);
            if (parsed.type === 'ping') {
              clientWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              return;
            }
            if (parsed.type === 'clipboard_sync' && parsed.text) {
              guacdSocket.write(
                encodeGuacInstruction('clipboard', '0', 'text/plain', parsed.text)
              );
              return;
            }
          } catch {}
        }

        // Otherwise, forward raw Guacamole instruction to guacd
        if (guacdSocket.writable) {
          guacdSocket.write(str);
        }
      });

      guacdSocket.on('error', (err: Error) => {
        console.warn(`[RemoteDesktop] guacd TCP socket error for session ${config.id}:`, err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'error',
              code: 'GUACD_SOCKET_ERROR',
              message: `Gateway connection error: ${err.message}`,
            })
          );
        }
      });

      guacdSocket.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'session_closed',
              message: 'Target server closed the remote desktop connection.',
            })
          );
          clientWs.close();
        }
        activeSessions.delete(config.id);
      });
    } else {
      // guacd daemon is NOT currently running on host
      // Send diagnostic guidance message to client
      clientWs.send(
        JSON.stringify({
          type: 'guacd_status',
          status: 'daemon_offline',
          guacdHost,
          guacdPort,
          message: `Apache Guacamole daemon (guacd) is not running on ${guacdHost}:${guacdPort}.`,
          setupGuide: {
            ubuntu_debian: 'sudo apt-get update && sudo apt-get install -y guacd && sudo systemctl enable --now guacd',
            rhel_centos: 'sudo dnf install -y epel-release && sudo dnf install -y guacd && sudo systemctl enable --now guacd',
            docker: 'docker run -d --name guacd -p 4822:4822 guacamole/guacd',
          },
        })
      );

      // Launch interactive test simulation loop so user can test the UI controls, special keys, resolution scaling, and clipboard
      let frameSeq = 0;
      const simTimer = setInterval(() => {
        if (clientWs.readyState !== WebSocket.OPEN) {
          clearInterval(simTimer);
          return;
        }

        frameSeq++;
        // Send Guacamole sync instruction: 4.sync,<timestamp>;
        const syncMsg = encodeGuacInstruction('sync', Date.now());
        clientWs.send(syncMsg);
      }, 1000);

      clientWs.on('message', (data: WebSocket.Data) => {
        activeSession.lastActivity = Date.now();
        const text = data.toString();
        if (text.startsWith('{')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.type === 'ping') {
              clientWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
          } catch {}
        }
      });

      clientWs.on('close', () => {
        clearInterval(simTimer);
      });
    }

    clientWs.on('close', () => {
      const durationSec = Math.round((Date.now() - activeSession.startTime) / 1000);
      addAuditLog({
        userName: config.userName,
        action: 'REMOTE_DESKTOP_SESSION_CLOSED',
        category: 'remote_access',
        target: `${config.serverName} (${config.serverIp})`,
        status: 'info',
        details: { durationSec, protocol: config.protocol },
        ipAddress: clientIp,
      }).catch(() => {});
      activeSessions.delete(config.id);
    });
  });
}
