# Runs 3 and 4 (9-10 Oct 2026): traced, not built

Report only. Each item traced on `claude/test-log-fixes-oct9` (forks main at `0df0bc12`, the
build the runs used). Four read-only tracers, then the load-bearing claims re-checked by hand
(marked **checked**). Nothing here is built; it waits for Ashley's "build it".

Status key: **fixed** on the branch / **partly** / **open** / **unproven** (cause inferred, needs a run).

## HIGH

| # | What she saw | Cause | Status |
|---|---|---|---|
| H24 | Header "1692 planned · on target" while the rows sum 1,801; same after a coach-logged meal (1,498 vs 1,690) | The header and its verdict add up the PLAN's dishes (`App.tsx:481-489` → `MealPlan.tsx` `TotalsHero`). A LOGGED meal's row shows what was eaten (`MealPlan.tsx:928`). Once any meal is logged at a different size, header and rows disagree. The coach's log writes the eaten meal and leaves the plan's dish in the header's sum. | **open** (coach case clear from code; add-food case inferred, same mechanism) |
| H24b | "The rest of the day re-fits around it" | The add-food preview no longer says this on the branch; it runs a real trial (H9 fix). One leftover: after an ingredient edit, `MealPlan.tsx:1027` still says "Your day has been re-fitted around it" with no trial. **checked**. The trial also ignores meals already eaten. | **partly** |
| H25 | A blank tick logged last session's 30 kg against a plan of 24, twice | A blank box saves, in order: typed → LAST SESSION's same set → the plan (`SetGrid.tsx:566`, **checked**). The grey number uses the same order, so it does show 30; the fault is that last time outranks today's plan and today's previous set. Nothing reads the set just logged. The safety warning starts at 1.5× the ceiling (36 kg), so 30 passed silently. | **open**. The carry-down in `wip/x3-exercise-polish` is a lead, unfinished |
| H26 | Coach "can't see what you logged yesterday", sends you to "calorie rings for yesterday" | The coach is deliberately given no food log for any day (`chat-gemini` prompt: "you are not told what they ate, on any day"). The prompt sends it to the Nutrition tab, which cannot open past days (today + 6 forward only). The data exists (`getTodayLedger` reads any date). | **open**; needs `chat-gemini` deploy |
| H6 | "2 large eggs, 2 slices of wholemeal toast and 10g butter" = 263 kcal | Old build counted the eggs as 2 g. Branch: "2 large eggs" = 116 g (tested), "10g butter" = 10 g, "2 slices wholemeal **bread**" = 76 g (tested). Gap: if the model sends "wholemeal **toast**", there is no toast alias (held back on purpose in the lookup plan) and the toast drops out, which should then refuse the card under the 80% rule. Best case ≈ 440 kcal, 25 g protein. | **partly**; needs `chat-gemini` deploy and one real message |

## MEDIUM

| # | Cause | Status |
|---|---|---|
| M33 "0 LEFT" when 112 over | `NutritionDisplay.tsx:412` clamps at zero (**checked**) | **open**, small |
| M34 lunch swap changed the snack | A swap pins lunch, then the whole day is searched again and nothing prefers the dishes already showing, so the snack can become a different dish. No preview on a swap (the H9 trial is wired to add-food, custom meal and day-swap only). **The hand-over's "a meal swap leaves the other meals alone" is wrong; corrected there.** | **open** |
| M35 ban after a finished session rewrote that day | The ban walks every day with no "already trained" guard (`mesocycle-edit.ts:717`), both screen and coach. Home names a finished day from the live plan row, not the log. The guard that protects rebuilds exists and is not used here. | **open** |
| M36 "you hit your lifting sessions" at 9/24 and 5/18 | Past days reach the coach only as "CLOSED — work was logged". No sets done vs planned. Meals reach it as the plan only, nothing eaten. Today's session is told honestly (branch P2). | **partly** |
| M37 coach says there's no data export | The coach prompt lists "data export" under "does NOT exist" (both copies); Profile > App has "Download my data". Two gates enforce the wrong claim. | **open**; `chat-gemini` + `onboarding-chat` deploys |
| M38 swap makes a timed hold "MAIN LIFT" | The label is recomputed: no main lift left after a swap → the best-ranked remaining exercise is promoted, and holds are not excluded (`session-derive.ts:461`). | **open** |
| M39 "2 of 3" became "done — 2 for 2"; 5 of 18 counts as Done | Two counters: the screen counts Mon-Sun, all planned; the tip counts "so far" in the plan's own week (from the day you started), skipping an unplanned day. Finish after any logged set = Done (the branch now asks first, but still Done). Related to my earlier #20 fix on the other branch, not the same cause. | **partly** |
| M40 swap/ban don't survive the block; bands back after "no bands" | (a) **Real bug, checked**: every rebuild passes your bans to the first block but not to block rotation (`plan-adaptations.ts:591`), so a banned exercise can return from block 2. (b) "Rest of block" swaps end at the block by design, and the sheet says so; she read it as permanent. (c) "No bands" banned two names; the kit list that would remove all band work isn't built. | **open** |
| M41 swap list offers what a knee adaptation removed | Branch feeds active adaptations into the swap pool. The search box still shows everything, with a warning, by her 13 Sep ruling. | **fixed** on the branch, not driven in a browser |
| M42 timed holds | No hold timer; the receipt hard-codes "reps" (`SetGrid.tsx:1038`); the record engine compares seconds as reps; "Add a drop" offered on anything. First-log record already fixed on the branch. | **partly** |
| M43 deload at the 24 kg limit; week 5 Floor Press at 16 after 18×11 | (a) The branch fixes the deload maths for newly written plans; a deload already stored at 24 is never lowered. (b) A logged weight re-prices the rest of ITS block only; nothing carries it into the next block. | **partly** / **open** |

## LOW

| Item | Cause | Status |
|---|---|---|
| "Fat is behind" at 9pm, three meals unlogged | Picks the macro furthest behind by share; fat's small target makes it win; ignores unlogged meals | open |
| "banana added to your lunch." | Food name used raw at the start of the sentence | open |
| "flakingly combine" | Model-written method; only amounts are checked | open; `generate-meals` deploy |
| Round timer red, "A round is running" after it ends | Red is the design's "done" colour; subtitle counts a finished round as running | open |
| Finished session doesn't look finished | No finished state on today's card | open |
| "tier2 compound", "catalog" on swap sheet | Raw internal words printed | open |
| "full home gym setup" to a Minimalist | Coach is sent the raw word `minimalist`, never what it means | open |
| "nothing is capped" under a 24 kg dumbbell | Line shows whenever you once tapped "not sure", ignoring numbers on file | partly |

## Decisions

Hers (product behaviour, one at a time):
1. Once a meal is eaten, does it stay put and the rest of the day re-fit around what you actually ate? (H24; also the open M18 question)
2. When you swap one meal, should the others re-size before they change dish, and be shown first? (M34; H9 option B)
3. A session finished well short: still "Done", or its own "part done"? (M39)
4. "Swap for the rest of the block": keep it to the block (and say so more plainly), or make swaps last into later blocks? (M40b)

Mine under the CSCS delegation, to record at build time:
- M43b: carry the heaviest logged working set into the next block's start, never downward, under the same ceilings.
- M38: a hold, carry or interval is never labelled the main lift; no main lift is better than a wrong one.
- H25: a blank box means "same as the set I just did", else today's plan; last session's number only when the plan has none.

## Deploys this list will need
`chat-gemini` (H26, H6, M36, M37, coach equipment), `onboarding-chat` (M37), `generate-meals` (method wording). Everything else is frontend. No database change.
