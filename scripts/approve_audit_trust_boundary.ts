import { PrismaClient } from '@prisma/client';
import { approveAuditTrustBoundary } from '../apps/api/src/modules/security/audit-trust-boundary.approval';
import { parseAuditTrustBoundaryApprovalArgs } from '../apps/api/src/scripts/approve-audit-trust-boundary.cli';

export { parseAuditTrustBoundaryApprovalArgs } from '../apps/api/src/scripts/approve-audit-trust-boundary.cli';

export async function main(args = process.argv.slice(2)) {
  const input = parseAuditTrustBoundaryApprovalArgs(args);
  const prisma = new PrismaClient();
  try {
    const result = await approveAuditTrustBoundary(prisma, input);
    // Result excludes payloads, persisted hashes, approval references, and PII.
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((_error: unknown) => {
    console.error('Audit trust-boundary approval failed. Inspect sanitized operational logs.');
    process.exitCode = 1;
  });
}
