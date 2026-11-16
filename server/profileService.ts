import crypto from 'crypto';
import QRCode from 'qrcode';
import {
  addPortalAuditLog,
  ensurePostgresConnection,
  findUserById,
  findUserByUsername,
  getGeneralSettings,
  getPgPool,
  isPostgresConnected,
  loadFallbackStore,
  saveFallbackStore,
  saveUser,
} from './db';
import { verifyPassword } from './auth';
import { decryptServerSecret, encryptServerSecret } from './vaultCrypto';
import {
  CommsCategory,
  CommsSeverity,
  TotpEnrollmentPayload,
  TwoFactorMethod,
  UserNotifyChannelPrefs,
  UserQuietHours,
  UserSecurityProfile,
} from '../src/types';

export interface ProfileActor {
  userId: string;
  username: string;
  fullName?: string;
  email?: string;
  role?: string;
  userType?: 'local' | 'ad' | string;
}

interface HashedBackupCodeRecord {
  id: string;
  salt: string;
  hash: string;
}

interface StoredSecurityProfileRow {
  user_id: string;
  username: string;
  display_title: string | null;
  phone_ext: string | null;
  preferred_2fa_method: TwoFactorMethod;
  totp_secret_enc: string | null;
  totp_verified: boolean;
  backup_codes_hash: HashedBackupCodeRecord[];
  notify_channels: UserNotifyChannelPrefs;
  quiet_hours: UserQuietHours;
  updated_at: string;
}

export const DEFAULT_NOTIFY_CHANNELS: UserNotifyChannelPrefs = {
  system_alert: true,
  security_2fa: true,
  direct_message: true,
  channel_message: true,
  announcement: true,
  approval_request: true,
  desktop_sound: true,
};

