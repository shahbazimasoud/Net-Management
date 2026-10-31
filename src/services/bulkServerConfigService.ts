import {
  BulkServerTemplate,
  BulkServerPreviewItem,
  BulkServerJobStatus,
  BulkServerExecutionReport
} from '../types';

function getAuthToken(): string | null {
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

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const simRole = localStorage.getItem('simulated_role_id');
    if (simRole && simRole !== 'actual-user') {
      headers['X-Simulated-Role'] = simRole;
    }
  } catch {}
  return headers;
}

export async function fetchBulkServerTemplates(): Promise<BulkServerTemplate[]> {
  const res = await fetch('/api/bulk-server-config/templates', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch templates (${res.status})`);
  }
  const data = await res.json();
  return data.templates || [];
}

export async function generateBulkServerPreview(
  templateId: string,
  parameters: Record<string, any>,
  serverIds: string[]
): Promise<BulkServerPreviewItem[]> {
  const res = await fetch('/api/bulk-server-config/preview', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ templateId, parameters, serverIds })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to generate preview (${res.status})`);
  }
  const data = await res.json();
  return data.preview || [];
}

export async function startBulkServerJob(payload: {
  templateId: string;
  parameters: Record<string, any>;
  serverIds: string[];
  timeoutSec?: number;
  delayMs?: number;
  dangerConfirmation?: string;
  ephemeralPassword?: string;
}): Promise<{ jobId: string }> {
  const res = await fetch('/api/bulk-server-config/jobs', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to start bulk server job (${res.status})`);
  }
  const data = await res.json();
  return { jobId: data.jobId };
}

export async function fetchBulkServerJobStatus(jobId: string): Promise<BulkServerJobStatus> {
  const res = await fetch(`/api/bulk-server-config/jobs/${encodeURIComponent(jobId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch job status (${res.status})`);
  }
  const data = await res.json();
  return data.job;
}

export async function cancelBulkServerJob(jobId: string): Promise<boolean> {
  const res = await fetch(`/api/bulk-server-config/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    return false;
  }
  const data = await res.json();
  return data.cancelled || false;
}

export async function fetchBulkServerReports(): Promise<BulkServerExecutionReport[]> {
  const res = await fetch('/api/bulk-server-config/reports', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch execution reports (${res.status})`);
  }
  const data = await res.json();
  return data.reports || [];
}

export async function fetchBulkServerReportDetails(reportId: string): Promise<BulkServerExecutionReport | null> {
  const res = await fetch(`/api/bulk-server-config/reports/${encodeURIComponent(reportId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch report details (${res.status})`);
  }
  const data = await res.json();
  return data.report || null;
}

export async function deleteBulkServerReport(reportId: string): Promise<boolean> {
  const res = await fetch(`/api/bulk-server-config/reports/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data.deleted || false;
}

export async function clearAllBulkServerReports(): Promise<boolean> {
  const res = await fetch('/api/bulk-server-config/reports', {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data.cleared || false;
}

export async function saveBulkServerReport(report: Partial<BulkServerExecutionReport>): Promise<boolean> {
  const res = await fetch('/api/bulk-server-config/reports', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(report)
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data.saved || false;
}

export async function importBulkServerReports(reports: BulkServerExecutionReport[]): Promise<{ imported: number }> {
  const res = await fetch('/api/bulk-server-config/reports', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(reports)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to import execution reports (${res.status})`);
  }
  const data = await res.json();
  return { imported: data.imported || 0 };
}

export async function fetchBulkServerReportsStats(): Promise<{
  storageType: 'postgresql' | 'json_store';
  totalReports: number;
  isPostgresReady: boolean;
}> {
  const res = await fetch('/api/bulk-server-config/reports-stats', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    return {
      storageType: 'json_store',
      totalReports: 0,
      isPostgresReady: false,
    };
  }
  const data = await res.json();
  return data.stats || {
    storageType: 'json_store',
    totalReports: 0,
    isPostgresReady: false,
  };
}
