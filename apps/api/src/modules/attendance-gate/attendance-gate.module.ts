import { Module } from '@nestjs/common';
import { AttendanceGateController } from './attendance-gate.controller';
import { AttendanceGateService } from './attendance-gate.service';

@Module({
  controllers: [AttendanceGateController],
  providers: [AttendanceGateService]
})
export class AttendanceGateModule {}
