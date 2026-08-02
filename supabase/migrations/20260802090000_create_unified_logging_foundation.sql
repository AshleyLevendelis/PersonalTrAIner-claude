/*
# Phase C0 Part 1 — Unified logging foundation

Unifies the two divergent set-log stores (`workout_logs` + `set_logs`) into a
single session-linked table, and revives `workout_sessions` as the parent
entity. The old tables are left untouched (read-only legacy); they get dropped
in a later round once everything is verified against the new store.

1. Modified Tables
   - `workout_sessions` — revived as the parent of set logs:
     - `started_at` (timestamptz) — stamped by the first set saved that day
     - `finished_at` (timestamptz) — stamped by "Complete Session"
     - `notes` (text) — workout notes (UI in a later round)
     - `week_number` (int), `day` (text) — mesocycle context for progression
     - `split_type` gains DEFAULT 'training' (backfilled/auto-created sessions
       have no meaningful split; the column stays NOT NULL)
     - The (profile_id, date) unique constraint deliberately STAYS — one
       session per day is fine for C0.

2. New Tables
   - `exercise_set_logs` — successor to BOTH `workout_logs` and `set_logs`:
     - `id` uuid PK
     - `session_id` uuid FK → workout_sessions CASCADE
     - `user_id` uuid FK → fitness_profiles CASCADE
     - `exercise_id` text NOT NULL — stable slug key (see exercise-db.ts);
       derived here as trim('-' from regexp_replace(lower(name),'[^a-z0-9]+','-'))
       which matches the TypeScript slugifier exactly (verified: 0 collisions
       across all 96 database names)
     - `exercise_name` text NOT NULL — display + legacy compat
     - `week_number` int NULL, `day` text NULL — progression keying
     - `set_number` int NOT NULL
     - `weight_kg` numeric(6,2) DEFAULT 0, `reps_completed` int DEFAULT 0
     - `rpe` numeric NULL
     - `unit` text DEFAULT 'reps' CHECK in ('reps','seconds','meters') — the
       value always lives in reps_completed; unit disambiguates a 40m carry
       from 40 reps (landmine: units were previously unrecorded)
     - `is_bodyweight` bool, `is_warmup` bool
     - `completed_at` timestamptz NOT NULL DEFAULT now()
     - `client_id` text NULL — idempotency key for offline sync
     - UNIQUE (user_id, session_id, exercise_id, set_number, is_warmup) —
       upsert semantics everywhere; duplicate set rows become structurally
       impossible (kills discovery landmine L2)
     - UNIQUE partial index on client_id — kills at-least-once duplicate risk
       from the offline queue

3. Backfill
   a. One workout_sessions row per distinct (user, date) seen in workout_logs
      (is_completed = true — these are historical, finished workouts).
   b. Copy every workout_logs row into exercise_set_logs (unit 'reps',
      is_warmup false, exercise_id derived by the slug expression).
   c. Enrich copied rows with week_number/rpe from their set_logs counterpart
      where one exists (set_logs carried mesocycle keying workout_logs lacked).
   d. Merge set_logs rows with NO workout_logs counterpart (these came from
      the bulk "Complete & Log All Sets" button or offline queue — paths that
      never wrote workout_logs), SKIPPING weight_kg = 0 rows: those are the
      fabricated L6 rows the bulk button wrote when it had no real weight.
      (Genuine bodyweight sets always went through the per-set path, which
      wrote workout_logs with is_bodyweight = true, so they arrive via (b).)
      Duplicates (set_logs has no unique key) dedupe to the EARLIEST
      completed_at per logical set. set_logs.user_id is text with no FK, so
      rows whose user_id is not a valid uuid present in fitness_profiles are
      skipped.
   e. Every skip/copy count is RAISE NOTICE'd so the backfill is auditable
      from the migration log.

4. Security
   - RLS enabled on exercise_set_logs, full anon+authenticated CRUD (matches
     every other table in this single-tenant, no-sign-in app).

5. Important Notes
   - "Safe to re-run" is narrower than it sounds — read this before ever
     re-running this file (a restore, a staging copy, a second environment,
     ANYTHING other than the one production apply this migration already
     received against empty `workout_logs`/`set_logs`):
     - IF NOT EXISTS / ON CONFLICT DO NOTHING make re-running safe against
       DUPLICATION — you will not get doubled rows.
     - Re-running is NOT safe against RESURRECTING deletions: if a user (or
       `clearAllSetLogs`) deleted a backfilled session/set after the first
       run, and you run this file again while the legacy source rows are
       still sitting in `workout_logs`/`set_logs`, the ON CONFLICT DO NOTHING
       inserts see no conflict and silently recreate what was deleted.
     - The backfill logic below (step 3) was ONLY ever exercised against
       empty legacy tables in production (verified: both were empty when
       this migration first ran, so the 0=0 counts matched and steps b-d were
       structural no-ops). Its actual behavior against a database with real
       legacy history has NOT been exercised, and an adversarial review
       surfaced four latent defects in that path that would only bite THEN:
       - Step (a) fabricates a visible workout_sessions row (and a "45 min /
         Completed" card in the weekly planner) for every historical logged
         day — including days the user never actually finished a full
         session, since workout_logs only ever recorded individual sets.
       - Step (d)'s `weight_kg = 0` skip (meant to drop the L6 bulk-button
         fabrications) cannot distinguish those from a GENUINE all-bodyweight
         session logged entirely via the old bulk button — both are
         structurally identical zero-weight set_logs rows with no
         workout_logs counterpart. A real re-run would silently drop real
         bodyweight training history, not just fabricated rows.
       - Step (d)'s counterpart matching (workout_logs vs set_logs, used to
         decide what step (b) already covered) joins on DATE EQUALITY only —
         a set logged right at the client's local-midnight boundary, where
         the two legacy tables' date/timestamp columns could disagree by a
         day, would be counted as unmatched and inserted a second time under
         the wrong day's session.
       - Step (b)'s ON CONFLICT DO NOTHING silently absorbs any row that
         collides on the NEW slug-derived exercise_id (e.g. legacy
         "Push-Ups" and "Push Ups" as distinct workout_logs rows, both
         slugging to the same id) — and unlike step (d), nothing counts or
         RAISE NOTICEs these drops, so the "every skip is auditable" claim
         below does not fully hold for step (b) specifically.
     - None of the above is a live-app bug — it only matters if this exact
       migration file is executed again against a database that has real
       pre-existing `workout_logs`/`set_logs` data. Before doing that:
       reconcile against a fresh export of both legacy tables, or add
       explicit guards (an `is_completed` heuristic for step (a), an
       `is_bodyweight` carry-through for step (d), a tighter time-window
       join for the counterpart match, and a skip counter for step (b))
       first.
   - `workout_logs` and `set_logs` are NOT dropped and NOT written to by the
     app after this round — legacy, read-only, kept for verification.
*/

