import { Router, Request, Response } from 'express';
import { verifyToken } from './auth';
import { findUserById, findUserByUsername, getEffectivePolicyForUser } from './db';
import {
  acknowledgeNotification,
  addChannelMembers,
  archiveNotification,
  clearChannelHistoryForUser,
  CommsActor,
  createGroupChannel,
  createOrOpenDirectChannel,
  deleteGroupChannel,
  dispatchCommunication,
  getAnnouncementReceipts,
  getCommsRecipients,
  getUnreadNotificationCounts,
  leaveOrDeleteChannelForUser,
  listChannelMessages,
  listSentAnnouncements,
  listUserChannels,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  postChannelMessage,
  replyToInboxNotification,
  toggleChannelMute,
} from './commsService';
import { CommsDispatchPayload, CommsFolder, CommsSeverity } from '../src/types';

export const commsRouter = Router();

interface CommsAuthContext {
  authenticated: boolean;
  statusCode?: number;
  error?: string;
  actor?: CommsActor;
  policy?: any;
  isSuperAdmin?: boolean;
  clientIp: string;
}

async function authenticateCommsRequest(req: Request): Promise<CommsAuthContext> {
  const rawIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';
  const clientIp = rawIp.replace(/^::ffff:/, '') || '127.0.0.1';

  try {
    const authHeader = (req.headers.authorization as string) || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return { authenticated: false, statusCode: 401, error: 'Authentication required', clientIp };
    }

    const payload = verifyToken(token);
    if (!payload) {
      return { authenticated: false, statusCode: 401, error: 'Invalid or expired session token', clientIp };
    }

    const userRecord = (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
    if (userRecord && userRecord.status === 'disabled') {
      return { authenticated: false, statusCode: 403, error: 'Account disabled', clientIp };
    }

    const effectivePolicy = await getEffectivePolicyForUser(userRecord || payload);
    const cleanUsername = (userRecord?.username || payload.username || '').trim().toLowerCase();
    const cleanRole = (userRecord?.role || payload.role || '').trim().toLowerCase();
    const isSuperAdmin =
      cleanUsername === 'admin' ||
      cleanRole.includes('super admin') ||
      cleanRole.includes('administrator') ||
      effectivePolicy?.id === 'policy-super-admin';

    if (!isSuperAdmin && effectivePolicy?.canViewCommunications === false) {
      return {
        authenticated: false,
        statusCode: 403,
        error: 'Access denied: Insufficient permissions for Communications & Notifications Center.',
        clientIp,
      };
    }

    return {
      authenticated: true,
      actor: {
        userId: userRecord?.id || payload.userId,
        username: userRecord?.username || payload.username,
        fullName: userRecord?.fullName || payload.fullName || payload.username,
        role: userRecord?.role || payload.role || 'Operator',
        userType: userRecord?.userType || payload.userType || 'local',
      },
      policy: effectivePolicy,
      isSuperAdmin,
      clientIp,
    };
  } catch (err: any) {
    console.error('[CommsAPI authenticateCommsRequest]', err);
    return {
      authenticated: false,
      statusCode: 500,
      error: err?.message || 'Internal authentication error',
      clientIp,
    };
  }
}

// GET /api/comms/notifications
commsRouter.get('/comms/notifications', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const folder = ((req.query.folder as string) || 'all') as CommsFolder;
    const severity = (req.query.severity as string) || 'all';
    const q = (req.query.q as string) || '';
    const limit = parseInt((req.query.limit as string) || '60', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const data = await listUserNotifications(auth.actor, {
      folder,
      severity,
      q,
      limit,
      offset,
    });

    return res.json({ success: true, ...data });
  } catch (err: any) {
    console.error('[CommsAPI GET /comms/notifications]', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to load notifications' });
  }
});

// GET /api/comms/unread-count
commsRouter.get('/comms/unread-count', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const counts = await getUnreadNotificationCounts(auth.actor);
    return res.json({ success: true, ...counts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to fetch unread count' });
  }
});

// PATCH /api/comms/notifications/:id/read
commsRouter.patch('/comms/notifications/:id/read', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const isRead = req.body?.isRead !== undefined ? Boolean(req.body.isRead) : true;
    const updated = await markNotificationRead(auth.actor, req.params.id, isRead);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    const counts = await getUnreadNotificationCounts(auth.actor);
    return res.json({ success: true, notification: updated, ...counts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to update notification read status' });
  }
});

