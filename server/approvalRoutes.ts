import { Router, Request, Response } from 'express';
import { verifyToken } from './auth';
import {
  evaluateDeviceActionDecision,
  evaluateServerActionDecision,
  findUserById,
  findUserByUsername,
  getApprovalEligibleCandidates,
  getEffectivePolicyForUser,
} from './db';
import {
  ApprovalActor,
  cancelApprovalRequest,
  createApprovalRequest,
  decideApprovalRequest,
  evaluateApprovalGateForRequest,
  getApprovalRequestById,
  listApprovalRequests,
  listApprovalTargets,
  markApprovalRequestExecuted,
} from './approvalService';

export const approvalRouter = Router();

async function authenticateApprovalRequest(req: Request): Promise<{
  authenticated: boolean;
  statusCode?: number;
  error?: string;
  actor?: ApprovalActor;
}> {
  const rawIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';
  const clientIp = rawIp.replace(/^::ffff:/, '') || '127.0.0.1';

  const authHeader = (req.headers.authorization as string) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { authenticated: false, statusCode: 401, error: 'Authentication required' };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return { authenticated: false, statusCode: 401, error: 'Invalid or expired session token' };
  }

  const userRecord =
    (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
  if (userRecord && userRecord.status === 'disabled') {
    return { authenticated: false, statusCode: 403, error: 'Account disabled' };
  }

  const effectivePolicy = await getEffectivePolicyForUser(userRecord || payload);
  const cleanUsername = (userRecord?.username || payload.username || '').trim().toLowerCase();
  const cleanRole = (userRecord?.role || payload.role || '').trim().toLowerCase();
  const isSuperAdmin =
    cleanUsername === 'admin' ||
    cleanRole.includes('super admin') ||
    cleanRole.includes('administrator') ||
    effectivePolicy?.id === 'policy-super-admin';

  const canApproveActions = isSuperAdmin || Boolean(effectivePolicy?.canApproveActions);

  return {
    authenticated: true,
    actor: {
      userId: userRecord?.id || payload.userId,
      username: userRecord?.username || payload.username,
      fullName: userRecord?.fullName || payload.fullName || payload.username,
      role: userRecord?.role || payload.role || 'Operator',
      isSuperAdmin,
      canApproveActions,
      clientIp,
    },
  };
}

// GET /api/approvals/eligible-approvers
approvalRouter.get('/approvals/eligible-approvers', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const data = await getApprovalEligibleCandidates();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to resolve eligible approvers',
    });
  }
});

// GET /api/approvals/targets
approvalRouter.get('/approvals/targets', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const targets = await listApprovalTargets();
    return res.json({ success: true, targets });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to load targets' });
  }
});

// GET /api/approvals/check-action?entityType=server|device&entityId=...&actionKey=...
approvalRouter.get('/approvals/check-action', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const entityType = String(req.query.entityType || 'device').trim().toLowerCase() === 'server' ? 'server' : 'device';
    const entityId = String(req.query.entityId || '').trim();
    const entityName = typeof req.query.entityName === 'string' ? req.query.entityName.trim() : undefined;
    const actionKey = String(req.query.actionKey || '').trim();
    const requestedAction = typeof req.query.requestedAction === 'string' ? req.query.requestedAction.trim() : undefined;
    const commandPreview = typeof req.query.commandPreview === 'string' ? req.query.commandPreview.trim() : undefined;
    const providedApprovalId = (req.headers['x-approval-request-id'] as string) || (req.query.approvalRequestId as string) || undefined;

    if (!entityId || !actionKey) {
      return res.status(400).json({ success: false, error: 'entityId and actionKey are required' });
    }

    if (auth.actor.isSuperAdmin) {
      return res.json({
        success: true,
        decision: 'allow',
        approvalRequired: false,
        denied: false,
      });
    }

    const userRecord =
      (await findUserById(auth.actor.userId)) || (await findUserByUsername(auth.actor.username));
    const effectivePolicy = await getEffectivePolicyForUser(userRecord || auth.actor);

    const decision =
      entityType === 'server'
        ? evaluateServerActionDecision(effectivePolicy, entityId, actionKey)
        : evaluateDeviceActionDecision(effectivePolicy, entityId, actionKey);

    if (decision === 'deny') {
      return res.json({
        success: true,
        decision: 'deny',
        approvalRequired: false,
        denied: true,
      });
    }

    if (decision === 'allow') {
      return res.json({
        success: true,
        decision: 'allow',
        approvalRequired: false,
        denied: false,
      });
    }

    const gateRes = await evaluateApprovalGateForRequest({
      actor: auth.actor,
      effectivePolicy,
      entityType,
      entityId,
      entityName,
      actionKey,
      requestedAction,
      commandPreview: commandPreview || null,
      providedApprovalId,
    });

    if (gateRes.allowed) {
      return res.json({
        success: true,
        decision: 'require_approval',
        approvalRequired: false,
        denied: false,
        approvedTicket: gateRes.approvedTicket,
      });
    }

    return res.json({
      success: true,
      decision: 'require_approval',
      denied: false,
      approvedTicket: gateRes.gatePayload?.existingApprovedApproval || null,
      ...gateRes.gatePayload,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to check action approval status' });
  }
});

