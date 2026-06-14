import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { ReconciliationController } from './reconciliation.controller';

function signedHeaders(path: string, token: string, nonce = `nonce-${Date.now()}`) {
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', token).update(`${timestamp}.${nonce}.POST.${path}`).digest('hex');
  return { timestamp, nonce, signature };
}

describe('ReconciliationController worker authentication', () => {
  const previousToken = process.env.WORKER_TOKEN;
  const previousRequire = process.env.WORKER_REQUIRE_SIGNATURE;
  const request = { method: 'POST', originalUrl: '/api/v1/internal/reconciliation/run' } as any;

  beforeEach(() => {
    process.env.WORKER_TOKEN = 'test-worker-token-with-more-than-thirty-two-characters';
    process.env.WORKER_REQUIRE_SIGNATURE = 'true';
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.WORKER_TOKEN;
    else process.env.WORKER_TOKEN = previousToken;
    if (previousRequire === undefined) delete process.env.WORKER_REQUIRE_SIGNATURE;
    else process.env.WORKER_REQUIRE_SIGNATURE = previousRequire;
  });

  it('accepts a signed worker request once', async () => {
    const service = { runPendingReconciliation: jest.fn().mockResolvedValue({ ok: true }) } as any;
    const redis = { setNxPx: jest.fn().mockResolvedValue(true) } as any;
    const controller = new ReconciliationController(service, redis);
    const headers = signedHeaders('/api/v1/internal/reconciliation/run', process.env.WORKER_TOKEN!);

    await expect(controller.runInternal(request, process.env.WORKER_TOKEN, headers.timestamp, headers.nonce, headers.signature)).resolves.toEqual({ ok: true });
    expect(redis.setNxPx).toHaveBeenCalledWith(`worker:nonce:${headers.nonce}`, '1', 120_000);
  });

  it('rejects nonce replay', async () => {
    const service = { runPendingReconciliation: jest.fn() } as any;
    const redis = { setNxPx: jest.fn().mockResolvedValue(false) } as any;
    const controller = new ReconciliationController(service, redis);
    const headers = signedHeaders('/api/v1/internal/reconciliation/run', process.env.WORKER_TOKEN!, 'replayed-nonce');

    await expect(controller.runInternal(request, process.env.WORKER_TOKEN, headers.timestamp, headers.nonce, headers.signature)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.runPendingReconciliation).not.toHaveBeenCalled();
  });

  it('rejects tampered signatures', async () => {
    const service = { runPendingReconciliation: jest.fn() } as any;
    const redis = { setNxPx: jest.fn() } as any;
    const controller = new ReconciliationController(service, redis);
    const headers = signedHeaders('/api/v1/internal/reconciliation/run', process.env.WORKER_TOKEN!);

    await expect(controller.runInternal(request, process.env.WORKER_TOKEN, headers.timestamp, headers.nonce, 'bad')).rejects.toBeInstanceOf(ForbiddenException);
    expect(redis.setNxPx).not.toHaveBeenCalled();
  });
});
