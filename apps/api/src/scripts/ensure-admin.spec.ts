import { Role } from '@prisma/client';
import { ensureProductionAdmin, validateAdminUsername, validateInitialPassword } from './ensure-admin';

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { hash: jest.fn(async (password: string) => `hash:${password}`) }
}));

type UserRecord = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  active: boolean;
  passwordHash: string;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
};

function makePrisma(seed: UserRecord[] = [], counts = { classes: 0, sessions: 0 }) {
  const users = [...seed];
  const create = jest.fn(async ({ data }: { data: Omit<UserRecord, 'id' | 'passwordChangedAt'> }) => {
    const user: UserRecord = { id: `user-${users.length + 1}`, passwordChangedAt: null, ...data };
    users.push(user);
    return user;
  });
  const tx = {
    $executeRawUnsafe: jest.fn(async () => undefined),
    auditEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'audit-1', ...data })),
      findMany: jest.fn(async () => [])
    },
    auditChainState: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => undefined)
    },
    user: { create }
  };
  const prisma = {
    users,
    tx,
    user: {
      findUnique: jest.fn(async ({ where }: { where: { username: string } }) => users.find((user) => user.username === where.username) ?? null),
      count: jest.fn(async ({ where }: { where?: { role?: Role } } = {}) => where?.role ? users.filter((user) => user.role === where.role).length : users.length)
    },
    schoolClass: { count: jest.fn(async () => counts.classes) },
    session: { count: jest.fn(async () => counts.sessions) },
    $transaction: jest.fn(async (callback: (arg: typeof tx) => Promise<unknown>) => callback(tx))
  };
  return prisma;
}

const strongEnv = {
  ADMIN_BOOTSTRAP_ENABLED: 'true',
  ADMIN_USERNAME: 'bootstrap.admin',
  ADMIN_PASSWORD: 'TataUsaha#2026Strong!'
};

describe('ensureProductionAdmin', () => {
  it('creates one admin in a fresh database', async () => {
    const prisma = makePrisma();
    const result = await ensureProductionAdmin(prisma as never, { env: strongEnv });

    expect(result.action).toBe('created');
    expect(result.adminCount).toBe(1);
    expect(prisma.users).toHaveLength(1);
    expect(prisma.users[0]).toEqual(expect.objectContaining({ role: Role.ADMIN_TU, active: true, mustChangePassword: true }));
    expect(prisma.tx.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'auth.admin_bootstrap.created' }) });
  });

  it('is idempotent and creates no duplicate on second execution', async () => {
    const existing: UserRecord = {
      id: 'admin-1',
      username: 'bootstrap.admin',
      fullName: 'Admin TU',
      role: Role.ADMIN_TU,
      active: true,
      passwordHash: 'hash',
      mustChangePassword: true,
      passwordChangedAt: null
    };
    const prisma = makePrisma([existing]);
    const result = await ensureProductionAdmin(prisma as never, { env: strongEnv });

    expect(result.action).toBe('verified');
    expect(prisma.users).toHaveLength(1);
    expect(prisma.tx.user.create).not.toHaveBeenCalled();
  });

  it('rejects weak passwords', async () => {
    const prisma = makePrisma();
    await expect(ensureProductionAdmin(prisma as never, { env: { ...strongEnv, ADMIN_PASSWORD: 'Short#1' } })).rejects.toThrow('terlalu pendek');
    expect(prisma.tx.user.create).not.toHaveBeenCalled();
  });

  it('rejects placeholder passwords', async () => {
    const prisma = makePrisma();
    await expect(ensureProductionAdmin(prisma as never, { env: { ...strongEnv, ADMIN_PASSWORD: 'Dosen324#Strong2026' } })).rejects.toThrow('placeholder');
    expect(prisma.tx.user.create).not.toHaveBeenCalled();
  });

  it('fails safely when username exists with a non-admin role', async () => {
    const prisma = makePrisma([{
      id: 'teacher-1',
      username: 'bootstrap.admin',
      fullName: 'Teacher',
      role: Role.GURU_MAPEL,
      active: true,
      passwordHash: 'hash',
      mustChangePassword: false,
      passwordChangedAt: null
    }]);

    await expect(ensureProductionAdmin(prisma as never, { env: strongEnv })).rejects.toThrow('menolak promosi otomatis');
    expect(prisma.tx.user.create).not.toHaveBeenCalled();
  });

  it('check-only mode makes no mutation', async () => {
    const prisma = makePrisma();
    const result = await ensureProductionAdmin(prisma as never, { env: strongEnv, checkOnly: true });

    expect(result.action).toBe('would-create');
    expect(result.mutated).toBe(false);
    expect(prisma.users).toHaveLength(0);
    expect(prisma.tx.user.create).not.toHaveBeenCalled();
  });

  it('does not create demo data', async () => {
    const prisma = makePrisma([], { classes: 2, sessions: 3 });
    await ensureProductionAdmin(prisma as never, { env: strongEnv });

    expect(prisma.schoolClass.count).toHaveBeenCalled();
    expect(prisma.session.count).toHaveBeenCalled();
    expect(prisma.users.filter((user) => user.role === Role.GURU_MAPEL || user.role === Role.SISWA)).toHaveLength(0);
  });

  it('keeps developer bootstrap disabled unless explicitly enabled', async () => {
    const prisma = makePrisma();
    const result = await ensureProductionAdmin(prisma as never, { env: strongEnv, checkOnly: true });
    expect(result.developerBootstrapEnabled).toBe(false);

    const enabled = await ensureProductionAdmin(prisma as never, { env: { ...strongEnv, DEVELOPER_BOOTSTRAP_ENABLED: 'true' }, checkOnly: true });
    expect(enabled.developerBootstrapEnabled).toBe(true);
  });
});

describe('admin bootstrap validation helpers', () => {
  it('validates username format', () => {
    expect(validateAdminUsername('Admin.TU')).toBe('admin.tu');
    expect(() => validateAdminUsername('bad username')).toThrow('ADMIN_USERNAME tidak valid');
  });

  it('requires strong initial password', () => {
    expect(() => validateInitialPassword('TataUsaha#2026Strong!', 'bootstrap.admin')).not.toThrow();
    expect(() => validateInitialPassword('passwordPassword#2026', 'bootstrap.admin')).toThrow('placeholder');
  });
});
