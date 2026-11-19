import type {
  SessionRecordingSettings,
  SessionRecordingHostDiagnostics,
  SessionRecordingRecord,
  SessionRecordingMarker,
  SessionRecordingListResponse,
} from '../types';

function getAuthToken(): string {
  try {
    return (
      localStorage.getItem('nettopology_auth_token_v1') ||
      localStorage.getItem('nettopology_auth_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('auth_token') ||
      ''
    );
  } catch {
    return '';
  }
}

function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const simRole = localStorage.getItem('simulated_role_id');
    if (simRole && simRole !== 'actual-user') {
      headers['x-simulated-role'] = simRole;
    }
  } catch {}
  return headers;
}

async function handleJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchSessionRecordingSettings(): Promise<{
  settings: SessionRecordingSettings;
  diagnostics: SessionRecordingHostDiagnostics;
  canEdit: boolean;
}> {
  const res = await fetch('/api/session-recordings/settings', {
    headers: buildAuthHeaders(),
  });
  return handleJsonResponse(res);
}

export async function updateSessionRecordingSettings(
  updates: Partial<SessionRecordingSettings>
): Promise<{
  success: boolean;
  settings: SessionRecordingSettings;
  diagnostics: SessionRecordingHostDiagnostics;
}> {
  const res = await fetch('/api/session-recordings/settings', {
    method: 'PUT',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
  });
  return handleJsonResponse(res);
}

export async function testSessionRecordingStoragePath(
  storagePath: string
): Promise<{ diagnostics: SessionRecordingHostDiagnostics }> {
  const res = await fetch('/api/session-recordings/settings/test-path', {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ storagePath }),
  });
  return handleJsonResponse(res);
}

export async function triggerSessionRecordingCleanup(): Promise<{
  success: boolean;
  result: {
    deletedCount: number;
    expiredDeletedCount: number;
    quotaDeletedCount: number;
    skippedLegalHoldCount: number;
    freedBytes: number;
    remainingCount: number;
    remainingBytes: number;
    executedAt: string;
  };
  diagnostics: SessionRecordingHostDiagnostics;
}> {
  const res = await fetch('/api/session-recordings/cleanup', {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
  });
  return handleJsonResponse(res);
}

export interface SessionRecordingQueryFilters {
  protocol?: string;
  serverId?: string;
  operator?: string;
  status?: string;
  legalHold?: string;
  highRiskOnly?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchSessionRecordings(
  filters: SessionRecordingQueryFilters = {}
): Promise<SessionRecordingListResponse> {
  const params = new URLSearchParams();
  if (filters.protocol && filters.protocol !== 'all') params.set('protocol', filters.protocol);
  if (filters.serverId) params.set('serverId', filters.serverId);
  if (filters.operator) params.set('operator', filters.operator);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.legalHold && filters.legalHold !== 'all') params.set('legalHold', filters.legalHold);
  if (filters.highRiskOnly) params.set('highRiskOnly', 'true');
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const qs = params.toString();
  const res = await fetch(`/api/session-recordings${qs ? `?${qs}` : ''}`, {
    headers: buildAuthHeaders(),
  });
  return handleJsonResponse(res);
}

export async function fetchSessionRecordingDetail(id: string): Promise<{
  recording: SessionRecordingRecord;
  markers: SessionRecordingMarker[];
  permissions: SessionRecordingListResponse['permissions'];
}> {
  const res = await fetch(`/api/session-recordings/${encodeURIComponent(id)}`, {
    headers: buildAuthHeaders(),
  });
  return handleJsonResponse(res);
}

export async function fetchSessionRecordingCastText(id: string): Promise<string> {
  const res = await fetch(`/api/session-recordings/${encodeURIComponent(id)}/stream?kind=cast`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Failed to load SSH recording (${res.status})`);
  }
  return res.text();
}

export function buildRecordingStreamUrl(id: string, kind: 'auto' | 'video' | 'raw' | 'cast' = 'auto'): string {
  const token = getAuthToken();
  const params = new URLSearchParams();
  params.set('kind', kind);
  if (token) params.set('token', token);
  return `/api/session-recordings/${encodeURIComponent(id)}/stream?${params.toString()}`;
}

export async function downloadSessionRecordingFile(
  id: string,
  format: 'auto' | 'video' | 'raw' | 'cast' | 'txt',
  fallbackFilename: string
): Promise<void> {
  const res = await fetch(
    `/api/session-recordings/${encodeURIComponent(id)}/download?format=${encodeURIComponent(format)}`,
    { headers: buildAuthHeaders() }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] || fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function setSessionRecordingLegalHold(
  id: string,
  legalHold: boolean,
  reason: string
): Promise<{ success: boolean; recording: SessionRecordingRecord | null }> {
  const res = await fetch(`/api/session-recordings/${encodeURIComponent(id)}/legal-hold`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ legalHold, reason }),
  });
  return handleJsonResponse(res);
}

export async function queueSessionRecordingTranscode(
  id: string
): Promise<{ success: boolean; queued: boolean }> {
  const res = await fetch(`/api/session-recordings/${encodeURIComponent(id)}/transcode`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
  });
  return handleJsonResponse(res);
}

export async function deleteSessionRecording(
  id: string
): Promise<{ success: boolean; freedBytes: number }> {
  const res = await fetch(`/api/session-recordings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(),
  });
  return handleJsonResponse(res);
}

export function formatBytes(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val < 10 && idx > 0 ? val.toFixed(2) : val.toFixed(1)} ${units[idx]}`;
}

export function formatDurationSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
