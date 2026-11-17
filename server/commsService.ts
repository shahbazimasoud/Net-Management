import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
import {
  getPgPool,
  isPostgresConnected,
  ensurePostgresConnection,
  loadFallbackStore,
  saveFallbackStore,
  getAllUsers,
  getUserGroups,
  getAccessPolicies,
  getAuthorizedMapSubjects,
  getActiveDirectoryConfig,
  addPortalAuditLog,
  registerCommsAuditAlertHook,
  findUserById,
  findUserByUsername,
  getEffectivePolicyForUser,
  getAllDevices,
  getAllRemoteServers,
  isDeviceActionPermitted,
  isServerActionPermitted,
} from './db';
import { searchMacOrIp } from './macIpTrackerService';
import {
  CommsAnnouncementReadReceipt,
  CommsAnnouncementSummary,
  CommsAnnouncementTrackerResponse,
  CommsCategory,
  CommsChannel,
  CommsChannelMember,
  CommsChannelType,
  CommsCountsByFolder,
  CommsDispatchPayload,
  CommsEntityMentionRef,
  CommsFolder,
  CommsMentionCandidate,
  CommsMessage,
  CommsNotificationItem,
  CommsProjectedEntityCard,
  CommsProjectedSlashResult,
  CommsProjectedSnippetResult,
  CommsRecipientOption,
  CommsSeverity,
  CommsSlashCommandName,
  CommsSnippetPlatform,
  CommsSnippetSharePayload,
  CommsSnippetSourceType,
} from '../src/types';
import {
  broadcastCommsEventToRecipients,
  broadcastCommsEventToUser,
  registerCommsSyncProvider,
} from './commsWs';
import { evaluateNotificationDeliveryForUser } from './profileService';
import { CommsEmailDispatchItem, sendCommsCategoryEmailBatch } from './emailService';

const execFileAsync = promisify(execFile);

interface PendingCommsEmailTarget {
  recipient: ResolvedRecipient;
  category: CommsCategory;
  severity: CommsSeverity;
  senderName: string;
  senderRole?: string;
  title: string;
  titleEn?: string;
  body: string;
  bodyEn?: string;
  linkedEntityName?: string | null;
  channelName?: string | null;
}

function stripDuplicateUsernameSuffix(
  fullName: string | null | undefined,
  username: string | null | undefined
): string {
  const cleanFull = (fullName || '').trim();
  const cleanUser = (username || '').trim();
  if (!cleanFull) return cleanUser;
  let cleaned = cleanFull.replace(/(\s*\([^)]+\))(\1)+$/gi, '$1').trim();
  if (cleanUser) {
    const escapedUser = cleanUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`(?:\\s*\\(${escapedUser}\\))+$`, 'i'), '').trim();
  }
  return cleaned || cleanUser;
}

function formatUserDisplay(
  fullName: string | null | undefined,
  username: string | null | undefined
): string {
  const cleanUser = (username || '').trim();
  const baseName = stripDuplicateUsernameSuffix(fullName, cleanUser);
  if (!cleanUser) return baseName;
  if (!baseName || baseName.toLowerCase() === cleanUser.toLowerCase()) {
    return cleanUser;
  }
  return `${baseName} (${cleanUser})`;
}

async function resolveDirectoryEmailLookup(): Promise<
  Map<string, { email: string; fullName?: string }>
> {
  const emailMap = new Map<string, { email: string; fullName?: string }>();
  const register = (
    identifiersInput: Partial<CommsActor> & { extraKeys?: Array<string | undefined | null> },
    email?: string | null,
    fullName?: string | null
  ) => {
    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) return;
    const entry = { email: cleanEmail, fullName: (fullName || '').trim() || undefined };
    for (const key of resolveUserIdentifiers(identifiersInput)) {
      if (!emailMap.has(key)) emailMap.set(key, entry);
    }
    for (const extra of identifiersInput.extraKeys || []) {
      const k = (extra || '').trim().toLowerCase();
      if (k && !emailMap.has(k)) emailMap.set(k, entry);
    }
  };

  const [localUsersRes, adConfig] = await Promise.all([
    getAllUsers().catch(() => []),
    getActiveDirectoryConfig().catch(() => null),
  ]);

  const localUsers = (localUsersRes || []).filter((u) => u && u.status !== 'disabled');
  for (const u of localUsers) {
    register(
      { userId: u.id, username: u.username },
      u.email,
      u.fullName || u.full_name || u.username
    );
  }

  const syncedUsers: any[] = Array.isArray(adConfig?.syncedUsers) ? adConfig.syncedUsers : [];
  for (const au of syncedUsers) {
    register(
      {
        userId: au.id || au.samAccountName || au.dn,
        username: au.samAccountName || au.id || au.dn,
        extraKeys: [au.dn, au.email, au.mail],
      },
      au.email || au.mail,
      au.displayName || au.samAccountName
    );
  }

  return emailMap;
}

async function dispatchCommsEmailsAsync(targets: PendingCommsEmailTarget[]): Promise<void> {
  if (!Array.isArray(targets) || targets.length === 0) return;
  try {
    const emailMap = await resolveDirectoryEmailLookup();
    const batch: CommsEmailDispatchItem[] = [];
    for (const t of targets) {
      const ids = resolveUserIdentifiers({
        userId: t.recipient.userId,
        username: t.recipient.username,
      });
      let resolved: { email: string; fullName?: string } | undefined;
      for (const k of ids) {
        resolved = emailMap.get(k);
        if (resolved) break;
      }
      if (!resolved?.email) continue;
      batch.push({
        to: resolved.email,
        recipientUsername: t.recipient.username,
        recipientFullName: resolved.fullName,
        category: t.category,
        severity: t.severity,
        senderName: t.senderName,
        senderRole: t.senderRole,
        title: t.title,
        titleEn: t.titleEn,
        body: t.body,
        bodyEn: t.bodyEn,
        linkedEntityName: t.linkedEntityName,
        channelName: t.channelName,
      });
    }
    if (batch.length > 0) {
      await sendCommsCategoryEmailBatch(batch);
    }
  } catch (err: any) {
    console.warn('[CommsService] Background email notification notice:', err?.message || err);
  }
}

export interface CommsActor {
  userId: string;
  username: string;
  fullName?: string;
  role?: string;
  userType?: 'local' | 'ad' | string;
}

interface ResolvedRecipient {
  userId: string;
  username: string;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export function resolveUserIdentifiers(user: Partial<CommsActor> | null | undefined): string[] {
  const ids = new Set<string>();
  const add = (val?: string | null) => {
    if (!val || typeof val !== 'string') return;
    const trimmed = val.trim().toLowerCase();
    if (!trimmed) return;
    ids.add(trimmed);
    if (trimmed.includes('@')) {
      ids.add(trimmed.split('@')[0]);
    }
    if (trimmed.includes('\\')) {
      const parts = trimmed.split('\\');
      if (parts[1]) ids.add(parts[1]);
    }
  };
  if (user) {
    add(user.userId);
    add((user as any).id);
    add(user.username);
  }
  return Array.from(ids);
}

function mapNotificationRow(row: any): CommsNotificationItem {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id ?? row.recipientUserId ?? '',
    recipientUsername: row.recipient_username ?? row.recipientUsername ?? '',
    sourceMessageId: row.source_message_id ?? row.sourceMessageId ?? null,
    channelId: row.channel_id ?? row.channelId ?? null,
    category: (row.category || 'system_alert') as CommsCategory,
    severity: (row.severity || 'info') as CommsSeverity,
    senderName: row.sender_name ?? row.senderName ?? 'System',
    senderRole: row.sender_role ?? row.senderRole ?? null,
    title: row.title || '',
    titleEn: row.title_en ?? row.titleEn ?? null,
    summary: row.summary || '',
    summaryEn: row.summary_en ?? row.summaryEn ?? null,
    body: row.body || '',
    bodyEn: row.body_en ?? row.bodyEn ?? null,
    linkedEntityType: row.linked_entity_type ?? row.linkedEntityType ?? null,
    linkedEntityId: row.linked_entity_id ?? row.linkedEntityId ?? null,
    linkedEntityName: row.linked_entity_name ?? row.linkedEntityName ?? null,
    actionTab: row.action_tab ?? row.actionTab ?? null,
    isRead: Boolean(row.is_read ?? row.isRead),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : row.readAt || null,
    acknowledgedAt: row.acknowledged_at
      ? new Date(row.acknowledged_at).toISOString()
      : row.acknowledgedAt || null,
    isArchived: Boolean(row.is_archived ?? row.isArchived),
    requiresAcknowledgment: Boolean(row.requires_acknowledgment ?? row.requiresAcknowledgment),
    metadata:
      typeof row.metadata === 'string'
        ? (() => {
            try {
              return JSON.parse(row.metadata);
            } catch {
              return {};
            }
          })()
        : row.metadata || {},
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : row.createdAt || new Date().toISOString(),
  };
}

function emptyCounts(): CommsCountsByFolder {
  return {
    all: 0,
    unread: 0,
    messages: 0,
    announcements: 0,
    system: 0,
    approvals: 0,
    archived: 0,
  };
}

function computeCountsFromItems(items: CommsNotificationItem[]): CommsCountsByFolder {
  const counts = emptyCounts();
  for (const item of items) {
    if (item.isArchived) {
      counts.archived++;
      continue;
    }
    counts.all++;
    if (!item.isRead) counts.unread++;
    if (item.category === 'direct_message' || item.category === 'channel_message') {
      counts.messages++;
    } else if (item.category === 'announcement') {
      counts.announcements++;
    } else if (item.category === 'approval_request') {
      counts.approvals++;
    } else {
      counts.system++;
    }
  }
  return counts;
}

function matchesFolder(item: CommsNotificationItem, folder: CommsFolder): boolean {
  if (folder === 'archived') return item.isArchived;
  if (item.isArchived) return false;
  switch (folder) {
    case 'unread':
      return !item.isRead;
    case 'messages':
      return item.category === 'direct_message' || item.category === 'channel_message';
    case 'announcements':
      return item.category === 'announcement';
    case 'system':
      return item.category === 'system_alert' || item.category === 'security_2fa';
    case 'approvals':
      return item.category === 'approval_request';
    case 'all':
    default:
      return true;
  }
}

export async function getUnreadNotificationCounts(
  user: Partial<CommsActor>
): Promise<{ unreadCount: number; countsByFolder: CommsCountsByFolder }> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0) {
    return { unreadCount: 0, countsByFolder: emptyCounts() };
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE is_archived = FALSE)::int AS all_count,
           COUNT(*) FILTER (WHERE is_archived = FALSE AND is_read = FALSE)::int AS unread_count,
           COUNT(*) FILTER (WHERE is_archived = FALSE AND category IN ('direct_message', 'channel_message'))::int AS messages_count,
           COUNT(*) FILTER (WHERE is_archived = FALSE AND category = 'announcement')::int AS announcements_count,
           COUNT(*) FILTER (WHERE is_archived = FALSE AND category IN ('system_alert', 'security_2fa'))::int AS system_count,
           COUNT(*) FILTER (WHERE is_archived = FALSE AND category = 'approval_request')::int AS approvals_count,
           COUNT(*) FILTER (WHERE is_archived = TRUE)::int AS archived_count
         FROM comms_notifications
         WHERE LOWER(recipient_user_id) = ANY($1::text[])
            OR LOWER(recipient_username) = ANY($1::text[])`,
        [identifiers]
      );
      const r = res.rows[0] || {};
      const countsByFolder: CommsCountsByFolder = {
        all: r.all_count || 0,
        unread: r.unread_count || 0,
        messages: r.messages_count || 0,
        announcements: r.announcements_count || 0,
        system: r.system_count || 0,
        approvals: r.approvals_count || 0,
        archived: r.archived_count || 0,
      };
      return { unreadCount: countsByFolder.unread, countsByFolder };
    } catch (err: any) {
      console.error('[CommsService] PostgreSQL count error:', err?.message || err);
    }
  }

  const store = loadFallbackStore();
  const idSet = new Set(identifiers);
  const userRows = (store.comms_notifications || [])
    .map(mapNotificationRow)
    .filter(
      (n) =>
        idSet.has((n.recipientUserId || '').toLowerCase()) ||
        idSet.has((n.recipientUsername || '').toLowerCase())
    );
  const countsByFolder = computeCountsFromItems(userRows);
  return { unreadCount: countsByFolder.unread, countsByFolder };
}

export async function listUserNotifications(
  user: Partial<CommsActor>,
  options: {
    folder?: CommsFolder;
    severity?: string;
    q?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  items: CommsNotificationItem[];
  total: number;
  unreadCount: number;
  countsByFolder: CommsCountsByFolder;
}> {
  const identifiers = resolveUserIdentifiers(user);
  const folder: CommsFolder = options.folder || 'all';
  const severity = options.severity && options.severity !== 'all' ? options.severity : '';
  const q = (options.q || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 60));
  const offset = Math.max(0, Number(options.offset) || 0);

  if (identifiers.length === 0) {
    return { items: [], total: 0, unreadCount: 0, countsByFolder: emptyCounts() };
  }

  const { countsByFolder, unreadCount } = await getUnreadNotificationCounts(user);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const params: any[] = [identifiers];
      const conditions: string[] = [
        `(LOWER(recipient_user_id) = ANY($1::text[]) OR LOWER(recipient_username) = ANY($1::text[]))`,
      ];

      if (folder === 'archived') {
        conditions.push('is_archived = TRUE');
      } else {
        conditions.push('is_archived = FALSE');
        if (folder === 'unread') {
          conditions.push('is_read = FALSE');
        } else if (folder === 'messages') {
          conditions.push(`category IN ('direct_message', 'channel_message')`);
        } else if (folder === 'announcements') {
          conditions.push(`category = 'announcement'`);
        } else if (folder === 'system') {
          conditions.push(`category IN ('system_alert', 'security_2fa')`);
        } else if (folder === 'approvals') {
          conditions.push(`category = 'approval_request'`);
        }
      }

      if (severity) {
        params.push(severity);
        conditions.push(`severity = $${params.length}`);
      }

      if (q) {
        params.push(`%${q}%`);
        const idx = params.length;
        conditions.push(
          `(LOWER(title) LIKE $${idx} OR LOWER(COALESCE(title_en, '')) LIKE $${idx} OR LOWER(summary) LIKE $${idx} OR LOWER(COALESCE(summary_en, '')) LIKE $${idx} OR LOWER(body) LIKE $${idx} OR LOWER(COALESCE(body_en, '')) LIKE $${idx} OR LOWER(sender_name) LIKE $${idx} OR LOWER(COALESCE(linked_entity_name, '')) LIKE $${idx})`
        );
      }

      const whereClause = conditions.join(' AND ');
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM comms_notifications WHERE ${whereClause}`,
        params
      );
      const total = countRes.rows[0]?.total || 0;

      const listParams = [...params, limit, offset];
      const rowsRes = await pool.query(
        `SELECT * FROM comms_notifications
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );

      return {
        items: rowsRes.rows.map(mapNotificationRow),
        total,
        unreadCount,
        countsByFolder,
      };
    } catch (err: any) {
      console.error('[CommsService] PostgreSQL listUserNotifications error:', err?.message || err);
    }
  }

  const store = loadFallbackStore();
  const idSet = new Set(identifiers);
  const allMatching = (store.comms_notifications || [])
    .map(mapNotificationRow)
    .filter(
      (n) =>
        idSet.has((n.recipientUserId || '').toLowerCase()) ||
        idSet.has((n.recipientUsername || '').toLowerCase())
    )
    .filter((n) => matchesFolder(n, folder))
    .filter((n) => (!severity ? true : n.severity === severity))
    .filter((n) => {
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        (n.titleEn || '').toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        (n.summaryEn || '').toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.bodyEn || '').toLowerCase().includes(q) ||
        n.senderName.toLowerCase().includes(q) ||
        (n.linkedEntityName || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    items: allMatching.slice(offset, offset + limit),
    total: allMatching.length,
    unreadCount,
    countsByFolder,
  };
}

export async function markNotificationRead(
  user: Partial<CommsActor>,
  notificationId: string,
  isRead: boolean
): Promise<CommsNotificationItem | null> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0 || !notificationId) return null;

  const readAtIso = isRead ? new Date().toISOString() : null;
  let updated: CommsNotificationItem | null = null;

  // Fallback store update
  const store = loadFallbackStore();
  if (Array.isArray(store.comms_notifications)) {
    const idSet = new Set(identifiers);
    const idx = store.comms_notifications.findIndex(
      (n: any) =>
        n.id === notificationId &&
        (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
          idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
    );
    if (idx !== -1) {
      store.comms_notifications[idx].is_read = isRead;
      store.comms_notifications[idx].read_at = readAtIso;
      updated = mapNotificationRow(store.comms_notifications[idx]);
      saveFallbackStore(store);
    }
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `UPDATE comms_notifications
         SET is_read = $1,
             read_at = CASE WHEN $1 THEN COALESCE(read_at, CURRENT_TIMESTAMP) ELSE NULL END
         WHERE id = $2
           AND (LOWER(recipient_user_id) = ANY($3::text[]) OR LOWER(recipient_username) = ANY($3::text[]))
         RETURNING *`,
        [isRead, notificationId, identifiers]
      );
      if (res.rows[0]) {
        updated = mapNotificationRow(res.rows[0]);
      }
    } catch (err: any) {
      console.error('[CommsService] markNotificationRead DB error:', err?.message || err);
    }
  }

  if (updated) {
    const counts = await getUnreadNotificationCounts(user);
    broadcastCommsEventToUser(user, {
      type: 'notification:updated',
      notification: updated,
      unreadCount: counts.unreadCount,
      countsByFolder: counts.countsByFolder,
    });
  }

  return updated;
}

export async function markAllNotificationsRead(
  user: Partial<CommsActor>,
  folder: CommsFolder = 'all'
): Promise<{ updatedCount: number; unreadCount: number; countsByFolder: CommsCountsByFolder }> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0) {
    return { updatedCount: 0, unreadCount: 0, countsByFolder: emptyCounts() };
  }

  const nowIso = new Date().toISOString();
  let updatedCount = 0;

  // Fallback update
  const store = loadFallbackStore();
  if (Array.isArray(store.comms_notifications)) {
    const idSet = new Set(identifiers);
    let touched = false;
    for (const raw of store.comms_notifications) {
      const mapped = mapNotificationRow(raw);
      const belongs =
        idSet.has((mapped.recipientUserId || '').toLowerCase()) ||
        idSet.has((mapped.recipientUsername || '').toLowerCase());
      if (belongs && !mapped.isRead && !mapped.isArchived && matchesFolder(mapped, folder === 'archived' ? 'all' : folder)) {
        raw.is_read = true;
        raw.read_at = raw.read_at || nowIso;
        touched = true;
        updatedCount++;
      }
    }
    if (touched) saveFallbackStore(store);
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const conds = [
        `(LOWER(recipient_user_id) = ANY($1::text[]) OR LOWER(recipient_username) = ANY($1::text[]))`,
        `is_archived = FALSE`,
        `is_read = FALSE`,
      ];
      if (folder === 'messages') {
        conds.push(`category IN ('direct_message', 'channel_message')`);
      } else if (folder === 'announcements') {
        conds.push(`category = 'announcement'`);
      } else if (folder === 'system') {
        conds.push(`category IN ('system_alert', 'security_2fa')`);
      } else if (folder === 'approvals') {
        conds.push(`category = 'approval_request'`);
      }
      const res = await pool.query(
        `UPDATE comms_notifications
         SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE ${conds.join(' AND ')}`,
        [identifiers]
      );
      updatedCount = Math.max(updatedCount, res.rowCount || 0);
    } catch (err: any) {
      console.error('[CommsService] markAllNotificationsRead DB error:', err?.message || err);
    }
  }

  const counts = await getUnreadNotificationCounts(user);
  broadcastCommsEventToUser(user, {
    type: 'notification:read_all',
    folder,
    unreadCount: counts.unreadCount,
    countsByFolder: counts.countsByFolder,
  });

  return {
    updatedCount,
    unreadCount: counts.unreadCount,
    countsByFolder: counts.countsByFolder,
  };
}

export async function acknowledgeNotification(
  user: Partial<CommsActor>,
  notificationId: string
): Promise<CommsNotificationItem | null> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0 || !notificationId) return null;

  const nowIso = new Date().toISOString();
  let updated: CommsNotificationItem | null = null;

  const store = loadFallbackStore();
  if (Array.isArray(store.comms_notifications)) {
    const idSet = new Set(identifiers);
    const idx = store.comms_notifications.findIndex(
      (n: any) =>
        n.id === notificationId &&
        (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
          idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
    );
    if (idx !== -1) {
      store.comms_notifications[idx].acknowledged_at = store.comms_notifications[idx].acknowledged_at || nowIso;
      store.comms_notifications[idx].is_read = true;
      store.comms_notifications[idx].read_at = store.comms_notifications[idx].read_at || nowIso;
      updated = mapNotificationRow(store.comms_notifications[idx]);
      saveFallbackStore(store);
    }
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `UPDATE comms_notifications
         SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP),
             is_read = TRUE,
             read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE id = $1
           AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))
         RETURNING *`,
        [notificationId, identifiers]
      );
      if (res.rows[0]) {
        updated = mapNotificationRow(res.rows[0]);
      }
    } catch (err: any) {
      console.error('[CommsService] acknowledgeNotification DB error:', err?.message || err);
    }
  }

  if (updated) {
    const counts = await getUnreadNotificationCounts(user);
    broadcastCommsEventToUser(user, {
      type: 'notification:updated',
      notification: updated,
      unreadCount: counts.unreadCount,
      countsByFolder: counts.countsByFolder,
    });

    await addPortalAuditLog({
      category: 'communications',
      action: 'NOTIFICATION_ACKNOWLEDGED',
      title: `تایید دریافت اعلان / اطلاعیه: ${updated.title}`,
      title_en: `Notification Acknowledged: ${updated.titleEn || updated.title}`,
      actor: {
        username: user.username || 'unknown',
        role: user.role || 'Operator',
        ipAddress: '127.0.0.1',
      },
      target: {
        type: 'notification',
        id: updated.id,
        name: updated.titleEn || updated.title,
      },
      severity: 'info',
      status: 'success',
      details: `کاربر ${user.username} دریافت پیام "${updated.title}" را تایید (Read Receipt) کرد.`,
      details_en: `User ${user.username} acknowledged receipt of notification "${updated.titleEn || updated.title}".`,
    }).catch(() => {});
  }

  return updated;
}

export async function archiveNotification(
  user: Partial<CommsActor>,
  notificationId: string,
  archived: boolean
): Promise<CommsNotificationItem | null> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0 || !notificationId) return null;

  let updated: CommsNotificationItem | null = null;
  const store = loadFallbackStore();
  if (Array.isArray(store.comms_notifications)) {
    const idSet = new Set(identifiers);
    const idx = store.comms_notifications.findIndex(
      (n: any) =>
        n.id === notificationId &&
        (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
          idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
    );
    if (idx !== -1) {
      store.comms_notifications[idx].is_archived = archived;
      updated = mapNotificationRow(store.comms_notifications[idx]);
      saveFallbackStore(store);
    }
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `UPDATE comms_notifications
         SET is_archived = $1
         WHERE id = $2
           AND (LOWER(recipient_user_id) = ANY($3::text[]) OR LOWER(recipient_username) = ANY($3::text[]))
         RETURNING *`,
        [archived, notificationId, identifiers]
      );
      if (res.rows[0]) {
        updated = mapNotificationRow(res.rows[0]);
      }
    } catch (err: any) {
      console.error('[CommsService] archiveNotification DB error:', err?.message || err);
    }
  }

  if (updated) {
    const counts = await getUnreadNotificationCounts(user);
    broadcastCommsEventToUser(user, {
      type: 'notification:updated',
      notification: updated,
      unreadCount: counts.unreadCount,
      countsByFolder: counts.countsByFolder,
    });
  }

  return updated;
}

export async function getCommsRecipients(): Promise<CommsRecipientOption[]> {
  const options: CommsRecipientOption[] = [
    {
      type: 'all',
      id: '__all__',
      label: 'همه کاربران فعال پنل (اطلاعیه عمومی)',
      labelEn: 'All Active Panel Users (Broadcast)',
      roleOrType: 'Broadcast',
      source: 'broadcast',
    },
  ];

  const [localUsersRaw, subjectsResult, localGroups] = await Promise.all([
    getAllUsers().catch(() => []),
    getAuthorizedMapSubjects().catch(() => null),
    getUserGroups().catch(() => []),
  ]);

  const localUsers = (localUsersRaw || []).filter((u) => u && u.status !== 'disabled');
  for (const u of localUsers) {
    const formatted = formatUserDisplay(u.fullName, u.username);
    options.push({
      type: 'user',
      id: u.id,
      username: u.username,
      label: formatted,
      labelEn: formatted,
      roleOrType: u.role || 'Local User',
      source: 'local',
    });
  }

  const seenUsernames = new Set(localUsers.map((u) => (u.username || '').toLowerCase()));

  if (subjectsResult?.categories?.adUsers) {
    for (const adUser of subjectsResult.categories.adUsers) {
      const uname = (adUser.name || adUser.id || '').toLowerCase();
      if (!uname || seenUsernames.has(uname)) continue;
      seenUsernames.add(uname);
      const formattedAd = formatUserDisplay(adUser.displayName, adUser.name || adUser.id);
      options.push({
        type: 'user',
        id: adUser.rawId || adUser.id,
        username: adUser.name,
        label: formattedAd,
        labelEn: formattedAd,
        roleOrType: adUser.role || 'AD User',
        source: 'ad',
      });
    }
  }

  for (const g of localGroups || []) {
    options.push({
      type: 'group',
      id: g.id,
      label: g.name,
      labelEn: g.name,
      roleOrType: 'Local Group',
      source: 'group',
    });
  }

  if (subjectsResult?.categories?.adGroups) {
    for (const adGroup of subjectsResult.categories.adGroups) {
      options.push({
        type: 'group',
        id: adGroup.rawId || adGroup.id,
        label: adGroup.displayName,
        labelEn: adGroup.displayName,
        roleOrType: 'AD Group',
        source: 'ad',
      });
    }
  }

  return options;
}

async function resolveTargetRecipients(
  targetType: 'all' | 'group' | 'users',
  targetIds: string[] = []
): Promise<ResolvedRecipient[]> {
  const map = new Map<string, ResolvedRecipient>();
  const addRec = (userId: string, username: string) => {
    const cleanU = (username || userId || '').trim();
    const cleanId = (userId || cleanU).trim();
    if (!cleanU && !cleanId) return;
    const key = cleanU.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { userId: cleanId, username: cleanU });
    }
  };

  const [localUsersRaw, adConfig, subjectsResult] = await Promise.all([
    getAllUsers().catch(() => []),
    getActiveDirectoryConfig().catch(() => null),
    getAuthorizedMapSubjects().catch(() => null),
  ]);
  const localUsers = (localUsersRaw || []).filter((u) => u && u.status !== 'disabled');
  const syncedAdUsers: any[] = Array.isArray(adConfig?.syncedUsers) ? adConfig.syncedUsers : [];
  const syncedAdGroups: any[] = Array.isArray(adConfig?.syncedGroups) ? adConfig.syncedGroups : [];

  if (targetType === 'all') {
    for (const u of localUsers) {
      addRec(u.id, u.username);
    }
    if (subjectsResult?.categories?.adUsers) {
      for (const adu of subjectsResult.categories.adUsers) {
        addRec(adu.rawId || adu.id, adu.name || adu.id);
      }
    }
    return Array.from(map.values());
  }

  const targetSet = new Set(targetIds.map((t) => (t || '').trim().toLowerCase()).filter(Boolean));

  if (targetType === 'group') {
    const localGroups = await getUserGroups();
    for (const g of localGroups) {
      if (targetSet.has((g.id || '').toLowerCase()) || targetSet.has((g.name || '').toLowerCase())) {
        const members: string[] = Array.isArray(g.memberUserIds)
          ? g.memberUserIds
          : Array.isArray(g.member_user_ids)
          ? g.member_user_ids
          : [];
        for (const mId of members) {
          const matchedUser = localUsers.find(
            (u) => u.id === mId || u.username.toLowerCase() === String(mId).toLowerCase()
          );
          if (matchedUser) {
            addRec(matchedUser.id, matchedUser.username);
          }
        }
      }
    }

    const extractGroupKeys = (val?: string | null): string[] => {
      const clean = String(val || '')
        .replace(/\s*\(Active Directory\)\s*$/i, '')
        .trim()
        .toLowerCase();
      if (!clean) return [];
      const out = [clean];
      const cnMatch = clean.match(/(?:^|,)cn=([^,]+)/i);
      if (cnMatch?.[1]) out.push(cnMatch[1].trim());
      return out;
    };

    const normalizedTargets = new Set<string>();
    targetIds.forEach((t) => {
      for (const k of extractGroupKeys(t)) normalizedTargets.add(k);
    });

    for (const ag of syncedAdGroups) {
      const agKeys = [...extractGroupKeys(ag.dn), ...extractGroupKeys(ag.cn)];
      const matchAg = agKeys.some((k) => normalizedTargets.has(k));
      if (matchAg) {
        agKeys.forEach((k) => normalizedTargets.add(k));
        if (Array.isArray(ag.members)) {
          for (const memberIdent of ag.members) {
            const mLower = String(memberIdent).toLowerCase();
            const matchedAd = syncedAdUsers.find(
              (au) =>
                (au.dn || '').toLowerCase() === mLower ||
                (au.samAccountName || '').toLowerCase() === mLower
            );
            if (matchedAd?.samAccountName) {
              addRec(matchedAd.dn || `ad-${matchedAd.samAccountName}`, matchedAd.samAccountName);
            }
          }
        }
      }
    }

    // Match AD users via au.groups (since AD Sync stores user memberships in au.groups)
    for (const au of syncedAdUsers) {
      if (!au || au.enabled === false) continue;
      const sam = (au.samAccountName || '').trim();
      if (!sam) continue;
      const uGroups = Array.isArray(au.groups) ? au.groups : [];
      const belongs = uGroups.some((g: any) =>
        extractGroupKeys(String(g)).some((gk) => normalizedTargets.has(gk))
      );
      if (belongs) {
        addRec(au.dn || `ad-${sam}`, sam);
      }
    }
    return Array.from(map.values());
  }

  // targetType === 'users'
  for (const u of localUsers) {
    if (
      targetSet.has((u.id || '').toLowerCase()) ||
      targetSet.has((u.username || '').toLowerCase())
    ) {
      addRec(u.id, u.username);
    }
  }
  for (const adu of subjectsResult?.categories?.adUsers || []) {
    if (
      targetSet.has((adu.rawId || '').toLowerCase()) ||
      targetSet.has((adu.id || '').toLowerCase()) ||
      targetSet.has((adu.name || '').toLowerCase()) ||
      (adu.email && targetSet.has(adu.email.toLowerCase()))
    ) {
      addRec(adu.rawId || adu.id, adu.name || adu.id);
    }
  }
  for (const au of syncedAdUsers) {
    if (!au || au.enabled === false) continue;
    const sam = (au.samAccountName || '').trim();
    if (!sam) continue;
    if (
      targetSet.has(sam.toLowerCase()) ||
      (au.dn && targetSet.has(au.dn.toLowerCase())) ||
      (au.email && targetSet.has(au.email.toLowerCase()))
    ) {
      addRec(au.dn || `ad-${sam}`, sam);
    }
  }
  return Array.from(map.values());
}

async function persistMessageAndNotifications(
  messageRecord: any,
  notificationRecords: any[],
  recipients: ResolvedRecipient[],
  channelUpdate?: {
    channelId: string;
    updatedAt: string;
    senderIds: string[];
    messageId: string;
  }
): Promise<CommsNotificationItem[]> {
  const mappedItems = notificationRecords.map(mapNotificationRow);

  // Fallback persistence (single read + single write)
  const store = loadFallbackStore();
  if (!Array.isArray(store.comms_messages)) store.comms_messages = [];
  if (!Array.isArray(store.comms_notifications)) store.comms_notifications = [];

  if (messageRecord) {
    store.comms_messages.unshift(messageRecord);
    if (store.comms_messages.length > 5000) {
      store.comms_messages = store.comms_messages.slice(0, 5000);
    }
  }

  if (notificationRecords.length > 0) {
    store.comms_notifications.unshift(...notificationRecords);
    if (store.comms_notifications.length > 10000) {
      store.comms_notifications = store.comms_notifications.slice(0, 10000);
    }
  }

  if (channelUpdate) {
    if (!Array.isArray(store.comms_channels)) store.comms_channels = [];
    if (!Array.isArray(store.comms_channel_members)) store.comms_channel_members = [];
    const chIdx = store.comms_channels.findIndex((c: any) => c.id === channelUpdate.channelId);
    if (chIdx !== -1) store.comms_channels[chIdx].updated_at = channelUpdate.updatedAt;
    const senderIdSet = new Set(channelUpdate.senderIds);
    for (const m of store.comms_channel_members) {
      if ((m.channel_id ?? m.channelId) !== channelUpdate.channelId) continue;
      if (m.is_hidden || m.isHidden) {
        m.is_hidden = false;
      }
      if (
        memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, senderIdSet)
      ) {
        m.last_read_message_id = channelUpdate.messageId;
      }
    }
  }

  saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const queries: Promise<any>[] = [];
      if (messageRecord) {
        queries.push(
          pool.query(
            `INSERT INTO comms_messages (
              id, channel_id, sender_user_id, sender_username, sender_full_name, sender_role,
              message_type, priority, title, title_en, body, body_en,
              linked_entity_type, linked_entity_id, linked_entity_name, metadata, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              messageRecord.id,
              messageRecord.channel_id,
              messageRecord.sender_user_id,
              messageRecord.sender_username,
              messageRecord.sender_full_name,
              messageRecord.sender_role,
              messageRecord.message_type,
              messageRecord.priority,
              messageRecord.title,
              messageRecord.title_en,
              messageRecord.body,
              messageRecord.body_en,
              messageRecord.linked_entity_type,
              messageRecord.linked_entity_id,
              messageRecord.linked_entity_name,
              JSON.stringify(messageRecord.metadata || {}),
              messageRecord.created_at,
            ]
          )
        );
      }

      if (notificationRecords.length > 0) {
        // Multi-row batch INSERT instead of sequential per-recipient round trips
        const colCount = 24;
        const placeholders: string[] = [];
        const params: any[] = [];
        notificationRecords.forEach((n, idx) => {
          const base = idx * colCount;
          const rowSlots = Array.from({ length: colCount }, (_, c) => `$${base + c + 1}`).join(',');
          placeholders.push(`(${rowSlots})`);
          params.push(
            n.id,
            n.recipient_user_id,
            n.recipient_username,
            n.source_message_id,
            n.channel_id,
            n.category,
            n.severity,
            n.sender_name,
            n.sender_role,
            n.title,
            n.title_en,
            n.summary,
            n.summary_en,
            n.body,
            n.body_en,
            n.linked_entity_type,
            n.linked_entity_id,
            n.linked_entity_name,
            n.action_tab,
            Boolean(n.is_read),
            Boolean(n.is_archived),
            Boolean(n.requires_acknowledgment),
            JSON.stringify(n.metadata || {}),
            n.created_at
          );
        });
        queries.push(
          pool.query(
            `INSERT INTO comms_notifications (
              id, recipient_user_id, recipient_username, source_message_id, channel_id,
              category, severity, sender_name, sender_role,
              title, title_en, summary, summary_en, body, body_en,
              linked_entity_type, linked_entity_id, linked_entity_name, action_tab,
              is_read, is_archived, requires_acknowledgment, metadata, created_at
            ) VALUES ${placeholders.join(',')}`,
            params
          )
        );
      }

      if (channelUpdate) {
        queries.push(
          pool.query(`UPDATE comms_channels SET updated_at = $1 WHERE id = $2`, [
            channelUpdate.updatedAt,
            channelUpdate.channelId,
          ])
        );
        queries.push(
          pool.query(
            `UPDATE comms_channel_members
             SET is_hidden = FALSE
             WHERE channel_id = $1 AND COALESCE(is_hidden, FALSE) = TRUE`,
            [channelUpdate.channelId]
          )
        );
        if (channelUpdate.senderIds.length > 0) {
          queries.push(
            pool.query(
              `UPDATE comms_channel_members
               SET last_read_message_id = $1, is_hidden = FALSE
               WHERE channel_id = $2
                 AND (LOWER(user_id) = ANY($3::text[]) OR LOWER(username) = ANY($3::text[]))`,
              [channelUpdate.messageId, channelUpdate.channelId, channelUpdate.senderIds]
            )
          );
        }
      }

      await Promise.all(queries);
    } catch (err: any) {
      console.error('[CommsService] PostgreSQL persistMessageAndNotifications error:', err?.message || err);
    }
  }

  // Real-time WebSocket delivery per connected recipient (parallelized non-blocking so sender gets fast HTTP response)
  if (recipients.length > 0 && mappedItems.length > 0) {
    const notifByRecipient = new Map<string, CommsNotificationItem>();
    for (const item of mappedItems) {
      notifByRecipient.set(item.recipientUsername.toLowerCase(), item);
    }
    void Promise.all(
      recipients.map(async (r) => {
        const item = notifByRecipient.get(r.username.toLowerCase());
        if (!item) return;
        const counts = await getUnreadNotificationCounts(r).catch(() => null);
        broadcastCommsEventToRecipients([r], undefined, {
          type: 'notification:created',
          notification: item,
          unreadCount: counts?.unreadCount,
          countsByFolder: counts?.countsByFolder,
        });
      })
    ).catch(() => {});
  }

  return mappedItems;
}

