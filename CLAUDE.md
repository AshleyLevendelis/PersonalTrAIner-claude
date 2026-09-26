# Standing conventions

These apply to every session in this repo. They exist so they stop being restated per-prompt.

## Product vision

- Full product vision, standards, and shipping bar: see [VISION.md](VISION.md). Safety-adjacent and architecture-level decisions should be checked against it.

## What the app must have

Ashley, 10 Sep 2026: *"we create best in class, professional meal and
exercise plans which can be adjusted to fit the user's needs while still
aiming to keep the quality. everything that can be done within the app is
able to be done by the user or by asking the ai chat. also the ai chat acts
as a professional personal trainer who gives best in class health, nutrition
and fitness advice."* Three promises. Every line below hangs off one, and
every line ends with how we KNOW: the gates that would fail if it went
away, or an honest tag. `UNGUARDED` = exists, no check would notice it
break. `MISSING` = does not exist. `coach only` / `screen only` = exists on
one surface, not the other. Marks were MEASURED on 10 Sep 2026 — see
`docs/audits/must-have-audit-2026-09-10.md` for how — and are leads, not
facts: re-measure before acting on one, correct it here when it is wrong.

### Promise 1 — best-in-class plans that stay that way when changed

**The exercise plan, as generated**
- Tailored to this person — goal, experience, equipment, injuries, days,
  session length, style, recovery, other sports; never a template — `quality`
  (9,216 profiles), `audit` (17,423), `injury-coverage`, `equipment-labels`,
  `concurrent-activity`, `enforcement-gaps`
- Blocks and phases; a calibration week when weights are unknown; a deload
  lighter than the week before — `block-phases`, `frozen-weeks`,
  `calibration-search`, `starting-out`
- Every loaded lift has a weight, in its implement's unit, under a ceiling
  that warns before it clamps — and a movement-prep move that needs an
  implement gets one too, at **half the working load**, read off the app's own
  warm-up ladder rather than invented (18 Sep 2026, CSCS delegation; her 17 Sep
  ruling gave it a number, this is the "kept light" half) — `primer-load`,
  `load-ceilings`, `load-ceiling-units`,
  `per-side-load`, `single-implement`, `load-display`, `loadless-notes`
- The time cap is kept, and a shortfall says why — `session-length`,
  `session-shortfall`, `cardio-share-score`, `main-lift-rest`
- **And a short day gets the rest of its time, as optional mobility — the day
  that already has its cardio included** — since 23 Sep 2026. MEASURED: 348 of
  9,216 plans ran a day under the minimum asked for, and on 346 of them every
  such day was one already carrying the goal's cardio — the filler skipped any
  day with a cardio block, and a day holds only one. They now get a separate
  optional mobility close-out; 3 plans remain, from the push:pull pass trimming
  after the filler. **Optional filler is elastic**: it is the first thing any
  budget takes back, before a set, an exercise or a rest — "I've only got 58
  minutes" had been dropping three exercises to keep 19 minutes of optional
  mobility. `filler-yields` (58 checks; 18 mutations, 17 caught — the 18th
  exposed a second safety net that fired on 0 of 9,216 plans, now deleted),
  `verify:mobility-filler`
- **Rest suits the exercise, and the time budget is paid for in WORK** — since
  18 Sep 2026. Ashley, from the gym floor: *"The rest breaks between the lat
  pulldown seem very short 30s, check that is correct."* It was not: measured
  across 1,728 profiles, 49.2% of every exercise in a week rested 30 seconds
  or less and 29.1% of second-tier compounds — a class prescribed 75s by the
  style's own table — were at or under 30. Nothing was miscalculating; the
  session did not fit and the generator paid for it out of rest.
  **Her ruling that day, from four options: protect the rest, do less.** Every
  exercise keeps a rest that suits it and the session sheds an accessory or a
  set instead — but **never the last exercise covering a movement pattern**,
  decided 18 Sep 2026 under her CSCS delegation once the cost of "do less"
  turned out to include weeks holding no squat pattern at all (22 of 9,216, now
  0). A shorter session is fewer sets, not a missing pattern: push, pull, hinge
  and squat are protected, accessory volume is the adjustable part.
  `pattern-floor`. She rejected keeping the work at short rests, a flat one-minute
  middle floor, and being told to train longer. Her reason, in her own words:
  30 seconds on a lat pulldown is not a short rest, it is a different exercise,
  and the reps printed beside it stop being reachable.
  Now 0.0% of second-tier compounds rest 30s or less, median 60s.
  CORRECTED 18 Sep 2026: this said "minimum 45s", and the gate asserted it.
  Both were wrong, and the gate was RED AT THE COMMIT THAT INTRODUCED IT while
  being reported green. 45s was the lowest value in a 1,728-profile sample;
  combat's own table asks 60s of a second-tier compound and a conditioning
  block's adaptation phase shifts rest by -20s, so 40s is what that block
  deliberately wants — and `restFloorFor` returns `min(unbudgeted, tierFloor)`
  precisely so it gets 40. The app was right and the number was a measurement.
  **The floor is now DERIVED in the gate from the style's own rest row and the
  deepest phase shift, and printed on every run**, with her report kept beside
  it as an absolute: no second-tier compound at 30s or less, whatever the
  tables say. `rest-floors` (24 checks, 4 mutations), `session-length`,
  `today-only`
- Chosen, not shuffled, with reasons on screen ("Why this exercise / weight")
  — `chosen-not-shuffled` since 16 Sep 2026 (19 checks, 10 mutations), which
  CALLS the ranker rather than reading it. It holds the tie-break to its job:
  a one-point difference survives every seed, while two identical candidates
  genuinely do differ — the +/-0.3 jitter against factor steps of 1 was the
  relationship nothing enforced, and widening it turns every plan back into the
  coin flip that put a band in 906 loaded slots.
- **Say what feels tight before a session and the warm-up prepares it** — added
  15 Sep 2026 from a suggestion list Ashley asked me to assess, on her "build
  all that you think is good". Eight areas as taps; up to three mobility drills
  go in at the front of TODAY's warm-up, with a line saying why and an honest
  account of anything it could not cover. It adds warm-up and nothing else — no
  set, weight, exercise or plan is touched, checked on a real screen before and
  after. **`screen only`**, and now recorded as such in
  `docs/coach-screen-parity.md` — it was not, for a day, which is the rule-4
  gap the parity doc's own instruction exists to prevent.
  CORRECTED 15 Sep 2026, measured: the reason written here — "the answer lives
  in a store the edge function cannot reach" — is FALSE on both halves. The
  edge function reaches no store on this rail; every `propose_*` tool returns
  an intent and the BROWSER writes (`chat-gemini:2677-2693` says so outright),
  and the coach is already inside that very store via `declareOffPlan`. The
  real obstacles are smaller and worth having written down before anyone
  builds it: the answer can only ever be TODAY, a coach-set answer would
  silently open a session, and the pain boundary is enforced on the screen
  only. `tightness`, `verify:tightness`
- No plan below the quality floor — `quality` (floor 7.2/12; 0 below)
- **A pull-heavy week is not scored as a flaw when the injuries left one
  press** — Ashley's ruling 24 Sep 2026, from three options: don't count it,
  over keeping the flag and over cutting pulling to match. 366 of 379 flags
  were exactly that; a coach prescribes more pulling than pressing when
  pressing is what hurts. Push-heavy is flagged whatever the pool, and
  pull-heavy wherever a second press existed. **This changed what the rule
  measures** — push_pull_imbalance counts before 24 Sep are not comparable.
  `push-pull-score` (13 checks, 5 mutations)
- Activity-shaped plans: only the starting-out walking plan exists, and only
  it is offered — `starting-out`. **It is now RENDERED, since 15 Sep 2026** —
  `planned-activity`, `verify:planned-activity`.
  CORRECTED, measured: this line was true about generation and silent about the
  screen, and the screen was the whole problem. `PlannedActivity` had been
  generated for weeks and **no screen component read it** — every reader asked
  `exercises.length`, so a prescribed twenty-minute walk rendered as a blank
  "Log a walk or other activity" form and was filtered out of the week list
  entirely. Ashley reported the empty card on 15 Sep believing it was about
  cardio; it was already shipping to every beginner. **A capability is not
  "had" because the data exists** — rule 2, one layer lower than usual: this
  one had a generator, a type, a coach that could read it, and no pixel.

**The meal plan, as generated — the same bar, in its own terms**
- Targets from the profile, moved by a seven-day weight average, explained
  when they move, with an endpoint to a deficit — `fat-loss-deficit`,
  `macro-split`, and "explained" since 16 Sep 2026: `target-change-notice`
  (19 checks, 9 mutations). CORRECTED, measured: the notice always EXISTED —
  I reported it missing off one identifier (`anchorMoved`, genuinely dead and
  now deleted) while the notice ran off another (`changedFromPrior`, wired at
  both call sites). What was true is the tag: nothing would have noticed it
  breaking. It now names what each target moved FROM as well as to, covers
  protein, carbs and fat rather than calories alone, and comes from the shared
  phrasebook instead of two hand-written copies.
- **And the meals FOLLOW the targets when those move — both surfaces since
  17 Sep 2026.** Her two rulings that day: **tell her and offer to refit**
  (from four options — not silently, not automatically, not by swapping the
  meals out), and **stay quiet until the drift is real, then resize** (from
  three) — same meals, adjusted amounts, so the shopping list stays valid and
  saying yes costs nothing.
  CORRECTED, measured, and the correction is the useful part: "meals never
  follow a moving target" is FALSE. `assembleDay` is pure, runs on every
  render, re-searches the pool against current targets and repair-scales its
  largest unpinned slot — absorbing roughly 0.8x to 1.4x of a day's own size
  without a word, which is the anti-nag ruling working. A 5kg weight drift is
  3.5% and lands there; what it cannot absorb is accumulation.
  **THE ENGINE SHIPPED WITH NO CALLER**, correct and measured and unreachable,
  and 50 green checks said nothing about it. Same family as the walking plan
  and the goal, one layer earlier — so the gate now has a section whose only
  job is to fail when a module has no screen.
  A GOAL change is deliberately refused here: it moves calories x1.36 while
  protein stays x1.00, so a proportional resize reaching the calories drags
  protein from 157g to 239g against a 160g target. **A resize only ever works
  when the SHAPE held and the SIZE moved**; a goal change regenerates instead.
  `meal-refit` (91 checks, 16 mutations), `verify:meal-refit` (25 checks, 5
  mutations), `coach-parity`. Needs the `chat-gemini` deploy for chat
- Meals hit targets from real foods, dislikes honoured, allergens
  filtered with stated limits — `food-dislike-is-a-ban`, `food-db-parity`,
  `diet-tag-sync`, `meal-swap-rotation`, `meal-addition`, `meal-food-add`
- **And a different day tomorrow** — since 19 Sep 2026, on Ashley's "fix the
  variety". CORRECTED, measured: this line said "varied" and nothing had ever
  counted. **1.11 distinct days in a seven-day week; 89.4% of profiles ate the
  identical day every day.** The variety preference existed, was documented and
  was tested — and was a `0.01` penalty added to a macro-distance score against
  a median gap of `0.033`, so it could only win an almost exact tie. **An
  argument that is not passed and an argument that does nothing look identical
  from the call site**, and I reported the first before checking the second.
  Now a SORT KEY rather than a penalty, applied only among combinations already
  inside the tolerance bands — the app's own definition of a correct day — so
  variety costs nothing real and can never buy a day that misses its targets.
  Outside tolerance nothing changed. 3.98-4.51 distinct days after, and days
  inside tolerance went UP (86.2%→95.3% on the loosest fixture), because
  fit-first could previously prefer a combination that scored well overall
  while busting one band. "Yesterday" comes from the DATE, not from what was
  logged, so somebody who never logs still gets a different dinner.
  `meal-variety` (42 checks, 16 mutations), `measure:meal-variety`
- Grocery list follows the meals — `grocery`, and since 19 Sep 2026 it follows
  the ones the tab will actually SHOW: both surfaces and the resize trial read
  one rotation from one pure builder, so the list cannot shop for a week the
  screen will not serve. Parity by construction, the `meal-refit` pattern.
  CORRECTED: this file and the module's own header credited the list with
  "realistic variety" it never had — it threaded the history forward correctly
  and got the same day seven times, like everything else
- **How to cook it** — since 19 Sep 2026, `screen only` and honestly so.
  `generate-meals` had always asked the model for a method and always received
  one; it was read twice (is this too heavy for breakfast, is it quick or
  standard) and then thrown away, with no field on the option and no column in
  the table. **The interesting half is refusing a wrong one**: the app rescales
  every proposal by up to 2.5x, so a method naming an amount describes food the
  ingredient list may no longer contain — a number the app never verified,
  printed beside numbers it did. The prompt asks for technique with no amounts;
  anything still naming a mass or volume is dropped WHOLE, and the rule runs
  again at display time for the same reason the dietary re-check does.
  `meal-method` (31 checks, 19 mutations), `verify:meal-method`. Needs the
  `generate-meals` deploy; until then new meals arrive with no method, which is
  the honest empty state
- **A diet that filters food but not the numbers SAYS SO where it is picked** —
  since 20 Sep 2026. Keto and Low-carb are real food filters (bread, pasta,
  rice, potatoes, oats, beans and added sugar are refused, probed one by one)
  and they move NO target: carbs are the remainder after protein and fat,
  floored at 50g, and `FAT_PERCENT_RANGE` is capped at 0.35 so the split cannot
  be forced into a ketogenic shape through the wrong derivation order.
  Measured: a keto profile's carb target is 150-370g, 25-57% of energy, against
  the under-50g ketosis means.
  **Ashley's ruling, from four options: say it on the setup screen** — over
  building a real ketogenic derivation, over removing Keto from the list, and
  over leaving it, where the coach told the truth only when asked. One sentence
  in the phrasebook, rendered under the picker on setup AND Profile, and only
  when one of those two is selected. `coach-voice` §8 (19 checks, 8 mutations),
  `verify:setup-answers` §8 (10 checks, 5 mutations).
  STILL TRUE AND NAMED: there is no ketogenic derivation, and the keto filter
  is the low-carb filter — fresh banana, grapes and mango pass it, which the
  sentence admits rather than hides
- A measured floor for meals — `meal-quality` exists but needs a live
  database, so it NEVER runs in a cloud sweep: `UNGUARDED` in practice

**Changing one exercise** — every operation, from the screen AND the coach
- Replace it, today or for the block; alternatives real, on other
  equipment; a loaded lift never replaced by an unloaded one by default —
  both surfaces; `swap-target`, `slot-replacement`,
  `single-implement`, `verify:swap-request`
- **And the shortlist no longer hides an option for TRAINING STYLE** — since
  18 Sep 2026. Ashley, next to a leg-curl machine on a functional plan, was
  offered two sliders and a band: all three machine leg curls are tagged
  bodybuilding, and the style stage of the pool filter removed them outright.
  Measured that day: 31 of the catalogue's 45 machine and cable entries carry
  no functional tag, so it is a convention and not a slip — retagging them
  would change what every functional trainee is PRESCRIBED.
  **Her ruling, from three options: show them, marked**, over retagging the
  machines and over leaving the search box as the only route to one. Style is
  the only one of the four filter stages that may be relaxed, and
  `stageStyleFilter`'s own comment says why: *"style is a preference, not a
  safety constraint"*. Equipment, injuries and skill still remove.
  **AND HER SECOND RULING THE SAME DAY, because the first broke an earlier one
  of hers.** Sinking off-style options put a matching SLIDER above a
  non-matching MACHINE — a loaded lift offered bodyweight replacements first,
  which is exactly what her 10 Sep rule exists to prevent (measured: 8
  movements in the hybrid catalogue). From three options: **weight always
  wins.** For a lift carrying a number, every loaded alternative comes first
  whatever its style, each marked on its own row; the unloaded ones follow.
  So the sort keys, outermost first: loaded, style, stated likes, implement
  quality, the ranker. `swap-style` (28 checks, 14 mutations),
  `verify:session-edit` §8, `single-implement`
