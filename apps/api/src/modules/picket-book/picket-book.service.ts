import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, type Prisma } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { businessDayBounds } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePicketNoteDto, UpdatePicketNoteDto } from './picket-book.dto';

const STUDENT_SELECT = {
  id: true,
  fullName: true,
  nkd: true,
  nis: true,
  username: true
} as const;

const NOTE_INCLUDE = {
  createdBy: { select: { id: true, username: true, fullName: true, role: true } },
  updatedBy: { select: { id: true, username: true, fullName: true, role: true } },
  student: { select: STUDENT_SELECT }
} as const;

const SEARCH_LIMIT = 25;

@Injectable()
export class PicketBookService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStudentTarget(
    db: Prisma.TransactionClient | PrismaService,
    studentId: string
  ) {
    const student = await db.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true, active: true, archivedAt: true, fullName: true, nkd: true, nis: true, username: true }
    });
    if (!student) throw new BadRequestException('Siswa tidak ditemukan.');
    if (student.role !== Role.SISWA) throw new BadRequestException('Catatan piket hanya boleh dikaitkan ke akun SISWA.');
    if (!student.active || student.archivedAt) throw new BadRequestException('Siswa tidak aktif.');
    return {
      id: student.id,
      fullName: student.fullName,
      nkd: student.nkd,
      nis: student.nis,
      username: student.username
    };
  }

  async list(pagination: PaginationQuery, filters: { date?: string; category?: string; severity?: string; active?: string }) {
    const where: Prisma.PicketNoteWhereInput = {};
    if (filters.date) {
      const { start, end } = businessDayBounds(filters.date);
      where.date = { gte: start, lte: end };
    }
    if (filters.category) where.category = filters.category;
    if (filters.severity) where.severity = filters.severity;
    if (filters.active !== undefined && filters.active !== '') where.active = filters.active !== 'false';

    const [total, items] = await Promise.all([
      this.prisma.picketNote.count({ where }),
      this.prisma.picketNote.findMany({
        where,
        include: NOTE_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async searchStudents(q?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) return { items: [] as Array<{ id: string; fullName: string; nkd: string | null; nis: string | null; classCode: string | null }> };

    const students = await this.prisma.user.findMany({
      where: {
        role: Role.SISWA,
        active: true,
        archivedAt: null,
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { nkd: { contains: query, mode: 'insensitive' } },
          { nis: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        fullName: true,
        nkd: true,
        nis: true,
        username: true,
        enrollments: {
          where: { active: true, administrativeStatus: 'ACTIVE', effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { schoolClass: { select: { code: true } } }
        }
      },
      orderBy: { fullName: 'asc' },
      take: SEARCH_LIMIT
    });

    return {
      items: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        nkd: student.nkd,
        nis: student.nis,
        classCode: student.enrollments[0]?.schoolClass?.code ?? null
      }))
    };
  }

  async create(payload: CreatePicketNoteDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      let studentId: string | undefined;
      if (payload.studentId) {
        await this.assertStudentTarget(tx, payload.studentId);
        studentId = payload.studentId;
      }

      const created = await tx.picketNote.create({
        data: {
          date: businessDayBounds(payload.date).date,
          title: payload.title,
          body: payload.body,
          category: payload.category ?? 'UMUM',
          severity: payload.severity ?? 'INFO',
          studentId: studentId ?? null,
          createdById: actor.sub
        },
        include: NOTE_INCLUDE
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'picket',
        action: 'picket.note.created',
        resource: 'picketNote',
        resourceId: created.id,
        after: created
      });

      return created;
    });
  }

  async update(id: string, payload: UpdatePicketNoteDto, actor: { sub: string; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.picketNote.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Catatan piket tidak ditemukan.');

      const data: Prisma.PicketNoteUpdateInput = {
        ...(payload.date ? { date: businessDayBounds(payload.date).date } : {}),
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.body !== undefined ? { body: payload.body } : {}),
        ...(payload.category !== undefined ? { category: payload.category } : {}),
        ...(payload.severity !== undefined ? { severity: payload.severity } : {}),
        ...(payload.active !== undefined ? { active: payload.active } : {}),
        updatedBy: { connect: { id: actor.sub } }
      };

      if (payload.studentId === null) {
        data.student = { disconnect: true };
      } else if (typeof payload.studentId === 'string' && payload.studentId.length > 0) {
        await this.assertStudentTarget(tx, payload.studentId);
        data.student = { connect: { id: payload.studentId } };
      }

      const updated = await tx.picketNote.update({
        where: { id },
        data,
        include: NOTE_INCLUDE
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'picket',
        action: payload.active === false ? 'picket.note.deactivated' : 'picket.note.updated',
        resource: 'picketNote',
        resourceId: id,
        reason: payload.reason,
        before,
        after: updated
      });

      return updated;
    });
  }

  async deactivate(id: string, actor: { sub: string; role: string }, reason?: string) {
    return this.update(id, { active: false, reason: reason ?? 'Dinonaktifkan dari Buku Piket.' }, actor);
  }
}
