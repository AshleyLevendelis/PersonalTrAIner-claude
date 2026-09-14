# What happens to your plan when you change it — and what a coach would do

Written 14 Sep 2026 on Ashley's instruction: *"Think carefully about how meal
or exercise swapping, removing, adding etc will affect a user's plan going
forward and how it's currently set up and what a coach would do in these
situations… think as if you're a certified health and fitness trainer and
nutritionist."*

**Report only. Nothing here has been built.** Every "what the app does today"
line was read from the code on 14 Sep 2026 — none of it was driven on a phone
for this report, so treat each as a lead to re-measure before acting on it,
the same rule CLAUDE.md applies to every written finding.

---

## The one idea to hold while reading

The plan has two clocks, and every edit lives inside them.

- **The week.** Inside a block, weights step up: week 1 is the easy entry,
  week 2 adds one step, week 3 adds two, week 4 is a deload at roughly 70% of
  week 3 with fewer sets. The effort target steps up the same way.
- **The block.** Four weeks. The whole programme is four blocks — sixteen weeks
  — generated in one go when the plan is created. Accessory exercises rotate
  between blocks; the main lifts carry through.

And every edit has one of two scopes: **today** (this one week's session) or
**the rest of this block**. Nothing you change reaches the next block. The
block boundary is where the app forgets your edits — and it is also the one
place the app reads backward: it holds a stalled lift flat, holds volume when
attendance dropped, and offers to raise a lift you beat.

That single fact — *edits expire at the block boundary, silently* — is behind
half the gaps below.

---

## Part 1 — Changing the exercise plan

Each operation: what happens now, what ripples forward, and what a coach would
do about it.

### 1. Swap an exercise — for today

**Now.** One session, this week only. The new exercise gets its own weight:
if it is a main lift, a fresh conservative estimate with a "new lift — find
your working weight" note; if an accessory, its own logged history if you have
any, otherwise the estimate. The warm-up is rebuilt for the new exercise, the
week's balance is re-checked, and the card tells you before you tap if it
tips your week push- or pull-heavy. Next week the original is back, and its
progression continues from wherever it last logged. The two exercises keep
separate histories.

**A coach would say.** This is the right shape for "the rack's busy" and "I
fancy something different today". Nothing to change in what it does.

**What a coach would add.** *Why?* The reason decides which tool is right, and
the app never asks:
- busy or broken kit → today's swap (this)
- "I don't like it" → rest-of-block swap, or a ban
- "it hurts" → the injury path, never a plain swap
- "my gym doesn't have it" → an equipment change, not a swap at all

The prompt already says "ask why" for pain. For the other three the coach
does whatever it was asked. **Recommendation:** one quick-reply question when
a swap is requested without a reason — *Busy / Don't like it / Hurts / Don't
have it* — routing to the right tool. Small, and it stops a permanent problem
being solved with a one-day fix.

### 2. Swap an exercise — for the rest of the block

**Now.** Every remaining week of *this* block gets the new exercise. Each week
is priced separately: the effort target rises across the block, so the weights
rise a little, but it is not the "start here and add a step each week" ramp
the rest of the plan uses. For a **main lift** the weight is a population
estimate — it ignores both the weight you told us you can lift at setup and
anything you have logged on the old lift. On the **deload week** the swapped-in
exercise is priced at deload effort from the estimate, not at 70% of what you
actually lifted the week before. Then the block ends and **the original
exercise comes back.**

**Where this is right.** Not carrying the old lift's weight onto a new
movement is correct — a front squat is not a back squat, and a number that
belonged to a different exercise is the most common way people get hurt on a
swap. The conservative first week with a "find your weight" note is what a
coach would do.

**Where a coach would differ — three things:**

1. **The swap evaporates at the block boundary.** Someone who swapped the leg
   press out because their gym does not have one gets it back in week 5, at a
   fresh estimate, with no explanation. From their side the app ignored them.
   A coach carries a substitution forward until told otherwise, or asks.
   **Recommendation (Ashley's call):** at the start of each block, one card —
   *"Last block you swapped X for Y. Keep Y, or go back to X?"* — or carry
   forward automatically and say so. I would ask, once, because the reason
   for the swap is the thing the app never learned (see §1).

2. **A same-family swap can be priced from what you actually lift.** Barbell
   squat → front squat, or dumbbell bench → barbell bench, has a known,
   conservative ratio. A coach would start you at roughly 80% of your logged
   back squat for a front squat and let it ramp, not at a population guess
   that ignores three months of your own logs. Safety-adjacent — it needs a
   plan before a build, and the ratios need to be conservative and only apply
   within a movement family. **Recommendation:** worth doing for main lifts
   only, with the estimate as the cap so it can never come out heavier.

3. **The remaining weeks should ramp, not re-estimate.** Weeks 2 and 3 of a
   swapped lift are independent guesses at rising effort rather than "last
   week plus one step". The difference is small in kilos but it means a
   swapped lift's numbers wobble where the rest of the plan's climb. Cheap
   to fix once (2) exists, because there is then a baseline to step from.

### 3. Remove an exercise from a session (today or the block)

**Now.** The exercise leaves; nothing replaces it; the session is shorter and
lighter. Refused if it would leave fewer than three exercises. The card asks
whether to drop it or put something else there (her ruling), says what it
costs the week's push:pull and chest:back balance, and the balancing pass may
trim a set on another day to keep the week level — stated, never silent.
Next block: it is back.

**A coach would say.** Correct. The drop-or-replace question is exactly the
right one. The one addition is the same as §1: *why* it is going decides the
tool. "No time" is the shorten tool. "Too tired" is volume-lighter. "Hurts"
is the injury path. "Hate it" is a ban. A removal is right for "not today,
for no particular reason" and little else — and the ask-why chips from §1
would route the rest.

### 4. Add an exercise to a session

**Now.** Placed in the session's natural order by its type (a compound never
lands after the calf raises); it copies sets, reps and effort from the nearest
similar exercise on that day; the session gets longer and the card says the
new length rather than trimming something else (her ruling). Today or the
rest of the block. The weight is priced when you confirm, with the "new lift"
note. Gone next block.

**A coach would say.** Right shape, right ruling. Two things a coach watches
that the app does not:

1. **Weekly volume per muscle.** Adding curls to Tuesday and Thursday is fine
   until it is the fourth arm exercise of the week. The app checks push:pull
   and chest:back balance and the session's length; it does not count sets
   per muscle across the week. The role floors and ceilings that generation
   uses per exercise exist — the per-muscle weekly total is the missing
   read. **Recommendation:** a one-line warning on the card when an addition
   takes a muscle past its weekly ceiling, in the same amber the balance cost
   uses. Not a refusal — you asked for it, you get it, you are told.
2. **What it displaces in recovery.** An added compound on a day before a
   heavy session for the same muscles is a recovery cost, not a time cost.
   Lower priority; the volume ceiling covers most of it.

### 5. Move an exercise earlier or later within a session

**Now.** Superset partners travel together; the warm-up and balance passes
re-run; order carries no weight change.

**A coach would say.** Fine. One gap: nothing objects if the main lift is
moved to the end after the isolation work. A coach would let you and say
"you'll squat tired — fine for a change, don't expect your usual numbers".
Low priority; a one-line note when a main lift moves behind a fatiguing
accessory would do.

### 6. Ban an exercise

**Now.** Every week of every block; each slot gets the best available
substitute picked automatically; if nothing fits, the slot is dropped; the
ban is added to the profile so future plans avoid it too. The card says how
many sessions it reaches before you confirm. Both surfaces since 14 Sep.

**A coach would say.** The blast radius being on the card is right. Two
concerns:

1. **A banned main lift's replacement is chosen for you, for the whole
   programme.** For an accessory that is fine. For the lift the whole block
   is built around, a coach offers the two or three sensible alternatives and
   lets you pick. **Recommendation:** when a ban touches a main-lift slot, the
   card offers the top three rather than auto-picking.
2. **The replacement's weight is a fresh guess** everywhere, same as §2 —
   the same-family pricing fix would cover it.

### 7. Shorten today ("I've only got 25 minutes")

**Now.** The main lift is protected; accessories come off from the bottom
until it fits; never below three exercises; this one day only; the plan's
shortfall warning stays quiet because the shortness is deliberate. Both
surfaces since 13 Sep, her ruling.

**A coach would say.** Exactly right. The one thing a coach notices that the
app does not: **a pattern.** If Tuesday is shortened three weeks running, that
is not a one-off, it is a session-length setting that is wrong. The app
already does this kind of reading at block boundaries for attendance
(held volume when attendance drops under two-thirds). **Recommendation:** the
third shortening of the same weekday in a block prompts, in chat, "Tuesdays
keep needing to be shorter — shall I set them to 30 minutes for good?"
Proposed, not applied.

### 8. Make a day lighter or heavier (volume)

**Now.** One set per exercise per request, inside the floors and ceilings the
generator owns, never past the session's time budget, never on a deload week.
"Today" is one session; "ongoing" reaches every week to the end of the plan.
The coach offers it when a run of sessions felt bad, never applies it on its
own.

**A coach would say.** The direction-not-magnitude design is right. The gap is
the same shape as §7 and §2: **an ongoing cut has no review.** Someone who cut
Tuesday in September is still cut in December, through phases whose whole
point is more work. A coach checks in at the next block: "you eased Tuesday
off last block — feeling ready to bring it back?" **Recommendation:** a
block-boundary check-in for every standing cut. Proposed, not applied.

### 9. Move a session to another day

**Now.** The next free day this week, never two sessions on one day, never
across the week boundary (next week's loads are different, and the app says
"no free day left" rather than that). The session keeps its name on the new
day; the day it left shows as moved; a session moved twice is asked about
rather than moved again.

**A coach would say.** The "next free day, and say so" ruling is right. The
gap a coach cares about most is **recovery spacing.** Monday's lower-body
session moved to Tuesday, when Wednesday is also lower body, is two heavy leg
days back to back — the app does not look. Same for a push day moved next to
a push day. A coach lets you do it once and tells you; or offers Thursday
instead. **Recommendation:** when the landing day is adjacent to a session
that works the same pattern heavily, the card says so and offers the next
free day that is not — an info line, never a refusal. The pattern data is
already on every session.

Also worth one sentence on the card when there is no free day: *"next week is
a heavier week, so it can't roll over"* rather than a bare refusal. The
reason exists in the code; it never reaches the person.

### 10. Missed it, rest day, or swapped for an activity

**Now.** Three different facts, recorded distinctly (her ruling: a missed day
stays missed). A missed session simply produces no log: the stall check
ignores it (a skipped week is not a stalled week), and attendance under
two-thirds of a block holds the next block's volume rather than stepping it
up — never a cut, framed as "for consistency", never as a comment on you.
Missing week 2 does not change week 3's printed weight; the screen you train
from overrides the printed number with your last logged session's
recommendation — held if you fell short of the reps, one step up if you hit
them all.

**Where a coach would differ, and this is the safety-adjacent one.** **Coming
back from a gap.** After a fortnight off, the screen offers your last logged
weight, or a step above it if your last session went well. A coach never
does that: two weeks off a lift and you come back 5–10% under, three weeks
and more, and you earn it back over two sessions. The app has no notion of
how long ago the last session on a lift was. **Recommendation (plan before
build, it touches load prescription):** when the last logged session on a
lift is more than about ten days old, hold the weight rather than step it,
and past three weeks back it off, with one line saying why. Applies equally
after an injury adaptation reverts (§11), where you return to the number the
ramp had planned for a lift you have not touched.

The rest is right. One coaching addition: the coach opener already asks
about yesterday's miss and stops once a miss is declared; a missed *week* gets
a chat prefill. That is the right amount of asking.

### 11. Injury (a few days, or lasting) and being away from your gym

**Now.** A time-bounded adaptation swaps the conflicting exercises out for
the stated period and reverts on its own; a lasting one changes the plan and
adds the injury to the profile so future plans avoid it; "recovered" stops
future avoidance but does not undo swaps already made. Away-from-gym works the
same way on equipment. Red-flag pain is redirected to a professional, never
adapted around.

**A coach would say.** The three-tier triage (redirect / coach it / adapt) is
exactly what a good coach does and the prompt has it. Two gaps:

1. **Return load after an adaptation reverts** — §10's gap, same fix.
2. **Recovered → nothing changes on the current plan.** A coach would offer:
   "shoulder's good — want the overhead press back in?" The app says plainly
   that it does not undo the swaps, which is honest, but the offer is a
   sentence away. Low cost.

### 12. What the app already reads backward — and where it stops

Calibration week's heaviest set becomes the plan's number automatically (her
ruling); a lift you beat for a block is *offered* a raise, never given one;
a stalled lift is held flat automatically; poor attendance holds volume. All
at the block boundary, all with the brake acting alone and the accelerator
asking first — the right asymmetry.

Where it stops: **everything mid-block is on the screen you train from, not
in the printed plan.** If you look at "the whole programme" in week 2 you see
formula numbers; the session screen shows logged ones. That is by design and
it is documented, but it is the thing a person notices ("why does next week
say 60 when I did 70 today?"). Calibration week was fixed for exactly this
complaint. **Recommendation:** the printed plan shows the logged re-anchor
for the *next* session of each lift, labelled as such, mid-block — the same
move calibration already makes, once per week rather than once per block.

---

## Part 2 — Changing the meal plan

**How meals actually work, because it is not what the workout side does.**
There is no week of meals. Each slot — breakfast, lunch, dinner, snack — has a
pool of about five verified meals with no date on them. Each day, the app picks
one per slot as the best *combination* for that day's targets (calories within
5%, protein within a band, carbs and fat looser), avoiding yesterday's names
where it can. A meal you chose yourself is *pinned* for that date and the
other slots are re-chosen around it so the day still adds up. Targets are
computed fresh every time from your 7-day average weight, only move once that
average has shifted a kilo, and say so when they do.

So the meal side has no "rest of the block" and nothing to forget. Its edits
are all "this date", and the ripple is always *within the day*.

### 13. Swap a meal

**Now.** Steps through the slot's pool in a fixed order, so five swaps show
five different meals; when you have seen them all the coach offers to find
more rather than serving a sixth look at the same five; new ones are added,
never replace the ones you have. Your pick is pinned for the day; **the other
slots may be re-chosen around it** so the day lands on target.

**A coach would say.** The rotation and the "find more, don't replace" rule
are right. The thing to check: when swapping breakfast quietly changes what
lunch is, does the screen say so? The re-fit is correct behaviour — a
dietitian would rebalance the day — but a lunch that changed while you were
looking at breakfast needs one line. I have not driven this; it is a lead.

### 14. Move a meal to another slot

**Now.** The two meals swap places, both resized to their new slot's budget,
both new sizes stated before the tap; a move that would need an absurd resize
(under 0.4× or over 2.5×) is refused in plain words; ingredient wording is
preserved. Both surfaces, her two rulings.

**A coach would say.** Right. One nutritional point a dietitian watches:
**protein per meal.** A 600-kcal dinner halved into a snack slot halves its
protein too, and a day can hit its protein total while one meal carries
almost all of it. Around 25–40g per meal is the working rule for keeping
muscle. The verifier has a protein floor when it *scales* a meal; the move
path keeps the portions it computed and I have not confirmed the floor applies
there. **Recommendation:** re-measure; if the moved-in snack drops under ~20g
protein, say so on the card.

### 15. Add a food to a meal

**Now.** Search the foods the app can actually cost (no free text, so nothing
uncostable is ever offered), state an amount, and it joins the meal at your
amount through the same verification as everything else. The card says how far
over or under the slot's usual share it lands and that the rest of the day
re-fits around it. Both surfaces since 14 Sep.

**A coach would say.** Right — your food, your amount, and the day
rebalances. The honest limit: the re-fit can only choose among the five meals
each slot already has, so a 700-kcal addition can leave the day over target
with nowhere to put it. The app ships that as an honest miss rather than a
forced number, which is correct, and the card's "N kcal over" line is the
warning. Nothing to change.

### 16. Remove, replace or resize a food inside a meal

**Now.** A removal states what leaves with it ("−31g protein, −210 kcal") and
offers two or three verified swaps; decline and the day is simply lighter,
shown honestly. Replace and resize go through the same pipeline. Never below
one food. Both surfaces, her ruling.

**A coach would say.** Right, and the protein line is the one that matters.
The one refinement: when a removal takes a meal under ~20g protein, the swap
offers should lead with protein sources. I believe the offers are ordered by
macro similarity to what left, which gets most of the way there; worth
confirming on a real screen.

### 17. Add a whole meal by name, or build one from what is in the fridge

**Now.** Chat only, deliberately (a dish name is a model call, not a lookup).
A named dish is rescaled to the slot's budget; a custom meal keeps your stated
quantities as facts and is pinned, with the free slots re-fitted around it
("plan the rest of my meals"). Same verification as everything else; a
restriction conflict on your own food is stated plainly with no confirm
button.

**A coach would say.** Right on both. Nothing to change.

### 18. Logging what you actually ate

**Now.** A ledger, separate from the plan. Logging a meal changes today's
rings and nothing else: not tomorrow's meals, not the targets, not the plan.
The coach is deliberately never told what you ate, so it cannot invent a
"you have 400 left" figure. The Nutrition tab says one thing when you are
behind on the widest gap and names the meal that covers it.

**A dietitian would say.** Not chasing yesterday is correct — a day under is
normal, a week under is the signal, and "banking" calories day to day teaches
the wrong thing. Two gaps:

1. **There is no weekly view.** A dietitian looks at seven days against
   targets, not one. The data exists (the ledger, by date). A weekly average
   line — "this week you averaged 1,850 against a 2,000 target" — is the
   honest version of what a daily readout implies. **Recommendation:** a
   weekly line on Nutrition, and in the coach's context (a weekly *average*,
   not a running total, is safe to hand the coach without the invented-
   remaining-figure risk).
