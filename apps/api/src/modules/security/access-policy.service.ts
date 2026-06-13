import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type PolicyActor = { sub: string; role: Role | string };

function roleOf(actor: PolicyActor): Role {
  return actor.role as Role;
}

function hasRole(actor: PolicyActor, roles: Role[]) {
  return roles.includes(roleOf(actor));
}

function isDeveloper(actor: PolicyActor) {
  return roleOf(actor) === Role.DEVELOPER;
}

function isAdminOps(actor: PolicyActor) {
  return hasRole(actor, [Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER]);
}

function isPicketOrAdmin(actor: PolicyActor) {
  return hasRole(actor, [Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER]);
}

@Injectable()
export class AccessPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  canReadUser(actor: PolicyActor, userId: string) {
    if (isAdminOps(actor) || roleOf(actor) === Role.GURU_PIKET) return true;
    return actor.sub === userId;
  }

  async assertCanReadUser(actor: PolicyActor, userId: string) {
    if (!this.canReadUser(actor, userId)) throw new ForbiddenException('Akses data pengguna ditolak.');
  }

  async canModifyUser(actor: PolicyActor, targetUserId: string) {
    if (!isAdminOps(actor)) return false;
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');
    if (target.role === Role.DEVELOPER && !isDeveloper(actor)) return false;
    return true;
  }

  async assertCanModifyUser(actor: PolicyActor, targetUserId: string) {
    if (!await this.canModifyUser(actor, targetUserId)) throw new ForbiddenException('Aksi pengguna ditolak.');
  }

  async canAccessClass(actor: PolicyActor, classId: string) {
    if (isPicketOrAdmin(actor)) return true;
    if (roleOf(actor) === Role.GURU_MAPEL) {
      const count = await this.prisma.session.count({ where: { classId, teacherId: actor.sub } });
      return count > 0;
    }
    if (roleOf(actor) === Role.SISWA) {
      const count = await this.prisma.classEnrollment.count({ where: { classId, studentId: actor.sub } });
      return count > 0;
    }
    return false;
  }

  async canAccessStudent(actor: PolicyActor, studentId: string) {
    if (isPicketOrAdmin(actor)) return true;
    if (roleOf(actor) === Role.SISWA) return actor.sub === studentId;
    if (roleOf(actor) === Role.GURU_MAPEL) {
      const count = await this.prisma.classEnrollment.count({
        where: {
          studentId,
          schoolClass: { sessions: { some: { teacherId: actor.sub } } }
        }
      });
      return count > 0;
    }
    return false;
  }

  async canAccessTeacher(actor: PolicyActor, teacherId: string) {
    if (isPicketOrAdmin(actor)) return true;
    return roleOf(actor) === Role.GURU_MAPEL && actor.sub === teacherId;
  }

  async canOpenSession(actor: PolicyActor, sessionId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { teacherId: true } });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    if (roleOf(actor) === Role.GURU_MAPEL) return session.teacherId === actor.sub;
    return hasRole(actor, [Role.ADMIN_TU, Role.GURU_PIKET, Role.DEVELOPER]);
  }

  canCloseSession(actor: PolicyActor, sessionId: string) {
    return this.canOpenSession(actor, sessionId);
  }

  canWriteClassAttendance(actor: PolicyActor, sessionId: string) {
    return this.canOpenSession(actor, sessionId);
  }

  async canCorrectAttendance(actor: PolicyActor, sessionId: string, studentId: string) {
    if (!await this.canOpenSession(actor, sessionId)) return false;
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { classId: true } });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    const enrollment = await this.prisma.classEnrollment.findUnique({ where: { classId_studentId: { classId: session.classId, studentId } } });
    return Boolean(enrollment);
  }

  async canScanManual(actor: PolicyActor, targetUserId: string, _scope?: string) {
    if (!isPicketOrAdmin(actor)) return false;
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { active: true } });
    return Boolean(target?.active);
  }

  canCreateOverride(actor: PolicyActor, _targetUserId: string, scope?: string) {
    if (scope === 'ALL') return hasRole(actor, [Role.ADMIN_TU, Role.DEVELOPER]);
    return isPicketOrAdmin(actor);
  }

  async canResolveFlag(actor: PolicyActor, _flagId: string) {
    return hasRole(actor, [Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER]);
  }

  async canExportReport(actor: PolicyActor, _reportType: string, _filters: unknown) {
    return hasRole(actor, [Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER]);
  }
}
