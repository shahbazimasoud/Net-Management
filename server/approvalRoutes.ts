import { Router, Request, Response } from 'express';
import { verifyToken } from './auth';
import { findUserById, findUserByUsername, getEffectivePolicyForUser } from './db';
import {
  ApprovalActor,
  cancelApprovalRequest,
  createApprovalRequest,
  decideApprovalRequest,
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

// GET /api/approvals
approvalRouter.get('/approvals', async (req: Request, res: Response) => {
  const auth = await authenticateApprovalRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  try {
    const status = (req.query.status as string) || 'all';
    const scope = ((req.query.scope as string) === 'mine' ? 'mine' : 'all') as 'all' | 'mine';
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
      req.body?.decisionNote
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
