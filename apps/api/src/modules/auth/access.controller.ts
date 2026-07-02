import { Controller, ForbiddenException, Get, HttpCode, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

export const ID_CARD_GENERATOR_ALLOWED_ROLES = new Set<Role>([
  Role.ADMIN_TU,
  Role.DEVELOPER,
  Role.OPERATOR_IT
]);

@Controller('internal/access')
export class AccessController {
  @Get('id-card-generator')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  idCardGenerator(@CurrentUser() user: { role: Role }) {
    if (!ID_CARD_GENERATOR_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Generator kartu hanya tersedia untuk operator internal yang berwenang.');
    }
  }
}
