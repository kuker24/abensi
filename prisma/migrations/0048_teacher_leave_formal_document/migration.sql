-- Formal leave letter lifecycle + SAKIT medical attachments (wet dual-sign).

CREATE TYPE "TeacherLeaveDocumentStatus" AS ENUM ('NOT_APPLICABLE', 'READY', 'AWAITING_VISIT', 'SIGNED');

ALTER TABLE "TeacherLeave"
  ADD COLUMN "medicalLetterPath" TEXT,
  ADD COLUMN "medicalLetterMime" TEXT,
  ADD COLUMN "medicalLetterSize" INTEGER,
  ADD COLUMN "medicinePhotoPath" TEXT,
  ADD COLUMN "medicinePhotoMime" TEXT,
  ADD COLUMN "medicinePhotoSize" INTEGER,
  ADD COLUMN "documentStatus" "TeacherLeaveDocumentStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "documentSignedAt" TIMESTAMP(3),
  ADD COLUMN "documentSignedById" TEXT,
  ADD COLUMN "documentSignNote" TEXT;

ALTER TABLE "TeacherLeave"
  ADD CONSTRAINT "TeacherLeave_documentSignedById_fkey"
  FOREIGN KEY ("documentSignedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TeacherLeave_documentStatus_status_idx" ON "TeacherLeave"("documentStatus", "status");
CREATE INDEX "TeacherLeave_documentSignedById_documentSignedAt_idx" ON "TeacherLeave"("documentSignedById", "documentSignedAt");
