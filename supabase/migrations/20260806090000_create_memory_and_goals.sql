/*
# Memory & goals (VISION-ARCHITECTURE.md §1)

"Memory is a compiler, not a mutator." Facts are stored as typed rows; a
pure module (fact-compiler.ts) reads only rows with class='plan' and emits
the arguments the existing pure generators already accept (exclusions:
string[], dislikedFoods: string[], training_days overrides, known_*_kg
anchors). No generator learns about memory; no memory row writes plan
state directly — this table has exactly one writer, the client, matching
pending_actions' I1 (the edge function returns intent only).

Trimmed relative to the vision doc's full §1.1 design: ONE user_facts
table with kind-specific nullable columns, not per-kind satellite tables
(fact_preference/fact_timing_rule/fact_availability). The satellite-table
argument in the doc is specifically about not burying a resolution
constraint in jsonb — this schema keeps that property (resolved_refs is a
real text[] column with a real CHECK, never jsonb) while avoiding four
extra tables for a first cut. No precedence_tier/reinforcement_count/
effective_from/effective_until/blocked_reason — conflict handling in this
round is a chat-turn reconciliation question (Part 2's concrete case:
stated 1RM vs onboarding working weight), not a stored precedence engine;
revisit if a later round needs automatic multi-fact precedence ordering.

user_goals' CHECK mirrors the vision doc's Decision #4 exactly: an
'active' status requires a captured baseline for measurable metrics.
Directional goals (body_fat_pct, generic "look better") are exempt by
design — they're explicitly never reported as a tracked percentage (see
goal-progress.ts), so no baseline is required or meaningful.

user_context_facts is class='context' by construction (its own table, not
a class column on user_facts) — the compiler's only input queries
user_facts/user_goals; this table is structurally unreachable by it,
matching "tone must never touch a plan."

Every table carries source + source_message_id (provenance) and a
partial-unique client_id (the same idempotency mechanism as
exercise_set_logs/meal_events/pending_actions).
*/

CREATE TABLE IF NOT EXISTS user_facts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('food_preference', 'exercise_preference', 'timing_rule', 'hard_constraint')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'retired')),
  source             text NOT NULL CHECK (source IN ('chat', 'manual', 'onboarding')),
  source_message_id  uuid NULL REFERENCES chat_messages(id) ON DELETE SET NULL,
  raw_phrase         text NOT NULL,
  display_text       text NOT NULL,
  supersedes_id      uuid NULL REFERENCES user_facts(id) ON DELETE SET NULL,

  -- food_preference | exercise_preference
  polarity           text NULL CHECK (polarity IN ('like', 'dislike')),
  hardness           text NULL CHECK (hardness IN ('hard', 'soft')),
  -- exact catalog exercise names (exercise_exclusions' own convention) for
  -- exercise_preference; lowercase substring keys (dislikedFoods'
  -- convention, meal-generation.ts:267-274) for food_preference.
  resolved_refs      text[] NULL,

  -- timing_rule
  timing_subject     text NULL,
  timing_relation    text NULL CHECK (timing_relation IN ('before', 'after')),
  timing_anchor      text NULL CHECK (timing_anchor IN ('training', 'slot')),
  timing_slot        text NULL CHECK (timing_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),

  -- hard_constraint
  constraint_kind    text NULL CHECK (constraint_kind IN ('availability', 'equipment')),
  weekday            text NULL CHECK (weekday IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),

  client_id          text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  retired_at         timestamptz NULL,

  CHECK (kind NOT IN ('food_preference', 'exercise_preference') OR (polarity IS NOT NULL AND hardness IS NOT NULL)),
  CHECK (kind <> 'timing_rule' OR (timing_subject IS NOT NULL AND timing_relation IS NOT NULL AND timing_anchor IS NOT NULL)),
  CHECK (kind <> 'hard_constraint' OR constraint_kind IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_facts_client_id ON user_facts(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_facts_profile_status ON user_facts(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_user_facts_profile_kind ON user_facts(profile_id, kind, status);

ALTER TABLE user_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_facts" ON user_facts;
CREATE POLICY "anon_select_user_facts" ON user_facts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_facts" ON user_facts;
CREATE POLICY "anon_insert_user_facts" ON user_facts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_facts" ON user_facts;
CREATE POLICY "anon_update_user_facts" ON user_facts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_facts" ON user_facts;
CREATE POLICY "anon_delete_user_facts" ON user_facts FOR DELETE
  TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_goals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  metric               text NOT NULL CHECK (metric IN ('body_weight_kg', 'lift_working_kg', 'lift_1rm_kg', 'sessions_per_week', 'directional')),
  trackable            text NOT NULL CHECK (trackable IN ('measurable', 'directional')),
  -- exact exercise name for lift_working_kg/lift_1rm_kg; NULL otherwise
  metric_ref           text NULL,
  baseline_value       numeric NULL,
  baseline_captured_at timestamptz NULL,
  baseline_source      text NULL CHECK (baseline_source IN ('logged_data', 'user_stated')),
  target_value         numeric NULL,
  target_date          date NULL,
  status               text NOT NULL DEFAULT 'needs_baseline' CHECK (status IN ('needs_baseline', 'active', 'achieved', 'abandoned', 'superseded')),
  source               text NOT NULL CHECK (source IN ('chat', 'manual')),
  source_message_id    uuid NULL REFERENCES chat_messages(id) ON DELETE SET NULL,
  raw_phrase           text NOT NULL,
  display_text         text NOT NULL,
  supersedes_id        uuid NULL REFERENCES user_goals(id) ON DELETE SET NULL,
  client_id            text,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CHECK (status <> 'active' OR trackable = 'directional' OR (baseline_value IS NOT NULL AND baseline_captured_at IS NOT NULL AND target_value IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_goals_client_id ON user_goals(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_goals_profile_status ON user_goals(profile_id, status);

ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_goals" ON user_goals;
CREATE POLICY "anon_select_user_goals" ON user_goals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_goals" ON user_goals;
CREATE POLICY "anon_insert_user_goals" ON user_goals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_goals" ON user_goals;
CREATE POLICY "anon_update_user_goals" ON user_goals FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_goals" ON user_goals;
CREATE POLICY "anon_delete_user_goals" ON user_goals FOR DELETE
  TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_context_facts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  raw_phrase         text NOT NULL,
  display_text       text NOT NULL,
  source             text NOT NULL CHECK (source IN ('chat', 'manual')),
  source_message_id  uuid NULL REFERENCES chat_messages(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  client_id          text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  retired_at         timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_context_facts_client_id ON user_context_facts(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_context_facts_profile_status ON user_context_facts(profile_id, status);

ALTER TABLE user_context_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_context_facts" ON user_context_facts;
CREATE POLICY "anon_select_user_context_facts" ON user_context_facts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_context_facts" ON user_context_facts;
CREATE POLICY "anon_insert_user_context_facts" ON user_context_facts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_context_facts" ON user_context_facts;
CREATE POLICY "anon_update_user_context_facts" ON user_context_facts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_context_facts" ON user_context_facts;
CREATE POLICY "anon_delete_user_context_facts" ON user_context_facts FOR DELETE
  TO anon, authenticated USING (true);
