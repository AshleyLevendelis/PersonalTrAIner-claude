# Z — Gates baseline on the untouched tree

Measured 9 Oct 2026 in the cloud sandbox, on `/home/claude/app`, branch `claude/test-log-fixes-oct9`
at `0df0bc12` (0 commits ahead of `origin/main`, working tree clean when the run started).
Node 22.22.0, 2 cores, 7 GB RAM. No Supabase credentials, no Gemini key, no `.env.local`.
Raw output for every run is in `/home/claude/reports/gates-baseline/` (one `<name>.log` per gate;
browser drivers under `verify/`).

## 1. Headline

| What | Result | Time |
|---|---|---|
| `npx tsc --noEmit` (covers `src/` only) | clean, exit 0 | 19.3 s |
| `npm run build` (`tsc -b && vite build`) | passes, exit 0 | 28.1 s |
| `test:*` fast gates, 235 run one at a time | **231 PASS, 1 real FAIL, 2 ENVIRONMENTAL, 1 over the 120 s limit (passes in 149 s)** | 871 s (14.5 min) |
| `verify:*` browser drivers, 71 run one at a time | **69 PASS, 1 real FAIL, 1 flaky (failed once in 8 runs)** | about 22 min driver time + 3 harness builds |

Checks counted across the `test:*` logs: about 10,500 pass marks and 2 fail marks (both in `test:coach-exam-fresh`).

### Red on the untouched tree (so not caused by any later change)

1. **`test:coach-exam-fresh` — real FAIL, cannot be fixed here.** The coach prompt changed after the last exam run.
   Last 3 lines:
   ```
     FAIL: changed: prompt-and-tools (supabase/functions/chat-gemini/index.ts)
     current coach: e4ed4bbf506a705c (model gemini-3.5-flash)
   coach exam freshness: 2 check(s) failed
   ```
   (The line above those: `FAIL: the coach has changed since the exam last ran — scores are for 84f6086cd0500f29, the coach on disk is e4ed4bbf506a705c`.)
   Clearing it needs the coach exam re-run against the real model, which needs keys this machine does not have.
   Any edit to `chat-gemini/index.ts` keeps it red.
2. **`verify:tap-targets` — real FAIL, reproduced twice** (driver-only and through `npm run`). One control on the Exercise tab is under 44px:
   ```
     FAIL: all 84 controls reach 44px in both axes — [{"label":"See the whole program ›","h":17,"w":136,"tag":"button", ... "tab":"exercise"}]
     ok: every control's own centre still resolves to itself
   1 check(s) failed
   ```
3. **`verify:correction-loop` — FLAKY.** Failed once in the sweep (`✗ 1e. ...as a whole sentence, naming the lift — null`, 14 of 15 passed),
   then passed 7 times in a row (once via `npm run`, six driver-only). Treat one red run as a lead and re-run it.
4. **`test:frozen-weeks` — exceeded the 120 s limit** (killed, exit 124). Given 540 s it **passes in 149 s** with 69 checks, 0 failures.
   It is not a fast gate on this machine; give it 5 minutes.

### Environmental (could not reach their subject; prove nothing either way)

| Gate | Exit | Exact wording |
|---|---|---|
| `test:meal-quality` | 1 in 0.7 s | `VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY must be set (this harness hits the real deployed generate-meals function and database).` |
| `test:schema-parity` | 1 in 8.3 s | `Failed to link to TEST (vswuurrtbzbrgubddefv). Nothing was run against it.` |

Network probes from this sandbox: `registry.npmjs.org` 200; `*.supabase.co` and `generativelanguage.googleapis.com` refused by the proxy
(`CONNECT tunnel failed, response 403`); `jsr.io` does not resolve (`Could not resolve host: jsr.io`).

Not run, on instruction or because they need a live database, a model, or a download: `test:quality` (~22 min), `test:audit` (~2 min),
`test:differentiation`, `test:llm-review`, `benchmark`, every `smoke:*`, `db:*`, `deploy:*`, `verify:rls`, `coach-exam:run`, `coach-exam:grade`,
and `verify:reach-out-function` (see section 5).

## 2. Commands that work here, exactly

```bash
cd /home/claude/app

# Typecheck (src/ only: tsconfig.json is include: ["src"]). 19 s.
npx tsc --noEmit

# Production build. 28 s. Writes dist/ and tsconfig.tsbuildinfo (both git-ignored).
npm run build

# One logic gate. Most take 0.5-3 s.
npm run test:<name>

# One browser driver, the repo's own way (rebuilds the harness, ~10 s, then drives Chromium).
npm run verify:<name>

# Several drivers on a SETTLED tree: build each harness once, then run drivers directly.
npx vite build --config .tour-harness/vite.config.ts      # 10.5 s -> .tour-harness/dist (git-ignored)
node .tour-harness/<driver>.mjs
npx vite build --config .onb-harness/vite.config.ts       # 5.0 s
node .onb-harness/<driver>.mjs
npx vite build --config .tw-harness/vite.config.ts        # 3.1 s
node .tw-harness/measure.mjs
```

The driver-only form measures the LAST BUILD, not the working tree: rebuild after every source edit, or use `npm run verify:<name>`.

## 3. How the browser drivers run, and what they need

- **No dev server, no Supabase, no env vars, no Playwright API.** `npm run verify:x` is `vite build --config <harness>/vite.config.ts && node <harness>/x.mjs`.
  The build bundles harness pages (`real.html` = the real Dashboard/Nutrition/Exercise/Tools tabs, `chat.html` = the real ChatAssistant,
  `profile.html`, `grocery.html`, `tour-harness.html` = stubs) with the repo as the vite root.
- Each driver starts its own tiny static HTTP server on a random port over `<harness>/dist`, spawns `/opt/pw-browsers/chromium --headless=new --remote-debugging-port=<fixed> --no-sandbox`,
  and talks raw CDP over Node 22's built-in `WebSocket` at 390x844. The Chromium path is hard-coded and is correct here (it is a symlink to `chromium-1194/chrome-linux/chrome`).
- **Supabase is mocked in the harness.** `.tour-harness/fake-supabase.ts` is an in-memory client injected through the app's own seam
  (`setSupabaseClient` in `src/lib/supabase.ts`); its `functions.invoke` returns `{data:null,error:null}`, and the chat drivers script the coach's replies themselves. `?slow=<ms>` delays reads.
