import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SystemCleanupController } from './system-cleanup.controller';
import { SystemCleanupService } from './system-cleanup.service';

@Module({
  imports: [PrismaModule],
  controllers: [SystemCleanupController],
  providers: [SystemCleanupService]
})
export class SystemCleanupModule {}
