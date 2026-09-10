# What the app must have — a capability contract for CLAUDE.md

**Status: draft for Ashley, 10 Sep 2026. Report only. Nothing built.**

## Why a list, and why the current one has not held

VISION.md already says the right things: the user must be able to change
the plan at three levels — an exercise, a day, the plan — from the screens
or the chat, and the three surfaces stay in sync. It is good prose, and
prose is the problem. Nothing checks it. So this week the app could swap an
exercise but hand back one with no weight; "missed" turned out to be
something the app *infers* after the date passes, not something a person
can *say*; and an exercise can be swapped or banned but not moved within a
session or dropped from one day. None of those contradicts VISION.md. All
of them fall through it.

The fix is not more prose. It is a **contract**: a flat list of things the
user can do, each written with the rule that must hold when they do it and
the check that proves it still works — or an honest MISSING / UNGUARDED
where there is none. A session then runs every change against it in both
directions: *does this feature support every operation at its grain?* and
*did this change quietly lose one?*

## Where it lives — the one decision that is hers

- **A. A short section inside CLAUDE.md (recommended).** CLAUDE.md is the
  only file every session reads without being told to. Kept to roughly
  sixty lines: one line per capability, a gate name or MISSING at the end
  of each. VISION.md keeps the *why*; CLAUDE.md holds the *what, and how we
  know*.
- **B. A separate MUST.md, linked from CLAUDE.md.** Cleaner, room for
  detail — and a linked file is a file a session can skip, which is exactly
  how the existing prose got skipped.
- **C. Expand VISION.md's "User control" section.** No new file, but
  VISION.md is narrative and is not loaded every session.

Recommendation: A. The whole point is that it cannot be missed.

## The shape of one line

    <what the user can do> · <from where: screen / coach / both> ·
    <the rule that must hold> · <proof: gate name, or UNGUARDED, or MISSING>

Three states, never blurred: **exists and gated**, **exists but unguarded**,
**missing**. A capability is not "had" because someone remembers building
it. It is had when a check would fail if it went away.

## The contract — first draft, to be audited line by line

Marks below are my reading from today's inventory of the code and the coach's
tool list. They are LEADS, not facts, until the audit in the next step
re-measures each one.

### 1. The plan itself
- Tailored to this person: goal, experience, equipment, injuries, training
  days, session length, style, recovery, other sports — never a template.
- Periodised in blocks, with a calibration week for someone whose weights
  are unknown and a deload that is lighter than the week before it.
- Every loaded lift carries a weight, in the right unit for the implement,
  under a ceiling that warns before it clamps.
- A time cap is kept: ask for 60 minutes, get roughly 60.
- The plan follows the profile: change equipment, injuries, days, length,
  style or goal and the plan is rebuilt — proposed, confirmed, never silent.

### 2. Changing one exercise
- Replace it — for today, or for the rest of the block. Alternatives must be
  real: on other equipment, and a loaded lift is never replaced by an
  unloaded one by default. *(exists, gated — swap-request, slot-replacement-hygiene, single-implement)*
- Ban it — gone from every future plan. *(exists, gated)*
- Add one to a session, as part of the plan and not just as a logged extra.
  *(partial — "unplanned work" logs it; it does not join the plan)*
- Remove it from one session without banning it. *(MISSING)*
- Move it earlier or later within the session. *(MISSING)*
- Every one of the above from the screen AND by asking the coach. *(swap and
  ban: both; add, remove, move: neither)*

### 3. Changing one workout
- Move it to another day, and it leaves today on every screen. *(exists, gated — session-move, moved-session)*
- Say "I missed it" — and have the app treat it as missed rather than
  guess. *(MISSING as an action — today "missed" is inferred once the date
  passes; the person cannot say it, correct it, or distinguish "missed" from
  "did it elsewhere")*
- Say "I did it, just not in the app." *(exists — history logging; parity to check)*
- Make today a rest day. *(exists, gated — rest-day-race)*
- Swap the session for an activity — a run, a class. *(exists)*
- Shorten or lighten today without changing the plan. *(partial — volume
  toggle; not "make today 30 minutes")*
- Change what is in today's session — its exercises, sets — for today only.
  *(MISSING as a whole; only via swapping each exercise)*
