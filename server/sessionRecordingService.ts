import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import type {
  SessionRecordingSettings,
  SessionRecordingHostDiagnostics,
  SessionRecordingRecord,
  SessionRecordingProtocol,
  SessionRecordingVideoFormat,
  SessionRecordingQualityPreset,
  RemoteServer,
} from '../src/types';
import {
  getSessionRecordingSettingsRecord,
  saveSessionRecordingSettingsRecord,
  createSessionRecordingRecord,
  updateSessionRecordingRecord,
  getSessionRecordingById,
  addSessionRecordingMarker,
  deleteSessionRecordingRecord,
  getAllSessionRecordingsForCleanup,
  addPortalAuditLog,
} from './db';
import { getActiveVaultMasterSecret, getAllCandidateMasterSecrets } from './vaultCrypto';

const execFileAsync = promisify(execFile);

const ENCRYPTED_FILE_MAGIC = Buffer.from('NTREC1', 'ascii');
const ENCRYPTED_IV_LEN = 12;
const ENCRYPTED_TAG_LEN = 16;
const ENCRYPTED_HEADER_LEN = ENCRYPTED_FILE_MAGIC.length + ENCRYPTED_IV_LEN + ENCRYPTED_TAG_LEN;
const RECORDING_CRYPTO_SALT = 'session_recording_at_rest_salt_v1';

export const QUALITY_PRESET_PARAMS: Record<
  Exclude<SessionRecordingQualityPreset, 'custom'>,
  { fps: number; bitrateKbps: number; maxWidth: number; maxHeight: number }
> = {
  low: { fps: 8, bitrateKbps: 350, maxWidth: 1024, maxHeight: 576 },
  balanced: { fps: 15, bitrateKbps: 900, maxWidth: 1280, maxHeight: 720 },
  high: { fps: 24, bitrateKbps: 2200, maxWidth: 1920, maxHeight: 1080 },
};

let activeProjectRoot = process.cwd();
let retentionIntervalHandle: NodeJS.Timeout | null = null;
let retentionBootTimeoutHandle: NodeJS.Timeout | null = null;

const transcodeQueue: string[] = [];
const activeTranscodeIds = new Set<string>();

export function setSessionRecordingProjectRoot(root: string): void {
  if (root && typeof root === 'string') {
    activeProjectRoot = root;
  }
}

export function getDefaultRecordingStoragePath(projectRoot?: string): string {
  const base = projectRoot || activeProjectRoot || process.cwd();
  return path.resolve(base, 'backend', 'recordings');
}

export function getDefaultSessionRecordingSettings(projectRoot?: string): SessionRecordingSettings {
  return {
    enabled: true,
    recordSsh: true,
    recordRdp: true,
    recordVnc: true,
    storagePath: getDefaultRecordingStoragePath(projectRoot),
    videoFormat: 'mp4',
    qualityPreset: 'balanced',
    customFps: 15,
    customBitrateKbps: 900,
    customMaxWidth: 1280,
    customMaxHeight: 720,
    sshRetentionDays: 90,
    rdpRetentionDays: 30,
    maxStorageGb: 50,
    minFreeDiskPercent: 5,
    autoCleanupEnabled: true,
    deleteRawAfterTranscode: false,
    encryptAtRest: false,
    maskSensitiveInput: true,
    maxConcurrentTranscodes: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

export async function getEffectiveSessionRecordingSettings(
  projectRoot?: string
): Promise<SessionRecordingSettings> {
  const defaults = getDefaultSessionRecordingSettings(projectRoot);
  try {
    const stored = await getSessionRecordingSettingsRecord();
    if (!stored) return defaults;
    return {
      ...defaults,
      ...stored,
      storagePath:
        stored.storagePath && typeof stored.storagePath === 'string' && stored.storagePath.trim().length > 0
          ? path.resolve(stored.storagePath.trim())
          : defaults.storagePath,
    };
  } catch (err: any) {
    console.warn('[SessionRecording] Failed loading settings from DB, using defaults:', err?.message || err);
    return defaults;
  }
}

export function validateStoragePath(rawPath: string): { valid: boolean; resolved: string; error?: string } {
  const trimmed = (rawPath || '').trim();
  if (!trimmed) {
    return { valid: false, resolved: '', error: 'Storage path cannot be empty.' };
  }
  const resolved = path.resolve(trimmed);
  if (
    resolved === '/' ||
    resolved === '/etc' ||
    resolved === '/bin' ||
    resolved === '/usr' ||
    resolved === '/proc' ||
    resolved === '/sys'
  ) {
    return { valid: false, resolved, error: `Refusing to use protected system directory: ${resolved}` };
  }
  return { valid: true, resolved };
}

export async function saveEffectiveSessionRecordingSettings(
  updates: Partial<SessionRecordingSettings>,
  updatedBy: string,
  projectRoot?: string
): Promise<SessionRecordingSettings> {
  const current = await getEffectiveSessionRecordingSettings(projectRoot);
  const nextStorageRaw = updates.storagePath !== undefined ? updates.storagePath : current.storagePath;
  const pathCheck = validateStoragePath(nextStorageRaw);
  if (!pathCheck.valid) {
    throw new Error(pathCheck.error || 'Invalid storage path');
  }

  const validFormats: SessionRecordingVideoFormat[] = ['mp4', 'webm', 'guac_only', 'both'];
  const validPresets: SessionRecordingQualityPreset[] = ['low', 'balanced', 'high', 'custom'];

  const clampInt = (v: any, min: number, max: number, fallback: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const sanitized: SessionRecordingSettings = {
    ...current,
    enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : current.enabled,
    recordSsh: updates.recordSsh !== undefined ? Boolean(updates.recordSsh) : current.recordSsh,
    recordRdp: updates.recordRdp !== undefined ? Boolean(updates.recordRdp) : current.recordRdp,
    recordVnc: updates.recordVnc !== undefined ? Boolean(updates.recordVnc) : current.recordVnc,
    storagePath: pathCheck.resolved,
    videoFormat:
      updates.videoFormat && validFormats.includes(updates.videoFormat)
        ? updates.videoFormat
        : current.videoFormat,
    qualityPreset:
      updates.qualityPreset && validPresets.includes(updates.qualityPreset)
        ? updates.qualityPreset
        : current.qualityPreset,
    customFps: clampInt(updates.customFps ?? current.customFps, 5, 60, current.customFps),
    customBitrateKbps: clampInt(
      updates.customBitrateKbps ?? current.customBitrateKbps,
      150,
      12000,
      current.customBitrateKbps
    ),
    customMaxWidth: clampInt(updates.customMaxWidth ?? current.customMaxWidth, 640, 3840, current.customMaxWidth),
    customMaxHeight: clampInt(updates.customMaxHeight ?? current.customMaxHeight, 480, 2160, current.customMaxHeight),
    sshRetentionDays: clampInt(updates.sshRetentionDays ?? current.sshRetentionDays, 1, 3650, current.sshRetentionDays),
    rdpRetentionDays: clampInt(updates.rdpRetentionDays ?? current.rdpRetentionDays, 1, 3650, current.rdpRetentionDays),
    maxStorageGb: clampInt(updates.maxStorageGb ?? current.maxStorageGb, 1, 100000, current.maxStorageGb),
    minFreeDiskPercent: clampInt(
      updates.minFreeDiskPercent ?? current.minFreeDiskPercent,
      1,
      50,
      current.minFreeDiskPercent
    ),
    autoCleanupEnabled:
      updates.autoCleanupEnabled !== undefined ? Boolean(updates.autoCleanupEnabled) : current.autoCleanupEnabled,
    deleteRawAfterTranscode:
      updates.deleteRawAfterTranscode !== undefined
        ? Boolean(updates.deleteRawAfterTranscode)
        : current.deleteRawAfterTranscode,
    encryptAtRest: updates.encryptAtRest !== undefined ? Boolean(updates.encryptAtRest) : current.encryptAtRest,
    maskSensitiveInput:
      updates.maskSensitiveInput !== undefined ? Boolean(updates.maskSensitiveInput) : current.maskSensitiveInput,
    maxConcurrentTranscodes: clampInt(
      updates.maxConcurrentTranscodes ?? current.maxConcurrentTranscodes,
      1,
      4,
      current.maxConcurrentTranscodes
    ),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'admin',
  };

  try {
    fs.mkdirSync(pathCheck.resolved, { recursive: true });
  } catch {
    // Allow saving; diagnostics reports permission details clearly
  }

  return await saveSessionRecordingSettingsRecord(sanitized, updatedBy || 'admin');
}

// ─── Real Host Tooling & Storage Diagnostics ──────────────────────────────────

async function probeBinary(
  name: string,
  versionArgs: string[]
): Promise<{ available: boolean; version: string | null }> {
  try {
    const { stdout: whichOut } = await execFileAsync('which', [name], { timeout: 3000 });
    const binPath = (whichOut || '').trim().split('\n')[0]?.trim();
    if (!binPath) return { available: false, version: null };

    let version = '';
    try {
      const { stdout, stderr } = await execFileAsync(binPath, versionArgs, { timeout: 3000 });
      const firstLine = ((stdout || stderr || '').trim().split('\n')[0] || '').trim();
      version = firstLine.slice(0, 140);
    } catch (verErr: any) {
      const out = ((verErr?.stdout || verErr?.stderr || '') as string).trim().split('\n')[0] || '';
      version = out.trim().slice(0, 140);
    }
    return { available: true, version: version || binPath };
  } catch {
    return { available: false, version: null };
  }
}

function getRealDiskUsage(dirPath: string): {
  diskTotalBytes: number;
  diskFreeBytes: number;
  diskFreePercent: number;
} {
  let probeDir = dirPath;
  while (probeDir && !fs.existsSync(probeDir)) {
    const parent = path.dirname(probeDir);
    if (parent === probeDir) break;
    probeDir = parent;
  }
  try {
    if (typeof (fs as any).statfsSync === 'function') {
      const stat = (fs as any).statfsSync(probeDir || '/');
      const bsize = Number(stat.bsize) || 4096;
      const total = Number(stat.blocks) * bsize;
      const free = Number(stat.bavail ?? stat.bfree) * bsize;
      const freePct = total > 0 ? Number(((free / total) * 100).toFixed(1)) : 0;
      return {
        diskTotalBytes: Math.max(0, total),
        diskFreeBytes: Math.max(0, free),
        diskFreePercent: Math.min(100, Math.max(0, freePct)),
      };
    }
  } catch {}
  return { diskTotalBytes: 0, diskFreeBytes: 0, diskFreePercent: 0 };
}

function scanDirectoryBytes(dirPath: string): { totalBytes: number; fileCount: number } {
  let totalBytes = 0;
  let fileCount = 0;
  if (!dirPath || !fs.existsSync(dirPath)) return { totalBytes: 0, fileCount: 0 };

  const walk = (current: string, depth: number) => {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(full);
          totalBytes += st.size;
          fileCount += 1;
        } catch {}
      }
    }
  };

  walk(dirPath, 0);
  return { totalBytes, fileCount };
}

