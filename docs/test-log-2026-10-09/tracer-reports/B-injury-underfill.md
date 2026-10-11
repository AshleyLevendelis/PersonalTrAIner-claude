# Tracer B — injury filtering, under-filled days, session length, adaptations

Bugs: H4, H5, H11, M5, M24, M25, L17, L30, plus the Run 2 "H4 and H5" and "H4 (time cap)" updates.
Read-only. Nothing under `/home/claude/app` was edited.

## How this was checked

- `node_modules` exists, so the generator was RUN. Four scratch scripts (in the session scratchpad, not the repo):
  - `sam.ts` — builds Sam's profile (minimalist, bodybuilding, Mon/Tue/Thu/Sat, 30-45, intermediate, `injuries:['shoulders']`, fat loss, `conditioning_preference:'tolerate'`, `recovery_capacity:'moderate'`, `max_dumbbell_kg:24`), seeds the RNG, prints the pool per pattern with the stage that removed each exercise, and prints weeks 1-16 with sets and the app's own `estimateDaySeconds`.
  - `knee.ts` — runs the real `substituteForInjury` (the 14-day knee adaptation) over that plan.
  - `grid.ts` — 768 bodybuilding 4-day plans (4 tiers x 6 injury sets x 4 experience x 4 lengths x 2 goals).
  - `shoulder.ts`, `ball.ts`, `sat.ts` — catalogue listings and spot samples.
- VERIFIED BY RUNNING is marked **[ran]**; verified by reading only is **[read]**; anything else is **[inferred]**.
- Caveat: selection carries a random tie-break, so my seeds reproduce the tester's plan in structure, not pick-for-pick. Seed `sam:2` gives Monday = `Scapular Push-Ups 2x8 | Dumbbell Floor Press 4 | Band Tricep Kickback 3` = 9 sets, "~37 min" — the tester's Monday exactly. The knee adaptation reproduced the tester's card exercise for exercise.

### What the generator printed for Sam (seed `sam:2`, week 1) **[ran]**

| Day | Focus | Sets (incl. primers) | Working sets | Lifting + warm-up | Optional filler | Label the app prints |
|---|---|---|---|---|---|---|
| Mon | Chest & Triceps | 9 | 7 | 22.4 min | 15 min mobility | "9 sets · ~37 min" |
| Tue | Back & Biceps | 11 | 9 | 25.4 min | 10 min mobility | "~35 min" |
| Thu | Legs & Calves | 20 | 16 | 40.1 min | 0 | "~40 min" |
| Sat | Shoulders & Abs | 17 | 15 | 36.8 min | 0 | "~37 min" |

Monday also carries `recommendedCardio = Brisk Walk or Light Cycling, 30 min, timing:'independent_session'` (33 in week 2). Saturday carries the gap note. Monday stays at 7 working sets and 22-24 minutes of real work for all sixteen weeks; Thursday climbs to 44.7 min in week 10.

---

### H4 · A shoulder flag strips the week (one chest exercise, "Shoulders & Abs" is a leg day, 9/11/20/19 sets)

- **Status: CONFIRMED IN CODE [ran]** — and wider than reported. Parts of it are deliberate design (the tag strictness, "swap in different work"); the under-fill, the leg-day fill and the unchanged day name are not.

- **Root cause — five separate things stack:**

  1. **Not the tier's dumbbells.** Minimalist owns dumbbells, a kettlebell and bands; it lacks a bench and a barbell. `exercise-plan.ts:336-340`:
     `minimalist: new Set(['kettlebell', 'resistance band', 'bodyweight', 'dumbbells', 'dumbbell', 'pull-up bar', 'jump rope', 'medicine ball', 'plyo box', 'ab wheel', 'weighted backpack'])`. So bench-based dumbbell work (Dumbbell Bench Press, Neutral-Grip Dumbbell Press, Dumbbell Flyes, Dumbbell Rows) is out at the EQUIPMENT stage. That half is H1's (the other tracer).

  2. **The joint tag is the main cause, and it is the conservative default, not a reviewed verdict.** `exercise-db.ts:5313-5315`: `return entry.contraindicated_joints ?? entry.loads_joints` — "an un-reviewed entry keeps its historical (conservative) behaviour". **[ran]** 83 live entries load the shoulder; 68 are contraindicated for a shoulder flag, **59 of them only by that default**. That includes all 7 `isolation_shoulder` entries (Lateral Raises, Front Raises, Band/Cable/Machine/Backpack raises), all 8 non-landmine overhead presses, all 6 push-up variants, all 13 vertical pulls, Inverted/Table Row, Chair Dips, Band Shrug, and still Hanging Leg Raises and Ab Wheel Rollout (which the August audit itself called "wrongly excluded", `BACKLOG.md:14594`).
     Sam's pool after equipment + injury + style **[ran]**:

     | Pattern | Catalogue | After equipment | After injury | In final pool |
     |---|---|---|---|---|
     | horizontal_push | 20 | 7 | **1** (Dumbbell Floor Press) | 1 |
     | vertical_push | 9 | 5 | **0** | 0 |
     | isolation_shoulder | 7 | 5 | **0** | 0 |
     | isolation_tricep | 10 | 4 | 2 (Band Pushdown, Band Kickback) | 2 |
     | vertical_pull | 13 | 7 | **0** | 0 |
     | horizontal_pull | 16 | 5 | 3 (Towel Row, Backpack Row, Rear Delt Flyes) | 3 |

     The "six shoulder-friendly presses" exist and work as tagged, but at Minimalist only ONE is reachable: Dumbbell Floor Press. Barbell Floor Press and Landmine Press need a barbell, Neutral-Grip Dumbbell Press and Chest-Supported Row need a bench, the cable row needs a cable. Shoulder-friendly delt work in the catalogue = Rear Delt Flyes (dumbbells, `indicated_joints:['shoulder']`) and Face Pulls (cable only) — both filed as `horizontal_pull`, so they can only land on a pull day. There is **no** dumbbell triceps movement that survives a shoulder flag (Overhead Tricep Extension is explicitly contraindicated; Skull Crushers need a bar; no dumbbell kickback or lying extension exists in the catalogue), which is why a dumbbell owner gets a band.

  3. **A style template with one muscle per day has no fallback when that muscle is empty.** `getSplitForDays` returns `['Chest & Triceps','Back & Biceps','Legs & Calves','Shoulders & Abs']` for bodybuilding x 4 days (`exercise-plan.ts:1661`). `isTrackViable` only asks for 3 exercises of any allowed pattern, plus two hand-written label checks: `squatOk` for 'Squat & Carry' and `pushOk` for 'Push & Press' (`exercise-plan.ts:3123-3127`). 'Chest & Triceps' passes with exactly 3 (floor press + two band triceps). 'Shoulders & Abs' passes with 20, because its allowed patterns include all three leg patterns (`exercise-plan.ts:238`: `primary_patterns: ['vertical_push', 'isolation_shoulder', 'single_leg', 'knee_dominant', 'hip_hinge']`).

  4. **One-movement-per-family caps the chest day at two exercises.** Both surviving triceps moves share `substitution_group: 'tricep_extension'`, and `getMovementFamily` falls back to the group (`exercise-db.ts:5559-5561`), so `usedGroups` lets only one in; `refill(true, …)` keeps families enforced on both passes (`exercise-plan.ts:2718-2719`). Result: 1 press + 1 triceps. Set ceilings then stop any top-up: accessory 4, isolation 3 (`getRoleSetCeiling`, `exercise-plan.ts:3187-3191`) = 7 working sets, + a 2-set primer = **9**. Same mechanism at better tiers: all three reachable shoulder-friendly presses are family `bench_press`, so **[ran]** a FULL GYM, 60-90 minute, shoulder-flag chest day came out as `Barbell Floor Press 3 | Tricep Pushdowns 3` — six working sets.

  5. **The spare time goes to optional mobility, by ruling.** `applyDurationFiller` sizes a filler to `budget − actual` (`exercise-plan.ts:6477`) and, because Monday already has its cardio, writes it as `mobilityFiller` (`:6479-6488`). See the time-cap entry below.

