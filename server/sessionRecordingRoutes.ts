import express, { Request, Response } from 'express';
import fs from 'fs';
import { verifyToken } from './auth';
import {
  findUserById,
  findUserByUsername,
  getEffectivePolicyForUser,
  getAccessPolicies,
  getDeviceGroups,
  getSessionRecordingById,
  getSessionRecordingMarkers,
  listSessionRecordings,
  updateSessionRecordingRecord,
  deleteSessionRecordingRecord,
  addPortalAuditLog,
} from './db';
import {
  getEffectiveSessionRecordingSettings,
  saveEffectiveSessionRecordingSettings,
  inspectRecordingStoragePath,
  runSessionRecordingCleanup,
  deletePhysicalRecordingFiles,
  enqueueRecordingTranscode,
  isFileEncryptedAtRest,
  readDecryptedRecordingBuffer,
  extractPlainTextTranscriptFromCast,
} from './sessionRecordingService';
import type { SessionRecordingRecord } from '../src/types';

export const sessionRecordingRouter = express.Router();

interface ResolvedRecordingAuthContext {
  user: any | null;
  username: string;
  userRole: string;
  effectivePolicy: any | null;
  isSuperAdmin: boolean;
  allowedServerIds: string[] | null;
  permissions: {
    canView: boolean;
    canPlayback: boolean;
    canDownload: boolean;
    canDelete: boolean;
    canLegalHold: boolean;
    canManageSettings: boolean;
  };
}

function getClientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string) || '';
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