export async function inspectRecordingStoragePath(
  targetPath?: string,
  projectRoot?: string
): Promise<SessionRecordingHostDiagnostics> {
  const settings = await getEffectiveSessionRecordingSettings(projectRoot);
  const raw = targetPath && targetPath.trim() ? targetPath.trim() : settings.storagePath;
  const check = validateStoragePath(raw);
  const resolvedPath = check.resolved || settings.storagePath;

  let pathExists = false;
  let pathWritable = false;
  let error: string | null = check.valid ? null : check.error || 'Invalid path';

  if (check.valid) {
    try {
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
      }
      pathExists = fs.existsSync(resolvedPath);
      const probeFile = path.join(
        resolvedPath,
        `.write_probe_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.tmp`
      );
      fs.writeFileSync(probeFile, 'ok', 'utf8');
      fs.unlinkSync(probeFile);
      pathWritable = true;
    } catch (err: any) {
      pathExists = fs.existsSync(resolvedPath);
      pathWritable = false;
      error = err?.message || 'Directory is not writable';
    }
  }

  const disk = getRealDiskUsage(resolvedPath);
  const usage = pathExists ? scanDirectoryBytes(resolvedPath) : { totalBytes: 0, fileCount: 0 };
  const [ffmpegInfo, guacencInfo, allRecs] = await Promise.all([
    probeBinary('ffmpeg', ['-version']),
    probeBinary('guacenc', ['-v']),
    getAllSessionRecordingsForCleanup().catch(() => []),
  ]);

  return {
    storagePath: resolvedPath,
    pathExists,
    pathWritable,
    diskTotalBytes: disk.diskTotalBytes,
    diskFreeBytes: disk.diskFreeBytes,
    diskFreePercent: disk.diskFreePercent,
    recordingsUsedBytes: usage.totalBytes,
    recordingsCount: allRecs.length || usage.fileCount,
    legalHoldCount: allRecs.filter((r) => r.legalHold).length,
    ffmpegAvailable: ffmpegInfo.available,
    ffmpegVersion: ffmpegInfo.version,
    guacencAvailable: guacencInfo.available,
    guacencVersion: guacencInfo.version,
    activeTranscodes: activeTranscodeIds.size,
    queuedTranscodes: transcodeQueue.length,
    error,
  };
}

// ─── Policy Decision Engine (Zero-Disruption Safety Floor) ────────────────────

export async function shouldRecordRemoteServerSession(
  protocol: SessionRecordingProtocol,
  server?: Partial<RemoteServer> | null,
  projectRoot?: string
): Promise<{
  shouldRecord: boolean;
  reason?: string;
  settings: SessionRecordingSettings;
}> {
  const settings = await getEffectiveSessionRecordingSettings(projectRoot);

  try {
    const serverPolicy = (server?.recording_policy || 'inherit') as 'inherit' | 'always' | 'disabled';
    if (serverPolicy === 'disabled') {
      return { shouldRecord: false, reason: 'server_policy_disabled', settings };
    }

    if (serverPolicy === 'inherit') {
      if (!settings.enabled) {
        return { shouldRecord: false, reason: 'global_recording_disabled', settings };
      }
      if (protocol === 'ssh' && !settings.recordSsh) {
        return { shouldRecord: false, reason: 'ssh_recording_disabled', settings };
      }
      if (protocol === 'rdp' && !settings.recordRdp) {
        return { shouldRecord: false, reason: 'rdp_recording_disabled', settings };
      }
      if (protocol === 'vnc' && !settings.recordVnc) {
        return { shouldRecord: false, reason: 'vnc_recording_disabled', settings };
      }
    }

    const disk = getRealDiskUsage(settings.storagePath);
    if (disk.diskTotalBytes > 0 && disk.diskFreePercent < settings.minFreeDiskPercent) {
      console.warn(
        `[SessionRecording] Skipping capture: free disk ${disk.diskFreePercent.toFixed(1)}% < floor ${settings.minFreeDiskPercent}%`
      );
      return { shouldRecord: false, reason: 'low_disk_space_guard', settings };
    }

    fs.mkdirSync(settings.storagePath, { recursive: true });
    return { shouldRecord: true, settings };
  } catch (err: any) {
    console.warn('[SessionRecording] Decision check failed safely (live session unaffected):', err?.message || err);
    return { shouldRecord: false, reason: err?.message || 'storage_unavailable', settings };
  }
}

