import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encryptAdToken(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptAdToken(value: string, key: Buffer): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted ad token');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(parts[0], 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2], 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function adEncryptionKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('META_TOKEN_ENCRYPTION_KEY is not configured');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32)
    throw new Error(
      'META_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  return key;
}
