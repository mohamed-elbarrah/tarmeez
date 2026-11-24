import { readFileSync } from 'node:fs';

describe('Salla OAuth migration recovery', () => {
  it('preserves unexpired incomplete legacy intents', () => {
    const sql = readFileSync(
      new URL(
        '../../../prisma/migrations/20261115000000_salla_custom_oauth/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(sql).toContain(
      '"completed_at" IS NULL\n  AND "expires_at" <= NOW()',
    );
    expect(sql).not.toContain(
      '"completed_at" IS NULL\n  AND "status" = \'INITIATED\'',
    );
    expect(sql).toContain('"state_hash" IS NOT NULL');
  });

  it('adds cancellation status and timestamp to the intent schema and migration', () => {
    const schema = readFileSync(
      new URL('../../../prisma/schema.prisma', import.meta.url),
      'utf8',
    );
    const migration = readFileSync(
      new URL(
        '../../../prisma/migrations/20261115030000_salla_intent_cancellation/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(schema).toContain('CANCELLED');
    expect(schema).toContain('cancelledAt');
    expect(migration).toContain(
      'ALTER TYPE "SallaConnectionIntentStatus" ADD VALUE \'CANCELLED\'',
    );
    expect(migration).toContain('ADD COLUMN "cancelled_at"');
  });
});
