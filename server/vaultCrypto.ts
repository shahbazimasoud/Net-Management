import crypto from 'crypto';

// Master secret for AES-256-GCM encryption of personal credentials
const VAULT_MASTER_SECRET =
  process.env.VAULT_SECRET ||
  process.env.JWT_SECRET ||
  'nettopology_vault_master_key_2026_aes256gcm_safe';

/**
 * Derives a deterministic 32-byte cryptographic key unique to each user.
 * Even if the database ciphertext is exposed, one user's key cannot decrypt another user's vault.
 */
export function deriveUserKey(userId: string, masterSecret?: string): Buffer {
  const secret = masterSecret || VAULT_MASTER_SECRET;
  const safeSalt = `vault_user_salt_${userId || 'anonymous'}`;
  return crypto.scryptSync(secret, safeSalt, 32);
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  hash?: string;
  salt?: string;
}

/**
 * Computes a high-iteration PBKDF2-SHA512 hash of a password secret with a cryptographic salt.
 * Ensures an irreversible cryptographic hash of the secret is persisted alongside ciphertext in the database.
 */
export function hashVaultSecret(
  plainText: string,
  customSalt?: string
): { hash: string; salt: string } {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(plainText, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

/**
 * Timing-safe verification of a vault secret's cryptographic hash.
 */
export function verifyVaultSecretHash(
  plainText: string,
  storedHash: string,
  salt: string
): boolean {
  if (!plainText || !storedHash || !salt) return false;
  try {
    const { hash } = hashVaultSecret(plainText, salt);
    const bufA = Buffer.from(hash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Encrypts a plain-text password using AES-256-GCM with authenticated tag,
 * and generates a PBKDF2-SHA512 hash and salt for database persistence.
 */
export function encryptVaultSecret(plainText: string, userId: string): EncryptedPayload {
  const key = deriveUserKey(userId);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  const { hash, salt } = hashVaultSecret(plainText);

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag,
    hash,
    salt,
  };
}

export interface DecryptVaultSecretResult {
  plainText: string;
  isLegacyKey: boolean;
  newPayload?: EncryptedPayload;
}

/**
 * Decrypts an AES-256-GCM encrypted password with Adaptive Multi-Key Fallback & Auto-Healing.
 * 1. Tries active primary master secret and user ID.
 * 2. If authentication tag fails (e.g. key changed during panel upgrade), attempts candidate legacy master keys
 *    and candidate user salts (user-admin, admin, anonymous).
 * 3. When a legacy candidate succeeds, returns plainText, flags isLegacyKey = true, and generates a newPayload
 *    encrypted with the current active master secret so callers can seamlessly heal/re-encrypt the stored record.
 */
export function decryptVaultSecretWithMeta(
  ciphertext: string,
  ivHex: string,
  tagHex: string,
  userId: string
): DecryptVaultSecretResult {
  if (!ciphertext || !ivHex || !tagHex) {
    throw new Error('Invalid vault payload: ciphertext, iv, and tag are required');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  // 1. Try active primary key first
  try {
    const primaryKey = deriveUserKey(userId, VAULT_MASTER_SECRET);
    const decipher = crypto.createDecipheriv('aes-256-gcm', primaryKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return {
      plainText: decrypted,
      isLegacyKey: false,
    };
  } catch {
    // Continue to fallback candidates
  }

  // 2. Candidate Master Secrets (in order of likelihood)
  const candidateMasterSecrets: string[] = [
    process.env.VAULT_SECRET,
    process.env.JWT_SECRET,
    process.env.SESSION_SECRET,
    'nettopology_vault_master_key_2026_aes256gcm_safe',
    'nettopology_super_secret_jwt_key_2026_cisco_ops',
  ].filter((s, idx, arr): s is string => Boolean(s) && s !== VAULT_MASTER_SECRET && arr.indexOf(s) === idx);

  // 3. Candidate User ID Salts (in case user identifier varied between updates)
  const candidateUserIds: string[] = [
    userId,
    'user-admin',
    'admin',
    'anonymous',
  ].filter((u, idx, arr): u is string => Boolean(u) && arr.indexOf(u) === idx);

  // Try legacy secrets across candidate salts
  for (const secret of candidateMasterSecrets) {
    for (const candUser of candidateUserIds) {
      try {
        const candidateKey = deriveUserKey(candUser, secret);
        const decipher = crypto.createDecipheriv('aes-256-gcm', candidateKey, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        if (decrypted !== undefined) {
          console.log(`[Vault Crypto] Successfully decrypted legacy secret using fallback master secret & salt "${candUser}"`);
          const newPayload = encryptVaultSecret(decrypted, userId);
          return {
            plainText: decrypted,
            isLegacyKey: true,
            newPayload,
          };
        }
      } catch {
        // Try next candidate
      }
    }
  }

  // Also try active master secret with alternate user salt candidates (e.g. user-admin vs admin)
  for (const candUser of candidateUserIds) {
    if (candUser === userId) continue;
    try {
      const candidateKey = deriveUserKey(candUser, VAULT_MASTER_SECRET);
      const decipher = crypto.createDecipheriv('aes-256-gcm', candidateKey, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (decrypted !== undefined) {
        console.log(`[Vault Crypto] Successfully decrypted secret using alternate user salt "${candUser}"`);
        const newPayload = encryptVaultSecret(decrypted, userId);
        return {
          plainText: decrypted,
          isLegacyKey: true,
          newPayload,
        };
      }
    } catch {
      // Try next
    }
  }

  throw new Error('Failed to decrypt credentials: Unsupported state or unable to authenticate data');
}

/**
 * Decrypts an AES-256-GCM encrypted password for the authorized owner user.
 * Seamlessly leverages multi-key fallback.
 */
export function decryptVaultSecret(
  ciphertext: string,
  ivHex: string,
  tagHex: string,
  userId: string
): string {
  return decryptVaultSecretWithMeta(ciphertext, ivHex, tagHex, userId).plainText;
}

/**
 * System-level AES-256-GCM encryption for remote server credentials (e.g. PostgreSQL passwords).
 * Formatted safely as `enc:v1:<iv>:<tag>:<ciphertext>`.
 */
export function encryptServerSecret(plainText: string): string {
  if (!plainText) return '';
  const key = crypto.scryptSync(VAULT_MASTER_SECRET, 'server_credential_system_salt', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc:v1:${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * System-level AES-256-GCM decryption for remote server credentials.
 * Gracefully preserves unencrypted strings if legacy data exists.
 */
export function decryptServerSecret(encryptedString: string): string {
  if (!encryptedString) return '';
  if (!encryptedString.startsWith('enc:v1:')) {
    // If legacy unencrypted format, return as is
    return encryptedString;
  }
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 5) return '';
    const [, , ivHex, tagHex, ciphertext] = parts;
    const key = crypto.scryptSync(VAULT_MASTER_SECRET, 'server_credential_system_salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.warn('[Server Secret Decryption Notice]', err.message);
    return '';
  }
}
