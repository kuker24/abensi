import { AcademicService } from './academic.service';

function makePrisma(): any {
  return {
    schoolClass: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn()
    },
    subject: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn()
    },
    user: {
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn()
    },
    classEnrollment: {
      upsert: jest.fn()
    },
    auditEntry: {
      create: jest.fn()
    },
    $transaction: jest.fn(async (cb: any) => cb(makePrisma()))
  } as any;
}

describe('AcademicService', () => {
  const actor = { sub: 'admin-1', role: 'ADMIN_TU' };

  it('updates class and writes audit', async () => {
    const prisma = makePrisma();
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'c1', code: 'X-A', name: 'X A' });
    prisma.schoolClass.update.mockResolvedValue({ id: 'c1', code: 'X-A', name: 'X A Baru' });
    const service = new AcademicService(prisma);

    const result = await service.updateClass('c1', { name: 'X A Baru' }, actor);

    expect(result.name).toBe('X A Baru');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ module: 'academic', action: 'class.updated' }) });
  });

  it('updates subject and writes audit', async () => {
    const prisma = makePrisma();
    prisma.subject.findUnique.mockResolvedValue({ id: 's1', code: 'MTK', name: 'Matematika' });
    prisma.subject.update.mockResolvedValue({ id: 's1', code: 'MTK', name: 'Matematika Wajib' });
    const service = new AcademicService(prisma);

    const result = await service.updateSubject('s1', { name: 'Matematika Wajib' }, actor);

    expect(result.name).toBe('Matematika Wajib');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ module: 'academic', action: 'subject.updated' }) });
  });

  it('previews valid academic import rows', async () => {
    const prisma = makePrisma();
    prisma.schoolClass.findMany.mockResolvedValue([{ code: 'X-A' }]);
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([{ username: 'siswa1', role: 'SISWA' }]);
    const service = new AcademicService(prisma);

    const preview = await service.previewImport([
      { type: 'class', code: 'XI-A', name: 'XI A', yearLabel: '2026/2027' },
      { type: 'enrollment', username: 'siswa1', classCode: 'X-A' }
    ]);

    expect(preview.summary).toEqual({ total: 2, valid: 2, invalid: 0 });
  });

  it('does not commit invalid academic import rows', async () => {
    const prisma = makePrisma();
    prisma.schoolClass.findMany.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    const service = new AcademicService(prisma);

    const result = await service.commitImport([{ type: 'enrollment', username: 'missing', classCode: 'MISSING' }], actor);

    expect(result.committed).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
