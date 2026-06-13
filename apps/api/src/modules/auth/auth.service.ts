import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { RequestMeta } from '../../common/request-meta';
import { writeAudit } from '../../common/audit-log';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const MAX_FAILED_ATTEMPTS = Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? '5');
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS ?? String(10 * 60 * 1000));
const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MS ?? String(10 * 60 * 1000));
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS ?? String(8 * 60 * 60 * 1000));
const REFRESH_TTL_MS = Number(process.env.REFRESH_TTL_MS ?? String(7 * 24 * 60 * 60 * 1000));

type AttemptState = { count: number; firstFailedAt: number; lockedUntil?: number };
type LoginArea = 'admin' | 'guru' | 'siswa';
const loginAttempts = new Map<string, AttemptState>();

function safeKey(username: string, ip?: string | null) {
  const raw = `${username.trim().toLowerCase()}::${ip || 'unknown'}`;
  return createHash('sha256').update(raw).digest('hex');
}

function accountOnlyKey(username: string) {
  return createHash('sha256').update(`account::${username.trim().toLowerCase()}`).digest('hex');
}

function ipOnlyKey(ip?: string | null) {
  return createHash('sha256').update(`ip::${ip || 'unknown'}`).digest('hex');
}

function attemptsKey(key: string) {
  return `schoolhub:login:attempts:${key}`;
}

