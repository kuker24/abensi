import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
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
import { SmartCardModule } from './modules/smart-card/smart-card.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
    SmartCardModule,
    ReportingModule,
    AuditModule
  ]
})
export class AppModule {}
