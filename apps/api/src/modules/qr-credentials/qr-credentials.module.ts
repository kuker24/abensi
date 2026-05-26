import { Module } from '@nestjs/common';
import { QrCredentialsController } from './qr-credentials.controller';
import { QrCredentialsService } from './qr-credentials.service';

@Module({
  controllers: [QrCredentialsController],
  providers: [QrCredentialsService],
  exports: [QrCredentialsService]
})
export class QrCredentialsModule {}
