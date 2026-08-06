/**
 * Portable CommonJS runner for production API container.
 * Mirrors scripts/apply_akunlogin_passwords.ts safety gates.
 *
 * Usage (inside API container, cwd /app/apps/api):
 *   node /tmp/apply_akunlogin_passwords.cjs --file=/tmp/akunlogin.xlsx
 *   node /tmp/apply_akunlogin_passwords.cjs --file=/tmp/akunlogin.xlsx --apply \
 *     --confirm=APPLY_AKUNLOGIN_PASSWORDS_PRODUCTION \
 *     --confirm-backup-path=/tmp/backup-marker --verify-sample=2 \
 *     --must-change-password=false
 */
const { createHash } = require('node:crypto');
const { mkdirSync, statSync, writeFileSync, readFileSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');

const bcrypt = require('bcryptjs');
const { PrismaClient, Role } = require('@prisma/client');
const ExcelJS = require('exceljs');

const CONFIRM_PHRASE = 'APPLY_AKUNLOGIN_PASSWORDS_PRODUCTION';
const BCRYPT_ROUNDS = 10;
const REVOKE_REASON = 'ops-akunlogin-password-apply';

const ALLOWED_ROLES = new Set([Role.GURU_MAPEL, Role.GURU_PIKET, Role.PEGAWAI]);
const PROTECTED_ROLES = new Set([
  Role.ADMIN_TU,
  Role.KEPALA_SEKOLAH,
  Role.OPERATOR_IT,
  Role.DEVELOPER,
  Role.SISWA
]);
const PROTECTED_USERNAMES = new Set(['admin.tu', 'kamad', 'pegawai.2005011008']);

function argValue(name) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

/** Default true (force change). Explicit false|0|no|off disables force-change after apply. */
function parseMustChangePasswordArg(raw) {
  if (raw == null || raw === '') return true;
  const value = String(raw).trim().toLowerCase();
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  throw new Error(`invalid --must-change-password=${raw} (use true|false)`);
}

function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isProtectedUsername(username) {
  if (!username) return true;
  if (PROTECTED_USERNAMES.has(username)) return true;
  if (username.startsWith('demo.')) return true;
  if (username === 'admin' || username.startsWith('admin.')) return true;
  return false;
}

function isProtectedExcelRole(roleLabel) {
  const label = normalizeLabel(roleLabel);
  if (!label) return false;
  if (label.includes('kepala sekolah') || label === 'kamad') return true;
  if (label.includes('admin_tu') || label.includes('admin tu')) return true;
  return false;
}

function sanitizeDatabaseEndpoint(url) {
  if (!url) return '(unset)';
  try {
    const parsed = new URL(url);
    const db = parsed.pathname?.replace(/^\//, '') || '';
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${db}`;
  } catch {
    return '(unparseable)';
  }
}

function headerIndex(headers, candidates) {
  const normalized = headers.map((h) => normalizeLabel(h));
  for (const candidate of candidates) {
    const idx = normalized.indexOf(normalizeLabel(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function fingerprintHash(value) {
  if (!value) return null;
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function assertReportSafe(report) {
  const json = JSON.stringify(report);
  for (const token of ['"password"', '"Password Awal"', '"initialPassword"', '"PasswordAwal"']) {
    if (json.includes(token)) throw new Error(`Refusing report with sensitive token ${token}`);
  }
}

function classifyRow(row, dbUser) {
  const base = {
    rowNumber: row.rowNumber,
    fullName: row.fullName,
    roleLabel: row.roleLabel,
    username: row.username
  };
  if (!row.username || row.username.length < 2) return { ...base, outcome: 'invalid', detail: 'username kosong/pendek' };
  if (!row.password || row.password.length < 8) return { ...base, outcome: 'invalid', detail: 'password awal kosong/pendek (<8)' };
  if (isProtectedUsername(row.username)) return { ...base, outcome: 'protected_username', detail: 'username dilindungi' };
  if (isProtectedExcelRole(row.roleLabel)) return { ...base, outcome: 'protected_excel_role', detail: `role excel dilindungi: ${row.roleLabel}` };
  if (!dbUser) return { ...base, outcome: 'missing', detail: 'username tidak ada di DB' };
  if (PROTECTED_ROLES.has(dbUser.role) || !ALLOWED_ROLES.has(dbUser.role)) {
    return {
      ...base,
      outcome: 'protected_db_role',
      dbRole: dbUser.role,
      userId: dbUser.id,
      active: dbUser.active,
      detail: `role DB dilindungi/non-target: ${dbUser.role}`
    };
  }
  if (!dbUser.active) {
    return {
      ...base,
      outcome: 'inactive',
      dbRole: dbUser.role,
      userId: dbUser.id,
      active: false,
      detail: 'user nonaktif'
    };
  }
  return {
    ...base,
    outcome: 'apply',
    dbRole: dbUser.role,
    userId: dbUser.id,
    active: true,
    detail: 'siap di-update'
  };
}

async function loadAkunloginRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet =
    workbook.getWorksheet('Akun Login')
    || workbook.worksheets.find((ws) => normalizeLabel(ws.name).includes('akun'))
    || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel sheet not found');

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.text ?? cell.value ?? '').trim();
  });

  const idxName = headerIndex(headers, ['Nama Lengkap', 'Nama', 'fullName']);
  const idxRole = headerIndex(headers, ['Role', 'Peran']);
  const idxUser = headerIndex(headers, ['Username', 'User']);
  const idxPass = headerIndex(headers, ['Password Awal', 'Password', 'password']);
  if (idxUser < 0 || idxPass < 0) {
    throw new Error(`Required columns missing. Headers: ${headers.filter(Boolean).join(' | ')}`);
  }

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (index) => {
      if (index < 0) return '';
      const value = row.getCell(index + 1).value;
      if (value && typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
      if (value && typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
      return String(value ?? '').trim();
    };
    const username = normalizeUsername(cell(idxUser));
    const password = cell(idxPass);
    const fullName = idxName >= 0 ? cell(idxName) : '';
    const roleLabel = idxRole >= 0 ? cell(idxRole) : '';
    if (!username && !password && !fullName) return;
    rows.push({ rowNumber, fullName, roleLabel, username, password });
  });
  return rows;
}

function countByOutcome(rows) {
  const counts = {
    apply: 0,
    protected_username: 0,
    protected_excel_role: 0,
    protected_db_role: 0,
    missing: 0,
    inactive: 0,
    invalid: 0
  };
  for (const row of rows) counts[row.outcome] = (counts[row.outcome] || 0) + 1;
  return counts;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL unset');
    process.exit(2);
  }

  const apply = hasFlag('--apply');
  const confirm = argValue('--confirm');
  const backupPath = argValue('--confirm-backup-path');
  const fileArg = argValue('--file') || 'akunlogin.xlsx';
  const filePath = isAbsolute(fileArg) ? fileArg : resolve(process.cwd(), fileArg);
  const verifySample = Number(argValue('--verify-sample') || '0');
  let mustChangePassword = true;
  try {
    mustChangePassword = parseMustChangePasswordArg(argValue('--must-change-password'));
  } catch (error) {
    console.error(`BLOCKED: ${error.message}`);
    process.exit(2);
  }
  const jsonOut = resolve(argValue('--json') || `/tmp/apply-akunlogin-${apply ? 'apply' : 'dry-run'}.json`);

  console.log('=== apply_akunlogin_passwords (cjs) ===');
  console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`mustChangePassword: ${mustChangePassword}`);
  console.log(`db: ${sanitizeDatabaseEndpoint(process.env.DATABASE_URL)}`);
  console.log(`file: ${filePath}`);

  if (apply) {
    if (confirm !== CONFIRM_PHRASE) {
      console.error(`BLOCKED: --apply requires --confirm=${CONFIRM_PHRASE}`);
      process.exit(2);
    }
    if (!backupPath) {
      console.error('BLOCKED: --apply requires --confirm-backup-path');
      process.exit(2);
    }
    try {
      const st = statSync(backupPath);
      if (!st.isFile() || st.size < 1024) {
        console.error('BLOCKED: backup path must be existing file >= 1KB');
        process.exit(2);
      }
    } catch {
      console.error('BLOCKED: backup path not found');
      process.exit(2);
    }
    console.log(`backup: ${backupPath} (ok, ${statSync(backupPath).size} bytes)`);
  }

  const excelRows = await loadAkunloginRows(filePath);
  const prisma = new PrismaClient();
  const startedAt = new Date();
  const passwordsByUsername = new Map();

  try {
    const usernames = [...new Set(excelRows.map((row) => row.username).filter(Boolean))];
    const dbUsers = await prisma.user.findMany({
      where: { username: { in: usernames } },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        passwordHash: true,
        sessionVersion: true,
        mustChangePassword: true
      }
    });
    const byUsername = new Map(dbUsers.map((user) => [normalizeUsername(user.username), user]));

    const protectedSnapshots = await prisma.user.findMany({
      where: {
        OR: [
          { username: { in: ['admin.tu', 'kamad', 'pegawai.2005011008'] } },
          { role: { in: [Role.ADMIN_TU, Role.KEPALA_SEKOLAH] } }
        ]
      },
      select: { id: true, username: true, role: true, passwordHash: true, sessionVersion: true }
    });
    const preProtected = protectedSnapshots.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      hashFp: fingerprintHash(user.passwordHash),
      sessionVersion: user.sessionVersion
    }));

    const classified = excelRows.map((row) => {
      if (row.username && row.password) passwordsByUsername.set(row.username, row.password);
      return classifyRow(row, byUsername.get(row.username));
    });
    const counts = countByOutcome(classified);
    const applyRows = classified.filter((row) => row.outcome === 'apply' && row.userId);

    console.log('--- classification ---');
    console.log(JSON.stringify({ excelRows: excelRows.length, uniqueUsernames: usernames.length, counts }, null, 2));
    console.log('protected:');
    for (const row of classified.filter((r) => String(r.outcome).startsWith('protected'))) {
      console.log(`  [${row.outcome}] ${row.username} — ${row.detail}`);
    }
    console.log('missing:');
    for (const row of classified.filter((r) => r.outcome === 'missing')) {
      console.log(`  ${row.username} (${row.fullName || '—'})`);
    }
    console.log('invalid:');
    for (const row of classified.filter((r) => r.outcome === 'invalid')) {
      console.log(`  row ${row.rowNumber} ${row.username || '—'} — ${row.detail}`);
    }
    console.log(`apply candidates: ${applyRows.length}`);
    for (const row of applyRows) {
      console.log(`  ${row.username} role=${row.dbRole}`);
    }

    let updated = 0;
    let revokedSessions = 0;
    const updatedUsernames = [];

    if (apply) {
      if (applyRows.length === 0) {
        console.error('BLOCKED: zero apply candidates');
        process.exit(2);
      }
      for (const row of applyRows) {
        const password = passwordsByUsername.get(row.username);
        if (!password || !row.userId) throw new Error(`Internal: missing password/userId for ${row.username}`);
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const now = new Date();
        const result = await prisma.$transaction(async (tx) => {
          const current = await tx.user.findUnique({
            where: { id: row.userId },
            select: { id: true, username: true, role: true, active: true }
          });
          if (!current) throw new Error(`User vanished: ${row.username}`);
          if (!ALLOWED_ROLES.has(current.role) || PROTECTED_ROLES.has(current.role)) {
            throw new Error(`Role guard failed mid-apply for ${row.username}: ${current.role}`);
          }
          if (!current.active) throw new Error(`User inactive mid-apply: ${row.username}`);
          if (isProtectedUsername(normalizeUsername(current.username))) {
            throw new Error(`Username guard failed mid-apply: ${current.username}`);
          }
          await tx.user.update({
            where: { id: current.id },
            data: {
              passwordHash,
              mustChangePassword,
              passwordChangedAt: null,
              sessionVersion: { increment: 1 }
            }
          });
          const revoked = await tx.authSession.updateMany({
            where: { userId: current.id, revokedAt: null },
            data: { revokedAt: now, revokedReason: REVOKE_REASON }
          });
          return { revoked: revoked.count };
        });
        updated += 1;
        revokedSessions += result.revoked;
        updatedUsernames.push(row.username);
      }
      console.log(`updated: ${updated}; revokedSessions: ${revokedSessions}`);
    } else {
      console.log(`wouldUpdate: ${applyRows.length} (no writes)`);
    }

    const postProtected = await prisma.user.findMany({
      where: { id: { in: preProtected.map((u) => u.id) } },
      select: { id: true, username: true, role: true, passwordHash: true, sessionVersion: true }
    });
    const protectedDiffs = preProtected.map((before) => {
      const after = postProtected.find((u) => u.id === before.id);
      const hashFpAfter = fingerprintHash(after?.passwordHash);
      return {
        username: before.username,
        role: before.role,
        hashUnchanged: before.hashFp === hashFpAfter,
        sessionUnchanged: before.sessionVersion === after?.sessionVersion,
        hashFpBefore: before.hashFp,
        hashFpAfter,
        sessionBefore: before.sessionVersion,
        sessionAfter: after?.sessionVersion
      };
    });
    const protectedOk = protectedDiffs.every((d) => d.hashUnchanged && d.sessionUnchanged);
    console.log(`protected accounts unchanged: ${protectedOk ? 'YES' : 'NO'}`);
    if (!protectedOk) {
      for (const diff of protectedDiffs.filter((d) => !d.hashUnchanged || !d.sessionUnchanged)) {
        console.error(`  DRIFT ${diff.username}`);
      }
      if (apply) process.exitCode = 3;
    }

    const sampleResults = [];
    if (verifySample > 0) {
      const sample = (apply ? updatedUsernames : applyRows.map((r) => r.username)).slice(0, verifySample);
      for (const username of sample) {
        const password = passwordsByUsername.get(username);
        const user = await prisma.user.findUnique({ where: { username }, select: { passwordHash: true } });
        if (!password || !user) {
          sampleResults.push({ username, ok: false });
          continue;
        }
        if (!apply) {
          sampleResults.push({ username, ok: Boolean(user.passwordHash) });
          continue;
        }
        sampleResults.push({ username, ok: await bcrypt.compare(password, user.passwordHash) });
      }
      console.log('verify-sample:', sampleResults.map((s) => `${s.username}:${s.ok ? 'ok' : 'FAIL'}`).join(' '));
      if (apply && sampleResults.some((s) => !s.ok)) process.exitCode = 4;
    }

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      mustChangePassword,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      databaseEndpoint: sanitizeDatabaseEndpoint(process.env.DATABASE_URL),
      file: filePath,
      excelRows: excelRows.length,
      uniqueUsernames: usernames.length,
      counts,
      applyCandidateCount: applyRows.length,
      updated,
      revokedSessions,
      updatedUsernames: apply ? updatedUsernames : [],
      wouldUpdateUsernames: apply ? [] : applyRows.map((r) => r.username),
      missing: classified.filter((r) => r.outcome === 'missing').map((r) => ({ username: r.username, fullName: r.fullName })),
      protected: classified
        .filter((r) => String(r.outcome).startsWith('protected'))
        .map((r) => ({ username: r.username, outcome: r.outcome, detail: r.detail, dbRole: r.dbRole || null })),
      inactive: classified.filter((r) => r.outcome === 'inactive').map((r) => r.username),
      invalid: classified.filter((r) => r.outcome === 'invalid').map((r) => ({ rowNumber: r.rowNumber, username: r.username, detail: r.detail })),
      protectedAccountSnapshots: protectedDiffs,
      protectedAccountsUnchanged: protectedOk,
      verifySample: sampleResults
    };
    assertReportSafe(report);
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(`report: ${jsonOut}`);
    if (!apply) {
      console.log('Dry-run complete. Re-run with --apply --confirm=... --confirm-backup-path=... to write.');
    }
  } finally {
    passwordsByUsername.clear();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('FAILED:', error && error.message ? error.message : error);
  process.exit(1);
});
