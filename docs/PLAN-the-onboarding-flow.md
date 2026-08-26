# The onboarding flow

## Context

Ashley asked for an honest opinion of onboarding: order, content, adaptivity,
whether the quick-reply buttons are ugly, whether the UX is good. This plan
is the buildable half of that answer.

**The verdict, so the rest of this is read in proportion: it is better than
most fitness onboarding and has one structural problem — the order.** The
buttons are fine. It collects roughly the right things. It asks them in a
sequence that puts the most load-bearing question last and nine food
questions in the middle.

### What is already right and is NOT touched here

- **Conversational, tap-or-type, with every answer editable later.** The
  opening line says so outright, which removes the fear of answering wrong.
  Most onboarding cannot do this.
- **A progress hairline rather than "Question 7 of 22"** — a counter turns a
  conversation back into a form, and the code already says so.
- **The option descriptions.** *"New to this, or coming back after a long
  break"* lets someone place themselves honestly instead of flatteringly,
  which is the hard part of an experience question.

### A correction that reshaped this plan

My first pass proposed two "obvious" adaptive skips — don't ask a
bodyweight trainee about training style, don't ask a conditioning trainee
about cardio. **Both are wrong, and measuring took two minutes:**

| claim | measured |
|---|---|
| style is inert for bodyweight | **4 styles → 4 different plans** |
| cardio preference is redundant for a conditioning goal | **3 prefs → 3 different plans** |

So this plan does not contain a list of questions I think are skippable. It
contains a **measurement** that decides which are, because the two I was
most confident about did not survive it.

## The build

### 1. Reorder — the one that actually matters

Today: name → goal → experience → **activity** → equipment → [lifts] → days
→ duration → recovery → cardio → style → injuries → **9 nutrition questions**
→ **age → height → weight → sex**.

Two faults:

**Body metrics are asked 20th–23rd, after nine food questions.** Those four
values drive every prescribed weight in the app — they are the reason it was
once caught fabricating a 50kg woman's loads for everybody. The most
load-bearing information is collected when attention is lowest and abandonment
most likely.

**Nine consecutive nutrition questions sit in the middle.** Someone who
downloaded a *training* app is seven questions deep into breakfast before
seeing a workout.

Proposed order:

```
name → goal → experience → equipment → [working lifts]
     → days → duration
     → age → height → weight → sex        ← moved up, before food
     → injuries
     → style → cardio → recovery
     → all nutrition
```

Rationale: everything needed to build a plan comes first, then the things
that shape it, then the things that decorate it. `ONBOARDING_SLOTS` is an
ordered array and `nextSlot` walks it, so this is a reordering of one literal
— but see §5, because the ordering is not as free as it looks.

### 2. Fix the stale comment on `recoveryCapacity`

The comment above it reads:

> *"Not required: measured to have zero effect anywhere in the generated plan
> (every option produces a byte-identical plan and mesocycle) — its only real
> consumer is a chat-greeting default."*

**Half of that is now false.** `RECOVERY_SET_MULTIPLIER` landed after the
comment was written. Re-measured on a stated profile — full_gym / intermediate
/ hypertrophy / 4 days / 45-60:

| | result |
|---|---|
| base week (`generateExercisePlan`) | **81 sets for all three** — comment correct |
| 16 weeks (`generateMesocycle`) | low **912** / moderate **1125** / high **1125** |

So "low" removes 213 sets — 19% of the block.

> **DENOMINATOR CHANGED.** An earlier note in this session quoted "58 sets vs
> 77 sets" for the same comparison. That was a different profile, and the two
> pairs of numbers are not comparable — do not read 912/1125 as a regression
> against 58/77. The figures above are the ones `report:slot-impact`
> reproduces, and the comment in the code now names the profile they came from.

The field is correctly `required: true`; the old comment read as an argument
for making it optional, which would have handed the most tired trainees the
most work.

**Found while measuring, flagged not fixed:** moderate and high produce a
byte-identical mesocycle despite distinct multipliers (0.9 vs 1.0) — the
difference is absorbed by set-count rounding. Three answers, two outcomes.
Whether high recovery should earn more volume than moderate is a training
call, not a bug.