export async function dispatchCommunication(
  senderUser: CommsActor,
  senderIp: string,
  payload: CommsDispatchPayload
): Promise<{
  messageId: string;
  deliveredCount: number;
  notifications: CommsNotificationItem[];
}> {
  const title = (payload.title || '').trim();
  const body = (payload.body || '').trim();
  if (!title || !body) {
    throw new Error('Subject title and message body are required.');
  }

  const titleEn = (payload.titleEn || '').trim() || title;
  const bodyEn = (payload.bodyEn || '').trim() || body;
  const summary = body.length > 140 ? `${body.slice(0, 137)}...` : body;
  const summaryEn = bodyEn.length > 140 ? `${bodyEn.slice(0, 137)}...` : bodyEn;

  const recipients = await resolveTargetRecipients(payload.targetType, payload.targetIds || []);
  if (recipients.length === 0) {
    throw new Error('No active target recipients matched the selected target.');
  }

  const nowIso = new Date().toISOString();
  const messageId = makeId('msg');
  const senderDisplay = formatUserDisplay(senderUser.fullName, senderUser.username);

  const messageRecord = {
    id: messageId,
    channel_id: null,
    sender_user_id: senderUser.userId,
    sender_username: senderUser.username,
    sender_full_name: senderUser.fullName || senderUser.username,
    sender_role: senderUser.role || 'Operator',
    message_type: payload.category,
    priority: payload.severity || 'info',
    title,
    title_en: titleEn,
    body,
    body_en: bodyEn,
    linked_entity_type: payload.linkedEntityType || null,
    linked_entity_id: payload.linkedEntityId || null,
    linked_entity_name: payload.linkedEntityName || null,
    metadata: {
      targetType: payload.targetType,
      targetIds: payload.targetIds || [],
      requiresAcknowledgment: Boolean(payload.requiresAcknowledgment),
    },
    created_at: nowIso,
  };

  const notificationRecords: any[] = [];
  const activeRecipients: ResolvedRecipient[] = [];
  const emailTargets: PendingCommsEmailTarget[] = [];
  for (const rec of recipients) {
    const pref = await evaluateNotificationDeliveryForUser(
      rec,
      payload.category,
      payload.severity || 'info',
      Boolean(payload.requiresAcknowledgment)
    );
    if (pref.deliverEmailNotification) {
      emailTargets.push({
        recipient: rec,
        category: payload.category,
        severity: payload.severity || 'info',
        senderName: senderDisplay,
        senderRole: senderUser.role || 'Operator',
        title,
        titleEn,
        body,
        bodyEn,
        linkedEntityName: payload.linkedEntityName || null,
      });
    }
    if (!pref.deliverInboxNotification) continue;
    activeRecipients.push(rec);
    notificationRecords.push({
      id: makeId('notif'),
      recipient_user_id: rec.userId,
      recipient_username: rec.username,
      source_message_id: messageId,
      channel_id: null,
      category: payload.category,
      severity: payload.severity || 'info',
      sender_name: senderDisplay,
      sender_role: senderUser.role || 'Operator',
      title,
      title_en: titleEn,
      summary,
      summary_en: summaryEn,
      body,
      body_en: bodyEn,
      linked_entity_type: payload.linkedEntityType || null,
      linked_entity_id: payload.linkedEntityId || null,
      linked_entity_name: payload.linkedEntityName || null,
      action_tab: payload.actionTab || null,
      is_read: false,
      is_archived: false,
      requires_acknowledgment: Boolean(payload.requiresAcknowledgment),
      metadata: {
        sourceMessageId: messageId,
        targetType: payload.targetType,
        senderUsername: senderUser.username,
        quietHoursMuted: pref.quietHoursMuted,
        playSound: pref.playSound,
      },
      created_at: nowIso,
    });
  }

  const notifications = await persistMessageAndNotifications(
    messageRecord,
    notificationRecords,
    activeRecipients
  );

  if (emailTargets.length > 0) {
    void dispatchCommsEmailsAsync(emailTargets);
  }

  await addPortalAuditLog({
    category: 'communications',
    action:
      payload.category === 'announcement' ? 'ANNOUNCEMENT_DISPATCHED' : 'MESSAGE_DISPATCHED',
    title: `ارسال ${payload.category === 'announcement' ? 'اطلاعیه' : 'پیام'}: ${title}`,
    title_en: `${payload.category === 'announcement' ? 'Announcement' : 'Message'} Dispatched: ${titleEn}`,
    actor: {
      username: senderUser.username,
      role: senderUser.role || 'Operator',
      ipAddress: senderIp || '127.0.0.1',
    },
    target: {
      type: 'communications',
      id: messageId,
      name: `${recipients.length} recipients`,
    },
    severity: payload.severity || 'info',
    status: 'success',
    details: `پیام "${title}" برای ${recipients.length} گیرنده ارسال شد.`,
    details_en: `Dispatched "${titleEn}" to ${recipients.length} recipient(s).`,
  }).catch(() => {});

  return {
    messageId,
    deliveredCount: notifications.length,
    notifications,
  };
}

/**
 * Emit a genuine system/security/operational notification from real server events.
 * Zero simulated or dummy data.
 */
export async function emitSystemNotification(params: {
  category?: CommsCategory;
  severity: CommsSeverity;
  senderName?: string;
  senderRole?: string;
  title: string;
  titleEn: string;
  body: string;
  bodyEn: string;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  linkedEntityName?: string | null;
  actionTab?: string | null;
  requiresAcknowledgment?: boolean;
  recipients?: ResolvedRecipient[];
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    let recipients = params.recipients || [];
    if (recipients.length === 0) {
      // Resolve real Super Administrators / Admin Policy holders from DB
      const allUsers = (await getAllUsers()).filter((u) => u && u.status !== 'disabled');
      const policies = await getAccessPolicies();
      const adminPolicy = policies.find((p: any) => p.id === 'policy-super-admin');
      const adminSubjects = new Set<string>(
        [adminPolicy?.subjectId, ...(Array.isArray(adminPolicy?.subjectIds) ? adminPolicy.subjectIds : [])]
          .filter(Boolean)
          .map((s: string) => s.toLowerCase())
      );

      const adminUsers = allUsers.filter((u) => {
        const uname = (u.username || '').toLowerCase();
        const role = (u.role || '').toLowerCase();
        return (
          uname === 'admin' ||
          role.includes('super admin') ||
          role.includes('administrator') ||
          adminSubjects.has(uname) ||
          adminSubjects.has((u.id || '').toLowerCase())
        );
      });

      const resolvedSource = adminUsers.length > 0 ? adminUsers : allUsers.slice(0, 5);
      recipients = resolvedSource.map((u) => ({ userId: u.id, username: u.username }));
    }

    if (recipients.length === 0) return;

    const nowIso = new Date().toISOString();
    const summary = params.body.length > 140 ? `${params.body.slice(0, 137)}...` : params.body;
    const summaryEn =
      params.bodyEn.length > 140 ? `${params.bodyEn.slice(0, 137)}...` : params.bodyEn;

    const notificationRecords: any[] = [];
    const activeRecipients: ResolvedRecipient[] = [];
    const emailTargets: PendingCommsEmailTarget[] = [];
    const resolvedCat = params.category || 'system_alert';
    const resolvedSev = params.severity || 'warning';
    const reqAck = Boolean(params.requiresAcknowledgment);

    for (const rec of recipients) {
      const pref = await evaluateNotificationDeliveryForUser(rec, resolvedCat, resolvedSev, reqAck);
      if (pref.deliverEmailNotification) {
        emailTargets.push({
          recipient: rec,
          category: resolvedCat,
          severity: resolvedSev,
          senderName: params.senderName || 'System Monitor',
          senderRole: params.senderRole || 'System Engine',
          title: params.title,
          titleEn: params.titleEn,
          body: params.body,
          bodyEn: params.bodyEn,
          linkedEntityName: params.linkedEntityName || null,
        });
      }
      if (!pref.deliverInboxNotification) continue;
      activeRecipients.push(rec);
      notificationRecords.push({
        id: makeId('notif'),
        recipient_user_id: rec.userId,
        recipient_username: rec.username,
        source_message_id: null,
        channel_id: null,
        category: resolvedCat,
        severity: resolvedSev,
        sender_name: params.senderName || 'System Monitor',
        sender_role: params.senderRole || 'System Engine',
        title: params.title,
        title_en: params.titleEn,
        summary,
        summary_en: summaryEn,
        body: params.body,
        body_en: params.bodyEn,
        linked_entity_type: params.linkedEntityType || null,
        linked_entity_id: params.linkedEntityId || null,
        linked_entity_name: params.linkedEntityName || null,
        action_tab: params.actionTab || null,
        is_read: false,
        is_archived: false,
        requires_acknowledgment: reqAck,
        metadata: {
          ...(params.metadata || {}),
          quietHoursMuted: pref.quietHoursMuted,
          playSound: pref.playSound,
        },
        created_at: nowIso,
      });
    }

    if (notificationRecords.length > 0) {
      await persistMessageAndNotifications(null, notificationRecords, activeRecipients);
    }

    if (emailTargets.length > 0) {
      void dispatchCommsEmailsAsync(emailTargets);
    }
  } catch (err: any) {
    console.warn('[CommsService] emitSystemNotification notice:', err?.message || err);
  }
}

function resolveActionTabFromAudit(auditRecord: any): string | null {
  const cat = (auditRecord?.category || '').toLowerCase();
  const targetType = (auditRecord?.target_type || '').toLowerCase();
  if (cat === 'licenses' || targetType === 'license') return 'licenses';
  if (cat === 'contracts' || targetType === 'contract') return 'contracts';
  if (cat === 'servers' || targetType === 'server') return 'servers';
  if (cat === 'device_mgmt' || targetType === 'device') return 'devices';
  if (cat === 'rbac' || cat === 'settings' || cat === 'system_auth') return 'settings';
  return 'logs';
}

// Register initial sync provider and authentic critical/warning audit alert listener
export function initCommsIntegration(): void {
  registerCommsSyncProvider(getUnreadNotificationCounts);

  registerCommsAuditAlertHook(async (auditRecord: any) => {
    if (!auditRecord || auditRecord.category === 'communications') return;
    const sev = (auditRecord.severity || '').toLowerCase();
    const status = (auditRecord.status || '').toLowerCase();
    if (sev !== 'critical' && sev !== 'warning' && sev !== 'warn' && status !== 'failed') return;

    const category: CommsCategory =
      auditRecord.category === 'system_auth' || auditRecord.category === 'security_rbac' || auditRecord.category === 'rbac'
        ? 'security_2fa'
        : 'system_alert';

    await emitSystemNotification({
      category,
      severity: sev === 'critical' || status === 'failed' ? 'critical' : 'warning',
      senderName: auditRecord.user_name || 'System Audit',
      senderRole: auditRecord.user_role || 'Security & Audit Engine',
      title: auditRecord.title || auditRecord.action || 'هشدار سیستمی',
      titleEn: auditRecord.title_en || auditRecord.title || auditRecord.action || 'System Alert',
      body:
        auditRecord.details ||
        auditRecord.title ||
        `رویداد ${auditRecord.action} توسط ${auditRecord.user_name}`,
      bodyEn:
        auditRecord.details_en ||
        auditRecord.title_en ||
        `Event ${auditRecord.action} triggered by ${auditRecord.user_name}`,
      linkedEntityType: auditRecord.target_type || null,
      linkedEntityId: auditRecord.target_id || null,
      linkedEntityName: auditRecord.target_name || null,
      actionTab: resolveActionTabFromAudit(auditRecord),
      metadata: {
        auditLogId: auditRecord.id,
        auditCategory: auditRecord.category,
        clientIp: auditRecord.client_ip,
      },
    });
  });
}

// ==============================================================================
// Phase 2: Two-Way Direct Chats, Team Group Channels & Announcement Read Tracker
// ==============================================================================

type DirectoryUserEntry = { userId: string; username: string; fullName: string; role: string };

const DIRECTORY_CACHE_TTL_MS = 15_000;
let directoryCache: { expiresAt: number; map: Map<string, DirectoryUserEntry> } | null = null;
let directoryInFlight: Promise<Map<string, DirectoryUserEntry>> | null = null;

export function invalidateCommsDirectoryCache(): void {
  directoryCache = null;
}

async function buildDirectoryUserMap(
  forceRefresh = false
): Promise<Map<string, DirectoryUserEntry>> {
  if (!forceRefresh && directoryCache && Date.now() < directoryCache.expiresAt) {
    return directoryCache.map;
  }
  if (!forceRefresh && directoryInFlight) {
    return directoryInFlight;
  }

  directoryInFlight = (async () => {
    const map = new Map<string, DirectoryUserEntry>();
    const register = (id: string, username: string, fullName: string, role: string, email?: string) => {
      const info: DirectoryUserEntry = {
        userId: id,
        username,
        fullName: fullName || username,
        role: role || 'Operator',
      };
      for (const key of resolveUserIdentifiers({ userId: id, username })) {
        if (!map.has(key)) map.set(key, info);
      }
      if (email) {
        for (const key of resolveUserIdentifiers({ username: email })) {
          if (!map.has(key)) map.set(key, info);
        }
      }
    };

    const [allUsersRes, subjectsResult, adConfig] = await Promise.all([
      getAllUsers().catch(() => []),
      getAuthorizedMapSubjects().catch(() => null),
      getActiveDirectoryConfig().catch(() => null),
    ]);

    const localUsers = (allUsersRes || []).filter((u) => u && u.status !== 'disabled');
    for (const u of localUsers) {
      register(
        u.id,
        u.username,
        stripDuplicateUsernameSuffix(u.fullName || u.username, u.username),
        u.role || 'Operator',
        u.email
      );
    }

    for (const adu of subjectsResult?.categories?.adUsers || []) {
      const adUname = adu.name || adu.id;
      register(
        adu.rawId || adu.id,
        adUname,
        stripDuplicateUsernameSuffix(adu.displayName || adUname, adUname),
        adu.role || 'AD User',
        adu.email
      );
    }

    const syncedAdUsers: any[] = Array.isArray(adConfig?.syncedUsers) ? adConfig.syncedUsers : [];
    for (const au of syncedAdUsers) {
      if (!au || au.enabled === false) continue;
      const adUname = (au.samAccountName || au.email || au.dn || '').trim();
      if (!adUname) continue;
      register(
        au.dn || `ad-${adUname}`,
        adUname,
        stripDuplicateUsernameSuffix(au.displayName || adUname, adUname),
        au.title || 'AD User',
        au.email
      );
    }

    directoryCache = { expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS, map };
    return map;
  })();

  try {
    return await directoryInFlight;
  } finally {
    directoryInFlight = null;
  }
}

async function resolveSingleUser(
  identifier: string
): Promise<{ userId: string; username: string; fullName: string; role: string } | null> {
  const clean = (identifier || '').trim().toLowerCase();
  if (!clean) return null;
  const dir = await buildDirectoryUserMap();
  if (dir.has(clean)) return dir.get(clean)!;
  if (clean.includes('@') && dir.has(clean.split('@')[0])) {
    return dir.get(clean.split('@')[0])!;
  }
  if (clean.includes('\\') && dir.has(clean.split('\\')[1])) {
    return dir.get(clean.split('\\')[1])!;
  }
  return null;
}

function mapChannelMemberRow(
  row: any,
  dirMap?: Map<string, { userId: string; username: string; fullName: string; role: string }>
): CommsChannelMember {
  const userId = row.user_id ?? row.userId ?? '';
  const username = row.username ?? '';
  const dirInfo =
    dirMap?.get(username.toLowerCase()) || dirMap?.get(userId.toLowerCase()) || undefined;
  return {
    channelId: row.channel_id ?? row.channelId ?? '',
    userId,
    username,
    fullName: stripDuplicateUsernameSuffix(
      row.full_name ?? row.fullName ?? dirInfo?.fullName ?? username,
      username
    ),
    role: row.role ?? 'member',
    isMuted: Boolean(row.is_muted ?? row.isMuted),
    lastReadMessageId: row.last_read_message_id ?? row.lastReadMessageId ?? null,
    joinedAt: row.joined_at
      ? new Date(row.joined_at).toISOString()
      : row.joinedAt || new Date().toISOString(),
  };
}

