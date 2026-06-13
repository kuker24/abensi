import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAcademicYearDto, CreateClassDto, CreateRoomDto, CreateSemesterDto, CreateStudentDto, CreateSubjectDto, ImportAcademicRowDto, UpdateAcademicYearDto, UpdateClassDto, UpdateRoomDto, UpdateSemesterDto, UpdateSubjectDto } from './academic.dto';

@Injectable()
export class AcademicService {
  constructor(private readonly prisma: PrismaService) {}

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
    const before = await this.prisma.schoolClass.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Kelas tidak ditemukan.');
    const updated = await this.prisma.schoolClass.update({ where: { id }, data: payload });
    await writeAudit(this.prisma, {
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
    const before = await this.prisma.subject.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Mapel tidak ditemukan.');
    const updated = await this.prisma.subject.update({ where: { id }, data: payload });
    await writeAudit(this.prisma, {
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
  }

  async listStudents(pagination: PaginationQuery, classId?: string) {
    const where = {
      role: 'SISWA',
      ...(classId
        ? {
            enrollments: {
              some: { classId }
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
            select: {
              classId: true,
              schoolClass: { select: { code: true, name: true } }
            }
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
          await tx.classEnrollment.upsert({
            where: { classId_studentId: { classId: schoolClass.id, studentId: student.id } },
            create: { classId: schoolClass.id, studentId: student.id },
            update: {}
          });
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
    const before = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: {
        ...(payload.code !== undefined ? { code: payload.code } : {}),
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.startsAt !== undefined ? { startsAt: payload.startsAt ? new Date(payload.startsAt) : null } : {}),
        ...(payload.endsAt !== undefined ? { endsAt: payload.endsAt ? new Date(payload.endsAt) : null } : {}),
        ...(payload.active !== undefined ? { active: payload.active } : {})
      }
    });
    await writeAudit(this.prisma, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'academic_year.updated', resource: 'academicYear', resourceId: id, before, after: updated });
    return updated;
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
    const before = await this.prisma.semester.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Semester tidak ditemukan.');
    const updated = await this.prisma.semester.update({
      where: { id },
      data: {
        ...(payload.code !== undefined ? { code: payload.code } : {}),
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.startsAt !== undefined ? { startsAt: payload.startsAt ? new Date(payload.startsAt) : null } : {}),
        ...(payload.endsAt !== undefined ? { endsAt: payload.endsAt ? new Date(payload.endsAt) : null } : {}),
        ...(payload.active !== undefined ? { active: payload.active } : {})
      }
    });
    await writeAudit(this.prisma, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'semester.updated', resource: 'semester', resourceId: id, before, after: updated });
    return updated;
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
    const before = await this.prisma.room.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Ruang tidak ditemukan.');
    const updated = await this.prisma.room.update({ where: { id }, data: payload });
    await writeAudit(this.prisma, { actorId: actor.sub, actorRole: actor.role as Role, module: 'academic', action: 'room.updated', resource: 'room', resourceId: id, before, after: updated });
    return updated;
  }

  importTemplate(target = 'academic') {
    if (target === 'users') {
      return 'username,fullName,role,password\nsiswa.contoh,Nama Siswa,SISWA,SchoolHub#2026\n';
    }
    return 'type,code,name,yearLabel,username,classCode\nclass,X-1,Kelas X-1,2026/2027,,\nsubject,MTK,Matematika,,,\nenrollment,,,,siswa.contoh,X-1\n';
  }

  enrollStudent(payload: CreateStudentDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.classEnrollment.upsert({
        where: {
          classId_studentId: {
            classId: payload.classId,
            studentId: payload.userId
          }
        },
        create: {
          classId: payload.classId,
          studentId: payload.userId
        },
        update: {}
      });

      await writeAudit(tx, {
        actorId,
        module: 'academic',
        action: 'student.enrolled',
        resource: 'classEnrollment',
        resourceId: enrollment.id,
        after: enrollment
      });

      return enrollment;
    });
  }
}
