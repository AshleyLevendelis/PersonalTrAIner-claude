# Add, remove and move one exercise

**Status: plan for Ashley, 11 Sep 2026. Report only. Nothing built — waiting on "build it".**

## Context

Ashley picked this from the must-have audit's MISSING list, 11 Sep 2026 — the
last large gap in CLAUDE.md's "Changing one exercise" block. Three of six
operations exist on neither surface:

- **Add one as part of the plan.** "Additional work" *logs* a name to
  localStorage (`useActiveSession.tsx:639`) and renders it with a hardcoded
  `3 × 8-12 @ 60s` (`AdditionalWorkSection.tsx:76-79`). Its own header says
  "nothing here touches the mesocycle" (`AddUnplannedWork.tsx:8-15`). No
  prescription, no weight, invisible to the program view.
- **Remove one from a single session.** The only way to make an exercise go
  away is `ban_exercise`, which rewrites every week of every block
  (`mesocycle-edit.ts:353-381`). There is no "not today".
- **Move one earlier or later.** No reordering at all.

**Ashley's ruling, 11 Sep 2026 — the gap a removal leaves.** Asked with three
options: (A) shorten the session and be honest about the time; (B) fill the gap
automatically; (C) ask each time. She chose **(C)**, over my recommendation of
(A) whose cost I had stated in the option. So **Remove** is one entry point with
two outcomes — *drop it* (session shortens) or *put something else there* (the
existing swap list). Useful side effect: swapping becomes discoverable from it.

**Why this is harder than the day-verbs just shipped.** Those marked a DAY and
touched no plan. These edit the plan, straight into the audit's other open
finding: *"a single swap and the volume toggle re-run NONE of the balance,
coherence or hierarchy passes"* (CLAUDE.md, UNGUARDED).

## The constraint that shapes the whole design

Measured: of the passes a single add/remove can break, **some are reusable from
outside `generateMesocycle` and some are locked inside it.**

| Reusable today | Locked inside generation |
|---|---|
| `enforceLoadCoherence` (`exercise-plan.ts:3043`, exported) | `enforceSetHierarchy` (`:2799`, **private — one word from exported**) |
| `enforceOneWeightPerPrescription` (`:3151`, exported *"for its direction to be pinned"*) | `enforceWeeklyPatternBalance` (`:3763`) — the only push:pull / chest:back enforcer |
| `getRoleSetFloor` / `getRoleSetCeiling` / `clampToVolumeRole` (`:2767-2786`) | `balanceWeeklyStructure` (`:3261`) — six-pattern coverage |
| `sizeBlockToRestBudget` (`:5409`) | `trimWeekRestForBudget` (`:5276`), `enforceDayDurationBudget` (`:4118`) |
| `estimateDaySeconds`, `getSessionMaximumSeconds` (`session-duration.ts`) | `buildSupersetPairs` (`:956`), the tier sort (`:2405-2425`) |
| **`buildWarmup` (`warmup.ts:380`, exported)** and its context is reconstructible from the day | — |

**The precedent to copy:** `volume-adjust.ts` is the one production path that
already mutates a session outside generation. It touches sets only, clamps
through the generator's own `clampToVolumeRole`, and **refuses to add when
`estimateDaySeconds` exceeds the maximum** — with a `blocked` list carrying a
plain reason (`volume-adjust.ts:84-101`). This build extends that shape, it does
not invent one.

**So the rule for this work:** re-assert everything reusable; for what is
locked, *measure the cost read-only and say it on the confirm card* rather than
silently breaking it or refusing. That directly serves the audit's other MISSING
line — "when a request would break the bar, the app says so and offers the
nearest thing that keeps it".

## The build

### 1. `src/lib/session-edit.ts` — new, pure, the choke point

Mirrors `mesocycle-edit.ts` in shape and reuses its `SwapScope`
(`'today' | 'permanent'`, where permanent = **rest of this block**, `:24`,
`:312-318`). Three functions, each returning a new `MesocycleWeek[]` plus a
`blocked`/`notes` list, never throwing:

