import {
  CommsAnnouncementSummary,
  CommsAnnouncementTrackerResponse,
  CommsApprovalSharePayload,
  CommsChannel,
  CommsCountsByFolder,
  CommsDispatchPayload,
  CommsEntityMentionRef,
  CommsFolder,
  CommsHandoverSummaryResponse,
  CommsMentionCandidate,
  CommsMessage,
  CommsNotificationItem,
  CommsRecipientOption,
  CommsSeverity,
  CommsSnippetSharePayload,
  CommsUserPresenceStatus,
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

export async function safeParseJsonResponse<T = any>(res: Response): Promise<T> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    throw new Error('Empty response received from server');
  }
  if (trimmed.startsWith('<') || /^<!doctype/i.test(trimmed) || /^<html/i.test(trimmed)) {
    throw new Error(
      res.ok
        ? 'Unexpected HTML response from API endpoint'
        : `HTTP ${res.status}: Server returned HTML instead of JSON`
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      res.ok
        ? 'Invalid JSON response from server'
        : `HTTP ${res.status}: Invalid JSON response from server`
    );
  }
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
      const json = await safeParseJsonResponse<any>(res);
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
      const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
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
      const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
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
      const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
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
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  appDataCache.invalidate(`comms:channel:${channelId}`);
  return json;
}

export async function removeCommsChannelMember(
  channelId: string,
  memberId: string
): Promise<{ success: boolean; channel: CommsChannel }> {
  const res = await fetch(
    `/api/comms/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: 'DELETE',
      headers: buildAuthHeaders(),
    }
  );
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  appDataCache.invalidate(`comms:channel:${channelId}`);
  return json;
}

export async function updateCommsChannelMemberRole(
  channelId: string,
  memberId: string,
  role: 'owner' | 'admin' | 'member'
): Promise<{ success: boolean; channel: CommsChannel }> {
  const res = await fetch(
    `/api/comms/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberId)}/role`,
    {
      method: 'PATCH',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ role }),
    }
  );
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  appDataCache.invalidate(`comms:channel:${channelId}`);
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
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function clearCommsChannelHistory(
  channelId: string
): Promise<{ success: boolean; channelId: string; clearedAt: string }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/clear`, {
    method: 'POST',
    headers: buildAuthHeaders(),
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  appDataCache.invalidate('comms:unread');
  return json;
}

export async function leaveCommsChannel(
  channelId: string
): Promise<{
  success: boolean;
  channelId: string;
  mode: 'hidden_direct' | 'left_group' | 'deleted_empty_group';
}> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/leave`, {
    method: 'POST',
    headers: buildAuthHeaders(),
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  appDataCache.invalidate('comms:unread');
  return json;
}

export async function deleteCommsChannel(
  channelId: string
): Promise<{ success: boolean; channelId: string }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(),
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  appDataCache.invalidate('comms:unread');
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
      const json = await safeParseJsonResponse<any>(res);
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      appDataCache.invalidate('comms:unread');
      return json;
    },
    { ttlMs: 8_000, forceRefresh: Boolean(options.forceRefresh) }
  );
}

export async function searchCommsMentionEntities(
  query: string,
  channelId?: string | null
): Promise<CommsMentionCandidate[]> {
  const qs = new URLSearchParams({ q: (query || '').trim() });
  if (channelId && channelId.trim()) {
    qs.set('channelId', channelId.trim());
  }
  const res = await fetch(`/api/comms/entities/mention-search?${qs.toString()}`, {
    headers: buildAuthHeaders(),
    cache: 'no-store',
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return Array.isArray(json.candidates) ? json.candidates : [];
}

export async function postChannelMessage(
  channelId: string,
  payload: {
    body: string;
    priority?: CommsSeverity;
    replyToMessageId?: string | null;
    entityRefs?: CommsEntityMentionRef[];
  }
): Promise<{ success: boolean; message: CommsMessage }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function executeChannelSlashCommand(
  channelId: string,
  payload: {
    commandText: string;
    priority?: CommsSeverity;
    replyToMessageId?: string | null;
  }
): Promise<{ success: boolean; message: CommsMessage }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/slash`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    const err: any = new Error(json?.error || `HTTP ${res.status}`);
    if (json?.errorFa) err.errorFa = json.errorFa;
    if (json?.code) err.code = json.code;
    throw err;
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function shareChannelSnippet(
  channelId: string,
  payload: CommsSnippetSharePayload
): Promise<{ success: boolean; message: CommsMessage }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/snippet`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    const err: any = new Error(json?.error || `HTTP ${res.status}`);
    if (json?.errorFa) err.errorFa = json.errorFa;
    if (json?.code) err.code = json.code;
    throw err;
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function shareChannelApproval(
  channelId: string,
  payload: CommsApprovalSharePayload
): Promise<{ success: boolean; message: CommsMessage }> {
  const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/approval`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success) {
    const err: any = new Error(json?.error || `HTTP ${res.status}`);
    if (json?.errorFa) err.errorFa = json.errorFa;
    if (json?.code) err.code = json.code;
    throw err;
  }
  appDataCache.invalidate(`comms:channel:${channelId}`);
  appDataCache.invalidate('comms:channels');
  return json;
}

