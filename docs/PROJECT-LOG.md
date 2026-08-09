# Project Log — FitPlan Pro

**Purpose of this document.** If you are a fresh Claude Code session (or a
human) opening this repo for the first time, read this top to bottom before
touching code. It tells you what the app is, what already exists, why it's
built the way it is, what's known to be broken or deferred, and how to work
in this repo without breaking the standing conventions. It is a log, not a
spec — `docs/VISION-ARCHITECTURE.md` and `docs/LAYOUT-DESIGN.md` are the
design documents this project was built against; this file tells you how
much of each has actually landed in code, and what's happened since.

Written 2026-08-09, after 219 commits. Update it (don't replace it) as the
project moves — add to §5/§6 rather than rewriting history in §1–§4.

---

## 1. What the app is

FitPlan Pro is an AI personal trainer and nutritionist. One person, one
device, chat-first. The product promise, in the order the app tries to
deliver it:

1. **It builds you a real training programme** — a periodised mesocycle
   (blocks of weeks with a phase each: anatomical adaptation → hypertrophy
   → strength, or similar, depending on goal), not a single flat "workout
   plan." It picks exercises, sets, reps, and *loads* — not just "3x8", but
   an actual kg number, sourced honestly (see §2.1).
2. **It builds you a macro-accurate meal plan** to match that training —
   calories and macros derived from your body stats and goal, real meals
   assembled from a curated ingredient database, not AI-invented numbers.
3. **It learns from what you actually do.** Log a set heavier than
   prescribed twice in a row and the app notices; log a meal and your
   grocery list updates; tell it your shoulder hurts and it adapts your
   plan for a stated period, then reverts automatically.
4. **Everything works two ways: say it, or tap it.** Every capability the
   chat has, the UI has a direct equivalent for, and vice versa — "swap
   today's lunch" typed in chat and tapping the swap icon on the meal card
   both go through the exact same code path. Nothing is chat-exclusive or
   UI-exclusive.
5. **Chat never lies about what it did.** This is the single most-defended
   property in the codebase. A change to your plan is never asserted in
   prose without something on screen you can verify — see §3 for how that's
   enforced structurally, not by prompting the model to be careful.

The full design rationale for the memory/chat/action-safety system lives in
`docs/VISION-ARCHITECTURE.md` — written as a "design only" document after a
real incident (an AI chat mutated a user's schedule and told them it had,
with no way to see or undo the change). Most of what that document
proposed has since been built (see §2.7 and §4); read it for the *why*
behind the pending-actions/memory architecture, not as a description of
what's still missing. `docs/LAYOUT-DESIGN.md` is the equivalent document
for the current mobile layout (today-first Exercise tab, the fixed
bottom-dock region, active-session mode) — most of it has also landed,
folded into and superseded in places by the later "Density Pass" visual
redesign (§2.8).

---

## 2. What's built

Nine major systems. Each entry says what it does and where to start reading
code, not how every line works — read the file's own header comment for
that; this codebase is heavily self-documenting (every non-obvious file
opens with a comment block explaining its role and the traps it exists to
avoid).

### 2.1 Plan generation and periodisation

`src/lib/exercise-plan.ts` (the largest file in the codebase) is the pure
generator: `generateExercisePlan(profile, exclusions)` builds one week's
structure (exercise selection, constrained by equipment/injury/style/skill
in a staged pipeline — `getConstrainedPool`), `generateMesocycle(profile,
plan)` expands that into a full periodised block structure (typically
16 weeks in 4 blocks) with real load numbers per week, not percentages.

Per-goal behaviour is data-driven, not scattered `if`s: `src/lib/
goal-policies.ts` holds a `GoalPolicy` per `FitnessGoal` (fat_loss /
hypertrophy / functional / conditioning) controlling rep ranges, rest,
accessory-selection bias, and slot counts — added specifically because an
earlier version of the generator produced near-identical plans regardless
of stated goal (see the differentiation audit, §4).

Load provenance is a first-class, three-state concept threaded through the
UI as a labelled chip, never silently blended: `estimate` ("suggested," a
guess from bodyweight/experience heuristics), `known_weight` ("you told
us," from onboarding's optional "I know my numbers" branch — seeds week 1
directly and skips the calibration week), `logged` ("from your last
session," once real data exists). `src/lib/load-prescription.ts` computes
the number; `src/lib/progression-engine.ts` and `src/lib/pr-engine.ts`
handle week-to-week progression and PR detection. Calibration week (week 1,
when the trainee didn't state known lifts) deliberately prescribes
conservative loads and asks the trainee to log what they actually do —
the app is honest that early numbers are guesses, and updates from real
data as soon as it exists (see the "estimate → truth" detector,
§2.7).

A mesocycle is persisted whole — `src/lib/mesocycle-persistence.ts`
(`saveMesocycle`/`saveMesocycleWeek`/`restoreMesocycle`) against the
`mesocycle_weeks` table, replacing an earlier version that only persisted
week 1's bare columns and reconstructed the rest on every load (fragile,
and the direct cause of several early bugs — see the git history around
`c56ee4c "Part 0: persist the full mesocycle, not just week 1's bare
columns"`). Editing an existing plan (swap, ban) goes through `src/lib/
mesocycle-edit.ts` — see §3 for why this is a distinct layer from
generation.

### 2.2 Logging, sessions, and timers

Every logged set is a row in `exercise_set_logs`, written through **one**
path: `src/lib/set-log-store.ts`'s `saveSet` — local-first (writes to
localStorage immediately, syncs to Supabase in the background with a
retry/dead-letter queue), so a set logs instantly even offline and a save
never blocks on network. `test:no-forked-state` is a grep-based gate that
fails the build if any component calls the underlying Supabase write
directly instead of going through this one function — this is enforced
mechanically, not by convention alone.

A workout session is invisible infrastructure, not a mode the user has to
manage: `src/hooks/useActiveSession.tsx` (`ActiveSessionProvider`, mounted
once at app root) derives session status from logged sets rather than
requiring an explicit "start" tap for logging to work — logging a set with
no active session silently opens one, backdated to that set (see the
session-lifecycle work, commits around `SL1`–`SL9` in the task history).
An explicit **Start/Finish** action exists on the Exercise tab's hero for
users who want the ceremony and the finish summary (duration, volume, PRs,
next-session progression preview) — but nothing requires it. A session left
running with no activity for 6 hours auto-closes silently on next load/
focus (`isSessionStale`), never fabricating a completion the user didn't
confirm at the time.

The rest timer and three standalone timers (stopwatch / lap / round) share
one mechanism: **deadline-anchored, never tick-accumulated.** Every timer
stores *when it ends* (or started), and every render recomputes `remaining
= endsAt - now` fresh — never a counter that increments per tick. This is
the one property that makes a timer survive backgrounding, tab throttling,
and reload correctly by construction (`src/hooks/useDeadlineTick.ts` is the
shared redraw-forcing hook; `src/lib/timer-engine.ts` holds the pure math).
A round timer's current round/phase is *derived* from elapsed time against
the schedule at any given moment, not stepped forward by a stored
"current round" field that a bug could desynchronise from reality — this
replaced an earlier stateful implementation that could stall or race after
backgrounding (fixed in `d069101`).

`src/components/BottomDock.tsx` is the one fixed bottom-screen element,
with a strict two-row, priority-stacked contract: rest timer (or its
receipt) always wins the top row when active; a standalone timer chip
shows when no rest is running; a session-running indicator shows only when
neither of the above is active. The primary action (Start/Finish, or the
"Next exercise" advance in active mode) plus the chat summon occupy the
bottom row, always. See `docs/LAYOUT-DESIGN.md` §D2 for the full state
table this was built against.

### 2.3 Exercise history

`src/lib/exercise-history.ts` derives per-exercise strength trend,
PR history, and full session-by-session history — all computed fresh from
`exercise_set_logs` (the durable, synced table) on each dialog open, not
from a second cache. This is a deliberate contrast with the *live*,
in-session PR badge (`pr-engine.ts`), which does use a localStorage cache
for speed during a workout — that cache's staleness (it never evicted
deleted/undone sets, and chat-logged sets never entered it) was a real bug
found and fixed by making the durable history views read straight from the
database instead of trusting the cache (`768305d "PR cache derived fresh
from exercise_set_logs, retiring the localStorage cache"`).
`ExerciseHistoryDialog.tsx` / `SessionHistoryDialog.tsx` /
`ExerciseStrengthChart.tsx` (a hand-rolled SVG chart, no charting library)
are the UI; reachable from both the day view's exercise `⋯` menu and the
program-browse view, so both paths render identically off the same data.

