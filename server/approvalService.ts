import crypto from 'crypto';
import {
  addPortalAuditLog,
  ensurePostgresConnection,
  getAccessPolicies,
  getAllDevices,
  getAllRemoteServers,
  getAllUsers,
  getPgPool,
  isPostgresConnected,
  loadFallbackStore,
  saveFallbackStore,
} from './db';
import { decryptServerSecret, encryptServerSecret } from './vaultCrypto';
import { emitSystemNotification, resolveUserIdentifiers } from './commsService';
import { broadcastCommsEventToRecipients } from './commsWs';
import {
  ActionApprovalRequest,
  ApprovalQueueSummary,
  ApprovalRequestStatus,
  ApprovalRiskLevel,
  ApprovalTargetEntityType,
  ApprovalTargetOption,
  CreateApprovalRequestPayload,
} from '../src/types';

export interface ApprovalActor {
  userId: string;
  username: string;
  fullName?: string;
  role?: string;
  isSuperAdmin: boolean;
  canApproveActions: boolean;
  clientIp?: string;
}

interface EncryptedApprovalPayload {
  reason: string;
  riskLevel: ApprovalRiskLevel;
  commandPreview: string | null;
  ttlMinutes: number;
  requesterFullName?: string;
  requesterRole?: string;
  executionNote?: string | null;
  executedAt?: string | null;
  executedBy?: string | null;
}

