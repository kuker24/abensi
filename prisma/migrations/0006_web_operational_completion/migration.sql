-- Web/backend operational completion: security-supporting workflow data, teacher leave, academic structure,
-- weekly schedules, notifications, and richer anomaly review fields.

DO $$ BEGIN
  CREATE TYPE "TeacherLeaveType" AS ENUM ('IZIN', 'SAKIT', 'DINAS_LUAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TeacherLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReconciliationReviewStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReconciliationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('SESSION_MISSED', 'ANOMALY_NEW', 'LEAVE_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'IMPORT_DONE', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AcademicYear" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Semester" (
  "id" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Room" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TeacherLeave" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "type" "TeacherLeaveType" NOT NULL,
  "status" "TeacherLeaveStatus" NOT NULL DEFAULT 'PENDING',
  "date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "adminNote" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "substituteTeacherId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherLeave_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WeeklySchedule" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "roomId" TEXT,
  "academicYearId" TEXT,
  "semesterId" TEXT,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklySchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "role" "Role",
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "weeklyScheduleId" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "ReconciliationFlag" ADD COLUMN IF NOT EXISTS "reviewStatus" "ReconciliationReviewStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "ReconciliationFlag" ADD COLUMN IF NOT EXISTS "priority" "ReconciliationPriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "ReconciliationFlag" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "ReconciliationFlag" ADD COLUMN IF NOT EXISTS "followUpNote" TEXT;
ALTER TABLE "ReconciliationFlag" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "AcademicYear_code_key" ON "AcademicYear"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Semester_academicYearId_code_key" ON "Semester"("academicYearId", "code");
CREATE INDEX IF NOT EXISTS "Semester_active_idx" ON "Semester"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "Room_code_key" ON "Room"("code");
CREATE INDEX IF NOT EXISTS "TeacherLeave_teacherId_date_idx" ON "TeacherLeave"("teacherId", "date");
CREATE INDEX IF NOT EXISTS "TeacherLeave_status_date_idx" ON "TeacherLeave"("status", "date");
CREATE INDEX IF NOT EXISTS "TeacherLeave_substituteTeacherId_date_idx" ON "TeacherLeave"("substituteTeacherId", "date");
CREATE INDEX IF NOT EXISTS "WeeklySchedule_dayOfWeek_active_idx" ON "WeeklySchedule"("dayOfWeek", "active");
CREATE INDEX IF NOT EXISTS "WeeklySchedule_classId_dayOfWeek_idx" ON "WeeklySchedule"("classId", "dayOfWeek");
CREATE INDEX IF NOT EXISTS "WeeklySchedule_teacherId_dayOfWeek_idx" ON "WeeklySchedule"("teacherId", "dayOfWeek");
CREATE INDEX IF NOT EXISTS "Session_weeklyScheduleId_startsAt_idx" ON "Session"("weeklyScheduleId", "startsAt");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_reviewStatus_idx" ON "ReconciliationFlag"("reviewStatus");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_priority_idx" ON "ReconciliationFlag"("priority");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_assignedToId_idx" ON "ReconciliationFlag"("assignedToId");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_role_readAt_createdAt_idx" ON "Notification"("role", "readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Semester" ADD CONSTRAINT "Semester_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_weeklyScheduleId_fkey" FOREIGN KEY ("weeklyScheduleId") REFERENCES "WeeklySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ReconciliationFlag" ADD CONSTRAINT "ReconciliationFlag_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
