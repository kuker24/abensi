import { Module } from '@nestjs/common';
import { MobileModule } from '../mobile/mobile.module';
import { QrCredentialsModule } from '../qr-credentials/qr-credentials.module';
import { AttendanceGateController, AttendanceReaderScanController, DeviceGateEventsController } from './attendance-gate.controller';
import { AttendanceGateService } from './attendance-gate.service';

@Module({
  imports: [QrCredentialsModule, MobileModule],
  controllers: [AttendanceGateController, AttendanceReaderScanController, DeviceGateEventsController],
  providers: [AttendanceGateService]
})
export class AttendanceGateModule {}