- **`addExerciseToSession({ mesocycle, profile, weekNumber, dayName, entry, scope })`**
  - Price with the existing `recomputeLoad` (`mesocycle-edit.ts:146`) — history-aware, node-safe dynamic import.
  - Build the row through a new `buildAddedExercise` that mirrors
    `applyReplacement`'s field rules (`:196-256`) but starts from an
    `ExerciseEntry`: sets/reps from the role defaults clamped by
    `clampToVolumeRole`, units via `fixedUnitPrescription`, pattern/tier/fatigue
    re-derived, **no** `superset_label`, `ramp_up`, `selection_note`.
  - **Insert by tier, not at the end.** The engine's own `addExercise`
    (`:3372`) pushes to the end (`:3384`) — which is exactly what the scorer
    penalises as `core_before_main` / `primer_not_first`
    (`quality-score.ts:279-307`). Insert at the position the tier sort
    (`:2405-2425`) would have given it.
  - **Refuse when it does not fit**: `estimateDaySeconds > getSessionMaximumSeconds`,
    in the same try/catch shape as `volume-adjust.ts:94-101`, with the reason in
    words. A time cap is a promise (VISION.md:48).
- **`removeExerciseFromSession({ …, exIndex, scope })`**
  - Refuse below a 3-exercise floor — the same floor `sizeBlockToRestBudget`
    Phase B already keeps (`:5472-5493`).
  - `clearOrphanedSupersetLabels` handles the partner it orphans, including the
    `rest: 'alternate'` repair (`mesocycle-edit.ts:259-272`).
- **`moveExerciseInSession({ …, fromIndex, toIndex })`**
  - Superset partners move as a pair (they must stay adjacent —
    `buildSupersetPairs:1002-1018`, scored as `superset_not_adjacent`).
  - No load or volume change, so nothing to re-price.

**Every one of the three then runs the same tail**, in the order the engine
documents (`:6893-6895`):
`enforceSetHierarchy` → `enforceOneWeightPerPrescription` → `enforceLoadCoherence`
→ `clearOrphanedSupersetLabels` → **rebuild the day's warm-up** via `buildWarmup`
and re-stamp each `ramp_up` (`exercise-plan.ts:4666-4700` shows the context is
reconstructible). That last step closes a gap the *swap* path also has today —
a swap clears its own `ramp_up` but leaves the day-level warm-up pointing at the
old exercise list (`mesocycle-edit.ts:238-243`).

**One-word change to `exercise-plan.ts`:** export `enforceSetHierarchy`. It
already takes `Exercise[]` and returns `Exercise[]`.

### 2. `src/lib/session-balance-cost.ts` — new, read-only

What the locked passes would have said, computed without them: weekly push:pull
and chest:back set ratios before and after the edit, using the same
`movement_pattern` reading the scorer uses (`quality-score.ts:955-1002`). Returns
a sentence or null. Never mutates, never refuses — it is the app *saying so*.

### 3. The screen

- `ExerciseRow`'s "⋮" menu (`ExerciseRow.tsx:272-300`, three items today) gains
  **Remove from this session**, **Move up**, **Move down**.
- **Remove** opens a two-way sheet, per her ruling: *Drop it* · *Put something
  else there* (→ the existing `SwapDialog`, already mounted) · Cancel. Scope
  buttons match SwapDialog's copy exactly: "Today only" / "Rest of block".
- **+ Add an exercise** at the foot of the exercise list, beside — not replacing
  — "+ Add unplanned work". They are different acts and the copy must say so:
  one plans, one logs. Picker reuses `searchExerciseCatalog` and shows
  `getExerciseCompatibilityWarnings` inline, exactly as SwapDialog does
  (`SwapDialog.tsx:74-79`, `:198`).
- Any balance cost from §2 shows on the confirm step before the tap.

### 4. The coach — all three, both surfaces

**Ashley's ruling, 11 Sep 2026:** reordering is available by asking too, not
screen-only. Offered as (a) screen-only with a written reason — my
recommendation, since dragging is a touch job; (b) both surfaces; (c) don't
build reordering yet. She chose **(b)**. So parity stays absolute here and this
build creates no exceptions-list entry.

Three tools, all on the same rail as `propose_exercise_swap`: server returns raw
args only (`index.ts:3106-3130`), the client resolves against the live plan via
`resolveSwapTarget` (`swap-target.ts`, which already handles "Squats" vs
"Barbell Squats" and "Tue" vs "Tuesday"), builds the diff, confirms, and undoes
from a `pre_image` — all three joining `kindsRequiringPreImage`
(`pending-actions-store.ts:109`).

