-- Per-session teacher journal. Existing sessions intentionally remain without journals.
CREATE TYPE "SessionJournalCompletionStatus" AS ENUM ('TUNTAS', 'BELUM_TUNTAS');

CREATE TABLE "SessionJournal" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "learningObjective" TEXT NOT NULL,
  "activity" TEXT NOT NULL,
  "lessonHours" INTEGER NOT NULL,
  "completionStatus" "SessionJournalCompletionStatus" NOT NULL DEFAULT 'BELUM_TUNTAS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SessionJournal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionJournal_learningObjective_chk"
    CHECK ("learningObjective" = btrim("learningObjective") AND "learningObjective" <> '' AND char_length("learningObjective") <= 1000),
  CONSTRAINT "SessionJournal_activity_chk"
    CHECK ("activity" = btrim("activity") AND "activity" <> '' AND char_length("activity") <= 4000),
  CONSTRAINT "SessionJournal_lessonHours_chk"
    CHECK ("lessonHours" BETWEEN 1 AND 24),
  CONSTRAINT "SessionJournal_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SessionJournal_sessionId_key" ON "SessionJournal"("sessionId");

-- Browser-side Supabase roles stay fail-closed; all access remains in NestJS.
ALTER TABLE public."SessionJournal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY schoolhub_no_direct_client_access
  ON public."SessionJournal"
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'SessionJournal', role_name);
    END IF;
  END LOOP;
END $$;
