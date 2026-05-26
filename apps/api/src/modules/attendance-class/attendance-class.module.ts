import { Module } from '@nestjs/common';
import { AttendanceClassController } from './attendance-class.controller';
import { AttendanceClassService } from './attendance-class.service';

@Module({
  controllers: [AttendanceClassController],
  providers: [AttendanceClassService],
  exports: [AttendanceClassService]
})
export class AttendanceClassModule {}
