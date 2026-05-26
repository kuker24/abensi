import { Module } from '@nestjs/common';
import { MobileModule } from '../mobile/mobile.module';
import { QrCredentialsModule } from '../qr-credentials/qr-credentials.module';
import { AttendanceGateController, AttendanceReaderScanController } from './attendance-gate.controller';
import { AttendanceGateService } from './attendance-gate.service';

@Module({
  imports: [QrCredentialsModule, MobileModule],
  controllers: [AttendanceGateController, AttendanceReaderScanController],
  providers: [AttendanceGateService]
})
export class AttendanceGateModule {}