// GET /api/approvals
approvalRouter.get('/approvals', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const status = (req.query.status as string) || 'all';
    const rawScope = (req.query.scope as string) || 'all';
    const scope = (
      rawScope === 'mine' || rawScope === 'assigned_to_me' ? rawScope : 'all'
    ) as 'all' | 'mine' | 'assigned_to_me';
    const q = (req.query.q as string) || '';
    const limit = parseInt((req.query.limit as string) || '100', 10);

    const data = await listApprovalRequests(auth.actor, { status, scope, q, limit });
    return res.json({ success: true, ...data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list approvals' });
  }
});

// GET /api/approvals/:id
approvalRouter.get('/approvals/:id', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const requestItem = await getApprovalRequestById(auth.actor, req.params.id);
    if (!requestItem) {
      return res.status(404).json({ success: false, error: 'Approval request not found' });
    }
    return res.json({ success: true, approval: requestItem });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const code = msg.startsWith('ACCESS_DENIED') ? 403 : 500;
    return res.status(code).json({ success: false, error: msg || 'Failed to load approval' });
  }
});

// POST /api/approvals
approvalRouter.post('/approvals', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const created = await createApprovalRequest(auth.actor, req.body || {});
    return res.status(201).json({ success: true, approval: created });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to submit approval request' });
  }
});

// POST /api/approvals/:id/decide
approvalRouter.post('/approvals/:id/decide', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const decision = req.body?.decision === 'approved' ? 'approved' : req.body?.decision === 'rejected' ? 'rejected' : null;
  if (!decision) {
    return res.status(400).json({ success: false, error: 'Decision must be "approved" or "rejected".' });
  }
  try {
    const updated = await decideApprovalRequest(
      auth.actor,
      req.params.id,
      decision,
      req.body?.decisionNote,
      { emergencyOverride: Boolean(req.body?.emergencyOverride) }
    );
    return res.json({ success: true, approval: updated });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const code =
      msg.startsWith('ACCESS_DENIED') || msg.startsWith('FOUR_EYES_VIOLATION')
        ? 403
        : msg.includes('not found')
        ? 404
        : 400;
    return res.status(code).json({ success: false, error: msg || 'Failed to decide request' });
  }
});

// POST /api/approvals/:id/cancel
approvalRouter.post('/approvals/:id/cancel', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const updated = await cancelApprovalRequest(auth.actor, req.params.id);
    return res.json({ success: true, approval: updated });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const code = msg.startsWith('ACCESS_DENIED') ? 403 : msg.includes('not found') ? 404 : 400;
    return res.status(code).json({ success: false, error: msg || 'Failed to cancel request' });
  }
});

// POST /api/approvals/:id/execute
approvalRouter.post('/approvals/:id/execute', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const updated = await markApprovalRequestExecuted(
      auth.actor,
      req.params.id,
      req.body?.executionNote
    );
    return res.json({ success: true, approval: updated });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const code = msg.startsWith('ACCESS_DENIED') ? 403 : msg.includes('not found') ? 404 : 400;
    return res.status(code).json({ success: false, error: msg || 'Failed to record execution' });
  }
});
