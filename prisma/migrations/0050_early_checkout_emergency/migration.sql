CREATE TABLE "EarlyCheckoutEmergency" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "includeTeachers" BOOLEAN NOT NULL DEFAULT false,
    "includeLeadership" BOOLEAN NOT NULL DEFAULT false,
    "includeStaff" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activatedById" TEXT NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "deactivatedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarlyCheckoutEmergency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EarlyCheckoutEmergency_scope_check" CHECK ("includeTeachers" OR "includeLeadership" OR "includeStaff"),
    CONSTRAINT "EarlyCheckoutEmergency_time_check" CHECK ("expiresAt" > "startsAt"),
    CONSTRAINT "EarlyCheckoutEmergency_same_jakarta_date_check" CHECK (("expiresAt" + INTERVAL '7 hours')::date = ("startsAt" + INTERVAL '7 hours')::date),
    CONSTRAINT "EarlyCheckoutEmergency_max_expiry_check" CHECK (("expiresAt" + INTERVAL '7 hours')::time <= TIME '16:30:00')
);

ALTER TABLE "GateLog" ADD COLUMN "earlyCheckoutEmergencyId" TEXT;

CREATE INDEX "EarlyCheckoutEmergency_startsAt_expiresAt_deactivatedAt_idx" ON "EarlyCheckoutEmergency"("startsAt", "expiresAt", "deactivatedAt");
CREATE INDEX "EarlyCheckoutEmergency_activatedById_createdAt_idx" ON "EarlyCheckoutEmergency"("activatedById", "createdAt");
CREATE INDEX "GateLog_earlyCheckoutEmergencyId_idx" ON "GateLog"("earlyCheckoutEmergencyId");

ALTER TABLE "EarlyCheckoutEmergency" ADD CONSTRAINT "EarlyCheckoutEmergency_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EarlyCheckoutEmergency" ADD CONSTRAINT "EarlyCheckoutEmergency_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GateLog" ADD CONSTRAINT "GateLog_earlyCheckoutEmergencyId_fkey" FOREIGN KEY ("earlyCheckoutEmergencyId") REFERENCES "EarlyCheckoutEmergency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
