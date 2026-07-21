import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { CardStatus, Prisma, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { addCalendarDays, businessDateKey } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { lockAcademicYear, lockSemester } from '../../common/schedule-mutation-lock';
import { parseDateOnlyAtUtcMidnight } from '../scheduling/scheduling.validation';
import { CreateAcademicYearDto, CreateClassDto, CreateRoomDto, CreateSemesterDto, CreateStudentDto, CreateSubjectDto, ImportAcademicRowDto, ImportStudentRowDto, UpdateAcademicYearDto, UpdateClassDto, UpdateRoomDto, UpdateSemesterDto, UpdateSubjectDto } from './academic.dto';

type NormalizedStudentImportRow = {
  index: number;
  fullName: string;
  username: string;
  classCode: string;
  className: string;
  yearLabel: string;
  password: string;
  nis: string | null;
  nkd: string | null;
  birthDate: Date | null;
  birthDateInput: string;
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
const STUDENT_IMPORT_NIS_KEYS = ['nis', 'NIS', 'nisn', 'NISN'];
const STUDENT_IMPORT_NKD_KEYS = ['nkd', 'NKD', 'Nomor Kartu Digital'];
const STUDENT_IMPORT_BIRTH_DATE_KEYS = ['birthDate', 'Tanggal Lahir', 'tanggal_lahir', 'Tanggal lahir'];
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


function normalizeNkd(value: string) {
  const nkd = cleanImportText(value);
  if (!nkd) return { value: null as string | null, error: null as string | null };
  if (!/^\d{4}$/.test(nkd)) return { value: null, error: 'NKD harus tepat empat digit angka' };
  return { value: nkd, error: null };
}

function parseOptionalBirthDate(value: string) {
  const text = cleanImportText(value);
  if (!text) return { value: null as Date | null, error: null as string | null, input: '' };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
  const normalized = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : local
      ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`
      : null;
  if (!normalized) return { value: null, error: 'Tanggal lahir harus format YYYY-MM-DD.', input: text };
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    return { value: null, error: 'Tanggal lahir tidak valid.', input: text };
  }
  return { value: date, error: null, input: normalized };
}

function currentYearLabel() {
  const year = new Date().getFullYear();
  return `${year}/${year + 1}`;
}

function normalizeUsernameCandidate(value: string, maxLength = 64) {
  const normalized = String(value || '').toLowerCase().normalize('NFKD');
  let candidate = '';
  let pendingDot = false;
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    const allowedAlphaNumeric = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    const allowedSymbol = char === '_' || char === '-';
    if (allowedAlphaNumeric || allowedSymbol) {
      if (pendingDot && candidate.length > 0 && candidate.length < maxLength) candidate += '.';
      pendingDot = false;
      if (candidate.length < maxLength) candidate += char;
      continue;
    }
    pendingDot = true;
  }
  return candidate;
}

function slugUsername(name: string) {
  const base = normalizeUsernameCandidate(name, 28);
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
  // ClassEnrollment effective dates use @db.Date, so compare against the DB date
  // representation instead of the Jakarta business-day timestamp window start.
  return new Date(`${key}T00:00:00.000Z`);
}

function schoolBusinessDate(value: Date | string = new Date()) {
  const key = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : businessDateKey(value instanceof Date ? value : new Date(value));
  return dbDateFromBusinessKey(key);
}

function previousBusinessDate(value: Date) {
  return dbDateFromBusinessKey(addCalendarDays(businessDateKey(value), -1));
}

const ACTIVE_ENROLLMENT_STATUS = 'ACTIVE';
const INACTIVE_ENROLLMENT_STATUSES = new Set(['CANCELLED', 'REVOKED']);

type EnrollmentAdministrativeStatus = 'ACTIVE' | 'CANCELLED' | 'REVOKED';

function activeEnrollmentValidityWhere(asOf: Date): Prisma.ClassEnrollmentWhereInput {
  return {
    active: true,
    administrativeStatus: ACTIVE_ENROLLMENT_STATUS,
    effectiveFrom: { lte: asOf },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }]
  };
}

function normalizeAdministrativeReason(reason: string) {
  const normalized = String(reason || '').replace(/\s+/g, ' ').trim();
  if (normalized.length < 10) {
    throw new BadRequestException({ code: 'ENROLLMENT_ADMIN_REASON_REQUIRED', message: 'Alasan pembatalan/pencabutan minimal 10 karakter.' });
  }
  return normalized;
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

  private async enrollmentPeriodBounds(
    tx: Prisma.TransactionClient,
    period: { academicYearId: string; semesterId: string }
  ) {
    const semester = await tx.semester.findUnique({
      where: { id: period.semesterId },
      include: { academicYear: true }
    });
    if (!semester) throw new BadRequestException('Semester tidak ditemukan.');
    if (semester.academicYearId !== period.academicYearId) {
      throw new BadRequestException({ code: 'SEMESTER_YEAR_MISMATCH', message: 'Semester tidak berada pada tahun ajaran yang dipilih.' });
    }

    const startsAt = semester.startsAt ? schoolBusinessDate(semester.startsAt) : null;
    const endsAt = semester.endsAt ? schoolBusinessDate(semester.endsAt) : null;
    if (!startsAt || !endsAt) {
      throw new BadRequestException({ code: 'SEMESTER_BOUNDS_REQUIRED', message: 'Semester aktif wajib memiliki tanggal mulai dan selesai lengkap sebelum pendaftaran siswa.' });
    }
    if (endsAt < startsAt) {
      throw new BadRequestException({ code: 'SEMESTER_BOUNDS_REQUIRED', message: 'Tanggal selesai semester tidak boleh sebelum tanggal mulai.' });
    }
    return { startsAt, endsAt };
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
    const bounds = await this.enrollmentPeriodBounds(tx, period);
    const effectiveFrom = payload.effectiveFrom ? schoolBusinessDate(payload.effectiveFrom) : schoolBusinessDate();
    const effectiveTo = payload.effectiveTo ? schoolBusinessDate(payload.effectiveTo) : bounds.endsAt;
    if (effectiveTo < effectiveFrom) {
      throw new BadRequestException({ code: 'ENROLLMENT_INVALID_PERIOD', message: 'Tanggal selesai pendaftaran tidak boleh sebelum tanggal mulai.' });
    }
    if (effectiveFrom < bounds.startsAt || effectiveFrom > bounds.endsAt || effectiveTo > bounds.endsAt) {
      throw new BadRequestException({ code: 'ENROLLMENT_OUTSIDE_ACADEMIC_PERIOD', message: 'Periode pendaftaran harus berada seluruhnya dalam semester.' });
    }

    const existingActive = await tx.classEnrollment.findFirst({
      where: {
        studentId: payload.userId,
        ...activeEnrollmentValidityWhere(effectiveFrom)
      },
      orderBy: { effectiveFrom: 'desc' }
    });

    if (existingActive && existingActive.classId === payload.classId && existingActive.academicYearId === period.academicYearId && existingActive.semesterId === period.semesterId) {
      if (!existingActive.effectiveTo) {
        throw new ConflictException({
          code: 'ENROLLMENT_LEGACY_OPEN_ENDED',
          message: 'Pendaftaran lama tanpa tanggal selesai harus diperbaiki sebelum dapat digunakan kembali.'
        });
      }
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
        active: true,
        administrativeStatus: ACTIVE_ENROLLMENT_STATUS,
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
    const asOf = schoolBusinessDate();
    const currentEnrollmentWhere = activeEnrollmentValidityWhere(asOf);
    const where: Prisma.UserWhereInput = {
      role: Role.SISWA,
      ...(classId
        ? {
            enrollments: {
              some: { classId, ...currentEnrollmentWhere }
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
          nis: true,
          nkd: true,
          cardStatus: true,
          enrollments: {
            where: currentEnrollmentWhere,
            select: {
              id: true,
              classId: true,
              academicYearId: true,
              semesterId: true,
              effectiveFrom: true,
              effectiveTo: true,
              active: true,
              administrativeStatus: true,
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

  private async resolveStudentImportPeriod(academicYearCode: string, client: Pick<Prisma.TransactionClient, 'academicYear' | 'semester'> = this.prisma) {
    const code = cleanImportText(academicYearCode);
    if (!code) throw new BadRequestException({ code: 'ACADEMIC_YEAR_REQUIRED', message: 'Tahun ajaran wajib dipilih untuk import siswa.' });
    const academicYear = await client.academicYear.findUnique({ where: { code } });
    if (!academicYear || !academicYear.active) {
      throw new BadRequestException({ code: 'ACADEMIC_YEAR_NOT_ACTIVE', message: 'Tahun ajaran import tidak ditemukan atau tidak aktif.' });
    }
    const semesters = await client.semester.findMany({ where: { academicYearId: academicYear.id, active: true }, orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }] });
    if (semesters.length !== 1) {
      throw new BadRequestException({ code: 'IMPORT_SEMESTER_AMBIGUOUS', message: 'Import siswa memerlukan tepat satu semester aktif pada tahun ajaran yang dipilih.' });
    }
    const semester = semesters[0];
    if (!semester.startsAt || !semester.endsAt || semester.endsAt < semester.startsAt) {
      throw new BadRequestException({ code: 'SEMESTER_BOUNDS_REQUIRED', message: 'Semester import wajib memiliki tanggal mulai dan selesai lengkap.' });
    }
    return { academicYearId: academicYear.id, semesterId: semester.id, academicYearCode: academicYear.code };
  }

  private async normalizeStudentsImport(rows: ImportStudentRowDto[], includePasswords = false, expectedAcademicYear?: string) {
    const [existingUsers, existingClasses, reservedNkds] = await Promise.all([
      this.prisma.user.findMany({ select: { username: true, role: true, id: true, nis: true, nkd: true } }),
      this.prisma.schoolClass.findMany({ select: { code: true, id: true } }),
      this.prisma.studentNkdRegistry.findMany({ select: { nkd: true, userId: true } })
    ]);
    const userMap = new Map(existingUsers.map((item) => [item.username.toLowerCase(), item]));
    const nisMap = new Map(existingUsers.filter((item) => item.nis).map((item) => [item.nis as string, item]));
    const nkdMap = new Map(existingUsers.filter((item) => item.nkd).map((item) => [item.nkd as string, item]));
    const reservedNkdMap = new Map(reservedNkds.map((item) => [item.nkd, item.userId]));
    const classSet = new Set(existingClasses.map((item) => item.code.toLowerCase()));
    const usedUsernames = new Set(existingUsers.map((item) => item.username.toLowerCase()));
    const explicitUsernames = new Set<string>();
    const explicitNis = new Set<string>();
    const explicitNkds = new Set<string>();

    const normalized: NormalizedStudentImportRow[] = rows.map((rawRow, index) => {
      const row = rawRow as Record<string, unknown>;
      const fullName = cleanImportText(pickValue(row, STUDENT_IMPORT_NAME_KEYS));
      const rawUsername = cleanImportText(pickValue(row, STUDENT_IMPORT_USERNAME_KEYS)).toLowerCase();
      const classCode = cleanImportText(pickValue(row, STUDENT_IMPORT_CLASS_KEYS));
      const className = cleanImportText(pickValue(row, STUDENT_IMPORT_CLASS_NAME_KEYS)) || classCode;
      const nis = cleanImportText(pickValue(row, STUDENT_IMPORT_NIS_KEYS)) || null;
      const nkd = normalizeNkd(pickValue(row, STUDENT_IMPORT_NKD_KEYS));
      const birthDate = parseOptionalBirthDate(pickValue(row, STUDENT_IMPORT_BIRTH_DATE_KEYS));
      const yearLabel = cleanImportText(pickValue(row, STUDENT_IMPORT_YEAR_KEYS)) || currentYearLabel();
      const role = cleanImportText(pickValue(row, STUDENT_IMPORT_ROLE_KEYS) || 'SISWA').toUpperCase();
      const generatedUsername = !rawUsername;
      const errors: string[] = [];

      if (!fullName) errors.push('Nama lengkap wajib diisi');
      if (!classCode) errors.push('Kelas wajib diisi');
      if (nkd.error) errors.push(nkd.error);
      if (birthDate.error) errors.push(birthDate.error);
      if (expectedAcademicYear && yearLabel !== expectedAcademicYear) errors.push('Tahun ajaran baris tidak sesuai tahun ajaran yang dipilih');
      if (role && role !== 'SISWA' && role !== 'STUDENT') errors.push('Import ini khusus siswa. Role harus SISWA.');

      let username = rawUsername || uniqueUsername(`siswa.${slugUsername(fullName)}`, usedUsernames);
      username = normalizeUsernameCandidate(username, 64);
      const usernameKey = username.toLowerCase();
      const existing = userMap.get(usernameKey);
      const nisOwner = nis ? nisMap.get(nis) : null;
      const nkdOwner = nkd.value ? nkdMap.get(nkd.value) : null;

      if (rawUsername) {
        if (explicitUsernames.has(usernameKey)) errors.push('Username duplikat di file');
        explicitUsernames.add(usernameKey);
      }
      if (!username || username.length < 3) errors.push('Username minimal 3 karakter');
      if (existing && existing.role !== Role.SISWA) errors.push('Username sudah dipakai akun non-siswa');
      if (nis && explicitNis.has(nis)) errors.push('NIS/NISN duplikat di file');
      if (nis) explicitNis.add(nis);
      if (nisOwner && nisOwner.id !== existing?.id) errors.push('NIS/NISN sudah dipakai akun lain');
      if (!existing && !nkd.value) errors.push('NKD wajib diisi untuk siswa baru');
      if (nkd.value && explicitNkds.has(nkd.value)) errors.push('NKD duplikat di file');
      if (nkd.value) explicitNkds.add(nkd.value);
      if (nkdOwner && nkdOwner.id !== existing?.id) errors.push('NKD sudah dipakai akun lain');
      const reservedForUserId = nkd.value ? reservedNkdMap.get(nkd.value) : null;
      if (nkd.value && reservedNkdMap.has(nkd.value) && reservedForUserId !== existing?.id) errors.push('NKD sudah pernah diterbitkan dan tidak boleh dipakai ulang');
      if (existing?.nkd && nkd.value && existing.nkd !== nkd.value) errors.push('NKD tidak dapat diubah setelah diterbitkan');
      if (!existing && rawUsername && !usedUsernames.has(usernameKey)) usedUsernames.add(usernameKey);
      const generatedPassword = !existing;
      const password = existing ? '' : (includePasswords ? temporaryPassword() : 'AUTO_GENERATED');

      return {
        index: index + 1,
        fullName,
        username,
        classCode,
        className,
        yearLabel,
        password,
        nis,
        nkd: nkd.value,
        birthDate: birthDate.value,
        birthDateInput: birthDate.input,
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

  async previewStudentsImport(rows: ImportStudentRowDto[], academicYearCode: string) {
    const period = await this.resolveStudentImportPeriod(academicYearCode);
    const preview = await this.normalizeStudentsImport(rows, false, period.academicYearCode);
    return {
      ...preview,
      period,
      rows: preview.rows.map(({ password: _password, ...row }) => row)
    };
  }

  async commitStudentsImport(rows: ImportStudentRowDto[], actor: { sub: string; role: string }, academicYearCode: string) {
    const initialPeriod = await this.resolveStudentImportPeriod(academicYearCode);
    const preview = await this.normalizeStudentsImport(rows, true, initialPeriod.academicYearCode);
    if (preview.summary.invalid > 0) {
      return { committed: false, ...preview, rows: preview.rows.map(({ password: _password, ...row }) => row) };
    }

    const credentialRows: Array<{ fullName: string; username: string; temporaryPassword: string; classCode: string; note: string }> = [];
    const result = { createdUsers: 0, existingUsers: 0, createdClasses: 0, enrollments: 0 };
    const preparedPasswordHashes = new Map<number, string>();
    const newRows = preview.rows.filter((row) => !row.existingUser);
    const passwordHashConcurrency = 4;
    for (let offset = 0; offset < newRows.length; offset += passwordHashConcurrency) {
      const chunk = newRows.slice(offset, offset + passwordHashConcurrency);
      const hashes = await Promise.all(chunk.map((row) => bcrypt.hash(row.password, 10)));
      chunk.forEach((row, index) => preparedPasswordHashes.set(row.index, hashes[index]));
    }

    await this.prisma.$transaction(async (tx) => {
      const discoveredPeriod = await this.resolveStudentImportPeriod(academicYearCode, tx);
      await lockAcademicYear(tx, discoveredPeriod.academicYearId);
      await lockSemester(tx, discoveredPeriod.semesterId);
      const period = await this.resolveStudentImportPeriod(academicYearCode, tx);
      if (
        period.academicYearId !== initialPeriod.academicYearId
        || period.semesterId !== initialPeriod.semesterId
        || period.academicYearId !== discoveredPeriod.academicYearId
        || period.semesterId !== discoveredPeriod.semesterId
      ) {
        throw new ConflictException('Periode akademik berubah sejak preview. Ulangi preview sebelum commit import.');
      }
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
          const passwordHash = preparedPasswordHashes.get(row.index);
          if (!passwordHash) throw new ConflictException('Data siswa berubah sejak preview. Ulangi preview sebelum commit import.');
          student = await tx.user.create({
            data: {
              username: row.username,
              fullName: row.fullName,
              nis: row.nis,
              nkd: row.nkd,
              birthDate: row.birthDate,
              role: Role.SISWA,
              passwordHash,
              mustChangePassword: true,
              passwordChangedAt: null,
              cardStatus: CardStatus.ACTIVE
            }
          });
          result.createdUsers += 1;
          credentialRows.push({ fullName: row.fullName, username: row.username, temporaryPassword: row.password, classCode: row.classCode, note: row.generatedPassword ? 'Password dibuat otomatis' : 'Password dari file' });
        } else {
          if (row.nis || row.nkd || row.birthDate) {
            if (student.nkd && row.nkd && student.nkd !== row.nkd) {
              throw new BadRequestException('NKD tidak dapat diubah setelah diterbitkan.');
            }
            student = await tx.user.update({
              where: { id: student.id },
              data: {
                ...(row.nis ? { nis: row.nis } : {}),
                ...(!student.nkd && row.nkd ? { nkd: row.nkd } : {}),
                ...(row.birthDate ? { birthDate: row.birthDate } : {})
              }
            });
          }
          result.existingUsers += 1;
          credentialRows.push({ fullName: student.fullName, username: student.username, temporaryPassword: '', classCode: row.classCode, note: 'Akun sudah ada; password tidak diubah' });
        }

        await this.createEnrollmentTransfer(tx, { userId: student.id, classId: schoolClass.id, academicYearId: period.academicYearId, semesterId: period.semesterId }, actor, 'Import siswa massal');
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
    }, { maxWait: 10_000, timeout: 120_000 });

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

  private academicDate(value: string | Date | null | undefined, code: string) {
    if (!value) return null;
    try {
      return typeof value === 'string' ? parseDateOnlyAtUtcMidnight(value) : schoolBusinessDate(value);
    } catch {
      throw new BadRequestException({ code, message: 'Tanggal harus format YYYY-MM-DD yang valid.' });
    }
  }

  private requireCompleteAcademicBounds(
    startsAt: Date | null,
    endsAt: Date | null,
    code: 'ACADEMIC_YEAR_BOUNDS_REQUIRED' | 'SEMESTER_BOUNDS_REQUIRED'
  ) {
    if (!startsAt || !endsAt) {
      throw new BadRequestException({
        code,
        message: code === 'ACADEMIC_YEAR_BOUNDS_REQUIRED'
          ? 'Tahun ajaran wajib memiliki tanggal mulai dan selesai lengkap.'
          : 'Semester wajib memiliki tanggal mulai dan selesai lengkap.'
      });
    }
    if (endsAt < startsAt) {
      throw new BadRequestException({ code, message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' });
    }
    return { startsAt, endsAt };
  }

  createAcademicYear(payload: CreateAcademicYearDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const bounds = this.requireCompleteAcademicBounds(
        this.academicDate(payload.startsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED'),
        this.academicDate(payload.endsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED'),
        'ACADEMIC_YEAR_BOUNDS_REQUIRED'
      );
      const created = await tx.academicYear.create({
        data: {
          code: payload.code,
          name: payload.name,
          ...bounds,
          active: payload.active ?? true
        }
      });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'academic_year.created', resource: 'academicYear', resourceId: created.id, after: created });
      return created;
    });
  }

  async updateAcademicYear(id: string, payload: UpdateAcademicYearDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      await lockAcademicYear(tx, id);
      const before = await tx.academicYear.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
      const proposedStartsAt = payload.startsAt !== undefined
        ? this.academicDate(payload.startsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED')
        : this.academicDate(before.startsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
      const proposedEndsAt = payload.endsAt !== undefined
        ? this.academicDate(payload.endsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED')
        : this.academicDate(before.endsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
      const semesters = await tx.semester.findMany({
        where: { academicYearId: id },
        select: { id: true, startsAt: true, endsAt: true },
        orderBy: { id: 'asc' }
      });
      if (!proposedStartsAt || !proposedEndsAt || proposedEndsAt < proposedStartsAt) {
        if (semesters.length > 0) {
          throw new ConflictException({
            code: 'ACADEMIC_YEAR_SEMESTER_PERIOD_CONFLICT',
            message: 'Tahun ajaran dengan semester terkait harus mempertahankan rentang lengkap yang mencakup semuanya.'
          });
        }
      }
      const bounds = this.requireCompleteAcademicBounds(proposedStartsAt, proposedEndsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
      const incompatibleSemester = semesters.find((semester) => {
        const startsAt = this.academicDate(semester.startsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
        const endsAt = this.academicDate(semester.endsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
        return !startsAt || !endsAt || startsAt < bounds.startsAt || endsAt > bounds.endsAt;
      });
      if (incompatibleSemester) {
        throw new ConflictException({
          code: 'ACADEMIC_YEAR_SEMESTER_PERIOD_CONFLICT',
          message: 'Rentang tahun ajaran harus mencakup seluruh semester terkait.'
        });
      }
      const updated = await tx.academicYear.update({
        where: { id },
        data: {
          ...(payload.code !== undefined ? { code: payload.code } : {}),
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...bounds,
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

  private assertSemesterWithinAcademicYear(
    semester: { startsAt: Date; endsAt: Date },
    academicYear: { startsAt: Date | null; endsAt: Date | null } | null
  ) {
    const yearStartsAt = this.academicDate(academicYear?.startsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
    const yearEndsAt = this.academicDate(academicYear?.endsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
    const bounds = this.requireCompleteAcademicBounds(yearStartsAt, yearEndsAt, 'ACADEMIC_YEAR_BOUNDS_REQUIRED');
    if (semester.startsAt < bounds.startsAt || semester.endsAt > bounds.endsAt) {
      throw new BadRequestException({ code: 'SEMESTER_OUTSIDE_ACADEMIC_YEAR', message: 'Rentang semester harus berada seluruhnya dalam tahun ajaran.' });
    }
  }

  createSemester(payload: CreateSemesterDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      await lockAcademicYear(tx, payload.academicYearId);
      const academicYear = await tx.academicYear.findUnique({ where: { id: payload.academicYearId } });
      if (!academicYear) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
      const bounds = this.requireCompleteAcademicBounds(
        this.academicDate(payload.startsAt, 'SEMESTER_BOUNDS_REQUIRED'),
        this.academicDate(payload.endsAt, 'SEMESTER_BOUNDS_REQUIRED'),
        'SEMESTER_BOUNDS_REQUIRED'
      );
      this.assertSemesterWithinAcademicYear(bounds, academicYear);
      const created = await tx.semester.create({
        data: {
          academicYearId: payload.academicYearId,
          code: payload.code,
          name: payload.name,
          ...bounds,
          active: payload.active ?? true
        }
      });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'semester.created', resource: 'semester', resourceId: created.id, after: created });
      return created;
    });
  }

  async updateSemester(id: string, payload: UpdateSemesterDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const preRead = await tx.semester.findUnique({ where: { id }, select: { id: true, academicYearId: true } });
      if (!preRead) throw new NotFoundException('Semester tidak ditemukan.');
      await lockAcademicYear(tx, preRead.academicYearId);
      await lockSemester(tx, id);
      const before = await tx.semester.findUnique({ where: { id }, include: { academicYear: true } });
      if (!before) throw new NotFoundException('Semester tidak ditemukan.');
      if (before.academicYearId !== preRead.academicYearId) {
        throw new ConflictException({ code: 'SEMESTER_STATE_CHANGED', message: 'Semester berubah saat diperbarui. Muat ulang lalu coba lagi.' });
      }
      const bounds = this.requireCompleteAcademicBounds(
        payload.startsAt !== undefined ? this.academicDate(payload.startsAt, 'SEMESTER_BOUNDS_REQUIRED') : this.academicDate(before.startsAt, 'SEMESTER_BOUNDS_REQUIRED'),
        payload.endsAt !== undefined ? this.academicDate(payload.endsAt, 'SEMESTER_BOUNDS_REQUIRED') : this.academicDate(before.endsAt, 'SEMESTER_BOUNDS_REQUIRED'),
        'SEMESTER_BOUNDS_REQUIRED'
      );
      this.assertSemesterWithinAcademicYear(bounds, before.academicYear);
      const assignmentBounds = await tx.teachingAssignment.aggregate({
        where: { semesterId: id },
        _min: { effectiveFrom: true },
        _max: { effectiveTo: true }
      });
      if (assignmentBounds._min.effectiveFrom || assignmentBounds._max.effectiveTo) {
        if (bounds.startsAt > schoolBusinessDate(assignmentBounds._min.effectiveFrom!)
          || bounds.endsAt < schoolBusinessDate(assignmentBounds._max.effectiveTo!)) {
          throw new ConflictException({
            code: 'SEMESTER_ASSIGNMENT_PERIOD_CONFLICT',
            message: 'Rentang semester harus tetap mencakup seluruh periode penugasan mengajar terkait.'
          });
        }
      }
      const updated = await tx.semester.update({
        where: { id },
        data: {
          ...(payload.code !== undefined ? { code: payload.code } : {}),
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...bounds,
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
        administrativeStatusChangedBy: { select: { id: true, fullName: true, username: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        endedBy: { select: { id: true, fullName: true, username: true } }
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }]
    });
  }

  async setEnrollmentAdministrativeStatus(
    enrollmentId: string,
    status: Exclude<EnrollmentAdministrativeStatus, 'ACTIVE'>,
    reason: string,
    actor: { sub: string; role: string }
  ) {
    if (!INACTIVE_ENROLLMENT_STATUSES.has(status)) {
      throw new BadRequestException({ code: 'ENROLLMENT_ADMIN_STATUS_INVALID', message: 'Status administrasi pendaftaran tidak valid.' });
    }
    const normalizedReason = normalizeAdministrativeReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.classEnrollment.findUnique({ where: { id: enrollmentId } });
      if (!before) throw new NotFoundException('Pendaftaran kelas tidak ditemukan.');
      const updated = await tx.classEnrollment.update({
        where: { id: enrollmentId },
        data: {
          active: false,
          administrativeStatus: status,
          administrativeStatusChangedAt: new Date(),
          administrativeStatusChangedById: actor.sub,
          administrativeStatusReason: normalizedReason
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'academic',
        action: status === 'CANCELLED' ? 'student.enrollment_cancelled' : 'student.enrollment_revoked',
        resource: 'classEnrollment',
        resourceId: enrollmentId,
        before,
        after: updated
      });
      return updated;
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
