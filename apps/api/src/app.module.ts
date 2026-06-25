import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AcademicModule } from './modules/academic/academic.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { AttendanceGateModule } from './modules/attendance-gate/attendance-gate.module';
import { AttendanceClassModule } from './modules/attendance-class/attendance-class.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { AccessGeofenceModule } from './modules/access-geofence/access-geofence.module';
import { DeviceReaderModule } from './modules/device-reader/device-reader.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { AuditModule } from './modules/audit/audit.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { SmartCardModule } from './modules/smart-card/smart-card.module';
import { PicketBookModule } from './modules/picket-book/picket-book.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TeacherLeaveModule } from './modules/teacher-leave/teacher-leave.module';
import { StudentsModule } from './modules/students/students.module';
import { TeacherModule } from './modules/teacher/teacher.module';
import { TutorialsModule } from './modules/tutorials/tutorials.module';
import { SystemCleanupModule } from './modules/system-cleanup/system-cleanup.module';
import { SecurityModule } from './modules/security/security.module';
import { QrCredentialsModule } from './modules/qr-credentials/qr-credentials.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { validateEnvironment } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    RedisModule,
    SecurityModule,
    AuthModule,
    HealthModule,
    IdentityModule,
    AcademicModule,
    SchedulingModule,
    AttendanceGateModule,
    AttendanceClassModule,
    ReconciliationModule,
    AccessGeofenceModule,
    DeviceReaderModule,
    QrCredentialsModule,
    MobileModule,
    SmartCardModule,
    PicketBookModule,
    NotificationsModule,
    TeacherLeaveModule,
    StudentsModule,
    TeacherModule,
    TutorialsModule,
    SystemCleanupModule,
    OutboxModule,
    ReportingModule,
    AuditModule
  ]
})
export class AppModule {}