- Ban it from every future plan — **both**; `audit-fixes`, `silent-writes`,
  `coach-parity` §3. CORRECTED 15 Sep 2026, measured: this said `screen only`
  and quoted the decline "NOT WIRED UP YET… point the user at the ban button"
  at `chat-gemini:598` / `:3087`. Both line numbers are from the stale note and
  neither is a decline today — the tool proposes (`:3400-3432`, returning
  `kind: "propose_exercise_ban"`), wired 14 Sep on Ashley's instruction as the
  last thing a screen could do that chat could not. The 11 Sep correction that
  stood here was right when written and was never revisited after the fix
- Add one to a session AS PART OF THE PLAN — both surfaces since 13 Sep 2026.
  Her ruling that day, from three options: **add it and say the session is now
  longer** — you asked for the exercise, so you get it, and the app never
  quietly removes work to pay for work you requested. And her second, on the
  picker: **show everything, warn me** — the suggested list is the constrained
  pool, the search box beside it reaches the whole catalogue and states the
  clash on the row, which is what swap already did. Logging extra work
  (`AddUnplannedWork`) is still the different thing it always was: it never
  joins the plan. `exercise-add`, `edit-keeps-the-bar`, `session-edit`,
  `coach-volume-schedule`, `verify:exercise-add`
- Remove it from one session without banning it — both surfaces since 11 Sep
  2026; asks whether to drop it or put something else there (her ruling);
  `session-edit`, `verify:session-edit`
- Move it earlier or later within the session — both surfaces since 11 Sep
  2026, a superset's halves travelling together; `session-edit`,
  `verify:session-edit`. CORRECTED 13 Sep 2026: the line below used to say
  moving re-ran the coherence passes. It did not — it rebuilt the warm-up and
  nothing else. It does now, through the shared tail
- Change its sets, reps or weight for today — via logging only (extra sets,
  typed numbers); the plan itself is not edited
- **Log the build-up as well as the working sets** — `screen only`, since
  17 Sep 2026. Ashley's ruling that day, from three options, standing in the
  gym: **a box for every set, labelled** — Warm-up 1, 2, 3 then Set 1, 2, 3,
  the build-up marked so it never counts toward the weight going up. **It
  REVERSES her 7 Sep ruling** ("tick them off, don't record them"), which was
  made about a strip of chips before anyone had watched a real lifter run out
  of rows; she was told it was a reversal and chose it anyway. The tickable
  strip is gone from today's card and survives read-only on browse and peek.
  A warm-up row is filtered out of volume, personal bests, progression and
  history by construction, so logging one changes no number the app shows
  back. `working-sets`, `ramp-visibility`, `set-plausibility`,
  `verify:warmup-rows`, `verify:ramp-readonly`
- **The faint numbers in the boxes say whose they are** — `screen only`, since
  18 Sep 2026. Ashley, reading her own dumbbell rows: *"Last sets prescribed
  were sets of 11 reps. Is thay correct at the end of a exercise?"* Nothing had
  prescribed 11. The 9, 11, 11 were her OWN last session, drawn in exactly the
  grey the app uses for a suggestion on a row with no history — two different
  things, one appearance. **Her ruling that day, from three options: mark them
  "last time"**, over moving them out of the boxes to a line above the sets and
  over emptying the boxes; both of those cost the one-tap repeat, which is the
  reason the numbers are there. The marker is on the row, only where history is
  actually driving the boxes, never once the row is saved and never on a
  build-up row. `last-time`, `verify:one-number` §8

**Every change to an exercise lives in one menu** — her ruling, 14 Sep 2026,
from three options, after reporting that swapping sat outside the "⋮" while
moving, removing and banning sat inside it: **all of them behind the ⋮**, over
making them all inline and over keeping swap in both places. The line is
"changes to the plan go in the menu", not "links go in the menu" — the plate
calculator changes nothing and is reached mid-set, so it stays on the row.
Browse already worked this way; today's card was the odd one out.
`verify:session-edit` §1f-1h, which reads BOTH halves — that swapping is in the
menu, AND that no change-verb is left loose on the row, because "it is in the
menu" stays true when a copy is also left outside it.

**Changing one workout**
- Move it to another day; it leaves today on every screen — both surfaces
  since 10 Sep 2026 ("What happened?" on the day menu); `session-move`,
  `moved-session-stuck`, `what-happened`, `verify:session-move`,
  `verify:moved-session`, `verify:what-happened`
- Say "I missed it" and have that recorded as fact, distinct from a rest —
  both surfaces since 10 Sep 2026 (her ruling: a missed day stays missed);
  `what-happened`, `training-week`, `verify:what-happened`. Needs migration
  `20260910160000_add_marked_missed` pushed
