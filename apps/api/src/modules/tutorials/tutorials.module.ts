import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TutorialsController } from './tutorials.controller';
import { TutorialsService } from './tutorials.service';

@Module({
  imports: [PrismaModule],
  controllers: [TutorialsController],
  providers: [TutorialsService]
})
export class TutorialsModule {}
