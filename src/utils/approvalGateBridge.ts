import { ActionApprovalRequest, ApprovalGatePayload } from '../types';
import { checkActionApprovalGate } from '../services/approvalApi';

export type ApprovalGateResolution =
  | { outcome: 'execute'; approvalRequestId: string; approval?: ActionApprovalRequest | null }
  | { outcome: 'submitted'; approval: ActionApprovalRequest }
  | { outcome: 'cancelled' };

type ApprovalGateHandler = (payload: ApprovalGatePayload) => Promise<ApprovalGateResolution>;

let activeGateHandler: ApprovalGateHandler | null = null;
let gateQueue: Promise<any> = Promise.resolve();

export function registerApprovalGateHandler(handler: ApprovalGateHandler): () => void {
  activeGateHandler = handler;
  return () => {
    if (activeGateHandler === handler) {
      activeGateHandler = null;
    }
  };
}

export function emitApprovalNotice(textEn: string, textFa: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('nettop-approval-notice', {
      detail: { textEn, textFa },
    })
  );
}

export function openApprovalGate(payload: ApprovalGatePayload): Promise<ApprovalGateResolution> {
  if (!activeGateHandler) {
    return Promise.resolve({ outcome: 'cancelled' });
  }
  const handler = activeGateHandler;
  const run = gateQueue.then(() => handler(payload)).catch(() => ({ outcome: 'cancelled' as const }));
  gateQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function preflightActionApproval(params: {
  entityType: 'server' | 'device';
  entityId: string;
  actionKey: string;
  entityName?: string;
  requestedAction?: string;
  commandPreview?: string;
  actionParams?: Record<string, any>;
}): Promise<{
  proceed: boolean;
  approvalRequestId?: string;
  denied?: boolean;
  error?: string;
  errorFa?: string;
}> {
  try {
    const check = await checkActionApprovalGate({
      entityType: params.entityType,
      entityId: params.entityId,
      actionKey: params.actionKey,
      entityName: params.entityName,
      requestedAction: params.requestedAction,
      commandPreview: params.commandPreview,
    });

    if (check.decision === 'deny' || check.denied) {
      return {
        proceed: false,
        denied: true,
        error: check.error || 'Access denied by RBAC policy.',
        errorFa: check.errorFa || 'عدم دسترسی طبق پالیسی امنیتی.',
      };
    }

    if (!check.approvalRequired && (check.decision === 'allow' || check.approvedTicket || check.activeGrant)) {
      return {
        proceed: true,
        approvalRequestId: check.approvedTicket?.id || check.activeGrant?.approvalId,
      };
    }

    const payload: ApprovalGatePayload = {
      code: 'APPROVAL_REQUIRED',
      approvalRequired: true,
      actionKey: check.actionKey || params.actionKey,
      actionLabelEn: check.actionLabelEn,
      actionLabelFa: check.actionLabelFa,
      targetEntityType: check.targetEntityType || params.entityType,
      targetEntityId: check.targetEntityId || params.entityId,
      targetEntityName: check.targetEntityName || params.entityName || params.entityId,
      requestedAction: check.requestedAction || params.requestedAction,
      commandPreview: check.commandPreview ?? params.commandPreview ?? null,
      actionParams: check.actionParams ?? params.actionParams ?? null,
      executionMode: check.executionMode,
      supportsAutoExecute: check.supportsAutoExecute,
      riskLevel: check.riskLevel || 'high',
      policyId: check.policyId || null,
      policyName: check.policyName || null,
      stagesPreview: check.stagesPreview || [],
      existingApprovedApproval: check.existingApprovedApproval || check.approvedTicket || null,
      existingPendingApproval: check.existingPendingApproval || null,
      activeGrant: check.activeGrant || null,
      error: check.error,
      errorFa: check.errorFa,
    };

    const resolution = await openApprovalGate(payload);
    if (resolution.outcome === 'execute' && resolution.approvalRequestId) {
      return {
        proceed: true,
        approvalRequestId: resolution.approvalRequestId,
      };
    }
    return { proceed: false };
  } catch (err: any) {
    // Do not block local client navigation if check-action encounters an unexpected network blip;
    // the authoritative server/WebSocket gate still validates on connection.
    console.warn('[ApprovalGateBridge] Preflight check notice:', err?.message || err);
    return { proceed: true };
  }
}

function readStoredAuthToken(): string | null {
  try {
    return (
      sessionStorage.getItem('nettopology_auth_token_v1') ||
      localStorage.getItem('nettopology_auth_token_v1') ||
      null
    );
  } catch {
    return null;
  }
}

function readStoredUsername(): string | null {
  try {
    const raw =
      sessionStorage.getItem('nettopology_active_user_v1') ||
      localStorage.getItem('nettopology_active_user_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.username) return String(parsed.username).trim();
    }
  } catch {}
  return null;
}

function isSameOriginApiCall(input: RequestInfo | URL): { isApi: boolean; pathname: string } {
  try {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    if (!rawUrl) return { isApi: false, pathname: '' };
    const parsed = new URL(rawUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return { isApi: false, pathname: parsed.pathname };
    }
    return {
      isApi: parsed.pathname.startsWith('/api/'),
      pathname: parsed.pathname,
    };
  } catch {
    return { isApi: false, pathname: '' };
  }
}

export function installGlobalApprovalFetchInterceptor(): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__nettopApprovalFetchInstalled) return;

  const currentFetch =
    typeof window.fetch === 'function'
      ? window.fetch
      : typeof fetch === 'function'
      ? fetch
      : null;
  if (!currentFetch) return;
  const origFetch = currentFetch.bind(window);

  const interceptedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const { isApi, pathname } = isSameOriginApiCall(input);
    if (!isApi) {
      return origFetch(input, init);
    }

    // Clone Request beforehand if caller passed a Request instance so replay never fails on consumed body
    const replayRequestClone = input instanceof Request ? input.clone() : null;

    const mergedHeaders = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );

    const isLoginPath = pathname === '/api/auth/login' || pathname === '/api/auth/ad-login';
    if (!isLoginPath) {
      const token = readStoredAuthToken();
      if (token && !mergedHeaders.has('Authorization')) {
        mergedHeaders.set('Authorization', `Bearer ${token}`);
      }
      const activeUser = readStoredUsername();
      if (activeUser) {
        if (!mergedHeaders.has('x-user-name')) mergedHeaders.set('x-user-name', activeUser);
        if (!mergedHeaders.has('x-operator-user')) mergedHeaders.set('x-operator-user', activeUser);
      }
    }

    const firstInit: RequestInit = {
      ...(init || {}),
      headers: mergedHeaders,
    };

    const response =
      input instanceof Request && !init
        ? await origFetch(new Request(input, { headers: mergedHeaders }))
        : await origFetch(input, firstInit);

    const isApprovalEndpoint = pathname.startsWith('/api/approvals');
    const alreadyHadTicket = mergedHeaders.has('x-approval-request-id');

    if (response.status !== 403 || isApprovalEndpoint || alreadyHadTicket) {
      return response;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json') && response.headers.get('x-approval-required') !== 'true') {
      return response;
    }

    let payload: any = null;
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }

    if (!payload || (payload.code !== 'APPROVAL_REQUIRED' && payload.approvalRequired !== true)) {
      return response;
    }

    if (!activeGateHandler) {
      return response;
    }

    const resolution = await openApprovalGate(payload as ApprovalGatePayload);

    if (resolution.outcome === 'execute' && resolution.approvalRequestId) {
      const replayHeaders = new Headers(mergedHeaders);
      replayHeaders.set('X-Approval-Request-Id', resolution.approvalRequestId);

      if (replayRequestClone) {
        return origFetch(new Request(replayRequestClone, { headers: replayHeaders }));
      }
      return origFetch(input, {
        ...(init || {}),
        headers: replayHeaders,
      });
    }

    if (resolution.outcome === 'submitted') {
      return new Response(
        JSON.stringify({
          ...payload,
          approvalHandled: true,
          submittedApprovalId: resolution.approval.id,
        }),
        {
          status: 403,
          statusText: 'Approval Required',
          headers: {
            'Content-Type': 'application/json',
            'X-Approval-Required': 'true',
            'X-Approval-Handled': 'true',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        ...payload,
        approvalHandled: true,
        cancelled: true,
      }),
      {
        status: 403,
        statusText: 'Approval Required',
        headers: {
          'Content-Type': 'application/json',
          'X-Approval-Required': 'true',
          'X-Approval-Handled': 'true',
        },
      }
    );
  };

  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!desc || desc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: interceptedFetch,
        writable: true,
        enumerable: desc ? desc.enumerable : true,
        configurable: true,
      });
      w.__nettopApprovalFetchInstalled = true;
    } else if (desc.writable || typeof desc.set === 'function') {
      window.fetch = interceptedFetch;
      w.__nettopApprovalFetchInstalled = true;
    } else {
      console.warn(
        '[ApprovalGateBridge] window.fetch is non-configurable and read-only; global fetch interceptor skipped.'
      );
    }
  } catch (err) {
    console.warn('[ApprovalGateBridge] Could not override window.fetch safely:', err);
  }
}
