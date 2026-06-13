import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.DEVELOPER_USERNAME || 'developer';
  const fullName = process.env.DEVELOPER_FULL_NAME || 'Developer SchoolHub';
  const configuredPassword = process.env.DEVELOPER_PASSWORD || '';
  const fallbackPassword = process.env.ADMIN_PASSWORD || '';
  if (!configuredPassword && !fallbackPassword) {
    throw new Error('DEVELOPER_PASSWORD atau ADMIN_PASSWORD wajib diisi.');
  }
  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName,
        role: Role.DEVELOPER,
        active: true,
        ...(configuredPassword ? { passwordHash: await bcrypt.hash(configuredPassword, 10) } : {})
      }
    });
    console.log(`Developer account ensured: ${username} (existing)`);
    return;
  }

  const passwordHash = await bcrypt.hash(configuredPassword || fallbackPassword, 10);
  await prisma.user.create({
    data: {
      username,
      fullName,
      role: Role.DEVELOPER,
      active: true,
      passwordHash
    }
  });
  console.log(`Developer account ensured: ${username} (created)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
