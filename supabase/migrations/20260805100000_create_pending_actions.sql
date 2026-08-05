/*
# Chat action framework — pending_actions table (VISION-ARCHITECTURE.md §2)

The chat-mutation incident (schedule "updated" per the model's own prose,
never actually applied) was architectural: the edge function is single-turn,
and the model's confirmation text rendered before any write ran, with no
structural gate between "the model called a tool" and "the database
changed." This table is that gate. The edge function returns intent only
(I1 — it never writes plan state); the client inserts a row here, renders a
card from `diff`, and only calls the real edit layer (mesocycle-edit +
saveMesocycle, meal-store) after an explicit user confirm.

Trimmed hard relative to the vision doc's full section 2.2 design: no
`proposal_artifacts` side table (nothing in this round is a 16-week
mesocycle payload — a single exercise/meal swap's diff is tiny JSON), no
`subject_key`/`suppressed_until` decline-memory (nothing in this scope
auto-detects and re-proposes unprompted), no `origin` column (chat-only,
no UI-initiated proposals yet).

`scope_key` + the partial unique index below is the "confirmed exactly
once, even on retry" mechanism: a retried identical propose_* tool call
collides with the still-open row instead of creating a duplicate card.
`pre_image` is REQUIRED (enforced in application code, not a DB constraint,
since JSONB CHECK conditioned on another column's value is awkward in
Postgres) whenever `action_class = 'plan_mutation'` — without it the Undo
button on a swap/ban card would be unimplementable.
*/

CREATE TABLE IF NOT EXISTS pending_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  message_id        uuid NULL,
  action_class      text NOT NULL CHECK (action_class IN ('plan_mutation', 'append', 'clarification')),
  kind              text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN
                     ('pending', 'claimed', 'executing', 'done', 'partial', 'failed', 'stale', 'declined', 'expired')),
  scope_key         text NOT NULL,
  preconditions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload           jsonb NOT NULL,
  payload_version   smallint NOT NULL DEFAULT 1,
  pre_image         jsonb NULL,
  diff              jsonb NOT NULL,
  edited_payload    jsonb NULL,
  result            jsonb NULL,
  client_id         text,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  claimed_at        timestamptz NULL,
  resolved_at       timestamptz NULL
);

ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pending_actions" ON pending_actions;
CREATE POLICY "anon_select_pending_actions" ON pending_actions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pending_actions" ON pending_actions;
CREATE POLICY "anon_insert_pending_actions" ON pending_actions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pending_actions" ON pending_actions;
CREATE POLICY "anon_update_pending_actions" ON pending_actions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_pending_actions" ON pending_actions;
CREATE POLICY "anon_delete_pending_actions" ON pending_actions FOR DELETE
  TO anon, authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_actions_client_id
  ON pending_actions(client_id) WHERE client_id IS NOT NULL;

-- The idempotency mechanism: at most one open (pending/claimed/executing)
-- proposal per (profile, scope_key). A retried identical model tool call
-- collides here instead of duplicating a card.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_actions_scope_key_open
  ON pending_actions(profile_id, scope_key) WHERE status IN ('pending', 'claimed', 'executing');

CREATE INDEX IF NOT EXISTS idx_pending_actions_profile_status
  ON pending_actions(profile_id, status);

-- ============================================================================
-- Undo support for meal_events (genuinely append-only ledger — never a hard
-- delete, per the vision doc's own guidance; a void is a compensating flag).
-- ============================================================================
ALTER TABLE meal_events ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL;
ALTER TABLE meal_events ADD COLUMN IF NOT EXISTS voided_by uuid NULL REFERENCES meal_events(id);

-- ============================================================================
-- Defensive: ChatAssistant.tsx has read/written chat_messages.status since
-- before this migration existed, but no migration in this repo ever added
-- the column — confirmed by grepping every supabase/migrations/*.sql file.
-- Either it was applied directly against the live DB outside version
-- control, or every one of those calls has been silently failing. This
-- documents/resolves the drift without erroring either way it turns out.
-- ============================================================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'complete';
