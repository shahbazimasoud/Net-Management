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
  CommsCategory,
  CommsCountsByFolder,
  CommsDispatchPayload,
  CommsFolder,
  CommsNotificationItem,
  CommsRecipientOption,
  CommsSeverity,
} from '../src/types';
import {
  broadcastCommsEventToRecipients,
  broadcastCommsEventToUser,
  registerCommsSyncProvider,
} from './commsWs';

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

  const notificationRecords = recipients.map((rec) => ({
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
    },
    created_at: nowIso,
  }));

  const notifications = await persistMessageAndNotifications(
    messageRecord,
    notificationRecords,
    recipients
  );

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

    const notificationRecords = recipients.map((rec) => ({
      id: makeId('notif'),
      recipient_user_id: rec.userId,
      recipient_username: rec.username,
      source_message_id: null,
      channel_id: null,
      category: params.category || 'system_alert',
      severity: params.severity || 'warning',
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
      requires_acknowledgment: Boolean(params.requiresAcknowledgment),
      metadata: params.metadata || {},
      created_at: nowIso,
    }));

    await persistMessageAndNotifications(null, notificationRecords, recipients);
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
    if (sev !== 'critical' && sev !== 'warning' && status !== 'failed') return;

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
