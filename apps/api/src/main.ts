import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

function corsOrigins() {
  const raw = process.env.CORS_ORIGIN || process.env.PUBLIC_APP_ORIGIN || '';
  const origins = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production') return origins;
  return origins.length ? origins : true;
}

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
  express.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'accept', 'x-reader-device-id', 'x-reader-timestamp', 'x-reader-nonce', 'x-reader-body-hash', 'x-reader-signature', 'x-worker-token']
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
