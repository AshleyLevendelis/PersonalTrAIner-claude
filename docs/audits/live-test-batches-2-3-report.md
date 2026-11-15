# Live test 14 Nov 2026, batches 2 and 3: what was wrong, what changed, how it was checked

Built on his "build it", 14-15 Nov 2026. Committed on the session branch, NOT pushed (his "commit, never push").
"Checked at 375/390px" means a real phone-sized browser drove the screen; "by test" means a logic check.

## Batch 2

| # | What he saw | Cause | Fix | Checked |
|---|---|---|---|---|
| 12a | Goal "Leave it as it is" kept the new goal | The goal is saved (and moves calories) before the rebuild question; Leave only closed the question | **His ruling "Undo the goal change"**: Leave puts the old goal back and the targets follow | by test (`test:qa-batch3` §1, `test:rebuild-offer`) |
| 12b | Pregnancy changed nothing in the plan | No exercise rule existed | **His ruling "Exercise rules only"**: no jumping or lying-flat moves while pregnant (see batch 3 #3) | by test, measured on 401 plans |
| 13 | 212 / 312 reps saved; set count mismatch; 8 kg suggested over a 6 kg ceiling | The reps box kept old digits when typing; no check on absurd counts; Home counted a borrowed day differently | Box selects its contents and fits 3 digits; **his "Ask once, then save"** for impossible counts (never raises a weight or makes a best); one set count everywhere | by test (`test:odd-reps`, §3-4) |
| 14 | "Do it today instead" lost the session; "Train anyway" changed the warm-up | Not reproduced from the trace | NOT FIXED: needs a repro on his phone | — |
| 15 | After a red flag the session banner stayed and a cheerful nudge followed | Nothing linked a referral to the session or the reminders | **His rulings "Park it, go quiet" + "Add a pause"**: the open workout ends where it stands, 48 h of quiet (chat and phone), the pause offered, one "how are you?" later | by test §13 + at 390px (`verify:chat-dislike-redflag`) |
| 16 | Meals rewritten silently | A regenerate dropped one-day meals (meal out, freestyle, cooked for him, moved) | They survive a regenerate | by test §2 |
| 17 | Near-duplicate grocery lines; liquids in grams; "1 meal is cooked for you" | Liquids had no volume unit; the line ignored meals out | Liquids in ml; the line says "eaten out or cooked for you" | by test §6, at 390px (`verify:meals-elsewhere`) |
| 18 | At 375px a floating bar covered Home's last row | The page padding was fixed; the dock's height varies | The page pads by the dock's measured height | by test §5, at 390px (`test:composer-focus` harness) |

## Batch 3

| # | What he saw | Cause | Fix | Checked |
|---|---|---|---|---|
| 1 | A phantom moved session after changing days | A rebuild rewrote the row a pending move serves | **His "Keep it, still owed"**: a rebuild leaves it, the card says so; an ease-off still reaches it | by test §11 |
| 2 | Plan start / week 1 on past days; rebuild preview out of order | Preview listed weekdays, not dates | Preview in date order; days before the plan are "before the plan" | by test §8 |
| 3 | Pregnancy not reaching the plan | (as 12b) | No jumping, nothing lying flat on back or front, each replaced by the same kind of move; the coach told | by test (`test:pregnancy-rules`, 15 checks) |
| 4 | Pain didn't change the plan | By design: sharp, one-sided or worsening names a professional and changes nothing (his 15 Sep rule) | Now also parks the session and goes quiet (his "Park it, go quiet") | as batch 2 #15 |
| 5 | Sex question wording | Fixed in the earlier 8-bug batch | — | earlier |
| 6 | Videos | His decision pending (curated list option) | NOT BUILT | — |
| 7 | Eating-out card on mobile | Fixed earlier (no calories with numbers off, "night" only for dinner) | — | earlier |
| 8 | Natural-language food logging | The coach logged several meals in one call; packs unknown | One meal per log; **his "Add standard UK packs"** | by test §9-10 |
| 9 | Calorie target moved on one weigh-in | One reading could move it | **His "Need a week of readings"**: 3 readings in the last 7 days; pregnant: never on weight. CHANGES WHAT A TARGET MOVE MEASURES | by test (`test:weigh-in-targets`) |
| 10 | Meal swap rippled into the next day; "I don't like X" banned silently | The next day was re-planned around the new leftover lunch; any dislike was a ban | **His "Ask, and hold Tuesday"**: the app asks "just this meal, or for good?"; the next day keeps its dishes | by test §12 + at 390px |
| 11 | Chat timestamps | Likely the device's timezone | NOT FIXED: needs his phone's setting | — |

## Product decisions he made (all built)
Undo the goal change · Exercise rules only · Keep it, still owed · Add a pause · Park it, go quiet · Ask once, then save ·
Need a week of readings · Ask, and hold Tuesday · Add standard UK packs.

## Decisions I made under the CSCS delegation
- Pregnancy with no due date stored: treated as past week 16 from the start (no lying flat), the safe side.
- Face-down moves left out too; hip thrusts (shoulders on a bench), incline presses, seated machines kept.
- A replacement is the same kind of move only; a wider swap was measured to bring in kettlebell swings, and removed.

## Still open
Due date for pregnancy (needs a database step); the coach exam re-run (his machine); videos; timestamps; the "Do it
today instead" / "Train anyway" repro; plan-start Mon 9 (needs his rows).

## What it needs before anyone sees it
His word to push and merge; deploys: frontend, `chat-gemini`, `coach-reach-out`, `onboarding-chat`; database steps:
`health_conditions` (earlier) and `plan_paused_since` (new).
