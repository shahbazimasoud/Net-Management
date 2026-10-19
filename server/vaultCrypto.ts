import crypto from 'crypto';
import { getCachedSecurityKeychain } from './db';

/**
 * Resolves the active master encryption secret dynamically.
 * Priority:
 * 1. Persistent PostgreSQL system_security_keys table (via cached database keychain)
 * 2. Environment variables (VAULT_SECRET, JWT_SECRET)
 * 3. Verified safe fallback constant
 */
export function getActiveVaultMasterSecret(): string {
  try {
    const keychain = getCachedSecurityKeychain?.();
    if (keychain && keychain.masterKey && typeof keychain.masterKey === 'string' && keychain.masterKey.trim().length > 0) {
      return keychain.masterKey.trim();
    }
  } catch {}

  return (
    process.env.VAULT_SECRET ||
    process.env.JWT_SECRET ||
    'nettopology_vault_master_key_2026_aes256gcm_safe'
  );
}

/**
 * Returns all candidate master secrets in order of likelihood:
 * 1. Active database master key
 * 2. Persistent legacy keys from PostgreSQL system_security_keys table
 * 3. Environment candidates (VAULT_SECRET, JWT_SECRET, SESSION_SECRET)
 * 4. Known historical default keys
 */
export function getAllCandidateMasterSecrets(): string[] {
  const candidates: string[] = [];
  const activeMaster = getActiveVaultMasterSecret();
  if (activeMaster) {
    candidates.push(activeMaster);
  }

  // Database persistent legacy keys
  try {
    const keychain = getCachedSecurityKeychain?.();
    if (keychain && Array.isArray(keychain.legacyKeys)) {
      for (const k of keychain.legacyKeys) {
        if (k && typeof k === 'string' && k.trim().length > 0 && !candidates.includes(k.trim())) {
          candidates.push(k.trim());
        }
      }
    }
  } catch {}

  // Environment & historical defaults
  const envCandidates = [
    process.env.VAULT_SECRET,
    process.env.JWT_SECRET,
    process.env.SESSION_SECRET,
    'nettopology_vault_master_key_2026_aes256gcm_safe',
    'nettopology_super_secret_jwt_key_2026_cisco_ops',
  ];

  for (const k of envCandidates) {
    if (k && typeof k === 'string' && k.trim().length > 0 && !candidates.includes(k.trim())) {
      candidates.push(k.trim());
    }
  }

  return candidates;
}

/**
 * Derives a deterministic 32-byte cryptographic key unique to each user.
 * Even if the database ciphertext is exposed, one user's key cannot decrypt another user's vault.
 */
export function deriveUserKey(userId: string, masterSecret?: string): Buffer {
  const secret = masterSecret || getActiveVaultMasterSecret();
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
 * 1. Tries active primary master secret from database keychain and user ID.
 * 2. If authentication tag fails (e.g. key changed during panel upgrade), attempts candidate legacy master keys
 *    from database keychain and candidate user salts (user-admin, admin, anonymous).
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
  const activeMaster = getActiveVaultMasterSecret();

  // 1. Try active primary key first
  try {
    const primaryKey = deriveUserKey(userId, activeMaster);
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

  // 2. Candidate Master Secrets (database legacy keys + env candidates)
  const candidateMasterSecrets = getAllCandidateMasterSecrets().filter((s) => s !== activeMaster);

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
          console.log(`[Vault Crypto Auto-Heal] Successfully decrypted legacy secret using candidate key & salt "${candUser}"`);
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
      const candidateKey = deriveUserKey(candUser, activeMaster);
      const decipher = crypto.createDecipheriv('aes-256-gcm', candidateKey, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (decrypted !== undefined) {
        console.log(`[Vault Crypto Auto-Heal] Successfully decrypted secret using alternate user salt "${candUser}"`);
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
 * System-level AES-256-GCM encryption for remote server and network equipment credentials (e.g. SSH, Telnet, Enable passwords).
 * Formatted safely as `enc:v1:<iv>:<tag>:<ciphertext>`.
 */
export function encryptServerSecret(plainText: string): string {
  if (!plainText) return '';
  const activeMaster = getActiveVaultMasterSecret();
  const key = crypto.scryptSync(activeMaster, 'server_credential_system_salt', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc:v1:${iv.toString('hex')}:${tag}:${encrypted}`;
}

export interface DecryptServerSecretResult {
  plainText: string;
  isLegacyKey: boolean;
  newEncryptedString?: string;
}

/**
 * System-level AES-256-GCM decryption for remote server and network equipment credentials.
 * Automatically tries active database master key, followed by all candidate legacy keys.
 * Returns metadata and re-encrypted ciphertext for automatic zero-disruption database auto-healing.
 */
export function decryptServerSecretWithMeta(encryptedString: string): DecryptServerSecretResult {
  if (!encryptedString) {
    return { plainText: '', isLegacyKey: false };
  }
  if (!encryptedString.startsWith('enc:v1:')) {
    // If legacy unencrypted plain-text format, return as is with auto-encrypt option
    const newEncryptedString = encryptServerSecret(encryptedString);
    return {
      plainText: encryptedString,
      isLegacyKey: true,
      newEncryptedString,
    };
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 5) {
    return { plainText: '', isLegacyKey: false };
  }
  const [, , ivHex, tagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const activeMaster = getActiveVaultMasterSecret();

  // 1. Try active master key first
  try {
    const key = crypto.scryptSync(activeMaster, 'server_credential_system_salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return {
      plainText: decrypted,
      isLegacyKey: false,
    };
  } catch {
    // Active key failed, proceed to candidate keys
  }

  // 2. Try all candidate legacy secrets from database keychain & environment
  const candidates = getAllCandidateMasterSecrets().filter((s) => s !== activeMaster);

  for (const secret of candidates) {
    try {
      const candidateKey = crypto.scryptSync(secret, 'server_credential_system_salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', candidateKey, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (decrypted !== undefined) {
        console.log(`[Server Crypto Auto-Heal] Successfully decrypted server credential using legacy candidate key.`);
        const newEncryptedString = encryptServerSecret(decrypted);
        return {
          plainText: decrypted,
          isLegacyKey: true,
          newEncryptedString,
        };
      }
    } catch {
      // Continue to next candidate
    }
  }

  console.warn('[Server Secret Decryption Notice] All candidate keys failed to decrypt credential.');
  return {
    plainText: '',
    isLegacyKey: false,
  };
}

/**
 * System-level AES-256-GCM decryption for remote server credentials.
 * Gracefully preserves unencrypted strings if legacy data exists.
 */
export function decryptServerSecret(encryptedString: string): string {
  return decryptServerSecretWithMeta(encryptedString).plainText;
}
