-- ---------------------------------------------------------------------------
-- WHAT THE COACH SAID UNPROMPTED, AND WHETHER HE ANSWERED (13 Nov 2026, his strategy, slice 1 "Measurement").
--
-- One row per message the coach sends on its own: the daily hello, an event (how did it feel, a missed day), a
-- time-of-day moment, a phone reminder. Kept apart from chat_messages on purpose: "Clear chat" deletes every chat row,
-- and the response to each moment is the fact the rest of the strategy is judged by. answered_at / answer are filled
-- by the app when the next thing he sends answers it ('replied') or he taps its shortcut ('tapped'); a row never
-- answered was ignored. docs/plans/measurement.md.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_moment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  moment text NOT NULL,
  surface text NOT NULL CHECK (surface IN ('chat', 'phone')),
  chat_message_id uuid NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz NULL,
  answer text NULL CHECK (answer IS NULL OR answer IN ('replied', 'tapped'))
);
CREATE INDEX IF NOT EXISTS idx_coach_moment_log_user_sent ON coach_moment_log (user_id, sent_at DESC);

ALTER TABLE coach_moment_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_coach_moment_log" ON coach_moment_log FOR SELECT
  TO anon, authenticated USING (owns_profile(user_id));
CREATE POLICY "owner_insert_coach_moment_log" ON coach_moment_log FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_update_coach_moment_log" ON coach_moment_log FOR UPDATE
  TO anon, authenticated USING (owns_profile(user_id)) WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_delete_coach_moment_log" ON coach_moment_log FOR DELETE
  TO anon, authenticated USING (owns_profile(user_id));
