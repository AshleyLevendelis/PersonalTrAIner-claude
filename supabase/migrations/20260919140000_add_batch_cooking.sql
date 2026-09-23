-- ============================================================================
-- COOK ONCE, EAT TWICE — the batch-cooking preference.
--
-- Ashley, 19 Sep 2026, from four options: a setting, ON BY DEFAULT. The plan
-- sizes tonight's dinner and tomorrow's lunch as the same dish, and the dinner
-- card says so; anyone who does not want to eat the same thing twice turns it
-- off in Profile.
--
-- DEFAULT true, so every profile that already exists gets the behaviour
-- without a backfill and without being asked a question it was never asked at
-- onboarding. NOT NULL for the same reason include_snacks is: a three-state
-- boolean where the third state means "nobody decided" is a bug generator, and
-- the default IS the decision.
--
-- The portion arithmetic lives in the app, not here. Lunch takes a different
-- share of the day from dinner (0.40 against 0.30 on a three-meal split), so
-- "cook double" would overshoot lunch by a third; the real figure is a median
-- 1.26x and it is derived per profile from the slot budgets.
-- ============================================================================

ALTER TABLE fitness_profiles
  ADD COLUMN IF NOT EXISTS batch_cooking boolean NOT NULL DEFAULT true;
