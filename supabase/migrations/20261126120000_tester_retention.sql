-- ---------------------------------------------------------------------------
-- HOW LONG TESTER DATA IS KEPT: his ruling 26 Nov 2026, "Activity 90 days, reports 1 year" (from three options, over
-- 30 days for everything and over a year for everything). Data protection law expects a limit; before this nothing was
-- deleted until the tester deleted their account. The privacy policy draft says the same two figures.
--
-- One function does the deleting so the local database gate (test:rls-local) can run it on rows it made; the nightly
-- schedule only calls it. Nobody signed in can run it: it is the database's own housekeeping.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_tester_data()
RETURNS TABLE (events_deleted bigint, reports_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  e bigint;
  r bigint;
BEGIN
  DELETE FROM tester_events WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS e = ROW_COUNT;
  DELETE FROM tester_reports WHERE created_at < now() - interval '1 year';
  GET DIAGNOSTICS r = ROW_COUNT;
  RETURN QUERY SELECT e, r;
END
$fn$;

REVOKE ALL ON FUNCTION public.prune_tester_data() FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.prune_tester_data() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.prune_tester_data() FROM authenticated';
  END IF;
END
$grants$;

-- Nightly at 03:23 UTC, only where the scheduler exists (a plain Postgres has none and must still apply this file).
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXECUTE $sql$ SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tester-data-prune' $sql$;
    EXECUTE $sql$ SELECT cron.schedule('tester-data-prune', '23 3 * * *', 'SELECT public.prune_tester_data()') $sql$;
  ELSE
    RAISE NOTICE 'pg_cron is not available here — the tester-data-prune schedule was NOT created. Expected on a plain Postgres; on Supabase it means old tester data is never deleted.';
  END IF;
END
$block$;
