-- ---------------------------------------------------------------------------
-- THE TESTER TOOLKIT (his rulings 25 Nov 2026, each from options): "Everything" recorded for a tester who has agreed,
-- report buttons "Both" (one on every screen and one on each coach reply, meal and exercise), a screenshot "Yes, they
-- can untick", and "Email + daily summary". src/lib/tester-log.ts, src/components/TesterReport.tsx,
-- _shared/report-email.ts. Plan: docs/plans/tester-toolkit.md.
--
--   1. fitness_profiles.tester_since — when he or she agreed, null when not a tester. Nothing is recorded without it.
--   2. tester_events — what happened while a tester used the app: errors, saves that failed, screens opened, buttons
--      tapped, what was typed (never a password or an email address). Owner only; deleted with the account.
--   3. tester_reports — a report sent from the app, with the screen, the last things done and (unless unticked) a
--      picture of the screen as a JPEG data URL. Owner only; deleted with the account.
--   4. Each new report is emailed (the coach-reply report's pattern, 20261122120000), and once a day the errors of the
--      last 24 hours are emailed as one summary, so a crash that repeats is one line with a count, not fifty emails.
-- Every column is nullable or defaulted and every read is select('*'), so the app works the same before this runs.
-- ---------------------------------------------------------------------------

ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS tester_since timestamptz;

CREATE TABLE IF NOT EXISTS tester_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  session_id  text NOT NULL,
  at          timestamptz NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('error', 'console_error', 'failed_save', 'network_error', 'screen', 'tap', 'typed', 'report', 'start')),
  screen      text NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tester_events_profile_at ON tester_events (profile_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_tester_events_kind_created ON tester_events (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS tester_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  area          text NOT NULL CHECK (area IN ('chat', 'meals', 'exercise', 'tools', 'home', 'setup', 'other')),
  item_label    text NULL,
  note          text NOT NULL,
  screen        text NULL,
  screenshot    text NULL,
  recent_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  device        text NULL,
  app_version   text NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tester_reports_created ON tester_reports (created_at DESC);

-- Owner only, the four policies every owned table has (20260830120000_scope_every_table_to_its_owner.sql).
ALTER TABLE tester_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_select_tester_events" ON tester_events;
DROP POLICY IF EXISTS "owner_insert_tester_events" ON tester_events;
DROP POLICY IF EXISTS "owner_delete_tester_events" ON tester_events;
CREATE POLICY "owner_select_tester_events" ON tester_events FOR SELECT
  TO anon, authenticated USING (owns_profile(profile_id));
CREATE POLICY "owner_insert_tester_events" ON tester_events FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(profile_id));
CREATE POLICY "owner_delete_tester_events" ON tester_events FOR DELETE
  TO anon, authenticated USING (owns_profile(profile_id));

ALTER TABLE tester_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_select_tester_reports" ON tester_reports;
DROP POLICY IF EXISTS "owner_insert_tester_reports" ON tester_reports;
DROP POLICY IF EXISTS "owner_delete_tester_reports" ON tester_reports;
CREATE POLICY "owner_select_tester_reports" ON tester_reports FOR SELECT
  TO anon, authenticated USING (owns_profile(profile_id));
CREATE POLICY "owner_insert_tester_reports" ON tester_reports FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(profile_id));
CREATE POLICY "owner_delete_tester_reports" ON tester_reports FOR DELETE
  TO anon, authenticated USING (owns_profile(profile_id));

-- ---------------------------------------------------------------------------
-- EACH NEW REPORT EMAILED. The same Vault secrets as the coach-reply report (project_url, report_email_secret); until
-- both exist nothing is sent, and any error is a WARNING, never raised: the report always saves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_tester_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  base text;
  secret text;
BEGIN
  BEGIN
    EXECUTE $q$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' $q$ INTO base;
    EXECUTE $q$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'report_email_secret' $q$ INTO secret;
    IF base IS NULL OR secret IS NULL THEN
      RETURN NEW;
    END IF;
    EXECUTE $q$ SELECT net.http_post(url := $1, headers := $2, body := $3) $q$
      USING base || '/functions/v1/report-email',
            jsonb_build_object('Content-Type', 'application/json', 'x-report-email-secret', secret),
            jsonb_build_object('kind', 'tester_report', 'record', to_jsonb(NEW));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'tester report email not sent: %', SQLERRM;
  END;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.email_tester_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tester_reports_email ON tester_reports;
CREATE TRIGGER tester_reports_email
  AFTER INSERT ON tester_reports
  FOR EACH ROW EXECUTE FUNCTION public.email_tester_report();

-- ---------------------------------------------------------------------------
-- THE DAILY SUMMARY, at 07:17 UTC. Only where the scheduler exists (the coach-reach-out pattern, 20260924120000): a
-- plain Postgres (test:rls-local) has no pg_cron and must still apply every migration.
-- ---------------------------------------------------------------------------
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;
    EXECUTE $sql$ SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tester-digest-daily' $sql$;
    EXECUTE $sql$
      SELECT cron.schedule(
        'tester-digest-daily',
        '17 7 * * *',
        $job$
        SELECT net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/report-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-report-email-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'report_email_secret')
          ),
          body := '{"kind":"digest"}'::jsonb
        );
        $job$
      )
    $sql$;
  ELSE
    RAISE NOTICE 'pg_cron or pg_net is not available here — the tester-digest-daily schedule was NOT created. Expected on a plain Postgres; on Supabase it means the schedule is missing.';
  END IF;
END
$block$;
