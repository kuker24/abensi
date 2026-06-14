import { AcademicService } from './academic.service';

function makePrisma(): any {
  const prisma = {
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
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn()
    },
    academicYear: {
      findUnique: jest.fn(),
      findFirst: jest.fn()
    },
    semester: {
      findUnique: jest.fn(),
      findFirst: jest.fn()
    },
    classEnrollment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    auditEntry: {
      create: jest.fn()
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma))
  } as any;
  return prisma;
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

  it('transfers a student by closing the previous period and opening the new class atomically', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'siswa-1', role: 'SISWA' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-new', code: 'XI-A' });
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', academicYear: { id: 'year-1' } });
    prisma.classEnrollment.findFirst.mockResolvedValue({
      id: 'enroll-old',
      classId: 'class-old',
      studentId: 'siswa-1',
      academicYearId: 'year-1',
      semesterId: 'sem-1',
      effectiveFrom: new Date('2026-06-13T17:00:00.000Z')
    });
    prisma.classEnrollment.update.mockResolvedValue({ id: 'enroll-old', active: false });
    prisma.classEnrollment.create.mockResolvedValue({ id: 'enroll-new', classId: 'class-new', studentId: 'siswa-1' });
    const service = new AcademicService(prisma);

    const result = await service.enrollStudent({ userId: 'siswa-1', classId: 'class-new', semesterId: 'sem-1', effectiveFrom: '2026-06-16' }, 'admin-1');

    expect(result.id).toBe('enroll-new');
    expect(prisma.classEnrollment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'enroll-old' },
      data: expect.objectContaining({ active: false, endedById: 'admin-1' })
    }));
    expect(prisma.classEnrollment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ classId: 'class-new', studentId: 'siswa-1', academicYearId: 'year-1', semesterId: 'sem-1', createdById: 'admin-1' })
    }));
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'student.transferred' }) });
  });

  it('reuses an existing enrollment for the same class and period instead of creating a duplicate', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'siswa-1', role: 'SISWA' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-1', code: 'XI-A' });
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', academicYear: { id: 'year-1' } });
    prisma.classEnrollment.findFirst.mockResolvedValue({
      id: 'enroll-existing',
      classId: 'class-1',
      studentId: 'siswa-1',
      academicYearId: 'year-1',
      semesterId: 'sem-1',
      effectiveFrom: new Date('2026-06-13T17:00:00.000Z')
    });
    const service = new AcademicService(prisma);

    const result = await service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', semesterId: 'sem-1', effectiveFrom: '2026-06-16' }, 'admin-1');

    expect(result.id).toBe('enroll-existing');
    expect(prisma.classEnrollment.create).not.toHaveBeenCalled();
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'student.enrollment_reused' }) });
  });

  it('rejects a semester that does not belong to the selected academic year', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'siswa-1', role: 'SISWA' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-1', code: 'XI-A' });
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-real', academicYear: { id: 'year-real' } });
    const service = new AcademicService(prisma);

    await expect(service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', academicYearId: 'year-wrong', semesterId: 'sem-1', effectiveFrom: '2026-06-16' }, 'admin-1')).rejects.toThrow('Semester tidak berada pada tahun ajaran');
    expect(prisma.classEnrollment.create).not.toHaveBeenCalled();
  });

});
