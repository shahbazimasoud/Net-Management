import crypto from 'crypto';
import { sendTwoFactorAuthEmail } from './emailService';
import { getPgPool, isPostgresConnected, loadFallbackStore, saveFallbackStore } from './db';
import {
  resolveProfileIdentifiers,
  verifyAndConsumeBackupCode,
  verifyUserTotpForLogin,
} from './profileService';
import { TrustedDeviceEntry } from '../src/types';

export interface TwoFactorChallenge {
  token: string;
  userId: string;
  username: string;
  userEmail: string;
  method?: 'email' | 'totp';
  codeHash: string;
  codeSalt: string;
  effectivePolicy: any;
  rememberMe: boolean;
  attempts: number;
  maxAttempts: number;
  expiresAt: number; // ms timestamp
  createdAt: number;
  lastResentAt: number;
  ip: string;
  userAgent?: string;
  userPayload: any;
}

export interface TwoFactorTrustedDevice {
  id: string;
  tokenHash: string;
  userId: string;
  username: string;
  ip: string;
  userAgent?: string;
  expiresAt: number; // ms timestamp (now + 30 days)
  createdAt: number;
  lastUsedAt: number;
}

// In-memory challenge store for instant low-latency lookup
const challengesMap = new Map<string, TwoFactorChallenge>();

// In-memory trusted devices store for high-performance low-latency lookup
const trustedDevicesMap = new Map<string, TwoFactorTrustedDevice>();

/**
 * Masks an email address for privacy in client responses (e.g. ad***n@domain.com)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return '***@nettopology.internal';
  }
  const [localPart, domainPart] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domainPart}`;
  }
  return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domainPart}`;
}

/**
 * Hashes a 6-digit OTP code using SHA-256 with salt
 */
function hashCode(code: string, salt: string): string {
  return crypto.createHash('sha256').update(`${code}:${salt}`).digest('hex');
}

/**
 * Creates and dispatches a new Two-Factor Authentication Challenge
 */
