/*
# M0 — Meal foundation: pool slots + append-only meal events ledger

## The model (replaces the broken day-of-week meal_plans shape)

- `meal_plan_slots` is the POOL model: for each slot (breakfast/lunch/dinner/
  snack) a profile owns a small pool of interchangeable meal options
  (pool_index orders them). Any pool option is valid for its slot on any day —
  there is deliberately NO day-of-week column. M1 fills these pools from the
  generate-meals variety engine after code-enforced macro scaling; M0 only
  creates the shape.

- `meal_events` is the APPEND-ONLY adherence ledger (same philosophy as
  exercise_set_logs): one row per thing that actually happened — the user
  confirmed a planned meal, swapped something else into a slot, ate an
  unplanned extra, or explicitly skipped a slot. "Remaining today" is always
  computed as targets minus the sum of eaten events; nothing mutates in
  place. `client_id` gives local-first writers idempotent retries (unique
  only when present, same pattern as exercise_set_logs).

## Why the old table stays (for now)

The legacy `meal_plans` table is NOT dropped here: it is empty on the live
project (its writes had been failing on columns no migration ever created —
see the meal-stack discovery round), but client code still references it
until M1 switches rendering to the pool model. It is marked deprecated via
COMMENT below and will be dropped in M1.

## Security

RLS enabled with anon + authenticated full CRUD, matching every other table
in this single-tenant, no-sign-in app.
*/

-- ============================================================================
-- TABLE: meal_plan_slots (the pool model)
-- ============================================================================
CREATE TABLE IF NOT EXISTS meal_plan_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  pool_index integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  macros jsonb NOT NULL DEFAULT '{}'::jsonb, -- { kcal, protein, carbs, fat }
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meal_plan_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_meal_plan_slots" ON meal_plan_slots;
CREATE POLICY "anon_select_meal_plan_slots" ON meal_plan_slots FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_meal_plan_slots" ON meal_plan_slots;
CREATE POLICY "anon_insert_meal_plan_slots" ON meal_plan_slots FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_meal_plan_slots" ON meal_plan_slots;
CREATE POLICY "anon_update_meal_plan_slots" ON meal_plan_slots FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_meal_plan_slots" ON meal_plan_slots;
CREATE POLICY "anon_delete_meal_plan_slots" ON meal_plan_slots FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_meal_plan_slots_profile_slot
  ON meal_plan_slots(profile_id, slot, pool_index);

-- ============================================================================
-- TABLE: meal_events (append-only adherence ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS meal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  slot text CHECK (slot IS NULL OR slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  event_type text NOT NULL CHECK (event_type IN ('confirmed', 'swapped_in', 'extra', 'skipped')),
  meal_name text NOT NULL,
  macros jsonb NOT NULL DEFAULT '{}'::jsonb, -- { kcal, protein, carbs, fat }; zeros for 'skipped'
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('plan', 'chat', 'manual')),
  client_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_meal_events" ON meal_events;
CREATE POLICY "anon_select_meal_events" ON meal_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_meal_events" ON meal_events;
CREATE POLICY "anon_insert_meal_events" ON meal_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_meal_events" ON meal_events;
CREATE POLICY "anon_update_meal_events" ON meal_events FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_meal_events" ON meal_events;
CREATE POLICY "anon_delete_meal_events" ON meal_events FOR DELETE
  TO anon, authenticated USING (true);

-- Idempotent local-first retries: unique only when a client_id is present
-- (server-originated rows may omit it), same pattern as exercise_set_logs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_events_client_id
  ON meal_events(client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meal_events_profile_date
  ON meal_events(profile_id, date);

-- ============================================================================
-- Deprecation marker for the legacy table (dropped in M1)
-- ============================================================================
COMMENT ON TABLE meal_plans IS
  'DEPRECATED (M0): replaced by meal_plan_slots (pool model) + meal_events (ledger). Empty on live — its writes referenced day_of_week/week_start_date columns no migration ever created. Kept only until M1 switches rendering to pools; do not build on it.';
