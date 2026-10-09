# Hand-over: test-log fixes, 9 October 2026

Written for the Claude Code session on Ashley's machine. Read this whole file before touching
anything. It replaces a conversation you were not in.

## What this is

Ashley asked a cloud session to use the live app daily as a real user and log what breaks. Two
runs (Thu 8 and Fri 9 Oct 2026) as a new user, "Sam", found 88 issues: 23 High (H1-H23),
32 Medium (M1-M32), 33 Low (L1-L33). The full log is `test-log-runs-1-2.md` beside this file
(Run 1 is lines 63-434, Run 2 lines 631-787). She then said "resolve all those issues".

The cloud session traced every bug to its cause (eight read-only tracers, reports in
`tracer-reports/`), then built fixes in parallel lanes and merged them into the branch
`claude/test-log-fixes-oct9`. It could not push (the repo was not attached to that session), so
the work arrives as a git bundle. Ashley stopped the third round of builders part-way; their
finished commits are merged, their unfinished work is parked on three `wip/*` branches.

**Nothing here is on `main`, nothing is deployed, and there are no migrations.**

## What is in the bundle

| Branch | What it is |
|---|---|
| `claude/test-log-fixes-oct9` | The real work: 49 commits on top of `main` at `0df0bc12`, plus this folder. `tsc` clean. |
| `wip/x3-exercise-polish` | UNFINISHED, UNVERIFIED. Tightness drills that skip what the warm-up already holds (M9), weight carry-down (M11) and other small Exercise-tab items, as left when the builder was stopped. |
| `wip/n3-logged-meal-record` | UNFINISHED, UNVERIFIED. A logged meal shown as "record" and "plan" apart (M18). |
| `wip/k3-kit-list` | UNFINISHED, UNVERIFIED. Kit list, engine half: `docs/plans/kit-list.md`, `src/lib/kit-list.ts`, `src/lib/kit-change.ts`, `scripts/test-kit-list.ts`, edits across the engine and catalogue. Never measured on the grid. |

Treat each `wip/*` branch as a lead: read it, then finish it or redo it. Do not merge one as it is.

In this folder:

- `test-log-runs-1-2.md` — the tester's notes. Symptoms are facts; any cause written there is a guess.
- `tracer-reports/A..G` — root cause per bug with file:line quotes, prior rulings found in
  BACKLOG/CLAUDE/VISION, a proposed fix and its class. `Z-gates-baseline.md` — every gate's
  result on untouched `main`, and how the drivers run.
- `backlog-entries/*.md` — one file per builder (X1, X2, X3, N1, N2, O1, P2, E1, E2, A2): what
  was wrong, what changed, what was decided by whom, what was verified and what was not. **These
  are the BACKLOG.md entries. They were kept out of BACKLOG.md so parallel lanes would not
  collide. Folding them in is your first job.**

## State of the checks (measure it yourself before believing this)

Last full run of the fast `test:*` gates on the FINAL tree of `claude/test-log-fixes-oct9` (9 Oct, 21:25, in the
cloud sandbox): 257 run, 252 passed, 5 failed. The five:

1. `test:bundle` — over on all four budgets: deploy re-download 297 of 280 kB gzipped; first
   paint 453 of 437 gzipped; app chunk 1,032 of 985 kB raw; everything 2,201 of 2,116 raw.
   Ashley's 14 Sep ruling is in the gate: defer rather than raise. Needs its own slice: lazy-load
   what was added (finish-check sheet, ban sheet, adaptation line, weigh-in confirm, meal-edit
   trial card, etc.), then move a budget only with the reason written down.
2. `test:adaptations-respect-trained` — "a ban's replacement is picked from the pool profile".
   A source pin broken by the hand-merge in `App.tsx` `handleBanExercise` (it now calls
   `banOnScreen({ profile: poolProfile ?? profile, … })`). Check the behaviour is right, then
   re-anchor the pin on the property.
3. `test:coach-voice` — "setsFraction is called somewhere outside the phrasebook". The finish
   summary's fraction changed (planned + extra); the old phrase is probably dead. Remove or re-wire.
4. `test:home-week-strip` — `ToolsTab.tsx` no longer passes the refresh token to
   `useTrainingWeek` the way the pin expects. Check which is right.
5. `test:harness-clock` — the new driver `.tour-harness/moved-edit.mjs` uses a bare `Date.now()`
   and a literal date. Make it use the harness clock.

