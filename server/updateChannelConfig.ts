import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { encryptServerSecret, decryptServerSecret } from './vaultCrypto';
import {
  getUpdateChannelConfigRecord,
  saveUpdateChannelConfigRecord,
  deleteUpdateChannelConfigRecord,
  StoredUpdateChannelRecord,
} from './db';

// Default internal upstream coordinate (used ONLY when installer supplies a key without an explicit URL).
// Never surfaced in UI, logs, API responses, or error messages.
const DEFAULT_UPSTREAM_ORIGIN = Buffer.from(
  'aHR0cHM6Ly9naXRodWIuY29tL3NoYWhiYXppbWFzb3VkL05ldC1NYW5hZ2VtZW50',
  'base64'
).toString('utf8');

const DEFAULT_BRANCH = 'master';

export interface ParsedUpstreamSource {
  owner: string;
  repo: string;
  cleanHttpsUrl: string;
  branch: string;
  token: string;
}

export interface ResolvedUpdateChannel {
  configured: boolean;
  source: 'key_file' | 'installer' | 'env' | 'none';
  owner: string;
  repo: string;
  cleanHttpsUrl: string;
  branch: string;
  token: string;
  keyFingerprint: string | null;
  filename?: string;
  configuredAt?: string | null;
  configuredBy?: string | null;
  verified: boolean;
  verifiedAt?: string | null;
}

export interface UpdateChannelStatusDto {
  configured: boolean;
  verified: boolean;
  source: 'key_file' | 'installer' | 'env' | 'none';
  filename: string | null;
  keyFingerprint: string | null;
  configuredAt: string | null;
  configuredBy: string | null;
  verifiedAt: string | null;
}

export interface VerifyChannelResult {
  valid: boolean;
  statusCode?: number;
  latestCommitSha?: string | null;
  latestVersion?: string | null;
  errorEn?: string;
  errorFa?: string;
}

export interface RemoteReleaseMetadata {
  ok: boolean;
  authRequired: boolean;
  statusCode?: number;
  latestVersion?: string | null;
  remoteCommitSha?: string | null;
  commitMessage?: string | null;
  releaseNote?: any;
  errorEn?: string;
  errorFa?: string;
}

export function computeKeyFingerprint(token: string): string {
  const hash = crypto.createHash('sha256').update(token.trim()).digest('hex').slice(0, 8).toUpperCase();
  return `KEY-${hash}`;
}

export function buildGitAuthExtraHeader(token: string): string {
  const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return `AUTHORIZATION: basic ${basic}`;
}

/**
 * Scrubs tokens, base64 auth headers, and upstream host/path strings from any log or error
 * before sending output to clients or writing update terminal logs.
 */
