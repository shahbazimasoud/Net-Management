import {
  BulkServerTemplate,
  BulkServerPreviewItem,
  BulkServerJobStatus,
  BulkServerExecutionReport
} from '../types';

export async function fetchBulkServerTemplates(): Promise<BulkServerTemplate[]> {
  const res = await fetch('/api/bulk-server-config/templates');
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`/api/bulk-server-config/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch job status (${res.status})`);
  }
  const data = await res.json();
  return data.job;
}

export async function cancelBulkServerJob(jobId: string): Promise<boolean> {
  const res = await fetch(`/api/bulk-server-config/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST'
  });
  if (!res.ok) {
    return false;
  }
  const data = await res.json();
  return data.cancelled || false;
}

export async function fetchBulkServerReports(): Promise<BulkServerExecutionReport[]> {
  const res = await fetch('/api/bulk-server-config/reports');
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch execution reports (${res.status})`);
  }
  const data = await res.json();
  return data.reports || [];
}

export async function fetchBulkServerReportDetails(reportId: string): Promise<BulkServerExecutionReport | null> {
  const res = await fetch(`/api/bulk-server-config/reports/${encodeURIComponent(reportId)}`);
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
    method: 'DELETE'
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data.deleted || false;
}

export async function clearAllBulkServerReports(): Promise<boolean> {
  const res = await fetch('/api/bulk-server-config/reports', {
    method: 'DELETE'
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data.cleared || false;
}

export async function saveBulkServerReport(report: Partial<BulkServerExecutionReport>): Promise<boolean> {
  const res = await fetch('/api/bulk-server-config/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report)
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data.saved || false;
}

export async function importBulkServerReports(reports: BulkServerExecutionReport[]): Promise<{ imported: number }> {
  const res = await fetch('/api/bulk-server-config/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch('/api/bulk-server-config/reports-stats');
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