// ─── Optional AES-256-GCM File Encryption at Rest ─────────────────────────────

function deriveRecordingKey(masterSecret?: string): Buffer {
  const secret = masterSecret || getActiveVaultMasterSecret();
  return crypto.scryptSync(secret, RECORDING_CRYPTO_SALT, 32);
}

export function isFileEncryptedAtRest(filePath: string): boolean {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(ENCRYPTED_FILE_MAGIC.length);
      const bytesRead = fs.readSync(fd, header, 0, ENCRYPTED_FILE_MAGIC.length, 0);
      return bytesRead === ENCRYPTED_FILE_MAGIC.length && header.equals(ENCRYPTED_FILE_MAGIC);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

export function encryptBufferForRecording(plainBuffer: Buffer): Buffer {
  const key = deriveRecordingKey();
  const iv = crypto.randomBytes(ENCRYPTED_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENCRYPTED_FILE_MAGIC, iv, tag, encrypted]);
}

export function decryptBufferForRecording(rawBuffer: Buffer): Buffer {
  if (
    rawBuffer.length < ENCRYPTED_HEADER_LEN ||
    !rawBuffer.subarray(0, ENCRYPTED_FILE_MAGIC.length).equals(ENCRYPTED_FILE_MAGIC)
  ) {
    return rawBuffer;
  }

  const iv = rawBuffer.subarray(ENCRYPTED_FILE_MAGIC.length, ENCRYPTED_FILE_MAGIC.length + ENCRYPTED_IV_LEN);
  const tag = rawBuffer.subarray(ENCRYPTED_FILE_MAGIC.length + ENCRYPTED_IV_LEN, ENCRYPTED_HEADER_LEN);
  const ciphertext = rawBuffer.subarray(ENCRYPTED_HEADER_LEN);

  const candidates = getAllCandidateMasterSecrets();
  for (const secret of candidates) {
    try {
      const key = deriveRecordingKey(secret);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {}
  }

  throw new Error('Unable to decrypt recording file with active or legacy security keys.');
}

export async function encryptFileInPlace(filePath: string): Promise<boolean> {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false;
    if (isFileEncryptedAtRest(filePath)) return true;
    const plain = await fs.promises.readFile(filePath);
    const enc = encryptBufferForRecording(plain);
    const tmpPath = `${filePath}.enc.tmp`;
    await fs.promises.writeFile(tmpPath, enc);
    await fs.promises.rename(tmpPath, filePath);
    return true;
  } catch (err: any) {
    console.warn(`[SessionRecording] encryptFileInPlace warning for ${filePath}:`, err?.message || err);
    return false;
  }
}

export async function readDecryptedRecordingBuffer(filePath: string): Promise<Buffer> {
  const raw = await fs.promises.readFile(filePath);
  if (
    raw.length >= ENCRYPTED_HEADER_LEN &&
    raw.subarray(0, ENCRYPTED_FILE_MAGIC.length).equals(ENCRYPTED_FILE_MAGIC)
  ) {
    return decryptBufferForRecording(raw);
  }
  return raw;
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(''));
    } catch {
      resolve('');
    }
  });
}

function buildRecordingFilePath(
  storageRoot: string,
  protocol: SessionRecordingProtocol,
  serverId: string,
  recordingId: string,
  ext: string
): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dayDir = path.join(storageRoot, yyyy, mm, dd);
  fs.mkdirSync(dayDir, { recursive: true });

  const safeServer = (serverId || 'srv').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'srv';
  const safeId = recordingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-14);
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(dayDir, `${protocol}_${safeServer}_${stamp}_${safeId}.${ext}`);
}

const RISK_RANK: Record<'low' | 'medium' | 'high' | 'critical', number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function normalizeRiskLevel(raw?: string): 'low' | 'medium' | 'high' | 'critical' {
  const r = (raw || 'low').toLowerCase();
  if (r === 'critical') return 'critical';
  if (r === 'high' || r === 'danger') return 'high';
  if (r === 'medium' || r === 'warning') return 'medium';
  return 'low';
}

// ─── SSH Passive Asciicast v2 (.cast) Session Recorder ────────────────────────

export interface SshRecorderHandle {
  recordingId: string;
  filePath: string;
  writeOutput: (data: string | Buffer) => void;
  writeResize: (cols: number, rows: number) => void;
  recordCommandMarker: (command: string, riskLevel?: string, wasBlocked?: boolean) => void;
  finalize: (disconnectReason?: string) => Promise<void>;
}

