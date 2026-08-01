/*
# Create mesocycle_weeks table (full-fidelity mesocycle round-trip)

1. Background
   - `exercise_plans` only ever stores a handful of columns per exercise
     (id/name/sets/reps/rest/substitution/week_number/movement_pattern/tier/
     fatigue_cost). Everything `generateMesocycle()` computes on top of that —
     suggested_load / suggested_load_kg / per_set_load / intensity /
     load_guidance / phase_label / phase_focus / is_deload / coach_note /
     block_number / isCalibrationWeek / warmup / conditioning_note /
     recommendedCardio — was never persisted, so it was silently regenerated
     (badly — see below) or dropped entirely on every page refresh.
   - Separately, `persistWeeklyPlan` in App.tsx only ever wrote week_number = 1
     rows: it flattens the `mesocycle` React state, but is called before
     `setMesocycle()` runs, so that state is always still empty at insert
     time. In practice weeks 2+ of the mesocycle have never been persisted at
     all — a refresh has always collapsed a 16-week plan back to week 1.

2. New Tables
   - `mesocycle_weeks`
     - `id` (uuid, primary key)
     - `profile_id` (uuid, not null, FK -> fitness_profiles, cascade delete)
     - `week_number` (integer, not null) — 1-indexed, absolute across all blocks
     - `block_number` (integer) — which periodization block (1-indexed)
     - `week_in_block` (integer) — 1-4 within that block
     - `phase_label` (text), `phase_focus` (text), `coach_note` (text)
     - `is_deload` (boolean, default false)
     - `is_calibration_week` (boolean, default false)
     - `label` (text, not null) — display label, e.g. "Week 1 — ..."
     - `days` (jsonb, not null, default '[]') — the FULL `WorkoutDay[]` for
       this week, verbatim: every exercise field (suggested_load,
       suggested_load_kg, per_set_load, intensity, load_guidance, tier,
       movement_pattern, fatigue_cost, substitution, superset_label) plus
       each day's warmup block, conditioning_note and recommendedCardio.
     - `created_at`, `updated_at` (timestamptz)

3. Design decision: JSONB `days`, not more columns
   - A dedicated column per exercise-level field would mean either widening
     `exercise_plans` further (many more nullable columns, still missing
     week-level fields like phase_label without duplicating them onto every
     exercise row) or introducing several new normalized tables. Storing the
     already-typed `WorkoutDay[]` as JSONB gets exact fidelity with the
     in-memory shape used by `generateMesocycle()`, survives future field
     additions (e.g. isCalibrationWeek was added the same week this table
     was) without another migration, and matches how this app already reads
     JSON-shaped columns elsewhere (training_days, weekly_schedule on
     fitness_profiles).

4. Design decision: warmup is stored, not regenerated
   - `buildWarmup()` (src/lib/warmup.ts) selects from candidate pools via
     `shuffle()`, which is Math.random()-based and NOT seeded/deterministic.
     Regenerating on restore would silently show the user a DIFFERENT
     warm-up than the one they saw before the refresh. Storing the exact
     warmup JSON alongside the rest of the day is the only way to guarantee
     what's shown after a reload matches what was originally generated.

5. Security
   - RLS enabled, matching the existing single-tenant (no-auth) policy used
     by `exercise_plans` / `meal_plans`: anon + authenticated full CRUD.

6. Backward compatibility
   - This table is purely additive. Existing profiles created before this
     migration have no rows here; the app falls back to reconstructing a
     (week-1-only, load/phase-less) plan from `exercise_plans` exactly as it
     does today when no `mesocycle_weeks` rows exist for a profile.
*/

CREATE TABLE IF NOT EXISTS mesocycle_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  block_number integer,
  week_in_block integer,
  phase_label text,
  phase_focus text,
  coach_note text,
  is_deload boolean NOT NULL DEFAULT false,
  is_calibration_week boolean NOT NULL DEFAULT false,
  label text NOT NULL,
  days jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (profile_id, week_number)
);

ALTER TABLE mesocycle_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_mesocycle_weeks" ON mesocycle_weeks;
CREATE POLICY "anon_select_mesocycle_weeks" ON mesocycle_weeks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_mesocycle_weeks" ON mesocycle_weeks;
CREATE POLICY "anon_insert_mesocycle_weeks" ON mesocycle_weeks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_mesocycle_weeks" ON mesocycle_weeks;
CREATE POLICY "anon_update_mesocycle_weeks" ON mesocycle_weeks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_mesocycle_weeks" ON mesocycle_weeks;
CREATE POLICY "anon_delete_mesocycle_weeks" ON mesocycle_weeks FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mesocycle_weeks_profile_id ON mesocycle_weeks(profile_id);
