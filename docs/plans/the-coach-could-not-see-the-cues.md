# The coach can see the app — Ashley's "fix it", 5 Sep 2026

## Context

At the end of the previous piece of work I flagged that the coach answers
technique questions from the model's general knowledge while the app holds 801
curated form cues for the same lifts. Ashley: **"fix it."**

Measured, not assumed: `form_cues` had **exactly one reader in the whole repo**
— `ExerciseDetailDialog.tsx`. Not a prompt, not a context builder, not the edge
function. So "how do I deadlift?" in chat and "How to do it" on the Exercise tab
answered from two different sources, and could disagree with nothing to catch
it.

**This is the third time the same hole has been patched here**, which is why
the gate asserts an invariant rather than a string:

1. `test-coach-sees-ingredients.ts` exists because the coach told Ashley "none
   of your scheduled meals actually contain almond butter" about a breakfast
   holding 13g of it. Its header names the shape: *"Two readers of the same
   data, one right and one blind."*
2. `describeExerciseForCoach`'s own header records the second: intensity and
   tempo were withheld, leaving the coach *"unable to answer 'how hard should
   the push-ups be?' about a number on the next screen."*
3. Now the cues.

## A second defect, and part of it was mine

While researching, `APP_REALITY` — the coach's map of the app, prefaced *"This
is the complete, current list. Nothing outside it exists"* — turned out to say:

> Dashboard: today's calorie/macro rings, water logging, **step-count
> logging**, weigh-in, streak, recent PR, coach tip.

Water moved to Nutrition weeks ago. Steps moved to Nutrition weeks ago and to
**Exercise this morning, in my own commit `1a01747`**. So "where do I log my
steps?" confidently sent people to a tab with no logger on it, and my change
made it wronger. The block also never mentioned the technique screen that
commit `908ecfc` rebuilt hours earlier.

**And every check in `test:chat-app-reality` was green through all of it** —
verified by running it before touching anything. It only ever asserted that
each tab was *named*. Meanwhile `test:tab-ownership` was correctly asserting
Home logs no steps. Two gates, two contradictory pictures of one app, both
passing.

## What was built

**`src/lib/exercise-technique.ts`** — a near-copy of `meal-ingredients.ts`,
deliberately, because that is the shape that worked: an explicit cap
(`MAX_TECHNIQUE_EXERCISES = 40`), an announced `+N more not listed` tail rather
than silent truncation, and absence stated in words rather than an empty
bracket. Appended by `buildCoachExerciseSummary` as a deduplicated block, so a
lift programmed twice a week does not carry its cues twice.

**Context injection, not a tool.** `chat-gemini` makes exactly one
`generateContent` call and every tool branch is terminal — there is no leg that
could hand a lookup back to the model and let it keep talking. A tool would
have been new mechanism plus a second billed call under a cap that counts
requests, not calls; the prompt also forbids function calls for technique
questions outright.

**The prompt** gained a block saying the cues are the app's own coaching, the
same words on the Exercise tab, to be used and never contradicted — placed
after the "@ clause" explainer and deliberately *not* between the two anchors
whose ordering `test-log-correction.ts:222` pins.

**`APP_REALITY`**, in both byte-identical copies: water credited to Nutrition,
steps to Exercise, and the technique screen named.

## The bound, measured

| scope | distinct exercises | size |
|---|---|---|
| one week (what is sent) | 26–30 | ~4.4 KB, **~1,100 tokens** |
| whole 16-week mesocycle | 66 | ~8.7 KB |
| whole catalogue | 199 | ~28 KB, ~7,000 tokens |

The week is what someone asks about mid-session, matches the food precedent
(which sends *today's* meals), and leaves the full `exercise_summary` at ~7 KB
against a 256 KB request cap.

## Gates

- **New `test:coach-sees-technique`**, on the ingredients gate's invariant:
  anything the How-to tab can show for an exercise in the user's plan must
  appear in the text the coach is given. Run against **97 distinct exercises
  from four real generated configurations**, not fixtures — a hand-written
  fixture only ever contains lifts someone remembered.
- **`test:chat-app-reality`** gained §1b, which ties each capability claim to
  the code that provides it: the tab credited with step logging must be the tab
  whose component calls `logStepsManual`, and no other tab may claim it. The
  next time a control moves, the gate moves with it or goes red.
- **`test:coach-plan-context` §6** extended, per its own title — *"the prompt
  teaches every form the builder can emit"*.

**Six mutations, each confirmed to apply:** cues never reach the payload;
truncation made silent; the block appended unconditionally (which also breaks
`test:log-correction`'s literal `buildCoachExerciseSummary({days: []}) === ''`
contract); APP_REALITY reverted to crediting the Dashboard; only one of the two
APP_REALITY copies edited; the prompt stops teaching the block.

## Verification

`tsc`, `npm run build`, and 19 gates green including all six coach gates, which
were baselined green before any edit. `test:audit` and `test:quality` untouched
— no generation path is involved.

**Cannot be proven from the sandbox:** the coach actually using the cues in a
reply. That needs the deployed function and a live model. What is provable, and
proven, is that the cues reach the payload and that every lift the engine can
prescribe is describable.

**Needs a deploy to take effect:** `npm run deploy:functions:prod -- chat-gemini`.
Until then the client sends the cues and the deployed prompt ignores them — no
regression, no benefit yet.

## Flagged

The coach still cannot *log* steps ("I walked 9,000 steps today"). This makes it
describe where steps live correctly; it does not give it a tool to write them.
Still not asked for, still not built.
