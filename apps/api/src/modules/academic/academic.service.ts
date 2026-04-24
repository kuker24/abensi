import { Injectable } from '@nestjs/common';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClassDto, CreateStudentDto, CreateSubjectDto } from './academic.dto';

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
      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'academic',
          action: 'class.created',
          resource: 'class',
          resourceId: created.id,
          after: created
        }
      });
      return created;
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
      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'academic',
          action: 'subject.created',
          resource: 'subject',
          resourceId: created.id,
          after: created
        }
      });
      return created;
    });
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

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'academic',
          action: 'student.enrolled',
          resource: 'classEnrollment',
          resourceId: enrollment.id,
          after: enrollment
        }
      });

      return enrollment;
    });
  }
}
