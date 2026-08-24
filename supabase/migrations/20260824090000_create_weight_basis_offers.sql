/*
# "You've told me your weight — shall I redo your starting weights?"

Backlog item 2b (2026-08-24) made the app honest about not knowing someone's
body: when a weight/age/sex is declined, loads are derived from a deliberately
light stand-in (50kg/female/60) and labelled "starting light" rather than
"suggested". That is the right trade while we know nothing.

It stops being the right trade the moment they weigh in. `computeTargets`
already prefers the latest daily_metrics reading over the immutable signup
weight, so FOOD targets catch up on their own; the training side reads only
`profile.weight_kg`, and `generateMesocycle` runs exactly once, at onboarding.
So the sixteen weeks of loads written at signup are the loads forever, and
someone who declined and later stepped on the scales stays on a 50kg woman's
squat indefinitely.

Ashley's ruling was to ASK rather than rebuild silently: a weigh-in produces
an offer, and nothing changes unless they accept. Two properties follow, and
this table exists for both:

  - the offer must survive being ignored. It re-surfaces on every app load
    until answered, so something has to remember that it is outstanding.
  - a decline must be permanent, the same weight as a declined load
    suggestion or a banned exercise staying banned.

Same reasoning load_suggestions' own migration gives for why IT needed a
third store, and it applies unchanged here: `pending_actions` is scoped to
short-lived, chat-transcript-bound proposals (10-minute expiry, tied to a
message_id) and this must persist indefinitely, unprompted by any
conversation turn; `user_facts`' FactKind enum has no slot for "declined a
plan rebuild" without stretching its preference/constraint semantics.

Rows are also the RECEIPT, which is why the headline columns are stored
rather than recomputed: `basis_weight_kg` records what a confirmed rebuild
was actually derived from, and headline_* record the single largest change
the trainee was shown before they agreed to it. Asking first is only
meaningful if what they agreed to is recoverable afterwards.
*/

CREATE TABLE IF NOT EXISTS weight_basis_offers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  /* The weight the offer was computed from, and would rebuild from — the
     rolling-average anchor (getEffectiveTargetWeightKg), not a single raw
     reading. */
  basis_weight_kg      numeric(6,2) NOT NULL,
  /* The largest single load change the offer showed them, so the banner can
     be rebuilt from the row and the confirmed row still says what they
     agreed to. */
  headline_exercise    text NOT NULL,
  headline_from_kg     numeric(6,2) NOT NULL,
  headline_to_kg       numeric(6,2) NOT NULL,
  /* Week the rebuild started from on confirm — never a past week. NULL while
     pending, since the live week can move before they answer. */
  applied_from_week    integer NULL,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz NULL
);

/* At most one OPEN offer per profile. Partial rather than a plain UNIQUE on
   profile_id because confirmed rows accumulate as receipts — a trainee can
   legitimately be offered and confirm again if they decline nothing and their
   plan is later rebuilt on a guess. Mirrors pending_actions' own partial
   unique index on (profile_id, scope_key) WHERE status IN (open states). */
CREATE UNIQUE INDEX IF NOT EXISTS idx_weight_basis_offers_one_open
  ON weight_basis_offers(profile_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_weight_basis_offers_profile_status
  ON weight_basis_offers(profile_id, status);

ALTER TABLE weight_basis_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_weight_basis_offers" ON weight_basis_offers;
CREATE POLICY "anon_select_weight_basis_offers" ON weight_basis_offers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_weight_basis_offers" ON weight_basis_offers;
CREATE POLICY "anon_insert_weight_basis_offers" ON weight_basis_offers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_weight_basis_offers" ON weight_basis_offers;
CREATE POLICY "anon_update_weight_basis_offers" ON weight_basis_offers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_weight_basis_offers" ON weight_basis_offers;
CREATE POLICY "anon_delete_weight_basis_offers" ON weight_basis_offers FOR DELETE
  TO anon, authenticated USING (true);