### 3. Adaptivity, driven by measurement rather than instinct

New report, `npm run report:slot-impact`: for every slot with fixed options,
vary it across all values holding everything else constant, and count
distinct **mesocycle** outputs (not base plans — that is the distinction §2
turns on). Report per equipment tier, since a question can matter in a gym
and not at home.

**BUILT, and the result is the answer to "does it collect too much".**
`npm run report:slot-impact`, distinct 16-week mesocycles per equipment tier:

| slot | full_gym | home_gym | minimalist | bodyweight |
|---|---|---|---|---|
| `fitnessGoal` | 4 of 4 | 4 of 4 | 4 of 4 | 4 of 4 |
| `trainingExperience` | 4 of 4 | 4 of 4 | 4 of 4 | 4 of 4 |
| `sessionDuration` | 4 of 4 | 4 of 4 | 4 of 4 | 4 of 4 |
| `trainingStyle` | 4 of 4 | 4 of 4 | 4 of 4 | 4 of 4 |
| `trainingDays` (count) | 5 of 5 | 5 of 5 | 5 of 5 | 5 of 5 |
| `conditioningPreference` | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| `weightKg` | 3 of 3 | 3 of 3 | 3 of 3 | 2 of 3 |
| `recoveryCapacity` | 2 of 3 | 2 of 3 | 2 of 3 | 2 of 3 |
| `gender` | 2 of 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| `age` | 2 of 3 | 2 of 3 | 2 of 3 | **1 of 3** |
| `activityLevel` | **1 of 4** | **1 of 4** | **1 of 4** | **1 of 4** |
| `heightCm` | **1 of 3** | **1 of 3** | **1 of 3** | **1 of 3** |

**Candidates for cutting, after the nutrition filter: NONE.** All three inert
rows feed BMR or TDEE (`macro-calculator`'s `bodyMetrics()` returns null
without weight, height, age and sex, and every target goes blank), so cutting
any of them would blank somebody's calorie numbers.

Two design points the report had to get right:

**The seed is held FIXED across the variations of one slot.** Selection
carries a ±0.3 tie-break jitter; seeding per-variation would have made every
slot read 100% influential, because it would be measuring the seed.

**The nutrition caveat is attached by data, not by a special case.** The plan
originally singled out `activityLevel` as the one row not to misread.
`heightCm` reads 1-of-3 too, and would have appeared under a heading saying
"candidates for skipping" with no caveat at all.

### 4. ~~Trim two questions, and move them~~ — WRONG, AND WITHDRAWN

**This section was built, broke a gate, and was reverted. Left in place rather
than deleted, because the mistake is the useful part.**

It proposed moving `favoriteCuisines` and `breakfastStyle` out of onboarding
to first use in the Nutrition tab, on the reasoning that neither is structural
and neither belongs between downloading a training app and reaching a first
workout.

**They were already not being asked.** Both are in `NEVER_BLOCKING_SLOTS`, and
`ConversationalOnboarding` filters that list out of `trackedSlots` — the
questioning list. So the section was solving a problem that had been solved,
and the "fix" (deleting them from `ONBOARDING_SLOTS`) removed the only path by
which a volunteered answer could be *recorded*. The file says so directly:

> *"A never-blocking slot must STAY in the catalog the model receives, or a
> name (or cuisine, or breakfast style) offered later in the conversation
> could never be recorded — the whole point of demoting rather than
> deleting."*

**How I got it wrong:** I read the slot array, saw both questions in it, and
concluded they were being asked. I did not read `trackedSlots`, which is where
the questioning list is actually derived, three files away. The array is the
catalogue, not the queue — and this codebase had already written that
distinction down.

**Worth checking for the same error shape elsewhere:** any claim of the form
"the app asks X" that was reached by reading `ONBOARDING_SLOTS` alone.

Both slots are restored, at the end of the array, and `test:onboarding-order`
now fails by name if a `NEVER_BLOCKING_SLOTS` entry is deleted rather than
demoted — it surfaced the first time as a `TypeError` in an unrelated file.

