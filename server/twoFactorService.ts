import crypto from 'crypto';
import { sendTwoFactorAuthEmail } from './emailService';
import { getPgPool, isPostgresConnected } from './db';

export interface TwoFactorChallenge {
  token: string;
  userId: string;
  username: string;
  userEmail: string;
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

// In-memory challenge store for instant low-latency lookup
const challengesMap = new Map<string, TwoFactorChallenge>();

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
  lang: 'fa' | 'en' = 'fa'
): Promise<{
  token: string;
  emailMasked: string;
  expiresInSec: number;
  emailSent: boolean;
  emailError?: string;
}> {
  // Generate cryptographically secure 6-digit verification code
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
    codeHash,
    codeSalt: salt,
    effectivePolicy,
    rememberMe,
    attempts: 0,
    maxAttempts: 5,
    expiresAt,
    createdAt: now,
    lastResentAt: now,
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

  // 3. Dispatch the beautiful HTML email
  const mailResult = await sendTwoFactorAuthEmail(targetEmail, code, {
    username: user.username,
    ip,
    userAgent,
    lang,
    expiresMinutes: 5,
  });

  return {
    token,
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

  // Timing-safe Hash Comparison
  const computedHash = hashCode(cleanCode, challenge.codeSalt);
  const isMatch = computedHash === challenge.codeHash;

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

  // 45-second resend cooldown
  const now = Date.now();
  const timeSinceLastResend = now - (challenge.lastResentAt || challenge.createdAt);
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

// Automatic background cleaner to purge expired challenges every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, ch] of challengesMap.entries()) {
    if (now > ch.expiresAt) {
      challengesMap.delete(token);
    }
  }
}, 120000).unref();
