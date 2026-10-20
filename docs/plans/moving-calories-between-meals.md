# Moving calories from one meal to another

19 Oct 2026, live test (finding 5, `docs/audits/live-test-2026-10-19-findings.md`): she told the coach *"move some
of lunch's calories to dinner"* and got *"Your meals already add up to your targets, near enough — nothing to resize.
If a particular meal feels off, tell me which and I'll look at that one."* She had named both meals.

Her ruling, 20 Oct 2026: **"Ask how much first."** The coach asks how much, with buttons, then shows BOTH new sizes
before Apply. Her standing rules apply: nothing changes until she confirms, an offer states its costs before the tap,
and (20 Oct) every coach offer is a bubble with small buttons — the card component's look is being changed in another
session, so this uses the existing proposal mechanism unchanged.

## What was there, traced

- Nothing on either surface moves PART of one meal's calories to another. `propose_meal_refit` resizes the whole day
  onto its targets, takes no slot, and refuses when the day is already in band — which is where her request landed.
  `propose_meal_move` swaps WHOLE meals between slots; `propose_meal_food_resize` changes one food.
- The refit refusal (`ChatAssistant.tsx`, the `mealRefit` null branch) says "tell me which" even when two were named.
- A day's meals are not stored: picks name a dish per date and slot over the dateless pool. The way a meal at a
  different size reaches one date already exists: the day swap of two DIFFERENT meals (`meal-day-move.ts`) makes a
  resized copy of each dish with the slot move's own function (`movedOptionFor`), holds it until the strip ends
  (`tagsNewFrom`), and pins it for that date. Both picks or neither (`executeMealDayMove`), and an Undo that puts back
  only when both cells still hold what was written (`undoMealDayMove`).

## What it builds

**One pure builder, `buildMealRebalanceProposal` (`src/lib/meal-rebalance.ts`).** Given the week as SERVED (the same
`serveMealWeek` inputs the strip, the swap card and the knock-on trial use), a date, a from-meal, a to-meal and an
amount in kcal (or none):

1. Refuses in plain words: no targets; an unknown or identical meal; a date outside today plus six; a meal already
   logged as eaten today (her 10 Oct rule: a logged meal stays as eaten), and an unreadable ledger; no dish there.
2. With NO amount: the APP asks, never the model — "Lunch is 620 kcal and dinner 540. How much should I move from
   lunch to dinner?" — with amounts as buttons whose words carry the amount and the destination ("200 kcal to
   dinner"), so her tap is an unambiguous next message. Only amounts the meals can take are offered.
3. With an amount: the SERVED from-dish scaled down and the served to-dish scaled up by that many kcal, through the
   slot move's own resize and verification (`movedOptionFor`, now taking a name), as two copies named
   "X (smaller)" / "Y (bigger)", held until the strip ends, pinned for that date only. The card is read off a TRIAL
   (`serveMealWeek` with both pins, like the day swap): each meal's kcal and protein before → after, the day's total
   (held within rounding, said if it moved more), any other meal the trial changed, and the shopping list.
4. Asked for more than the meals can take: the card offers the most it can move and says so.

**Bounds (CSCS / population nutrition, mine under her 18 Sep delegation):**

- The from-meal keeps at least HALF of what it is served now. Basis: the ISSN protein position stand (Jäger et al.
  2017) puts per-meal protein at roughly 20-40 g spread through the day; the app's main meals carry about 35-50 g, so
  half keeps a main meal near the bottom of that range and still a meal. Below half it is a snack in a meal's slot.
- The to-meal at most DOUBLES. Basis: the ISSN meal-frequency stand (La Bounty et al. 2011) finds meal distribution
  has little effect on body composition when energy and protein are equated, so this is practical, not
  physiological: it stays well inside the portion scaler's own 0.4-2.5x refusal and keeps one meal from carrying most
  of the day. A request beyond either bound gets the most that fits, said.
- Smallest move: 30 kcal (below it the kitchen rounding is the change). Steps offered: 100, 200, 300 (her example).
- The day's TOTAL does not move (same dishes, one up, one down), so no target, band or verdict is redefined.
- **The CSCS five.** (1) Training effect: none directly; daily energy and protein are unchanged, only their timing.
  (2) What it takes away: protein from the from-meal in proportion (named on the card, never hidden). (3) Fundamentals:
  daily protein and energy are held, so recovery and the goal's deficit or surplus survive. (4) No floor redefined:
  the day bands, the protein floor and the scaler's limits read and mean the same. (5) Scope: population-level
  timing, not clinical nutrition.

**Identity, so the rest of the week does not move.** A copy is the same dish. Three places compared dinner→lunch by
NAME and would have treated "Y (bigger)" as a new dish: tomorrow's leftover lunch would be re-made under the copy's
name, and tonight's "cook both portions" line would vanish. They now compare the dish a copy was made from
(`resizedCopyBase` in `meal-dish-identity.ts`, the same connector rule dish identity uses), and the "plan's own dish"
test for her 10 Oct hold rule recognises the new suffixes like "(as lunch)". Only user-requested copies are read this
way, so two generated dishes named alike stay two.

**One controller, both surfaces (the `meal-refit` / day-move pattern).** `useMealDays` builds `rebalance` (`plan`,
`confirm`, `undo`) over its own week and puts it on the controller App already hands to the Nutrition tab and the
coach. The confirm re-plans against the live week and writes only if both cells still hold what the card named;
the write and the Undo are the day swap's own functions (both picks or neither; Undo only when both still hold what
was written, never a meal since logged).

- **Screen:** the meal row's Move sheet gains "Or move some of its calories to…" → a meal → an amount (the same
  amounts the coach offers) → the card's numbers → "Move them" → a note with Undo. Today and every strip day.
- **Coach:** `propose_meal_rebalance` (from_slot, to_slot, kcal optional, date optional, quote), a courier. The prompt
  routes "move calories from A to B", "make lunch smaller and dinner bigger" here, never to the refit. A CODE
  backstop: when the refit tool arrives but her message names two meals with a direction, the rebalance runs instead;
  two meals with no readable direction get "Which way?" with both as buttons — never "tell me which".

## Found while building

- A move between two DIFFERENT dishes moves the day's carbs and fat with the kcal; under the 18 Oct bands that can
  put the day just outside, and her 10 Oct hold rule ("Resize, else leave") then re-fits the day's other meal around
  the two pins (one fixture day: breakfast 361 → 296). That is the app's rule for any pin, so it stays — and it is on
  the card before the tap, with the day's line saying the rest was re-fitted, never "rounding".
- Read as HER dish (the "plan's own" test not knowing the new suffixes), a copy made the day re-plan another meal in
  58 of 252 moves across the gate's fixture. Hence the suffix in `RESIZED_COPY_SUFFIX`.

## Not built, named

- Today's "fit around what was eaten" layer (`dayAsShown`) can resize open meals on screen after something is logged;
  the card reads the served day, as the swap card does, so with a logged meal on an off-target day the row can show a
  different size from the card's. Same limit as the swap card.
- A copy held "until the strip ends" becomes an ordinary option after that date (the day swap's copies do the same).
- A leftover lunch made smaller becomes a smaller portion of the leftovers; the previous night still cooks both
  portions. Said on the card.
- Needs the `chat-gemini` deploy for the coach half.
