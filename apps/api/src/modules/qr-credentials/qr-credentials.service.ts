import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QrCredentialStatus, Role } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { writeAudit } from '../../common/audit-log';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceSignatureService } from '../security/device-signature.service';
import { BulkGenerateQrCredentialDto, GenerateQrCredentialDto, RevokeQrCredentialDto, RotateQrCredentialDto } from './qr-credentials.dto';
import { formatSchoolHubQr, generateOpaqueQrCode, qrCodeHash, redactQr, shortQrCode } from './qr-code.util';

interface Actor {
  sub: string;
  role: Role;
}

function safeExpiresAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Tanggal kedaluwarsa QR tidak valid.');
  if (date <= new Date()) throw new BadRequestException('Tanggal kedaluwarsa QR harus di masa depan.');
  return date;
}

function printableRole(role: Role) {
  if (role === Role.SISWA) return 'Siswa';
  if (role === Role.GURU_MAPEL || role === Role.GURU_PIKET) return 'Guru';
  if (role === Role.ADMIN_TU) return 'Admin/TU';
  if (role === Role.OPERATOR_IT) return 'Operator IT';
  if (role === Role.DEVELOPER) return 'Developer';
  return String(role);
}

function printableLevel(role: Role, className?: string | null) {
  if (className) return className;
  if (role === Role.SISWA) return 'Siswa MAN 1 Rokan Hulu';
  if (role === Role.GURU_MAPEL || role === Role.GURU_PIKET) return 'Guru / Pegawai MAN 1 Rokan Hulu';
  if (role === Role.ADMIN_TU || role === Role.OPERATOR_IT) return 'Pegawai MAN 1 Rokan Hulu';
  return 'MAN 1 Rokan Hulu';
}