- **Why "Shoulders & Abs" becomes a leg day [ran]:** slot 1 (`vertical_push`, required) finds nothing, its nearest-pattern fallback is `horizontal_push` (`exercise-db.ts:5101`) which is forbidden on this track, so it logs "(none)" and pushes to `uncoveredPatterns` (`exercise-plan.ts:2517-2521`). Slot 2 takes one leg accessory as designed. Slot 3 (`isolation_shoulder`) is empty. Then `pickFromTier('tier1_compound', …, track.primary_patterns)` and `pickFromTier('tier2_compound', …, [...primary, ...secondary])` (`:2652-2653`) and `refill` draw from the track pool — and legs are the only compounds in it. Hence primer + rehab primer + three leg compounds + one core move.
  **This is not only an injury effect.** **[ran]** 14 of 32 UNINJURED full-gym bodybuilding plans have three or more leg movements on "Shoulders & Abs". Sample, home gym, 60-90, no injury: `Overhead Press | Romanian Deadlifts | Tempo Air Squat | Walking Lunges | Hanging Leg Raises | Front Raises | Side Plank | Russian Twist`. Every overhead press shares family `overhead_press`, so after one press the remaining compound slots can only be legs. With the flag at full gym the day's MAIN LIFT became Trap Bar Deadlift. The code comment says the opposite of what happens: "A light unilateral leg accessory — not a second leg day" (`exercise-plan.ts:257-259`).

- **Why the name stays:** the day's label is the track key, `focus: trackFocus` (`exercise-plan.ts:5283`), and `getViableTrack` only swaps tracks when `isTrackViable` fails, which it does not. The scorer's `day_label_mismatch` rule covers the same two labels only (`quality-score.ts:436-442`), so no gate sees it.

- **Where the on-screen note is written:** `buildPatternGapNote`, `exercise-plan.ts:2305-2317`, attached at `:5286`, rendered at `TodayPanel.tsx:1106-1110` and `ProgramBrowse.tsx:562-564`. Two defects in the note itself: it is stamped once at generation and never recomputed ("Set once on the base plan and carried through periodized weeks unchanged", `types.ts:562-563`), so it still said "your … injury settings" after the flag was removed and after the knee adaptation changed the exercises it lists; and it tells the user to "Update your equipment or injuries in Profile", which for a removal does nothing (H5).

- **Measured spread [ran]** (32 plans per row, bodybuilding, 4 days):

  | Tier, injuries | "Shoulders & Abs" with no shoulder work | Chest day with one press or fewer |
  |---|---|---|
  | minimalist, shoulders | 28 of 32 | 28 of 32 |
  | home gym, shoulders | 0 | 28 of 32 |
  | full gym, shoulders | 0 | 28 of 32 |
  | minimalist, wrists | 0 | 28 of 32 |
  | any tier, no injury | 0 | 0 (but 14 of 32 Shoulders days are leg-heavy) |

- **Prior rulings:**
  - The strictness was reviewed once and judged mostly right: "~29 genuinely contraindicated (all 11 horizontal_push, all 3 vertical_push, all 5 vertical_pull, dips, lateral raises, overhead carry/tricep work) — a cuff injury really does rule out pressing and overhead pulling" (`BACKLOG.md:14594`). Note the word: a *cuff injury*.
  - "Six shoulder-friendly variants added (Ashley-approved scope, no more)" (`BACKLOG.md:14588`).
  - Ashley, 30 Aug 2026: "swap in different work" — "The app never suggests loading a joint somebody has told us hurts, so the alternative to a press is not an easier press — it is legs, core or pulling, said plainly" (`exercise-db.ts:5136-5139`). So replacing shoulder work with other work is deliberate. Replacing it with ONLY legs is not what she ruled.
  - Ashley, 24 Sep 2026: a pull-heavy week is not a flaw when the injuries left one press; "a coach prescribes more pulling than pressing when pressing is what hurts" (`CLAUDE.md:112`).
  - Ashley, 15 Sep 2026: "Pain is triaged before it is acted on, everywhere it is reported … any surface that lets somebody say something hurts asks the same three" — niggle / lasting / red flag (`CLAUDE.md:2314`). **Onboarding does not.** Its question is deliberately soft — "Anything that bothers you when you train — something you avoid or work around?", short label "Niggles" (`onboarding-slots.ts:771`) — and one tap is then filtered as a lasting injury at full strictness. The same is true of the Profile toggles. That mismatch is the heart of H4.
  - "Dietary enforcement, injury filtering, and load prescription always get a plan before a build" (`CLAUDE.md:2304`).
  - None found for: what a body-part day does when its body part is empty; the leg slot on Shoulders day beyond its own code comment; the wording of the gap note (grepped BACKLOG/CLAUDE/docs for `not a bug`, `pattern_gap_note`, `Shoulders & Abs`, `tell them plainly`, `severity`, `Niggles`).

