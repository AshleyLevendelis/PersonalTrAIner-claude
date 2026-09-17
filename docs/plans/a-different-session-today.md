# A different session today — keeping the lift that carries your progression

**Ashley, 16 Sep 2026**, choosing this from three pieces of work, then ruling on
the one question it could not be built without.

## Why this exists

Every other way of changing a session already exists on both surfaces: swap one
exercise, remove one, move one, add one, shorten the day, make it lighter, move
it to another day, swap it for an activity. The one thing you cannot say is
**"give me a different session today"**.

CLAUDE.md carried it as `MISSING` with three reasons. **Two of them are wrong,
measured 16 Sep 2026, and saying so is half the value of this document:**

- *"Nothing regenerates below a whole week."* True of `generateMesocycle`, and
  irrelevant. `swapExerciseInMesocycle`, `addExerciseToSession` and
  `removeExerciseFromSession` all change ONE DAY of a live mesocycle today.
- *"The one function that assembles a day is private with fifteen parameters
  including the cross-day dedupe set."* `selectExercisesForTrack` has fourteen
  parameters and this build never calls it. The dedupe set is not lost either —
  what is already on the day, and what appeared elsewhere this week, is readable
  straight off the mesocycle.
- *"The cheap route picks that day without knowing what the rest of the week now
  holds, so it can hand you the same exercise twice."* True of the cheap route
  — regenerate the week, keep one day — which is why this does not take it.

**This composes the SWAP path, once per slot.** Everything that makes a swap
safe — equipment filtering, injury filtering, the exclusions list, load
prescription off your logged history, the shared settling tail — is inherited
rather than reimplemented. A rebuild is not a new kind of change to the plan; it
is several of the change the app already makes.

## Her ruling

**"Keep it, rebuild around it"** — over asking each time, and over rebuilding the
whole session including the main lift.

You still do today's main lift, at the weight and sets already prescribed. Your
progression on it is untouched. Everything else in the session changes.

Two reasons this was the recommendation, both recorded because they will apply
again:

1. **It matches the ruling already made for shortening a session** (13 Sep 2026:
   *protect the main lift and drop accessories*). The two "change today" verbs
   now treat the main lift the same way, so the app has one position on it
   rather than two.
2. **The escape hatch already exists.** If the main lift itself is what you want
   gone, swapping it on its own is a thing you can already do, from both
   surfaces. Refusing to touch it here costs nothing that is not available one
   tap away.

## What it does

`rebuildDayAroundMainLift(mesocycle, profile, weekNumber, dayName, exclusions)`,
in `src/lib/session-rebuild.ts` — a new leaf beside the other session edits.

1. Find the day. Refuse plainly if it is a rest day, has no session, or holds
   nothing but the main lift (there is nothing to rebuild).
2. Hold back every slot where `isMainLiftSlot` is true — the shared definition,
   the same one `beat-target-offer` and `block-review` use.
3. For each remaining slot, in order: ask `getReplacementCandidates` for that
   slot's alternatives, and take the best one that is **not** already on the day
   and **not** already used elsewhere this week. Both sets are built from the
   live mesocycle before the first replacement, and grown as replacements land,
   so the rebuild cannot hand you the same exercise twice.
4. Price each new slot with `recomputeLoad` — the same async path a swap uses,
   so a lift you have logged keeps its progression and a new one is prescribed
   from scratch with the honest "find your working weight" basis.
5. Apply with `applyReplacement`, then run the shared settling tail
   (`settleWeek`) exactly as every other in-place edit does: set hierarchy, one
   weight per lift, load coherence, a warm-up rebuilt from what the day now
   holds, and the week-level balance pass.
6. Return what changed, what it could not change and why — a slot with no
   eligible alternative KEEPS its exercise and is named, never silently left
   looking rebuilt.

**Scope is TODAY only.** This is a today-verb like shortening; it writes one
week through `saveScopedEdit(..., 'today')` and never reaches the rest of the
block.

## What it must not do

- Never touch the main lift's exercise, sets, reps or weight.
- Never drop below `MIN_EXERCISES_PER_SESSION`; a slot it cannot replace is kept.
- Never claim to have rebuilt a slot it did not.
- Never run on a rest day, a moved day, or a day already logged against — a
  session you have started is not a session to redraw underneath you.

## Both surfaces

Rule 1 and rule 4: a grain is whole or it is named as not.

- **Screen** — in today's card, behind the "⋮" menu with the other plan changes
  (her 14 Sep ruling: every change to the session lives in that menu).
- **Coach** — `propose_session_rebuild`, a courier like the others: no server
  write, raw args forwarded, the client builds the diff and the card, nothing
  happens until Confirm.

The coach half needs one `chat-gemini` deploy. The screen half does not.

## The gates

- **new** `test:session-rebuild` — the main lift survives untouched; no
  duplicate lands on the day or against this week; a slot with no alternative is
  kept AND named; refusals on rest days, empty days and main-lift-only days; the
  settling tail ran (handed a day that already breaks set hierarchy, it comes
  back fixed); scope reaches one week and no more.
- `edit-keeps-the-bar` extended: the rebuilt day is re-scored like every other
  edit path, against the same floor.
- `coach-parity` — the new tool has a screen path, so neither count moves.
- **new** `verify:session-rebuild` — driven on a real screen at phone size,
  because a browser driver finds what no source check can.

Every new check mutation-tested, with the count reported.

## Verification

1. The new gates, each mutation-tested.
2. `npx tsc --noEmit` clean — which covers `src` only, so the gate is proven by
   running it.
3. The affected gates individually, then a full sweep.
4. A real screen at 390x844, before and after, read as a screenshot.
5. The three report artifacts reverted before committing.

## Deploys

Frontend on merge. **One `chat-gemini` deploy** for the coach half — which joins
the deploy already waiting, rather than adding a second.
