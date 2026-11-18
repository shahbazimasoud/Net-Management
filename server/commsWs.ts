import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken, UserSessionPayload } from './auth';
import { findUserById, findUserByUsername } from './db';
import { CommsUserPresenceStatus } from '../src/types';

interface RegisteredCommsSocket {
  ws: WebSocket;
  userId: string;
  username: string;
  identifiers: string[];
  canonicalKey: string;
  activityState: 'active' | 'idle';
  lastActivityAt: number;
  sessionToken: string;
}

const SERVER_IDLE_FALLBACK_MS = 150_000; // 2.5m safety timeout if client background timer is throttled
const PRESENCE_SWEEP_INTERVAL_MS = 20_000;

// Track active WebSocket connections keyed by normalized identifier (userId, username, samAccount)
const socketsByIdentifier = new Map<string, Set<RegisteredCommsSocket>>();
const allActiveSockets = new Set<RegisteredCommsSocket>();
const lastBroadcastPresenceByUser = new Map<
  string,
  {
    status: CommsUserPresenceStatus;
    userId: string;
    username: string;
    identifiers: string[];
  }
>();

type SyncProviderFn = (user: {
  userId: string;
  username: string;
  role?: string;
  userType?: string;
}) => Promise<{ unreadCount: number; countsByFolder: any }>;

let syncProvider: SyncProviderFn | null = null;
let sweeperStarted = false;

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

function isSocketActiveNow(entry: RegisteredCommsSocket, nowMs: number): boolean {
  if (entry.ws.readyState !== WebSocket.OPEN) return false;
  if (entry.activityState !== 'active') return false;
  return nowMs - entry.lastActivityAt < SERVER_IDLE_FALLBACK_MS;
}

export function getCommsUserPresence(
  user: { userId?: string; username?: string },
  nowMs: number = Date.now()
): CommsUserPresenceStatus {
  const ids = normalizeIdentifiers(user);
  let hasOpenSocket = false;
  for (const idKey of ids) {
    const set = socketsByIdentifier.get(idKey);
    if (!set || set.size === 0) continue;
    for (const entry of set) {
      if (entry.ws.readyState !== WebSocket.OPEN) continue;
      hasOpenSocket = true;
      if (isSocketActiveNow(entry, nowMs)) {
        return 'online';
      }
    }
  }
  return hasOpenSocket ? 'idle' : 'offline';
}

export function isCommsUserOnline(user: { userId?: string; username?: string }): boolean {
  return getCommsUserPresence(user) === 'online';
}

export function disconnectCommsSocketsForToken(token: string): void {
  const clean = (token || '').trim();
  if (!clean) return;
  for (const entry of Array.from(allActiveSockets)) {
    if (entry.sessionToken === clean) {
      unregisterSocket(entry);
      try {
        entry.ws.close(1000, 'Logged out');
      } catch {}
      syncAndBroadcastUserPresence(entry);
    }
  }
}

export function disconnectCommsSocketsForUser(username: string, reason: string = 'Blocked by administrator'): number {
  const ids = normalizeIdentifiers({ username });
  if (ids.length === 0) return 0;
  let closed = 0;
  for (const entry of Array.from(allActiveSockets)) {
    const matches = entry.identifiers.some((idKey) => ids.includes(idKey));
    if (matches) {
      unregisterSocket(entry);
      try {
        entry.ws.close(4003, reason);
      } catch {}
      syncAndBroadcastUserPresence(entry);
      closed += 1;
    }
  }
  return closed;
}

export function getCommsPresenceSnapshot(
  nowMs: number = Date.now()
): Record<string, CommsUserPresenceStatus> {
  const snapshot: Record<string, CommsUserPresenceStatus> = {};
  const computedByCanonical = new Map<string, CommsUserPresenceStatus>();

  for (const entry of allActiveSockets) {
    if (entry.ws.readyState !== WebSocket.OPEN) continue;
    const prev = computedByCanonical.get(entry.canonicalKey);
    const entryActive = isSocketActiveNow(entry, nowMs);
    if (entryActive) {
      computedByCanonical.set(entry.canonicalKey, 'online');
    } else if (!prev) {
      computedByCanonical.set(entry.canonicalKey, 'idle');
    }
  }

  for (const entry of allActiveSockets) {
    if (entry.ws.readyState !== WebSocket.OPEN) continue;
    const status = computedByCanonical.get(entry.canonicalKey) || 'idle';
    for (const idKey of entry.identifiers) {
      const existing = snapshot[idKey];
      if (!existing || status === 'online') {
        snapshot[idKey] = status;
      }
    }
  }

  return snapshot;
}

