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
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn()
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
      findUnique: jest.fn(),
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
    prisma.classEnrollment.update.mockResolvedValue({ id: 'enroll-old', active: true, effectiveTo: new Date('2026-06-14T17:00:00.000Z') });
    prisma.classEnrollment.create.mockResolvedValue({ id: 'enroll-new', classId: 'class-new', studentId: 'siswa-1' });
    const service = new AcademicService(prisma);

    const result = await service.enrollStudent({ userId: 'siswa-1', classId: 'class-new', semesterId: 'sem-1', effectiveFrom: '2026-06-16' }, 'admin-1');

    expect(result.id).toBe('enroll-new');
    expect(prisma.classEnrollment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'enroll-old' },
      data: expect.objectContaining({ endedById: 'admin-1', effectiveTo: expect.any(Date) })
    }));
    expect(prisma.classEnrollment.update.mock.calls[0][0].data.active).toBeUndefined();
    expect(prisma.classEnrollment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ classId: 'class-new', studentId: 'siswa-1', academicYearId: 'year-1', semesterId: 'sem-1', active: true, administrativeStatus: 'ACTIVE', createdById: 'admin-1' })
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

  it('keeps a future effectiveTo administratively active during creation', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'siswa-1', role: 'SISWA' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-1', code: 'XI-A' });
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', academicYear: { id: 'year-1' } });
    prisma.classEnrollment.findFirst.mockResolvedValue(null);
    prisma.classEnrollment.create.mockResolvedValue({ id: 'enroll-1', active: true, administrativeStatus: 'ACTIVE' });
    const service = new AcademicService(prisma);

    await service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', semesterId: 'sem-1', effectiveFrom: '2026-06-16', effectiveTo: '2026-06-30' }, 'admin-1');

    expect(prisma.classEnrollment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ active: true, administrativeStatus: 'ACTIVE', effectiveTo: expect.any(Date) })
    }));
  });

  it('lists only enrollments valid for today instead of treating active=true as open ended', async () => {
    const prisma = makePrisma();
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([]);
    const service = new AcademicService(prisma);

    await service.listStudents({ page: 1, limit: 10, skip: 0 }, 'class-1');

    expect(prisma.user.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      enrollments: { some: expect.objectContaining({ classId: 'class-1', active: true, administrativeStatus: 'ACTIVE', effectiveFrom: expect.objectContaining({ lte: expect.any(Date) }) }) }
    }) });
    expect(prisma.user.count.mock.calls[0][0].where.enrollments.some.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: expect.any(Date) } }]);
    expect(prisma.user.findMany.mock.calls[0][0].select.enrollments.where).toEqual(expect.objectContaining({ active: true, administrativeStatus: 'ACTIVE' }));
  });

  it('administratively cancels an enrollment without mutating its effective dates', async () => {
    const prisma = makePrisma();
    prisma.classEnrollment.findUnique.mockResolvedValue({ id: 'enroll-1', active: true, administrativeStatus: 'ACTIVE', effectiveFrom: new Date('2026-06-16T00:00:00.000Z'), effectiveTo: new Date('2026-06-30T00:00:00.000Z') });
    prisma.classEnrollment.update.mockResolvedValue({ id: 'enroll-1', active: false, administrativeStatus: 'CANCELLED' });
    const service = new AcademicService(prisma);

    await service.setEnrollmentAdministrativeStatus('enroll-1', 'CANCELLED', 'Pembatalan administratif karena salah input kelas', actor);

    expect(prisma.classEnrollment.update).toHaveBeenCalledWith({
      where: { id: 'enroll-1' },
      data: expect.objectContaining({ active: false, administrativeStatus: 'CANCELLED', administrativeStatusReason: 'Pembatalan administratif karena salah input kelas' })
    });
    expect(prisma.classEnrollment.update.mock.calls[0][0].data.effectiveFrom).toBeUndefined();
    expect(prisma.classEnrollment.update.mock.calls[0][0].data.effectiveTo).toBeUndefined();
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'student.enrollment_cancelled' }) });
  });

  it('normalizes imported usernames without ambiguous dot-trimming regexes', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.schoolClass.findMany.mockResolvedValue([{ code: 'X-A' }]);
    const service = new AcademicService(prisma);

    const preview = await service.previewStudentsImport([
      { fullName: 'Siswa Sanitizer', username: `${'.'.repeat(500)}Siswa@@@Import...`, classCode: 'X-A' }
    ]);

    expect(preview.summary.invalid).toBe(0);
    expect(preview.rows[0].username).toBe('siswa.import');
  });

});
