import type { Prisma } from '@prisma/client';

type OutboxWriter = {
  outboxEvent?: {
    create: (args: { data: Prisma.OutboxEventUncheckedCreateInput }) => Promise<unknown>;
  };
};

export type LiveMonitorOutboxInput = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  logicalKey: string;
  payload: Prisma.InputJsonValue;
};

export async function writeLiveMonitorOutboxEvent(tx: OutboxWriter, input: LiveMonitorOutboxInput) {
  if (!tx.outboxEvent) return null;
  return tx.outboxEvent.create({
    data: {
      topic: 'live-monitor',
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      logicalKey: input.logicalKey,
      payload: input.payload,
      status: 'PENDING'
    }
  });
}
