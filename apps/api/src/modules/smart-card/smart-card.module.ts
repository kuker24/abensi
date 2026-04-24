import { Module } from '@nestjs/common';
import { SmartCardController } from './smart-card.controller';
import { SmartCardService } from './smart-card.service';

@Module({
  controllers: [SmartCardController],
  providers: [SmartCardService]
})
export class SmartCardModule {}