export const DEFAULT_QUIET_HOURS: UserQuietHours = {
  enabled: false,
  startHour: '22:00',
  endHour: '07:00',
  timezone: 'Asia/Tehran',
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function resolveProfileIdentifiers(actor: Partial<ProfileActor> | null | undefined): string[] {
  const ids = new Set<string>();
  const add = (val?: string | null) => {
    if (!val || typeof val !== 'string') return;
    const trimmed = val.trim().toLowerCase();
    if (!trimmed) return;
    ids.add(trimmed);
    if (trimmed.includes('@')) {
      ids.add(trimmed.split('@')[0]);
    }
    if (trimmed.includes('\\')) {
      const parts = trimmed.split('\\');
      if (parts[1]) ids.add(parts[1]);
    }
  };
  if (actor) {
    add(actor.userId);
    add((actor as any).id);
    add(actor.username);
  }
  return Array.from(ids);
}

// ============================================================================
// RFC 4648 Base32 + RFC 6238 TOTP & Recovery Backup Codes
// ============================================================================

export function generateBase32Secret(byteLength = 20): string {
  const buf = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(base32: string): Buffer {
  const cleaned = (base32 || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function computeHotp(secretBuf: Buffer, counter: number, digits = 6): string {
  const counterBuf = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
}

export function verifyTotpCode(secretBase32: string, submittedCode: string, windowSteps = 1): boolean {
  const clean = (submittedCode || '').replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(clean) || !secretBase32) return false;
  const secretBuf = decodeBase32(secretBase32);
  if (secretBuf.length < 10) return false;

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  const submittedBuf = Buffer.from(clean, 'utf8');

  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const expected = computeHotp(secretBuf, currentStep + delta, 6);
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (
      expectedBuf.length === submittedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, submittedBuf)
    ) {
      return true;
    }
  }
  return false;
}

function normalizeBackupCode(code: string): string {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashBackupCode(normalizedCode: string, salt?: string): { salt: string; hash: string } {
  const useSalt = salt || crypto.randomBytes(12).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${normalizedCode}:${useSalt}`)
    .digest('hex');
  return { salt: useSalt, hash };
}

function generateBackupCodesSet(count = 8): {
  plaintextCodes: string[];
  hashedRecords: HashedBackupCodeRecord[];
} {
  const plaintextCodes: string[] = [];
  const hashedRecords: HashedBackupCodeRecord[] = [];
  const charsLen = BACKUP_CODE_CHARS.length;

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += BACKUP_CODE_CHARS[bytes[j] % charsLen];
    }
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    const { salt, hash } = hashBackupCode(raw);
    plaintextCodes.push(formatted);
    hashedRecords.push({
      id: `bk_${crypto.randomBytes(4).toString('hex')}`,
      salt,
      hash,
    });
  }
  return { plaintextCodes, hashedRecords };
}

// ============================================================================
// Dual-Persistence Helpers (PostgreSQL + Fallback JSON Store)
// ============================================================================

function normalizeNotifyChannels(raw: any): UserNotifyChannelPrefs {
  const parsed =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })()
      : raw || {};
  return {
    system_alert: parsed.system_alert !== undefined ? Boolean(parsed.system_alert) : DEFAULT_NOTIFY_CHANNELS.system_alert,
    security_2fa: parsed.security_2fa !== undefined ? Boolean(parsed.security_2fa) : DEFAULT_NOTIFY_CHANNELS.security_2fa,
    direct_message: parsed.direct_message !== undefined ? Boolean(parsed.direct_message) : DEFAULT_NOTIFY_CHANNELS.direct_message,
    channel_message: parsed.channel_message !== undefined ? Boolean(parsed.channel_message) : DEFAULT_NOTIFY_CHANNELS.channel_message,
    announcement: parsed.announcement !== undefined ? Boolean(parsed.announcement) : DEFAULT_NOTIFY_CHANNELS.announcement,
    approval_request: parsed.approval_request !== undefined ? Boolean(parsed.approval_request) : DEFAULT_NOTIFY_CHANNELS.approval_request,
    desktop_sound: parsed.desktop_sound !== undefined ? Boolean(parsed.desktop_sound) : DEFAULT_NOTIFY_CHANNELS.desktop_sound,
  };
}

function normalizeQuietHours(raw: any): UserQuietHours {
  const parsed =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })()
      : raw || {};
  const hourRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return {
    enabled: Boolean(parsed.enabled),
    startHour: typeof parsed.startHour === 'string' && hourRegex.test(parsed.startHour)
      ? parsed.startHour
      : DEFAULT_QUIET_HOURS.startHour,
    endHour: typeof parsed.endHour === 'string' && hourRegex.test(parsed.endHour)
      ? parsed.endHour
      : DEFAULT_QUIET_HOURS.endHour,
    timezone: typeof parsed.timezone === 'string' && parsed.timezone.trim()
      ? parsed.timezone.trim()
      : DEFAULT_QUIET_HOURS.timezone,
  };
}

function normalizeBackupHashes(raw: any): HashedBackupCodeRecord[] {
  const parsed =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        })()
      : raw;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x) => x && typeof x.hash === 'string' && typeof x.salt === 'string');
}

function mapRawRow(row: any, fallbackActor?: Partial<ProfileActor>): StoredSecurityProfileRow {
  const methodRaw = String(row?.preferred_2fa_method || 'none').toLowerCase();
  const method: TwoFactorMethod =
    methodRaw === 'totp' || methodRaw === 'email' ? methodRaw : 'none';
  return {
    user_id: row?.user_id || fallbackActor?.userId || '',
    username: row?.username || fallbackActor?.username || '',
    display_title: row?.display_title ?? null,
    phone_ext: row?.phone_ext ?? null,
    preferred_2fa_method: method,
    totp_secret_enc: row?.totp_secret_enc ?? null,
    totp_verified: Boolean(row?.totp_verified),
    backup_codes_hash: normalizeBackupHashes(row?.backup_codes_hash),
    notify_channels: normalizeNotifyChannels(row?.notify_channels),
    quiet_hours: normalizeQuietHours(row?.quiet_hours),
    updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function loadRawSecurityProfile(
  actor: Partial<ProfileActor>
): Promise<StoredSecurityProfileRow | null> {
  const identifiers = resolveProfileIdentifiers(actor);
  if (identifiers.length === 0) return null;

  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM user_security_profiles
         WHERE LOWER(user_id) = ANY($1::text[]) OR LOWER(username) = ANY($1::text[])
         LIMIT 1`,
        [identifiers]
      );
      if (res.rows[0]) {
        return mapRawRow(res.rows[0], actor);
      }
    } catch (err: any) {
      console.warn('[ProfileService] loadRawSecurityProfile PG warning:', err?.message || err);
    }
  }

  const store = loadFallbackStore();
  const idSet = new Set(identifiers);
  const match = (store.user_security_profiles || []).find(
    (p: any) =>
      p &&
      (idSet.has(String(p.user_id || '').toLowerCase()) ||
        idSet.has(String(p.username || '').toLowerCase()))
  );
  return match ? mapRawRow(match, actor) : null;
}

