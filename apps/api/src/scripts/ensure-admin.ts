import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { auditedTransaction } from '../common/audit-log';

export type AdminBootstrapEnv = Record<string, string | undefined>;

type BootstrapPrisma = Pick<PrismaClient, '$transaction'> & {
  user: Pick<PrismaClient['user'], 'findUnique' | 'count'>;
};

export interface AdminBootstrapOptions {
  checkOnly?: boolean;
  env?: AdminBootstrapEnv;
}

export interface AdminBootstrapResult {
  ok: boolean;
  action: 'created' | 'verified' | 'would-create' | 'disabled';
  username: string;
  adminCount: number;
  mutated: boolean;
  developerBootstrapEnabled: boolean;
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const PLACEHOLDER_FRAGMENTS = [
  'changeme',
  'change-me',
  'password',
  'admin123',
  'example',
  'default',
  'secret',
  'dosen324'
];

function envValue(env: AdminBootstrapEnv, name: string) {
  return env[name]?.trim() ?? '';
}

export function validateAdminUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error('ADMIN_USERNAME tidak valid. Gunakan 3-64 karakter: huruf kecil, angka, titik, underscore, atau minus; wajib diawali huruf/angka.');
  }
  return normalized;
}

export function validateInitialPassword(password: string, username: string, label = 'ADMIN_PASSWORD') {
  if (!password) throw new Error(`${label} wajib diisi saat akun belum ada.`);
  if (password.length < 14) throw new Error(`${label} terlalu pendek. Minimal 14 karakter.`);
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error(`${label} harus berisi huruf kecil, huruf besar, angka, dan simbol.`);
  }
  const lowered = password.toLowerCase();
  const compact = lowered.replace(/[^a-z0-9]/g, '');
  for (const placeholder of PLACEHOLDER_FRAGMENTS) {
    if (lowered.includes(placeholder) || compact.includes(placeholder.replace(/[^a-z0-9]/g, ''))) {
      throw new Error(`${label} memakai placeholder atau pola yang mudah ditebak.`);
    }
  }
  const usernameCompact = username.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (usernameCompact.length >= 4 && compact.includes(usernameCompact)) {
    throw new Error(`${label} tidak boleh memuat username.`);
  }
  if (/^(.)\1+$/.test(password)) throw new Error(`${label} tidak boleh berupa karakter berulang.`);
}

function assertBootstrapEnabled(env: AdminBootstrapEnv) {
  if (envValue(env, 'ADMIN_BOOTSTRAP_ENABLED') !== 'true') {
    throw new Error('ADMIN_BOOTSTRAP_ENABLED=true wajib diset untuk menjalankan bootstrap admin produksi.');
  }
}

async function nonAdminDataCounts(prisma: BootstrapPrisma) {
  const [teacherCount, studentCount, classCount, sessionCount] = await Promise.all([
    prisma.user.count({ where: { role: Role.GURU_MAPEL } }),
    prisma.user.count({ where: { role: Role.SISWA } }),
    (prisma as unknown as { schoolClass?: { count: () => Promise<number> } }).schoolClass?.count?.() ?? Promise.resolve(0),
    (prisma as unknown as { session?: { count: () => Promise<number> } }).session?.count?.() ?? Promise.resolve(0)
  ]);
  return { teacherCount, studentCount, classCount, sessionCount };
}

function assertNonAdminDataUnchanged(before: Awaited<ReturnType<typeof nonAdminDataCounts>>, after: Awaited<ReturnType<typeof nonAdminDataCounts>>) {
  for (const key of Object.keys(before) as Array<keyof typeof before>) {
    if (before[key] !== after[key]) {
      throw new Error('Admin bootstrap unexpectedly changed non-admin/demo data. Aborting for manual review.');
    }
  }
}

export async function ensureProductionAdmin(prisma: BootstrapPrisma, options: AdminBootstrapOptions = {}): Promise<AdminBootstrapResult> {
  const env = options.env ?? process.env;
  assertBootstrapEnabled(env);
  const username = validateAdminUsername(envValue(env, 'ADMIN_USERNAME') || 'admin.tu');
  const password = envValue(env, 'ADMIN_PASSWORD');
  const fullName = envValue(env, 'ADMIN_FULL_NAME') || 'Admin TU';
  const checkOnly = Boolean(options.checkOnly);
  const developerBootstrapEnabled = envValue(env, 'DEVELOPER_BOOTSTRAP_ENABLED') === 'true';

  const existing = await prisma.user.findUnique({ where: { username } });
  const adminCountBefore = await prisma.user.count({ where: { role: Role.ADMIN_TU } });
  const nonAdminCountsBefore = await nonAdminDataCounts(prisma);

  if (existing) {
    if (existing.role !== Role.ADMIN_TU) {
      throw new Error(`ADMIN_USERNAME sudah dipakai role ${existing.role}; bootstrap menolak promosi otomatis.`);
    }
    if (!existing.active) throw new Error('ADMIN_USERNAME sudah ada sebagai ADMIN_TU tetapi tidak aktif. Aktifkan secara manual setelah verifikasi.');
    if (!existing.mustChangePassword && !existing.passwordChangedAt) {
      throw new Error('ADMIN_USERNAME sudah ada tetapi status password awal tidak jelas. Lakukan review manual.');
    }
    return {
      ok: true,
      action: 'verified',
      username,
      adminCount: adminCountBefore,
      mutated: false,
      developerBootstrapEnabled
    };
  }

  validateInitialPassword(password, username);

  if (checkOnly) {
    return {
      ok: true,
      action: 'would-create',
      username,
      adminCount: adminCountBefore,
      mutated: false,
      developerBootstrapEnabled
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await auditedTransaction<{ id: string; username: string; mustChangePassword: boolean }>(prisma as unknown as PrismaClient, async ({ tx, audit }) => {
    const user = await (tx as unknown as PrismaClient).user.create({
      data: {
        username,
        fullName,
        role: Role.ADMIN_TU,
        active: true,
        mustChangePassword: true,
        passwordHash
      }
    });
    await audit.write({
      actorId: 'system:admin-bootstrap',
      actorRole: Role.ADMIN_TU,
      module: 'auth',
      action: 'auth.admin_bootstrap.created',
      resource: 'User',
      resourceId: user.id,
      reason: 'Production ADMIN_TU bootstrap account created with forced password change.',
      after: {
        username,
        role: Role.ADMIN_TU,
        active: true,
        mustChangePassword: true
      }
    });
    return user;
  });

  const adminCountAfter = await prisma.user.count({ where: { role: Role.ADMIN_TU } });
  assertNonAdminDataUnchanged(nonAdminCountsBefore, await nonAdminDataCounts(prisma));

  if (!created.mustChangePassword) throw new Error('Admin bootstrap invariant failed: mustChangePassword is false.');
  return {
    ok: true,
    action: 'created',
    username,
    adminCount: adminCountAfter,
    mutated: true,
    developerBootstrapEnabled
  };
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await ensureProductionAdmin(prisma, { checkOnly: hasFlag('--check-only') });
    console.log(JSON.stringify({
      ok: result.ok,
      action: result.action,
      username: result.username,
      adminCount: result.adminCount,
      mutated: result.mutated,
      developerBootstrapEnabled: result.developerBootstrapEnabled
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