function makeApprovalId(): string {
  return `apr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function safeParseEncryptedPayload(rawEnc: string | null | undefined): EncryptedApprovalPayload {
  const defaults: EncryptedApprovalPayload = {
    reason: '',
    riskLevel: 'high',
    commandPreview: null,
    ttlMinutes: 60,
  };
  if (!rawEnc || typeof rawEnc !== 'string') return defaults;

  let jsonStr = rawEnc;
  try {
    jsonStr = decryptServerSecret(rawEnc);
  } catch {
    jsonStr = rawEnc;
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object') {
      return {
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        riskLevel:
          parsed.riskLevel === 'critical' || parsed.riskLevel === 'medium'
            ? parsed.riskLevel
            : 'high',
        commandPreview:
          typeof parsed.commandPreview === 'string' && parsed.commandPreview.trim()
            ? parsed.commandPreview
            : null,
        ttlMinutes: Number(parsed.ttlMinutes) || 60,
        requesterFullName:
          typeof parsed.requesterFullName === 'string' ? parsed.requesterFullName : undefined,
        requesterRole:
          typeof parsed.requesterRole === 'string' ? parsed.requesterRole : undefined,
        executionNote:
          typeof parsed.executionNote === 'string' ? parsed.executionNote : null,
        executedAt: typeof parsed.executedAt === 'string' ? parsed.executedAt : null,
        executedBy: typeof parsed.executedBy === 'string' ? parsed.executedBy : null,
      };
    }
  } catch {
    // Plain legacy payload string fallback
    return {
      ...defaults,
      commandPreview: rawEnc,
    };
  }
  return defaults;
}

function mapApprovalRow(row: any, includeSensitiveCommand = true): ActionApprovalRequest {
  const dec = safeParseEncryptedPayload(row.command_payload_enc ?? row.commandPayloadEnc);
  const expiresAtIso = row.expires_at
    ? new Date(row.expires_at).toISOString()
    : row.expiresAt || new Date().toISOString();
  const createdAtIso = row.created_at
    ? new Date(row.created_at).toISOString()
    : row.createdAt || new Date().toISOString();
  const decidedAtIso = row.decided_at
    ? new Date(row.decided_at).toISOString()
    : row.decidedAt || null;

  let status: ApprovalRequestStatus = (row.status || 'pending') as ApprovalRequestStatus;
  if (status === 'pending' && Date.parse(expiresAtIso) <= Date.now()) {
    status = 'expired';
  }

  return {
    id: row.id,
    requesterUserId: row.requester_user_id ?? row.requesterUserId ?? '',
    requesterUsername: row.requester_username ?? row.requesterUsername ?? '',
    requesterFullName: dec.requesterFullName || row.requester_username || '',
    requesterRole: dec.requesterRole || undefined,
    targetEntityType: row.target_entity_type ?? row.targetEntityType ?? 'device',
    targetEntityId: row.target_entity_id ?? row.targetEntityId ?? '',
    targetEntityName: row.target_entity_name ?? row.targetEntityName ?? null,
    requestedAction: row.requested_action ?? row.requestedAction ?? '',
    riskLevel: dec.riskLevel,
    reason: dec.reason,
    commandPreview: includeSensitiveCommand ? dec.commandPreview : null,
    executionNote: dec.executionNote || null,
    status,
    approverUserId: row.approver_user_id ?? row.approverUserId ?? null,
    approverUsername: row.approver_username ?? row.approverUsername ?? null,
    decisionNote: row.decision_note ?? row.decisionNote ?? null,
    ttlMinutes: dec.ttlMinutes,
    expiresAt: expiresAtIso,
    createdAt: createdAtIso,
    decidedAt: decidedAtIso,
    executedAt: dec.executedAt || null,
    executedBy: dec.executedBy || null,
  };
}

async function expireStalePendingRequests(): Promise<void> {
  const nowIso = new Date().toISOString();

  // Fallback store sync
  const store = loadFallbackStore();
  let mutatedFallback = false;
  if (Array.isArray(store.action_approval_requests)) {
    for (const row of store.action_approval_requests) {
      if (row && row.status === 'pending' && row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
        row.status = 'expired';
        row.decided_at = row.decided_at || nowIso;
        mutatedFallback = true;
      }
    }
    if (mutatedFallback) {
      saveFallbackStore(store);
    }
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `UPDATE action_approval_requests
         SET status = 'expired',
             decided_at = COALESCE(decided_at, NOW())
         WHERE status = 'pending' AND expires_at <= NOW()`
      );
    } catch (err: any) {
      console.warn('[ApprovalService] Expiry sweep notice:', err?.message || err);
    }
  }
}

async function resolveEligibleApprovers(): Promise<
  Array<{ userId: string; username: string; fullName?: string; role?: string }>
> {
  const [users, policies] = await Promise.all([getAllUsers(), getAccessPolicies()]);
  const activeUsers = (users || []).filter((u: any) => u && u.status !== 'disabled');

  const approverPolicies = (policies || []).filter(
    (p: any) => p && (p.id === 'policy-super-admin' || Boolean(p.canApproveActions))
  );

  const policyMatchedSubjects = new Set<string>();
  for (const pol of approverPolicies) {
    if (pol.subjectId) policyMatchedSubjects.add(String(pol.subjectId).toLowerCase());
    if (Array.isArray(pol.subjectIds)) {
      for (const sid of pol.subjectIds) {
        if (sid) policyMatchedSubjects.add(String(sid).toLowerCase());
      }
    }
  }

  const resolved: Array<{ userId: string; username: string; fullName?: string; role?: string }> = [];
  const seen = new Set<string>();

  for (const u of activeUsers) {
    const uname = (u.username || '').toLowerCase();
    const uid = (u.id || '').toLowerCase();
    const role = (u.role || '').toLowerCase();
    const isAdminOrApprover =
      uname === 'admin' ||
      role.includes('super admin') ||
      role.includes('administrator') ||
      policyMatchedSubjects.has(uname) ||
      policyMatchedSubjects.has(uid);

    if (isAdminOrApprover && !seen.has(uname)) {
      seen.add(uname);
      resolved.push({
        userId: u.id,
        username: u.username,
        fullName: u.fullName || u.username,
        role: u.role || 'Approver',
      });
    }
  }

  return resolved;
}

function isRowOwnedByActor(row: ActionApprovalRequest, actor: ApprovalActor): boolean {
  const ids = new Set(
    resolveUserIdentifiers({ userId: actor.userId, username: actor.username })
  );
  return (
    ids.has((row.requesterUserId || '').toLowerCase()) ||
    ids.has((row.requesterUsername || '').toLowerCase())
  );
}

function computeSummary(
  rows: ActionApprovalRequest[],
  actor: ApprovalActor
): ApprovalQueueSummary {
  const summary: ApprovalQueueSummary = {
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    executed: 0,
    cancelled: 0,
    myPendingRequests: 0,
  };

  for (const r of rows) {
    if (r.status === 'pending') {
      summary.pending++;
      if (isRowOwnedByActor(r, actor)) summary.myPendingRequests++;
    } else if (r.status === 'approved') {
      summary.approved++;
    } else if (r.status === 'rejected') {
      summary.rejected++;
    } else if (r.status === 'expired') {
      summary.expired++;
    } else if (r.status === 'executed') {
      summary.executed++;
    } else if (r.status === 'cancelled') {
      summary.cancelled++;
    }
  }
  return summary;
}

export async function listApprovalRequests(
  actor: ApprovalActor,
  options: {
    status?: string;
    scope?: 'all' | 'mine';
    q?: string;
    limit?: number;
  } = {}
): Promise<{
  items: ActionApprovalRequest[];
  summary: ApprovalQueueSummary;
  canApprove: boolean;
}> {
  await expireStalePendingRequests();

  const canApprove = Boolean(actor.isSuperAdmin || actor.canApproveActions);
  const statusFilter = (options.status || 'all').toLowerCase();
  const scope = canApprove && options.scope !== 'mine' ? 'all' : 'mine';
  const searchQ = (options.q || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));

  let allMapped: ActionApprovalRequest[] = [];

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM action_approval_requests ORDER BY created_at DESC LIMIT 500`
      );
      allMapped = (res.rows || []).map((row) => mapApprovalRow(row, true));
    } catch (err: any) {
      console.error('[ApprovalService] PG listApprovalRequests error:', err?.message || err);
    }
  }

  if (allMapped.length === 0) {
    const store = loadFallbackStore();
    allMapped = (store.action_approval_requests || [])
      .map((row: any) => mapApprovalRow(row, true))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  // Enforce RBAC visibility scope: Approvers see org queue; regular operators see only their own
  const visibleRows = allMapped.filter((r) => {
    const mine = isRowOwnedByActor(r, actor);
    if (!canApprove && !mine) return false;
    if (scope === 'mine' && !mine) return false;
    return true;
  });

  const summary = computeSummary(visibleRows, actor);

  const filtered = visibleRows
    .filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQ) {
        const hay = [
          r.id,
          r.requesterUsername,
          r.requesterFullName,
          r.targetEntityName,
          r.targetEntityType,
          r.requestedAction,
          r.reason,
          r.approverUsername,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(searchQ)) return false;
      }
      return true;
    })
    .slice(0, limit);

  return {
    items: filtered,
    summary,
    canApprove,
  };
}