async function saveRawSecurityProfile(row: StoredSecurityProfileRow): Promise<StoredSecurityProfileRow> {
  const nowIso = new Date().toISOString();
  const normalized: StoredSecurityProfileRow = {
    ...row,
    notify_channels: normalizeNotifyChannels(row.notify_channels),
    quiet_hours: normalizeQuietHours(row.quiet_hours),
    backup_codes_hash: normalizeBackupHashes(row.backup_codes_hash),
    updated_at: nowIso,
  };

  // 1. Update fallback JSON store
  const store = loadFallbackStore();
  if (!Array.isArray(store.user_security_profiles)) store.user_security_profiles = [];
  const identifiers = new Set(
    resolveProfileIdentifiers({ userId: normalized.user_id, username: normalized.username })
  );
  const existingIdx = store.user_security_profiles.findIndex(
    (p: any) =>
      p &&
      (identifiers.has(String(p.user_id || '').toLowerCase()) ||
        identifiers.has(String(p.username || '').toLowerCase()))
  );
  if (existingIdx >= 0) {
    store.user_security_profiles[existingIdx] = normalized;
  } else {
    store.user_security_profiles.push(normalized);
  }
  saveFallbackStore(store);

  // 2. Persist in PostgreSQL
  await ensurePostgresConnection();
  const pool = getPgPool();
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `INSERT INTO user_security_profiles (
           user_id, username, display_title, phone_ext,
           preferred_2fa_method, totp_secret_enc, totp_verified,
           backup_codes_hash, notify_channels, quiet_hours, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id) DO UPDATE SET
           username = EXCLUDED.username,
           display_title = EXCLUDED.display_title,
           phone_ext = EXCLUDED.phone_ext,
           preferred_2fa_method = EXCLUDED.preferred_2fa_method,
           totp_secret_enc = EXCLUDED.totp_secret_enc,
           totp_verified = EXCLUDED.totp_verified,
           backup_codes_hash = EXCLUDED.backup_codes_hash,
           notify_channels = EXCLUDED.notify_channels,
           quiet_hours = EXCLUDED.quiet_hours,
           updated_at = CURRENT_TIMESTAMP`,
        [
          normalized.user_id,
          normalized.username,
          normalized.display_title,
          normalized.phone_ext,
          normalized.preferred_2fa_method,
          normalized.totp_secret_enc,
          Boolean(normalized.totp_verified),
          JSON.stringify(normalized.backup_codes_hash),
          JSON.stringify(normalized.notify_channels),
          JSON.stringify(normalized.quiet_hours),
          nowIso,
        ]
      );
    } catch (err: any) {
      console.error('[ProfileService] saveRawSecurityProfile PG error:', err?.message || err);
    }
  }

  return normalized;
}

function buildDefaultRawRow(actor: ProfileActor): StoredSecurityProfileRow {
  return {
    user_id: actor.userId,
    username: actor.username,
    display_title: null,
    phone_ext: null,
    preferred_2fa_method: 'none',
    totp_secret_enc: null,
    totp_verified: false,
    backup_codes_hash: [],
    notify_channels: { ...DEFAULT_NOTIFY_CHANNELS },
    quiet_hours: { ...DEFAULT_QUIET_HOURS },
    updated_at: new Date().toISOString(),
  };
}

