import crypto from 'crypto';
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
} from './db';
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
  CommsFolder,
  CommsMessage,
  CommsNotificationItem,
  CommsRecipientOption,
  CommsSeverity,
} from '../src/types';
import {
  broadcastCommsEventToRecipients,
  broadcastCommsEventToUser,
  registerCommsSyncProvider,
} from './commsWs';
import { evaluateNotificationDeliveryForUser } from './profileService';
import { CommsEmailDispatchItem, sendCommsCategoryEmailBatch } from './emailService';

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

  try {
    const localUsers = (await getAllUsers()).filter((u) => u && u.status !== 'disabled');
    for (const u of localUsers) {
      register(
        { userId: u.id, username: u.username },
        u.email,
        u.fullName || u.full_name || u.username
      );
    }
  } catch {}

  try {
    const adConfig = await getActiveDirectoryConfig().catch(() => null);
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
  } catch {}

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

  const localUsers = (await getAllUsers()).filter((u) => u && u.status !== 'disabled');
  for (const u of localUsers) {
    options.push({
      type: 'user',
      id: u.id,
      username: u.username,
      label: u.fullName ? `${u.fullName} (${u.username})` : u.username,
      labelEn: u.fullName ? `${u.fullName} (${u.username})` : u.username,
      roleOrType: u.role || 'Local User',
      source: 'local',
    });
  }

  const subjectsResult = await getAuthorizedMapSubjects().catch(() => null);
  const seenUsernames = new Set(localUsers.map((u) => (u.username || '').toLowerCase()));

  if (subjectsResult?.categories?.adUsers) {
    for (const adUser of subjectsResult.categories.adUsers) {
      const uname = (adUser.name || adUser.id || '').toLowerCase();
      if (!uname || seenUsernames.has(uname)) continue;
      seenUsernames.add(uname);
      options.push({
        type: 'user',
        id: adUser.rawId || adUser.id,
        username: adUser.name,
        label: adUser.displayName,
        labelEn: adUser.displayName,
        roleOrType: adUser.role || 'AD User',
        source: 'ad',
      });
    }
  }

  const localGroups = await getUserGroups();
  for (const g of localGroups) {
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

  const localUsers = (await getAllUsers()).filter((u) => u && u.status !== 'disabled');
  const adConfig = await getActiveDirectoryConfig().catch(() => null);
  const syncedAdUsers: any[] = Array.isArray(adConfig?.syncedUsers) ? adConfig.syncedUsers : [];
  const syncedAdGroups: any[] = Array.isArray(adConfig?.syncedGroups) ? adConfig.syncedGroups : [];
  const subjectsResult = await getAuthorizedMapSubjects().catch(() => null);

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

    for (const ag of syncedAdGroups) {
      const matchAg =
        targetSet.has((ag.dn || '').toLowerCase()) ||
        targetSet.has((ag.cn || '').toLowerCase());
      if (matchAg && Array.isArray(ag.members)) {
        for (const memberIdent of ag.members) {
          const mLower = String(memberIdent).toLowerCase();
          const matchedAd = syncedAdUsers.find(
            (au) =>
              (au.dn || '').toLowerCase() === mLower ||
              (au.samAccountName || '').toLowerCase() === mLower
          );
          if (matchedAd?.samAccountName) {
            addRec(`ad-${matchedAd.samAccountName}`, matchedAd.samAccountName);
          }
        }
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
      targetSet.has((adu.name || '').toLowerCase())
    ) {
      addRec(adu.rawId || adu.id, adu.name || adu.id);
    }
  }
  return Array.from(map.values());
}

