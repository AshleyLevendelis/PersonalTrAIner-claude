/*
# Time-bounded plan adaptations — injury and equipment/travel

Neither existing storage fits a time-bounded, auto-reverting plan change:
`fitness_profiles.injuries` is the static onboarding list `test:injury-
separation` protects, and `user_facts` (kind='exercise_preference') is
reserved for PERMANENT bans written by ban_exercise — wrong semantics for
"ease off this joint for two weeks" or "dumbbells only until Friday".

This table is the third, dedicated store the injury/equipment adaptation
feature needs: it never writes to either of the above, and — critically —
carries `pre_image` (the touched mesocycle weeks before substitution) plus
`expires_at`, so a lazy check-on-load sweep (no scheduled-job infra exists
in this codebase — see pending_actions' own expireOldPendingActions comment)
can restore the original exercises once the stated period ends, exactly
the same snapshot-restore mechanism undoExerciseSwap already uses.

`pending_action_id` links back to the pending_actions row whose confirm
created this adaptation (nullable — the adaptation can outlive its
originating proposal, which resolves/expires within its own 10-minute
window long before the adaptation itself does).
*/

CREATE TABLE IF NOT EXISTS plan_adaptations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id              uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  kind                    text NOT NULL CHECK (kind IN ('injury', 'equipment')),
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended_early', 'expired')),
  injury_code             text NULL,
  equipment_override      text NULL,
  severity                text NULL,
  reason                  text NULL,
  affected_week_numbers   integer[] NOT NULL DEFAULT '{}',
  pre_image               jsonb NOT NULL,
  pending_action_id       uuid NULL REFERENCES pending_actions(id) ON DELETE SET NULL,
  starts_at               timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL,
  ended_at                timestamptz NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_adaptations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_plan_adaptations" ON plan_adaptations;
CREATE POLICY "anon_select_plan_adaptations" ON plan_adaptations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_plan_adaptations" ON plan_adaptations;
CREATE POLICY "anon_insert_plan_adaptations" ON plan_adaptations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_plan_adaptations" ON plan_adaptations;
CREATE POLICY "anon_update_plan_adaptations" ON plan_adaptations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_plan_adaptations" ON plan_adaptations;
CREATE POLICY "anon_delete_plan_adaptations" ON plan_adaptations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_plan_adaptations_active
  ON plan_adaptations(profile_id, status);
