import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSmartCardDto, UpdateSmartCardDto } from './smart-card.dto';
import { writeAudit } from '../../common/audit-log';

@Injectable()
export class SmartCardService {
  constructor(private readonly prisma: PrismaService) {}

  async listCards(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.smartCard.count(),
      this.prisma.smartCard.findMany({
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              role: true
            }
          }
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

  async createCard(payload: CreateSmartCardDto, actorId: string) {
    try {
      const card = await this.prisma.smartCard.create({
        data: {
          uid: payload.uid,
          userId: payload.userId,
          status: payload.status,
          note: payload.note
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              role: true
            }
          }
        }
      });

      await writeAudit(this.prisma, { actorId, module: 'device', action: 'smartcard.created', resource: 'smartCard', resourceId: card.id, after: card as unknown as Prisma.InputJsonValue });

      return card;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('UID kartu atau pemilik sudah terdaftar.');
      }
      throw error;
    }
  }

  async updateCard(cardId: string, payload: UpdateSmartCardDto, actorId: string) {
    const exists = await this.prisma.smartCard.findUnique({ where: { id: cardId } });
    if (!exists) {
      throw new NotFoundException('Kartu tidak ditemukan.');
    }

    try {
      const card = await this.prisma.smartCard.update({
        where: { id: cardId },
        data: {
          uid: payload.uid,
          userId: payload.userId,
          status: payload.status,
          note: payload.note
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              role: true
            }
          }
        }
      });

      await writeAudit(this.prisma, { actorId, module: 'device', action: 'smartcard.updated', resource: 'smartCard', resourceId: card.id, before: exists as unknown as Prisma.InputJsonValue, after: card as unknown as Prisma.InputJsonValue });

      return card;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('UID kartu atau pemilik sudah dipakai kartu lain.');
      }
      throw error;
    }
  }
}