### 2.4 Meals — food-db, diet rules, portion scaler, pools

This is the most heavily-verified subsystem, because it's where "the AI
proposes, code computes" (§3) is most load-bearing — an AI making up
calorie numbers is a real-world harm surface.

- **`src/lib/food-db.ts`** — a curated table (~280 entries) of per-100g
  macros for common ingredients, sourced from USDA/UK composition tables.
  `lookupIngredient` does alias- and fuzzy-tolerant matching (exact →
  word-sequence → token-overlap → conservative depluralisation retry) and
  returns `null` on a genuine miss — callers must never guess a
  nutritional profile for something unresolved (diet-rules fails *closed*
  on an unmatched ingredient: treated as violating every restriction,
  never assumed safe). `normalize()` also now decomposes accented
  characters correctly (fixed 2026-08-09 — it was silently mangling
  "crème fraîche" into unmatchable tokens).
- **`src/lib/diet-rules.ts`** — code-enforced dietary safety
  (vegetarian/vegan/halal/kosher/gluten-free/etc.), reading the tags
  `food-db` entries carry. This is the actual gate; the AI generation
  prompt's own dietary guidance (in the edge function, see below) is a
  *nicety* that reduces how often the real gate has to reject a proposal —
  never the safety boundary itself.
- **`src/lib/portion-scaler.ts`** — scales a proposed ingredient list to
  hit a target's calories, rejecting (not forcing) a proposal that would
  need an absurd scale factor (>2.5x or <0.4x — "a 3kg chicken breast" is
  a sign the proposal was wrong, not a scaling target).
- **`src/lib/meal-generation.ts`** — the pool builder.
  `supabase/functions/generate-meals` (an edge function) proposes named,
  quantified dishes; `generateMealPools` runs every proposal through the
  full verification pipeline (parse → resolve against food-db → diet-rules
  → scale → re-verify) and only accepted options enter a slot's pool.
  `assembleDay` then picks one option per slot to best match the day's
  full macro targets (not just calories) — see the macro-accuracy work
  below for how this scoring was fixed on 2026-08-09.
