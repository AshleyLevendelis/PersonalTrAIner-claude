# What the app must have — a capability contract for CLAUDE.md

**Status: draft 2 for Ashley, 10 Sep 2026. Report only. Nothing built.**

## The point of the app, in her words — the spine of the whole list

Ashley, 10 Sep 2026: *"we create best in class, professional meal and
exercise plans which can be adjusted to fit the user's needs while still
aiming to keep the quality. everything that can be done within the app is
able to be done by the user or by asking the ai chat. also the ai chat acts
as a professional personal trainer who gives best in class health, nutrition
and fitness advice."*

That is three promises, and every line below hangs off one of them:

1. **Best-in-class plans — exercise AND meals — that stay best-in-class when
   changed.** Adjustment is not permission to degrade. Quality is measured,
   and an adjustment that would break it is said, not silently allowed.
2. **Everything the app can do, the user can do by hand OR by asking.** Not
   just plan changes — everything. Exceptions are a short list, each with a
   reason, and the list is hers.
3. **The coach is a professional trainer and nutritionist.** Not a menu with
   manners: advice that is accurate, current, specific to this person's plan,
   logs and injuries, and honest about where a professional's judgement takes
   over from the app's.

Draft 1 had the mechanics of all three and the substance of only the first
half of the first. What it under-covered, and what this draft adds: meals
were three bullets while exercise had a grain-by-grain treatment; "keep the
quality while adjusting" was implied, never stated as a rule with a measure;
the coach section covered how the coach *behaves* and said nothing about how
*good its advice is* — which is the hardest promise to check and therefore
the one most likely to slip.

## Why a list, and why the current prose has not held

VISION.md already says most of this, well. Prose is the problem: nothing
checks it. This week the app swapped an exercise and handed back one with no
weight; "missed" turned out to be inferred once a date passes, not something
a person can say; an exercise can be swapped or banned but not moved within a
session or dropped from one day. None of that contradicts VISION.md. All of
it falls through it.

The fix is a **contract**: a flat list of things the user can do or rely on,
each written with the rule that must hold and the check that proves it — or
an honest MISSING / UNGUARDED. Three states, never blurred. A session runs
every change against it both ways: *does this feature support every
operation at its grain?* and *did this change quietly lose one?*

## Where it lives — the one decision that is hers

- **A. A short section inside CLAUDE.md (recommended).** The only file every
  session reads without being told to. One line per capability, a gate name
  or MISSING at the end of each. VISION.md keeps the *why*.
- **B. A separate MUST.md, linked from CLAUDE.md.** Room for detail — and a
  linked file is one a session can skip, which is how the prose got skipped.
- **C. Expand VISION.md's "User control" section.** No new file; not loaded
  every session.

## The shape of one line

    <what the user can do or rely on> · <screen / coach / both> ·
    <the rule that must hold> · <proof: gate name, or UNGUARDED, or MISSING>

## The contract — draft 2, to be audited line by line

Marks are my reading from today's inventory. They are LEADS until the audit
re-measures each one in the code and, where it is something seen, in the
browser at phone size.

### Promise 1 — best-in-class plans that stay that way when changed

**1a. The exercise plan, as generated**
- Tailored to this person: goal, experience, equipment, injuries, training
  days, session length, style, recovery, other sports. Never a template.
- Periodised in blocks; a calibration week when weights are unknown; a
  deload lighter than the week before it; movement patterns steady while
  variations rotate.
- Every loaded lift carries a weight, in the right unit for its implement,
  under a ceiling that warns before it clamps.
- A time cap is kept.
- Chosen, not shuffled: a reason exists for every pick, and non-obvious ones
  are explained.
- Activity-shaped plans (walks, swims, rides) held to the same bar in their
  own terms — or not offered until they can be. *(audit: what is offered
  today vs what is built)*
- **The bar is measured, not asserted:** no generated plan scores below the
  quality floor across the whole profile grid. *(exists, gated — test:quality,
  9,216 profiles, 7.2/12 floor; test:audit, 17,423 combinations)*

**1b. The meal plan, as generated** — the same standard, in its own terms
- Targets from the profile (energy, protein, carbs, fat), moving with a
  seven-day weight average, explained when they move, with an endpoint to a
  deficit. *(exists; audit which parts are gated)*
- Meals that hit the targets within a stated tolerance, from real foods,
  varied across the week, respecting dislikes, and filtered for allergens
  with honest limits. *(exists; gated by test:meal-quality, which needs a live
  database — audit what the cloud sweep therefore never sees)*