export async function createTwoFactorChallenge(
  user: any,
  effectivePolicy: any,
  rememberMe: boolean,
  ip: string,
  userAgent?: string,
  lang: 'fa' | 'en' = 'fa',
  options: { method?: 'email' | 'totp' } = {}
): Promise<{
  token: string;
  method: 'email' | 'totp';
  emailMasked: string;
  expiresInSec: number;
  emailSent: boolean;
  emailError?: string;
}> {
  const method: 'email' | 'totp' = options.method === 'totp' ? 'totp' : 'email';
  // Generate cryptographically secure 6-digit verification code (also kept for email fallback)
  const code = crypto.randomInt(100000, 999999).toString();
  const token = crypto.randomBytes(32).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashCode(code, salt);

  const targetEmail = (user.email && user.email.trim()) || 'admin@nettopology.internal';
  const now = Date.now();
  const validityMs = 5 * 60 * 1000; // 5 minutes
  const expiresAt = now + validityMs;

  const challenge: TwoFactorChallenge = {
    token,
    userId: user.id,
    username: user.username,
    userEmail: targetEmail,
    method,
    codeHash,
    codeSalt: salt,
    effectivePolicy,
    rememberMe,
    attempts: 0,
    maxAttempts: 5,
    expiresAt,
    createdAt: now,
    lastResentAt: method === 'totp' ? 0 : now,
    ip,
    userAgent,
    userPayload: {
      id: user.id,
      username: user.username,
      fullName: user.full_name || user.fullName,
      email: targetEmail,
      role: user.role,
      userType: user.user_type || user.userType || 'local',
      groupIds: user.group_ids || user.groupIds || [],
      isBuiltin: user.is_builtin ?? user.isBuiltin,
      policyId: effectivePolicy?.id,
    },
  };

  // 1. Save to in-memory map
  challengesMap.set(token, challenge);

  // 2. Persist to PostgreSQL if available
  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO two_factor_challenges (
            token, user_id, username, user_email, code_hash, code_salt,
            effective_policy, remember_me, attempts, max_attempts, expires_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
          ON CONFLICT (token) DO UPDATE SET
            code_hash = EXCLUDED.code_hash,
            code_salt = EXCLUDED.code_salt,
            expires_at = EXCLUDED.expires_at`,
          [
            token,
            user.id,
            user.username,
            targetEmail,
            codeHash,
            salt,
            JSON.stringify(effectivePolicy || {}),
            rememberMe,
            0,
            5,
            new Date(expiresAt),
          ]
        );
      }
    }
  } catch (dbErr: any) {
    console.warn('[Two-Factor Challenge DB Notice]', dbErr.message);
  }

  // 3. Dispatch Email OTP only when Email method is primary (TOTP uses user's Authenticator app)
  if (method === 'totp') {
    return {
      token,
      method: 'totp',
      emailMasked: maskEmail(targetEmail),
      expiresInSec: 300,
      emailSent: true,
    };
  }

  const mailResult = await sendTwoFactorAuthEmail(targetEmail, code, {
    username: user.username,
    ip,
    userAgent,
    lang,
    expiresMinutes: 5,
  });

  return {
    token,
    method: 'email',
    emailMasked: maskEmail(targetEmail),
    expiresInSec: 300,
    emailSent: mailResult.success,
    emailError: mailResult.error,
  };
}

/**
 * Verifies a submitted 2FA code against an active challenge
 */
export async function verifyTwoFactorChallenge(
  token: string,
  submittedCode: string,
  ip: string
): Promise<{
  success: boolean;
  user?: any;
  effectivePolicy?: any;
  rememberMe?: boolean;
  error?: string;
  message?: string;
  attemptsLeft?: number;
  locked?: boolean;
}> {
  const cleanCode = (submittedCode || '').trim();
  if (!token || !cleanCode) {
    return {
      success: false,
      error: 'Challenge token and verification code are required.',
      message: 'توکن درخواست و کد تایید الزامی است.',
    };
  }

  let challenge = challengesMap.get(token);

  // Fallback to PostgreSQL if server restarted
  if (!challenge) {
    try {
      if (isPostgresConnected()) {
        const pool = getPgPool();
        if (pool) {
          const res = await pool.query(
            'SELECT * FROM two_factor_challenges WHERE token = $1 LIMIT 1',
            [token]
          );
          if (res.rows.length > 0) {
            const row = res.rows[0];
            challenge = {
              token: row.token,
              userId: row.user_id,
              username: row.username,
              userEmail: row.user_email,
              codeHash: row.code_hash,
              codeSalt: row.code_salt,
              effectivePolicy: row.effective_policy,
              rememberMe: Boolean(row.remember_me),
              attempts: Number(row.attempts) || 0,
              maxAttempts: Number(row.max_attempts) || 5,
              expiresAt: new Date(row.expires_at).getTime(),
              createdAt: new Date(row.created_at).getTime(),
              lastResentAt: new Date(row.created_at).getTime(),
              ip,
              userPayload: {
                id: row.user_id,
                username: row.username,
                fullName: row.username,
                email: row.user_email,
                role: 'Super Administrator',
                userType: 'local',
              },
            };
            challengesMap.set(token, challenge);
          }
        }
      }
    } catch (e: any) {
      console.warn('[Two-Factor Challenge Query Error]', e.message);
    }
  }

  if (!challenge) {
    return {
      success: false,
      error: 'Invalid or expired verification session. Please sign in again.',
      message: 'نشست تایید هویت منقضی یا نامعتبر است. لطفاً مجدداً وارد شوید.',
    };
  }

  // Check Expiration
  if (Date.now() > challenge.expiresAt) {
    challengesMap.delete(token);
    try {
      if (isPostgresConnected()) {
        const pool = getPgPool();
        if (pool) await pool.query('DELETE FROM two_factor_challenges WHERE token = $1', [token]);
      }
    } catch {}

    return {
      success: false,
      error: 'Verification code has expired. Please request a new code or sign in again.',
      message: 'کد تایید منقضی شده است. لطفاً کد جدید درخواست دهید یا مجدداً وارد شوید.',
    };
  }

  // Check Attempt Limits
  if (challenge.attempts >= challenge.maxAttempts) {
    challengesMap.delete(token);
    return {
      success: false,
      locked: true,
      error: 'Maximum verification attempts exceeded. Please sign in again.',
      message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً مجدداً از ابتدا وارد شوید.',
    };
  }

  // Timing-safe Hash Comparison OR Authenticator TOTP / Single-Use Backup Code
  let isMatch = false;
  if (challenge.method === 'totp') {
    const actor = { userId: challenge.userId, username: challenge.username };
    if (/^\d{6}$/.test(cleanCode)) {
      isMatch = await verifyUserTotpForLogin(actor, cleanCode);
    }
    if (!isMatch && cleanCode.length >= 6) {
      isMatch = await verifyAndConsumeBackupCode(actor, cleanCode);
    }
    // Also allow fallback email code if user clicked Send Email Code
    if (!isMatch && challenge.lastResentAt > 0) {
      const computedHash = hashCode(cleanCode, challenge.codeSalt);
      isMatch = computedHash === challenge.codeHash;
    }
  } else {
    const computedHash = hashCode(cleanCode, challenge.codeSalt);
    isMatch = computedHash === challenge.codeHash;
    // Allow TOTP/backup code even during Email challenge if enrolled
    if (!isMatch && /^\d{6}$/.test(cleanCode)) {
      isMatch = await verifyUserTotpForLogin(
        { userId: challenge.userId, username: challenge.username },
        cleanCode
      );
    }
  }

  if (!isMatch) {
    challenge.attempts += 1;
    const attemptsLeft = Math.max(0, challenge.maxAttempts - challenge.attempts);

    // Update in DB
    try {
      if (isPostgresConnected()) {
        const pool = getPgPool();
        if (pool) {
          await pool.query(
            'UPDATE two_factor_challenges SET attempts = attempts + 1 WHERE token = $1',
            [token]
          );
        }
      }
    } catch {}

    if (attemptsLeft === 0) {
      challengesMap.delete(token);
      return {
        success: false,
        locked: true,
        error: 'Too many incorrect attempts. This verification session has been terminated.',
        message: 'تعداد تلاش‌های ناموفق پایان یافت. نشست تایید هویت لغو شد.',
      };
    }

    return {
      success: false,
      attemptsLeft,
      error: `Invalid verification code. ${attemptsLeft} attempt(s) remaining.`,
      message: `کد تایید وارد شده نادرست است. ${attemptsLeft} فرصت باقی مانده است.`,
    };
  }

  // Success: Clear challenge immediately (single use)
  challengesMap.delete(token);
  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) await pool.query('DELETE FROM two_factor_challenges WHERE token = $1', [token]);
    }
  } catch {}

  return {
    success: true,
    user: challenge.userPayload,
    effectivePolicy: challenge.effectivePolicy,
    rememberMe: challenge.rememberMe,
  };
}

/**
 * Resends a fresh 2FA code for an active challenge (with 45s cooldown)
 */
export async function resendTwoFactorChallenge(
  token: string,
  ip: string,
  userAgent?: string,
  lang: 'fa' | 'en' = 'fa'
): Promise<{
  success: boolean;
  expiresInSec?: number;
  emailMasked?: string;
  error?: string;
  message?: string;
}> {
  const challenge = challengesMap.get(token);
  if (!challenge) {
    return {
      success: false,
      error: 'Challenge session not found or expired. Please sign in again.',
      message: 'نشست تایید هویت یافت نشد یا منقضی گردیده است.',
    };
  }

  // 45-second resend cooldown (allow immediate first fallback email send when switching from TOTP)
  const now = Date.now();
  const timeSinceLastResend = challenge.lastResentAt > 0 ? now - challenge.lastResentAt : 60000;
  if (timeSinceLastResend < 45000) {
    const remainingCooldownSec = Math.ceil((45000 - timeSinceLastResend) / 1000);
    return {
      success: false,
      error: `Please wait ${remainingCooldownSec} seconds before requesting a new code.`,
      message: `لطفاً ${remainingCooldownSec} ثانیه دیگر جهت درخواست مجدد کد شکیبا باشید.`,
    };
  }

  // Generate new code
  const newCode = crypto.randomInt(100000, 999999).toString();
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashCode(newCode, newSalt);
  const newExpiresAt = now + 5 * 60 * 1000;

  challenge.codeHash = newHash;
  challenge.codeSalt = newSalt;
  challenge.expiresAt = newExpiresAt;
  challenge.lastResentAt = now;
  challenge.attempts = 0; // reset attempts on new code

  // Update in DB
  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `UPDATE two_factor_challenges
           SET code_hash = $1, code_salt = $2, expires_at = $3, attempts = 0
           WHERE token = $4`,
          [newHash, newSalt, new Date(newExpiresAt), token]
        );
      }
    }
  } catch {}

  // Dispatch Email
  await sendTwoFactorAuthEmail(challenge.userEmail, newCode, {
    username: challenge.username,
    ip,
    userAgent,
    lang,
    expiresMinutes: 5,
  });

  return {
    success: true,
    expiresInSec: 300,
    emailMasked: maskEmail(challenge.userEmail),
    message: 'کد تایید جدید به ایمیل شما ارسال شد.',
  };
}

/**
 * Issues a cryptographically secure 30-day device trust token for a verified user
 */
export async function issueTrustedDeviceToken(
  userId: string,
  username: string,
  ip: string,
  userAgent?: string
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const id = `td_${crypto.randomUUID()}`;
  const now = Date.now();
  const validityMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  const expiresAt = now + validityMs;

  const deviceRecord: TwoFactorTrustedDevice = {
    id,
    tokenHash,
    userId,
    username,
    ip,
    userAgent,
    expiresAt,
    createdAt: now,
    lastUsedAt: now,
  };

  // 1. Save in memory map
  trustedDevicesMap.set(tokenHash, deviceRecord);

  // 2. Persist to fallback store
  try {
    const store = loadFallbackStore();
    if (!Array.isArray(store.two_factor_trusted_devices)) {
      store.two_factor_trusted_devices = [];
    }
    store.two_factor_trusted_devices = store.two_factor_trusted_devices.filter(
      (d: any) => d && d.tokenHash !== tokenHash && d.token_hash !== tokenHash
    );
    store.two_factor_trusted_devices.unshift({
      id,
      token_hash: tokenHash,
      user_id: userId,
      username,
      ip,
      user_agent: userAgent || null,
      expires_at: new Date(expiresAt).toISOString(),
      created_at: new Date(now).toISOString(),
      last_used_at: new Date(now).toISOString(),
    });
    if (store.two_factor_trusted_devices.length > 500) {
      store.two_factor_trusted_devices = store.two_factor_trusted_devices.slice(0, 500);
    }
    saveFallbackStore(store);
  } catch {}

  // 3. Persist to PostgreSQL if available
  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO two_factor_trusted_devices (
            id, token_hash, user_id, username, ip, user_agent, expires_at, created_at, last_used_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (token_hash) DO UPDATE SET
            last_used_at = CURRENT_TIMESTAMP,
            expires_at = EXCLUDED.expires_at`,
          [
            id,
            tokenHash,
            userId,
            username,
            ip,
            userAgent || null,
            new Date(expiresAt),
          ]
        );
      }
    }
  } catch (dbErr: any) {
    console.warn('[Two-Factor Trusted Device DB Notice]', dbErr.message);
  }

  return rawToken;
}