async function resolveRecordingAuthContext(
  req: Request,
  allowQueryToken = false
): Promise<ResolvedRecordingAuthContext | null> {
  const authHeader = req.headers.authorization || '';
  let token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token && allowQueryToken && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const userRecord = (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
  if (userRecord && userRecord.status === 'disabled') {
    return null;
  }

  let effectivePolicy = await getEffectivePolicyForUser(userRecord || payload);
  const cleanUsername = (userRecord?.username || payload.username || '').toLowerCase();
  const cleanRole = (userRecord?.role || payload.role || '').toLowerCase();
  let isSuperAdmin =
    cleanUsername === 'admin' ||
    cleanRole.includes('super admin') ||
    cleanRole.includes('administrator');

  const simulatedHeader = (req.headers['x-simulated-role'] as string) || '';
  if (isSuperAdmin && simulatedHeader && simulatedHeader !== 'actual-user') {
    const policies = await getAccessPolicies();
    const simP = policies.find((p: any) => p.id === simulatedHeader);
    if (simP) {
      let simAllowedSrvs: string[] | null = null;
      if (simP.id === 'policy-super-admin') {
        simAllowedSrvs = null;
      } else if (
        simP.targetServerScope === 'specific' ||
        (Array.isArray(simP.targetServerIds) && simP.targetServerIds.length > 0 && simP.targetServerScope !== 'all')
      ) {
        simAllowedSrvs = Array.isArray(simP.targetServerIds) ? simP.targetServerIds : [];
      } else if (simP.targetServerScope === 'all' || simP.targetScope === 'all') {
        simAllowedSrvs = null;
      } else if (simP.targetScope === 'groups') {
        const allGroups = await getDeviceGroups();
        const groupSet = new Set((simP.targetGroupIds || []).map((id: string) => (id || '').trim().toLowerCase()));
        const srvSet = new Set<string>();
        for (const g of allGroups) {
          const gid = (g.id || '').trim().toLowerCase();
          const gname = (g.name || '').trim().toLowerCase();
          if (groupSet.has(gid) || groupSet.has(gname)) {
            const sIds: string[] = Array.isArray(g.serverIds) ? g.serverIds : (Array.isArray(g.server_ids) ? g.server_ids : []);
            sIds.forEach((s) => srvSet.add(s));
          }
        }
        simAllowedSrvs = Array.from(srvSet);
      } else if (simP.targetScope === 'specific') {
        simAllowedSrvs = Array.isArray(simP.targetServerIds) ? simP.targetServerIds : [];
      } else {
        simAllowedSrvs = [];
      }

      effectivePolicy = {
        ...simP,
        allowedServerIds: simAllowedSrvs,
      };
      isSuperAdmin = simP.id === 'policy-super-admin';
    }
  }

  const allowedServerIds: string[] | null = isSuperAdmin
    ? null
    : effectivePolicy && Array.isArray(effectivePolicy.allowedServerIds)
    ? effectivePolicy.allowedServerIds
    : null;

  const isPolicyFull = isSuperAdmin || effectivePolicy?.id === 'policy-super-admin';
  const hasAuditFallback = Boolean(effectivePolicy?.canViewAuditLogs);
  const hasSettingsFallback = Boolean(effectivePolicy?.canManageSystemSettings || effectivePolicy?.canManageUsers);

  const permissions = {
    canView:
      isPolicyFull ||
      (effectivePolicy?.canViewSessionRecordings !== undefined
        ? Boolean(effectivePolicy.canViewSessionRecordings)
        : hasAuditFallback),
    canPlayback:
      isPolicyFull ||
      (effectivePolicy?.canPlaybackSessionRecordings !== undefined
        ? Boolean(effectivePolicy.canPlaybackSessionRecordings)
        : effectivePolicy?.canViewSessionRecordings !== undefined
        ? Boolean(effectivePolicy.canViewSessionRecordings)
        : hasAuditFallback),
    canDownload:
      isPolicyFull ||
      (effectivePolicy?.canDownloadSessionRecordings !== undefined
        ? Boolean(effectivePolicy.canDownloadSessionRecordings)
        : Boolean(effectivePolicy?.canExportAuditLogs || hasAuditFallback)),
    canDelete: isPolicyFull || Boolean(effectivePolicy?.canDeleteSessionRecordings),
    canLegalHold: isPolicyFull || Boolean(effectivePolicy?.canManageSessionRecordingLegalHold),
    canManageSettings:
      isPolicyFull ||
      (effectivePolicy?.canManageSessionRecordingSettings !== undefined
        ? Boolean(effectivePolicy.canManageSessionRecordingSettings)
        : hasSettingsFallback),
  };

  return {
    user: userRecord || payload,
    username: userRecord?.username || payload.username || 'unknown',
    userRole: userRecord?.role || payload.role || 'User',
    effectivePolicy,
    isSuperAdmin,
    allowedServerIds,
    permissions,
  };
}

function isServerAllowedForContext(ctx: ResolvedRecordingAuthContext, serverId?: string): boolean {
  if (ctx.isSuperAdmin || ctx.allowedServerIds === null) return true;
  if (!serverId) return false;
  return ctx.allowedServerIds.includes(serverId);
}

function sanitizeRecordingForClient(rec: SessionRecordingRecord): SessionRecordingRecord {
  const hasRawFile = Boolean(rec.rawFilePath && fs.existsSync(rec.rawFilePath));
  const hasVideoFile = Boolean(rec.videoFilePath && fs.existsSync(rec.videoFilePath));
  return {
    ...rec,
    hasRawFile,
    hasVideoFile,
    metadata: {
      ...(rec.metadata || {}),
      hasRawFile,
      hasVideoFile,
      playableVideo: hasVideoFile,
      playableNativeGuac: rec.protocol !== 'ssh' && hasRawFile && (rec.rawFilePath || '').endsWith('.guac'),
      playableCast: rec.protocol === 'ssh' && hasRawFile,
    },
  };
}

// ─── Settings & Diagnostics Endpoints ─────────────────────────────────────────

sessionRecordingRouter.get('/session-recordings/settings', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canManageSettings && !ctx.permissions.canView) {
      return res.status(403).json({ error: 'Insufficient permissions to view session recording settings' });
    }

    const settings = await getEffectiveSessionRecordingSettings();
    const diagnostics = await inspectRecordingStoragePath(settings.storagePath);
    return res.json({
      settings,
      diagnostics,
      canEdit: ctx.permissions.canManageSettings,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load session recording settings' });
  }
});