// POST /api/comms/notifications/mark-all-read
commsRouter.post('/comms/notifications/mark-all-read', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const folder = ((req.body?.folder as string) || 'all') as CommsFolder;
    const result = await markAllNotificationsRead(auth.actor, folder);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to mark notifications read' });
  }
});

// PATCH /api/comms/notifications/:id/acknowledge
commsRouter.patch('/comms/notifications/:id/acknowledge', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const updated = await acknowledgeNotification(auth.actor, req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    const counts = await getUnreadNotificationCounts(auth.actor);
    return res.json({ success: true, notification: updated, ...counts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to acknowledge notification' });
  }
});

// PATCH /api/comms/notifications/:id/archive
commsRouter.patch('/comms/notifications/:id/archive', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const archived = req.body?.archived !== undefined ? Boolean(req.body.archived) : true;
    const updated = await archiveNotification(auth.actor, req.params.id, archived);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    const counts = await getUnreadNotificationCounts(auth.actor);
    return res.json({ success: true, notification: updated, ...counts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to archive notification' });
  }
});

// GET /api/comms/recipients
commsRouter.get('/comms/recipients', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const options = await getCommsRecipients();
    return res.json({ success: true, options });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to fetch recipients' });
  }
});

// POST /api/comms/dispatch (Send Direct/Group Message or Official Announcement)
commsRouter.post('/comms/dispatch', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const payload = req.body as CommsDispatchPayload;
  const isAnnouncement = payload?.category === 'announcement' || payload?.targetType === 'all';

  if (!auth.isSuperAdmin) {
    if (isAnnouncement && auth.policy?.canSendAnnouncements === false) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Your role policy does not authorize sending broadcast announcements.',
      });
    }
    if (!auth.policy?.canSendCommunications && !auth.policy?.canSendAnnouncements) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Your role policy does not authorize dispatching messages.',
      });
    }
  }

  try {
    const result = await dispatchCommunication(auth.actor, auth.clientIp, payload);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to dispatch message' });
  }
});

// ==============================================================================
// Phase 2 Routes: Channels, Direct Chats, Threads & Announcement Read Tracker
// ==============================================================================

// GET /api/comms/channels
commsRouter.get('/comms/channels', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const channels = await listUserChannels(auth.actor);
    return res.json({ success: true, channels });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list channels' });
  }
});

// POST /api/comms/channels/direct
commsRouter.post('/comms/channels/direct', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  if (!auth.isSuperAdmin && !auth.policy?.canSendCommunications && !auth.policy?.canSendAnnouncements) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Insufficient permissions to initiate direct conversations.',
    });
  }
  try {
    const targetUserId = String(req.body?.targetUserId || req.body?.targetUsername || '').trim();
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'Target user identifier is required' });
    }
    const result = await createOrOpenDirectChannel(auth.actor, targetUserId);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to open direct chat' });
  }
});

// POST /api/comms/channels/group
commsRouter.post('/comms/channels/group', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  if (!auth.isSuperAdmin && !auth.policy?.canSendCommunications && !auth.policy?.canSendAnnouncements) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Insufficient permissions to create group channels.',
    });
  }
  try {
    const channel = await createGroupChannel(auth.actor, auth.clientIp, req.body || {});
    return res.json({ success: true, channel });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to create group channel' });
  }
});

// POST /api/comms/channels/:id/members
commsRouter.post('/comms/channels/:id/members', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
    const canAddPolicy = Boolean(
      auth.isSuperAdmin || auth.policy?.canSendCommunications || auth.policy?.canSendAnnouncements
    );
    const channel = await addChannelMembers(
      auth.actor,
      Boolean(auth.isSuperAdmin),
      req.params.id,
      memberIds,
      canAddPolicy
    );
    return res.json({ success: true, channel });
  } catch (err: any) {
    const status = String(err?.message || '').startsWith('ACCESS_DENIED') ? 403 : 400;
    return res.status(status).json({ success: false, error: err?.message || 'Failed to add members' });
  }
});

// PATCH /api/comms/channels/:id/mute
commsRouter.patch('/comms/channels/:id/mute', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const isMuted = Boolean(req.body?.isMuted);
    const result = await toggleChannelMute(auth.actor, req.params.id, isMuted);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to update mute state' });
  }
});

