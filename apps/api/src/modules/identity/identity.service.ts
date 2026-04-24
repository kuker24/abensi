import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateMeDto } from './identity.dto';
import bcrypt from 'bcryptjs';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          active: true,
          cardStatus: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async createUser(payload: CreateUserDto, actorId: string) {
    const exists = await this.prisma.user.findUnique({ where: { username: payload.username } });
    if (exists) {
      throw new ConflictException('Username sudah terpakai.');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: payload.username,
        fullName: payload.fullName,
        passwordHash,
        role: payload.role,
        cardStatus: payload.cardStatus
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        cardStatus: true,
        active: true
      }
    });

    await this.prisma.auditEntry.create({
      data: {
        actorId,
        module: 'identity',
        action: 'user.created',
        resource: 'user',
        resourceId: user.id,
        after: user
      }
    });

    return user;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        cardStatus: true,
        createdAt: true,
        smartCard: {
          select: {
            id: true,
            uid: true,
            status: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan.');
    }

    return user;
  }

  async updateMe(userId: string, payload: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: payload.fullName
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        cardStatus: true
      }
    });

    await this.prisma.auditEntry.create({
      data: {
        actorId: userId,
        module: 'identity',
        action: 'user.profile.updated',
        resource: 'user',
        resourceId: userId,
        after: user
      }
    });

    return user;
  }
}