- A grocery list that follows the meals.
- **The bar is measured:** meal plans have a scorer with a floor, the way
  exercise plans do, and it runs. *(partial — audit)*

**1c. Changing one exercise** — every operation, from screen AND coach
- Replace it, for today or the rest of the block; alternatives real, on
  other equipment, and a loaded lift never replaced by an unloaded one by
  default. *(exists, gated — swap-request, slot-replacement-hygiene, single-implement)*
- Ban it from every future plan. *(exists, gated)*
- Add one to a session, as part of the plan and not only as a logged extra.
  *(partial — "unplanned work" logs it; it does not join the plan)*
- Remove it from one session without banning it. *(MISSING)*
- Move it earlier or later within the session. *(MISSING)*
- Change its sets, reps or weight for today. *(partial — weight yes via
  logging; sets/reps audit)*

**1d. Changing one workout**
- Move it to another day; it leaves today on every screen. *(exists, gated — session-move, moved-session)*
- Say "I missed it" and have that recorded as fact, distinguishable from "did
  it elsewhere" and from "move it". *(MISSING as an action — inferred only)*
- Say "I did it, just not in the app." *(exists — history logging; parity to audit)*
- Make today a rest day. *(exists, gated — rest-day-race)*
- Swap the session for an activity. *(exists)*
- Shorten or lighten today without touching the plan. *(partial — volume
  toggle; not "make today 30 minutes")*
- Rebuild today's session as a whole — different exercises, fewer sets — for
  today only. *(MISSING as a whole)*

**1e. Changing one meal** — mirrored from 1c, because meals are plans too
- Replace a meal; regenerate it; ask for more options. *(exists — both surfaces; audit gates)*
- Replace or remove one food within a meal; add one. *(partial — add exists
  by coach; remove/replace audit)*
- Build a custom meal from what is actually in the fridge. *(exists)*
- Log what was eaten, whether or not it was the plan. *(exists)*
- Move a meal to another slot or day; change how many meals a day. *(audit — likely MISSING)*
- Scale a portion. *(audit)*

**1f. Changing the whole plan**
- Start again when circumstances change. *(exists)*
- Change days, session length, equipment, injuries (add, mark lasting, mark
  recovered), goal, style, volume, other sports — each proposed, confirmed,
  applied everywhere. *(exists for most; audit surfaces and gates per item)*
- Weights actually lifted flow into the printed plan: automatically from a
  calibration week, by offer after. *(exists, gated — calibration-search, beat-target, logged-reanchor)*
- Regenerate the week's meals; change targets or the way they are set.
  *(exists; audit)*
- Nothing recorded is ever lost by any of the above. *(exists, gated — diary-preservation)*

**1g. THE RULE THAT MAKES "ADJUSTABLE" AND "BEST-IN-CLASS" ONE PROMISE, NOT TWO**
- An adjustment keeps the plan above the same floor generation had to meet:
  balance, ordering, volume, progression continuity, safe loads for exercise;
  targets, variety, allergens for meals. *(partial — pattern balance, load
  coherence and slot hygiene run on some edits; audit which edits skip them)*
- When a request would take the plan below the bar, the app says so and
  offers the nearest thing that keeps it — it does not refuse, and it does
  not comply silently. *(UNGUARDED — no gate states this)*
- A changed plan is re-scored the way a generated one is. *(MISSING)*

### Promise 2 — everything by hand or by asking

- Every action available on a screen has a coach tool, and every coach tool
  has a screen path. *(partial — the last inventory found gaps both ways;
  audit produces the current table)*
- Exceptions are a short written list with a reason each — sign-in, account
  deletion, anything where a typed confirmation is the point — and the list
  is Ashley's to change. *(MISSING — no such list exists)*
- The coach acts; it does not send anyone hunting for a control, and never
  describes a screen or button that does not exist. *(exists, gated — test:chat-app-reality, test:coach-promises)*
- It proposes and the user confirms; nothing changes silently. *(exists, gated)*
- When it cannot do something, it says so plainly and offers what it can.
- A change made either way shows everywhere: today, the program, Home, the
  coach, the meal plan. *(gated in parts — moved-session, swapped-day, coach-plan-context)*

### Promise 3 — the coach is a professional

**3a. What it knows**
- It advises from THIS person: their plan, today's session, logged sets and
  weights, injuries, goals, targets, meals, weigh-ins — not from a generic
  answer. *(gated in parts — coach-plan-context, coach-sees-ingredients,
  coach-sees-technique, coach-volume-schedule)*
