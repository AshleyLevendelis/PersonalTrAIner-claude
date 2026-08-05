/*
# Dashboard support tables (VISION-ARCHITECTURE.md §5)

Three additions, all append-only-observation shaped like meal_events/
exercise_set_logs — no new source of truth for anything already tracked.

1. `water_target_ml` on fitness_profiles — a plain user-editable number,
   never computed. The brief is explicit: "the app must never suggest or
   default to a hydration target beyond a neutral starting value the user
   can change immediately." 2000ml is that neutral starting value (a
   round, commonly-cited baseline, not a weight/activity-derived
   calculation) — computeTargets-style personalization is deliberately
   NOT applied here.

2. `water_logs` — one row per tap-to-log entry (not one row per day with
   a running total), mirroring meal_events' append-only ledger shape:
   today's total is SUM(amount_ml) WHERE date = today, and undo removes
   exactly the row a receipt named rather than decrementing a shared
   counter. client_id backs the same local-first idempotency convention
   as every other recent table.

3. `daily_steps` — MANUAL entry only this round (VISION-ARCHITECTURE.md
   §5.3's step-count row: "design the slot and the data model now, but do
   not build platform health integration this round"). `source` is
   future-proofed to 'health_connect'/'healthkit' values a later
   integration would write, but nothing in this codebase writes those
   yet. One row per profile per date (a manual step count is a single
   daily figure, not an append-only log like water/meals) — UNIQUE
   (profile_id, date) with upsert-on-conflict semantics, same shape as
   daily_metrics' own (profile_id, date) uniqueness.

   Real platform integration would require: Android Health Connect
   (a native permission grant + the Health Connect SDK — unavailable to
   a web/PWA context entirely, no browser API exposes it) or Apple
   HealthKit (native-only, same constraint — no Safari/PWA API surface
   exists for HealthKit either). Both are native-app-only capabilities;
   a PWA has no browser API for step counts on either platform (the
   Generic Sensor API's pedometer-adjacent proposals never shipped).
   Shipping real integration would mean either (a) a native wrapper
   (Capacitor/React Native) around this web app, or (b) a companion
   native module purely for the HealthKit/Health Connect bridge — out of
   scope for a structure-and-data-only dashboard pass.

Standard 4-policy RLS block, verbatim from every recent table.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fitness_profiles' AND column_name = 'water_target_ml'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN water_target_ml integer NOT NULL DEFAULT 2000;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS water_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date          date NOT NULL,
  amount_ml     integer NOT NULL,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'chat')),
  client_id     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_water_logs_client_id ON water_logs(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_water_logs_profile_date ON water_logs(profile_id, date);

ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_water_logs" ON water_logs;
CREATE POLICY "anon_select_water_logs" ON water_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_water_logs" ON water_logs;
CREATE POLICY "anon_insert_water_logs" ON water_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_water_logs" ON water_logs;
CREATE POLICY "anon_update_water_logs" ON water_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_water_logs" ON water_logs;
CREATE POLICY "anon_delete_water_logs" ON water_logs FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS daily_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date          date NOT NULL,
  steps         integer NOT NULL,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'health_connect', 'healthkit')),
  client_id     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_steps_client_id ON daily_steps(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_daily_steps" ON daily_steps;
CREATE POLICY "anon_select_daily_steps" ON daily_steps FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_daily_steps" ON daily_steps;
CREATE POLICY "anon_insert_daily_steps" ON daily_steps FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_daily_steps" ON daily_steps;
CREATE POLICY "anon_update_daily_steps" ON daily_steps FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_daily_steps" ON daily_steps;
CREATE POLICY "anon_delete_daily_steps" ON daily_steps FOR DELETE
  TO anon, authenticated USING (true);