export function sanitizeUpdateText(input: string, secrets: Array<string | null | undefined> = []): string {
  let out = String(input || '');
  for (const secret of secrets) {
    const s = (secret || '').trim();
    if (!s || s.length < 4) continue;
    out = out.split(s).join('[REDACTED]');
    const b64 = Buffer.from(`x-access-token:${s}`, 'utf8').toString('base64');
    out = out.split(b64).join('[REDACTED]');
  }
  // Remove embedded auth credentials in URLs
  out = out.replace(/https?:\/\/[^/\s@]+@[^\s'"]+/gi, '[RELEASE_SERVER]');
  // Scrub upstream hostnames / org references
  out = out.replace(/https?:\/\/(api\.|raw\.|codeload\.)?github(usercontent)?\.com[^\s'"]*/gi, '[RELEASE_SERVER]');
  out = out.replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED]');
  out = out.replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[REDACTED]');
  out = out.replace(/AUTHORIZATION:\s*(basic|bearer|token)\s+[A-Za-z0-9+/=_.-]+/gi, 'AUTHORIZATION: [REDACTED]');
  out = out.replace(/shahbazimasoud\/Net-Management(\.git)?/gi, 'release-channel');
  out = out.replace(/shahbazimasoud/gi, 'release-channel');
  out = out.replace(/\bGitHub\b/gi, 'Release Server');
  return out;
}

/**
 * Extracts (owner, repo, branch, cleanHttpsUrl) and optional embedded token from a repository URL or owner/repo string.
 */
export function parseUpstreamUrl(rawUrl: string): {
  owner: string;
  repo: string;
  cleanHttpsUrl: string;
  branch?: string;
  embeddedToken?: string;
} | null {
  const trimmed = (rawUrl || '').trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  // Handle shorthand owner/repo (no protocol, single slash)
  const shortMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (shortMatch) {
    const owner = shortMatch[1];
    const repo = shortMatch[2];
    return {
      owner,
      repo,
      cleanHttpsUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  // Handle SSH form git@host:owner/repo.git
  const sshMatch = trimmed.match(/^git@[^:]+:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    return {
      owner,
      repo,
      cleanHttpsUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    let embeddedToken: string | undefined;
    if (parsed.password) {
      embeddedToken = decodeURIComponent(parsed.password);
    } else if (parsed.username && /^(gh[pousr]_|github_pat_)/i.test(parsed.username)) {
      embeddedToken = decodeURIComponent(parsed.username);
    }

    const segments = parsed.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);

    if (segments.length < 2) return null;

    // Support both /owner/repo and /repos/owner/repo
    let owner = segments[0];
    let repo = segments[1];
    let branch: string | undefined;

    if (owner === 'repos' && segments.length >= 3) {
      owner = segments[1];
      repo = segments[2];
    } else if (segments.length >= 4 && segments[2] === 'tree') {
      branch = segments[3];
    }

    repo = repo.replace(/\.git$/i, '');
    if (!owner || !repo) return null;

    return {
      owner,
      repo,
      cleanHttpsUrl: `https://${parsed.hostname.replace(/^(api|raw|codeload)\./i, '').replace(/githubusercontent\.com$/i, 'github.com')}/${owner}/${repo}.git`,
      branch,
      embeddedToken,
    };
  } catch {
    return null;
  }
}

function looksLikeUrl(line: string): boolean {
  const s = line.trim();
  return (
    /^https?:\/\//i.test(s) ||
    /^git@/i.test(s) ||
    /^[a-z0-9.-]+\.[a-z]{2,}\/[^/\s]+\/[^/\s]+/i.test(s) ||
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?$/.test(s)
  );
}

function looksLikeToken(line: string): boolean {
  const s = line.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^(github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)/i.test(s)) return true;
  if (s.length >= 16 && !s.includes('/') && !s.includes('://')) return true;
  return false;
}

/**
 * Parses uploaded .txt update authorization file into normalized upstream source + access key.
 * Supported formats:
 *   1. KEY=VALUE or KEY: VALUE lines (URL/REPO/SOURCE + TOKEN/KEY/SECRET + optional BRANCH)
 *   2. Plain 2-line .txt file (one line with source address, one line with access key — in any order)
 *   3. Single-line URL with embedded credentials
 *   4. JSON object { url, token, branch }
 *   5. Base64-encoded payload of any of the above
 */
export interface ParseUpdateKeyFileResult {
  ok: boolean;
  parsed?: ParsedUpstreamSource;
  errorEn?: string;
  errorFa?: string;
}

export function parseUpdateKeyFileContent(rawContent: string): ParseUpdateKeyFileResult {
  let content = String(rawContent || '').replace(/^\uFEFF/, '').trim();
  if (!content) {
    return {
      ok: false,
      errorEn: 'The uploaded key file is empty. Please upload a valid .txt update authorization file.',
      errorFa: 'فایل کلید بارگذاری‌شده خالی است. لطفاً یک فایل متنی (.txt) معتبر انتخاب کنید.',
    };
  }

  // Optional base64 wrapper support (single-line base64 encoding JSON or key/value lines)
  if (!content.includes('\n') && !content.includes('://') && /^[A-Za-z0-9+/=]{32,}$/.test(content)) {
    try {
      const decoded = Buffer.from(content, 'base64').toString('utf8').trim();
      if (decoded && (decoded.includes('://') || decoded.includes('{') || decoded.includes('\n'))) {
        content = decoded;
      }
    } catch {
      // treat as raw content
    }
  }

  let candidateUrl = '';
  let candidateToken = '';
  let candidateBranch = '';

  // 1. Try JSON payload
  if (content.startsWith('{') && content.endsWith('}')) {
    try {
      const obj = JSON.parse(content);
      candidateUrl = String(obj.url || obj.repoUrl || obj.repo_url || obj.repo || obj.repository || obj.source || obj.endpoint || obj.address || '').trim();
      candidateToken = String(obj.token || obj.key || obj.accessKey || obj.access_key || obj.licenseKey || obj.license_key || obj.secret || obj.pat || '').trim();
      candidateBranch = String(obj.branch || obj.ref || '').trim();
    } catch {
      // fall through to line parser
    }
  }

  // 2. Line-by-line parser (KEY=VALUE, KEY: VALUE, or plain lines)
  if (!candidateUrl || !candidateToken) {
    const rawLines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//') && !l.startsWith(';'));

    const unlabeledLines: string[] = [];

    for (const line of rawLines) {
      // Match KEY=VALUE or KEY: VALUE without falsely matching https://
      const kvMatch = !/^https?:\/\//i.test(line)
        ? line.match(/^([A-Za-z0-9_.\-\s]{2,32})\s*[:=]\s*(.+)$/)
        : null;

      if (kvMatch) {
        const key = kvMatch[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
        const val = kvMatch[2].trim().replace(/^["']|["']$/g, '');

        if (
          ['url', 'repo', 'repo_url', 'repository', 'source', 'source_url', 'update_url', 'endpoint', 'origin', 'address', 'server', 'host'].includes(key)
        ) {
          candidateUrl = candidateUrl || val;
          continue;
        }
        if (
          ['token', 'key', 'access_key', 'access_token', 'api_key', 'pat', 'secret', 'auth', 'auth_token', 'password', 'license_key', 'update_key', 'panel_key'].includes(key)
        ) {
          candidateToken = candidateToken || val;
          continue;
        }
        if (['branch', 'ref', 'channel'].includes(key)) {
          candidateBranch = candidateBranch || val;
          continue;
        }
      }

      unlabeledLines.push(line.replace(/^["']|["']$/g, ''));
    }

    // Assign remaining unlabeled lines intelligently
    for (const line of unlabeledLines) {
      if (!candidateUrl && looksLikeUrl(line)) {
        candidateUrl = line;
      } else if (!candidateToken && looksLikeToken(line)) {
        candidateToken = line;
      }
    }

    // Final positional pass for simple 2-line files
    if (!candidateToken && unlabeledLines.length >= 2) {
      for (const line of unlabeledLines) {
        if (line !== candidateUrl && !candidateToken) {
          candidateToken = line;
        }
      }
    }
  }

  // Check if URL itself has an embedded token
  const parsedUrl = candidateUrl ? parseUpstreamUrl(candidateUrl) : null;
  if (parsedUrl?.embeddedToken && !candidateToken) {
    candidateToken = parsedUrl.embeddedToken;
  }

  // If user provided ONLY a token inside the .txt file, fall back to default internal upstream coordinate
  const effectiveUrl = parsedUrl || (candidateToken ? parseUpstreamUrl(DEFAULT_UPSTREAM_ORIGIN) : null);

  if (!candidateToken) {
    return {
      ok: false,
      errorEn: 'Update authorization key could not be found in the uploaded file. Please include both the update source address and access key.',
      errorFa: 'کلید مجوز در فایل بارگذاری‌شده یافت نشد. لطفاً فایل متنی (.txt) حاوی آدرس منبع و کلید دسترسی را وارد کنید.',
    };
  }

  if (!effectiveUrl) {
    return {
      ok: false,
      errorEn: 'The update source address inside the key file is invalid. Please verify your .txt key file format.',
      errorFa: 'آدرس منبع به‌روزرسانی در فایل کلید نامعتبر است. لطفاً ساختار فایل متنی (.txt) را بررسی کنید.',
    };
  }

  return {
    ok: true,
    parsed: {
      owner: effectiveUrl.owner,
      repo: effectiveUrl.repo,
      cleanHttpsUrl: effectiveUrl.cleanHttpsUrl,
      branch: candidateBranch || effectiveUrl.branch || DEFAULT_BRANCH,
      token: candidateToken.trim(),
    },
  };
}

/**
 * Verifies live upstream authorization against the configured release channel without leaking details.
 */
export async function verifyUpdateChannelCredentials(
  creds: Pick<ParsedUpstreamSource, 'owner' | 'repo' | 'branch' | 'token'>,
  timeoutMs: number = 8000
): Promise<VerifyChannelResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const authHeaders: Record<string, string> = {
    'User-Agent': 'NetTopology-UpdateEngine/2.0',
    'Accept': 'application/vnd.github.v3+json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  };
  if (creds.token) {
    authHeaders['Authorization'] = `Bearer ${creds.token}`;
  }

  try {
    const commitUrl = `https://api.github.com/repos/${encodeURIComponent(creds.owner)}/${encodeURIComponent(creds.repo)}/commits/${encodeURIComponent(creds.branch || DEFAULT_BRANCH)}`;
    const commitRes = await fetch(commitUrl, {
      signal: controller.signal,
      headers: authHeaders,
    });

    if (commitRes.status === 401 || commitRes.status === 403 || commitRes.status === 404) {
      return {
        valid: false,
        statusCode: commitRes.status,
        errorEn: 'Authorization failed: the provided update key is invalid, expired, or lacks read permission for this release channel.',
        errorFa: 'احراز هویت ناموفق بود: کلید به‌روزرسانی واردشده نامعتبر یا منقضی است و یا مجوز دسترسی به کانال انتشار را ندارد.',
      };
    }

    if (!commitRes.ok) {
      return {
        valid: false,
        statusCode: commitRes.status,
        errorEn: `Release server returned unexpected status (HTTP ${commitRes.status}). Please retry shortly.`,
        errorFa: `سرور به‌روزرسانی پاسخ غیرمنتظره برگرداند (کد ${commitRes.status}). لطفاً کمی بعد مجدداً تلاش کنید.`,
      };
    }

    const commitJson: any = await commitRes.json().catch(() => null);
    const latestCommitSha = commitJson?.sha || null;

    // Also verify contents/package.json read access
    let latestVersion: string | null = null;
    try {
      const pkgUrl = `https://api.github.com/repos/${encodeURIComponent(creds.owner)}/${encodeURIComponent(creds.repo)}/contents/package.json?ref=${encodeURIComponent(creds.branch || DEFAULT_BRANCH)}`;
      const pkgRes = await fetch(pkgUrl, {
        signal: controller.signal,
        headers: {
          ...authHeaders,
          Accept: 'application/vnd.github.v3.raw',
        },
      });
      if (pkgRes.ok) {
        const pkgJson: any = await pkgRes.json().catch(() => null);
        if (pkgJson?.version) {
          latestVersion = String(pkgJson.version);
        }
      }
    } catch {
      // commit endpoint already succeeded
    }

    return {
      valid: true,
      statusCode: 200,
      latestCommitSha,
      latestVersion,
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      valid: false,
      errorEn: isAbort
        ? 'Connection to the release server timed out. Please verify server internet connectivity.'
        : 'Unable to reach the release server. Please check server outbound network connectivity.',
      errorFa: isAbort
        ? 'اتصال به سرور به‌روزرسانی با وقفه زمانی (Timeout) مواجه شد. لطفاً دسترسی اینترنت سرور را بررسی کنید.'
        : 'برقراری ارتباط با سرور به‌روزرسانی ممکن نشد. لطفاً اتصال شبکه خروجی سرور را بررسی کنید.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads an installer-provisioned key from env or root-protected key file.
 */
function readInstallerProvisionedKey(projectRoot: string): { token: string; rawUrl?: string } | null {
  const envKey = (process.env.PANEL_UPDATE_KEY || '').trim();
  const envUrl = (process.env.PANEL_UPDATE_SOURCE || '').trim();
  if (envKey) {
    return { token: envKey, rawUrl: envUrl || undefined };
  }

  const candidateFiles = [
    '/etc/nettopology-backup/.update_key',
    path.join(projectRoot, 'backend', 'security', '.update_key'),
  ];

  for (const filePath of candidateFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8').trim();
        if (!raw) continue;
        // File might contain either a plain single-line key OR a full key=value/2-line text
        if (raw.includes('\n') || raw.includes('://') || raw.includes('=')) {
          const parsed = parseUpdateKeyFileContent(raw);
          if (parsed.ok && parsed.parsed) {
            return { token: parsed.parsed.token, rawUrl: parsed.parsed.cleanHttpsUrl };
          }
        }
        const singleLine = raw.split(/\r?\n/)[0].trim();
        if (singleLine) {
          return { token: singleLine, rawUrl: envUrl || undefined };
        }
      }
    } catch {
      // ignore unreadable candidate
    }
  }
  return null;
}

/**
 * Resolves the active update channel credentials in memory on the backend ONLY.
 * Priority:
 *   1. Encrypted PostgreSQL / DB store record (uploaded via Update UI or auto-ingested)
 *   2. Installer-provisioned key (PANEL_UPDATE_KEY / /etc/nettopology-backup/.update_key) -> auto-encrypted into DB!
 *   3. Legacy environment variable (GITHUB_TOKEN / GITHUB_PAT)
 *   4. Unauthenticated default (works only if upstream is public)
 */
export async function resolveActiveUpdateChannel(projectRoot: string): Promise<ResolvedUpdateChannel> {
  const fallbackParsed = parseUpstreamUrl(DEFAULT_UPSTREAM_ORIGIN)!;

  // 1. Check encrypted DB record
  try {
    const stored = await getUpdateChannelConfigRecord();
    if (stored && stored.encryptedToken && stored.encryptedRepoUrl) {
      const decryptedUrl = decryptServerSecret(stored.encryptedRepoUrl);
      const decryptedToken = decryptServerSecret(stored.encryptedToken);
      const parsed = parseUpstreamUrl(decryptedUrl);
      if (parsed && decryptedToken) {
        return {
          configured: true,
          source: stored.source || 'key_file',
          owner: parsed.owner,
          repo: parsed.repo,
          cleanHttpsUrl: parsed.cleanHttpsUrl,
          branch: stored.branch || parsed.branch || DEFAULT_BRANCH,
          token: decryptedToken,
          keyFingerprint: stored.keyFingerprint || computeKeyFingerprint(decryptedToken),
          filename: stored.filename,
          configuredAt: stored.configuredAt || null,
          configuredBy: stored.configuredBy || null,
          verified: Boolean(stored.verified),
          verifiedAt: stored.verifiedAt || null,
        };
      }
    }
  } catch (err: any) {
    console.warn('[UpdateChannel] Failed to read encrypted DB config:', err?.message || err);
  }

  // 2. Check installer-provisioned key & auto-ingest encrypted into DB
  const installerKey = readInstallerProvisionedKey(projectRoot);
  if (installerKey?.token) {
    const parsed = (installerKey.rawUrl ? parseUpstreamUrl(installerKey.rawUrl) : null) || fallbackParsed;
    const nowIso = new Date().toISOString();
    const fingerprint = computeKeyFingerprint(installerKey.token);

    try {
      const newRecord: StoredUpdateChannelRecord = {
        encryptedRepoUrl: encryptServerSecret(parsed.cleanHttpsUrl),
        encryptedToken: encryptServerSecret(installerKey.token),
        branch: parsed.branch || DEFAULT_BRANCH,
        source: 'installer',
        filename: 'installer-key',
        keyFingerprint: fingerprint,
        verified: true,
        configuredAt: nowIso,
        configuredBy: 'installer',
        verifiedAt: nowIso,
      };
      await saveUpdateChannelConfigRecord(newRecord, 'installer');
    } catch {
      // still proceed in memory
    }

    return {
      configured: true,
      source: 'installer',
      owner: parsed.owner,
      repo: parsed.repo,
      cleanHttpsUrl: parsed.cleanHttpsUrl,
      branch: parsed.branch || DEFAULT_BRANCH,
      token: installerKey.token,
      keyFingerprint: fingerprint,
      filename: 'installer-key',
      configuredAt: nowIso,
      configuredBy: 'installer',
      verified: true,
      verifiedAt: nowIso,
    };
  }

  // 3. Legacy environment variable fallback
  const legacyEnvToken = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
  if (legacyEnvToken) {
    return {
      configured: true,
      source: 'env',
      owner: fallbackParsed.owner,
      repo: fallbackParsed.repo,
      cleanHttpsUrl: fallbackParsed.cleanHttpsUrl,
      branch: DEFAULT_BRANCH,
      token: legacyEnvToken,
      keyFingerprint: computeKeyFingerprint(legacyEnvToken),
      configuredAt: null,
      configuredBy: 'environment',
      verified: true,
      verifiedAt: null,
    };
  }

  // 4. Unconfigured (no key stored)
  return {
    configured: false,
    source: 'none',
    owner: fallbackParsed.owner,
    repo: fallbackParsed.repo,
    cleanHttpsUrl: fallbackParsed.cleanHttpsUrl,
    branch: DEFAULT_BRANCH,
    token: '',
    keyFingerprint: null,
    configuredAt: null,
    configuredBy: null,
    verified: false,
    verifiedAt: null,
  };
}

/**
 * Returns a strict zero-leak status DTO safe for sending to Super Admin frontend.
 */
export async function getUpdateChannelStatusDto(projectRoot: string): Promise<UpdateChannelStatusDto> {
  const active = await resolveActiveUpdateChannel(projectRoot);
  return {
    configured: active.configured,
    verified: active.verified,
    source: active.source,
    filename: active.filename || null,
    keyFingerprint: active.keyFingerprint,
    configuredAt: active.configuredAt || null,
    configuredBy: active.configuredBy || null,
    verifiedAt: active.verifiedAt || null,
  };
}

export interface ImportUpdateKeyFileResult {
  ok: boolean;
  statusCode?: number;
  status?: UpdateChannelStatusDto;
  latestVersion?: string | null;
  errorEn?: string;
  errorFa?: string;
}

/**
 * Parses, verifies live, encrypts (AES-256-GCM), and persists an uploaded .txt update key file.
 */
export async function importUpdateKeyFile(params: {
  content: string;
  filename?: string;
  updatedBy: string;
  projectRoot: string;
}): Promise<ImportUpdateKeyFileResult> {
  const parsedRes = parseUpdateKeyFileContent(params.content);
  if (!parsedRes.ok || !parsedRes.parsed) {
    return {
      ok: false,
      statusCode: 400,
      errorEn: parsedRes.errorEn || 'Invalid key file format.',
      errorFa: parsedRes.errorFa || 'قالب فایل کلید نامعتبر است.',
    };
  }

  const parsed = parsedRes.parsed;
  const verify = await verifyUpdateChannelCredentials(parsed);
  if (!verify.valid) {
    return {
      ok: false,
      statusCode: verify.statusCode === 401 || verify.statusCode === 403 || verify.statusCode === 404 ? 401 : 502,
      errorEn: verify.errorEn || 'Update authorization verification failed.',
      errorFa: verify.errorFa || 'اعتبارسنجی کلید به‌روزرسانی ناموفق بود.',
    };
  }

  const nowIso = new Date().toISOString();
  const safeFilename = (params.filename || 'update-key.txt')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 80);

  const record: StoredUpdateChannelRecord = {
    encryptedRepoUrl: encryptServerSecret(parsed.cleanHttpsUrl),
    encryptedToken: encryptServerSecret(parsed.token),
    branch: parsed.branch || DEFAULT_BRANCH,
    source: 'key_file',
    filename: safeFilename,
    keyFingerprint: computeKeyFingerprint(parsed.token),
    verified: true,
    configuredAt: nowIso,
    configuredBy: params.updatedBy || 'admin',
    verifiedAt: nowIso,
  };

  await saveUpdateChannelConfigRecord(record, params.updatedBy || 'admin');

  const status: UpdateChannelStatusDto = {
    configured: true,
    verified: true,
    source: 'key_file',
    filename: safeFilename,
    keyFingerprint: record.keyFingerprint,
    configuredAt: nowIso,
    configuredBy: record.configuredBy,
    verifiedAt: nowIso,
  };

  return {
    ok: true,
    status,
    latestVersion: verify.latestVersion || null,
  };
}

/**
 * Re-verifies the currently saved update channel credentials and updates verifiedAt.
 */
export async function reverifyActiveUpdateChannel(projectRoot: string, actor: string): Promise<{
  ok: boolean;
  status: UpdateChannelStatusDto;
  latestVersion?: string | null;
  errorEn?: string;
  errorFa?: string;
}> {
  const active = await resolveActiveUpdateChannel(projectRoot);
  if (!active.configured || !active.token) {
    return {
      ok: false,
      status: await getUpdateChannelStatusDto(projectRoot),
      errorEn: 'No update authorization key is configured yet. Please upload your .txt key file.',
      errorFa: 'هنوز کلید مجوز به‌روزرسانی ثبت نشده است. لطفاً فایل متنی (.txt) کلید را بارگذاری کنید.',
    };
  }

  const verify = await verifyUpdateChannelCredentials({
    owner: active.owner,
    repo: active.repo,
    branch: active.branch,
    token: active.token,
  });

  const stored = await getUpdateChannelConfigRecord();
  const nowIso = new Date().toISOString();
  if (stored) {
    await saveUpdateChannelConfigRecord(
      {
        ...stored,
        verified: verify.valid,
        verifiedAt: verify.valid ? nowIso : stored.verifiedAt || null,
      },
      actor
    );
  }

  const status = await getUpdateChannelStatusDto(projectRoot);
  return {
    ok: verify.valid,
    status,
    latestVersion: verify.latestVersion || null,
    errorEn: verify.errorEn,
    errorFa: verify.errorFa,
  };
}

/**
 * Clears the stored update channel configuration (DB record + optional installer key file).
 */
export async function clearUpdateChannelConfig(projectRoot: string): Promise<UpdateChannelStatusDto> {
  await deleteUpdateChannelConfigRecord();

  // Also clear installer-provisioned key file and env var in memory so removal is immediate
  if (process.env.PANEL_UPDATE_KEY) {
    delete process.env.PANEL_UPDATE_KEY;
  }
  const keyFiles = [
    '/etc/nettopology-backup/.update_key',
    path.join(projectRoot, 'backend', 'security', '.update_key'),
  ];
  for (const kf of keyFiles) {
    try {
      if (fs.existsSync(kf)) fs.unlinkSync(kf);
    } catch {
      // ignore if permission-restricted
    }
  }

  return getUpdateChannelStatusDto(projectRoot);
}

/**
 * Fetches latest commit SHA, package.json version, and src/version.ts release notes
 * using authenticated API endpoints (supports both private and public upstream sources).
 */
export async function fetchRemoteReleaseMetadata(
  channel: ResolvedUpdateChannel,
  timeoutMs: number = 9000
): Promise<RemoteReleaseMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const owner = encodeURIComponent(channel.owner);
  const repo = encodeURIComponent(channel.repo);
  const branch = encodeURIComponent(channel.branch || DEFAULT_BRANCH);
  const ts = Date.now();

  const jsonHeaders: Record<string, string> = {
    'User-Agent': 'NetTopology-UpdateEngine/2.0',
    'Accept': 'application/vnd.github.v3+json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  };
  const rawApiHeaders: Record<string, string> = {
    'User-Agent': 'NetTopology-UpdateEngine/2.0',
    'Accept': 'application/vnd.github.v3.raw',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  };

  if (channel.token) {
    jsonHeaders['Authorization'] = `Bearer ${channel.token}`;
    rawApiHeaders['Authorization'] = `Bearer ${channel.token}`;
  }

  let latestVersion: string | null = null;
  let remoteCommitSha: string | null = null;
  let commitMessage: string | null = null;
  let releaseNote: any = null;
  let authFailedStatus: number | null = null;

  try {
    // 1. Latest commit
    const commitPromise = fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
      { signal: controller.signal, headers: jsonHeaders }
    )
      .then(async (r) => {
        if (r.status === 401 || r.status === 403 || r.status === 404) {
          authFailedStatus = r.status;
          return;
        }
        if (r.ok) {
          const json: any = await r.json();
          if (json?.sha) {
            remoteCommitSha = String(json.sha);
            commitMessage = json.commit?.message?.split('\n')[0] || null;
          }
        }
      })
      .catch(() => {});

    // 2. package.json via authenticated Contents API (works on private repos!), with raw fallback
    const fetchPkg = async () => {
      const candidates: Array<{ url: string; headers: Record<string, string> }> = [
        {
          url: `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${branch}`,
          headers: rawApiHeaders,
        },
        {
          url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json?_t=${ts}`,
          headers: channel.token
            ? { Authorization: `Bearer ${channel.token}`, 'Cache-Control': 'no-cache' }
            : { 'Cache-Control': 'no-cache' },
        },
      ];

      for (const c of candidates) {
        try {
          const r = await fetch(c.url, { signal: controller.signal, headers: c.headers });
          if (r.status === 401 || r.status === 403 || r.status === 404) {
            if (!authFailedStatus) authFailedStatus = r.status;
            continue;
          }
          if (r.ok) {
            const data: any = await r.json();
            if (data?.version) {
              latestVersion = String(data.version);
              break;
            }
          }
        } catch {
          // try next
        }
      }
    };

    // 3. src/version.ts via authenticated Contents API
    const fetchVersionTs = async () => {
      const candidates: Array<{ url: string; headers: Record<string, string> }> = [
        {
          url: `https://api.github.com/repos/${owner}/${repo}/contents/src/version.ts?ref=${branch}`,
          headers: rawApiHeaders,
        },
        {
          url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/src/version.ts?_t=${ts}`,
          headers: channel.token
            ? { Authorization: `Bearer ${channel.token}`, 'Cache-Control': 'no-cache' }
            : { 'Cache-Control': 'no-cache' },
        },
      ];

      for (const c of candidates) {
        try {
          const r = await fetch(c.url, { signal: controller.signal, headers: c.headers });
          if (r.ok) {
            const tsText = await r.text();
            const vMatch = tsText.match(/version:\s*['"]([^'"]+)['"]/);
            const dMatch = tsText.match(/releaseDate:\s*['"]([^'"]+)['"]/);
            const tMatch = tsText.match(/type:\s*['"]([^'"]+)['"]/);
            const titleMatch = tsText.match(/title:\s*['"]([^'"]+)['"]/);
            const titleEnMatch = tsText.match(/title_en:\s*['"]([^'"]+)['"]/);
            const changesBlock = tsText.match(/changes:\s*\[([\s\S]*?)\]/);
            const changesEnBlock = tsText.match(/changes_en:\s*\[([\s\S]*?)\]/);

            const changes = changesBlock
              ? [...changesBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
              : [];
            const changes_en = changesEnBlock
              ? [...changesEnBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
              : [];

            const resolvedVer = vMatch?.[1] || latestVersion || '';
            releaseNote = {
              version: resolvedVer,
              releaseDate: dMatch?.[1] || new Date().toISOString().split('T')[0],
              type: tMatch?.[1] || 'patch',
              title: titleMatch?.[1] || `نگارش ${resolvedVer}`,
              title_en: titleEnMatch?.[1] || `Release v${resolvedVer}`,
              changes: changes.length > 0 ? changes : ['به‌روزرسانی و ارتقای کلی عملکرد سامانه'],
              changes_en: changes_en.length > 0 ? changes_en : ['System optimizations and feature enhancements'],
            };
            break;
          }
        } catch {
          // try next
        }
      }
    };

    await Promise.allSettled([commitPromise, fetchPkg(), fetchVersionTs()]);

    if (!latestVersion && !remoteCommitSha && authFailedStatus) {
      return {
        ok: false,
        authRequired: true,
        statusCode: authFailedStatus,
        errorEn: channel.configured
          ? 'The stored update authorization key was rejected or expired. Please upload a valid .txt update key file.'
          : 'An update authorization key file (.txt) is required to check and download updates from the release server.',
        errorFa: channel.configured
          ? 'کلید مجوز به‌روزرسانی ذخیره‌شده منقضی شده یا نامعتبر است. لطفاً فایل کلید (.txt) معتبر را بارگذاری کنید.'
          : 'برای بررسی و دریافت به‌روزرسانی از سرور انتشار، بارگذاری فایل کلید مجوز (.txt) الزامی است.',
      };
    }

    return {
      ok: Boolean(latestVersion || remoteCommitSha),
      authRequired: false,
      statusCode: 200,
      latestVersion,
      remoteCommitSha,
      commitMessage,
      releaseNote,
    };
  } catch (err: any) {
    return {
      ok: false,
      authRequired: false,
      errorEn: 'Unable to contact the release server. Please check server network connectivity.',
      errorFa: 'امکان برقراری ارتباط با سرور به‌روزرسانی وجود ندارد. لطفاً اتصال شبکه سرور را بررسی کنید.',
    };
  } finally {
    clearTimeout(timer);
  }
}
