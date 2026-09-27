# A kept meal that breaks a later restriction is not served (27 Sep 2026)

Ashley's ruling, from three options, asked after the likes review named it:
**stop serving it**. *"It stays in your hearted list, marked as clashing, and
never appears in a day while the restriction is on. It comes back if you lift
the restriction."* She passed over keeping it on the plan with the card's
warning (the behaviour until today) and over asking when the restriction is
added.

## What exists (traced)

- A heart, or a meal asked for by name, survives every regenerate unchecked
  (`survivesRegeneration`, `persistPools`). So a pool can hold a meal that
  broke nothing when it was kept and breaks a restriction added since.
- Both EXPLICIT swap routes already refuse such a meal:
  - the screen's swap list greys it out with the reason (`MealPlan`,
    `checkAlternative`);
  - the coach's swap declines it (`meal-swap-proposal`, `optionBlockedBy`).
- The two routes that can still SERVE it:
  1. the day's automatic pick (`assembleDay`), which knows nothing about
     restrictions and can choose it on fit;
  2. a pick made for a date before the restriction was added, which
     `assembleDay` treats as the only candidate for that slot.
- Every assembly in the app (today, the strip, the shopping list, the refit)
  reads App's `mealPools`, which since this morning are the stored pools with
  every restriction breaker marked (`markRestrictionBreakers`, the meal card's
  own check).
- When today's chosen meal breaks a restriction, `MealPlan` says so and offers
  "Redo them".

## The build

1. **`assembleDay` never serves a marked option**, automatic or pinned. A pin
   on a marked meal is set aside for that slot, not deleted, so lifting the
   restriction brings the pick back ("comes back if you lift the
   restriction"). One place, so every assembly obeys it.
2. **A slot whose every option is marked is not silent.** The existing
   "no longer fits your restrictions … Redo them" notice covers it. Until
   today it fired only when the SERVED meal clashed, which can no longer
   happen.
3. **The marking moves into a shared hook** (`useServablePools`), used by App
   and by the browser harness, so a driver runs the app's marking and not a
   copy of it.
4. **Profile marks a clashing heart.** It stays listed, removable as before,
   with a line saying it is not served while it clashes. Profile works this
   out itself from the stored pools and the same check, when the sheet opens.
5. **Every kept meal, not only hearts.** A meal asked for by name survives a
   regenerate the same way, and the ruling's reason ("a restriction always
   wins over an old heart") applies to it equally.

## Safety

This only ever REMOVES a meal from what is served. It never adds a food and
never weakens a check. The allergen disclosure is unchanged: a meal with no
recorded ingredients cannot be checked, and still comes back as "no issues
found", which has never meant "safe".

## Checks

- `assembleDay`:
  - a marked option is not chosen even when it fits best, or is the only
    fit;
  - a pinned marked option is set aside;
  - unmarking brings both back;
  - a slot with every option marked has no meal and is reported missing.
- Every App assembly reads the hook's pools; the harness uses the same hook.
- Driven on the real Nutrition screen:
  - a kept dinner she now avoids is not served on any of the seven days;
  - the notice appears when every dinner clashes.
- Driven on the real Profile screen: the clashing heart is listed and marked.