export async function fetchChannelHandover(
  channelId: string,
  options: { limit?: number } = {}
): Promise<CommsHandoverSummaryResponse> {
  const limit = options.limit || 150;
  const res = await fetch(
    `/api/comms/channels/${encodeURIComponent(channelId)}/handover?limit=${limit}`,
    {
      headers: buildAuthHeaders(),
      cache: 'no-store',
    }
  );
  const json = await safeParseJsonResponse<any>(res);
  if (!res.ok || !json.success || !json.handover) {
    const err: any = new Error(json?.error || `HTTP ${res.status}`);
    if (json?.errorFa) err.errorFa = json.errorFa;
    throw err;
  }
  return json.handover;
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
  const json = await safeParseJsonResponse<any>(res);
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
      const json = await safeParseJsonResponse<any>(res);
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
      const json = await safeParseJsonResponse<any>(res);
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
      type: 'channel:removed';
      channelId: string;
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
      executionStatus?: string;
      autoExecuted?: boolean;
      currentStageOrder?: number;
      totalStages?: number;
      targetEntityType?: string;
      targetEntityId?: string;
      actionKey?: string;
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
  | {
      type: 'presence:snapshot';
      statuses: Record<string, CommsUserPresenceStatus>;
      timestamp?: string;
    }
  | {
      type: 'presence:updated';
      userId?: string;
      username?: string;
      identifiers?: string[];
      status: CommsUserPresenceStatus;
      timestamp?: string;
    }
  | { type: 'ping' | 'pong'; timestamp?: number };

const USER_IDLE_TIMEOUT_MS = 120_000; // 2m of no interaction in panel -> Idle
const HIDDEN_IDLE_TIMEOUT_MS = 60_000; // 1m while tab hidden -> Idle
const ACTIVE_KEEPALIVE_MS = 45_000; // Keep server lastActivityAt fresh while working
const IDLE_CHECK_INTERVAL_MS = 10_000;

export function connectCommsWebSocket(
  onEvent: (event: CommsWsEvent) => void
): { close: () => void; requestSync: () => void } {
  let ws: WebSocket | null = null;
  let stopped = false;
  let retryDelay = 1500;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let idleCheckTimer: ReturnType<typeof setInterval> | null = null;

  let localActivityState: 'active' | 'idle' = 'active';
  let lastInteractionAt = Date.now();
  let lastActiveSentAt = 0;

  const sendPresenceActivity = (nextState: 'active' | 'idle') => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'presence:activity', state: nextState }));
      if (nextState === 'active') {
        lastActiveSentAt = Date.now();
      }
    } catch {}
  };

  const handleUserInteraction = () => {
    if (stopped) return;
    const now = Date.now();
    lastInteractionAt = now;
    if (localActivityState !== 'active') {
      localActivityState = 'active';
      sendPresenceActivity('active');
    } else if (now - lastActiveSentAt >= ACTIVE_KEEPALIVE_MS) {
      sendPresenceActivity('active');
    }
  };

  const evaluateIdleState = () => {
    if (stopped) return;
    const now = Date.now();
    const isHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const threshold = isHidden ? HIDDEN_IDLE_TIMEOUT_MS : USER_IDLE_TIMEOUT_MS;
    if (localActivityState === 'active' && now - lastInteractionAt >= threshold) {
      localActivityState = 'idle';
      sendPresenceActivity('idle');
    }
  };

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      handleUserInteraction();
    } else {
      evaluateIdleState();
    }
  };

  const attachActivityListeners = () => {
    if (typeof window === 'undefined') return;
    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'wheel',
      'focus',
    ];
    for (const ev of events) {
      window.addEventListener(ev, handleUserInteraction, { passive: true });
    }
    window.addEventListener('scroll', handleUserInteraction, { passive: true, capture: true });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (idleCheckTimer) clearInterval(idleCheckTimer);
    idleCheckTimer = setInterval(evaluateIdleState, IDLE_CHECK_INTERVAL_MS);
  };

  const detachActivityListeners = () => {
    if (typeof window === 'undefined') return;
    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'wheel',
      'focus',
    ];
    for (const ev of events) {
      window.removeEventListener(ev, handleUserInteraction);
    }
    window.removeEventListener('scroll', handleUserInteraction, { capture: true });
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (idleCheckTimer) {
      clearInterval(idleCheckTimer);
      idleCheckTimer = null;
    }
  };

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
      lastInteractionAt = Date.now();
      localActivityState =
        typeof document !== 'undefined' && document.visibilityState === 'hidden'
          ? 'idle'
          : 'active';
      sendPresenceActivity(localActivityState);

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

  attachActivityListeners();
  connect();

  return {
    close: () => {
      stopped = true;
      detachActivityListeners();
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
