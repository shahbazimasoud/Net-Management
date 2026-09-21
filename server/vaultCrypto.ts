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
function deriveUserKey(userId: string): Buffer {
  const safeSalt = `vault_user_salt_${userId || 'anonymous'}`;
  return crypto.scryptSync(VAULT_MASTER_SECRET, safeSalt, 32);
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

/**
 * Decrypts an AES-256-GCM encrypted password for the authorized owner user.
 */
export function decryptVaultSecret(
  ciphertext: string,
  ivHex: string,
  tagHex: string,
  userId: string
): string {
  try {
    const key = deriveUserKey(userId);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    throw new Error(`Failed to decrypt credentials: ${err.message || 'Authentication tag mismatch'}`);
  }
}
