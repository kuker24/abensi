import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { auditedTransaction } from '../common/audit-log';
import { validateAdminUsername, validateInitialPassword } from './ensure-admin';

const prisma = new PrismaClient();

function envValue(name: string) {
  return process.env[name]?.trim() ?? '';
}

async function main() {
  const enabled = envValue('DEVELOPER_BOOTSTRAP_ENABLED') === 'true';
  if (!enabled) {
    console.log(JSON.stringify({ ok: true, action: 'disabled', developerBootstrapEnabled: false }, null, 2));
    return;
  }

  const username = validateAdminUsername(envValue('DEVELOPER_USERNAME') || 'developer');
  const fullName = envValue('DEVELOPER_FULL_NAME') || 'Developer SchoolHub';
  const password = envValue('DEVELOPER_PASSWORD');
  validateInitialPassword(password, username, 'DEVELOPER_PASSWORD');

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    if (existing.role !== Role.DEVELOPER) {
      throw new Error(`DEVELOPER_USERNAME sudah dipakai role ${existing.role}; bootstrap menolak promosi otomatis.`);
    }
    if (!existing.active) throw new Error('DEVELOPER_USERNAME sudah ada sebagai DEVELOPER tetapi tidak aktif. Review manual diperlukan.');
    console.log(JSON.stringify({ ok: true, action: 'verified', username, mutated: false, developerBootstrapEnabled: true }, null, 2));
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await auditedTransaction<{ id: string; username: string }>(prisma, async ({ tx, audit }) => {
    const user = await (tx as unknown as PrismaClient).user.create({
      data: {
        username,
        fullName,
        role: Role.DEVELOPER,
        active: true,
        mustChangePassword: true,
        passwordHash
      }
    });
    await audit.write({
      actorId: 'system:developer-bootstrap',
      actorRole: Role.DEVELOPER,
      module: 'auth',
      action: 'auth.developer_bootstrap.created',
      resource: 'User',
      resourceId: user.id,
      reason: 'Explicit production DEVELOPER bootstrap account created with forced password change.',
      after: {
        username,
        role: Role.DEVELOPER,
        active: true,
        mustChangePassword: true
      }
    });
    return user;
  });

  console.log(JSON.stringify({ ok: true, action: 'created', username: created.username, mutated: true, developerBootstrapEnabled: true }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
