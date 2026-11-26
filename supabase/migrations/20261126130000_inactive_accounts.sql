-- ---------------------------------------------------------------------------
-- AN ACCOUNT NOBODY USES IS DELETED AFTER TWO YEARS, WITH AN EMAIL FIRST: his ruling 26 Nov 2026, "Delete after 2
-- years, email first" (over one year, and over keeping it until they delete it). The privacy policy gives the same.
--
--   last_active_on       the last day the app was opened on this profile (the app writes it once a day; every existing
--                        row starts at the day this runs, so nobody is counted inactive for time before it existed).
--   inactive_warned_on   the day the warning email was queued. A warning counts only while it is newer than the last
--                        day of use: coming back cancels it.
--
-- prune_inactive_accounts(), once a day:
--   1. warns an account idle for 23 months that has an email address, ONLY when the email can actually be queued
--      AND reach them (the report-email function's two secrets, plus inactive_warning_ready = 'yes', set by hand
--      once Resend can send to any address). No email queued, no warning recorded, so an
--      account with an address is never deleted unwarned;
--   2. deletes a profile idle for 2 years when it has no email address (nobody to warn), or its warning is at least
--      28 days old, or it is an old plan left behind by "New Plan" while its owner uses a newer one (never warned
--      about: their account is not going). Everything of theirs goes with the profile (every table cascades from it), and the sign-in goes
--      too once they own no other profile.
-- Nobody signed in can run it; the schedule runs it as the database.
-- ---------------------------------------------------------------------------

ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS last_active_on date NOT NULL DEFAULT current_date;
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS inactive_warned_on date NULL;

CREATE OR REPLACE FUNCTION public.prune_inactive_accounts()
RETURNS TABLE (warned bigint, deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  base text;
  secret text;
  ready text;
  r record;
  w bigint := 0;
  d bigint := 0;
BEGIN
  BEGIN
    EXECUTE $q$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' $q$ INTO base;
    EXECUTE $q$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'report_email_secret' $q$ INTO secret;
    EXECUTE $q$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'inactive_warning_ready' $q$ INTO ready;
  EXCEPTION WHEN others THEN
    base := NULL; secret := NULL; ready := NULL;
  END;

  -- 1. The warning, a month before. ONLY once the email can reach anyone: Resend's test sender may write to the
  -- project owner alone, and a warning queued that never arrives would be recorded and then acted on. So it waits for
  -- a Vault secret, inactive_warning_ready = 'yes', set by hand once a domain is verified in Resend.
  IF base IS NOT NULL AND secret IS NOT NULL AND ready = 'yes' THEN
    FOR r IN
      SELECT p.id, p.display_name, p.last_active_on, u.email
      FROM fitness_profiles p JOIN auth.users u ON u.id = p.owner_id
      WHERE p.last_active_on <= current_date - interval '23 months'
        AND coalesce(u.email, '') <> ''
        AND (p.inactive_warned_on IS NULL OR p.inactive_warned_on < p.last_active_on)
        -- the person, not the plan: an old plan left behind by "New Plan" is not their account going
        AND NOT EXISTS (SELECT 1 FROM fitness_profiles q WHERE q.owner_id = p.owner_id AND q.id <> p.id
                          AND q.last_active_on > current_date - interval '23 months')
    LOOP
      BEGIN
        EXECUTE $q$ SELECT net.http_post(url := $1, headers := $2, body := $3) $q$
          USING base || '/functions/v1/report-email',
                jsonb_build_object('Content-Type', 'application/json', 'x-report-email-secret', secret),
                jsonb_build_object('kind', 'inactive_warning', 'email', r.email, 'name', r.display_name,
                  'delete_on', to_char(greatest((r.last_active_on + interval '2 years')::date, current_date + 28), 'YYYY-MM-DD'));
        UPDATE fitness_profiles SET inactive_warned_on = current_date WHERE id = r.id;
        w := w + 1;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'inactive-account warning not queued: %', SQLERRM;
      END;
    END LOOP;
  END IF;

  -- 2. The deletion.
  FOR r IN
    SELECT p.id, p.owner_id
    FROM fitness_profiles p LEFT JOIN auth.users u ON u.id = p.owner_id
    WHERE p.last_active_on <= current_date - interval '2 years'
      AND (
        coalesce(u.email, '') = ''
        OR (p.inactive_warned_on >= p.last_active_on AND p.inactive_warned_on <= current_date - 28)
        -- an old plan of somebody still using the app: their account stays, so there is nothing to warn them about
        OR EXISTS (SELECT 1 FROM fitness_profiles q WHERE q.owner_id = p.owner_id AND q.id <> p.id
                     AND q.last_active_on > current_date - interval '2 years')
      )
  LOOP
    DELETE FROM fitness_profiles WHERE id = r.id;
    DELETE FROM ai_usage_daily WHERE scope = 'profile:' || r.id::text;
    IF r.owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fitness_profiles WHERE owner_id = r.owner_id) THEN
      DELETE FROM auth.users WHERE id = r.owner_id;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN QUERY SELECT w, d;
END
$fn$;

REVOKE ALL ON FUNCTION public.prune_inactive_accounts() FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.prune_inactive_accounts() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.prune_inactive_accounts() FROM authenticated';
  END IF;
END
$grants$;

-- Daily at 03:41 UTC, only where the scheduler exists.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXECUTE $sql$ SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'inactive-accounts' $sql$;
    EXECUTE $sql$ SELECT cron.schedule('inactive-accounts', '41 3 * * *', 'SELECT public.prune_inactive_accounts()') $sql$;
  ELSE
    RAISE NOTICE 'pg_cron is not available here — the inactive-accounts schedule was NOT created. Expected on a plain Postgres; on Supabase it means unused accounts are never deleted.';
  END IF;
END
$block$;