Known and expected: `test:coach-exam-fresh` is red (the coach and onboarding prompts changed; the
exam must be re-run with keys). Environmental in the cloud: `test:meal-quality`,
`test:schema-parity`, `verify:rls`. Flaky before any change: `verify:correction-loop`.

NOT run on the final tree: the full browser-driver sweep, `test:audit`, `test:quality`. Builder
E2 ran audit (17,423/17,423) and quality on its own lane after the Shoulders-day change:
like-for-like on a 768-plan sample the score went 11.522 → 11.481, all of it
`worse_implement_than_available` (57 → 202 plans). See "Costs" below.

Nothing has been seen on a phone. No edge-function handler has been executed (no Deno there):
`chat-gemini` and `onboarding-chat` edits are held by source gates and `test:functions-deployable` only.

## Ashley's rulings from this session (9 Oct 2026) — record them in BACKLOG and CLAUDE.md

1. **Kit.** Asked: "How should someone tell the app what kit they have?" (revisits her 9 Sep
   "fix the words" choice). She chose: **"Remember what they say"** — keep the four choices; also
   remember specifics people say in setup or to the coach ("I've got dumbbells and a bench", "I
   don't own bands"), and show them as ticks in Profile. No new setup question. Nobody's plan
   changes unless they say something.
2. **Surprising weigh-in.** She chose: **"Ask, and hold the target"** — when a weigh-in is more
   than about 3% from the last one, ask ("That's 19 kg lighter than this morning — is 62 right?")
   and save only on yes; even then, don't move the calorie target until a second day agrees.
   BUILT (commit "A weigh-in far from the last one is asked about…"): verify it.
3. **Allergy/diet path — "Build all four".** (1) "I don't eat pork" said in passing goes straight
   into Foods to avoid with a visible tick. (2) Setup stops promising "entirely nut-free" and uses
   the honest wording already on the meal screens. (3) Food matching gets stricter: a "chicken
   caesar wrap" is not an empty tortilla, bare "chicken" must not match a meat-free product (it
   passes the vegetarian check today). (4) Recipe steps are checked against allergies and avoids.
   NONE of the four is built. Plans exist for (3) (`docs/plans/ingredient-lookup-truth.md`); (4)
   needs its plan written first (tracer G, M19/M17).

Two August rulings that were never written into the repo were built by O1 and are quoted in
`backlog-entries/O1.md`: remove "combat" from the style picker (existing profiles keep it), and
park an on-topic question asked mid-setup with a reason, at most twice, then bring it back.

## Decided without asking her — reversible, and she must be told

Each was the tracer's recommended option, taken so work was not blocked. Compile the full list
from the "decided unprompted" lines in `backlog-entries/*.md` and put it to her in plain words,
one at a time. The main ones:

- Logged cardio is its own line on the finish card, history and Home (never folded into lifting).
- A first log says "First time logged — this is your baseline"; no PR badge.
- The streak counts planned sessions done ("2 sessions in a row"), using the day actually trained.
- Finish with sets left asks first (the sheet the layout design already drew).
- "Behind" on food/water is only said once the time for it has passed; nothing on day one.
- The shopping list's first-run button reads "Build my list"; aisles "Dairy & eggs" etc.
- "I don't like it — and not again" bans for good, with confirm and Undo.
- An expired coach suggestion is greyed with "This suggestion has expired — ask again".
- Removing an injury offers a rebuild from today (history kept). This changes how much the app asks.
- An active temporary change shows in Profile and on the Exercise tab with "End now".
- Edits made during a temporary change survive when it ends.
- Day length reads "~22 min · + 15 optional"; the gap note says what the day does instead.
- Wording throughout (new sentences live mostly in `coach-voice.ts`): hers to reword.

## Costs and loose ends the builders reported (do not lose these)

- **Shoulders-day fix (E2), two measured costs.** (a) The triceps family split now puts a BAND
  triceps movement second on chest days for people who own cables or dumbbells (full gym +
  shoulder flag 192/192; home gym 343/384; Minimalist 378/384). (b) A backpack or band raise is
  stacked beside the dumbbell raise on 479 of 1,728 Shoulders days. Both want the small dumbbell
  pack (kickback, lying extension, bent-over row, close-grip press, hip thrust, reverse lunge, a
  cable kickback) plus a rule that a worse implement is not chosen when a better one for the same
  job is available. Leg sets per week fell about 25% (median 36 → 27); leg days unchanged.
