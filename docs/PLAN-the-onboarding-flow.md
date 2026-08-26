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

**Half of that is now false.** Measured today:

| | distinct outputs |
|---|---|
| base week (`generateExercisePlan`) | 1 of 3 — comment correct |
| full 16-week build (`generateMesocycle`) | **58 sets vs 77 sets**, low vs high |

`RECOVERY_SET_MULTIPLIER` landed after that comment was written. The field is
correctly `required: true`; the comment now argues for making it optional,
which would quietly hand tired trainees a third more volume. Rewrite it with
both numbers so the next reader cannot make that mistake.

### 3. Adaptivity, driven by measurement rather than instinct

New report, `npm run report:slot-impact`: for every slot with fixed options,
vary it across all values holding everything else constant, and count
distinct **mesocycle** outputs (not base plans — that is the distinction §2
turns on). Report per equipment tier, since a question can matter in a gym
and not at home.

Already measured, as the starting table:

| slot | distinct training outputs |
|---|---|
| `activityLevel` | **1 of 4** — no training effect at all; it drives TDEE |
| `recoveryCapacity` | 1 base / **2+ mesocycle** |
| `conditioningPreference` | 3 of 3 |
| `trainingStyle` | 4 of 4 |
| `fitnessGoal` | 4 of 4 |
| `trainingExperience` | 4 of 4 |

Only slots the report shows inert *for a given tier* become candidates for
skipping, and each skip is then a separate, argued decision — not a batch.

**`activityLevel` is not a candidate despite reading 1**: it is a nutrition
input, and the report only measures training. The report must say which half
it measures, or it will be misread exactly the way the `recoveryCapacity`
comment was.

### 4. Trim two questions, and move them

`favoriteCuisines` and `breakfastStyle` are personalisation, not structure.
Neither belongs in the path between download and first workout. Move both out
of onboarding and ask them in the Nutrition tab, the first time meal plans
are actually opened — the same "ask at first use" principle Ashley chose for
load ceilings.

This is a judgement, not a measurement: both genuinely feed meal generation,
so the argument is about *placement*, not value.

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

**The emoji are the risk worth naming.** 🌱📈🎯🏅 render differently on every
platform and age badly. They do real work here — fast visual scanning — so
this is not a "rip them out" recommendation. It is the single thing most
likely to make the app read as cheap beside a polished competitor, and it
should be a deliberate decision rather than an inherited default.

`scale-[1.02]` on selection is a nice detail most apps miss. Keep.

## Verification

- **New gate `test:onboarding-order`**: every `requiredIf` slot follows its
  dependency; body metrics precede all nutrition slots; the required set still
  gates completion; and a profile built from the new order produces the same
  plan as one built from the old (a reorder must change nothing but sequence).
- **`report:slot-impact` before/after**, stating which half — training or
  nutrition — it measures.
- `test:audit` 0 / 13,967, and the existing onboarding gates.
- **Walk the flow in the browser** for three personas — bodyweight beginner,
  full-gym intermediate, minimalist with an injury — and count taps to a plan.
  A reorder that reads well in an array can still feel wrong in sequence.
- No migration. Frontend only, ships with the Vercel push.

## Out of scope, flagged

- **Replacing the emoji set.** Named in §6 as a decision to make, not made
  here — it is a visual-identity call and wants a designer, not a diff.
- **Reducing the 22 questions further.** The measurement in §3 is the input
  to that argument; making the cuts is a separate round once it exists.
- **Drop-off data.** Every claim here about where people abandon is
  reasoning, not evidence. The app has no funnel analytics, so "nine food
  questions is where drop-off happens" is a hypothesis — a plausible one, and
  still a hypothesis.
