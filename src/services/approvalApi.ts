import {
  ActionApprovalRequest,
  ApprovalQueueSummary,
  ApprovalTargetOption,
  CreateApprovalRequestPayload,
} from '../types';
import { appDataCache } from './dataCache';
import { getAuthToken } from './commsApi';

function buildHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface ApprovalsListResponse {
  success: boolean;
  items: ActionApprovalRequest[];
  summary: ApprovalQueueSummary;
  canApprove: boolean;
}

export async function fetchApprovalRequests(
  options: {
    status?: string;
    scope?: 'all' | 'mine' | 'assigned_to_me';
    q?: string;
    limit?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<ApprovalsListResponse> {
  const status = options.status || 'all';
  const scope = options.scope || 'all';
  const q = (options.q || '').trim();
  const limit = options.limit || 100;
  const cacheKey = `approvals:list:${status}:${scope}:${q}:${limit}`;

  return appDataCache.query<ApprovalsListResponse>(
    cacheKey,
    async () => {
      const qs = new URLSearchParams({
        status,
        scope,
        q,
        limit: String(limit),
      });
      const res = await fetch(`/api/approvals?${qs.toString()}`, {
        headers: buildHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return json;
    },
    { ttlMs: 10_000, forceRefresh: Boolean(options.forceRefresh) }
  );
}

export async function fetchApprovalById(id: string): Promise<ActionApprovalRequest> {
  const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`, {
    headers: buildHeaders(),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || !json.success || !json.approval) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.approval;
}

export async function fetchApprovalTargets(): Promise<ApprovalTargetOption[]> {
  return appDataCache.query<ApprovalTargetOption[]>(
    'approvals:targets',
    async () => {
      const res = await fetch('/api/approvals/targets', {
        headers: buildHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return Array.isArray(json.targets) ? json.targets : [];
    },
    { ttlMs: 30_000 }
  );
}

export async function submitApprovalRequest(
  payload: CreateApprovalRequestPayload
): Promise<ActionApprovalRequest> {
  const res = await fetch('/api/approvals', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok || !json.success || !json.approval) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('approvals:');
  appDataCache.invalidate('comms:');
  return json.approval;
}

export async function decideApprovalRequestApi(
  id: string,
  decision: 'approved' | 'rejected',
  decisionNote?: string,
  options?: { emergencyOverride?: boolean }
): Promise<ActionApprovalRequest> {
  const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      decision,
      decisionNote,
      ...(options?.emergencyOverride ? { emergencyOverride: true } : {}),
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.success || !json.approval) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('approvals:');
  appDataCache.invalidate('comms:');
  return json.approval;
}

export async function cancelApprovalRequestApi(id: string): Promise<ActionApprovalRequest> {
  const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: buildHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success || !json.approval) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('approvals:');
  appDataCache.invalidate('comms:');
  return json.approval;
}

export async function markApprovalExecutedApi(
  id: string,
  executionNote?: string
): Promise<ActionApprovalRequest> {
  const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/execute`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ executionNote }),
  });
  const json = await res.json();
  if (!res.ok || !json.success || !json.approval) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  appDataCache.invalidate('approvals:');
  appDataCache.invalidate('comms:');
  return json.approval;
}

export interface CheckActionApprovalResponse {
  success: boolean;
  decision: 'allow' | 'require_approval' | 'deny';
  approvalRequired: boolean;
  denied: boolean;
  approvedTicket?: ActionApprovalRequest | null;
  code?: 'APPROVAL_REQUIRED';
  actionKey?: string;
  actionLabelEn?: string;
  actionLabelFa?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  targetEntityName?: string;
  requestedAction?: string;
  commandPreview?: string | null;
  actionParams?: Record<string, any> | null;
  riskLevel?: import('../types').ApprovalRiskLevel;
  policyId?: string | null;
  policyName?: string | null;
  stagesPreview?: import('../types').ApprovalGateStagePreview[];
  existingApprovedApproval?: ActionApprovalRequest | null;
  existingPendingApproval?: ActionApprovalRequest | null;
  error?: string;
  errorFa?: string;
}

export async function checkActionApprovalGate(params: {
  entityType: 'server' | 'device';
  entityId: string;
  actionKey: string;
  entityName?: string;
  requestedAction?: string;
  commandPreview?: string;
}): Promise<CheckActionApprovalResponse> {
  const qs = new URLSearchParams({
    entityType: params.entityType,
    entityId: params.entityId,
    actionKey: params.actionKey,
  });
  if (params.entityName) qs.set('entityName', params.entityName);
  if (params.requestedAction) qs.set('requestedAction', params.requestedAction);
  if (params.commandPreview) qs.set('commandPreview', params.commandPreview);

  const res = await fetch(`/api/approvals/check-action?${qs.toString()}`, {
    headers: buildHeaders(),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json as CheckActionApprovalResponse;
}

