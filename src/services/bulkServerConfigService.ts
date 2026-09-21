import {
  BulkServerTemplate,
  BulkServerPreviewItem,
  BulkServerJobStatus
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
