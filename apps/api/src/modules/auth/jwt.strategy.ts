import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  sid?: string;
  ver?: number;
}

function cookieExtractor(request?: Request) {
  if (!request?.headers.cookie) return null;
  const cookies = request.headers.cookie.split(';').map((part) => part.trim());
  for (const cookie of cookies) {
    const [name, ...rawValue] = cookie.split('=');
    if (name === 'schoolhub_access_token') return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!value || value === 'dev-only-secret')) {
    throw new Error('JWT_SECRET wajib diatur dan tidak boleh memakai default di production.');
  }
  return value ?? 'dev-only-secret';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
      passReqToCallback: false
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, active: true, sessionVersion: true }
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Sesi tidak aktif. Silakan masuk ulang.');
    }

    if (payload.ver !== undefined && payload.ver !== user.sessionVersion) {
      throw new UnauthorizedException('Sesi sudah tidak berlaku. Silakan masuk ulang.');
    }

    if (payload.sid) {
      const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
      if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date()) {
        throw new UnauthorizedException('Sesi sudah dicabut atau kedaluwarsa.');
      }
    }

    return { sub: user.id, username: user.username, role: user.role, sessionId: payload.sid ?? null };
  }
}
