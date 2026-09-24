/*
  # The coach can reach you when the app is shut — slices 2 and 3

  docs/plans/the-coach-can-reach-you.md. Ashley, 17 Sep 2026: all seven of the
  coach's proactive moments, each switchable, all on to begin with. Built
  24 Sep 2026 on her "implement all the chat fixes". Pushed only by
  `npm run db:push-both`, on her machine, with her typed confirmation.

  ## What this adds
    - fitness_profiles.notification_switches — which moments may buzz the
      phone. Absent key means ON (a person never asked has not said no).
    - coach_moment_facts — the few plan-shaped facts the app sends ahead
      while it is open: the weekday pattern it trains on, when the plan and
      the current block end, and the streak Home last counted.
    - push_subscriptions — one row per phone that said yes, with its timezone.
    - coach_notifications_sent — what went out, so no person hears more than
      once a day and never the same thing two days running.
    - an hourly pg_cron job that calls the coach-reach-out edge function.

  ## Safe on both sides of it
  The app reads with select('*') and writes through the missing-column retry,
  so until this is pushed the switches simply read as "all on" and the facts
  are not sent — nothing on screen breaks. The function is not deployed until
  she deploys it.

  ## The schedule needs two Vault secrets per project, set by hand
    select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
    select vault.create_secret('<the REACH_OUT_SECRET value>', 'reach_out_secret');
  Until both exist the hourly call has no URL and does nothing but log a
  failed request in net._http_response. That is the safe failure.

  ## Row-level security
  The same shape as every other table since 30 Aug 2026 (owns_profile): all
  four owner policies on all three tables. Only the function, with the service
  role, writes the sent log; an owner can at most touch their own.
*/

-- -------------------------------------------------------------------------
-- 1. The switches, on the profile, so they follow her between devices
-- -------------------------------------------------------------------------
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS notification_switches jsonb NOT NULL DEFAULT '{}'::jsonb;

-- -------------------------------------------------------------------------
-- 2. The facts the app sends ahead
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_moment_facts (
  user_id uuid PRIMARY KEY REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  training_weekdays jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_ends_on date,
  block_ends_on date,
  streak_days integer,
  streak_as_of date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 3. The phones that said yes
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- -------------------------------------------------------------------------
-- 4. What went out
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_notifications_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  moment text NOT NULL,
  sent_on date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- ONE A DAY, enforced where it cannot be raced: two overlapping runs could
  -- both read "nothing sent today"; only one of their inserts can land.
  UNIQUE (user_id, sent_on)
);

-- -------------------------------------------------------------------------
-- 5. Row-level security, the same shape as every other table
-- -------------------------------------------------------------------------
ALTER TABLE coach_moment_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_coach_moment_facts" ON coach_moment_facts FOR SELECT
  TO anon, authenticated USING (owns_profile(user_id));
CREATE POLICY "owner_insert_coach_moment_facts" ON coach_moment_facts FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_update_coach_moment_facts" ON coach_moment_facts FOR UPDATE
  TO anon, authenticated USING (owns_profile(user_id)) WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_delete_coach_moment_facts" ON coach_moment_facts FOR DELETE
  TO anon, authenticated USING (owns_profile(user_id));

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_push_subscriptions" ON push_subscriptions FOR SELECT
  TO anon, authenticated USING (owns_profile(user_id));
CREATE POLICY "owner_insert_push_subscriptions" ON push_subscriptions FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_update_push_subscriptions" ON push_subscriptions FOR UPDATE
  TO anon, authenticated USING (owns_profile(user_id)) WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_delete_push_subscriptions" ON push_subscriptions FOR DELETE
  TO anon, authenticated USING (owns_profile(user_id));

-- The same four as every other table, although only the function (service
-- role, which bypasses RLS) ever writes here. A first draft made it read-only;
-- test:rls-local holds every user table to all four, and the cost of the
-- extra three is nil — an owner can only touch their OWN log, which at worst
-- quiets or un-quiets their own phone. One pattern beats one exception.
ALTER TABLE coach_notifications_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_coach_notifications_sent" ON coach_notifications_sent FOR SELECT
  TO anon, authenticated USING (owns_profile(user_id));
CREATE POLICY "owner_insert_coach_notifications_sent" ON coach_notifications_sent FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_update_coach_notifications_sent" ON coach_notifications_sent FOR UPDATE
  TO anon, authenticated USING (owns_profile(user_id)) WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_delete_coach_notifications_sent" ON coach_notifications_sent FOR DELETE
  TO anon, authenticated USING (owns_profile(user_id));

-- -------------------------------------------------------------------------
-- 6. Every hour, on the hour
-- -------------------------------------------------------------------------
-- ONLY WHERE THE SCHEDULER EXISTS. Supabase has pg_cron and pg_net; a plain
-- Postgres (the local RLS gate, test:rls-local) has neither, and must still be
-- able to apply every migration to check the policies above. So the schedule
-- is created inside a block that asks first, and says so when it cannot —
-- a NOTICE, not a silent skip. Everything above this line is unconditional.
--
-- Dynamic SQL for the cron calls: the cron schema does not exist until the
-- extension does, so nothing may name it in a statement that is parsed
-- before the check has run.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;
    -- Unscheduled first, so pushing this twice leaves one job, not two.
    EXECUTE $sql$ SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'coach-reach-out-hourly' $sql$;
    EXECUTE $sql$
      SELECT cron.schedule(
        'coach-reach-out-hourly',
        '0 * * * *',
        $job$
        SELECT net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/coach-reach-out',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-reach-out-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reach_out_secret')
          ),
          body := '{}'::jsonb
        );
        $job$
      )
    $sql$;
  ELSE
    RAISE NOTICE 'pg_cron or pg_net is not available here — the coach-reach-out-hourly schedule was NOT created. Expected on a plain Postgres; on Supabase it means the schedule is missing.';
  END IF;
END
$block$;