-- ============================================================================
-- 1. Revive workout_sessions
-- ============================================================================
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS week_number integer;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS day text;
ALTER TABLE workout_sessions ALTER COLUMN split_type SET DEFAULT 'training';

-- ============================================================================
-- 2. exercise_set_logs — the unified store
-- ============================================================================
CREATE TABLE IF NOT EXISTS exercise_set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  exercise_id text NOT NULL,
  exercise_name text NOT NULL,
  week_number integer,
  day text,
  set_number integer NOT NULL,
  weight_kg numeric(6,2) NOT NULL DEFAULT 0,
  reps_completed integer NOT NULL DEFAULT 0,
  rpe numeric,
  unit text NOT NULL DEFAULT 'reps' CHECK (unit IN ('reps', 'seconds', 'meters')),
  is_bodyweight boolean NOT NULL DEFAULT false,
  is_warmup boolean NOT NULL DEFAULT false,
  completed_at timestamptz NOT NULL DEFAULT now(),
  client_id text,
  CONSTRAINT unique_set_per_session UNIQUE (user_id, session_id, exercise_id, set_number, is_warmup)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_set_logs_client_id
  ON exercise_set_logs (client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_set_logs_user_exercise_completed
  ON exercise_set_logs (user_id, exercise_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_set_logs_user_week_day
  ON exercise_set_logs (user_id, week_number, day);

CREATE INDEX IF NOT EXISTS idx_exercise_set_logs_session
  ON exercise_set_logs (session_id);

ALTER TABLE exercise_set_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_exercise_set_logs" ON exercise_set_logs;
CREATE POLICY "anon_select_exercise_set_logs" ON exercise_set_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_exercise_set_logs" ON exercise_set_logs;
CREATE POLICY "anon_insert_exercise_set_logs" ON exercise_set_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_exercise_set_logs" ON exercise_set_logs;
CREATE POLICY "anon_update_exercise_set_logs" ON exercise_set_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_exercise_set_logs" ON exercise_set_logs;
CREATE POLICY "anon_delete_exercise_set_logs" ON exercise_set_logs FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- 3. Backfill
-- ============================================================================
DO $$
DECLARE
  v_sessions_created integer := 0;
  v_sessions_from_setlogs integer := 0;
  v_workout_logs_copied integer := 0;
  v_enriched integer := 0;
  v_setlogs_merged integer := 0;
  v_setlogs_skipped_zero_weight integer := 0;
  v_setlogs_skipped_bad_user integer := 0;
  v_setlogs_duplicate_rows integer := 0;
BEGIN
  -- (a) Sessions for every (user, date) that has workout_logs rows.
  INSERT INTO workout_sessions (profile_id, date, split_type, duration_minutes, is_completed, day)
  SELECT DISTINCT
    wl.user_id,
    wl.date,
    'logged',
    45,
    true,
    trim(to_char(wl.date, 'Day'))
  FROM workout_logs wl
  ON CONFLICT (profile_id, date) DO NOTHING;
  GET DIAGNOSTICS v_sessions_created = ROW_COUNT;

  -- (a2) Sessions for set_logs-only (user, date) pairs (valid users, non-zero
  -- weight rows only — matching what (d) will actually merge).
  INSERT INTO workout_sessions (profile_id, date, split_type, duration_minutes, is_completed, day)
  SELECT DISTINCT
    sl.user_id::uuid,
    (sl.completed_at)::date,
    'logged',
    45,
    true,
    trim(to_char((sl.completed_at)::date, 'Day'))
  FROM set_logs sl
  WHERE sl.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (SELECT 1 FROM fitness_profiles fp WHERE fp.id = sl.user_id::uuid)
    AND sl.weight_kg > 0
  ON CONFLICT (profile_id, date) DO NOTHING;
  GET DIAGNOSTICS v_sessions_from_setlogs = ROW_COUNT;

  -- (b) Copy workout_logs → exercise_set_logs.
  INSERT INTO exercise_set_logs
    (session_id, user_id, exercise_id, exercise_name, week_number, day,
     set_number, weight_kg, reps_completed, rpe, unit, is_bodyweight, is_warmup, completed_at)
  SELECT
    ws.id,
    wl.user_id,
    trim(both '-' from regexp_replace(lower(wl.exercise_name), '[^a-z0-9]+', '-', 'g')),
    wl.exercise_name,
    NULL,
    trim(to_char(wl.date, 'Day')),
    wl.set_number,
    wl.weight_kg,
    wl.reps_completed,
    NULL,
    'reps',
    COALESCE(wl.is_bodyweight, false),
    false,
    COALESCE(wl.completed_at, wl.date::timestamptz + interval '12 hours')
  FROM workout_logs wl
  JOIN workout_sessions ws ON ws.profile_id = wl.user_id AND ws.date = wl.date
  ON CONFLICT ON CONSTRAINT unique_set_per_session DO NOTHING;
  GET DIAGNOSTICS v_workout_logs_copied = ROW_COUNT;

  -- (c) Enrich copied rows with week_number/rpe from their earliest set_logs
  -- counterpart (set_logs carried mesocycle keying that workout_logs lacked).
  WITH counterparts AS (
    SELECT DISTINCT ON (sl.user_id, (sl.completed_at)::date, sl.exercise_name, sl.set_number)
      sl.user_id::uuid AS user_id,
      (sl.completed_at)::date AS log_date,
      sl.exercise_name,
      sl.set_number,
      sl.week_number,
      sl.rpe
    FROM set_logs sl
    WHERE sl.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ORDER BY sl.user_id, (sl.completed_at)::date, sl.exercise_name, sl.set_number, sl.completed_at ASC
  )
  UPDATE exercise_set_logs esl
  SET week_number = COALESCE(esl.week_number, c.week_number),
      rpe = COALESCE(esl.rpe, c.rpe)
  FROM counterparts c
  JOIN workout_sessions ws2 ON ws2.profile_id = c.user_id AND ws2.date = c.log_date
  WHERE esl.session_id = ws2.id
    AND esl.user_id = c.user_id
    AND esl.exercise_name = c.exercise_name
    AND esl.set_number = c.set_number
    AND esl.week_number IS NULL
    AND (c.week_number IS NOT NULL OR c.rpe IS NOT NULL);
  GET DIAGNOSTICS v_enriched = ROW_COUNT;

  -- (d) Merge set_logs rows with NO workout_logs counterpart.
  --     Skip counters first (documented per the C0 spec):
  SELECT count(*) INTO v_setlogs_skipped_bad_user
  FROM set_logs sl
  WHERE NOT (
    sl.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (SELECT 1 FROM fitness_profiles fp WHERE fp.id = sl.user_id::uuid)
  );

  SELECT count(*) INTO v_setlogs_skipped_zero_weight
  FROM set_logs sl
  WHERE sl.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (SELECT 1 FROM fitness_profiles fp WHERE fp.id = sl.user_id::uuid)
    AND sl.weight_kg = 0
    AND NOT EXISTS (
      SELECT 1 FROM workout_logs wl
      WHERE wl.user_id = sl.user_id::uuid
        AND wl.date = (sl.completed_at)::date
        AND wl.exercise_name = sl.exercise_name
        AND wl.set_number = sl.set_number
    );

  WITH mergeable AS (
    SELECT
      sl.user_id::uuid AS user_id,
      (sl.completed_at)::date AS log_date,
      sl.exercise_name,
      sl.week_number,
      sl.day,
      sl.set_number,
      sl.weight_kg,
      sl.reps_completed,
      sl.rpe,
      sl.completed_at,
      row_number() OVER (
        PARTITION BY sl.user_id, (sl.completed_at)::date, sl.exercise_name, sl.set_number
        ORDER BY sl.completed_at ASC
      ) AS rn
    FROM set_logs sl
    WHERE sl.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (SELECT 1 FROM fitness_profiles fp WHERE fp.id = sl.user_id::uuid)
      AND sl.weight_kg > 0
      AND NOT EXISTS (
        SELECT 1 FROM workout_logs wl
        WHERE wl.user_id = sl.user_id::uuid
          AND wl.date = (sl.completed_at)::date
          AND wl.exercise_name = sl.exercise_name
          AND wl.set_number = sl.set_number
      )
  ),
  dupe_count AS (SELECT count(*) AS dupes FROM mergeable WHERE rn > 1),
  inserted AS (
    INSERT INTO exercise_set_logs
      (session_id, user_id, exercise_id, exercise_name, week_number, day,
       set_number, weight_kg, reps_completed, rpe, unit, is_bodyweight, is_warmup, completed_at)
    SELECT
      ws.id,
      m.user_id,
      trim(both '-' from regexp_replace(lower(m.exercise_name), '[^a-z0-9]+', '-', 'g')),
      m.exercise_name,
      m.week_number,
      COALESCE(m.day, trim(to_char(m.log_date, 'Day'))),
      m.set_number,
      m.weight_kg,
      m.reps_completed,
      m.rpe,
      'reps',
      false,
      false,
      m.completed_at
    FROM mergeable m
    JOIN workout_sessions ws ON ws.profile_id = m.user_id AND ws.date = m.log_date
    WHERE m.rn = 1
    ON CONFLICT ON CONSTRAINT unique_set_per_session DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM inserted),
    (SELECT dupes FROM dupe_count)
  INTO v_setlogs_merged, v_setlogs_duplicate_rows;

  RAISE NOTICE 'C0 backfill: sessions created from workout_logs: %', v_sessions_created;
  RAISE NOTICE 'C0 backfill: sessions created from set_logs-only dates: %', v_sessions_from_setlogs;
  RAISE NOTICE 'C0 backfill: workout_logs rows copied: %', v_workout_logs_copied;
  RAISE NOTICE 'C0 backfill: rows enriched with week_number/rpe from set_logs: %', v_enriched;
  RAISE NOTICE 'C0 backfill: set_logs-only rows merged: %', v_setlogs_merged;
  RAISE NOTICE 'C0 backfill: set_logs rows SKIPPED (weight 0 — L6 bulk-button fabrications): %', v_setlogs_skipped_zero_weight;
  RAISE NOTICE 'C0 backfill: set_logs rows SKIPPED (invalid/unknown user_id): %', v_setlogs_skipped_bad_user;
  RAISE NOTICE 'C0 backfill: set_logs duplicate rows collapsed (L2): %', v_setlogs_duplicate_rows;
END $$;
