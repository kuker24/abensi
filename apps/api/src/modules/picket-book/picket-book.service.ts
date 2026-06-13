import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, type Prisma } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePicketNoteDto, UpdatePicketNoteDto } from './picket-book.dto';

@Injectable()
export class PicketBookService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationQuery, filters: { date?: string; category?: string; severity?: string; active?: string }) {
    const where: Prisma.PicketNoteWhereInput = {};
    if (filters.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    }
    if (filters.category) where.category = filters.category;
    if (filters.severity) where.severity = filters.severity;
    if (filters.active !== undefined && filters.active !== '') where.active = filters.active !== 'false';

    const [total, items] = await Promise.all([
      this.prisma.picketNote.count({ where }),
      this.prisma.picketNote.findMany({
        where,
        include: {
          createdBy: { select: { id: true, username: true, fullName: true, role: true } },
          updatedBy: { select: { id: true, username: true, fullName: true, role: true } }
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async create(payload: CreatePicketNoteDto, actor: { sub: string; role: string }) {
    const created = await this.prisma.picketNote.create({
      data: {
        date: new Date(payload.date),
        title: payload.title,
        body: payload.body,
        category: payload.category ?? 'UMUM',
        severity: payload.severity ?? 'INFO',
        createdById: actor.sub
      },
      include: { createdBy: { select: { id: true, username: true, fullName: true, role: true } } }
    });

    await writeAudit(this.prisma, {
      actorId: actor.sub,
      actorRole: actor.role as Role,
      module: 'picket',
      action: 'picket.note.created',
      resource: 'picketNote',
      resourceId: created.id,
      after: created
    });

    return created;
  }

  async update(id: string, payload: UpdatePicketNoteDto, actor: { sub: string; role: string }) {
    const before = await this.prisma.picketNote.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Catatan piket tidak ditemukan.');

    const updated = await this.prisma.picketNote.update({
      where: { id },
      data: {
        ...(payload.date ? { date: new Date(payload.date) } : {}),
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.body !== undefined ? { body: payload.body } : {}),
        ...(payload.category !== undefined ? { category: payload.category } : {}),
        ...(payload.severity !== undefined ? { severity: payload.severity } : {}),
        ...(payload.active !== undefined ? { active: payload.active } : {}),
        updatedById: actor.sub
      },
      include: {
        createdBy: { select: { id: true, username: true, fullName: true, role: true } },
        updatedBy: { select: { id: true, username: true, fullName: true, role: true } }
      }
    });

    await writeAudit(this.prisma, {
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
  }

  async deactivate(id: string, actor: { sub: string; role: string }, reason?: string) {
    return this.update(id, { active: false, reason: reason ?? 'Dinonaktifkan dari Buku Piket.' }, actor);
  }
}