async function toSafeProfileDto(
  actor: ProfileActor,
  raw: StoredSecurityProfileRow | null
): Promise<UserSecurityProfile> {
  const general = await getGeneralSettings().catch(() => ({
    twoFactorEnabled: false,
    twoFactorRememberDeviceEnabled: true,
  }));
  const row = raw || buildDefaultRawRow(actor);
  const localRec =
    actor.userType !== 'ad'
      ? (await findUserById(actor.userId)) || (await findUserByUsername(actor.username))
      : null;

  return {
    userId: row.user_id || actor.userId,
    username: row.username || actor.username,
    fullName: localRec?.full_name || actor.fullName || actor.username,
    email: localRec?.email || actor.email || `${actor.username}@nettopology.internal`,
    role: localRec?.role || actor.role || 'Operator',
    userType: localRec?.user_type || actor.userType || 'local',
    displayTitle: row.display_title || '',
    phoneExt: row.phone_ext || '',
    preferred2faMethod: row.preferred_2fa_method || 'none',
    totpVerified: Boolean(row.totp_verified),
    totpPendingEnrollment: Boolean(row.totp_secret_enc && !row.totp_verified),
    backupCodesRemaining: Array.isArray(row.backup_codes_hash) ? row.backup_codes_hash.length : 0,
    globalTwoFactorEnabled: Boolean(general?.twoFactorEnabled),
    globalRememberDeviceEnabled: general?.twoFactorRememberDeviceEnabled !== false,
    notifyChannels: normalizeNotifyChannels(row.notify_channels),
    quietHours: normalizeQuietHours(row.quiet_hours),
    updatedAt: row.updated_at || null,
  };
}

// ============================================================================
// Public Profile & Security API Operations
// ============================================================================

export async function getUserSecurityProfile(actor: ProfileActor): Promise<UserSecurityProfile> {
  const raw = await loadRawSecurityProfile(actor);
  return toSafeProfileDto(actor, raw);
}

