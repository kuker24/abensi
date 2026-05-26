-- Performance/stability indexes for beta production workload.
-- These indexes target common filters, joins, ordering, and dashboard/report reads.

CREATE INDEX IF NOT EXISTS "User_role_active_idx" ON "User"("role", "active");
CREATE INDEX IF NOT EXISTS "User_active_createdAt_idx" ON "User"("active", "createdAt");

CREATE INDEX IF NOT EXISTS "SchoolClass_yearLabel_idx" ON "SchoolClass"("yearLabel");

CREATE INDEX IF NOT EXISTS "Session_status_startsAt_idx" ON "Session"("status", "startsAt");
CREATE INDEX IF NOT EXISTS "Session_classId_startsAt_idx" ON "Session"("classId", "startsAt");
CREATE INDEX IF NOT EXISTS "Session_teacherId_startsAt_idx" ON "Session"("teacherId", "startsAt");
CREATE INDEX IF NOT EXISTS "Session_roomId_startsAt_idx" ON "Session"("roomId", "startsAt");

CREATE INDEX IF NOT EXISTS "StudentAttendance_studentId_status_idx" ON "StudentAttendance"("studentId", "status");
CREATE INDEX IF NOT EXISTS "StudentAttendance_studentId_updatedAt_idx" ON "StudentAttendance"("studentId", "updatedAt");

CREATE INDEX IF NOT EXISTS "GateLog_deviceId_tappedAt_idx" ON "GateLog"("deviceId", "tappedAt");

CREATE INDEX IF NOT EXISTS "ReconciliationFlag_status_createdAt_idx" ON "ReconciliationFlag"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_reviewStatus_priority_createdAt_idx" ON "ReconciliationFlag"("reviewStatus", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_userId_status_idx" ON "ReconciliationFlag"("userId", "status");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_dueAt_idx" ON "ReconciliationFlag"("dueAt");

CREATE INDEX IF NOT EXISTS "AuditEntry_requestIp_createdAt_idx" ON "AuditEntry"("requestIp", "createdAt");

CREATE INDEX IF NOT EXISTS "TeacherLeave_date_status_idx" ON "TeacherLeave"("date", "status");

CREATE INDEX IF NOT EXISTS "WeeklySchedule_active_effectiveFrom_effectiveTo_idx" ON "WeeklySchedule"("active", "effectiveFrom", "effectiveTo");

CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
