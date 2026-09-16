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
  that warns before it clamps — `load-ceilings`, `load-ceiling-units`,
  `per-side-load`, `single-implement`, `load-display`, `loadless-notes`
- The time cap is kept, and a shortfall says why — `session-length`,
  `session-shortfall`, `cardio-share-score`, `main-lift-rest`
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
- Meals hit targets from real foods, varied, dislikes honoured, allergens
  filtered with stated limits — `food-dislike-is-a-ban`, `food-db-parity`,
  `diet-tag-sync`, `meal-swap-rotation`, `meal-addition`, `meal-food-add`
- Grocery list follows the meals — `grocery`
- A measured floor for meals — `meal-quality` exists but needs a live
  database, so it NEVER runs in a cloud sweep: `UNGUARDED` in practice

**Changing one exercise** — every operation, from the screen AND the coach
- Replace it, today or for the block; alternatives real, on other
  equipment; a loaded lift never replaced by an unloaded one by default —
  both surfaces; `swap-target`, `slot-replacement`,
  `single-implement`, `verify:swap-request`
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
  from the bottom up, until it fits. Never below three exercises. `today-only`,
  `verify:shorten-today`, `edit-keeps-the-bar`, `session-shortfall`,
  `what-happened`, `coach-volume-schedule`.
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

**Changing the whole plan**
- Start again — `screen only` (New Plan; `reset-clears-draft`)
- Days, equipment, injuries (add / lasting / recovered), goal, style,
  volume, other sports — both surfaces, proposed and confirmed —
  `rebuild-offer`, `profile-restore`, `coach-volume-schedule`,
  `injury-rebuild`, `enforcement-gaps`, `concurrent-activity`
- Session length — `screen only`; targets and macro mode — `screen only`
- Onboarding answers and the Profile screen. **As of 14 Sep 2026 there are no
  locked answers left** — every one can be corrected. The history is kept
  because each unlocking needed a different road and the reasons are the useful
  part. CORRECTED 13 Sep, again 14 Sep:
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
  MODEL's own voice is still `UNGUARDED` and still unmeasurable here: every
  tone probe posts to the deployed function and needs credentials a cloud
  session does not have, and the coach exam grades ADVICE, not voice, by
  design (`docs/coach-exam-rubric.md:7`). Measured first in
  `docs/audits/the-coachs-own-words-2026-09-15.md`: three grammars for one
  job, eight wordings of one failure, three narrators in one file
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
  before any of this was fixed, and the comparison is the point. 20 cases and
  37 turns (`coach-exam:run`); NINE hard rules checked in code and five
  judged dimensions marked against `docs/coach-exam-rubric.md`
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

### Across all three
- Onboarding asks each question once; every answer can be changed later —
  `onboarding-corrections`, `profile-restore`. CORRECTED 14 Sep 2026: this said
  "eight answers cannot (above)", which the section above had already stopped
  saying — the last of the eight was unlocked that day. Every answer can be
  changed now
- Progress is visible — history, PRs, weight trend, streak —
  `exercise-history`, `dashboard`, `activity-streak`, `home-week-strip`
- Accountability is active — the coach opens, asks how it went, follows up
  — `coach-opener`, `coach-nudge`, `session-feel`, `verify:coach-speaks-first`
- History is permanent — `diary-preservation`, `replace-without-losing`
- Every write succeeds or says it did not — `silent-writes`,
  `queue-listeners`, `stale-after-write`
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
  claim about here
- Safety ships correct or not at all — `injury-adaptation-safety`,
  `joint-tag-states`, `rehab-prescribed`, `food-db-parity`, `diet-tag-sync`,
  `load-ceilings`, `set-plausibility`, `lift-plausibility`, `starting-out`
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
- ASK when the decision is about how the app behaves: what a coach should do in a situation, what the app is allowed to claim, what a user should see or be told, a trade-off between two defensible behaviours, or anything safety-adjacent (allergens, injuries, medical, mental health).
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
- **A BROWSER DRIVER FINDS THINGS NO `test:` GATE CAN, AND THEY ARE NOT SMALL.**
  15 Sep 2026, two in one run, both on a card that every source check passed:
  a new control was on the wrong component (`RestDayCard` renders only when the
  plan has NO row for a day; a scheduled-but-empty day gets `ActiveRecoveryCard`
  — and that is exactly the day the feature was for), and after the write the
  card showed TWO prescriptions stacked, leaving the reader to guess which was
  the session. Neither is visible from the data or the source; both are obvious
  in one screenshot. When something new appears on a screen, the driver is not
  the last step after the gates pass — it is the step that finds the defect.
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

### What a full sweep costs, so it is neither skipped nor stumbled into

- The whole suite is roughly an hour, and almost all of that is ONE check:
  `test:quality` (the plan-quality scorer, ~22 minutes, 9,216 profiles).
  `test:audit` is about two minutes. **Everything else runs in seconds.**
- So: run the handful of affected checks while working — they are instant —
  and the full sweep once, before a merge. Run it in the background and do
  something else; do not sit and watch it.
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
- **Two checks ALWAYS fail in a cloud session and are not your problem:**
  `test:meal-quality` and `test:schema-parity`. Both need a live database this
  machine cannot reach. Confirm by stashing your changes and re-running — they
  fail identically on untouched code. Report them as environmental rather than
  investigating them from scratch every session.
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
