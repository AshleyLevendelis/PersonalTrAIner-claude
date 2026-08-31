# The welcome message after onboarding — plan

**Status: PLAN ONLY. Not built.** Ashley asked to plan it.

## The brief

Welcome the user, say a little about how the plan is structured and how they
begin, make clear they can ask anything about health and fitness. Friendly and
welcoming, but informative.

## Two things this collides with, flagged rather than quietly worked around

### 1. It reverses a ruling of hers, recorded in the file

`first-run-intro.ts` says, in as many words: *"The FIRST message a brand-new
user ever sees in the coach chat — and, since Ashley's call, the only one. IT
USED TO BE FOUR... She read it on a real phone and cut it to one: 'we dont need
to say that much and it could be 1 message.'"*

The brief above is asking for roughly what was cut. That is entirely hers to
change — the earlier call was made against copy she disliked for other reasons
too — but it should be a deliberate reversal, not an accident. **This is the
one question that needs her answer before anything is written.**

Two of the three cut messages should stay cut regardless:

- *"I'm your coach. Good to meet you."* — the header already says who is
  talking, permanently.
- *"Talk to me like you'd talk to a person."* — her own objection, and the
  right one: *"as far as the user is concerned it is a person, so I dont like
  this wording."* Naming the thing it is pretending not to be breaks it.
- *"Nothing moves without your say-so"* — kept, but moved to the onboarding
  opener. Repeating it here made it read as a disclaimer rather than a promise.

### 2. The tour already does part of this job

The capabilities pitch was cut for a reason that still holds: the
post-onboarding tour demonstrates each capability on the real screen at the
moment it makes sense. Its last step lands in chat and says *"this is where we
talk. Anything you'd tell a coach — a heavy day, a food you hate, a sore
shoulder — just say it."*

**But the tour is skippable**, and its own first step says so. Someone who
skips gets none of it. So the open-door line belongs in the message; a
feature LIST still does not.

## What may honestly be claimed

24 coach tools, 23 of which act. Workout logging, exercise swaps, volume,
training days, rest days, injuries (adapt / lasting / recovered), equipment
changes, meal swaps and additions, grocery list, water, weight, and
remembering preferences and goals. Nutrition, supplement and recovery
questions are explicitly in scope and answered directly.

**`log_meal` is the exception — it still declines.** So the message must not
say "log your meals" or anything that implies it. Every other claim maps to a
shipped mechanism, which is the standing rule for this copy.

## Draft — three short messages

Numbers in braces are read off the generated plan, never invented; an absent
value drops its clause rather than guessing (the rule the existing opener and
`planShapeFromMesocycle` already follow).

**1 — welcome, and what they now have**

> Hey {name} — welcome aboard. Your plan's built: {16} weeks in {4} blocks,
> and it's yours to change whenever it stops fitting.

**2 — how it's structured, and how it begins**

> Each block has a job. {You'll start light on purpose while we find your
> working weights, then} the loads climb, and every block ends with an easier
> week so the work actually sticks. I'll tell you each time it changes — you
> won't have to go looking.

**3 — day one, and the open door** (chips attach here)

> Day one is {today}: {Full Body Power — Goblet Squat, Dumbbell Press,
> Romanian Deadlift}. And anything you're wondering about — training, food,
> sleep, a niggle that won't shift — just ask.

Day one keeps its three existing branches (today / ready when you are / named
day / no session at all), which are already built and gated.

## Alternative — two messages

Merge 1 and 2. Shorter, closer to her original ruling, loses the beat between
"here's what you have" and "here's how it works".

## Verification

- `render:screens` at 412px before shipping. Line counts measured, not
  guessed — the one-sentence version added four lines and that was checked.
- `test:coach-promises` §6: every chip must land on a tool that acts, and the
  chips must sit on the LAST message or they silently do not render.
- A new check: the copy claims nothing `log_meal`-shaped.
- The "like a person" phrasing stays banned by the existing gate.