### 5. The ordering constraint that makes this non-trivial

`ONBOARDING_SLOTS` is not a free list. `requiredIf` predicates read earlier
answers — `willBeLiftingBarbells` reads `equipment`, `knowsTheirLifts` reads
`knowsWorkingLifts`. A slot moved ABOVE its dependency silently becomes
inapplicable, and `isSlotApplicable` returns false rather than erroring, so
the question just never appears.

So the reorder needs a gate asserting **every `requiredIf` slot appears after
every slot it reads**, derived from the array rather than hand-listed. Without
it, a future reorder drops a question with no failure anywhere.

### 6. The buttons

**Not ugly — but bigger than they need to be, and one real risk.**

`OptionCard` is a bordered tile at `p-5` with a `text-3xl` emoji, a bold
label and a description. Four options fill a phone viewport. The `compact`
variant already exists and is the fix for the 4-option questions; adopting it
is a one-word change per call site.

> **CORRECTED WHILE BUILDING.** Two things above are wrong. There is one call
> site, not several, and `compact` is *derived* there rather than passed. More
> importantly, `compact` did two jobs at once — tighter padding **and no
> description** — because every existing compact caller happened to have no
> descriptions to show. So "adopt compact on the 4-option questions" would
> have deleted the option descriptions from goal, experience, activity and
> style: the exact lines this plan names above as one of the three things
> onboarding already gets right.
>
> Built as a split instead: `compact` is size, `showDescription` is content.
> Four-option questions tighten and keep their descriptions. A compact card
> that has a description also keeps its label at `text-sm`, since at `text-xs`
> the label and description are the same size and the card loses its headline.

**The emoji are the risk worth naming.** 🌱📈🎯🏅 render differently on every
platform and age badly. They do real work here — fast visual scanning — so
this is not a "rip them out" recommendation. It is the single thing most
likely to make the app read as cheap beside a polished competitor, and it
should be a deliberate decision rather than an inherited default.

`scale-[1.02]` on selection is a nice detail most apps miss. Keep.

## Verification — what was actually run

| check | result |
|---|---|
| `test:onboarding-order` (new, 17 checks) | **pass** — and it caught the plan's own dropped `activityLevel` before the reorder was applied |
| `test:onboarding-slots` | **pass** — it caught the §4 deletion |
| `test:audit` | **0 / 13,967** |
| 38 further gates | **all pass** (workout, added-load, band-slots, mesocycle- and logging-roundtrip, macro-split, injury-separation, no-forked-state, memory, diet-tag-sync, chat-app-reality, dashboard, slot-replacement, joint-tags, block-review, block-consistency, loadless-notes, load-suggestions, interval-prescription, block-rest-sizing, starting-out, tempo-prescription, training-week, coach-rules-sync, coach-promises, reply-guarantee, assumed-body, weight-basis, per-side-load, pattern-tags, rehab-prescribed, frozen-weeks, session-length, load-ceilings, ceiling-units, main-lift-rest) |
| `tsc -b` | clean |
| `npm run build` | see the commit message |

The engine is untouched by this round — the reorder changes the sequence
questions are asked in, not what any answer means — which is why `test:audit`
holding at 0 is the load-bearing number rather than a formality.

**NOT DONE, and it matters:** walking the flow in a browser for the three
personas. It was in this plan and is not in the build. The sandbox cannot
reach Supabase (`*.supabase.co` returns 403 at the network layer), so
onboarding cannot be driven end to end from here. A reorder that reads well in
an array can still feel wrong in sequence, and nobody has felt this one yet.

No migration. Frontend only, ships with the Vercel push.

## Out of scope, flagged

- **Replacing the emoji set.** Named in §6 as a decision to make, not made
  here — it is a visual-identity call and wants a designer, not a diff.
- **Reducing the 22 questions further.** The measurement in §3 is the input
  to that argument; making the cuts is a separate round once it exists.
- **Drop-off data.** Every claim here about where people abandon is
  reasoning, not evidence. The app has no funnel analytics, so "nine food
  questions is where drop-off happens" is a hypothesis — a plausible one, and
  still a hypothesis.