export async function createSshSessionRecorder(params: {
  sessionId: string;
  server: Partial<RemoteServer>;
  operatorUsername: string;
  operatorRole?: string;
  operatorIp?: string;
  targetUsername?: string;
  cols?: number;
  rows?: number;
  projectRoot?: string;
}): Promise<SshRecorderHandle | null> {
  try {
    const decision = await shouldRecordRemoteServerSession('ssh', params.server, params.projectRoot);
    if (!decision.shouldRecord) return null;

    const settings = decision.settings;
    const recordingId = `rec-ssh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startedAtMs = Date.now();
    const startedAtIso = new Date(startedAtMs).toISOString();
    const expiresAtIso = new Date(startedAtMs + Math.max(1, settings.sshRetentionDays) * 86400 * 1000).toISOString();
    const cols = Math.max(20, Math.min(500, Number(params.cols) || 120));
    const rows = Math.max(10, Math.min(200, Number(params.rows) || 32));
    const filePath = buildRecordingFilePath(
      settings.storagePath,
      'ssh',
      params.server.id || params.server.ip || 'server',
      recordingId,
      'cast'
    );

    const writeStream = fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf8' });
    let streamBroken = false;
    let finalized = false;
    let commandCount = 0;
    let highRiskCount = 0;
    let maxRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let droppedChunks = 0;
    let currentCols = cols;
    let currentRows = rows;

    writeStream.on('error', (err) => {
      streamBroken = true;
      console.warn(`[SessionRecording] SSH writeStream error (${recordingId}):`, err?.message || err);
    });

    const headerObj = {
      version: 2,
      width: cols,
      height: rows,
      timestamp: Math.floor(startedAtMs / 1000),
      title: `${params.server.name || params.server.ip || 'Remote Server'} (${params.operatorUsername})`,
      env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
    };
    writeStream.write(JSON.stringify(headerObj) + '\n');

    await createSessionRecordingRecord({
      id: recordingId,
      sessionId: params.sessionId,
      serverId: params.server.id || '',
      serverName: params.server.name || params.server.hostname || params.server.ip || 'Remote Server',
      serverIp: params.server.ip || '',
      osType: params.server.os_type || 'linux',
      serverEnvironment: params.server.environment || 'Production',
      protocol: 'ssh',
      userId: null,
      username: params.operatorUsername || 'admin',
      userRole: params.operatorRole || 'Operator',
      clientIp: params.operatorIp || null,
      startedAt: startedAtIso,
      endedAt: null,
      durationSeconds: 0,
      status: 'recording',
      rawFilePath: filePath,
      videoFilePath: null,
      videoFormat: 'cast',
      qualityPreset: 'lossless',
      fileSizeBytes: 0,
      rawSizeBytes: 0,
      videoSizeBytes: 0,
      commandCount: 0,
      maxRiskLevel: 'low',
      sha256Hash: null,
      encrypted: false,
      legalHold: false,
      legalHoldReason: null,
      legalHoldBy: null,
      legalHoldAt: null,
      expiresAt: expiresAtIso,
      errorMessage: null,
      metadata: {
        targetUsername: params.targetUsername || params.server.ssh_username || '',
        maskSensitiveInput: settings.maskSensitiveInput,
        cols,
        rows,
        highRiskCount: 0,
      },
    });

    const writeOutput = (data: string | Buffer) => {
      if (finalized || streamBroken) return;
      try {
        if (writeStream.writableLength > 4 * 1024 * 1024) {
          droppedChunks += 1;
          return;
        }
        const text = typeof data === 'string' ? data : data.toString('utf8');
        if (!text) return;
        const elapsed = Number(((Date.now() - startedAtMs) / 1000).toFixed(4));
        writeStream.write(JSON.stringify([elapsed, 'o', text]) + '\n');
      } catch {}
    };

    const writeResize = (nextCols: number, nextRows: number) => {
      if (finalized || streamBroken) return;
      try {
        const c = Math.max(20, Math.min(500, Number(nextCols) || currentCols));
        const r = Math.max(10, Math.min(200, Number(nextRows) || currentRows));
        if (c === currentCols && r === currentRows) return;
        currentCols = c;
        currentRows = r;
        const elapsed = Number(((Date.now() - startedAtMs) / 1000).toFixed(4));
        writeStream.write(JSON.stringify([elapsed, 'r', `${c}x${r}`]) + '\n');
      } catch {}
    };

    const recordCommandMarker = (command: string, riskLevel = 'low', wasBlocked = false) => {
      if (finalized) return;
      try {
        const cleanCmd = (command || '').trim();
        if (!cleanCmd) return;
        commandCount += 1;
        const normRisk = wasBlocked ? 'high' : normalizeRiskLevel(riskLevel);
        if (RISK_RANK[normRisk] > RISK_RANK[maxRiskLevel]) {
          maxRiskLevel = normRisk;
        }
        if (normRisk === 'high' || normRisk === 'critical' || wasBlocked) {
          highRiskCount += 1;
        }
        const offsetMs = Math.max(0, Date.now() - startedAtMs);
        addSessionRecordingMarker({
          id: `mkr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          recordingId,
          offsetMs,
          markerType: 'command',
          riskLevel: normRisk,
          label: cleanCmd.split(/\s+/)[0]?.slice(0, 80) || 'command',
          commandText: cleanCmd.slice(0, 1000),
        }).catch(() => {});
      } catch {}
    };

    const finalize = async (disconnectReason = 'closed') => {
      if (finalized) return;
      finalized = true;
      try {
        await new Promise<void>((resolve) => {
          if (streamBroken || writeStream.writableEnded) {
            resolve();
            return;
          }
          writeStream.end(() => resolve());
          setTimeout(resolve, 1500);
        });

        const endedAtMs = Date.now();
        const durationSeconds = Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000));
        let rawSize = 0;
        let sha256 = '';
        let encrypted = false;

        if (fs.existsSync(filePath)) {
          sha256 = await computeFileSha256(filePath);
          if (settings.encryptAtRest) {
            encrypted = await encryptFileInPlace(filePath);
          }
          try {
            rawSize = fs.statSync(filePath).size;
          } catch {}
        }

        await updateSessionRecordingRecord(recordingId, {
          endedAt: new Date(endedAtMs).toISOString(),
          durationSeconds,
          status: streamBroken ? 'failed' : 'ready',
          fileSizeBytes: rawSize,
          rawSizeBytes: rawSize,
          commandCount,
          maxRiskLevel,
          sha256Hash: sha256 || null,
          encrypted,
          metadata: {
            maskSensitiveInput: settings.maskSensitiveInput,
            droppedChunks,
            cols: currentCols,
            rows: currentRows,
            highRiskCount,
            disconnectReason,
          },
        });
      } catch (err: any) {
        console.warn(`[SessionRecording] SSH finalize error (${recordingId}):`, err?.message || err);
      }
    };

    return {
      recordingId,
      filePath,
      writeOutput,
      writeResize,
      recordCommandMarker,
      finalize,
    };
  } catch (err: any) {
    console.warn('[SessionRecording] Could not initialize SSH recorder (live session unaffected):', err?.message || err);
    return null;
  }
}

// ─── RDP / VNC Passive Guacamole (.guac) Session Recorder ─────────────────────

export interface GuacRecorderHandle {
  recordingId: string;
  filePath: string;
  writeInstruction: (instructionWithSemicolon: string) => void;
  finalize: (disconnectReason?: string) => Promise<void>;
}

function parseGuacOpcode(instr: string): string {
  const dotIdx = instr.indexOf('.');
  if (dotIdx <= 0 || dotIdx > 6) return '';
  const len = parseInt(instr.slice(0, dotIdx), 10);
  if (!Number.isFinite(len) || len <= 0 || dotIdx + 1 + len > instr.length) return '';
  return instr.slice(dotIdx + 1, dotIdx + 1 + len);
}

function parseGuacSizeInstruction(instr: string): string | null {
  try {
    const clean = instr.endsWith(';') ? instr.slice(0, -1) : instr;
    const parts = clean.split(',');
    if (parts.length < 4) return null;
    const readToken = (tok: string) => {
      const idx = tok.indexOf('.');
      return idx >= 0 ? tok.slice(idx + 1) : '';
    };
    const layer = readToken(parts[1]);
    if (layer !== '0') return null;
    const w = parseInt(readToken(parts[2]), 10);
    const h = parseInt(readToken(parts[3]), 10);
    if (w > 100 && h > 100 && w <= 7680 && h <= 4320) {
      return `${w}x${h}`;
    }
  } catch {}
  return null;
}