2. **Logged ≠ planned is never used.** If you log something other than the
   planned dinner three nights a week, that is a pool that does not fit your
   life. Nothing notices. Same shape as §7: patterns are the coach's job.

### 19. How the targets move

**Now.** Recomputed on every read from your 7-day average weight; the anchor
moves only once that average shifts a kilo, so daily water noise never
retunes a diet; when it does move you are told. Fat loss is 20% under
maintenance, capped at 500 kcal, above a sex-specific calorie floor. In the
dynamic mode, training days carry more carbs than rest days.

**A dietitian would say — three things:**

1. **No plateau logic.** Weight flat for three weeks in a stated deficit is
   the most common conversation in nutrition coaching, and the answer is
   almost never "cut more" first — it is "check the logging, check the
   weekends, check sleep, then step the deficit by a small amount with a
   floor". The app has the trend and says nothing about it. **Recommendation
   (safety-adjacent, plan first, Ashley's call on the numbers):** after three
   flat weeks in fat-loss mode, the coach raises it once, asks about adherence
   first (house style), and only then *proposes* a step — never past the cap,
   never past the floor, never applied on its own.
2. **Training-day macros follow the profile's training days, not the real
   week.** Move Monday's session to Tuesday, or make it a rest day, and Monday
   still carries training-day carbs while Tuesday does not. Only matters in
   the dynamic mode, and it is a small number — but it is the app saying one
   thing on Exercise and another on Nutrition. **Recommendation:** derive the
   day type from the resolved day (moves, rest days and activity swaps
   included), which the exercise side already computes.
3. **Nothing says when a target moved *down* because you lost weight and why
   that is good.** The notice says the number changed; a coach frames it:
   "you've lost 2kg, so the target comes down 80 kcal — that's the plan
   working, not a punishment." Copy only.

### 20. Dislikes, allergens, and the shopping list

**Now.** A stated dislike is a ban, every path verifies against diet rules and
fails closed on anything it cannot identify, the screen re-checks allergens at
display time, and the shopping list is derived from the same assembled day
your meals are — so a swap changes the list.

**A dietitian would say.** This is the part that has to be right and it is
built the right way round. Nothing to change.

---

## Part 3 — The gaps, ranked by risk to someone's goals

| # | Gap | Why it matters | Size | Whose call |
|---|-----|----------------|------|------------|
| 1 | Coming back from a gap at last weight, or a step above (§10, §11) | The one on this list that gets someone hurt | Medium; plan first | Mechanical once the rule is set; the % is a coaching number |
| 2 | Edits vanish at the block boundary with no word (§2, §3, §4, §6) | "The app ignored me" — trust | Medium | Ashley: ask, or carry forward |
| 3 | A moved session can land beside a same-muscle heavy day (§9) | Recovery; two leg days running | Small | Mechanical |
| 4 | Swap and remove never ask why (§1, §3) | Wrong tool for the reason: a permanent problem gets a one-day fix | Small | Ashley: the four chips |
| 5 | Main-lift swap and ban priced from a population guess, not your logs (§2, §6) | Weeks of under-loading after a swap you made for a good reason | Medium; plan first | Mechanical, conservative ratios |
| 6 | Adding an exercise has no weekly per-muscle ceiling (§4) | Junk volume | Small | Mechanical |
| 7 | Training-day macros ignore moves and rest days (§19) | Two tabs disagree; small numbers | Small | Mechanical |
| 8 | No plateau logic on the nutrition side (§19) | The commonest nutrition conversation, unanswered | Medium; plan first | Ashley: the rule and the numbers |
| 9 | One-offs never become patterns — shortenings, standing cuts, logged-not-planned (§7, §8, §18) | A coach notices the third time | Medium | Mechanical, proposed not applied |
| 10 | A banned main lift's replacement is picked for you (§6) | The lift the block is built around, chosen without you | Small | Ashley |
| 11 | No weekly nutrition view (§18) | Daily readouts imply a precision that misleads | Small | Mechanical |
| 12 | Mid-block, the printed plan and the session screen show different numbers (§12) | The calibration-week complaint, still true for weeks 2–3 | Small | Mechanical |

Numbers 1, 5 and 8 touch load prescription or the diet path and get a written
plan before any build, per the standing rule.

## What I would do first

**1, then 2, then 4.** Return-from-gap loads are the safety item and the rule
is short. The block-boundary review closes the biggest trust gap and gives
the app a natural moment to ask about everything else that expired. The
ask-why chips are a day's work and quietly fix most of §1, §3 and §6.

---

## What this report did not do

Nothing was driven on a phone. Two claims in particular are leads, not facts:
whether swapping one meal visibly re-picks another (§13), and whether the
per-meal protein floor applies on the move path (§14). Both should be
re-measured before anyone builds from them.
