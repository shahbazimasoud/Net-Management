export interface RegisteredJitSession {
  sessionId: string;
  grantId?: string | null;
  approvalId?: string | null;
  expiresAtMs: number;
  terminate: (reasonEn: string, reasonFa: string) => void;
  timer?: ReturnType<typeof setTimeout> | null;
}

const activeJitSessions = new Map<string, RegisteredJitSession>();

export function registerActiveJitSession(params: {
  sessionId: string;
  grantId?: string | null;
  approvalId?: string | null;
  expiresAtMs: number;
  terminate: (reasonEn: string, reasonFa: string) => void;
}): () => void {
  const existing = activeJitSessions.get(params.sessionId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const remainingMs = Math.max(0, params.expiresAtMs - Date.now());
  const record: RegisteredJitSession = {
    sessionId: params.sessionId,
    grantId: params.grantId || null,
    approvalId: params.approvalId || null,
    expiresAtMs: params.expiresAtMs,
    terminate: params.terminate,
    timer: null,
  };

  if (Number.isFinite(params.expiresAtMs) && params.expiresAtMs > 0) {
    // Cap setTimeout to 24 days (max 32-bit signed int ms) to avoid Node overflow
    const safeDelayMs = Math.min(remainingMs, 2_000_000_000);
    record.timer = setTimeout(() => {
      const current = activeJitSessions.get(params.sessionId);
      if (!current) return;
      if (Date.now() >= current.expiresAtMs) {
        activeJitSessions.delete(params.sessionId);
        try {
          current.terminate(
            'JIT Pass window expired. Access has been automatically closed.',
            'بازه اعتبار گذرنامه موقت (JIT Pass) به پایان رسید و نشست به‌صورت خودکار بسته شد.'
          );
        } catch {}
      }
    }, safeDelayMs);
  }

  activeJitSessions.set(params.sessionId, record);

  return () => {
    unregisterActiveJitSession(params.sessionId);
  };
}

export function unregisterActiveJitSession(sessionId: string): void {
  const rec = activeJitSessions.get(sessionId);
  if (!rec) return;
  if (rec.timer) {
    clearTimeout(rec.timer);
  }
  activeJitSessions.delete(sessionId);
}

export function terminateActiveJitSessionsByGrantOrApproval(params: {
  grantId?: string | null;
  approvalId?: string | null;
  reasonEn: string;
  reasonFa: string;
}): number {
  const targetGrantId = (params.grantId || '').trim();
  const targetApprovalId = (params.approvalId || '').trim();
  if (!targetGrantId && !targetApprovalId) return 0;

  let terminated = 0;
  for (const [sessionId, rec] of Array.from(activeJitSessions.entries())) {
    const matchGrant = Boolean(targetGrantId && rec.grantId === targetGrantId);
    const matchApproval = Boolean(targetApprovalId && rec.approvalId === targetApprovalId);
    if (matchGrant || matchApproval) {
      if (rec.timer) clearTimeout(rec.timer);
      activeJitSessions.delete(sessionId);
      terminated++;
      try {
        rec.terminate(params.reasonEn, params.reasonFa);
      } catch {}
    }
  }
  return terminated;
}

export function terminateAllExpiredJitSessions(): number {
  const nowMs = Date.now();
  let terminated = 0;
  for (const [sessionId, rec] of Array.from(activeJitSessions.entries())) {
    if (rec.expiresAtMs > 0 && rec.expiresAtMs <= nowMs) {
      if (rec.timer) clearTimeout(rec.timer);
      activeJitSessions.delete(sessionId);
      terminated++;
      try {
        rec.terminate(
          'JIT Pass window expired. Access has been automatically closed.',
          'بازه اعتبار گذرنامه موقت (JIT Pass) به پایان رسید و نشست به‌صورت خودکار بسته شد.'
        );
      } catch {}
    }
  }
  return terminated;
}

export function getActiveJitSessionCount(): number {
  return activeJitSessions.size;
}
