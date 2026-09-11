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
  — screen exists; ranking-over-shuffling itself `UNGUARDED`
- No plan below the quality floor — `quality` (floor 7.2/12; 0 below)
- Activity-shaped plans: only the starting-out walking plan exists, and only
  it is offered — `starting-out`

**The meal plan, as generated — the same bar, in its own terms**
- Targets from the profile, moved by a seven-day weight average, explained
  when they move, with an endpoint to a deficit — `fat-loss-deficit`,
  `macro-split`; "explained" `UNGUARDED`
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
- Ban it from every future plan — `screen only`; `audit-fixes`,
  `silent-writes`. CORRECTED 11 Sep 2026: this said "both". The coach's
  `ban_exercise` is a deliberate decline — "NOT WIRED UP YET… point the user at
  the ban button" (chat-gemini `:598`, handler `:3087`) — because a ban is the
  highest-blast-radius mutation in the app. I wrote "both" from the tool list
  without reading the handler
- Add one to a session AS PART OF THE PLAN — `MISSING` (extra work can be
  logged; it does not join the plan)
- Remove it from one session without banning it — both surfaces since 11 Sep
  2026; asks whether to drop it or put something else there (her ruling);
  `session-edit`, `verify:session-edit`
- Move it earlier or later within the session — both surfaces since 11 Sep
  2026, a superset's halves travelling together; `session-edit`,
  `verify:session-edit`
- Change its sets, reps or weight for today — via logging only (extra sets,
  typed numbers); the plan itself is not edited

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
- Swap the session for an activity — both; `what-happened`,
  `verify:swapped-day`, `verify:what-happened`
- Shorten or lighten TODAY only — `MISSING` (the volume toggle changes the
  plan going forward: `coach-volume-schedule`)
- Rebuild today's session as a whole, for today — `MISSING`

**Changing one meal** — mirrored from exercise, because meals are plans too
- Replace it, regenerate it, ask for more — both; `meal-swap-rotation`
- Add a food to it; add a meal to the day — `coach only`; `meal-food-add`,
  `meal-addition`
- Remove or replace one food within it — `MISSING`
- Build a custom meal from what is in the fridge — `coach only`; `custom-meal`
- Log what was eaten — both; `meal-log`, `meal-ledger-snapshot`,
  `diary-preservation`
- Move a meal to another slot or day — `MISSING`; meals per day and snacks —
  `screen only` (Profile)
- Scale a portion — `MISSING` as a user action

**Changing the whole plan**
- Start again — `screen only` (New Plan; `reset-clears-draft`)
- Days, equipment, injuries (add / lasting / recovered), goal, style,
  volume, other sports — both surfaces, proposed and confirmed —
  `rebuild-offer`, `profile-restore`, `coach-volume-schedule`,
  `injury-rebuild`, `enforcement-gaps`, `concurrent-activity`
- Session length — `screen only`; targets and macro mode — `screen only`
- Eight onboarding answers cannot be changed afterwards from the Profile
  screen: the three known lifts, exercise dislikes, the three implement
  ceilings, the starting preference — `MISSING` on screen
- Weights actually lifted flow into the printed plan — automatic from
  calibration week, offered after — `calibration-search`,
  `beat-target-offer`, `logged-reanchor`
- Nothing recorded is lost by any of this — `diary-preservation`,
  `replace-without-losing`, `memory`

**Adjustable AND best-in-class is one promise, not two**
- An adjustment keeps the plan above the floor generation had to meet —
  full rebuilds regenerate, so their checks run. NARROWED 11 Sep 2026:
  removing and moving an exercise re-run set hierarchy, one-weight and load
  coherence and rebuild the day's warm-up (`session-edit`, each pass proven by
  handing the edit a day that already violates it). A single SWAP and the
  volume toggle still re-run none of them, and the two weekly balance passes
  are unreachable from any edit path: `UNGUARDED`
- When a request would break the bar, the app says so and offers the
  nearest thing that keeps it — PARTIAL since 11 Sep 2026: removing an
  exercise reports what it costs the week's push:pull and chest:back balance
  before the tap, and offers the swap list instead (`session-edit` §5).
  Nothing else does; `MISSING` everywhere but there
- A changed plan is re-scored like a generated one — `MISSING`

### Promise 2 — everything by hand or by asking