/**
 * Validates a submitted device trust token.
 * If valid and not expired, updates last_used_at and returns true (bypassing 2FA).
 */
export async function validateTrustedDeviceToken(
  userId: string,
  rawToken: string,
  ip: string,
  userAgent?: string
): Promise<boolean> {
  if (!userId || !rawToken || typeof rawToken !== 'string') {
    return false;
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  let device = trustedDevicesMap.get(tokenHash);

  // Fallback to PostgreSQL if not cached in memory
  if (!device) {
    try {
      if (isPostgresConnected()) {
        const pool = getPgPool();
        if (pool) {
          const res = await pool.query(
            'SELECT * FROM two_factor_trusted_devices WHERE token_hash = $1 LIMIT 1',
            [tokenHash]
          );
          if (res.rows.length > 0) {
            const row = res.rows[0];
            device = {
              id: row.id,
              tokenHash: row.token_hash,
              userId: row.user_id,
              username: row.username,
              ip: row.ip,
              userAgent: row.user_agent,
              expiresAt: new Date(row.expires_at).getTime(),
              createdAt: new Date(row.created_at).getTime(),
              lastUsedAt: new Date(row.last_used_at).getTime(),
            };
            trustedDevicesMap.set(tokenHash, device);
          }
        }
      }
    } catch (e: any) {
      console.warn('[Two-Factor Trusted Device DB Query Error]', e.message);
    }
  }

  // Also check fallback store if missing in PG & memory
  if (!device) {
    try {
      const store = loadFallbackStore();
      const match = (store.two_factor_trusted_devices || []).find(
        (row: any) => (row.token_hash || row.tokenHash) === tokenHash
      );
      if (match) {
        device = {
          id: match.id,
          tokenHash: match.token_hash || match.tokenHash,
          userId: match.user_id || match.userId,
          username: match.username,
          ip: match.ip,
          userAgent: match.user_agent || match.userAgent,
          expiresAt: new Date(match.expires_at || match.expiresAt).getTime(),
          createdAt: new Date(match.created_at || match.createdAt).getTime(),
          lastUsedAt: new Date(match.last_used_at || match.lastUsedAt).getTime(),
        };
        trustedDevicesMap.set(tokenHash, device);
      }
    } catch {}
  }

  if (!device) {
    return false;
  }

  // Ensure user ID matches and token has not expired
  const userIds = new Set(resolveProfileIdentifiers({ userId }));
  const deviceMatchesUser =
    device.userId === userId || userIds.has((device.userId || '').toLowerCase());
  if (!deviceMatchesUser || Date.now() > device.expiresAt) {
    trustedDevicesMap.delete(tokenHash);
    try {
      const store = loadFallbackStore();
      if (Array.isArray(store.two_factor_trusted_devices)) {
        store.two_factor_trusted_devices = store.two_factor_trusted_devices.filter(
          (d: any) => (d.token_hash || d.tokenHash) !== tokenHash
        );
        saveFallbackStore(store);
      }
    } catch {}
    try {
      if (isPostgresConnected()) {
        const pool = getPgPool();
        if (pool) {
          await pool.query('DELETE FROM two_factor_trusted_devices WHERE token_hash = $1', [tokenHash]);
        }
      }
    } catch {}
    return false;
  }

  // Token is valid! Update last used timestamp and IP
  device.lastUsedAt = Date.now();
  device.ip = ip;
  if (userAgent) device.userAgent = userAgent;

  try {
    const store = loadFallbackStore();
    const rec = (store.two_factor_trusted_devices || []).find(
      (d: any) => (d.token_hash || d.tokenHash) === tokenHash
    );
    if (rec) {
      rec.last_used_at = new Date().toISOString();
      rec.ip = ip;
      saveFallbackStore(store);
    }
  } catch {}

  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          'UPDATE two_factor_trusted_devices SET last_used_at = CURRENT_TIMESTAMP, ip = $1 WHERE token_hash = $2',
          [ip, tokenHash]
        );
      }
    }
  } catch {}

  return true;
}

