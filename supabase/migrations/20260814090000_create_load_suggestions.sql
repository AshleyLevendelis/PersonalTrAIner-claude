/*
# Load-bump suggestion state (Vision Step 6)

Steps 4/5 (block-review.ts / block-consistency.ts) both apply their
block-boundary finding automatically and explain it afterward — no
persisted "did we already ask" state was needed because there was never
anything to ask. This feature is the opposite shape: it proposes a
heavier starting weight when a main lift's real logged performance
consistently beat what the block prescribed, and ONLY ever applies it on
an explicit confirm — see block-review.ts's own forceStartingWeightKg
mechanism, reused here but gated behind a real tap instead of applied on
sight.

That means, for the first time, something needs to remember a CHOICE the
trainee made about a suggestion, across every future block:
  - was a suggestion already shown for the block that's currently live
    (so opening the app twice in the same week doesn't insert it twice)
  - was it ever declined (so it never gets asked again for that exercise,
    permanently — the same weight as a banned exercise staying banned)

Neither existing store fits: `pending_actions` is scoped to short-lived,
chat-transcript-bound proposals (10-minute expiry, tied to a message_id)
and this needs to persist indefinitely, unprompted by any conversation
turn; `user_facts`' FactKind enum has no slot for "declined a load
suggestion" without stretching its existing preference/constraint
semantics. A small, single-purpose table — the same reasoning
plan_adaptations' own migration comment gives for why IT needed a third
store.
*/

CREATE TABLE IF NOT EXISTS load_suggestions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  exercise_id          text NOT NULL,
  exercise_name        text NOT NULL,
  block_number         integer NOT NULL,
  day_name             text NOT NULL,
  exercise_index       integer NOT NULL,
  current_weight_kg    numeric(6,2) NOT NULL,
  proposed_weight_kg   numeric(6,2) NOT NULL,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz NULL,
  UNIQUE (profile_id, exercise_id, block_number)
);

ALTER TABLE load_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_load_suggestions" ON load_suggestions;
CREATE POLICY "anon_select_load_suggestions" ON load_suggestions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_load_suggestions" ON load_suggestions;
CREATE POLICY "anon_insert_load_suggestions" ON load_suggestions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_load_suggestions" ON load_suggestions;
CREATE POLICY "anon_update_load_suggestions" ON load_suggestions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_load_suggestions" ON load_suggestions;
CREATE POLICY "anon_delete_load_suggestions" ON load_suggestions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_load_suggestions_profile_exercise
  ON load_suggestions(profile_id, exercise_id);