- Every screen action has a coach path and every coach tool a screen path —
  measured 10 Sep 2026, corrected 11 Sep: 32 coach tools; **8** things the
  screen does that the coach cannot (banning an exercise is the eighth — see
  the correction above), 3 the coach does that the screen cannot (add a food,
  add a meal, custom meal — the four day-level ones closed 10 Sep; table in the
  audit) — partial. **No gate distinguishes a declared coach tool from a
  declining stub**, which is the hole the ban error fell through
- A written exceptions list, each with a reason, Ashley's to change —
  `MISSING`
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
  nutritionist would sign — `UNGUARDED`: tone probes exist, no graded check
- It asks before prescribing and uses the answer — prompt rule, kept in sync
  by `coach-rules-sync`; whether it HAPPENS is `UNGUARDED`
- It notices patterns and coaches to them — `block-review`,
  `beat-target-offer`, `session-feel`, `coach-opener` (missed yesterday —
  and it stops asking once a miss is declared), `coach-nudge`,
  `activity-streak`; a missed WEEK gets a chat prefill, not a follow-up
- It holds its scope — doctor, physio, dietitian at the right moment —
  `starting-out` for the first-timer note; otherwise `UNGUARDED`
- One voice, every time — tone probes only; `UNGUARDED`
- Never claims a capability, screen or guarantee it lacks; proposes,
  confirms, can be undone — `coach-promises`, `chat-app-reality`,
  `pending-actions`, `log-correction`, `replace-without-losing`,
  `question-not-a-card`, `tool-reply`, `message-evidence`
- **The coach exam** — a fixed set of realistic conversations graded against
  a written rubric, run against the real model whenever the prompt, model or
  tools change, scores kept — `MISSING`. Without it, "best-in-class advice"
  is asserted, not known.

### Across all three
- Onboarding asks each question once; every answer can be changed later —
  `onboarding-corrections`, `profile-restore`; eight answers cannot (above)
- Progress is visible — history, PRs, weight trend, streak —
  `exercise-history`, `dashboard`, `activity-streak`, `home-week-strip`
- Accountability is active — the coach opens, asks how it went, follows up
  — `coach-opener`, `coach-nudge`, `session-feel`, `verify:coach-speaks-first`
- History is permanent — `diary-preservation`, `replace-without-losing`
- Every write succeeds or says it did not — `silent-writes`,
  `queue-listeners`, `stale-after-write`
- Nothing is offered that is not built — `equipment-labels`,
  `says-what-it-contains`, `injury-coverage`, `enforcement-gaps`
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
- Strip comments before asserting a string is ABSENT, or a note explaining why
  something was removed will satisfy the check that it was removed.
- New check → register it in `package.json` → mutation-test it → say in the
  report how many mutations were tried and how many were caught.

### What a full sweep costs, so it is neither skipped nor stumbled into

- The whole suite is roughly an hour, and almost all of that is ONE check:
  `test:quality` (the plan-quality scorer, ~22 minutes, 9,216 profiles).
  `test:audit` is about two minutes. **Everything else runs in seconds.**
- So: run the handful of affected checks while working — they are instant —
  and the full sweep once, before a merge. Run it in the background and do
  something else; do not sit and watch it.
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

## Reporting

- Report the verified state, not that a command exited 0. Say what was proven live versus proven by construction or by test.
- Browser-harness clicks: verified working 11 Aug 2026 (field focus, typing, and two state-changing clicks all registered correctly). History: this harness failed to register synthetic clicks for an extended prior period, the cause was never root-caused, and the recovery is unexplained. Treat "working" as the current observed state, not a permanent fix — if clicks stop registering again, re-test before concluding anything, rather than assuming either "still broken" or "still fixed."
- **A WRITTEN FINDING IS A LEAD, NOT A FACT. Re-measure before fixing from it.** BACKLOG said `verify:tap-targets` failed on Home with "2 of 87 controls under 44px". Re-run 9 Sep 2026: 5 of 87, across three tabs, only one of them on Home — the "28px numeric input" was on Exercise. Fixing from the note would have fixed the wrong screen and left three real ones. When a note turns out wrong, correct it where it sits AND say so in the new entry; a stale line that nobody contradicts gets believed twice.
- If a metric's scale, denominator, or threshold changes, say so — prior numbers stop being comparable.
- If you retract or correct an earlier claim, say how you reached the wrong one — which file you read, what you skimmed, what you assumed. The correction is worth more than the retraction: it tells us whether the same error shape is sitting in other conclusions.
