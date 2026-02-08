import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const SEPARATOR = ':';

/**
 * Get the encryption key from the environment.
 * Must be a 32-byte hex string (64 hex characters).
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a string in format: iv:ciphertext:authTag (all hex-encoded).
 * Each encryption uses a random IV, so the same plaintext produces different ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return [iv.toString('hex'), encrypted, authTag].join(SEPARATOR);
}

/**
 * Decrypt an encrypted string produced by encrypt().
 * Expects format: iv:ciphertext:authTag (all hex-encoded).
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(SEPARATOR);

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format. Expected iv:ciphertext:authTag');
  }

  const [ivHex, ciphertext, authTagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a value if it's not null/undefined/empty.
 * Returns null if input is falsy.
 */
export function encryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

/**
 * Decrypt a value if it's not null/undefined/empty.
 * Returns null if input is falsy.
 */
export function decryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    // If decryption fails (e.g., data was stored unencrypted), return null
    console.error('Failed to decrypt value - it may not be encrypted');
    return null;
  }
}

/**
 * Mask a secret string for safe display.
 * Shows first 4 and last 4 characters, masks the rest.
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Generate a new random encryption key.
 * Use this for initial setup.
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}