@Injectable()
export class QrCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: DeviceSignatureService
  ) {}

  private redact<T extends { codeCiphertext?: string | null }>(credential: T) {
    const { codeCiphertext: _ciphertext, ...safe } = credential;
    return { ...safe, hasPrintableQr: Boolean(credential.codeCiphertext) };
  }

  private async createCredential(tx: Prisma.TransactionClient, userId: string, actor: Actor, payload: GenerateQrCredentialDto, rotatedFromId?: string | null) {
    const opaque = generateOpaqueQrCode();
    const qrCode = formatSchoolHubQr(opaque);
    const created = await tx.qrCredential.create({
      data: {
        userId,
        codeHash: qrCodeHash(qrCode),
        codeCiphertext: this.signatures.encryptSecret(qrCode),
        shortCode: shortQrCode(qrCode),
        label: payload.label || 'QR Absensi SchoolHub',
        expiresAt: safeExpiresAt(payload.expiresAt),
        createdById: actor.sub,
        rotatedFromId: rotatedFromId ?? null
      },
      include: { user: { select: { id: true, fullName: true, username: true, role: true, active: true, enrollments: { include: { schoolClass: true }, take: 1 } } } }
    });
    return { credential: created, qrCode };
  }

  async listForUser(userId: string, pagination: PaginationQuery) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('Pengguna tidak ditemukan.');
    const where = { userId };
    const [total, items] = await Promise.all([
      this.prisma.qrCredential.count({ where }),
      this.prisma.qrCredential.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: { user: { select: { id: true, fullName: true, username: true, role: true } } }
      })
    ]);
    return { items: items.map((item) => this.redact(item)), meta: buildPaginationMeta(total, pagination) };
  }

  async generateForUser(userId: string, payload: GenerateQrCredentialDto, actor: Actor) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new NotFoundException('Pengguna tidak ditemukan atau tidak aktif.');

    return this.prisma.$transaction(async (tx) => {
      await tx.qrCredential.updateMany({ where: { userId, status: QrCredentialStatus.ACTIVE }, data: { status: QrCredentialStatus.REVOKED, revokedAt: new Date(), revokedById: actor.sub, revokeReason: 'Diganti oleh generate QR baru.' } });
      const { credential, qrCode } = await this.createCredential(tx, userId, actor, payload);
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'qr_credential',
        action: 'qr.credential.generated',
        resource: 'qrCredential',
        resourceId: credential.id,
        after: { ...this.redact(credential), qrMasked: redactQr(qrCode) } as Prisma.InputJsonValue
      });
      return { item: this.redact(credential), qrCode, qrMasked: redactQr(qrCode), message: 'QR credential berhasil dibuat. Simpan/cetak sekarang.' };
    });
  }

  async rotateForUser(userId: string, payload: RotateQrCredentialDto, actor: Actor) {
    const existing = await this.prisma.qrCredential.findFirst({ where: { userId, status: QrCredentialStatus.ACTIVE }, orderBy: { createdAt: 'desc' } });
    if (!existing) return this.generateForUser(userId, payload, actor);
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.qrCredential.update({ where: { id: existing.id }, data: { status: QrCredentialStatus.REVOKED, revokedAt: new Date(), revokedById: actor.sub, revokeReason: payload.reason || 'Rotasi QR credential.' } });
      const { credential, qrCode } = await this.createCredential(tx, userId, actor, payload, existing.id);
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'qr_credential',
        action: 'qr.credential.rotated',
        resource: 'qrCredential',
        resourceId: credential.id,
        before: this.redact(revoked) as Prisma.InputJsonValue,
        after: { ...this.redact(credential), qrMasked: redactQr(qrCode) } as Prisma.InputJsonValue,
        reason: payload.reason
      });
      return { item: this.redact(credential), qrCode, qrMasked: redactQr(qrCode), message: 'QR credential berhasil dirotasi.' };
    });
  }

  async revoke(id: string, payload: RevokeQrCredentialDto, actor: Actor) {
    const before = await this.prisma.qrCredential.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('QR credential tidak ditemukan.');
    if (before.status !== QrCredentialStatus.ACTIVE) throw new BadRequestException('QR credential sudah tidak aktif.');
    const nextStatus = payload.status && payload.status !== QrCredentialStatus.ACTIVE ? payload.status : QrCredentialStatus.REVOKED;
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.qrCredential.update({ where: { id }, data: { status: nextStatus, revokedAt: new Date(), revokedById: actor.sub, revokeReason: payload.reason } });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'qr_credential',
        action: 'qr.credential.revoked',
        resource: 'qrCredential',
        resourceId: id,
        reason: payload.reason,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: this.redact(item) as Prisma.InputJsonValue
      });
      return item;
    });
    return { item: this.redact(updated), message: 'QR credential dicabut.' };
  }

  async bulkGenerate(payload: BulkGenerateQrCredentialDto, actor: Actor) {
    const where: Prisma.UserWhereInput = { active: true, role: { in: [Role.SISWA, Role.GURU_MAPEL, Role.GURU_PIKET, Role.ADMIN_TU, Role.OPERATOR_IT] } };
    if (payload.classId) where.enrollments = { some: { classId: payload.classId } };
    if (payload.onlyMissing) where.qrCredentials = { none: { status: QrCredentialStatus.ACTIVE } };
    const users = await this.prisma.user.findMany({ where, select: { id: true, fullName: true, role: true }, take: 1000, orderBy: { fullName: 'asc' } });
    if (!users.length && payload.onlyMissing) return { count: 0, items: [], mode: 'only_missing', message: 'Semua pengguna target sudah punya QR aktif.' };
    if (!users.length) throw new NotFoundException('Tidak ada pengguna aktif untuk digenerate QR.');

    return this.prisma.$transaction(async (tx) => {
      const results: Array<{ userId: string; fullName: string; qrCode: string; credentialId: string }> = [];
      for (const user of users) {
        if (!payload.onlyMissing) {
          await tx.qrCredential.updateMany({ where: { userId: user.id, status: QrCredentialStatus.ACTIVE }, data: { status: QrCredentialStatus.REVOKED, revokedAt: new Date(), revokedById: actor.sub, revokeReason: 'Bulk generate QR credential baru.' } });
        }
        const { credential, qrCode } = await this.createCredential(tx, user.id, actor, payload);
        results.push({ userId: user.id, fullName: user.fullName, qrCode, credentialId: credential.id });
      }
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'qr_credential',
        action: payload.onlyMissing ? 'qr.credential.missing_generated' : 'qr.credential.bulk_generated',
        resource: 'qrCredential',
        resourceId: payload.classId || 'all',
        after: { count: results.length, classId: payload.classId ?? null, onlyMissing: Boolean(payload.onlyMissing) } as Prisma.InputJsonValue
      });
      return { count: results.length, mode: payload.onlyMissing ? 'only_missing' : 'replace_active', items: results.map((item) => ({ ...item, qrMasked: redactQr(item.qrCode) })), message: `${results.length} QR credential berhasil dibuat.` };
    });
  }

  async readiness(params: { classId?: string }) {
    const userWhere: Prisma.UserWhereInput = {
      active: true,
      role: { in: [Role.SISWA, Role.GURU_MAPEL, Role.GURU_PIKET, Role.ADMIN_TU, Role.OPERATOR_IT] }
    };
    if (params.classId) userWhere.enrollments = { some: { classId: params.classId } };

    const [targetUsers, classes] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          role: true,
          enrollments: { select: { classId: true } },
          qrCredentials: { where: { status: QrCredentialStatus.ACTIVE }, select: { id: true }, take: 1 }
        },
        take: 1000
      }),
      this.prisma.schoolClass.findMany({
        orderBy: { code: 'asc' },
        take: 300,
        include: {
          enrollments: {
            select: {
              student: {
                select: {
                  id: true,
                  active: true,
                  role: true,
                  qrCredentials: { where: { status: QrCredentialStatus.ACTIVE }, select: { id: true }, take: 1 }
                }
              }
            }
          }
        }
      })
    ]);

    const withQr = targetUsers.filter((user) => user.qrCredentials.length > 0).length;
    const students = targetUsers.filter((user) => user.role === Role.SISWA);
    const studentsWithoutClass = students.filter((user) => user.enrollments.length === 0).length;
    const classSummaries = classes.map((schoolClass) => {
      const activeStudents = schoolClass.enrollments.map((item) => item.student).filter((student) => student.active && student.role === Role.SISWA);
      const ready = activeStudents.filter((student) => student.qrCredentials.length > 0).length;
      return {
        id: schoolClass.id,
        code: schoolClass.code,
        name: schoolClass.name,
        totalStudents: activeStudents.length,
        readyCount: ready,
        missingQrCount: activeStudents.length - ready,
        ready: activeStudents.length > 0 && ready === activeStudents.length
      };
    });

    return {
      scope: params.classId ? 'class' : 'all',
      classId: params.classId || null,
      totalTargetUsers: targetUsers.length,
      totalStudents: students.length,
      activeQrCount: withQr,
      missingQrCount: targetUsers.length - withQr,
      studentsWithoutClass,
      readyToPrintCount: withQr,
      isReadyToPrint: targetUsers.length > 0 && withQr === targetUsers.length && studentsWithoutClass === 0,
      classes: classSummaries
    };
  }

  async exportCards(params: { classId?: string; userId?: string }) {
    const userWhere: Prisma.UserWhereInput = { active: true };
    if (params.classId) userWhere.enrollments = { some: { classId: params.classId } };
    if (params.userId) userWhere.id = params.userId;
    const where: Prisma.QrCredentialWhereInput = { status: QrCredentialStatus.ACTIVE, user: userWhere };
    const items = await this.prisma.qrCredential.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: { user: { select: { id: true, fullName: true, username: true, role: true, active: true, cardStatus: true, enrollments: { include: { schoolClass: true }, take: 1 } } } },
      take: 1000
    }) as any[];
    const cards = items.map((item) => {
      const qrCode = this.signatures.decryptSecret(item.codeCiphertext) || null;
      const schoolClass = item.user.enrollments?.[0]?.schoolClass || null;
      const className = schoolClass ? `${schoolClass.code} · ${schoolClass.name}` : null;
      return {
        id: item.id,
        userId: item.userId,
        fullName: item.user.fullName,
        username: item.user.username,
        role: item.user.role,
        displayRole: printableRole(item.user.role),
        className,
        classCode: schoolClass?.code || null,
        level: printableLevel(item.user.role, className),
        program: 'e-Hadir Absensi',
        status: item.user.active ? 'Aktif' : 'Nonaktif',
        cardStatus: item.user.cardStatus,
        credentialStatus: item.status,
        label: item.label,
        shortCode: item.shortCode,
        qrCode,
        qrMasked: qrCode ? redactQr(qrCode) : null,
        issuedAt: item.issuedAt,
        expiresAt: item.expiresAt,
        note: 'Kartu hanya untuk absensi SchoolHub MAN 1 Rokan Hulu.'
      };
    }).sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
    return {
      generatedAt: new Date().toISOString(),
      source: 'schoolhub-api',
      program: 'e-Hadir Absensi',
      count: cards.length,
      summary: {
        officialQrCount: cards.filter((card) => Boolean(card.qrCode)).length,
        missingQrCount: cards.filter((card) => !card.qrCode).length,
        classId: params.classId || null
      },
      cards
    };
  }

  async findActiveByQrCode(qrCode: string) {
    const codeHash = qrCodeHash(qrCode);
    const credential = await this.prisma.qrCredential.findUnique({ where: { codeHash }, include: { user: { include: { enrollments: { include: { schoolClass: true }, take: 1 } } } } }) as any;
    if (!credential) throw new NotFoundException('QR credential tidak ditemukan.');
    if (credential.status !== QrCredentialStatus.ACTIVE) throw new ForbiddenException('QR credential tidak aktif.');
    if (credential.expiresAt && credential.expiresAt <= new Date()) throw new ForbiddenException('QR credential sudah kedaluwarsa.');
    if (!credential.user.active) throw new ForbiddenException('Pengguna QR tidak aktif.');
    return credential;
  }
}
