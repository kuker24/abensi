import { BadRequestException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SchedulingService } from './scheduling.service';

function makePrisma() {
  const tx = {
    session: {
      create: jest.fn(async ({ data }) => ({ id: 'session-1', ...data })),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    weeklySchedule: {
      create: jest.fn(async ({ data }) => ({ id: 'weekly-1', ...data })),
      update: jest.fn()
    },
    auditEntry: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({ id: 'audit-1' }))
    },
    auditChainState: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({}))
    }
  };

  const prisma = {
    $transaction: jest.fn(async (callback) => callback(tx)),
    weeklySchedule: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: tx.weeklySchedule.create
    },
    session: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: tx.session.create,
      findUnique: tx.session.findUnique,
      update: tx.session.update
    },
    auditEntry: tx.auditEntry,
    auditChainState: tx.auditChainState
  };

  return { prisma, tx };
}

describe('SchedulingService timezone handling', () => {
  it('stores datetime-local session payloads as Asia/Jakarta instants', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createSession({
      classId: 'class-1',
      subjectId: 'subject-1',
      teacherId: 'teacher-1',
      startsAt: '2026-06-14T07:15',
      endsAt: '2026-06-14T08:45'
    }, 'actor-1');

    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startsAt: new Date('2026-06-14T00:15:00.000Z'),
        endsAt: new Date('2026-06-14T01:45:00.000Z'),
        businessDate: new Date('2026-06-14T00:00:00.000Z'),
        status: SessionStatus.SCHEDULED
      })
    });
  });

  it('preserves explicit timezone instants and rejects inverted ranges', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createSession({
      classId: 'class-1',
      subjectId: 'subject-1',
      teacherId: 'teacher-1',
      startsAt: '2026-06-14T07:15:00.000Z',
      endsAt: '2026-06-14T08:45:00.000Z'
    }, 'actor-1');

    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startsAt: new Date('2026-06-14T07:15:00.000Z'),
        endsAt: new Date('2026-06-14T08:45:00.000Z'),
        businessDate: new Date('2026-06-14T00:00:00.000Z')
      })
    });

    expect(() => service.createSession({
      classId: 'class-1',
      subjectId: 'subject-1',
      teacherId: 'teacher-1',
      startsAt: '2026-06-14T08:45',
      endsAt: '2026-06-14T07:15'
    }, 'actor-1')).toThrow(BadRequestException);
  });

  it('stores weekly effective dates as Jakarta business-day dates', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createWeeklySchedule({
      classId: 'class-1',
      subjectId: 'subject-1',
      teacherId: 'teacher-1',
      dayOfWeek: 1,
      startTime: '07:15',
      endTime: '08:45',
      effectiveFrom: '2026-06-14',
      effectiveTo: '2026-06-30'
    }, 'actor-1');

    expect(tx.weeklySchedule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        effectiveFrom: new Date('2026-06-13T17:00:00.000Z'),
        effectiveTo: new Date('2026-06-29T17:00:00.000Z')
      })
    });
  });
});
