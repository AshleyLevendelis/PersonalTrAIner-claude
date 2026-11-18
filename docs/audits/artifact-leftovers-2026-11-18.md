# What the artifact pages listed that is still open (18 Nov 2026)

His question: "Have all the issues identified and listed in the artifacts been fixed?" Twelve app pages in his
gallery were read and every listed item checked against the code and records (five read-only agents plus one page
read here). The October test log's check was still running when this was written. His instruction after the interim
answer: **"Build the leftovers"** (18 Nov 2026).

Each line: where it came from, and its state. `MINE` = a training or mechanical call, built without asking.
`HIS` = needs his answer first. `MACHINE` = built, waits on his machine.

## A. Safety path (plan first; each has one)
1. Allergy record: peanuts split from tree nuts, adrenaline pen, traces, coeliac and oats (his rulings 15 Nov,
   `docs/plans/allergy-card.md`). NOT BUILT. Needs a migration.
2. Meal moved to another slot skips the per-meal protein floor and says nothing (Edit page §14). MINE.

## B. Weights and progression (load path: `docs/plans/too-easy-weights.md` D and E)
3. Clearly more reps than the range at the same weight does not count as "go heavier" (D).
4. Sets logged by the coach or "did it, not in the app" do not anchor as Finish does (D).
5. Block review and load suggestion appear to write the full weight into a deload week; the suggestion's sentence
   says "top of your range" while its trigger never reads the top (E, to verify first).
6. The Full Program page keeps old numbers after a find-your-weight session (named, by design so far).
7. One lift untouched for weeks while training continues is not eased back (Edit page #1b).
8. A swapped main lift is not priced from his own logs on a related lift (Edit page #5; 2 Nov rule chosen instead).
9. Low-recovery plans' volume not cut enough (Aug audit 6.5; "his call, unruled" since 30 Aug). HIS or MINE under
   the 18 Sep delegation: mine now.
10. Training level judged from the setup answer, never from logs (Decision Stack). MINE, plan first.

## C. Edit costs that are written but never fire, or never shown
11. Four "against the goal" cases coded and never reached: ongoing volume cut, third same-day shortening, main lift
    moved last, a ban (Talk page; Edit page §5, #9).
12. The Exercise screen's own sheets do not carry the goal-cost sentence; only the coach's cards do.
13. A moved session landing beside a same-muscle heavy day gets no line (Edit page #3).
14. No count of added work across a block (Sign-Off; Edit page #6).
15. A banned main lift's replacement is picked for him (Edit page #10).
16. Block-end review of piled-up edits; per-goal phrasebook as one file; sets per muscle on cards (CLAUDE.md "STILL
    TO BUILD").

## D. Nutrition
17. Training-day macros ignore moved sessions and rest days (Edit page #7).
18. No plateau logic on the nutrition side (Edit page #8).
19. A target moving down is not framed as the plan working (Edit page §19). HIS (wording).
20. Cuisines and cooking-time edits on Profile change no existing meal and say nothing (Aug audit 2.1).
21. Meal cost said against the week's deficit, not only the day (Talk page).
22. "Regenerate all" and the planned line never moved behind the settings row (Less Is More). HIS (layout).

## E. Screens and small things
23. Text under 12px in 409 places, smallest 8px (Field Report, Aug audit). 
24. "Why this exercise" on about one exercise in six.
25. Rest timer cannot alert with the screen off (Aug audit 6.4).
26. A logged set cannot be edited on screen; no undo after forgetting a remembered note or goal.
27. Page waits on the Google Fonts stylesheet.
28. Exercise page longer than one screen before Start (Less Is More). HIS (layout).
29. Target weight as one big number above both set groups (ramp design). HIS (design not chosen since).
30. A coach reply split in two is one bubble; "Jump to latest" stops short while a reply arrives.
31. Mixed kit across days (gym some days, dumbbells at home) (Onboarding page).
32. Steps typed by hand; body-fat field unused. Not planned.

## F. Strategy (13 Nov), not built: later slices, each his to ask for
If-then plans; reflect-then-offer; tone setting; UK chain restaurant numbers; novelty cap; maintenance weeks in long
cuts; ACSM check on volume; cycling, swimming, HYROX programmes; priority answer (sport or gym first); moving up the
running ladder from the log; four-week pathway review; 7,000-step target; Active living and Hybrid event pathways;
starting point separate from goal. Part built: 25 lines (see the agent's list in the session record).

## G. Waiting on his machine
The `chat-gemini` deploy and full exam (`docs/handover/machine-todo-2026-11-18.md`); ten migrations from 9-17 Nov
unconfirmed on production; `coach-reach-out`, `onboarding-chat`, `generate-meals` deploys unconfirmed; the meal
quality check against a database; an offline workout on a real phone; anything iPhone-specific; whether production
and test have separate AI keys.

## H. The October test log (165 findings: 129 fixed, 5 decided, 10 not fixed, 10 his open questions, 11 unknown)
Not fixed: M24 (coach says "I'll adjust your plan" with no offer attached: no code check); M56 (week note promises
more weight when he is at his kit limit); L10 (Enter does not log a set); L11 (an added drop row cannot be removed);
L13 (focusing a set box scrolls the page); L24 ("Favorite cuisines"); L32 (Tab goes to the plate button before reps);
L39 (Profile small print); L41 ("Smart Exercise Swap", "low joint stress", "full catalog"); L54 (bodyweight warm-up
rows show "0" and offer "Add a drop"). L10/L11/L13/L32 were built on `origin/wip/x3-exercise-polish` and never merged.
His open questions, never answered: H16 (a named dinner that misses the macros), H17 ("away next week" starts
today), M5 (an exact minute cap), M17/M19 (recipe steps after an edit; unlisted seasonings), M26 (removing an
exercise takes five steps), M28 (sharp pain is a dead end), M55 (8pm still says breakfast), M63 ("2 things to buy"
beside a 43-item list), L23 (coach body talk; "this app is free"), a shoulder-flag follow-up question, "new
dumbbells?" after a log over the limit, two requests in one message.
Unknown, to re-measure: H39 (too little training for a bodybuilding goal), H40 (weights drop in later weeks under
"heavier"), M61 (triceps extension 22 kg for 16-19 reps; the 20-rep ceiling of 18 Nov covers the reps), L36, L37,
L46, L50, L51, L52, L55, L56.

## Build order
A1, A2, then B3-B7, C11-C13, D17, D20, E26, then the rest; F waits for his word slice by slice.
