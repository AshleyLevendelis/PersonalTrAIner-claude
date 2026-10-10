# Runs 3 and 4 (9-10 Oct 2026): traced, then built

Traced on `claude/test-log-fixes-oct9` (forks main at `0df0bc12`, the build the runs used), then
built on her "Build it" of 10 Oct 2026. The trace column is kept as it was written; the status
column is updated. Nothing here is on `main` or deployed.

Status key: **fixed** on the branch / **partly** / **open** / **hers** (waits on her ruling).

## HIGH

| # | What she saw | Cause | Status |
|---|---|---|---|
| H24 | Header "1692 planned · on target" while the rows sum 1,801; same after a coach-logged meal (1,498 vs 1,690) | The header and its verdict add up the PLAN's dishes (`App.tsx:481-489` → `MealPlan.tsx` `TotalsHero`). A LOGGED meal's row shows what was eaten (`MealPlan.tsx:928`). Once any meal is logged at a different size, header and rows disagree. The coach's log writes the eaten meal and leaves the plan's dish in the header's sum. | **fixed**: one calculation (`day-as-shown.ts`) for header, verdict and rows. Her ruling A with both conditions built (re-size the same dishes within 25%, one line with Undo; beyond that, say how far over or under). Her exact banana case (nothing logged, 1,692 vs 1,801) did NOT reproduce on the test data, old build or new; cause on her day unproven, and the two numbers can no longer disagree whatever it was |
| H24b | "The rest of the day re-fits around it" | Leftover unchecked claim after an ingredient edit (`MealPlan.tsx:1027`). | **fixed**: the claim is gone |
| H25 | A blank tick logged last session's 30 kg against a plan of 24, twice | A blank box saved typed → LAST SESSION → plan. | **fixed**: today's previous set, then today's plan, then last session only when the plan has no number. One function for the grey number, the save and the plate calculator. A "type it" box refuses a blank tick (her check 2) |
| H26 | Coach "can't see what you logged yesterday", sends you to "calorie rings for yesterday" | The coach was given no food log; the prompt sent it to a past day Nutrition cannot open. | **fixed**, needs `chat-gemini` deploy: today and the seven days before, as logged |
| H6 | "2 large eggs, 2 slices of wholemeal toast and 10g butter" = 263 kcal | No toast alias. | **fixed** (her ruling: toast is bread; french toast keeps its egg and milk). ~439 kcal, 25 g protein. Needs `chat-gemini` deploy for the coach's copy |

## MEDIUM

| # | Cause | Status |
|---|---|---|
| M33 "0 LEFT" when 112 over | Clamp at zero | **fixed**: "112 over" |
| M34 lunch swap changed the snack | The day is re-searched after a swap pin | **partly**: a swap now says, under the row, which other meals changed. Whether a swap should re-size before it re-picks is **hers**. The visible line is proven by logic only (no harness fixture moved another meal in 18 swaps) |
| M35 ban after a finished session rewrote that day | No trained-day guard on ban | **fixed**, screen and coach |
| M36 "you hit your lifting sessions" at 9/24 and 5/18 | Past days reached the coach as "CLOSED" only | **fixed** ("CLOSED at 9 of 24 planned working sets"), needs `chat-gemini` deploy |
| M37 coach says there's no data export | Listed as not existing, gates enforced it | **fixed**, needs `chat-gemini` + `onboarding-chat` deploys |
| M38 swap makes a timed hold "MAIN LIFT" | Holds not excluded from promotion | **fixed** (CSCS, mine): a hold, carry or interval is never the main lift, label and rest floor alike |
| M39 "2 of 3" became "done — 2 for 2"; 5 of 18 counts as Done | Two week counters; Finish = Done | **partly**: the tip now says "due so far". One counter lands with the week work on the other branch. Whether a short session is "Done" is **hers** |
| M40 swap/ban don't survive the block; bands back after "no bands" | (a) bans not passed to block rotation; (b) "rest of block" by design; (c) no kit list | (a) **fixed**; (b) **hers**; (c) **open**, hand-over job 3 (kit list) |
| M41 swap list offers what a knee adaptation removed | | **fixed** earlier on the branch; not driven in a browser |
| M42 timed holds | No hold timer, receipt said reps, records compared seconds as reps, "Add a drop" on anything | **fixed**: start/stop timer, said in seconds, no lifting record in the wrong unit, no drop on a hold |
| M43 deload at the 24 kg limit; week 5 at 16 after 18×11 | (a) stored deload never lowered; (b) nothing carries a logged weight into the next block | (a) **fixed**; (b) **partly**: the block-start offer now carries last block's best set into the new reps, under the kit limit (her conditions). It stays an OFFER, which collides with "carry it": put to her |

## LOW

| Item | Status |
|---|---|
| "Fat is behind" at 9pm, three meals unlogged | **fixed**: three or more meals past their time and unlogged says "3 of today's meals still to log, so these numbers are only what's logged so far"; otherwise protein is named first when it is one of the gaps |
| "banana added to your lunch." | **fixed** |
| "flakingly combine" | **fixed in the prompt** (plain cooking English), needs `generate-meals` deploy; a model can still ignore it |
| "A round is running" after it ends | **fixed**: "Round finished — log it". The red is the design's done colour, left |
| Finished session doesn't look finished | **fixed**: "✓ Session finished · View summary" where Start sat |
| "tier2 compound", "catalog" | **fixed** on the swap and the add sheets |
| "full home gym setup" to a Minimalist | **fixed**, needs `chat-gemini` deploy |
| "nothing is capped" under a 24 kg dumbbell | **fixed**: shown only when nothing is capped, and a number typed later clears "not sure" |

## Decisions

Hers, settled 10 Oct 2026:
1. H24: **A** — the eaten meal stays as eaten and the rest re-size around it, with her two
   conditions (one line with Undo; same dishes, about 25% either way, else say the gap).
2. H6: toast counts as bread now.
3. M43b: carry it, under the stated kit limit, adjusted for the new rep range.

Still hers, one at a time:
1. M43b collision: carrying automatically after one session overrides her 1 Sep "offer, never
   apply" and her three-session evidence bar. Built as an offer; does she want it applied?
2. M34: should a swap re-size the other meals before it changes any dish?
3. M39: is a session finished well short "Done", or its own "part done"?
4. M40b: "swap for the rest of the block" — keep it to the block, or make it last?

Mine under the CSCS delegation (basis in BACKLOG):
- H25: a blank box means the set just done, else today's plan; last session only when the plan
  has no number.
- M38: a hold, carry or interval is never the main lift.
- M42: no lifting record in the wrong unit.
- LOW: a logging gap is not an eating gap; protein named first.

## Deploys this list needs
`chat-gemini` (H26, H6, M36, M37, coach kit words), `onboarding-chat` (M37), `generate-meals`
(method wording). Everything else is frontend. No database change. The coach exam is stale.