export async function updateUserProfileAndPrefs(
  actor: ProfileActor,
  clientIp: string,
  updates: {
    displayTitle?: string;
    phoneExt?: string;
    notifyChannels?: Partial<UserNotifyChannelPrefs>;
    quietHours?: Partial<UserQuietHours>;
  }
): Promise<UserSecurityProfile> {
  const existing = (await loadRawSecurityProfile(actor)) || buildDefaultRawRow(actor);

  const nextRow: StoredSecurityProfileRow = {
    ...existing,
    user_id: existing.user_id || actor.userId,
    username: actor.username,
    display_title:
      updates.displayTitle !== undefined
        ? String(updates.displayTitle || '').trim().slice(0, 120) || null
        : existing.display_title,
    phone_ext:
      updates.phoneExt !== undefined
        ? String(updates.phoneExt || '').trim().slice(0, 48) || null
        : existing.phone_ext,
    notify_channels:
      updates.notifyChannels !== undefined
        ? normalizeNotifyChannels({ ...existing.notify_channels, ...updates.notifyChannels })
        : existing.notify_channels,
    quiet_hours:
      updates.quietHours !== undefined
        ? normalizeQuietHours({ ...existing.quiet_hours, ...updates.quietHours })
        : existing.quiet_hours,
  };

  const saved = await saveRawSecurityProfile(nextRow);

  await addPortalAuditLog({
    category: 'user_management',
    action: 'USER_PROFILE_UPDATED',
    title: `به‌روزرسانی پروفایل و تنظیمات اعلان کاربر ${actor.username}`,
    title_en: `Updated Profile & Notification Preferences for ${actor.username}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: clientIp || '127.0.0.1',
    },
    target: {
      type: 'user',
      id: actor.userId,
      name: actor.username,
    },
    severity: 'info',
    status: 'success',
    details: `کاربر ${actor.username} مشخصات فردی، کانال‌های اعلان یا ساعات سکوت خود را به‌روزرسانی کرد.`,
    details_en: `User ${actor.username} updated personal metadata, notification channel toggles, or quiet hours.`,
  }).catch(() => {});

  return toSafeProfileDto(actor, saved);
}

export async function beginTotpEnrollment(
  actor: ProfileActor,
  clientIp: string
): Promise<TotpEnrollmentPayload> {
  const general = await getGeneralSettings().catch(() => null);
  const issuer = (general?.panelTitle || 'NetTopology').trim().slice(0, 40) || 'NetTopology';
  const accountName = actor.email || actor.username;

  const secretBase32 = generateBase32Secret(20);
  const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  const qrSvg = await QRCode.toString(otpauthUri, {
    type: 'svg',
    margin: 2,
    width: 220,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  const existing = (await loadRawSecurityProfile(actor)) || buildDefaultRawRow(actor);
  const encryptedSecret = encryptServerSecret(secretBase32);

  await saveRawSecurityProfile({
    ...existing,
    user_id: existing.user_id || actor.userId,
    username: actor.username,
    totp_secret_enc: encryptedSecret,
    totp_verified: false,
    // Keep existing preferred_2fa_method intact until verified; if it was 'totp', hold at 'none' until new key verified
    preferred_2fa_method: existing.preferred_2fa_method === 'totp' ? 'none' : existing.preferred_2fa_method,
  });

  await addPortalAuditLog({
    category: 'system_auth',
    action: 'TOTP_ENROLLMENT_STARTED',
    title: `شروع ثبت‌نام اپلیکیشن احراز هویت (TOTP) برای ${actor.username}`,
    title_en: `Initiated Authenticator App (TOTP) Enrollment for ${actor.username}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: clientIp || '127.0.0.1',
    },
    target: {
      type: 'user',
      id: actor.userId,
      name: actor.username,
    },
    severity: 'notice',
    status: 'success',
    details: `کلید موقت TOTP با رمزنگاری AES-256-GCM برای حساب ${actor.username} ایجاد شد.`,
    details_en: `Generated pending AES-256-GCM encrypted TOTP key for account ${actor.username}.`,
  }).catch(() => {});

  return {
    secretBase32,
    otpauthUri,
    qrSvg,
    issuer,
    accountName,
  };
}

