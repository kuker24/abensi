import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StepUpAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async assertRecentPassword(actorId: string, password?: string | null) {
    if (!password) throw new UnauthorizedException('Konfirmasi kata sandi wajib untuk aksi sensitif.');
    const user = await this.prisma.user.findUnique({ where: { id: actorId }, select: { passwordHash: true, active: true } });
    if (!user || !user.active) throw new UnauthorizedException('Sesi tidak aktif.');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new ForbiddenException('Konfirmasi kata sandi tidak sesuai.');
    return true;
  }
}