function mapMessageRow(row: any, lookupById?: Map<string, any>): CommsMessage {
  const meta =
    typeof row.metadata === 'string'
      ? (() => {
          try {
            return JSON.parse(row.metadata);
          } catch {
            return {};
          }
        })()
      : row.metadata || {};

  const replyToId: string | null = meta.replyToMessageId || row.replyToMessageId || null;
  let replyToPreview: CommsMessage['replyToPreview'] = null;
  if (replyToId && lookupById?.has(replyToId)) {
    const parent = lookupById.get(replyToId);
    const parentBody = parent.body || '';
    replyToPreview = {
      id: parent.id,
      senderName: parent.sender_full_name || parent.sender_username || 'User',
      body: parentBody.length > 100 ? `${parentBody.slice(0, 97)}...` : parentBody,
    };
  }

  return {
    id: row.id,
    channelId: row.channel_id ?? row.channelId ?? null,
    senderUserId: row.sender_user_id ?? row.senderUserId ?? '',
    senderUsername: row.sender_username ?? row.senderUsername ?? '',
    senderFullName:
      stripDuplicateUsernameSuffix(
        row.sender_full_name ?? row.senderFullName,
        row.sender_username ?? row.senderUsername
      ) || null,
    senderRole: row.sender_role ?? row.senderRole ?? null,
    messageType: row.message_type ?? row.messageType ?? 'text',
    priority: (row.priority || 'info') as CommsSeverity,
    title: row.title || '',
    titleEn: row.title_en ?? row.titleEn ?? null,
    body: row.body || '',
    bodyEn: row.body_en ?? row.bodyEn ?? null,
    replyToMessageId: replyToId,
    replyToPreview,
    linkedEntityType: row.linked_entity_type ?? row.linkedEntityType ?? null,
    linkedEntityId: row.linked_entity_id ?? row.linkedEntityId ?? null,
    linkedEntityName: row.linked_entity_name ?? row.linkedEntityName ?? null,
    metadata: meta,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : row.createdAt || new Date().toISOString(),
  };
}

function memberMatchesIdentifiers(member: { userId?: string; username?: string }, idSet: Set<string>): boolean {
  const uIds = resolveUserIdentifiers({ userId: member.userId, username: member.username });
  return uIds.some((id) => idSet.has(id));
}

function assembleHydratedChannel(
  rawChannel: any,
  rawMembers: any[],
  latestMsg: any | null,
  unreadCount: number,
  idSet: Set<string>,
  resolvedDir: Map<string, DirectoryUserEntry>
): CommsChannel {
  const members = rawMembers.map((m) => mapChannelMemberRow(m, resolvedDir));
  const viewerMembership = members.find((m) => memberMatchesIdentifiers(m, idSet));
  const rawViewerMember = rawMembers.find((m) =>
    memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)
  );
  const viewerClearedAtRaw = rawViewerMember?.cleared_at ?? rawViewerMember?.clearedAt ?? null;
  const viewerClearedAtMs = viewerClearedAtRaw ? new Date(viewerClearedAtRaw).getTime() : 0;
  const latestMsgMs = latestMsg
    ? new Date(latestMsg.created_at ?? latestMsg.createdAt ?? 0).getTime()
    : 0;
  const visibleLatestMsg =
    latestMsg && (!viewerClearedAtMs || latestMsgMs > viewerClearedAtMs) ? latestMsg : null;

  const channelType = (rawChannel.channel_type ?? rawChannel.channelType ?? 'group') as CommsChannelType;

  let displayName = rawChannel.name || '';
  let displayNameEn = rawChannel.name_en ?? rawChannel.nameEn ?? rawChannel.name ?? '';

  if (channelType === 'direct' && members.length > 0) {
    const peer = members.find((m) => !memberMatchesIdentifiers(m, idSet)) || members[0];
    if (peer) {
      displayName = formatUserDisplay(peer.fullName, peer.username);
      displayNameEn = displayName;
    }
  }

  const lastBody = visibleLatestMsg?.body || null;
  const lastMessagePreview =
    lastBody && lastBody.length > 90 ? `${lastBody.slice(0, 87)}...` : lastBody;

  return {
    id: rawChannel.id,
    channelType,
    name: displayName,
    nameEn: displayNameEn,
    description: rawChannel.description ?? null,
    descriptionEn: rawChannel.description_en ?? rawChannel.descriptionEn ?? null,
    linkedGroupId: rawChannel.linked_group_id ?? rawChannel.linkedGroupId ?? null,
    isPinned: Boolean(rawChannel.is_pinned ?? rawChannel.isPinned),
    isMuted: viewerMembership?.isMuted || false,
    createdByUserId: rawChannel.created_by_user_id ?? rawChannel.createdByUserId ?? null,
    memberCount: members.length,
    unreadCount,
    lastMessagePreview,
    lastMessageAt: visibleLatestMsg?.created_at
      ? new Date(visibleLatestMsg.created_at).toISOString()
      : visibleLatestMsg?.createdAt || null,
    members,
    createdAt: rawChannel.created_at
      ? new Date(rawChannel.created_at).toISOString()
      : rawChannel.createdAt || new Date().toISOString(),
    updatedAt: rawChannel.updated_at
      ? new Date(rawChannel.updated_at).toISOString()
      : rawChannel.updatedAt || new Date().toISOString(),
  };
}

async function loadHydratedChannelForUser(
  channelId: string,
  viewerUser: Partial<CommsActor>,
  dirMap?: Map<string, DirectoryUserEntry>
): Promise<CommsChannel | null> {
  const idList = resolveUserIdentifiers(viewerUser);
  const idSet = new Set(idList);

  const [resolvedDir] = await Promise.all([
    dirMap ? Promise.resolve(dirMap) : buildDirectoryUserMap(),
    ensurePostgresConnection(),
  ]);

  let rawChannel: any = null;
  let rawMembers: any[] = [];
  let latestMsg: any = null;
  let unreadCount = 0;

  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const chRes = await pool.query(`SELECT * FROM comms_channels WHERE id = $1`, [channelId]);
      if (chRes.rows[0]) {
        rawChannel = chRes.rows[0];
        const [mRes, msgRes, uRes] = await Promise.all([
          pool.query(
            `SELECT * FROM comms_channel_members WHERE channel_id = $1 ORDER BY joined_at ASC`,
            [channelId]
          ),
          pool.query(
            `SELECT body, created_at FROM comms_messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [channelId]
          ),
          idList.length > 0
            ? pool.query(
                `SELECT COUNT(*)::int AS cnt FROM comms_notifications
                 WHERE channel_id = $1 AND is_archived = FALSE AND is_read = FALSE
                   AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
                [channelId, idList]
              )
            : Promise.resolve({ rows: [{ cnt: 0 }] }),
        ]);
        rawMembers = mRes.rows;
        latestMsg = msgRes.rows[0] || null;
        unreadCount = uRes.rows[0]?.cnt || 0;
      }
    } catch (err: any) {
      console.error('[CommsService] loadHydratedChannel PG error:', err?.message || err);
    }
  }

  if (!rawChannel) {
    const store = loadFallbackStore();
    rawChannel = (store.comms_channels || []).find((c: any) => c.id === channelId) || null;
    if (!rawChannel) return null;
    rawMembers = (store.comms_channel_members || []).filter(
      (m: any) => (m.channel_id ?? m.channelId) === channelId
    );
    const chMsgs = (store.comms_messages || [])
      .filter((m: any) => (m.channel_id ?? m.channelId) === channelId)
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at || b.createdAt).getTime() -
          new Date(a.created_at || a.createdAt).getTime()
      );
    latestMsg = chMsgs[0] || null;
    unreadCount = (store.comms_notifications || []).filter(
      (n: any) =>
        (n.channel_id ?? n.channelId) === channelId &&
        !(n.is_archived ?? n.isArchived) &&
        !(n.is_read ?? n.isRead) &&
        (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
          idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
    ).length;
  }

  return assembleHydratedChannel(rawChannel, rawMembers, latestMsg, unreadCount, idSet, resolvedDir);
}

export async function listUserChannels(user: Partial<CommsActor>): Promise<CommsChannel[]> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0) return [];
  const idSet = new Set(identifiers);

  const [dirMap] = await Promise.all([
    buildDirectoryUserMap(),
    ensurePostgresConnection(),
  ]);

  const channelIds = new Set<string>();
  const pool = getPgPool();
  const pgActive = isPostgresConnected() && Boolean(pool);
  let pgMembershipLoaded = false;

  if (pgActive && pool) {
    try {
      const res = await pool.query(
        `SELECT DISTINCT channel_id FROM comms_channel_members
         WHERE COALESCE(is_hidden, FALSE) = FALSE
           AND (LOWER(user_id) = ANY($1::text[]) OR LOWER(username) = ANY($1::text[]))`,
        [identifiers]
      );
      for (const r of res.rows) {
        if (r.channel_id) channelIds.add(r.channel_id);
      }
      pgMembershipLoaded = true;
    } catch (err: any) {
      console.error('[CommsService] listUserChannels PG error:', err?.message || err);
    }
  }

  let fallbackStoreCache: any = null;
  if (!pgMembershipLoaded) {
    fallbackStoreCache = loadFallbackStore();
    for (const m of fallbackStoreCache.comms_channel_members || []) {
      if (m.is_hidden ?? m.isHidden) continue;
      if (memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)) {
        const cid = m.channel_id ?? m.channelId;
        if (cid) channelIds.add(cid);
      }
    }
  }

  const idArray = Array.from(channelIds);
  if (idArray.length === 0) return [];

  // Batch PG queries in parallel instead of O(N) sequential per-channel round-trips
  const pgChannelsMap = new Map<string, any>();
  const pgMembersMap = new Map<string, any[]>();
  const pgLatestMsgMap = new Map<string, any>();
  const pgUnreadMap = new Map<string, number>();

  if (pgActive && pool) {
    try {
      const [chRes, memRes, msgRes, unreadRes] = await Promise.all([
        pool.query(`SELECT * FROM comms_channels WHERE id = ANY($1::text[])`, [idArray]),
        pool.query(
          `SELECT * FROM comms_channel_members WHERE channel_id = ANY($1::text[]) ORDER BY joined_at ASC`,
          [idArray]
        ),
        pool.query(
          `SELECT DISTINCT ON (channel_id) channel_id, body, created_at
           FROM comms_messages
           WHERE channel_id = ANY($1::text[])
           ORDER BY channel_id, created_at DESC`,
          [idArray]
        ),
        pool.query(
          `SELECT channel_id, COUNT(*)::int AS cnt
           FROM comms_notifications
           WHERE channel_id = ANY($1::text[])
             AND is_archived = FALSE AND is_read = FALSE
             AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))
           GROUP BY channel_id`,
          [idArray, identifiers]
        ),
      ]);

      for (const row of chRes.rows) pgChannelsMap.set(row.id, row);
      for (const row of memRes.rows) {
        const list = pgMembersMap.get(row.channel_id) || [];
        list.push(row);
        pgMembersMap.set(row.channel_id, list);
      }
      for (const row of msgRes.rows) pgLatestMsgMap.set(row.channel_id, row);
      for (const row of unreadRes.rows) pgUnreadMap.set(row.channel_id, row.cnt || 0);
    } catch (err: any) {
      console.error('[CommsService] listUserChannels batch PG error:', err?.message || err);
    }
  }

  // Single-pass index over fallback store ONLY for any channels missing from PG
  const missingIds = new Set(idArray.filter((cid) => !pgChannelsMap.has(cid)));
  const fbChannelsMap = new Map<string, any>();
  const fbMembersMap = new Map<string, any[]>();
  const fbLatestMsgMap = new Map<string, any>();
  const fbUnreadMap = new Map<string, number>();

  if (missingIds.size > 0) {
    const store = fallbackStoreCache || loadFallbackStore();
    for (const c of store.comms_channels || []) {
      if (missingIds.has(c.id)) fbChannelsMap.set(c.id, c);
    }
    for (const m of store.comms_channel_members || []) {
      const cid = m.channel_id ?? m.channelId;
      if (!missingIds.has(cid)) continue;
      const list = fbMembersMap.get(cid) || [];
      list.push(m);
      fbMembersMap.set(cid, list);
    }
    for (const msg of store.comms_messages || []) {
      const cid = msg.channel_id ?? msg.channelId;
      if (!missingIds.has(cid)) continue;
      const existing = fbLatestMsgMap.get(cid);
      if (
        !existing ||
        new Date(msg.created_at || msg.createdAt).getTime() >
          new Date(existing.created_at || existing.createdAt).getTime()
      ) {
        fbLatestMsgMap.set(cid, msg);
      }
    }
    for (const n of store.comms_notifications || []) {
      const cid = n.channel_id ?? n.channelId;
      if (!missingIds.has(cid)) continue;
      if (n.is_archived ?? n.isArchived) continue;
      if (n.is_read ?? n.isRead) continue;
      if (
        idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
        idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase())
      ) {
        fbUnreadMap.set(cid, (fbUnreadMap.get(cid) || 0) + 1);
      }
    }
  }

  const channels: CommsChannel[] = [];
  for (const cid of idArray) {
    if (pgChannelsMap.has(cid)) {
      channels.push(
        assembleHydratedChannel(
          pgChannelsMap.get(cid),
          pgMembersMap.get(cid) || [],
          pgLatestMsgMap.get(cid) || null,
          pgUnreadMap.get(cid) || 0,
          idSet,
          dirMap
        )
      );
    } else if (fbChannelsMap.has(cid)) {
      channels.push(
        assembleHydratedChannel(
          fbChannelsMap.get(cid),
          fbMembersMap.get(cid) || [],
          fbLatestMsgMap.get(cid) || null,
          fbUnreadMap.get(cid) || 0,
          idSet,
          dirMap
        )
      );
    }
  }

  channels.sort((a, b) => {
    const tA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime();
    const tB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime();
    return tB - tA;
  });

  return channels;
}

export async function createOrOpenDirectChannel(
  senderUser: CommsActor,
  targetIdentifier: string
): Promise<{ channel: CommsChannel; created: boolean }> {
  const target = await resolveSingleUser(targetIdentifier);
  if (!target) {
    throw new Error('Target user not found or disabled.');
  }

  const senderIdSet = new Set(resolveUserIdentifiers(senderUser));
  if (memberMatchesIdentifiers(target, senderIdSet)) {
    throw new Error('Cannot start a direct chat with yourself.');
  }

  // Search existing 1:1 direct channels between sender and target (including previously hidden DMs)
  const senderIds = resolveUserIdentifiers(senderUser);
  const targetIds = resolveUserIdentifiers(target);
  const targetIdSet = new Set(targetIds);
  let existingChannelId: string | null = null;

  await ensurePostgresConnection();
  const poolDirect = getPgPool();
  if (isPostgresConnected() && poolDirect) {
    try {
      const res = await poolDirect.query(
        `SELECT c.id
         FROM comms_channels c
         WHERE c.channel_type = 'direct'
           AND EXISTS (
             SELECT 1 FROM comms_channel_members m1
             WHERE m1.channel_id = c.id
               AND (LOWER(m1.user_id) = ANY($1::text[]) OR LOWER(m1.username) = ANY($1::text[]))
           )
           AND EXISTS (
             SELECT 1 FROM comms_channel_members m2
             WHERE m2.channel_id = c.id
               AND (LOWER(m2.user_id) = ANY($2::text[]) OR LOWER(m2.username) = ANY($2::text[]))
           )
         LIMIT 1`,
        [senderIds, targetIds]
      );
      if (res.rows[0]?.id) existingChannelId = res.rows[0].id;
    } catch {}
  }

  if (!existingChannelId) {
    const fbStore = loadFallbackStore();
    const membersByChannel = new Map<string, any[]>();
    for (const m of fbStore.comms_channel_members || []) {
      const cid = m.channel_id ?? m.channelId;
      if (!cid) continue;
      const list = membersByChannel.get(cid) || [];
      list.push(m);
      membersByChannel.set(cid, list);
    }
    const found = (fbStore.comms_channels || []).find((c: any) => {
      if ((c.channel_type ?? c.channelType) !== 'direct') return false;
      const mems = membersByChannel.get(c.id) || [];
      return (
        mems.length === 2 &&
        mems.some((m) => memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, senderIdSet)) &&
        mems.some((m) => memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, targetIdSet))
      );
    });
    if (found) existingChannelId = found.id;
  }

  if (existingChannelId) {
    // Un-hide caller membership if they previously deleted/hid the DM
    const fbStore = loadFallbackStore();
    let fbModified = false;
    for (const m of fbStore.comms_channel_members || []) {
      if (
        (m.channel_id ?? m.channelId) === existingChannelId &&
        memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, senderIdSet) &&
        (m.is_hidden || m.isHidden)
      ) {
        m.is_hidden = false;
        fbModified = true;
      }
    }
    if (fbModified) saveFallbackStore(fbStore);

    if (isPostgresConnected() && poolDirect) {
      await poolDirect
        .query(
          `UPDATE comms_channel_members
           SET is_hidden = FALSE
           WHERE channel_id = $1 AND COALESCE(is_hidden, FALSE) = TRUE
             AND (LOWER(user_id) = ANY($2::text[]) OR LOWER(username) = ANY($2::text[]))`,
          [existingChannelId, senderIds]
        )
        .catch(() => {});
    }

    const hydratedExisting = await loadHydratedChannelForUser(existingChannelId, senderUser);
    if (hydratedExisting) {
      if (fbModified) {
        broadcastCommsEventToUser(senderUser, {
          type: 'channel:created',
          channel: hydratedExisting,
        });
      }
      return { channel: hydratedExisting, created: false };
    }
  }

  const nowIso = new Date().toISOString();
  const channelId = makeId('chan');
  const senderDisplay = formatUserDisplay(senderUser.fullName, senderUser.username);
  const targetDisplay = formatUserDisplay(target.fullName, target.username);

  const channelRec = {
    id: channelId,
    channel_type: 'direct',
    name: `${senderDisplay} ↔ ${targetDisplay}`,
    name_en: `${senderDisplay} ↔ ${targetDisplay}`,
    description: null,
    description_en: null,
    linked_group_id: null,
    is_pinned: false,
    created_by_user_id: senderUser.userId,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const memberRecs = [
    {
      channel_id: channelId,
      user_id: senderUser.userId,
      username: senderUser.username,
      role: 'member',
      is_muted: false,
      last_read_message_id: null,
      joined_at: nowIso,
    },
    {
      channel_id: channelId,
      user_id: target.userId,
      username: target.username,
      role: 'member',
      is_muted: false,
      last_read_message_id: null,
      joined_at: nowIso,
    },
  ];

  // Fallback persistence
  const store = loadFallbackStore();
  if (!Array.isArray(store.comms_channels)) store.comms_channels = [];
  if (!Array.isArray(store.comms_channel_members)) store.comms_channel_members = [];
  store.comms_channels.unshift(channelRec);
  store.comms_channel_members.push(...memberRecs);
  saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `INSERT INTO comms_channels (id, channel_type, name, name_en, description, description_en, linked_group_id, is_pinned, created_by_user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          channelRec.id,
          channelRec.channel_type,
          channelRec.name,
          channelRec.name_en,
          null,
          null,
          null,
          false,
          channelRec.created_by_user_id,
          channelRec.created_at,
          channelRec.updated_at,
        ]
      );
      for (const m of memberRecs) {
        await pool.query(
          `INSERT INTO comms_channel_members (channel_id, user_id, username, role, is_muted, last_read_message_id, joined_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (channel_id, user_id) DO NOTHING`,
          [m.channel_id, m.user_id, m.username, m.role, false, null, m.joined_at]
        );
      }
    } catch (err: any) {
      console.error('[CommsService] createOrOpenDirectChannel PG error:', err?.message || err);
    }
  }

  const hydratedForSender = await loadHydratedChannelForUser(channelId, senderUser);
  const hydratedForTarget = await loadHydratedChannelForUser(channelId, {
    userId: target.userId,
    username: target.username,
  });

  if (hydratedForSender) {
    broadcastCommsEventToUser(senderUser, {
      type: 'channel:created',
      channel: hydratedForSender,
    });
  }
  if (hydratedForTarget) {
    broadcastCommsEventToUser(
      { userId: target.userId, username: target.username },
      {
        type: 'channel:created',
        channel: hydratedForTarget,
      }
    );
  }

  return {
    channel: hydratedForSender!,
    created: true,
  };
}

export async function createGroupChannel(
  creatorUser: CommsActor,
  senderIp: string,
  payload: {
    name: string;
    nameEn?: string;
    description?: string;
    descriptionEn?: string;
    linkedGroupId?: string | null;
    memberIds?: string[];
  }
): Promise<CommsChannel> {
  const cleanName = (payload.name || '').trim();
  if (!cleanName) {
    throw new Error('Channel name is required.');
  }
  const cleanNameEn = (payload.nameEn || '').trim() || cleanName;
  const nowIso = new Date().toISOString();
  const channelId = makeId('chan');

  const memberMap = new Map<string, { userId: string; username: string; role: string }>();
  memberMap.set(creatorUser.username.toLowerCase(), {
    userId: creatorUser.userId,
    username: creatorUser.username,
    role: 'owner',
  });

  if (Array.isArray(payload.memberIds) && payload.memberIds.length > 0) {
    const resolved = await resolveTargetRecipients('users', payload.memberIds);
    for (const r of resolved) {
      const k = r.username.toLowerCase();
      if (!memberMap.has(k)) {
        memberMap.set(k, { userId: r.userId, username: r.username, role: 'member' });
      }
    }
  }

  if (payload.linkedGroupId) {
    const groupMembers = await resolveTargetRecipients('group', [payload.linkedGroupId]);
    for (const r of groupMembers) {
      const k = r.username.toLowerCase();
      if (!memberMap.has(k)) {
        memberMap.set(k, { userId: r.userId, username: r.username, role: 'member' });
      }
    }
  }

  const channelRec = {
    id: channelId,
    channel_type: 'group',
    name: cleanName,
    name_en: cleanNameEn,
    description: (payload.description || '').trim() || null,
    description_en: (payload.descriptionEn || payload.description || '').trim() || null,
    linked_group_id: payload.linkedGroupId || null,
    is_pinned: false,
    created_by_user_id: creatorUser.userId,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const memberRecs = Array.from(memberMap.values()).map((m) => ({
    channel_id: channelId,
    user_id: m.userId,
    username: m.username,
    role: m.role,
    is_muted: false,
    last_read_message_id: null,
    joined_at: nowIso,
  }));

  const store = loadFallbackStore();
  if (!Array.isArray(store.comms_channels)) store.comms_channels = [];
  if (!Array.isArray(store.comms_channel_members)) store.comms_channel_members = [];
  store.comms_channels.unshift(channelRec);
  store.comms_channel_members.push(...memberRecs);
  saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `INSERT INTO comms_channels (id, channel_type, name, name_en, description, description_en, linked_group_id, is_pinned, created_by_user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          channelRec.id,
          channelRec.channel_type,
          channelRec.name,
          channelRec.name_en,
          channelRec.description,
          channelRec.description_en,
          channelRec.linked_group_id,
          false,
          channelRec.created_by_user_id,
          channelRec.created_at,
          channelRec.updated_at,
        ]
      );
      for (const m of memberRecs) {
        await pool.query(
          `INSERT INTO comms_channel_members (channel_id, user_id, username, role, is_muted, last_read_message_id, joined_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (channel_id, user_id) DO NOTHING`,
          [m.channel_id, m.user_id, m.username, m.role, false, null, m.joined_at]
        );
      }
    } catch (err: any) {
      console.error('[CommsService] createGroupChannel PG error:', err?.message || err);
    }
  }

  const channel = (await loadHydratedChannelForUser(channelId, creatorUser))!;
  broadcastCommsEventToRecipients(
    memberRecs.map((m) => ({ userId: m.user_id, username: m.username })),
    undefined,
    { type: 'channel:created', channel }
  );

  await addPortalAuditLog({
    category: 'communications',
    action: 'CHANNEL_CREATED',
    title: `ایجاد کانال گروهی: ${cleanName}`,
    title_en: `Group Channel Created: ${cleanNameEn}`,
    actor: {
      username: creatorUser.username,
      role: creatorUser.role || 'Operator',
      ipAddress: senderIp || '127.0.0.1',
    },
    target: {
      type: 'comms_channel',
      id: channelId,
      name: cleanNameEn,
    },
    severity: 'info',
    status: 'success',
    details: `کانال گروهی «${cleanName}» با ${memberRecs.length} عضو ایجاد شد.`,
    details_en: `Created team group channel "${cleanNameEn}" with ${memberRecs.length} member(s).`,
  }).catch(() => {});

  return channel;
}

export async function addChannelMembers(
  actor: CommsActor,
  isSuperAdmin: boolean,
  channelId: string,
  memberIds: string[],
  canAddMembersPolicy = false
): Promise<CommsChannel> {
  const existing = await loadHydratedChannelForUser(channelId, actor);
  if (!existing) {
    throw new Error('Channel not found.');
  }
  if (existing.channelType !== 'group') {
    throw new Error('Members can only be added to team group channels.');
  }

  const actorIds = new Set(resolveUserIdentifiers(actor));
  const actorMember = (existing.members || []).find((m) => memberMatchesIdentifiers(m, actorIds));
  const isOwner = actorMember?.role === 'owner' || existing.createdByUserId === actor.userId;
  if (!isSuperAdmin && !isOwner && !(actorMember && canAddMembersPolicy)) {
    throw new Error('ACCESS_DENIED: Only channel owner, authorized members, or Super Admin can add members.');
  }

  const resolved = await resolveTargetRecipients('users', memberIds);
  if (resolved.length === 0) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const existingSet = new Set((existing.members || []).map((m) => m.username.toLowerCase()));
  const toInsert = resolved.filter((r) => !existingSet.has(r.username.toLowerCase()));

  if (toInsert.length > 0) {
    const store = loadFallbackStore();
    if (!Array.isArray(store.comms_channel_members)) store.comms_channel_members = [];
    for (const r of toInsert) {
      store.comms_channel_members.push({
        channel_id: channelId,
        user_id: r.userId,
        username: r.username,
        role: 'member',
        is_muted: false,
        last_read_message_id: null,
        joined_at: nowIso,
      });
    }
    const chIdx = (store.comms_channels || []).findIndex((c: any) => c.id === channelId);
    if (chIdx !== -1) store.comms_channels[chIdx].updated_at = nowIso;
    saveFallbackStore(store);

    await ensurePostgresConnection();
    const pool = getPgPool();
    if (isPostgresConnected() && pool) {
      try {
        for (const r of toInsert) {
          await pool.query(
            `INSERT INTO comms_channel_members (channel_id, user_id, username, role, is_muted, last_read_message_id, joined_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (channel_id, user_id) DO NOTHING`,
            [channelId, r.userId, r.username, 'member', false, null, nowIso]
          );
        }
        await pool.query(`UPDATE comms_channels SET updated_at = $1 WHERE id = $2`, [nowIso, channelId]);
      } catch (err: any) {
        console.error('[CommsService] addChannelMembers PG error:', err?.message || err);
      }
    }
  }

  const updated = (await loadHydratedChannelForUser(channelId, actor))!;
  broadcastCommsEventToRecipients(
    (updated.members || []).map((m) => ({ userId: m.userId, username: m.username })),
    undefined,
    { type: 'channel:updated', channel: updated }
  );
  return updated;
}