export async function verifyAndEnableTotp(
  actor: ProfileActor,
  clientIp: string,
  code: string
): Promise<{ profile: UserSecurityProfile; backupCodes: string[] }> {
  const existing = await loadRawSecurityProfile(actor);
  if (!existing || !existing.totp_secret_enc) {
    throw new Error('No pending Authenticator setup found. Please generate a QR code first.');
  }

  const secretBase32 = decryptServerSecret(existing.totp_secret_enc);
  if (!secretBase32 || !verifyTotpCode(secretBase32, code, 1)) {
    throw new Error('Invalid 6-digit Authenticator verification code. Ensure your device clock is accurate.');
  }

  const { plaintextCodes, hashedRecords } = generateBackupCodesSet(8);

  const saved = await saveRawSecurityProfile({
    ...existing,
    totp_verified: true,
    preferred_2fa_method: 'totp',
    backup_codes_hash: hashedRecords,
  });

  await addPortalAuditLog({
    category: 'system_auth',
    action: 'TOTP_2FA_ENABLED',
    title: `فعال‌سازی تایید دو مرحله‌ای با اپلیکیشن (TOTP) برای ${actor.username}`,
    title_en: `Authenticator App (TOTP) 2FA Enabled for ${actor.username}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: clientIp || '127.0.0.1',
    },
    target: {
      type: 'user',
      id: actor.userId,
      name: actor.username,
    },
    severity: 'notice',
    status: 'success',
    details: `احراز هویت دو مرحله‌ای TOTP برای کاربر ${actor.username} با موفقیت تایید و فعال شد و ۸ کد پشتیبان یک‌بارمصرف صادر گردید.`,
    details_en: `TOTP Two-Factor Authentication verified and activated for ${actor.username} with 8 single-use recovery backup codes.`,
  }).catch(() => {});

  return {
    profile: await toSafeProfileDto(actor, saved),
    backupCodes: plaintextCodes,
  };
}

async function validateReauthSecret(
  actor: ProfileActor,
  row: StoredSecurityProfileRow,
  verificationInput?: string
): Promise<boolean> {
  const clean = (verificationInput || '').trim();
  if (!clean) return false;

  // 1. Check active TOTP if verified
  if (row.totp_verified && row.totp_secret_enc) {
    const secret = decryptServerSecret(row.totp_secret_enc);
    if (secret && verifyTotpCode(secret, clean, 1)) {
      return true;
    }
    // Check backup recovery code
    const consumed = await verifyAndConsumeBackupCode(
      { userId: row.user_id, username: row.username },
      clean
    );
    if (consumed) return true;
  }

  // 2. For local users, allow current account password verification
  if (actor.userType !== 'ad') {
    const localRec =
      (await findUserById(actor.userId)) || (await findUserByUsername(actor.username));
    if (localRec?.password_hash && localRec?.password_salt) {
      if (verifyPassword(clean, localRec.password_hash, localRec.password_salt)) {
        return true;
      }
    }
  }

  return false;
}

export async function regenerateTotpBackupCodes(
  actor: ProfileActor,
  clientIp: string,
  verificationInput: string
): Promise<{ profile: UserSecurityProfile; backupCodes: string[] }> {
  const existing = await loadRawSecurityProfile(actor);
  if (!existing || !existing.totp_verified) {
    throw new Error('Authenticator TOTP must be enabled before generating recovery backup codes.');
  }

  const authorized = await validateReauthSecret(actor, existing, verificationInput);
  if (!authorized) {
    throw new Error('Verification failed. Enter a valid 6-digit TOTP code or your current password.');
  }

  const { plaintextCodes, hashedRecords } = generateBackupCodesSet(8);
  const updated = await saveRawSecurityProfile({
    ...existing,
    backup_codes_hash: hashedRecords,
  });

  await addPortalAuditLog({
    category: 'system_auth',
    action: 'TOTP_BACKUP_CODES_REGENERATED',
    title: `تولید مجدد کدهای پشتیبان بازیابی 2FA برای ${actor.username}`,
    title_en: `Regenerated 2FA Recovery Backup Codes for ${actor.username}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: clientIp || '127.0.0.1',
    },
    target: {
      type: 'user',
      id: actor.userId,
      name: actor.username,
    },
    severity: 'warning',
    status: 'success',
    details: `کدهای پشتیبان قدیمی باطل و ۸ کد جدید یک‌بارمصرف برای ${actor.username} صادر شد.`,
    details_en: `Previous backup codes invalidated and 8 new single-use codes issued for ${actor.username}.`,
  }).catch(() => {});

  return {
    profile: await toSafeProfileDto(actor, updated),
    backupCodes: plaintextCodes,
  };
}