- Say "I did it, not in the app" — both; the screen logs real sets for a
  PAST day (today's grid is the path for today); `what-happened`,
  `verify:what-happened`; coach `log_history`
- Make today a rest day — both; `what-happened`, `verify:rest-day-race`,
  `verify:what-happened`
- Swap the session for an activity — both, and **it asks first from 15 Sep
  2026**. Her ruling that day, from three options: **ask, like the others** —
  the coach shows a confirm card and nothing is written until she taps it. She
  rejected "do it and offer Undo" and "do it silently but honestly". This was
  the only day-verb that wrote immediately: it was built 25 Aug, six days
  before her "record it, but confirm first" ruling, and never came back for it.
  CORRECTED: this line listed `what-happened`, `verify:swapped-day` and
  `verify:what-happened` as if they covered both surfaces. All three drive the
  DAY MENU only — none opens a coach conversation. SCREEN: those three. COACH:
  `coach-promises` §2, `chat-actions` §5 and `verify:activity-swap`, which
  drives the real chat to the card, taps it, and checks nothing was written
  before the tap
- Shorten or lighten TODAY only — both surfaces since 13 Sep 2026. Her ruling
  that day, from three options: **protect the main lift and drop accessories**
  — you still squat and squat properly, and the accessory work at the end goes,
  from the bottom up, until it fits. Never below three exercises. And before
  any of that, the day's OPTIONAL mobility goes (23 Sep 2026) — it was being
  kept while real exercises were cut. `today-only`,
  `verify:shorten-today`, `edit-keeps-the-bar`, `session-shortfall`,
  `what-happened`, `coach-volume-schedule`, `filler-yields`.
  CORRECTED the line that stood here: it said the only lightening control was
  the coach's volume change, which reaches to the end of the plan. True, and
  still true — this adds a second, narrower one beside it rather than changing
  that one.
- **Put a cardio session on a day, as part of the plan** — both surfaces since
  15 Sep 2026. Ashley: *"know when to suggest adding a session and when
  something is mentioned in passing"*. Her ruling that day, from three options:
  **offer it only when she sounds DEFINITE** — over asking every time (my
  recommendation) and over never offering.
  **THE RULING IS ENFORCED IN ONE DIRECTION ONLY, and that is the part to
  remember.** A hedge ("I might ride Wednesday") cannot produce a card — the
  client refuses before building one, off a written list of 21 phrases, read
  against the WHOLE message rather than the model's chosen quote. The coach
  staying QUIET when it should have offered cannot be enforced at all, because
  there is no turn to inspect: it simply said something else. So the app blocks
  the direction that costs something and the coach exam grades the direction
  that costs nothing. Anything built on a model JUDGEMENT should be split this
  way and the two halves named separately.
  `cardio-session`, `verify:cardio-session`, `coach-parity`
- Rebuild today's session as a whole, for today — **both surfaces since 16 Sep
  2026**. Her ruling that day, from three options: **keep the main lift and
  rebuild around it** — you still do today's main lift at the weight and sets
  prescribed, so the progression thread is untouched, and everything else
  changes. It matches her 13 Sep ruling for shortening, so the app holds ONE
  position on the main lift rather than two; and if the main lift is the thing
  you want gone, swapping it alone already works.
  `session-rebuild`, `verify:session-rebuild`, `coach-parity`.
  CORRECTED, measured: this line gave three reasons it was impossible and TWO
  WERE WRONG. "Nothing regenerates below a whole week" is true of
  `generateMesocycle` and irrelevant — swap, add and remove all change one day
  of a live mesocycle. The day assembler has fourteen parameters, not fifteen,
  and the build never calls it; the cross-day dedupe set is readable straight
  off the week. Only the third held (the cheap route can hand you the same
  exercise twice), which is why this composes the SWAP path once per slot

**Changing one meal** — mirrored from exercise, because meals are plans too
- Replace it, regenerate it, ask for more — both; `meal-swap-rotation`
- Add a food to it — both surfaces since 14 Sep 2026. The exception list said
  this needed free-text entry the screen does not have; that reason was too
  strong. The foods the app can COST are a known list, so the screen searches
  it — strictly more honest than free text, because a food that cannot be
  costed is never offered rather than typed and then refused. `meal-food-add`,
  `verify:meal-food-edit` §5, `coach-parity` §5.
  Add a MEAL to the day — still `coach only`, with the real reason now
  separated from the borrowed one: asking for a dish BY NAME and having the app
  work out its ingredients is a model call, not a lookup. There is no list of
  dishes to search the way there is a list of foods. `meal-addition`
- Remove or replace one food within it — both surfaces since 12 Sep 2026;
  a removal states what it costs and offers 2-3 verified swaps (her ruling);
  `meal-food-edit`, `verify:meal-food-edit`
- Build a custom meal from what is in the fridge — `coach only`; `custom-meal`
- Log what was eaten — both; `meal-log`, `meal-ledger-snapshot`,
  `diary-preservation`
- Move a meal to another SLOT — both surfaces since 14 Sep 2026, with the two
  rulings it was waiting on. **"Resize it to fit"** (13 Sep), over refusing and
  over leaving the portions alone; and on the slot the meal LEAVES, from three
  options, **"they swap places"** (14 Sep) — dinner becomes the snack, the
  snack becomes dinner, both resized, both new sizes stated before the tap.
  `meal-move`, `verify:meal-move`, `coach-parity`.
  Moving to another DAY stays `MISSING` and is now named with its reason: no
  screen renders another day's meals, so the destination is somewhere she
  cannot see, check or undo by looking. It needs a future-day meal view first.
  Meals per day and snacks — `screen only` (Profile)
- Scale a portion — both surfaces since 12 Sep 2026, the same row menu;
  `meal-food-edit`, `verify:meal-food-edit`
- Resize the WHOLE DAY back onto the targets — both surfaces since 17 Sep
  2026; the offer on Nutrition and `propose_meal_refit` in chat. **Parity here
  is by construction rather than by inspection**: App computes the verdict
  ONCE and hands the same object to both, and both confirm through one
  function, so the coach cannot offer what the screen would not, state a
  number the screen would not, or write by a different path. Worth copying for
  anything that must not drift between surfaces. `meal-refit`,
  `verify:meal-refit`, `coach-parity`

**Changing the whole plan**
- Start again — `screen only` (New Plan; `reset-clears-draft`)
- Days, equipment, injuries (add / lasting / recovered), style, volume,
  other sports — both surfaces, proposed and confirmed — `rebuild-offer`,
  `profile-restore`, `coach-volume-schedule`, `injury-rebuild`,
  `enforcement-gaps`, `concurrent-activity`
- **GOAL — both surfaces since 17 Sep 2026**, and on 16 Sep it was the worst
  kind of wrong: on NEITHER. **The road was built and nobody drove on it** —
  `fitness_goal` was already in `PLAN_INVALIDATING_FIELDS`,
  `detectPlanInvalidation` already had a finished goal branch with user-facing
  copy, `goal-policies.ts` already declared how the four goals differ, and
  `macro-calculator.ts` already read the goal in five places for the deficit,
  the carb prescription and the label. Every assignment to `fitness_goal` was a
  READ copied forward, the onboarding insert, or a fixture. **Nothing wrote the
  field.** That shape is the one to remember: a capability can be absent while
  every piece of machinery for it exists and looks, to a reader, like proof it
  works. Same family as the walking plan (generator, type, no pixel) and
  bodyweight PRs (six filters, no record) — and worse than both, because here
  the *offer copy was already written*.
  **Ashley's ruling, 17 Sep 2026, from three options: training AND food, from
  this week** — over asking about food as a second question (somebody training
  for muscle while still eating a fat-loss deficit is the worst of both) and
  over finishing the current block first (up to three weeks of work they have
  said they do not want). It is the ONLY setup answer that is an input to both
  the plan generator and the calorie calculation, so it is the only offer with
  a food sentence, and both halves are on the card before the tap.
  **THE FOOD HALF NEEDED ALMOST NO CODE, AND THAT IS ITS RISK.** The targets
  are DERIVED from the goal, and App's macro effect is already keyed on the
  field — so writing it moves calories and macros on the next render. What was
  missing was narrow and exact: the effect set the numbers and never called
  `snapshotTargetsIfChanged`, so a weigh-in explained itself and every other
  input change moved the targets SILENTLY. It does now. The meals follow on
  confirm, by reusing `handleRegenerateAllMeals`.
  `goal-change` (57 checks, 13 mutations), `verify:setup-answers` §7g-7o,
  `rebuild-offer`, `coach-parity`. Needs the `chat-gemini` deploy for chat
- Session length — **both surfaces since 16 Sep 2026**, and until that day it
  was `screen only` in the emptiest sense: the screen wrote the number and
  changed nothing about the plan. `session_duration_preference` was absent from
  `PLAN_INVALIDATING_FIELDS` and from `CEILING_FIELDS`, so the screen neither
  rebuilt nor re-priced; the one live effect was today's card re-labelling the
  session as running over. "You can set your session length" was true about the
  NUMBER and false about the PLAN.
  **Ashley's ruling, 16 Sep 2026, from three options: rebuild the rest of the
  block around the new length** — over trimming what is there (a 60-minute
  session with its end chopped off is not a session designed for 45) and over
  waiting for the next block. It binds BOTH surfaces, which is why the coach
  got `propose_session_length` the same day: the same request must not answer
  differently depending on where it was made.
  `session-length-change`, `rebuild-offer`, `verify:setup-answers` §6i-6n,
  `coach-parity`. Needs the `chat-gemini` deploy to work by chat
- **"I only have 45 minutes today" ALREADY WORKS on both surfaces**, and is a
  different thing from the above — `propose_session_shorten`
  (`chat-gemini:810`, takes `minutes`, TODAY-only, main lift protected) and
  `onShorten(minutes)` on the day menu. Recorded because the two requests are
  one word apart ("today" / "from now on") and the tools are not. Both sides of
  that pair are now the coach's too, and the prompt rule keys on the TIME SCOPE
  rather than the number, because both requests carry a minute figure
- Targets and macro mode — `screen only`, and "targets" is not one thing:
  `calorie_target` has no control anywhere and never did. It is written once
  at onboarding and derived by `computeTargets` thereafter, so changing it
  means changing its INPUTS — macro split, activity level, or goal (which is
  on neither surface, above)
- Onboarding answers and the Profile screen. **"As of 14 Sep 2026 there are no
  locked answers left" was FALSE when written (corrected 16 Sep 2026) and is
  TRUE again from 17 Sep 2026, when the goal was unlocked.** It was missed for
  three days because the unlocking work went field by field through the ones
  somebody had complained about, and nobody re-derived the list from the
  profile columns afterwards — **so the closing check is to re-derive from the
  columns, not to tick off the complaints.** The history below is kept because
  each unlocking needed a different road and the reasons are the useful part.
  CORRECTED 13 Sep, again 14 Sep, closed 17 Sep:
  - The three implement ceilings — **now editable**, in "You" beside Equipment,
    and correcting one re-prices the running plan from this week onward with
    the exercises untouched (her ruling that day, from four options). Shown
    only when the kit is limited, because a full-gym answer discards them.
    `setup-answers`, `verify:setup-answers`. **A CHANGE RECEIPT NAMES THE WEEK
    THE CHANGE STARTS** — her ruling 13 Sep 2026, from three options, and it
    generalises beyond this one screen: "from this week" was ASSERTED while the
    weight quoted came from week 7, because a correction only bites where the
    old number was actually binding. If the app quotes a number, it says which
    week that number is in, or she cannot go and look at it.
  - Exercise dislikes — **was never locked**: it is not a profile column at
    all, it becomes `user_facts` rows, the same shape a "never give me
    burpees" chat turn produces. CORRECTED 14 Sep 2026, measured: the line here
    said "the SCREEN still cannot", and that is half wrong. Profile lists every
    `exercise_preference` fact with edit and delete, so an existing dislike can
    be CHANGED or REMOVED from the screen. What the screen cannot do is ADD one
    — and the group is hidden entirely when there are none, so a first dislike
    has no screen route at all. **CLOSED the same day**: "Exercises to avoid"
    now sits beside "Foods to avoid" on Profile, so it is **both** on every
    operation. The typed word is RESOLVED against the catalogue before it is
    stored, because the exclusion filter matches a full exercise name — "squats"
    stored as typed bans nothing while looking on screen exactly like a ban that
    worked — and an ambiguous word asks which rather than guessing, the rule the
    coach's ban card already follows off the same resolver.
    `food-dislike-is-a-ban` §7, `verify:setup-answers` §7.
    The old line came from reading the profile FIELDS and not the memory section
    below them
  - The three known lifts — **now editable**, 14 Sep 2026, and with them NO
    SETUP ANSWER IS LOCKED. CORRECTED: the old line said unlocking them "needs
    the anchor machinery, which refuses downward moves". That followed from a
    true fact about the WRONG path. They are a generation-time seed
    (`knownWorkingWeights`), so `prescribeLoad` never reads them and the
    RE-PRICE path is blind to them by design — `setup-answers` §7 still pins
    exactly that. What does not follow is that nothing can act on them:
    `rebuildAgainstProfile` regenerates FROM the profile, so a corrected lift
    flows straight through it. They went on the rebuild road with goal, style
    and the starting point.
    **Her ruling, 14 Sep 2026, from three options: "rebuild only when it
    matters"** — and the condition is the point, not an optimisation.
    `knownWorkingWeights` is packed from these three ONLY when the calibration
    week was skipped; after a real calibration week the plan is anchored to what
    was actually lifted, so correcting the setup guess changes no weight and
    offering a rebuild would ask someone to give up their progression for
    nothing. The screen says so in that case rather than doing nothing quietly.
    They are shown only where they were asked, never as three empty boxes.
    `rebuild-offer` §2b, `setup-answers` §9, `verify:setup-answers` §8
  - The starting preference — **now editable**, in "You" beside Equipment,
    14 Sep 2026. It goes on the REBUILD-OFFER path with goal and style, not the
    re-price one, and that is the point rather than a detail: `move_more` and
    `train` do not share a set of exercises, so a re-price would leave somebody
    who just asked to train properly still walking, with slightly different
    numbers. Measured, not reasoned — `repriceForCorrectedProfile` returns zero
    changes for this field against a live fixture, with a same-fixture contrast
    so the gate cannot pass vacuously. `setup-answers` §9,
    `verify:setup-answers` §6, `rebuild-offer`
- Weights actually lifted flow into the printed plan — automatic from
  calibration week, offered after — `calibration-search`,
  `beat-target-offer`, `logged-reanchor`
- Nothing recorded is lost by any of this — `diary-preservation`,
  `replace-without-losing`, `memory`

**Adjustable AND best-in-class is one promise, not two**
- An adjustment keeps the plan above the floor generation had to meet —
  **CLOSED 13 Sep 2026.** One shared tail (`settle-week.ts`) now runs on every
  in-place edit — remove, move, swap, ban and the coach's volume change — and
  it carries set hierarchy, one-weight, load coherence, a warm-up rebuilt from
  the exercises the day actually holds, and the week-level push:pull and
  chest:back balance pass. `edit-keeps-the-bar` proves each by handing every
  path a day that already violates the rule; `session-edit` does the same for
  removal.
  THREE THINGS THE OLD LINE GOT WRONG, each measured: moving re-ran only the
  warm-up, not the three passes; `enforceWeeklyPatternBalance` was never
  unreachable — its signature is the same shape as the two passes edits
  already called, and the "needs the whole generation context" reasoning was
  only ever true of `balanceWeeklyStructure`, which stays inside because it
  swaps exercise IDENTITIES; and "the volume toggle" is two different toggles
  — the coach's re-ran nothing, the workout card's regenerates everything
- When a request would break the bar, the app says so and offers the
  nearest thing that keeps it — since 13 Sep 2026 the app first FIXES what it
  can (the balance pass, above) and says so before the tap — Ashley's ruling
  that day: a change to one day may touch another to keep the week balanced,
  and it is stated, never silent. What it could not fix is still reported as a
  cost, now on remove, swap and volume rather than remove alone
  (`edit-keeps-the-bar` §5, `session-edit` §5, `verify:session-edit` §6 reading
  it off a real screen). CLOSED 14 Sep 2026 on the last surface: the COACH's
  swap card now states the cost too, so EVERY edit path — screen and coach —
  says what it costs the week before the tap. CORRECTED: the line here said
  that card had to stay silent because "its builder is synchronous and a
  faithful trial needs the async load recompute". Both halves were true and the
  conclusion did not follow — the one place that dispatches proposals is
  already async and already awaits two sibling builders, so the builder could
  simply await the same trial confirm runs. The weight is still deferred, and
  that half of the old note was right: the trial's numbers are real but confirm
  re-runs against the live plan. `verify:swap-request` §4 reads it off a real
  screen; `coach-promises` holds the wiring.
  CORRECTED: this said removal reported push:pull **and chest:back**. It never
  measured chest:back — `session-balance-cost.ts` defined push and pull and
  nothing else, while its own header cited the 1.25 chest:back band. It does
  now
- A changed plan is re-scored like a generated one — `edit-keeps-the-bar`
  §7 since 13 Sep 2026: four profiles across the goal/experience/equipment
  spread, every edit path applied to each, re-scored with the same `scorePlan`
  and held to the same 7.2 floor `quality` holds generated plans to. Her
  ruling the same day: the score stays behind the scenes as a guarantee we
  check, never a number on screen — what a person reads is the specific thing
  that changed, in plain words.
  CORRECTED 15 Sep 2026, measured. This said `scorePlan` has ZERO call sites
  in the app and that the cards never price a change against the GOAL. It has
  two — `edit-tradeoff.ts:227-228`, both with `skipComparisons`, reached live
  from `ChatAssistant.tsx:684` via `assessEdit` → `scoreDrop`. The 14 Sep
  measurement was true when taken and the build THAT SAME DAY falsified it;
  the two facts sat in this file three paragraphs apart, only one updated.
  What remains true is narrower and still worth keeping: a `skipComparisons`
  score is NOT comparable to the 7.2 floor (the denominator inside
  goalAlignment changes), so the app can know a change made the plan worse and
  can never know it fell below the bar. That residue is Ashley's, ruled on
  twice, and should not be reopened without her
- When a change works AGAINST the goal, the app asks first, then allows — it
  never refuses anything that is not unsafe. DECIDED 14 Sep 2026 by the
  session on Ashley's explicit delegation (*"You decide what you think is best
  and then tell me what you decided and why"*), from four options: tell-then-
  allow / ask-first-then-allow / reason required / refuse. Chosen ASK FIRST,
  THEN ALLOW because it is the house style already used for pain, low
  calories and "I can't face it"; because a refusal contradicts "you asked,
  you get it" and teaches people to stop asking; and because a cost line on a
  card is tapped past. The shape, so it cannot become nagging, is part of the
  ruling: four tiers by consequence — free (silent) / costs something (one
  sentence in the goal's OWN terms plus the cheaper route, one tap) / against
  the goal (a QUESTION with chips, one of which is always "do it anyway", so
  the change is exactly one tap further away) / unsafe (refused, unchanged).
  "Against the goal" is PINNED: the trial would take the plan below the floor
  generated plans must clear (the dimension named, never the number), or one
  of the short list in `docs/how-the-app-talks-about-a-change.md` §10. Asked
  ONCE per block per thing; never for a "today" change mid-session; never on
  the starting-out plan. The sentences are the app's, from one phrasebook
  shared by both surfaces, so the exam can grade them.
  **BUILT 14 Sep 2026** on her "Build it" — `edit-tradeoff.ts`, wired into the
  coach's swap, remove and add cards; `edit-tradeoff`, `coach-promises` and
  `verify:tradeoff` hold it. Live: *"That would take your chest from 3 sets a
  week down to 0 for the rest of the block. Just today, or is there something
  about it you want gone for good?"* with a **Do it anyway** chip and no card.
  THREE CORRECTIONS THE BUILD MADE TO THE RECORDED DECISION, all measured:
  the floor became a DELTA (`scorePlan` is 475ms for fat-loss/low-recovery
  because goal alignment regenerates a comparison plan; before+after per card
  is unaffordable, so it gained a `skipComparisons` option — 470→13ms — and
  tier 2 reads "a dimension lost one whole rule" instead of an absolute, which
  is also better coaching); the per-muscle numbers come from the PERSON'S OWN
  PLAN, not a literature constant the app has nowhere else; and the "strength"
  vocabulary keys off the PHASE, because the four goals are fat loss,
  hypertrophy, functional and conditioning — there is no strength goal.
  **THE REASON CHIPS AND THE SCREEN-SIDE SHEETS SHIPPED 15 Sep 2026.** Both
  surfaces ask "what's going on with it?" before a swap or a removal — four
  answers per verb, each routed to something that already existed, and "just
  get on with it" always beside them. The pain answer triages, which is its own
  standing rule (see **Safety-adjacent work**). Two things were found on the
  way: the question was ALREADY being asked on a main-lift removal, under three
  chips that did not answer it; and `askText` appended the escape chip and THEN
  sliced to four, so the first verdict with four alternatives would have lost it
  and turned a one-tap-away ask into a block. `edit-reason`, `verify:hurts`,
  `verify:tradeoff` §4-6, `verify:session-edit` §3c2-3c5.
  STILL TO BUILD: the per-goal phrasebook as one graded file, sets-per-muscle
  on the cards, the block-end review
- **A `test:` gate can never prove a branch is REACHED.** Measured 14 Sep 2026:
  disabling the whole trade-off step with `if (false && advice)` left all
  twelve of its source checks green, because they read text and the text was
  still there. Anything whose failure mode is "the code is there but never
  runs" needs a `verify:` driver, and the source check should say so rather
  than letting the next reader take it for proof

### Promise 2 — everything by hand or by asking

- Every screen action has a coach path and every coach tool a screen path —
  measured 10 Sep 2026, corrected 11 and 14 Sep. **The written exceptions list
  now exists and is CHECKED**: `docs/coach-screen-parity.md`, held by
  `coach-parity`. Coach-only is down to two, each with its own reason rather
  than a shared one: adding a MEAL by name and building a CUSTOM meal, both
  because a dish name is a model call and not a lookup. Adding a FOOD closed
  14 Sep. **And a SCREEN claim in that list is now DERIVED rather than
  asserted** (`coach-parity` §5): a tool with a shared builder must have that
  builder reached from a real tab root, excluding the coach's own client. Two
  earlier versions of that check were wrong in ways worth remembering — one
  skipped exactly the case it existed to fail on, the other counted
  ChatAssistant as a screen and so proved the COACH had a builder. **Adding an exercise (13 Sep) changes neither count**: it
  existed on no surface, and arrived on both at once. Recorded because the
  obvious assumption is that a new capability moves one of these numbers. **The GENERAL declining-stub gate EXISTS** — CORRECTED 15 Sep
  2026, measured. This line said there was none and named `meal-food-edit` §8
  as the shape one should take. `coach-parity` §3 has been that gate since 14
  Sep: it loops EVERY declared tool, slices each handler to its own name so a
  decliner cannot taint its neighbour, and proves its detector on a synthetic
  handler first so it cannot go vacuous now that nothing declines. It is
  weaker than §8 in one way worth knowing — a negative check on three known
  refusal phrases, so a stub declining in NEW words would pass — and §8's
  positive courier-shape proof does not generalise, because the 40 tools have
  three incompatible shapes (23 couriers with a literal matching kind, 3 with
  a variable or differing kind, 14 pure server-side writers with no kind at
  all)
- A written exceptions list, each with a reason, Ashley's to change — EXISTS
  since 14 Sep 2026, `docs/coach-screen-parity.md`, held by `coach-parity`.
  CORRECTED: this line still said `MISSING` after the list was written and the
  bullet above it had already been updated to name the file — two lines about
  one fact, only one of them changed. Two exceptions stand, both coach-only and
  both for the same reason: a dish NAME is a model call, not a lookup
- The coach acts; it never sends anyone to a control, never describes one
  that does not exist — `chat-app-reality`, `coach-promises`,
  `says-what-it-contains`
- It proposes and the user confirms; nothing changes silently —
  `pending-actions`, `proposal-expiry`, `chat-actions`
- A change made either way shows everywhere — `stale-after-write`,
  `one-day-one-look`, `one-today`, `tab-ownership`, `home-week-strip`,
  `verify:swapped-day`, `verify:moved-session`

### Promise 3 — the coach is a professional

- It advises from THIS person — plan, today, logs, injuries, goals, targets,
  meals — and never contradicts the app's numbers — `coach-plan-context`,
  `coach-sees-ingredients`, `coach-sees-technique`, `coach-volume-schedule`,
  `coach-phase-brief`, `context-is-read`, `week-load-consistency`
- Accurate, current, specific advice at the level a qualified trainer and
  nutritionist would sign — still `UNGUARDED` in practice, but no longer for
  the reason written here for three days. CORRECTED 16 Sep 2026: the exam HAS
  been run once, on Ashley's machine on 13 Sep, and the scores were never
  pushed. See the exam bullet below for what that run is and is not worth
- It asks before prescribing and uses the answer — prompt rule, kept in sync
  by `coach-rules-sync`; whether it HAPPENS is `UNGUARDED`
- It notices patterns and coaches to them — `block-review`,
  `beat-target-offer`, `session-feel`, `coach-opener` (missed yesterday —
  and it stops asking once a miss is declared), `coach-nudge`,
  `activity-streak`; a missed WEEK gets a chat prefill, not a follow-up
- It holds its scope — doctor, physio, dietitian at the right moment —
  `starting-out` for the first-timer note; otherwise `UNGUARDED`
- One voice, every time — **half guarded since 15 Sep 2026, and the split is
  the point.** The sentences the APP writes — every card lead, receipt,
  refusal and floor — are held by `coach-voice` (33 checks, 10 mutations) and
  `verify:activity-swap` / `verify:swap-request` read on a real screen. The
  MODEL's own voice is still `UNGUARDED` IN PRACTICE, but no longer for want
  of a standard: since 24 Sep 2026 the coach exam marks **voice** as a sixth
  judged dimension, written only from rules the coach is already given (§1
  VOICE, §1b-i's one question, VISION's coach chat) — texting not articles,
  length fitted to the turn, no unasked lists, no praise opener, attention
  over cheer, one question that earns its place. FIRST MARKED 26 Sep 2026:
  voice 1.75 of 3, the lowest of the six, and the prompt was found telling
  the coach to put every question LAST, the exact shape the rubric marks 1.
  The fix needs the exam re-run before anything is known.
  A changed marking guide now makes the scores stale on its own line, with the
  cheaper fix named: re-grade the same transcripts, do not re-run the coach
  (`coach-exam-fresh`, `coach-exam-judge`). Measured first in
  `docs/audits/the-coachs-own-words-2026-09-15.md`: three grammars for one
  job, eight wordings of one failure, three narrators in one file
- **It reads like texting a coach — Ashley's three rulings of 24 Sep 2026**,
  after seeing four-paragraph answers and a question tacked onto every reply:
  (1) **"short steps"**, from three options (over speech-only and over a
  designed checklist card): a how-to is up to THREE short numbered lines with
  a "Full form guide" button for the rest, and a message that asks several
  things gets one line per thing, each starting with what it answers — no
  headers, no bold, everything else still speech. (2) **A question only when
  the answer matters**, from three options — it REVERSES her 15 Sep "end every
  response with exactly one question", which had turned into padding ("Have
  you noticed the RPE targets…?"); never more than one, tap buttons where the
  answers are obvious. (3) **No new cards for suggestions**, in her words: *"I
  want it to feel like a text conversation with a coach. A coach wouldn't send
  a card."* Offered a card for a suggested meal change, she declined; the
  existing Apply cards for changes she ASKS for are untouched and were not
  what she was ruling on. The essays had a findable cause: the prompt's
  trigger list said "provide step-by-step form cues, target muscles, common
  mistakes, and coaching tips" while §1 said "offer the rest", and the model
  obeyed the more specific line. `coach-promises` (source only — whether the
  model OBEYS is the exam's `voice` dimension, two cases added for it).
  **MEASURED 25 Sep 2026, and it half-obeyed**: the how-to came back as three
  steps, but with bold labels, and the full guide and the several-things reply
  came back with headers, bold and a bulleted recipe. So the part code can see
  is now held in code: every reply leaves chat-gemini through ONE door that
  strips headers and bold and touches nothing else — no word, no link, no tag
  (`coach-texting`, 21 checks, 9 mutations). Whether it is one line per thing,
  and whether a question matters, stays the exam's to judge — the same split
  as the cardio ruling
- Never claims a capability, screen or guarantee it lacks; proposes,
  confirms, can be undone — `coach-promises`, `chat-app-reality`,
  `pending-actions`, `log-correction`, `replace-without-losing`,
  `question-not-a-card`, `tool-reply`, `message-evidence`
- **The coach exam** — a fixed set of realistic conversations graded against
  a written rubric, run against the real model whenever the prompt, model or
  tools change, scores kept — BUILT 13 Sep 2026, and **RUN ONCE, on 13 Sep,
  ON ASHLEY'S MACHINE — a fact this file denied until 16 Sep 2026.** That run
  sits as a single unpushed local commit; this session has not seen it and
  records it as RELAYED, not measured. Its headline was 7 of 20 cases
  breaching a hard rule. **DO NOT READ THAT 7 AT FACE VALUE**: two of the
  breaches were the coach replying "with no text at all", and that is the
  exact false positive fixed on 16 Sep — on 13 Sep the coach returned an
  empty reply beside a card in 28 places (measured at `29221cf`), the runner
  recorded no card, and the hard rule named `silence` fired on a coach that
  had behaved correctly. A third is likely stale rather than real: the
  exercise-ban tool was still a declining stub on 13 Sep and was wired the
  next day. So the 13 Sep scores measure a coach and a grader that both no
  longer exist, and the number to act on is the one from the first run AFTER
  the deploy. Keep the commit — it is the only record of what the exam said
  before any of this was fixed, and the comparison is the point. **26 cases and
  47 turns** since 24 Sep 2026 (two voice cases for her "short steps" and
  "question only when it matters" rulings; 23 and 43 on 20 Sep, up from 20 and
  37): the exam was written on
  13 Sep and the coach has gained tools since, so it was measuring a surface
  three rulings out of date. The three added each grade a ruling Ashley had
  ALREADY given, so nothing new was decided to write them — the session-length
  pair, the cardio ask-before-carding turn, and the goal change's food half.
  **TEN hard rules** checked in code and six
  judged dimensions (voice added 24 Sep 2026) marked against `docs/coach-exam-rubric.md`
  (`coach-exam:grade`); and `coach-exam-fresh` in every sweep, which fails
  when the coach changes and the exam has not been re-run — that gate is what
  makes rule 5 enforceable rather than aspirational. The rules are
  fixture-tested (`coach-exam-grader`) and the RUNNER is now driven end to end
  against a fake coach (`coach-exam-runner`). No conversation has been
  played against the real model FROM A CLOUD SESSION, because that needs
  credentials this machine does not have — which is why the 13 Sep run
  happened on Ashley's machine and why this file went on saying it had not
  happened. So until it is run again against the CURRENT coach,
  "best-in-class advice" is still asserted, not known — and the floor is
  deliberately unset, to be proposed from that run's numbers.
  **THE SHAPE OF THIS MISTAKE IS WORTH MORE THAN THE FACT.** Work done on a
  machine this session cannot see is invisible to every check here, and the
  absence of evidence read as evidence of absence for three days across two
  files and five BACKLOG entries. When a capability needs credentials a cloud
  session lacks, "never run" means "never run HERE" and must say so.
  CORRECTED 16 Sep 2026, measured: this said eight rules and quoted a mutation
  count, and the more useful correction is WHY a ninth was needed. **The exam
  could not see a card.** chat-gemini returns a `proposal` with an empty reply
  in 33 places — the card does the talking, in the app's own words — and the
  runner recorded only `action`, which appears in 3. So a correct offer was
  written down as an empty turn and the rule named `silence` flagged it: the
  coach marked down for its best behaviour, on the two cases written for that
  behaviour. **Nothing caught it because the runner's live path had never
  executed once** — `--dry` skips the network, the grader is fixture-tested
  off hand-written transcripts, and `coach-exam-fresh` only checks staleness.
  **A SCRIPT WHOSE FIRST REAL RUN COSTS MONEY GETS A MOCKED END-TO-END GATE
  BEFORE IT RUNS, NOT AFTER.** The generalisation is not about this exam: it is
  that "tested in pieces" and "has ever run" are different claims, and the gap
  between them is invisible from the code.
  **AND A TENTH RULE, 20 Sep 2026: WHICH CARD, NOT WHETHER A CARD.** The exam
  could see that the coach offered something and not whether it offered the
  RIGHT something, so a perfectly well-formed card reaching the wrong tool
  passed. The pair that matters is the coach's own prompt talking — *"THE TIME
  SCOPE IS THE WHOLE DISTINCTION, NEVER THE NUMBER ... one of them rebuilds the
  rest of their block and the other does not touch tomorrow"* — and the exam
  case makes the figure IDENTICAL on both turns so a coach keying on the number
  cannot pass by accident. **The rule's inverse is the more valuable half**: an
  empty `oneOf` asserts a turn carries NO card, which is the only thing that
  grades §3g2's "ask first, card on the yes". Ashley's 15 Sep cardio ruling is
  enforced in code in ONE direction only — the client refuses to build a card
  from a hedge — and the direction with no code behind it is a coach carding a
  DEFINITE statement on the turn that was supposed to ask. That is model
  behaviour, and this is the only thing in the repository that can see it.
  10 mutations, 10 caught — one of them only after being rewritten, because the
  first attempt was a convoluted edit that applied and did not create the
  defect, which reads exactly like a missed check.
  **RUN FOR REAL ON 23 SEP 2026 — and the judged half marked nothing.** Every
  judge call was 401, and the report named the judge anyway. Behind the key were
  two more defects that only a run could show: the judge's 1024-token budget
  was smaller than its own default thinking, and the runner recorded an INSTANT
  SAVE (`memoryIntent` and three siblings, `reply: ""` by design) as silence —
  the 16 Sep card lesson, one shape over. All fixed. The grader now has the
  mocked end-to-end gate the runner got on 16 Sep, `coach-exam-judge`. **The rule
  above was applied to the half that was in front of us, not to its sibling**,
  which is the "re-run a derivation against the cases it was not written for"
  shape again. Tier B has still never marked a real conversation.
  **RUN AGAIN 25 SEP 2026 against `03225c22`**: the judge 401'd on Ashley's
  terminal too, so it is the KEY, not where it was set. Four hard rules fired;
  three were the checks misfiring on CORRECT answers — "check the labels to
  make sure they are safe" and "the green light on what intensity is safe"
  read as allergen verdicts, and "we don't have progress photos in the app"
  read as a route because `\bn't` can never match inside "don't". Fixed, with
  the verbatim replies as fixtures and their banned twins still firing. The
  fourth was real: Walking Lunges swapped for a Goblet Squat, which the prompt
  already forbade (single-leg is its own pattern). 1 of 26 after the fix.
  **AND A RE-MARK MUST BE STAMPED WITH THE COACH THAT ANSWERED.** Re-marking
  those transcripts after editing the prompt stamped the scores with the
  EDITED coach, which had never sat the exam, and the freshness gate then
  called them fresh. The scores now carry the transcripts' own stamp
  (`coach-exam-judge`). Any score computed later than its evidence must name
  the evidence, not whatever is on disk when it is computed.
  **FIRST FULLY GRADED 26 SEP 2026** against `84f6086c`: 26 of 26 marked,
  2.3 of 3 overall (2.29 and 2.31 on two gradings of the same transcripts, the
  judge's own spread, so never read a move smaller than that), voice lowest
  at 1.75. There were 0 real hard-rule breaches once two more misfires were
  fixed ("130 grams" read as no number; "I can't guarantee it's safe" read as a
  verdict).
  **AN EXAM QUESTION IN THE COACH'S PROMPT IS AN ANSWER KEY.** Two were found
  that day. One was mine from the day before: the several-things example was
  the exam's own message with its answer, and the graded reply copied its
  labels. The other is the allergy few-shot, which is word for word the
  allergen case. `coach-promises` now fails on any exam question in the
  prompt. The allergy one is a named exception awaiting her ruling, because
  rewording an exam case changes what it measures. **And a judge must be told
  what the coach can DO**: an offer of a change no tool makes ("want me to add
  these tempo cues?") scored honest 3 until the judge was given the tool list

### Across all three
- Onboarding asks each question once; every answer can be changed later —
  `onboarding-corrections`, `profile-restore`. CORRECTED 14 Sep 2026: this said
  "eight answers cannot (above)", which the section above had already stopped
  saying — the last of the eight was unlocked that day. Every answer can be
  changed now
- Progress is visible — history, PRs, weight trend, streak —
  `exercise-history`, `dashboard`, `activity-streak`, `home-week-strip`,
  and since 16 Sep 2026 **for bodyweight training too**:
  `bodyweight-progress` (55 checks, 15 mutations),
  `verify:bodyweight-progress` (19 checks, 6 mutations).
  CORRECTED, measured: this line was written as if it held for everyone and
  it held for nobody training without kit. **SIX independent exclusions** —
  a `.gt('weight_kg', 0)` in the database query itself, a guard in
  `checkForPR`, a `continue` in `getTopPRSet`, another in
  `computeSessionPRs`, another in the history grouping, and a filter in a
  private one-liner inside `SetGrid` — meant a person doing press-ups had an
  empty graph and no personal best, for ever. Fixing any ONE would have
  changed nothing visible, which is the general shape worth remembering: when
  a capability is absent rather than broken, look for the whole set before
  believing the first cause found.
  **Ashley's ruling, 16 Sep 2026, from three options: the record at
  bodyweight is MOST REPS IN ONE SET** — over session-total reps (an easy
  high-volume day beats a hard one, so the app would congratulate someone for
  going easier) and over converting bodyweight to an estimated load (one tidy
  line, but the factors are numbers the app would INVENT and then show as if
  measured — `load-prescription.ts:12` already forbids exactly that). Once a
  belt goes on, ADDED WEIGHT is the record and the reps best stays as the
  best-without-weight; they are different lifts and both are kept.
- **AND A BEST THE ESTIMATE FOUND SHOWS THE SET, NEVER A BARE LOWER WEIGHT** —
  Ashley's ruling 17 Sep 2026, from three options: *"Best set yet — 95kg x 8"*,
  over dropping it silently and over showing the estimate itself. 100kg x 5
  then 95kg x 8 is harder work at a LIGHTER weight, so the app fired a personal
  best and printed **95kg** to someone whose best is 100kg. The fix was a
  SIGNATURE: `personalBest` takes one reading over a four-case union instead of
  a metric and a loose number, because the bug was never in the renderer —
  three call sites each re-derived the value with their own ternary and two got
  the same case wrong. `bodyweight-progress` (74 checks, 8 mutations).
  NOT browser-driven: the case needs a loaded lift on today's card and the
  harness's today is all bodyweight
- **A NEW RULING CAN BREAK AN OLD ONE, AND THE COLLISION IS THE FINDING.**
  18 Sep 2026: Ashley ruled that swap options outside her training style should
  be shown below the ones that match. Building it re-created the report that
  produced her 10 Sep ruling — an unloaded option above a loaded one for a
  lift that carries weight — because the new key was outermost and the old one
  was not. A gate caught it, which is the argument for gating a ruling rather
  than only obeying it. **Do not resolve it by picking the newer one: put both
  in front of her, say which broke, and let her order them.** She chose the
  older rule and the newer one moved inward, which also changed the SHAPE of
  what had just been built — a grouped layout could no longer express the
  order, so the marker moved onto the row.
- **A HINT AND A RECORD MUST NOT LOOK ALIKE.** 18 Sep 2026, one screen along
  from the rule below and the same family: a box's placeholder is the app's
  suggestion on a row with no history and the person's own last session
  wherever they have one, drawn identically, and the reader has no way to tell.
  A prescription read as history is harmless; history read as a prescription is
  the app appearing to ask for something it never asked for. **Anywhere one
  slot can hold either, the screen says which** — and the marker goes where the
  numbers are, because moving them somewhere safer costs whatever the placement
  was for.
- **A NUMBER NEVER REACHES A SCREEN WITHOUT ITS UNIT**, and this generalises
  past PRs. Three renderers printed `${value}kg` with no branch, so a
  bodyweight best showed "0 kg" and a 12-rep best would have shown "12kg" —
  worse than showing nothing, because it looks right. The fix is that the
  KIND travels with the value and the renderer has no default branch:
  `personalBest(metric, value)` in the phrasebook, one place, so the exam and
  the gates can grade it. Any field that can hold two kinds of quantity needs
  the same treatment
- Accountability is active — the coach opens, asks how it went, follows up
  — `coach-opener`, `coach-nudge`, `session-feel`, `verify:coach-speaks-first`.
  **And from outside the app: BUILT 24 Sep 2026, NOT LIVE.** Seven switchable
  phone notifications (her 17 Sep ruling), at most one a day, 8am-9pm on her
  clock, the permission asked only from her own tap — `reach-out`,
  `verify:reminders`, `verify:reach-out-function`. Live only once the
  migration, the function deploy and the keys are done on her machine; until
  then Profile says "Not live yet" and offers no switch
- History is permanent — `diary-preservation`, `replace-without-losing`
- Every write succeeds or says it did not — `silent-writes`,
  `queue-listeners`, `stale-after-write`
- **Cardio is logged like a lifting set, on every screen that logs it** —
  Ashley's ruling 24 Sep 2026, from three options: the set row's boxes and
  mint ✓, the plan pre-filled so one tap logs it, a read-back with Undo
  ("✓ Walk · 20 min · Easy"), and effort as Easy / Steady / Hard everywhere,
  including the plan's own phrase. One shared row, so the five screens cannot
  drift apart again. Under the CSCS delegation (basis in BACKLOG): RPE ≤4 is
  Easy, 5-6 Steady, ≥7 Hard, and a plan logged as prescribed keeps its exact
  RPE. **Nothing pre-chooses an effort the app cannot know** — "Other", the
  round timer and What happened start blank. `cardio-effort` (29 checks, 18
  mutations), `rest-day-card`, `verify:rest-day`, `verify:finisher`,
  `verify:planned-activity`, `verify:mobility-filler`, `verify:round-presets`,
  `verify:what-happened`
- **AN UNDO IS A WRITE, AND IT ASKS BEFORE IT OFFERS.** 24 Sep 2026: the old
  cardio Undo cleared its row whether or not the delete happened, and the
  store's ten-minute window was measured on the APP's clock — which a dev
  override moves by days — so under every browser driver the log was pruned at
  birth, Undo did nothing, and the screen said it was gone. An Undo is drawn
  only while the store says it can work, and a window about elapsed time is
  measured on the clock that elapses
- Nothing is offered that is not built — `equipment-labels`,
  `says-what-it-contains`, `injury-coverage`, `enforcement-gaps`. **The APP
  TOUR is GUARDED for this class of claim since 14 Sep 2026** — `app-tour` §9.
  It was `UNGUARDED`, and it had already been wrong: it told every new user the
  grocery list was on the Tools tab for a day after grocery moved off it
  (12→13 Sep 2026), found by a spotlight overflowing the screen rather than by
  a check. §7 had tied four claims to their source facts one row at a time, and
  grocery fell through because nobody wrote a fifth row; §9 is the general form
  — App.tsx's own `<TabsContent>` blocks say which components are on which tab,
  so **which tab owns a feature is derived, never written down**, and no stop
  may claim a feature its tab does not provide. Proven by replaying the real 12
  Sep move. Two things it deliberately does not call lies, both learned by
  running it against CORRECT copy: naming a feature is not claiming it (the
  Nutrition stop truthfully says the water TARGET is set there while Home does
  the logging), and a sentence that names another tab is a signpost, not a
  claim about here. **And a tour line is only true on the day it is shown**:
  "leave the fields blank" was false on any plan opening with a medicine-ball
  warm-up. Ashley's ruling 24 Sep 2026: on those days the words change (type
  the weight, then tap ✓), and the spotlight covers the whole row so the box
  it asks for can actually be reached. `verify:tour-real`, `app-tour`
- Safety ships correct or not at all — `injury-adaptation-safety`,
  `joint-tag-states`, `rehab-prescribed`, `food-db-parity`, `diet-tag-sync`,
  `load-ceilings`, `set-plausibility`, `lift-plausibility`, `starting-out`
- **The coach chat is grouped bubbles** — Ashley, 26 Sep 2026, design agreed
  before it was asked for, layout only. Same sender within five minutes is one
  group, with 4px inside a group and 20px between groups. "Coach" and the avatar
  appear once per coach group, and one time per group. Cards and the typing dots
  sit inside the coach's group. **The ink on your bubble is the theme's own
  text-on-main-colour, never a fixed white**: white on the default mint is
  1.5:1. Across 81 theme × accent pairs, 75 reach 4.5:1. Coral and rose on the
  three light themes are 3.4-3.9:1 with the app's OWN pair, the same one every
  main button uses there. That is named, held to 3:1, and hers to change.
  `chat-groups`, `verify:chat-bubbles`
- Works one-handed on a phone on a gym floor — `verify:tap-targets`,
  `verify:chat-shell`, `composer-focus`, `session-continuity`,
  `installable`, `a11y`, `verify:walk`

### The rules that make the list bite
1. **A grain is whole or it is named as not.** A feature touching an
   exercise, a workout, a meal or the plan supports every operation listed
   for that grain, or the report says which it does not and why.
2. **A line is not "had" until a check proves it.** Anything without one is
   `UNGUARDED` and stays so until a check exists — never quietly upgraded.
3. **Adjustment keeps the bar.** A change path that skips the checks
   generation runs is a defect, not a shortcut.
4. **Parity is checked both ways**, against the written exceptions list once
   it exists — and until it exists, every one-sided capability is a gap.
5. **Advice quality is examined, not assumed.** The coach exam, once built,
   runs whenever the prompt, the model or the tools change.
6. **The list is a lead, not a fact.** When a line is wrong, correct it here
   and say so in BACKLOG.
7. **Adding a line is cheap; removing one is Ashley's decision, recorded.**

## Instruction handling

- "Report only", "investigate", "propose", "don't build" mean exactly that. Wait for an explicit "build it". An acknowledgement, a thumbs-up, or encouraging prose around a prompt is NOT approval.
- If a prompt's code block and its surrounding prose conflict, the code block wins. Ask rather than resolve it yourself.
- Flag any deviation from an instruction and why, in the report, unprompted.

## Asking

- Work autonomously by default. When a decision genuinely is Ashley's to make, ask her directly in the conversation — don't guess and don't wait for it to arrive secondhand.
- **EVERY CHANGE IS VIEWED THROUGH THE LENS OF A CERTIFIED CSCS COACH, and
  training questions are ANSWERED here rather than brought to her.** Ashley,
  18 Sep 2026, twice: *"Ask the questions you ask me regarding how the app
  should act should be answered from a cscs perspective. So with that in mind
  you should be able to answer them as a cscs coach would"*, and then, widening
  it: *"All changes shoukd be viewed through the lens of a certified cscs
  coach."*
  The second sentence is the bigger one. The first delegated the DECISIONS; the
  second makes the coaching read a standing review of every change, including
  the ones that raise no question at all — a refactor, a bug fix, a gate. The
  test is not "is this correct?" but **"would a qualified coach sign the plan
  this produces, for this person?"**
  - MINE now, decided and recorded, never asked: exercise selection and what is
    an acceptable substitute for what; sets, reps, load, rest, tempo and every
    floor or ceiling on them; exercise order and what gets protected when a
    session is cut; warm-up and movement prep; weekly structure — movement
    pattern coverage, push:pull, volume distribution, frequency; periodisation,
    blocks, phases, deloads, progression, calibration and re-anchoring; what
    counts as a personal best and how progress is measured; how other sport
    counts as training load; and general performance nutrition at the
    population level the app already works at — protein targets, deficit rate,
    macro split logic, meal timing.
  - STILL HERS, because the training science is neutral and the question is
    what her app is like: what the app SAYS and how it sounds; when it speaks
    and how often; how much it asks before doing something; what it is allowed
    to CLAIM about itself; anything reaching live users, money or data. "Ask
    every time or only when she sounds definite" is hers. "Sixty seconds or
    forty-five between sets" is mine.
  - NEITHER, and this is a real professional boundary rather than caution: a
    CSCS does not diagnose, treat, rehabilitate, or write clinical nutrition.
    The app's existing red-flag rule — sharp, one-sided or worsening names a
    professional and changes NOTHING — is itself the CSCS answer and stays
    exactly as it is. Deciding to have the app prescribe rehab, interpret a
    symptom, or write a diet for a medical condition is outside the delegation
    and is not mine to take.
  - **RECORD THE BASIS, not just the choice.** A CSCS decision goes in BACKLOG
    with what the standards say and why this case falls where it does — the
    same bar as every other decision here. "A coach would do X" with nothing
    behind it is an assertion, and this file's whole habit is that assertions
    get marked as such.
  - **AND IT IS STILL ASSERTION, NOT MEASUREMENT.** Reasoning as a CSCS makes a
    decision defensible; it does not make the coach's advice good. That is what
    the coach exam is for, it has never run against the current coach, and this
    delegation does not move that line one inch — rule 5 stands.
  - **THE REVIEW, so "through a CSCS lens" is a step and not a sentiment.**
    Before any change that touches what somebody is PRESCRIBED — exercise,
    load, sets, reps, rest, order, frequency, or what survives a cut — ask
    these five, and say the answers in the report:
      1. **What does it do to the training effect**, not to the number? A value
         can be correct and the stimulus still wrong.
      2. **What does it take AWAY?** Protecting one thing inside a pass aims
         that pass at whatever is left. Count the cost in the same run.
      3. **Do the fundamentals survive** — movement-pattern coverage,
         progressive overload, recovery, and specificity to the stated goal?
      4. **Does it quietly redefine an existing floor or ceiling?** A number
         that still reads the same while meaning something else is the worst
         kind, because nothing fails.
      5. **Is it inside scope** — not diagnosis, rehab or clinical nutrition?
    **FOUND BY QUESTION 4 ON ITS FIRST OUTING, 18 Sep 2026**, against work
    committed an hour earlier: protecting the movement-prep slot from the
    time-cap trimmer left the "never below three exercises" floor counting that
    slot, so the tightest days bottomed out at TWO training exercises plus a
    warm-up where they had held three. Every gate was green and the number
    three had not changed. Measured with a constructed over-budget day, not
    reasoned about.
- ASK when the decision is about how the app behaves in the ways left to her above: what the app is allowed to claim, what a user should see or be told, a trade-off between two defensible behaviours where the training science does not pick a winner, or anything in the medical/clinical band (allergens, diagnosis, mental health).
- PROCEED WITHOUT ASKING on anything mechanical: bugs, tests, refactors, measurement, data consistency, performance — anything that has a right answer.
- How to ask, which matters as much as when:
  - Ashley is non-technical. Never ask about a function, field, or file.
  - Translate to the product question underneath. Not "should coherenceGroupOf key on substitution_group" but "should the app compare shrug weights against lateral raise weights, or treat them separately?"
  - Give 2-4 concrete options and a recommendation with a one-line reason.
  - Say what happens either way, in plain terms.
  - One question at a time. Don't batch several and stall.
  - If she picks something that seems wrong, say so once, then do it.
- Keep a decision log, and keep it in TWO places so it survives: the BACKLOG.md entry for that piece of work (options, what was chosen, why, and whether she answered or it was decided unprompted), and the commit message. Not in the conversation — that dies. Not only in a code comment — nobody reads those looking for a decision. A ruling that will apply again beyond this one change goes in THIS file as well.
- Still stop and wait, even with a good default in hand: anything affecting live users, anything that changes what a metric measures, anything in the allergen or safety path.

## Writing to Ashley

Her ruling, 9 Sep 2026: *"at the end of each message going forwards I want a few
short sentences summary. because you always go into too much detail that takes
too long to read. give me short punchy answer"*.

- **Every message ends with a summary**: two or three short sentences, plainly
  headed, covering what happened, what's next, and what's needed from her. This
  is not optional and not only for long messages.
- Short and punchy above the summary too. Answer the question asked, then stop.
  If the detail matters, it goes in a file she can open, not in the reply.
- No jargon. No file names, function names, table names, or commit hashes unless
  she asked for them. Say what changes on her phone, not what changed in the code.
- Prefer one sentence over a paragraph, a paragraph over a table, and a table
  only when the shape of the answer genuinely is a comparison.
- This is about how to write, not what to check. It never shortens the
  verification behind a claim — see **Reporting**.

## Who is using this yet

Ashley, 10 Sep 2026, asked whether a corrected prescription needed a message
explaining itself: *"No live users are using the app yet. We are still in the
building phase. So just update the weight. No message."*

- So a change that alters what the app prescribes or displays does NOT need a
  migration path, a transition, or a coach message explaining itself. Fix it
  and let the new value stand.
- This is about USER-FACING transitions only. It relaxes nothing else: the
  production database is still select-only, `main` and every production deploy
  still need her explicit word each time, and the safety rules on allergens,
  injuries and load prescription are unchanged — those exist because the
  numbers must be right, not because someone is watching them change.
- Re-ask if this ever stops being true. "No live users" is a fact about today,
  not a permanent licence.

## Git and deploy

- Push finished work to the session's designated working branch (e.g. `claude/…`) without asking. Ashley ruled on this 29 Aug 2026, choosing "push it, and stop asking me about pushes" over keeping the old ask-every-time rule, because the interruption cost more than it protected. This replaces the previous "commit, never push" default.
- The relaxation is branch-scoped and stops there. `main` and anything that reaches live users still need Ashley to say so explicitly, every time: merging to `main`, any production deploy, any migration.
- Do not trust or report "N commits ahead of origin" without verifying against origin — that line has been wrong repeatedly.
- Frontend ships via push → Vercel. The Supabase edge functions (`chat-gemini`, `generate-meals`, `macro-calibration`, `onboarding-chat`) each need their own separate deploy: `npm run deploy:functions:prod -- <name>`, which asks for the `yes-production` phrase and names the target on the deploy itself. Note which is needed.

## Parallel work

- **One writer at a time in the main session.** Subagents (`investigator`,
  `engine-tracer`, `gate-runner`, `regression-reviewer`) are for
  investigation, verification and review — they read, trace and report, they
  do not edit application code. The main session is the only writer, so two
  edits can never land on the same file at once by accident.
- **Use a worktree for any session that edits files alongside another** —
  `isolation: worktree` (the `Agent` tool) or `claude --worktree` for a
  second interactive session. Two sessions editing the same checkout at once
  is how one silently clobbers the other's uncommitted work; a worktree gives
  each its own files on its own branch.
- **`engine-tracer` runs BEFORE proposing a fix** for any non-obvious bug in
  plan generation, scoring, or prescription — this repo's own history (the
  load-prescription clamp, the rest-floor mechanism, the "argument does
  nothing" claim) is full of confident fixes aimed at the wrong cause because
  nobody traced the whole call path first.
- **`gate-runner` runs AFTER any engine change**, before reporting it done —
  it runs the typecheck and the gates the diff actually touches (derived from
  `git diff`, not guessed) and says what passed, what failed, and what it
  couldn't reach.
- **The push rule is unchanged for every agent, including a worktree
  session**: push finished work to its own working branch without asking
  (see "Git and deploy" above) — `main`, any production deploy, and any
  migration still need Ashley's explicit word every time, whichever session
  or worktree the change came from.

## Handing work to Ashley's machine

Ashley runs Claude Code in VS Code against her local clone. Her ruling, 1 Sep
2026: **when something has to happen on her machine, hand her a
copy-pasteable prompt for that session, not a list of commands.** Written
after a production deploy reported success while shipping code three merges
old — the commands were right and the context was missing.

- Write the prompt for the local Claude Code to read, and make it carry the
  WHY, not just the what. That session has none of this conversation: it does
  not know what is broken, what was already tried, or what a given output
  would mean. State the goal, the symptom, and what "done" looks like.
- Say which steps that session **cannot** do. `db:push-both` and
  `deploy:functions:prod` refuse when stdin is not a terminal (`db-target.mjs`
  checks `isTTY`) — deliberately, so a wrong-target command costs a typed
  phrase. Claude Code hard-fails on them. Give it the safe half (pull, verify,
  read output back) and leave the typed confirmations to Ashley.
- Tell it what to VERIFY, not just what to run. "Remote database is up to
  date" and a named deploy target both print identically whether the work
  happened or the file was absent from the checkout. Name the specific thing
  that proves it worked.
- Keep it in one fenced block she can copy without editing.

## Database

- Two Supabase projects since 11 Aug 2026: TEST (`vswuurrtbzbrgubddefv`, the CLI's default link) and PRODUCTION (`sdkhuczcfnqqimdgfiks`, live users' data). Before that date, dev and prod shared one database with no scratch instance — that constraint no longer holds; don't rely on old notes that assume it does.
- The CLI defaults to TEST. Reaching production requires `npm run db:link-prod`, which demands typing `yes-production` — a wrong-target command should cost deliberate effort, not just a missing argument. Run `npm run db:link-test` to return to the safe default when done.
- Migrations: never run a bare `supabase db push` by hand. Use `npm run db:push-both` — the only sanctioned path. It pushes to TEST first, then (after the same typed confirmation) to PRODUCTION, and always relinks back to TEST when it finishes, success or failure. `npm run test:schema-parity` verifies both projects have applied the identical migration set; run it if drift is ever suspected.
- All DB access select-only on PRODUCTION unless explicitly told otherwise. The TEST project exists specifically so this restriction can be relaxed there — creating profiles, writing data, and running full end-to-end flows (including through the actual onboarding UI) is fine on TEST.
- Never create, modify, or delete profiles or user rows on PRODUCTION to test something. If a check needs real interaction, use TEST instead of manufacturing prod data.
- Both projects are free-tier and pause after ~7 days with no API activity. A paused project fails every request (CLI and app alike) until restored — there is no way to wake it via traffic. Restore from the Supabase dashboard: open the project, its paused banner has a "Restore project" button. Check this first if a TEST-project command fails with a connection/timeout error after a quiet stretch.

## Gates — and the habit that makes them worth having

- Checks are `npm run test:*` (logic, source properties, mocked models) and
  `npm run verify:*` (a real Chromium at 390x844 driving the actual screens).
  Anything the user SEES gets a `verify:` driver, not just a `test:`.
- **EVERY NEW CHECK IS MUTATION-TESTED, WITHOUT EXCEPTION.** Break the code it
  guards — on purpose, one change at a time — and confirm the check fails.
  Then put the code back. A check nobody has seen fail is not a check; it is a
  line that prints a tick.
  This is not theoretical. Two checks written on 9 Sep 2026 passed while the
  behaviour they guarded was gutted, because they asserted a call APPEARED in
  the file rather than that its value was used — a dead branch left the string
  in place. Both were found by breaking them, not by reading them. Earlier
  rounds caught a check satisfied by a COMMENT, and one whose regex stopped
  before the payload it meant to inspect.
- Pin the PROPERTY, not the mechanism. A check anchored on three exact lines
  fails the next time those lines move and proves nothing when they don't.
  Anchor on "the moved-day branch is tested before the rest-day branch", not on
  the text of either.
  **A mechanism-pinned check does not merely fail to catch a drift — it can
  ENFORCE it.** `test:chat-app-reality` asserted the coach prompt's Tools
  bullet MENTIONS the grocery list. The grocery list moved off Tools on 12 Sep
  2026; the prompt went stale, the gate stayed green, and on 13 Sep the
  CORRECTED prompt failed the check whose entire job is keeping the coach
  honest about the app. Re-anchored on the property — whichever components
  link to the shopping list are the ones the prompt must name, read from the
  components. When a check blocks a fix, suspect the check.
- **A CHECK MUST GIVE THE SAME ANSWER ON A TUESDAY.** The browser harness has
  ONE fixed "today" — `.tour-harness/anchor.mjs` — and every page and driver
  asks it. No harness file reads the machine's calendar; `test:harness-clock`
  enforces it, and allows `Date.now()` only as a stopwatch (elapsed
  milliseconds in a poll budget), because a blanket ban would be wrong and
  would get worked around.
  Found 14 Sep 2026 the hard way: eight drivers were red on the 13th and three
  were green on the 14th with no code change. Proven by running one driver
  twice on one machine under two timezones a calendar day apart — 0 failures in
  one, 2 in the other. **A red check is information; a check that flips with
  the calendar means green is not evidence**, and nothing about looking at it
  tells you which you have. It also meant a "these fail identically on main"
  comparison reported the night before was worth less than it claimed.
  So: **when comparing two runs, compare the number of checks that RAN as well
  as the number that failed.** A crash produces zero failures and reads as a
  pass — that happened once during this very fix.
  **AND THE SHORT RUN NEED NOT BE A CRASH — A GATE'S OWN BAIL-OUT DOES IT
  TOO.** 16 Sep 2026: a new gate hit a failed check, printed FAIL, and then
  `return`ed out of `main()` — skipping the `if (failures > 0) process.exit(1)`
  at the bottom. It exited 0 on 3 of its 28 checks, and only the mutation
  harness's "how many ran?" column showed it. So: **a gate has exactly one
  exit**, and every early return goes through it. A gate that can print FAIL
  and exit 0 is worse than no gate, because the tick is now evidence.
- Strip comments before asserting a string is ABSENT, or a note explaining why
  something was removed will satisfy the check that it was removed.
- **A MUTATION THAT DID NOT APPLY, OR THAT CRASHED, READS EXACTLY LIKE A CHECK
  THAT MISSED.** 15 Sep 2026, four times in one day. Two mutations reported
  MISSED because shell escaping silently failed and the file was never
  modified. One reported MISSED with zero failures because it named an export
  that does not exist, so the module threw at import and NONE of the 33 checks
  ran — the "compare checks that RAN" rule, one level down. One was a real
  edit that did not create the defect (it reverted 1 of 5 call sites, so the
  symbol was still used).
  So a mutation harness must, before believing a green: assert the file
  actually changed, and assert the run executed as many checks as the baseline.
  Without both, "10 mutations, 10 caught" and "10 mutations, 4 of them
  meaningless" print identically.
- **A MUTATION HARNESS THAT COUNTS ONLY THE PASSES READS EVERY CATCH AS A
  CRASH.** 19 Sep 2026, in the harness this file's own "compare how many checks
  RAN" rule asks for. It counted lines matching `ok:` — but a caught mutation
  turns an `ok:` line into a `FAIL:` line, so every genuine catch came back
  "only 31 of 34 checks ran; not a catch". Nine of twelve mutations were
  written off that way, and the three that printed MISSED were the only ones
  read as real. **Checks RAN is passes PLUS failures**, and where a gate prints
  its own "N checks ran" line, use that — a `verify:` driver's output also
  carries vite's `✓ built in 8s`, which a bare tick-counter happily counts.
  Same shape as the pgrep watcher: before believing a harness, prove its
  detector on a run whose answer you already know.
- **A MUTATION HARNESS KILLED MID-RUN LEAVES THE MUTATION IN THE TREE, AND THE
  SOURCE STILL LOOKS RIGHT.** 19 Sep 2026: I stopped a run with `pkill`, the
  `finally` that restores the file never executed, and the next browser run
  measured a defect I had already fixed — a drop overwriting its parent set,
  on a tree whose `git diff` I had read. **The grep that reassured me was the
  liar**: `grep -c "dropIndex: ref.dropIndex"` returned 1 and I read that as
  "present", when the same expression appears on TWO lines (the save and the
  delete) and the count should have been 2. Forty minutes went to re-deriving a
  bug from first principles. Two rules out of it: a harness that edits files
  restores on SIGINT/SIGTERM as well as in `finally`; and after any interrupted
  run, `git diff` the mutated file before believing anything it produces — a
  COUNT from grep is only evidence when you know what the count should be.
- **A NEW COLUMN IS A CHANGE TO EVERY READER AND WRITER OF THAT TABLE, AND THE
  ONES OUTSIDE `src/` ARE INVISIBLE TO EVERYTHING.** 19 Sep 2026: adding
  `drop_index` was fixed in the browser client, driven in a real Chromium, and
  the EDGE FUNCTION had its own independent copy of the same upsert — still
  naming the old unique constraint, so every set the COACH logs would have
  failed the moment the migration was applied, with no drop set in sight. Its
  "what did you last lift?" lookup had the twin defect: ordered by time, and a
  drop is logged straight after its parent, so it would win every time and have
  the coach quoting the drop's weight back. Neither is reachable by a typecheck
  (`tsconfig` covers `src`), a browser driver (the function is deployed), or the
  file-grep derivation (nothing in `src/` mentions it). **The derivation that
  finds them is "grep the TABLE NAME across the whole repo", not "grep the file
  I changed"** — and it costs one command.
- **A COLUMN NAMED IN A `SELECT` IS AS MUCH A MIGRATION DEPENDENCY AS ONE
  NAMED IN AN INSERT, AND THE READ IS THE DANGEROUS HALF.** 20 Sep 2026, the
  "grep the TABLE NAME" rule re-run against the other two new columns. Six
  places named `prep` unguarded, and the worst was a READ: PostgREST resolves
  column names at parse time, so `select('a, b, prep')` is rejected outright
  before the migration lands, and that particular read feeds the whole
  Nutrition tab. A pending migration would not have cost a cooking method, it
  would have cost **every meal, for everybody**, behind a "couldn't read your
  meals" the migration is nowhere near. The write half had been solved a month
  earlier in the same codebase (`added_load_kg`) and simply was not copied.
  So the pattern, both halves: **reads use `select('*')` and default in JS**,
  because `*` needs no column to exist and `row.x ?? fallback` is correct on
  both sides; **writes go through one function that retries with the key
  stripped** on a missing-column error, because a payload key IS a column name
  and cannot be omitted the way a filter can. And the predicate that
  recognises the error lives in ONE file — two copies of an error-shape test
  is how one of them goes stale against a new PostgREST message.
  The derivation that finds these is `grep -rn "select('[^*]" src/` — every
  column list in the codebase, checked against the migrations of the last
  fortnight. It costs one command and it found two more sites the same day.
- **RE-RUN A DERIVATION AGAINST THE CASES IT WAS NOT WRITTEN FOR.** The same
  day, and the reason the above was found at all. The table-name rule was
  written on 19 Sep while fixing `drop_index` and was applied only to
  `drop_index`. Run against the two OTHER columns added that week it found a
  live defect in one of them — and then, pointed at a file it had no reason to
  visit, an eighth place a drop set could take a personal best, after seven had
  been found and the set declared closed. **A rule discovered while fixing one
  case is not finished being useful when that case is fixed**; the cheap move
  is to run it across every sibling before writing it down.
- **A SENTENCE ABOUT THE APP'S OWN LIMITS IS A CLAIM, AND EVERY NOUN IN IT GETS
  MEASURED BEFORE IT IS WRITTEN.** 20 Sep 2026, writing the keto caveat. The
  natural phrasing — "keeps grains, potatoes and sugary fruit out of your
  meals" — was FALSE on its last clause: the filter blocks DRIED fruit and
  passes fresh banana, grapes and mango, which are the exact three the coach's
  own keto prompt names. A caveat that overclaims is worse than no caveat,
  because it is the app asserting a guard it does not have while appearing to
  be candid. The gate now probes each food the sentence names against the real
  filter, so the words and the code cannot drift apart.
  Two smaller rules from the same sentence. **"Yet" is a promise** — "not a
  keto split yet" commits the app to building one, and nobody had decided to;
  the gate asserts the word is absent. And **a caveat appears only where it is
  true**: under Keto and Low-carb, silent under the other twenty diets, because
  a standing warning would say the app honours them less than it does — the
  same class of untruth pointing the other way.
- **A CHECK ON A CONSTANT MUST USE A CASE WHERE THE CONSTANT BINDS.** The same
  day, found by a MISSED mutation: lowering the 50g carb floor to 20 changed
  nothing my check could see, because the profile it used (75kg, 2200kcal)
  takes carbs from the REMAINDER and never reaches the floor at all. The check
  read the right number from the wrong person. Fixed by measuring a profile
  where the floor genuinely engages — 100kg at 1500kcal, where protein and fat
  eat the budget — and asserting the clamp actually fired as a sanity check
  beside it. Same family as "a gate built from comfortable fixtures never
  reaches the code it exists to hold", one level down: here the fixture was not
  merely comfortable, it was outside the branch entirely.
- **MEASURE THE HARM BEFORE ARGUING FROM IT — AND LET THE GATE TELL YOU.** Also
  20 Sep. Excluding drops from the personal-best path is right, and the reason
  I wrote for it was wrong: "a drop beats its parent on estimated 1RM because
  Epley rewards reps". Measured, at the app's own 75% drop, a parent of
  100kg x 5 needs SEVENTEEN reps in the drop before the estimate is beaten.
  The certain case was a different metric entirely — the bodyweight REPS
  record, where a drop is an easier variation and therefore higher-rep by
  definition, so it wins immediately and always.
  **The check I wrote to prove the harm went red, and that is what caught it.**
  Writing "prove the detector on something that should fail" into a gate does
  not only protect the gate; when the failing case is the author's own
  reasoning, it is the cheapest correction available. A fix can be correct
  while its stated justification is false, and the justification is what the
  next reader inherits.
- **A ROW COUNT IS NOT A SET COUNT, AND THE INTERESTING CLAIM IS USUALLY THE
  COUNT.** The same day: a mutation letting drop rows back into
  `filterLoggableSets` came back MISSED, because the screen still drew three
  working rows — the row list is built from the PRESCRIPTION, not from the
  logs. What changed was the number the card computes and prints ("Working
  2/3" became 3/3). A driver that counts elements is asking how many boxes were
  laid out; the thing a ruling is about is nearly always the figure the app
  derives. Read the figure.
- **ONE CANDIDATE CANNOT TEST A CHOICE.** Also that day: "the offer appears
  under the LAST logged set" was checked with exactly one set logged, where it
  is indistinguishable from "under every logged set" — a mutation to precisely
  that came back MISSED. Any check on which of N things something attaches to
  needs N greater than one, and the wrong answers have to be present on screen
  at the time.
- **A UNIQUE-CONSTRAINT MIGRATION IS A CLIENT DEPENDENCY, AND THE CLIENT MUST
  WORK ON BOTH SIDES OF IT.** 19 Sep 2026. An upsert names its conflict target
  by column list; Postgres rejects one that matches no unique index (42P10).
  So a migration that REPLACES a unique constraint breaks every write naming
  the old columns the instant it is applied — and here the migration is run by
  hand, on another machine, at a time this code cannot know. There is no deploy
  order that closes the gap. The pattern that does: try the new target, fall
  back to the old one on 42P10 alone. One extra round trip before the
  migration, none after, self-healing. The existing `added_load_kg` handling is
  the same idea for a missing COLUMN and was the model for it — but a column
  can be omitted from a payload and a conflict target cannot, so the constraint
  case needs the retry rather than the omission.
- **A FIXTURE MUST BE A PLAUSIBLE WHOLE, NOT A SET OF PLAUSIBLE PARTS.** 19 Sep
  2026: a browser fixture's meals were each a sensible dish and the DAY was
  339g of protein against a 160g target. Nothing was ever inside the tolerance
  bands, so every tolerance-gated behaviour switched off at once — the variety
  sort never applied, the same dinner won every day, the new feature yielded
  every time, and the screen showed nothing. The tell is exactly that: several
  unrelated behaviours downstream of one band all going quiet together. Check
  the fixture's TOTALS against the targets it will be searched against, not
  just that each part looks real.
- **A GATE'S CHECK COUNT SHOULD BE THE SAME NUMBER EVERY RUN.** The same day: a
  gate wrapped three checks in `if (thingExists)` and a `for` over a possibly
  empty list, so switching the feature off made those checks VANISH rather than
  fail — 37 of 42 ran, which is indistinguishable from a crash and defeats the
  "compare how many RAN" habit this file already relies on. Give the dependent
  checks a null-safe value and let them fail, rather than skipping them.
  The mutation harness needs the matching rule: **a run that executed fewer
  checks than the baseline is a crash, not a catch, even when something
  failed.** One mutation ran 7 of 40, failed 5, and was counted as caught.
- **TWO MECHANISMS FOR ONE PROPERTY: MEASURE WHICH ONE WORKS BEFORE KEEPING
  BOTH.** Also 19 Sep: a preference nudge and a hard fallback were built for the
  same rule. A mutation removing the nudge came back MISSED, which sent me to
  measure rather than to write a check for it — with it in and out, across a
  200-profile grid and the gate's own fixtures, not one outcome changed. It was
  inert because it was a sort key inside a band, and the days needing help were
  outside that band. Deleted. **A MISSED mutation on a belt-and-braces
  mechanism is a question about the mechanism, not only about the check.**
- **WHEN THREE GATES GREP THE SAME EXPRESSION, THE EXPRESSION SHOULD BE A
  FUNCTION.** 19 Sep 2026: `test:calibration-search`, `test:primer-load` and
  `verify:one-number` each pinned one line of JSX deciding whether the per-set
  weight chips render. A ruling of Ashley's added a second condition to it on
  18 Sep, and all three went red at correct code — one of them silently, until
  the first full sweep a day later. Extracting the decision into a predicate
  the gates CALL fixed all three permanently and cannot go stale the same way.
  **A rule several checks need to ask about should be something they can ask,
  not something they have to read.** The repeat count is the signal: one
  mechanism-pinned check is a smell, three on the same line is a design note.
- **AN ARGUMENT THAT IS NOT PASSED AND AN ARGUMENT THAT DOES NOTHING LOOK
  IDENTICAL FROM THE CALL SITE.** 19 Sep 2026: the meal assembler took a
  day-to-day variety history, the Nutrition tab passed it `{}`, and I reported
  that as the defect and the fix as one line. Measured, the preference behind
  the argument was a `0.01` penalty in the same units as the macro-distance
  score it competed with, against a median gap of `0.033` — passing the
  argument would have moved 1.00 distinct days a week to 1.11. **Before
  reporting an unpassed argument as the bug, go and read what the code behind
  it would do if you passed it.**
  The mechanism half generalises further: **a preference expressed as a small
  constant added to the score of the thing it competes with can only ever win
  a tie.** If it is meant to decide, it is a sort KEY, gated on whatever makes
  the choice free — here, the tolerance bands the app already calls correct.
  Raising the constant is the wrong fix, because any number big enough to buy
  the preference is big enough to buy a wrong answer.
- **A CHECK COMPARED AGAINST THE CONSTANT THAT DRIVES IT CAN ONLY AGREE WITH
  ITSELF.** The same day, found by mutation: `history.length <= RECENT_WINDOW`
  passed happily when `RECENT_WINDOW` was cut from 3 to 1. A behavioural bound
  needs at least one LITERAL side — here "remembers more than just yesterday",
  written as 2 — or the check moves with the defect.
- **TWO `indexOf` RESULTS COMPARED WITHOUT ASKING WHETHER EITHER WAS FOUND.**
  Also found by mutation, also 19 Sep: an ordering check read `a < b`, a
  mutation renamed `a`'s anchor, `indexOf` returned -1, and -1 is less than
  everything. Assert both anchors exist before comparing their positions.
- **ASKING A QUESTION OF EVIDENCE YOU JUST CREATED.** The same shape, twice in
  one day: grepping a file for an identifier to see whether it was imported,
  AFTER inserting a line that used it — the only hit was the new code, and the
  check confirmed itself; and a `/record/i` over a function that matched
  `Record<string, unknown>` in its own signature. Before trusting a search,
  ask what ELSE could satisfy it: your own edit, a type, a comment, an import.
- **AN IMPORT IS NOT A USE, AND A DECLARATION IS NOT A RENDER.** Two checks
  written 15 Sep 2026 passed over the exact defect they were written for, both
  found by mutation, both the same shape — the check matched something that
  survives the break. Replacing the one CALL to a shared decision function with
  the hand-rolled expression it replaced left the `import` line untouched, so a
  bare-name check still found the name. And an ordering check comparing
  `indexOf('plannedActivity')` — the const declaration near the top of a
  component — against the form below it was true however the JSX was ordered.
  So: for a function, require `name(`; for render order, anchor on the rendered
  block; and prove the detector on something that should FAIL it, in the gate
  itself, so it cannot go vacuous later.
- **A NEW MEASUREMENT IS NOT COMPARABLE TO AN OLD ONE UNTIL IT MAKES THE SAME
  EXCLUSIONS — and disagreeing by two orders of magnitude is the tell, not the
  finding.** 18 Sep 2026: a fresh script counting weeks that hold no pushing
  movement reported 832 of 9,216 (9.03%), which reads like a defect forty times
  larger than the one being fixed. The scorer's own report showed nothing,
  because it has always asked the narrower question — a week is only missing a
  pattern its equipment and injuries could actually have supplied
  (`poolHasPush && pushSets === 0`). Some injury combinations remove every
  press from the pool, and a week cannot hold what its own constraints forbid.
  **When a new number and an existing one disagree wildly about the same
  question, suspect the denominators before the code**, and make the new one
  reproduce the old one's guards before reading anything into the gap.
- **A "HOW MANY CONTAIN ONE" COUNT IS NOT A RATE, AND THE NAME NEVER SAYS
  WHICH IT IS.** 19 Sep 2026: `frozen_week` fires on 44.1% of plans, which had
  been read and re-quoted for weeks as "nearly half of all generated weeks
  repeat themselves". Measured from one run: 42.3% of PLANS carry one somewhere
  in sixteen weeks and the RATE is **1.3%** — one slot pair in seventy-five.
  Both numbers are true; they differ by the number of chances each plan gets,
  which for a per-plan scorer rule is every slot in every week. **Any rule that
  fires once per plan reports a probability of occurrence, not a frequency**,
  and the two get further apart the bigger the plan. Report both from the same
  run, with the denominator printed beside each, so the next reader cannot pick
  the wrong one. Same family as "a new measurement is not comparable to an old
  one until it makes the same exclusions", one level up: here the exclusions
  matched and the DENOMINATOR was a different thing entirely.
- **A DETECTOR THAT CANNOT FIRE AND A THING THAT NEVER HAPPENS PRINT THE SAME
  ZERO — so run the detector over the SUPERSET first.** The same day, measuring
  whether a frozen lift was secretly progressing by some other lever: sets,
  tempo, added load and machine assistance all came back zero on all 2,480
  frozen pairs, which is either a real and important finding or four broken
  field reads. Running the identical detectors across all 186,146 slot pairs
  settled it in the same pass — sets moved on 304, tempo on 516, assistance on
  978, so three of the four demonstrably work and the zero is real. The fourth,
  added load, moved nowhere at all, so it is still unproven and the report says
  so rather than counting it as evidence. This is the measurement twin of the
  gates' "prove the detector on something that should FAIL it": **a zero is
  only a finding once you have shown the same code producing a non-zero.**
- **THE THING THE APP DOES RIGHT CAN BE THE THING THAT LOOKS BROKEN, AND
  REASONING ABOUT WHY WILL FIND THE WRONG CAUSE.** The same audit: 241 weeks
  repeated with no explanation on the card, and I had written up a two-part fix
  covering 70 of them, having REASONED about why the other 145 carried no
  recorded reason. Asking it numerically instead — what would one real notch of
  weight have cost, as a share of the load? — returned **97.9%**, because
  `exercise-plan.ts` deliberately holds load flat when a notch is over 12% of
  the current weight, and says in its own comment that this is correct. The
  defect was never the held weight; it was that the app's commonest reason for
  holding one has no field to be recorded in, so nothing downstream can say it.
  **When a measurement finds a population with "no recorded reason", the first
  question is whether the reason exists and is unrecorded, not whether the
  behaviour is wrong.**
- **A FLOOR MUST BE READ OFF THE UNBUDGETED PRESCRIPTION, NEVER OFF THE LIVE
  VALUE.** 18 Sep 2026. Three independent passes cut a rest — the day-level
  time cap, the per-block trimmer, the phase's own shift — and each floored
  what it found. Against the LIVE value a floor can only ratchet downward: the
  trimmer took a 60s slot to its 45s floor, the adaptation phase then applied
  its deliberate -15s, and the result was the 30s Ashley reported. Two floors,
  each correct alone, spending the same fifteen seconds twice. Read off the
  style's own number plus the phase's own shift instead, the same case holds at
  45 while a block that genuinely wants 40s still gets 40. **Any clamp applied
  at more than one stage has this shape** — ask what the value would be with no
  pressure at all, and clamp against that.
- **PROTECTING SOMETHING INSIDE A TRIMMER DOES NOT CREATE ROOM — IT AIMS THE
  TRIMMER AT WHATEVER IS LEFT. A measurement that counts only what a change
  BOUGHT is half a measurement.** 18 Sep 2026: stopping the time-cap trimmer
  deleting the week's last squat took squat-less weeks from 22 of 9,216 to 0,
  and every gate was green. The same run's `primer_absent` went 14 → 102 —
  eighty-six warm-ups spent to save twenty-two squats, a worse trade than the
  one it replaced. The tracked baseline was two days stale and could not
  attribute it, so it was attributed by running the same grid twice with the
  guard switched off and on behind an env flag.
  So, whenever a pass is taught to refuse: **ask what it will remove instead,
  and count that in the same run.** The fix was to protect movement prep on the
  same footing and let the pressure fall through to SETS, which is where the
  house ruling already says it belongs — but the point is that the second
  number had to exist before the trade could be seen at all.
- **SLACK IS NOT A FIX, IT IS A COVER, and removing it is how you find what it
  was hiding.** The same day: protecting rest made 17 sessions run past the
  time their trainee had set aside. The cause was years older than the change —
  every pass sizes a day against BASE reps while the per-week ramp grows the
  work inside it, and nothing ever asked again. The rest cuts had been silently
  absorbing that overrun for as long as it existed. **When a change makes a
  long-standing defect visible, the defect is the finding**, and the honest
  move is to fix it rather than restore the slack.
- **A GATE THAT GENERATES ITS OWN SUBJECT MUST SEED IT, AND MUST INCLUDE A CASE
  THAT IS ACTUALLY UNDER PRESSURE.** `test:rest-floors` was written unseeded,
  passed, and failed on its very next run against identical code, because plan
  generation picks exercises through `Math.random` unless a caller says
  otherwise. Worse than the flake: the six mutations run against it were
  worthless — three were MISSED once it was made deterministic, so a green
  mutation round had proved nothing. And the three it missed were missed for a
  second reason: the trimmers only run on a day that is OVER budget, and every
  profile the gate sampled was comfortable. **A gate built from comfortable
  fixtures never reaches the code it exists to hold.**
  **AND THE ONLY HONEST WAY TO FIND A FIXTURE THAT IS UNDER PRESSURE IS TO LET
  THE BROKEN CODE NAME IT.** 18 Sep 2026, `test:pattern-floor`: six profiles I
  picked as obviously tight ALL PASSED with the guard switched off, so the
  integration section proved nothing and only the unit checks were doing any
  work — invisible from reading it, visible the moment a mutation was run.
  Putting the defect back behind an env switch and running the real
  9,216-profile grid named four genuine offenders in minutes, every one a
  combat profile on the shortest session: the style whose own table asks the
  LONGEST rests meeting the smallest budget, which is not a combination anyone
  would guess. Pin those, seeded with the same key the measurement used.
  **The cheap companion, and do both**: where the pass is exported, hand it a
  constructed input already in the failing state — deterministic, instant,
  guaranteed under pressure. The constructed case proves the mechanism; the
  measured offender proves it matters in a real plan.
- **A DRIVER'S CHECK COUNT IS CONSTANT, OR ITS MUTATIONS ARE WORTHLESS — and
  "open everything" is a lie on a surface that keeps ONE thing open.** Three
  browser-driver lessons from one afternoon, 19 Sep 2026, all of them the
  harness's standing rules met again. (1) Wrapping the detail checks in
  `if (found)` meant a broken feature printed 3 checks instead of 9, and the
  mutation harness refused to score it as a catch — correctly: a short run is a
  crash, not a finding. Every check runs every time, with a null-safe subject.
  (2) `element.click()` on a day row opened and shut it within one tick; a
  dispatched mouse click at the row's centre works. (3) The browse surface
  keeps one day and one exercise row expanded, so a loop that "opens every day"
  opens exactly one per screen — 60 days read as 15. **Before believing a
  driver walked something, print how many things it actually opened and assert
  the number is bigger than the number of screens.**
- **A CONTROL THAT WRITES AND DOES NOT REDRAW IS A DEAD CONTROL, and no gate
  and no type can see it.** 17 Sep 2026: "Add Set" wrote the new row into the
  stored session record correctly, and no pixel moved — nothing subscribes to
  that store, so the box appeared later, whenever something unrelated
  re-rendered the card. It had behaved that way since it was written. The
  write succeeded, the value was right, the source read fine, and on a phone
  the button was dead. Found by tapping it in a browser and counting rows.
  **Anything stored outside React that a screen must react to needs a state
  mirror beside the durable copy** — and the way to find the next one is to
  tap the control and look, not to read the handler.
- **TWO ROWS MUST NOT SHARE ONE SPOKEN NAME.** The same day: the tick button
  said "Save set 2" on both the warm-up row and the working row, because its
  label keyed on the number alone. Identical for a screen reader, and
  identical to every driver — one of them logged the wrong row and made three
  unrelated checks look broken. **When a list gains a second kind, every label
  keyed on position becomes ambiguous**, including the ones only a screen
  reader hears.
- **A DRIVER WHOSE SUBJECT IS DELIBERATELY DELETED IS REPLACED, NOT
  RE-ANCHORED.** `verify:ramp-ticks` measured a control Ashley's ruling
  removed. Re-anchoring it would have meant inventing a subject; deleting it
  would have dropped the coverage. It became `verify:ramp-readonly`, holding
  the OPPOSITE property on the surface that still shows the block. And the
  fourteen source checks behind it were the strongest case yet of the rule
  above: left standing, they would have made the dead code impossible to
  delete — a gate ENFORCING what nothing renders.
- **A BROWSER DRIVER FINDS THINGS NO `test:` GATE CAN, AND THEY ARE NOT SMALL.**
  15 Sep 2026, two in one run, both on a card that every source check passed:
  a new control was on the wrong component (`RestDayCard` renders only when the
  plan has NO row for a day; a scheduled-but-empty day gets `ActiveRecoveryCard`
  — and that is exactly the day the feature was for), and after the write the
  card showed TWO prescriptions stacked, leaving the reader to guess which was
  the session. Neither is visible from the data or the source; both are obvious
  in one screenshot. When something new appears on a screen, the driver is not
  the last step after the gates pass — it is the step that finds the defect.
- **A `verify:` DRIVER ONLY SEES WHAT ITS HARNESS PAGE RENDERS, AND THE
  HARNESS IS NOT THE APP.** 16 Sep 2026: I added two checks asking whether the
  rebuild offer was visible and whether anything was stacked on top of it. Both
  went red, which read as every rebuild offer in the app being hidden under a
  panel — a serious, long-standing defect. It was the harness. The testid the
  checks queried is rendered by `.tour-harness/profile.tsx`, a bare div under
  the page's own button; the app's real offer is a Dialog in `App.tsx` raised
  from the same callback. I had measured test scaffolding and nearly "fixed"
  the app for it.
  So, before believing a driver result, ask WHICH FILE renders the node being
  measured. A harness page can carry the real component and still substitute
  its own chrome around it, and that substitution is invisible from the driver.
  The split worth keeping: a harness like this DOES prove the real screen
  raises the offer and what words it carries; it can prove nothing about
  whether the app's own dialog appears, because no harness page boots
  `App.tsx`. Write which half you have next to the checks, and **never make the
  harness render a copy of the app's chrome to satisfy a check** — that
  measures the copy.
- **A HARNESS FIXTURE THAT HAND-BUILDS THE THING UNDER TEST IS TESTING ITSELF.**
  18 Sep 2026, the sharpest version of "the harness is not the app" yet. The
  `?prep=1` fixture wrote `load.display`, `load.starting_weight_kg` and
  `load.per_set` straight onto a slot instead of calling the function
  generation calls — so `verify:prep-weight` had never once exercised the
  primer branch, and every green run proved the FIXTURE's number reached the
  screen. Nothing about it looked wrong: the values came from a real
  `prescribeLoad`, the card rendered, the checks passed.
  **The only symptom was a MISSED mutation** — doubling the log box's
  placeholder changed no pixel, because the fixture was supplying a per-set
  ladder the real path no longer produces, so the row never reached the broken
  line. Reading the fixture would not have shown it; mutating the code it
  claims to cover did.
  So: **a fixture may choose the INPUT but must never assemble the OUTPUT.**
  Put the bell in the slot by name, then let the app decide what that slot
  carries. And when a driver's mutation comes back MISSED, suspect the fixture
  before the check.
- **A FAKE THAT IGNORES FILTERS CANNOT SEE A MISSING FILTER — and on a
  service key, the filter IS the privacy.** 24 Sep 2026: the reach-out smoke
  test ran the real function against a fake database that returned the same
  rows whatever the query asked, so reading on the server's calendar instead
  of the person's came back MISSED, and so would dropping the person filter
  from a read. The server reads with a key that bypasses row-level security,
  so "every read names this person" is the ONLY thing keeping one person's
  logs out of another's notification. Fixed by recording what was ASKED and
  checking that, not what came back. **Any fake standing in for a query must
  be asked what it was asked**, or everything the query decides is invisible.
- **A MUTATION HARNESS THAT REBUILDS A BUNDLE MUST REBUILD AFTER RESTORING
  TOO.** 17 Sep 2026: the browser mutation runner restored the source file in
  its `finally` and left the MUTANT bundle sitting in `.tour-harness/dist`. The
  next driver run measured the break that had just been undone — a clean tree
  failing a check it passed ten minutes earlier, with the source visibly
  correct. It reads exactly like a real regression and is worth ten minutes of
  hunting before anyone thinks of the bundle. Same family as "the harness is
  not the app", one level down: **the thing a driver measures is the last
  build, not the working tree.**
- **NEVER `git stash` A TREE A BACKGROUND JOB IS STILL WRITING — and after any
  interrupted mutation run, work out which side of the diff is the good one
  before restoring either.** 20 Sep 2026, and it came within one command of
  shipping a mutation. I stashed to measure a bundle baseline on a clean tree
  while the mutation harness was still running; its `finally` never executed,
  so the stash captured a MUTATED file and the working tree kept the restored
  one. I then read `git diff stash@{0} -- <file>` backwards — in that form the
  stash is the `-` side and the working tree is the `+` side — concluded the
  stash held the good copy, and restored the mutation over the fix.
  **What caught it was a grep whose expected count I knew**: the duration span
  must appear exactly once, and it appeared zero times. That is the 19 Sep note
  used as intended rather than relearned. Two rules: measure a baseline on a
  separate `git worktree`, which touches nothing; and when a diff decides which
  copy survives, name which side is which before acting on it.
- **A MUTATION CAN APPLY, RUN, AND STILL NOT CREATE THE DEFECT.** A third kind
  beyond "did not apply" and "crashed", and the harness cannot see it: on
  15 Sep a mutation to the walking plan's day builder read MISSED because the
  mesocycle RE-STAMPS every `plannedActivity` from `startingOutActivity(block)`
  further downstream. The file changed, every check ran, the gate was right.
  Before believing a MISSED, ask whether the value you broke is the one the
  gate reads, or whether something later writes over it.
- **A CHECK'S FIXTURE MUST BE MEASURED, NOT PLAUSIBLE.** The DST day-walk gate
  needed times where a fixed 86,400,000 ms step actually misbehaves, and which
  side of midnight that is depends on which way the clocks moved AND which way
  the walk runs. My first two fixtures looked obviously right and the old
  buggy code passed both. Run the OLD code against the candidate fixture and
  read what it produces before writing the assertion.
- **A QUOTE CLASS MUST RESPECT WHICH QUOTE OPENED THE STRING.** `[^'"`]` stops
  at the apostrophe in "That's", truncating the match. It cost two separate
  false results on 15 Sep 2026 — a reddened baseline and a safety string
  reported missing. Use `(['"`])((?:(?!\1).)*)\1`.
- New check → register it in `package.json` → mutation-test it → say in the
  report how many mutations were tried and how many were caught.
- **THE GATES TO RE-RUN ARE THE ONES THAT READ THE FILES YOU TOUCHED, AND THAT
  SET IS DERIVABLE — DERIVE IT, DO NOT RECALL IT.** 19 Sep 2026: a commit
  changed `meal-generation.ts`; I ran thirteen gates chosen by what the work
  felt like it was about, and `test:dashboard` — which reads that file — was not
  among them. It sat red at the branch head for a day and was found by the
  pre-merge sweep. `grep -rln <file> scripts/*.ts` named all twenty readers in
  one command, and every one of them ran green in a minute. **Picking the
  affected gates from memory is how a red one hides; one grep is the whole
  cost.**
- **DERIVE THE GATES FROM EVERY FILE IN THE COMMIT, NOT ONLY THE ONES NEW TO
  IT.** 20 Sep 2026, and the derivation habit worked right up to the last step.
  A commit touched six files; I had already derived and run the gate set for
  `SetGrid.tsx` earlier in the session, so when the commit added five more
  files I derived for those five and re-ran their readers. `SetGrid.tsx` had
  ALSO changed again in that same commit, and `test:bounds-and-boundaries` —
  which reads it, and which I had run green an hour before — went red and
  stayed red until the pre-merge sweep found it.
  **The derivation is per COMMIT, over `git diff --name-only`, not per "what is
  new since I last thought about this".** Having already run a file's gates is
  not a property of the file; it is a property of a version of it that no
  longer exists.
- **AND SOME GATES READ NO SOURCE FILE AT ALL, SO NO GREP WILL EVER NAME
  THEM.** 23 Sep 2026: `test:bundle` measures the BUILT app, so any change
  under `src/` is a change to what it reads, and the file-grep derivation can
  never find it. Two commits were pushed with it red that day — one kilobyte
  over a ceiling that had one kilobyte left. **Every `src/` change runs
  `test:bundle`**, and the catalogue (`exercise-db.ts`) is read by nearly every
  gate, so a catalogue change is a full sweep, not a derived set: the six
  machines shipped after 15 hand-picked gates and six more were red at the
  next sweep.
- **A FIX MADE IN RESPONSE TO A SWEEP IS NOT COVERED BY THAT SWEEP.** 16 Sep
  2026: yesterday's sweep found two real failures, both were fixed, and the
  sweep was reported clean without being re-run. One of those fixes — pulling a
  duplicated branch into a shared function, which a gate had ASKED for — broke a
  different gate that required the two to sit within 200 characters of each
  other. It was red at the branch head for a day. Re-run at least the gates that
  touch what the fix touched, and say which.
- **`npx tsc --noEmit` COVERS `src` ONLY.** `tsconfig.json` is
  `include: ["src"]`, so nothing type-checks `scripts/`. Measured 16 Sep 2026: a
  duplicate `const` in a gate passed `tsc` clean and was caught by esbuild when
  the gate was RUN. So "typecheck clean" has never been a statement about the
  gates, and must not be reported as one — what proves a gate compiles is
  running it.
- **A BUDGET WITH HEADROOM SILENTLY SPENDS IT, and the comment goes on
  claiming the original figure.** A ceiling only speaks when it is CROSSED, so
  "this keeps ~8 kB of headroom" is a claim about the day it was written and
  nothing else. 15 Sep 2026: `test:bundle`'s re-download ceiling had been moved
  twice, each time to 8 kB above a measured value, and its note still said 8 kB
  — but the real headroom had eroded to 1 kB, so a one-kilobyte change tipped
  it and looked like the cause. It was the last straw. The app-chunk budget was
  quietly doing the same thing (918 of 920) and nobody had noticed either.
  So: when a budget is raised, record the value MEASURED THAT DAY, not the one
  inherited from the note; and when one fails, measure the baseline on a clean
  checkout before believing the change in front of you caused it. I guessed
  twice at the cause here and was wrong both times.
  **17 Sep 2026, the FOURTH occurrence, so the rule gains a second half: a
  ceiling must report its remaining room on EVERY run, not only when it is
  crossed.** The same note had gone stale again (20 kB of claimed headroom, 2
  kB real, eroded overnight by work that never touched the ceiling). Writing
  the rule down three times did not stop it, because the information simply was
  not on screen. `test:bundle` now prints a headroom line per budget; the first
  printing was the finding — all four budgets sat within 4 kB of their line and
  only the crossed one had said anything. Any check with a threshold that gets
  moved should print its margin the same way.

### What a full sweep costs, so it is neither skipped nor stumbled into

- The whole suite is roughly an hour, and almost all of that is ONE check:
  `test:quality` (the plan-quality scorer, ~22 minutes, 9,216 profiles).
  `test:audit` is about two minutes. **Everything else runs in seconds.**
- So: run the handful of affected checks while working — they are instant —
  and the full sweep once, before a merge. Run it in the background and do
  something else; do not sit and watch it.
- **NEVER RUN A FULL SWEEP AGAINST A TREE YOU ARE STILL EDITING — it measures
  no single state, and its failures cannot be attributed.** 19 Sep 2026: a
  sweep was started as the pre-merge check and then work continued for an hour
  while it ran. Of its 8 failures, three were environmental, two were gates
  already fixed before the sweep reached them, ONE was a real consequence of a
  deliberate rename — and two were browser drivers that had built their bundle
  during the ninety seconds `ExerciseRow.tsx` held a syntax error mid-edit.
  Both passed on the next run against a settled tree. **Every `verify:` driver
  builds from the working tree when it starts, so a sweep overlapping an edit
  session is sampling a different codebase per gate**, and the log gives no way
  to tell which. Start the sweep when the tree is finished and leave it alone,
  or accept that what comes back is a list of leads rather than a result.
- **AND THE LOG MUST BE ITS OWN FILE.** The same sweep appended to a path a
  previous session had already used, so `grep -c PASS` counted both runs and I
  reported 30 passed, then 95, from a log that was two runs deep. The
  scratchpad survives between sessions; a run that appends is a run whose
  numbers are unreadable. Write to a fresh, timestamped file, and read the
  count back from the run's own SWEEP START line.
- **A BROWSER DRIVER IS NOT FOUND BY GREPPING FOR THE FILE YOU CHANGED.** The
  same day, one level down from the rule above: the habit of deriving affected
  gates with `grep -rln <file> scripts/*.ts` missed every `.tour-harness/*.mjs`
  driver, because a driver names what is ON SCREEN — a testid, a label, a
  sentence — and never the source file that renders it. Renaming a row label
  from `W1` to `R1` broke `verify:warmup-rows` and the derivation could not
  have found it. **So the derivation has two halves: grep the scripts for the
  file, and run the drivers for the SCREEN.** A change nobody can see needs
  only the first.
- **A KILLED SWEEP'S LOG IS INDISTINGUISHABLE FROM A RUNNING ONE. Check the
  PROCESS, not the file.** 15 Sep 2026: I reported a full sweep as "27 of 234
  done" against freshly merged code while nothing was running — the log
  belonged to a sweep I had killed hours earlier. A sweep only writes its
  "SWEEP DONE" line at the end, so a log that stops early looks exactly like
  one still being written, and the partial PASS lines read as progress. A
  watcher that waits for the finish line therefore waits forever and reports
  nothing wrong. One `ps` settles it. Any background wait on a sweep must
  check the process is alive on every poll and say so when it is not.
  This is the "a crash reads as a pass" rule one level up: there, zero
  failures looked like success; here, a dead run looked like a live one.
  **AND THE PROCESS CHECK ITSELF CAN BE WRONG, IN THE OTHER DIRECTION.** 18 Sep
  2026: a watcher reported "PROCESSES GONE — the run died" while the sweep was
  sitting at 99.7% CPU with three of four shards already written. The cause was
  one character: `pgrep -f "quality-score\|run-audit"` — pgrep takes an ERE,
  where alternation is `|` and `\|` is a literal backslash, so the pattern
  matched nothing and "no match" was read as "no process". It failed safe this
  time, but a false death report is still a false report, and the next one
  could be a false green. **Before believing a watcher, prove its own detector
  finds the thing while it is definitely running** — the same "prove the
  detector on something that should fail" habit the gates already use.
  **And prove it does not find ITSELF**: 24 Sep 2026, a watcher's `pgrep -f`
  pattern appeared in the watcher's own command line, so it would have seen a
  live process for ever. `pgrep -f "[t]imeout 600 npm"` matches the sweep and
  not the line that contains it.
- **THREE checks ALWAYS fail in a cloud session and are not your problem:**
  `test:meal-quality`, `test:schema-parity` and `verify:rls`. All three need a
  live database this machine cannot reach. Report them as environmental rather
  than investigating them from scratch every session.
  CORRECTED 20 Sep 2026, measured: this said each prints the same cause
  verbatim, *"Host not in allowlist: …supabase.co"*. Two do. `test:schema-parity`
  does NOT — it prints *"Failed to link to TEST (…). Nothing was run against
  it."* So a reader following this line's own instruction (read the output for
  the allowlist sentence) would not find it, and could reasonably conclude the
  failure was real. Both wordings are the honest "I proved nothing" shape; what
  was wrong was claiming they are the same string.
  AND AGAIN 24 Sep 2026: in a session with NO Supabase variables set at all,
  neither prints the allowlist sentence. `test:meal-quality` says
  *"VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY must be set"* and `verify:rls`
  says *"No database to read, and no key given."* Same cause, a third and
  fourth wording — so read each output for ANY "I could not reach it"
  sentence, not for one string.
  CORRECTED 17 Sep 2026, measured: this line said TWO for weeks and named only
  the first pair. `verify:rls` has the same cause and was simply never in a
  reported sweep here. **The shape is the one this file keeps relearning: a
  count written once goes stale silently, because nothing re-derives it.** The
  honest way to confirm the set is to read each failure's own output for the
  allowlist sentence, not to tick names off this list — a real failure could
  hide behind a name that happens to be on it.
  `verify:rls` is worth knowing about for a second reason: it refuses to pass
  on an unreachable database and says so — *"INCONCLUSIVE… this run proves
  nothing. Nothing here says your data is safe, and nothing here says it is
  exposed."* It used to print PASSED over 28 failed connections. That is the
  model for every check that can lose its subject.
- The sweep REWRITES `audit-report.txt`, `quality-report.txt` and
  `differentiation-audit-report.txt`. Revert those three before committing
  unless the change is genuinely about them.

## Where things are

Orientation, so a session does not spend its first half hour rediscovering the
same six files. Sizes are why it matters: these are not files to read whole.

- `src/lib/exercise-plan.ts` (~7k lines) — plan generation. Equipment tiers
  (`EQUIPMENT_SETS`, `isEquipmentAllowed`), the constrained pool, load ceilings,
  session sizing. The heart of the app.
- `src/lib/exercise-db.ts` (~5k lines) — the exercise catalogue itself, one
  object per movement.
- `src/lib/load-prescription.ts` (~2k) — how much weight is prescribed, and
  every clamp on it. Safety-adjacent: plan before building.
- `src/lib/onboarding-slots.ts` (~1.2k) — every setup question, its options and
  its user-facing wording, plus `assembleProfile`, the ONE place answers become
  a profile.
- `supabase/functions/chat-gemini/index.ts` (~3.4k) — the coach: tool
  declarations, one handler per tool, and the entire system prompt as one
  template literal in the middle. `_shared/` holds what the four functions
  agree on; `tool-reply.ts` is the second pass that gives the coach its voice.
- `src/components/ChatAssistant.tsx` (~4.6k) — the client half of the coach:
  proposal cards, confirm and undo.
- `src/App.tsx` (~2.7k) — profile load and restore, and the onboarding INSERT.
  That insert is column-by-column: a new profile column MUST be named there or
  it is written once and never read back.
- `BACKLOG.md` — newest first, the record of what was found and decided.
  `VISION.md` — the product bar. `docs/plans/` — one file per non-trivial build.
- The app's coach runs on **Gemini** (`_shared/gemini.ts` names the model), not
  on Claude. Do not confuse the model writing the code with the model in the app.

## What "finished" means here

Not done until all of it is true. A piece of work that stops early is worse
than one not started, because it looks finished in the log.

0. **The CSCS review above has been done on anything that changes a
   prescription, and its answers are in the report.** It is first because it is
   the one step that asks whether the change is right for the person training,
   rather than whether the code is right.
1. The affected checks pass, and any NEW check has been mutation-tested.
2. `npx tsc --noEmit` is clean, and a full sweep has run before a merge.
3. Anything visible has been driven in a real browser at phone size — a
   screenshot read, not a build that succeeded.
4. BACKLOG.md has an entry: what was wrong, what changed, what was decided by
   whom, what was verified and what was not.
5. Committed, and pushed to the working branch.
6. The report says which deploys it needs — frontend on merge, and each edge
   function by name — and what was proven LIVE versus proven by test.
7. Anything left undone is named, not omitted.

## Safety-adjacent work

- Dietary enforcement, injury filtering, and load prescription always get a plan before a build, even when the fix looks obvious.
- **A rule that distrusts the model will sometimes block something legitimate.
  The answer is a better SOURCE, not a weaker rule.** 15 Sep 2026: the 14 Sep
  rule "never write an exercise the user did not name" also blocked every
  correction, because "actually it was 60kg" names no lift and never can. The
  fix was not to relax the rule for corrections — it was to take the name from
  the app's OWN log instead of the model's word, which keeps the rule intact
  and makes the branch unable to cause the harm it guards against. When a
  safety rule closes a path it was not aimed at, look for the fact the app
  already holds.
- **Pain is triaged before it is acted on, everywhere it is reported.** Ashley's
  ruling, 15 Sep 2026, from three options: ask which kind, then act. A niggle
  eases that area off for a few days and reverts on its own; something that has
  been there a while goes on the injuries list so every future plan avoids it;
  **sharp, one-sided or worsening names a professional and changes nothing —
  not the plan, not the record.** She rejected acting today-only and recording
  nothing ("the app never learns"), and treating every ache as an injury ("one
  sore session rewrites the block").
  This is a rule about the APP, not about one screen: any surface that lets
  somebody say something hurts asks the same three, and the third answer is
  never a plan change. Held in `src/lib/edit-reason.ts` (`HURT_KINDS`,
  `RED_FLAG_ADVICE`), driven by `verify:hurts`. The coach already held the same
  line in its tool descriptions; whether it OBEYS is model behaviour and stays
  asserted until the coach exam runs.
- **A branch that must never change anything is checked on both halves.** What
  it SAYS and what the screen shows afterwards — because a build that printed
  the right sentence and quietly rebuilt the week passes either check alone.

## Reporting

- Report the verified state, not that a command exited 0. Say what was proven live versus proven by construction or by test.
- Browser-harness clicks: verified working 11 Aug 2026 (field focus, typing, and two state-changing clicks all registered correctly). History: this harness failed to register synthetic clicks for an extended prior period, the cause was never root-caused, and the recovery is unexplained. Treat "working" as the current observed state, not a permanent fix — if clicks stop registering again, re-test before concluding anything, rather than assuming either "still broken" or "still fixed."
- **A FAILING CHECK'S NAME IS NOT ITS FINDING.** It says a property does not
  hold; it does not say which way it broke. 15 Sep 2026 I reported "a
  correction adds sets instead of replacing them" off a check called "the wrong
  sets are REPLACED, not added to" — nothing was being written at all, and the
  observed values printed on the same line said so. Read the values, not the
  label.
- **A WRITTEN FINDING IS A LEAD, NOT A FACT. Re-measure before fixing from it.** BACKLOG said `verify:tap-targets` failed on Home with "2 of 87 controls under 44px". Re-run 9 Sep 2026: 5 of 87, across three tabs, only one of them on Home — the "28px numeric input" was on Exercise. Fixing from the note would have fixed the wrong screen and left three real ones. When a note turns out wrong, correct it where it sits AND say so in the new entry; a stale line that nobody contradicts gets believed twice.
- If a metric's scale, denominator, or threshold changes, say so — prior numbers stop being comparable.
- If you retract or correct an earlier claim, say how you reached the wrong one — which file you read, what you skimmed, what you assumed. The correction is worth more than the retraction: it tells us whether the same error shape is sitting in other conclusions.
