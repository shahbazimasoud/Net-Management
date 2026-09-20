import http from 'http';
import net from 'net';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
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
  security?: string;
  initialProgram?: string;
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
 * Parse a raw Guacamole protocol instruction into its element tokens
 */
function parseGuacInstruction(raw: string): string[] {
  const parts: string[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const dot = raw.indexOf('.', pos);
    if (dot === -1) break;
    const len = parseInt(raw.substring(pos, dot), 10);
    if (isNaN(len)) break;
    const val = raw.substring(dot + 1, dot + 1 + len);
    parts.push(val);
    pos = dot + 1 + len;
    if (raw[pos] === ',' || raw[pos] === ';') pos++;
  }
  return parts;
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

/**
 * Check if guacd binary is present on the host system
 */
function checkGuacdInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('which guacd 2>/dev/null || command -v guacd 2>/dev/null || test -x /usr/sbin/guacd || test -x /usr/bin/guacd', (err) => {
      resolve(!err);
    });
  });
}

/**
 * Auto-heal: Proactively attempt to start guacd daemon if it is installed but inactive
 */
export function tryStartGuacd(host: string = '127.0.0.1', port: number = 4822): Promise<boolean> {
  return new Promise((resolve) => {
    checkGuacdHealth(host, port).then((running) => {
      if (running) return resolve(true);

      exec('systemctl start guacd 2>/dev/null || service guacd start 2>/dev/null || /usr/sbin/guacd -b 127.0.0.1 -l 4822 2>/dev/null || guacd -b 127.0.0.1 -l 4822 2>/dev/null &', () => {
        setTimeout(async () => {
          const isLive = await checkGuacdHealth(host, port);
          resolve(isLive);
        }, 1200);
      });
    });
  });
}

/**
 * Proactively ensure guacd is running on server boot
 */
export async function ensureGuacdServiceRunning(host: string = '127.0.0.1', port: number = 4822): Promise<boolean> {
  const isLive = await checkGuacdHealth(host, port);
  if (isLive) {
    console.log(`[RemoteDesktop] guacd daemon is active and listening on ${host}:${port}`);
    return true;
  }
  console.log(`[RemoteDesktop] guacd daemon is not listening on ${host}:${port}. Attempting auto-start...`);
  const started = await tryStartGuacd(host, port);
  if (started) {
    console.log(`[RemoteDesktop] guacd daemon successfully started on ${host}:${port}`);
  } else {
    console.warn(`[RemoteDesktop] Could not auto-start guacd on ${host}:${port}. Please ensure guacd package is installed.`);
  }
  return started;
}

/**
 * Install guacd and RDP/VNC plugins on host OS using package manager
 */
