import {
  CommsAnnouncementSummary,
  CommsAnnouncementTrackerResponse,
  CommsChannel,
  CommsCountsByFolder,
  CommsDispatchPayload,
  CommsFolder,
  CommsMessage,
  CommsNotificationItem,
  CommsRecipientOption,
  CommsSeverity,
} from '../types';
import { appDataCache } from './dataCache';

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('nettopology_auth_token_v1') ||
    sessionStorage.getItem('nettopology_auth_token_v1') ||
    localStorage.getItem('nettopology_auth_token') ||
    sessionStorage.getItem('nettopology_auth_token') ||
    localStorage.getItem('auth_token') ||
    sessionStorage.getItem('auth_token') ||
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

export async function fetchCommsRecipients(forceRefresh = false): Promise<CommsRecipientOption[]> {
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
    { ttlMs: 30_000, forceRefresh }
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

export async function fetchCommsChannels(forceRefresh = false): Promise<CommsChannel[]> {
  return appDataCache.query<CommsChannel[]>(
    'comms:channels',
    async () => {
      const res = await fetch('/api/comms/channels', {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return Array.isArray(json.channels) ? json.channels : [];
    },
    { ttlMs: 12_000, forceRefresh }
  );
}

export async function openDirectCommsChannel(targetUserId: string): Promise<{
  success: boolean;
  channel: CommsChannel;
  created: boolean;
}> {
  const res = await fetch('/api/comms/channels/direct', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ targetUserId }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function createGroupCommsChannel(payload: {
  name: string;
  nameEn?: string;
  description?: string;
  linkedGroupId?: string | null;
  memberIds?: string[];
}): Promise<{ success: boolean; channel: CommsChannel }> {
  const res = await fetch('/api/comms/channels/group', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function addCommsChannelMembers(
  channelId: string,
  memberIds: string[]
): Promise<{ success: boolean; channel: CommsChannel }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/members`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ memberIds }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function toggleCommsChannelMute(
  channelId: string,
  isMuted: boolean
): Promise<{ success: boolean; channelId: string; isMuted: boolean }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/mute`, {
    method: 'PATCH',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ isMuted }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function fetchChannelMessages(
  channelId: string,
  options: { limit?: number; offset?: number; forceRefresh?: boolean } = {}
): Promise<{ success: boolean; channel: CommsChannel; messages: CommsMessage[]; total: number }> {
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  return appDataCache.query(
    `comms:channel:${channelId}:${limit}:${offset}`,
    async () => {
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      const res = await fetch(
        `/api/comms/channels/${encodeURIComponent(channelId)}/messages?${qs.toString()}`,
        {
          headers: buildAuthHeaders(),
          cache: 'no-store',
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      appDataCache.invalidate('comms:unread');
      return json;
    },
    { ttlMs: 8_000, forceRefresh: Boolean(options.forceRefresh) }
  );
}

export async function postChannelMessage(
  channelId: string,
  payload: {
    body: string;
    priority?: CommsSeverity;
    replyToMessageId?: string | null;
  }
): Promise<{ success: boolean; message: CommsMessage }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function replyToInboxNotificationApi(
  notificationId: string,
  payload: { body: string; priority?: CommsSeverity }
): Promise<{ success: boolean; channel: CommsChannel; message: CommsMessage }> {
  const res = await fetch(
    `/api/comms/notifications/${encodeURIComponent(notificationId)}/reply`,
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:');
  return json;
}

export async function fetchSentAnnouncements(
  forceRefresh = false
): Promise<CommsAnnouncementSummary[]> {
  return appDataCache.query<CommsAnnouncementSummary[]>(
    'comms:announcements:sent',
    async () => {
      const res = await fetch('/api/comms/announcements/sent', {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return Array.isArray(json.announcements) ? json.announcements : [];
    },
    { ttlMs: 12_000, forceRefresh }
  );
}

export async function fetchAnnouncementReceipts(
  messageId: string,
  forceRefresh = false
): Promise<CommsAnnouncementTrackerResponse> {
  return appDataCache.query<CommsAnnouncementTrackerResponse>(
    `comms:announcement:${messageId}:receipts`,
    async () => {
      const res = await fetch(
        `/api/comms/announcements/${encodeURIComponent(messageId)}/receipts`,
        {
          headers: buildAuthHeaders(),
          cache: 'no-store',
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return {
        announcement: json.announcement,
        recipients: Array.isArray(json.recipients) ? json.recipients : [],
      };
    },
    { ttlMs: 10_000, forceRefresh }
  );
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
  | {
      type: 'channel:created';
      channel: CommsChannel;
    }
  | {
      type: 'channel:updated';
      channel: CommsChannel;
    }
  | {
      type: 'channel:message';
      channelId: string;
      message: CommsMessage;
    }
  | {
      type: 'approval:updated';
      approvalId: string;
      status: string;
    }
  | {
      type: 'jit_grant:updated';
      grantId: string;
      approvalId?: string;
      status: string;
      targetEntityType?: string;
      targetEntityId?: string;
      actionKey?: string;
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
