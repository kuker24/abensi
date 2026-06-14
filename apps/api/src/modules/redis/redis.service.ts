import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client?: RedisClientType;
  private connectPromise?: Promise<void>;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL belum diatur; cache/rate-limit Redis dinonaktifkan dan memakai fallback lokal bila tersedia.');
      return;
    }

    this.client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
      }
    });

    this.client.on('error', (error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });
  }

  private async ensureConnected() {
    if (!this.client) return null;
    if (this.client.isOpen) return this.client;

    this.connectPromise ??= this.client.connect()
      .then(() => {
        this.logger.log('Redis connected.');
      })
      .catch((error) => {
        this.connectPromise = undefined;
        this.logger.warn(`Redis connection failed: ${error.message}`);
        throw error;
      });

    await this.connectPromise;
    return this.client;
  }

  async ping() {
    const client = await this.ensureConnected();
    if (!client) return { status: 'disabled' as const };
    const startedAt = Date.now();
    await client.ping();
    return { status: 'ok' as const, latencyMs: Date.now() - startedAt };
  }

  async get(key: string) {
    try {
      const client = await this.ensureConnected();
      return client ? await client.get(key) : null;
    } catch {
      return null;
    }
  }

  async setPx(key: string, value: string, ttlMs: number) {
    try {
      const client = await this.ensureConnected();
      if (!client) return false;
      await client.set(key, value, { PX: ttlMs });
      return true;
    } catch {
      return false;
    }
  }

  async setNxPx(key: string, value: string, ttlMs: number) {
    try {
      const client = await this.ensureConnected();
      if (!client) return null;
      const result = await client.set(key, value, { PX: ttlMs, NX: true });
      return result === 'OK';
    } catch {
      return null;
    }
  }

  async incrWithTtl(key: string, ttlSeconds: number) {
    try {
      const client = await this.ensureConnected();
      if (!client) return null;
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, ttlSeconds);
      }
      return count;
    } catch {
      return null;
    }
  }

  async del(...keys: string[]) {
    try {
      const client = await this.ensureConnected();
      if (!client || keys.length === 0) return false;
      await client.del(keys);
      return true;
    } catch {
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    try {
      const client = await this.ensureConnected();
      if (!client) return false;
      await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}