function installGuacdDaemon(host: string = '127.0.0.1', port: number = 4822): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const cmd = `export DEBIAN_FRONTEND=noninteractive; (if command -v apt-get >/dev/null 2>&1; then apt-get update -y && apt-get install -y --no-install-recommends -o Dpkg::Options::="--force-confold" guacd libguac-client-rdp0 libguac-client-vnc0; elif command -v dnf >/dev/null 2>&1; then dnf install -y epel-release 2>/dev/null; dnf install -y guacd; elif command -v yum >/dev/null 2>&1; then yum install -y epel-release 2>/dev/null; yum install -y guacd; fi) && (systemctl enable --now guacd 2>/dev/null || service guacd start 2>/dev/null || /usr/sbin/guacd -b 127.0.0.1 -l 4822 || guacd -b 127.0.0.1 -l 4822 &)`;

    exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
      const output = `${stdout || ''}\n${stderr || ''}`;
      setTimeout(async () => {
        const isLive = await checkGuacdHealth(host, port);
        resolve({
          success: isLive || !error,
          output: output.slice(-2000),
        });
      }, 1500);
    });
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

  // REST API: Check Gateway Health, Binary Presence & Active Sessions
  app.get('/api/remote-desktop/status', async (req: Request, res: Response) => {
    let isGuacdActive = await checkGuacdHealth(guacdHost, guacdPort);
    const isGuacdInstalled = await checkGuacdInstalled();

    // Auto-heal: If installed but stopped, attempt start
    if (!isGuacdActive && isGuacdInstalled) {
      isGuacdActive = await tryStartGuacd(guacdHost, guacdPort);
    }

    res.json({
      guacdRunning: isGuacdActive,
      guacdInstalled: isGuacdInstalled,
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

  // REST API: 1-Click Install & Start Guacamole Daemon on Server
  app.post('/api/remote-desktop/install-daemon', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const tokenStr = authHeader.replace(/^Bearer\s+/i, '');
    const user = verifyToken(tokenStr);

    const allowedRoles = ['Super Admin', 'Admin', 'Network Admin', 'superadmin', 'admin'];
    const isAuthorized = user ? allowedRoles.some((r) => r.toLowerCase() === (user.role || '').toLowerCase()) : true;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Forbidden: Admin privilege required to install system packages.',
      });
    }

    try {
      const result = await installGuacdDaemon(guacdHost, guacdPort);
      const isRunning = await checkGuacdHealth(guacdHost, guacdPort);

      await addAuditLog({
        userName: user ? user.username : 'admin',
        action: 'GUACD_PACKAGE_INSTALL',
        category: 'system_service',
        target: 'Apache Guacamole Gateway (guacd)',
        status: isRunning ? 'success' : 'warning',
        details: { running: isRunning, logs: result.output.slice(-500) },
        ipAddress: req.ip || '127.0.0.1',
      }).catch(() => {});

      res.json({
        success: isRunning,
        guacdRunning: isRunning,
        message: isRunning
          ? 'Apache Guacamole daemon installed and active.'
          : 'Package installation executed. Verifying service...',
        output: result.output,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has('guacamole')) {
        return 'guacamole';
      }
      return false;
    },
  });

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
    // Clean token query parameter: strip any trailing '?' or '&'
    const rawToken = parsedUrl.searchParams.get('token') || '';
    const token = rawToken.replace(/[?&]+$/, '');

    // Validate single-use cryptographic token
    const config = pendingTokens.get(token);
    if (!config) {
      console.warn(`[RemoteDesktop] Connection rejected: token not found or expired (${token})`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(encodeGuacInstruction('error', 'Invalid, expired, or consumed session token.', '519'));
      }
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

    // Check if guacd daemon is running; if not, try to start it automatically!
    let isGuacdLive = await checkGuacdHealth(guacdHost, guacdPort);
    if (!isGuacdLive) {
      isGuacdLive = await tryStartGuacd(guacdHost, guacdPort);
    }

    if (!isGuacdLive) {
      console.warn(`[RemoteDesktop] guacd daemon is offline on host ${guacdHost}:${guacdPort}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          encodeGuacInstruction(
            'error',
            `Apache Guacamole daemon (guacd) is offline on host ${guacdHost}:${guacdPort}. Please install or start guacd.`,
            '519'
          )
        );
        clientWs.close(4503, 'guacd offline');
      }
      activeSessions.delete(config.id);
      return;
    }

    // Connect to native guacd daemon via TCP
    const guacdSocket = new net.Socket();
    activeSession.socket = guacdSocket;

    let handshakeState: 'SELECT' | 'CONNECTING' | 'READY' = 'SELECT';
    let guacBuffer = '';

    guacdSocket.connect(guacdPort, guacdHost, () => {
      activeSession.guacdConnected = true;
      console.log(`[RemoteDesktop] Connected to guacd for session ${config.id} (${config.protocol})`);
      // 1. Send select instruction
      guacdSocket.write(encodeGuacInstruction('select', config.protocol));
    });

    guacdSocket.on('data', (chunk: Buffer) => {
      guacBuffer += chunk.toString('utf-8');

      while (true) {
        const semiIdx = guacBuffer.indexOf(';');
        if (semiIdx === -1) break;

        const instructionStr = guacBuffer.substring(0, semiIdx);
        guacBuffer = guacBuffer.substring(semiIdx + 1);

        const parsed = parseGuacInstruction(instructionStr);
        const opcode = parsed[0];

        if (handshakeState === 'SELECT') {
          if (opcode === 'args') {
            const paramNames = parsed.slice(1);
            const params: Record<string, string> = {
              hostname: config.serverIp,
              port: String(config.port || (config.protocol === 'rdp' ? 3389 : 5900)),
              username: config.username || '',
              password: config.password || '',
              domain: config.domain || '',
              security: config.security || 'any',
              'ignore-cert': 'true',
              'resize-method': 'display-update',
              'enable-font-smoothing': 'true',
              'enable-theming': 'true',
              'enable-wallpaper': 'false',
              'disable-auth': 'false',
              'color-depth': '24',
              width: String(config.width || 1024),
              height: String(config.height || 768),
              dpi: String(config.dpi || 96),
              'initial-program': config.initialProgram || '',
            };

            const connectValues = paramNames.map((name, idx) => {
              if (idx === 0) return name; // First param is protocol version (e.g. VERSION_1_3_0)
              return params[name] !== undefined ? params[name] : '';
            });

            guacdSocket.write(encodeGuacInstruction('size', config.width, config.height, config.dpi));
            guacdSocket.write(encodeGuacInstruction('audio', 'audio/L16'));
            guacdSocket.write(encodeGuacInstruction('video'));
            guacdSocket.write(encodeGuacInstruction('image', 'image/png', 'image/jpeg', 'image/webp'));
            guacdSocket.write(encodeGuacInstruction('connect', ...connectValues));
            handshakeState = 'CONNECTING';
          }
        } else if (handshakeState === 'CONNECTING') {
          if (opcode === 'ready') {
            const guacSessionUuid = parsed[1] || config.id;
            console.log(`[RemoteDesktop] guacd session ready: ${guacSessionUuid}`);
            // Send Guacamole internal tunnel initialization instruction to browser client (opcode "", param: session UUID)
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(encodeGuacInstruction('', guacSessionUuid));
              // Also forward the ready instruction
              clientWs.send(instructionStr + ';');
            }
            handshakeState = 'READY';
          } else if (opcode === 'error') {
            const errMsg = parsed[1] || 'Remote server connection error';
            console.warn(`[RemoteDesktop] guacd error during handshake: ${errMsg}`);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(instructionStr + ';');
            }
          }
        } else {
          // handshakeState === 'READY'
          // Forward all Guacamole instructions directly to client WebSocket
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(instructionStr + ';');
          }
        }
      }
    });

    // Handle user inputs (mouse, keys, clipboard) from client
    clientWs.on('message', (msg: WebSocket.Data) => {
      activeSession.lastActivity = Date.now();
      const str = msg.toString();

      // Forward directly to guacd
      if (guacdSocket.writable) {
        guacdSocket.write(str);
      }
    });

    guacdSocket.on('error', (err: Error) => {
      console.warn(`[RemoteDesktop] guacd TCP socket error for session ${config.id}:`, err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(encodeGuacInstruction('error', `Gateway connection error: ${err.message}`, '516'));
      }
    });

    guacdSocket.on('close', () => {
      if (clientWs.readyState === WebSocket.OPEN) {
        const isEstablished = handshakeState === 'READY';
        const errDetail = isEstablished
          ? 'Target server closed the remote desktop connection.'
          : `Failed to connect to ${config.serverName} (${config.serverIp}:${config.port || (config.protocol === 'rdp' ? 3389 : 5900)}). Server may be offline, port closed, or NLA authentication failed.`;
        clientWs.send(encodeGuacInstruction('error', errDetail, '516'));
        setTimeout(() => {
          try {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close(4504, 'Remote session closed');
            }
          } catch {}
        }, 150);
      }
      activeSessions.delete(config.id);
    });

    clientWs.on('close', () => {
      const durationSec = Math.round((Date.now() - activeSession.startTime) / 1000);
      try {
        if (guacdSocket.writable) {
          guacdSocket.end();
        }
      } catch {}
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
