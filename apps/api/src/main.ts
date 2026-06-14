import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { csrfProtection } from './common/csrf';
import { trustedProxySettingFromEnv } from './common/trusted-proxy';
import { AppModule } from './app.module';

function corsOrigins() {
  const raw = process.env.CORS_ORIGIN || process.env.PUBLIC_APP_ORIGIN || '';
  const origins = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production') return origins;
  return origins.length ? origins : true;
}

const metrics = {
  startedAt: Date.now(),
  httpRequests: 0,
  httpErrors: 0,
  securityRejects: 0
};

function apiPort() {
  const raw = process.env.PORT?.trim() || '3000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT tidak valid: ${raw}`);
  }
  return port;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  express.set('trust proxy', trustedProxySettingFromEnv());
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const requestId = typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : randomUUID();
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      metrics.httpRequests += 1;
      if (response.statusCode >= 400) metrics.httpErrors += 1;
      if ([401, 403, 429].includes(response.statusCode)) metrics.securityRejects += 1;
      const log = {
        level: response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info',
        type: 'http_request',
        requestId,
        method: request.method,
        path: request.originalUrl?.split('?')[0],
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        userAgent: request.headers['user-agent'] ? '[redacted]' : null,
        ip: request.ip
      };
      console.log(JSON.stringify(log));
    });
    next();
  });
  const metricsHandler = (_request: Request, response: Response) => {
    response.type('text/plain; version=0.0.4');
    response.send([
      '# HELP schoolhub_http_requests_total Total HTTP requests observed by API process.',
      '# TYPE schoolhub_http_requests_total counter',
      `schoolhub_http_requests_total ${metrics.httpRequests}`,
      '# HELP schoolhub_http_errors_total Total HTTP responses with status >= 400.',
      '# TYPE schoolhub_http_errors_total counter',
      `schoolhub_http_errors_total ${metrics.httpErrors}`,
      '# HELP schoolhub_security_rejects_total Total 401/403/429 responses.',
      '# TYPE schoolhub_security_rejects_total counter',
      `schoolhub_security_rejects_total ${metrics.securityRejects}`,
      '# HELP schoolhub_process_uptime_seconds API process uptime.',
      '# TYPE schoolhub_process_uptime_seconds gauge',
      `schoolhub_process_uptime_seconds ${Math.floor((Date.now() - metrics.startedAt) / 1000)}`,
      ''
    ].join('\n'));
  };
  express.get('/metrics', metricsHandler);
  express.get('/api/v1/metrics', metricsHandler);
  app.use(csrfProtection);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'accept', 'x-csrf-token', 'x-reader-device-id', 'x-reader-timestamp', 'x-reader-nonce', 'x-reader-body-hash', 'x-reader-signature', 'x-worker-token', 'x-worker-timestamp', 'x-worker-nonce', 'x-worker-signature', 'x-worker-job']
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  await app.listen(apiPort(), '0.0.0.0');
}

bootstrap();