- **Meals are a pool model, not a fixed weekly schedule.** `meal_plan_slots`
  holds ~5 options per slot (breakfast/lunch/dinner/snack), day-agnostic by
  design — any option is valid for its slot on any day. `assembleDay`
  picks today's combination fresh each render from the live pool + live
  targets, so a new weigh-in or a regenerate can never leave a stale
  assembled day on screen.
- **Macro accuracy (2026-08-09, commit `ffd1b4b`).** Day-level protein was
  landing up to ~2x target while calories looked fine — `assembleDay`'s old
  scoring only penalised a protein *shortfall*, never rewarding hitting the
  target or penalising overshoot, and the generation prompt separately
  told the model to *maximise* protein density. Both are fixed: the prompt
  now frames all three macros (not just calories) as targets to land on,
  and `assembleDay` scores symmetrically across calories/protein/carbs/fat
  with real two-sided tolerance bands (protein −5%/+15%, was floor-only).
  Verified via live harness samples: overshoot dropped from ~1.4–2.0x to
  ~1.17–1.28x, at the cost of a modest (~10%) dip in average pool fill —
  the honest flip side of no longer padding every proposal with excess
  protein.
- **User-adjustable macro split (2026-08-09, commit `887927e`).** The
  Nutrition tab has a Macro Split control — protein-per-kg (1.6–2.4,
  default 2.0) and fat% (20–35%, default 25%), carbs always the remainder
  — with presets (Balanced/Higher protein/Lower carb/Higher carb/Custom)
  and two hard rails (carbs never below 50g, fat never below 0.6g/kg) that
  clamp and say so rather than silently ignoring the input. It flows
  through the single `computeTargets` entry point (§2.5), so every
  consuming surface reflects it automatically. Deliberately does **not**
  apply to Dynamic CSCS mode or the conditioning goal (each has its own
  established formula) and deliberately does **not** offer a keto preset —
  see `computeMacroSplitTargets`'s doc comment in `macro-calculator.ts` for
  what a real keto implementation would need (inverted derivation: carbs
  as a hard cap, fat as the remainder, protein moderated — this app has
  neither that logic nor the food-db coverage for it yet). Chat is told
  explicitly to say so if asked for a keto plan, not to produce one and
  call it keto.

### 2.5 Nutrition targets

