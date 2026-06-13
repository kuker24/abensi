import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { extractRequestMeta } from '../../common/request-meta';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto.login';
import { csrfCookieOptions, CSRF_COOKIE, generateCsrfToken } from '../../common/csrf';
import { JwtAuthGuard } from './jwt-auth.guard';

const ACCESS_COOKIE = 'schoolhub_access_token';
const REFRESH_COOKIE = 'schoolhub_refresh_token';

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge
  };
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.cookie || '';
  const parts = raw.split(';').map((part) => part.trim());
  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }
  return undefined;
}

function setAuthCookies(response: Response, tokens: { accessToken: string; refreshToken: string; expiresInMs: number }) {
  response.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOptions(tokens.expiresInMs));
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(Number(process.env.REFRESH_TTL_MS ?? String(7 * 24 * 60 * 60 * 1000))));
  response.cookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions());
}

function loginResponse(result: { user: unknown }) {
  return { user: result.user };
}

function clearAuthCookies(response: Response) {
  response.clearCookie(ACCESS_COOKIE, { path: '/' });
  response.clearCookie(REFRESH_COOKIE, { path: '/' });
  response.clearCookie(CSRF_COOKIE, { path: '/' });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(body.username, body.password, extractRequestMeta(request), body.expectedRole);
    setAuthCookies(response, result);
    return loginResponse(result);
  }

  @Get('sso/config')
  ssoConfig() {
    const enabled = process.env.SSO_IMPLEMENTATION_READY === 'true'
      && process.env.SSO_ENABLED === 'true'
      && Boolean(process.env.WORKOS_CLIENT_ID)
      && Boolean(process.env.WORKOS_CLIENT_SECRET)
      && Boolean(process.env.WORKOS_ISSUER)
      && Boolean(process.env.WORKOS_AUDIENCE)
      && Boolean(process.env.WORKOS_REDIRECT_URI);
    return { enabled, provider: enabled ? 'workos' : null };
  }

  @Post('sso/workos/callback')
  async workosCallback() {
    throw new HttpException('SSO WorkOS belum dikonfigurasi pada server.', HttpStatus.SERVICE_UNAVAILABLE);
  }

  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response) {
    const csrfToken = generateCsrfToken();
    response.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions());
    return { csrfToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { sub: string; role: Role }) {
    return { user: await this.authService.currentUser(user.sub) };
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.refresh(readCookie(request, REFRESH_COOKIE), extractRequestMeta(request));
    setAuthCookies(response, result);
    return { ok: true };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.changePassword(user.sub, user.role, body.currentPassword, body.newPassword, extractRequestMeta(request));
    clearAuthCookies(response);
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: { sub: string; role: Role; sessionId?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.logout(user.sessionId, user.sub, user.role, extractRequestMeta(request));
    clearAuthCookies(response);
    return result;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: { sub: string; role: Role },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.logoutAll(user.sub, user.role, extractRequestMeta(request));
    clearAuthCookies(response);
    return result;
  }
}
