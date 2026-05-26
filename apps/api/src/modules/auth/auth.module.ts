import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!value || value === 'dev-only-secret')) {
    throw new Error('JWT_SECRET wajib diatur dan tidak boleh memakai default di production.');
  }
  return value ?? 'dev-only-secret';
}

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' }
    })
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService]
})
export class AuthModule {}
