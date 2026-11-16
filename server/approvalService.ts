import crypto from 'crypto';
import {
  addPortalAuditLog,
  ensurePostgresConnection,
  findUserById,
  findUserByUsername,
  getAccessPolicies,
  getActiveDirectoryConfig,
  getAllDevices,
  getAllRemoteServers,
  getAllUsers,
  getApprovalEligibleCandidates,
  getEffectivePolicyForUser,
  getPgPool,
  getUserGroups,
  isPostgresConnected,
  loadFallbackStore,
  saveFallbackStore,
} from './db';
import { decryptServerSecret, encryptServerSecret } from './vaultCrypto';
import { emitSystemNotification, resolveUserIdentifiers } from './commsService';
import { broadcastCommsEventToRecipients } from './commsWs';
import {
  ActionApprovalRequest,
  ApprovalGatePayload,
  ApprovalGateStagePreview,
  ApprovalQueueSummary,
  ApprovalRequestStatus,
  ApprovalRiskLevel,
  ApprovalStageApproverTargetType,
  ApprovalStageInstance,
  ApprovalStageInstanceStatus,
  ApprovalTargetEntityType,
  ApprovalTargetOption,
  ApprovalWorkflowStageConfig,
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
  actionParams?: Record<string, any> | null;
  requesterFullName?: string;
  requesterRole?: string;
  executionNote?: string | null;
  executedAt?: string | null;
  executedBy?: string | null;
}

interface ResolvedRecipient {
  userId: string;
  username: string;
  fullName?: string;
  role?: string;
  isSuperAdmin?: boolean;
  identifiers: Set<string>;
  groupKeys: Set<string>;
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
    actionParams: null,
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
        actionParams:
          parsed.actionParams && typeof parsed.actionParams === 'object'
            ? parsed.actionParams
            : null,
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
    return {
      ...defaults,
      commandPreview: rawEnc,
    };
  }
  return defaults;
}

function normalizeStageStatus(raw: any): ApprovalStageInstanceStatus {
  if (
    raw === 'waiting' ||
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'skipped' ||
    raw === 'expired'
  ) {
    return raw;
  }
  return 'waiting';
}

function parseStagesFromRow(
  row: any,
  dec: EncryptedApprovalPayload,
  requestStatus: ApprovalRequestStatus,
  createdAtIso: string,
  expiresAtIso: string,
  decidedAtIso: string | null
): {
  stages: ApprovalStageInstance[];
  currentStageOrder: number;
  totalStages: number;
} {
  const rawStagesJson = row.stages_json ?? row.stagesJson;
  let parsed: any[] | null = null;
  if (Array.isArray(rawStagesJson)) {
    parsed = rawStagesJson;
  } else if (typeof rawStagesJson === 'string' && rawStagesJson.trim()) {
    try {
      const candidate = JSON.parse(rawStagesJson);
      if (Array.isArray(candidate)) parsed = candidate;
    } catch {
      parsed = null;
    }
  }

  if (parsed && parsed.length > 0) {
    const stages: ApprovalStageInstance[] = parsed
      .map((s: any, idx: number) => ({
        stageOrder: Number(s.stageOrder) || idx + 1,
        id: String(s.id || `stage-${idx + 1}`),
        titleFa: String(s.titleFa || s.titleEn || `مرحله ${idx + 1}`),
        titleEn: String(s.titleEn || s.titleFa || `Stage ${idx + 1}`),
        approverTargetType: (
          s.approverTargetType === 'specific_users' ||
          s.approverTargetType === 'user_groups' ||
          s.approverTargetType === 'any_approver'
            ? s.approverTargetType
            : 'any_approver'
        ) as ApprovalStageApproverTargetType,
        approverUserIds: Array.isArray(s.approverUserIds) ? s.approverUserIds.map(String) : [],
        approverGroupIds: Array.isArray(s.approverGroupIds) ? s.approverGroupIds.map(String) : [],
        approverLabels: Array.isArray(s.approverLabels) ? s.approverLabels.map(String) : undefined,
        ttlMinutes: Number(s.ttlMinutes) || dec.ttlMinutes || 60,
        status: normalizeStageStatus(s.status),
        startedAt: s.startedAt || null,
        expiresAt: s.expiresAt || null,
        decidedAt: s.decidedAt || null,
        decidedByUserId: s.decidedByUserId || null,
        decidedByUsername: s.decidedByUsername || null,
        decidedByFullName: s.decidedByFullName || null,
        decisionNote: s.decisionNote || null,
        isOverride: Boolean(s.isOverride),
      }))
      .sort((a, b) => a.stageOrder - b.stageOrder);

    const rawCurrentOrder = Number(row.current_stage_order ?? row.currentStageOrder);
    const activePending = stages.find((s) => s.status === 'pending');
    const currentStageOrder =
      activePending?.stageOrder ||
      (Number.isFinite(rawCurrentOrder) && rawCurrentOrder > 0
        ? rawCurrentOrder
        : stages[stages.length - 1].stageOrder);

    // Sync runtime expiry cleanly into active stage view
    if (requestStatus === 'expired') {
      for (const st of stages) {
        if (st.status === 'pending') st.status = 'expired';
        else if (st.status === 'waiting') st.status = 'skipped';
      }
    }

    return {
      stages,
      currentStageOrder,
      totalStages: Number(row.total_stages ?? row.totalStages) || stages.length,
    };
  }

  // Legacy 1-stage fallback synthesis
  const legacyStageStatus: ApprovalStageInstanceStatus =
    requestStatus === 'approved' || requestStatus === 'executed'
      ? 'approved'
      : requestStatus === 'rejected'
      ? 'rejected'
      : requestStatus === 'expired'
      ? 'expired'
      : requestStatus === 'cancelled'
      ? 'skipped'
      : 'pending';

  return {
    stages: [
      {
        stageOrder: 1,
        id: 'legacy-stage-1',
        titleFa: 'تایید سرپرست / مدیر مجاز',
        titleEn: 'Authorized Approver Sign-off',
        approverTargetType: 'any_approver',
        approverUserIds: [],
        approverGroupIds: [],
        ttlMinutes: dec.ttlMinutes,
        status: legacyStageStatus,
        startedAt: createdAtIso,
        expiresAt: expiresAtIso,
        decidedAt: decidedAtIso,
        decidedByUserId: row.approver_user_id ?? row.approverUserId ?? null,
        decidedByUsername: row.approver_username ?? row.approverUsername ?? null,
        decidedByFullName: row.approver_username ?? row.approverUsername ?? null,
        decisionNote: row.decision_note ?? row.decisionNote ?? null,
      },
    ],
    currentStageOrder: 1,
    totalStages: 1,
  };
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

  const { stages, currentStageOrder, totalStages } = parseStagesFromRow(
    row,
    dec,
    status,
    createdAtIso,
    expiresAtIso,
    decidedAtIso
  );

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
    actionKey: row.action_key ?? row.actionKey ?? null,
    actionParams: includeSensitiveCommand ? dec.actionParams || null : null,
    policyId: row.policy_id ?? row.policyId ?? null,
    policyName: row.policy_name ?? row.policyName ?? null,
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
    currentStageOrder,
    totalStages,
    stages,
  };
}

function expireStagesJsonIfPresent(rawStagesJson: string | any[] | null | undefined): string | null {
  if (!rawStagesJson) return null;
  try {
    const arr = Array.isArray(rawStagesJson) ? rawStagesJson : JSON.parse(String(rawStagesJson));
    if (!Array.isArray(arr)) return null;
    const updated = arr.map((st: any) => {
      if (!st || typeof st !== 'object') return st;
      if (st.status === 'pending') return { ...st, status: 'expired' };
      if (st.status === 'waiting') return { ...st, status: 'skipped' };
      return st;
    });
    return JSON.stringify(updated);
  } catch {
    return null;
  }
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
        const nextStagesJson = expireStagesJsonIfPresent(row.stages_json);
        if (nextStagesJson) row.stages_json = nextStagesJson;
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
      const staleRes = await pool.query(
        `SELECT id, stages_json FROM action_approval_requests
         WHERE status = 'pending' AND expires_at <= NOW()`
      );
      for (const r of staleRes.rows || []) {
        const nextStagesJson = expireStagesJsonIfPresent(r.stages_json);
        if (nextStagesJson) {
          await pool.query(
            `UPDATE action_approval_requests
             SET status = 'expired',
                 decided_at = COALESCE(decided_at, NOW()),
                 stages_json = $2
             WHERE id = $1 AND status = 'pending'`,
            [r.id, nextStagesJson]
          );
        } else {
          await pool.query(
            `UPDATE action_approval_requests
             SET status = 'expired',
                 decided_at = COALESCE(decided_at, NOW())
             WHERE id = $1 AND status = 'pending'`,
            [r.id]
          );
        }
      }
    } catch (err: any) {
      console.warn('[ApprovalService] Expiry sweep notice:', err?.message || err);
    }
  }
}

