import { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';

type AuditClient = {
  auditEntry: {
    create: (args: { data: Prisma.AuditEntryUncheckedCreateInput }) => Promise<unknown>;
  };
};

export interface AuditLogInput {
  action: string;
  resource: string;
  resourceId: string;
  actorId?: string | null;
  actorRole?: Role | null;
  module?: string | null;
  reason?: string | null;
  requestIp?: string | null;
  requestDevice?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

function inferModule(action: string, module?: string | null) {
  if (module) return module;
  const [first] = action.split('.');
  return first || 'system';
}

export async function writeAudit(client: AuditClient, payload: AuditLogInput) {
  const before =
    payload.before === undefined
      ? undefined
      : payload.before === null
        ? Prisma.JsonNull
        : payload.before;
  const after =
    payload.after === undefined
      ? undefined
      : payload.after === null
        ? Prisma.JsonNull
        : payload.after;

  await client.auditEntry.create({
    data: {
      actorId: payload.actorId ?? null,
      actorRole: payload.actorRole ?? null,
      action: payload.action,
      module: inferModule(payload.action, payload.module),
      resource: payload.resource,
      resourceId: payload.resourceId,
      reason: payload.reason ?? null,
      requestIp: payload.requestIp ?? null,
      requestDevice: payload.requestDevice ?? null,
      before,
      after
    }
  });
}
