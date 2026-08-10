#!/usr/bin/env node
/**
 * Read-only audit for duplicate-account risk in SIAB2 reporting.
 *
 * The script never writes database data and never prints names, usernames, NIP,
 * or User IDs. Candidate codes are one-way hashes for comparing repeated runs.
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/audit_reporting_identity.ts
 */
import { createHash } from 'node:crypto';
import { PrismaClient, Role } from '@prisma/client';

const PERSONNEL_ROLES = [
  Role.ADMIN_TU,
  Role.KEPALA_SEKOLAH,
  Role.GURU_MAPEL,
  Role.GURU_PIKET,
  Role.OPERATOR_IT,
  Role.PEGAWAI,
  Role.DEVELOPER
];

const GATE_REPORTS = [
  'operational_activity_snapshot',
  'staff_gate_attendance',
  'staff_monthly_attendance',
  'dashboard',
  'live_monitor'
];

const TEACHER_REPORTS = [
  'audit_coverage',
  'operational_activity_snapshot',
  'recap_classes',
  'recap_subjects',
  'recap_teachers',
  'teacher_monthly',
  'teacher_session_activity',
  'dashboard',
  'live_monitor'
];

type PersonnelAccount = {
  id: string;
  fullName: string;
  nip: string | null;
  active: boolean;
  archivedAt: Date | null;
  _count: {
    gateLogs: number;
    taughtSessions: number;
    teacherPresences: number;
  };
};

type CandidateClass = 'CONFIRMED_BY_UNIQUE_ID' | 'AMBIGUOUS' | 'CONFLICT' | 'NAME_ONLY_REVIEW';

type CandidateSummary = {
  code: string;
  classification: CandidateClass;
  accountCount: number;
  activeAccountCount: number;
  archivedAccountCount: number;
  gateLogCount: number;
  taughtSessionCount: number;
  teacherPresenceCount: number;
  affectedReports: string[];
};

function normalizeNip(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.normalize('NFKC').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return normalized || null;
}

function normalizeName(value: string): string {
  const degreeTokens = new Set(['SPD', 'SAG', 'MPD', 'SSOS', 'SKOM', 'SE', 'MM', 'DR', 'H', 'HJ']);
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !degreeTokens.has(token))
    .join(' ');
}

function candidateCode(accounts: PersonnelAccount[]): string {
  const source = accounts.map((account) => account.id).sort().join('|');
  return `candidate-${createHash('sha256').update(source).digest('hex').slice(0, 12)}`;
}

function affectedReports(accounts: PersonnelAccount[]): string[] {
  const reports = new Set<string>();
  if (accounts.some((account) => account._count.gateLogs > 0)) GATE_REPORTS.forEach((report) => reports.add(report));
  if (accounts.some((account) => account._count.taughtSessions > 0 || account._count.teacherPresences > 0)) {
    TEACHER_REPORTS.forEach((report) => reports.add(report));
  }
  return [...reports].sort();
}

function summarizeCandidate(accounts: PersonnelAccount[], classification: CandidateClass): CandidateSummary {
  return {
    code: candidateCode(accounts),
    classification,
    accountCount: accounts.length,
    activeAccountCount: accounts.filter((account) => account.active).length,
    archivedAccountCount: accounts.filter((account) => Boolean(account.archivedAt)).length,
    gateLogCount: accounts.reduce((sum, account) => sum + account._count.gateLogs, 0),
    taughtSessionCount: accounts.reduce((sum, account) => sum + account._count.taughtSessions, 0),
    teacherPresenceCount: accounts.reduce((sum, account) => sum + account._count.teacherPresences, 0),
    affectedReports: affectedReports(accounts)
  };
}

export function buildIdentityAudit(accounts: PersonnelAccount[]) {
  const candidates: CandidateSummary[] = [];
  const includedIds = new Set<string>();
  const byNip = new Map<string, PersonnelAccount[]>();

  for (const account of accounts) {
    const nip = normalizeNip(account.nip);
    if (!nip) continue;
    byNip.set(nip, [...(byNip.get(nip) ?? []), account]);
  }

  for (const matches of byNip.values()) {
    if (matches.length < 2) continue;
    matches.forEach((account) => includedIds.add(account.id));
    const names = new Set(matches.map((account) => normalizeName(account.fullName)));
    candidates.push(summarizeCandidate(matches, names.size > 1 ? 'CONFLICT' : 'AMBIGUOUS'));
  }

  const byName = new Map<string, PersonnelAccount[]>();
  for (const account of accounts) {
    if (includedIds.has(account.id)) continue;
    const name = normalizeName(account.fullName);
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), account]);
  }

  for (const matches of byName.values()) {
    if (matches.length < 2) continue;
    candidates.push(summarizeCandidate(matches, 'NAME_ONLY_REVIEW'));
  }

  candidates.sort((left, right) => left.code.localeCompare(right.code));
  const classificationCounts: Record<CandidateClass, number> = {
    CONFIRMED_BY_UNIQUE_ID: 0,
    AMBIGUOUS: 0,
    CONFLICT: 0,
    NAME_ONLY_REVIEW: 0
  };
  candidates.forEach((candidate) => { classificationCounts[candidate.classification] += 1; });

  return {
    contract: {
      readOnly: true,
      containsPersonalData: false,
      autoMergeAllowed: false,
      uniquePersonnelIdentityAvailable: false
    },
    summary: {
      personnelAccountCount: accounts.length,
      candidateGroupCount: candidates.length,
      classificationCounts
    },
    candidates
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL belum tersedia. Audit tidak dijalankan.');
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.user.findMany({
      where: { role: { in: PERSONNEL_ROLES } },
      select: {
        id: true,
        fullName: true,
        nip: true,
        active: true,
        archivedAt: true,
        _count: { select: { gateLogs: true, taughtSessions: true, teacherPresences: true } }
      }
    });
    const report = buildIdentityAudit(accounts);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.summary.candidateGroupCount > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : 'audit tidak dapat dijalankan'}`);
    process.exitCode = 2;
  });
}