sessionRecordingRouter.put('/session-recordings/settings', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canManageSettings) {
      return res.status(403).json({ error: 'Insufficient permissions to modify session recording settings' });
    }

    const saved = await saveEffectiveSessionRecordingSettings(req.body || {}, ctx.username);
    const diagnostics = await inspectRecordingStoragePath(saved.storagePath);

    await addPortalAuditLog({
      username: ctx.username,
      userRole: ctx.userRole,
      ipAddress: getClientIp(req),
      action: 'SESSION_RECORDING_SETTINGS_UPDATED',
      category: 'security',
      targetResource: 'session_recording_settings',
      details: `Updated session recording settings: enabled=${saved.enabled}, ssh=${saved.recordSsh}, rdp=${saved.recordRdp}, vnc=${saved.recordVnc}, path="${saved.storagePath}", format=${saved.videoFormat}, quality=${saved.qualityPreset}, retention=${saved.sshRetentionDays}d/${saved.rdpRetentionDays}d, quota=${saved.maxStorageGb}GB, encrypt=${saved.encryptAtRest}.`,
      status: 'success',
    }).catch(() => {});

    return res.json({
      success: true,
      settings: saved,
      diagnostics,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update session recording settings' });
  }
});

sessionRecordingRouter.post('/session-recordings/settings/test-path', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canManageSettings) {
      return res.status(403).json({ error: 'Insufficient permissions to test storage path' });
    }
    const targetPath = typeof req.body?.storagePath === 'string' ? req.body.storagePath : undefined;
    const diagnostics = await inspectRecordingStoragePath(targetPath);
    return res.json({ diagnostics });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to inspect storage path' });
  }
});

sessionRecordingRouter.post('/session-recordings/cleanup', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canManageSettings && !ctx.permissions.canDelete) {
      return res.status(403).json({ error: 'Insufficient permissions to trigger recording cleanup' });
    }

    const result = await runSessionRecordingCleanup(undefined, 'manual', ctx.username);
    const settings = await getEffectiveSessionRecordingSettings();
    const diagnostics = await inspectRecordingStoragePath(settings.storagePath);
    return res.json({ success: true, result, diagnostics });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to run session recording cleanup' });
  }
});

// ─── List & Detail Endpoints ──────────────────────────────────────────────────

sessionRecordingRouter.get('/session-recordings', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canView) {
      return res.status(403).json({ error: 'Insufficient permissions to view session recordings' });
    }

    const protocol = (req.query.protocol as string) || 'all';
    const serverId = (req.query.serverId as string) || '';
    const username = (req.query.operator as string) || '';
    const status = (req.query.status as string) || 'all';
    const legalHoldRaw = (req.query.legalHold as string) || 'all';
    const legalHold: 'all' | 'true' | 'false' =
      legalHoldRaw === 'true' ? 'true' : legalHoldRaw === 'false' ? 'false' : 'all';
    const highRiskOnly = req.query.highRiskOnly === 'true' || req.query.highRiskOnly === '1';
    const dateFrom = (req.query.startDate as string) || '';
    const dateTo = (req.query.endDate as string) || '';
    const search = (req.query.search as string) || '';
    const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || req.query.limit || '25'), 10) || 25));
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

    const result = await listSessionRecordings({
      protocol,
      serverId,
      username,
      status,
      legalHold,
      riskLevel: highRiskOnly ? 'high_or_critical' : 'all',
      dateFrom,
      dateTo,
      search,
      allowedServerIds: ctx.allowedServerIds,
      page,
      pageSize,
    });

    return res.json({
      success: true,
      items: result.items.map(sanitizeRecordingForClient),
      total: result.total,
      page,
      pageSize,
      summary: result.summary,
      permissions: ctx.permissions,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to list session recordings' });
  }
});