async function persistMessageAndNotifications(
  messageRecord: any,
  notificationRecords: any[],
  recipients: ResolvedRecipient[]
): Promise<CommsNotificationItem[]> {
  const mappedItems = notificationRecords.map(mapNotificationRow);

  // Fallback persistence
  const store = loadFallbackStore();
  if (!Array.isArray(store.comms_messages)) store.comms_messages = [];
  if (!Array.isArray(store.comms_notifications)) store.comms_notifications = [];

  if (messageRecord) {
    store.comms_messages.unshift(messageRecord);
    if (store.comms_messages.length > 5000) {
      store.comms_messages = store.comms_messages.slice(0, 5000);
    }
  }

  store.comms_notifications.unshift(...notificationRecords);
  if (store.comms_notifications.length > 10000) {
    store.comms_notifications = store.comms_notifications.slice(0, 10000);
  }
  saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      if (messageRecord) {
        await pool.query(
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
        );
      }

      for (const n of notificationRecords) {
        await pool.query(
          `INSERT INTO comms_notifications (
            id, recipient_user_id, recipient_username, source_message_id, channel_id,
            category, severity, sender_name, sender_role,
            title, title_en, summary, summary_en, body, body_en,
            linked_entity_type, linked_entity_id, linked_entity_name, action_tab,
            is_read, is_archived, requires_acknowledgment, metadata, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
          [
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
            n.created_at,
          ]
        );
      }
    } catch (err: any) {
      console.error('[CommsService] PostgreSQL persistMessageAndNotifications error:', err?.message || err);
    }
  }

  // Real-time WebSocket delivery per connected recipient
  const notifByRecipient = new Map<string, CommsNotificationItem>();
  for (const item of mappedItems) {
    notifByRecipient.set(item.recipientUsername.toLowerCase(), item);
  }

  for (const r of recipients) {
    const item = notifByRecipient.get(r.username.toLowerCase());
    if (!item) continue;
    const counts = await getUnreadNotificationCounts(r).catch(() => null);
    broadcastCommsEventToRecipients([r], undefined, {
      type: 'notification:created',
      notification: item,
      unreadCount: counts?.unreadCount,
      countsByFolder: counts?.countsByFolder,
    });
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
  const senderDisplay = senderUser.fullName
    ? `${senderUser.fullName} (${senderUser.username})`
    : senderUser.username;

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

async function buildDirectoryUserMap(): Promise<
  Map<string, { userId: string; username: string; fullName: string; role: string }>
> {
  const map = new Map<string, { userId: string; username: string; fullName: string; role: string }>();
  const register = (id: string, username: string, fullName: string, role: string) => {
    const info = { userId: id, username, fullName: fullName || username, role: role || 'Operator' };
    for (const key of resolveUserIdentifiers({ userId: id, username })) {
      if (!map.has(key)) map.set(key, info);
    }
  };

  const localUsers = (await getAllUsers()).filter((u) => u && u.status !== 'disabled');
  for (const u of localUsers) {
    register(u.id, u.username, u.fullName || u.username, u.role || 'Operator');
  }

  const subjectsResult = await getAuthorizedMapSubjects().catch(() => null);
  for (const adu of subjectsResult?.categories?.adUsers || []) {
    register(
      adu.rawId || adu.id,
      adu.name || adu.id,
      adu.displayName || adu.name || adu.id,
      adu.role || 'AD User'
    );
  }
  return map;
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
    fullName: row.full_name ?? row.fullName ?? dirInfo?.fullName ?? username,
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
    senderFullName: row.sender_full_name ?? row.senderFullName ?? null,
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

async function loadHydratedChannelForUser(
  channelId: string,
  viewerUser: Partial<CommsActor>,
  dirMap?: Map<string, { userId: string; username: string; fullName: string; role: string }>
): Promise<CommsChannel | null> {
  const resolvedDir = dirMap || (await buildDirectoryUserMap());
  const idList = resolveUserIdentifiers(viewerUser);
  const idSet = new Set(idList);

  let rawChannel: any = null;
  let rawMembers: any[] = [];
  let latestMsg: any = null;
  let unreadCount = 0;

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const chRes = await pool.query(`SELECT * FROM comms_channels WHERE id = $1`, [channelId]);
      if (chRes.rows[0]) {
        rawChannel = chRes.rows[0];
        const mRes = await pool.query(
          `SELECT * FROM comms_channel_members WHERE channel_id = $1 ORDER BY joined_at ASC`,
          [channelId]
        );
        rawMembers = mRes.rows;

        const msgRes = await pool.query(
          `SELECT body, created_at FROM comms_messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [channelId]
        );
        latestMsg = msgRes.rows[0] || null;

        if (idList.length > 0) {
          const uRes = await pool.query(
            `SELECT COUNT(*)::int AS cnt FROM comms_notifications
             WHERE channel_id = $1 AND is_archived = FALSE AND is_read = FALSE
               AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
            [channelId, idList]
          );
          unreadCount = uRes.rows[0]?.cnt || 0;
        }
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

  const members = rawMembers.map((m) => mapChannelMemberRow(m, resolvedDir));
  const viewerMembership = members.find((m) => memberMatchesIdentifiers(m, idSet));
  const channelType = (rawChannel.channel_type ?? rawChannel.channelType ?? 'group') as CommsChannelType;

  let displayName = rawChannel.name || '';
  let displayNameEn = rawChannel.name_en ?? rawChannel.nameEn ?? rawChannel.name ?? '';

  if (channelType === 'direct' && members.length > 0) {
    const peer = members.find((m) => !memberMatchesIdentifiers(m, idSet)) || members[0];
    if (peer) {
      displayName =
        peer.fullName && peer.fullName !== peer.username
          ? `${peer.fullName} (${peer.username})`
          : peer.username;
      displayNameEn = displayName;
    }
  }

  const lastBody = latestMsg?.body || null;
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
    lastMessageAt: latestMsg?.created_at
      ? new Date(latestMsg.created_at).toISOString()
      : latestMsg?.createdAt || null,
    members,
    createdAt: rawChannel.created_at
      ? new Date(rawChannel.created_at).toISOString()
      : rawChannel.createdAt || new Date().toISOString(),
    updatedAt: rawChannel.updated_at
      ? new Date(rawChannel.updated_at).toISOString()
      : rawChannel.updatedAt || new Date().toISOString(),
  };
}

export async function listUserChannels(user: Partial<CommsActor>): Promise<CommsChannel[]> {
  const identifiers = resolveUserIdentifiers(user);
  if (identifiers.length === 0) return [];
  const idSet = new Set(identifiers);
  const dirMap = await buildDirectoryUserMap();

  const channelIds = new Set<string>();

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `SELECT DISTINCT channel_id FROM comms_channel_members
         WHERE LOWER(user_id) = ANY($1::text[]) OR LOWER(username) = ANY($1::text[])`,
        [identifiers]
      );
      for (const r of res.rows) {
        if (r.channel_id) channelIds.add(r.channel_id);
      }
    } catch (err: any) {
      console.error('[CommsService] listUserChannels PG error:', err?.message || err);
    }
  }

  const store = loadFallbackStore();
  for (const m of store.comms_channel_members || []) {
    if (memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)) {
      const cid = m.channel_id ?? m.channelId;
      if (cid) channelIds.add(cid);
    }
  }

  const channels: CommsChannel[] = [];
  for (const cid of channelIds) {
    const hydrated = await loadHydratedChannelForUser(cid, user, dirMap);
    if (hydrated) channels.push(hydrated);
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

  // Search existing 1:1 direct channels between sender and target
  const senderChannels = await listUserChannels(senderUser);
  const existing = senderChannels.find(
    (c) =>
      c.channelType === 'direct' &&
      c.members &&
      c.members.length === 2 &&
      c.members.some((m) =>
        memberMatchesIdentifiers(m, new Set(resolveUserIdentifiers(target)))
      )
  );
  if (existing) {
    return { channel: existing, created: false };
  }

  const nowIso = new Date().toISOString();
  const channelId = makeId('chan');
  const senderDisplay = senderUser.fullName
    ? `${senderUser.fullName} (${senderUser.username})`
    : senderUser.username;
  const targetDisplay =
    target.fullName && target.fullName !== target.username
      ? `${target.fullName} (${target.username})`
      : target.username;

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
  memberIds: string[]
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
  if (!isSuperAdmin && actorMember?.role !== 'owner' && existing.createdByUserId !== actor.userId) {
    throw new Error('ACCESS_DENIED: Only channel owner or Super Admin can add members.');
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

export async function listChannelMessages(
  user: CommsActor,
  isSuperAdmin: boolean,
  channelId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ channel: CommsChannel; messages: CommsMessage[]; total: number }> {
  const channel = await loadHydratedChannelForUser(channelId, user);
  if (!channel) {
    throw new Error('Channel not found.');
  }

  const idList = resolveUserIdentifiers(user);
  const idSet = new Set(idList);
  const isMember = (channel.members || []).some((m) => memberMatchesIdentifiers(m, idSet));
  if (!isMember && !isSuperAdmin) {
    throw new Error('ACCESS_DENIED: You are not a member of this channel.');
  }

  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const offset = Math.max(0, Number(options.offset) || 0);

  let rawMessages: any[] = [];
  let total = 0;

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const cntRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM comms_messages WHERE channel_id = $1`,
        [channelId]
      );
      total = cntRes.rows[0]?.total || 0;
      const msgRes = await pool.query(
        `SELECT * FROM comms_messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [channelId, limit, offset]
      );
      rawMessages = msgRes.rows.reverse();
    } catch (err: any) {
      console.error('[CommsService] listChannelMessages PG error:', err?.message || err);
    }
  }

  if (rawMessages.length === 0) {
    const store = loadFallbackStore();
    const allForChannel = (store.comms_messages || [])
      .filter((m: any) => (m.channel_id ?? m.channelId) === channelId)
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

  // Mark channel notifications as read automatically when opening thread
  const newestId = messages[messages.length - 1]?.id || null;
  let clearedAny = false;

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
      }
    }
  }
  if (newestId && Array.isArray(store.comms_channel_members)) {
    for (const m of store.comms_channel_members) {
      if (
        (m.channel_id ?? m.channelId) === channelId &&
        memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, idSet)
      ) {
        m.last_read_message_id = newestId;
      }
    }
  }
  if (clearedAny || newestId) {
    saveFallbackStore(store);
  }

  if (isPostgresConnected() && pool && idList.length > 0) {
    try {
      const updRes = await pool.query(
        `UPDATE comms_notifications
         SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE channel_id = $1 AND is_read = FALSE
           AND (LOWER(recipient_user_id) = ANY($2::text[]) OR LOWER(recipient_username) = ANY($2::text[]))`,
        [channelId, idList]
      );
      if ((updRes.rowCount || 0) > 0) clearedAny = true;
      if (newestId) {
        await pool.query(
          `UPDATE comms_channel_members
           SET last_read_message_id = $1
           WHERE channel_id = $2
             AND (LOWER(user_id) = ANY($3::text[]) OR LOWER(username) = ANY($3::text[]))`,
          [newestId, channelId, idList]
        );
      }
    } catch {}
  }

  if (clearedAny) {
    const counts = await getUnreadNotificationCounts(user).catch(() => null);
    if (counts) {
      broadcastCommsEventToUser(user, {
        type: 'comms:sync',
        unreadCount: counts.unreadCount,
        countsByFolder: counts.countsByFolder,
      });
    }
  }

  return {
    channel: { ...channel, unreadCount: 0 },
    messages,
    total,
  };
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
  }
): Promise<CommsMessage> {
  const body = (payload.body || '').trim();
  if (!body) {
    throw new Error('Message body is required.');
  }
  const channel = await loadHydratedChannelForUser(channelId, senderUser);
  if (!channel) {
    throw new Error('Channel not found.');
  }

  const senderIds = new Set(resolveUserIdentifiers(senderUser));
  const members = channel.members || [];
  if (!members.some((m) => memberMatchesIdentifiers(m, senderIds))) {
    throw new Error('ACCESS_DENIED: You are not a member of this channel.');
  }

  const nowIso = new Date().toISOString();
  const msgId = makeId('cmsg');
  const bodyEn = (payload.bodyEn || '').trim() || body;
  const msgType = channel.channelType === 'direct' ? 'direct_message' : 'channel_message';
  const senderDisplay = senderUser.fullName
    ? `${senderUser.fullName} (${senderUser.username})`
    : senderUser.username;

  const title =
    channel.channelType === 'direct'
      ? `پیام از ${senderDisplay}`
      : `${channel.name}: پیام جدید از ${senderDisplay}`;
  const titleEn =
    channel.channelType === 'direct'
      ? `Message from ${senderDisplay}`
      : `${channel.nameEn || channel.name}: New message from ${senderDisplay}`;

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
    linked_entity_type: payload.linkedEntityType || null,
    linked_entity_id: payload.linkedEntityId || null,
    linked_entity_name: payload.linkedEntityName || null,
    metadata: {
      channelType: channel.channelType,
      replyToMessageId: payload.replyToMessageId || null,
      senderUsername: senderUser.username,
    },
    created_at: nowIso,
  };

  // Update channel updated_at + sender last_read in fallback store
  const store = loadFallbackStore();
  if (!Array.isArray(store.comms_channels)) store.comms_channels = [];
  if (!Array.isArray(store.comms_channel_members)) store.comms_channel_members = [];
  const chIdx = store.comms_channels.findIndex((c: any) => c.id === channelId);
  if (chIdx !== -1) store.comms_channels[chIdx].updated_at = nowIso;
  for (const m of store.comms_channel_members) {
    if (
      (m.channel_id ?? m.channelId) === channelId &&
      memberMatchesIdentifiers({ userId: m.user_id ?? m.userId, username: m.username }, senderIds)
    ) {
      m.last_read_message_id = msgId;
    }
  }
  saveFallbackStore(store);

  // Determine notification recipients (exclude sender and muted members)
  const notifyMembers = members.filter(
    (m) => !memberMatchesIdentifiers(m, senderIds) && !m.isMuted
  );
  const summary = body.length > 140 ? `${body.slice(0, 137)}...` : body;
  const summaryEn = bodyEn.length > 140 ? `${bodyEn.slice(0, 137)}...` : bodyEn;

  const notificationRecords: any[] = [];
  const activeRecipients: ResolvedRecipient[] = [];
  const emailTargets: PendingCommsEmailTarget[] = [];
  for (const m of notifyMembers) {
    const pref = await evaluateNotificationDeliveryForUser(
      m,
      msgType as CommsCategory,
      payload.priority || 'info',
      false
    );
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

  await persistMessageAndNotifications(
    messageRecord,
    notificationRecords,
    activeRecipients
  );

  if (emailTargets.length > 0) {
    void dispatchCommsEmailsAsync(emailTargets);
  }

  // Also update PG channel updated_at and sender last_read
  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(`UPDATE comms_channels SET updated_at = $1 WHERE id = $2`, [nowIso, channelId]);
      await pool.query(
        `UPDATE comms_channel_members
         SET last_read_message_id = $1
         WHERE channel_id = $2
           AND (LOWER(user_id) = ANY($3::text[]) OR LOWER(username) = ANY($3::text[]))`,
        [msgId, channelId, Array.from(senderIds)]
      );
    } catch {}
  }

  // Hydrate reply preview if parent exists
  let parentLookup: Map<string, any> | undefined;
  if (payload.replyToMessageId) {
    let parentRow: any = null;
    if (isPostgresConnected() && pool) {
      try {
        const pRes = await pool.query(`SELECT * FROM comms_messages WHERE id = $1`, [
          payload.replyToMessageId,
        ]);
        parentRow = pRes.rows[0] || null;
      } catch {}
    }
    if (!parentRow) {
      parentRow = (loadFallbackStore().comms_messages || []).find(
        (m: any) => m.id === payload.replyToMessageId
      );
    }
    if (parentRow) {
      parentLookup = new Map([[parentRow.id, parentRow]]);
    }
  }

  const mappedMessage = mapMessageRow(messageRecord, parentLookup);

  // Broadcast live thread update to all members (including sender's other tabs)
  broadcastCommsEventToRecipients(
    members.map((m) => ({ userId: m.userId, username: m.username })),
    undefined,
    {
      type: 'channel:message',
      channelId,
      message: mappedMessage,
    }
  );

  await addPortalAuditLog({
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
      senderName:
        senderFull && senderFull !== senderUser ? `${senderFull} (${senderUser})` : senderUser || 'Manager',
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
      senderName:
        senderFull && senderFull !== senderUser ? `${senderFull} (${senderUser})` : senderUser || 'Manager',
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
