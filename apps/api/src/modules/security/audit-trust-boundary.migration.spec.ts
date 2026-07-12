import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('0041 audit trust-boundary migration safety', () => {
  const migrationPath = resolve(__dirname, '../../../../../prisma/migrations/0041_audit_trust_boundary/migration.sql');
  const migration = readFileSync(migrationPath, 'utf8');
  const statements = migration
    .split(';')
    .map((statement) => statement.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);

  it('is structural only and has no historical AuditEntry DML or automatic metadata insertion', () => {
    expect(migration).toContain('CREATE TYPE "AuditIntegrityIncidentReasonCode"');
    expect(migration).toContain('CREATE TRIGGER "AuditIntegrityIncident_no_overlapping_ranges"');
    expect(migration).toContain('CREATE TRIGGER "AuditChainEpoch_no_overlapping_ranges"');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON "AuditChainEpoch"');
    expect(migration).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\s+"?AuditEntry"?/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+"?(?:AuditChainEpoch|AuditIntegrityIncident)"?/i);
  });

  it('contains no top-level data mutation statement', () => {
    const forbidden = statements.filter((statement) => /^(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP\s+TABLE)\b/i.test(statement));
    expect(forbidden).toEqual([]);
  });

  it('guards epoch metadata against deletion and permits only one controlled close transition', () => {
    expect(migration).toContain('CREATE TRIGGER "AuditChainEpoch_forensic_mutation_guard"');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "AuditChainEpoch"');
    expect(migration).toContain("IF TG_OP = 'DELETE' THEN");
    expect(migration).toContain('OLD."status" <> \'ACTIVE_TRUSTED\'');
    expect(migration).toContain('NEW."status" <> \'TRUSTED\'');
    expect(migration).toContain('OLD."endSequence" IS NOT NULL');
    expect(migration).toContain('NEW."endSequence" IS NULL');
    expect(migration).toContain('OLD."closedAt" IS NOT NULL');
    expect(migration).toContain('NEW."closedAt" IS NULL');
    expect(migration).toMatch(/OLD\."startSequence" IS DISTINCT FROM NEW\."startSequence"/);
    expect(migration).toMatch(/OLD\."previousEpochId" IS DISTINCT FROM NEW\."previousEpochId"/);
  });

  it('keeps Prisma schema and migration index parity for unique active epoch state', () => {
    const schemaPath = resolve(__dirname, '../../../../../prisma/schema.prisma');
    const schema = readFileSync(schemaPath, 'utf8');
    expect(schema).toContain('activeEpochId String?  @unique');
    expect(schema).not.toMatch(/model AuditChainState[\s\S]*@@index\(\[activeEpochId\]\)/);
    expect(migration).toContain('CREATE UNIQUE INDEX "AuditChainState_activeEpochId_key"');
  });
});