- **What a CSCS coach would do instead, and how the engine can:**
  - *For a shoulder that "flares up" (a niggle, not a diagnosed injury):* keep pressing in the pain-free variants (floor press, neutral grip), drop overhead pressing, dips and behind-the-head work, keep the delts and upper back trained through rear-delt flyes, band face pulls/pull-aparts, prone Y-T raises and scapular work, add abs, and move the freed volume to pulling. Never three leg sessions in six days with one press. That is standard practice (train around, not through; bias pull over push for shoulder health) and it matches her 24 Sep and 30 Aug rulings.
  - *Engine, in order of safety:*
    1. **Give every body-part track a "defining pattern" and a named fallback** (data on `TrackDefinition`, replacing the two hand-written `squatOk`/`pushOk` lines). `Shoulders & Abs` defines `vertical_push | isolation_shoulder`; when the pool has neither, use `Upper Pull & Core` (its slots are vertical pull, row, biceps, rear-delt isolation, traps, core — `exercise-plan.ts:137-155`), so the day is rear delts, rows, shrugs and abs and is honestly NAMED that. Do not use `getViableTrack`'s "richest track" rule for this: the richest is a leg or full-body track.
    2. **Take the leg patterns out of `primary_patterns` on 'Shoulders & Abs'** and keep legs as the one slot that asks for them, so the tier-1 and tier-2 fills cannot draw a deadlift or three squats. Let rear-delt isolation (`substitution_group: 'rear_delt'`) onto this track. Fixes the uninjured leg-heavy Saturdays too.
    3. **Let a thin day borrow rather than stop.** When a track pool cannot reach its exercise count, widen to core and (for chest day) rear-delt/trap work before giving the time to optional mobility; and split the `tricep_extension` family into pushdown / kickback / overhead so two different triceps movements can share a day (they already cannot both be overhead).
    4. **Fill the catalogue gap:** dumbbell triceps kickback, lying dumbbell triceps extension, close-grip dumbbell floor press — reviewed tags at the same bar as the existing six.
    5. **Recompute the gap note from the day as it is now** (or drop it once the day is rebuilt), and stop it pointing at Profile until H5 is fixed.
  - *CSCS review of 1-3 (the five questions):* training effect — restores upper-back and delt stimulus instead of a redundant leg session; takes away — the "legs twice a week" intent on the fallback day (Legs & Calves still trains them once; say so in the build); fundamentals — push, pull, squat, hinge all still covered weekly, recovery improves (no squat pattern 48 h after leg day); floors/ceilings — `isTrackViable`'s ≥3 rule and the "legs ≥ 2 days" audit check both change meaning and must be re-measured on the 9,216 grid; scope — no diagnosis, no rehab prescription beyond what is already tagged `indicated`.

- **Fix:** steps 1-5 above (no tag is relaxed by any of them). Loosening what a shoulder flag removes is a separate, owner-gated change — see the question.

- **Class:** steps 1-3 COACHING (mine to decide, basis above) inside SAFETY-ADJACENT code (plan first). Step 4 SAFETY-ADJACENT. Step 5 MECHANICAL. Plus one **OWNER DECISION**:

  > **When someone ticks "Shoulders" at setup, how much should the app take away?**
  > - **A. Everything it removes today** — all pressing except floor press, all overhead work, all raises. Safest, and it is why Sam got one chest exercise a week.
  > - **B. Ask one follow-up — "which of these bother it?"** (pressing overhead / pressing from the chest / pulling from overhead / lifting the arm out to the side) — and remove only those.
  > - **C. Ask "niggle you train around, or an injury?"** A niggle keeps the gentle versions and drops only overhead work and dips; an injury behaves as today.
  > - **Recommendation: B.** It is your own 15 Sep rule (ask which kind before acting) applied to the one place that skips it, it needs no new medical judgement from the app because the person names the movements, and it maps straight onto data the app already has. Either B or C needs somewhere to store the answer, which is a database change and needs your word.
  > - Second, smaller: the on-screen sentence "not a bug, just a real gap in what's available" is the app's voice. Keep, or reword to say what the day does instead ("No overhead pressing while your shoulder's flagged, so today is upper back and abs")? Recommendation: reword.

- **Ships via:** frontend (`exercise-plan.ts`, `exercise-db.ts`, `quality-score.ts`). Owner option B/C adds an onboarding slot (frontend + `onboarding-chat` prompt) and a migration.
- **Gates:** `test:quality` (scorer; only two labels checked), `test:audit`, `test:injury-coverage`, `test:joint-tags`, `test:injury-rebuild`, `test:day-coverage`, `test:session-length`, `test:session-shortfall`, `test:equipment-labels`, `test:week-note`. None fails on this today. New check: for every body-part track on the grid, the day contains at least one exercise of its defining pattern OR carries a different focus; no day has ≥3 leg compounds unless its focus is a leg track; no trained day under N working sets while its filler exceeds M minutes. Seeded, and include a profile the broken code names (minimalist + shoulders + bodybuilding + 30-45 is one).
- **Risk:** every bodybuilding-style plan changes (the Shoulders day changes for the uninjured too), so `test:quality`'s score distribution and the frozen fingerprints move; the "legs ≥ 2 days/week" audit rule may fire where the fallback day drops its leg slot; splitting a movement family can put two near-identical moves on one day (`test:movement-families` pins which splits are deliberate). No stored plan changes until it is regenerated.
- **Confidence:** high on the causes (run, counted, and each hop read). Medium on the exact shape of the coaching fix until it is measured on the grid.

---

### H4 (time cap) · "9 sets · ~37 min" with a 30-33 minute walk and a 15 minute optional flow

