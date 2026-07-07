import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
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
type LoginSecurityActor = { sub: string; role: Role };
type LoginLimitBucket = 'account' | 'accountCurrentNetwork' | 'legacyCurrentNetwork';
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

function loginLimitKeys(username: string, ip?: string | null) {
  return [safeKey(username, ip), accountOnlyKey(username)];
}

function loginLimitCleanupKeys(username: string, ip?: string | null) {
  return Array.from(new Set([...loginLimitKeys(username, ip), ipOnlyKey(ip)]));
}

function bucketLabel(index: number): LoginLimitBucket {
  if (index === 0) return 'accountCurrentNetwork';
  if (index === 1) return 'account';
  return 'legacyCurrentNetwork';
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
    const attemptKeys = loginLimitKeys(normalizedUsername, meta.requestIp);
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
        role: user.role,
        mustChangePassword: user.mustChangePassword ?? false
      }
    };
  }

  async currentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, fullName: true, role: true, active: true, mustChangePassword: true }
    });
    if (!user || !user.active) throw new UnauthorizedException('Sesi tidak aktif. Silakan masuk ulang.');
    return { id: user.id, username: user.username, fullName: user.fullName, role: user.role, mustChangePassword: user.mustChangePassword };
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
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
      await writeAudit(tx, { actorId, module: 'auth', action: 'auth.user_sessions.revoked', resource: 'user', resourceId: userId, reason, after: { count: revoked.count } });
      return revoked.count;
    });
  }


  async getLoginLockoutStatus(username: string, actor: LoginSecurityActor, meta: RequestMeta = {}) {
    this.assertCanManageLoginLockouts(actor);
    const normalizedUsername = this.normalizeLockoutUsername(username);
    const targetUser = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true, username: true, fullName: true, role: true, active: true }
    });
    const now = Date.now();
    const buckets = await this.readLoginLimitBuckets(loginLimitCleanupKeys(normalizedUsername, meta.requestIp), now);
    const checkedBuckets = buckets.filter((bucket) => bucket.bucket !== 'legacyCurrentNetwork');
    const lockedUntil = Math.max(0, ...checkedBuckets.map((bucket) => bucket.lockedUntil ?? 0)) || null;
    const failedCount = Math.max(0, ...checkedBuckets.map((bucket) => bucket.failedCount));
    return {
      username: normalizedUsername,
      user: targetUser ? { id: targetUser.id, username: targetUser.username, fullName: targetUser.fullName, role: targetUser.role, active: targetUser.active } : null,
      lockout: {
        locked: Boolean(lockedUntil && lockedUntil > now),
        lockedUntil: lockedUntil ? new Date(lockedUntil).toISOString() : null,
        failedCount,
        maxFailedAttempts: MAX_FAILED_ATTEMPTS,
        windowMs: LOGIN_WINDOW_MS,
        lockMs: LOGIN_LOCK_MS,
        buckets: buckets.map((bucket) => ({
          bucket: bucket.bucket,
          failedCount: bucket.failedCount,
          locked: Boolean(bucket.lockedUntil && bucket.lockedUntil > now),
          lockedUntil: bucket.lockedUntil ? new Date(bucket.lockedUntil).toISOString() : null
        }))
      }
    };
  }

  async clearLoginLockout(username: string, reason: string, actor: LoginSecurityActor, meta: RequestMeta = {}) {
    this.assertCanManageLoginLockouts(actor);
    const normalizedUsername = this.normalizeLockoutUsername(username);
    const normalizedReason = reason?.trim();
    if (!normalizedReason || normalizedReason.length < 8) throw new HttpException('Alasan minimal 8 karakter.', HttpStatus.BAD_REQUEST);
    const before = await this.getLoginLockoutStatus(normalizedUsername, actor, meta);
    const keys = loginLimitCleanupKeys(normalizedUsername, meta.requestIp);
    await this.clearFailedAttempt(keys);
    const after = await this.getLoginLockoutStatus(normalizedUsername, actor, meta);
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'auth',
        action: 'auth.login_lockout.cleared',
        resource: before.user ? 'user' : 'authSession',
        resourceId: before.user?.id ?? normalizedUsername,
        reason: normalizedReason,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        after: {
          username: normalizedUsername,
          targetUserId: before.user?.id ?? null,
          targetRole: before.user?.role ?? null,
          before: before.lockout,
          after: after.lockout,
          clearedBuckets: ['account', 'accountCurrentNetwork', 'legacyCurrentNetwork']
        } as Prisma.InputJsonValue
      });
    });
    return { ok: true, username: normalizedUsername, user: before.user, before: before.lockout, after: after.lockout };
  }

  async changePassword(userId: string, actorRole: Role, currentPassword: string, newPassword: string, meta: RequestMeta = {}) {
    if (currentPassword === newPassword) throw new HttpException('Password baru harus berbeda.', HttpStatus.BAD_REQUEST);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException('Sesi tidak aktif. Silakan masuk ulang.');
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) throw publicLoginError();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, sessionVersion: { increment: 1 } }
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password-change' }
      });
      await writeAudit(tx, {
        actorId: userId,
        actorRole,
        module: 'auth',
        action: 'auth.password.changed',
        resource: 'user',
        resourceId: userId,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        after: { passwordChanged: true, sessionsRevoked: revoked.count }
      });
    });
    return { ok: true };
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
    for (const bucket of await this.readLoginLimitBuckets(keys, now)) {
      if (bucket.lockedUntil && bucket.lockedUntil > now) max = Math.max(max ?? 0, bucket.lockedUntil);
    }
    return max;
  }

  private async readLoginLimitBuckets(keys: string[], now: number) {
    const buckets: Array<{ bucket: LoginLimitBucket; failedCount: number; lockedUntil: number | null }> = [];
    for (const [index, key] of keys.entries()) {
      const redisLockedUntil = await this.redis.get(lockKey(key));
      const redisAttempts = await this.redis.get(attemptsKey(key));
      const parsedRedisLockedUntil = redisLockedUntil ? Number(redisLockedUntil) : null;
      const memoryAttempt = loginAttempts.get(key);
      const memoryInWindow = memoryAttempt && now - memoryAttempt.firstFailedAt <= LOGIN_WINDOW_MS ? memoryAttempt : null;
      const lockedUntilValues = [
        Number.isFinite(parsedRedisLockedUntil) ? parsedRedisLockedUntil : null,
        memoryInWindow?.lockedUntil ?? null
      ].filter((value): value is number => typeof value === 'number' && value > now);
      buckets.push({
        bucket: bucketLabel(index),
        failedCount: Math.max(Number(redisAttempts ?? 0) || 0, memoryInWindow?.count ?? 0),
        lockedUntil: lockedUntilValues.length ? Math.max(...lockedUntilValues) : null
      });
    }
    return buckets;
  }

  private normalizeLockoutUsername(username: string) {
    const normalized = username?.trim();
    if (!normalized) throw new HttpException('Username wajib diisi.', HttpStatus.BAD_REQUEST);
    return normalized;
  }

  private assertCanManageLoginLockouts(actor: LoginSecurityActor) {
    if (!([Role.ADMIN_TU, Role.DEVELOPER] as Role[]).includes(actor.role)) {
      throw new ForbiddenException('Hanya Admin TU atau Developer yang dapat membuka kunci login.');
    }
  }

  private async clearFailedAttempt(keys: string[]) {
    for (const key of keys) loginAttempts.delete(key);
    await this.redis.del(...keys.flatMap((key) => [attemptsKey(key), lockKey(key)]));
  }

  private async writeLoginAudit(action: string, actorId: string | null, username: string, meta: RequestMeta, details: Record<string, unknown>) {
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
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
    });
  }
}
