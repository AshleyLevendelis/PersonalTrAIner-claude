# Personal TrAIner: project handover (28 Nov 2026)

A complete handover for moving the work into a new project. Read this first, then `CLAUDE.md` (the standing rules,
authoritative), `VISION.md` (the product bar), `BACKLOG.md` (newest first: every finding and decision), and
`docs/plans/advise-then-allow.md` (the work in progress).

---

## 1. What the app is

An AI personal trainer and nutritionist that builds a real training plan and meal plan for one person (goal,
experience, kit, injuries, days, session length, style, recovery, other sports) and keeps adapting it. Three promises
(CLAUDE.md, "What the app must have"):

1. **Best-in-class plans that stay that way when changed**: training plan (blocks, phases, calibration week,
   deloads, load prescription with safety ceilings) and meal plan (targets from the profile, real foods, allergens
   filtered, a weekly menu from a deep library).
2. **Everything by hand or by asking**: every screen action has a coach (chat) path and every coach tool a screen
   path; the written exceptions are in `docs/coach-screen-parity.md`, checked by `test:coach-parity`.
3. **The coach is a professional**: advises from this person's data, never contradicts the app's numbers, proposes
   and the user confirms, never claims what it cannot do.

The owner is **Ashley** (he/him), non-technical, building the app he wants to use. He decides product behaviour; the
session decides training science as a CSCS coach (his delegation, 18 Sep 2026), always recording the basis.

## 2. Where everything is

| What | Where |
|---|---|
| Repository | `AshleyLevendelis/PersonalTrAIner-claude` (GitHub) |
| Working branch | `claude/compassionate-rubin-iy8f83` (each session is given its own; push there freely) |
| Live web app | **`personal-tr-a-iner-claude-yco8.vercel.app`** (NOT `personal-tr-a-iner-claude.vercel.app`, an empty project) |
| Frontend | React + Vite + TypeScript, `src/`; ships on merge to `main` via Vercel |
| Coach | Supabase edge function `supabase/functions/chat-gemini/index.ts` (runs on **Gemini**, not Claude); client half `src/components/ChatAssistant.tsx` |
| Other edge functions | `generate-meals`, `macro-calibration`, `onboarding-chat`, `coach-reach-out`, `report-email` (each deployed separately) |
| Databases | Supabase TEST `vswuurrtbzbrgubddefv` (CLI default) and PRODUCTION `sdkhuczcfnqqimdgfiks` (select-only from any session) |
| Phone app | Capacitor, `android/` (Health Connect steps, heart rate, sleep; watch bridge) |
| Watch app | Galaxy Watch (Wear OS), `android/wear/` (Java): cardio with heart rate and GPS route, lifting flow, planned cardio |
| Plan engine | `src/lib/exercise-plan.ts` (~8.7k lines), catalogue `src/lib/exercise-db.ts`, load `src/lib/load-prescription.ts` |
| Checks | `npm run test:*` (logic and source, seconds each) and `npm run verify:*` (real Chromium at 390x844 driving the screens, `.tour-harness/`) |

## 3. How the work is done (the rules that matter most; CLAUDE.md has them all)

- **Replies to Ashley**: short, plain words, no file or function names unless asked, and EVERY message ends with a
  two-or-three-sentence **Summary** (what happened, what's next, what's needed from him).
- **Asking**: work autonomously; ask him only what is his (how the app behaves, what it says or claims, anything
  medical, live users, money, data). One question at a time, 2-4 options, a recommendation, plain words. Training
  science (sets, reps, load, rest, order, exercise choice, periodisation, nutrition at population level) is decided
  here as a CSCS coach, with the five-question review in the report and the basis in BACKLOG.
- **Rulings are recorded** in BACKLOG (and CLAUDE.md when they apply again) with the options he chose from. A new
  ruling that breaks an old one is put to him, never resolved by picking the newer.
- **Finished means**: CSCS review done; affected checks pass and every NEW check is mutation-tested (break the code
  on purpose, confirm it fails, put it back); `npx tsc --noEmit` clean; anything visible driven in a real browser and
  the screenshot read; BACKLOG entry; committed and pushed; deploys needed named; anything undone named.