sessionRecordingRouter.get('/session-recordings/:id', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canView) {
      return res.status(403).json({ error: 'Insufficient permissions to view session recording' });
    }

    const rec = await getSessionRecordingById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recording not found' });
    if (!isServerAllowedForContext(ctx, rec.serverId)) {
      return res.status(403).json({ error: 'Access denied for this server target scope' });
    }

    const markers = await getSessionRecordingMarkers(rec.id);
    return res.json({
      recording: sanitizeRecordingForClient(rec),
      markers,
      permissions: ctx.permissions,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load recording details' });
  }
});

// ─── Stream (HTTP 206 Range + Decryption) & Download Endpoints ────────────────

function resolveFileForRequest(
  rec: SessionRecordingRecord,
  kind: string
): { filePath: string; contentType: string; ext: string } | null {
  const norm = (kind || 'auto').toLowerCase();

  if (rec.protocol === 'ssh') {
    if (rec.rawFilePath && fs.existsSync(rec.rawFilePath)) {
      return {
        filePath: rec.rawFilePath,
        contentType: 'application/x-asciicast; charset=utf-8',
        ext: 'cast',
      };
    }
    return null;
  }

  const hasVideo = Boolean(rec.videoFilePath && fs.existsSync(rec.videoFilePath));
  const hasRaw = Boolean(rec.rawFilePath && fs.existsSync(rec.rawFilePath));

  if ((norm === 'video' || norm === 'auto') && hasVideo && rec.videoFilePath) {
    const isWebm = rec.videoFilePath.toLowerCase().endsWith('.webm');
    return {
      filePath: rec.videoFilePath,
      contentType: isWebm ? 'video/webm' : 'video/mp4',
      ext: isWebm ? 'webm' : 'mp4',
    };
  }

  if ((norm === 'raw' || norm === 'guac' || norm === 'auto') && hasRaw && rec.rawFilePath) {
    return {
      filePath: rec.rawFilePath,
      contentType: 'application/octet-stream',
      ext: 'guac',
    };
  }

  return null;
}