function lockKey(key: string) {
  return `schoolhub:login:lock:${key}`;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function publicLoginError() {
  return new UnauthorizedException('Username atau password salah.');
}

function roleToLoginArea(role: Role): LoginArea {
  if (role === Role.GURU_MAPEL) return 'guru';
  if (role === Role.SISWA) return 'siswa';
  return 'admin';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService
  ) {}

  async login(username: string, password: string, meta: RequestMeta = {}, expectedRole?: LoginArea) {
    const normalizedUsername = username.trim();
    const attemptKeys = [safeKey(normalizedUsername, meta.requestIp), accountOnlyKey(normalizedUsername), ipOnlyKey(meta.requestIp)];
    const now = Date.now();
    const lockedUntil = await this.getMaxLockedUntil(attemptKeys, now);

    if (lockedUntil && lockedUntil > now) {
      await this.writeLoginAudit('auth.login.locked', null, normalizedUsername, meta, { lockedUntil, limiter: 'redis-or-memory' });
      throw new HttpException('Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (!user || !user.active) {
      await this.registerFailedAttempt(attemptKeys, normalizedUsername, user?.id ?? null, meta, user ? 'inactive' : 'not_found');
      throw publicLoginError();
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.registerFailedAttempt(attemptKeys, normalizedUsername, user.id, meta, 'bad_password');
      throw publicLoginError();
    }

    await this.clearFailedAttempt(attemptKeys);

    const actualArea = roleToLoginArea(user.role);
    if (expectedRole && actualArea !== expectedRole) {
      await this.writeLoginAudit('auth.login.role_mismatch', user.id, user.username, meta, { role: user.role, expectedRole, actualArea });
      throw new UnauthorizedException('Akun tidak sesuai pilihan peran.');
    }

    const tokens = await this.issueSessionTokens(user, meta);
    await this.writeLoginAudit('auth.login.success', user.id, user.username, meta, { role: user.role, sessionId: tokens.sessionId });

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role
      }
    };
  }

  async currentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, fullName: true, role: true, active: true }
    });
    if (!user || !user.active) throw new UnauthorizedException('Sesi tidak aktif. Silakan masuk ulang.');
    return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  }

  async refresh(refreshToken: string | undefined, meta: RequestMeta = {}) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token tidak tersedia.');
    const now = new Date();
    const presentedHash = tokenHash(refreshToken);
    const current = await this.prisma.authSession.findFirst({
      where: { refreshTokenHash: presentedHash },
      include: { user: true }
    });
    if (!current || !current.user.active) throw new UnauthorizedException('Sesi tidak aktif. Silakan masuk ulang.');

    const familyId = current.tokenFamilyId || current.id;
    if (current.revokedAt || current.expiresAt <= now) {
      await this.prisma.$transaction(async (tx) => {
        const revoked = await tx.authSession.updateMany({
          where: { userId: current.userId, tokenFamilyId: familyId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'refresh-token-reuse' }
        });
        await writeAudit(tx, {
          actorId: current.userId,
          actorRole: current.user.role,
          module: 'auth',
          action: 'auth.refresh.reuse_detected',
          resource: 'authSession',
          resourceId: current.id,
          requestIp: meta.requestIp ?? null,
          requestDevice: meta.requestDevice ?? null,
          after: { tokenFamilyId: familyId, revoked: revoked.count }
        });
      });
      throw new UnauthorizedException('Refresh token sudah tidak valid. Seluruh sesi terkait dicabut.');
    }

    return this.prisma.$transaction(async (tx) => {
      const refreshValue = this.generateRefreshToken();
      const session = await tx.authSession.create({
        data: {
          userId: current.userId,
          sessionVersion: current.user.sessionVersion,
          refreshTokenHash: tokenHash(refreshValue),
          tokenFamilyId: familyId,
          userAgent: meta.requestDevice ?? null,
          requestIp: meta.requestIp ?? null,
          createdIp: current.createdIp ?? current.requestIp ?? meta.requestIp ?? null,
          lastIp: meta.requestIp ?? current.lastIp ?? current.requestIp ?? null,
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
        }
      });
      const revoked = await tx.authSession.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: new Date(), revokedReason: 'refresh-rotated', lastUsedAt: new Date(), replacedById: session.id }
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException('Sesi sudah dipakai untuk refresh. Silakan masuk ulang.');
      }
      const accessToken = await this.signAccessToken(current.user, session.id);
      await writeAudit(tx, {
        actorId: current.userId,
        actorRole: current.user.role,
        module: 'auth',
        action: 'auth.session.rotated',
        resource: 'authSession',
        resourceId: session.id,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        after: { previousSessionId: current.id, sessionId: session.id, tokenFamilyId: familyId }
      });
      return { accessToken, refreshToken: refreshValue, sessionId: session.id, expiresInMs: SESSION_TTL_MS };
    });
  }

  async logout(sessionId: string | undefined, actorId: string, actorRole: Role, meta: RequestMeta = {}) {
    if (sessionId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.authSession.updateMany({ where: { id: sessionId, userId: actorId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'logout' } });
        await writeAudit(tx, { actorId, actorRole, module: 'auth', action: 'auth.logout', resource: 'authSession', resourceId: sessionId, requestIp: meta.requestIp ?? null, requestDevice: meta.requestDevice ?? null, after: { revoked: true } });
      });
    }
    return { ok: true };
  }

  async logoutAll(actorId: string, actorRole: Role, meta: RequestMeta = {}) {
    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({ where: { userId: actorId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'logout-all' } });
      await writeAudit(tx, { actorId, actorRole, module: 'auth', action: 'auth.sessions.revoked', resource: 'user', resourceId: actorId, requestIp: meta.requestIp ?? null, requestDevice: meta.requestDevice ?? null, after: { count: revoked.count } });
      return revoked;
    });
    return { ok: true, revoked: result.count };
  }

  async revokeUserSessions(userId: string, actorId: string | null, reason: string) {
    const revoked = await this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
    await writeAudit(this.prisma, { actorId, module: 'auth', action: 'auth.user_sessions.revoked', resource: 'user', resourceId: userId, reason, after: { count: revoked.count } });
    return revoked.count;
  }

  private async issueSessionTokens(user: { id: string; username: string; role: Role; sessionVersion: number }, meta: RequestMeta) {
    const refreshToken = this.generateRefreshToken();
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        sessionVersion: user.sessionVersion,
        refreshTokenHash: tokenHash(refreshToken),
        tokenFamilyId: randomUUID(),
        userAgent: meta.requestDevice ?? null,
        requestIp: meta.requestIp ?? null,
        createdIp: meta.requestIp ?? null,
        lastIp: meta.requestIp ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
      }
    });
    const accessToken = await this.signAccessToken(user, session.id);
    return { accessToken, refreshToken, sessionId: session.id, expiresInMs: SESSION_TTL_MS };
  }

  private signAccessToken(user: { id: string; username: string; role: Role; sessionVersion: number }, sessionId: string) {
    return this.jwtService.signAsync({ sub: user.id, username: user.username, role: user.role, sid: sessionId, ver: user.sessionVersion, jti: randomUUID() });
  }

  private generateRefreshToken() {
    return `shrt_${randomBytes(48).toString('base64url')}`;
  }

  private async registerFailedAttempt(keys: string[], username: string, actorId: string | null, meta: RequestMeta, reason: string) {
    const now = Date.now();
    let maxCount = 0;
    let lockedUntil: number | null = null;
    let limiter = 'redis';

    for (const key of keys) {
      const redisCount = await this.redis.incrWithTtl(attemptsKey(key), Math.ceil(LOGIN_WINDOW_MS / 1000));
      if (redisCount === null) {
        limiter = 'memory-fallback';
        const existing = loginAttempts.get(key);
        const state: AttemptState = !existing || now - existing.firstFailedAt > LOGIN_WINDOW_MS
          ? { count: 1, firstFailedAt: now }
          : { ...existing, count: existing.count + 1 };
        if (state.count >= MAX_FAILED_ATTEMPTS) state.lockedUntil = now + LOGIN_LOCK_MS;
        loginAttempts.set(key, state);
        maxCount = Math.max(maxCount, state.count);
        lockedUntil = Math.max(lockedUntil ?? 0, state.lockedUntil ?? 0) || null;
        continue;
      }
      maxCount = Math.max(maxCount, redisCount);
      if (redisCount >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = now + LOGIN_LOCK_MS;
        await this.redis.setPx(lockKey(key), String(lockedUntil), LOGIN_LOCK_MS);
        await this.redis.del(attemptsKey(key));
      }
    }

    await this.writeLoginAudit('auth.login.failed', actorId, username, meta, { reason, failedCount: maxCount, lockedUntil, limiter });
  }

  private async getMaxLockedUntil(keys: string[], now: number) {
    let max: number | null = null;
    for (const key of keys) {
      const redisLockedUntil = await this.redis.get(lockKey(key));
      if (redisLockedUntil) {
        const parsed = Number(redisLockedUntil);
        if (Number.isFinite(parsed) && parsed > now) max = Math.max(max ?? 0, parsed);
      }
      const currentAttempt = loginAttempts.get(key);
      if (currentAttempt?.lockedUntil && currentAttempt.lockedUntil > now) max = Math.max(max ?? 0, currentAttempt.lockedUntil);
    }
    return max;
  }

  private async clearFailedAttempt(keys: string[]) {
    for (const key of keys) loginAttempts.delete(key);
    await this.redis.del(...keys.flatMap((key) => [attemptsKey(key), lockKey(key)]));
  }

  private async writeLoginAudit(action: string, actorId: string | null, username: string, meta: RequestMeta, details: Record<string, unknown>) {
    await writeAudit(this.prisma, {
      actorId,
      actorRole: details.role && typeof details.role === 'string' ? details.role as Role : null,
      module: 'auth',
      action,
      resource: 'authSession',
      resourceId: username,
      requestIp: meta.requestIp ?? null,
      requestDevice: meta.requestDevice ?? null,
      after: details as Prisma.InputJsonValue
    });
  }
}