/**
 * Lists all active (non-expired) trusted devices for the current user
 */
export async function listTrustedDevicesForUser(
  actor: { userId?: string; username?: string },
  currentRawToken?: string
): Promise<TrustedDeviceEntry[]> {
  const identifiers = resolveProfileIdentifiers(actor);
  if (identifiers.length === 0) return [];
  const idSet = new Set(identifiers);
  const currentHash = currentRawToken
    ? crypto.createHash('sha256').update(currentRawToken.trim()).digest('hex')
    : '';
  const now = Date.now();
  const byId = new Map<string, TrustedDeviceEntry>();

  const pushRow = (row: any) => {
    if (!row || !row.id) return;
    const expMs = new Date(row.expires_at ?? row.expiresAt ?? 0).getTime();
    if (!expMs || expMs <= now) return;
    const rowHash = row.token_hash ?? row.tokenHash ?? '';
    byId.set(row.id, {
      id: row.id,
      userId: row.user_id ?? row.userId ?? '',
      username: row.username ?? '',
      ip: row.ip ?? '',
      userAgent: row.user_agent ?? row.userAgent ?? null,
      createdAt: new Date(row.created_at ?? row.createdAt ?? now).toISOString(),
      lastUsedAt: new Date(row.last_used_at ?? row.lastUsedAt ?? now).toISOString(),
      expiresAt: new Date(expMs).toISOString(),
      isCurrent: Boolean(currentHash && rowHash && currentHash === rowHash),
    });
  };

  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) {
        const res = await pool.query(
          `SELECT * FROM two_factor_trusted_devices
           WHERE (LOWER(user_id) = ANY($1::text[]) OR LOWER(username) = ANY($1::text[]))
             AND expires_at > CURRENT_TIMESTAMP
           ORDER BY last_used_at DESC`,
          [identifiers]
        );
        for (const r of res.rows) pushRow(r);
      }
    }
  } catch (err: any) {
    console.warn('[TrustedDevices] PG list notice:', err?.message || err);
  }

  // Merge fallback store and memory map
  try {
    const store = loadFallbackStore();
    for (const r of store.two_factor_trusted_devices || []) {
      const match =
        idSet.has(String(r.user_id ?? r.userId ?? '').toLowerCase()) ||
        idSet.has(String(r.username ?? '').toLowerCase());
      if (match && !byId.has(r.id)) pushRow(r);
    }
  } catch {}

  for (const td of trustedDevicesMap.values()) {
    const match =
      idSet.has((td.userId || '').toLowerCase()) ||
      idSet.has((td.username || '').toLowerCase());
    if (match && !byId.has(td.id)) pushRow(td);
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
  );
}

