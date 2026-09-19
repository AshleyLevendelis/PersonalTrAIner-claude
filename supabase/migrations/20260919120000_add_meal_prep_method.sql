-- ============================================================================
-- MEAL METHOD — keep the cooking steps the generator already writes.
--
-- generate-meals has always asked the model for a `prep` field and always
-- received one. It was read twice (to judge whether a dish was too heavy for
-- its slot, and to tag the option `quick` or `standard`) and then discarded:
-- PoolOption had no field for it and this table had no column. So the app paid
-- for the method and showed a dish name with weighed ingredients and no
-- instructions.
--
-- DEFAULT '' AND NOT NULL, so every row that already exists is valid the
-- moment this lands and no backfill is needed. An empty method renders as no
-- method at all, which is the honest state for the pools generated before
-- this column existed.
--
-- The method never carries amounts — the ingredient list does. Portions are
-- rescaled by the app after the model proposes them, so a method that named a
-- quantity could be describing an amount the ingredients no longer contain.
-- The prompt asks for technique only, and verifyProposal drops any method that
-- still mentions a mass or volume rather than letting it contradict the
-- numbers beside it.
-- ============================================================================

ALTER TABLE meal_plan_slots
  ADD COLUMN IF NOT EXISTS prep text NOT NULL DEFAULT '';