sessionRecordingRouter.get('/session-recordings/:id/stream', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req, true);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canPlayback) {
      return res.status(403).json({ error: 'Insufficient permissions to play back session recordings' });
    }

    const rec = await getSessionRecordingById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recording not found' });
    if (!isServerAllowedForContext(ctx, rec.serverId)) {
      return res.status(403).json({ error: 'Access denied for this server target scope' });
    }

    const kind = String(req.query.kind || 'auto');
    const resolved = resolveFileForRequest(rec, kind);
    if (!resolved) {
      return res.status(404).json({ error: 'Recording media file not found on storage disk' });
    }

    const rangeHeader = req.headers.range;
    if (!rangeHeader || rangeHeader.startsWith('bytes=0-')) {
      addPortalAuditLog({
        username: ctx.username,
        userRole: ctx.userRole,
        ipAddress: getClientIp(req),
        action: 'SESSION_RECORDING_PLAYED',
        category: 'security',
        targetResource: `${rec.serverName} (${rec.id})`,
        details: `Streamed ${rec.protocol.toUpperCase()} recording (${resolved.ext}) of operator "${rec.username}" on server "${rec.serverName}" (${rec.serverIp}).`,
        status: 'success',
      }).catch(() => {});
    }

    const encrypted = isFileEncryptedAtRest(resolved.filePath);

    if (encrypted) {
      const plainBuf = await readDecryptedRecordingBuffer(resolved.filePath);
      const total = plainBuf.length;
      res.setHeader('Content-Type', resolved.contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, no-store');

      if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(total - 1, parseInt(match[2], 10)) : total - 1;
          if (start >= total || start > end) {
            res.status(416).setHeader('Content-Range', `bytes */${total}`);
            return res.end();
          }
          const slice = plainBuf.subarray(start, end + 1);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', String(slice.length));
          return res.end(slice);
        }
      }

      res.setHeader('Content-Length', String(total));
      return res.end(plainBuf);
    }

    const stat = fs.statSync(resolved.filePath);
    const total = stat.size;
    res.setHeader('Content-Type', resolved.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');

    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(total - 1, parseInt(match[2], 10)) : total - 1;
        if (start >= total || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`);
          return res.end();
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(end - start + 1));
        return fs.createReadStream(resolved.filePath, { start, end }).pipe(res);
      }
    }

    res.setHeader('Content-Length', String(total));
    return fs.createReadStream(resolved.filePath).pipe(res);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to stream recording' });
  }
});

sessionRecordingRouter.get('/session-recordings/:id/download', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req, true);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canDownload) {
      return res.status(403).json({ error: 'Insufficient permissions to download session recordings' });
    }

    const rec = await getSessionRecordingById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recording not found' });
    if (!isServerAllowedForContext(ctx, rec.serverId)) {
      return res.status(403).json({ error: 'Access denied for this server target scope' });
    }

    const requestedFormat = String(req.query.format || 'auto').toLowerCase();
    const safeBaseName = `${rec.protocol}_${(rec.serverName || rec.serverIp || 'server').replace(/[^a-zA-Z0-9_-]/g, '_')}_${rec.startedAt.slice(0, 19).replace(/[:T]/g, '-')}`;

    if (requestedFormat === 'txt' && rec.protocol === 'ssh') {
      if (!rec.rawFilePath || !fs.existsSync(rec.rawFilePath)) {
        return res.status(404).json({ error: 'SSH recording file not found on storage disk' });
      }
      const rawBuf = await readDecryptedRecordingBuffer(rec.rawFilePath);
      const transcript = extractPlainTextTranscriptFromCast(rawBuf.toString('utf8'), rec);

      addPortalAuditLog({
        username: ctx.username,
        userRole: ctx.userRole,
        ipAddress: getClientIp(req),
        action: 'SESSION_RECORDING_DOWNLOADED',
        category: 'security',
        targetResource: `${rec.serverName} (${rec.id})`,
        details: `Downloaded plain-text SSH transcript (.txt) of operator "${rec.username}" on server "${rec.serverName}".`,
        status: 'success',
      }).catch(() => {});

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeBaseName}.txt"`);
      return res.send(transcript);
    }

    const resolved = resolveFileForRequest(rec, requestedFormat);
    if (!resolved) {
      return res.status(404).json({ error: 'Requested recording format is not available on storage disk' });
    }

    addPortalAuditLog({
      username: ctx.username,
      userRole: ctx.userRole,
      ipAddress: getClientIp(req),
      action: 'SESSION_RECORDING_DOWNLOADED',
      category: 'security',
      targetResource: `${rec.serverName} (${rec.id})`,
      details: `Downloaded ${rec.protocol.toUpperCase()} recording (.${resolved.ext}) of operator "${rec.username}" on server "${rec.serverName}" (${rec.serverIp}).`,
      status: 'success',
    }).catch(() => {});

    res.setHeader('Content-Type', resolved.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeBaseName}.${resolved.ext}"`);

    if (isFileEncryptedAtRest(resolved.filePath)) {
      const plainBuf = await readDecryptedRecordingBuffer(resolved.filePath);
      res.setHeader('Content-Length', String(plainBuf.length));
      return res.end(plainBuf);
    }

    const stat = fs.statSync(resolved.filePath);
    res.setHeader('Content-Length', String(stat.size));
    return fs.createReadStream(resolved.filePath).pipe(res);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to download recording' });
  }
});

// ─── Legal Hold, Re-Transcode & Delete Endpoints ──────────────────────────────

