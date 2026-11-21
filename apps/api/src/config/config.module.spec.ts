import { randomBytes } from 'node:crypto';
import { validateEnvironment } from './config.module.js';

describe('validateEnvironment Salla Custom Mode configuration', () => {
  it('defaults Salla connections to disabled outside production', () => {
    const result = validateEnvironment(baseEnvironment());

    expect(result.SALLA_ENABLED).toBe(false);
  });

  it('allows production to start with Salla disabled', () => {
    const result = validateEnvironment(
      baseEnvironment({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: 587,
        SMTP_FROM: 'Tarmeez <no-reply@example.test>',
      }),
    );

    expect(result.SALLA_ENABLED).toBe(false);
  });

  it('requires all Custom Mode settings when Salla is enabled', () => {
    expect(() =>
      validateEnvironment(baseEnvironment({ SALLA_ENABLED: true })),
    ).toThrow(
      'SALLA_CLIENT_ID, SALLA_CLIENT_SECRET, SALLA_REDIRECT_URI, SALLA_TOKEN_ENCRYPTION_KEY, and SALLA_WEBHOOK_SECRET are required when SALLA_ENABLED=true.',
    );
  });

  it('accepts a complete local Custom Mode configuration', () => {
    const result = validateEnvironment(
      baseEnvironment({
        SALLA_ENABLED: true,
        SALLA_CLIENT_ID: 'client-id',
        SALLA_CLIENT_SECRET: 'client-secret',
        SALLA_REDIRECT_URI:
          'http://localhost:4000/connections/salla/callback',
        SALLA_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        SALLA_WEBHOOK_SECRET: 'webhook-secret',
      }),
    );

    expect(result.SALLA_ENABLED).toBe(true);
  });

  it('requires HTTPS for an enabled production redirect URI', () => {
    expect(() =>
      validateEnvironment(
        baseEnvironment({
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://app.example.test',
          SMTP_HOST: 'smtp.example.test',
          SMTP_PORT: 587,
          SMTP_FROM: 'Tarmeez <no-reply@example.test>',
          SALLA_ENABLED: true,
          SALLA_CLIENT_ID: 'client-id',
          SALLA_CLIENT_SECRET: 'client-secret',
          SALLA_REDIRECT_URI:
            'http://localhost:4000/connections/salla/callback',
          SALLA_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
          SALLA_WEBHOOK_SECRET: 'webhook-secret',
        }),
      ),
    ).toThrow('SALLA_REDIRECT_URI must use HTTPS when Salla is enabled in production.');
  });

  it('requires the encryption key to decode to exactly 32 bytes', () => {
    expect(() =>
      validateEnvironment(
        baseEnvironment({
          SALLA_ENABLED: true,
          SALLA_CLIENT_ID: 'client-id',
          SALLA_CLIENT_SECRET: 'client-secret',
          SALLA_REDIRECT_URI:
            'http://localhost:4000/connections/salla/callback',
          SALLA_TOKEN_ENCRYPTION_KEY: randomBytes(16).toString('base64'),
          SALLA_WEBHOOK_SECRET: 'webhook-secret',
        }),
      ),
    ).toThrow('SALLA_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  });
});

function baseEnvironment(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://tarmeez:secret@localhost:5432/tarmeez',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    AUTH_OTP_PEPPER: 'c'.repeat(32),
    ...overrides,
  };
}