- Every one of the above from the screen AND by asking the coach.

### 4. Changing the whole plan
- Start a new plan when circumstances change. *(exists)*
- Change training days, session length, equipment, injuries, goal, style,
  volume — each one proposed and confirmed, then applied everywhere. *(exists
  for most — audit which have both surfaces and which are gated)*
- Weights actually lifted flow into the printed plan: automatically from a
  calibration week, by offer afterwards. *(exists, gated — calibration-search, beat-target, logged-reanchor)*
- Nothing recorded is ever lost by any of the above. *(exists, gated — diary-preservation)*

### 5. Logging what happened
- Sets, reps, weight — one-handed, in seconds, mid-session; bodyweight and
  added-load lifts in their own terms. *(exists, gated)*
- Correct or delete a set; undo a coach action. *(exists, gated — correction-loop, log-correction)*
- Warm-up steps as place-keepers, never as data. *(exists, gated — ramp-ticks)*
- A write that fails says so; nothing is silently dropped. *(exists, gated — dead-letter checks)*
- Steps, water, weight, meals, historical sessions. *(exists)*

### 6. Progression
- Next week reacts to what was logged, and the person can see that it did.
- Never silently downward. A deload stays a deload. A re-anchor is
  automatic only from calibration; offered every week after.
- The three surfaces agree on the number: today's card, the program view,
  the coach. *(gated in parts — coach-plan-context, week-load-consistency)*

### 7. The coach
- Anything the screens can do, the coach can be asked to do — and the
  reverse. A screen action without a coach tool (or a coach tool without a
  screen) is a listed exception with a reason, not an oversight.
- It proposes and confirms; it never applies silently.
- It never claims to have done something it did not do, never describes a
  control that does not exist, and says plainly when it cannot.
- It asks before prescribing; it is a person, not a menu.

### 8. Nutrition
- Targets from the profile, moving with a seven-day weight average and
  explained when they move.
- Meals that fit the targets; swap one, regenerate one, build a custom one,
  log one; dislikes respected; allergens filtered with honest limits.
- A grocery list that follows the meals.

### 9. Rules that hold across all of it
- A change made anywhere shows everywhere: today, the program, Home, the
  coach.
- History is permanent.
- Nothing is offered that is not built.
- Safety — allergens, injuries, loads — ships correct or not at all.
- It works on a phone, one-handed, on a gym floor.

## The rules that make the list bite — to sit beside it in CLAUDE.md

1. **A grain is whole or it is named as not.** A feature that touches a grain
   (an exercise, a workout, the plan) supports every operation listed for
   that grain, or the report says which ones it does not and why.
2. **A line is not "had" until a gate proves it.** Anything without one is
   written UNGUARDED, and stays so in the file until a check exists — never
   silently upgraded to done.
3. **Parity is checked both ways.** A new screen action gets a coach tool or
   a named exception; a new coach tool gets a screen path or a named
   exception.
4. **The list is a lead, not a fact.** When a line turns out wrong, correct
   it where it sits and say so in BACKLOG — the same rule as every other
   written finding.
5. **Adding to the list is cheap; removing from it is a decision.** Ashley's,
   recorded.

## What happens next, in order — none of it builds anything

1. **Ashley picks the home (A / B / C) and adds what I have missed.** The
   categories above are my reading of what "must have" means; the product is
   hers. Anything she expects the app to do that is not on this page is the
   most valuable line to add.
2. **Audit, report only.** One pass over every line, re-measured in the code
   and — where it is something a person sees — in the browser at phone size:
   exists / unguarded / missing, and which surfaces. The draft marks above
   are replaced by measured ones. Output: the finished section, ready to
   paste, plus a short list of the MISSING and UNGUARDED lines.
3. **Ashley reads the MISSING list and decides what becomes work.** Each one
   is a product decision (does "mark as missed" also offer to move it? can an
   exercise be added to the plan from the chat?) and gets its own plan
   before any build — the usual bar.
4. **Then, and only then, CLAUDE.md is edited** — the section and the five
   rules — and pushed.

## What this deliberately is not

- Not a roadmap. It says what must be true, not when.
- Not a second copy of VISION.md. Where VISION.md explains, this one lists
  and points at proof.
- Not finished by me. The categories are a scaffold; the completeness comes
  from her.
