import {
  CommsCountsByFolder,
  CommsDispatchPayload,
  CommsFolder,
  CommsNotificationItem,
  CommsRecipientOption,
} from '../types';
import { appDataCache } from './dataCache';

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('nettopology_auth_token_v1') ||
    localStorage.getItem('nettopology_auth_token') ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('token') ||
    ''
  );
}

function buildAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface CommsNotificationsResponse {
  success: boolean;
  items: CommsNotificationItem[];
  total: number;
  unreadCount: number;
  countsByFolder: CommsCountsByFolder;
  error?: string;
}

export interface CommsUnreadResponse {
  success: boolean;
  unreadCount: number;
  countsByFolder: CommsCountsByFolder;
}

export async function fetchCommsNotifications(options: {
  folder?: CommsFolder;
  severity?: string;
  q?: string;
  limit?: number;
  offset?: number;
  forceRefresh?: boolean;
} = {}): Promise<CommsNotificationsResponse> {
  const folder = options.folder || 'all';
  const severity = options.severity || 'all';
  const q = (options.q || '').trim();
  const limit = options.limit || 60;
  const offset = options.offset || 0;
  const cacheKey = `comms:notifications:${folder}:${severity}:${q}:${limit}:${offset}`;

  return appDataCache.query<CommsNotificationsResponse>(
    cacheKey,
    async () => {
      const qs = new URLSearchParams({
        folder,
        severity,
        q,
        limit: String(limit),
        offset: String(offset),
      });
      const res = await fetch(`/api/comms/notifications?${qs.toString()}`, {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      // Keep unread summary cache fresh simultaneously
      appDataCache.set('comms:unread', {
        success: true,
        unreadCount: json.unreadCount ?? 0,
        countsByFolder: json.countsByFolder,
      });
      return json;
    },
    { ttlMs: 12_000, forceRefresh: Boolean(options.forceRefresh) }
  );
}

export async function fetchUnreadCommsCounts(
  forceRefresh = false
): Promise<CommsUnreadResponse> {
  return appDataCache.query<CommsUnreadResponse>(
    'comms:unread',
    async () => {
      const res = await fetch('/api/comms/unread-count', {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return json;
    },
    { ttlMs: 10_000, forceRefresh }
  );
}

export async function markCommsNotificationRead(
  id: string,
  isRead = true
): Promise<{
  success: boolean;
  notification: CommsNotificationItem;
  unreadCount: number;
  countsByFolder: CommsCountsByFolder;
}> {
  const res = await fetch(`/api/comms/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ isRead }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:');
  return json;
}

export async function markAllCommsNotificationsRead(
  folder: CommsFolder = 'all'
): Promise<{
  success: boolean;
  updatedCount: number;
  unreadCount: number;
  countsByFolder: CommsCountsByFolder;
}> {
  const res = await fetch('/api/comms/notifications/mark-all-read', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ folder }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:');
  return json;
}

export async function acknowledgeCommsNotification(id: string): Promise<{
  success: boolean;
  notification: CommsNotificationItem;
  unreadCount: number;
  countsByFolder: CommsCountsByFolder;
}> {
  const res = await fetch(`/api/comms/notifications/${encodeURIComponent(id)}/acknowledge`, {
    method: 'PATCH',
    headers: buildAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:');
  return json;
}

export async function archiveCommsNotification(
  id: string,
  archived = true
): Promise<{
  success: boolean;
  notification: CommsNotificationItem;
  unreadCount: number;
  countsByFolder: CommsCountsByFolder;
}> {
  const res = await fetch(`/api/comms/notifications/${encodeURIComponent(id)}/archive`, {
    method: 'PATCH',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ archived }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:');
  return json;
}

export async function fetchCommsRecipients(): Promise<CommsRecipientOption[]> {
  return appDataCache.query<CommsRecipientOption[]>(
    'comms:recipients',
    async () => {
      const res = await fetch('/api/comms/recipients', {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return Array.isArray(json.options) ? json.options : [];
    },
    { ttlMs: 30_000 }
  );
}

export async function dispatchCommsMessage(payload: CommsDispatchPayload): Promise<{
  success: boolean;
  messageId: string;
  deliveredCount: number;
  notifications: CommsNotificationItem[];
}> {
  const res = await fetch('/api/comms/dispatch', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:');
  return json;
}

export type CommsWsEvent =
  | {
      type: 'comms:sync';
      unreadCount: number;
      countsByFolder?: CommsCountsByFolder;
      timestamp?: string;
    }
  | {
      type: 'notification:created';
      notification: CommsNotificationItem;
      unreadCount?: number;
      countsByFolder?: CommsCountsByFolder;
    }
  | {
      type: 'notification:updated';
      notification: CommsNotificationItem;
      unreadCount?: number;
      countsByFolder?: CommsCountsByFolder;
    }
  | {
      type: 'notification:read_all';
      folder?: CommsFolder;
      unreadCount?: number;
      countsByFolder?: CommsCountsByFolder;
    }
  | { type: 'ping' | 'pong'; timestamp?: number };

export function connectCommsWebSocket(
  onEvent: (event: CommsWsEvent) => void
): { close: () => void; requestSync: () => void } {
  let ws: WebSocket | null = null;
  let stopped = false;
  let retryDelay = 1500;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const connect = () => {
    if (stopped || typeof window === 'undefined') return;
    const token = getAuthToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/comms?token=${encodeURIComponent(token)}`;

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retryDelay = 1500;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {}
        }
      }, 25_000);
    };

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as CommsWsEvent;
        if (parsed && parsed.type !== 'ping' && parsed.type !== 'pong') {
          onEvent(parsed);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (!stopped) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      try {
        ws?.close();
      } catch {}
    };
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryDelay = Math.min(15_000, Math.round(retryDelay * 1.6));
      connect();
    }, retryDelay);
  };

  connect();

  return {
    close: () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      try {
        ws?.close();
      } catch {}
    },
    requestSync: () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'sync' }));
        } catch {}
      }
    },
  };
}