- **Typed meals (N1).** Fixes 1-4 of H6 are built; a wrap logged on its own is still a confident
  186 kcal card until the lookup plan is built. Piece weights are mostly from reference tables as
  recalled: check them. `oat flour` was deliberately NOT added: it would move 343 of 22,572 diet
  verdicts ("bacon with oat flour" would pass vegetarian and halal) — it belongs to the lookup plan.
- **Adaptations (A2).** A ban and a corrected-ceiling re-price still rewrite trained days. A
  rebuild accepted during an active adaptation leaves those days cautious. Profile line not seen
  in a browser. The coach's injury cards have no code-level red-flag guard (owner question below).
- **Streak (X2).** The phone notification and the coach prompt still say "days".
- **Coach context (P2).** Outcome stamps on cards survive a reload on the same phone only.
- **Favourite heart (N2).** Cause inferred (decimals into integer columns). One tap on TEST
  settles it. On the live app the heart saved a dish whose macros were whole numbers.
- **Onboarding (O1).** Whether the model obeys the new prompt rules is unproven.

## Status by bug

FIXED on the branch (verify, do not assume): H4 (engine; follow-up question not built), H5, H7,
H10, H11, H14, H15, H19, H20, H21, H23 (context), M1, M2, M3, M4, M5 (wording only), M7, M8, M10,
M12, M13, M14, M15, M16, M21, M22 (mechanical half), M25 (adaptation line), M27, M29, M30, M31,
M32, L2, L3 (edit prompts only), L5, L6, L7, L8, L9, L12 (not dumbbell rows), L14, L15, L16, L17,
L18, L19, L20, L22, L25, L26, L27, L28, L29, L30, L31, L32 (0 kg and "Assuming assumed"), L33.

PARTLY: H1/H2/H3 (mechanical parts only; kit list not built), H6 (see above), H8 (context only),
H9 (card now lists what changes; the search still prefers a new recipe over a re-portion), H17
(respects adaptations, states dates; start date unchanged), H18 (sentence, chips, held-at-limit;
no "new dumbbells?" question), H22 (context half only), M23, M24, M26 (small parts), L4.

NOT DONE: H12, H13, H16, M6, M9, M11, M17, M18, M19, M20, M25b ("won't eat/do" label and its
place in Profile), M28, L10, L11, L13, L23, L24, tab order (L32).

NO CHANGE BY RULING: L21 (coach accent / user plain is her 28 Sep choice; do not merge
`claude/chat-grouped-bubbles`), L1 (ticks only when a mapping happened: deliberate).

## Outstanding work, in order. Model and effort per job, as Ashley asks.

0. **Fold the backlog entries into BACKLOG.md (newest first) and record the three rulings above in
   CLAUDE.md.** Sonnet · low.
1. **Make the tree green**: the four small red gates above. Then the bundle slice. Sonnet · medium.
2. **Verify what is claimed fixed** on a settled tree: full `test:*` sweep, every `verify:*`
   driver, `test:audit`, `test:quality`. Read screenshots at phone size. Opus · medium, with
   `gate-runner` and `regression-reviewer`.
3. **Kit list** (her ruling 1). Design: `tracer-reports/A-equipment.md`, "The smallest design: an
   optional kit list" (stored as existing `user_facts` rows, no migration). Lead:
   `wip/k3-kit-list`. Engine half, then the doors: Profile ticks, swap sheet ("I don't own it" vs
   "not this week" — owner question), the "heaviest …?" prompt's "I don't have one", setup
   capture (fix the worked example in `onboarding-chat` that teaches "dumbbells at home →
   minimalist"), and a coach tool. With it: the dumbbell pack and E2's two costs. Full
   quality/audit run. Opus · high. Plan before build (it exists on the wip branch: review it).
4. **The four safety fixes** (her ruling 3). (3) from `docs/plans/ingredient-lookup-truth.md`,
   carrying M20 (dry/raw state), the rest of M23 and the bare "chicken" → seitan finding. (1) and
   (2) per tracer D (H12, H13): prompt line, a code backstop in the browser like the allergen one,
   text slots captured in code and split on "and", the honest receipt, the stale
   five-allergens line. (4): write the plan (tracer G, M19 + M17), then build. Opus · high.
   `engine-tracer` first where the tracer marks an inference.
5. **The coach function, one deploy** (tracer C build-order step 5): a gate so a tool call must be
   about the message just sent (only 10 of 42 tools check today), two requests in one message,
   past-tense cardio routes to logging not scheduling (H8), the unkept "I'll adjust your plan"
   (M24), "days" → "sessions", a body-talk rule (L23). Then the coach exam, on her machine. Opus · high.
6. **Meals**: H16 after her answer; H9's preference after her answer; M18 (lead:
   `wip/n3-logged-meal-record`); M17 with job 4. Sonnet · high.
