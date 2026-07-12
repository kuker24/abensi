import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { verifyAuditTrustBoundary } from '../apps/api/src/modules/security/audit-trust-boundary.core';

function argValue(name: string, fallback: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const prisma = new PrismaClient();
  const outputPath = resolve(argValue('--json', 'artifacts/audit/audit-chain-preflight.json'));
  try {
    const [entries, state, epochs, incidents] = await Promise.all([
      prisma.auditEntry.findMany({ orderBy: { sequence: 'asc' } }),
      prisma.auditChainState.findUnique({ where: { id: 1 } }),
      prisma.auditChainEpoch.findMany({ orderBy: { epochNumber: 'asc' } }),
      prisma.auditIntegrityIncident.findMany({ orderBy: { createdAt: 'asc' } })
    ]);
    const verification = verifyAuditTrustBoundary({ entries, state, epochs, incidents });
    const report = {
      generatedAt: new Date().toISOString(),
      ok: verification.ok,
      status: verification.status,
      entryCount: verification.totalScanned,
      trustedThroughSequence: verification.trustedThroughSequence,
      historicalUntrustedRange: verification.historicalUntrustedRange,
      activeEpoch: verification.activeEpoch,
      historicalFindings: verification.historicalFindings,
      issueCodes: verification.issues.map((entry) => entry.code)
    };
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(JSON.stringify({ ok: false, status: 'ERROR', code: 'AUDIT_PREFLIGHT_FAILED' }));
  process.exitCode = 1;
});
