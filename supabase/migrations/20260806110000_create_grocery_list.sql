/*
# Grocery list (VISION-ARCHITECTURE.md §5.3)

One table, not the vision doc's `grocery_lists` + `grocery_items` split —
this app is single-profile-per-session with no concept of multiple
concurrent shopping horizons, so a `horizon_start`/`horizon_end` parent
row buys nothing a `profile_id` scope doesn't already give for free.
Matches the same "single table over a satellite split when nothing reads
the split independently" call made for user_facts.

`canonical_key` is the merge key: `lookupIngredient(name)?.name.toLowerCase()`
when food-db resolves it, else `manual:<slugified name>` — this is what
lets "200g chicken Monday" + "150g chicken Wednesday" collapse into one
350g line (UNIQUE (profile_id, canonical_key)), and what lets a manual
add of an unresolvable ingredient still get a stable identity to
edit/check/delete by. `needs_review` marks the latter case: per §5.3,
"a grocery list is not a macro computation and must not fail closed" —
an unmatched ingredient still gets a row, just flagged.

`source` distinguishes what regeneration is allowed to touch:
'generated' rows are the ONLY ones a regenerate may update-in-place or
delete; 'manual' and 'chat' rows are never touched by generation code,
which is what keeps hand-added items and their checked state alive
across a regenerate (Part 2's requirement) — no extra "user_overridden"
boolean needed, since chat/manual origin already carries that meaning.

`meal_refs` (jsonb array of {day, slot, mealName}) is provenance only,
answering "why is there 400g of oats on here" — never read by any
generator, purely a display concern.

`quantity`/`unit`: generated rows are always stored in grams (the
common basis unitToGrams reduces every ingredient to before merging),
manual/chat rows keep whatever unit the user typed — display code
renders both without assuming a common unit.

Standard 4-policy RLS block, verbatim from user_facts/pending_actions.
*/

CREATE TABLE IF NOT EXISTS grocery_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  canonical_key text NOT NULL,
  display_name  text NOT NULL,
  quantity      numeric NOT NULL,
  unit          text NOT NULL,
  category      text NOT NULL CHECK (category IN ('produce', 'meat_fish', 'dairy', 'dry_goods', 'frozen', 'other')),
  source        text NOT NULL CHECK (source IN ('generated', 'manual', 'chat')),
  meal_refs     jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked       boolean NOT NULL DEFAULT false,
  needs_review  boolean NOT NULL DEFAULT false,
  client_id     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, canonical_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_items_client_id ON grocery_items(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grocery_items_profile ON grocery_items(profile_id);

ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_grocery_items" ON grocery_items;
CREATE POLICY "anon_select_grocery_items" ON grocery_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_grocery_items" ON grocery_items;
CREATE POLICY "anon_insert_grocery_items" ON grocery_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_grocery_items" ON grocery_items;
CREATE POLICY "anon_update_grocery_items" ON grocery_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_grocery_items" ON grocery_items;
CREATE POLICY "anon_delete_grocery_items" ON grocery_items FOR DELETE
  TO anon, authenticated USING (true);
