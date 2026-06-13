-- Supabase Data API hardening.
--
-- The SchoolHub app accesses the database only from the VPS backend using
-- server-side Prisma credentials. Browsers must not read/write public tables
-- directly through Supabase anon/authenticated roles. Enabling RLS without
-- broad allow policies makes direct Supabase client access fail closed while
-- preserving backend access for the table owner/postgres connection.

DO $$
DECLARE
  tbl text;
  role_name text;
  app_tables text[] := ARRAY[
    'User',
    'SchoolClass',
    'Subject',
    'AcademicYear',
    'Semester',
    'Room',
    'ClassEnrollment',
    'Session',
    'StudentAttendance',
    'TeacherSessionPresence',
    'GateLog',
    'ReconciliationFlag',
    'ReconciliationEscalation',
    'AuthSession',
    'UserTutorialState',
    'AuditEntry',
    'AuditChainState',
    'TeacherLeave',
    'WeeklySchedule',
    'Notification',
    'GeofencePolicy',
    'DeviceReader',
    'AttendancePolicy',
    'PrayerAttendanceLog',
    'AttendanceOverride',
    'AttendanceCorrectionEvent',
    'PicketNote',
    'SmartCard',
    'QrCredential',
    'MobileAndroidReaderVersion'
  ];
BEGIN
  FOREACH tbl IN ARRAY app_tables LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Explicit restrictive deny policy for all non-bypass roles. This is
    -- intentionally fail-closed: SchoolHub authorization remains centralized
    -- in the NestJS API, not in browser-side Supabase clients.
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = tbl
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = 'schoolhub_no_direct_client_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY schoolhub_no_direct_client_access ON public.%I AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false)',
        tbl
      );
    END IF;
  END LOOP;

  -- Remove direct Data API privileges for Supabase browser/client roles when
  -- those roles exist. Guarded so local non-Supabase Postgres remains usable.
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH tbl IN ARRAY app_tables LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', tbl, role_name);
      END LOOP;

      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', role_name);
    END IF;
  END LOOP;

  -- Extra defense-in-depth for DeviceReader secrets if any future grant is
  -- added accidentally. These columns must never be readable by browser roles.
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE SELECT (%I, %I, %I) ON TABLE public.%I FROM %I',
        'apiKey',
        'readerSecretCiphertext',
        'provisioningTokenHash',
        'DeviceReader',
        role_name
      );
    END IF;
  END LOOP;
END $$;
