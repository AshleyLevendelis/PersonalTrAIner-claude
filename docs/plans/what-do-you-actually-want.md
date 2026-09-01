# What do you actually want — intent, not a desk job

**Status: PLAN. Not built.** Ashley, 2 Sep 2026, on being asked when strength
work should start for a beginner: *"it depends. we need to capture what the
user wants. is this someone who just wants to be a bit more active or someone
who wants to start exercising in a gym with weights"*. She then chose, of four
options, **"only when it can't tell"** — ask only where the answers they have
already given do not settle it.

Touches what a deconditioned beginner is prescribed, so it gets a plan first
(CLAUDE.md).

## The defect this fixes, measured

`isStartingOut` is `training_experience === 'beginner' && activity_level ===
'sedentary'`. Nothing else. Measured 2 Sep 2026 on a generated plan:

| Profile | Result |
|---|---|
| beginner · **sedentary** · **full gym** · **"Muscle growth — build size & strength"** | **0 exercises.** Walk / Walk / Walk |
| beginner · moderately active · full gym · muscle growth | 16 exercises, Full Body Power ×3 |

The same person, having said they have a full gym and want to build muscle,
gets sixteen weeks of walking — and the only thing that decided it was this
question:

> **How active is your day-to-day, outside training?**
> 🪑 **Sedentary** — *"Desk job, little movement outside training"*

That is a question about their JOB, for computing TDEE. Its own description
presupposes they train. Anyone with an office job answers it honestly and is
silently rerouted, overriding the two answers that actually stated intent.

## The rule

**Goal is the intent signal. Activity level goes back to being about the day
job.** Equipment says what someone CAN do, not whether they want to; goal is
the only question that asks what they're after.

For a `beginner` + `sedentary` profile only — nobody else's plan changes:

| Their goal | Verdict |
|---|---|
| 💪 Muscle growth — *build size & strength* | **Train.** They said it. No question. |
| ⚡ Functional strength — *move better, lift heavier* | **Train.** Same. |
| 🔥 Fat loss | **Ask** — true of a walker and a lifter alike. |
| ❤️ Conditioning | **Ask** — same. |

So the walking prescription survives exactly where it was aimed (someone
deconditioned who has not asked to lift), and stops capturing people who have.

## The new question

Shown only in the ask row above — a conditional slot, the same mechanism
`knowsWorkingLifts` already uses (`requiredIf`). It sits after `equipment`
(slot order today: goal → experience → activity → equipment), so every input
it depends on is answered.

> **Where do you want to start?**
> 🚶 **Get moving first** — walks and easy activity, building up week by week
> 🏋️ **Straight into training** — proper sessions from week one

`startingOut` becomes: beginner AND sedentary AND (goal is fat_loss or
conditioning) AND they picked "Get moving first". Everything downstream —
`applyStartingOut`, the walk ramp, the activity-only copy — is untouched.

## What must not regress

- A beginner+sedentary+fat_loss user who picks "Get moving first" still gets
  the identical walking plan: same minutes, same ramp, same copy.
- Nobody outside beginner+sedentary is asked, and no other profile's plan moves.
- `test:says-what-it-contains` and `test:week-note` still pass — the walking
  path still exists and is still described honestly.
- The audit's activity-level sweep still generates walking plans (it would
  now need the new answer set, or it stops covering the branch at all —
  the sweep must be updated in the same change, or it silently stops testing
  what it was just widened to test).

## Open, and deliberately not decided here

Whether "Get moving first" should later graduate into strength work at some
block. That is the question Ashley was originally asked and did not answer,
because this one came first: the app cannot sensibly decide when to add
weights until it knows whether the person wants them at all.