export async function createGuacSessionRecorder(params: {
  sessionId: string;
  protocol: 'rdp' | 'vnc';
  server: Partial<RemoteServer>;
  operatorUsername: string;
  operatorRole?: string;
  operatorIp?: string;
  targetUsername?: string;
  initialWidth?: number;
  initialHeight?: number;
  projectRoot?: string;
}): Promise<GuacRecorderHandle | null> {
  try {
    const decision = await shouldRecordRemoteServerSession(params.protocol, params.server, params.projectRoot);
    if (!decision.shouldRecord) return null;

    const settings = decision.settings;
    const recordingId = `rec-${params.protocol}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startedAtMs = Date.now();
    const startedAtIso = new Date(startedAtMs).toISOString();
    const expiresAtIso = new Date(startedAtMs + Math.max(1, settings.rdpRetentionDays) * 86400 * 1000).toISOString();
    const filePath = buildRecordingFilePath(
      settings.storagePath,
      params.protocol,
      params.server.id || params.server.ip || 'server',
      recordingId,
      'guac'
    );

    const writeStream = fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf8' });
    let streamBroken = false;
    let finalized = false;
    let droppedFrames = 0;
    let instructionCount = 0;
    let syncCount = 0;
    let detectedResolution =
      params.initialWidth && params.initialHeight ? `${params.initialWidth}x${params.initialHeight}` : '';

    writeStream.on('error', (err) => {
      streamBroken = true;
      console.warn(`[SessionRecording] Guac writeStream error (${recordingId}):`, err?.message || err);
    });

    await createSessionRecordingRecord({
      id: recordingId,
      sessionId: params.sessionId,
      serverId: params.server.id || '',
      serverName: params.server.name || params.server.hostname || params.server.ip || 'Remote Server',
      serverIp: params.server.ip || '',
      osType: params.server.os_type || (params.protocol === 'rdp' ? 'windows' : 'linux'),
      serverEnvironment: params.server.environment || 'Production',
      protocol: params.protocol,
      userId: null,
      username: params.operatorUsername || 'admin',
      userRole: params.operatorRole || 'Operator',
      clientIp: params.operatorIp || null,
      startedAt: startedAtIso,
      endedAt: null,
      durationSeconds: 0,
      status: 'recording',
      rawFilePath: filePath,
      videoFilePath: null,
      videoFormat: settings.videoFormat,
      qualityPreset: settings.qualityPreset,
      fileSizeBytes: 0,
      rawSizeBytes: 0,
      videoSizeBytes: 0,
      commandCount: 0,
      maxRiskLevel: 'low',
      sha256Hash: null,
      encrypted: false,
      legalHold: false,
      legalHoldReason: null,
      legalHoldBy: null,
      legalHoldAt: null,
      expiresAt: expiresAtIso,
      errorMessage: null,
      metadata: {
        targetUsername: params.targetUsername || params.server.win_username || '',
        resolution: detectedResolution,
        maskSensitiveInput: settings.maskSensitiveInput,
        transcodeState: 'pending',
      },
    });

    const suppressedClipboardStreams = new Set<string>();

    const writeInstruction = (instructionWithSemicolon: string) => {
      if (finalized || streamBroken || !instructionWithSemicolon) return;
      try {
        if (writeStream.writableLength > 8 * 1024 * 1024) {
          droppedFrames += 1;
          return;
        }

        const opcode = parseGuacOpcode(instructionWithSemicolon);
        if (opcode === 'nop') return;

        if (settings.maskSensitiveInput) {
          if (opcode === 'clipboard') {
            const parts = instructionWithSemicolon.slice(0, -1).split(',');
            if (parts.length >= 2) {
              const dot = parts[1].indexOf('.');
              const streamId = dot >= 0 ? parts[1].slice(dot + 1) : '';
              if (streamId) suppressedClipboardStreams.add(streamId);
            }
            return;
          }
          if ((opcode === 'blob' || opcode === 'end') && suppressedClipboardStreams.size > 0) {
            const parts = instructionWithSemicolon.slice(0, -1).split(',');
            if (parts.length >= 2) {
              const dot = parts[1].indexOf('.');
              const streamId = dot >= 0 ? parts[1].slice(dot + 1) : '';
              if (suppressedClipboardStreams.has(streamId)) {
                if (opcode === 'end') suppressedClipboardStreams.delete(streamId);
                return;
              }
            }
          }
        }

        if (opcode === 'size') {
          const res = parseGuacSizeInstruction(instructionWithSemicolon);
          if (res) detectedResolution = res;
        }
        if (opcode === 'sync') {
          syncCount += 1;
        }

        writeStream.write(instructionWithSemicolon);
        instructionCount += 1;
      } catch {}
    };

    const finalize = async (disconnectReason = 'closed') => {
      if (finalized) return;
      finalized = true;
      try {
        // Ensure at least one sync frame exists if instructions were captured so players/guacenc render Frame 0
        if (!streamBroken && !writeStream.writableEnded && instructionCount > 0 && syncCount === 0) {
          const ts = String(Date.now());
          try {
            writeStream.write(`4.sync,${ts.length}.${ts};`);
            syncCount += 1;
          } catch {}
        }

        await new Promise<void>((resolve) => {
          if (streamBroken || writeStream.writableEnded) {
            resolve();
            return;
          }
          writeStream.end(() => resolve());
          setTimeout(resolve, 2000);
        });

        const endedAtMs = Date.now();
        const durationSeconds = Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000));
        let rawSize = 0;
        let sha256 = '';

        if (fs.existsSync(filePath)) {
          try {
            rawSize = fs.statSync(filePath).size;
          } catch {}
          sha256 = await computeFileSha256(filePath);
        }

        const shouldAttemptTranscode =
          !streamBroken && rawSize > 0 && settings.videoFormat !== 'guac_only';

        const [guacencInfo, ffmpegInfo] = shouldAttemptTranscode
          ? await Promise.all([probeBinary('guacenc', ['-v']), probeBinary('ffmpeg', ['-version'])])
          : [{ available: false, version: null }, { available: false, version: null }];

        const canTranscode = shouldAttemptTranscode && guacencInfo.available && ffmpegInfo.available;

        let encrypted = false;
        if (!canTranscode && settings.encryptAtRest && fs.existsSync(filePath)) {
          encrypted = await encryptFileInPlace(filePath);
          try {
            rawSize = fs.statSync(filePath).size;
          } catch {}
        }

        await updateSessionRecordingRecord(recordingId, {
          endedAt: new Date(endedAtMs).toISOString(),
          durationSeconds,
          status: streamBroken ? 'failed' : canTranscode ? 'queued_transcode' : 'ready',
          fileSizeBytes: rawSize,
          rawSizeBytes: rawSize,
          sha256Hash: sha256 || null,
          encrypted,
          metadata: {
            resolution: detectedResolution,
            maskSensitiveInput: settings.maskSensitiveInput,
            droppedFrames,
            instructionCount,
            disconnectReason,
            transcodeState: canTranscode
              ? 'queued'
              : settings.videoFormat === 'guac_only'
              ? 'guac_only'
              : 'native_guac_only',
            transcodeNotice:
              !canTranscode && settings.videoFormat !== 'guac_only'
                ? 'Native .guac stream is immediately playable. Install guacamole-server (guacenc) + ffmpeg for MP4/WebM conversion.'
                : undefined,
          },
        });

        if (canTranscode) {
          enqueueRecordingTranscode(recordingId);
        }
      } catch (err: any) {
        console.warn(`[SessionRecording] Guac finalize error (${recordingId}):`, err?.message || err);
      }
    };

    return {
      recordingId,
      filePath,
      writeInstruction,
      finalize,
    };
  } catch (err: any) {
    console.warn('[SessionRecording] Could not initialize Guacamole recorder (live RDP/VNC unaffected):', err?.message || err);
    return null;
  }
}

// ─── Low-Priority Background Transcoding Queue (.guac -> MP4 / WebM) ──────────

export function enqueueRecordingTranscode(recordingId: string): void {
  if (!recordingId) return;
  if (activeTranscodeIds.has(recordingId) || transcodeQueue.includes(recordingId)) return;
  transcodeQueue.push(recordingId);
  processTranscodeQueue().catch(() => {});
}

async function processTranscodeQueue(): Promise<void> {
  const settings = await getEffectiveSessionRecordingSettings();
  const maxConc = Math.max(1, Math.min(4, settings.maxConcurrentTranscodes || 1));

  while (activeTranscodeIds.size < maxConc && transcodeQueue.length > 0) {
    const nextId = transcodeQueue.shift();
    if (!nextId) break;
    activeTranscodeIds.add(nextId);
    runSingleRecordingTranscode(nextId, settings)
      .catch((err) => {
        console.warn(`[SessionRecording] Background transcode failed for ${nextId}:`, err?.message || err);
      })
      .finally(() => {
        activeTranscodeIds.delete(nextId);
        processTranscodeQueue().catch(() => {});
      });
  }
}

function runLowPriorityProcess(
  cmd: string,
  args: string[],
  timeoutMs = 30 * 60 * 1000
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('nice', ['-n', '15', cmd, ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, timeoutMs);
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: err.message });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

function encodeGuacToken(val: string): string {
  return `${val.length}.${val}`;
}

function parseGuacInstructionsFromText(text: string): Array<{ raw: string; parts: string[] }> {
  const results: Array<{ raw: string; parts: string[] }> = [];
  let idx = 0;
  const n = text.length;
  while (idx < n) {
    const start = idx;
    const parts: string[] = [];
    let valid = true;
    while (idx < n) {
      const dot = text.indexOf('.', idx);
      if (dot <= idx) {
        valid = false;
        break;
      }
      const len = parseInt(text.slice(idx, dot), 10);
      if (!Number.isFinite(len) || len < 0 || dot + 1 + len >= n) {
        valid = false;
        break;
      }
      const val = text.slice(dot + 1, dot + 1 + len);
      parts.push(val);
      const termIdx = dot + 1 + len;
      const term = text[termIdx];
      idx = termIdx + 1;
      if (term === ';') {
        break;
      } else if (term !== ',') {
        valid = false;
        break;
      }
    }
    if (!valid || parts.length === 0) break;
    results.push({ raw: text.slice(start, idx), parts });
  }
  return results;
}

function convertSingleWebpBufferToPng(webpBuf: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(
        'ffmpeg',
        ['-hide_banner', '-loglevel', 'error', '-f', 'webp_pipe', '-i', 'pipe:0', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'],
        { stdio: ['pipe', 'pipe', 'ignore'] }
      );
      const chunks: Buffer[] = [];
      proc.stdout?.on('data', (c: Buffer) => chunks.push(c));
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve(null);
      }, 6000);
      proc.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          resolve(null);
        }
      });
      proc.stdin?.end(webpBuf);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Rewrites `image/webp` img/blob/end sequences in a Guacamole recording into `image/png`
 * so older Linux builds of `guacenc` compiled without libwebp can still render every frame cleanly.
 */
export async function convertWebpStreamsToPngInGuac(guacText: string): Promise<{ text: string; convertedCount: number }> {
  if (!guacText.includes('10.image/webp')) {
    return { text: guacText, convertedCount: 0 };
  }
  const instructions = parseGuacInstructionsFromText(guacText);
  const webpStreams = new Map<string, { headerParts: string[]; b64Chunks: string[] }>();
  const outParts: string[] = [];
  let convertedCount = 0;

  for (const inst of instructions) {
    const op = inst.parts[0];
    // Guacamole img instruction format: img,stream,mask,layer,mimetype,x,y
    if (op === 'img' && inst.parts.length >= 7 && inst.parts[4] === 'image/webp') {
      const streamId = inst.parts[1];
      webpStreams.set(streamId, { headerParts: inst.parts, b64Chunks: [] });
      continue;
    }
    if (op === 'blob' && inst.parts.length >= 3 && webpStreams.has(inst.parts[1])) {
      webpStreams.get(inst.parts[1])!.b64Chunks.push(inst.parts[2]);
      continue;
    }
    if (op === 'end' && inst.parts.length >= 2 && webpStreams.has(inst.parts[1])) {
      const streamId = inst.parts[1];
      const entry = webpStreams.get(streamId)!;
      webpStreams.delete(streamId);
      const rawWebp = Buffer.from(entry.b64Chunks.join(''), 'base64');
      const pngBuf = rawWebp.length > 0 ? await convertSingleWebpBufferToPng(rawWebp) : null;
      if (pngBuf && pngBuf.length > 0) {
        const pngHeader = [...entry.headerParts];
        pngHeader[4] = 'image/png';
        outParts.push(pngHeader.map(encodeGuacToken).join(',') + ';');
        const pngB64 = pngBuf.toString('base64');
        for (let off = 0; off < pngB64.length; off += 6144) {
          const chunk = pngB64.slice(off, off + 6144);
          outParts.push(`${encodeGuacToken('blob')},${encodeGuacToken(streamId)},${encodeGuacToken(chunk)};`);
        }
        outParts.push(`${encodeGuacToken('end')},${encodeGuacToken(streamId)};`);
        convertedCount += 1;
      } else {
        outParts.push(entry.headerParts.map(encodeGuacToken).join(',') + ';');
        for (const ch of entry.b64Chunks) {
          outParts.push(`${encodeGuacToken('blob')},${encodeGuacToken(streamId)},${encodeGuacToken(ch)};`);
        }
        outParts.push(inst.raw);
      }
      continue;
    }
    outParts.push(inst.raw);
  }
  return { text: outParts.join(''), convertedCount };
}

async function runSingleRecordingTranscode(
  recordingId: string,
  settings: SessionRecordingSettings
): Promise<void> {
  const rec = await getSessionRecordingById(recordingId);
  if (!rec || !rec.rawFilePath || !fs.existsSync(rec.rawFilePath)) {
    return;
  }

  const [guacencInfo, ffmpegInfo] = await Promise.all([
    probeBinary('guacenc', ['-v']),
    probeBinary('ffmpeg', ['-version']),
  ]);

  if (!guacencInfo.available || !ffmpegInfo.available) {
    await updateSessionRecordingRecord(recordingId, {
      status: 'ready',
      metadata: {
        ...(rec.metadata || {}),
        transcodeState: 'native_guac_only',
        transcodeNotice: 'guacenc or ffmpeg not installed on host; native .guac playback active.',
      },
    });
    return;
  }

  await updateSessionRecordingRecord(recordingId, {
    status: 'transcoding',
    metadata: {
      ...(rec.metadata || {}),
      transcodeState: 'running',
      transcodeStartedAt: new Date().toISOString(),
    },
  });

  const preset =
    settings.qualityPreset === 'custom'
      ? {
          fps: settings.customFps || 15,
          bitrateKbps: settings.customBitrateKbps || 900,
          maxWidth: settings.customMaxWidth || 1280,
          maxHeight: settings.customMaxHeight || 720,
        }
      : QUALITY_PRESET_PARAMS[settings.qualityPreset] || QUALITY_PRESET_PARAMS.balanced;

  const targetRes = `${preset.maxWidth}x${preset.maxHeight}`;
  const rawPlainBuf = isFileEncryptedAtRest(rec.rawFilePath)
    ? await readDecryptedRecordingBuffer(rec.rawFilePath)
    : await fs.promises.readFile(rec.rawFilePath);
  let guacText = rawPlainBuf.toString('utf8');

  // Ensure layer 0 has an explicit size preamble so guacenc never paints onto a 0x0 black canvas
  const resMatch = /^(\d+)x(\d+)$/.exec(String(rec.metadata?.resolution || ''));
  const fallbackW = resMatch ? Math.max(320, Math.min(3840, Number(resMatch[1]))) : preset.maxWidth;
  const fallbackH = resMatch ? Math.max(240, Math.min(2160, Number(resMatch[2]))) : preset.maxHeight;
  if (!guacText.includes('4.size,1.0,')) {
    const sizePreamble = `${encodeGuacToken('size')},${encodeGuacToken('0')},${encodeGuacToken(String(fallbackW))},${encodeGuacToken(String(fallbackH))};`;
    guacText = sizePreamble + guacText;
  }

  const tempWorkPath = `${rec.rawFilePath}.work.guac`;
  const tempNoWebpPath = `${rec.rawFilePath}.nowebp.guac`;
  let activeGuacInputPath = tempWorkPath;
  await fs.promises.writeFile(tempWorkPath, guacText, 'utf8');

  let m4vPath = `${activeGuacInputPath}.m4v`;
  const targetFormat: 'mp4' | 'webm' = settings.videoFormat === 'webm' ? 'webm' : 'mp4';
  const baseOut = rec.rawFilePath.replace(/\.guac$/i, '');
  const finalVideoPath = `${baseOut}.${targetFormat}`;

  try {
    let guacRes = await runLowPriorityProcess('guacenc', [
      '-s',
      targetRes,
      '-r',
      String(preset.bitrateKbps * 1000),
      '-f',
      activeGuacInputPath,
    ]);

    // If host guacenc lacks libwebp (common on Ubuntu/Debian), it warns and outputs black frames.
    // Detect this and transparently convert image/webp blobs to image/png in a temp copy, then re-run guacenc.
    const webpWarningDetected =
      guacText.includes('10.image/webp') &&
      /webp|unsupported|ignoring/i.test(guacRes.stderr || '');

    if (webpWarningDetected) {
      try {
        if (fs.existsSync(m4vPath)) fs.unlinkSync(m4vPath);
      } catch {}
      const converted = await convertWebpStreamsToPngInGuac(guacText);
      if (converted.convertedCount > 0) {
        await fs.promises.writeFile(tempNoWebpPath, converted.text, 'utf8');
        activeGuacInputPath = tempNoWebpPath;
        m4vPath = `${activeGuacInputPath}.m4v`;
        guacRes = await runLowPriorityProcess('guacenc', [
          '-s',
          targetRes,
          '-r',
          String(preset.bitrateKbps * 1000),
          '-f',
          activeGuacInputPath,
        ]);
      }
    }

    if (guacRes.code !== 0 || !fs.existsSync(m4vPath) || fs.statSync(m4vPath).size < 256) {
      throw new Error(`guacenc failed (exit ${guacRes.code}): ${guacRes.stderr.slice(0, 300)}`);
    }

    const ffmpegArgs =
      targetFormat === 'webm'
        ? [
            '-y',
            '-i',
            m4vPath,
            '-r',
            String(preset.fps),
            '-c:v',
            'libvpx-vp9',
            '-b:v',
            `${preset.bitrateKbps}k`,
            '-deadline',
            'realtime',
            '-cpu-used',
            '4',
            '-an',
            finalVideoPath,
          ]
        : [
            '-y',
            '-i',
            m4vPath,
            '-r',
            String(preset.fps),
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-b:v',
            `${preset.bitrateKbps}k`,
            '-movflags',
            '+faststart',
            '-an',
            finalVideoPath,
          ];

    const ffRes = await runLowPriorityProcess('ffmpeg', ffmpegArgs);
    if (ffRes.code !== 0 || !fs.existsSync(finalVideoPath)) {
      throw new Error(`ffmpeg failed (exit ${ffRes.code}): ${ffRes.stderr.slice(0, 300)}`);
    }

    const videoSha = await computeFileSha256(finalVideoPath);
    let encrypted = rec.encrypted;
    if (settings.encryptAtRest) {
      encrypted = await encryptFileInPlace(finalVideoPath);
    }

    const videoSize = fs.statSync(finalVideoPath).size;
    let nextRawPath: string | null = rec.rawFilePath;
    let nextRawSize = rec.rawSizeBytes;

    if (
      settings.deleteRawAfterTranscode &&
      settings.videoFormat !== 'both' &&
      videoSize > 0 &&
      rec.rawFilePath &&
      fs.existsSync(rec.rawFilePath)
    ) {
      try {
        fs.unlinkSync(rec.rawFilePath);
        nextRawPath = null;
        nextRawSize = 0;
      } catch {}
    } else if (settings.encryptAtRest && rec.rawFilePath && fs.existsSync(rec.rawFilePath)) {
      await encryptFileInPlace(rec.rawFilePath);
      try {
        nextRawSize = fs.statSync(rec.rawFilePath).size;
      } catch {}
    }

    await updateSessionRecordingRecord(recordingId, {
      status: 'ready',
      videoFilePath: finalVideoPath,
      videoSizeBytes: videoSize,
      rawFilePath: nextRawPath,
      rawSizeBytes: nextRawSize,
      fileSizeBytes: videoSize + nextRawSize,
      videoFormat: targetFormat,
      qualityPreset: settings.qualityPreset,
      sha256Hash: videoSha || rec.sha256Hash,
      encrypted,
      metadata: {
        ...(rec.metadata || {}),
        transcodeState: 'completed',
        transcodeCompletedAt: new Date().toISOString(),
        targetFps: preset.fps,
        targetBitrateKbps: preset.bitrateKbps,
        targetResolution: targetRes,
      },
    });
  } catch (err: any) {
    let encrypted = rec.encrypted;
    if (settings.encryptAtRest && rec.rawFilePath && fs.existsSync(rec.rawFilePath)) {
      encrypted = await encryptFileInPlace(rec.rawFilePath);
    }
    await updateSessionRecordingRecord(recordingId, {
      status: 'ready',
      encrypted,
      metadata: {
        ...(rec.metadata || {}),
        transcodeState: 'failed_fallback_raw',
        transcodeError: (err?.message || String(err)).slice(0, 400),
      },
    });
  } finally {
    for (const tmp of [m4vPath, `${tempWorkPath}.m4v`, `${tempNoWebpPath}.m4v`, tempWorkPath, tempNoWebpPath]) {
      try {
        if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {}
    }
  }
}

// ─── Plain-Text SSH Transcript Generator ──────────────────────────────────────

const ANSI_ESCAPE_RE =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

export function extractPlainTextTranscriptFromCast(castContent: string, rec?: SessionRecordingRecord): string {
  const lines = (castContent || '').split('\n');
  const out: string[] = [];

  if (rec) {
    out.push('====================================================================');
    out.push(`SSH SESSION TRANSCRIPT — ${rec.serverName} (${rec.serverIp})`);
    out.push(`Recording ID: ${rec.id}`);
    out.push(`Operator: ${rec.username} (${rec.userRole}) | Source IP: ${rec.clientIp || 'N/A'}`);
    out.push(`Target Account: ${rec.metadata?.targetUsername || 'N/A'} | Started: ${rec.startedAt}`);
    out.push(`Duration: ${rec.durationSeconds}s | Commands: ${rec.commandCount} | Max Risk: ${rec.maxRiskLevel}`);
    out.push(`SHA-256: ${rec.sha256Hash || 'N/A'}`);
    out.push('====================================================================\n');
  }

  let currentLine = '';
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[1] === 'o' && typeof parsed[2] === 'string') {
        const cleaned = parsed[2]
          .replace(ANSI_ESCAPE_RE, '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '');
        currentLine += cleaned;
        if (currentLine.includes('\n')) {
          const split = currentLine.split('\n');
          currentLine = split.pop() || '';
          const sec = Math.floor(Number(parsed[0]) || 0);
          const mm = String(Math.floor(sec / 60)).padStart(2, '0');
          const ss = String(sec % 60).padStart(2, '0');
          for (const s of split) {
            out.push(`[${mm}:${ss}] ${s}`);
          }
        }
      }
    } catch {}
  }
  if (currentLine.trim()) {
    out.push(currentLine);
  }
  return out.join('\n') + '\n';
}

// ─── File Removal Helper ──────────────────────────────────────────────────────

export function deletePhysicalRecordingFiles(rec: SessionRecordingRecord): number {
  let freedBytes = 0;
  const paths = [rec.rawFilePath, rec.videoFilePath].filter(
    (p): p is string => Boolean(p && typeof p === 'string')
  );
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const st = fs.statSync(p);
        freedBytes += st.size;
        fs.unlinkSync(p);
      }
    } catch (err: any) {
      console.warn(`[SessionRecording] Failed removing file ${p}:`, err?.message || err);
    }
  }
  return freedBytes;
}

// ─── Automated Retention & Quota Cleanup Daemon ───────────────────────────────

export interface SessionRecordingCleanupResult {
  deletedCount: number;
  expiredDeletedCount: number;
  quotaDeletedCount: number;
  skippedLegalHoldCount: number;
  freedBytes: number;
  remainingCount: number;
  remainingBytes: number;
  executedAt: string;
}

export async function runSessionRecordingCleanup(
  projectRoot?: string,
  trigger: 'scheduled' | 'manual' = 'scheduled',
  triggeredBy = 'system'
): Promise<SessionRecordingCleanupResult> {
  const settings = await getEffectiveSessionRecordingSettings(projectRoot);
  const all = await getAllSessionRecordingsForCleanup();
  const nowMs = Date.now();
  const sshCutoffMs = nowMs - Math.max(1, settings.sshRetentionDays) * 86400 * 1000;
  const rdpCutoffMs = nowMs - Math.max(1, settings.rdpRetentionDays) * 86400 * 1000;
  const maxQuotaBytes = Math.max(1, settings.maxStorageGb) * 1024 * 1024 * 1024;

  let expiredDeletedCount = 0;
  let quotaDeletedCount = 0;
  let skippedLegalHoldCount = 0;
  let freedBytes = 0;

  const remaining: SessionRecordingRecord[] = [];

  for (const rec of all) {
    if (rec.status === 'recording' || rec.status === 'transcoding' || rec.status === 'queued_transcode') {
      remaining.push(rec);
      continue;
    }
    const recTime = new Date(rec.startedAt).getTime();
    const cutoff = rec.protocol === 'ssh' ? sshCutoffMs : rdpCutoffMs;
    const isExpired = Number.isFinite(recTime) && recTime < cutoff;

    if (isExpired) {
      if (rec.legalHold) {
        skippedLegalHoldCount += 1;
        remaining.push(rec);
        continue;
      }
      freedBytes += deletePhysicalRecordingFiles(rec);
      await deleteSessionRecordingRecord(rec.id);
      expiredDeletedCount += 1;
    } else {
      remaining.push(rec);
    }
  }

  let totalBytes = remaining.reduce(
    (acc, r) => acc + (Number(r.fileSizeBytes) || (Number(r.rawSizeBytes) || 0) + (Number(r.videoSizeBytes) || 0)),
    0
  );

  const finalRemaining: SessionRecordingRecord[] = [];
  for (const rec of remaining) {
    if (
      totalBytes > maxQuotaBytes &&
      rec.status !== 'recording' &&
      rec.status !== 'transcoding' &&
      rec.status !== 'queued_transcode'
    ) {
      if (rec.legalHold) {
        skippedLegalHoldCount += 1;
        finalRemaining.push(rec);
        continue;
      }
      const recBytes =
        Number(rec.fileSizeBytes) || (Number(rec.rawSizeBytes) || 0) + (Number(rec.videoSizeBytes) || 0);
      freedBytes += deletePhysicalRecordingFiles(rec);
      await deleteSessionRecordingRecord(rec.id);
      totalBytes = Math.max(0, totalBytes - recBytes);
      quotaDeletedCount += 1;
    } else {
      finalRemaining.push(rec);
    }
  }

  const deletedCount = expiredDeletedCount + quotaDeletedCount;
  const executedAt = new Date().toISOString();

  if (deletedCount > 0 || trigger === 'manual') {
    await saveSessionRecordingSettingsRecord(
      {
        ...settings,
        lastCleanupAt: executedAt,
        lastCleanupSummary: {
          deletedByAge: expiredDeletedCount,
          deletedByQuota: quotaDeletedCount,
          freedBytes,
          skippedLegalHold: skippedLegalHoldCount,
          ranAt: executedAt,
        },
      },
      triggeredBy
    ).catch(() => {});

    await addPortalAuditLog({
      username: triggeredBy,
      userRole: triggeredBy === 'system' ? 'System Daemon' : 'Admin',
      action: trigger === 'manual' ? 'SESSION_RECORDING_MANUAL_CLEANUP' : 'SESSION_RECORDING_AUTO_CLEANUP',
      category: 'security',
      targetResource: 'session_recordings',
      details: `Session recording cleanup (${trigger}): purged ${deletedCount} recording(s) (${expiredDeletedCount} expired, ${quotaDeletedCount} over quota), freed ${(freedBytes / (1024 * 1024)).toFixed(2)} MB, preserved ${skippedLegalHoldCount} legal-hold record(s).`,
      status: 'success',
    }).catch(() => {});
  }

  return {
    deletedCount,
    expiredDeletedCount,
    quotaDeletedCount,
    skippedLegalHoldCount,
    freedBytes,
    remainingCount: finalRemaining.length,
    remainingBytes: totalBytes,
    executedAt,
  };
}

export function startSessionRecordingRetentionDaemon(projectRoot?: string): void {
  if (projectRoot) activeProjectRoot = projectRoot;
  if (retentionIntervalHandle) {
    clearInterval(retentionIntervalHandle);
    retentionIntervalHandle = null;
  }
  if (retentionBootTimeoutHandle) {
    clearTimeout(retentionBootTimeoutHandle);
    retentionBootTimeoutHandle = null;
  }

  const tick = async () => {
    try {
      const settings = await getEffectiveSessionRecordingSettings(activeProjectRoot);
      if (!settings.autoCleanupEnabled) return;
      const result = await runSessionRecordingCleanup(activeProjectRoot, 'scheduled', 'system');
      if (result.deletedCount > 0) {
        console.log(
          `[SessionRecording Retention] Purged ${result.deletedCount} recording(s), freed ${(result.freedBytes / (1024 * 1024)).toFixed(2)} MB.`
        );
      }
    } catch (err: any) {
      console.warn('[SessionRecording Retention] Scheduled tick warning:', err?.message || err);
    }
  };

  retentionBootTimeoutHandle = setTimeout(() => {
    tick().catch(() => {});
  }, 90 * 1000);

  retentionIntervalHandle = setInterval(() => {
    tick().catch(() => {});
  }, 60 * 60 * 1000);
}
