-- ---------------------------------------------------------------------------
-- A COACH REPLY REPORTED FROM INSIDE THE APP (20 Nov 2026, his choice "1, build it", for the Google Play store).
--
-- Google Play's rule on AI-generated content: an app whose AI writes replies must let people report or flag an
-- offensive or harmful reply without leaving the app. Each coach bubble has "Report this reply"; the reason, an
-- optional note and the reply's own words are kept here for Ashley to read. The words are copied, not referenced:
-- "Clear chat" deletes chat rows, and a report must outlive the conversation it came from.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_reply_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  chat_message_id uuid NULL,
  reply_text text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('wrong', 'unsafe', 'offensive', 'other')),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_reply_reports_created ON coach_reply_reports (created_at DESC);

ALTER TABLE coach_reply_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_coach_reply_reports" ON coach_reply_reports FOR SELECT
  TO anon, authenticated USING (owns_profile(user_id));
CREATE POLICY "owner_insert_coach_reply_reports" ON coach_reply_reports FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_delete_coach_reply_reports" ON coach_reply_reports FOR DELETE
  TO anon, authenticated USING (owns_profile(user_id));
