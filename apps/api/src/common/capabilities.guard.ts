import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { CAPABILITIES_KEY } from './capabilities.decorator';
import { API_ERROR_CODES } from '@schoolhub/shared';
import { hasCapability, type Capability } from './capabilities';

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredCapabilities = this.reflector.getAllAndOverride<Capability[]>(CAPABILITIES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredCapabilities || requiredCapabilities.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const role = request.user?.role as Role | undefined;
    const allowed = requiredCapabilities.every((capability) => hasCapability(role, capability));
    if (!allowed) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.MISSING_CAPABILITY,
        message: 'Akses ditolak untuk kapabilitas ini.',
        requiredCapabilities
      });
    }
    return true;
  }
}