- **"Today" is fixed** by `.tour-harness/anchor.mjs` (via the app's dev clock), so results do not depend on the calendar.
- Screenshots go to `<harness>/*.png` (git-ignored, except the four tracked ones in section 6). Read them: a check passing is not the same as the screen looking right.
- **Do not run two drivers at once.** Debug ports are fixed and 16 of them are shared between drivers (9341, 9347, 9357, 9371, 9381, 9388, 9391, 9397, 9412, 9413, 9414, 9423, 9431, 9433, 9447, 9451).
- Two `test:` gates also drive Chromium, through `playwright-core` with an explicit executable path: `test:onboarding-reachable` (37 s) and `test:timer-field-fills-screen`. Both pass here.

### The one thing that is required: a path fix for 11 drivers

Eleven drivers hard-code another machine's checkout, `/home/user/PersonalTrAIner-claude/.tour-harness/` (for `dist/` and for screenshots):
`one-number`, `planned-activity`, `prep-weight`, `bodyweight-progress`, `mobility-filler`, `finisher` (finisher-detail.mjs), `rest-day`, `warmup-rows`, `ramp-readonly`, `cardio-session`, `drop-sets`.

Tried as-is, `npm run verify:one-number` fails in a way that reads like a real defect (every request 404s, so the page is blank):

```
    ✗ 0a. the fixture has a loaded lift on today with a session logged behind it

No loaded lift on today in the fixture — nothing to check.
```

Fix used, outside the repo, no tracked file touched:

```bash
mkdir -p /home/user && ln -s /home/claude/app /home/user/PersonalTrAIner-claude
```

With it, `verify:one-number` passes (19 checks, 28 s) and all eleven pass in the sweep. **I left this symlink in place.** Remove with `rm /home/user/PersonalTrAIner-claude` if unwanted.
If it is missing in a later session, those eleven fail with a missing-fixture or blank-page message, not a path error.

### What I tried first (logs in `verify/tried-first/`)

| Driver | Screen | Result | Time (incl. build) |
|---|---|---|---|
| `npm run verify:session-edit` | Exercise | PASS, 56 checks | 75 s |
| `npm run verify:meal-days` | Nutrition | PASS, 41 checks | 25 s |
| `npm run verify:one-number` as-is | Exercise | FAIL (path, above) | 16 s |
| `npm run verify:one-number` with symlink | Exercise | PASS, 19 checks | 28 s |

Screenshots read: `meal-days-upcoming.png` (day strip, Friday's meals, real numbers) and `session-edit-scope.png` (the "Take out Side Plank?" sheet) both render correctly at phone size.

## 4. Build

`npm run build` works: `tsc -b` then `vite build`, 28.1 s, exit 0. `test:bundle` runs the same build itself (34.6 s in the sweep) and passes with little room:

```
  a deploy re-downloads    271 of   280 kB gzipped  9 left
  first paint fetches      427 of   437 kB gzipped  10 left
  the app chunk            957 of   985 kB raw      28 left
  everything together     2098 of  2116 kB raw      18 left
```

Any `src/` change should re-run `test:bundle`; 9-10 kB gzipped is all that is left on two budgets.

## 5. Edge functions (`supabase/functions`)

Five functions (`chat-gemini` 4,529 lines, `onboarding-chat`, `generate-meals`, `macro-calibration`, `coach-reach-out`) plus `_shared/`.

- **`deno` is not installed** (`which deno` prints nothing; no `~/.deno`, no `node_modules/deno`). No `deno.json`, no import map, no Supabase CLI on PATH.
- **Nothing type-checks them.** `tsconfig.json` is `include: ["src"]` and `src/` only mentions the functions in comments, so `npx tsc --noEmit` and `tsc -b` never see them.
- What does cover them, all runnable here:
  - `test:functions-deployable` (PASS, 1.8 s): parses every `.ts` under `supabase/functions` with the TypeScript parser and checks all 23 relative imports across 18 files resolve. Syntax and imports only, no types.
  - tsx gates that IMPORT and execute the pure modules: `test:tool-reply` (`chat-gemini/tool-reply.ts`, `_shared/gemini-parts.ts`), `test:coach-texting` (`chat-gemini/text-like-a-coach.ts`),
    `test:message-evidence` (`_shared/message-evidence.ts`), `test:reply-guarantee` (`onboarding-chat/reply-resolver.ts`), `test:reach-out` (`_shared/reach-out`, `_shared/coach-moments`),
    `test:meal-log` (`_shared/food-db.ts`), `test:spend-cap` (dynamic import of `_shared/spend-cap.ts`). A type or syntax error in one of those files stops the gate at import.
  - About 65 gates read the function sources as TEXT (`test:coach-promises`, `test:coach-parity`, `test:chat-actions`, `test:chat-app-reality`, `test:coach-rules-sync`, `test:diet-tag-sync`, `test:food-db-parity` and others). They assert properties of the text, not that a branch runs.
  - `test:coach-exam-runner` and `test:coach-exam-judge` drive the exam scripts against local fakes; they do not execute `chat-gemini/index.ts`.
- **No gate executes an `index.ts` handler here.** The only thing that does is `npm run verify:reach-out-function` (`scripts/smoke-reach-out.mjs`), which runs
  `npx -y deno@2.9.6 run ... supabase/functions/coach-reach-out/index.ts`. I did not run it: it downloads the Deno binary from npm and the function's imports from `jsr.io`
  (`jsr:@negrel/webpush`, `jsr:@supabase/functions-js`), and `jsr.io` does not resolve from this sandbox. Expect it to fail on the jsr fetch.
- So for a `chat-gemini/index.ts` change the honest statement is: parsed, imports resolve, source-text gates green, never executed. Running it for real needs a deploy from Ashley's machine.

## 6. Files left modified in the working tree

`git status --short` after everything (nothing was reverted):

```
 M .tour-harness/session-rebuild-menu.png
 M .tour-harness/session-rebuild-persisted.png
 M .tour-harness/session-rebuild-promise.png
 M .tour-harness/session-rebuild-rebuilt.png
```

- These four screenshots are TRACKED (committed despite the `.tour-harness/*.png` ignore rule) and **`verify:session-rebuild` rewrites them on every run**. Restore with
  `git checkout -- .tour-harness/session-rebuild-*.png` before committing, or they will ride along in a `git add -A`.
- After the 235 `test:*` gates and the build alone, `git status --short` was EMPTY. `audit-report.txt`, `quality-report.txt` and `differentiation-audit-report.txt` were not touched
  because the three gates that rewrite them (`test:audit`, `test:quality`, `test:differentiation`) were not run.
- Untracked and git-ignored outputs now present: `dist/`, `tsconfig.tsbuildinfo`, `.tour-harness/dist/`, `.onb-harness/dist/`, `.tw-harness/dist/`, and screenshots `*.png` in the harness folders.
- Outside the repo: the `/home/user/PersonalTrAIner-claude` symlink (section 3) and `/home/claude/reports/`.

## 7. How to verify a change here

1. `npx tsc --noEmit` (19 s). It says nothing about `scripts/` or `supabase/functions/`.
2. Derive the gates from the diff, do not recall them: for each file in `git diff --name-only`, `grep -rln '<file basename>' scripts/*.ts scripts/*.mjs`, then run each hit's `npm run test:<name>`.
   Seconds each, except the slow ones listed below.
3. Always add: `npm run test:bundle` for any `src/` change (35 s, tight budgets); `npm run test:no-dead-code` when an export is added or removed;
   `npm run test:functions-deployable` plus the importing gates in section 5 for any `supabase/functions` change; a near-full sweep for a change to `exercise-db.ts`.
4. Anything visible: run the drivers for the SCREEN (table B, "Surface" column), one at a time, via `npm run verify:<name>`. Make sure the `/home/user` symlink exists first. Read the screenshots.
5. Compare against this baseline by checks RAN as well as failed (the per-gate mark counts are in the tables). Already red before any change: `test:coach-exam-fresh`, `verify:tap-targets`; flaky: `verify:correction-loop`.
   Environmental: `test:meal-quality`, `test:schema-parity`.
6. Before committing: `git status --short`, and restore `.tour-harness/session-rebuild-*.png` if `verify:session-rebuild` ran.
7. A fast sweep of everything is affordable on a settled tree: 235 `test:*` gates in 14.5 min (give `test:frozen-weeks` 5 min), 71 drivers in about 23 min. Not run here and still needed before a merge: `test:audit` (~2 min) and `test:quality` (~22 min).

Slow `test:*` gates on this machine (everything else is under 10 s): `test:frozen-weeks` 149 s, `test:injury-adaptation-safety` 65 s, `test:added-load` 51 s, `test:onboarding-reachable` 37 s,
`test:bundle` 35 s, `test:main-lift-rest` 34 s, `test:week-load-consistency` 33 s, `test:tempo-prescription` 33 s, `test:block-phases` 31 s, `test:day-coverage` 30 s, `test:coach-plan-context` 27 s,
`test:loadless-notes` 26 s, `test:single-leg-calf` 26 s, `test:meal-top-up` 20 s, `test:muscle-balance` 14 s, `test:rehab-prescribed` 13 s, `test:band-slots` 11 s.

## Table A — every `test:*` gate run (235), in package.json order

"Marks" is pass/fail lines counted in the log (`ok:` / `✓` / `FAIL:` / `✗`). `-` means the gate prints no per-check marks (exit code only).

| Gate | Guards | Baseline | Runtime | Marks pass/fail |
|---|---|---|---|---|
| `test:workout` | prints sample generated plans (a ledger, no assertions) | PASS | 1.1 s | - |
| `test:added-load` | a weighted chin-up/dip actually gets heavier | PASS | 51.3 s | 36/0 |
| `test:band-slots` | a real weight beats a band when one is on offer | PASS | 10.5 s | 13/0 |
| `test:mesocycle-roundtrip` | mesocycle weeks survive save/load unchanged | PASS | 1.5 s | - |
| `test:logging-roundtrip` | multi-week set logging against a fake database | PASS | 0.8 s | 89/0 |
| `test:meal-roundtrip` | meal store + meal generation round trip (fake database) | PASS | 1.0 s | 78/0 |
| `test:meal-quality` | measured floor for generated meals (LIVE database + generate-meals) | ENVIRONMENTAL | 0.7 s | - |
| `test:macro-split` | user-adjustable macro split arithmetic | PASS | 0.5 s | 57/0 |
| `test:injury-separation` | food vs exercise preferences/injuries kept in separate stores | PASS | 0.6 s | 7/0 |
| `test:ramp-visibility` | ramp-up (build-up) sets shown and labelled correctly | PASS | 1.7 s | 172/0 |
| `test:session-derive` | which sets are loggable / working (session-derive pure functions) | PASS | 0.9 s | 53/0 |
| `test:no-forked-state` | no fact has two owners (layout no-fork invariants) | PASS | 0.9 s | 15/0 |
| `test:pending-actions` | coach proposes, user confirms; natural-language logging | PASS | 2.3 s | 107/0 |
| `test:memory` | coach memory and goals store | PASS | 0.9 s | 26/0 |
| `test:diet-tag-sync` | edge functions' dietary tag lists match the app's diet rules | PASS | 0.6 s | 114/0 |
| `test:chat-app-reality` | coach prompt's description of the screens matches the real app | PASS | 0.7 s | 37/0 |
| `test:grocery` | grocery list follows the meals | PASS | 0.9 s | 39/0 |
| `test:rehab-order` | corrective work in the prep block is not a sequencing fault | PASS | 2.9 s | 28/0 |
| `test:one-main-lift` | exactly one main lift per day | PASS | 0.9 s | 21/0 |
| `test:deload-lighter` | a deload week is lighter than the week before | PASS | 2.8 s | 15/0 |
| `test:pattern-floor` | a trimmed session loses sets, never a movement pattern | PASS | 2.2 s | 30/0 |
| `test:primer-load` | a prep move needing an implement gets a (half) weight | PASS | 1.9 s | 38/0 |
| `test:profile-restore` | every profile column the app reads survives a reload | PASS | 0.9 s | 5/0 |
| `test:dashboard` | Home dashboard: streak, rest days, summaries | PASS | 0.9 s | 58/0 |
| `test:round-logging` | a finished round timer is actually written down | PASS | 0.8 s | 24/0 |
| `test:round-presets` | timer tiles only name timers the app has | PASS | 0.6 s | 66/0 |
| `test:timers` | timer engine (deadline anchoring, rest-complete flow) | PASS | 0.6 s | 23/0 |
| `test:cardio-log` | cardio log + undo against a fake database | PASS | 0.9 s | 9/0 |
| `test:cardio-effort` | cardio logged like a set; Easy/Steady/Hard mapping | PASS | 0.9 s | 29/0 |
| `test:chat-cardio` | cardio logged through the chat (parse + write) | PASS | 0.8 s | 16/0 |
| `test:reach-out` | phone-notification decision loop, end to end with fakes | PASS | 0.9 s | 61/0 |
| `test:exercise-history` | history grouping, strength trend, PR history | PASS | 1.0 s | 17/0 |
| `test:plan-adaptations-separation` | plan_adaptations is its own store | PASS | 1.0 s | 7/0 |
| `test:injury-adaptation-safety` | an injury adaptation never yields an unsafe plan (safety) | PASS | 65.4 s | 3/0 |
| `test:schema-parity` | TEST and PRODUCTION have the same migrations (LIVE, Supabase CLI) | ENVIRONMENTAL | 8.3 s | - |
| `test:auth-and-rls` | client half of sign-in + row-level security | PASS | 0.9 s | 71/0 |
| `test:a11y` | screen-reader labels and text scaling | PASS | 0.7 s | 8/0 |
| `test:bundle` | built bundle size budgets (runs npm run build itself) | PASS | 34.6 s | 19/0 |
| `test:ramp-arrived` | app stops claiming the weight is rising once it has stopped | PASS | 0.6 s | 17/0 |
| `test:rest-day-card` | rest-day card logic the browser cannot reach | PASS | 0.7 s | 45/0 |
| `test:rebuild-offer` | a profile change that invalidates the plan offers a rebuild | PASS | 1.4 s | 64/0 |
| `test:logged-reanchor` | after logging, shown weight comes from what was lifted | PASS | 0.8 s | 27/0 |
| `test:no-dead-code` | no unused exports accumulate in src/ | PASS | 5.1 s | 8/0 |
| `test:coach-voice` | app-written coach sentences come from one phrasebook | PASS | 1.7 s | 76/0 |
| `test:session-shortfall` | a session shorter than asked for says why | PASS | 0.5 s | 22/0 |
| `test:timer-field` | round timer phase legibility and finished state | PASS | 0.6 s | 40/0 |
| `test:rls-local` | real local PostgreSQL applies all migrations and refuses cross-user reads | PASS | 6.1 s | 34/0 |
| `test:slot-replacement` | no stale data survives an exercise slot change | PASS | 0.9 s | 26/0 |
| `test:joint-tags` | three-state joint tagging (participates/contraindicated/indicated) | PASS | 1.0 s | 133/0 |
| `test:injury-rebuild` | an injury removing whole patterns rebuilds the plan | PASS | 2.5 s | 19/0 |
| `test:block-review` | block-end stall detection and date ranges | PASS | 0.7 s | 15/0 |
| `test:block-consistency` | attendance-based volume hold logic | PASS | 0.7 s | 19/0 |
| `test:loadless-notes` | nobody without weights is told to add weight | PASS | 25.8 s | 17/0 |
| `test:load-suggestions` | load suggestions only ever propose up | PASS | 1.2 s | 11/0 |
| `test:interval-prescription` | interval vs steady-state cardio prescription | PASS | 0.9 s | 24/0 |
| `test:cardio-share-score` | cardio share check in the time-fit score | PASS | 0.8 s | 13/0 |
| `test:block-rest-sizing` | per-block rest-budget sizing | PASS | 9.1 s | 25/0 |
| `test:muscle-balance` | chest:back balance pass | PASS | 13.9 s | 11/0 |
| `test:onboarding-order` | order of onboarding questions | PASS | 0.6 s | 27/0 |
| `test:onboarding-chips` | onboarding tappable options: when and what shape | PASS | 0.7 s | 156/0 |
| `test:reveal-timing` | chat typewriter reveal speed and evenness | PASS | 0.6 s | 24/0 |
| `test:load-display` | how a prescribed weight is written (per hand vs total) | PASS | 0.7 s | 39/0 |
| `test:deploy-path` | deploy/db scripts target the right Supabase project | PASS | 0.7 s | 32/0 |
| `test:functions-deployable` | every edge function file parses and its imports resolve | PASS | 1.8 s | 5/0 |
| `test:exercise-demo` | muscle map and exercise demo video wiring | PASS | 0.7 s | 31/0 |
| `test:plate-math` | plate calculator arithmetic | PASS | 1.1 s | 20/0 |
| `test:meal-log` | coach logs a meal only behind a confirmation | PASS | 0.8 s | 35/0 |
| `test:one-today` | one "today" across the app; finished is not unstarted | PASS | 0.5 s | 17/0 |
| `test:exercise-detail` | technique panel and form cues have a reader | PASS | 0.6 s | 33/0 |
| `test:says-what-it-contains` | app never describes work the plan does not contain | PASS | 1.0 s | 23/0 |
| `test:week-note` | week note and delta chip against real generated plans | PASS | 2.0 s | 52/0 |
| `test:block-phases` | the four weeks of a block are named and match the prose | PASS | 31.1 s | 36/0 |
| `test:beat-target` | beat-the-target accelerator and its safety limits | PASS | 0.7 s | 26/0 |
| `test:session-feel` | coach asks how the session went | PASS | 0.7 s | 47/0 |
| `test:coach-opener` | the coach's first message is picked from real state | PASS | 0.6 s | 135/0 |
| `test:coach-nudge` | unprompted mid-conversation coach message rules | PASS | 0.6 s | 98/0 |
| `test:style-starve` | a style preference cannot starve a movement | PASS | 4.0 s | 46/0 |
| `test:onboarding-handover` | onboarding hands over the app before meals finish | PASS | 0.6 s | 51/0 |
| `test:lift-plausibility` | an implausible stated lift never becomes a heavy prescription (safety) | PASS | 1.8 s | 29/0 |
| `test:set-plausibility` | an implausible logged weight never becomes data (safety) | PASS | 0.9 s | 48/0 |
| `test:meal-ledger-snapshot` | day's calorie total updates without waiting on the network | PASS | 0.8 s | 23/0 |
| `test:custom-meal` | coach builds a custom meal from stated foods | PASS | 0.8 s | 28/0 |
| `test:meal-food-add` | add a food to a meal already on the plan | PASS | 0.8 s | 31/0 |
| `test:one-day-one-look` | every screen that shows a day shows it the same way | PASS | 0.5 s | 27/0 |
| `test:tab-ownership` | one fact, one owning tab | PASS | 0.6 s | 37/0 |
| `test:appearance` | theme/accent appearance system | PASS | 0.6 s | 163/0 |
| `test:no-question-beside-generate` | never a question and a "build plan" offer at once | PASS | 0.5 s | 34/0 |
| `test:onboarding-conversational` | onboarding is a conversation, not a questionnaire | PASS | 0.7 s | 61/0 |
| `test:onboarding-style` | text-only onboarding conversation design | PASS | 0.5 s | 55/0 |
| `test:week-load-consistency` | one lift, one weight, within a week | PASS | 33.2 s | 10/0 |
| `test:soft-preferences` | a soft food preference is a lean and is actually read | PASS | 0.8 s | 45/0 |
| `test:food-db-parity` | client and edge-function food databases agree on allergens (safety) | PASS | 0.5 s | 13/0 |
| `test:log-correction` | correcting a logged set replaces it; no number invented | PASS | 0.7 s | 45/0 |
| `test:fat-loss-deficit` | fat-loss deficit scales to the person | PASS | 0.5 s | 30/0 |
| `test:shop-day` | when the Home shopping card shows | PASS | 0.6 s | 29/0 |
| `test:meal-move` | move a meal to another slot, resized to fit | PASS | 0.7 s | 49/0 |
| `test:meal-food-edit` | remove/replace/scale one food inside a meal (safety half) | PASS | 0.8 s | 69/0 |
| `test:meal-addition` | a user-requested meal is checked like a generated one | PASS | 0.7 s | 96/0 |
| `test:meal-swap-rotation` | a meal swap never returns the meal just rejected | PASS | 0.7 s | 28/0 |
| `test:categorize-precedence` | exercise categorisation rules ordered specific-before-generic | PASS | 0.6 s | 25/0 |
| `test:injury-coverage` | every reportable injury actually changes the plan | PASS | 0.8 s | 14/0 |
| `test:onboarding-exercise-dislikes` | "never give me burpees" works from onboarding | PASS | 1.0 s | 34/0 |
| `test:option-icons` | no two options in a question share an icon | PASS | 0.6 s | 44/0 |
| `test:table-names` | every table named in a migration/query exists | PASS | 0.6 s | 6/0 |
| `test:chat-actions` | every action the coach function emits is handled by the client | PASS | 0.6 s | 7/0 |
| `test:coach-volume-schedule` | coach can change volume/schedule, safely | PASS | 0.9 s | 87/0 |
| `test:onboarding-reachable` | the first onboarding screen can actually be tapped | PASS | 37.2 s | 12/0 |
| `test:timer-field-fills-screen` | round timer colour field fills the screen | PASS | 1.9 s | 12/0 |
| `test:timer-intent-copy` | pause/timer copy defects from a real phone | PASS | 0.6 s | 14/0 |
| `test:coach-phase-brief` | coach knows the training phase and when to say so | PASS | 0.5 s | 23/0 |
| `test:onboarding-slots` | shared onboarding slot definitions and profile assembly | PASS | 0.7 s | 236/0 |
| `test:onboarding-corrections` | correcting an onboarding answer | PASS | 0.5 s | 23/0 |
| `test:coach-logs-steps` | coach logs steps behind a card | PASS | 0.7 s | 42/0 |
| `test:coach-injuries-context` | coach's read-only view of current injuries | PASS | 0.5 s | 15/0 |
| `test:coach-water-context` | coach's read-only view of today's water | PASS | 0.5 s | 10/0 |
| `test:coach-warmup-memory` | coach memory labels warm-ups and drops correctly | PASS | 0.6 s | 19/0 |
| `test:coach-logs-warmup-drop` | coach logs a warm-up or drop set safely | PASS | 0.7 s | 37/0 |
| `test:coach-sees-technique` | coach can see exercise technique cues | PASS | 1.9 s | 18/0 |
| `test:coach-sees-ingredients` | coach can see what is in the meals | PASS | 0.6 s | 31/0 |
| `test:food-dislike-is-a-ban` | a disliked food is never served again | PASS | 0.5 s | 35/0 |
| `test:allergen-hidden-forms` | untagged allergens get a caveat on the receipt (safety) | PASS | 0.5 s | 19/0 |
| `test:coach-first-timer-note` | first-timer gets the see-a-doctor note once | PASS | 0.5 s | 12/0 |
| `test:audit-fixes` | five defects from the 30 Aug audit stay fixed | PASS | 1.0 s | 32/0 |
| `test:round-timer` | round timer schedule | PASS | 0.5 s | 80/0 |
| `test:hero-surface` | Home hero ambient surface | PASS | 0.5 s | 8/0 |
| `test:activity-streak` | a logged walk builds the streak | PASS | 0.5 s | 10/0 |
| `test:starting-out` | starting-out walking plan rules | PASS | 0.8 s | 32/0 |
| `test:planned-activity` | a day whose plan is an activity shows the activity | PASS | 0.8 s | 31/0 |
| `test:cardio-session` | offer a cardio session only when the user is definite | PASS | 0.7 s | 48/0 |
| `test:tempo-prescription` | tempo is a real prescription | PASS | 32.9 s | 23/0 |
| `test:training-week` | training-week day classification | PASS | 0.8 s | 50/0 |
| `test:coach-rules-sync` | coach behavioural rule text kept in sync across functions | PASS | 0.5 s | 4/0 |
| `test:coach-exam-grader` | coach exam hard rules, on fixtures | PASS | 0.6 s | 88/0 |
| `test:coach-exam-runner` | coach exam runner end to end against a fake coach | PASS | 3.7 s | 35/0 |
| `test:coach-exam-judge` | coach exam judge end to end against a fake model API | PASS | 3.7 s | 33/0 |
| `test:chosen-not-shuffled` | exercise ranking is chosen with reasons, not random | PASS | 0.8 s | 19/0 |
| `test:target-change-notice` | nutrition target changes are explained | PASS | 0.6 s | 30/0 |
| `test:session-rebuild` | rebuild today's session, main lift kept | PASS | 1.3 s | 35/0 |
| `test:coach-exam-fresh` | coach exam scores match the coach on disk (staleness) | **FAIL** (real, pre-existing) | 0.6 s | 24/2 |
| `test:coach-parity` | every coach tool classified; none quietly declines; screen parity | PASS | 0.8 s | 258/0 |
| `test:coach-texting` | coach replies leave without headers/bold | PASS | 0.6 s | 21/0 |
| `test:coach-promises` | coach never promises what it cannot do | PASS | 0.7 s | 248/0 |
| `test:app-tour` | app tour stops point at real, correctly-owned features | PASS | 0.8 s | 176/0 |
| `test:overlay-artifacts` | three overlays that got in the way stay fixed | PASS | 0.8 s | 30/0 |
| `test:correction-loop` | correcting a mislogged set ends in a correction | PASS | 0.8 s | 45/0 |
| `test:swap-style` | swap shortlist shows off-style options, loaded first | PASS | 1.0 s | 29/0 |
| `test:swap-target` | "swap this exercise" finds the exercise | PASS | 0.6 s | 45/0 |
| `test:plan-unknown` | no "rest day" claim before the plan has loaded | PASS | 0.9 s | 39/0 |
| `test:moved-session-stuck` | a moved session does not stick on its landing day | PASS | 0.6 s | 50/0 |
| `test:session-move` | rules for moving a session to another day | PASS | 0.8 s | 130/0 |
| `test:home-week-strip` | Home week strip reflects what happened today | PASS | 0.7 s | 21/0 |
| `test:tool-reply` | second-pass coach reply on a tool turn (mocked model) | PASS | 0.7 s | 43/0 |
| `test:message-evidence` | server reads the user's message without the model | PASS | 0.6 s | 45/0 |
| `test:equipment-labels` | equipment option wording matches what it grants | PASS | 0.8 s | 85/0 |
| `test:diary-preservation` | what was eaten is not rewritten by later changes | PASS | 0.5 s | 27/0 |
| `test:question-not-a-card` | a question gets an answer, not a log card | PASS | 0.6 s | 31/0 |
| `test:reply-guarantee` | onboarding-chat always returns a reply | PASS | 0.6 s | 50/0 |
| `test:assumed-body` | no load derived from an assumed bodyweight | PASS | 1.5 s | 30/0 |
| `test:weight-basis` | weight-basis rebuild offer | PASS | 2.2 s | 31/0 |
| `test:per-side-load` | per-side vs both-sides load labelling | PASS | 3.1 s | 21/0 |
| `test:chips-match-sets` | weight chips match the working-set count | PASS | 3.0 s | 4/0 |
| `test:single-implement` | one dumbbell is not a pair | PASS | 0.8 s | 35/0 |
| `test:calibration-search` | calibration week is a search, not a prescription | PASS | 1.2 s | 70/0 |
| `test:what-happened` | the five "what happened today" day verbs | PASS | 0.9 s | 64/0 |
| `test:session-edit` | remove / move an exercise within a session | PASS | 1.2 s | 79/0 |
| `test:exercise-add` | add an exercise into a session as part of the plan | PASS | 1.2 s | 74/0 |
| `test:setup-answers` | correcting a setup number re-prices/rebuilds the plan | PASS | 1.2 s | 55/0 |
| `test:harness-clock` | browser harness never reads the machine's calendar | PASS | 0.7 s | 183/0 |
| `test:edit-tradeoff` | a change against the goal is priced and asked about | PASS | 3.6 s | 85/0 |
| `test:edit-reason` | the "what's going on with it?" reason chips route somewhere real | PASS | 1.2 s | 67/0 |
| `test:no-false-claim` | coach never says it changed something it did not | PASS | 0.5 s | 60/0 |
| `test:never-blank` | coach never returns an empty reply | PASS | 1.3 s | 23/0 |
| `test:edit-keeps-the-bar` | every edit path keeps the plan above the generation floor | PASS | 8.5 s | 88/0 |
| `test:tightness` | "anything tight?" adds warm-up and nothing else | PASS | 0.7 s | 92/0 |
| `test:filler-yields` | optional mobility filler is the first thing a budget takes back | PASS | 3.7 s | 58/0 |
| `test:push-pull-score` | pull-heavy week not flagged when only one press existed | PASS | 4.5 s | 13/0 |
| `test:today-only` | shorten/lighten today only, main lift protected | PASS | 2.5 s | 63/0 |
| `test:day-coverage` | a day does not lose a muscle its own plan asked for | PASS | 30.4 s | 11/0 |
| `test:pattern-tags` | movement_pattern tags mean what they say | PASS | 1.3 s | 14/0 |
| `test:rehab-prescribed` | rehab work is prescribed, not merely permitted (safety) | PASS | 12.5 s | 94/0 |
| `test:frozen-weeks` | a week is not a carbon copy of the one before | TIMEOUT at 120 s; PASS in 149 s | 149.0 s | 69/0 |
| `test:session-length` | sessions use the time the trainee set aside | PASS | 8.7 s | 8/0 |
| `test:load-ceilings` | what an implement can actually be loaded to (safety) | PASS | 0.8 s | 50/0 |
| `test:ceiling-units` | units of every load ceiling | PASS | 0.8 s | 27/0 |
| `test:single-leg-calf` | single-leg calf raise load anchored on the trainee | PASS | 25.6 s | 37/0 |
| `test:tools-grid` | Tools tab is one timer surface | PASS | 0.5 s | 68/0 |
| `test:nutrition-layout` | Nutrition tab shows the day truthfully | PASS | 0.6 s | 48/0 |
| `test:exercise-today` | Exercise tab leads with today | PASS | 0.8 s | 75/0 |
| `test:profile-groups` | Profile is four groups and nothing fell out | PASS | 0.5 s | 56/0 |
| `test:main-lift-rest` | a loaded main lift gets real rest | PASS | 33.5 s | 28/0 |
| `test:composer-focus` | sending a message keeps the keyboard; scroll works | PASS | 0.6 s | 20/0 |
| `test:reset-clears-draft` | New Plan really starts a new plan | PASS | 0.6 s | 30/0 |
| `test:body-units` | feet/stone reach the app as cm/kg | PASS | 0.6 s | 42/0 |
| `test:coach-plan-context` | every prescribed number reaches the coach | PASS | 26.7 s | 95/0 |
| `test:proposal-expiry` | an expired coach proposal says so | PASS | 0.8 s | 21/0 |
| `test:local-dates` | one calendar-date convention (user's local) | PASS | 0.7 s | 13/0 |
| `test:stale-after-write` | a write reaches the screen that shows it | PASS | 0.6 s | 45/0 |
| `test:silent-writes` | a failed write says it failed | PASS | 0.8 s | 73/0 |
| `test:enforcement-gaps` | three collected rules are actually enforced | PASS | 0.9 s | 41/0 |
| `test:session-continuity` | what survives putting the phone down mid-workout | PASS | 0.7 s | 25/0 |
| `test:installable` | installable app: manifest, icon, offline | PASS | 0.7 s | 35/0 |
| `test:spend-cap` | AI functions have a spend cap | PASS | 0.7 s | 48/0 |
| `test:user-data` | export and delete your data | PASS | 0.8 s | 21/0 |
| `test:context-is-read` | everything the client sends the coach is read | PASS | 0.7 s | 15/0 |
| `test:queue-listeners` | every local-first queue publishes and is subscribed | PASS | 0.7 s | 54/0 |
| `test:bounds-and-boundaries` | number limits, live controls, error boundary | PASS | 0.8 s | 47/0 |
| `test:replace-without-losing` | every replacing write can be undone, no data-loss window | PASS | 0.8 s | 31/0 |
| `test:concurrent-activity` | a second sport bends the plan around it | PASS | 9.8 s | 60/0 |
| `test:log-needs-your-words` | coach never logs an exercise the user did not name | PASS | 0.9 s | 42/0 |
| `test:meal-tradeoff` | a meal change against the goal is asked about | PASS | 0.7 s | 52/0 |
| `test:bodyweight-progress` | PRs and progress for bodyweight training | PASS | 0.7 s | 80/0 |
| `test:session-length-change` | "45 minutes from now on" rebuilds the block | PASS | 1.4 s | 33/0 |
| `test:goal-change` | changing the goal changes training and food | PASS | 1.9 s | 59/0 |
| `test:meal-refit` | resize a day's meals when the target moved | PASS | 0.9 s | 91/0 |
| `test:coach-moments` | which one notification is worth sending | PASS | 0.7 s | 47/0 |
| `test:coach-clock` | coach knows the time, never claims usual training time | PASS | 0.7 s | 35/0 |
| `test:last-time` | faint box numbers are marked "last time" | PASS | 0.6 s | 31/0 |
| `test:drop-sets` | a drop continues the set above it | PASS | 0.7 s | 42/0 |
| `test:working-sets` | a build-up set is not a working set | PASS | 0.7 s | 31/0 |
| `test:rest-floors` | rest suits the exercise; no 30s second-tier compounds | PASS | 2.0 s | 24/0 |
| `test:meal-variety` | a different day (and dish) tomorrow | PASS | 3.4 s | 122/0 |
| `test:meal-days` | Nutrition day strip: see, swap, shop upcoming days | PASS | 1.0 s | 55/0 |
| `test:meal-likes` | likes rank meals, never buy an off-target day | PASS | 1.2 s | 64/0 |
| `test:meal-pool-size` | seven options per meal, asked in pieces that fit | PASS | 0.8 s | 22/0 |
| `test:meal-top-up` | more meal options without moving today | PASS | 19.9 s | 131/0 |
| `test:meal-day-move` | swap a meal with another day's, plus Undo | PASS | 1.3 s | 169/0 |
| `test:meal-method` | cooking method kept, amounts refused | PASS | 0.9 s | 42/0 |
| `test:leftovers` | cook once, eat twice (leftover lunch) | PASS | 0.7 s | 43/0 |
| `test:meal-favourite` | heart a meal to keep it | PASS | 0.7 s | 29/0 |
| `test:kept-meal-restriction` | a kept meal breaking a new restriction is not served | PASS | 0.7 s | 22/0 |
| `test:chat-groups` | chat bubble grouping rules | PASS | 0.6 s | 29/0 |
| `test:grocery-display` | what a shopping line says | PASS | 0.8 s | 33/0 |
| `test:grocery-screen` | grocery page parts that live in App.tsx | PASS | 0.6 s | 18/0 |
| `test:chat-page` | full-page chat parts that live in App.tsx | PASS | 0.6 s | 4/0 |
| `test:meal-library` | own meal library: dishes proven servable | PASS | 2.1 s | 83/0 |

## Table B — every `verify:*` browser driver run (71)

Run driver-only after one build per harness (`.onb-harness` 5.0 s, `.tour-harness` 10.5 s, `.tw-harness` 3.1 s); add about 10 s per driver when run through `npm run`.
All with the `/home/user` symlink in place. "Path" = hard-codes `/home/user/PersonalTrAIner-claude` and needs the symlink.

| Driver | Surface | Guards | Baseline | Runtime | Marks pass/fail | Page | Path |
|---|---|---|---|---|---|---|---|
| `verify:composer` | Onboarding | composer placeholder names the question on screen | PASS | 12.9 s | 14/0 | composer.html |  |
| `verify:keyboard` | Onboarding | sending a message keeps the phone keyboard up | PASS | 10.0 s | 7/0 | composer.html |  |
| `verify:onboarding-walk` | Onboarding | every onboarding question answered with real components | PASS | 3.2 s | 8/0 | onb.html |  |
| `verify:equipment-labels` | Profile | equipment picker labels (closed + open) | PASS | 2.8 s | 9/0 | equipment-select.html |  |
| `verify:tour` | Tour (stubs) | app tour behaviour against stub targets | PASS | 20.4 s | 37/0 | chat.html,tour-harness.html |  |
| `verify:screens` | All tabs | walk every real screen: no overflow, NaN, stuck Loading | PASS | 15.0 s | 16/0 | real.html |  |
| `verify:tour-real` | All tabs | tour spotlights land on the real screens | PASS | 24.4 s | 36/0 | real.html |  |
| `verify:chat-shell` | Chat | chat composer with the keyboard up | PASS | 5.0 s | 8/0 | chat.html |  |
| `verify:tap-targets` | All tabs | every control is at least 44px | **FAIL** (real, reproduced) | 11.2 s | 2/1 | real.html |  |
| `verify:swapped-day` | Home/Exercise | a swapped day shows on the screens | PASS | 11.3 s | 8/0 | real.html |  |
| `verify:absurd-weight` | Exercise | an implausible typed weight is challenged | PASS | 7.1 s | 19/0 | real.html |  |
| `verify:meal-counter` | Nutrition/Home | calorie counter moves instantly on a slow network | PASS | 48.6 s | 17/0 | real.html |  |
| `verify:modal-close` | Dialogs | close button reachable on a short screen | PASS | 7.8 s | 13/0 | real.html |  |
| `verify:activity-swap` | Chat | "doing Muay Thai instead" asks first, writes on tap | PASS | 7.7 s | 16/0 | chat.html |  |
| `verify:no-tool-claim` | Chat | a false "I changed it" never reaches the screen | PASS | 8.6 s | 11/0 | chat.html |  |
| `verify:correction-loop` | Chat | correcting a mislogged set ends in a correction | FLAKY (failed 1 of 8 runs) | 7.9 s | 14/1 | chat.html |  |
| `verify:chat-cardio` | Chat | cardio logged through chat like the screens | PASS | 13.4 s | 21/0 | chat.html |  |
| `verify:reminders` | Profile | coach reminders switches and "Not live yet" | PASS | 7.4 s | 30/0 | profile.html,real.html |  |
| `verify:coach-ban` | Chat | ban an exercise from chat | PASS | 12.1 s | 13/0 | chat.html |  |
| `verify:tradeoff` | Chat | a costly change is asked about with "Do it anyway" | PASS | 31.7 s | 24/0 | chat.html |  |
| `verify:swap-request` | Chat | "swap this exercise" card, with cost stated | PASS | 13.6 s | 16/0 | chat.html |  |
| `verify:rest-day` | Exercise | rest-day card layout and cardio log row | PASS | 38.7 s | 56/0 | real.html | needs symlink |
| `verify:rest-day-race` | Chat/Home | no rest-day claim before the plan arrives | PASS | 12.7 s | 18/0 | chat.html,real.html |  |
| `verify:session-move` | Home/Exercise | "I'll do it tomorrow" on both screens | PASS | 13.2 s | 16/0 | real.html |  |
| `verify:moved-session` | Chat | a moved session on its landing day | PASS | 53.2 s | 17/0 | chat.html |  |
| `verify:coach-week-move` | Chat | what the coach is told after a session moved away | PASS | 5.5 s | 9/0 | chat.html |  |
| `verify:single-implement` | Exercise | one dumbbell shown as one, not a pair | PASS | 21.3 s | 8/0 | real.html |  |
| `verify:prep-weight` | Exercise | prep move needing a bell shows its weight | PASS | 6.4 s | 7/0 | real.html | needs symlink |
| `verify:ramp-readonly` | Exercise | build-up block is read-only on browse/peek | PASS | 16.5 s | 9/0 | real.html | needs symlink |
| `verify:warmup-rows` | Exercise | a labelled box for every warm-up and working set | PASS | 10.1 s | 32/0 | real.html | needs symlink |
| `verify:drop-sets` | Exercise | drop sets as continuation rows | PASS | 12.4 s | 38/0 | real.html | needs symlink |
| `verify:calibration-search` | Exercise | calibration week reads as a search | PASS | 15.1 s | 23/0 | real.html |  |
| `verify:what-happened` | Exercise | the five day verbs on the day menu | PASS | 25.3 s | 39/0 | real.html |  |
| `verify:session-edit` | Exercise | remove/move/swap an exercise via the menu | PASS | 64.8 s | 54/0 | real.html |  |
| `verify:hurts` | Exercise | "it hurts" triage, red flag changes nothing | PASS | 23.5 s | 28/0 | real.html |  |
| `verify:exercise-add` | Exercise | add an exercise into a session | PASS | 11.2 s | 20/0 | real.html |  |
| `verify:setup-answers` | Profile | correcting setup answers; rebuild/re-price offers | PASS | 21.2 s | 67/0 | profile.html |  |
| `verify:tightness` | Exercise | "anything tight?" adds warm-up only | PASS | 13.4 s | 27/0 | real.html |  |
| `verify:session-rebuild` | Exercise | rebuild today's session, main lift kept | PASS | 12.1 s | 24/0 | real.html |  |
| `verify:shorten-today` | Exercise | "only 25 minutes today" shortens today only | PASS | 18.4 s | 31/0 | real.html |  |
| `verify:planned-activity` | Exercise | a planned walk is rendered and loggable | PASS | 12.3 s | 17/0 | real.html | needs symlink |
| `verify:cardio-session` | Exercise | put a cardio session on a day from the screen | PASS | 13.9 s | 11/0 | real.html | needs symlink |
| `verify:program-move` | Exercise | Full Program screen after a move made in chat | PASS | 11.8 s | 16/0 | real.html |  |
| `verify:ceiling-label` | Exercise | "next weight up is too big a jump" label | PASS | 59.8 s | 9/0 | real.html |  |
| `verify:meal-move` | Nutrition | move a meal to another slot | PASS | 3.2 s | 22/0 | real.html |  |
| `verify:meal-refit` | Nutrition | offer to resize meals when targets drift | PASS | 9.9 s | 23/0 | real.html |  |
| `verify:meal-food-edit` | Nutrition | remove/replace/scale/add a food in a meal | PASS | 7.5 s | 27/0 | real.html |  |
| `verify:tools-timer` | Tools | Tools is one timer; a running round keeps the tab | PASS | 34.3 s | 48/0 | real.html |  |
| `verify:round-presets` | Tools | round presets on the tile exist in the app | PASS | 32.7 s | 33/0 | real.html |  |
| `verify:round-lead-in` | Tools | ten-second lead-in before round 1 | PASS | 12.4 s | 15/0 | real.html |  |
| `verify:diary-preservation` | Nutrition | what was eaten survives later changes | PASS | 7.7 s | 7/0 | real.html |  |
| `verify:coach-speaks-first` | Chat | coach's unprompted first message | PASS | 8.8 s | 9/0 | chat.html |  |
| `verify:six` | Home/Chat | two phone-reported defects only a browser settles | PASS | 52.6 s | 34/0 | real.html |  |
| `verify:one-number` | Exercise | one lift, one number; "last time" marker; chips | PASS | 18.2 s | 18/0 | real.html | needs symlink |
| `verify:finisher` | Exercise | finisher says what it is; cardio log row | PASS | 15.8 s | 13/0 | real.html | needs symlink |
| `verify:mobility-filler` | Exercise | optional mobility close-out on a short day | PASS | 9.5 s | 11/0 | real.html | needs symlink |
| `verify:meal-tradeoff` | Chat | a meal change against the goal is asked about | PASS | 14.7 s | 11/0 | chat.html |  |
| `verify:bodyweight-progress` | Exercise | bodyweight PRs and progress on screen | PASS | 20.4 s | 28/0 | real.html | needs symlink |
| `verify:meal-method` | Nutrition | cooking method shown, amounts refused | PASS | 5.8 s | 12/0 | real.html |  |
| `verify:leftovers` | Nutrition | leftover lunch from last night's dinner | PASS | 4.1 s | 9/0 | real.html |  |
| `verify:meal-favourite` | Nutrition | heart on the meal row | PASS | 2.1 s | 13/0 | real.html |  |
| `verify:meal-days` | Nutrition | day strip: see, swap, shop upcoming days | PASS | 14.5 s | 41/0 | real.html |  |
| `verify:meal-day-move` | Nutrition | swap a meal with another day's + Undo | PASS | 62.7 s | 76/0 | real.html |  |
| `verify:meal-likes` | Profile | foods and meals she likes | PASS | 4.5 s | 20/0 | profile.html |  |
| `verify:kept-meal` | Profile/Nutrition | a kept meal breaking a restriction is not served | PASS | 14.8 s | 17/0 | profile.html,real.html |  |
| `verify:meal-top-up` | Nutrition | "Get more options" without moving today | PASS | 47.1 s | 54/0 | real.html |  |
| `verify:chat-day-move` | Chat | coach swaps a meal between days | PASS | 39.3 s | 69/0 | chat.html |  |
| `verify:chat-top-up` | Chat | coach's meal top-up card | PASS | 39.5 s | 69/0 | chat.html |  |
| `verify:grocery` | Grocery | grocery full-page screen | PASS | 27.1 s | 59/0 | grocery.html |  |
| `verify:chat-bubbles` | Chat | grouped chat bubbles, contrast and layout | PASS | 11.8 s | 65/0 | chat.html |  |
| `verify:reveal` | Chat (typewriter) | reply reveal timing (prints measurements, no pass/fail marks) | PASS | 10.1 s | - | .tw-harness |  |

Not run: `verify:rls` (live database) and `verify:reach-out-function` (needs Deno and jsr.io).

## Notes on method

- Every gate ran alone, in sequence, through `npm run <name>` under `timeout 120` (drivers: `node <driver>` under `timeout 180` after one build per harness). Nothing ran in parallel with a gate.
- `test:frozen-weeks` was re-run once with a 540 s limit (`test:frozen-weeks.rerun-540s.log`). The two red drivers were re-run through `npm run` (`verify/*.rerun-npm.log`).
- A first attempt at the `test:*` sweep was discarded after about a minute because my own watchdog mislabelled passes as timeouts; its logs were deleted and the sweep restarted from the top. No gate result in this file comes from that attempt.
- No tracked file was edited by hand; the only tracked files that changed are the four screenshots in section 6, rewritten by `verify:session-rebuild`. No state-changing git command was run and `npm ci` was not re-run.