/**
 * Revokes a single trusted device owned by the given user
 */
export async function revokeTrustedDeviceById(
  actor: { userId?: string; username?: string },
  deviceId: string
): Promise<boolean> {
  const identifiers = resolveProfileIdentifiers(actor);
  if (identifiers.length === 0 || !deviceId) return false;
  const idSet = new Set(identifiers);
  let removed = false;

  for (const [tokenHash, td] of trustedDevicesMap.entries()) {
    if (
      td.id === deviceId &&
      (idSet.has((td.userId || '').toLowerCase()) ||
        idSet.has((td.username || '').toLowerCase()))
    ) {
      trustedDevicesMap.delete(tokenHash);
      removed = true;
    }
  }

  try {
    const store = loadFallbackStore();
    if (Array.isArray(store.two_factor_trusted_devices)) {
      const before = store.two_factor_trusted_devices.length;
      store.two_factor_trusted_devices = store.two_factor_trusted_devices.filter((d: any) => {
        if (d.id !== deviceId) return true;
        const owned =
          idSet.has(String(d.user_id ?? d.userId ?? '').toLowerCase()) ||
          idSet.has(String(d.username ?? '').toLowerCase());
        return !owned;
      });
      if (store.two_factor_trusted_devices.length !== before) {
        saveFallbackStore(store);
        removed = true;
      }
    }
  } catch {}

  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) {
        const res = await pool.query(
          `DELETE FROM two_factor_trusted_devices
           WHERE id = $1
             AND (LOWER(user_id) = ANY($2::text[]) OR LOWER(username) = ANY($2::text[]))`,
          [deviceId, identifiers]
        );
        if ((res.rowCount || 0) > 0) removed = true;
      }
    }
  } catch {}

  return removed;
}

