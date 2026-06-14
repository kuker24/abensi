import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { CardStatus, Prisma, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { addCalendarDays, businessDateKey, businessDayBounds } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAcademicYearDto, CreateClassDto, CreateRoomDto, CreateSemesterDto, CreateStudentDto, CreateSubjectDto, ImportAcademicRowDto, ImportStudentRowDto, UpdateAcademicYearDto, UpdateClassDto, UpdateRoomDto, UpdateSemesterDto, UpdateSubjectDto } from './academic.dto';

type NormalizedStudentImportRow = {
  index: number;
  fullName: string;
  username: string;
  classCode: string;
  className: string;
  yearLabel: string;
  password: string;
  generatedUsername: boolean;
  generatedPassword: boolean;
  existingUser: boolean;
  classWillBeCreated: boolean;
  errors: string[];
};

const STUDENT_IMPORT_NAME_KEYS = ['fullName', 'Nama Lengkap', 'Nama', 'nama', 'name', 'Name'];
const STUDENT_IMPORT_USERNAME_KEYS = ['username', 'Username', 'Nama akun', 'Nama Akun', 'ID', 'id'];
const STUDENT_IMPORT_CLASS_KEYS = ['classCode', 'Kelas/Jabatan', 'Kelas', 'kelas', 'Class', 'Level', 'level'];
const STUDENT_IMPORT_CLASS_NAME_KEYS = ['className', 'Nama Kelas', 'Class Name'];
const STUDENT_IMPORT_PASSWORD_KEYS = ['password', 'Password', 'Kata Sandi', 'Kata sandi'];
const STUDENT_IMPORT_YEAR_KEYS = ['yearLabel', 'Tahun Ajaran', 'Tahun ajaran'];
const STUDENT_IMPORT_ROLE_KEYS = ['role', 'Role', 'Peran'];

function pickValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = String(row[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function cleanImportText(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function currentYearLabel() {
  const year = new Date().getFullYear();
  return `${year}/${year + 1}`;
}

function slugUsername(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 28);
  return base || `siswa.${Date.now()}`;
}

function uniqueUsername(base: string, used: Set<string>) {
  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base}.${counter}`.slice(0, 40);
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function temporaryPassword() {
  return `Ehadir#${randomBytes(5).toString('base64url')}`;
}

function dbDateFromBusinessKey(key: string) {
  return businessDayBounds(key).date;
}

function schoolBusinessDate(value: Date | string = new Date()) {
  return dbDateFromBusinessKey(typeof value === 'string' ? businessDateKey(new Date(value)) : businessDateKey(value));
}

function previousBusinessDate(value: Date) {
  return dbDateFromBusinessKey(addCalendarDays(businessDateKey(value), -1));
}

function enrollmentConflictCode(error: unknown) {
  const text = `${error instanceof Error ? error.message : ''} ${JSON.stringify((error as { meta?: unknown })?.meta ?? {})}`;
  if (text.includes('ClassEnrollment_student_no_overlap_excl')) return 'ENROLLMENT_PERIOD_OVERLAP';
  if (text.includes('ClassEnrollment_valid_period_chk')) return 'ENROLLMENT_INVALID_PERIOD';
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return 'ENROLLMENT_CONCURRENT_TRANSFER';
  return null;
}

@Injectable()
export class AcademicService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveAcademicPeriod(
    tx: Prisma.TransactionClient,
    payload: { academicYearId?: string; semesterId?: string }
  ) {
    if (payload.semesterId) {
      const semester = await tx.semester.findUnique({ where: { id: payload.semesterId }, include: { academicYear: true } });
      if (!semester) throw new BadRequestException('Semester tidak ditemukan.');
      if (payload.academicYearId && semester.academicYearId !== payload.academicYearId) {
        throw new BadRequestException({ code: 'SEMESTER_YEAR_MISMATCH', message: 'Semester tidak berada pada tahun ajaran yang dipilih.' });
      }
      return { academicYearId: semester.academicYearId, semesterId: semester.id };
    }

    const academicYearId = payload.academicYearId;
    const semester = await tx.semester.findFirst({
      where: {
        active: true,
        ...(academicYearId ? { academicYearId } : { academicYear: { active: true } })
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }]
    });
    if (semester) return { academicYearId: semester.academicYearId, semesterId: semester.id };

    const activeYear = academicYearId
      ? await tx.academicYear.findUnique({ where: { id: academicYearId } })
      : await tx.academicYear.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } });
    if (!activeYear) {
      throw new BadRequestException({ code: 'ACADEMIC_PERIOD_REQUIRED', message: 'Tahun ajaran dan semester aktif wajib tersedia sebelum mendaftarkan siswa.' });
    }
    throw new BadRequestException({ code: 'SEMESTER_REQUIRED', message: 'Semester aktif wajib tersedia sebelum mendaftarkan siswa.' });
  }

  private async createEnrollmentTransfer(
    tx: Prisma.TransactionClient,
    payload: CreateStudentDto,
    actor: { sub: string; role?: string },
    reason = 'Pendaftaran/transfer kelas'
  ) {
    const [student, schoolClass] = await Promise.all([
      tx.user.findUnique({ where: { id: payload.userId } }),
      tx.schoolClass.findUnique({ where: { id: payload.classId } })
    ]);
    if (!student || student.role !== Role.SISWA) throw new BadRequestException('Akun siswa tidak ditemukan.');
    if (!schoolClass) throw new BadRequestException('Kelas tidak ditemukan.');

    const period = await this.resolveAcademicPeriod(tx, payload);
    const effectiveFrom = payload.effectiveFrom ? schoolBusinessDate(payload.effectiveFrom) : schoolBusinessDate();
    const effectiveTo = payload.effectiveTo ? schoolBusinessDate(payload.effectiveTo) : null;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException({ code: 'ENROLLMENT_INVALID_PERIOD', message: 'Tanggal selesai pendaftaran tidak boleh sebelum tanggal mulai.' });
    }

    const existingActive = await tx.classEnrollment.findFirst({
      where: {
        studentId: payload.userId,
        effectiveFrom: { lte: effectiveFrom },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }]
      },
      orderBy: { effectiveFrom: 'desc' }
    });

    if (existingActive && existingActive.classId === payload.classId && existingActive.academicYearId === period.academicYearId && existingActive.semesterId === period.semesterId) {
      return { enrollment: existingActive, closedEnrollment: null, reused: true };
    }

    let closedEnrollment = null;
    if (existingActive) {
      const closingDate = previousBusinessDate(effectiveFrom);
      if (closingDate < existingActive.effectiveFrom) {
        throw new ConflictException({
          code: 'ENROLLMENT_SAME_DAY_TRANSFER_REQUIRES_REPAIR',
          message: 'Transfer pada tanggal mulai pendaftaran yang sama memerlukan perbaikan riwayat eksplisit.'
        });
      }
      closedEnrollment = await tx.classEnrollment.update({
        where: { id: existingActive.id },
        data: {
          active: false,
          effectiveTo: closingDate,
          endedById: actor.sub,
          endedReason: reason
        }
      });
    }

    const enrollment = await tx.classEnrollment.create({
      data: {
        classId: payload.classId,
        studentId: payload.userId,
        academicYearId: period.academicYearId,
        semesterId: period.semesterId,
        effectiveFrom,
        effectiveTo,
        active: effectiveTo === null,
        createdById: actor.sub
      }
    });
    return { enrollment, closedEnrollment, reused: false };
  }

  async listClasses(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.schoolClass.count(),
      this.prisma.schoolClass.findMany({
        include: {
          _count: { select: { enrollments: true, sessions: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  createClass(payload: CreateClassDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.schoolClass.create({ data: payload });
      await writeAudit(tx, {
        actorId,
        module: 'academic',
        action: 'class.created',
        resource: 'class',
        resourceId: created.id,
        after: created
      });
      return created;
    });
  }

  async updateClass(id: string, payload: UpdateClassDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.schoolClass.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Kelas tidak ditemukan.');
      const updated = await tx.schoolClass.update({ where: { id }, data: payload });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'academic',
        action: 'class.updated',
        resource: 'class',
        resourceId: id,
        before,
        after: updated
      });
      return updated;
    });
  }

  async listSubjects(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.subject.count(),
      this.prisma.subject.findMany({
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  createSubject(payload: CreateSubjectDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.subject.create({ data: payload });
      await writeAudit(tx, {
        actorId,
        module: 'academic',
        action: 'subject.created',
        resource: 'subject',
        resourceId: created.id,
        after: created
      });
      return created;
    });
  }

  async updateSubject(id: string, payload: UpdateSubjectDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.subject.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Mapel tidak ditemukan.');
      const updated = await tx.subject.update({ where: { id }, data: payload });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'academic',
        action: 'subject.updated',
        resource: 'subject',
        resourceId: id,
        before,
        after: updated
      });
      return updated;
    });
  }

  async listStudents(pagination: PaginationQuery, classId?: string) {
    const where = {
      role: 'SISWA',
      ...(classId
        ? {
            enrollments: {
              some: { classId, active: true, OR: [{ effectiveTo: null }, { effectiveTo: { gte: schoolBusinessDate() } }] }
            }
          }
        : {})
    } as const;

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          fullName: true,
          cardStatus: true,
          enrollments: {
            where: { active: true, OR: [{ effectiveTo: null }, { effectiveTo: { gte: schoolBusinessDate() } }] },
            select: {
              id: true,
              classId: true,
              academicYearId: true,
              semesterId: true,
              effectiveFrom: true,
              effectiveTo: true,
              schoolClass: { select: { code: true, name: true } },
              academicYear: { select: { code: true, name: true } },
              semester: { select: { code: true, name: true } }
            },
            orderBy: { effectiveFrom: 'desc' }
          }
        },
        orderBy: { fullName: 'asc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  private async normalizeStudentsImport(rows: ImportStudentRowDto[], includePasswords = false) {
    const [existingUsers, existingClasses] = await Promise.all([
      this.prisma.user.findMany({ select: { username: true, role: true, id: true } }),
      this.prisma.schoolClass.findMany({ select: { code: true, id: true } })
    ]);
    const userMap = new Map(existingUsers.map((item) => [item.username.toLowerCase(), item]));
    const classSet = new Set(existingClasses.map((item) => item.code.toLowerCase()));
    const usedUsernames = new Set(existingUsers.map((item) => item.username.toLowerCase()));
    const explicitUsernames = new Set<string>();

    const normalized: NormalizedStudentImportRow[] = rows.map((rawRow, index) => {
      const row = rawRow as Record<string, unknown>;
      const fullName = cleanImportText(pickValue(row, STUDENT_IMPORT_NAME_KEYS));
      const rawUsername = cleanImportText(pickValue(row, STUDENT_IMPORT_USERNAME_KEYS)).toLowerCase();
      const classCode = cleanImportText(pickValue(row, STUDENT_IMPORT_CLASS_KEYS));
      const className = cleanImportText(pickValue(row, STUDENT_IMPORT_CLASS_NAME_KEYS)) || classCode;
      const yearLabel = cleanImportText(pickValue(row, STUDENT_IMPORT_YEAR_KEYS)) || currentYearLabel();
      const role = cleanImportText(pickValue(row, STUDENT_IMPORT_ROLE_KEYS) || 'SISWA').toUpperCase();
      const passwordInput = cleanImportText(pickValue(row, STUDENT_IMPORT_PASSWORD_KEYS));
      const generatedUsername = !rawUsername;
      const errors: string[] = [];

      if (!fullName) errors.push('Nama lengkap wajib diisi');
      if (!classCode) errors.push('Kelas wajib diisi');
      if (role && role !== 'SISWA' && role !== 'STUDENT') errors.push('Import ini khusus siswa. Role harus SISWA.');

      let username = rawUsername || uniqueUsername(`siswa.${slugUsername(fullName)}`, usedUsernames);
      username = username.replace(/[^a-z0-9._-]/g, '.').replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '');
      const usernameKey = username.toLowerCase();
      const existing = userMap.get(usernameKey);

      if (rawUsername) {
        if (explicitUsernames.has(usernameKey)) errors.push('Username duplikat di file');
        explicitUsernames.add(usernameKey);
      }
      if (!username || username.length < 3) errors.push('Username minimal 3 karakter');
      if (existing && existing.role !== Role.SISWA) errors.push('Username sudah dipakai akun non-siswa');
      if (!existing && rawUsername && !usedUsernames.has(usernameKey)) usedUsernames.add(usernameKey);
      if (!existing && passwordInput && passwordInput.length < 8) errors.push('Password minimal 8 karakter');

      const generatedPassword = !existing && !passwordInput;
      const password = existing ? '' : passwordInput || (includePasswords ? temporaryPassword() : 'AUTO_GENERATED');

      return {
        index: index + 1,
        fullName,
        username,
        classCode,
        className,
        yearLabel,
        password,
        generatedUsername,
        generatedPassword,
        existingUser: Boolean(existing),
        classWillBeCreated: Boolean(classCode && !classSet.has(classCode.toLowerCase())),
        errors
      };
    });

    return {
      rows: normalized,
      summary: {
        total: normalized.length,
        valid: normalized.filter((row) => row.errors.length === 0).length,
        invalid: normalized.filter((row) => row.errors.length > 0).length,
        newUsers: normalized.filter((row) => row.errors.length === 0 && !row.existingUser).length,
        existingUsers: normalized.filter((row) => row.errors.length === 0 && row.existingUser).length,
        newClasses: new Set(normalized.filter((row) => row.errors.length === 0 && row.classWillBeCreated).map((row) => row.classCode.toLowerCase())).size,
        generatedUsernames: normalized.filter((row) => row.generatedUsername).length,
        generatedPasswords: normalized.filter((row) => row.generatedPassword).length
      }
    };
  }

  async previewStudentsImport(rows: ImportStudentRowDto[]) {
    const preview = await this.normalizeStudentsImport(rows, false);
    return {
      ...preview,
      rows: preview.rows.map(({ password: _password, ...row }) => row)
    };
  }

  async commitStudentsImport(rows: ImportStudentRowDto[], actor: { sub: string; role: string }) {
    const preview = await this.normalizeStudentsImport(rows, true);
    if (preview.summary.invalid > 0) {
      return { committed: false, ...preview, rows: preview.rows.map(({ password: _password, ...row }) => row) };
    }

    const credentialRows: Array<{ fullName: string; username: string; temporaryPassword: string; classCode: string; note: string }> = [];
    const result = { createdUsers: 0, existingUsers: 0, createdClasses: 0, enrollments: 0 };

    await this.prisma.$transaction(async (tx) => {
      const classCache = new Map<string, { id: string; code: string }>();
      for (const row of preview.rows) {
        let schoolClass = classCache.get(row.classCode.toLowerCase());
        if (!schoolClass) {
          const existingClass = await tx.schoolClass.findUnique({ where: { code: row.classCode } });
          if (existingClass) {
            schoolClass = existingClass;
          } else {
            schoolClass = await tx.schoolClass.create({ data: { code: row.classCode, name: row.className || row.classCode, yearLabel: row.yearLabel } });
            result.createdClasses += 1;
          }
          classCache.set(row.classCode.toLowerCase(), schoolClass);
        }

        let student = await tx.user.findUnique({ where: { username: row.username } });
        if (!student) {
          student = await tx.user.create({
            data: {
              username: row.username,
              fullName: row.fullName,
              role: Role.SISWA,
              passwordHash: await bcrypt.hash(row.password, 10),
              cardStatus: CardStatus.ACTIVE
            }
          });
          result.createdUsers += 1;
          credentialRows.push({ fullName: row.fullName, username: row.username, temporaryPassword: row.password, classCode: row.classCode, note: row.generatedPassword ? 'Password dibuat otomatis' : 'Password dari file' });
        } else {
          result.existingUsers += 1;
          credentialRows.push({ fullName: student.fullName, username: student.username, temporaryPassword: '', classCode: row.classCode, note: 'Akun sudah ada; password tidak diubah' });
        }

        await this.createEnrollmentTransfer(tx, { userId: student.id, classId: schoolClass.id }, actor, 'Import siswa massal');
        result.enrollments += 1;
      }

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'academic',
        action: 'students.simple_import.committed',
        resource: 'studentImport',
        resourceId: 'bulk-simple-import',
        after: result as Prisma.InputJsonValue
      });
    });

    return { committed: true, summary: preview.summary, result, credentialRows };
  }

  async previewImport(rows: ImportAcademicRowDto[]) {
    const classes = await this.prisma.schoolClass.findMany({ select: { code: true } });
    const subjects = await this.prisma.subject.findMany({ select: { code: true } });
    const users = await this.prisma.user.findMany({ select: { username: true, role: true } });
    const classSet = new Set(classes.map((item) => item.code));
    const subjectSet = new Set(subjects.map((item) => item.code));
    const userMap = new Map(users.map((item) => [item.username, item.role]));

    const previewRows = rows.map((row, index) => {
      const errors: string[] = [];
      if (!['class', 'subject', 'enrollment'].includes(row.type)) errors.push('type harus class/subject/enrollment');
      if (row.type === 'class') {
        if (!row.code) errors.push('code wajib');
        if (!row.name) errors.push('name wajib');
        if (!row.yearLabel) errors.push('yearLabel wajib');
        if (row.code && classSet.has(row.code)) errors.push('kode kelas sudah ada');
      }
      if (row.type === 'subject') {
        if (!row.code) errors.push('code wajib');
        if (!row.name) errors.push('name wajib');
        if (row.code && subjectSet.has(row.code)) errors.push('kode mapel sudah ada');
      }
      if (row.type === 'enrollment') {
        if (!row.username) errors.push('username siswa wajib');
        if (!row.classCode) errors.push('classCode wajib');
        if (row.username && userMap.get(row.username) !== 'SISWA') errors.push('username bukan siswa/tidak ditemukan');
        if (row.classCode && !classSet.has(row.classCode)) errors.push('classCode tidak ditemukan');
      }
      return { index: index + 1, ...row, errors };
    });

    return {
      rows: previewRows,
      summary: {
        total: previewRows.length,
        valid: previewRows.filter((row) => row.errors.length === 0).length,
        invalid: previewRows.filter((row) => row.errors.length > 0).length
      }
    };
  }

  async commitImport(rows: ImportAcademicRowDto[], actor: { sub: string; role: string }) {
    const preview = await this.previewImport(rows);
    if (preview.summary.invalid > 0) return { committed: false, ...preview };

    const result = { classes: 0, subjects: 0, enrollments: 0 };
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (row.type === 'class') {
          await tx.schoolClass.create({ data: { code: row.code!, name: row.name!, yearLabel: row.yearLabel! } });
          result.classes += 1;
        }
        if (row.type === 'subject') {
          await tx.subject.create({ data: { code: row.code!, name: row.name! } });
          result.subjects += 1;
        }
        if (row.type === 'enrollment') {
          const [student, schoolClass] = await Promise.all([
            tx.user.findUniqueOrThrow({ where: { username: row.username! } }),
            tx.schoolClass.findUniqueOrThrow({ where: { code: row.classCode! } })
          ]);
          await this.createEnrollmentTransfer(tx, { userId: student.id, classId: schoolClass.id }, actor, 'Import akademik');
          result.enrollments += 1;
        }
      }
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'academic',
        action: 'academic.import.committed',
        resource: 'academicImport',
        resourceId: 'bulk-import',
        after: result
      });
    });

    return { committed: true, result };
  }

  async listAcademicYears(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.academicYear.count(),
      this.prisma.academicYear.findMany({ orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  createAcademicYear(payload: CreateAcademicYearDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.academicYear.create({
        data: {
          code: payload.code,
          name: payload.name,
          startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
          endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
          active: payload.active ?? true
        }
      });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'academic_year.created', resource: 'academicYear', resourceId: created.id, after: created });
      return created;
    });
  }

  async updateAcademicYear(id: string, payload: UpdateAcademicYearDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.academicYear.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
      const updated = await tx.academicYear.update({
        where: { id },
        data: {
          ...(payload.code !== undefined ? { code: payload.code } : {}),
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.startsAt !== undefined ? { startsAt: payload.startsAt ? new Date(payload.startsAt) : null } : {}),
          ...(payload.endsAt !== undefined ? { endsAt: payload.endsAt ? new Date(payload.endsAt) : null } : {}),
          ...(payload.active !== undefined ? { active: payload.active } : {})
        }
      });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'academic_year.updated', resource: 'academicYear', resourceId: id, before, after: updated });
      return updated;
    });
  }

  async listSemesters(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.semester.count(),
      this.prisma.semester.findMany({ include: { academicYear: true }, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  createSemester(payload: CreateSemesterDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.semester.create({
        data: {
          academicYearId: payload.academicYearId,
          code: payload.code,
          name: payload.name,
          startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
          endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
          active: payload.active ?? true
        }
      });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'semester.created', resource: 'semester', resourceId: created.id, after: created });
      return created;
    });
  }

  async updateSemester(id: string, payload: UpdateSemesterDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.semester.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Semester tidak ditemukan.');
      const updated = await tx.semester.update({
        where: { id },
        data: {
          ...(payload.code !== undefined ? { code: payload.code } : {}),
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.startsAt !== undefined ? { startsAt: payload.startsAt ? new Date(payload.startsAt) : null } : {}),
          ...(payload.endsAt !== undefined ? { endsAt: payload.endsAt ? new Date(payload.endsAt) : null } : {}),
          ...(payload.active !== undefined ? { active: payload.active } : {})
        }
      });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'semester.updated', resource: 'semester', resourceId: id, before, after: updated });
      return updated;
    });
  }

  async listRooms(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.room.count(),
      this.prisma.room.findMany({ orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  createRoom(payload: CreateRoomDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.room.create({ data: { code: payload.code, name: payload.name, active: payload.active ?? true } });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'room.created', resource: 'room', resourceId: created.id, after: created });
      return created;
    });
  }

  async updateRoom(id: string, payload: UpdateRoomDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.room.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Ruang tidak ditemukan.');
      const updated = await tx.room.update({ where: { id }, data: payload });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'room.updated', resource: 'room', resourceId: id, before, after: updated });
      return updated;
    });
  }

  importTemplate(target = 'academic') {
    if (target === 'users') {
      return 'username,fullName,role,password\nsiswa.contoh,Nama Siswa,SISWA,ISI_PASSWORD_UNIK_MIN_8\n';
    }
    return 'type,code,name,yearLabel,username,classCode\nclass,X-1,Kelas X-1,2026/2027,,\nsubject,MTK,Matematika,,,\nenrollment,,,,siswa.contoh,X-1\n';
  }

  async listEnrollmentHistory(studentId: string) {
    return this.prisma.classEnrollment.findMany({
      where: { studentId },
      include: {
        schoolClass: { select: { id: true, code: true, name: true } },
        academicYear: { select: { id: true, code: true, name: true } },
        semester: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        endedBy: { select: { id: true, fullName: true, username: true } }
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }]
    });
  }

  async enrollStudent(payload: CreateStudentDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { enrollment, closedEnrollment, reused } = await this.createEnrollmentTransfer(tx, payload, { sub: actorId }, 'Pendaftaran/transfer kelas manual');

        await writeAudit(tx, {
          actorId,
          module: 'academic',
          action: closedEnrollment ? 'student.transferred' : reused ? 'student.enrollment_reused' : 'student.enrolled',
          resource: 'classEnrollment',
          resourceId: enrollment.id,
          before: closedEnrollment,
          after: enrollment
        });

        return enrollment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = enrollmentConflictCode(error);
      if (code) {
        throw new ConflictException({ code, message: 'Pendaftaran siswa berbenturan dengan periode kelas lain. Muat ulang dan coba lagi.' });
      }
      throw error;
    }
  }
}
