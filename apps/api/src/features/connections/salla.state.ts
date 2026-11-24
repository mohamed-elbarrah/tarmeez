import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

export function compareOAuthState(
  state: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashOAuthState(state), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
