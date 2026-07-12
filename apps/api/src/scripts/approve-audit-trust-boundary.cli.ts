export type ParsedAuditTrustBoundaryApprovalArgs = {
  incidentCode: string;
  expectedLatestSequence: bigint;
  expectedLastTrustedSequence: bigint;
  approvalReference: string;
  dryRun: boolean;
  confirm: boolean;
};

function readOption(args: string[], name: string) {
  const prefix = `${name}=`;
  const value = args.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function readBigIntOption(args: string[], name: string) {
  const value = readOption(args, name);
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer.`);
  return BigInt(value);
}

export function parseAuditTrustBoundaryApprovalArgs(args: string[]): ParsedAuditTrustBoundaryApprovalArgs {
  const dryRunValue = readOption(args, '--dry-run') ?? 'true';
  if (dryRunValue !== 'true' && dryRunValue !== 'false') {
    throw new Error('--dry-run must be true or false.');
  }
  const dryRun = dryRunValue !== 'false';
  const confirm = args.includes('--confirm');
  if (!dryRun && !confirm) {
    throw new Error('Refusing write: --dry-run=false requires --confirm.');
  }

  return {
    incidentCode: readOption(args, '--incident-code') ?? '',
    expectedLatestSequence: readBigIntOption(args, '--expected-latest-sequence'),
    expectedLastTrustedSequence: readBigIntOption(args, '--expected-last-trusted-sequence'),
    approvalReference: readOption(args, '--approval-reference') ?? '',
    dryRun,
    confirm
  };
}
