import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Prisma, PrismaClient } from '@prisma/client';
import { approveAuditTrustBoundary } from '../apps/api/src/modules/security/audit-trust-boundary.approval';
import { canonicalize } from '../apps/api/src/modules/security/canonical-json';
import { hashAuditEntry } from '../apps/api/src/modules/security/audit-trust-boundary.core';
import { createHash } from 'node:crypto';

const REQUIRED_CONFIRMATION = 'RUN_LOCAL_DESTRUCTIVE_TEST';
const TRUST_BOUNDARY_MIGRATION = '0041_audit_trust_boundary';
const SAFE_QUERY_PARAMETERS = new Set(['application_name', 'connect_timeout', 'options', 'sslmode', 'target_session_attrs']);
const FORBIDDEN_ROUTING_PARAMETERS = new Set(['host', 'hostaddr', 'service', 'servicefile']);

type Result = { name: string; ok: boolean; detail?: string };
export type LocalDatabaseUrlValidation =
  | { ok: true; url: string; hostname: string; databaseName: string }
  | { ok: false; reason: string };

function isLoopbackAddress(address: string) {
  if (address === '::1') return true;
  const family = isIP(address);
  if (family === 4) return address.startsWith('127.');
  return false;
}

function isDisposableDatabaseName(databaseName: string) {
  return /(?:^|[_-])(?:test|ci|local)(?:[_-]|$)|audit[_-]?boundary/i.test(databaseName);
}