function broadcastPresenceToAllConnected(event: any): void {
  if (allActiveSockets.size === 0) return;
  const payloadStr = JSON.stringify(event);
  for (const entry of allActiveSockets) {
    if (entry.ws.readyState === WebSocket.OPEN) {
      try {
        entry.ws.send(payloadStr);
      } catch {}
    }
  }
}

function syncAndBroadcastUserPresence(
  user: {
    canonicalKey: string;
    userId: string;
    username: string;
    identifiers: string[];
  },
  nowMs: number = Date.now()
): void {
  const nextStatus = getCommsUserPresence(
    { userId: user.userId, username: user.username },
    nowMs
  );
  const prevRecord = lastBroadcastPresenceByUser.get(user.canonicalKey);
  const prevStatus: CommsUserPresenceStatus = prevRecord?.status || 'offline';

  if (nextStatus === prevStatus) return;

  if (nextStatus === 'offline') {
    lastBroadcastPresenceByUser.delete(user.canonicalKey);
  } else {
    lastBroadcastPresenceByUser.set(user.canonicalKey, {
      status: nextStatus,
      userId: user.userId,
      username: user.username,
      identifiers: user.identifiers,
    });
  }

  broadcastPresenceToAllConnected({
    type: 'presence:updated',
    userId: user.userId,
    username: user.username,
    identifiers: user.identifiers,
    status: nextStatus,
    timestamp: new Date(nowMs).toISOString(),
  });
}

function ensurePresenceSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  const timer = setInterval(() => {
    const nowMs = Date.now();
    const candidatesToSync = new Map<
      string,
      { canonicalKey: string; userId: string; username: string; identifiers: string[] }
    >();

    for (const entry of allActiveSockets) {
      if (entry.ws.readyState !== WebSocket.OPEN) continue;
      if (entry.activityState === 'active' && nowMs - entry.lastActivityAt >= SERVER_IDLE_FALLBACK_MS) {
        entry.activityState = 'idle';
        if (!candidatesToSync.has(entry.canonicalKey)) {
          candidatesToSync.set(entry.canonicalKey, {
            canonicalKey: entry.canonicalKey,
            userId: entry.userId,
            username: entry.username,
            identifiers: entry.identifiers,
          });
        }
      }
    }

    for (const userInfo of candidatesToSync.values()) {
      syncAndBroadcastUserPresence(userInfo, nowMs);
    }
  }, PRESENCE_SWEEP_INTERVAL_MS);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

function registerSocket(entry: RegisteredCommsSocket): void {
  allActiveSockets.add(entry);
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
  allActiveSockets.delete(entry);
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

export function setupCommsWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });
  ensurePresenceSweeper();

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

    const canonicalKey = (effectiveUser.username || effectiveUser.userId || '').trim().toLowerCase();
    const entry: RegisteredCommsSocket = {
      ws: clientWs,
      userId: effectiveUser.userId,
      username: effectiveUser.username,
      identifiers: normalizeIdentifiers(effectiveUser),
      canonicalKey,
      activityState: 'active',
      lastActivityAt: Date.now(),
      sessionToken: token,
    };

    registerSocket(entry);

    const sendSafe = (data: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify(data));
        } catch {}
      }
    };

    // Broadcast presence transition (e.g., offline/idle -> online) to peers and push full live snapshot to caller
    syncAndBroadcastUserPresence(entry);
    sendSafe({
      type: 'presence:snapshot',
      statuses: getCommsPresenceSnapshot(),
      timestamp: new Date().toISOString(),
    });

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
        } else if (parsed.type === 'presence:activity') {
          const nextState = parsed.state === 'idle' ? 'idle' : 'active';
          entry.activityState = nextState;
          if (nextState === 'active') {
            entry.lastActivityAt = Date.now();
          }
          syncAndBroadcastUserPresence(entry);
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

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      unregisterSocket(entry);
      syncAndBroadcastUserPresence(entry);
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });
}