export async function toggleChannelMute(
  user: Partial<CommsActor>,
  channelId: string,
  isMuted: boolean
): Promise<{ channelId: string; isMuted: boolean }> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0) throw new Error('User identity missing');
  const idSet = new Set(identifiers);

  const store = loadFallbackStore();
  let matched = false;
  for (const m of store.comms_channel_members || []) {
    if (
      (m.channel_id ?? m.channelId) === channelId &&
      memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)
    ) {
      m.is_muted = isMuted;
      matched = true;
    }
  }
  if (matched) saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `UPDATE comms_channel_members
         SET is_muted = $1
         WHERE channel_id = $2
           AND (LOWER(user_id) = ANY($3::text[]) OR LOWER(username) = ANY($3::text[]))`,
        [isMuted, channelId, identifiers]
      );
    } catch (err: any) {
      console.error('[CommsService] toggleChannelMute PG error:', err?.message || err);
    }
  }

  const updated = await loadHydratedChannelForUser(channelId, user);
  if (updated) {
    broadcastCommsEventToUser(user, { type: 'channel:updated', channel: updated });
  }
  return { channelId, isMuted };
}

interface CommsViewerAccessContext {
  isSuperAdmin: boolean;
  policy: any | null;
  allowedDeviceSet: Set<string> | null;
  allowedServerSet: Set<string> | null;
}

async function resolveCommsViewerAccessContext(
  user: Partial<CommsActor>,
  explicitIsSuperAdmin = false
): Promise<CommsViewerAccessContext> {
  let dbUser: any = null;
  try {
    dbUser =
      (user.userId ? await findUserById(user.userId) : null) ||
      (user.username ? await findUserByUsername(user.username) : null);
  } catch {}

  if (dbUser && dbUser.status === 'disabled') {
    return {
      isSuperAdmin: false,
      policy: {
        canViewDevices: false,
        canViewServers: false,
        canViewPorts: false,
        canViewCommunications: false,
      },
      allowedDeviceSet: new Set<string>(),
      allowedServerSet: new Set<string>(),
    };
  }

  const effectiveUser = dbUser || {
    id: user.userId,
    username: user.username,
    role: user.role,
    userType: user.userType,
  };
  const policy = await getEffectivePolicyForUser(effectiveUser).catch(() => null);
  const cleanUsername = (dbUser?.username || user.username || '').trim().toLowerCase();
  const cleanRole = (dbUser?.role || user.role || '').trim().toLowerCase();
  const isSuperAdmin =
    Boolean(explicitIsSuperAdmin) ||
    cleanUsername === 'admin' ||
    cleanRole.includes('super admin') ||
    cleanRole.includes('administrator') ||
    policy?.id === 'policy-super-admin';

  if (isSuperAdmin) {
    return {
      isSuperAdmin: true,
      policy,
      allowedDeviceSet: null,
      allowedServerSet: null,
    };
  }

  let allowedDeviceSet: Set<string> | null = null;
  if (Array.isArray(policy?.allowedDeviceIds)) {
    allowedDeviceSet = new Set(
      policy.allowedDeviceIds.map((id: string) => (id || '').trim().toLowerCase()).filter(Boolean)
    );
  } else if (policy?.targetScope === 'specific' && Array.isArray(policy?.targetDeviceIds)) {
    allowedDeviceSet = new Set(
      policy.targetDeviceIds.map((id: string) => (id || '').trim().toLowerCase()).filter(Boolean)
    );
  }

  let allowedServerSet: Set<string> | null = null;
  if (Array.isArray(policy?.allowedServerIds)) {
    allowedServerSet = new Set(
      policy.allowedServerIds.map((id: string) => (id || '').trim().toLowerCase()).filter(Boolean)
    );
  } else if (
    (policy?.targetServerScope === 'specific' || policy?.targetScope === 'specific') &&
    Array.isArray(policy?.targetServerIds)
  ) {
    allowedServerSet = new Set(
      policy.targetServerIds.map((id: string) => (id || '').trim().toLowerCase()).filter(Boolean)
    );
  }

  return {
    isSuperAdmin: false,
    policy,
    allowedDeviceSet,
    allowedServerSet,
  };
}

