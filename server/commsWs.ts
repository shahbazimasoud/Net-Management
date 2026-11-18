import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken, UserSessionPayload } from './auth';
import { findUserById, findUserByUsername } from './db';

interface RegisteredCommsSocket {
  ws: WebSocket;
  userId: string;
  username: string;
  identifiers: string[];
}

// Track active WebSocket connections keyed by normalized identifier (userId, username, samAccount)
const socketsByIdentifier = new Map<string, Set<RegisteredCommsSocket>>();

type SyncProviderFn = (user: {
  userId: string;
  username: string;
  role?: string;
  userType?: string;
}) => Promise<{ unreadCount: number; countsByFolder: any }>;

let syncProvider: SyncProviderFn | null = null;

export function registerCommsSyncProvider(provider: SyncProviderFn): void {
  syncProvider = provider;
}

function normalizeIdentifiers(user: { userId?: string; username?: string }): string[] {
  const set = new Set<string>();
  const addId = (val?: string | null) => {
    if (!val || typeof val !== 'string') return;
    const clean = val.trim().toLowerCase();
    if (!clean) return;
    set.add(clean);
    if (clean.includes('@')) {
      set.add(clean.split('@')[0]);
    }
    if (clean.includes('\\')) {
      const parts = clean.split('\\');
      if (parts[1]) set.add(parts[1]);
    }
  };
  addId(user.userId);
  addId(user.username);
  return Array.from(set);
}

function registerSocket(entry: RegisteredCommsSocket): void {
  for (const idKey of entry.identifiers) {
    let set = socketsByIdentifier.get(idKey);
    if (!set) {
      set = new Set<RegisteredCommsSocket>();
      socketsByIdentifier.set(idKey, set);
    }
    set.add(entry);
  }
}

function unregisterSocket(entry: RegisteredCommsSocket): void {
  for (const idKey of entry.identifiers) {
    const set = socketsByIdentifier.get(idKey);
    if (set) {
      set.delete(entry);
      if (set.size === 0) {
        socketsByIdentifier.delete(idKey);
      }
    }
  }
}

/**
 * Push a real-time WebSocket event to all active browser tabs belonging to target recipients.
 * Deduplicates sockets so a user matched by both userId and username receives each event once.
 */
export function broadcastCommsEventToRecipients(
  recipients: Array<{ userId?: string; username?: string }>,
  buildEventForRecipient?: (recipient: { userId?: string; username?: string }) => any,
  staticEvent?: any
): void {
  const sentSockets = new Set<WebSocket>();

  for (const recipient of recipients) {
    const ids = normalizeIdentifiers(recipient);
    const matchingEntries = new Set<RegisteredCommsSocket>();
    for (const idKey of ids) {
      const set = socketsByIdentifier.get(idKey);
      if (set) {
        for (const entry of set) {
          matchingEntries.add(entry);
        }
      }
    }

    if (matchingEntries.size === 0) continue;
    const payloadObj = buildEventForRecipient ? buildEventForRecipient(recipient) : staticEvent;
    if (!payloadObj) continue;
    const payloadStr = JSON.stringify(payloadObj);

    for (const entry of matchingEntries) {
      if (sentSockets.has(entry.ws)) continue;
      if (entry.ws.readyState === WebSocket.OPEN) {
        try {
          entry.ws.send(payloadStr);
          sentSockets.add(entry.ws);
        } catch (err: any) {
          console.warn('[CommsWS] Send failed:', err?.message || err);
        }
      }
    }
  }
}

export function broadcastCommsEventToUser(
  user: { userId?: string; username?: string },
  event: any
): void {
  broadcastCommsEventToRecipients([user], undefined, event);
}

export function isCommsUserOnline(user: { userId?: string; username?: string }): boolean {
  const ids = normalizeIdentifiers(user);
  for (const idKey of ids) {
    const set = socketsByIdentifier.get(idKey);
    if (set && set.size > 0) return true;
  }
  return false;
}

export function setupCommsWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (url === '/ws/comms' || url.startsWith('/ws/comms?')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);
    const authHeader = (req.headers.authorization as string) || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const token = parsedUrl.searchParams.get('token')?.trim() || bearerToken;

    if (!token) {
      try {
        clientWs.close(1008, 'Authentication required');
      } catch {}
      return;
    }

    const payload: UserSessionPayload | null = verifyToken(token);
    if (!payload) {
      try {
        clientWs.close(1008, 'Invalid or expired token');
      } catch {}
      return;
    }

    const dbUser = (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
    if (dbUser && dbUser.status === 'disabled') {
      try {
        clientWs.close(1008, 'Account disabled');
      } catch {}
      return;
    }

    const effectiveUser = {
      userId: dbUser?.id || payload.userId,
      username: dbUser?.username || payload.username,
      role: dbUser?.role || payload.role,
      userType: dbUser?.userType || payload.userType,
    };

    const entry: RegisteredCommsSocket = {
      ws: clientWs,
      userId: effectiveUser.userId,
      username: effectiveUser.username,
      identifiers: normalizeIdentifiers(effectiveUser),
    };

    registerSocket(entry);

    const sendSafe = (data: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify(data));
        } catch {}
      }
    };

    // Emit initial live unread counters on connect
    if (syncProvider) {
      try {
        const counts = await syncProvider(effectiveUser);
        sendSafe({
          type: 'comms:sync',
          unreadCount: counts.unreadCount,
          countsByFolder: counts.countsByFolder,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        console.warn('[CommsWS] Initial sync notice:', err?.message || err);
      }
    }

    const heartbeat = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        sendSafe({ type: 'ping', timestamp: Date.now() });
      }
    }, 25000);

    clientWs.on('message', async (raw: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === 'ping') {
          sendSafe({ type: 'pong', timestamp: Date.now() });
        } else if (parsed.type === 'sync' && syncProvider) {
          const counts = await syncProvider(effectiveUser);
          sendSafe({
            type: 'comms:sync',
            unreadCount: counts.unreadCount,
            countsByFolder: counts.countsByFolder,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {}
    });

    const cleanup = () => {
      clearInterval(heartbeat);
      unregisterSocket(entry);
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });
}
