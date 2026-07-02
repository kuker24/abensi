import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AccessController, ID_CARD_GENERATOR_ALLOWED_ROLES } from './access.controller';

describe('AccessController id-card-generator auth_request endpoint', () => {
  const controller = new AccessController();

  it.each([Role.ADMIN_TU, Role.DEVELOPER, Role.OPERATOR_IT])('allows %s for server-side generator access', (role) => {
    expect(ID_CARD_GENERATOR_ALLOWED_ROLES.has(role)).toBe(true);
    expect(controller.idCardGenerator({ role })).toBeUndefined();
  });

  it.each([Role.SISWA, Role.GURU_MAPEL, Role.GURU_PIKET, Role.KEPALA_SEKOLAH])('rejects %s for server-side generator access', (role) => {
    expect(() => controller.idCardGenerator({ role })).toThrow(ForbiddenException);
  });
});
