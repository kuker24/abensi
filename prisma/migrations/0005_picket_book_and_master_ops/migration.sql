CREATE TABLE IF NOT EXISTS "PicketNote" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'UMUM',
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PicketNote_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PicketNote_createdById_fkey') THEN
    ALTER TABLE "PicketNote"
    ADD CONSTRAINT "PicketNote_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PicketNote_updatedById_fkey') THEN
    ALTER TABLE "PicketNote"
    ADD CONSTRAINT "PicketNote_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PicketNote_date_idx" ON "PicketNote"("date");
CREATE INDEX IF NOT EXISTS "PicketNote_category_idx" ON "PicketNote"("category");
CREATE INDEX IF NOT EXISTS "PicketNote_severity_idx" ON "PicketNote"("severity");
CREATE INDEX IF NOT EXISTS "PicketNote_active_idx" ON "PicketNote"("active");
CREATE INDEX IF NOT EXISTS "PicketNote_createdById_createdAt_idx" ON "PicketNote"("createdById", "createdAt");
