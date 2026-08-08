/*
# Meal plan picks — persists which pool option is "today's pick" per slot

## Why this table exists

UX sweep §0 finding 1: a confirmed meal swap (Meals tab "swap to this", or a
chat propose_meal_swap the user tapped Confirm on) only ever lived in
App.tsx's `manualMealPicks` React state. The receipt said "Swapped", the
screen showed the new meal — and reloading the app silently reverted it,
because `assembleDay` re-derives today's pick from the stored POOL
(meal_plan_slots) on every render, with no persisted override to prefer.

`meal_plan_slots` deliberately has no date dimension (any pool option is
valid for its slot on any day — see that table's own doc comment). A pick is
a per-DATE override on top of that: "for 2026-08-08, lunch is option X",
independent of which options exist in the pool. One row per (profile, date,
slot); upserted on swap, deleted when a regenerate invalidates it (per the
existing session-local semantics — a slot regenerate already clears the
session-local pick, so it also clears the persisted one).

## Security

RLS enabled with anon + authenticated full CRUD, matching every other table
in this single-tenant, no-sign-in app (meal_plan_slots' own policies).
*/

CREATE TABLE IF NOT EXISTS meal_plan_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date text NOT NULL, -- YYYY-MM-DD, local calendar date (dev-clock.ts's getLocalDateString)
  slot text NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  meal_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (profile_id, date, slot)
);

ALTER TABLE meal_plan_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_meal_plan_picks" ON meal_plan_picks;
CREATE POLICY "anon_select_meal_plan_picks" ON meal_plan_picks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_meal_plan_picks" ON meal_plan_picks;
CREATE POLICY "anon_insert_meal_plan_picks" ON meal_plan_picks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_meal_plan_picks" ON meal_plan_picks;
CREATE POLICY "anon_update_meal_plan_picks" ON meal_plan_picks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_meal_plan_picks" ON meal_plan_picks;
CREATE POLICY "anon_delete_meal_plan_picks" ON meal_plan_picks FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_meal_plan_picks_profile_date
  ON meal_plan_picks(profile_id, date);