sessionRecordingRouter.post('/session-recordings/:id/legal-hold', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canLegalHold) {
      return res.status(403).json({ error: 'Insufficient permissions to manage legal hold on recordings' });
    }

    const rec = await getSessionRecordingById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recording not found' });
    if (!isServerAllowedForContext(ctx, rec.serverId)) {
      return res.status(403).json({ error: 'Access denied for this server target scope' });
    }

    const enableHold = Boolean(req.body?.legalHold);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (enableHold && reason.length < 3) {
      return res.status(400).json({ error: 'A brief reason (min 3 characters) is required when enabling Legal Hold.' });
    }

    const updated = await updateSessionRecordingRecord(rec.id, {
      legalHold: enableHold,
      legalHoldReason: enableHold ? reason.slice(0, 500) : null,
      legalHoldBy: enableHold ? ctx.username : null,
      legalHoldAt: enableHold ? new Date().toISOString() : null,
    });

    await addPortalAuditLog({
      username: ctx.username,
      userRole: ctx.userRole,
      ipAddress: getClientIp(req),
      action: enableHold ? 'SESSION_RECORDING_LEGAL_HOLD_ENABLED' : 'SESSION_RECORDING_LEGAL_HOLD_RELEASED',
      category: 'security',
      targetResource: `${rec.serverName} (${rec.id})`,
      details: enableHold
        ? `Enabled Legal Hold on recording "${rec.id}" (${rec.protocol.toUpperCase()} / ${rec.serverName}). Reason: ${reason}`
        : `Released Legal Hold on recording "${rec.id}" (${rec.protocol.toUpperCase()} / ${rec.serverName}).`,
      status: 'success',
    }).catch(() => {});

    return res.json({
      success: true,
      recording: updated ? sanitizeRecordingForClient(updated) : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to update legal hold status' });
  }
});

sessionRecordingRouter.post('/session-recordings/:id/transcode', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canManageSettings) {
      return res.status(403).json({ error: 'Insufficient permissions to trigger background transcoding' });
    }

    const rec = await getSessionRecordingById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recording not found' });
    if (rec.protocol === 'ssh') {
      return res.status(400).json({ error: 'SSH recordings use native Asciicast v2 and do not require video transcoding.' });
    }
    if (!rec.rawFilePath || !fs.existsSync(rec.rawFilePath)) {
      return res.status(400).json({ error: 'Raw .guac capture file is no longer present on disk.' });
    }

    enqueueRecordingTranscode(rec.id);
    return res.json({ success: true, queued: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to queue recording transcode' });
  }
});

sessionRecordingRouter.delete('/session-recordings/:id', async (req: Request, res: Response) => {
  try {
    const ctx = await resolveRecordingAuthContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    if (!ctx.permissions.canDelete) {
      return res.status(403).json({ error: 'Insufficient permissions to delete session recordings' });
    }

    const rec = await getSessionRecordingById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recording not found' });
    if (!isServerAllowedForContext(ctx, rec.serverId)) {
      return res.status(403).json({ error: 'Access denied for this server target scope' });
    }

    if (rec.legalHold) {
      return res.status(409).json({
        error: 'Recording is protected by Legal Hold and cannot be deleted until Legal Hold is released.',
        legalHold: true,
        legalHoldReason: rec.legalHoldReason,
      });
    }

    const freedBytes = deletePhysicalRecordingFiles(rec);
    await deleteSessionRecordingRecord(rec.id);

    await addPortalAuditLog({
      username: ctx.username,
      userRole: ctx.userRole,
      ipAddress: getClientIp(req),
      action: 'SESSION_RECORDING_DELETED',
      category: 'security',
      targetResource: `${rec.serverName} (${rec.id})`,
      details: `Permanently deleted ${rec.protocol.toUpperCase()} recording "${rec.id}" of operator "${rec.username}" on server "${rec.serverName}" (${(freedBytes / 1024).toFixed(1)} KB freed).`,
      status: 'success',
    }).catch(() => {});

    return res.json({ success: true, freedBytes });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete recording' });
  }
});