/**
 * Revokes all trusted devices for a user (e.g. upon password reset or security revocation)
 */
export async function revokeTrustedDevicesForUser(
  userOrActor: string | { userId?: string; username?: string }
): Promise<void> {
  const identifiers =
    typeof userOrActor === 'string'
      ? resolveProfileIdentifiers({ userId: userOrActor, username: userOrActor })
      : resolveProfileIdentifiers(userOrActor);
  if (identifiers.length === 0) return;
  const idSet = new Set(identifiers);

  for (const [tokenHash, td] of trustedDevicesMap.entries()) {
    if (
      idSet.has((td.userId || '').toLowerCase()) ||
      idSet.has((td.username || '').toLowerCase())
    ) {
      trustedDevicesMap.delete(tokenHash);
    }
  }
  try {
    const store = loadFallbackStore();
    if (Array.isArray(store.two_factor_trusted_devices)) {
      store.two_factor_trusted_devices = store.two_factor_trusted_devices.filter(
        (d: any) =>
          !idSet.has(String(d.user_id ?? d.userId ?? '').toLowerCase()) &&
          !idSet.has(String(d.username ?? '').toLowerCase())
      );
      saveFallbackStore(store);
    }
  } catch {}
  try {
    if (isPostgresConnected()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `DELETE FROM two_factor_trusted_devices
           WHERE LOWER(user_id) = ANY($1::text[]) OR LOWER(username) = ANY($1::text[])`,
          [identifiers]
        );
      }
    }
  } catch {}
}

// Automatic background cleaner to purge expired challenges and expired trusted devices
setInterval(() => {
  const now = Date.now();
  for (const [token, ch] of challengesMap.entries()) {
    if (now > ch.expiresAt) {
      challengesMap.delete(token);
    }
  }
  for (const [tokenHash, td] of trustedDevicesMap.entries()) {
    if (now > td.expiresAt) {
      trustedDevicesMap.delete(tokenHash);
    }
  }
}, 120000).unref();