/** Parses only a supplied local-test URL; DNS and server identity checks happen before destructive actions. */
export function validateAuditTrustBoundaryLocalDatabaseUrl(value: string | undefined): LocalDatabaseUrlValidation {
  if (!value) return { ok: false, reason: 'SKIPPED_LOCAL_TEST_URL_NOT_SET' };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      return { ok: false, reason: 'SKIPPED_URL_PROTOCOL_NOT_POSTGRES' };
    }
    if (!parsed.hostname || !isDisposableDatabaseName(parsed.pathname.replace(/^\//, ''))) {
      return { ok: false, reason: 'SKIPPED_URL_NOT_APPROVED_LOCAL_TEST_DATABASE' };
    }
    for (const [name] of parsed.searchParams) {
      if (FORBIDDEN_ROUTING_PARAMETERS.has(name.toLowerCase())) {
        return { ok: false, reason: 'SKIPPED_URL_ROUTING_OVERRIDE_FORBIDDEN' };
      }
      if (!SAFE_QUERY_PARAMETERS.has(name.toLowerCase())) {
        return { ok: false, reason: 'SKIPPED_URL_QUERY_PARAMETER_FORBIDDEN' };
      }
    }
    return { ok: true, url: value, hostname: parsed.hostname, databaseName: parsed.pathname.replace(/^\//, '') };
  } catch {
    return { ok: false, reason: 'SKIPPED_LOCAL_TEST_URL_INVALID' };
  }
}

async function resolveOnlyLoopback(hostname: string) {
  try {
    const resolved = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
    if (resolved.length === 0 || !resolved.every((record) => isLoopbackAddress(record.address))) {
      return { ok: false as const, reason: 'SKIPPED_URL_HOST_NOT_LOOPBACK' };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, reason: 'SKIPPED_URL_HOST_UNRESOLVABLE' };
  }
}

export function isApprovedConnectedTestServer(input: {
  serverAddress: string | null;
  serverPort: number;
  databaseName: string;
  expectedDatabaseName: string;
  allowCiContainerBridge: boolean;
}) {
  const addressApproved = input.serverAddress !== null && (
    isLoopbackAddress(input.serverAddress) ||
    (input.allowCiContainerBridge && /^172\.(?:1[6-9]|2\d|3[01])\./.test(input.serverAddress))
  );
  return addressApproved && input.serverPort === 5432 && input.databaseName === input.expectedDatabaseName;
}

async function verifyConnectedTestServer(prisma: PrismaClient, expectedDatabaseName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ server_address: string | null; server_port: number; database_name: string }>>(
    'SELECT inet_server_addr()::text AS server_address, inet_server_port()::int AS server_port, current_database()::text AS database_name'
  );
  const row = rows[0];
  return rows.length === 1 && Boolean(row) && isApprovedConnectedTestServer({
    serverAddress: row.server_address,
    serverPort: Number(row.server_port),
    databaseName: row.database_name,
    expectedDatabaseName,
    allowCiContainerBridge: process.env.CI === 'true'
  });
}

async function getSafeLocalDatabaseUrl(): Promise<LocalDatabaseUrlValidation> {
  const candidate = validateAuditTrustBoundaryLocalDatabaseUrl(process.env.AUDIT_BOUNDARY_TEST_DATABASE_URL);
  if (!candidate.ok) return candidate;
  if (process.env.AUDIT_BOUNDARY_TEST_CONFIRM !== REQUIRED_CONFIRMATION) {
    return { ok: false, reason: 'SKIPPED_LOCAL_DESTRUCTIVE_CONFIRMATION_REQUIRED' };
  }
  const resolution = await resolveOnlyLoopback(candidate.hostname);
  return resolution.ok ? candidate : resolution;
}

function sanitizeIntegrationDetail(detail: string | undefined) {
  const match = /^approved=(\d+);rejected=(\d+)$/.exec(detail ?? '');
  return match ? `approved=${match[1]};rejected=${match[2]}` : undefined;
}

export function createSanitizedLocalIntegrationReport(status: string, executed: boolean, results: Result[]) {
  const sanitizedResults = results.map((result) => {
    const detail = sanitizeIntegrationDetail(result.detail);
    return {
      name: result.name,
      ok: result.ok,
      ...(detail ? { detail } : {})
    };
  });
  return {
    status,
    executed,
    resultCount: sanitizedResults.length,
    passCount: sanitizedResults.filter((result) => result.ok).length,
    failCount: sanitizedResults.filter((result) => !result.ok).length,
    results: sanitizedResults
  };
}

export function writeSanitizedLocalIntegrationReport(report: object) {
  const output = resolve('artifacts/integration/audit-trust-boundary-local.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(output, 0o600);
  return output;
}

function copyPreBoundaryMigrations(tempRoot: string) {
  const sourcePrisma = resolve(__dirname, '..', 'prisma');
  const targetPrisma = join(tempRoot, 'prisma');
  const sourceMigrations = join(sourcePrisma, 'migrations');
  const targetMigrations = join(targetPrisma, 'migrations');
  mkdirSync(targetMigrations, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), join(targetPrisma, 'schema.prisma'));
  cpSync(join(sourceMigrations, 'migration_lock.toml'), join(targetMigrations, 'migration_lock.toml'));
  for (const name of readdirSync(sourceMigrations)) {
    if (name === TRUST_BOUNDARY_MIGRATION || name === 'migration_lock.toml') continue;
    cpSync(join(sourceMigrations, name), join(targetMigrations, name), { recursive: true });
  }
  return targetPrisma;
}

function runMigrations(prismaDirectory: string, args: string[], databaseUrl: string) {
  const prismaBin = resolve(__dirname, '..', 'node_modules', '.bin', 'prisma');
  execFileSync(prismaBin, args, {
    cwd: dirname(prismaDirectory),
    // Temp directory contains no .env. URL passed only after local guards succeed.
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: 'inherit'
  });
}

function addTrustBoundaryMigration(prismaDirectory: string) {
  const source = resolve(__dirname, '..', 'prisma', 'migrations', TRUST_BOUNDARY_MIGRATION);
  cpSync(source, join(prismaDirectory, 'migrations', TRUST_BOUNDARY_MIGRATION), { recursive: true });
}

function migrateLocalTestDatabase(prismaDirectory: string, schemaPath: string, databaseUrl: string) {
  addTrustBoundaryMigration(prismaDirectory);
  runMigrations(prismaDirectory, ['migrate', 'deploy', '--schema', schemaPath], databaseUrl);
}

async function expectRejected(name: string, task: () => Promise<unknown>, results: Result[]) {
  try {
    await task();
    results.push({ name, ok: false, detail: 'unexpected-success' });
  } catch {
    results.push({ name, ok: true });
  }
}

export async function runAuditTrustBoundaryLocalIntegration() {
  const target = await getSafeLocalDatabaseUrl();
  if (!target.ok) {
    const report = createSanitizedLocalIntegrationReport(target.reason, false, []);
    writeSanitizedLocalIntegrationReport(report);
    console.log(JSON.stringify(report));
    process.exitCode = 1;
    return;
  }

  const connectionGuard = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    if (!await verifyConnectedTestServer(connectionGuard, target.databaseName)) {
      const report = createSanitizedLocalIntegrationReport('SKIPPED_CONNECTED_SERVER_NOT_APPROVED', false, []);
      writeSanitizedLocalIntegrationReport(report);
      console.log(JSON.stringify(report));
      process.exitCode = 1;
      return;
    }
  } catch {
    const report = createSanitizedLocalIntegrationReport('LOCAL_INTEGRATION_CONNECTION_FAILED', false, []);
    writeSanitizedLocalIntegrationReport(report);
    console.error(JSON.stringify(report));
    process.exitCode = 1;
    return;
  } finally {
    await connectionGuard.$disconnect();
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'audit-trust-boundary-'));
  const results: Result[] = [];
  let prisma: PrismaClient | null = null;
  let competingPrisma: PrismaClient | null = null;
  let temporaryWorkspaceRemoved = false;
  let integrationStage = 'prepare_migrations';
  try {
    const localPrismaDirectory = copyPreBoundaryMigrations(tempRoot);
    const schemaPath = join(localPrismaDirectory, 'schema.prisma');

    // Empty DB: deploy pre-boundary schema, then structural-only 0041 once.
    integrationStage = 'empty_database_pre_boundary_migration';
    runMigrations(localPrismaDirectory, ['migrate', 'deploy', '--schema', schemaPath], target.url);
    integrationStage = 'empty_database_boundary_migration';
    migrateLocalTestDatabase(localPrismaDirectory, schemaPath, target.url);
    prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
    results.push({
      name: 'migration_empty_database_creates_no_audit_rows',
      ok: (await prisma.auditEntry.count()) === 0 && (await prisma.auditChainEpoch.count()) === 0 && (await prisma.auditIntegrityIncident.count()) === 0
    });
    await prisma.$disconnect();
    prisma = null;

    // Reset executes only after URL, DNS, confirmation, and connected-server checks succeed.
    integrationStage = 'populated_database_reset';
    rmSync(join(localPrismaDirectory, 'migrations', TRUST_BOUNDARY_MIGRATION), { recursive: true, force: true });
    runMigrations(localPrismaDirectory, ['migrate', 'reset', '--force', '--skip-generate', '--skip-seed', '--schema', schemaPath], target.url);
    prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
    const firstPayload = canonicalize({ action: 'synthetic.audit.1' }) as Prisma.InputJsonValue;
    const firstHash = hashAuditEntry(null, firstPayload);
    const secondPayload = canonicalize({ action: 'synthetic.audit.2' }) as Prisma.InputJsonValue;
    const historicalAnomalyHash = createHash('sha256').update('audit-boundary-local-known-anomaly').digest('hex');
    integrationStage = 'populate_historical_fixture';
    await prisma.auditEntry.createMany({
      data: [
        { id: 'audit-boundary-local-1', sequence: 1n, action: 'synthetic.audit.1', resource: 'synthetic', resourceId: '1', canonicalPayload: firstPayload, prevHash: null, entryHash: firstHash, hashVersion: 1 },
        { id: 'audit-boundary-local-2', sequence: 2n, action: 'synthetic.audit.2', resource: 'synthetic', resourceId: '2', canonicalPayload: secondPayload, prevHash: firstHash, entryHash: historicalAnomalyHash, hashVersion: 1 }
      ]
    });
    integrationStage = 'populate_chain_state';
    await prisma.auditChainState.upsert({
      where: { id: 1 },
      create: { id: 1, lastSequence: 2n, lastHash: historicalAnomalyHash, lastEntryId: 'audit-boundary-local-2' },
      update: { lastSequence: 2n, lastHash: historicalAnomalyHash, lastEntryId: 'audit-boundary-local-2' }
    });
    integrationStage = 'snapshot_historical_fixture';
    const historicalBefore = await prisma.auditEntry.findMany({ orderBy: { sequence: 'asc' } });
    const historicalBeforeBytes = JSON.stringify(historicalBefore, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    await prisma.$disconnect();
    prisma = null;

    integrationStage = 'populated_database_boundary_migration';
    migrateLocalTestDatabase(localPrismaDirectory, schemaPath, target.url);
    prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
    const historicalAfter = await prisma.auditEntry.findMany({ orderBy: { sequence: 'asc' } });
    const historicalAfterBytes = JSON.stringify(historicalAfter, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    results.push({ name: 'migration_populated_database_preserves_historical_audit_rows_byte_equivalent', ok: historicalBeforeBytes === historicalAfterBytes });

    const approvalInput = { incidentCode: 'AUDIT_BOUNDARY_LOCAL_TEST', expectedLatestSequence: 2n, expectedLastTrustedSequence: 1n, approvalReference: 'CHG-AUDIT-LOCAL-001', dryRun: false, confirm: true };
    competingPrisma = new PrismaClient({ datasources: { db: { url: target.url } } });
    integrationStage = 'concurrent_approval';
    const approvalSettlements = await Promise.allSettled([
      approveAuditTrustBoundary(prisma as never, approvalInput),
      approveAuditTrustBoundary(competingPrisma as never, approvalInput)
    ]);
    const approvedCount = approvalSettlements.filter((settlement) => settlement.status === 'fulfilled' && settlement.value.status === 'APPROVED').length;
    // Competing serializable transaction may reject at PostgreSQL commit instead
    // of returning BOUNDARY_ALREADY_EXISTS. Both outcomes prove second approval
    // did not commit; persisted cardinality below remains authoritative.
    const rejectedCount = approvalSettlements.filter((settlement) => (
      settlement.status === 'rejected' || settlement.value.status === 'REJECTED'
    )).length;
    const [persistedIncidentCount, persistedEpochCount, persistedBoundaryCount] = await Promise.all([
      prisma.auditIntegrityIncident.count(),
      prisma.auditChainEpoch.count(),
      prisma.auditEntry.count({ where: { action: 'audit.trust_boundary.approved' } })
    ]);
    results.push({
      name: 'concurrent_approval_database_locking',
      ok: approvedCount === 1 && rejectedCount === 1 && persistedIncidentCount === 1 && persistedEpochCount === 2 && persistedBoundaryCount === 1,
      detail: `approved=${approvedCount};rejected=${rejectedCount}`
    });

    integrationStage = 'trigger_enforcement';
    const [epochOne, epochTwo] = await prisma.auditChainEpoch.findMany({ orderBy: { epochNumber: 'asc' } });
    await expectRejected('epoch_delete_trigger_rejects_forensic_mutation', () => prisma!.auditChainEpoch.delete({ where: { id: epochOne.id } }), results);
    await expectRejected('epoch_update_trigger_rejects_non_close_transition', () => prisma!.auditChainEpoch.update({ where: { id: epochTwo.id }, data: { startSequence: 999n } }), results);
    await expectRejected('incident_overlap_trigger_rejects_overlapping_range', () => prisma!.auditIntegrityIncident.create({
      data: {
        incidentCode: 'AUDIT_BOUNDARY_OVERLAP', reasonCode: 'HISTORICAL_CHAIN_INTEGRITY_LOSS', status: 'HISTORICAL_UNTRUSTED',
        previousTrustedEndSequence: 0n, historicalStartSequence: 1n, historicalEndSequence: 2n,
        boundaryCommitment: 'local-overlap-commitment', approvalReference: 'CHG-AUDIT-LOCAL-002', approvedAt: new Date(), activeEpochId: epochTwo.id
      }
    }), results);
  } catch {
    results.push({ name: `local_integration_${integrationStage}`, ok: false, detail: 'LOCAL_INTEGRATION_EXECUTION_FAILED' });
  } finally {
    await competingPrisma?.$disconnect();
    await prisma?.$disconnect();
    try {
      rmSync(tempRoot, { recursive: true, force: true });
      temporaryWorkspaceRemoved = !existsSync(tempRoot);
    } catch {
      temporaryWorkspaceRemoved = false;
    }
    results.push({ name: 'temporary_workspace_cleanup', ok: temporaryWorkspaceRemoved });
  }

  const report = createSanitizedLocalIntegrationReport(results.every((result) => result.ok) ? 'PASS' : 'FAIL', true, results);
  writeSanitizedLocalIntegrationReport(report);
  console.log(JSON.stringify(report));
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (require.main === module) {
  runAuditTrustBoundaryLocalIntegration().catch(() => {
    console.error('AUDIT_TRUST_BOUNDARY_LOCAL_INTEGRATION_FAILED');
    process.exitCode = 1;
  });
}