function extractGroupMembers(g: any): string[] {
  if (!g) return [];
  if (Array.isArray(g.memberUserIds)) return g.memberUserIds.map(String);
  if (Array.isArray(g.member_user_ids)) return g.member_user_ids.map(String);
  if (typeof g.member_user_ids === 'string') {
    try {
      const parsed = JSON.parse(g.member_user_ids || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

interface ApprovalDirectorySnapshot {
  candidates: Awaited<ReturnType<typeof getApprovalEligibleCandidates>>;
  users: ResolvedRecipient[];
  privilegedUsers: ResolvedRecipient[];
  localGroups: any[];
  adGroups: any[];
  actorGroupKeysCache: Map<string, Set<string>>;
}

async function loadApprovalDirectorySnapshot(): Promise<ApprovalDirectorySnapshot> {
  const [candidates, rawUsers, localGroups, adConfig] = await Promise.all([
    getApprovalEligibleCandidates().catch(() => ({ success: true, users: [], groups: [] })),
    getAllUsers().catch(() => []),
    getUserGroups().catch(() => []),
    getActiveDirectoryConfig().catch(() => null),
  ]);

  const syncedUsers: any[] = Array.isArray(adConfig?.syncedUsers) ? adConfig.syncedUsers : [];
  const adGroups: any[] = Array.isArray(adConfig?.syncedGroups) ? adConfig.syncedGroups : [];
  const candidateByKey = new Map<string, any>();
  for (const cu of candidates.users || []) {
    if (cu.id) candidateByKey.set(String(cu.id).toLowerCase(), cu);
    if (cu.username) candidateByKey.set(String(cu.username).toLowerCase(), cu);
    if (cu.rawId) candidateByKey.set(String(cu.rawId).toLowerCase(), cu);
  }

  const users: ResolvedRecipient[] = [];
  const seenKeys = new Set<string>();

  for (const u of rawUsers || []) {
    if (!u || u.status === 'disabled') continue;
    const uId = String(u.id || u.username || '').trim();
    const uName = String(u.username || uId).trim();
    if (!uId && !uName) continue;
    const dedupe = uName.toLowerCase() || uId.toLowerCase();
    if (seenKeys.has(dedupe)) continue;
    seenKeys.add(dedupe);

    const cand =
      candidateByKey.get(uId.toLowerCase()) ||
      candidateByKey.get(uName.toLowerCase());

    const identifiers = new Set<string>(
      resolveUserIdentifiers({ userId: uId, username: uName })
    );
    if (u.email) identifiers.add(String(u.email).trim().toLowerCase());
    if (cand?.rawId) identifiers.add(String(cand.rawId).trim().toLowerCase());

    const groupKeys = new Set<string>();
    const rawUserGroupIds: string[] = Array.isArray(u.groupIds)
      ? u.groupIds
      : Array.isArray(u.group_ids)
      ? u.group_ids
      : [];
    for (const gid of rawUserGroupIds) {
      if (gid) groupKeys.add(String(gid).trim().toLowerCase());
    }
    for (const lg of localGroups || []) {
      const members = extractGroupMembers(lg).map((m) => m.trim().toLowerCase());
      if (members.some((m) => identifiers.has(m))) {
        if (lg.id) groupKeys.add(String(lg.id).trim().toLowerCase());
        if (lg.name) groupKeys.add(String(lg.name).trim().toLowerCase());
      }
    }
    // Check AD group memberships if user matches synced AD record
    for (const au of syncedUsers) {
      const auKeys = [au.samAccountName, au.dn, au.email, au.id]
        .filter(Boolean)
        .map((s: any) => String(s).trim().toLowerCase());
      if (auKeys.some((k) => identifiers.has(k))) {
        for (const k of auKeys) identifiers.add(k);
        if (Array.isArray(au.groups)) {
          for (const ag of au.groups) {
            if (ag) groupKeys.add(String(ag).trim().toLowerCase());
          }
        }
      }
    }
    for (const ag of adGroups) {
      if (Array.isArray(ag.members)) {
        const memberSet = new Set(ag.members.map((m: any) => String(m || '').trim().toLowerCase()));
        if ([...identifiers].some((id) => memberSet.has(id))) {
          if (ag.dn) groupKeys.add(String(ag.dn).trim().toLowerCase());
          if (ag.cn) groupKeys.add(String(ag.cn).trim().toLowerCase());
          if (ag.id) groupKeys.add(String(ag.id).trim().toLowerCase());
        }
      }
    }

    const roleLower = String(u.role || '').trim().toLowerCase();
    const isSuperAdmin =
      Boolean(cand?.isSuperAdmin) ||
      uName.toLowerCase() === 'admin' ||
      roleLower.includes('super admin') ||
      roleLower.includes('administrator');
    const canApprove = isSuperAdmin || Boolean(cand?.hasApprovalPrivilege);

    users.push({
      userId: uId,
      username: uName,
      fullName: u.fullName || cand?.displayName || uName,
      role: u.role || cand?.role || 'User',
      isSuperAdmin,
      identifiers,
      groupKeys,
    });
    // Tag internal privilege check via weak attribute
    (users[users.length - 1] as any)._canApprove = canApprove;
  }

  // Also include synced AD users that haven't logged into local_users yet
  for (const au of syncedUsers) {
    const sam = String(au.samAccountName || au.id || au.email || au.dn || '').trim();
    if (!sam) continue;
    const dedupe = sam.toLowerCase();
    if (seenKeys.has(dedupe)) continue;
    seenKeys.add(dedupe);

    const cand =
      candidateByKey.get(dedupe) ||
      (au.dn ? candidateByKey.get(String(au.dn).toLowerCase()) : undefined);

    const identifiers = new Set<string>(
      resolveUserIdentifiers({ userId: cand?.id || sam, username: sam })
    );
    if (au.dn) identifiers.add(String(au.dn).trim().toLowerCase());
    if (au.email) identifiers.add(String(au.email).trim().toLowerCase());

    const groupKeys = new Set<string>();
    if (Array.isArray(au.groups)) {
      for (const ag of au.groups) {
        if (ag) groupKeys.add(String(ag).trim().toLowerCase());
      }
    }
    for (const ag of adGroups) {
      if (Array.isArray(ag.members)) {
        const memberSet = new Set(ag.members.map((m: any) => String(m || '').trim().toLowerCase()));
        if ([...identifiers].some((id) => memberSet.has(id))) {
          if (ag.dn) groupKeys.add(String(ag.dn).trim().toLowerCase());
          if (ag.cn) groupKeys.add(String(ag.cn).trim().toLowerCase());
          if (ag.id) groupKeys.add(String(ag.id).trim().toLowerCase());
        }
      }
    }

    const canApprove = Boolean(cand?.isSuperAdmin || cand?.hasApprovalPrivilege);
    users.push({
      userId: cand?.id || sam,
      username: sam,
      fullName: au.displayName || cand?.displayName || sam,
      role: au.title || cand?.role || 'Active Directory User',
      isSuperAdmin: Boolean(cand?.isSuperAdmin),
      identifiers,
      groupKeys,
    });
    (users[users.length - 1] as any)._canApprove = canApprove;
  }

  const privilegedUsers = users.filter((u) => Boolean((u as any)._canApprove));

  return {
    candidates,
    users,
    privilegedUsers,
    localGroups,
    adGroups,
    actorGroupKeysCache: new Map<string, Set<string>>(),
  };
}

function getActorGroupKeysFromSnapshot(
  actor: ApprovalActor,
  snapshot: ApprovalDirectorySnapshot
): Set<string> {
  const cacheKey = `${actor.userId}:${actor.username}`.toLowerCase();
  const cached = snapshot.actorGroupKeysCache.get(cacheKey);
  if (cached) return cached;

  const actorIds = new Set(resolveUserIdentifiers(actor));
  const combined = new Set<string>();

  for (const u of snapshot.users) {
    if ([...actorIds].some((id) => u.identifiers.has(id))) {
      for (const g of u.groupKeys) combined.add(g);
    }
  }
  for (const lg of snapshot.localGroups) {
    const members = extractGroupMembers(lg).map((m) => m.trim().toLowerCase());
    if (members.some((m) => actorIds.has(m))) {
      if (lg.id) combined.add(String(lg.id).trim().toLowerCase());
      if (lg.name) combined.add(String(lg.name).trim().toLowerCase());
    }
  }

  snapshot.actorGroupKeysCache.set(cacheKey, combined);
  return combined;
}

function resolveStageRecipientsFromSnapshot(
  stage: ApprovalStageInstance | ApprovalWorkflowStageConfig,
  snapshot: ApprovalDirectorySnapshot
): ResolvedRecipient[] {
  const targetType = stage.approverTargetType || 'any_approver';
  if (targetType === 'any_approver') {
    return snapshot.privilegedUsers;
  }

  if (targetType === 'specific_users') {
    const targetIds = new Set(
      (stage.approverUserIds || []).map((id) => String(id || '').trim().toLowerCase()).filter(Boolean)
    );
    if (targetIds.size === 0) return [];
    return snapshot.privilegedUsers.filter((u) =>
      [...u.identifiers].some((id) => targetIds.has(id))
    );
  }

  if (targetType === 'user_groups') {
    const targetGroups = new Set(
      (stage.approverGroupIds || []).map((id) => String(id || '').trim().toLowerCase()).filter(Boolean)
    );
    if (targetGroups.size === 0) return [];
    // Include matched group names too (in case stage stores ID and user has name or vice versa)
    for (const cg of snapshot.candidates.groups || []) {
      const keys = [cg.id, cg.rawId, cg.name]
        .filter(Boolean)
        .map((k: any) => String(k).trim().toLowerCase());
      if (keys.some((k) => targetGroups.has(k))) {
        for (const k of keys) targetGroups.add(k);
      }
    }
    return snapshot.privilegedUsers.filter((u) =>
      [...u.groupKeys].some((gk) => targetGroups.has(gk))
    );
  }

  return [];
}

function resolveStageApproverLabels(
  stage: ApprovalWorkflowStageConfig,
  snapshot: ApprovalDirectorySnapshot
): string[] {
  if (stage.approverTargetType === 'any_approver') {
    return [];
  }
  if (stage.approverTargetType === 'specific_users') {
    const labels: string[] = [];
    for (const uid of stage.approverUserIds || []) {
      const clean = String(uid || '').trim().toLowerCase();
      const cand = (snapshot.candidates.users || []).find(
        (u) =>
          u.id.toLowerCase() === clean ||
          (u.username || '').toLowerCase() === clean ||
          (u.rawId || '').toLowerCase() === clean
      );
      labels.push(cand?.displayName || cand?.username || uid);
    }
    return labels;
  }
  if (stage.approverTargetType === 'user_groups') {
    const labels: string[] = [];
    for (const gid of stage.approverGroupIds || []) {
      const clean = String(gid || '').trim().toLowerCase();
      const cand = (snapshot.candidates.groups || []).find(
        (g) =>
          g.id.toLowerCase() === clean ||
          g.name.toLowerCase() === clean ||
          (g.rawId || '').toLowerCase() === clean
      );
      labels.push(cand?.displayName || cand?.name || gid);
    }
    return labels;
  }
  return [];
}

function isActorAssignedToStageWithSnapshot(
  actor: ApprovalActor,
  stage: ApprovalStageInstance | undefined,
  snapshot: ApprovalDirectorySnapshot
): boolean {
  if (!stage || stage.status !== 'pending') return false;
  if (!actor.isSuperAdmin && !actor.canApproveActions) return false;

  if (stage.approverTargetType === 'any_approver') {
    return true;
  }

  const actorIds = new Set(resolveUserIdentifiers(actor));
  if (stage.approverTargetType === 'specific_users') {
    const targetIds = new Set(
      (stage.approverUserIds || []).map((id) => String(id || '').trim().toLowerCase()).filter(Boolean)
    );
    return [...actorIds].some((id) => targetIds.has(id));
  }

  if (stage.approverTargetType === 'user_groups') {
    const targetGroups = new Set(
      (stage.approverGroupIds || []).map((id) => String(id || '').trim().toLowerCase()).filter(Boolean)
    );
    for (const cg of snapshot.candidates.groups || []) {
      const keys = [cg.id, cg.rawId, cg.name]
        .filter(Boolean)
        .map((k: any) => String(k).trim().toLowerCase());
      if (keys.some((k) => targetGroups.has(k))) {
        for (const k of keys) targetGroups.add(k);
      }
    }
    const actorGroups = getActorGroupKeysFromSnapshot(actor, snapshot);
    return [...actorGroups].some((gk) => targetGroups.has(gk));
  }

  return false;
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

function isActorInAnyStage(
  row: ActionApprovalRequest,
  actor: ApprovalActor,
  snapshot: ApprovalDirectorySnapshot
): boolean {
  const stages = row.stages || [];
  const actorIds = new Set(resolveUserIdentifiers(actor));
  const actorGroups = getActorGroupKeysFromSnapshot(actor, snapshot);
  for (const st of stages) {
    if (st.decidedByUsername && actorIds.has(st.decidedByUsername.toLowerCase())) return true;
    if (st.decidedByUserId && actorIds.has(st.decidedByUserId.toLowerCase())) return true;
    if (st.approverTargetType === 'specific_users') {
      const targets = (st.approverUserIds || []).map((id) => String(id).toLowerCase());
      if (targets.some((id) => actorIds.has(id))) return true;
    }
    if (st.approverTargetType === 'user_groups') {
      const targets = (st.approverGroupIds || []).map((id) => String(id).toLowerCase());
      if (targets.some((id) => actorGroups.has(id))) return true;
    }
  }
  return false;
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
    awaitingMyDecision: 0,
  };

  for (const r of rows) {
    if (r.status === 'pending') {
      summary.pending++;
      if (isRowOwnedByActor(r, actor)) summary.myPendingRequests++;
      if (r.isAssignedToCurrentActor) {
        summary.awaitingMyDecision = (summary.awaitingMyDecision || 0) + 1;
      }
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

function annotateRowForActor(
  row: ActionApprovalRequest,
  actor: ApprovalActor,
  snapshot: ApprovalDirectorySnapshot
): ActionApprovalRequest {
  const activeStage = (row.stages || []).find(
    (s) => s.status === 'pending' && s.stageOrder === (row.currentStageOrder || 1)
  ) || (row.stages || []).find((s) => s.status === 'pending');
  return {
    ...row,
    isAssignedToCurrentActor:
      row.status === 'pending' && isActorAssignedToStageWithSnapshot(actor, activeStage, snapshot),
  };
}

export async function listApprovalRequests(
  actor: ApprovalActor,
  options: {
    status?: string;
    scope?: 'all' | 'mine' | 'assigned_to_me';
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
  const requestedScope = options.scope || 'all';
  const effectiveScope: 'all' | 'mine' | 'assigned_to_me' = canApprove
    ? requestedScope === 'mine' || requestedScope === 'assigned_to_me'
      ? requestedScope
      : 'all'
    : 'mine';
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

  const snapshot = await loadApprovalDirectorySnapshot();
  const annotated = allMapped.map((r) => annotateRowForActor(r, actor, snapshot));

  // Enforce RBAC visibility scope: Approvers see org queue; regular operators see only their own
  const visibleOrgRows = annotated.filter((r) => {
    if (canApprove) return true;
    return isRowOwnedByActor(r, actor);
  });

  const summary = computeSummary(visibleOrgRows, actor);

  const scopeFiltered = visibleOrgRows.filter((r) => {
    if (effectiveScope === 'mine') return isRowOwnedByActor(r, actor);
    if (effectiveScope === 'assigned_to_me') return Boolean(r.isAssignedToCurrentActor);
    return true;
  });

  const filtered = scopeFiltered
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
          r.policyName,
          r.actionKey,
          r.reason,
          r.approverUsername,
          ...(r.stages || []).flatMap((s) => [s.titleEn, s.titleFa, s.decidedByUsername || '']),
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
  const snapshot = await loadApprovalDirectorySnapshot();
  if (!canApprove && !isRowOwnedByActor(mapped, actor) && !isActorInAnyStage(mapped, actor, snapshot)) {
    throw new Error('ACCESS_DENIED: You are not authorized to inspect this approval request.');
  }
  return annotateRowForActor(mapped, actor, snapshot);
}

function excludeSelfIfOthersExist(
  recipients: ResolvedRecipient[],
  requester: { userId: string; username: string }
): ResolvedRecipient[] {
  const requesterSet = new Set(resolveUserIdentifiers(requester));
  const others = recipients.filter(
    (r) => ![...r.identifiers].some((id) => requesterSet.has(id))
  );
  return others.length > 0 ? others : recipients;
}

export async function createApprovalRequest(
  actor: ApprovalActor,
  payload: CreateApprovalRequestPayload
): Promise<ActionApprovalRequest> {
  const targetEntityType = String(payload.targetEntityType || 'device').trim() as ApprovalTargetEntityType;
  const targetEntityId = String(payload.targetEntityId || '').trim();
  const targetEntityName = String(payload.targetEntityName || targetEntityId || '').trim();
  const requestedAction = String(payload.requestedAction || '').trim();
  const actionKey = typeof payload.actionKey === 'string' && payload.actionKey.trim()
    ? payload.actionKey.trim()
    : null;
  const reason = String(payload.reason || '').trim();
  const commandPreview = String(payload.commandPreview || '').trim() || null;
  const riskLevel: ApprovalRiskLevel =
    payload.riskLevel === 'critical' || payload.riskLevel === 'medium'
      ? payload.riskLevel
      : 'high';
  const defaultTtlMinutes = Math.min(43200, Math.max(1, Number(payload.ttlMinutes) || 60));

  if (!targetEntityId) {
    throw new Error('Target equipment, server, or module identifier is required.');
  }
  if (!requestedAction) {
    throw new Error('Requested action description is required.');
  }
  if (!reason) {
    throw new Error('Operational justification / reason is required.');
  }

  // Resolve effective AccessPolicy for requester (or explicit policyId override)
  const [allPolicies, userRecord, snapshot] = await Promise.all([
    getAccessPolicies().catch(() => []),
    (findUserById(actor.userId).catch(() => null)) ||
      (findUserByUsername(actor.username).catch(() => null)),
    loadApprovalDirectorySnapshot(),
  ]);

  let resolvedPolicy: any = null;
  if (payload.policyId) {
    resolvedPolicy = (allPolicies || []).find((p: any) => p?.id === payload.policyId) || null;
  }
  if (!resolvedPolicy) {
    resolvedPolicy = await getEffectivePolicyForUser(
      userRecord || { id: actor.userId, username: actor.username, role: actor.role }
    ).catch(() => null);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Build sequential multi-stage workflow from policy or single-stage default
  const configuredStages: ApprovalWorkflowStageConfig[] = Array.isArray(
    resolvedPolicy?.approvalWorkflowStages
  )
    ? [...resolvedPolicy.approvalWorkflowStages]
        .filter((s: any) => s && typeof s === 'object')
        .sort((a: any, b: any) => (Number(a.stageOrder) || 0) - (Number(b.stageOrder) || 0))
    : [];

  let stages: ApprovalStageInstance[] = [];
  if (configuredStages.length > 0) {
    stages = configuredStages.map((cfg, idx) => {
      const stageOrder = idx + 1;
      const stageTtl = Math.min(
        43200,
        Math.max(1, Number(cfg.ttlMinutes) || defaultTtlMinutes)
      );
      const isFirst = idx === 0;
      return {
        stageOrder,
        id: String((cfg as any).id || `stage-${stageOrder}`),
        titleFa: String(cfg.titleFa || cfg.titleEn || `مرحله ${stageOrder}`),
        titleEn: String(cfg.titleEn || cfg.titleFa || `Stage ${stageOrder}`),
        approverTargetType: cfg.approverTargetType || 'any_approver',
        approverUserIds: Array.isArray(cfg.approverUserIds) ? cfg.approverUserIds : [],
        approverGroupIds: Array.isArray(cfg.approverGroupIds) ? cfg.approverGroupIds : [],
        approverLabels: resolveStageApproverLabels(cfg, snapshot),
        ttlMinutes: stageTtl,
        status: isFirst ? 'pending' : 'waiting',
        startedAt: isFirst ? nowIso : null,
        expiresAt: isFirst ? new Date(now.getTime() + stageTtl * 60_000).toISOString() : null,
        decidedAt: null,
        decidedByUserId: null,
        decidedByUsername: null,
        decidedByFullName: null,
        decisionNote: null,
      };
    });
  } else {
    stages = [
      {
        stageOrder: 1,
        id: 'default-stage-1',
        titleFa: 'تایید سرپرست / مدیر مجاز',
        titleEn: 'Supervisor / Authorized Approver Sign-off',
        approverTargetType: 'any_approver',
        approverUserIds: [],
        approverGroupIds: [],
        approverLabels: [],
        ttlMinutes: defaultTtlMinutes,
        status: 'pending',
        startedAt: nowIso,
        expiresAt: new Date(now.getTime() + defaultTtlMinutes * 60_000).toISOString(),
        decidedAt: null,
        decidedByUserId: null,
        decidedByUsername: null,
        decidedByFullName: null,
        decisionNote: null,
      },
    ];
  }

  const stage1 = stages[0];
  const expiresAtIso = stage1.expiresAt || new Date(now.getTime() + defaultTtlMinutes * 60_000).toISOString();
  const totalStages = stages.length;
  const stagesJson = JSON.stringify(stages);
  const id = makeApprovalId();

  const innerPayload: EncryptedApprovalPayload = {
    reason,
    riskLevel,
    commandPreview,
    ttlMinutes: stage1.ttlMinutes || defaultTtlMinutes,
    actionParams:
      payload.actionParams && typeof payload.actionParams === 'object' ? payload.actionParams : null,
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
    action_key: actionKey,
    policy_id: resolvedPolicy?.id || null,
    policy_name: resolvedPolicy?.name || null,
    current_stage_order: 1,
    total_stages: totalStages,
    stages_json: stagesJson,
    command_payload_enc: commandPayloadEnc,
    status: 'pending',
    approver_user_id: null,
    approver_username: null,
    decision_note: null,
    expires_at: expiresAtIso,
    created_at: nowIso,
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
          target_entity_name, requested_action, action_key, policy_id, policy_name,
          current_stage_order, total_stages, stages_json,
          command_payload_enc, status, expires_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16)`,
        [
          rawRecord.id,
          rawRecord.requester_user_id,
          rawRecord.requester_username,
          rawRecord.target_entity_type,
          rawRecord.target_entity_id,
          rawRecord.target_entity_name,
          rawRecord.requested_action,
          rawRecord.action_key,
          rawRecord.policy_id,
          rawRecord.policy_name,
          rawRecord.current_stage_order,
          rawRecord.total_stages,
          rawRecord.stages_json,
          rawRecord.command_payload_enc,
          rawRecord.expires_at,
          rawRecord.created_at,
        ]
      );
    } catch (err: any) {
      console.error('[ApprovalService] PG createApprovalRequest error:', err?.message || err);
    }
  }

  // Targeted Stage 1 Notification ONLY (do not prematurely spam Stage 2/3 approvers)
  let stage1Recipients = resolveStageRecipientsFromSnapshot(stage1, snapshot);
  if (stage1Recipients.length === 0) {
    // Safety fallback to Super Admins so request is never orphaned silently
    stage1Recipients = snapshot.privilegedUsers.filter((u) => u.isSuperAdmin);
  }
  const notificationTargets = excludeSelfIfOthersExist(stage1Recipients, actor);

  const stageHeaderFa =
    totalStages > 1 ? `مرحله ۱ از ${totalStages} (${stage1.titleFa})` : stage1.titleFa;
  const stageHeaderEn =
    totalStages > 1 ? `Stage 1/${totalStages} (${stage1.titleEn})` : stage1.titleEn;

  await emitSystemNotification({
    category: 'approval_request',
    severity: riskLevel === 'critical' ? 'critical' : 'warning',
    senderName: actor.fullName || actor.username,
    senderRole: actor.role || 'Operator',
    title: `درخواست تایید (${stageHeaderFa}): ${requestedAction}`,
    titleEn: `Approval Required (${stageHeaderEn}): ${requestedAction}`,
    body: `درخواست توسط ${actor.username} برای «${targetEntityName || targetEntityId}» ثبت شد.\nمرحله فعلی: ${stageHeaderFa}\nدلیل تغییر: ${reason}\nمهلت تایید مرحله: ${stage1.ttlMinutes} دقیقه`,
    bodyEn: `Submitted by ${actor.username} for "${targetEntityName || targetEntityId}".\nActive Stage: ${stageHeaderEn}\nJustification: ${reason}\nStage Window: ${stage1.ttlMinutes} minutes`,
    linkedEntityType: targetEntityType,
    linkedEntityId: targetEntityId,
    linkedEntityName: targetEntityName || targetEntityId,
    actionTab: 'communications',
    recipients: notificationTargets.map((t) => ({ userId: t.userId, username: t.username })),
    metadata: {
      approvalRequestId: id,
      riskLevel,
      requestedAction,
      actionKey,
      policyId: rawRecord.policy_id,
      policyName: rawRecord.policy_name,
      status: 'pending',
      currentStageOrder: 1,
      totalStages,
      stageTitleEn: stage1.titleEn,
      stageTitleFa: stage1.titleFa,
    },
  });

  // Push live queue update event via WebSocket
  broadcastCommsEventToRecipients(
    [
      ...snapshot.privilegedUsers.map((u) => ({ userId: u.userId, username: u.username })),
      { userId: actor.userId, username: actor.username },
    ],
    undefined,
    {
      type: 'approval:updated',
      approvalId: id,
      status: 'pending',
      currentStageOrder: 1,
      totalStages,
    }
  );

  await addPortalAuditLog({
    category: 'security',
    action: 'APPROVAL_REQUEST_CREATED',
    title: `ثبت درخواست تایید ${totalStages > 1 ? `${totalStages} مرحله‌ای` : 'عملیات حساس'}: ${requestedAction}`,
    title_en: `Submitted ${totalStages}-Stage Approval Request: ${requestedAction}`,
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
    details: `درخواست تایید (${id}) با ${totalStages} مرحله و ریسک ${riskLevel} ثبت شد. مرحله اول (${stage1.titleFa}) با مهلت ${stage1.ttlMinutes} دقیقه فعال گردید.`,
    details_en: `Approval request (${id}) with ${totalStages} stage(s), risk="${riskLevel}" submitted. Stage 1 (${stage1.titleEn}, TTL=${stage1.ttlMinutes}m) active.`,
  }).catch(() => {});

  return annotateRowForActor(mapApprovalRow(rawRecord, true), actor, snapshot);
}

export async function decideApprovalRequest(
  actor: ApprovalActor,
  approvalId: string,
  decision: 'approved' | 'rejected',
  decisionNote?: string,
  options?: { emergencyOverride?: boolean }
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

  const snapshot = await loadApprovalDirectorySnapshot();
  const fallbackDefaultStages: ApprovalStageInstance[] = [
    {
      stageOrder: 1,
      id: 'default-stage-1',
      titleFa: 'تایید سرپرست / مدیر مجاز',
      titleEn: 'Supervisor / Authorized Approver Sign-off',
      approverTargetType: 'any_approver',
      approverUserIds: [],
      approverGroupIds: [],
      ttlMinutes: existing.ttlMinutes || 60,
      status: 'pending',
      startedAt: existing.createdAt,
      expiresAt: existing.expiresAt,
    },
  ];
  const stages: ApprovalStageInstance[] = (
    existing.stages && existing.stages.length > 0
      ? existing.stages.map((s) => ({ ...s }))
      : fallbackDefaultStages
  ).sort((a, b) => a.stageOrder - b.stageOrder);

  const activeStageIndex = stages.findIndex(
    (s) => s.status === 'pending' && s.stageOrder === (existing.currentStageOrder || 1)
  );
  const resolvedStageIndex =
    activeStageIndex >= 0
      ? activeStageIndex
      : stages.findIndex((s) => s.status === 'pending');

  if (resolvedStageIndex < 0) {
    throw new Error('No pending approval stage found for this request.');
  }

  const activeStage = stages[resolvedStageIndex];
  const stageRecipients = resolveStageRecipientsFromSnapshot(activeStage, snapshot);
  const assignedToStage = isActorAssignedToStageWithSnapshot(actor, activeStage, snapshot);

  let usedOverride = false;
  if (!assignedToStage) {
    const canEmergencyOverride =
      actor.isSuperAdmin && (options?.emergencyOverride === true || stageRecipients.length === 0);
    if (!canEmergencyOverride) {
      throw new Error(
        `ACCESS_DENIED: You are not an assigned approver for Stage ${activeStage.stageOrder} (${activeStage.titleEn}).`
      );
    }
    usedOverride = true;
  }

  // Per-stage Four-Eyes Policy check
  const isSelf = isRowOwnedByActor(existing, actor);
  let resolvedNote = (decisionNote || '').trim();
  if (isSelf) {
    const actorIds = new Set(resolveUserIdentifiers(actor));
    const effectivePool =
      stageRecipients.length > 0 ? stageRecipients : snapshot.privilegedUsers;
    const otherApprovers = effectivePool.filter(
      (u) => ![...u.identifiers].some((id) => actorIds.has(id))
    );
    if (!actor.isSuperAdmin || otherApprovers.length > 0) {
      throw new Error(
        'FOUR_EYES_VIOLATION: Four-Eyes control prevents approving your own request when another authorized approver exists for this stage.'
      );
    }
    const marker = 'Self-authorized under single-approver mode';
    resolvedNote = resolvedNote ? `${resolvedNote} (${marker})` : marker;
  }

  if (usedOverride) {
    const overrideTag = 'Super Admin Override';
    resolvedNote = resolvedNote ? `${resolvedNote} (${overrideTag})` : overrideTag;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const totalStages = stages.length;

  activeStage.status = decision === 'approved' ? 'approved' : 'rejected';
  activeStage.decidedAt = nowIso;
  activeStage.decidedByUserId = actor.userId;
  activeStage.decidedByUsername = actor.username;
  activeStage.decidedByFullName = actor.fullName || actor.username;
  activeStage.decisionNote = resolvedNote || null;
  activeStage.isOverride = usedOverride;

  let nextRequestStatus: ApprovalRequestStatus = decision;
  let nextStageOrder = activeStage.stageOrder;
  let nextExpiresAtIso = existing.expiresAt;
  let nextDecidedAtIso: string | null = nowIso;
  let nextStageActivated: ApprovalStageInstance | null = null;

  if (decision === 'rejected') {
    for (let i = resolvedStageIndex + 1; i < stages.length; i++) {
      if (stages[i].status === 'waiting' || stages[i].status === 'pending') {
        stages[i].status = 'skipped';
      }
    }
  } else {
    // Approved current stage -> check if another waiting stage follows
    const nextCandidate = stages
      .slice(resolvedStageIndex + 1)
      .find((s) => s.status === 'waiting');
    if (nextCandidate) {
      const nextTtl = Math.min(
        43200,
        Math.max(1, Number(nextCandidate.ttlMinutes) || existing.ttlMinutes || 60)
      );
      nextExpiresAtIso = new Date(now.getTime() + nextTtl * 60_000).toISOString();
      nextCandidate.status = 'pending';
      nextCandidate.startedAt = nowIso;
      nextCandidate.expiresAt = nextExpiresAtIso;
      nextStageOrder = nextCandidate.stageOrder;
      nextRequestStatus = 'pending';
      nextDecidedAtIso = null;
      nextStageActivated = nextCandidate;
    }
  }

  const stagesJson = JSON.stringify(stages);

  // Fallback persistence update
  const store = loadFallbackStore();
  let updatedRaw: any = null;
  if (Array.isArray(store.action_approval_requests)) {
    const row = store.action_approval_requests.find((r: any) => r.id === approvalId);
    if (row) {
      row.status = nextRequestStatus;
      row.current_stage_order = nextStageOrder;
      row.total_stages = totalStages;
      row.stages_json = stagesJson;
      row.expires_at = nextExpiresAtIso;
      row.approver_user_id = actor.userId;
      row.approver_username = actor.username;
      row.decision_note = resolvedNote || null;
      row.decided_at = nextDecidedAtIso;
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
             current_stage_order = $3,
             total_stages = $4,
             stages_json = $5,
             expires_at = $6,
             approver_user_id = $7,
             approver_username = $8,
             decision_note = $9,
             decided_at = $10
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [
          approvalId,
          nextRequestStatus,
          nextStageOrder,
          totalStages,
          stagesJson,
          nextExpiresAtIso,
          actor.userId,
          actor.username,
          resolvedNote || null,
          nextDecidedAtIso,
        ]
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

  const mapped = annotateRowForActor(mapApprovalRow(updatedRaw, true), actor, snapshot);

  // Dispatch targeted notifications according to workflow state
  if (nextStageActivated) {
    // 1. Notify NEXT stage approvers ONLY with actionable approval_request notification
    let nextRecipients = resolveStageRecipientsFromSnapshot(nextStageActivated, snapshot);
    if (nextRecipients.length === 0) {
      nextRecipients = snapshot.privilegedUsers.filter((u) => u.isSuperAdmin);
    }
    const nextActionTargets = excludeSelfIfOthersExist(nextRecipients, {
      userId: existing.requesterUserId,
      username: existing.requesterUsername,
    });

    await emitSystemNotification({
      category: 'approval_request',
      severity: existing.riskLevel === 'critical' ? 'critical' : 'warning',
      senderName: actor.fullName || actor.username,
      senderRole: actor.role || 'Approver',
      title: `نوبت تایید مرحله ${nextStageActivated.stageOrder} از ${totalStages}: ${existing.requestedAction}`,
      titleEn: `Stage ${nextStageActivated.stageOrder}/${totalStages} Approval Required: ${existing.requestedAction}`,
      body: `مرحله ${activeStage.stageOrder} (${activeStage.titleFa}) توسط ${actor.username} تایید شد و اکنون نوبت بررسی مرحله «${nextStageActivated.titleFa}» برای «${existing.targetEntityName || existing.targetEntityId}» است.\nمهلت تایید این مرحله: ${nextStageActivated.ttlMinutes} دقیقه${resolvedNote ? `\nیادداشت مرحله قبل: ${resolvedNote}` : ''}`,
      bodyEn: `Stage ${activeStage.stageOrder} (${activeStage.titleEn}) was approved by ${actor.username}. Stage "${nextStageActivated.titleEn}" for "${existing.targetEntityName || existing.targetEntityId}" now awaits your sign-off.\nStage Window: ${nextStageActivated.ttlMinutes} minutes${resolvedNote ? `\nPrevious stage note: ${resolvedNote}` : ''}`,
      linkedEntityType: existing.targetEntityType,
      linkedEntityId: existing.targetEntityId,
      linkedEntityName: existing.targetEntityName || existing.targetEntityId,
      actionTab: 'communications',
      recipients: nextActionTargets.map((t) => ({ userId: t.userId, username: t.username })),
      metadata: {
        approvalRequestId: approvalId,
        riskLevel: existing.riskLevel,
        requestedAction: existing.requestedAction,
        actionKey: existing.actionKey || null,
        policyId: existing.policyId || null,
        policyName: existing.policyName || null,
        status: 'pending',
        currentStageOrder: nextStageActivated.stageOrder,
        totalStages,
        stageTitleEn: nextStageActivated.titleEn,
        stageTitleFa: nextStageActivated.titleFa,
      },
    });

    // 2. Inform requester of stage progression (without sending approval_request prompt to avoid confusion)
    await emitSystemNotification({
      category: 'system_alert',
      severity: 'info',
      senderName: actor.fullName || actor.username,
      senderRole: actor.role || 'Approver',
      title: `تایید مرحله ${activeStage.stageOrder} از ${totalStages}: ${existing.requestedAction}`,
      titleEn: `Stage ${activeStage.stageOrder}/${totalStages} Approved: ${existing.requestedAction}`,
      body: `مرحله ${activeStage.stageOrder} (${activeStage.titleFa}) توسط ${actor.username} تایید شد و درخواست به مرحله ${nextStageActivated.stageOrder} (${nextStageActivated.titleFa}) ارجاع گردید.`,
      bodyEn: `Stage ${activeStage.stageOrder} (${activeStage.titleEn}) was approved by ${actor.username} and routed to Stage ${nextStageActivated.stageOrder} (${nextStageActivated.titleEn}).`,
      linkedEntityType: existing.targetEntityType,
      linkedEntityId: existing.targetEntityId,
      linkedEntityName: existing.targetEntityName || existing.targetEntityId,
      actionTab: 'communications',
      recipients: [{ userId: existing.requesterUserId, username: existing.requesterUsername }],
      metadata: {
        approvalRequestId: approvalId,
        status: 'pending',
        currentStageOrder: nextStageActivated.stageOrder,
        totalStages,
      },
    });
  } else {
    // Final approval OR Rejection -> notify requester
    await emitSystemNotification({
      category: 'approval_request',
      severity: decision === 'approved' ? 'info' : 'warning',
      senderName: actor.fullName || actor.username,
      senderRole: actor.role || 'Approver',
      title:
        decision === 'approved'
          ? `تایید نهایی درخواست (${totalStages > 1 ? `تکمیل ${totalStages} مرحله` : 'آماده اجرا'}): ${existing.requestedAction}`
          : `رد درخواست در مرحله ${activeStage.stageOrder} از ${totalStages}: ${existing.requestedAction}`,
      titleEn:
        decision === 'approved'
          ? `Final Approval Granted${totalStages > 1 ? ` (${totalStages}/${totalStages} Stages)` : ''}: ${existing.requestedAction}`
          : `Approval Rejected at Stage ${activeStage.stageOrder}/${totalStages}: ${existing.requestedAction}`,
      body:
        decision === 'approved'
          ? `درخواست شما برای «${existing.targetEntityName || existing.targetEntityId}» با تایید نهایی توسط ${actor.username} به تایید کامل رسید.${resolvedNote ? `\nتوضیحات تاییدکننده: ${resolvedNote}` : ''}`
          : `درخواست شما برای «${existing.targetEntityName || existing.targetEntityId}» در مرحله ${activeStage.stageOrder} (${activeStage.titleFa}) توسط ${actor.username} رد شد.${resolvedNote ? `\nعلت رد: ${resolvedNote}` : ''}`,
      bodyEn:
        decision === 'approved'
          ? `Your change request for "${existing.targetEntityName || existing.targetEntityId}" passed final approval by ${actor.username}.${resolvedNote ? `\nApprover note: ${resolvedNote}` : ''}`
          : `Your change request for "${existing.targetEntityName || existing.targetEntityId}" was rejected at Stage ${activeStage.stageOrder} (${activeStage.titleEn}) by ${actor.username}.${resolvedNote ? `\nReason: ${resolvedNote}` : ''}`,
      linkedEntityType: existing.targetEntityType,
      linkedEntityId: existing.targetEntityId,
      linkedEntityName: existing.targetEntityName || existing.targetEntityId,
      actionTab: 'communications',
      recipients: [{ userId: existing.requesterUserId, username: existing.requesterUsername }],
      metadata: {
        approvalRequestId: approvalId,
        decision,
        status: nextRequestStatus,
        currentStageOrder: nextStageOrder,
        totalStages,
      },
    });
  }

  broadcastCommsEventToRecipients(
    [
      ...snapshot.privilegedUsers.map((u) => ({ userId: u.userId, username: u.username })),
      { userId: existing.requesterUserId, username: existing.requesterUsername },
    ],
    undefined,
    {
      type: 'approval:updated',
      approvalId,
      status: nextRequestStatus,
      currentStageOrder: nextStageOrder,
      totalStages,
    }
  );

  const auditAction =
    decision === 'rejected'
      ? 'APPROVAL_REQUEST_REJECTED'
      : nextStageActivated
      ? 'APPROVAL_STAGE_APPROVED'
      : 'APPROVAL_REQUEST_APPROVED';

  await addPortalAuditLog({
    category: 'security',
    action: auditAction,
    title:
      decision === 'rejected'
        ? `رد درخواست در مرحله ${activeStage.stageOrder}/${totalStages}: ${existing.requestedAction}`
        : nextStageActivated
        ? `تایید مرحله ${activeStage.stageOrder}/${totalStages} و ارجاع به مرحله بعدی: ${existing.requestedAction}`
        : `تایید نهایی درخواست عملیات حساس: ${existing.requestedAction}`,
    title_en:
      decision === 'rejected'
        ? `Rejected Approval Request at Stage ${activeStage.stageOrder}/${totalStages}: ${existing.requestedAction}`
        : nextStageActivated
        ? `Approved Stage ${activeStage.stageOrder}/${totalStages} (Routed to Stage ${nextStageActivated.stageOrder}): ${existing.requestedAction}`
        : `Final Approval Granted (${totalStages}/${totalStages}): ${existing.requestedAction}`,
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
    details: `درخواست ${approvalId} — مرحله ${activeStage.stageOrder} (${activeStage.titleFa}) توسط ${actor.username} با وضعیت ${decision} ثبت شد.${nextStageActivated ? ` مرحله ${nextStageActivated.stageOrder} (${nextStageActivated.titleFa}) فعال گردید.` : ''}${resolvedNote ? ` توضیحات: ${resolvedNote}` : ''}`,
    details_en: `Request ${approvalId} — Stage ${activeStage.stageOrder} (${activeStage.titleEn}) marked ${decision} by ${actor.username}.${nextStageActivated ? ` Activated Stage ${nextStageActivated.stageOrder} (${nextStageActivated.titleEn}).` : ''}${resolvedNote ? ` Note: ${resolvedNote}` : ''}`,
  }).catch(() => {});

  return mapped;
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
  const stages = (existing.stages || []).map((s) =>
    s.status === 'pending' || s.status === 'waiting'
      ? { ...s, status: 'skipped' as ApprovalStageInstanceStatus }
      : s
  );
  const stagesJson = stages.length > 0 ? JSON.stringify(stages) : null;

  const store = loadFallbackStore();
  let updatedRaw: any = null;
  if (Array.isArray(store.action_approval_requests)) {
    const row = store.action_approval_requests.find((r: any) => r.id === approvalId);
    if (row) {
      row.status = 'cancelled';
      row.decided_at = nowIso;
      if (stagesJson) row.stages_json = stagesJson;
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
         SET status = 'cancelled',
             decided_at = $2,
             stages_json = COALESCE($3, stages_json)
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [approvalId, nowIso, stagesJson]
      );
      if (res.rows[0]) updatedRaw = res.rows[0];
    } catch (err: any) {
      console.error('[ApprovalService] PG cancelApprovalRequest error:', err?.message || err);
    }
  }

  if (!updatedRaw) {
    throw new Error('Failed to cancel approval request.');
  }

  const snapshot = await loadApprovalDirectorySnapshot();
  broadcastCommsEventToRecipients(
    [
      ...snapshot.privilegedUsers.map((u) => ({ userId: u.userId, username: u.username })),
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
    title_en: `Cancelled Approval Request: ${existing.requestedAction}`,
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

  return annotateRowForActor(mapApprovalRow(updatedRaw, true), actor, snapshot);
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

  const currentDec: EncryptedApprovalPayload = {
    reason: existing.reason,
    riskLevel: existing.riskLevel,
    commandPreview: existing.commandPreview || null,
    ttlMinutes: existing.ttlMinutes,
    actionParams: existing.actionParams || null,
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

  const snapshot = await loadApprovalDirectorySnapshot();
  broadcastCommsEventToRecipients(
    [
      ...snapshot.privilegedUsers.map((u) => ({ userId: u.userId, username: u.username })),
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

  return annotateRowForActor(mapApprovalRow(updatedRaw, true), actor, snapshot);
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

// =========================================================================
// Phase 3: Runtime Policy-Driven Approval Gate & Approved JIT Ticket Engine
// =========================================================================

const ACTION_METADATA_CATALOG: Record<
  string,
  { labelEn: string; labelFa: string; riskLevel: ApprovalRiskLevel }
> = {
  terminal: {
    labelEn: 'Interactive Terminal / Remote Desktop Shell',
    labelFa: 'ترمینال تعاملی / نشست دسکتاپ ریموت',
    riskLevel: 'high',
  },
  file_explorer: {
    labelEn: 'Remote SFTP File Modification',
    labelFa: 'تغییر فایل‌ها در کاوشگر SFTP',
    riskLevel: 'high',
  },
  power_control: {
    labelEn: 'Server Power Control (Restart / Shutdown)',
    labelFa: 'کنترل برق سرور (راه‌اندازی مجدد / خاموش‌سازی)',
    riskLevel: 'critical',
  },
  server_management: {
    labelEn: 'Server System & Service Configuration Change',
    labelFa: 'تغییر پیکربندی سیستم و سرویس‌های سرور',
    riskLevel: 'high',
  },
  web_management: {
    labelEn: 'Web Server (Nginx / Apache) Configuration Change',
    labelFa: 'تغییر پیکربندی وب‌سرور (Nginx / Apache)',
    riskLevel: 'high',
  },
  database_management: {
    labelEn: 'Database Engine (PostgreSQL / MySQL) Change',
    labelFa: 'تغییر عملیات و پیکربندی پایگاه داده',
    riskLevel: 'critical',
  },
  edit_properties: {
    labelEn: 'Edit Inventory Properties & Credentials',
    labelFa: 'ویرایش مشخصات و اعتبارنامه‌های تجهیز/سرور',
    riskLevel: 'high',
  },
  delete_server: {
    labelEn: 'Delete Server from Inventory',
    labelFa: 'حذف سرور از موجودی',
    riskLevel: 'critical',
  },
  delete_device: {
    labelEn: 'Delete Network Device from Inventory',
    labelFa: 'حذف تجهیز شبکه از موجودی',
    riskLevel: 'critical',
  },
  export_servers: {
    labelEn: 'Export Remote Servers Package',
    labelFa: 'استخراج اطلاعات سرورها (Export)',
    riskLevel: 'high',
  },
  import_servers: {
    labelEn: 'Import Remote Servers Package',
    labelFa: 'ورود دسته‌ای سرورها (Import)',
    riskLevel: 'high',
  },
  export_devices: {
    labelEn: 'Export Network Devices Package',
    labelFa: 'استخراج اطلاعات تجهیزات شبکه (Export)',
    riskLevel: 'high',
  },
  import_devices: {
    labelEn: 'Import Network Devices Package',
    labelFa: 'ورود دسته‌ای تجهیزات شبکه (Import)',
    riskLevel: 'high',
  },
  inspect_ports: {
    labelEn: 'Inspect Switch Ports & Interfaces',
    labelFa: 'مشاهده و پایش پورت‌ها و اینترفیس‌ها',
    riskLevel: 'medium',
  },
  port_power: {
    labelEn: 'Port Administrative Power Toggle (Shutdown / No Shutdown)',
    labelFa: 'تغییر وضعیت روشن/خاموش پورت (Shutdown / No Shutdown)',
    riskLevel: 'high',
  },
  port_mode: {
    labelEn: 'Switchport Mode Change (Trunk / Access)',
    labelFa: 'تغییر حالت پورت (Trunk / Access)',
    riskLevel: 'high',
  },
  port_vlan: {
    labelEn: 'Port VLAN & PVID Reassignment',
    labelFa: 'تغییر و تخصیص VLAN پورت',
    riskLevel: 'high',
  },
  port_description: {
    labelEn: 'Port Description / Comment Update',
    labelFa: 'به‌روزرسانی توضیحات یا کامنت پورت',
    riskLevel: 'medium',
  },
  port_security: {
    labelEn: 'Layer 2 Port Security & MAC Binding Change',
    labelFa: 'تغییر تنظیمات امنیت لایه ۲ و MAC پورت',
    riskLevel: 'high',
  },
  port_bridge: {
    labelEn: 'MikroTik Bridge Port Membership Change',
    labelFa: 'تغییر عضویت پورت در بریج میکروتیک',
    riskLevel: 'high',
  },
  port_speed: {
    labelEn: 'Interface Speed / Duplex Modification',
    labelFa: 'تغییر سرعت و حالت دوبلکس پورت',
    riskLevel: 'medium',
  },
  port_cable_test: {
    labelEn: 'Run Interface TDR Cable Diagnostic Test',
    labelFa: 'اجرای تست عیب‌یابی کابل (TDR)',
    riskLevel: 'medium',
  },
  write_memory: {
    labelEn: 'Save Running Configuration to NVRAM (Write Memory)',
    labelFa: 'ذخیره کانفیگ در حافظه دائم (Write Memory)',
    riskLevel: 'critical',
  },
  apply_template: {
    labelEn: 'Deploy Configuration Template',
    labelFa: 'استقرار قالب پیکربندی روی تجهیز',
    riskLevel: 'high',
  },
  ping_keepalive: {
    labelEn: 'Execute Ping / Keepalive Probe',
    labelFa: 'اجرای تست Ping / Keepalive',
    riskLevel: 'medium',
  },
  device_note: {
    labelEn: 'Modify Device Operational Sticky Note',
    labelFa: 'ویرایش یادداشت عملیاتی تجهیز',
    riskLevel: 'medium',
  },
  web_configs: {
    labelEn: 'Device Web Console Access',
    labelFa: 'دسترسی به کنسول وب تجهیز',
    riskLevel: 'high',
  },
  cisco_config_device: {
    labelEn: 'Cisco Device Global Configuration',
    labelFa: 'پیکربندی جامع تجهیز سیسکو',
    riskLevel: 'high',
  },
  cisco_config_write_memory: {
    labelEn: 'Save Cisco Device Configuration to NVRAM',
    labelFa: 'ذخیره پیکربندی سیسکو در NVRAM',
    riskLevel: 'critical',
  },
  mikrotik_vpn: {
    labelEn: 'MikroTik VPN Tunnel Configuration Change',
    labelFa: 'تغییر پیکربندی تانل‌های VPN میکروتیک',
    riskLevel: 'high',
  },
  mikrotik_firewall: {
    labelEn: 'MikroTik Firewall & NAT Rule Modification',
    labelFa: 'تغییر قوانین فایروال و NAT میکروتیک',
    riskLevel: 'critical',
  },
  mikrotik_backup: {
    labelEn: 'MikroTik System Backup & Export',
    labelFa: 'تهیه نسخه پشتیبان و Export میکروتیک',
    riskLevel: 'high',
  },
  mikrotik_bridge_vlan: {
    labelEn: 'MikroTik Bridge VLAN Filtering Modification',
    labelFa: 'تغییر Bridge VLAN در میکروتیک',
    riskLevel: 'high',
  },
  mikrotik_safe_mode: {
    labelEn: 'MikroTik Safe Mode Toggle',
    labelFa: 'تغییر حالت Safe Mode میکروتیک',
    riskLevel: 'medium',
  },
  mikrotik_ip_pool: {
    labelEn: 'MikroTik IP Pool & DHCP Change',
    labelFa: 'تغییر رنج IP Pool و DHCP میکروتیک',
    riskLevel: 'high',
  },
};

export function resolveActionMeta(actionKey: string, fallbackLabel?: string): {
  labelEn: string;
  labelFa: string;
  riskLevel: ApprovalRiskLevel;
} {
  const cleanKey = (actionKey || '').trim();
  const known = ACTION_METADATA_CATALOG[cleanKey];
  if (known) return known;
  if (cleanKey.startsWith('cisco_config_')) {
    const suffix = cleanKey.replace('cisco_config_', '').toUpperCase();
    return {
      labelEn: `Cisco Configuration Change (${suffix})`,
      labelFa: `تغییر پیکربندی سیسکو (${suffix})`,
      riskLevel: 'high',
    };
  }
  return {
    labelEn: fallbackLabel || cleanKey || 'Protected Operational Action',
    labelFa: fallbackLabel || cleanKey || 'عملیات نیازمند تایید',
    riskLevel: 'high',
  };
}

function previewPolicyApprovalStages(
  resolvedPolicy: any,
  snapshot: ApprovalDirectorySnapshot,
  defaultTtlMinutes = 60
): ApprovalGateStagePreview[] {
  const configuredStages: ApprovalWorkflowStageConfig[] = Array.isArray(
    resolvedPolicy?.approvalWorkflowStages
  )
    ? [...resolvedPolicy.approvalWorkflowStages]
        .filter((s: any) => s && typeof s === 'object')
        .sort((a: any, b: any) => (Number(a.stageOrder) || 0) - (Number(b.stageOrder) || 0))
    : [];

  if (configuredStages.length > 0) {
    return configuredStages.map((cfg, idx) => {
      const stageOrder = idx + 1;
      return {
        stageOrder,
        id: String((cfg as any).id || `stage-${stageOrder}`),
        titleFa: String(cfg.titleFa || cfg.titleEn || `مرحله ${stageOrder}`),
        titleEn: String(cfg.titleEn || cfg.titleFa || `Stage ${stageOrder}`),
        approverTargetType: (cfg.approverTargetType || 'any_approver') as ApprovalStageApproverTargetType,
        approverLabels: resolveStageApproverLabels(cfg, snapshot),
        ttlMinutes: Math.min(43200, Math.max(1, Number(cfg.ttlMinutes) || defaultTtlMinutes)),
      };
    });
  }

  return [
    {
      stageOrder: 1,
      id: 'default-stage-1',
      titleFa: 'تایید سرپرست / مدیر مجاز',
      titleEn: 'Supervisor / Authorized Approver Sign-off',
      approverTargetType: 'any_approver',
      approverLabels: [],
      ttlMinutes: defaultTtlMinutes,
    },
  ];
}

async function loadRawApprovalRowsFast(): Promise<ActionApprovalRequest[]> {
  await expireStalePendingRequests();
  let rows: ActionApprovalRequest[] = [];

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM action_approval_requests ORDER BY created_at DESC LIMIT 300`
      );
      rows = (res.rows || []).map((r) => mapApprovalRow(r, true));
    } catch (err: any) {
      console.warn('[ApprovalService] PG loadRawApprovalRowsFast error:', err?.message || err);
    }
  }

  if (rows.length === 0) {
    const store = loadFallbackStore();
    rows = (store.action_approval_requests || [])
      .map((r: any) => mapApprovalRow(r, true))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  return rows;
}

function doesRowMatchTarget(
  row: ActionApprovalRequest,
  entityType: ApprovalTargetEntityType | string,
  entityId: string,
  entityName?: string
): boolean {
  if (String(row.targetEntityType).toLowerCase() !== String(entityType).toLowerCase()) {
    return false;
  }
  const rowTarget = String(row.targetEntityId || '').trim().toLowerCase();
  const targetIdLow = String(entityId || '').trim().toLowerCase();
  const targetNameLow = String(entityName || '').trim().toLowerCase();

  if (!rowTarget) return false;
  if (rowTarget === 'bulk') return true;
  if (rowTarget === targetIdLow) return true;
  if (targetNameLow && rowTarget === targetNameLow) return true;
  if (
    row.targetEntityName &&
    targetNameLow &&
    String(row.targetEntityName).trim().toLowerCase() === targetNameLow
  ) {
    return true;
  }
  return false;
}

function doesRowMatchAction(row: ActionApprovalRequest, actionKey: string): boolean {
  const cleanKey = (actionKey || '').trim().toLowerCase();
  const rowKey = String(row.actionKey || '').trim().toLowerCase();
  if (rowKey) {
    if (rowKey === cleanKey) return true;
    // Allow bulk_power or bulk_delete approval to satisfy per-entity checks if targeted
    if (cleanKey === 'power_control' && rowKey === 'bulk_power') return true;
    if (cleanKey === 'delete_device' && rowKey === 'bulk_delete') return true;
    return false;
  }
  // Legacy rows created before actionKey was recorded
  const meta = resolveActionMeta(cleanKey);
  const reqActLow = String(row.requestedAction || '').toLowerCase();
  return reqActLow.includes(cleanKey) || reqActLow.includes(meta.labelEn.toLowerCase());
}

export async function findMatchingActiveApprovalsForActor(
  actor: ApprovalActor,
  entityType: ApprovalTargetEntityType | string,
  entityId: string,
  actionKey: string,
  entityName?: string,
  snapshot?: ApprovalDirectorySnapshot
): Promise<{
  existingApprovedApproval: ActionApprovalRequest | null;
  existingPendingApproval: ActionApprovalRequest | null;
}> {
  const [rows, dirSnapshot] = await Promise.all([
    loadRawApprovalRowsFast(),
    snapshot ? Promise.resolve(snapshot) : loadApprovalDirectorySnapshot(),
  ]);

  const nowMs = Date.now();
  const matching = rows.filter(
    (r) =>
      (isRowOwnedByActor(r, actor) || actor.isSuperAdmin) &&
      doesRowMatchTarget(r, entityType, entityId, entityName) &&
      doesRowMatchAction(r, actionKey)
  );

  const approvedRow =
    matching.find((r) => r.status === 'approved' && Date.parse(r.expiresAt) > nowMs) || null;
  const pendingRow =
    matching.find((r) => r.status === 'pending' && Date.parse(r.expiresAt) > nowMs) || null;

  return {
    existingApprovedApproval: approvedRow ? annotateRowForActor(approvedRow, actor, dirSnapshot) : null,
    existingPendingApproval: pendingRow ? annotateRowForActor(pendingRow, actor, dirSnapshot) : null,
  };
}

export async function evaluateApprovalGateForRequest(params: {
  actor: ApprovalActor;
  effectivePolicy: any;
  entityType: ApprovalTargetEntityType | string;
  entityId: string;
  entityName?: string;
  actionKey: string;
  requestedAction?: string;
  commandPreview?: string | null;
  actionParams?: Record<string, any> | null;
  providedApprovalId?: string | null;
}): Promise<{
  allowed: boolean;
  approvedTicket?: ActionApprovalRequest;
  gatePayload?: ApprovalGatePayload;
}> {
  const {
    actor,
    effectivePolicy,
    entityType,
    entityId,
    entityName,
    actionKey,
    requestedAction,
    commandPreview,
    actionParams,
    providedApprovalId,
  } = params;

  const snapshot = await loadApprovalDirectorySnapshot();
  const cleanProvidedId = (providedApprovalId || '').trim();
  const meta = resolveActionMeta(actionKey, requestedAction);

  if (cleanProvidedId) {
    const allRows = await loadRawApprovalRowsFast();
    const ticket = allRows.find((r) => r.id === cleanProvidedId) || null;
    if (
      ticket &&
      ticket.status === 'approved' &&
      Date.parse(ticket.expiresAt) > Date.now() &&
      (isRowOwnedByActor(ticket, actor) || actor.isSuperAdmin) &&
      doesRowMatchTarget(ticket, entityType, entityId, entityName) &&
      doesRowMatchAction(ticket, actionKey)
    ) {
      return {
        allowed: true,
        approvedTicket: annotateRowForActor(ticket, actor, snapshot),
      };
    }
  }

  const [{ existingApprovedApproval, existingPendingApproval }, stagesPreview] = await Promise.all([
    findMatchingActiveApprovalsForActor(
      actor,
      entityType,
      entityId,
      actionKey,
      entityName,
      snapshot
    ),
    Promise.resolve(previewPolicyApprovalStages(effectivePolicy, snapshot)),
  ]);

  const targetDisplay = entityName || entityId;
  const gatePayload: ApprovalGatePayload = {
    code: 'APPROVAL_REQUIRED',
    approvalRequired: true,
    actionKey,
    actionLabelEn: meta.labelEn,
    actionLabelFa: meta.labelFa,
    targetEntityType: entityType,
    targetEntityId: entityId,
    targetEntityName: targetDisplay,
    requestedAction: requestedAction || `${meta.labelEn} (${targetDisplay})`,
    commandPreview: commandPreview ?? null,
    actionParams: actionParams ?? null,
    riskLevel: meta.riskLevel,
    policyId: effectivePolicy?.id || null,
    policyName: effectivePolicy?.name || null,
    stagesPreview,
    existingApprovedApproval,
    existingPendingApproval,
    error: existingApprovedApproval
      ? `Multi-stage approval ticket (${existingApprovedApproval.id}) is ready for "${meta.labelEn}" on ${targetDisplay}. Attach X-Approval-Request-Id to execute.`
      : existingPendingApproval
      ? `Action "${meta.labelEn}" on ${targetDisplay} requires approval. Request ${existingPendingApproval.id} is currently awaiting Stage ${existingPendingApproval.currentStageOrder || 1}/${existingPendingApproval.totalStages || 1}.`
      : `RBAC Policy "${effectivePolicy?.name || 'Active Policy'}" requires multi-stage approval before executing "${meta.labelEn}" on ${targetDisplay}.`,
    errorFa: existingApprovedApproval
      ? `تیکت تاییدشده (${existingApprovedApproval.id}) برای «${meta.labelFa}» روی ${targetDisplay} آماده اجرا است.`
      : existingPendingApproval
      ? `عملیات «${meta.labelFa}» نیازمند تایید چندمرحله‌ای است؛ درخواست ${existingPendingApproval.id} در انتظار تایید مرحله ${existingPendingApproval.currentStageOrder || 1} از ${existingPendingApproval.totalStages || 1} است.`
      : `طبق پالیسی «${effectivePolicy?.name || 'فعلی'}»، اجرای «${meta.labelFa}» روی ${targetDisplay} نیازمند تایید چندمرحله‌ای است.`,
  };

  return {
    allowed: false,
    gatePayload,
  };
}

export async function consumeApprovedTicketForExecution(
  actor: ApprovalActor,
  ticketId: string,
  executionNote?: string
): Promise<ActionApprovalRequest | null> {
  if (!ticketId) return null;
  try {
    return await markApprovalRequestExecuted(
      actor,
      ticketId,
      executionNote || `Executed automatically via JIT approval gate (${ticketId})`
    );
  } catch (err: any) {
    // Non-fatal if already marked executed in parallel
    console.warn('[ApprovalService] consumeApprovedTicketForExecution notice:', err?.message || err);
    return null;
  }
}

