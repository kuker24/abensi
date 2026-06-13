import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
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
  jti?: string;
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
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
      issuer: process.env.JWT_ISSUER || 'schoolhub-ehadir-dev',
      audience: process.env.JWT_AUDIENCE || 'schoolhub-ehadir-web',
      algorithms: ['HS256'],
      passReqToCallback: true
    });
  }

  async validate(request: Request, payload: JwtPayload) {
    if (!payload.jti) {
      throw new UnauthorizedException('Token tidak memiliki identitas sesi yang valid.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, active: true, sessionVersion: true, mustChangePassword: true }
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

    const allowedWhilePasswordChangeRequired = [
      '/auth/me',
      '/auth/csrf',
      '/auth/refresh',
      '/auth/change-password',
      '/auth/logout',
      '/auth/logout-all'
    ];
    const requestPath = request.path.replace(/^\/api\/v\d+/, '');
    if (user.mustChangePassword && !allowedWhilePasswordChangeRequired.includes(requestPath)) {
      throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password wajib diganti sebelum mengakses fitur lain.' });
    }

    return { sub: user.id, username: user.username, role: user.role, sessionId: payload.sid ?? null, mustChangePassword: user.mustChangePassword };
  }
}