export async function getApprovalRequestById(
  actor: ApprovalActor,
  approvalId: string
): Promise<ActionApprovalRequest | null> {
  await expireStalePendingRequests();

  const canApprove = Boolean(actor.isSuperAdmin || actor.canApproveActions);
  let rawRow: any = null;

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(`SELECT * FROM action_approval_requests WHERE id = $1 LIMIT 1`, [
        approvalId,
      ]);
      if (res.rows[0]) rawRow = res.rows[0];
    } catch (err: any) {
      console.error('[ApprovalService] PG getApprovalRequestById error:', err?.message || err);
    }
  }

  if (!rawRow) {
    const store = loadFallbackStore();
    rawRow = (store.action_approval_requests || []).find((r: any) => r.id === approvalId) || null;
  }

  if (!rawRow) return null;
  const mapped = mapApprovalRow(rawRow, true);
  if (!canApprove && !isRowOwnedByActor(mapped, actor)) {
    throw new Error('ACCESS_DENIED: You are not authorized to inspect this approval request.');
  }
  return mapped;
}

export async function createApprovalRequest(
  actor: ApprovalActor,
  payload: CreateApprovalRequestPayload
): Promise<ActionApprovalRequest> {
  const targetEntityType = String(payload.targetEntityType || 'device').trim() as ApprovalTargetEntityType;
  const targetEntityId = String(payload.targetEntityId || '').trim();
  const targetEntityName = String(payload.targetEntityName || targetEntityId || '').trim();
  const requestedAction = String(payload.requestedAction || '').trim();
  const reason = String(payload.reason || '').trim();
  const commandPreview = String(payload.commandPreview || '').trim() || null;
  const riskLevel: ApprovalRiskLevel =
    payload.riskLevel === 'critical' || payload.riskLevel === 'medium'
      ? payload.riskLevel
      : 'high';
  const ttlMinutes = Math.min(1440, Math.max(5, Number(payload.ttlMinutes) || 60));

  if (!targetEntityId) {
    throw new Error('Target equipment, server, or module identifier is required.');
  }
  if (!requestedAction) {
    throw new Error('Requested action description is required.');
  }
  if (!reason) {
    throw new Error('Operational justification / reason is required.');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
  const id = makeApprovalId();

  const innerPayload: EncryptedApprovalPayload = {
    reason,
    riskLevel,
    commandPreview,
    ttlMinutes,
    requesterFullName: actor.fullName || actor.username,
    requesterRole: actor.role || 'Operator',
  };
  const commandPayloadEnc = encryptServerSecret(JSON.stringify(innerPayload));

  const rawRecord = {
    id,
    requester_user_id: actor.userId,
    requester_username: actor.username,
    target_entity_type: targetEntityType,
    target_entity_id: targetEntityId,
    target_entity_name: targetEntityName || null,
    requested_action: requestedAction,
    command_payload_enc: commandPayloadEnc,
    status: 'pending',
    approver_user_id: null,
    approver_username: null,
    decision_note: null,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
    decided_at: null,
  };

  // Fallback persistence
  const store = loadFallbackStore();
  if (!Array.isArray(store.action_approval_requests)) store.action_approval_requests = [];
  store.action_approval_requests.unshift(rawRecord);
  if (store.action_approval_requests.length > 2000) {
    store.action_approval_requests = store.action_approval_requests.slice(0, 2000);
  }
  saveFallbackStore(store);

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `INSERT INTO action_approval_requests (
          id, requester_user_id, requester_username, target_entity_type, target_entity_id,
          target_entity_name, requested_action, command_payload_enc, status,
          expires_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)`,
        [
          rawRecord.id,
          rawRecord.requester_user_id,
          rawRecord.requester_username,
          rawRecord.target_entity_type,
          rawRecord.target_entity_id,
          rawRecord.target_entity_name,
          rawRecord.requested_action,
          rawRecord.command_payload_enc,
          rawRecord.expires_at,
          rawRecord.created_at,
        ]
      );
    } catch (err: any) {
      console.error('[ApprovalService] PG createApprovalRequest error:', err?.message || err);
    }
  }

  // Notify eligible approvers (excluding requester if other approvers exist)
  const allApprovers = await resolveEligibleApprovers();
  const requesterSet = new Set(resolveUserIdentifiers(actor));
  const otherApprovers = allApprovers.filter(
    (a) =>
      !requesterSet.has(a.userId.toLowerCase()) && !requesterSet.has(a.username.toLowerCase())
  );
  const notificationTargets = otherApprovers.length > 0 ? otherApprovers : allApprovers;

  await emitSystemNotification({
    category: 'approval_request',
    severity: riskLevel === 'critical' ? 'critical' : 'warning',
    senderName: actor.fullName || actor.username,
    senderRole: actor.role || 'Operator',
    title: `درخواست تایید دو مرحله‌ای جدید: ${requestedAction}`,
    titleEn: `New 2-Step Approval Request: ${requestedAction}`,
    body: `درخواست توسط ${actor.username} برای «${targetEntityName || targetEntityId}» ثبت شد.\nدلیل تغییر: ${reason}\nمهلت تایید: ${ttlMinutes} دقیقه`,
    bodyEn: `Submitted by ${actor.username} for "${targetEntityName || targetEntityId}".\nJustification: ${reason}\nApproval Window: ${ttlMinutes} minutes`,
    linkedEntityType: targetEntityType,
    linkedEntityId: targetEntityId,
    linkedEntityName: targetEntityName || targetEntityId,
    actionTab: 'communications',
    recipients: notificationTargets.map((t) => ({ userId: t.userId, username: t.username })),
    metadata: {
      approvalRequestId: id,
      riskLevel,
      requestedAction,
      status: 'pending',
    },
  });

  // Push live approval queue refresh event via WebSocket
  broadcastCommsEventToRecipients(
    [...allApprovers, { userId: actor.userId, username: actor.username }],
    undefined,
    {
      type: 'approval:updated',
      approvalId: id,
      status: 'pending',
    }
  );

  await addPortalAuditLog({
    category: 'security',
    action: 'APPROVAL_REQUEST_CREATED',
    title: `ثبت درخواست تایید عملیات حساس: ${requestedAction}`,
    title_en: `Submitted 2-Step Approval Request: ${requestedAction}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: actor.clientIp || '127.0.0.1',
    },
    target: {
      type: targetEntityType,
      id: targetEntityId,
      name: targetEntityName || targetEntityId,
    },
    severity: riskLevel === 'critical' ? 'warning' : 'info',
    status: 'success',
    details: `درخواست تایید (${id}) با ریسک ${riskLevel} و مهلت ${ttlMinutes} دقیقه ثبت شد. علت: ${reason}`,
    details_en: `Approval request (${id}) with risk="${riskLevel}" and TTL=${ttlMinutes}m submitted. Reason: ${reason}`,
  }).catch(() => {});

  return mapApprovalRow(rawRecord, true);
}

export async function decideApprovalRequest(
  actor: ApprovalActor,
  approvalId: string,
  decision: 'approved' | 'rejected',
  decisionNote?: string
): Promise<ActionApprovalRequest> {
  if (!actor.isSuperAdmin && !actor.canApproveActions) {
    throw new Error('ACCESS_DENIED: Your role policy does not authorize approving or rejecting action requests.');
  }

  await expireStalePendingRequests();

  const existing = await getApprovalRequestById(actor, approvalId);
  if (!existing) {
    throw new Error('Approval request not found.');
  }
  if (existing.status !== 'pending') {
    throw new Error(`Cannot ${decision} request because current status is "${existing.status}".`);
  }

  // Four-Eyes Policy verification
  const isSelf = isRowOwnedByActor(existing, actor);
  let resolvedNote = (decisionNote || '').trim();
  if (isSelf) {
    const allApprovers = await resolveEligibleApprovers();
    const actorIds = new Set(resolveUserIdentifiers(actor));
    const otherApprovers = allApprovers.filter(
      (a) => !actorIds.has(a.userId.toLowerCase()) && !actorIds.has(a.username.toLowerCase())
    );
    if (!actor.isSuperAdmin || otherApprovers.length > 0) {
      throw new Error(
        'FOUR_EYES_VIOLATION: Four-Eyes control prevents approving your own request when another authorized approver exists.'
      );
    }
    const marker = 'Self-authorized under single-approver mode';
    resolvedNote = resolvedNote ? `${resolvedNote} (${marker})` : marker;
  }

  const nowIso = new Date().toISOString();

  // Fallback persistence update
  const store = loadFallbackStore();
  let updatedRaw: any = null;
  if (Array.isArray(store.action_approval_requests)) {
    const row = store.action_approval_requests.find((r: any) => r.id === approvalId);
    if (row) {
      row.status = decision;
      row.approver_user_id = actor.userId;
      row.approver_username = actor.username;
      row.decision_note = resolvedNote || null;
      row.decided_at = nowIso;
      updatedRaw = row;
      saveFallbackStore(store);
    }
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const pgRes = await pool.query(
        `UPDATE action_approval_requests
         SET status = $2,
             approver_user_id = $3,
             approver_username = $4,
             decision_note = $5,
             decided_at = $6
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [approvalId, decision, actor.userId, actor.username, resolvedNote || null, nowIso]
      );
      if (pgRes.rows[0]) {
        updatedRaw = pgRes.rows[0];
      }
    } catch (err: any) {
      console.error('[ApprovalService] PG decideApprovalRequest error:', err?.message || err);
    }
  }

  if (!updatedRaw) {
    throw new Error('Failed to persist approval decision.');
  }

  const result = mapApprovalRow(updatedRaw, true);

  // Notify requester with real-time Inbox event
  await emitSystemNotification({
    category: 'approval_request',
    severity: decision === 'approved' ? 'info' : 'warning',
    senderName: actor.fullName || actor.username,
    senderRole: actor.role || 'Approver',
    title:
      decision === 'approved'
        ? `تایید درخواست عملیات: ${existing.requestedAction}`
        : `رد درخواست عملیات: ${existing.requestedAction}`,
    titleEn:
      decision === 'approved'
        ? `Approval Granted: ${existing.requestedAction}`
        : `Approval Rejected: ${existing.requestedAction}`,
    body:
      decision === 'approved'
        ? `درخواست شما برای «${existing.targetEntityName || existing.targetEntityId}» توسط ${actor.username} تایید شد.${resolvedNote ? `\nتوضیحات تاییدکننده: ${resolvedNote}` : ''}`
        : `درخواست شما برای «${existing.targetEntityName || existing.targetEntityId}» توسط ${actor.username} رد شد.${resolvedNote ? `\nعلت رد: ${resolvedNote}` : ''}`,
    bodyEn:
      decision === 'approved'
        ? `Your change request for "${existing.targetEntityName || existing.targetEntityId}" was approved by ${actor.username}.${resolvedNote ? `\nApprover note: ${resolvedNote}` : ''}`
        : `Your change request for "${existing.targetEntityName || existing.targetEntityId}" was rejected by ${actor.username}.${resolvedNote ? `\nReason: ${resolvedNote}` : ''}`,
    linkedEntityType: existing.targetEntityType,
    linkedEntityId: existing.targetEntityId,
    linkedEntityName: existing.targetEntityName || existing.targetEntityId,
    actionTab: 'communications',
    recipients: [{ userId: existing.requesterUserId, username: existing.requesterUsername }],
    metadata: {
      approvalRequestId: approvalId,
      decision,
      status: decision,
    },
  });

  const allApprovers = await resolveEligibleApprovers();
  broadcastCommsEventToRecipients(
    [
      ...allApprovers,
      { userId: existing.requesterUserId, username: existing.requesterUsername },
    ],
    undefined,
    {
      type: 'approval:updated',
      approvalId,
      status: decision,
    }
  );

  await addPortalAuditLog({
    category: 'security',
    action: decision === 'approved' ? 'APPROVAL_REQUEST_APPROVED' : 'APPROVAL_REQUEST_REJECTED',
    title:
      decision === 'approved'
        ? `تایید درخواست عملیات حساس: ${existing.requestedAction}`
        : `رد درخواست عملیات حساس: ${existing.requestedAction}`,
    title_en:
      decision === 'approved'
        ? `Approved 2-Step Action Request: ${existing.requestedAction}`
        : `Rejected 2-Step Action Request: ${existing.requestedAction}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Approver',
      ipAddress: actor.clientIp || '127.0.0.1',
    },
    target: {
      type: existing.targetEntityType,
      id: existing.targetEntityId,
      name: existing.targetEntityName || existing.targetEntityId,
    },
    severity: decision === 'approved' ? 'info' : 'warning',
    status: 'success',
    details: `درخواست ${approvalId} توسط ${actor.username} با وضعیت ${decision} ثبت شد.${resolvedNote ? ` توضیحات: ${resolvedNote}` : ''}`,
    details_en: `Request ${approvalId} marked as ${decision} by ${actor.username}.${resolvedNote ? ` Note: ${resolvedNote}` : ''}`,
  }).catch(() => {});

  return result;
}

export async function cancelApprovalRequest(
  actor: ApprovalActor,
  approvalId: string
): Promise<ActionApprovalRequest> {
  await expireStalePendingRequests();
  const existing = await getApprovalRequestById(actor, approvalId);
  if (!existing) {
    throw new Error('Approval request not found.');
  }
  const isOwner = isRowOwnedByActor(existing, actor);
  if (!isOwner && !actor.isSuperAdmin) {
    throw new Error('ACCESS_DENIED: Only the requester or Super Admin can cancel this request.');
  }
  if (existing.status !== 'pending') {
    throw new Error(`Cannot cancel request in status "${existing.status}".`);
  }

  const nowIso = new Date().toISOString();
  const store = loadFallbackStore();
  let updatedRaw: any = null;
  if (Array.isArray(store.action_approval_requests)) {
    const row = store.action_approval_requests.find((r: any) => r.id === approvalId);
    if (row) {
      row.status = 'cancelled';
      row.decided_at = nowIso;
      updatedRaw = row;
      saveFallbackStore(store);
    }
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `UPDATE action_approval_requests
         SET status = 'cancelled', decided_at = $2
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [approvalId, nowIso]
      );
      if (res.rows[0]) updatedRaw = res.rows[0];
    } catch (err: any) {
      console.error('[ApprovalService] PG cancelApprovalRequest error:', err?.message || err);
    }
  }

  if (!updatedRaw) {
    throw new Error('Failed to cancel approval request.');
  }

  const allApprovers = await resolveEligibleApprovers();
  broadcastCommsEventToRecipients(
    [
      ...allApprovers,
      { userId: existing.requesterUserId, username: existing.requesterUsername },
    ],
    undefined,
    {
      type: 'approval:updated',
      approvalId,
      status: 'cancelled',
    }
  );

  await addPortalAuditLog({
    category: 'security',
    action: 'APPROVAL_REQUEST_CANCELLED',
    title: `لغو درخواست تایید عملیات: ${existing.requestedAction}`,
    title_en: `Cancelled 2-Step Approval Request: ${existing.requestedAction}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: actor.clientIp || '127.0.0.1',
    },
    target: {
      type: existing.targetEntityType,
      id: existing.targetEntityId,
      name: existing.targetEntityName || existing.targetEntityId,
    },
    severity: 'info',
    status: 'success',
    details: `درخواست ${approvalId} توسط ${actor.username} لغو شد.`,
    details_en: `Approval request ${approvalId} cancelled by ${actor.username}.`,
  }).catch(() => {});

  return mapApprovalRow(updatedRaw, true);
}

export async function markApprovalRequestExecuted(
  actor: ApprovalActor,
  approvalId: string,
  executionNote?: string
): Promise<ActionApprovalRequest> {
  const existing = await getApprovalRequestById(actor, approvalId);
  if (!existing) {
    throw new Error('Approval request not found.');
  }
  const isOwner = isRowOwnedByActor(existing, actor);
  if (!isOwner && !actor.isSuperAdmin && !actor.canApproveActions) {
    throw new Error('ACCESS_DENIED: Not authorized to execute this approval ticket.');
  }
  if (existing.status !== 'approved') {
    throw new Error(`Approval request must be in "approved" state before marking executed (current: "${existing.status}").`);
  }
  if (Date.parse(existing.expiresAt) <= Date.now()) {
    throw new Error('Approval JIT window has expired. Please submit a new approval request.');
  }

  const nowIso = new Date().toISOString();
  const cleanNote = (executionNote || '').trim() || null;

  // Update encrypted payload with execution metadata
  const currentDec: EncryptedApprovalPayload = {
    reason: existing.reason,
    riskLevel: existing.riskLevel,
    commandPreview: existing.commandPreview || null,
    ttlMinutes: existing.ttlMinutes,
    requesterFullName: existing.requesterFullName,
    requesterRole: existing.requesterRole,
    executionNote: cleanNote,
    executedAt: nowIso,
    executedBy: actor.username,
  };
  const updatedEnc = encryptServerSecret(JSON.stringify(currentDec));

  const store = loadFallbackStore();
  let updatedRaw: any = null;
  if (Array.isArray(store.action_approval_requests)) {
    const row = store.action_approval_requests.find((r: any) => r.id === approvalId);
    if (row) {
      row.status = 'executed';
      row.command_payload_enc = updatedEnc;
      updatedRaw = row;
      saveFallbackStore(store);
    }
  }

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `UPDATE action_approval_requests
         SET status = 'executed', command_payload_enc = $2
         WHERE id = $1 AND status = 'approved'
         RETURNING *`,
        [approvalId, updatedEnc]
      );
      if (res.rows[0]) updatedRaw = res.rows[0];
    } catch (err: any) {
      console.error('[ApprovalService] PG markApprovalRequestExecuted error:', err?.message || err);
    }
  }

  if (!updatedRaw) {
    throw new Error('Failed to mark approval request as executed.');
  }

  const allApprovers = await resolveEligibleApprovers();
  broadcastCommsEventToRecipients(
    [
      ...allApprovers,
      { userId: existing.requesterUserId, username: existing.requesterUsername },
    ],
    undefined,
    {
      type: 'approval:updated',
      approvalId,
      status: 'executed',
    }
  );

  await addPortalAuditLog({
    category: 'security',
    action: 'APPROVAL_REQUEST_EXECUTED',
    title: `اجرای عملیات تاییدشده: ${existing.requestedAction}`,
    title_en: `Executed Approved Change Request: ${existing.requestedAction}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: actor.clientIp || '127.0.0.1',
    },
    target: {
      type: existing.targetEntityType,
      id: existing.targetEntityId,
      name: existing.targetEntityName || existing.targetEntityId,
    },
    severity: 'info',
    status: 'success',
    details: `تیکت تایید ${approvalId} توسط ${actor.username} اجرا و بسته شد.${cleanNote ? ` گزارش اجرا: ${cleanNote}` : ''}`,
    details_en: `Approved ticket ${approvalId} completed by ${actor.username}.${cleanNote ? ` Note: ${cleanNote}` : ''}`,
  }).catch(() => {});

  return mapApprovalRow(updatedRaw, true);
}

export async function listApprovalTargets(): Promise<ApprovalTargetOption[]> {
  const [devices, servers] = await Promise.all([
    getAllDevices().catch(() => []),
    getAllRemoteServers().catch(() => []),
  ]);

  const options: ApprovalTargetOption[] = [];

  for (const d of devices || []) {
    if (!d?.id) continue;
    options.push({
      entityType: 'device',
      id: String(d.id),
      name: String(d.name || d.ip || d.id),
      subtitle: [d.ip, d.vendor || d.type].filter(Boolean).join(' · '),
    });
  }

  for (const s of servers || []) {
    if (!s?.id) continue;
    options.push({
      entityType: 'server',
      id: String(s.id),
      name: String(s.name || s.host || s.id),
      subtitle: [s.host || s.ip, s.osType || s.os_type].filter(Boolean).join(' · '),
    });
  }

  return options;
}