export async function updateUserTwoFactorMethod(
  actor: ProfileActor,
  clientIp: string,
  method: TwoFactorMethod,
  options: { verificationInput?: string; resetTotpSecret?: boolean } = {}
): Promise<UserSecurityProfile> {
  if (method !== 'none' && method !== 'email' && method !== 'totp') {
    throw new Error('Invalid two-factor authentication method.');
  }

  const existing = (await loadRawSecurityProfile(actor)) || buildDefaultRawRow(actor);

  if (method === 'totp' && !existing.totp_verified) {
    throw new Error('Complete Authenticator QR verification before selecting TOTP.');
  }

  // Require verification when downgrading or disabling verified TOTP
  if (existing.totp_verified && (method !== 'totp' || options.resetTotpSecret)) {
    const authorized = await validateReauthSecret(actor, existing, options.verificationInput);
    if (!authorized) {
      throw new Error('Current Authenticator code, backup code, or account password is required to disable TOTP.');
    }
  }

  const clearTotp = Boolean(options.resetTotpSecret || method === 'none');
  const updated = await saveRawSecurityProfile({
    ...existing,
    preferred_2fa_method: method,
    totp_secret_enc: clearTotp ? null : existing.totp_secret_enc,
    totp_verified: clearTotp ? false : existing.totp_verified,
    backup_codes_hash: clearTotp ? [] : existing.backup_codes_hash,
  });

  await addPortalAuditLog({
    category: 'system_auth',
    action: 'USER_2FA_METHOD_CHANGED',
    title: `تغییر روش احراز هویت دو مرحله‌ای کاربر ${actor.username} به ${method}`,
    title_en: `Changed Personal 2FA Method for ${actor.username} to ${method}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: clientIp || '127.0.0.1',
    },
    target: {
      type: 'user',
      id: actor.userId,
      name: actor.username,
    },
    severity: method === 'none' ? 'warning' : 'notice',
    status: 'success',
    details: `کاربر ${actor.username} روش تایید دو مرحله‌ای حساب خود را روی «${method}» تنظیم کرد.`,
    details_en: `User ${actor.username} updated their personal 2FA preference to "${method}".`,
  }).catch(() => {});

  return toSafeProfileDto(actor, updated);
}

export async function changeOwnLocalPassword(
  actor: ProfileActor,
  clientIp: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (actor.userType === 'ad') {
    throw new Error('Active Directory domain accounts must update passwords through the Domain Controller.');
  }
  if (!currentPassword || !newPassword) {
    throw new Error('Both current password and new password are required.');
  }
  if (newPassword.trim().length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }
  if (currentPassword === newPassword) {
    throw new Error('New password must differ from your current password.');
  }

  const localUser =
    (await findUserById(actor.userId)) || (await findUserByUsername(actor.username));
  if (!localUser) {
    throw new Error('Local user account not found.');
  }

  const valid = verifyPassword(currentPassword, localUser.password_hash, localUser.password_salt);
  if (!valid) {
    throw new Error('Current password is incorrect.');
  }

  await saveUser({
    id: localUser.id,
    username: localUser.username,
    fullName: localUser.full_name,
    email: localUser.email,
    role: localUser.role,
    userType: localUser.user_type,
    status: localUser.status,
    groupIds: localUser.group_ids,
    isBuiltin: localUser.is_builtin,
    password: newPassword.trim(),
  });

  await addPortalAuditLog({
    category: 'system_auth',
    action: 'USER_PASSWORD_CHANGED',
    title: `تغییر رمز عبور توسط کاربر ${actor.username}`,
    title_en: `Self-Service Password Changed by ${actor.username}`,
    actor: {
      username: actor.username,
      role: actor.role || 'Operator',
      ipAddress: clientIp || '127.0.0.1',
    },
    target: {
      type: 'user',
      id: localUser.id,
      name: localUser.username,
    },
    severity: 'notice',
    status: 'success',
    details: `کاربر محلی ${localUser.username} رمز عبور حساب خود را با موفقیت تغییر داد.`,
    details_en: `Local user ${localUser.username} successfully changed their account password.`,
  }).catch(() => {});
}

// ============================================================================
// Login 2FA Helpers (TOTP & Backup Code Verification)
// ============================================================================

export async function getUserTotpStatusForLogin(actor: Partial<ProfileActor>): Promise<{
  preferredMethod: TwoFactorMethod;
  totpEnabled: boolean;
  backupCodesCount: number;
}> {
  const row = await loadRawSecurityProfile(actor);
  if (!row) {
    return { preferredMethod: 'none', totpEnabled: false, backupCodesCount: 0 };
  }
  const hasTotp = Boolean(row.totp_verified && row.totp_secret_enc);
  return {
    preferredMethod: row.preferred_2fa_method || 'none',
    totpEnabled: hasTotp && row.preferred_2fa_method === 'totp',
    backupCodesCount: row.backup_codes_hash.length,
  };
}

export async function verifyUserTotpForLogin(
  actor: Partial<ProfileActor>,
  code: string
): Promise<boolean> {
  const row = await loadRawSecurityProfile(actor);
  if (!row || !row.totp_verified || !row.totp_secret_enc) return false;
  const secret = decryptServerSecret(row.totp_secret_enc);
  if (!secret) return false;
  return verifyTotpCode(secret, code, 1);
}

export async function verifyAndConsumeBackupCode(
  actor: Partial<ProfileActor>,
  submittedCode: string
): Promise<boolean> {
  const normalized = normalizeBackupCode(submittedCode);
  if (!normalized || normalized.length < 6) return false;

  const row = await loadRawSecurityProfile(actor);
  if (!row || !Array.isArray(row.backup_codes_hash) || row.backup_codes_hash.length === 0) {
    return false;
  }

  let matchedIndex = -1;
  for (let i = 0; i < row.backup_codes_hash.length; i++) {
    const entry = row.backup_codes_hash[i];
    const candidate = hashBackupCode(normalized, entry.salt);
    const a = Buffer.from(candidate.hash, 'hex');
    const b = Buffer.from(entry.hash, 'hex');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) return false;

  const remaining = row.backup_codes_hash.filter((_, idx) => idx !== matchedIndex);
  await saveRawSecurityProfile({
    ...row,
    backup_codes_hash: remaining,
  });

  await addPortalAuditLog({
    category: 'system_auth',
    action: 'TOTP_BACKUP_CODE_USED',
    title: `استفاده از کد پشتیبان یک‌بارمصرف توسط ${row.username}`,
    title_en: `Single-Use 2FA Backup Code Consumed by ${row.username}`,
    actor: {
      username: row.username,
      role: 'Operator',
      ipAddress: '127.0.0.1',
    },
    target: {
      type: 'user',
      id: row.user_id,
      name: row.username,
    },
    severity: 'warning',
    status: 'success',
    details: `یکی از کدهای پشتیبان بازیابی توسط ${row.username} مصرف شد. کدهای باقی‌مانده: ${remaining.length}`,
    details_en: `Backup code consumed by ${row.username}. Remaining codes: ${remaining.length}.`,
  }).catch(() => {});

  return true;
}

// ============================================================================
// Notification Preferences & Quiet Hours Evaluation
// ============================================================================

function parseMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function isWithinQuietHours(quietHours: UserQuietHours, now = new Date()): boolean {
  if (!quietHours.enabled) return false;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: quietHours.timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const currentMin = h * 60 + m;
    const startMin = parseMinutes(quietHours.startHour);
    const endMin = parseMinutes(quietHours.endHour);

    if (startMin === endMin) return false;
    if (startMin < endMin) {
      return currentMin >= startMin && currentMin < endMin;
    }
    // Wrap around midnight (e.g. 22:00 -> 07:00)
    return currentMin >= startMin || currentMin < endMin;
  } catch {
    return false;
  }
}

export async function evaluateNotificationDeliveryForUser(
  actor: Partial<ProfileActor>,
  category: CommsCategory,
  severity: CommsSeverity,
  requiresAck: boolean
): Promise<{
  deliverInboxNotification: boolean;
  quietHoursMuted: boolean;
  playSound: boolean;
}> {
  // Mandatory/critical items must NEVER be suppressed
  const isMandatory =
    severity === 'critical' ||
    category === 'security_2fa' ||
    category === 'approval_request' ||
    requiresAck;

  const row = await loadRawSecurityProfile(actor).catch(() => null);
  if (!row) {
    return { deliverInboxNotification: true, quietHoursMuted: false, playSound: true };
  }

  const prefs = normalizeNotifyChannels(row.notify_channels);
  const quiet = normalizeQuietHours(row.quiet_hours);
  const inQuiet = isWithinQuietHours(quiet);
  const channelEnabled = prefs[category] !== false;

  return {
    deliverInboxNotification: isMandatory ? true : channelEnabled,
    quietHoursMuted: inQuiet,
    playSound: !inQuiet && prefs.desktop_sound !== false,
  };
}