7. **Exercise tab polish**: M9, M11, L10, L11, L13, tab order (lead: `wip/x3-exercise-polish`);
   L24 dates and spellings; M25b. Sonnet · medium (L24: Haiku · low).
8. **Needs a migration and her explicit word**: an exact session cap (M5); a follow-up question
   when someone ticks an injury at setup (H4).

## Questions still hers (plain language, 2-4 options, a recommendation, ONE AT A TIME)

Every one has options and a recommendation written in the tracer report named.

- Bought or restaurant food with no recipe: ask, estimate and label, or decline? (D, H6)
- May one meal edit change other meals: silently, re-portion only, or show and ask? (D, H9)
- A requested meal that misses the macros: refuse, or do it and show the cost? And should "chicken
  at most once a day" be something the app can hold? (D, H16)
- Cardio on a lifting day: what does the coach offer? (C, H8)
- "I'm away next week": when does the travel plan start? (C, H17)
- Two requests in one message: do both? (C, H22)
- Taking one exercise out: how many steps? (C, M26)
- Sharp pain: add "don't do this one today" to the message (the rule itself unchanged)? (C, M28)
- Which words said to the coach mean "see someone" and block an adaptation card? (plan
  `adaptations-respect-the-week-already-trained.md`, question 3)
- Swap sheet: "I don't own it" versus "not this week"? Logging above a stated limit: ask "new
  dumbbells?" afterwards? Plate calculator on dumbbell rows? (A)
- The tour's "log a set" writes a real set: keep, add Undo, or look-only? (E, M6)
- What the coach says to someone who boxes, now combat is hidden. (E, M3)
- Regenerate all: ask first, and leave logged meals alone? Can a logged meal's plan still be
  swapped? What happens to recipe steps after a food edit? Must seasonings be listed? (G)
- What may the coach say about price ("this app is completely free" is in its own prompt), and
  how does it talk about bodies? (G, L23)
- Should oats and oat flour pass the gluten-free filter? A chilled aisle for tofu? (N2)
- A chosen rest on a planned day: still a miss in the streak? (X2)

## New observations from a third short session on the live app (Fri 9 Oct, 21:05; old build)

Not yet in the test log. The tester was stopped after a few minutes.

- Home at 21:05 with three meals unlogged leads with "Fat is behind — 40g to go. Your lunch has
  25g of it, still to log." A coach would not lead with fat.
- Home's line for the session finished that morning now reads "3 exercises · ~37 min · overhead
  tricep extension from 22 kg": banning Band Tricep Kickback AFTER finishing rewrote the finished
  day (the ban path still rewrites trained days: see A2's loose ends).
- Lunch card says "Last night's dinner." on Italian Beef Bolognese; the tester's Thursday dinner
  had been changed to Chicken Cacciatore, so the label looks wrong (past days cannot be opened to
  confirm).
- "85g dry spaghetti" in a dish showing 37 g carbs, and "76g dry pasta penne" in one showing 38 g
  (M20 again). "1.3 tbsp light mayonnaise", "1.3 tsp olive oil" (L18). A method says "flakingly
  combine".
- The favourite heart DID save Beef Bolognese (59 P · 37 C · 25 F, whole numbers), which fits the
  inferred cause of M21.
- A meal swap from the list applied at once and left the other meals alone (good).

## Deploys this branch will need, once merged (each needs her word)

Frontend (Vercel on merge). `chat-gemini` (typed-meal handler and prompt line, `log_weight`
confirm, combat option lists, coach context). `onboarding-chat` (same-leg chips rule, parked
question, combat, honest session-length wording). The shared food database for the functions is
now GENERATED from `src/lib/food-db.ts` (`scripts/sync-shared-code.mjs`); the deploy script
refuses a stale copy. No migration.