function sanitizeEntityRefs(raw: any): CommsEntityMentionRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const clean: CommsEntityMentionRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entityType = item.entityType;
    if (entityType !== 'device' && entityType !== 'server' && entityType !== 'port') continue;
    const entityId = String(item.entityId || '').trim();
    if (!entityId) continue;
    const portId = entityType === 'port' ? String(item.portId || '').trim() : null;
    if (entityType === 'port' && !portId) continue;
    const dedupeKey = `${entityType}:${entityId.toLowerCase()}:${(portId || '').toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    clean.push({
      entityType,
      entityId,
      portId: portId || null,
    });
    if (clean.length >= 6) break;
  }
  return clean;
}

function extractMessageEntityRefs(msg: {
  metadata?: Record<string, any>;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
}): CommsEntityMentionRef[] {
  const fromMeta = sanitizeEntityRefs(msg.metadata?.entityRefs);
  if (fromMeta.length > 0) return fromMeta;
  if (
    (msg.linkedEntityType === 'device' || msg.linkedEntityType === 'server') &&
    msg.linkedEntityId
  ) {
    return [
      {
        entityType: msg.linkedEntityType,
        entityId: String(msg.linkedEntityId),
        portId: null,
      },
    ];
  }
  return [];
}

function isDeviceVisibleInViewerCtx(deviceId: string, ctx: CommsViewerAccessContext): {
  allowed: boolean;
  reasonCode?: 'module_disabled' | 'outside_scope';
} {
  if (ctx.isSuperAdmin) return { allowed: true };
  if (ctx.policy?.canViewDevices === false) {
    return { allowed: false, reasonCode: 'module_disabled' };
  }
  if (ctx.allowedDeviceSet !== null && !ctx.allowedDeviceSet.has(deviceId.trim().toLowerCase())) {
    return { allowed: false, reasonCode: 'outside_scope' };
  }
  return { allowed: true };
}

function isServerVisibleInViewerCtx(serverId: string, ctx: CommsViewerAccessContext): {
  allowed: boolean;
  reasonCode?: 'module_disabled' | 'outside_scope';
} {
  if (ctx.isSuperAdmin) return { allowed: true };
  if (ctx.policy?.canViewServers === false) {
    return { allowed: false, reasonCode: 'module_disabled' };
  }
  if (ctx.allowedServerSet !== null && !ctx.allowedServerSet.has(serverId.trim().toLowerCase())) {
    return { allowed: false, reasonCode: 'outside_scope' };
  }
  return { allowed: true };
}

function buildProjectedCardsForViewer(
  refs: CommsEntityMentionRef[],
  ctx: CommsViewerAccessContext,
  devicesById: Map<string, any>,
  serversById: Map<string, any>
): CommsProjectedEntityCard[] {
  if (!refs || refs.length === 0) return [];
  const cards: CommsProjectedEntityCard[] = [];

  for (const ref of refs) {
    if (ref.entityType === 'device' || ref.entityType === 'port') {
      const gate = isDeviceVisibleInViewerCtx(ref.entityId, ctx);
      if (!gate.allowed) {
        cards.push({
          entityType: ref.entityType,
          entityId: ref.entityId,
          portId: ref.portId || null,
          accessRestricted: true,
          restrictionReasonCode: gate.reasonCode,
          restrictionMessageFa:
            gate.reasonCode === 'module_disabled'
              ? 'عدم دسترسی RBAC: ماژول تجهیزات شبکه در پالیسی کاربری شما غیرفعال است.'
              : 'عدم دسترسی RBAC: این تجهیز خارج از محدوده گروه‌ها و تجهیزات مجاز شما قرار دارد.',
          restrictionMessageEn:
            gate.reasonCode === 'module_disabled'
              ? 'Access Restricted (RBAC): Network Devices module is disabled in your policy.'
              : 'Access Denied (RBAC): This device is outside your authorized device scope.',
        });
        continue;
      }

      const dev = devicesById.get(ref.entityId.trim().toLowerCase());
      if (!dev) {
        cards.push({
          entityType: ref.entityType,
          entityId: ref.entityId,
          portId: ref.portId || null,
          accessRestricted: true,
          restrictionReasonCode: 'not_found',
          restrictionMessageFa: 'این تجهیز در فهرست تجهیزات پنل یافت نشد یا حذف شده است.',
          restrictionMessageEn: 'Device not found or has been removed from inventory.',
        });
        continue;
      }

      const canInspectPorts =
        ctx.isSuperAdmin ||
        (ctx.policy?.canViewPorts !== false &&
          (!ctx.policy || isDeviceActionPermitted(ctx.policy, dev.id, 'inspect_ports')));
      const canTerminal =
        ctx.isSuperAdmin ||
        (!ctx.policy || isDeviceActionPermitted(ctx.policy, dev.id, 'terminal'));

      const baseCard: CommsProjectedEntityCard = {
        entityType: ref.entityType,
        entityId: dev.id,
        portId: ref.portId || null,
        accessRestricted: false,
        name: dev.name || dev.id,
        ip: dev.ip || dev.ssh_host || '',
        platform: dev.platform || dev.type || 'switch',
        deviceType: dev.type || 'switch',
        isOnline: dev.is_online !== undefined ? Boolean(dev.is_online) : true,
        location:
          dev.location ||
          [dev.building, dev.floor, dev.rack].filter(Boolean).join(' / ') ||
          undefined,
        canOpenPorts: canInspectPorts,
        canOpenTerminal: canTerminal,
        canOpenDeviceView: true,
      };

      if (ref.entityType === 'port') {
        if (!canInspectPorts) {
          baseCard.portsRestricted = true;
          baseCard.portsRestrictionMessageFa =
            'دسترسی محدود: شما مجوز مشاهده وضعیت پورت‌های این تجهیز را ندارید (canViewPorts / inspect_ports).';
          baseCard.portsRestrictionMessageEn =
            'Port Details Restricted: You lack inspect_ports permission for this device.';
        } else {
          const portsArr: any[] = Array.isArray(dev.ports) ? dev.ports : [];
          const targetLower = (ref.portId || '').trim().toLowerCase();
          const matchedPort = portsArr.find((p: any) => {
            const pId = String(p?.port_id || p?.port || p?.name || '').trim().toLowerCase();
            return pId === targetLower;
          });
          if (matchedPort) {
            baseCard.portStatus = matchedPort.status || 'down';
            baseCard.portAdminStatus = matchedPort.admin_status || 'enabled';
            baseCard.portMode = matchedPort.mode || 'access';
            baseCard.portVlan = matchedPort.vlan;
            baseCard.portDescription = matchedPort.description || undefined;
            baseCard.portSpeed = matchedPort.speed || undefined;
          } else {
            baseCard.portStatus = 'unknown';
          }
        }
      }

      cards.push(baseCard);
    } else if (ref.entityType === 'server') {
      const gate = isServerVisibleInViewerCtx(ref.entityId, ctx);
      if (!gate.allowed) {
        cards.push({
          entityType: 'server',
          entityId: ref.entityId,
          accessRestricted: true,
          restrictionReasonCode: gate.reasonCode,
          restrictionMessageFa:
            gate.reasonCode === 'module_disabled'
              ? 'عدم دسترسی RBAC: ماژول مدیریت سرورها در پالیسی کاربری شما غیرفعال است.'
              : 'عدم دسترسی RBAC: این سرور خارج از محدوده سرورهای مجاز شما قرار دارد.',
          restrictionMessageEn:
            gate.reasonCode === 'module_disabled'
              ? 'Access Restricted (RBAC): Remote Servers module is disabled in your policy.'
              : 'Access Denied (RBAC): This server is outside your authorized server scope.',
        });
        continue;
      }

      const srv = serversById.get(ref.entityId.trim().toLowerCase());
      if (!srv) {
        cards.push({
          entityType: 'server',
          entityId: ref.entityId,
          accessRestricted: true,
          restrictionReasonCode: 'not_found',
          restrictionMessageFa: 'این سرور در فهرست سرورهای پنل یافت نشد یا حذف شده است.',
          restrictionMessageEn: 'Server not found or has been removed from inventory.',
        });
        continue;
      }

      const canServerTerminal =
        ctx.isSuperAdmin ||
        (!ctx.policy || isServerActionPermitted(ctx.policy, srv.id, 'terminal'));

      cards.push({
        entityType: 'server',
        entityId: srv.id,
        accessRestricted: false,
        name: srv.name || srv.id,
        ip: srv.host || '',
        osType: srv.os_type || 'linux',
        platform: srv.distro || srv.os_type || 'linux',
        isOnline: srv.status === 'online',
        location: srv.location || srv.category || undefined,
        canOpenTerminal: canServerTerminal,
        canOpenRemoteConsole: canServerTerminal,
        canOpenDeviceView: true,
      });
    }
  }

  return cards;
}

export async function searchScopedEntityMentions(
  actor: CommsActor,
  isSuperAdmin: boolean,
  query: string
): Promise<CommsMentionCandidate[]> {
  const ctx = await resolveCommsViewerAccessContext(actor, isSuperAdmin);
  const q = (query || '').trim().toLowerCase();
  const candidates: CommsMentionCandidate[] = [];

  const canDevices = ctx.isSuperAdmin || ctx.policy?.canViewDevices !== false;
  const canServers = ctx.isSuperAdmin || ctx.policy?.canViewServers !== false;
  const canPortsModule = ctx.isSuperAdmin || ctx.policy?.canViewPorts !== false;

  const [allDevices, allServers] = await Promise.all([
    canDevices ? getAllDevices().catch(() => []) : Promise.resolve([]),
    canServers ? getAllRemoteServers().catch(() => []) : Promise.resolve([]),
  ]);

  if (canDevices && Array.isArray(allDevices)) {
    const permittedDevices = allDevices.filter((d: any) => {
      if (!d || !d.id) return false;
      if (ctx.allowedDeviceSet !== null) {
        return ctx.allowedDeviceSet.has(String(d.id).trim().toLowerCase());
      }
      return true;
    });

    for (const dev of permittedDevices) {
      const name = String(dev.name || dev.id);
      const ip = String(dev.ip || dev.ssh_host || '');
      const platform = String(dev.platform || dev.type || 'switch');
      const devMatch =
        !q ||
        name.toLowerCase().includes(q) ||
        ip.toLowerCase().includes(q) ||
        platform.toLowerCase().includes(q) ||
        String(dev.model || '').toLowerCase().includes(q);

      if (devMatch) {
        candidates.push({
          entityType: 'device',
          entityId: dev.id,
          name,
          subtitle: `${ip}${dev.model ? ` · ${dev.model}` : ''}`,
          ip,
          platform,
          isOnline: dev.is_online !== undefined ? Boolean(dev.is_online) : true,
        });
      }

      const canDevPorts =
        canPortsModule &&
        (ctx.isSuperAdmin || !ctx.policy || isDeviceActionPermitted(ctx.policy, dev.id, 'inspect_ports'));

      if (canDevPorts && Array.isArray(dev.ports) && dev.ports.length > 0 && q.length >= 1) {
        let portAddedForDev = 0;
        for (const p of dev.ports) {
          if (portAddedForDev >= 5) break;
          const pId = String(p?.port_id || p?.port || p?.name || '').trim();
          if (!pId) continue;
          const desc = String(p?.description || '').trim();
          const portHit =
            pId.toLowerCase().includes(q) ||
            desc.toLowerCase().includes(q) ||
            `${name.toLowerCase()} ${pId.toLowerCase()}`.includes(q) ||
            `${name.toLowerCase()}:${pId.toLowerCase()}`.includes(q) ||
            `${name.toLowerCase()}/${pId.toLowerCase()}`.includes(q);
          if (portHit) {
            candidates.push({
              entityType: 'port',
              entityId: dev.id,
              portId: pId,
              name: `${name} · ${pId}`,
              subtitle: desc
                ? `${ip} · VLAN ${p.vlan ?? '-'} · ${desc}`
                : `${ip} · VLAN ${p.vlan ?? '-'}`,
              ip,
              platform,
              isOnline: dev.is_online !== undefined ? Boolean(dev.is_online) : true,
              portStatus: p.status || 'down',
              portVlan: p.vlan,
              portDescription: desc || undefined,
            });
            portAddedForDev++;
          }
        }
      }
    }
  }

  if (canServers && Array.isArray(allServers)) {
    const permittedServers = allServers.filter((s: any) => {
      if (!s || !s.id) return false;
      if (ctx.allowedServerSet !== null) {
        return ctx.allowedServerSet.has(String(s.id).trim().toLowerCase());
      }
      return true;
    });

    for (const srv of permittedServers) {
      const name = String(srv.name || srv.id);
      const host = String(srv.host || '');
      const osType = String(srv.os_type || 'linux');
      const srvMatch =
        !q ||
        name.toLowerCase().includes(q) ||
        host.toLowerCase().includes(q) ||
        osType.toLowerCase().includes(q) ||
        String(srv.distro || '').toLowerCase().includes(q);

      if (srvMatch) {
        candidates.push({
          entityType: 'server',
          entityId: srv.id,
          name,
          subtitle: `${host} · ${srv.distro || osType}`,
          ip: host,
          osType,
          platform: srv.distro || osType,
          isOnline: srv.status === 'online',
        });
      }
    }
  }

  return candidates.slice(0, 25);
}

function sanitizeCleanMessageMetadata(meta: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!meta) return undefined;
  if (!('slashCommandData' in meta) && !('snippetData' in meta)) return meta;
  const copy = { ...meta };
  delete copy.slashCommandData;
  delete copy.snippetData;
  return copy;
}

function projectSlashResultForViewer(
  rawSlashData: any,
  ctx: CommsViewerAccessContext,
  devicesById: Map<string, any>,
  serversById: Map<string, any>
): CommsProjectedSlashResult | undefined {
  if (!rawSlashData || typeof rawSlashData !== 'object') return undefined;
  const cmd = rawSlashData.command as CommsSlashCommandName;
  if (!cmd) return undefined;

  const base = {
    command: cmd,
    rawCommand: String(rawSlashData.rawCommand || ''),
    target: String(rawSlashData.target || ''),
    executedAt: String(rawSlashData.executedAt || new Date().toISOString()),
    durationMs: typeof rawSlashData.durationMs === 'number' ? rawSlashData.durationMs : undefined,
    success: Boolean(rawSlashData.success),
  };

  if (cmd === 'dns') {
    return {
      ...base,
      dnsRecordType: rawSlashData.dnsRecordType,
      ipv4Addresses: Array.isArray(rawSlashData.ipv4Addresses) ? rawSlashData.ipv4Addresses : [],
      ipv6Addresses: Array.isArray(rawSlashData.ipv6Addresses) ? rawSlashData.ipv6Addresses : [],
      mxRecords: Array.isArray(rawSlashData.mxRecords) ? rawSlashData.mxRecords : [],
      ptrHostnames: Array.isArray(rawSlashData.ptrHostnames) ? rawSlashData.ptrHostnames : [],
      txtRecords: Array.isArray(rawSlashData.txtRecords) ? rawSlashData.txtRecords : [],
    };
  }

  if (cmd === 'mac') {
    const canDevices = ctx.isSuperAdmin || ctx.policy?.canViewDevices !== false;
    if (!canDevices) {
      return {
        ...base,
        target: '[Protected]',
        accessRestricted: true,
        restrictionReasonCode: 'module_disabled',
        restrictionMessageFa:
          'عدم دسترسی RBAC: ماژول تجهیزات شبکه برای مشاهده نتایج /mac در پالیسی شما غیرفعال است.',
        restrictionMessageEn:
          'Access Restricted (RBAC): Network Devices module is disabled in your policy.',
      };
    }

    const canPorts = ctx.isSuperAdmin || ctx.policy?.canViewPorts !== false;
    const rawCamHits: any[] = Array.isArray(rawSlashData.camHits) ? rawSlashData.camHits : [];
    const rawArpHits: any[] = Array.isArray(rawSlashData.arpHits) ? rawSlashData.arpHits : [];

    const permittedCamHits = rawCamHits.filter((h) => {
      const sid = String(h?.switchId || '').trim();
      if (!sid) return false;
      const devGate = isDeviceVisibleInViewerCtx(sid, ctx);
      if (!devGate.allowed) return false;
      if (!canPorts) return false;
      return ctx.isSuperAdmin || !ctx.policy || isDeviceActionPermitted(ctx.policy, sid, 'inspect_ports');
    });

    const permittedArpHits = rawArpHits.filter((h) => {
      const sid = String(h?.switchId || '').trim();
      if (!sid) return false;
      return isDeviceVisibleInViewerCtx(sid, ctx).allowed;
    });

    const totalMatched = Math.max(
      Number(rawSlashData.totalSwitchesMatched || 0),
      new Set([
        ...rawCamHits.map((h) => String(h?.switchId || '').toLowerCase()),
        ...rawArpHits.map((h) => String(h?.switchId || '').toLowerCase()),
      ]).size
    );
    const visibleSwitchIds = new Set([
      ...permittedCamHits.map((h) => String(h.switchId).toLowerCase()),
      ...permittedArpHits.map((h) => String(h.switchId).toLowerCase()),
    ]);
    const restrictedSwitchCount = Math.max(0, totalMatched - visibleSwitchIds.size);

    let visibleFinalEdge: CommsProjectedSlashResult['finalEdgePort'] = null;
    if (rawSlashData.finalEdgePort?.switchId) {
      const esid = String(rawSlashData.finalEdgePort.switchId);
      const edgeVisible =
        isDeviceVisibleInViewerCtx(esid, ctx).allowed &&
        canPorts &&
        (ctx.isSuperAdmin || !ctx.policy || isDeviceActionPermitted(ctx.policy, esid, 'inspect_ports'));
      if (edgeVisible) {
        visibleFinalEdge = rawSlashData.finalEdgePort;
      }
    }

    const edgeCanPorts = visibleFinalEdge
      ? ctx.isSuperAdmin ||
        (canPorts && (!ctx.policy || isDeviceActionPermitted(ctx.policy, visibleFinalEdge.switchId, 'inspect_ports')))
      : false;
    const edgeCanTerminal = visibleFinalEdge
      ? ctx.isSuperAdmin || !ctx.policy || isDeviceActionPermitted(ctx.policy, visibleFinalEdge.switchId, 'terminal')
      : false;

    return {
      ...base,
      queryType: rawSlashData.queryType,
      resolvedIp: rawSlashData.resolvedIp || null,
      resolvedMac: rawSlashData.resolvedMac || null,
      vendorName: rawSlashData.vendorName || null,
      finalEdgePort: visibleFinalEdge,
      camHits: permittedCamHits.slice(0, 10),
      arpHits: permittedArpHits.slice(0, 10),
      restrictedSwitchCount,
      totalSwitchesMatched: totalMatched,
      portsRestricted: !canPorts && rawCamHits.length > 0,
      portsRestrictionMessageFa:
        !canPorts && rawCamHits.length > 0
          ? 'جزئیات پورت سوئیچ‌ها طبق مجوز RBAC (canViewPorts) برای شما محدود شده است.'
          : undefined,
      portsRestrictionMessageEn:
        !canPorts && rawCamHits.length > 0
          ? 'Switch port hits are hidden per your RBAC port inspection permission.'
          : undefined,
      linkedEntityType: visibleFinalEdge ? 'port' : undefined,
      linkedEntityId: visibleFinalEdge?.switchId,
      portId: visibleFinalEdge?.port || null,
      canOpenPorts: edgeCanPorts,
      canOpenTerminal: edgeCanTerminal,
      canOpenDeviceView: Boolean(visibleFinalEdge),
    };
  }

  // /ping, /status, /port
  const linkedType = rawSlashData.linkedEntityType as 'device' | 'server' | undefined;
  const linkedId = rawSlashData.linkedEntityId ? String(rawSlashData.linkedEntityId) : '';

  if (linkedType === 'server' && linkedId) {
    const gate = isServerVisibleInViewerCtx(linkedId, ctx);
    if (!gate.allowed) {
      return {
        ...base,
        target: '[Protected Server]',
        rawCommand: `/${cmd} [Protected]`,
        accessRestricted: true,
        restrictionReasonCode: gate.reasonCode,
        restrictionMessageFa:
          gate.reasonCode === 'module_disabled'
            ? 'عدم دسترسی RBAC: ماژول سرورهای ریموت در پالیسی کاربری شما غیرفعال است.'
            : 'عدم دسترسی RBAC: خروجی این دستور مربوط به سروری خارج از محدوده دسترسی مجاز شما است.',
        restrictionMessageEn:
          gate.reasonCode === 'module_disabled'
            ? 'Access Restricted (RBAC): Remote Servers module is disabled in your policy.'
            : 'Access Denied (RBAC): Command output belongs to a server outside your authorized scope.',
      };
    }

    const srv = serversById.get(linkedId.trim().toLowerCase());
    const canTerminal =
      ctx.isSuperAdmin || !ctx.policy || isServerActionPermitted(ctx.policy, linkedId, 'terminal');

    return {
      ...base,
      linkedEntityType: 'server',
      linkedEntityId: linkedId,
      entityName: srv?.name || rawSlashData.entityName || linkedId,
      entityIp: srv?.host || rawSlashData.entityIp || '',
      osType: srv?.os_type || rawSlashData.osType || 'linux',
      platform: srv?.distro || srv?.os_type || rawSlashData.platform || 'linux',
      location: srv?.location || srv?.category || rawSlashData.location || undefined,
      isOnline: Boolean(rawSlashData.isOnline),
      latencyMs: rawSlashData.latencyMs ?? null,
      packetLoss: rawSlashData.packetLoss,
      rawOutput: rawSlashData.rawOutput,
      canOpenTerminal: canTerminal,
      canOpenDeviceView: true,
    };
  }

  if (linkedType === 'device' && linkedId) {
    const gate = isDeviceVisibleInViewerCtx(linkedId, ctx);
    if (!gate.allowed) {
      return {
        ...base,
        target: '[Protected Device]',
        rawCommand: `/${cmd} [Protected]`,
        accessRestricted: true,
        restrictionReasonCode: gate.reasonCode,
        restrictionMessageFa:
          gate.reasonCode === 'module_disabled'
            ? 'عدم دسترسی RBAC: ماژول تجهیزات شبکه در پالیسی کاربری شما غیرفعال است.'
            : 'عدم دسترسی RBAC: خروجی این دستور مربوط به تجهیزی خارج از محدوده دسترسی مجاز شما است.',
        restrictionMessageEn:
          gate.reasonCode === 'module_disabled'
            ? 'Access Restricted (RBAC): Network Devices module is disabled in your policy.'
            : 'Access Denied (RBAC): Command output belongs to a device outside your authorized scope.',
      };
    }

    const dev = devicesById.get(linkedId.trim().toLowerCase());
    const canInspectPorts =
      ctx.isSuperAdmin ||
      (ctx.policy?.canViewPorts !== false &&
        (!ctx.policy || isDeviceActionPermitted(ctx.policy, linkedId, 'inspect_ports')));
    const canTerminal =
      ctx.isSuperAdmin || !ctx.policy || isDeviceActionPermitted(ctx.policy, linkedId, 'terminal');

    if (cmd === 'port') {
      if (!canInspectPorts) {
        return {
          ...base,
          linkedEntityType: 'port',
          linkedEntityId: linkedId,
          portId: rawSlashData.portId || null,
          entityName: dev?.name || rawSlashData.entityName || linkedId,
          entityIp: dev?.ip || dev?.ssh_host || rawSlashData.entityIp || '',
          platform: dev?.platform || dev?.type || rawSlashData.platform || 'switch',
          portsRestricted: true,
          restrictionReasonCode: 'ports_restricted',
          portsRestrictionMessageFa:
            'عدم دسترسی RBAC: شما مجوز مشاهده جزئیات پورت‌های این تجهیز (inspect_ports) را ندارید.',
          portsRestrictionMessageEn:
            'Port Details Restricted (RBAC): You lack inspect_ports permission for this device.',
          canOpenPorts: false,
          canOpenTerminal: canTerminal,
          canOpenDeviceView: true,
        };
      }

      return {
        ...base,
        linkedEntityType: 'port',
        linkedEntityId: linkedId,
        portId: rawSlashData.portId || null,
        entityName: dev?.name || rawSlashData.entityName || linkedId,
        entityIp: dev?.ip || dev?.ssh_host || rawSlashData.entityIp || '',
        platform: dev?.platform || dev?.type || rawSlashData.platform || 'switch',
        portStatus: rawSlashData.portStatus,
        portAdminStatus: rawSlashData.portAdminStatus,
        portMode: rawSlashData.portMode,
        portVlan: rawSlashData.portVlan,
        portSpeed: rawSlashData.portSpeed,
        portDescription: rawSlashData.portDescription,
        connectedDevice: rawSlashData.connectedDevice,
        lastSynced: rawSlashData.lastSynced,
        canOpenPorts: canInspectPorts,
        canOpenTerminal: canTerminal,
        canOpenDeviceView: true,
      };
    }

    return {
      ...base,
      linkedEntityType: 'device',
      linkedEntityId: linkedId,
      entityName: dev?.name || rawSlashData.entityName || linkedId,
      entityIp: dev?.ip || dev?.ssh_host || rawSlashData.entityIp || '',
      platform: dev?.platform || dev?.type || rawSlashData.platform || 'switch',
      location:
        dev?.location ||
        [dev?.building, dev?.floor, dev?.rack].filter(Boolean).join(' / ') ||
        rawSlashData.location ||
        undefined,
      isOnline: Boolean(rawSlashData.isOnline),
      latencyMs: rawSlashData.latencyMs ?? null,
      packetLoss: rawSlashData.packetLoss,
      rawOutput: rawSlashData.rawOutput,
      canOpenPorts: canInspectPorts,
      canOpenTerminal: canTerminal,
      canOpenDeviceView: true,
    };
  }

  // Unlinked external host / IP /ping
  return {
    ...base,
    entityIp: rawSlashData.entityIp,
    isOnline: Boolean(rawSlashData.isOnline),
    latencyMs: rawSlashData.latencyMs ?? null,
    packetLoss: rawSlashData.packetLoss,
    rawOutput: rawSlashData.rawOutput,
  };
}

// ==============================================================================
// Phase 3: Server-Side Secret Scrubbing & Zero-Leak Snippet / Diff Projection
// ==============================================================================

const VALID_SNIPPET_SOURCE_TYPES = new Set<CommsSnippetSourceType>([
  'terminal_output',
  'backup_diff',
  'device_log',
  'server_log',
]);

const VALID_SNIPPET_PLATFORMS = new Set<CommsSnippetPlatform>([
  'cisco_ios',
  'mikrotik_routeros',
  'linux_ssh',
  'nginx',
  'apache',
  'syslog',
  'config_diff',
  'generic',
]);

export function scrubSensitiveSnippetContent(rawText: string): {
  scrubbedText: string;
  redactedCount: number;
  redactedCategories: string[];
} {
  let text = String(rawText || '').replace(/\r\n/g, '\n');
  let redactedCount = 0;
  const categories = new Set<string>();

  const applyMask = (
    regex: RegExp,
    category: string,
    replacer: (...args: any[]) => string
  ) => {
    text = text.replace(regex, (...args: any[]) => {
      const full = String(args[0] || '');
      if (full.includes('***REDACTED')) return full;
      redactedCount += 1;
      categories.add(category);
      return replacer(...args);
    });
  };

  // 1. PEM Private Keys (PKCS#1, PKCS#8, EC, OpenSSH, DSA, Encrypted)
  applyMask(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    'private_key',
    () => '-----BEGIN PRIVATE KEY-----\n***REDACTED_PRIVATE_KEY***\n-----END PRIVATE KEY-----'
  );

  // 2. Database / Service Connection Strings containing passwords (proto://user:pass@host)
  applyMask(
    /((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|ftp|ftps|https?):\/\/[^:\s/@"']+:)(?!\*{3}REDACTED)([^@\s/"']+)(@)/gi,
    'connection_password',
    (_m, p1, _secret, p3) => `${p1}***REDACTED***${p3}`
  );

  // 3. HTTP Authorization headers & Bearer tokens & JWT tokens
  applyMask(
    /(\bAuthorization\s*:\s*(?:Bearer|Basic|Token)\s+)(?!\*{3}REDACTED)([A-Za-z0-9\-._~+/]+=*)/gi,
    'auth_token',
    (_m, p1) => `${p1}***REDACTED***`
  );
  applyMask(
    /(\bBearer\s+)(?!\*{3}REDACTED)([A-Za-z0-9\-._~+/]{12,}=*)/g,
    'auth_token',
    (_m, p1) => `${p1}***REDACTED***`
  );
  applyMask(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g,
    'jwt',
    () => '***REDACTED_JWT***'
  );

  // 4. Cisco IOS / NX-OS secrets, enable passwords, TACACS/RADIUS keys, SNMP communities
  applyMask(
    /(\benable\s+(?:secret|password)\s+(?:(?:level\s+\d+|\d+)\s+)?)(?!\*{3}REDACTED)([^\s\r\n]+)/gi,
    'cisco_secret',
    (_m, p1) => `${p1}***REDACTED***`
  );
  applyMask(
    /(\busername\s+\S+[^\r\n]*?\b(?:secret|password)\s+(?:\d+\s+)?)(?!\*{3}REDACTED)([^\s\r\n]+)/gi,
    'cisco_password',
    (_m, p1) => `${p1}***REDACTED***`
  );
  applyMask(
    /(\bsnmp-server\s+community\s+)(?!\*{3}REDACTED)([^\s\r\n]+)/gi,
    'snmp_community',
    (_m, p1) => `${p1}***REDACTED***`
  );
  applyMask(
    /(\b(?:tacacs-server\s+key|radius-server\s+key|key-string|wpa-psk\s+ascii|pre-shared-key|AuthPass|PrivPass)\s+(?:\d+\s+)?)(?!\*{3}REDACTED)([^\s\r\n]+)/gi,
    'network_key',
    (_m, p1) => `${p1}***REDACTED***`
  );
  applyMask(
    /(^[ \t]*(?:password|secret)\s+(?:\d+\s+)?)(?!\*{3}REDACTED)([^\s\r\n;=:"']+)/gim,
    'device_password',
    (_m, p1) => `${p1}***REDACTED***`
  );

  // 5. MikroTik RouterOS & CLI parameters (password=..., secret=..., preshared-key=..., passphrase=...)
  applyMask(
    /(\b(?:password|secret|preshared-key|private-key|wpa2-pre-shared-key|wpa-pre-shared-key|passphrase|auth-password|priv-password|enc-password|community)\s*=\s*)(?:"(?!\*{3}REDACTED)[^"]*"|'(?!\*{3}REDACTED)[^']*'|(?![*"'])\S+)/gi,
    'routeros_secret',
    (_m, p1) => `${p1}***REDACTED***`
  );

  // 6. JSON quoted key-value secrets ("password": "...", "dbPassword": "...", "token": "...")
  applyMask(
    /("(?:[a-z0-9_-]*?(?:password|passwd|pwd|secret|api_?key|access_?token|auth_?token|refresh_?token|private_?key|client_?secret|signing_?key|encryption_?key|passphrase|preshared_?key|bot_?token))"\s*:\s*")((?!\*{3}REDACTED)[^"]*)(")/gi,
    'json_secret',
    (_m, p1, _val, p3) => `${p1}***REDACTED***${p3}`
  );

  // 7. Generic ENV / INI / Nginx / Apache key=value or key: value credentials
  applyMask(
    /(\b(?:[A-Z0-9_]*?(?:PASSWORD|PASSWD|SECRET|API_?KEY|ACCESS_?TOKEN|AUTH_?TOKEN|REFRESH_?TOKEN|PRIVATE_?KEY|SIGNING_?KEY|ENCRYPTION_?KEY|BOT_?TOKEN)|password|passwd|pwd|secret|api_key|apikey|access_token|auth_token|refresh_token|private_key|client_secret|db_pass|db_password|dbPassword|smtp_pass|smtpPassword|bot_token|webhook_secret|session_secret|signing_key|preshared_key|PGPASSWORD|MYSQL_PWD|REDIS_PASSWORD|JWT_SECRET|SSH_PASS|WINRM_PASS)\b\s*[:=]\s*)(["']?)(?!\*{3}REDACTED)([^"'\s\r\n,;]+)\2/gi,
    'credential',
    (_m, p1, q) => `${p1}${q}***REDACTED***${q}`
  );

  return {
    scrubbedText: text,
    redactedCount,
    redactedCategories: Array.from(categories),
  };
}

function checkSnippetGranularPermission(
  ctx: CommsViewerAccessContext,
  sourceType: CommsSnippetSourceType,
  sourceEntityType: 'device' | 'server',
  sourceEntityId: string,
  platform?: CommsSnippetPlatform
): boolean {
  if (ctx.isSuperAdmin || !ctx.policy) return true;

  if (sourceType === 'device_log' || sourceType === 'server_log') {
    return ctx.policy.canViewLogs !== false;
  }

  if (sourceType === 'terminal_output') {
    return sourceEntityType === 'device'
      ? isDeviceActionPermitted(ctx.policy, sourceEntityId, 'terminal')
      : isServerActionPermitted(ctx.policy, sourceEntityId, 'terminal');
  }

  if (sourceType === 'backup_diff') {
    if (ctx.policy.canExportBackup === false) return false;
    if (sourceEntityType === 'device' && platform === 'mikrotik_routeros') {
      return isDeviceActionPermitted(ctx.policy, sourceEntityId, 'mikrotik_backup');
    }
    return true;
  }

  return true;
}

function projectSnippetForViewer(
  rawSnippetData: any,
  ctx: CommsViewerAccessContext,
  devicesById: Map<string, any>,
  serversById: Map<string, any>
): CommsProjectedSnippetResult | undefined {
  if (!rawSnippetData || typeof rawSnippetData !== 'object') return undefined;

  const snippetId = String(rawSnippetData.snippetId || 'snip');
  const sourceType = VALID_SNIPPET_SOURCE_TYPES.has(rawSnippetData.sourceType)
    ? (rawSnippetData.sourceType as CommsSnippetSourceType)
    : 'terminal_output';
  const sourceEntityType: 'device' | 'server' =
    rawSnippetData.sourceEntityType === 'server' ? 'server' : 'device';
  const sourceEntityId = String(rawSnippetData.sourceEntityId || '').trim();
  const platform = VALID_SNIPPET_PLATFORMS.has(rawSnippetData.platform)
    ? (rawSnippetData.platform as CommsSnippetPlatform)
    : 'generic';
  const sharedAt = String(rawSnippetData.sharedAt || new Date().toISOString());

  if (!sourceEntityId) return undefined;

  const baseRestricted = {
    snippetId,
    sourceType,
    sourceEntityType,
    sourceEntityId,
    platform,
    sharedAt,
    accessRestricted: true as const,
  };

  if (sourceEntityType === 'server') {
    const gate = isServerVisibleInViewerCtx(sourceEntityId, ctx);
    if (!gate.allowed) {
      return {
        ...baseRestricted,
        restrictionReasonCode: gate.reasonCode === 'module_disabled' ? 'module_disabled' : 'outside_scope',
        restrictionMessageFa:
          gate.reasonCode === 'module_disabled'
            ? 'عدم دسترسی RBAC: ماژول سرورهای ریموت برای مشاهده این خروجی/بکاپ در پالیسی شما غیرفعال است.'
            : 'عدم دسترسی RBAC: شما مجوز مشاهده خروجی، لاگ یا تغییرات این سرور را ندارید.',
        restrictionMessageEn:
          gate.reasonCode === 'module_disabled'
            ? 'Access Restricted (RBAC): Remote Servers module is disabled in your policy.'
            : 'Access Denied (RBAC): This snippet belongs to a server outside your authorized scope.',
      };
    }

    if (!checkSnippetGranularPermission(ctx, sourceType, 'server', sourceEntityId, platform)) {
      return {
        ...baseRestricted,
        restrictionReasonCode: 'action_denied',
        restrictionMessageFa:
          sourceType === 'server_log'
            ? 'عدم دسترسی RBAC: مجوز مشاهده لاگ‌های سرور (canViewLogs) در پالیسی شما محدود شده است.'
            : sourceType === 'backup_diff'
            ? 'عدم دسترسی RBAC: مجوز مشاهده بکاپ و تغییرات کانفیگ این سرور برای شما غیرفعال است.'
            : 'عدم دسترسی RBAC: مجوز دسترسی به خروجی ترمینال این سرور برای شما فعال نیست.',
        restrictionMessageEn:
          sourceType === 'server_log'
            ? 'Access Restricted (RBAC): Server log inspection permission (canViewLogs) is denied in your policy.'
            : sourceType === 'backup_diff'
            ? 'Access Restricted (RBAC): Backup & configuration diff access is restricted in your policy.'
            : 'Access Restricted (RBAC): Terminal output permission for this server is denied in your policy.',
      };
    }

    const srv = serversById.get(sourceEntityId.toLowerCase());
    const canTerminal =
      ctx.isSuperAdmin || !ctx.policy || isServerActionPermitted(ctx.policy, sourceEntityId, 'terminal');
    const canLogs = ctx.isSuperAdmin || ctx.policy?.canViewLogs !== false;

    return {
      snippetId,
      sourceType,
      sourceEntityType: 'server',
      sourceEntityId,
      platform,
      sharedAt,
      accessRestricted: false,
      sourceEntityName: srv?.name || rawSnippetData.sourceEntityName || sourceEntityId,
      sourceEntityIp: srv?.host || srv?.ip || rawSnippetData.sourceEntityIp || '',
      title: rawSnippetData.title,
      titleEn: rawSnippetData.titleEn,
      filePath: rawSnippetData.filePath,
      content: String(rawSnippetData.content || ''),
      lineCount: Number(rawSnippetData.lineCount || 0),
      truncated: Boolean(rawSnippetData.truncated),
      redactedCount: Number(rawSnippetData.redactedCount || 0),
      redactedCategories: Array.isArray(rawSnippetData.redactedCategories)
        ? rawSnippetData.redactedCategories
        : [],
      diffStats: rawSnippetData.diffStats || undefined,
      canOpenSourceTerminal: canTerminal,
      canOpenSourceLogs: canLogs,
      canOpenSourceView: true,
    };
  }

  // Device snippet projection
  const devGate = isDeviceVisibleInViewerCtx(sourceEntityId, ctx);
  if (!devGate.allowed) {
    return {
      ...baseRestricted,
      restrictionReasonCode: devGate.reasonCode === 'module_disabled' ? 'module_disabled' : 'outside_scope',
      restrictionMessageFa:
        devGate.reasonCode === 'module_disabled'
          ? 'عدم دسترسی RBAC: ماژول تجهیزات شبکه برای مشاهده این خروجی/بکاپ در پالیسی شما غیرفعال است.'
          : 'عدم دسترسی RBAC: شما دسترسی مشاهده خروجی، لاگ یا بکاپ این تجهیز را ندارید.',
      restrictionMessageEn:
        devGate.reasonCode === 'module_disabled'
          ? 'Access Restricted (RBAC): Network Devices module is disabled in your policy.'
          : 'Access Denied (RBAC): This snippet belongs to a device outside your authorized scope.',
    };
  }

  if (!checkSnippetGranularPermission(ctx, sourceType, 'device', sourceEntityId, platform)) {
    return {
      ...baseRestricted,
      restrictionReasonCode: 'action_denied',
      restrictionMessageFa:
        sourceType === 'device_log'
          ? 'عدم دسترسی RBAC: مجوز مشاهده لاگ‌های تجهیزات (canViewLogs) در پالیسی شما محدود شده است.'
          : sourceType === 'backup_diff'
          ? 'عدم دسترسی RBAC: مجوز مشاهده بکاپ و خروجی تنظیمات این تجهیز برای شما فعال نیست.'
          : 'عدم دسترسی RBAC: مجوز مشاهده خروجی ترمینال CLI این تجهیز در پالیسی شما محدود شده است.',
      restrictionMessageEn:
        sourceType === 'device_log'
          ? 'Access Restricted (RBAC): Device syslog inspection (canViewLogs) is denied in your policy.'
          : sourceType === 'backup_diff'
          ? 'Access Restricted (RBAC): Backup & configuration export access for this device is denied.'
          : 'Access Restricted (RBAC): Terminal access for this device is restricted in your policy.',
    };
  }

  const dev = devicesById.get(sourceEntityId.toLowerCase());
  const canTerminal =
    ctx.isSuperAdmin || !ctx.policy || isDeviceActionPermitted(ctx.policy, sourceEntityId, 'terminal');
  const canLogs =
    ctx.isSuperAdmin ||
    (ctx.policy?.canViewLogs !== false &&
      (!ctx.policy || isDeviceActionPermitted(ctx.policy, sourceEntityId, 'inspect_ports')));

  return {
    snippetId,
    sourceType,
    sourceEntityType: 'device',
    sourceEntityId,
    platform,
    sharedAt,
    accessRestricted: false,
    sourceEntityName: dev?.name || rawSnippetData.sourceEntityName || sourceEntityId,
    sourceEntityIp: dev?.ip || dev?.ssh_host || rawSnippetData.sourceEntityIp || '',
    title: rawSnippetData.title,
    titleEn: rawSnippetData.titleEn,
    filePath: rawSnippetData.filePath,
    content: String(rawSnippetData.content || ''),
    lineCount: Number(rawSnippetData.lineCount || 0),
    truncated: Boolean(rawSnippetData.truncated),
    redactedCount: Number(rawSnippetData.redactedCount || 0),
    redactedCategories: Array.isArray(rawSnippetData.redactedCategories)
      ? rawSnippetData.redactedCategories
      : [],
    diffStats: rawSnippetData.diffStats || undefined,
    canOpenSourceTerminal: canTerminal,
    canOpenSourceLogs: canLogs,
    canOpenSourceView: true,
  };
}

export async function listChannelMessages(
  user: CommsActor,
  isSuperAdmin: boolean,
  channelId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ channel: CommsChannel; messages: CommsMessage[]; total: number }> {
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const offset = Math.max(0, Number(options.offset) || 0);
  const idList = resolveUserIdentifiers(user);
  const idSet = new Set(idList);

  await ensurePostgresConnection();
  const pool = getPgPool();
  const pgActive = isPostgresConnected() && Boolean(pool);

  // Run channel hydration + viewer-cleared COUNT(*) + viewer-cleared SELECT page concurrently
  const [channel, pgCountsAndRows] = await Promise.all([
    loadHydratedChannelForUser(channelId, user),
    pgActive && pool
      ? Promise.all([
          pool.query(
            `WITH viewer AS (
               SELECT MAX(cleared_at) AS cleared_at
               FROM comms_channel_members
               WHERE channel_id = $1
                 AND (LOWER(user_id) = ANY($2::text[]) OR LOWER(username) = ANY($2::text[]))
             )
             SELECT COUNT(*)::int AS total
             FROM comms_messages, viewer
             WHERE channel_id = $1
               AND (viewer.cleared_at IS NULL OR created_at > viewer.cleared_at)`,
            [channelId, idList]
          ),
          pool.query(
            `WITH viewer AS (
               SELECT MAX(cleared_at) AS cleared_at
               FROM comms_channel_members
               WHERE channel_id = $1
                 AND (LOWER(user_id) = ANY($2::text[]) OR LOWER(username) = ANY($2::text[]))
             )
             SELECT m.*
             FROM comms_messages m, viewer
             WHERE m.channel_id = $1
               AND (viewer.cleared_at IS NULL OR m.created_at > viewer.cleared_at)
             ORDER BY m.created_at DESC
             LIMIT $3 OFFSET $4`,
            [channelId, idList, limit, offset]
          ),
        ]).catch((err: any) => {
          console.error('[CommsService] listChannelMessages PG error:', err?.message || err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (!channel) {
    throw new Error('Channel not found.');
  }

  const isMember = (channel.members || []).some((m) => memberMatchesIdentifiers(m, idSet));
  if (!isMember && !isSuperAdmin) {
    throw new Error('ACCESS_DENIED: You are not a member of this channel.');
  }

  let rawMessages: any[] = [];
  let total = 0;

  if (pgCountsAndRows) {
    total = pgCountsAndRows[0].rows[0]?.total || 0;
    rawMessages = pgCountsAndRows[1].rows.reverse();
  }

  if (!pgCountsAndRows) {
    const store = loadFallbackStore();
    const viewerFbMembers = (store.comms_channel_members || []).filter(
      (m: any) =>
        (m.channel_id ?? m.channelId) === channelId &&
        memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)
    );
    let clearedAtMs = 0;
    for (const m of viewerFbMembers) {
      const ca = m.cleared_at ?? m.clearedAt;
      if (ca) {
        const ms = new Date(ca).getTime();
        if (ms > clearedAtMs) clearedAtMs = ms;
      }
    }
    const allForChannel = (store.comms_messages || [])
      .filter((m: any) => {
        if ((m.channel_id ?? m.channelId) !== channelId) return false;
        if (!clearedAtMs) return true;
        return new Date(m.created_at || m.createdAt).getTime() > clearedAtMs;
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.created_at || a.createdAt).getTime() -
          new Date(b.created_at || b.createdAt).getTime()
      );
    total = Math.max(total, allForChannel.length);
    const start = Math.max(0, allForChannel.length - offset - limit);
    const end = Math.max(0, allForChannel.length - offset);
    rawMessages = allForChannel.slice(start, end);
  }

  const lookupMap = new Map<string, any>();
  for (const r of rawMessages) {
    lookupMap.set(r.id, r);
  }
  const messages = rawMessages.map((r) => mapMessageRow(r, lookupMap));

  // Project entity mentions, ChatOps slash results, and Shared Snippets strictly through the viewer's RBAC policy (Zero-Leak)
  const needsDeviceLookup = messages.some(
    (m) =>
      extractMessageEntityRefs(m).some(
        (ref) => ref.entityType === 'device' || ref.entityType === 'port'
      ) ||
      Boolean(m.metadata?.slashCommandData) ||
      Boolean(m.metadata?.snippetData)
  );
  const needsServerLookup = messages.some(
    (m) =>
      extractMessageEntityRefs(m).some((ref) => ref.entityType === 'server') ||
      Boolean(m.metadata?.slashCommandData) ||
      Boolean(m.metadata?.snippetData)
  );
  if (needsDeviceLookup || needsServerLookup) {
    const [viewerCtx, allDevices, allServers] = await Promise.all([
      resolveCommsViewerAccessContext(user, isSuperAdmin),
      needsDeviceLookup ? getAllDevices().catch(() => []) : Promise.resolve([]),
      needsServerLookup ? getAllRemoteServers().catch(() => []) : Promise.resolve([]),
    ]);
    const devicesById = new Map<string, any>(
      (allDevices || [])
        .filter((d: any) => d?.id)
        .map((d: any) => [String(d.id).trim().toLowerCase(), d])
    );
    const serversById = new Map<string, any>(
      (allServers || [])
        .filter((s: any) => s?.id)
        .map((s: any) => [String(s.id).trim().toLowerCase(), s])
    );
    for (const m of messages) {
      const refs = extractMessageEntityRefs(m);
      if (refs.length > 0 && !m.metadata?.snippetData) {
        const cards = buildProjectedCardsForViewer(refs, viewerCtx, devicesById, serversById);
        m.entityCards = cards;
        if (cards.some((c) => c.accessRestricted)) {
          m.linkedEntityName = null;
        }
      }
      if (m.metadata?.slashCommandData) {
        const projectedSlash = projectSlashResultForViewer(
          m.metadata.slashCommandData,
          viewerCtx,
          devicesById,
          serversById
        );
        if (projectedSlash) {
          m.slashResult = projectedSlash;
          if (projectedSlash.accessRestricted) {
            m.linkedEntityName = null;
            m.body = '🔒 خروجی دستور ChatOps (دسترسی به تجهیز/سرور محدود شده است)';
            m.bodyEn = '🔒 ChatOps output (Entity access restricted by RBAC)';
          }
        }
      }
      if (m.metadata?.snippetData) {
        const projectedSnippet = projectSnippetForViewer(
          m.metadata.snippetData,
          viewerCtx,
          devicesById,
          serversById
        );
        if (projectedSnippet) {
          m.snippetResult = projectedSnippet;
          if (projectedSnippet.accessRestricted) {
            m.linkedEntityName = null;
            m.body = '🔒 خروجی ترمینال/لاگ/بکاپ (دسترسی به تجهیز/سرور محدود شده است)';
            m.bodyEn = '🔒 Terminal/Log/Diff snippet (Entity access restricted by RBAC)';
          }
        }
      }
      m.metadata = sanitizeCleanMessageMetadata(m.metadata);
    }
  }

  // Mark channel notifications as read only when actually needed (skip fallback JSON write when PG is active)
  const newestId = messages[messages.length - 1]?.id || null;
  let clearedAny = false;

  if (!pgActive) {
    let fbDirty = false;
    const store = loadFallbackStore();
    if (Array.isArray(store.comms_notifications)) {
      const nowIso = new Date().toISOString();
      for (const n of store.comms_notifications) {
        if (
          (n.channel_id ?? n.channelId) === channelId &&
          !(n.is_read ?? n.isRead) &&
          (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
            idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
        ) {
          n.is_read = true;
          n.read_at = n.read_at || nowIso;
          clearedAny = true;
          fbDirty = true;
        }
      }
    }
    if (newestId && Array.isArray(store.comms_channel_members)) {
      for (const m of store.comms_channel_members) {
        if (
          (m.channel_id ?? m.channelId) === channelId &&
          memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet) &&
          m.last_read_message_id !== newestId
        ) {
          m.last_read_message_id = newestId;
          fbDirty = true;
        }
      }
    }
    if (fbDirty) {
      saveFallbackStore(store);
    }
  }

  // Run read-receipt PG updates + WS sync non-blocking when channel already has no unread notifications,
  // or fast-await when unread notifications were present so badge sync is accurate.
  if (pgActive && pool && idList.length > 0) {
    const syncReadState = async () => {
      try {
        const pgOps: Promise<any>[] = [];
        if (channel.unreadCount > 0 || clearedAny) {
          pgOps.push(
            pool.query(
              `UPDATE comms_notifications
               SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
               WHERE channel_id = $1 AND is_read = FALSE
                 AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
              [channelId, idList]
            )
          );
        }
        if (newestId) {
          pgOps.push(
            pool.query(
              `UPDATE comms_channel_members
               SET last_read_message_id = $1
               WHERE channel_id = $2
                 AND (last_read_message_id IS DISTINCT FROM $1)
                 AND (LOWER(user_id) = ANY($3::text[]) OR LOWER(username) = ANY($3::text[]))`,
              [newestId, channelId, idList]
            )
          );
        }
        const results = await Promise.all(pgOps);
        const pgCleared =
          results[0] && 'rowCount' in results[0] && (results[0].rowCount || 0) > 0;
        if (clearedAny || pgCleared) {
          const counts = await getUnreadNotificationCounts(user).catch(() => null);
          if (counts) {
            broadcastCommsEventToUser(user, {
              type: 'comms:sync',
              unreadCount: counts.unreadCount,
              countsByFolder: counts.countsByFolder,
            });
          }
        }
      } catch {}
    };

    if (channel.unreadCount > 0) {
      await syncReadState();
    } else {
      void syncReadState();
    }
  } else if (clearedAny) {
    void getUnreadNotificationCounts(user)
      .then((counts) => {
        broadcastCommsEventToUser(user, {
          type: 'comms:sync',
          unreadCount: counts.unreadCount,
          countsByFolder: counts.countsByFolder,
        });
      })
      .catch(() => {});
  }

  return {
    channel: { ...channel, unreadCount: 0 },
    messages,
    total,
  };
}