- **Git**: push to the working branch without asking. `main` merges: he gave a standing "merge without me" mandate
  in this run (via a PR, `gh api` only). **Deploys and migrations he runs himself** (they ask for a typed
  `yes-production`). Never touch production data.
- **Handing work to his machine**: a copy-pasteable prompt for his local Claude Code, IN THE CHAT reply, carrying the
  why, what it cannot do (typed confirmations), and what to verify.
- **No model identifiers** in the repo. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 4. State of the code right now

**On `main`** (last merge `f8211950`, PR #81): everything up to the watch route map with streets, the weight graph,
the watch build fixes, the deploy "stale" check fix.

**On the branch, NOT yet merged (6 commits, all pushed):**

1. `46014e0c` The chat can put a session on a rest day with the reasons (`propose_train_today`); the watch home
   screen drops "Open Exercise in the phone app once...".
2. `c29fa49f` Four checks the route work had left red (route map loader, data export, New Plan keeps routes and
   watch calories, why-sheet entries).
3. `8fccc02b` His ruling recorded: advise, then allow, four hard stops.
4. `7c18ceba` Advise-then-allow fix 1.
5. `789ee197` Fixes 2-5.
6. `ca028f27` Fix 6.

**Before merging these**: run a full sweep at the branch head (see section 8 for how), fix anything red, then PR and
merge. The last sweep (at `46014e0c`) was stopped part-way because it was too slow; its only real failures were the
four fixed in `c29fa49f`.

## 5. Live and device state

Done on live (per Ashley's terminal output this run): all six edge functions deployed, migrations up to and
including `20261127150000_session_calories`.

**Still needed on his machine:**

- `npm run db:push-both` for **`20261128120000_workout_routes`** (the watch route). Then `npm run test:schema-parity`.
- **`chat-gemini` deploy** once the branch is merged (the coach's new rest-day tool and the advise-then-allow
  wording). Until then the app itself catches the old coach's dead ends for the rest-day case.
- **Phone app and watch rebuild + install** (route GPS, watch screens, the watch's cleaned-up home). No device has
  been connected to his PC yet: the phone by USB and the watch by its IP:port over wireless debugging.
- **The coach exam** (`npm run coach-exam` on his machine, needs his keys): it has not run against the current coach;
  every coach-behaviour claim is unproven until it does (CLAUDE.md, rule 5).
- To check: the inactive-account emails need Resend on a verified domain, then the Vault secret
  `inactive_warning_ready` = yes (until then nobody is warned or deleted).

## 6. The work in progress: "advise, then allow"

**His ruling (28 Nov 2026)**: "users can add or remove or change workouts, days' workouts, single exercises,
whatever they want, and we just guide them and tell them the whys, why not ... if somebody wants to train on the day
they weren't supposed to, they should be able to add it and log it in the app." Then: "fix everything one by one and
keep the hard stops."

**The four hard stops (kept):** pain triaged sharp/one-sided/worsening (a professional, nothing changes); an
exercise his injuries list excludes; the load ceilings; the pregnancy exercise rules. Everything else that refuses
becomes advice, then allow.

The full list (from a read-only audit of every training path) is `docs/plans/advise-then-allow.md`. Progress:

| # | Fix | State |
|---|---|---|
| 0 | Coach puts a session on today's rest day, with advice | DONE |
| 1 | A day marked rest/missed/swapped/moved can still be edited (note on the card) | DONE |
| 2 | "Train anyway" on every no-session day; done sessions offered as a repeat; reason first | DONE |
| 3 | Removing below three exercises warned, not refused (last one → rest day) | DONE |
| 4 | Coach adds any catalogue exercise, warned for kit/style/level; hard stops refuse | DONE |
| 5 | A paused plan can take a session today from the chat | DONE |
| 6 | Shortening reaches for the time asked (warm-up + whole main lift), says what waits | DONE |
| 7 | Volume change / "make it lighter" in a deload or at a floor: say which limit, then allow | next |
| 8 | A different kind of session on any day this week; a started session takes an added block | |
| 9 | An exercise added to a rest day makes it a training day | |
| 10 | Past/future days get the full exercise menu; a blocked swap says why | |
| 11 | "Add exercise" on any day | |
| 12 | Change an exercise's sets, reps or weight (today or block), screen and coach; weight under the ceilings | missing on both |
| 13 | Coach can start, plan or log an own workout | |
| 14 | A weights session on a future rest day as part of the plan | |
| 15 | Move a session into next week | |
| 16 | A cardio session on one day only (today both write the whole block) | |
| 17 | Swap for anything (the coach's "same pattern" becomes advice) | |
| 18 | The same exercise twice on a day: advise "add sets", then allow | |
| 19 | Edits beyond this week | |
| 20 | Widen the coach's logging windows (any past day) | |
| 21 | Coach prompt: every training "don't" becomes "offer with the reason" | |

**Decisions waiting for Ashley** (each reverses an earlier ruling of his; ask one at a time):

1. **Two sessions on one day** (8 Sep: "a day never holds two sessions"). Needed for moving a session onto a day
   that has one, training on a day that already has a session, and cardio in addition. Recommendation: allow, with
   the recovery cost on the card.
2. **The screen's add and swap searches let him pick a move his injuries list rules out**, with a warning (13 Sep
   "show everything, warn me"). That does not match the injury hard stop he kept. Recommendation: make it a stop on
   the screen too (the coach already refuses).
3. **Near-copies** (3 Nov "Searchable, log-only"): allow adding/swapping a version of an exercise, priced from its
   parent, with advice?
4. **Shortening when even the main lift alone is over the time**: cut main-lift sets (reverses his 13 Sep "protect
   the main lift") or keep it whole and say the real minutes (current)?

## 7. Recently shipped (this run, all on main unless marked)

- Watch: route of a walk/jog/run from GPS, drawn on OpenStreetMap streets under the logged walk, "Delete route"
  (his rulings "Save the route", "Streets, OpenStreetMap"); End waits for last readings; folded waiting messages;
  ongoing activity on the watch face; battery and calorie fixes; JSONException build fix.
- Deploy script: Windows line endings no longer read as "stale".
- Weight graph (already existed: weekly averages, 3M/6M/1Y).
- Branch only: rest-day session from the chat; watch home cleanup; advise-then-allow fixes 1-6.

## 8. Practical notes for the next session

- **Derive the checks to run from the files changed** (`grep -rln <file> scripts/*.ts`), plus the browser drivers
  for the screen (grep `.tour-harness/*.mjs` for the element), plus `test:bundle` and `test:no-dead-code` for any
  `src/` change, plus `test:functions-parse` for any edge function change.
- **Full sweep**: ~716 checks. `test:quality` alone is ~22 minutes; the 248 browser drivers run one at a time took
  over two hours and timed out. Run it in a separate git worktree at the committed head (never against a tree being
  edited), write to a fresh log, and consider running drivers 2-3 at a time (each has its own debug port; check for
  duplicates). Do not run a driver in the main tree while the sweep runs the same driver.
- **Browser drivers flake under load**: verify:rest-day failed in unrelated places three times while other runs
  shared the machine, and passed all 72 alone. Re-run alone before believing a driver failure.
- **Always fail here (environmental)**: `test:meal-quality`, `test:schema-parity`, `verify:rls` (no database
  reachable from a cloud session), and `test:coach-exam-fresh` (the exam has not been re-run).
- **Bundle budgets** (`scripts/test-bundle.ts`): app chunk 1735 kB (measured 1726), total 3610 kB. Raise only with
  the measured value written beside it.
- **Mutation harnesses**: count checks that RAN (passes + fails), refuse a failing baseline, restore on interrupt,
  rebuild the browser bundle after restoring.
- The offline watch compile here: `javac -XDshould-stop.ifError=FLOW` against an android.jar; only missing-library
  errors are expected. His PC's build is the proof.

## 9. Next steps, in order

1. Full sweep at the branch head; fix anything red; PR and merge.
2. Hand Ashley the machine prompt: route migration, `chat-gemini` deploy, phone and watch rebuild, coach exam.
3. Ask decision 1 (two sessions on one day), then 2, 3, 4, one at a time.
4. Continue the advise-then-allow list from fix 7, one fix per commit, each with mutation-tested checks and a browser
   driver where it shows on screen, ticking `docs/plans/advise-then-allow.md` and adding a BACKLOG line.