- **Status: CONFIRMED IN CODE [ran].** The label is arithmetically honest about the wrong thing, and the screen mislabels the walk.
- **Root cause:**
  - **How "~37" is computed.** `ProgramBrowse.tsx:405`: `Math.round(estimateDaySeconds(workout) / 60)`, printed at `:526` as `{sets} sets · ~{mins} min`. `estimateDaySeconds` (`session-duration.ts:241-260`) = warm-up `total_seconds` + 120 s overhead + every set's work and rest + `recommendedCardio` **only if** `timing === 'post_session'` + `mobilityFiller`. For Sam's Monday **[ran]**: 5.5 warm-up + 2.0 overhead + 14.9 lifting + **15.0 optional mobility** = 37.4.
  - **So:** the warm-up is in, the OPTIONAL mobility is in, the walk is out. And it is always ~37 on a filled day, because the filler is sized as `budget − actual` and the 30-45 budget is the 37-minute midpoint (`session-duration.ts:27-28`; `exercise-plan.ts:6477`). The "9 sets" beside it counts the two primer sets (`ProgramBrowse.tsx:90-91` sums every exercise's sets).
  - **Why the walk is there.** Not the "28%" rule: `CARDIO_RESERVED_SHARE = 0.28` (`exercise-plan.ts:2326`) only reserves in-session cardio on a 'Conditioning & Core' track (`:2601-2603`), which a bodybuilding split never has. The walk comes from `assignConditioningNotes`: fat loss asks for 2.5 conditioning sessions a week (`goal-policies.ts:200`), rounded to 3; two go on rest days, the third on the first "light" training day, which is Chest & Triceps. Because the session length is 30-45, the engine deliberately makes it a SEPARATE session (`exercise-plan.ts:4900-4906`): `timing: 'independent_session', reason: 'Scheduled as a separate session to preserve your strict lifting window.'` It grows 10% in week 2 → 33 (`progressConditioningWeek`, `:4594-4607`).
  - **Why it looks like part of the session.** `TodayPanel.tsx:1176-1178` renders any `recommendedCardio` under a "Finish" heading through `FinisherRow`, whose label defaults to "Finisher" (`FinisherRow.tsx:29`). Nothing reads `timing`; the `reason` and the "Independent session:" note are never drawn (`ProgramBrowse.tsx:559` shows the note only when there is NO cardio block). The engine's one honest sentence is dropped at the screen.
- **Is the real session over the cap?** By the engine's intent, no: 22 minutes of work, a separate walk, optional mobility. As the screen presents it, yes: 22 + 30 = 52 minutes, 67 with the mobility, against a 45-minute ceiling and a stated 40. Thursday's legs are 40.1 / 41.2 / 42.2 min in weeks 1-3 and 44.7 in week 10 **[ran]** — inside 45, over Sam's 40 (M5).
- **Prior rulings:** optional mobility on a short day is deliberate and Ashley's-era house rule: "a short day gets the rest of its time, as optional mobility … Optional filler is elastic" (`CLAUDE.md:43-49`). Counting the filler in the day's length is deliberate too: "That time is counted above, correctly: it is what the day asks of somebody's evening" (`session-duration.ts:265-268`). No ruling found on how an independent session is shown (grepped `independent_session`, `Independent session` across BACKLOG/CLAUDE/docs: no hits).
- **Fix:**
  1. `FinisherRow`/`TodayPanel`: branch on `timing`. `independent_session` gets its own heading and label ("Separate from your lifting — any time today") and shows `reason`; only `post_session` is a "Finisher". Same in `ProgramBrowse.tsx:548-553`, which already special-cases `post_session`.
  2. The label says what it is made of: print the required length and name the optional part, e.g. "9 sets · ~22 min + 15 optional" using the existing `estimateRequiredDaySeconds` / `optionalFillerSeconds` (`session-duration.ts:281-291`). One helper, used by Browse, the Today header and Home so they cannot drift.
  3. Count working sets in the label, or say "incl. warm-up".
- **Class:** 1 and 3 MECHANICAL. 2 is **OWNER DECISION** (what the app says): *"Should a day's time show only the work, or the work plus the optional stretch?"* — A: as now, one number that includes the optional part; B: "~22 min + 15 optional"; C: work only. Recommendation: B.
- **Ships via:** frontend.
- **Gates:** `verify:finisher`, `verify:mobility-filler`, `test:filler-yields`, `test:cardio-effort`, `test:session-length`, `test:one-day-one-look`. None asserts on `timing`. New: a `verify:` check that a day with `timing:'independent_session'` never renders the word "Finisher"; a `test:` check that the printed minutes equal required + optional and that the two parts are both on screen.
- **Risk:** three screens print a day's minutes (Browse, Today header, Home); change one and the "one day, one look" gate should catch the rest, but it compares what is there today.
- **Confidence:** high.

---

### H5 · Removing the shoulder flag changes nothing and offers nothing

- **Status: DELIBERATE DESIGN [read]** — pinned by a gate. The tester's complaint stands as a gap in that design.
- **Root cause:** `plan-invalidation.ts:105-109`:
  `// Only an ADDED injury is a safety problem — removing one leaves a plan that is merely more cautious than it needs to be, which is not urgent and not worth a dialog.` then `const added = now.filter(i => !was.includes(i)); if (added.length > 0) { …offer… }`. A removal returns `null`, `ProfileScreen.tsx:859-868` raises no offer, and nothing else runs. `scripts/test-rebuild-offer.ts:94-95` asserts it: `check('removing an injury does not', removed === null, removed)`.
  The coach path matches: `executeInjuryRecovered` "Deliberately does NOT touch the mesocycle" (`pending-action-executor.ts:1010`), and its card says "This won't undo any exercise already swapped out for it" (`ChatAssistant.tsx:2690`).
  The reasoning assumed an injury only ever *thins* a plan. For a flag set at onboarding the plan was BUILT around it: **[ran]** the same profile without the flag gets `Dumbbell Floor Press + Push-Ups + Overhead Tricep Extension` on Monday (10 working sets) and `Dumbbell Shoulder Press/Arnold Press + Front Raises` on Saturday with no gap note. "Merely more cautious" is one press a week and a third leg day for sixteen weeks.
  Two things make it worse: the coach told the tester the plan "will immediately bring back your full chest and shoulder volume", the opposite of what its own prompt says (`chat-gemini/index.ts:2191`: "it does NOT undo any exercise already swapped out for it"); and the gap note on Saturday tells the user to fix it in Profile.
- **Prior rulings:** the rebuild offer itself is ruled: "Ask, never silently" and "Only the current week and later" (`PLAN-rebuild-offer.md`, "The shape" and "Weeks that are rebuilt"). The removal exemption is the build session's judgement in a code comment, not a recorded Ashley ruling (grepped BACKLOG/CLAUDE/docs for `removing an injury`, `more cautious than`, `recovered`: the injury-persistence decision entry, `BACKLOG.md:14611`, records "remove → mesocycle left untouched" as verified behaviour, not as a choice put to her). `CLAUDE.md:626` lists "injuries (add / lasting / recovered) … both surfaces, proposed and confirmed", which overstates what "recovered" does.
- **Fix:** in `detectPlanInvalidation`, return an offer for a removal too, with its own words ("Rebuild your plan now that's cleared?" / "Your plan was built to keep clear of that. I can rebuild it from today so the work it was leaving out comes back. Everything you've logged stays."). The confirm already goes through `rebuildFromCurrentWeek` → `rebuildAgainstProfile`. Mirror it on the coach's `propose_injury_recovered` card (one function, both surfaces — the `meal-refit` pattern). **It must land together with the day-level protection in H11**: `rebuildAgainstProfile` replaces whole weeks (`plan-adaptations.ts:315-326`), so today "from this week onwards" also rewrites the days of this week already trained.
- **Class:** SAFETY-ADJACENT (injury path; plan first) + **OWNER DECISION**:
  > **When someone removes an injury, should the app offer to rebuild their plan?**
  > - A. No, as now — the plan stays cautious until they start a new plan (which hides their history).
  > - B. Yes, offer it every time, from today forward, history kept.
  > - C. Offer only when the plan was visibly built around it (it has a missing-movement note or was generated with that injury).
  > - Recommendation: B. It is the same question the app already asks when one is ADDED, declining costs nothing, and without it the Profile toggle and the coach's "recovered" card both look broken.
- **Ships via:** frontend; `chat-gemini` deploy only if the tool description/prompt §3c wording changes (it should, to stop the false promise).
- **Gates:** `test:rebuild-offer` (line 94-95 must flip), `verify:setup-answers`, `test:profile-restore`, `test:injury-separation`, `test:coach-parity`, `test:coach-promises`. New: removal raises the offer; confirm restores a press on the chest day; days already trained this week are byte-identical after the rebuild.
- **Risk:** an offer on every un-tick could nag if someone toggles to explore — the existing "per-change, cleared on decline" behaviour covers it. A rebuild re-rolls exercise selection for the remaining weeks, so lifts with logged progress can change; say so on the card.
- **Confidence:** high.

---

### H11 · The 14-day knee adaptation rewrote a finished session, listed rows unsorted, used band/kettlebell work

- **Status: CONFIRMED IN CODE [ran]** — reproduced the card row for row.

  Output of the real `substituteForInjury` on Sam's plan, weeks [1,2], in the order the card shows it:
  ```
  Thursday (Week 1): Box Squat (Bodyweight) -> Spanish Squat
  Saturday (Week 1): Single-Leg Glute Bridge -> Kettlebell Swing (Heavy)
  Thursday (Week 2): Box Squat (Bodyweight) -> Spanish Squat
  Saturday (Week 2): Single-Leg Glute Bridge -> Kettlebell Swing (Heavy)
  Thursday (Week 1): Walking Lunges -> Low Box Step-Up
  Saturday (Week 1): Tempo Air Squat -> Spanish Squat
  … Thursday (Week 1): Reverse Nordic Curl -> Banded Terminal Knee Extension …
  ```
  and week 2 Saturday holds `Kettlebell Swing (Heavy) 4x10-12 ~24kg tempo=2-0-1`.

- **Root cause, one per symptom:**
  1. **Finished session rewritten — the week is the smallest unit.** `ChatAssistant.tsx:2537-2541`: `weekNumbers = weeks where n >= liveWeek && n < liveWeek + ceil(days/7)`. `substituteSlots` then walks every day of every target week (`plan-adaptations.ts:48-51`) with no test for "before today", "has logged sets" or "completed". Thursday of week 1 was in week 1, so it was rewritten. The stored plan row changes, so the day view shows Spanish Squat where Box Squat was logged.
  2. **The window is not the 14 days asked for [read + inferred from the dates].** `expires_at = now + 14 days` (`plan-adaptations-store.ts:54`) but the weeks touched are calendar weeks 1 and 2. Reported Thursday 8 Oct: Monday-Thursday of week 1 (already past) were rewritten, and Monday 19 - Thursday 22 Oct (days 11-14, week 3, including a Legs & Calves day) are **not adapted at all**. Safety-relevant.
  3. **Rows unsorted.** `touchedSlots.push` (`plan-adaptations.ts:91, 100`) runs inside `Promise.all` over weeks and `Promise.all` over days, each slot awaiting `recomputeLoad` first — so pushes interleave across days and weeks in whatever order the awaits resolve. The card maps them straight through (`ChatAssistant.tsx:2561-2565`); the receipt does too (`pending-action-executor.ts:903`).
  4. **"Kit I don't own."** The adaptation did respect the equipment setting — the setting is the problem. Bands and a kettlebell ARE in the Minimalist tier (`exercise-plan.ts:336-340`, and Ashley's 9 Sep ruling was "FIX THE WORDS", not narrow the kit, `onboarding-slots.ts:119-122`). That is H1-H3's. What is this path's own: (a) it takes `candidates[0]` (`plan-adaptations.ts:97`) from `getReplacementCandidates`, which since 18 Sep ranks over the pool with the STYLE stage skipped (`mesocycle-edit.ts:78, 84`) — built for a swap list a person picks from ("nothing about anyone's PLAN changes", `:68`), while the comment here still says candidates are "equipment/injury/style/skill" filtered (`plan-adaptations.ts:79-81`). For Sam this changed nothing (Spanish Squat is exempt as knee rehab; Kettlebell Swing (Heavy) was reinstated into the strict pool by the per-pattern style floor, `MIN_VIABLE_PER_PATTERN`), but an automatic path can prescribe off-style work. (b) Single-Leg Glute Bridge was removed only because `loads_joints: ['hip','knee']` has no reviewed override (`exercise-db.ts:4761`) while plain Glute Bridge has `loads_joints: []` — a glute bridge is a staple knee-friendly movement, and replacing it with a 24 kg ballistic swing is a poor trade. (c) The dedupe is per day (`usedInDay`), so Spanish Squat and Low Box Step-Up land on both Thursday and Saturday.
  5. **It does not run the shared tail.** `substituteSlots` never calls `settleWeek`, so the warm-up is not rebuilt for the new exercises and set hierarchy / load coherence / weekly balance are not re-run — the edit path CLAUDE.md's rule 3 ("Adjustment keeps the bar", `CLAUDE.md:1273`; the tail's list at `:758` omits adaptations).
  6. **Reverting restores a snapshot, not a diff.** `revertAdaptation` writes back the whole pre-image weeks (`plan-adaptations-store.ts:115-120`). Any edit made to those weeks while the adaptation was active — Run 2's ban that swapped Band Tricep Kickback for Overhead Tricep Extension — is silently undone when it expires.
  7. **Nothing else knows the adaptation exists (the H17 link).** A time-bounded adaptation deliberately does not write `profile.injuries`, and `getActiveAdaptations` has exactly one caller: the New Plan warning (`App.tsx:3285`). Swap lists, add-exercise, session rebuild, the weekly rebuild offers and `substituteForEquipment` (`plan-adaptations.ts:392`: `candidateProfile = { ...profile, equipment_access }`) all filter on `profile.injuries` alone, so any of them can put Box Squat back over an active knee adaptation. The coach's context has no line for it either (grepped `adaptation` in `chat-plan-context.ts` and `plan_adaptations` in `supabase/functions`: no hits).
  8. **It should never have been offered.** The tester wrote "a sharp pinch below the kneecap". The prompt says: "Red flag per §1c (sharp, joint, one-sided …) → redirect to a professional … Never call either injury tool for this tier" (`chat-gemini/index.ts:2182`), and the app rule is "sharp, one-sided or worsening names a professional and changes nothing" (`CLAUDE.md:2314`). On the screen that is enforced in code (`edit-reason.ts:238-283`, `verify:hurts`). On the coach path it is prompt-only: no code reads the user's words before building the card (grepped `RED_FLAG|red_flag|sharp` in `ChatAssistant.tsx` and the edge function: prompt text only).

- **Prior rulings:** time-bounded vs lasting, and rebuild-when-gutted, are Ashley's (`BACKLOG.md:14611`, `:14596`). "Only forward … Past weeks hold logged sets" (`plan-invalidation.ts:18-21`) — written about weeks, never applied to days. Pain triage as above. "A new ruling can break an old one": the 18 Sep style-widening changed what this automatic path can pick without this path being revisited.
- **Fix:**
  1. One shared day guard, used by `substituteSlots` AND `rebuildAgainstProfile`'s splice: skip a day when its date is before today, or it has logged sets / is marked done. Callers pass `(weekNumber, dayName) => boolean`; this is the same guard H5's rebuild needs.
  2. Work out the window from dates: touch each day whose date falls in [today, today + duration], across however many weeks that spans.
  3. Sort `touchedSlots` by week, weekday, slot index before returning (one line at the end of `substituteSlots`); card and receipt then agree.
  4. Automatic substitution takes the first candidate from the strict pool and only falls back to the wide one when it is empty; add a weekly-appearance check; review the glute-bridge knee tag (coaching: explicit `contraindicated_joints: []` with the basis recorded).
  5. Call `settleWeek` per touched day.
  6. Revert by slot: record what each slot was and became; at expiry put back only slots still holding the adaptation's replacement, and never on a completed day.
  7. One "effective injuries" value = profile injuries ∪ active injury adaptations, built once in App and handed to every pool-building call and to the chat context; profile WRITES keep using the real list (`test:injury-separation`, `test:plan-adaptations-separation`).
  8. A code guard on the coach's two injury cards, the same shape as the cardio hedge list: if the user's own message carries a red-flag word, the client shows `RED_FLAG_ADVICE` and builds no card.
- **Class:** 1-3, 5, 6 MECHANICAL inside SAFETY-ADJACENT code (written plan first); 4 COACHING; 7 SAFETY-ADJACENT; 8 SAFETY-ADJACENT + small **OWNER DECISION**: *"Which words mean 'see someone' rather than 'ease off'?"* — A: the screen's three (sharp, one-sided, getting worse); B: those plus swelling, locking, giving way, numbness; C: leave it to the coach's judgement as now. Recommendation: B, blocking in one direction only (a flagged word never produces a card).
- **Ships via:** frontend (all of it; the card is built in the browser). `chat-gemini` only if the prompt wording changes.
- **Gates:** `test:injury-adaptation-safety` (joint cleanliness only), `test:plan-adaptations-separation`, `test:injury-separation`, `test:injury-rebuild`, `test:slot-replacement`, `test:pending-actions`, `test:chat-actions`, `verify:hurts`. None looks at dates, order, completed days or revert-after-edit. New: (a) a day before today and a day with logged sets are byte-identical after substitute AND after rebuild; (b) rows are in week/day/slot order — with at least two weeks and two days, so order is a real choice; (c) every date in the stated window is adapted; (d) edit-then-expire keeps the edit; (e) a swap list built during an active adaptation contains nothing contraindicated for it; (f) "sharp" in the message yields no card.
- **Risk:** the day guard needs a reliable "done" signal for moved sessions (H15/H19's lookup — fix that first or share it). Effective injuries touches every pool call; a missed one is a silent gap, so grep-derive the call sites. Slot-level revert changes what `pre_image` means for rows already stored.
- **Confidence:** high for 1-7 (run and read). High that 8 is unguarded; the model's turn itself was not replayed.

---

### M5 · "40 minutes tops, hard stop" stored as the 30-45 bucket

- **Status: CONFIRMED IN CODE / DELIBERATE DESIGN [read + ran].** Session length is a four-value choice; the exact figure has nowhere to live.
- **Root cause:** the slot is `control: 'single'` over `DURATION_OPTIONS` (`onboarding-slots.ts:100-105, 781`), written to `session_duration_preference` (`:1106`). Three numbers come out of '30-45' (`session-duration.ts:27-28, 50-51, 71-72`): the generator AIMS at **37** min (the midpoint budget), treats **30** as the minimum, and enforces **45** as the hard ceiling in the last pass (`exercise-plan.ts:8223-8229`). The add-exercise warning uses the ceiling: `capMinutes = getSessionMaximumSeconds(...) / 60` → 45 (`TodayPanel.tsx:547-548`; words at `AddExerciseSheet.tsx:243`). So a 40-minute hard stop is honoured as "anything up to 45": Sam's leg day runs 40.1 → 44.7 min across the block **[ran]**, and adding an exercise warns only past 45.
- **Prior rulings:** session length as buckets, and rebuilding when it changes, are settled (`CLAUDE.md:659`). "I only have 45 minutes today" takes real minutes but is today-only (`CLAUDE.md` "ALREADY WORKS on both surfaces"). No ruling found on storing an exact standing cap (grepped BACKLOG for `hard stop`, `exact minutes`, `session_cap`, `minute cap`).
- **Fix (if wanted):** an optional `session_cap_minutes`; the final safety trim and the add warning use `min(cap, bucket maximum)`; onboarding and `propose_session_length` record it when the person states a number; Profile shows it.
- **Class:** **OWNER DECISION** (needs a migration):
  > **If someone says "40 minutes, hard stop", should the app hold them to 40 or to the top of the range they fall in (45)?**
  > - A. Keep ranges only, as now. Simple; a stated 40 can become 44.
  > - B. Remember the exact number as a ceiling, on top of the range. Needs a database change.
  > - C. Keep ranges but have the coach say so at setup ("I'll keep you under 45").
  > - Recommendation: B. "Hard stop" is the person telling you the one number that matters, and the session already drifts past it by week 2.
- **Ships via:** migration (owner's word) + frontend + `onboarding-chat` and `chat-gemini` (tool argument and prompt).
- **Gates:** `test:session-length`, `test:session-length-change`, `test:session-shortfall`, `test:exercise-add`, `verify:exercise-add`, `test:setup-answers`. New: with a 40 cap no week's day exceeds 40 as the screen costs it.
- **Risk:** a cap below the bucket's 37-minute target fights the filler and the minimum (a 32-minute cap in a 30-45 bucket leaves a 2-minute band); define which wins. A new column must be named in the onboarding insert and read with `select('*')` (`CLAUDE.md`, "A new column is a change to every reader and writer").
- **Confidence:** high.

---

### M24 · Coach says "I'll adjust your plan to ease off your knees" with no card

- **Status: PARTLY** — model behaviour; what governs it is located, and one thing in the prompt invites it.
- **What exists [read]:**
  - Prompt §3a (`chat-gemini/index.ts:2180-2188`). Line 2186: time-bounded answer → `propose_injury_adaptation` with area + days, "mention this once ('it'll ease back to normal after that, or tell me anytime to end it early')". Line 2187 hands the model the sentence itself: `say so once, plainly, e.g. "I'll adjust your plan for this and add it to your injuries…"`. Nothing ties that sentence to a tool call in the same turn.
  - Tool description (`:887-889`): "This does NOT apply anything — the app shows a card … Only call this once you know BOTH the affected area … AND how long".
  - The false-claim guard (`_shared/plan-claim.ts` + `src/lib/plan-claim.ts`, held by `test:no-false-claim`) refuses "I've swapped / it's done" sentences. Future tense is on its allow-list: the HEDGE pattern includes `i'll|i will` (`plan-claim.ts:61` in both copies). So "I'll adjust your plan…" with no card passes by design — it is read as an offer.
  - Two promises with nothing behind them: "tell me anytime to end it early" — `endAdaptationEarly` (`plan-adaptations-store.ts:171`) has **zero callers** and there is no tool for it (read all 48 declared tool names; none ends or lists an adaptation); and the red-flag miss described under H11.
  - "It called tomorrow 'leg work'; tomorrow is Chest & Triceps" follows the moved session and belongs to the plan-state tracer (H15/H19).
- **Prior rulings:** "The coach acts; it never sends anyone to a control" (`CLAUDE.md:897`); model obedience is the exam's to grade, code blocks the costly direction (`CLAUDE.md`, the cardio ruling).
- **Fix:** (1) reword §3a so the example sentence is something the CARD turn says, and add "never say you will change the plan in a turn where you have not called the tool — ask the missing question instead"; (2) a "promise without a card" check beside the false-claim one: a first-person future plan-change sentence in a turn with no proposal triggers one re-ask of the model (or a floor reply asking the missing detail); (3) remove "or tell me anytime to end it early" until M25 gives it a route, then wire it.
- **Class:** MECHANICAL (1, 3). (2) is MECHANICAL with a false-positive risk worth measuring first.
- **Ships via:** edge function `chat-gemini` (+ `_shared/plan-claim.ts`, with the `src/lib` twin in lockstep, frontend).
- **Gates:** `test:no-false-claim`, `test:coach-promises`, `test:coach-rules-sync`, `test:coach-exam-fresh` (a prompt change makes the exam stale), `coach-exam` (the only thing that can see whether the model obeys). New exam case: knee niggle, two turns, turn 2 must carry the adaptation card; a "sharp" variant must carry none.
- **Risk:** a promise detector can fire on honest offers ("I'll put a card up — tap confirm"); keep "confirm/card" phrases vetoing it.
- **Confidence:** high on what exists; the cause of that single turn is model behaviour and stays an inference.

---

### M25 · The active adaptation isn't shown anywhere; "Exercises to avoid" sits under Nutrition as "won't eat/do …"

- **Status: CONFIRMED IN CODE [read].**
- **Root cause:**
  - `ProfileScreen.tsx` never reads `plan_adaptations` (the Injuries block, `:1334-1380`, draws only the eight toggles). `getActiveAdaptations` is called once, for the New Plan warning (`App.tsx:3285`).
  - "Exercises to avoid" is placed inside `<Group label="Nutrition">` → "Dietary & cooking" (`ProfileScreen.tsx:1173, 1176, 1261`), next to "Foods to avoid".
  - Three writers store an exercise ban with a food sentence: `pending-action-executor.ts:319`, `App.tsx:2429`, and the generic `ChatAssistant.tsx:3955` — `displayText: \`won't eat/do ${name}\``. The Profile's own add path writes "won't do …" (`ProfileScreen.tsx:629`), so the two disagree. The facts list prints `display_text` as stored (`:1475`).
- **Prior rulings:** "Exercises to avoid now sits beside Foods to avoid on Profile" (`CLAUDE.md`, 14 Sep entry) — the placement was a build choice described in passing, not a ruling on which section.
- **Fix:** under Injuries, list each active adaptation: "Easing off your knees until 22 Oct" with "End now" (wires `endAdaptationEarly`, which closes M24's empty promise) and, for H11, "what changed". Move "Exercises to avoid" to Training setup. Write "won't do X" in all three writers and normalise old rows at render (`won't eat/do` → `won't do` when `kind === 'exercise_preference'`). Put the adaptation in the coach's context too.
- **Class:** MECHANICAL for the wording and the section move. Where the adaptation shows is a small **OWNER DECISION**: A: under Injuries on Profile; B: a line on the Exercise tab while it is active; C: both. Recommendation: C — Profile is where the tester looked, the Exercise tab is where it matters.
- **Ships via:** frontend.
- **Gates:** `verify:setup-answers` §7 (drives "Exercises to avoid"; will need its selector moved), `test:food-dislike-is-a-ban`, `test:coach-parity`. New `verify:` check: with an active adaptation the Profile shows it and "End now" restores the plan.
- **Risk:** "End now" goes through the snapshot revert described in H11.6 — fix that first or the button undoes later edits.
- **Confidence:** high.

---

### L17 · Header shows today's minutes while another day is open; warm-up minutes differ between tab and programme

- **Status: header CONFIRMED [read]; warm-up PARTLY [read + inferred], and likely deliberate.**
- **Root cause:**
  - Header: `sessionEstimate` is computed from `workout`, which is always TODAY's session (`TodayPanel.tsx:783-817`), and passed unconditionally as `estimatedMinutes={sessionEstimate.minutes}` (`:864`) to the row above the peeked day (`peekDay` branch, `:911`). Peeking never changes it.
  - Warm-up: both screens use one component, but only Today passes the "what feels tight" drills — `extra={tightness.items}` (`TodayPanel.tsx:1117-1123`) — and the badge adds them: `moveCount = general + mobility + rampCount + extra` and `~{totalMinutes + extraMinutes} min` (`WarmupSection.tsx:56-64`). Programme view passes none (`ProgramBrowse.tsx:579-583`). "4 moves · ~6 min" vs "7 and 10" is exactly three extra drills (the feature's maximum) and about four minutes, so **[inferred]** the tester had tight areas selected. That is by design: the drills are "about today and vanish when she clears them" and are "never stored on the plan" (`WarmupSection.tsx:29-33`; `CLAUDE.md`, 15 Sep tightness entry, `screen only`).
- **Prior rulings:** tightness adds warm-up to TODAY only (`CLAUDE.md`, "Say what feels tight before a session"). None on the header while peeking.
- **Fix:** header — pass the peeked day's minutes, or hide the chip while peeking: `estimatedMinutes={peekDay ? (peekWorkout?.exercises.length ? Math.round(estimateDaySeconds(peekWorkout)/60) : undefined) : sessionEstimate.minutes}` (and drop the shortfall note while peeking). Warm-up — in the programme view, today's row passes the same extras, or the Today badge says "4 moves + 3 for today".
- **Class:** MECHANICAL.
- **Ships via:** frontend.
- **Gates:** `verify:tightness`, `test:tightness`, `test:one-day-one-look`, `verify:warmup-rows`. New `verify:` check: peek a day whose length differs from today's and read the header.
- **Risk:** low.
- **Confidence:** high on the header; medium on the warm-up (I could not confirm the tester had tight areas set — if not, the second suspect is that Today shows the moved session's rebuilt warm-up while Browse shows the plan's stored row).

---

### L30 · "2s down · drive up" on Kettlebell Swing and a timed Spanish Squat; Plank "3x34-49s"

- **Status: tempo CONFIRMED IN CODE [ran]; hold range DELIBERATE with a units flaw [read + ran].**
- **Root cause:**
  - **Tempo is inherited through a replacement.** Generation only attaches a tempo to an unloaded, rep-counted, non-primer lift (`applyTempoPrescription`, `exercise-plan.ts:5480-5495`), and a gate holds that for generated plans. But `applyReplacement` starts from `...slot` (`mesocycle-edit.ts:299`) and resets `ramp_up`, assistance and `selection_note` (`:330-341`) — not `tempo`. The knee adaptation replaced Box Squat (Bodyweight) and Single-Leg Glute Bridge, both carrying `2-0-1`, so **[ran]** `Spanish Squat 3x30-45s tempo=2-0-1` (a hold) and `Kettlebell Swing (Heavy) 4x10-12 ~24kg tempo=2-0-1` (loaded and ballistic). `ExerciseLine.tsx` prints `describeTempo(ex.tempo)` whenever it is set. This is the fourth field to leak through this one function (`BACKLOG.md:14598`, "Slot-replacement data inheritance — CLASS fixed (3rd instance)"). Every swap, ban, injury and equipment adaptation shares it. Generation itself cannot do this: every ballistic entry is a primer or cardio except Kettlebell Swing (Heavy), which always carries a load **[ran]**.
  - **Hold ranges.** A hold starts at `'30-45s'` (`fixedUnitPrescription`, `exercise-plan.ts:2957`) and is shifted by the REP delta: `reps = shiftReps(phaseReps, rampSteps, repFloor)` (`:7342`), and `shiftReps` adds the same number to seconds (`periodization.ts:700-705`). Anatomical Adaptation's `rep_shift` is 3 and each week adds 1, so week 1 is 33-48 s and week 2 is **34-49 s**. Progressing holds is deliberate ("without this, an isometric hold … NEVER changes week to week", `periodization.ts:694-699`); the size of the step is a rep number used as seconds — the exact fault already fixed for intervals with a 5-second step ("produces un-coached numbers ('33s')", `periodization.ts:716-724`).
- **Prior rulings:** tempo is the lever only where there is no load to add (Ashley's rulings recorded at `exercise-plan.ts:5484-5491`); slot replacement must carry nothing of the outgoing exercise (`test:slot-replacement`).
- **Fix:** (1) extract generation's eligibility test into one predicate (`tempoEligible(entry, exercise)`), have `applyReplacement` set `tempo` to the outgoing value only when the INCOMING exercise passes it, otherwise `undefined`; (2) as a second line, the renderer shows tempo only for rep-counted exercises; (3) holds step in 5-second notches from the base (30-45 → 35-50 → 40-55), the same treatment intervals got. CSCS basis for (3): isometric holds are progressed in round time blocks a person can count; a one-second weekly change is below what anyone can execute or perceive, so it is noise, not overload. Training effect unchanged in direction, slightly larger per step; nothing is taken away; no floor is redefined (`MIN_HOLD_SECONDS` stays).
- **Class:** (1) and (2) MECHANICAL; (3) COACHING.
- **Ships via:** frontend.
- **Gates:** `test:slot-replacement` (0 mentions of tempo — the gap), `test:tempo-prescription` (generated plans only), `test:session-length` (tempo feeds the duration model — clearing it changes minutes), `verify:finisher`. New: after a replacement, no hold, carry, interval or loaded lift carries a tempo; for holds, every week's range ends in 0 or 5.
- **Risk:** stored plans already carrying the leaked tempo keep it until re-edited — the render guard (2) covers them. A 5-second step changes the minutes of every day with a hold, so `test:session-length` and the filler must be re-run.
- **Confidence:** high.

---

## Shared choke points

1. **The week is the smallest unit anything can replace.** `substituteSlots` (all days of the target weeks) and `rebuildAgainstProfile` (whole-week splice) have no notion of "already trained". One day guard fixes H11's rewritten session, makes H5's rebuild safe, and silently also fixes every existing rebuild offer (equipment, style, goal, days, session length), which today rewrite the trained days of the current week.
2. **`applyReplacement` (`mesocycle-edit.ts:273`).** L30's tempo is the fourth outgoing-exercise field to survive it. Make the function build the slot from a whitelist of programming fields instead of spreading and deleting.
3. **Active adaptations are invisible outside their own card.** No "effective injuries". Drives H11.7, H17 (other tracer), M25, and half of M24. One value built in App, read everywhere a pool is built and in the coach's context.
4. **A track's label is its key, and nothing checks the label against the day.** `isTrackViable` + the scorer's `day_label_mismatch` both hard-code two labels. A `defining_patterns` field on the track serves the generator, the scorer and the gate at once (H4, both halves).
5. **`estimateDaySeconds` answers one question and is printed as another.** It includes optional filler and excludes independent cardio, and three screens print it bare. One "day length, in parts" helper fixes the "~37" label, the header (L17) and gives M5's cap something exact to be checked against.
6. **Pain triage exists on one surface.** The exercise row asks niggle / lasting / red flag in code. Onboarding, the Profile toggles and the coach's two injury cards do not. H4's owner question and H11.8 are the same rule applied to the other three.
7. **Movement families decide how full a thin day can be.** `tricep_extension`, `bench_press` and `overhead_press` each admit one exercise per day; with an injury that is the whole day.

## Suggested build order

1. **L30 tempo + `applyReplacement` whitelist** — mechanical, small, removes wrong cues on every swap. (frontend)
2. **H11 mechanical set, behind a written plan:** day guard, date-true window, sorted rows, `settleWeek`, slot-level revert. Needs the "which session is on this date" lookup the plan-state tracer is fixing for H15/H19 — share it.
3. **Effective injuries** (choke point 3) + **M25** Profile line and "End now" + remove the unkept "end it early" promise (M24.3).
4. **Red-flag code guard on the coach's injury cards** (H11.8) — after the owner's word list.
5. **H4 engine work, behind a plan and measured on the grid:** defining patterns + named fallback track, legs out of the Shoulders day's fill, thin-day borrowing, family splits, gap note recomputed. New gate first, pinned on offenders the broken code names.
6. **H4 time label + independent-session row + L17 header** — one helper, three screens.
7. **H5 rebuild-on-removal** — after 2 (it needs the day guard) and after the owner's answer.
8. **Owner-gated, each needs a migration:** shoulder follow-up question (H4), exact session cap (M5).
9. **M24 prompt wording + promise check** — batch with the other `chat-gemini` changes, then re-run the coach exam.

## For the main session to remember

- The six shoulder-friendly presses all share one movement family, so a shoulder flag yields ONE press per chest day at every equipment tier, not just Minimalist.
- "Shoulders & Abs" is leg-heavy for uninjured users too (14 of 32 full-gym plans) because its primary patterns include the three leg patterns.
- `endAdaptationEarly` has no callers; the coach promises it.
- Adaptation windows are calendar-week aligned while expiry is date-based: a 14-day adaptation started on a Thursday rewrites four past days and leaves days 11-14 unadapted.
- The `~N min` label = warm-up + 2 min overhead + sets + post-session cardio + optional mobility; independent-session cardio is excluded and is drawn as "Finisher" anyway.
