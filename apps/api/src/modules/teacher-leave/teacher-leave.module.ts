import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeacherLeaveController } from './teacher-leave.controller';
import { TeacherLeaveService } from './teacher-leave.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TeacherLeaveController],
  providers: [TeacherLeaveService],
  exports: [TeacherLeaveService]
})
export class TeacherLeaveModule {}