`src/lib/nutrition-targets.ts`'s `computeTargets(profile, opts)` is the
**one** way anything in the app gets macro targets — "living targets":
computed fresh on every read from the profile plus the latest weigh-in
(never a value frozen once at onboarding and never updated). Every
consuming surface (Dashboard rings, the Nutrition tab, meal generation, the
chat's system-prompt context) calls this same function, so a new weigh-in
or a macro-split edit updates every number at once with no per-surface
wiring needed. `macro-calculator.ts` holds the actual BMR→TDEE→goal-
adjustment→macro-split math and `getMacroDerivation` for the "how your
targets are set" explainer panel. Two calculation modes exist
(`STANDARD_STATIC` — same macros every day, the default; `DYNAMIC_CSCS` —
carb-cycles by training-day intensity), user-selectable on the Nutrition
tab.

### 2.6 Chat action framework

The system that makes "chat never lies about what it did" true structurally
rather than by asking the model nicely — this is the direct answer to the
incident `VISION-ARCHITECTURE.md` opens with. Full design in that
document's §2; what's actually built:

- **`pending_actions`** table + `src/lib/pending-actions-store.ts` — every
  plan-changing chat proposal (swap, ban, adaptation, target override,
  etc.) creates a row here first. Nothing writes to a plan table until the
  user taps Confirm on a rendered `<ProposalCard>` (`src/components/chat/
  ProposalCard.tsx`) showing exactly what will change (a generic
  before/after diff renderer, not per-domain card components). Confirmed
  actions execute through `src/lib/pending-action-executor.ts`, which
  routes to the same edit-layer functions the UI's own swap/ban dialogs
  call (§3.2) — never a parallel write path.
- **`src/lib/imperative-classifier.ts`** — a deterministic (non-LLM) check
  that a proposed mutation's justifying quote is actually an imperative
  statement from the user this turn, not an observation ("I didn't train
  today" is not a command to change the schedule). Fails the check ⇒ the
  tool call downgrades to a soft suggestion chip instead of a confirmable
  proposal.
- **Immediate vs. proposing, by blast radius.** Append-only observations
  (logging a set, a meal, a weigh-in) write immediately and offer Undo —
  no confirm step, because nothing is destroyed. Anything that changes a
  parameter of what will be prescribed (a swap, a ban, a target override,
  a regeneration) is propose-and-confirm. `propose_exercise_ban` is
  explicitly the highest-blast-radius mutation (touches every week of
  every remaining block) and is never immediate.
- **`src/lib/set-parse.ts`** + **natural-language logging.** The model
  segments a message into which text span names which exercise; a pure
  parser owns every number ("6x8 @100kg", "bench 100 for 5,5,4", etc.) —
  the model never emits a number that reaches the database. An
  unresolvable/ambiguous exercise name asks a clarifying question rather
  than guessing.
- **Injury and equipment/travel adaptation** (`src/lib/plan-adaptations.ts`
  + `-store.ts`) — a time-bounded substitution mechanism: "my shoulder
  hurts, ease off for a week" or "I'm travelling, hotel gym only for 5
  days" proposes exercise substitutions for the stated period, stored with
  a pre-image, and auto-reverts on expiry (checked lazily on plan load —
  there's no scheduled-job infrastructure in this codebase, so every
  time-based expiry in the app is a check-on-read, not a cron job).

### 2.7 Memory and goals

`user_facts` (+ per-kind satellite rows), `user_goals`,
`user_context_facts` — structured, typed facts extracted from chat or
entered manually (dietary preferences, exercise dislikes, timing rules,
hard constraints, goals, tone/context). The governing rule, stated verbatim
in `VISION-ARCHITECTURE.md` §1.0 and true in the shipped code: **memory is
a compiler, not a mutator.** `src/lib/fact-compiler.ts` reads active facts
and emits the same plain arguments the pure generators already accepted
before memory existed (an `exclusions: string[]` array, a diet-rule set,
timing predicates) — no generator was taught to read memory directly, and
no memory row is ever written by a generator. This is what makes memory
structurally incapable of bypassing the edit layers.

Hard exclusions (food dislikes, exercise bans) are enforced; soft
preferences bias ranking only and are architecturally barred from ever
reaching an exclusion list. The merged **Profile** screen
(`src/components/ProfileScreen.tsx` — formerly two screens, "Profile" and
"Memory," merged 2026-08 because they answered the same underlying
question) is the one place to see and edit everything the app knows about
you: identity/metrics, training setup, injuries, dietary/cooking
preferences, goals, facts, and tone — each row shows its source and can be
edited or deleted.

### 2.8 Grocery

`src/lib/grocery-store.ts` + `grocery_items`/`grocery_lists` — generates a
shopping list from the *assembled* days across a chosen horizon (3/7/14
days), not the whole pool (only ~1 of ~5 pool options per slot is actually
being eaten on a given day). Aggregates by ingredient across meals to one
row per item with provenance (`sources` — which meals contributed),
converts to shopping-friendly units for a curated set of items (e.g. "2
heads" broccoli, "~1.5kg" chicken) while keeping the exact gram figure
available. Manual add/edit/delete is preserved across a regenerate — an
earlier version silently resurrected deleted items and clobbered edits on
every regenerate; fixed. Lives in the **Tools** tab alongside the
standalone Timers (Turn 12's tab reorganisation, §2.9).

### 2.9 Dashboard

`src/lib/dashboard-data.ts` aggregates from existing sources only — the
Dashboard owns no number of its own (`VISION-ARCHITECTURE.md` §5.1's
"read-only by construction" rule). Streak (`src/lib/streak.ts`), coach tips
(`src/lib/coach-tips.ts` — a deterministic rule engine, never
AI-generated), today's calorie/protein/carb/fat rings (four-ring SVG
meter), weight trend, and a weigh-in card all derive from
`workout_sessions`, `exercise_set_logs`, `meal_events`, `daily_metrics`,
and `computeTargets` — nothing here is computed a second way.

### 2.10 Design system and theming

Tailwind v4, CSS-first config (`src/index.css`, no `tailwind.config.*`).
Went through several passes: an initial oklch/shadcn default palette →
"Nightshift" (a single dark violet/mint palette, hardcoded) → the
"Density Pass" round, which is the current live system:

- **Four selectable themes** (Nightshift, Ember, Field, Graphite) plus an
  independent **accent-colour override** (5 swatches) layered on top —
  `src/lib/appearance-store.ts` + `src/hooks/useAppearance.tsx`, applied
  via `data-theme`/`data-accent` attributes on `<html>`, set synchronously
  pre-mount in `main.tsx` so there's no flash of the wrong theme. Both
  apply instantly everywhere with no reload — one glow-intensity variable
  and a token swap, no separate light/dark component trees.
  `ProfileScreen.tsx`'s Appearance section is the settings UI.
- **Borderless surfaces, separation by fill/spacing/glow** — the
  once-standard `Card` border was removed app-wide in favour of raised
  fill + whitespace + glow halos; a thin hairline divider survives only
  for row-to-row list separation.
- **A density pass** on the Exercise-today screen specifically: a merged
  header (week strip + context line collapsed into `WeekContextRow`), a
  set-completion dot ladder replacing per-row load numbers on collapsed
  rows, a 54px hero weight number on the focused/expanded lift, provenance
  shown once (inside the focused row only, not on every collapsed row).
- **Chat reveal speed** is user-configurable (off/slow/normal/fast) — the
  assistant's replies type out with a typewriter effect by default,
  independently adjustable from theme.

### 2.11 Four-tab layout

`src/lib/app-route.ts` defines the tab set:
`'dashboard' | 'nutrition' | 'exercise' | 'tools' | 'chat'`, hash-routed
(`#/tab/{name}`) so deep links and back-button work. `BottomTabBar.tsx`
renders four flat tab buttons (Dashboard/Nutrition/Exercise/Tools) plus a
raised, always-mint, center **Chat** button — chat is reachable from
everywhere as both a persistent tab and (per the original design intent)
conceptually an overlay, though it currently ships as a tab.

This is "Turn 12" of the design work, and it's the point at which the old
five-tab layout (which had a separate Meals tab) collapsed to four:
**Meals was retired** — meal list, weigh-in, and the macro derivation strip
moved into Nutrition (nutrition target numbers and what you're eating
belong together — "one owner per fact," §3); Grocery and the standalone
Timers moved into a new **Tools** tab. Dashboard is the landing tab for a
returning user; a first-launch user with no profile sees onboarding
full-screen, no tab bar, until enough answers exist to generate a plan.

---

## 3. Architectural principles — and why

These aren't style preferences; each one exists because its absence caused
a real, documented failure. Know them before proposing a design that
crosses one.

**Append-only acts immediately with undo; plan mutations propose-and-
confirm.** The dividing line is blast radius, not "is this from chat or
the UI": does the action record something that *happened* (log a set, a
meal, a weigh-in — write it now, offer 10 minutes of Undo, no confirm
step) or change a *parameter of what will be prescribed* (swap, ban,
target override, regeneration — nothing writes until the user taps Confirm
on a card showing the actual diff)? Get this classification wrong in
either direction and you either add unnecessary friction to something
harmless, or let an AI silently mutate a training plan — which is the
exact incident this whole framework exists to prevent.

**One edit layer per domain, shared by chat and UI.** `set-log-store.ts`
for logged sets, `mesocycle-edit.ts` (+ `mesocycle-persistence.ts`) for
plan mutations, `meal-store.ts` for meal picks/swaps, `memory-store.ts` for
facts/goals, `grocery-store.ts` for the shopping list. **No exceptions** —
a chat tool and a UI button that both swap an exercise call the exact same
`swapExerciseInMesocycle`, never two implementations that could drift.
`test:no-forked-state` mechanically enforces the logging instance of this
rule; the others are enforced by there being nowhere else sensible to
write.

**Code owns every number; the AI proposes, never computes.** The clearest
statement of this is the meal pipeline (§2.4): the AI names a dish and its
ingredients; `food-db.ts` computes the real macros from those ingredients;
the AI's own claimed calorie count is never read. The same shape governs
workout logging (the model segments text into exercise spans; `set-parse.ts`
parses every quantity) and load prescription (the model never sees or sets
a kg number — the load-prescription engine does). If you find yourself
about to have the model return a number that reaches a database write,
stop — that number needs a deterministic computation behind it instead.

**Memory is structured data consumed by generators, never a mutator.**
Facts compile down to the same plain parameters (`exclusions: string[]`,
diet-rule sets, timing predicates) the generators accepted before memory
existed. No generator was taught a memory-aware code path; no fact row is
ever written by a generator. This is a hard rail, not a convention — it's
what makes "memory can never write plan state" true by construction rather
than by discipline.

**Specific-or-silent.** State a concrete fact grounded in real data, or say
nothing — never a vague, unverifiable, or possibly-wrong generic claim. In
practice: a swap proposal names an exact scope ("Today only" / "Rest of
block" — never "permanent," because no scope in this codebase actually is);
a receipt states exactly what landed and what didn't on partial failure,
never a blanket "done"; chat's conversation opener references something
real about today's plan or history, or defaults to a plain greeting,
never a fabricated "how did yesterday's session go" for a user who never
trained yesterday (this exact failure mode was found live and is tracked
as a known-issue class in §5).

**One owner per fact.** Every piece of information the app shows has
exactly one screen/component responsible for it — not duplicated across
surfaces that can drift out of sync with each other. This is the stated
reasoning behind retiring the Meals tab into Nutrition (§2.11), merging
Memory into Profile (§2.7), and deleting `IdentityLine.tsx` once
`WeekContextRow` subsumed its content (§2.10) — and it's the direct
diagnosis behind bugs like "the streak number is shown twice and can say
different things" or "Dashboard and the Exercise tab disagree about
whether today is a rest day" (§5): those are symptoms of two owners for
one fact, not independent bugs to patch individually.

---

## 4. Standing gates

Run via `npm run test:<name>`. All are hand-rolled `check()`/numbered-block
scripts (`tsx scripts/*.ts`), not a test framework — this codebase has no
Jest/Vitest; every gate is a small, readable, self-contained script. `tsc
-b` (strict, no emit) is run alongside these on every change as the
zeroth gate.

**Standing sweep** — routinely run together after any change that touches
shared logic, roughly in this order (cheapest/most-specific first, most
expensive/safety-critical last):

| Gate | Protects |
|---|---|
| `test:logging-roundtrip` | Set-log read/write fidelity, ramp read-order, natural-key upsert behaviour |
| `test:meal-roundtrip` | Meal-event log/undo round-trip, ledger sum correctness |
| `test:macro-split` | Macro-split preset resolution, both rail clamps forced at the extremes, a regression guard proving the default split reproduces the old hardcoded formula bit-for-bit |
| `test:injury-separation` | `injuries` and `exercise_exclusions` stay genuinely separate columns/write paths (the exact conflation the vision doc's defect #2 describes) |
| `test:ramp-visibility` | Ramp-up set data renders for every heavy compound at every experience/week combination — safety-critical, never silently empty |
| `test:session-derive` | Pure session-lifecycle math: summary computation, PR snapshot diffing, staleness detection, superset grouping |
| `test:no-forked-state` | Grep-enforced: `saveSet` has exactly one call site outside its own store — the single-write-path guarantee |
| `test:pending-actions` | The propose→confirm state machine, idempotent claim/resolve, immediate-tool no-model-round-trip resolution |
| `test:memory` | Imperative-vs-observation classification for fact/goal writes |
| `test:grocery` | Item merge/dedup, manual-edit preservation across regenerate |
| `test:dashboard` | Streak/goal-progress derivation edge cases (duplicate same-day weigh-ins, off-track detection) |
| `test:timers` | Deadline-anchored math: reload-equivalence, backgrounded-transition correctness, cue-firing-once-not-a-burst |
| `test:cardio-log` | Optimistic-write/undo-keep/undo-idempotency for the cardio log queue |
| `test:exercise-history` | Session grouping, PR-moment derivation, trend-point gating |
| `test:plan-adaptations-separation` | An injury/equipment adaptation never touches `fitness_profiles.injuries` or writes a stray `user_facts` row |
| `test:injury-adaptation-safety` | No substituted exercise in an adapted week ever loads the flagged joint, across every mapped injury code |

**Run less routinely, but part of the full sweep before a significant
merge:**

- `test:audit` (`run-constraint-audit.ts`) — generates plans across a wide
  grid of profile combinations and checks structural constraints (pattern
  coverage, session duration budget, block-transition sanity). **Not
  deterministic run-to-run on unchanged code** — `exercise-plan.ts` uses
  `Math.random()` for exercise variety by design ("a real user's plan
  should vary run to run"), so the exact failure count and content shifts
  slightly between runs (confirmed 2026-08-09: 41 vs. 44 failures on
  identical code, same failure *category* — `pattern_coverage`).
  Committed `audit-report.txt` is a snapshot for diffing shape, not an
  exact target; regenerate and diff by *category*, not by exact count.
  **Never commit a regenerated report** — `git checkout --` it back after
  running.
- `test:quality` (`run-quality-score.ts`) — scores generated plans against
  quality rubrics (time-fit, structure, progression, selection, goal
  alignment) across a large combination grid. Has one long-accepted
  baseline gap: the `timeFit` dimension sits below its 1.2 floor
  (`~0.71–0.74/2.0`) — a known, not-yet-fixed scoring/generation mismatch,
  not a regression to chase on every run. Same non-determinism caveat as
  `test:audit`. Same discard-the-regenerated-report rule.
- `test:meal-quality` (`run-meal-quality.ts`) — **the one gate that makes
  real network calls** (hits the real deployed `generate-meals` edge
  function and writes/deletes throwaway `fitness_profiles` rows against
  the live database). Grades pool fill, dietary safety, macro-drift, and
  (as of 2026-08-09) carb/fat divergence across a small profile grid.
  Expect real run-to-run variance since it's driven by a temperature-1.0
  LLM — treat one run's numbers as one sample, not ground truth; if
  chasing a regression, run it 2–3 times before concluding anything moved.
  Discard `meal-quality-report.txt` after — it was never committed.
- `test:workout` / `test:mesocycle-roundtrip` — early, narrower gates
  (plan-generation sanity across a small fixed profile set; JSON
  round-trip fidelity for the `mesocycle_weeks` persistence shape). Cheap,
  rarely fail, not usually the interesting signal.

**Not gates — manual/diagnostic tools, run on demand, never part of a
sweep:**

- `test:differentiation` (`run-differentiation-audit.ts`) — read-only:
  holding every other input fixed, does changing *one* profile field
  actually change the generated plan? Answers "is the generator actually
  differentiated" as opposed to "is it broken."
- `test:llm-review` (`run-llm-review.ts`) — sends a rendered plan to an LLM
  and asks it to critique it the way a strength coach would. A different
  kind of scrutiny than the rule-based `test:quality` (catches "technically
  compliant, no coach would actually program it this way").

**After any full sweep:** `git status` and revert any regenerated
report/build artifact (`audit-report.txt`, `quality-report.txt`,
`tsconfig.tsbuildinfo`) with `git checkout --` before committing —
established practice is to never commit these; they're diagnostic
snapshots, not source.

---

## 5. Known issues and deferred work

### 5.1 Explicitly deferred (by design, documented in code)

- **Editing a profile field in Profile does not recompute plan/macros.**
  Stated directly in `ProfileScreen.tsx`'s own code comment: this screen
  corrects/maintains stored data; live target/plan recalculation off an
  arbitrary field edit is a separate, unbuilt feature. The only way to
  regenerate a plan today is the destructive "New Plan" reset (which now
  at least confirms and names what's lost — §5.2).
- **No plan regeneration engine exists** (`VISION-ARCHITECTURE.md`'s
  Phase D). A memory fact or profile edit that *should* change the plan
  currently either does nothing (profile edits) or requires a full
  destructive reset. The vision doc flags the specific trap in building
  this: `generateMesocycle` always emits from week 1 with no carry-forward
  of already-verified loads — regenerating "from block 3" without adding
  `{startAtWeek, carryForwardLoads}` to the generator's signature would
  silently revert every logged lift toward first-block guesses.
- **Fitness goal cannot be viewed or changed anywhere in Profile.** The
  single most consequential setting has no editor.
- **Keto/genuine low-carb targets are not supported** — documented and
  intentional (§2.4). Chat is instructed to say so rather than produce a
  mislabelled plan.
- **No scheduled-job infrastructure.** Every time-based expiry in the app
  (pending-action expiry, plan-adaptation revert) is a lazy check-on-read,
  not a cron job — this was a deliberate scope decision (`VISION-
  ARCHITECTURE.md` §7.4), not an oversight, but it means anything that
  needs to fire *without* the app being opened (e.g. "notify me when this
  expires") is out of reach until this is built.
- **Single-user, no auth.** Every table's RLS is `USING (true)`; identity
  lives in `localStorage` only. Fine for one person on one device; a hard
  blocker before a second user or a second device is a supported scenario.

### 5.2 Fixed since the last full UX sweep (2026-08-08) — do not re-report these

`ux-sweep-report.md` (root of the repo) is a point-in-time audit from
2026-08-08 that found 13 data-loss/corruption bugs plus dozens of smaller
issues. Cross-referencing its findings against the commit history below —
**most of the Section 0 (data-loss) and Section 1 (top confirmed) findings
are already fixed.** If you're triaging that report, check here first
before spending time reproducing something already closed:

| ux-sweep finding | Fixed by |
|---|---|
| #1 Confirmed meal swaps silently revert on reload | `d69636a` |
| #2 Chat logs sets against a guessed exercise, no undo | `7760ea8` |
| #3 Undo leaves deleted sets visible on other surfaces | `7760ea8` (same commit, `refresh()`/undo wiring) |
| #4 PR cache never evicts deleted sets; chat-logged sets never enter it | `768305d` |
| #5 "New Plan" is a one-tap zero-confirmation wipe | `84c3a7a` |
| #6 Goal/fact/context delete is one-tap, no confirm | `84c3a7a` |
| #9 A failed meal regenerate blanks the existing plan | `dafe19b` |
| #10 Grocery regenerate resurrects deleted items / clobbers edits | `d9657b0` |
| #11 Profile/memory field saves are fire-and-forget | `cee7a1b` |
| #12 Cardio "Log" button has no undo | `073272b` |
| #13 Offline chat errors impersonate a real reply | `b95070c` |
| 1a Chat composer doesn't stay fixed to viewport | `172c69d` |
| 1b Food dislike doesn't check today's plan for a conflict | `62ccf3b` |
| 1c Onboarding weight never reaches dashboard/goals/chat | `09603aa` (+ a later cross-profile leak fix, `e3129af`) |
| 4.3 Meal swap options duplicate / count lies | `52fc2fa` |
| 4.5–4.8 Internal tag leaks, false "on the number" claim, meat/fish miscategorisation, water as a grocery item | `12416e2` |
| No way to log a meal as eaten anywhere in the app | `b6e4e32` (Turn 7) |
| Meal swap UI buried / non-interactive label | Turn 7 (`b6e4e32`) redesign |
| A logged bodyweight/`0`-weight set could vanish/misrecord silently | `72c917d` |
| Chat confirmation-card stuck-loop; memory-save confirmation loop | commits around `1e0bbf4`, `192`–`193` in the task history |

### 5.3 From the sweep, not confirmed fixed — reconfirm before acting

These did **not** have an obvious matching fix commit as of 2026-08-09.
Treat as "possibly still open" — verify against current code before
reporting or fixing, don't assume either way:

- Several chat robustness issues: confirm-on-an-expired-proposal is a
  silent no-op forever; a bare "ok"/"yes" can be hijacked by any old
  unresolved proposal with no recency check; `pending_actions`
  preconditions are effectively unchecked; reload strips proposal
  cards/receipts from restored history inconsistently; retry buttons with
  mismatched behaviour/copy.
- Session-lifecycle rough edges not obviously addressed by the SL-series
  work: "Finish" reachable only by scrolling to the top of a long exercise
  list; re-tapping Start after Finish produces distorted duration/volume
  stats.
- Dashboard/Exercise-tab disagreement about "is today a rest day" (two
  independent day-type derivations); streak or PR shown twice on one
  screen; a brand-new mid-week profile shown "missed" days before the plan
  existed; a plan that fails to restore is visually indistinguishable from
  a genuine rest day.
- Free-text profile tag fields (injuries, dietary preferences, cuisines,
  dislikes — still `EditableTagList` free-text entry in `ProfileScreen.tsx`
  as of 2026-08-09) can be typed in a form the enforcement code doesn't
  match against, with no feedback that the entry didn't take.
- Editing a memory fact only rewrites its display label, not its resolved
  target — the card can end up showing text that contradicts what it
  actually filters.
- Chat's natural-language-log exercise matching and grocery answers may
  still read a stale/frozen snapshot of the plan rather than the live one
  after a same-session swap or adaptation.

A fresh, current-code UX sweep would be the right way to convert this list
into confirmed-open vs. actually-fixed — this log doesn't replace that
verification, it just saves you from re-discovering the ~20 items already
closed above.

### 5.4 The four orphaned QA profiles

Four test profiles from earlier QA rounds exist in the **live** Supabase
project (`sdkhuczcfnqqimdgfiks`) and have not been deleted, per the
standing rule that test-data cleanup never uses a raw `DELETE` against the
live project without the exact rows being named and confirmed first (§7).
They carry realistic multi-week history (used deliberately to test
Session History, PRs, adaptations, etc.) and are awaiting an explicit
cleanup decision:

| Label | Profile ID | Persona |
|---|---|---|
| QA-Bella | `be988f97-64aa-4a0e-9f47-9fd3f0aa7761` | — |
| QA-Min | `e710a4d0-7fb7-458c-be77-c1bc5a0b3ceb` | — |
| QA-Max | `5d5c7c4b-c206-4ffa-a4d1-c68b678468be` | — |
| QA-Idris | `cef212ae-df45-4641-a757-15653632bb94` | Functional/halal/injuries persona — still has a real chat history and an active injury-adaptation proposal as of 2026-08-09; was used again for the macro-split browser verification this same day. |

Do not delete these without asking — some carry state actively useful for
re-verifying future changes (QA-Idris in particular).

---

## 6. Current roadmap — what's next and why

There is no single committed backlog file; priorities have been driven
turn-by-turn by direct user requests plus whatever a live UX sweep or QA
round surfaces. Reading the trajectory of the last ~30 commits, the shape
has been: ship a subsystem → density/visual pass over it → live QA sweep
against real personas → fix what the sweep found → repeat. The two most
recent substantive commits (`ffd1b4b`, `887927e`, 2026-08-09) closed out
meal macro-accuracy, which was the most-repeated finding across two QA
sweep rounds.

**What's genuinely next, in likely priority order, based on what's flagged
but not yet built:**

1. **Reconcile §5.3** — a fresh, current-code UX sweep to convert
   "possibly still open" into a real fixed/open list, since a meaningful
   fraction of the 2026-08-08 report is now stale.
2. **Plan regeneration (Vision Phase D)** — the single largest missing
   piece of the original vision. Blocks: profile edits actually affecting
   the plan, memory facts that "aren't yet applied" becoming real, and
   retroactive feature-unlock ("meals are unlocked now — want me to build
   this week's?") being honest rather than aspirational copy.
3. **Fitness-goal editability in Profile** — currently the most
   consequential setting with no editor anywhere.
4. **Chat robustness** (§5.3's chat items) — expired-proposal handling,
   precondition checking, stale-snapshot reads in NL logging and grocery
   answers. These are trust-surface bugs (the app appearing to act on
   stale/wrong context), which is the exact class of harm the whole
   pending-actions architecture was built to prevent elsewhere.
5. **Auth / multi-device** — explicitly deferred, but is the actual blocker
   before this app can be anyone's product beyond a single local device.

If you're picking up fresh work with no specific request from the user,
start by re-running the standing gate sweep (§4) to confirm the baseline
is green, then either continue from this list or ask.

---

## 7. How to work on it

### 7.1 The two Supabase projects — read this before touching `.env*`

Both `.env` and `.env.local` exist. **`.env.local` (project ref
`sdkhuczcfnqqimdgfiks`) is the live, CLI-linked project** — `npx supabase
db push` and `npx supabase functions deploy` target it. `.env` points at
an older project. Vite's env precedence means `.env.local` wins at dev/
build time, but don't assume — if a command seems to hit the wrong
project, check which file actually supplied the URL.

### 7.2 Migrations

Plain numbered SQL files in `supabase/migrations/`
(`YYYYMMDDHHMMSS_description.sql`), 39 as of 2026-08-09. Write one, then:

```bash
npx supabase db push
```

against the linked project. No local Postgres/Docker is used in this
workflow (Docker isn't running in this environment, and pushing directly
to the linked live project is the established pattern here — confirmed
low-risk because every migration in this history has been additive:
`ADD COLUMN IF NOT EXISTS`, new tables, never a destructive `ALTER`/`DROP`
against existing data).

### 7.3 Edge functions

`supabase/functions/{chat-gemini,generate-meals,macro-calibration}` —
Deno, deployed independently of the frontend build:

```bash
npx supabase functions deploy <function-name>
```

Docker-not-running produces a harmless warning; the deploy still succeeds
(asset upload, not a local build). **A local edit to an edge function has
zero effect on the live app until deployed** — this matters when you're
about to run `test:meal-quality` or manually verify chat behaviour after
touching the prompt in `chat-gemini/index.ts` or `generate-meals/index.ts`.

### 7.4 Deploying the frontend

```bash
git push origin main
vercel --prod
```

Both have been run together at the end of nearly every substantive round
in this project's history — treat "ship it" as meaning both, not just the
git push.

### 7.5 Conventions this repo has enforced consistently

- **Commit per logical part**, not one giant commit for a multi-part
  request. When a user's ask has an explicit "Part 1 / Part 2" shape,
  that's two commits, gates green after each, in the order given.
- **Run the standing gate sweep (§4) after every change that touches
  shared logic** — not just the gate that seems most related; cross-domain
  regressions are how several of the bugs in §5 originally happened.
- **Browser-verify UI changes in a fresh tab**, not a reused/long-lived
  one — this codebase has hit a real React hooks-order crash from
  hot-patching a years-old live browser instance mid-session. Verify at
  375×812 (phone-first is the actual target device shape).
- **Never run a raw `DELETE`, `DROP`, or `TRUNCATE` against the live
  Supabase project.** Test-data cleanup goes through the app's own delete
  paths, or is proposed with the exact rows named before running. Never
  guess a table name. This rule has held for the entirety of this
  project's QA history (§5.4's orphaned profiles exist *because* of this
  rule, not despite it — cleanup was correctly deferred pending
  confirmation rather than guessed at).
- **Clean up test data you create** during verification (a logged set used
  to test a UI state, a started rest timer, a manually-edited split) —
  revert it back to its prior value or use the app's own delete/undo path,
  every time, before calling a round done.
- **Discard regenerated report/build artifacts** (`audit-report.txt`,
  `quality-report.txt`, `meal-quality-report.txt`, `tsconfig.tsbuildinfo`)
  before committing — `git checkout --` them, or delete the untracked ones.
  None of these are meant to be committed as part of a feature change.
- **Read a file's own header comment before assuming its contract.** This
  codebase leans hard on self-documentation — nearly every non-trivial
  file opens with a block explaining its role, what it deliberately does
  *not* do, and what bug its current shape exists to prevent. That comment
  is usually faster and more reliable than re-deriving the reasoning from
  the code alone.
