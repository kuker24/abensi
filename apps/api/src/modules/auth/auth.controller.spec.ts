import { HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController SSO truthfulness', () => {
  it('hard-disables SSO config until a real callback implementation exists', () => {
    const controller = new AuthController({} as any);

    expect(controller.ssoConfig()).toEqual({ enabled: false, provider: null, code: 'SSO_NOT_IMPLEMENTED' });
  });

  it('returns a stable NOT_IMPLEMENTED callback error instead of advertising an unusable SSO flow', async () => {
    const controller = new AuthController({} as any);

    await expect(controller.workosCallback()).rejects.toMatchObject({
      status: HttpStatus.NOT_IMPLEMENTED,
      response: { code: 'SSO_NOT_IMPLEMENTED', message: 'SSO WorkOS belum tersedia.' }
    });
  });
});