// POST /api/comms/channels/:id/clear
commsRouter.post('/comms/channels/:id/clear', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const result = await clearChannelHistoryForUser(auth.actor, req.params.id);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const status = msg.startsWith('ACCESS_DENIED') ? 403 : msg.includes('not found') ? 404 : 400;
    return res.status(status).json({ success: false, error: msg || 'Failed to clear chat history' });
  }
});

// POST /api/comms/channels/:id/leave
commsRouter.post('/comms/channels/:id/leave', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const result = await leaveOrDeleteChannelForUser(
      auth.actor,
      Boolean(auth.isSuperAdmin),
      req.params.id,
      auth.clientIp
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const status = msg.startsWith('ACCESS_DENIED') ? 403 : msg.includes('not found') ? 404 : 400;
    return res.status(status).json({ success: false, error: msg || 'Failed to leave channel' });
  }
});

// DELETE /api/comms/channels/:id
commsRouter.delete('/comms/channels/:id', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const result = await deleteGroupChannel(
      auth.actor,
      Boolean(auth.isSuperAdmin),
      req.params.id,
      auth.clientIp
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const status = msg.startsWith('ACCESS_DENIED') ? 403 : msg.includes('not found') ? 404 : 400;
    return res.status(status).json({ success: false, error: msg || 'Failed to delete channel' });
  }
});

// GET /api/comms/channels/:id/messages
commsRouter.get('/comms/channels/:id/messages', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const data = await listChannelMessages(auth.actor, Boolean(auth.isSuperAdmin), req.params.id, {
      limit,
      offset,
    });
    return res.json({ success: true, ...data });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const status = msg.startsWith('ACCESS_DENIED') ? 403 : msg.includes('not found') ? 404 : 500;
    return res.status(status).json({ success: false, error: msg || 'Failed to load messages' });
  }
});

// POST /api/comms/channels/:id/messages
commsRouter.post('/comms/channels/:id/messages', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  if (!auth.isSuperAdmin && !auth.policy?.canSendCommunications && !auth.policy?.canSendAnnouncements) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Insufficient permissions to post channel messages.',
    });
  }
  try {
    const message = await postChannelMessage(auth.actor, auth.clientIp, req.params.id, {
      body: req.body?.body || '',
      bodyEn: req.body?.bodyEn,
      priority: (req.body?.priority || 'info') as CommsSeverity,
      replyToMessageId: req.body?.replyToMessageId || null,
      linkedEntityType: req.body?.linkedEntityType || null,
      linkedEntityId: req.body?.linkedEntityId || null,
      linkedEntityName: req.body?.linkedEntityName || null,
    });
    return res.json({ success: true, message });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const status = msg.startsWith('ACCESS_DENIED') ? 403 : 400;
    return res.status(status).json({ success: false, error: msg || 'Failed to post message' });
  }
});

// POST /api/comms/notifications/:id/reply
commsRouter.post('/comms/notifications/:id/reply', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  if (!auth.isSuperAdmin && !auth.policy?.canSendCommunications && !auth.policy?.canSendAnnouncements) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Insufficient permissions to reply to messages.',
    });
  }
  try {
    const result = await replyToInboxNotification(auth.actor, auth.clientIp, req.params.id, {
      body: req.body?.body || '',
      priority: (req.body?.priority || 'info') as CommsSeverity,
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to send reply' });
  }
});

// GET /api/comms/announcements/sent
commsRouter.get('/comms/announcements/sent', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  if (!auth.isSuperAdmin && !auth.policy?.canSendAnnouncements) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Announcement tracker requires broadcast privileges.',
    });
  }
  try {
    const announcements = await listSentAnnouncements(auth.actor, Boolean(auth.isSuperAdmin));
    return res.json({ success: true, announcements });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list announcements' });
  }
});

// GET /api/comms/announcements/:messageId/receipts
commsRouter.get('/comms/announcements/:messageId/receipts', async (req: Request, res: Response) => {
  const auth = await authenticateCommsRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  if (!auth.isSuperAdmin && !auth.policy?.canSendAnnouncements) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Announcement tracker requires broadcast privileges.',
    });
  }
  try {
    const tracker = await getAnnouncementReceipts(
      auth.actor,
      Boolean(auth.isSuperAdmin),
      req.params.messageId
    );
    return res.json({ success: true, ...tracker });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const status = msg.startsWith('ACCESS_DENIED') ? 403 : msg.includes('not found') ? 404 : 500;
    return res.status(status).json({ success: false, error: msg || 'Failed to load receipts' });
  }
});
