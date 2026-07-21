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
    studentNkdRegistry: {
      findMany: jest.fn().mockResolvedValue([])
    },
    academicYear: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    semester: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    teachingAssignment: {
      aggregate: jest.fn()
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
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (cb: any) => cb(prisma))
  } as any;
  return prisma;
}

describe('AcademicService', () => {
  const actor = { sub: 'admin-1', role: 'ADMIN_TU' };
  const mockStudentImportPeriod = (prisma: any) => {
    prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1', code: '2026/2027', active: true });
    prisma.semester.findMany.mockResolvedValue([{
      id: 'sem-1',
      academicYearId: 'year-1',
      active: true,
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
      endsAt: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z')
    }]);
  };

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
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', startsAt: new Date('2026-06-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z'), academicYear: { id: 'year-1' } });
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
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', startsAt: new Date('2026-06-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z'), academicYear: { id: 'year-1' } });
    prisma.classEnrollment.findFirst.mockResolvedValue({
      id: 'enroll-existing',
      classId: 'class-1',
      studentId: 'siswa-1',
      academicYearId: 'year-1',
      semesterId: 'sem-1',
      effectiveFrom: new Date('2026-06-13T17:00:00.000Z'),
      effectiveTo: new Date('2026-12-31T00:00:00.000Z')
    });
    const service = new AcademicService(prisma);

    const result = await service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', semesterId: 'sem-1', effectiveFrom: '2026-06-16' }, 'admin-1');

    expect(result.id).toBe('enroll-existing');
    expect(prisma.classEnrollment.create).not.toHaveBeenCalled();
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'student.enrollment_reused' }) });
  });

  it('rejects reuse of a legacy open-ended enrollment', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'siswa-1', role: 'SISWA' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-1', code: 'XI-A' });
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', startsAt: new Date('2026-06-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z'), academicYear: { id: 'year-1' } });
    prisma.classEnrollment.findFirst.mockResolvedValue({
      id: 'enroll-existing', classId: 'class-1', studentId: 'siswa-1', academicYearId: 'year-1', semesterId: 'sem-1', effectiveFrom: new Date('2026-06-13T17:00:00.000Z'), effectiveTo: null
    });
    const service = new AcademicService(prisma);

    await expect(service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', semesterId: 'sem-1', effectiveFrom: '2026-06-16' }, 'admin-1')).rejects.toMatchObject({
      response: { code: 'ENROLLMENT_LEGACY_OPEN_ENDED' }
    });
    expect(prisma.classEnrollment.create).not.toHaveBeenCalled();
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
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', startsAt: new Date('2026-06-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z'), academicYear: { id: 'year-1' } });
    prisma.classEnrollment.findFirst.mockResolvedValue(null);
    prisma.classEnrollment.create.mockResolvedValue({ id: 'enroll-1', active: true, administrativeStatus: 'ACTIVE' });
    const service = new AcademicService(prisma);

    await service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', semesterId: 'sem-1', effectiveFrom: '2026-06-16', effectiveTo: '2026-06-30' }, 'admin-1');

    expect(prisma.classEnrollment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ active: true, administrativeStatus: 'ACTIVE', effectiveTo: expect.any(Date) })
    }));
  });

  it('rejects enrollment starting after the semester end date', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'siswa-1', role: 'SISWA' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-1', code: 'XI-A' });
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', startsAt: new Date('2026-07-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z'), academicYear: { id: 'year-1' } });
    const service = new AcademicService(prisma);

    await expect(service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', semesterId: 'sem-1', effectiveFrom: '2027-01-01' }, 'admin-1')).rejects.toMatchObject({
      response: { code: 'ENROLLMENT_INVALID_PERIOD' }
    });
    expect(prisma.classEnrollment.create).not.toHaveBeenCalled();
  });

  it('rejects enrollment when the active semester has incomplete bounds', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'siswa-1', role: 'SISWA' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-1', code: 'XI-A' });
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', startsAt: null, endsAt: null, academicYear: { id: 'year-1' } });
    const service = new AcademicService(prisma);

    await expect(service.enrollStudent({ userId: 'siswa-1', classId: 'class-1', semesterId: 'sem-1', effectiveFrom: '2026-07-01' }, 'admin-1')).rejects.toMatchObject({
      response: { code: 'SEMESTER_BOUNDS_REQUIRED' }
    });
    expect(prisma.classEnrollment.create).not.toHaveBeenCalled();
  });

  it('uses date-only UTC midnight for roster enrollment visibility', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-04T18:00:00.000Z'));
    try {
      const prisma = makePrisma();
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([]);
      const service = new AcademicService(prisma);

      await service.listStudents({ page: 1, limit: 10, skip: 0 }, 'class-1');

      const where = prisma.user.count.mock.calls[0][0].where;
      const enrollmentWhere = where.enrollments.some;
      const selectedEnrollmentWhere = prisma.user.findMany.mock.calls[0][0].select.enrollments.where;
      expect(enrollmentWhere).toEqual(expect.objectContaining({ classId: 'class-1', active: true, administrativeStatus: 'ACTIVE' }));
      expect(enrollmentWhere.effectiveFrom.lte.toISOString()).toBe('2026-07-05T00:00:00.000Z');
      expect(enrollmentWhere.OR[1].effectiveTo.gte.toISOString()).toBe('2026-07-05T00:00:00.000Z');
      expect(selectedEnrollmentWhere).toEqual(expect.objectContaining({
        active: true,
        administrativeStatus: 'ACTIVE',
        effectiveFrom: { lte: enrollmentWhere.effectiveFrom.lte },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: enrollmentWhere.effectiveFrom.lte } }]
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not hide imported enrollments effective on the same business date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-04T18:00:00.000Z'));
    try {
      const prisma = makePrisma();
      const importedEffectiveFrom = new Date('2026-07-05T00:00:00.000Z');
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([{ id: 'siswa-1', enrollments: [{ effectiveFrom: importedEffectiveFrom, effectiveTo: null, active: true, administrativeStatus: 'ACTIVE' }] }]);
      const service = new AcademicService(prisma);

      const result = await service.listStudents({ page: 1, limit: 10, skip: 0 }, 'class-1');

      const enrollmentWhere = prisma.user.count.mock.calls[0][0].where.enrollments.some;
      expect(importedEffectiveFrom.getTime()).toBeLessThanOrEqual(enrollmentWhere.effectiveFrom.lte.getTime());
      expect(result.meta.total).toBe(1);
      expect(result.items[0].enrollments[0].effectiveFrom).toBe(importedEffectiveFrom);
    } finally {
      jest.useRealTimers();
    }
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

  it('locks academic year then semester and rejects shortening bounds beyond linked teaching assignments', async () => {
    const prisma = makePrisma();
    prisma.semester.findUnique.mockResolvedValue({
      id: 'semester-1',
      academicYearId: 'year-1',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-06-30T00:00:00.000Z'),
      academicYear: { startsAt: new Date('2026-01-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z') },
      active: true
    });
    prisma.teachingAssignment.aggregate.mockResolvedValue({
      _min: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
      _max: { effectiveTo: new Date('2026-06-30T00:00:00.000Z') }
    });
    prisma.$queryRaw = jest.fn(async () => []);
    const service = new AcademicService(prisma);

    await expect(service.updateSemester('semester-1', { endsAt: '2026-06-29' }, actor)).rejects.toMatchObject({
      response: { code: 'SEMESTER_ASSIGNMENT_PERIOD_CONFLICT' }
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.semester.update).not.toHaveBeenCalled();
  });

  it('rejects clearing bounds with linked teaching assignments and permits expanded bounds', async () => {
    const prisma = makePrisma();
    prisma.semester.findUnique.mockResolvedValue({
      id: 'semester-1',
      academicYearId: 'year-1',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-06-30T00:00:00.000Z'),
      academicYear: { startsAt: new Date('2026-01-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z') },
      active: true
    });
    prisma.teachingAssignment.aggregate.mockResolvedValue({
      _min: { effectiveFrom: new Date('2026-01-15T00:00:00.000Z') },
      _max: { effectiveTo: new Date('2026-06-15T00:00:00.000Z') }
    });
    prisma.$queryRaw = jest.fn(async () => []);
    prisma.semester.update.mockResolvedValue({ id: 'semester-1', startsAt: new Date('2026-01-01T00:00:00.000Z'), endsAt: new Date('2026-07-31T00:00:00.000Z') });
    const service = new AcademicService(prisma);

    await expect(service.updateSemester('semester-1', { startsAt: '' }, actor)).rejects.toMatchObject({
      response: { code: 'SEMESTER_BOUNDS_REQUIRED' }
    });
    await service.updateSemester('semester-1', { startsAt: '2026-01-01', endsAt: '2026-07-31' }, actor);
    expect(prisma.semester.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startsAt: new Date('2026-01-01T00:00:00.000Z'), endsAt: new Date('2026-07-31T00:00:00.000Z') })
    }));
  });

  it('keeps semester patch fields normal while preserving assignment-bound conflict checks', async () => {
    const prisma = makePrisma();
    prisma.semester.findUnique.mockResolvedValue({
      id: 'semester-1', academicYearId: 'year-1', startsAt: new Date('2026-01-01T00:00:00.000Z'), endsAt: new Date('2026-06-30T00:00:00.000Z'),
      academicYear: { startsAt: new Date('2026-01-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z') }, active: true
    });
    prisma.teachingAssignment.aggregate.mockResolvedValue({
      _min: { effectiveFrom: null }, _max: { effectiveTo: null }
    });
    prisma.$queryRaw = jest.fn(async () => []);
    prisma.semester.update.mockResolvedValue({ id: 'semester-1', code: 'GENAP-2', name: 'Genap Perbaikan', active: false });
    const service = new AcademicService(prisma);

    await service.updateSemester('semester-1', { code: 'GENAP-2', name: 'Genap Perbaikan', active: false }, actor);

    expect(prisma.semester.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: 'GENAP-2', name: 'Genap Perbaikan', active: false })
    }));
  });

  it('requires complete date-only academic year bounds for creation', async () => {
    const prisma = makePrisma();
    const service = new AcademicService(prisma);

    await expect(service.createAcademicYear({ code: '2026', name: '2026/2027' }, actor)).rejects.toMatchObject({
      response: { code: 'ACADEMIC_YEAR_BOUNDS_REQUIRED' }
    });
    await expect(service.createAcademicYear({
      code: '2026', name: '2026/2027', startsAt: '2026-07-01T00:00:00.000Z', endsAt: '2027-06-30'
    } as any, actor)).rejects.toMatchObject({ response: { code: 'ACADEMIC_YEAR_BOUNDS_REQUIRED' } });
  });

  it('locks parent year and rejects a semester outside complete academic-year bounds', async () => {
    const prisma = makePrisma();
    const events: string[] = [];
    prisma.$queryRaw = jest.fn(async (query: any) => {
      const sql = query.strings?.join('?') ?? '';
      if (sql.includes('AcademicYear')) events.push('year.lock');
      if (sql.includes('Semester')) events.push('semester.lock');
      return [];
    });
    prisma.academicYear.findUnique.mockResolvedValue({
      id: 'year-1', startsAt: new Date('2026-07-01T00:00:00.000Z'), endsAt: new Date('2027-06-30T00:00:00.000Z')
    });
    const service = new AcademicService(prisma);

    await expect(service.createSemester({
      academicYearId: 'year-1', code: 'GANJIL', name: 'Ganjil', startsAt: '2026-06-30', endsAt: '2026-12-31'
    }, actor)).rejects.toMatchObject({ response: { code: 'SEMESTER_OUTSIDE_ACADEMIC_YEAR' } });
    expect(events).toEqual(['year.lock']);
  });

  it('rejects academic-year shortening that excludes an existing semester', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw = jest.fn(async () => []);
    prisma.academicYear.findUnique.mockResolvedValue({
      id: 'year-1', startsAt: new Date('2026-07-01T00:00:00.000Z'), endsAt: new Date('2027-06-30T00:00:00.000Z')
    });
    prisma.semester.findMany.mockResolvedValue([{
      id: 'semester-1', startsAt: new Date('2026-07-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z')
    }]);
    const service = new AcademicService(prisma);

    await expect(service.updateAcademicYear('year-1', { endsAt: '2026-11-30' }, actor)).rejects.toMatchObject({
      response: { code: 'ACADEMIC_YEAR_SEMESTER_PERIOD_CONFLICT' }
    });
    expect(prisma.academicYear.update).not.toHaveBeenCalled();
  });

  it('normalizes imported usernames without ambiguous dot-trimming regexes', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.schoolClass.findMany.mockResolvedValue([{ code: 'X-A' }]);
    mockStudentImportPeriod(prisma);
    const service = new AcademicService(prisma);

    const preview = await service.previewStudentsImport([
      { fullName: 'Siswa Sanitizer', username: `${'.'.repeat(500)}Siswa@@@Import...`, classCode: 'X-A', nkd: '0001', yearLabel: '2026/2027' }
    ], '2026/2027');

    expect(preview.summary.invalid).toBe(0);
    expect(preview.rows[0].username).toBe('siswa.import');
  });

  it('requires a unique four-digit NKD for newly imported students', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.schoolClass.findMany.mockResolvedValue([{ code: 'X-A' }]);
    mockStudentImportPeriod(prisma);
    const service = new AcademicService(prisma);

    const preview = await service.previewStudentsImport([
      { fullName: 'Siswa Tanpa NKD', classCode: 'X-A', yearLabel: '2026/2027' },
      { fullName: 'Siswa NKD Salah', classCode: 'X-A', nkd: '12A4', yearLabel: '2026/2027' },
      { fullName: 'Siswa NKD Satu', classCode: 'X-A', nkd: '0001', yearLabel: '2026/2027' },
      { fullName: 'Siswa NKD Dua', classCode: 'X-A', nkd: '0001', yearLabel: '2026/2027' }
    ], '2026/2027');

    expect(preview.summary.invalid).toBe(3);
    expect(preview.rows[0].errors).toContain('NKD wajib diisi untuk siswa baru');
    expect(preview.rows[1].errors).toContain('NKD harus tepat empat digit angka');
    expect(preview.rows[3].errors).toContain('NKD duplikat di file');
  });

  it('assigns NKD when importing a new student', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.schoolClass.findMany.mockResolvedValue([{ id: 'class-1', code: 'X-A' }]);
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'class-1', code: 'X-A' });
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'student-1', role: 'SISWA' });
    prisma.user.create.mockResolvedValue({ id: 'student-1', username: 'siswa.nkd', fullName: 'Siswa NKD', nkd: '0001', role: 'SISWA' });
    prisma.classEnrollment.findFirst.mockResolvedValue(null);
    mockStudentImportPeriod(prisma);
    prisma.semester.findUnique.mockResolvedValue({ id: 'sem-1', academicYearId: 'year-1', startsAt: new Date('2026-07-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z'), academicYear: { id: 'year-1' } });
    prisma.classEnrollment.create.mockResolvedValue({ id: 'enroll-1' });
    const service = new AcademicService(prisma);

    const result = await service.commitStudentsImport([{ fullName: 'Siswa NKD', username: 'siswa.nkd', classCode: 'X-A', nkd: '0001', yearLabel: '2026/2027', password: 'KnownSourcePassword!' }], actor, '2026/2027');

    expect(result.credentialRows?.[0].temporaryPassword).not.toBe('KnownSourcePassword!');
    expect(result.credentialRows?.[0].note).toBe('Password dibuat otomatis');
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nkd: '0001', role: 'SISWA', mustChangePassword: true, passwordChangedAt: null })
    }));
    expect(prisma.classEnrollment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ academicYearId: 'year-1', semesterId: 'sem-1', effectiveTo: new Date('2026-12-31T00:00:00.000Z') })
    }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects student import when selected year has multiple active semesters', async () => {
    const prisma = makePrisma();
    prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1', code: '2026/2027', active: true });
    prisma.semester.findMany.mockResolvedValue([
      { id: 'sem-1', startsAt: new Date('2026-07-01T00:00:00.000Z'), endsAt: new Date('2026-12-31T00:00:00.000Z') },
      { id: 'sem-2', startsAt: new Date('2027-01-01T00:00:00.000Z'), endsAt: new Date('2027-06-30T00:00:00.000Z') }
    ]);
    const service = new AcademicService(prisma);

    await expect(service.previewStudentsImport([], '2026/2027')).rejects.toMatchObject({ response: { code: 'IMPORT_SEMESTER_AMBIGUOUS' } });
  });

  it('marks workbook rows invalid when yearLabel differs from selected academic year', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.schoolClass.findMany.mockResolvedValue([{ code: 'X-A' }]);
    mockStudentImportPeriod(prisma);
    const service = new AcademicService(prisma);

    const preview = await service.previewStudentsImport([{ fullName: 'Siswa Salah Tahun', classCode: 'X-A', nkd: '0001', yearLabel: '2025/2026' }], '2026/2027');

    expect(preview.summary.invalid).toBe(1);
    expect(preview.rows[0].errors).toContain('Tahun ajaran baris tidak sesuai tahun ajaran yang dipilih');
  });

});
