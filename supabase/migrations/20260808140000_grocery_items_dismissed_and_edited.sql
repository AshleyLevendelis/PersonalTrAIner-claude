/*
# Grocery items: dismissed + user_edited flags (UX-sweep fix 0.10)

Two additive columns fixing the same underlying gap: generateGroceryList's
regenerate reconciliation only ever saw 'generated' rows currently in the
table, so it had no memory of a row the user had deliberately removed or
hand-corrected — a regenerate would re-aggregate the same ingredient from
the meal plan and treat it as brand new, silently resurrecting a deleted
item or clobbering an edited display_name/quantity back to the generated
value.

`dismissed`: set instead of a hard delete when the user removes a
'generated' row (deleteItemLocal). The row survives, hidden from every
normal read (getAllItems filters it out) but still visible to the
regenerate reconciliation, which now skips re-adding a dismissed
canonical_key rather than deleting-then-reinserting it. 'manual'/'chat'
deletes are unaffected — regeneration never reads those sources anyway.

`user_edited`: set whenever editItemLocal touches a 'generated' row's
name/quantity/unit. A regenerate that finds `user_edited = true` updates
only meal_refs (which meals reference it) and leaves the user's own
values alone, instead of overwriting them with the freshly-aggregated
grams.

Both default false so every existing row is unaffected until touched.
*/

ALTER TABLE grocery_items ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false;
ALTER TABLE grocery_items ADD COLUMN IF NOT EXISTS user_edited boolean NOT NULL DEFAULT false;