- **`propose_exercise_add`** and **`propose_exercise_remove`** — names already
  reserved in `docs/VISION-ARCHITECTURE.md:169`. Add's card needs its own lead
  sentence, for the reason the meal-add already does (`ChatAssistant.tsx:1657`):
  the default headline reads as a replacement.
- **`propose_exercise_reorder`** — a new name, not in the reserved list.
  **Parameters avoid counting**: `item` plus `before_item` *or* `after_item`,
  never "move it two up" — so both ends resolve through the same name resolver
  the swap already trusts, and "do the rows before the bench press" lands
  exactly. A relative-position request the model cannot pin to a named
  neighbour is refused in words rather than guessed at.

## A correction I owe, found while mapping

CLAUDE.md line 61 says banning an exercise works on **both** surfaces. It does
not. The coach's `ban_exercise` is an honest decline — *"NOT WIRED UP YET…
point the user at the ban button"* (`index.ts:598`, handler `:3087-3104`). I
wrote that line yesterday by reading the tool list and not the handlers: the
exact "a written finding is a lead, not a fact" error, made while writing the
contract that states the rule. Ban is `screen only`, the screen-only count is 8
not 7, and **no gate distinguishes a live coach tool from a declining stub** —
`test:coach-promises` knows the concept (`:266`) but only applies it to chips.
To be corrected in CLAUDE.md and recorded in BACKLOG as part of this work.

## Slicing

Two shippable halves, in this order:

- **Slice 1 — remove and move**, both surfaces. No pricing, no placement maths.
  Closes two of the three gaps and delivers the remove-or-swap choice she asked
  for. Coach tools: `propose_exercise_remove`, `propose_exercise_reorder`.
- **Slice 2 — add**, both surfaces. Pricing, tier placement, the time-cap
  refusal, the balance-cost sentence, `propose_exercise_add`.

**Each slice needs its own `chat-gemini` deploy** — the coach tools ship with
their slice, so the screen and the chat never disagree about what exists.

## Verification

New `test:session-edit` and `verify:session-edit`, every check mutation-tested,
plus the existing gates these touch: `slot-replacement-hygiene`,
`week-load-consistency`, `muscle-balance`, `session-length`, `session-shortfall`,
`block-rest-sizing`, `one-day-one-look`, `coach-promises`, `chat-actions`.

The properties to pin, as properties:
- an added exercise lands where the tier sort would have put it, **not** at the end;
- an add that would break the time cap is refused with a reason, and nothing is written;
- after any of the three, the day still satisfies set hierarchy, one-weight-per-prescription and load coherence — asserted by calling those functions on the result, not by reading the source;
- the day's warm-up matches the day's exercises afterwards (the gap the swap path leaves);
- a removed superset partner leaves no dangling label and no `rest: 'alternate'`;
- a session cannot be emptied below the floor;
- a balance cost is *reported* and never silently applied;
- outside the edit path, nothing changed — the generator's own output is byte-identical.

Browser at 390×844: the menu items, the remove-or-swap choice, add-by-search
with a compatibility warning, an add refused for time, and the order visibly
changing — screenshots read. `test:quality` and `test:audit` before any merge,
since the generator file is touched.

## Costs

Frontend, plus **one `chat-gemini` deploy per slice** (two in total) for the
three new tools. No migration. Merging to `main` needs her word.

## Named, not folded in

- The **`load_source` leak**: `applyReplacement` never writes it, and because it
  spreads `...slot` a swapped exercise keeps the *outgoing* one's provenance,
  while the generation-time twin (`exercise-plan.ts:3243`) does set it. Small,
  real, not covered by `slot-replacement-hygiene`. Fix separately.
- **No gate distinguishes a live coach tool from a declining stub** — the hole
  that let me write "ban works on both surfaces". Worth its own check; not this
  build.
- Weekly six-pattern coverage after an edit is *reported*, never re-enforced —
  `balanceWeeklyStructure` needs the whole generation context. Re-running the
  generator on a one-exercise edit would discard her other changes, so it is
  deliberately not attempted.
