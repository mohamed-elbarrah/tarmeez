import { createHash, randomBytes } from 'node:crypto';

export function generateAdOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function hashAdOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}
