# Plan — three enforcement gaps (audit §2.1, §2.2, §2.3)

Written before building, per CLAUDE.md: *"Dietary enforcement, injury
filtering, and load prescription always get a plan before a build, even when
the fix looks obvious."* All three of these are in that set.

Ashley said "fix every issue you found" after reading the audit, which
described each of these fixes in the shape below. This plan is the record of
what was built and why, not a request for a second approval.

## What the three have in common

The app collects something the user believes is a rule, and then either never
re-checks it or never understood it in the first place. Every one of them
looks saved on screen.

| | The gap | Measured |
|---|---|---|
| §2.1 | A restriction added *after* meals were generated is never re-applied | 11 checks, all failing |
| §2.2 | Injuries typed into Profile are free text; the engine knows 8 exact codes | 12 of 14 realistic entries ignored |
| §2.3 | "Foods to avoid" is a plain substring match | 10 of 122 foods matched (8%) |

---

## §2.1 — Re-check meals against the current restrictions

### The rule

**Enforcement runs at generation time only.** `validateMealAgainstDiet` is
called by `meal-generation.ts`, `meal-addition.ts` and `meal-swap-proposal.ts`
— all three of which are *creating* a meal. Nothing re-runs it over a meal
already in the pool, and no effect anywhere watches `dietary_preferences`.

So: add "Nut-free" today, and the peanut butter in this morning's breakfast
stays on screen, unflagged, until the user finds Regenerate themselves.

### Two pieces, and only the first is a safety fix

**1. Re-check on display (this plan builds it).** Every meal the Nutrition tab
shows is validated against the profile's *current* restrictions at render.
A meal that fails is visibly flagged and cannot be logged as eaten.

- Uses `validateMealAgainstDiet` unchanged — the same function generation
  uses, so a meal cannot be judged one way when created and another when
  shown. A second matcher here would be exactly the divergence the
  almond-butter fix was about.
- The flag says which restriction and which ingredient, because "this doesn't
  match your restrictions" is not actionable.
- **Blocking the log is the safety-relevant half.** A flagged meal that can
  still be ticked as eaten teaches the user the flag is decorative.

**2. Offer to rebuild (this plan builds the offer, never the act).** After a
change that invalidates part of the plan, say what is now out of date and
offer to regenerate. Never automatic: a silent rebuild throws away a plan
someone may be four days into, and Ashley's standing ruling on the
weight-basis offer was the same — *"ask rather than rebuild silently."*

### What this deliberately does NOT do

- It does not filter the meal out. Hiding it would leave the user staring at
  a gap with no explanation, and would quietly discard a meal they may have
  already shopped for.
- It does not re-check the *workout* plan on display. Injuries are handled by
  §2.2 plus the existing adaptation flow, and a per-render pass over the
  mesocycle is a different, heavier change.

### Honesty boundary

The existing disclosure stays and is not weakened: the app checks ingredients
it recognises, and cannot check brands, preparation or cross-contamination.
A flag appearing is informative; a flag *not* appearing is not a clearance.

---

## §2.2 — Injuries become a picker

### The rule

`INJURED_JOINTS` maps exactly eight codes. `getFlaggedJoints` returns nothing
for anything else, so an unmapped entry changes no exercise. The Profile field
is free text with the placeholder *"e.g. Lower back"* — and typing exactly
that produces the string `"Lower back"`, which maps to nothing.

### The fix

Replace the free-text tag list with the same `ToggleGroup` the dietary
restrictions use, over `INJURY_OPTIONS` — the identical shape as the fix
already made for diet, for the identical reason.

**Existing free-text values must not be silently dropped.** On load, a value
that matches a known code (case-insensitively, with spaces or underscores) is
migrated to the canonical code. Anything that does not match is shown, clearly
marked as not affecting the plan, with a one-tap way to remove it. Discarding
it silently would repeat the original defect in the opposite direction.

### The trade-off, stated

A picker cannot express "left knee" or "rotator cuff". That is a real loss of
expressiveness, and it is the right trade: the free text never did anything.
The coach remains the place to describe an injury in your own words, and it
already refuses to guess for areas it has no data for.

---

## §2.3 — The avoid-list uses the resolver the app already owns

### The rule

`containsPhrase` is `String.includes` over the meal name and its ingredient
names. No plurals, no categories, no synonyms. Meanwhile `lookupIngredient`
— used by meal generation for the coverage floor — already handles word
sequences, token overlap, aliases and depluralisation.

### The fix

1. **Resolve both sides through `lookupIngredient` first.** If the typed
   phrase resolves to a food-DB entry and an ingredient resolves to the same
   entry, that is a match regardless of plural or word order.
2. **Category expansion for the words people actually use** — dairy, nuts,
   seafood, red meat, gluten, eggs, soy, shellfish. These map to the food
   DB's existing tags, which already exist and are already gated for parity
   between the two copies of the database.
3. **Substring stays as a fallback**, so nothing that matches today stops
   matching.

### Widening a filter is the safe direction, but not free

Matching more means occasionally excluding a food the user would have eaten.
That is the correct way to be wrong here, and it is the same reasoning already
written into `ALLERGEN_SIGNAL`: *"the failure it prevents (a missed
disclosure) is worse than the one it risks (a tagged food someone could have
eaten)."*

The one thing to avoid is a category that is broader than the word: "nuts"
must not exclude nutmeg or coconut. Category membership comes from the food
DB's tags, not from the word appearing inside another word.

---

## Verification

- `test:meal-restriction-recheck` — a pool containing peanut butter, profile
  gains `nut-free`, the displayed meal is flagged and cannot be logged.
- `test:injury-input` — every one of the 14 phrasings from the audit;
  canonical codes still flag joints; migration maps the recoverable ones.
- `test:food-avoidance` — re-run the audit's own 122-food measurement and
  assert the match rate has risen; assert nutmeg/coconut are NOT caught by
  "nuts".
- Mutations for each, and the existing `test:diet-tag-sync`,
  `test:food-db-parity`, `test:injury-coverage`, `test:food-dislike-is-a-ban`,
  `test:audit` must stay green.

## Deploy

Client-side only. No migration, no edge function.