- It never contradicts the app's own numbers. *(exists, gated)*

**3b. The quality of what it says**
- Training, nutrition, recovery, sleep, habits, motivation: accurate,
  current, evidence-led, at the level a CSCS / registered-nutrition
  professional would sign. Specific over generic; a number over "some".
- It asks before prescribing — what is driving the 800 calories, what kind of
  shoulder pain — and its follow-up uses the answer.
- It notices patterns and coaches to them: always failing the last set,
  every Friday missed, consistently beating the target. *(partial —
  block-review, beat-target, session-feel, streak, coach-nudge exist; audit
  what the coach actually says from them)*
- It holds its scope: it points at a doctor, physio or dietitian at the right
  moment, warmly, and does not perform assessment it is not qualified for.
- It sounds like one person, every time. *(measured by tone probes; not gated)*
- **How this is proved — the hardest line on the page:** string checks
  cannot grade advice. The proof is a **coach exam**: a fixed set of realistic
  conversations (a novice's first week; "my knee hurts on squats"; "I want
  to lose 5kg by the wedding"; "can I skip today"; a food-allergy question;
  a plateau) graded against a written rubric — accuracy, specificity to the
  person, scope, tone, no invented capability — run against the real model on
  demand, with the scores recorded over time. *(MISSING — today there are
  tone probes and rule gates, no graded exam)*

**3c. How it behaves** *(the mechanics from draft 1, unchanged)*
- Warm, on topic, never robotic, never locked down; off-topic handled
  gracefully once, then held.
- Never claims a capability, screen or safety guarantee it does not have.
- Proposes; confirms; can be undone.

### Across all three promises

- **Getting the plan right starts at onboarding** — every question the plan
  depends on is asked once, plainly, and every answer can be changed later
  from the profile or the coach. *(exists; audit that no answer is
  write-once)*
- **Progress is visible:** history, personal bests, weight trend, streaks,
  what changed and why. *(exists in parts; audit)*
- **Accountability is active, not passive:** the coach opens the
  conversation when there is something to say, asks how the session went,
  and follows up a missed week. *(exists in parts — coach-speaks-first,
  session-feel, coach-opener)*
- **History is permanent.** *(gated — diary-preservation)*
- **Every write succeeds or says it did not.** *(gated)*
- **Nothing is offered that is not built.**
- **Safety — allergens, injuries, loads, the one doctor's-note at setup —
  ships correct or not at all.**
- **It works on a phone, one-handed, on a gym floor, on a bad signal.**
  *(gated in parts — tap-targets, keyboard, composer, screens)*

## The rules that make the list bite — to sit beside it in CLAUDE.md

1. **A grain is whole or it is named as not.** A feature touching an
   exercise, a workout, a meal or the plan supports every operation listed
   for that grain, or the report says which it does not and why.
2. **A line is not "had" until a check proves it.** Anything without one is
   written UNGUARDED and stays so until a check exists — never quietly
   upgraded.
3. **Adjustment keeps the bar.** A change path that skips the quality checks
   generation runs is a defect, not a shortcut.
4. **Parity is checked both ways**, against the written exceptions list.
5. **Advice quality is examined, not assumed.** The coach exam is run and its
   scores recorded whenever the prompt, the model or the tools change.
6. **The list is a lead, not a fact.** When a line turns out wrong, correct it
   where it sits and say so in BACKLOG.
7. **Adding a line is cheap; removing one is Ashley's decision, recorded.**

## What happens next, in order — none of it builds anything

1. **Ashley picks the home (A / B / C) and adds what is still missing.** The
   three promises are hers; anything she expects the app to do that is not
   on this page is the most valuable line to add.
2. **Audit, report only.** Every line re-measured — in code, and in the
   browser where it is something seen — into exists / unguarded / missing,
   with surfaces. Output: the finished section ready to paste, plus the
   MISSING and UNGUARDED lists, plus the parity table.
3. **Ashley reads the MISSING list and decides what becomes work.** Each is a
   product decision and gets its own plan before any build — the usual bar.
   Two look large and deserve saying now: the coach exam (3b) and re-scoring
   an adjusted plan (1g). Both are the difference between claiming
   "best-in-class" and knowing it.
4. **Then CLAUDE.md is edited** — the section and the seven rules — and
   pushed.

## What this deliberately is not

- Not a roadmap. It says what must be true, not when.
- Not a second VISION.md. Where that explains, this lists and points at proof.
- Not finished by me. The scaffold is mine; the completeness is hers.
