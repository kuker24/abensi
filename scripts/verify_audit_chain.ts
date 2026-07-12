import { PrismaClient } from '@prisma/client';
import { verifyAuditTrustBoundary } from '../apps/api/src/modules/security/audit-trust-boundary.core';

async function main() {
  const prisma = new PrismaClient();
  try {
    const [entries, state, epochs, incidents] = await Promise.all([
      prisma.auditEntry.findMany({ orderBy: { sequence: 'asc' } }),
      prisma.auditChainState.findUnique({ where: { id: 1 } }),
      prisma.auditChainEpoch.findMany({ orderBy: { epochNumber: 'asc' } }),
      prisma.auditIntegrityIncident.findMany({ orderBy: { createdAt: 'asc' } })
    ]);

    const result = verifyAuditTrustBoundary({ entries, state, epochs, incidents });
    const report = {
      ok: result.ok,
      status: result.status,
      entries: result.totalScanned,
      trustedThroughSequence: result.trustedThroughSequence,
      historicalUntrustedRange: result.historicalUntrustedRange,
      activeEpoch: result.activeEpoch,
      historicalFindings: result.historicalFindings,
      issueCodes: result.issues.map((entry) => entry.code)
    };
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(JSON.stringify({ ok: false, status: 'ERROR', code: 'AUDIT_CHAIN_VERIFICATION_FAILED' }));
  process.exitCode = 1;
});
