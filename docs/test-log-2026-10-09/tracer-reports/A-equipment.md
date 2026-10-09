# A · Equipment — root-cause report

Tracer: read-only. Nothing under `/home/claude/app` was edited. Bugs covered: **H1, H2, H3, H18, L12, L14, M32**, plus the Run 2 updates to H2/H3 and H18.

Three read-only `npx tsx` scripts were run from the scratchpad (they import the app's own functions and print). Where a claim below says **RAN**, it came from one of those; **READ** means read in source; **INFERRED** means not provable from code alone.

## The one-paragraph answer

Sam's kit (dumbbells + flat bench) **cannot be expressed by any of the four tiers**, and nothing else in the app records ownership of an item. Measured against the 210-exercise catalogue (RAN): `minimalist` allows **39 exercises he cannot do** (19 band, 7 backpack, 6 pull-up bar, 2 kettlebell, 5 small items) and **removes 6 he can** — every dumbbell movement that needs a bench, including `Dumbbell Rows`, the only loaded dumbbell row in the catalogue. `home_gym` allows **59** he cannot do. That single fact produces H1, the "nothing to change" answer in H2, the coach's dead end in H3, and the band/kettlebell replacements in H11. The fix is one optional per-person **kit list** read at the engine's existing equipment choke point. It can ship **without a database migration**.

---

## Answers to the seven questions

### 1. How the onboarding answer becomes a tier

| Hop | Where | What happens |
|---|---|---|
| Model maps free text | `supabase/functions/onboarding-chat/index.ts:261` | The prompt's own worked example: *"just some dumbbells at home" → equipment=minimalist, because minimalist already assumes dumbbells, kettlebells, bands, a pull-up bar and a weighted bag; home_gym assumes a barbell, a rack and a bench on top of all that* |
| Client validates | `src/components/onboarding/ConversationalOnboarding.tsx:801-840`, slot def `src/lib/onboarding-slots.ts:755` | `set_slot(equipment, …)` must be one of four values (`isOneOf(EQUIPMENT_OPTIONS)`). There is no fifth value and no second equipment slot |
| Profile | `src/lib/onboarding-slots.ts:1107` | `equipment_access: data.equipment!` |
| The 24 kg | `onboarding-slots.ts:872-874`, `:1129`; guard `src/lib/onboarding-ceiling-capture.ts:47-57` | "up to 24kg each" was captured correctly as `max_dumbbell_kg = 24` |

**Why Minimalist and not Home gym:** Sam said "no barbell", and Home gym is described to the model as barbell + rack + bench. The model followed the worked example. Neither tier is right, and the prompt's fallback rule (*"Mapping unclear or between two values → do NOT set_slot"*, `:262`) did not fire because the example at `:261` makes dumbbells look certain.

**What each tier contains, exactly** (`src/lib/exercise-plan.ts:328-346`):

| Tier | Set | Exercises allowed (RAN) |
|---|---|---|
| `full_gym` | `null` = everything | 210 |
| `home_gym` | barbell, dumbbells, dumbbell, bench, incline bench, pull-up bar, dip bars, kettlebell, resistance band, plyo box, ab wheel, bodyweight, EZ bar, squat rack, trap bar, medicine ball, jump rope, weighted backpack | 152 |
| `minimalist` | kettlebell, resistance band, bodyweight, dumbbells, dumbbell, pull-up bar, jump rope, medicine ball, plyo box, ab wheel, weighted backpack — **no bench** | 126 |
| `bodyweight` | bodyweight, pull-up bar, weighted backpack | 81 |

`isEquipmentAllowed` (`exercise-plan.ts:732-738`) requires **every** listed implement unless the entry is `equipment_alternatives` (then any one).

### 2. Is there any per-item ownership record today?

**No.** What exists is three **weight ceilings** and one flag, added by `supabase/migrations/20260826140000_add_load_ceilings_to_profiles.sql`:

- `max_dumbbell_kg`, `max_single_implement_kg`, `max_improvised_kg` (numeric, nullable, no CHECK)
- `load_ceilings_declined` (boolean)

They answer "how heavy", never "do you own one". There is no column for bands, pull-up bar, bench or barbell.

**Could "I don't have one" be a 0 / null / sentinel with no migration?** Storable, yes (no CHECK constraint). **The engine would not exclude anything.** RAN with `max_single_implement_kg = 0` and `max_improvised_kg = 0`:

```
Kettlebell Swing (Heavy) -> stated 0  eff 0  prescribed ~0kg
Goblet Squats            -> stated 0  eff 0  prescribed ~0kg     <- he can do this with a dumbbell
Backpack Row             -> stated 0  eff 0  prescribed ~0kg
```

The exercise stays in the pool and is prescribed at 0 kg. It also zeroes Goblet Squats, which takes a dumbbell **or** a kettlebell. Every writer refuses 0 anyway: `isValidCeilingKg` min 1 (`load-ceiling-prompt.ts:70-76`), `numericOrUndefined` drops zero (`onboarding-slots.ts:1059-1064`), Profile rows `min={1}` (`ProfileScreen.tsx:1034-1048`). **A sentinel is not viable.**

**What can hold it with no migration:** `user_facts` already accepts `kind='hard_constraint'`, `constraint_kind='equipment'` and has a nullable `resolved_refs text[]` (`supabase/migrations/20260806090000_create_memory_and_goals.sql:40-78`). The coach's `record_fact` tool already writes such rows (`ChatAssistant.tsx:4059-4081`) — free text only, and **nothing reads them** (`fact-compiler.ts:146` compiles `availability` only). See the design section.

**The kettlebell prompt, traced:**

1. `TodayPanel.tsx:1084-1105` calls `ceilingToAskFor(profile, workout)` (`load-ceiling-prompt.ts:126-138`).
2. That walks today's exercises; `ceilingKindFor` (`:79-90`) returns `'single_implement'` for any entry whose `loadingMode` is single-implement — **a lone dumbbell as well as a kettlebell** (`load-prescription.ts:656-658`).
3. The question text for that kind is fixed: *"What is your heaviest kettlebell?"* (`load-ceiling-prompt.ts:59-62`).
4. Validation: 1–100 kg, else *"Give a number between 1 and 100kg."* (`LoadCeilingPrompt.tsx:96-100`). The only other exit is "I'm not sure" → `declineStatedCeilings` (`:185`) which sets `load_ceilings_declined = true` and **silences every implement for good**.
5. Consumption: `statedCeilingKg` (`load-prescription.ts:818-853`) → `effectiveLoadingCeilingKg` (`:867`) → the clamp in `prescribeLoad` (`:1896`), `withWorkingLoadKg` (`progression-engine.ts:278-`), `checkLoggedSetWeight` (`set-plausibility.ts:142-143`), and `findCeilingViolations` on load (`ceiling-reconcile.ts:59-`).

**A real defect inside this, found by running Sam's plan (RAN):** the exercise that triggered the kettlebell question was **`Dumbbell Leg Curl [dumbbell]`**. Since 10 Sep, `statedCeilingKg` routes a dumbbell-only single implement to `max_dumbbell_kg` (`load-prescription.ts:845-848`, `usesDumbbellOnly` at `:802`). `ceilingToAskFor` / `hasStatedCeiling` were not updated and still key on the kind. So the app asked Sam for a kettlebell weight **for a dumbbell exercise whose ceiling it already had (24)**, and would not have used the answer for that exercise.

Also noted (READ): after "Save", `TodayPanel.tsx:1096-1097` writes the column and hides the card but does not update the in-memory profile. The answer only takes effect at the next load, via `reconcileToStatedCeilings`.

### 3. The "I haven't got the kit" swap path

`EditReasonStep.tsx:105-131` asks **"What have you got today?"** and lists the same four tiers. The answer goes to `applyEquipmentFromRow` (`src/lib/screen-adaptations.ts:106-134`):

- scope: **this week only** (`:112`), stored as a **7-day** adaptation (`EQUIPMENT_SWITCH_DAYS = 7`, `edit-reason.ts:271`)
- it runs `substituteForEquipment` (`plan-adaptations.ts:386-401`), whose test is `!isEquipmentAllowed(entry, tier)`
- `if (trial.touchedSlots.length === 0) return { message: 'Everything in this week already works with that — nothing to change.' }` (`:117-119`)

Sam is already `minimalist`. A band exercise is allowed at `minimalist`. Zero slots conflict, so the message is returned — and the dialog treats any returned string as a refusal and draws it in `text-destructive` (`SwapDialog.tsx:150`, `:188`), hence the red text. **The path can only move a person between tiers. It can never remove one item.** Picking your own tier is a guaranteed no-op, and the picker still offers it.

### 4. Chat tools that can change equipment

| Tool | What it does | Permanent? |
|---|---|---|
| `propose_equipment_adaptation` (`chat-gemini/index.ts:959-985`, prompt §3b `:2193-2198`) | Re-fits the next N days against one of the four tiers | No — auto-reverts |
| `record_fact` with `kind=hard_constraint, constraint_kind=equipment` (`:1569-1597`) | Saves a sentence to memory | Yes, but **read by nothing** |
| `ban_exercise` (`:1134-1151`) | Bans **one** exercise by name | Yes |
| `propose_exercise_swap` | One slot | — |

There is **no tool that changes the equipment tier permanently**, and none that removes an implement. `docs/coach-screen-parity.md:39` maps `propose_equipment_adaptation` to "Profile → Equipment", but the Profile control is permanent (`ProfileScreen.tsx:985`) and the tool is temporary — these are not the same operation. CLAUDE.md:626 ("Days, equipment, injuries … both surfaces") overstates it for equipment.

**Why "I couldn't find that on your current plan":** that sentence is the generic fallback at `ChatAssistant.tsx:4994-4996`, reached when a proposal builder returns nothing and sets no refusal. The equipment branch (`:4835-4837`) has **no `else refusal`**, and `buildEquipmentAdaptationProposal` returns `null` when no slot conflicts (`:2719`) or no duration was given (`:2707`). The tool's own description tells the model *"Dumbbells only -> minimalist"* (`chat-gemini/index.ts:968`). Sam is already minimalist → nothing conflicts → `null` → generic fallback. **VERIFIED:** the code path and that this message has no other equipment source. **INFERRED:** that the model called this tool on that turn (no transcript of the tool call).

**Run 2 ("take every band exercise out"):** the model reached for `ban_exercise`, which takes a single `exercise_name`. It banned Band Tricep Kickback and stopped. Spanish Squat and Banded Terminal Knee Extension are band-only entries (RAN) and stayed.

**Tool needed:** one that changes the kit list — sketched in the design section as `propose_kit_change`, modelled on `propose_injury_as_lasting` (a profile-level fact plus a re-fit from this week to the end of the plan, on one card).

### 5. H18 — where loads meet ceilings

| Question | Answer |
|---|---|
| Where is a logged load compared with the ceiling? | `SetGrid.tsx:591-605` → `checkLoggedSetWeight` (`set-plausibility.ts:117-160`). It warns only above **1.5×** the ceiling (`:73`, `:143`). RAN: 30 and 36 → `ok`; 36.5 → *"You told me the heaviest you can load is 24kg per hand, and this is 36.5kg."* |
| Where do "+2 · 32" / "+4 · 34" come from? | The calibration-week cascade, `SetGrid.tsx:1085-1117`: 5% and 10% above the previous logged set, snapped to the 2 kg dumbbell step, each at least one step up. **No ceiling is consulted.** |
| Where does "Week 2 now starts … from your 30kg set" come from? | `calibrationAnchorMessage`, `src/lib/calibration-anchor.ts:74-80`. It prints `a.liftedKg`. |
| Does it clamp? | **The plan does; the sentence does not.** `patchBlockFromLiftedKg` (`beat-target-offer.ts:299-305`) calls `prescribeLoad` with `forceStartingWeightKg: 30`, which clamps at `load-prescription.ts:1896`. RAN: `forceStartingWeightKg 30 -> ~24kg per hand`. It then sets `patched = true` (`:313`) whether or not the number moved. |

So the plan correctly holds 24 and the message announces 30.

### 6. L12, L14, M32 — see the per-bug sections below.

### 7. What was deliberately designed, and what the owner ruled

| Design | Ruling / basis | Where |
|---|---|---|
| Four tiers, descriptions rewritten to match them | **Ashley, 9 Sep 2026, from four options** — *fix the words / fix the kit / ask what you actually own / words now and a checklist later* → **"fix the words"**, because *"narrowing the sets would change every existing plan on those tiers"* | `BACKLOG.md:11129-11134`; `onboarding-slots.ts:119-122` |
| "How much can you load" is never asked in setup, only at first use | Ashley's call: *"someone who has never trained cannot answer 'how much can you load', and onboarding is where people drop out"* | `load-ceiling-prompt.ts:19-22`; `docs/PLAN-ask-what-you-can-actually-load.md` |
| Ceilings recorded only if volunteered, and only from the user's own words | Follows the ruling above | `onboarding-slots.ts:845-871`; `BACKLOG.md:11150-11166` |
| `user_facts` rejected as the home for a **number** | Session decision: free text would need re-parsing | `docs/PLAN-ask-what-you-can-actually-load.md` §2 |
| A band loses to a real weight in a main/secondary slot | Built and measured (906 slots) | `docs/PLAN-a-band-where-a-barbell-should-be.md` |
| Bands and backpack rank "low"; rehab and core are exempt | **Ashley: "skip rehab and core, apply everywhere else"** | `docs/PLAN-equipment-quality.md` "What actually happened" |
| Spanish Squat / Banded TKE are knee **rehab** tools, placed on purpose | `indicated_joints: ['knee']` | `exercise-db.ts:2466-2500` |
| A backpack at its limit gets a slower tempo | **Ashley: "slow the movement down"** | `docs/PLAN-a-backpack-at-its-limit.md` |
| Backpack is in every tier | Session reasoning: *"Anyone can put weight in a backpack regardless of tier"* | `exercise-plan.ts:341-344` |
| Logged weight: warn, second tap logs it; 1.5× so *"a borrowed 26kg pair against a stated 24 passes without a word"* | **Ashley, 8 Sep 2026: "warn, second tap logs it."** The 1.5× is the session's | `BACKLOG.md:11711-11719`; `set-plausibility.ts:64-73` |
| "I haven't got the kit" is temporary, 7 days | **Session's call**, not hers: *"nearly always a trip"* | `edit-reason.ts:264-271`; `screen-adaptations.ts:97-103` |
| Plate calculator stays on the row; hidden on cable | Ashley, 14 and 19 Sep. **Dumbbells explicitly left for her** | CLAUDE.md:453; `load-prescription.ts:915-918` |
| No live users, so no transition path is needed | Ashley, 10 Sep | CLAUDE.md:1390 |

**The collision to put in front of her:** the tester's decision 1-B (tier plus a tick-list) is the option she **did not choose** on 9 Sep. Her stated reason was that narrowing the tier sets would change everyone's plans. The design below does not touch the tier sets — it adds a per-person list — so her reason does not apply to it. But it is still a reversal of a ruling and is hers to make.

---

## Per-bug findings

### H1 · The plan prescribes kit the user said he doesn't have
- **Status:** CONFIRMED IN CODE (and reproduced: RAN Sam's profile → week 1 contains `Tuesday: Backpack Row … tier_2_secondary ~20kg`, 3–5 band slots, and the kettlebell prompt on Thursday).
- **Root cause:** three layers, one cause.
  1. *No tier fits.* Tier sets at `exercise-plan.ts:328-346`; the only equipment slot takes four values (`onboarding-slots.ts:755`).
  2. *The prompt teaches the wrong mapping.* `onboarding-chat/index.ts:261`.
  3. *Minimalist has no bench*, so `isEquipmentAllowed` (`:732-738`) removes `Dumbbell Rows [dumbbells+bench]`, `Dumbbell Bench Press`, `Neutral-Grip Dumbbell Press`, `Dumbbell Flyes`, `Dumbbell Pullover`, `Bulgarian Split Squats`. RAN — the `row` group at minimalist is `Inverted Row, Towel Row, Backpack Row, Table Row`. Backpack Row is the only **loaded** row left, so it wins on merit. The tester's guess ("Dumbbell Rows was passed over") is wrong: it was never a candidate. The "outside your minimalist equipment" flag on a dumbbell bench press is `getExerciseCompatibilityWarnings` (`exercise-plan.ts:5004-5012`), RAN: `'Needs bench — outside your minimalist equipment.'`
  4. *The kettlebell prompt* fired on `Dumbbell Leg Curl` — see Q2.
- **Prior rulings:** 9 Sep "fix the words" (`BACKLOG.md:11129-11134`). VISION.md:11-15: *"Respect every individual constraint — starting point, equipment, injury history…"*. The description "no barbell or bench" is honest about the tier; the tier is simply not Sam.
- **Fix:** the kit list (design section). Plus two things that stand alone:
  - Rewrite the worked example at `onboarding-chat/index.ts:261` so a named list is recorded as a list, and a bench is not silently dropped.
  - Route the ceiling prompt by implement: in `ceilingToAskFor`, treat a dumbbell-only single implement as kind `dumbbell` (reuse `usesDumbbellOnly`, exported). **MECHANICAL.**
- **Class:** OWNER DECISION for the kit list (reverses 9 Sep; question 1 below). MECHANICAL for the prompt-routing defect. COACHING for the catalogue gap below.
- **Coaching finding (mine, recorded with basis):** a trainee with dumbbells and **no bench** has no loaded row at all — the catalogue's only dumbbell row is tagged bench-required. A bent-over dumbbell row needs no bench and is the standard horizontal pull for that kit (NSCA exercise technique: bent-over row, free-standing hip hinge). Add `Bent-Over Dumbbell Row [dumbbells]`. Without it, even a correctly-tiered minimalist gets a backpack before a dumbbell.
- **Ships via:** frontend; `onboarding-chat` deploy for the prompt line.
- **Gates:** `test:equipment-labels` (69 checks) holds the words, not ownership. `test:audit`, `test:quality`, `test:band-slots`, `test:onboarding-conversational`, `test:onboarding-slots`, `test:load-ceilings`. **New check that would have caught it:** for a kit of {dumbbells, bench}, no generated slot needs an implement outside the kit, across the seeded grid.
- **Risk:** see "What the kit list takes away" in the design section — honest kits expose thin spots in the catalogue.
- **Confidence:** high. Pool arithmetic and the plan were reproduced.

### H2 · No screen lets the user say "I don't own that"
- **Status:** CONFIRMED IN CODE. (a) and (b) are both **deliberate designs with a gap**.
- **Root cause:**
  - (a) `LoadCeilingPrompt.tsx:52-100` has two exits, a number 1–100 or "I'm not sure". 0 is refused by `isValidCeilingKg` (`load-ceiling-prompt.ts:70-76`). "I'm not sure" stops the app asking about **every** implement (`:185-191`) and records nothing about ownership.
  - (b) `screen-adaptations.ts:117-119`, traced in Q3. Same tier in, same tier out.
- **Prior rulings:** "ask at first use" and "I'm not sure is a value" are Ashley's (`load-ceiling-prompt.ts:19-22`, migration comment). The kit chip's 7-day scope is the session's own call (`edit-reason.ts:264-271`). BACKLOG:7724 describes it as *"asks what she HAS today"*. Nobody ruled on "I don't own it"; it was never offered.
- **Fix:** with a kit list in place —
  - prompt gains a third button, **"I don't have one"**, which removes that implement from the kit and re-fits from this week on;
  - the swap sheet's kit step leads with **"I don't own {bands}"** (the implement read off the exercise), and keeps the four-tier picker under "I'm away from my kit this week";
  - the temporary picker stops offering the tier the person is already on, and a no-op is said as information, not as an error.
- **Class:** OWNER DECISION (what the app asks — question 2 below). The "don't offer your own tier" and "not red" parts are MECHANICAL.
- **Ships via:** frontend.
- **Gates:** `verify:hurts` §5 drives the kit step but only ever picks a *different* tier (`.tour-harness/hurts.mjs:192-206`), so the same-tier dead end has never been exercised. `test:edit-reason`, `test:load-ceilings`. New: driver case "pick your own tier" and "I don't own it → the band exercise is gone and stays gone next week".
- **Risk:** a permanent answer from a one-tap chip is exactly what the session's 7-day comment warned about ("how somebody comes home to a bodyweight plan"). Keeping both choices on the sheet, worded apart, answers it.
- **Confidence:** high.

### H3 · The coach can't fix it either (and Run 2: it banned one exercise of several)
- **Status:** CONFIRMED IN CODE for the missing capability and the fallback; INFERRED for which tool the model called in Run 1.
- **Root cause:** no tool removes an implement or changes the tier permanently (Q4). Run 1 fell through `ChatAssistant.tsx:4835-4837` to the generic line at `:4994-4996`. Run 2 used `ban_exercise`, which is one name per call (`chat-gemini/index.ts:1141-1150`); the coach did not say it had handled one of several, and nothing in the tool's reply could tell it how many band exercises exist.
- **Prior rulings:** CLAUDE.md Promise 2: *"The coach acts; it never sends anyone to a control"*. The coach's own prompt, on a different field, states the principle exactly: *"Offering to REMEMBER a problem you have a tool to FIX is the worst of both — it looks like help and changes nothing"* (`chat-gemini/index.ts:2519`). The `record_fact` equipment branch is that shape today.
- **Fix:**
  1. New tool `propose_kit_change { remove: string[], add: string[], origin_verbatim_quote }`, items from a closed list. Client builder mirrors `buildLastingInjuryProposal` (`ChatAssistant.tsx:2598-2663`): trial re-fit from the live week to the end, one card listing every exercise that changes, plus a row "Equipment: bands — removed". Builds even when nothing currently conflicts, because the record protects future plans.
  2. Give the equipment-adaptation branch an honest refusal (`else refusal = "Your plan already fits that kit…"`), like every sibling branch has. **MECHANICAL, independent.**
  3. Prompt: "I don't own X" → `propose_kit_change`, never `ban_exercise`, never `record_fact`. Send the kit in context beside `Equipment Access` (`chat-gemini/index.ts:2553`).
  4. Retire or redirect `record_fact`'s `constraint_kind: equipment` so it cannot be the silent sink.
  5. Correct `docs/coach-screen-parity.md:39` and CLAUDE.md:626.
- **Class:** OWNER DECISION (follows question 1). Step 2 MECHANICAL.
- **Ships via:** frontend + **`chat-gemini` deploy**.
- **Gates:** `test:coach-parity` (§3 declining-stub, §5 builder reached from a screen), `test:coach-promises`, `test:chat-actions`, `test:chat-app-reality`, `test:coach-exam-fresh` (will go stale — the exam needs a case: "I don't own bands" must produce the kit card, not a ban card). New `verify:` driver for the card.
- **Risk:** a coach that removes kit on a passing remark. Same protection as injuries: verbatim-quote requirement and a card before anything is written.
- **Confidence:** high on the gap; medium on Run 1's tool choice.

### H18 · The dumbbell limit is ignored when logging, then built on (and Run 2: 30 kg said, 24 kg shown)
- **Status:** PARTLY. Three symptoms, three verdicts.
  - *No warning at 30 vs 24* — **DELIBERATE DESIGN.** 30 ≤ 24 × 1.5. `set-plausibility.ts:64-73`: *"borrowing a heavier dumbbell than the ones you told us about — the ordinary case, 26kg against a stated 24 — passes without a word"*.
  - *Chips "+2 · 32", "+4 · 34"* — CONFIRMED. `SetGrid.tsx:1085-1117` never reads the ceiling.
  - *"Week 2 now starts … from your 30kg set" over a 24 kg plan* — **CONFIRMED BUG.** `calibration-anchor.ts:75` prints the lifted number; the plan was clamped at `load-prescription.ts:1896`. And `beat-target-offer.ts:313` marks the week "patched" even when the clamped result equals what was already printed, so the sentence *"not the guess it was printed with"* can be false twice over.
- **Second finding (RAN), same family:** a lift pinned by a **stated** ceiling carries no reason. `prescribeLoad` records `hold: implementHeld ? 'implement' : floorHeld ? 'floor' : rampArrived ? 'ceiling' : null` (`load-prescription.ts:2003`), and `implementHeld` is only ever set for a backpack (`:1903-1913`). Dumbbell Rows at 24 kg for fourteen weeks will read as an unexplained repeat, or — worse — as *"at your estimate's ceiling … log a set and the number can start moving again"*, which is untrue for someone who just logged 30.
- **Third finding (RAN):** Goblet Squats prescribes **~32 kg** to a man whose heaviest dumbbell is 24. Mixed dumbbell-or-kettlebell entries read only the kettlebell answer (`load-prescription.ts:845-848`), which Sam does not have, so they fall to the 48 kg table.
- **Prior rulings:** Ashley 8 Sep (`BACKLOG.md:11711-11719`). Ashley 10 Sep, calibration anchors apply automatically (`calibration-anchor.ts:15-21`). Ashley 13 Sep: *"A change receipt names the week the change starts"* and quotes a number she can go and look at (CLAUDE.md:699). The 30/24 sentence breaks that one.
- **Fix:**
  1. **MECHANICAL.** The message quotes the weight actually written (`patchedEx.suggested_load_kg`), and `patchBlockFromLiftedKg` reports "not patched" when the number did not move. When the clamp bit, say so in the phrasebook's voice: *"Week 2 starts Romanian Deadlifts at 24kg per hand — the heaviest you've told me you have. You lifted 30 today."*
  2. **MECHANICAL.** Calibration chips stop at the effective ceiling when the ceiling is the person's own stated number.
  3. **OWNER DECISION** (question 3): a set logged above a *stated* limit asks, after it is saved, *"Heavier than the 24kg you told me — new dumbbells?"* with one tap to raise the limit. It never blocks the set.
  4. **COACHING, mine.** A lift held at the trainee's own implement limit is treated exactly like the backpack at its limit: `hold = 'implement'`, label "as heavy as this gets", then the levers in order — reps to the top of the range, tempo (her "slow the movement down" ruling), then a harder variation of the same pattern (single-leg RDL, 1½ reps, paused reps). Basis: when external load cannot rise, overload is progressed through volume, time under tension and leverage; the NSCA progression hierarchy treats these as legitimate once load is capped by equipment. This extends an existing ruling rather than making a new one.
  5. **COACHING, mine.** A dumbbell-or-kettlebell lift uses the dumbbell ceiling when the person has no kettlebell (needs the kit list to know that).
- **Ships via:** frontend.
- **Gates:** `test:calibration-search` (reads `calibration-anchor`), `test:logged-reanchor`, `test:set-plausibility` (45), `verify:absurd-weight`, `test:load-ceilings`, `test:single-implement`, `test:frozen-weeks`, `verify:ceiling-label`, `verify:one-number`. New: "the sentence and the week agree" (anchor 30 against a 24 ceiling → message contains 24, not 30).
- **Risk:** item 4 changes prescriptions (tempo on dumbbell lifts at the ceiling) and will move session length — the backpack plan flagged the same risk. **SAFETY-ADJACENT: needs a written plan before a build**, per CLAUDE.md.
- **Confidence:** high.

### L12 · Plate calculator with a 20 kg bar on every set row for a user with no barbell
- **Status:** CONFIRMED IN CODE; partly DELIBERATE.
- **Root cause:** `SetGrid.tsx:931` renders the button whenever `takesPlateCalculator(entry)` is true. That predicate (`load-prescription.ts:920-923`) returns false only for cable entries and `'medicine ball'` (`:934`). Everything else — dumbbells, kettlebell, backpack, bands, bodyweight — gets it. The set row has no "is this lift loaded" guard; the sibling link in `ExerciseRow.tsx:357` does. The calculator opens on a barbell with `barWeight` defaulting to `'20'` (`PlateCalculator.tsx:52`).
- **Prior rulings:** stays on the row (CLAUDE.md:453); not on cable (19 Sep). `load-prescription.ts:915-918`: *"DUMBBELLS ARE DELIBERATELY LEFT ALONE and the question is Ashley's, not mine"*.
- **Fix:**
  - **MECHANICAL** by the existing medicine-ball rule ("a sealed ball with its weight printed on it"): add `kettlebell`, `weighted backpack`, `resistance band` to `NEVER_PLATE_LOADED`, and give the set row the same loaded-lift guard the exercise row has.
  - **OWNER DECISION** (question 4) for dumbbells.
- **Ships via:** frontend.
- **Gates:** `test:load-display` reads `takesPlateCalculator`; `verify:session-edit` §1f-1h; the two "no plate calculator where there are no plates" drivers mentioned at `load-prescription.ts:929-931`.
- **Risk:** low. Hiding it from a plate-loaded machine would be the same defect in reverse; the fix lists implements by name, as the existing comment requires.
- **Confidence:** high.

### L14 · Cardio presets are Incline walk, Heavy bag, HIIT bike, Zone 2 for a home user; minutes accepts 1,440
- **Status:** CONFIRMED IN CODE (presets); DELIBERATE DESIGN (minutes).
- **Root cause:** `AddUnplannedWork.tsx:25-30` — `CONDITIONING_PRESETS` is a constant. The component takes no profile. The 1,440 cap is `MAX_PLAUSIBLE_CARDIO_MINUTES = 24 * 60` (`cardio-log-store.ts:118`), documented as *"the point past which the number is certainly a typo"*.
- **Prior rulings:** Ashley 24 Sep, cardio logged like a lifting set (CLAUDE.md "Cardio is logged like a lifting set"); presets kept as chips. Nothing on which presets.
- **Fix:** presets chosen from the kit/tier. For anyone not at a full gym: **Brisk walk · Run · Bodyweight circuit · Zone 2**; treadmill, bike and bag presets only where that kit exists. "Other" is unchanged. Minutes: leave the store's bound; if wanted, a "second tap" above three hours mirrors the set logger.
- **Class:** COACHING (mine): a preset is a suggested modality, and a modality the trainee cannot do is not a suggestion. Wording of the four labels is the phrasebook's.
- **Ships via:** frontend.
- **Gates:** `test:bounds-and-boundaries`, `test:round-logging` (both read this file), `verify:round-presets`, `test:cardio-effort`. New: no preset names kit outside the person's kit.
- **Risk:** low.
- **Confidence:** high.

### M32 · The replacement exercise starts very heavy (Overhead Tricep Extension 3×16–19 at ~22 kg)
- **Status:** CONFIRMED IN CODE — reproduced exactly (RAN: `Overhead Tricep Extension 16-19: ~22kg`; at 12–15 and 8–12 it is `~24kg`, i.e. pinned at his dumbbell limit).
- **Root cause:** two inherited values, neither right for this lift.
  1. *The rep range belongs to the band.* `applyReplacement` keeps `slot.reps` on a reps→reps swap (`mesocycle-edit.ts:281-296`). The outgoing Band Tricep Kickback is unloaded and progresses by reps, so its range had walked up to 16–19. That range was carried onto a loaded lift.
  2. *The weight is a cable/EZ-bar number.* `isolation_tricep` is one fraction for every implement: `{ parent: 'bench', fraction: 0.32 } // pushdowns/extensions` (`load-prescription.ts:314`). RAN for comparison: Skull Crushers (EZ bar) 8–12 → 25 kg. A single dumbbell held overhead in two hands is prescribed the same figure and only the 24 kg ceiling holds it back.
  3. `recomputeLoad` (`mesocycle-edit.ts:223-252`) looks for logged history on the **new exercise's own name** only. The logged 10 kg × 8 skullcrusher is a different entry, so it was not consulted. That is by design ("never a carry-over of the outgoing exercise's kg") and reasonable; it is not the cause.
- **Prior rulings:** BACKLOG:14598 — slot-replacement inheritance class fixed for units, ramp and assistance; *reps were deliberately kept on a reps→reps swap* ("keeps the block's own rep prescription"). None on unloaded→loaded.
- **Fix (COACHING, mine — basis recorded):**
  - When the outgoing lift is **not** externally loaded and the incoming one **is**, re-derive the rep range from the style's own table for that tier (`STYLE_CONFIGS[style].repRange`, `exercise-plan.ts:296-322` — bodybuilding tier 3 is 12–15). A rep range earned by an unloaded movement is not a prescription for a loaded one.
  - Scale the estimate by implement inside the category: a two-hand single-dumbbell overhead extension works at roughly 60–70% of a cable pushdown or EZ-bar extension for the same reps (long-head stretch position, grip and stability limited). For an 82 kg intermediate that is about 14–16 kg for 12–15, not 22–24.
  - A swapped-in lift with no logged history of its own starts on the conservative side and says so, the way the main-lift reset already does (`mesocycle-edit.ts:231-236`).
  - Basis: starting-load selection for assistance exercises is set from the trainee's demonstrated capacity on that movement, erring light on a first exposure; isolation work for the elbow extensors in an overhead position is joint-limited before it is strength-limited.
- **Class:** COACHING + **SAFETY-ADJACENT** (load prescription — plan before build).
- **Ships via:** frontend.
- **Gates:** `test:slot-replacement`, `test:load-suggestions`, `test:single-implement`, `test:per-side-load`, `test:ceiling-units`, `test:audit` (`loading_ceiling`), `test:week-load-consistency`. New: a replacement of an unloaded slot by a loaded lift never keeps a rep range above the style's tier range; a single-dumbbell isolation estimate is below the same category's cable estimate.
- **Risk:** changing the category fraction touches every prescription in that category — make it an implement factor, not a new fraction, and measure before/after on the grid.
- **Confidence:** high on cause; the exact factor is a coaching judgement to be measured, not asserted.

---

## The smallest design: an optional kit list

### What it is
A per-person list of the **implements they have**, from a closed set of nine. When it is absent the tier decides, exactly as today — **no existing plan changes**. When it is present it replaces the tier's assumed set.

| Item (what the person sees) | Catalogue strings it unlocks |
|---|---|
| Dumbbells | `dumbbells`, `dumbbell` |
| Flat bench | `bench` |
| Adjustable / incline bench | `incline bench` |
| Barbell and plates | `barbell`, `EZ bar`, `trap bar`, `t-bar` |
| Squat rack | `squat rack` |
| Kettlebell | `kettlebell` |
| Resistance bands | `resistance band` |
| Pull-up bar | `pull-up bar` |
| Weighted bag | `weighted backpack` |

The first eight are exactly the `DISCLOSABLE` list `test:equipment-labels` already holds (`scripts/test-equipment-labels.ts:90-99`). `bodyweight` is always allowed. Small extras (dip bars, box, ab wheel, medicine ball, skipping rope) are not on the list: with a kit list present they are treated as **not owned** (5 exercises; coaching call — a prescription the trainee cannot perform has no training effect, and being wrong in the other direction costs an accessory).

For Sam: `{dumbbells, flat bench}` → exactly the 93 exercises he can do (RAN), `Dumbbell Rows` and `Dumbbell Bench Press` back, no bands, no backpack, no kettlebell.

The tier stays. It is still the label on Profile, still what a person picks when they do not want to list anything, and still what the engine keys on for things that are about the *kind* of trainee (the pool-wide implement question, the bodyweight phase rules, the ceiling prompt). With a kit list present the tier is derived: barbell → home gym; any of dumbbells / kettlebell / bands → minimalist; otherwise bodyweight.

### Does it need a database migration? **No.**
Stored as `user_facts` rows the schema already accepts — verified against `20260806090000_create_memory_and_goals.sql:40-78`:

- `kind = 'hard_constraint'`, `constraint_kind = 'equipment'` (both already in the CHECK lists)
- `resolved_refs` = item keys from the closed list (nullable `text[]`, no CHECK)
- `polarity`: `'like'` = has, `'dislike'` = hasn't (nullable, CHECK allows both for any kind)
- `source` = `'onboarding' | 'chat' | 'manual'`

One row per statement, applied in order on top of the tier's own items. Each row already shows on Profile under "Things it remembers" with a delete, which doubles as undo. This is the same road `dislikedExercises` already travels: volunteered in setup, merged into the first generation in memory (`App.tsx:1547-1559`), written as facts after the profile insert (`App.tsx:1796-1818`), compiled on every load (`fact-compiler.ts`).

`docs/PLAN-ask-what-you-can-actually-load.md` §2 called `user_facts` *"the wrong home"* — for a **number** stored as free text. A kit item is an identifier from a closed list, held in `resolved_refs`; nothing is re-parsed.

**Alternative that does need a migration:** one nullable column, `fitness_profiles.equipment_items text[]`. Simpler to read back, but it needs her explicit word, her machine, a named line in the column-by-column insert and in `restoreSession` (`App.tsx:939-942`, `:1628-1630`), and the strip-and-retry write pattern. Not recommended for round one; the fact rows can be folded into a column later with no change to the engine.

### (a) Mapped correctly from a free-text answer
- New never-asked slot `kitItems` beside the three ceilings (`onboarding-slots.ts:872-880`, `NEVER_BLOCKING_SLOTS` `:950-966`). The slot catalogue travels in the request, so the model learns it without a deploy; the corrected worked example at `onboarding-chat/index.ts:261` needs the deploy.
- Prompt rule: when they **list** what they have, record exactly that list; never add an item they did not name; a "no X" is not an X.
- A deterministic client guard, the twin of `ceilingIsInUserWords`: an item is only written if the turn's own text names it and the mention is not negated. Refusal is cheap — the slot stays empty and the tier decides, as today.
- The review card shows it as a row ("Kit: dumbbells, flat bench") which is the existing correction route.

### (b) "I don't own bands / a kettlebell / a backpack" — four doors, one write

| Door | Change |
|---|---|
| Onboarding | as (a) |
| Swap sheet | kit step leads with "I don't own {implement}"; the 7-day tier picker stays for trips |
| Kettlebell / dumbbell / bag prompt | third button, "I don't have one" |
| Chat | `propose_kit_change` |
| Profile | the same nine as ticks under Equipment (so every door has a screen twin — parity rule 4) |

All of them call one function: write the row, trial-fit from the live week to the end of the plan, show what changes, apply. Past weeks and logged sessions are never rewritten.

### (c) Engine, swaps and adaptations all respect it — the choke points
Every path already funnels through a handful of functions that take the profile:

| Place | Today | Change |
|---|---|---|
| `isEquipmentAllowed` / `stageEquipmentFilter` (`exercise-plan.ts:732`, `:774`) | reads `EQUIPMENT_SETS[tier]` | reads one helper, `allowedEquipmentFor(profile)` |
| `getConstrainedPool` (`:4939`) → generation, swap shortlist (`mesocycle-edit.ts:77-78`), add-an-exercise (`exercise-add-candidates.ts:104`, `:184`), injury substitution and rebuild (`plan-adaptations.ts`), session rebuild, block rotation (`exercise-plan.ts:6581`) | inherits the filter | **no change needed** — they all get it through the pool |
| `getExerciseCompatibilityWarnings` (`:5004-5012`) | "outside your minimalist equipment" | "you've said you don't have one" |
| `substituteForEquipment` (`plan-adaptations.ts:392-398`) | tier only | a **travel** tier describes somewhere else, so it uses that tier's plain set |
| `warmup.ts:306-311` `EQUIPMENT_AVAILABLE` | second, separate tier→kit map (bands, pull-up bar) | same helper |
| `statedCeilingKg` / `ceilingToAskFor` | kettlebell answer for mixed lifts; asks about kit regardless | dumbbell ceiling when there is no kettlebell; never asks about an implement they do not have |
| `dev-constraint-audit.ts:159` | independent copy of the sets | gains the same rule, kept independent |
| `screen-adaptations.ts:60`, `:114` | pass `exclusions: []` | pass the real exclusions — **existing defect**: a row-level injury or kit change can bring back a banned exercise today |

Hydration is one place: the profile handed to every tab is derived in `App.tsx` from the stored profile plus the compiled facts, next to where `effectiveExclusions` is already computed (`App.tsx:649-665`).

### What the kit list takes away (measured, per the "count the cost in the same run" rule)
RAN, Sam's settings, pool after every filter:

| Pattern | Tier pool, no injury | True kit, no injury | Tier pool, shoulder | True kit, shoulder |
|---|---|---|---|---|
| horizontal pull | 5 | 2 | 3 | 2 |
| vertical pull | 5 | **1** | 0 | 0 |
| tricep isolation | 4 | 2 | 2 | **0** |
| bicep isolation | 4 | 2 | 4 | 2 |
| shoulder isolation | 4 | 2 | 0 | 0 |
| horizontal push | 7 | **10** | 1 | **2** |
| single leg | 6 | 7 | 6 | 7 |

Honest kit plus a shoulder flag leaves **no tricep isolation at all** (the one dumbbell option, Overhead Tricep Extension, is contraindicated for the shoulder). The catalogue has 31 dumbbell entries and is thin exactly where a dumbbell-only home trainee needs it. The tester's M27 ("no dumbbell kickback or skullcrusher") is the same gap seen from the swap list.

**Coaching recommendation (mine):** ship a small dumbbell pack with the kit list, or the honest kit produces thinner days than the dishonest tier: Bent-Over Dumbbell Row, Dumbbell Tricep Kickback, Lying Dumbbell Tricep Extension (bench), Close-Grip Dumbbell Press, Dumbbell Hip Thrust (bench), Dumbbell Reverse Lunge. A catalogue change is a full sweep, not a derived gate set (CLAUDE.md).

**Rehab survives without bands** (RAN): every joint keeps band-free indicated movements — knee: Wall Sit, Seated Short-Arc Quad Set, Low Box Step-Up, Step-Down (Eccentric), both sliding leg curls; shoulder: Scapular Push-Ups, Wall Slides, Prone Y-T Raises, Rear Delt Flyes, Arm Circles; hip: Clamshell, Side-Lying Hip Abduction, Bird Dog. So removing bands does not remove the rehab slot, it changes which movement fills it.

### CSCS review (the five questions)
1. **Training effect:** improves it. A prescribed movement that cannot be performed has none; a dumbbell row replaces a backpack row with a load that can actually progress.
2. **What it takes away:** the table above — vertical pull and tricep isolation thin out. Named, measured, and answered with the dumbbell pack.
3. **Fundamentals:** push, pull, hinge and squat all survive for {dumbbells, bench}. Vertical pull does not exist without a bar or bands; the app's existing gap note says so honestly, and Dumbbell Pullover is the one lat-biased option left.
4. **Quietly redefined floors:** the pool-wide implement rule assumes "a minimalist owns a kettlebell and dumbbells" (`exercise-plan.ts:648-651`). With a kit of only bands that premise is false; it is safe because the demotion test reads the real pool, but the comment must be corrected and a bands-only fixture added.
5. **Scope:** inside. Equipment selection, substitution and load are delegated; nothing here diagnoses or treats.

### Gates this build needs
- New `test:kit-list`: for each kit in a small grid, no generated, swapped, added, rebuilt or injury-substituted slot needs an implement outside the kit; a kit of `null` produces byte-identical plans to today (seeded).
- New `verify:kit` driver: the three screen doors, on a real card, including "the exercise is still gone next week".
- Existing, all touched: `test:equipment-labels`, `test:audit`, `test:quality`, `test:band-slots`, `test:enforcement-gaps`, `test:injury-adaptation-safety`, `test:plan-adaptations-separation`, `test:slot-replacement`, `test:swap-target`, `test:swap-style`, `test:single-implement`, `test:load-ceilings`, `test:setup-answers`, `test:profile-restore`, `test:rebuild-offer`, `test:memory`, `test:onboarding-slots`, `test:onboarding-conversational`, `test:coach-parity`, `test:coach-promises`, `test:coach-exam-fresh`, `test:bundle`, `test:no-dead-code`; drivers `verify:hurts`, `verify:equipment-labels`, `verify:setup-answers`, `verify:swap-request`.

---

## Decisions for Ashley (plain language)

**1. How should someone tell the app what kit they have?** *(This revisits your 9 Sep "fix the words" choice.)*
- A. Keep the four choices only. Sam keeps getting bands and a backpack.
- B. Keep the four choices, and also remember specific things people say — "I've got dumbbells and a bench", "I don't own bands". No new question in setup. They can tick or untick items later in Profile.
- C. B, plus show a short tick-list in setup right after the four choices.
- **Recommend B.** It fixes Sam without adding a setup question, which matches your rule that setup must not ask "how much can you load". Your 9 Sep worry was that everyone's plan would change; here nobody's plan changes unless they say something.

**2. On the swap screen, what does "I haven't got the kit" mean?**
- A. As now: "what have you got this week?" — temporary, four choices.
- B. Two choices: "I don't own it" (gone for good, from this week) and "not this week" (as now).
- **Recommend B.** Same shape as your pain ruling: a niggle and a lasting injury are different answers.

**3. Someone logs more than the limit they gave (30 kg with a 24 kg limit).**
- A. Say nothing unless it is wildly over — as now.
- B. Log it, then ask once: "new dumbbells?" — one tap raises the limit.
- C. Warn before logging at anything over the limit.
- **Recommend B.** It never gets in the way of the set, and the app learns.

**4. Plate calculator on dumbbell exercises.** *(Already marked in the code as your call.)*
- A. Keep it. B. Hide it on dumbbells. C. Show it only if the person says their dumbbells are adjustable.
- **Recommend B** now; C is a nice follow-up. It disappears from kettlebells, bags, bands and bodyweight rows either way — that part has a right answer.

---

## Shared choke points

1. **Equipment is a tier and nothing else** → H1, H2(b), H3, the band and kettlebell replacements in H11, L14, half of L12. One helper, `allowedEquipmentFor(profile)`, at `isEquipmentAllowed` and `warmup.ts:306`.
2. **A no-op that is reported as a failure** → H2(b) (`screen-adaptations.ts:117`, drawn red) and H3 (`ChatAssistant.tsx:4835-4837` falling to `:4995`). Both are "nothing conflicts" being said as "something went wrong".
3. **The sentence and the plan are computed separately** → H18's 30-vs-24 (`calibration-anchor.ts:75` vs `load-prescription.ts:1896`). Read the receipt off what was written.
4. **The ceiling prompt and the ceiling reader disagree about which implement** → the kettlebell question on a dumbbell lift (`load-ceiling-prompt.ts:79-90` vs `load-prescription.ts:845-848`), and Goblet Squats at 32 kg.
5. **A stated implement limit has no "held" reason** → Dumbbell Rows flat at 24 kg for fourteen weeks with nothing said (`load-prescription.ts:2003`).
6. **A replacement inherits the outgoing slot's rep range** → M32 (`mesocycle-edit.ts:281-296`).
7. **A memory row with no reader** → `record_fact` equipment constraints (`ChatAssistant.tsx:4059-4081`; `fact-compiler.ts:146`). The kit list gives it the reader.

## Suggested build order

1. **Mechanical, no decision needed, frontend only.** (a) The anchor sentence quotes the written weight, and "patched" means the number moved. (b) Ceiling prompt routes by implement. (c) Calibration chips stop at a stated ceiling. (d) Plate calculator off kettlebell / bag / band / unloaded rows. (e) Equipment-adaptation branch gets an honest refusal; the kit step stops offering your own tier and stops drawing a no-op in red. (f) `screen-adaptations` passes real exclusions.
2. **Ask question 1.** Everything below waits on it.
3. **Written plan** (`docs/plans/kit-list.md`) — required: this touches exercise selection, injury substitution and load ceilings.
4. **Kit list, engine half:** the helper, the facts compile, hydration in `App.tsx`, `test:kit-list`. Measure the grid before and after with the kit absent (must be identical) and with three kits.
5. **Dumbbell pack** in the catalogue, in the same round — full sweep.
6. **Doors:** Profile ticks → swap sheet (question 2) → prompt button → onboarding slot and guard.
7. **Coach:** `propose_kit_change`, prompt, context line, parity doc, exam case. `chat-gemini` and `onboarding-chat` deploys.
8. **Load work, its own plan:** held-at-your-limit label and levers; mixed-implement ceiling; M32's rep range and implement factor; question 3.
9. **L14** presets.

## Leads for other tracers, and what was not verified

- **H11:** the knee adaptation's replacements were *allowed* by the tier (band and kettlebell are both in `minimalist`), so equipment explains why they were eligible, not why they ranked first. `Kettlebell Swing (Heavy)` is not in Sam's on-style pool (RAN), so it came from the swap path's style-relaxed pool (`mesocycle-edit.ts:78`). Worth checking whether an *automatic* substitution should ever pick an off-style option — the 18 Sep ruling was about what a person is **shown**.
- **Not verified:** which tool the model called for H3 Run 1; the exact exercise on Sam's live plan that raised the kettlebell prompt (reproduced with `Dumbbell Leg Curl` on a seeded build of his profile, not read from his rows); whether production holds any `hard_constraint / equipment` fact rows already (cloud session cannot read it).
- **Not run:** `test:quality`, `test:audit`, any browser driver — per the brief.
