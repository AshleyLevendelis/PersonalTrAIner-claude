# The profile saves eight answers and never reads them back

**Status: PLAN ONLY. Nothing built.** Two of the eight change prescribed
loads and three change calorie/macro targets, so this goes through a plan
first.

Found while adding `daily_step_target` and checking I was not about to repeat
a shape that already existed.

---

## The mechanism, in one sentence

`App.tsx`'s `restoreSession` rebuilds the profile **column by column** — 42
hand-written lines — and anything missing from that list is `undefined` for
the entire session, however faithfully Postgres stored it.

## What is actually being forgotten

Audited by parsing every `fitness_profiles` column out of the migrations and
diffing against the keys `restoreSession` assigns: **51 columns, 42 restored,
9 dropped.** Eight of the nine have live consumers.

| forgotten | read by | what the user sees |
|---|---|---|
| `max_dumbbell_kg` | `load-prescription`, `load-ceiling-prompt` | asked again every session; stated ceiling never applies |
| `max_single_implement_kg` | same | same |
| `max_improvised_kg` | same | same |
| `load_ceilings_declined` | `load-ceiling-prompt` | **"I'm not sure" never sticks** |
| `macro_split_preset` | `macro-calculator`, `MacroSplitCard` | split silently reverts to Balanced |
| `macro_protein_per_kg` | same | custom protein target lost |
| `macro_fat_percent` | same | custom fat target lost |
| `water_target_ml` | `dashboard-data`, `NutritionDisplay` | reverts to 2000ml |
| `training_time_preference` | **nothing** | dead column — see below |

All eight live ones are genuinely **written**: `water-store.ts`,
`load-ceiling-prompt.ts:167`, and `handleMacroSplitChange` → `updateProfileField`
all persist correctly. Only the read-back is missing. Nothing is corrupt in
the database; the app just cannot see it.

## Why the decline is the sharpest one

`load-ceiling-prompt.ts` stops asking only when
`p.load_ceilings_declined === true`. That value is never restored, so it is
always `undefined`. `ceilingHandled` in `TodayPanel` is `useState(false)`, so
it resets on every mount.

Net effect: someone who taps **"I'm not sure"** — the button that exists
specifically to stop the asking — is asked again the next time they open the
app, and every time after that. The function's own comment says:

> *A trainee who says "I don't know what my dumbbells weigh" must be able to
> say it once.*

The mechanism defeats its own stated purpose.

## Why the macro one may be worse

The ceilings **re-ask**, which is annoying and visible. The macro split
**silently changes numbers**. Someone who picks "Higher protein" gets it for
that session; on the next open, `macro_split_preset` is `undefined`,
`macro-calculator.ts:245` falls back to `?? 'balanced'`, and their protein
target quietly moves. Nothing tells them. They would have to notice the
number themselves.

`water_target_ml ?? 2000` is the same shape, lower stakes.

## Why this needs a plan rather than just eight lines

Restoring the three ceilings **changes prescribed weights** for anyone who
ever stated one — that is the point, but it is still a load change and it
lands without warning on the next plan render. Worth deciding: does an
already-generated plan get rebuilt against the newly-visible ceiling, or does
the ceiling apply only from the next generation onward? The second is
quieter; the first is more correct.

**DECIDED — Ashley, 28 Aug 2026: rebuild the plan against it.**

Chosen over "apply from the next plan onward" (anyone mid-plan keeps getting
weights they cannot load, for up to sixteen weeks) and over a
propose-then-confirm card (nothing moves without a yes, but it is another
card to deal with on open).

Two things follow from that choice and belong in the build:

- **Reuse `rebuildForWeightBasis`**, not a second rebuild path. It already
  exists for exactly this shape — a fact about the trainee's real equipment
  becoming known after the plan was built.
- **The coach has to say why.** Weights visibly changing on open, with no
  explanation, is the app moving numbers under someone. The existing
  adaptation banner is the surface: it already speaks when a plan changes,
  and this is a plan change.

Direction matters and is worth asserting rather than assuming: restoring a
real ceiling should move loads **DOWN** for affected users, never up. A
ceiling is a cap. If the after-numbers go up anywhere, something is wrong
with the fix rather than with the old behaviour.

Restoring the macro fields **changes calorie and macro targets** for anyone
who set a custom split — again correct, again a number moving without being
asked for.

## Proposed build

1. **A gate first, before any fix.** The audit above — parse the migrations
   for `fitness_profiles` columns, diff against `restoreSession`'s assigned
   keys, fail on any column that has a consumer and no restore line. Written
   first so it is seen to fail, then seen to pass. Without it the ninth
   forgotten column arrives the same way these did.
2. Restore the eight, each with the same "absent is not zero" care the rest of
   that function already shows (`Number(null)` is `0`, and the comment at the
   top of `restoreSession` exists because that exact bug shipped once).
3. `training_time_preference` has **no consumers at all** — neither restore it
   nor pretend it matters. Either delete the column in a migration or record
   why it is kept. Not silently mapped, which would make it look load-bearing.
4. Decide the load question above, and if plans rebuild, reuse the existing
   `rebuildForWeightBasis` path rather than inventing a second one.
5. Re-run `test:audit` and `test:quality` and report the deltas — restoring
   real ceilings should move loads DOWN for affected users, never up.

## What is NOT in scope

- Rewriting `restoreSession` as a generic mapper. It is explicit on purpose:
  several fields need real coercion (`Number(null)` is `0`, not `undefined`),
  and a spread would reintroduce the fabricated-measurement bug its own
  comment documents. The gate is the durable fix, not cleverness.
- The `?? 2000` and `?? 'balanced'` fallbacks themselves. They are correct for
  a user who genuinely never set one; the bug is that the app cannot tell that
  user apart from one who did.