export async function clearChannelHistoryForUser(
  actor: CommsActor,
  channelId: string
): Promise<{ channelId: string; clearedAt: string }> {
  const existing = await loadHydratedChannelForUser(channelId, actor);
  if (!existing) {
    throw new Error('Channel not found.');
  }
  const idList = resolveUserIdentifiers(actor);
  const idSet = new Set(idList);
  const isMember = (existing.members || []).some((m) => memberMatchesIdentifiers(m, idSet));
  if (!isMember) {
    throw new Error('ACCESS_DENIED: You are not a member of this channel.');
  }

  const nowIso = new Date().toISOString();

  // Update fallback store per-user cleared_at & unread notifications
  const store = loadFallbackStore();
  for (const m of store.comms_channel_members || []) {
    if (
      (m.channel_id ?? m.channelId) === channelId &&
      memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)
    ) {
      m.cleared_at = nowIso;
      m.last_read_message_id = null;
    }
  }
  for (const n of store.comms_notifications || []) {
    if (
      (n.channel_id ?? n.channelId) === channelId &&
      !(n.is_read ?? n.isRead) &&
      (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
        idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
    ) {
      n.is_read = true;
      n.read_at = n.read_at || nowIso;
    }
  }
  saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool && idList.length > 0) {
    try {
      await Promise.all([
        pool.query(
          `UPDATE comms_channel_members
           SET cleared_at = $1, last_read_message_id = NULL
           WHERE channel_id = $2
             AND (LOWER(user_id) = ANY($3::text[]) OR LOWER(username) = ANY($3::text[]))`,
          [nowIso, channelId, idList]
        ),
        pool.query(
          `UPDATE comms_notifications
           SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
           WHERE channel_id = $1 AND is_read = FALSE
             AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
          [channelId, idList]
        ),
      ]);
    } catch (err: any) {
      console.error('[CommsService] clearChannelHistoryForUser PG error:', err?.message || err);
    }
  }

  const hydrated = await loadHydratedChannelForUser(channelId, actor);
  if (hydrated) {
    broadcastCommsEventToUser(actor, {
      type: 'channel:updated',
      channel: { ...hydrated, lastMessagePreview: null, lastMessageAt: null, unreadCount: 0 },
    });
  }
  const counts = await getUnreadNotificationCounts(actor).catch(() => null);
  if (counts) {
    broadcastCommsEventToUser(actor, {
      type: 'comms:sync',
      unreadCount: counts.unreadCount,
      countsByFolder: counts.countsByFolder,
    });
  }

  return { channelId, clearedAt: nowIso };
}

export async function leaveOrDeleteChannelForUser(
  actor: CommsActor,
  isSuperAdmin: boolean,
  channelId: string,
  senderIp = '127.0.0.1'
): Promise<{ channelId: string; mode: 'hidden_direct' | 'left_group' | 'deleted_empty_group' }> {
  const existing = await loadHydratedChannelForUser(channelId, actor);
  if (!existing) {
    throw new Error('Channel not found.');
  }

  const idList = resolveUserIdentifiers(actor);
  const idSet = new Set(idList);
  const isMember = (existing.members || []).some((m) => memberMatchesIdentifiers(m, idSet));
  if (!isMember && !isSuperAdmin) {
    throw new Error('ACCESS_DENIED: You are not a member of this channel.');
  }

  const nowIso = new Date().toISOString();
  await ensurePostgresConnection();
  const pool = getPgPool();

  if (existing.channelType === 'direct') {
    const store = loadFallbackStore();
    for (const m of store.comms_channel_members || []) {
      if (
        (m.channel_id ?? m.channelId) === channelId &&
        memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)
      ) {
        m.is_hidden = true;
        m.cleared_at = nowIso;
        m.last_read_message_id = null;
      }
    }
    for (const n of store.comms_notifications || []) {
      if (
        (n.channel_id ?? n.channelId) === channelId &&
        (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
          idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
      ) {
        n.is_read = true;
        n.is_archived = true;
        n.read_at = n.read_at || nowIso;
      }
    }
    saveFallbackStore(store);

    if (isPostgresConnected() && pool && idList.length > 0) {
      try {
        await Promise.all([
          pool.query(
            `UPDATE comms_channel_members
             SET is_hidden = TRUE, cleared_at = $1, last_read_message_id = NULL
             WHERE channel_id = $2
               AND (LOWER(user_id) = ANY($3::text[]) OR LOWER(username) = ANY($3::text[]))`,
            [nowIso, channelId, idList]
          ),
          pool.query(
            `UPDATE comms_notifications
             SET is_read = TRUE, is_archived = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
             WHERE channel_id = $1
               AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
            [channelId, idList]
          ),
        ]);
      } catch (err: any) {
        console.error('[CommsService] leaveOrDeleteDirect PG error:', err?.message || err);
      }
    }

    broadcastCommsEventToUser(actor, { type: 'channel:removed', channelId } as any);
    const counts = await getUnreadNotificationCounts(actor).catch(() => null);
    if (counts) {
      broadcastCommsEventToUser(actor, {
        type: 'comms:sync',
        unreadCount: counts.unreadCount,
        countsByFolder: counts.countsByFolder,
      });
    }
    return { channelId, mode: 'hidden_direct' };
  }

  // Group channel leave
  const store = loadFallbackStore();
  store.comms_channel_members = (store.comms_channel_members || []).filter(
    (m: any) =>
      !(
        (m.channel_id ?? m.channelId) === channelId &&
        memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)
      )
  );
  for (const n of store.comms_notifications || []) {
    if (
      (n.channel_id ?? n.channelId) === channelId &&
      (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
        idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
    ) {
      n.is_read = true;
      n.is_archived = true;
      n.read_at = n.read_at || nowIso;
    }
  }
  const fbRemaining = (store.comms_channel_members || []).filter(
    (m: any) => (m.channel_id ?? m.channelId) === channelId
  );
  if (fbRemaining.length === 0) {
    store.comms_channels = (store.comms_channels || []).filter((c: any) => c.id !== channelId);
    store.comms_messages = (store.comms_messages || []).filter(
      (m: any) => (m.channel_id ?? m.channelId) !== channelId
    );
    store.comms_notifications = (store.comms_notifications || []).filter(
      (n: any) => (n.channel_id ?? n.channelId) !== channelId
    );
  } else if (!fbRemaining.some((m: any) => m.role === 'owner')) {
    fbRemaining[0].role = 'owner';
  }
  saveFallbackStore(store);

  let mode: 'left_group' | 'deleted_empty_group' =
    fbRemaining.length === 0 ? 'deleted_empty_group' : 'left_group';
  let remainingRecipients: Array<{ userId: string; username: string }> = fbRemaining.map((m: any) => ({
    userId: m.user_id ?? m.userId,
    username: m.username,
  }));

  if (isPostgresConnected() && pool && idList.length > 0) {
    try {
      await Promise.all([
        pool.query(
          `DELETE FROM comms_channel_members
           WHERE channel_id = $1
             AND (LOWER(user_id) = ANY($2::text[]) OR LOWER(username) = ANY($2::text[]))`,
          [channelId, idList]
        ),
        pool.query(
          `UPDATE comms_notifications
           SET is_read = TRUE, is_archived = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
           WHERE channel_id = $1
             AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
          [channelId, idList]
        ),
      ]);

      const remRes = await pool.query(
        `SELECT user_id, username, role FROM comms_channel_members WHERE channel_id = $1 ORDER BY joined_at ASC`,
        [channelId]
      );
      if (remRes.rows.length === 0) {
        mode = 'deleted_empty_group';
        remainingRecipients = [];
        await Promise.all([
          pool.query(`DELETE FROM comms_notifications WHERE channel_id = $1`, [channelId]),
          pool.query(`DELETE FROM comms_messages WHERE channel_id = $1`, [channelId]),
          pool.query(`DELETE FROM comms_channels WHERE id = $1`, [channelId]),
        ]);
      } else {
        mode = 'left_group';
        remainingRecipients = remRes.rows.map((r: any) => ({
          userId: r.user_id,
          username: r.username,
        }));
        if (!remRes.rows.some((r: any) => r.role === 'owner')) {
          await pool.query(
            `UPDATE comms_channel_members SET role = 'owner' WHERE channel_id = $1 AND user_id = $2`,
            [channelId, remRes.rows[0].user_id]
          );
        }
      }
    } catch (err: any) {
      console.error('[CommsService] leaveOrDeleteGroup PG error:', err?.message || err);
    }
  }

  broadcastCommsEventToUser(actor, { type: 'channel:removed', channelId } as any);
  const counts = await getUnreadNotificationCounts(actor).catch(() => null);
  if (counts) {
    broadcastCommsEventToUser(actor, {
      type: 'comms:sync',
      unreadCount: counts.unreadCount,
      countsByFolder: counts.countsByFolder,
    });
  }

  if (mode === 'left_group' && remainingRecipients.length > 0) {
    const refreshed = await loadHydratedChannelForUser(channelId, remainingRecipients[0]);
    if (refreshed) {
      broadcastCommsEventToRecipients(remainingRecipients, undefined, {
        type: 'channel:updated',
        channel: refreshed,
      });
    }
  }

  void addPortalAuditLog({
    category: 'communications',
    action: 'CHANNEL_LEFT',
    title: `خروج از کانال: ${existing.name}`,
    title_en: `Left Group Channel: ${existing.nameEn || existing.name}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: senderIp || '127.0.0.1',
    },
    target: {
      type: 'comms_channel',
      id: channelId,
      name: existing.nameEn || existing.name,
    },
    severity: 'info',
    status: 'success',
    details: `کاربر ${actor.username} از کانال «${existing.name}» خارج شد.`,
    details_en: `User ${actor.username} left channel "${existing.nameEn || existing.name}".`,
  }).catch(() => {});

  return { channelId, mode };
}

export async function deleteGroupChannel(
  actor: CommsActor,
  isSuperAdmin: boolean,
  channelId: string,
  senderIp = '127.0.0.1'
): Promise<{ channelId: string }> {
  const existing = await loadHydratedChannelForUser(channelId, actor);
  if (!existing) {
    throw new Error('Channel not found.');
  }
  if (existing.channelType !== 'group') {
    await leaveOrDeleteChannelForUser(actor, isSuperAdmin, channelId, senderIp);
    return { channelId };
  }

  const actorIds = new Set(resolveUserIdentifiers(actor));
  const actorMember = (existing.members || []).find((m) => memberMatchesIdentifiers(m, actorIds));
  const isOwner = actorMember?.role === 'owner' || existing.createdByUserId === actor.userId;
  if (!isSuperAdmin && !isOwner) {
    throw new Error('ACCESS_DENIED: Only channel owner or Super Admin can delete this channel.');
  }

  const formerRecipients = (existing.members || []).map((m) => ({
    userId: m.userId,
    username: m.username,
  }));

  const store = loadFallbackStore();
  store.comms_channels = (store.comms_channels || []).filter((c: any) => c.id !== channelId);
  store.comms_channel_members = (store.comms_channel_members || []).filter(
    (m: any) => (m.channel_id ?? m.channelId) !== channelId
  );
  store.comms_messages = (store.comms_messages || []).filter(
    (m: any) => (m.channel_id ?? m.channelId) !== channelId
  );
  store.comms_notifications = (store.comms_notifications || []).filter(
    (n: any) => (n.channel_id ?? n.channelId) !== channelId
  );
  saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await Promise.all([
        pool.query(`DELETE FROM comms_notifications WHERE channel_id = $1`, [channelId]),
        pool.query(`DELETE FROM comms_messages WHERE channel_id = $1`, [channelId]),
        pool.query(`DELETE FROM comms_channel_members WHERE channel_id = $1`, [channelId]),
        pool.query(`DELETE FROM comms_channels WHERE id = $1`, [channelId]),
      ]);
    } catch (err: any) {
      console.error('[CommsService] deleteGroupChannel PG error:', err?.message || err);
    }
  }

  if (formerRecipients.length > 0) {
    broadcastCommsEventToRecipients(formerRecipients, undefined, {
      type: 'channel:removed',
      channelId,
    } as any);
  }
  const counts = await getUnreadNotificationCounts(actor).catch(() => null);
  if (counts) {
    broadcastCommsEventToUser(actor, {
      type: 'comms:sync',
      unreadCount: counts.unreadCount,
      countsByFolder: counts.countsByFolder,
    });
  }

  void addPortalAuditLog({
    category: 'communications',
    action: 'CHANNEL_DELETED',
    title: `حذف کامل کانال گروهی: ${existing.name}`,
    title_en: `Group Channel Deleted: ${existing.nameEn || existing.name}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: senderIp || '127.0.0.1',
    },
    target: {
      type: 'comms_channel',
      id: channelId,
      name: existing.nameEn || existing.name,
    },
    severity: 'warning',
    status: 'success',
    details: `کانال «${existing.name}» به‌صورت کامل توسط ${actor.username} حذف شد.`,
    details_en: `Group channel "${existing.nameEn || existing.name}" deleted by ${actor.username}.`,
  }).catch(() => {});

  return { channelId };
}

export async function postChannelMessage(
  senderUser: CommsActor,
  senderIp: string,
  channelId: string,
  payload: {
    body: string;
    bodyEn?: string;
    priority?: CommsSeverity;
    replyToMessageId?: string | null;
    linkedEntityType?: string | null;
    linkedEntityId?: string | null;
    linkedEntityName?: string | null;
    entityRefs?: CommsEntityMentionRef[];
  }
): Promise<CommsMessage> {
  const entityRefs = sanitizeEntityRefs(payload.entityRefs);
  let body = (payload.body || '').trim();
  if (!body && entityRefs.length === 0) {
    throw new Error('Message body is required.');
  }
  if (!body && entityRefs.length > 0) {
    body = '📌 ارجاع به تجهیز / سرور / پورت شبکه';
  }

  await ensurePostgresConnection();
  const pool = getPgPool();

  const [channel, parentRowPg] = await Promise.all([
    loadHydratedChannelForUser(channelId, senderUser),
    payload.replyToMessageId && isPostgresConnected() && pool
      ? pool
          .query(`SELECT * FROM comms_messages WHERE id = $1`, [payload.replyToMessageId])
          .then((r) => r.rows[0] || null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!channel) {
    throw new Error('Channel not found.');
  }

  const senderIds = new Set(resolveUserIdentifiers(senderUser));
  const members = channel.members || [];
  if (!members.some((m) => memberMatchesIdentifiers(m, senderIds))) {
    throw new Error('ACCESS_DENIED: You are not a member of this channel.');
  }

  // Strictly validate sender RBAC access for any attached entity mentions (prevent IDOR / spoofing)
  let devicesById = new Map<string, any>();
  let serversById = new Map<string, any>();
  let senderProjectedCards: CommsProjectedEntityCard[] = [];
  if (entityRefs.length > 0) {
    const needDevs = entityRefs.some((r) => r.entityType === 'device' || r.entityType === 'port');
    const needSrvs = entityRefs.some((r) => r.entityType === 'server');
    const [senderCtx, allDevs, allSrvs] = await Promise.all([
      resolveCommsViewerAccessContext(senderUser, false),
      needDevs ? getAllDevices().catch(() => []) : Promise.resolve([]),
      needSrvs ? getAllRemoteServers().catch(() => []) : Promise.resolve([]),
    ]);
    devicesById = new Map(
      (allDevs || []).filter((d: any) => d?.id).map((d: any) => [String(d.id).trim().toLowerCase(), d])
    );
    serversById = new Map(
      (allSrvs || []).filter((s: any) => s?.id).map((s: any) => [String(s.id).trim().toLowerCase(), s])
    );
    senderProjectedCards = buildProjectedCardsForViewer(entityRefs, senderCtx, devicesById, serversById);
    const forbidden = senderProjectedCards.find((c) => c.accessRestricted || c.portsRestricted);
    if (forbidden) {
      throw new Error(
        `ACCESS_DENIED: ${
          forbidden.restrictionMessageEn ||
          forbidden.portsRestrictionMessageEn ||
          'You do not have RBAC permission to reference this entity.'
        }`
      );
    }
  }

  const nowIso = new Date().toISOString();
  const msgId = makeId('cmsg');
  const bodyEn =
    (payload.bodyEn || '').trim() ||
    ((payload.body || '').trim() ? body : '📌 Referenced Network Entity');
  const msgType = channel.channelType === 'direct' ? 'direct_message' : 'channel_message';
  const senderDisplay = formatUserDisplay(senderUser.fullName, senderUser.username);

  const title =
    channel.channelType === 'direct'
      ? `پیام از ${senderDisplay}`
      : `${channel.name}: پیام جدید از ${senderDisplay}`;
  const titleEn =
    channel.channelType === 'direct'
      ? `Message from ${senderDisplay}`
      : `${channel.nameEn || channel.name}: New message from ${senderDisplay}`;

  const primaryRef = entityRefs[0] || null;
  const messageRecord = {
    id: msgId,
    channel_id: channelId,
    sender_user_id: senderUser.userId,
    sender_username: senderUser.username,
    sender_full_name: senderUser.fullName || senderUser.username,
    sender_role: senderUser.role || 'Operator',
    message_type: msgType,
    priority: payload.priority || 'info',
    title,
    title_en: titleEn,
    body,
    body_en: bodyEn,
    linked_entity_type: payload.linkedEntityType || primaryRef?.entityType || null,
    linked_entity_id: payload.linkedEntityId || primaryRef?.entityId || null,
    linked_entity_name: payload.linkedEntityName || null,
    metadata: {
      channelType: channel.channelType,
      replyToMessageId: payload.replyToMessageId || null,
      senderUsername: senderUser.username,
      ...(entityRefs.length > 0 ? { entityRefs } : {}),
    },
    created_at: nowIso,
  };

  // Evaluate recipient notification preferences concurrently
  const notifyMembers = members.filter(
    (m) => !memberMatchesIdentifiers(m, senderIds) && !m.isMuted
  );
  const summary = body.length > 140 ? `${body.slice(0, 137)}...` : body;
  const summaryEn = bodyEn.length > 140 ? `${bodyEn.slice(0, 137)}...` : bodyEn;

  const evalResults =
    notifyMembers.length > 0
      ? await Promise.all(
          notifyMembers.map(async (m) => ({
            m,
            pref: await evaluateNotificationDeliveryForUser(
              m,
              msgType as CommsCategory,
              payload.priority || 'info',
              false
            ),
          }))
        )
      : [];

  const notificationRecords: any[] = [];
  const activeRecipients: ResolvedRecipient[] = [];
  const emailTargets: PendingCommsEmailTarget[] = [];
  for (const { m, pref } of evalResults) {
    if (pref.deliverEmailNotification) {
      emailTargets.push({
        recipient: { userId: m.userId, username: m.username },
        category: msgType as CommsCategory,
        severity: payload.priority || 'info',
        senderName: senderDisplay,
        senderRole: senderUser.role || 'Operator',
        title,
        titleEn,
        body,
        bodyEn,
        linkedEntityName: payload.linkedEntityName || null,
        channelName: channel.channelType === 'direct' ? null : channel.nameEn || channel.name,
      });
    }
    if (!pref.deliverInboxNotification) continue;
    activeRecipients.push({ userId: m.userId, username: m.username });
    notificationRecords.push({
      id: makeId('notif'),
      recipient_user_id: m.userId,
      recipient_username: m.username,
      source_message_id: msgId,
      channel_id: channelId,
      category: msgType,
      severity: payload.priority || 'info',
      sender_name: senderDisplay,
      sender_role: senderUser.role || 'Operator',
      title,
      title_en: titleEn,
      summary,
      summary_en: summaryEn,
      body,
      body_en: bodyEn,
      linked_entity_type: payload.linkedEntityType || null,
      linked_entity_id: payload.linkedEntityId || null,
      linked_entity_name: payload.linkedEntityName || null,
      action_tab: 'communications',
      is_read: false,
      is_archived: false,
      requires_acknowledgment: false,
      metadata: {
        channelId,
        channelType: channel.channelType,
        sourceMessageId: msgId,
        senderUsername: senderUser.username,
        replyToMessageId: payload.replyToMessageId || null,
        quietHoursMuted: pref.quietHoursMuted,
        playSound: pref.playSound,
      },
      created_at: nowIso,
    });
  }

  // Persist message, batched notifications, channel timestamp & sender read pointer in one pass
  await persistMessageAndNotifications(
    messageRecord,
    notificationRecords,
    activeRecipients,
    {
      channelId,
      updatedAt: nowIso,
      senderIds: Array.from(senderIds),
      messageId: msgId,
    }
  );

  if (emailTargets.length > 0) {
    void dispatchCommsEmailsAsync(emailTargets);
  }

  // Hydrate reply preview if parent exists
  let parentLookup: Map<string, any> | undefined;
  if (payload.replyToMessageId) {
    const parentRow =
      parentRowPg ||
      (loadFallbackStore().comms_messages || []).find(
        (m: any) => m.id === payload.replyToMessageId
      );
    if (parentRow) {
      parentLookup = new Map([[parentRow.id, parentRow]]);
    }
  }

  const mappedMessage = mapMessageRow(messageRecord, parentLookup);
  if (senderProjectedCards.length > 0) {
    mappedMessage.entityCards = senderProjectedCards;
  }

  // Project entity cards per-recipient RBAC policy before broadcasting over WebSocket (Zero-Leak)
  if (entityRefs.length > 0) {
    const projectedByMemberKey = new Map<string, CommsMessage>();
    await Promise.all(
      members.map(async (m) => {
        const key = `${(m.userId || '').toLowerCase()}|${(m.username || '').toLowerCase()}`;
        const memberCtx = await resolveCommsViewerAccessContext(
          { userId: m.userId, username: m.username, role: m.role },
          false
        );
        const memberCards = buildProjectedCardsForViewer(
          entityRefs,
          memberCtx,
          devicesById,
          serversById
        );
        projectedByMemberKey.set(key, {
          ...mappedMessage,
          linkedEntityName: memberCards[0]?.accessRestricted ? null : mappedMessage.linkedEntityName,
          entityCards: memberCards,
        });
      })
    );

    broadcastCommsEventToRecipients(
      members.map((m) => ({ userId: m.userId, username: m.username })),
      (recipient) => {
        const key = `${(recipient.userId || '').toLowerCase()}|${(recipient.username || '').toLowerCase()}`;
        return {
          type: 'channel:message',
          channelId,
          message: projectedByMemberKey.get(key) || mappedMessage,
        };
      }
    );
  } else {
    // Broadcast live thread update immediately to all members (synchronous WS frame send)
    broadcastCommsEventToRecipients(
      members.map((m) => ({ userId: m.userId, username: m.username })),
      undefined,
      {
        type: 'channel:message',
        channelId,
        message: mappedMessage,
      }
    );
  }

  // Record audit trail asynchronously without blocking chat message HTTP response
  void addPortalAuditLog({
    category: 'communications',
    action: 'CHANNEL_MESSAGE_SENT',
    title: `ارسال پیام در ${channel.channelType === 'direct' ? 'گفتگوی مستقیم' : 'کانال گروهی'}`,
    title_en: `Message Sent in ${channel.channelType === 'direct' ? 'Direct Chat' : 'Group Channel'}`,
    actor: {
      username: senderUser.username,
      role: senderUser.role || 'Operator',
      ipAddress: senderIp || '127.0.0.1',
    },
    target: {
      type: 'comms_channel',
      id: channelId,
      name: channel.nameEn || channel.name,
    },
    severity: payload.priority || 'info',
    status: 'success',
    details: `ارسال پیام در کانال "${channel.name}" برای ${members.length} عضو.`,
    details_en: `Posted message in "${channel.nameEn || channel.name}" (${members.length} members).`,
  }).catch(() => {});

  return mappedMessage;
}

export async function replyToInboxNotification(
  senderUser: CommsActor,
  senderIp: string,
  notificationId: string,
  payload: { body: string; priority?: CommsSeverity }
): Promise<{ channel: CommsChannel; message: CommsMessage }> {
  const identifiers = resolveUserIdentifiers(senderUser);
  const idSet = new Set(identifiers);

  let notif: CommsNotificationItem | null = null;
  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM comms_notifications
         WHERE id = $1
           AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
        [notificationId, identifiers]
      );
      if (res.rows[0]) notif = mapNotificationRow(res.rows[0]);
    } catch {}
  }

  if (!notif) {
    const store = loadFallbackStore();
    const raw = (store.comms_notifications || []).find(
      (n: any) =>
        n.id === notificationId &&
        (idSet.has((n.recipient_user_id || n.recipientUserId || '').toLowerCase()) ||
          idSet.has((n.recipient_username || n.recipientUsername || '').toLowerCase()))
    );
    if (raw) notif = mapNotificationRow(raw);
  }

  if (!notif) {
    throw new Error('Notification not found.');
  }

  let targetChannel: CommsChannel | null = null;
  if (notif.channelId) {
    targetChannel = await loadHydratedChannelForUser(notif.channelId, senderUser);
  }

  if (!targetChannel) {
    let senderIdent = notif.metadata?.senderUsername || '';
    if (!senderIdent && notif.sourceMessageId) {
      if (isPostgresConnected() && pool) {
        try {
          const mRes = await pool.query(
            `SELECT sender_username, sender_user_id FROM comms_messages WHERE id = $1`,
            [notif.sourceMessageId]
          );
          senderIdent = mRes.rows[0]?.sender_username || mRes.rows[0]?.sender_user_id || '';
        } catch {}
      }
      if (!senderIdent) {
        const msg = (loadFallbackStore().comms_messages || []).find(
          (m: any) => m.id === notif!.sourceMessageId
        );
        senderIdent = msg?.sender_username || msg?.sender_user_id || '';
      }
    }

    if (!senderIdent) {
      throw new Error('Only user-originated messages support direct reply.');
    }

    const opened = await createOrOpenDirectChannel(senderUser, senderIdent);
    targetChannel = opened.channel;
  }

  const posted = await postChannelMessage(senderUser, senderIp, targetChannel.id, {
    body: payload.body,
    priority: payload.priority || 'info',
    replyToMessageId: notif.sourceMessageId || null,
    linkedEntityType: notif.linkedEntityType || null,
    linkedEntityId: notif.linkedEntityId || null,
    linkedEntityName: notif.linkedEntityName || null,
  });

  const refreshedChannel = (await loadHydratedChannelForUser(targetChannel.id, senderUser)) || targetChannel;
  return { channel: refreshedChannel, message: posted };
}

export async function listSentAnnouncements(
  actor: CommsActor,
  isSuperAdmin: boolean
): Promise<CommsAnnouncementSummary[]> {
  const actorIds = new Set(resolveUserIdentifiers(actor));
  let messages: any[] = [];
  let notifications: any[] = [];

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const mRes = isSuperAdmin
        ? await pool.query(
            `SELECT * FROM comms_messages WHERE message_type = 'announcement' ORDER BY created_at DESC LIMIT 100`
          )
        : await pool.query(
            `SELECT * FROM comms_messages
             WHERE message_type = 'announcement'
               AND (LOWER(sender_user_id) = ANY($1::text[]) OR LOWER(sender_username) = ANY($1::text[]))
             ORDER BY created_at DESC LIMIT 100`,
            [Array.from(actorIds)]
          );
      messages = mRes.rows;

      const msgIds = messages.map((m) => m.id);
      if (msgIds.length > 0) {
        const nRes = await pool.query(
          `SELECT id, source_message_id, is_read, acknowledged_at FROM comms_notifications
           WHERE source_message_id = ANY($1::text[])`,
          [msgIds]
        );
        notifications = nRes.rows;
      }
    } catch (err: any) {
      console.error('[CommsService] listSentAnnouncements PG error:', err?.message || err);
    }
  }

  if (messages.length === 0) {
    const store = loadFallbackStore();
    messages = (store.comms_messages || [])
      .filter((m: any) => (m.message_type ?? m.messageType) === 'announcement')
      .filter((m: any) => {
        if (isSuperAdmin) return true;
        return memberMatchesIdentifiers(
          { userId: m.sender_user_id ?? m.senderUserId, username: m.sender_username ?? m.senderUsername },
          actorIds
        );
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at || b.createdAt).getTime() -
          new Date(a.created_at || a.createdAt).getTime()
      )
      .slice(0, 100);
    notifications = store.comms_notifications || [];
  }

  const byMsgId = new Map<string, { total: number; read: number; acked: number }>();
  for (const n of notifications) {
    const mid = n.source_message_id ?? n.sourceMessageId;
    if (!mid) continue;
    let stat = byMsgId.get(mid);
    if (!stat) {
      stat = { total: 0, read: 0, acked: 0 };
      byMsgId.set(mid, stat);
    }
    stat.total++;
    if (n.is_read ?? n.isRead) stat.read++;
    if (n.acknowledged_at ?? n.acknowledgedAt) stat.acked++;
  }

  return messages.map((m) => {
    const meta =
      typeof m.metadata === 'string'
        ? (() => {
            try {
              return JSON.parse(m.metadata);
            } catch {
              return {};
            }
          })()
        : m.metadata || {};
    const stats = byMsgId.get(m.id) || { total: 0, read: 0, acked: 0 };
    const senderFull = m.sender_full_name ?? m.senderFullName;
    const senderUser = m.sender_username ?? m.senderUsername;
    return {
      messageId: m.id,
      title: m.title || '',
      titleEn: m.title_en ?? m.titleEn ?? null,
      body: m.body || '',
      priority: (m.priority || 'info') as CommsSeverity,
      senderName: formatUserDisplay(senderFull, senderUser) || 'Manager',
      requiresAcknowledgment: Boolean(meta.requiresAcknowledgment),
      totalRecipients: stats.total,
      readCount: stats.read,
      acknowledgedCount: stats.acked,
      createdAt: m.created_at
        ? new Date(m.created_at).toISOString()
        : m.createdAt || new Date().toISOString(),
    };
  });
}

export async function getAnnouncementReceipts(
  actor: CommsActor,
  isSuperAdmin: boolean,
  messageId: string
): Promise<CommsAnnouncementTrackerResponse> {
  const dirMap = await buildDirectoryUserMap();
  const actorIds = new Set(resolveUserIdentifiers(actor));

  let msgRow: any = null;
  let notifRows: any[] = [];

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const mRes = await pool.query(`SELECT * FROM comms_messages WHERE id = $1`, [messageId]);
      if (mRes.rows[0]) {
        msgRow = mRes.rows[0];
        const nRes = await pool.query(
          `SELECT * FROM comms_notifications WHERE source_message_id = $1 ORDER BY recipient_username ASC`,
          [messageId]
        );
        notifRows = nRes.rows;
      }
    } catch (err: any) {
      console.error('[CommsService] getAnnouncementReceipts PG error:', err?.message || err);
    }
  }

  if (!msgRow) {
    const store = loadFallbackStore();
    msgRow = (store.comms_messages || []).find((m: any) => m.id === messageId) || null;
    if (msgRow) {
      notifRows = (store.comms_notifications || []).filter(
        (n: any) => (n.source_message_id ?? n.sourceMessageId) === messageId
      );
    }
  }

  if (!msgRow) {
    throw new Error('Announcement not found.');
  }

  const isOwner = memberMatchesIdentifiers(
    { userId: msgRow.sender_user_id ?? msgRow.senderUserId, username: msgRow.sender_username ?? msgRow.senderUsername },
    actorIds
  );
  if (!isSuperAdmin && !isOwner) {
    throw new Error('ACCESS_DENIED: Cannot view receipts for another sender announcement.');
  }

  const meta =
    typeof msgRow.metadata === 'string'
      ? (() => {
          try {
            return JSON.parse(msgRow.metadata);
          } catch {
            return {};
          }
        })()
      : msgRow.metadata || {};

  const recipients: CommsAnnouncementReadReceipt[] = notifRows.map((n) => {
    const rUser = n.recipient_username ?? n.recipientUsername ?? '';
    const rId = n.recipient_user_id ?? n.recipientUserId ?? '';
    const dirInfo = dirMap.get(rUser.toLowerCase()) || dirMap.get(rId.toLowerCase());
    return {
      notificationId: n.id,
      recipientUserId: rId,
      recipientUsername: rUser,
      fullName: dirInfo?.fullName || rUser,
      role: dirInfo?.role || null,
      isRead: Boolean(n.is_read ?? n.isRead),
      readAt: n.read_at ? new Date(n.read_at).toISOString() : n.readAt || null,
      acknowledgedAt: n.acknowledged_at
        ? new Date(n.acknowledged_at).toISOString()
        : n.acknowledgedAt || null,
      createdAt: n.created_at
        ? new Date(n.created_at).toISOString()
        : n.createdAt || new Date().toISOString(),
    };
  });

  const readCount = recipients.filter((r) => r.isRead).length;
  const acknowledgedCount = recipients.filter((r) => Boolean(r.acknowledgedAt)).length;
  const senderFull = msgRow.sender_full_name ?? msgRow.senderFullName;
  const senderUser = msgRow.sender_username ?? msgRow.senderUsername;

  return {
    announcement: {
      messageId: msgRow.id,
      title: msgRow.title || '',
      titleEn: msgRow.title_en ?? msgRow.titleEn ?? null,
      body: msgRow.body || '',
      priority: (msgRow.priority || 'info') as CommsSeverity,
      senderName: formatUserDisplay(senderFull, senderUser) || 'Manager',
      requiresAcknowledgment: Boolean(meta.requiresAcknowledgment),
      totalRecipients: recipients.length,
      readCount,
      acknowledgedCount,
      createdAt: msgRow.created_at
        ? new Date(msgRow.created_at).toISOString()
        : msgRow.createdAt || new Date().toISOString(),
    },
    recipients,
  };
}

// ==============================================================================
// Phase 2: RBAC-Enforced ChatOps Slash Commands Engine
// ==============================================================================

async function executeIcmpPingProbe(
  targetHost: string,
  count = 3,
  timeoutSec = 1
): Promise<{
  is_online: boolean;
  latency_ms: number | null;
  packet_loss: number;
  raw_output: string;
}> {
  const cleanHost = String(targetHost || '').trim();
  if (!cleanHost || !/^[a-zA-Z0-9.:_-]{1,253}$/.test(cleanHost) || cleanHost.startsWith('-')) {
    throw new Error('INVALID_TARGET: Invalid IP address or hostname format for /ping.');
  }
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(
      'ping',
      ['-c', String(count), '-W', String(timeoutSec), cleanHost],
      { timeout: (count * timeoutSec + 3) * 1000 }
    );
    const raw = (stdout || stderr || '').trim();
    const elapsed = Date.now() - start;
    const lossMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\%\s*packet\s*loss/i);
    const lossPct = lossMatch ? parseFloat(lossMatch[1]) : 100;
    const rttMatch = raw.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*([0-9\.]+)\/([0-9\.]+)\/([0-9\.]+)/i);
    const avgLatency = rttMatch ? parseFloat(rttMatch[2]) : elapsed;
    return {
      is_online: lossPct < 100,
      latency_ms: lossPct < 100 ? Math.round(avgLatency * 10) / 10 : null,
      packet_loss: lossPct,
      raw_output: raw,
    };
  } catch (err: any) {
    const raw = (err?.stdout || err?.stderr || err?.message || '').toString().trim();
    const lossMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\%\s*packet\s*loss/i);
    const lossPct = lossMatch ? parseFloat(lossMatch[1]) : 100;
    return {
      is_online: false,
      latency_ms: null,
      packet_loss: lossPct,
      raw_output: raw || 'Host unreachable / Request timed out',
    };
  }
}

function normalizeInterfaceLookupToken(raw: string): string {
  const s = (raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  return s
    .replace(/^tengigabitethernet/, 'te')
    .replace(/^gigabitethernet/, 'gi')
    .replace(/^fastethernet/, 'fa')
    .replace(/^ethernet/, 'eth')
    .replace(/^twentyfivegige/, 'twe')
    .replace(/^fortygigabitethernet/, 'fo')
    .replace(/^port-channel/, 'po');
}

function resolveInventoryTargetByQuery(
  queryToken: string,
  allDevices: any[],
  allServers: any[]
): { kind: 'device' | 'server'; record: any } | null {
  const q = (queryToken || '').trim().toLowerCase();
  if (!q) return null;

  const devExact = allDevices.find(
    (d) =>
      String(d?.id || '').toLowerCase() === q ||
      String(d?.name || '').toLowerCase() === q ||
      String(d?.ip || '').toLowerCase() === q ||
      String(d?.ssh_host || '').toLowerCase() === q
  );
  if (devExact) return { kind: 'device', record: devExact };

  const srvExact = allServers.find(
    (s) =>
      String(s?.id || '').toLowerCase() === q ||
      String(s?.name || '').toLowerCase() === q ||
      String(s?.host || '').toLowerCase() === q
  );
  if (srvExact) return { kind: 'server', record: srvExact };

  const devPartial = allDevices.filter((d) =>
    String(d?.name || '').toLowerCase().includes(q)
  );
  const srvPartial = allServers.filter((s) =>
    String(s?.name || '').toLowerCase().includes(q)
  );
  if (devPartial.length === 1 && srvPartial.length === 0) {
    return { kind: 'device', record: devPartial[0] };
  }
  if (srvPartial.length === 1 && devPartial.length === 0) {
    return { kind: 'server', record: srvPartial[0] };
  }
  return null;
}

export async function executeChannelSlashCommand(
  senderUser: CommsActor,
  isSuperAdmin: boolean,
  senderIp: string,
  channelId: string,
  payload: {
    commandText: string;
    priority?: CommsSeverity;
    replyToMessageId?: string | null;
  }
): Promise<CommsMessage> {
  const rawCommand = (payload.commandText || '').trim();
  if (!rawCommand.startsWith('/')) {
    throw new Error('BAD_COMMAND: Slash command must start with / (e.g. /ping, /mac, /port, /status, /dns).');
  }

  const tokens = rawCommand.split(/\s+/).filter(Boolean);
  const cmdRaw = (tokens[0] || '').slice(1).toLowerCase();
  const cmdNormalized: CommsSlashCommandName | null =
    cmdRaw === 'ping'
      ? 'ping'
      : cmdRaw === 'mac'
      ? 'mac'
      : cmdRaw === 'port'
      ? 'port'
      : cmdRaw === 'status' || cmdRaw === 'uptime'
      ? 'status'
      : cmdRaw === 'dns'
      ? 'dns'
      : null;

  if (!cmdNormalized) {
    throw new Error(
      `UNSUPPORTED_COMMAND: Unknown command "/${cmdRaw}". Supported: /ping, /mac, /port, /status, /dns`
    );
  }

  await ensurePostgresConnection();
  const pool = getPgPool();

  const [channel, parentRowPg, senderCtx, allDevices, allServers] = await Promise.all([
    loadHydratedChannelForUser(channelId, senderUser),
    payload.replyToMessageId && isPostgresConnected() && pool
      ? pool
          .query(`SELECT * FROM comms_messages WHERE id = $1`, [payload.replyToMessageId])
          .then((r) => r.rows[0] || null)
          .catch(() => null)
      : Promise.resolve(null),
    resolveCommsViewerAccessContext(senderUser, isSuperAdmin),
    getAllDevices().catch(() => []),
    getAllRemoteServers().catch(() => []),
  ]);

  if (!channel) {
    throw new Error('Channel not found.');
  }
  const senderIds = new Set(resolveUserIdentifiers(senderUser));
  const members = channel.members || [];
  if (!members.some((m) => memberMatchesIdentifiers(m, senderIds))) {
    throw new Error('ACCESS_DENIED: You are not a member of this channel.');
  }

  const devicesById = new Map<string, any>(
    (allDevices || [])
      .filter((d: any) => d?.id)
      .map((d: any) => [String(d.id).trim().toLowerCase(), d])
  );
  const serversById = new Map<string, any>(
    (allServers || [])
      .filter((s: any) => s?.id)
      .map((s: any) => [String(s.id).trim().toLowerCase(), s])
  );

  const startedAt = Date.now();
  const executedAt = new Date().toISOString();
  let slashCommandData: any = null;
  let body = '';
  let bodyEn = '';
  let linkedEntityType: string | null = null;
  let linkedEntityId: string | null = null;
  let linkedEntityName: string | null = null;

  if (cmdNormalized === 'ping' || cmdNormalized === 'status') {
    const targetArg = tokens.slice(1).join(' ').trim();
    if (!targetArg) {
      throw new Error(
        `BAD_COMMAND: Usage: /${cmdNormalized} <device-name | server-name${
          cmdNormalized === 'ping' ? ' | ip | host' : ''
        }>`
      );
    }

    const matched = resolveInventoryTargetByQuery(targetArg, allDevices, allServers);
    if (cmdNormalized === 'status' && !matched) {
      throw new Error(
        `NOT_FOUND: No matching network device or server found for "${targetArg}".`
      );
    }

    if (matched?.kind === 'device') {
      const dev = matched.record;
      const gate = isDeviceVisibleInViewerCtx(dev.id, senderCtx);
      if (!gate.allowed) {
        throw new Error(
          gate.reasonCode === 'module_disabled'
            ? 'ACCESS_DENIED: Network Devices module is disabled in your RBAC policy.|عدم دسترسی RBAC: ماژول تجهیزات شبکه در پالیسی کاربری شما غیرفعال است.'
            : 'ACCESS_DENIED: You do not have RBAC access to this device.|عدم دسترسی RBAC: این تجهیز خارج از محدوده دسترسی مجاز شما قرار دارد.'
        );
      }
      if (
        !senderCtx.isSuperAdmin &&
        senderCtx.policy &&
        !isDeviceActionPermitted(senderCtx.policy, dev.id, 'ping_keepalive')
      ) {
        throw new Error(
          `ACCESS_DENIED: Your RBAC policy denies "ping_keepalive" on "${dev.name || dev.id}".|عدم دسترسی RBAC: مجوز تست پینگ (ping_keepalive) برای تجهیز «${dev.name || dev.id}» در پالیسی شما مجاز نیست.`
        );
      }

      const probeIp = String(dev.ip || dev.ssh_host || '').trim();
      const probe = await executeIcmpPingProbe(probeIp, cmdNormalized === 'ping' ? 3 : 2, 1);
      const devLoc =
        dev.location ||
        [dev.building, dev.floor, dev.rack].filter(Boolean).join(' / ') ||
        undefined;

      linkedEntityType = 'device';
      linkedEntityId = dev.id;
      slashCommandData = {
        command: cmdNormalized,
        rawCommand,
        target: dev.name || probeIp,
        executedAt,
        durationMs: Date.now() - startedAt,
        success: true,
        linkedEntityType: 'device',
        linkedEntityId: dev.id,
        entityName: dev.name || dev.id,
        entityIp: probeIp,
        platform: dev.platform || dev.type || 'switch',
        location: devLoc,
        isOnline: probe.is_online,
        latencyMs: probe.latency_ms,
        packetLoss: probe.packet_loss,
        rawOutput: probe.raw_output,
      };
      body = `📡 /${cmdNormalized} ${dev.name || probeIp} — ${
        probe.is_online
          ? `آنلاین (${probe.latency_ms ?? '-'}ms، افت بسته ${probe.packet_loss}%)`
          : `آفلاین / عدم پاسخ (افت بسته ${probe.packet_loss}%)`
      }`;
      bodyEn = `📡 /${cmdNormalized} ${dev.name || probeIp} — ${
        probe.is_online
          ? `Online (${probe.latency_ms ?? '-'}ms, ${probe.packet_loss}% loss)`
          : `Unreachable (${probe.packet_loss}% loss)`
      }`;
    } else if (matched?.kind === 'server') {
      const srv = matched.record;
      const gate = isServerVisibleInViewerCtx(srv.id, senderCtx);
      if (!gate.allowed) {
        throw new Error(
          gate.reasonCode === 'module_disabled'
            ? 'ACCESS_DENIED: Remote Servers module is disabled in your RBAC policy.|عدم دسترسی RBAC: ماژول سرورهای ریموت در پالیسی شما غیرفعال است.'
            : 'ACCESS_DENIED: You do not have RBAC access to this server.|عدم دسترسی RBAC: این سرور خارج از محدوده سرورهای مجاز شما قرار دارد.'
        );
      }
      const probeHost = String(srv.host || '').trim();
      const probe = await executeIcmpPingProbe(probeHost, cmdNormalized === 'ping' ? 3 : 2, 1);

      linkedEntityType = 'server';
      linkedEntityId = srv.id;
      slashCommandData = {
        command: cmdNormalized,
        rawCommand,
        target: srv.name || probeHost,
        executedAt,
        durationMs: Date.now() - startedAt,
        success: true,
        linkedEntityType: 'server',
        linkedEntityId: srv.id,
        entityName: srv.name || srv.id,
        entityIp: probeHost,
        osType: srv.os_type || 'linux',
        platform: srv.distro || srv.os_type || 'linux',
        location: srv.location || srv.category || undefined,
        isOnline: probe.is_online,
        latencyMs: probe.latency_ms,
        packetLoss: probe.packet_loss,
        rawOutput: probe.raw_output,
      };
      body = `🖥️ /${cmdNormalized} ${srv.name || probeHost} — ${
        probe.is_online
          ? `آنلاین (${probe.latency_ms ?? '-'}ms، افت بسته ${probe.packet_loss}%)`
          : `آفلاین / عدم پاسخ (افت بسته ${probe.packet_loss}%)`
      }`;
      bodyEn = `🖥️ /${cmdNormalized} ${srv.name || probeHost} — ${
        probe.is_online
          ? `Online (${probe.latency_ms ?? '-'}ms, ${probe.packet_loss}% loss)`
          : `Unreachable (${probe.packet_loss}% loss)`
      }`;
    } else {
      // General IP or hostname (/ping only)
      const probe = await executeIcmpPingProbe(targetArg, 3, 1);
      slashCommandData = {
        command: 'ping',
        rawCommand,
        target: targetArg,
        executedAt,
        durationMs: Date.now() - startedAt,
        success: true,
        entityIp: targetArg,
        isOnline: probe.is_online,
        latencyMs: probe.latency_ms,
        packetLoss: probe.packet_loss,
        rawOutput: probe.raw_output,
      };
      body = `📡 /ping ${targetArg} — ${
        probe.is_online
          ? `در دسترس (${probe.latency_ms ?? '-'}ms، افت بسته ${probe.packet_loss}%)`
          : `غیرقابل دسترس (افت بسته ${probe.packet_loss}%)`
      }`;
      bodyEn = `📡 /ping ${targetArg} — ${
        probe.is_online
          ? `Reachable (${probe.latency_ms ?? '-'}ms, ${probe.packet_loss}% loss)`
          : `Unreachable (${probe.packet_loss}% loss)`
      }`;
    }
  } else if (cmdNormalized === 'port') {
    let devArg = tokens[1] || '';
    let portArg = tokens.slice(2).join(' ').trim();
    if (!portArg && devArg.includes(':')) {
      const colonIdx = devArg.lastIndexOf(':');
      portArg = devArg.slice(colonIdx + 1).trim();
      devArg = devArg.slice(0, colonIdx).trim();
    }
    if (!devArg || !portArg) {
      throw new Error('BAD_COMMAND: Usage: /port <device-name-or-ip> <port-name>');
    }

    let matched = resolveInventoryTargetByQuery(devArg, allDevices, []);
    if (!matched && tokens.length > 3) {
      const multiDevArg = tokens.slice(1, -1).join(' ').trim();
      const lastPortArg = (tokens[tokens.length - 1] || '').trim();
      const multiMatched = resolveInventoryTargetByQuery(multiDevArg, allDevices, []);
      if (multiMatched && lastPortArg) {
        matched = multiMatched;
        devArg = multiDevArg;
        portArg = lastPortArg;
      }
    }
    if (!matched || matched.kind !== 'device') {
      throw new Error(`NOT_FOUND: Network device "${devArg}" was not found.`);
    }
    const dev = matched.record;
    const gate = isDeviceVisibleInViewerCtx(dev.id, senderCtx);
    if (!gate.allowed) {
      throw new Error(
        gate.reasonCode === 'module_disabled'
          ? 'ACCESS_DENIED: Network Devices module is disabled in your RBAC policy.|عدم دسترسی RBAC: ماژول تجهیزات شبکه در پالیسی شما غیرفعال است.'
          : 'ACCESS_DENIED: You do not have RBAC access to this device.|عدم دسترسی RBAC: این تجهیز خارج از محدوده دسترسی مجاز شما قرار دارد.'
      );
    }

    const canInspectPorts =
      senderCtx.isSuperAdmin ||
      (senderCtx.policy?.canViewPorts !== false &&
        (!senderCtx.policy || isDeviceActionPermitted(senderCtx.policy, dev.id, 'inspect_ports')));
    if (!canInspectPorts) {
      throw new Error(
        `ACCESS_DENIED: Your RBAC policy denies "inspect_ports" on "${dev.name || dev.id}".|عدم دسترسی RBAC: مجوز مشاهده وضعیت پورت‌ها برای تجهیز «${dev.name || dev.id}» در پالیسی شما فعال نیست.`
      );
    }

    const portsArr: any[] = Array.isArray(dev.ports) ? dev.ports : [];
    const targetLower = portArg.toLowerCase();
    const targetNorm = normalizeInterfaceLookupToken(portArg);
    const foundPort = portsArr.find((p: any) => {
      const pName = String(p?.port_id || p?.port || p?.name || '').trim();
      if (!pName) return false;
      const pLower = pName.toLowerCase();
      const pNorm = normalizeInterfaceLookupToken(pName);
      return (
        pLower === targetLower ||
        pNorm === targetNorm ||
        (targetNorm.length >= 2 && (pNorm.endsWith(targetNorm) || pLower.endsWith(`/${targetLower}`)))
      );
    });

    if (!foundPort) {
      throw new Error(
        `NOT_FOUND: Port "${portArg}" was not found in synced inventory of "${dev.name || dev.id}" (${portsArr.length} ports cached).|پورت «${portArg}» در اطلاعات همگام‌سازی‌شده تجهیز «${dev.name || dev.id}» (${portsArr.length} پورت) یافت نشد.`
      );
    }

    const resolvedPortId = String(foundPort.port_id || foundPort.port || foundPort.name).trim();
    linkedEntityType = 'port';
    linkedEntityId = dev.id;
    slashCommandData = {
      command: 'port',
      rawCommand,
      target: `${dev.name || dev.id} · ${resolvedPortId}`,
      executedAt,
      durationMs: Date.now() - startedAt,
      success: true,
      linkedEntityType: 'device',
      linkedEntityId: dev.id,
      portId: resolvedPortId,
      entityName: dev.name || dev.id,
      entityIp: dev.ip || dev.ssh_host || '',
      platform: dev.platform || dev.type || 'switch',
      portStatus: foundPort.status || 'down',
      portAdminStatus: foundPort.admin_status || 'enabled',
      portMode: foundPort.mode || 'access',
      portVlan: foundPort.vlan,
      portSpeed: foundPort.speed || undefined,
      portDescription: foundPort.description || undefined,
      connectedDevice: foundPort.connected_device || undefined,
      lastSynced: foundPort.last_synced || dev.last_seen || undefined,
    };
    body = `🔌 /port ${dev.name || dev.id} [${resolvedPortId}] — وضعیت: ${
      foundPort.status || 'down'
    } | VLAN ${foundPort.vlan ?? '-'}`;
    bodyEn = `🔌 /port ${dev.name || dev.id} [${resolvedPortId}] — Status: ${
      foundPort.status || 'down'
    } | VLAN ${foundPort.vlan ?? '-'}`;
  } else if (cmdNormalized === 'mac') {
    const args = tokens.slice(1);
    const liveFlag = args.some((a) => a.toLowerCase() === '--live' || a.toLowerCase() === 'live');
    const addrArg = args.find((a) => !a.startsWith('--') && a.toLowerCase() !== 'live') || '';
    if (!addrArg) {
      throw new Error('BAD_COMMAND: Usage: /mac <MAC-or-IPv4> [--live]');
    }

    if (!senderCtx.isSuperAdmin && senderCtx.policy?.canViewDevices === false) {
      throw new Error(
        'ACCESS_DENIED: Network Devices module is disabled in your RBAC policy.|عدم دسترسی RBAC: ماژول تجهیزات شبکه برای اجرای /mac در پالیسی شما غیرفعال است.'
      );
    }
    if (!senderCtx.isSuperAdmin && senderCtx.policy?.canViewPorts === false) {
      throw new Error(
        'ACCESS_DENIED: Port view permission is required for /mac CAM lookup.|عدم دسترسی RBAC: مجوز مشاهده پورت‌ها (canViewPorts) برای ردیابی MAC الزامی است.'
      );
    }

    const allowedIdsForSender: string[] | null = senderCtx.isSuperAdmin
      ? null
      : (allDevices || [])
          .filter(
            (d: any) =>
              d?.id &&
              isDeviceVisibleInViewerCtx(d.id, senderCtx).allowed &&
              (!senderCtx.policy || isDeviceActionPermitted(senderCtx.policy, d.id, 'inspect_ports'))
          )
          .map((d: any) => String(d.id));

    const trackerRes = await searchMacOrIp({
      query: addrArg,
      forceRefresh: liveFlag,
      operatorUsername: senderUser.username,
      clientIp: senderIp,
      allowedDeviceIds: allowedIdsForSender,
    });

    const camHits = (trackerRes.camEntries || []).map((c) => ({
      switchId: c.switchId,
      switchName: c.switchName,
      switchIp: c.switchIp,
      port: c.port,
      vlan: String(c.vlan || '-'),
      type: c.type || 'DYNAMIC',
      isUplink: Boolean(c.isUplink),
      isFinalEdgePort: Boolean(c.isFinalEdgePort),
    }));
    const arpHits = (trackerRes.arpEntries || []).map((a) => ({
      switchId: a.switchId,
      switchName: a.switchName,
      ip: a.ip,
      mac: a.mac,
      interface: a.interface,
      vlan: a.vlan,
    }));
    const finalEdge = trackerRes.finalEdgePort
      ? {
          switchId: trackerRes.finalEdgePort.switchId,
          switchName: trackerRes.finalEdgePort.switchName,
          switchIp: trackerRes.finalEdgePort.switchIp,
          port: trackerRes.finalEdgePort.port,
          vlan: String(trackerRes.finalEdgePort.vlan || '-'),
          confidence: trackerRes.finalEdgePort.confidence,
        }
      : null;

    if (finalEdge) {
      linkedEntityType = 'port';
      linkedEntityId = finalEdge.switchId;
    }

    const macLabel = trackerRes.normalizedMac?.standardUpper || trackerRes.resolvedMac || addrArg;
    slashCommandData = {
      command: 'mac',
      rawCommand,
      target: addrArg,
      executedAt,
      durationMs: trackerRes.durationMs || Date.now() - startedAt,
      success: Boolean(finalEdge || camHits.length > 0 || arpHits.length > 0),
      queryType: trackerRes.queryType,
      resolvedIp: trackerRes.resolvedIp,
      resolvedMac: macLabel,
      vendorName: trackerRes.vendor?.isKnown ? trackerRes.vendor.vendor : null,
      finalEdgePort: finalEdge,
      camHits,
      arpHits,
      totalSwitchesMatched: new Set([
        ...camHits.map((h) => h.switchId.toLowerCase()),
        ...arpHits.map((h) => h.switchId.toLowerCase()),
      ]).size,
    };
    body = `🧭 /mac ${addrArg} — ${
      finalEdge
        ? `پورت لبه: ${finalEdge.switchName} [${finalEdge.port}] (VLAN ${finalEdge.vlan})`
        : camHits.length > 0
        ? `${camHits.length} رکورد CAM یافت شد`
        : 'موردی در جدول CAM/ARP سوئیچ‌های مجاز یافت نشد'
    }`;
    bodyEn = `🧭 /mac ${addrArg} — ${
      finalEdge
        ? `Edge Port: ${finalEdge.switchName} [${finalEdge.port}] (VLAN ${finalEdge.vlan})`
        : camHits.length > 0
        ? `${camHits.length} CAM table hit(s) found`
        : 'No CAM/ARP match across authorized switches'
    }`;
  } else if (cmdNormalized === 'dns') {
    const dnsTarget = (tokens[1] || '').trim();
    if (!dnsTarget || !/^[a-zA-Z0-9.:_-]{1,253}$/.test(dnsTarget)) {
      throw new Error('BAD_COMMAND: Usage: /dns <hostname-or-ipv4>');
    }
    const isIpv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(dnsTarget);
    let ipv4Addresses: string[] = [];
    let ipv6Addresses: string[] = [];
    let mxRecords: Array<{ exchange: string; priority: number }> = [];
    let ptrHostnames: string[] = [];
    let txtRecords: string[] = [];

    if (isIpv4) {
      ptrHostnames = await dns.promises.reverse(dnsTarget).catch(() => []);
    } else {
      const [a4, a6, mx, txt] = await Promise.all([
        dns.promises.resolve4(dnsTarget).catch(() => []),
        dns.promises.resolve6(dnsTarget).catch(() => []),
        dns.promises.resolveMx(dnsTarget).catch(() => []),
        dns.promises.resolveTxt(dnsTarget).catch(() => []),
      ]);
      ipv4Addresses = a4;
      ipv6Addresses = a6;
      mxRecords = mx;
      txtRecords = txt.map((parts) => parts.join(' ')).slice(0, 5);
    }

    const totalHits =
      ipv4Addresses.length + ipv6Addresses.length + mxRecords.length + ptrHostnames.length;
    slashCommandData = {
      command: 'dns',
      rawCommand,
      target: dnsTarget,
      executedAt,
      durationMs: Date.now() - startedAt,
      success: totalHits > 0,
      dnsRecordType: isIpv4 ? 'PTR' : 'A/AAAA/MX',
      ipv4Addresses,
      ipv6Addresses,
      mxRecords,
      ptrHostnames,
      txtRecords,
    };
    body = `🌐 /dns ${dnsTarget} — ${
      totalHits > 0
        ? `${totalHits} رکورد DNS بازیابی شد`
        : 'هیچ رکوردی در DNS یافت نشد'
    }`;
    bodyEn = `🌐 /dns ${dnsTarget} — ${
      totalHits > 0 ? `${totalHits} DNS record(s) resolved` : 'No DNS records returned'
    }`;
  }

  const nowIso = new Date().toISOString();
  const msgId = makeId('cmsg');
  const msgType = channel.channelType === 'direct' ? 'direct_message' : 'channel_message';
  const senderDisplay = formatUserDisplay(senderUser.fullName, senderUser.username);
  const title =
    channel.channelType === 'direct'
      ? `دستور ChatOps از ${senderDisplay}`
      : `${channel.name}: دستور ChatOps از ${senderDisplay}`;
  const titleEn =
    channel.channelType === 'direct'
      ? `ChatOps command from ${senderDisplay}`
      : `${channel.nameEn || channel.name}: ChatOps command from ${senderDisplay}`;

  const messageRecord = {
    id: msgId,
    channel_id: channelId,
    sender_user_id: senderUser.userId,
    sender_username: senderUser.username,
    sender_full_name: senderUser.fullName || senderUser.username,
    sender_role: senderUser.role || 'Operator',
    message_type: msgType,
    priority: payload.priority || 'info',
    title,
    title_en: titleEn,
    body,
    body_en: bodyEn,
    linked_entity_type: linkedEntityType,
    linked_entity_id: linkedEntityId,
    linked_entity_name: linkedEntityName,
    metadata: {
      channelType: channel.channelType,
      replyToMessageId: payload.replyToMessageId || null,
      senderUsername: senderUser.username,
      slashCommandData,
    },
    created_at: nowIso,
  };

  // Pre-compute per-member RBAC projection (used for both Zero-Leak notifications and live WS broadcast)
  const memberContextPairs = await Promise.all(
    members.map(async (m) => {
      const key = `${(m.userId || '').toLowerCase()}|${(m.username || '').toLowerCase()}`;
      const memberCtx = await resolveCommsViewerAccessContext(
        { userId: m.userId, username: m.username, role: m.role },
        false
      );
      const memberSlash = projectSlashResultForViewer(
        slashCommandData,
        memberCtx,
        devicesById,
        serversById
      );
      return { key, m, memberSlash };
    })
  );
  const slashByMemberKey = new Map(memberContextPairs.map((p) => [p.key, p.memberSlash]));

  // Notifications evaluation
  const notifyMembers = members.filter(
    (m) => !memberMatchesIdentifiers(m, senderIds) && !m.isMuted
  );
  const evalResults =
    notifyMembers.length > 0
      ? await Promise.all(
          notifyMembers.map(async (m) => ({
            m,
            pref: await evaluateNotificationDeliveryForUser(
              m,
              msgType as CommsCategory,
              payload.priority || 'info',
              false
            ),
          }))
        )
      : [];

  const redactedFa = '🔒 خروجی دستور ChatOps (دسترسی به تجهیز/سرور محدود شده است)';
  const redactedEn = '🔒 ChatOps output (Entity access restricted by RBAC)';
  const notificationRecords: any[] = [];
  const activeRecipients: ResolvedRecipient[] = [];
  for (const { m, pref } of evalResults) {
    if (!pref.deliverInboxNotification) continue;
    const key = `${(m.userId || '').toLowerCase()}|${(m.username || '').toLowerCase()}`;
    const memberSlash = slashByMemberKey.get(key);
    const notifBodyFa = memberSlash?.accessRestricted ? redactedFa : body;
    const notifBodyEn = memberSlash?.accessRestricted ? redactedEn : bodyEn;
    activeRecipients.push({ userId: m.userId, username: m.username });
    notificationRecords.push({
      id: makeId('notif'),
      recipient_user_id: m.userId,
      recipient_username: m.username,
      source_message_id: msgId,
      channel_id: channelId,
      category: msgType,
      severity: payload.priority || 'info',
      sender_name: senderDisplay,
      sender_role: senderUser.role || 'Operator',
      title,
      title_en: titleEn,
      summary: notifBodyFa.slice(0, 140),
      summary_en: notifBodyEn.slice(0, 140),
      body: notifBodyFa,
      body_en: notifBodyEn,
      linked_entity_type: null,
      linked_entity_id: null,
      linked_entity_name: null,
      action_tab: 'communications',
      is_read: false,
      is_archived: false,
      requires_acknowledgment: false,
      metadata: {
        channelId,
        channelType: channel.channelType,
        sourceMessageId: msgId,
        senderUsername: senderUser.username,
        replyToMessageId: payload.replyToMessageId || null,
        quietHoursMuted: pref.quietHoursMuted,
        playSound: pref.playSound,
      },
      created_at: nowIso,
    });
  }

  await persistMessageAndNotifications(
    messageRecord,
    notificationRecords,
    activeRecipients,
    {
      channelId,
      updatedAt: nowIso,
      senderIds: Array.from(senderIds),
      messageId: msgId,
    }
  );

  let parentLookup: Map<string, any> | undefined;
  if (payload.replyToMessageId) {
    const parentRow =
      parentRowPg ||
      (loadFallbackStore().comms_messages || []).find(
        (m: any) => m.id === payload.replyToMessageId
      );
    if (parentRow) parentLookup = new Map([[parentRow.id, parentRow]]);
  }

  const baseMapped = mapMessageRow(messageRecord, parentLookup);
  const senderSlashResult = projectSlashResultForViewer(
    slashCommandData,
    senderCtx,
    devicesById,
    serversById
  );
  const senderCleanMsg: CommsMessage = {
    ...baseMapped,
    metadata: sanitizeCleanMessageMetadata(baseMapped.metadata),
    slashResult: senderSlashResult,
  };

  // Per-recipient RBAC projection on live WebSocket broadcast (Zero-Leak)
  const projectedByMemberKey = new Map<string, CommsMessage>();
  for (const { key, memberSlash } of memberContextPairs) {
    projectedByMemberKey.set(key, {
      ...baseMapped,
      linkedEntityName: memberSlash?.accessRestricted ? null : baseMapped.linkedEntityName,
      body: memberSlash?.accessRestricted ? redactedFa : baseMapped.body,
      bodyEn: memberSlash?.accessRestricted ? redactedEn : baseMapped.bodyEn,
      metadata: sanitizeCleanMessageMetadata(baseMapped.metadata),
      slashResult: memberSlash,
    });
  }

  broadcastCommsEventToRecipients(
    members.map((m) => ({ userId: m.userId, username: m.username })),
    (recipient) => {
      const key = `${(recipient.userId || '').toLowerCase()}|${(recipient.username || '').toLowerCase()}`;
      return {
        type: 'channel:message',
        channelId,
        message: projectedByMemberKey.get(key) || senderCleanMsg,
      };
    }
  );

  void addPortalAuditLog({
    category: 'communications',
    action: 'CHANNEL_SLASH_COMMAND_EXECUTED',
    title: `اجرای دستور ChatOps (${rawCommand})`,
    title_en: `Executed ChatOps Slash Command (${rawCommand})`,
    actor: {
      username: senderUser.username,
      role: senderUser.role || 'Operator',
      ipAddress: senderIp || '127.0.0.1',
    },
    target: {
      type: 'comms_channel',
      id: channelId,
      name: channel.nameEn || channel.name,
    },
    severity: payload.priority || 'info',
    status: 'success',
    details: `کاربر ${senderUser.username} دستور "${rawCommand}" را در کانال «${channel.name}» اجرا کرد.`,
    details_en: `User ${senderUser.username} executed "${rawCommand}" in channel "${channel.nameEn || channel.name}".`,
  }).catch(() => {});

  return senderCleanMsg;
}

export async function shareChannelSnippet(
  senderUser: CommsActor,
  isSuperAdmin: boolean,
  senderIp: string,
  channelId: string,
  payload: CommsSnippetSharePayload
): Promise<CommsMessage> {
  const sourceType = VALID_SNIPPET_SOURCE_TYPES.has(payload?.sourceType)
    ? payload.sourceType
    : null;
  if (!sourceType) {
    throw new Error(
      'BAD_SNIPPET: Unsupported snippet source type. | نوع منبع خروجی برای اشتراک‌گذاری معتبر نیست.'
    );
  }
  const sourceEntityType: 'device' | 'server' =
    payload?.sourceEntityType === 'server' ? 'server' : 'device';
  const sourceEntityId = String(payload?.sourceEntityId || '').trim();
  if (!sourceEntityId) {
    throw new Error(
      'BAD_SNIPPET: Source device or server identifier is required. | شناسه تجهیز یا سرور مبدا الزامی است.'
    );
  }
  const rawContent = String(payload?.content || '').trim();
  if (!rawContent) {
    throw new Error(
      'BAD_SNIPPET: Snippet or diff content cannot be empty. | محتوای خروجی یا تغییرات نمی‌تواند خالی باشد.'
    );
  }

  const platform: CommsSnippetPlatform = VALID_SNIPPET_PLATFORMS.has(
    payload?.platform as CommsSnippetPlatform
  )
    ? (payload.platform as CommsSnippetPlatform)
    : 'generic';

  await ensurePostgresConnection();
  const pool = getPgPool();

  const [channel, senderCtx, allDevices, allServers, parentRowPg] = await Promise.all([
    loadHydratedChannelForUser(channelId, senderUser),
    resolveCommsViewerAccessContext(senderUser, isSuperAdmin),
    sourceEntityType === 'device' ? getAllDevices().catch(() => []) : Promise.resolve([]),
    sourceEntityType === 'server' ? getAllRemoteServers().catch(() => []) : Promise.resolve([]),
    payload?.replyToMessageId && isPostgresConnected() && pool
      ? pool
          .query(`SELECT * FROM comms_messages WHERE id = $1`, [payload.replyToMessageId])
          .then((r) => r.rows[0] || null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!channel) {
    throw new Error('NOT_FOUND: Channel not found. | کانال گفتگو یافت نشد.');
  }

  const senderIds = new Set(resolveUserIdentifiers(senderUser));
  const members = channel.members || [];
  if (!members.some((m) => memberMatchesIdentifiers(m, senderIds))) {
    throw new Error(
      'ACCESS_DENIED: You are not a member of this channel. | شما عضو این کانال گفتگو نیستید.'
    );
  }

  const devicesById = new Map<string, any>(
    (allDevices || []).filter((d: any) => d?.id).map((d: any) => [String(d.id).trim().toLowerCase(), d])
  );
  const serversById = new Map<string, any>(
    (allServers || []).filter((s: any) => s?.id).map((s: any) => [String(s.id).trim().toLowerCase(), s])
  );

  // Enforce sender scope & granular RBAC permission BEFORE scrubbing or storing
  if (sourceEntityType === 'server') {
    const gate = isServerVisibleInViewerCtx(sourceEntityId, senderCtx);
    if (!gate.allowed) {
      throw new Error(
        `ACCESS_DENIED: You do not have RBAC permission to share outputs from this server. | عدم دسترسی RBAC: شما مجوز اشتراک‌گذاری خروجی این سرور را ندارید.`
      );
    }
    if (!checkSnippetGranularPermission(senderCtx, sourceType, 'server', sourceEntityId, platform)) {
      throw new Error(
        `ACCESS_DENIED: Missing granular permission (${sourceType}) for this server. | عدم دسترسی RBAC: مجوز لازم برای اشتراک‌گذاری این نوع خروجی سرور را ندارید.`
      );
    }
  } else {
    const gate = isDeviceVisibleInViewerCtx(sourceEntityId, senderCtx);
    if (!gate.allowed) {
      throw new Error(
        `ACCESS_DENIED: You do not have RBAC permission to share outputs from this device. | عدم دسترسی RBAC: شما مجوز اشتراک‌گذاری خروجی این تجهیز را ندارید.`
      );
    }
    if (!checkSnippetGranularPermission(senderCtx, sourceType, 'device', sourceEntityId, platform)) {
      throw new Error(
        `ACCESS_DENIED: Missing granular permission (${sourceType}) for this device. | عدم دسترسی RBAC: مجوز لازم برای اشتراک‌گذاری این نوع خروجی تجهیز را ندارید.`
      );
    }
  }

  const dev = sourceEntityType === 'device' ? devicesById.get(sourceEntityId.toLowerCase()) : null;
  const srv = sourceEntityType === 'server' ? serversById.get(sourceEntityId.toLowerCase()) : null;
  const entityName =
    (sourceEntityType === 'device' ? dev?.name : srv?.name) ||
    payload.sourceEntityName ||
    sourceEntityId;
  const entityIp =
    (sourceEntityType === 'device' ? dev?.ip || dev?.ssh_host : srv?.host || srv?.ip) ||
    payload.sourceEntityIp ||
    '';

  // Server-side Secret Scrubbing & Size Limiting
  const { scrubbedText, redactedCount, redactedCategories } = scrubSensitiveSnippetContent(rawContent);
  const allLines = scrubbedText.split('\n');
  const maxLines = 250;
  const maxChars = 24000;
  let clippedText = allLines.slice(0, maxLines).join('\n');
  let truncated = allLines.length > maxLines;
  if (clippedText.length > maxChars) {
    clippedText = clippedText.slice(0, maxChars);
    truncated = true;
  }

  const nowIso = new Date().toISOString();
  const snippetId = makeId('snip');
  const defaultTitleMap: Record<CommsSnippetSourceType, { fa: string; en: string }> = {
    terminal_output: { fa: 'خروجی زنده ترمینال CLI', en: 'CLI Terminal Output' },
    backup_diff: { fa: 'اسنیپت بکاپ / مقایسه تغییرات کانفیگ', en: 'Backup / Config Diff' },
    device_log: { fa: 'لاگ سیستمی تجهیز شبکه (Syslog)', en: 'Device System Logs' },
    server_log: { fa: 'لاگ دستورات و عملیات سرور', en: 'Server Audit / Activity Log' },
  };

  const titleClean = (payload.title || '').trim() || defaultTitleMap[sourceType].fa;
  const titleEnClean = (payload.titleEn || '').trim() || defaultTitleMap[sourceType].en;

  const snippetData = {
    snippetId,
    sourceType,
    sourceEntityType,
    sourceEntityId,
    sourceEntityName: entityName,
    sourceEntityIp: entityIp,
    platform,
    title: titleClean,
    titleEn: titleEnClean,
    filePath: payload.filePath ? String(payload.filePath).slice(0, 300) : undefined,
    content: clippedText,
    lineCount: allLines.length,
    truncated,
    redactedCount,
    redactedCategories,
    diffStats:
      payload.diffStats &&
      typeof payload.diffStats.added === 'number' &&
      typeof payload.diffStats.removed === 'number'
        ? {
            added: Math.max(0, Math.round(payload.diffStats.added)),
            removed: Math.max(0, Math.round(payload.diffStats.removed)),
          }
        : undefined,
    sharedAt: nowIso,
  };

  const noteClean = (payload.note || '').trim();
  const body = noteClean
    ? noteClean
    : `📎 اشتراک‌گذاری ${defaultTitleMap[sourceType].fa}: ${entityName}${entityIp ? ` (${entityIp})` : ''}`;
  const bodyEn = noteClean
    ? noteClean
    : `📎 Shared ${defaultTitleMap[sourceType].en}: ${entityName}${entityIp ? ` (${entityIp})` : ''}`;

  const msgId = makeId('cmsg');
  const msgType = channel.channelType === 'direct' ? 'direct_message' : 'channel_message';
  const senderDisplay = formatUserDisplay(senderUser.fullName, senderUser.username);
  const title =
    channel.channelType === 'direct'
      ? `اسنیپت مهندسی از ${senderDisplay}`
      : `${channel.name}: اسنیپت مهندسی از ${senderDisplay}`;
  const titleEn =
    channel.channelType === 'direct'
      ? `Shared Output from ${senderDisplay}`
      : `${channel.nameEn || channel.name}: Shared Output from ${senderDisplay}`;

  const messageRecord = {
    id: msgId,
    channel_id: channelId,
    sender_user_id: senderUser.userId,
    sender_username: senderUser.username,
    sender_full_name: senderUser.fullName || senderUser.username,
    sender_role: senderUser.role || 'Operator',
    message_type: msgType,
    priority: payload.priority || 'info',
    title,
    title_en: titleEn,
    body,
    body_en: bodyEn,
    linked_entity_type: sourceEntityType,
    linked_entity_id: sourceEntityId,
    linked_entity_name: entityName,
    metadata: {
      channelType: channel.channelType,
      replyToMessageId: payload.replyToMessageId || null,
      senderUsername: senderUser.username,
      snippetData,
    },
    created_at: nowIso,
  };

  // Pre-compute per-member RBAC projection (Zero-Leak across notifications + WS)
  const memberContextPairs = await Promise.all(
    members.map(async (m) => {
      const key = `${(m.userId || '').toLowerCase()}|${(m.username || '').toLowerCase()}`;
      const memberCtx = await resolveCommsViewerAccessContext(
        { userId: m.userId, username: m.username, role: m.role },
        false
      );
      const memberSnippet = projectSnippetForViewer(
        snippetData,
        memberCtx,
        devicesById,
        serversById
      );
      return { key, m, memberSnippet };
    })
  );
  const snippetByMemberKey = new Map(memberContextPairs.map((p) => [p.key, p.memberSnippet]));

  const notifyMembers = members.filter(
    (m) => !memberMatchesIdentifiers(m, senderIds) && !m.isMuted
  );
  const evalResults =
    notifyMembers.length > 0
      ? await Promise.all(
          notifyMembers.map(async (m) => ({
            m,
            pref: await evaluateNotificationDeliveryForUser(
              m,
              msgType as CommsCategory,
              payload.priority || 'info',
              false
            ),
          }))
        )
      : [];

  const redactedFa = '🔒 خروجی ترمینال/لاگ/بکاپ (دسترسی به تجهیز/سرور محدود شده است)';
  const redactedEn = '🔒 Terminal/Log/Diff snippet (Entity access restricted by RBAC)';
  const notificationRecords: any[] = [];
  const activeRecipients: ResolvedRecipient[] = [];
  for (const { m, pref } of evalResults) {
    if (!pref.deliverInboxNotification) continue;
    const key = `${(m.userId || '').toLowerCase()}|${(m.username || '').toLowerCase()}`;
    const memberSnippet = snippetByMemberKey.get(key);
    const notifTitleFa = memberSnippet?.accessRestricted
      ? `${channel.name}: 🔒 اسنیپت محافظت‌شده (RBAC)`
      : title;
    const notifTitleEn = memberSnippet?.accessRestricted
      ? `${channel.nameEn || channel.name}: 🔒 RBAC Protected Snippet`
      : titleEn;
    const notifBodyFa = memberSnippet?.accessRestricted ? redactedFa : body;
    const notifBodyEn = memberSnippet?.accessRestricted ? redactedEn : bodyEn;
    activeRecipients.push({ userId: m.userId, username: m.username });
    notificationRecords.push({
      id: makeId('notif'),
      recipient_user_id: m.userId,
      recipient_username: m.username,
      source_message_id: msgId,
      channel_id: channelId,
      category: msgType,
      severity: payload.priority || 'info',
      sender_name: senderDisplay,
      sender_role: senderUser.role || 'Operator',
      title: notifTitleFa,
      title_en: notifTitleEn,
      summary: notifBodyFa.slice(0, 140),
      summary_en: notifBodyEn.slice(0, 140),
      body: notifBodyFa,
      body_en: notifBodyEn,
      linked_entity_type: null,
      linked_entity_id: null,
      linked_entity_name: null,
      action_tab: 'communications',
      is_read: false,
      is_archived: false,
      requires_acknowledgment: false,
      metadata: {
        channelId,
        channelType: channel.channelType,
        sourceMessageId: msgId,
        senderUsername: senderUser.username,
        replyToMessageId: payload.replyToMessageId || null,
        quietHoursMuted: pref.quietHoursMuted,
        playSound: pref.playSound,
      },
      created_at: nowIso,
    });
  }

  await persistMessageAndNotifications(
    messageRecord,
    notificationRecords,
    activeRecipients,
    {
      channelId,
      updatedAt: nowIso,
      senderIds: Array.from(senderIds),
      messageId: msgId,
    }
  );

  let parentLookup: Map<string, any> | undefined;
  if (payload.replyToMessageId) {
    const parentRow =
      parentRowPg ||
      (loadFallbackStore().comms_messages || []).find(
        (m: any) => m.id === payload.replyToMessageId
      );
    if (parentRow) parentLookup = new Map([[parentRow.id, parentRow]]);
  }

  const baseMapped = mapMessageRow(messageRecord, parentLookup);
  const senderSnippetResult = projectSnippetForViewer(
    snippetData,
    senderCtx,
    devicesById,
    serversById
  );
  const senderCleanMsg: CommsMessage = {
    ...baseMapped,
    metadata: sanitizeCleanMessageMetadata(baseMapped.metadata),
    snippetResult: senderSnippetResult,
  };

  // Per-recipient Zero-Leak WebSocket broadcast
  const projectedByMemberKey = new Map<string, CommsMessage>();
  for (const { key, memberSnippet } of memberContextPairs) {
    projectedByMemberKey.set(key, {
      ...baseMapped,
      linkedEntityName: memberSnippet?.accessRestricted ? null : baseMapped.linkedEntityName,
      body: memberSnippet?.accessRestricted ? redactedFa : baseMapped.body,
      bodyEn: memberSnippet?.accessRestricted ? redactedEn : baseMapped.bodyEn,
      metadata: sanitizeCleanMessageMetadata(baseMapped.metadata),
      snippetResult: memberSnippet,
    });
  }

  broadcastCommsEventToRecipients(
    members.map((m) => ({ userId: m.userId, username: m.username })),
    (recipient) => {
      const key = `${(recipient.userId || '').toLowerCase()}|${(recipient.username || '').toLowerCase()}`;
      return {
        type: 'channel:message',
        channelId,
        message: projectedByMemberKey.get(key) || senderCleanMsg,
      };
    }
  );

  void addPortalAuditLog({
    category: 'communications',
    action: 'CHANNEL_SNIPPET_SHARED',
    title: `اشتراک‌گذاری خروجی/تغییرات (${defaultTitleMap[sourceType].fa})`,
    title_en: `Shared ${defaultTitleMap[sourceType].en} (${entityName})`,
    actor: {
      username: senderUser.username,
      role: senderUser.role || 'Operator',
      ipAddress: senderIp || '127.0.0.1',
    },
    target: {
      type: sourceEntityType,
      id: sourceEntityId,
      name: entityName,
    },
    severity: payload.priority || 'info',
    status: 'success',
    details: `کاربر ${senderUser.username} یک اسنیپت ${sourceType} مربوط به «${entityName}» را با پاکسازی ${redactedCount} مورد محرمانه در کانال «${channel.name}» به اشتراک گذاشت.`,
    details_en: `User ${senderUser.username} shared a ${sourceType} snippet for "${entityName}" in channel "${channel.nameEn || channel.name}" (${redactedCount} secret(s) scrubbed).`,
  }).catch(() => {});

  return senderCleanMsg;
}
