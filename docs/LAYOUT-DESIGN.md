# Layout Design — Today-First Exercise Experience

**Status:** design only — no code in this round.
**Method:** single sequential pass, one author. A previous multi-agent draft
produced 16 blocking contradictions (three designs claiming the same
bottom-screen region, the program surface specced as both a route and an
embedded panel, three incompatible session-persistence schemas). Layout
decisions are mutually constraining; this document makes every one of them
once, in order, and every later section is written against the earlier ones.
The prior round's critique findings were used as a trap list — each one is
resolved *in* the design below, not appended to it.

**Designed against (read, unchanged):** `src/components/ExercisePlan.tsx`
(2,141 lines), `src/App.tsx`, `src/components/ChatAssistant.tsx`,
`src/components/MealPlan.tsx`, `src/components/NutritionDisplay.tsx`,
`src/components/WeeklyPlannerCard.tsx`, `src/components/RestTimer.tsx`,
`src/lib/set-log-store.ts`, `src/lib/mesocycle-edit.ts`,
`src/lib/mesocycle-persistence.ts`, `src/lib/dev-clock.ts`,
`src/lib/offline-sync.ts`, `docs/VISION-ARCHITECTURE.md` (§2, §6, §7, §9).

**The problem, from user testing.** The Exercise tab renders all seven days
in one vertical scroll; training on Sunday means scrolling past six days to
find today. Each day card stacks phase banner, coach note, calibration
banner, conditioning strip, warm-up section, exercise table, ramp badges,
provenance chips, swap/ban icons, set loggers, additional-work section, and
two footer buttons. The screen serves three intents at once — do today's
session, browse the program, edit the plan — and ~95% of visits are the
first. Separately: the phase explainer and calibration banner consume half
the first screen and are identical every day for four weeks, and they render
**seven times per week view** because both banners are emitted inside the
day loop (`ExercisePlan.tsx:1341-1342`).

**Constraints (unchanged from the brief):** phone-first, one-handed,
sweaty-thumbs; core actions ≤1 tap from the session view; everything
currently rendered stays reachable; all mutations keep routing through the
existing edit layers (`set-log-store`, `mesocycle-edit` +
`mesocycle-persistence`, App's handlers) — this round changes presentation
only, with a short, explicit list of non-presentational prerequisites in
§7.6; local-first logging (instant green check, offline-safe) is preserved
as a *return-value* contract (`set-log-store.ts:9-11`); the vision doc's
action-safety model is settled — append-only acts immediately with undo,
plan mutations propose-and-confirm, with the tap-path carve-out at
`VISION-ARCHITECTURE.md:714` (direct manipulation stays immediate except
high-blast-radius actions). No colour or type decisions anywhere below;
"weight" and "emphasis" always mean structure (size, position, container),
never styling.

---

## 0. Decisions at a glance

The four questions the brief requires an explicit answer to, plus the other
load-bearing calls every later section is written against. Reasoning is
inline; the referenced section carries the full spec.

**D1 — Program/browse is an embedded view inside the Exercise tab, not a
full-screen route.** Routes `#/exercise/program` (week list) and
`#/exercise/program/{n}` (week detail) render inside the tab shell, under
the same header and tab bar. *Reasoning:* browsing the program is a
secondary intent within the Exercise domain — keeping the shell preserves
orientation and keeps the other tabs one tap away; the one argument for a
full-screen escape (the `#/dev-test` early-return frees the screen of
chrome) is only compelling for **active mode**, which gets exactly that
treatment (D5). The prior draft's full-screen program justified itself by
"unmounting ExercisePlan is free" — but with `ActiveSessionProvider`
mounted *above* the tabs (§5), unmounting any view is free everywhere, so
the justification evaporates. The program surface's *information
architecture* is the two-level design (block-collapsible week list → week
detail), not the legacy seven-card loop — §2.4.

**D2 — The bottom region is one fixed element with at most two rows, and
the primary action never collides with the rest timer.**
Row B (bottom, persistent on Exercise surfaces): the surface's single
primary action, plus the chat summon at the trailing edge — the summon
never moves between states. Row A (above it, conditional): the rest timer
while a rest is running, or a receipt for its display window. While any set
input is focused (keyboard up), the whole region collapses to one thin
line. Full state table in §3.6. *Reasoning:* the prior draft had four specs
for this region because each section reasoned locally; globally, only two
facts matter — the primary action must always be reachable (so it cannot
share a slot with the timer) and the region must not occlude the focused
set row under a 250–280px soft keyboard on a 375×667 viewport (so it cannot
be three rows). Two rows, fixed roles, is the only shape that satisfies
both. Set logging is **never** in the bottom bar — it is the per-row ✓ in
the set grid, because supersets and edit-after-complete need per-row
targets.

**D3 — A mid-session swap is immediate; a scope-bearing swap confirms.**
The mechanical rule, applied uniformly: *a mutation earns a confirm step
iff it offers scope beyond the thing you tapped, or is irreversible.* In
active mode the swap scope is forced to `today` (one session, one slot,
fully reversible by swapping back or by Undo) — so a clean candidate
applies on one tap with a receipt and Undo, and a warned candidate (free
search past the constraint filter) takes two taps (warnings expand →
`Use anyway`). On the today view and in program browse, the swap sheet
shows a scope row (`Today only` / `Rest of block` — never "permanent",
per `VISION-ARCHITECTURE.md:180`) and therefore ends in a confirm. Ban is
never available in active mode; on the other surfaces it is
propose-and-confirm (vision `:177`). Full flows in §3.5 and §4.

**D4 — Plan-mutation undo survives a reload; append-only undo does not
need to.** Swap and ban receipts carry a 10-minute Undo backed by a
**persisted pre-image**: `{kind, targetKey, preImage, exclusionsPre,
expiresAt}` written to `localStorage` (one slot; a newer plan mutation
overwrites it and expires the prior undo, matching vision `:286` "10
minutes or until the next mutation on the same target"). Restored on
mount, so the printed promise is honest across reload, tab kill, and OS
kill. *Reasoning:* vision Q4 (`:689`) — "without \[a pre-image\] the Undo
button is a lie". The pre-image is cheap: it is the in-memory `mesocycle`
array App already holds, and the restore call already exists
(`saveMesocycle(pre, preserveCreatedAt)` — `preserveCreatedAt` is
mandatory or the restore rewinds the trainee to week 1,
`mesocycle-persistence.ts:24-31`). Logged-set undo needs none of this:
`deleteSet` exists (vision `:288`), the receipt offers it while shown, and
after the receipt is gone the row itself remains editable — the durable
"undo" for a set is the row.

**D5 — Active mode is a mode *with an address*: route `#/train`, rendered
full-screen by a conditional inside the shell, below the provider.** The
vision's C1-as-a-mode recommendation (`:621`) holds — one host, no
duplicated day-rendering — but the mode gets a hash route so back-button,
deep-link resume, and cross-surface entry (planner, chat) exist. The
conditional sits **below `ActiveSessionProvider`**, never the
`#/dev-test`-style early return above it, so entering/leaving the mode
never unmounts session state, the rest timer, or the sync layer. §3.1, §5.3.

**D6 — One persisted session record.** Exactly one localStorage key,
`fitplan_active_session_v1:<profileId>`, one schema (§5.4), owned by
`useActiveSession`. It replaces `active_session_cache` entirely; the old
cache's `completedSets`/`setWeights`/`setReps` maps are **not migrated** —
they were a redundant copy of what `getSetsForDate` already returns
(`offline-sync.ts:1-10` says as much). Checkmarks derive from logs, always.

**D7 — Session identity freezes at start and survives midnight.** `date`,
`dayName`, `liveWeek` are stamped once when a session starts (from
`getSessionDateContext` / `getActiveMesocycleWeek`) and never re-derived
mid-run. A running session whose calendar date has rolled over is **not
stale** within a 6-hour grace window — the header shows
`Still logging to Thursday · [ End it now ]` and every write keeps the
frozen stamps. `markSessionCompleted` is **never auto-called** — it is the
only measured input the burn estimate has (vision `:625`); a stale run
closes locally and offers `[ Mark it complete ]` explicitly. §3.7.

**D8 — `liveWeek` and `browseWeek` are different values and never share a
control.** `liveWeek` is frozen session identity with no setter exposed to
any component; `browseWeek` is a cursor local to the program surface.
Nothing on the today view or in active mode can move a week — the week
arrows die. This closes the live corruption vector where paging the week
re-parents `saveSet.weekNumber` (`ExercisePlan.tsx:744` dual-purpose
`currentWeek`; browsing to week 5 today leaves a live logger writing
`weekNumber: 5`). §2.4, §5.5.

**D9 — The seven-day scroll is replaced by: one hero (today), one strip
(the week), one surface (the program).** `DAY_ORDER.map` (`:1289`) renders
nothing on the today view. Rest and active-recovery days become first-class
calm states with actions (today they are dead ends — zero controls,
`:188-267`).

---

## 1. The today view

What `#/exercise` opens to. One day — the session day — as the primary
object, regardless of weekday.

### 1.1 Anatomy, top to bottom (training day)

```
┌──────────────────────────────────────────────┐
│ Wk 3/16 · B1 Hypertrophy · ~52 min        ⌄ │  A context line
│ Mon✓ Tue· [Wed●] Thu● Fri● Sat– Sun–         │  B week strip
├──────────────────────────────────────────────┤
│ TODAY · Wednesday · Push & Press             │  C identity line
│                                              │
│ ▸ Warm-up · 4 moves · ~6 min                 │  D warm-up (collapsed)
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Barbell Bench Press          3×8-11    ⋯ │ │  E exercise rows
│ │ Ramp: 20×10 · 50×5 · 70×3 · 80×1         │ │    (ramp strip)
│ │ ~90 kg · suggested ⓘ                     │ │    (load chip)
│ │ ↳ Calibration: leave 3-4 reps in         │ │    (calibration cue,
│ │   reserve — log what you actually do.    │ │     week 1 only)
│ │ [S1 ✓][S2 ✓][S3  ]                       │ │    (set grid)
│ ├──────────────────────────────────────────┤ │
│ │ A1 Incline DB Press          3×10     ⋯  │ │
│ │ A2 Chest-Supported Row       3×10     ⋯  │ │
│ │    alternate — no rest between           │ │
│ │ …                                        │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ▸ Finisher · 15m Incline Walk · RPE 6   Log  │  F prescribed cardio
│ ＋ Add unplanned work                        │  G off-plan entry
│ Additional work                              │  H detected/declared
│   Face Pulls · 2 sets logged                 │    off-plan (cond.)
├──────────────────────────────────────────────┤
│ [        Start workout        ]          💬  │  I bottom region (D2)
└──────────────────────────────────────────────┘
```

### 1.2 A — the context line (the density fix)

One tappable line replaces `PhaseBanner` + `CalibrationBanner` +
`SessionDurationNote` (today: up to seven copies of each per week view).

- **Content:** `Wk {n}/{total} · B{block} {phase_label} · ~{est} min`,
  with a trailing `⌄` disclosure chevron. The phase token is **replaced**
  (not appended) by `Deload week` when `is_deload` and by `Calibration`
  during the calibration week — mutually exclusive content is mutually
  exclusive in the DOM.
- **Tap on `⌄`:** expands an inline panel with `phase_focus`, the
  `coach_note`, and the deload/calibration explanation paragraph — the
  full content of today's banners, on demand. Collapsed by default every
  visit. Governing principle: **content that doesn't change daily must
  not occupy permanent daily space.**
- The **full program narrative** ("understanding your program") belongs
  on the dashboard — which is vision Phase G and does not exist yet.
  Until it does, the expansion panel is the self-sufficient home; the
  design defers the move, it does not depend on it.
- **Tap on the line text:** routes to `#/exercise/program/{liveWeek}` —
  one tap from today to "where am I in the program". No week arrows
  here (D8).
- **Legacy/no-mesocycle profiles** (`hasMesocycle === false`, the
  `App.tsx:191-267` reconstruction where phase/load data is
  irrecoverable): the line is **omitted entirely** — not rendered empty.
  See §1.9.

### 1.3 B — the week strip

Seven cells, always, today boxed. Position: top, directly under the
context line — inside one-handed reach and adjacent to the context it
summarizes. Glyph vocabulary (six marks, fixed meanings):

| Glyph | Meaning |
|---|---|
| `✓` | training day, session finished |
| `◐` | training day, some sets logged, not finished |
| `●` | training day, due (today or future, nothing logged) |
| `○` | training day, passed with nothing logged |
| `–` | rest day |
| `~` | active recovery day |

- **Data:** `useTrainingWeek(profileId, sessionDate)` (§5.2) over
  `getWeeklyDashboard` for the Monday–Sunday window derived from
  `getAppNow(profileId)` via `getLocalDateString` — never `new Date()` /
  `toISOString()` (the planner card's today-detection bug,
  `WeeklyPlannerCard.tsx:139`, is not carried forward). Today's cell is
  overlaid from the session's own `logs` so it updates instantly on save.
- **Loading rule:** until the range read resolves, every un-logged
  training day renders `●` (due), never `○` (missed) — loading must not
  read as failure.
- **Tap on a non-today cell:** opens the **peek** (§2.2) — the day's
  prescription replaces the session region in place, read-only for
  logging. Tap today's cell / `✕` returns.
- The strip renders **marks only** — no volume numbers, no focus labels
  (open question Q2, §8).

### 1.4 C — identity line

`TODAY · {weekday} · {focus}`. During a dev override, `DEV · {day}` is
appended and persistent (§5.6). On a borrowed-prescription day (§1.8),
the borrow is stated here.

### 1.5 D — warm-up section (rebuilt, not extracted)

- Collapsed one-liner with a **counted label**: `▸ Warm-up · {n} moves ·
  ~{min} min` — a collapsed section earns trust by stating what's
  inside.
- Expands to **General** and **Mobility** lists and the warm-up
  `coach_note`. Uses `ui/collapsible` (the primitive already in this
  file), not a hand-rolled disclosure.
- **The percentage ramp block inside `WarmupSection` is deleted.** Ramp
  data renders exactly once, per exercise, in kg, on the row it governs
  (§1.6). One canonical home for a safety-critical element; the gaps
  that deletion opens are closed in §1.6 and gated in §7.5.
- No auto-expand. The old auto-expand effect (`:856-861`) existed
  because ramps lived here; they no longer do. The safety story does not
  rest on this section being open — it rests on the ramp strip being
  permanently visible on the row.

### 1.6 E — exercise rows

The repeated unit follows the `MealSlotCard` shape (identity + key
numbers on the top lines, actions trailing, everything else
conditional): rows are bordered divs inside one card, never nested
cards.

Per row, in order:

1. **Name line:** exercise name · `{sets}×{reps}` · `{done}/{sets}`
   count badge once ≥1 set is logged · trailing `⋯` overflow (§4). A
   completed row is de-emphasised and carries a done marker (rendering
   deferred to the styling pass). Superset members render inside a
   bracketed group with the shared line `alternate — no rest between`
   stated once (§3.4).
2. **Ramp strip** (safety-critical, **never collapsible**, the only
   surface for ramp data): `Ramp: 20×10 · 50×5 · 70×3 · 80×1` in
   absolute kg from `formatRampSets` — recomputed each render,
   equipment-floored, plate-rounded, name-guarded (`:283-295`). Two
   additions close the §1.5 deletion gap:
   - **Rep-only variant:** when `ex.ramp_up.exercise === ex.name` but
     `suggested_load_kg == null` (bodyweight compounds), render
     `Ramp: ×10 · ×5 · ×3 → bodyweight` instead of returning null.
   - **Stale-ramp fallback:** when `ex.ramp_up` exists but its name
     doesn't match (mid-rotation edge), render the generic line
     `Build up in 3-4 lighter sets before set 1` rather than nothing.
3. **Load chip + provenance:** `~90 kg · suggested ⓘ` — three
   provenance states with fixed labels (§6.2): `estimate` → "suggested"
   (dashed chip), `known_weight` → "you told us" (confident chip),
   `logged` → "from your last session" (confident chip). Bodyweight
   (`suggested_load_kg == null`) renders no chip and **no ⓘ** — there
   is no load to explain. `per_set_load` renders per-set chips as
   today, same trailing label. The `ⓘ` is an explicit, always-visible
   affordance wherever a chip exists (today it is a silent
   `role="button"` only on estimates, `:1475-1479`), with per-state
   copy:
   - estimate → the existing `ESTIMATE_EXPLAINER`;
   - known_weight → "From what you told us at setup. Log a set and it
     updates from your real numbers.";
   - logged → "Calculated from your last session on this lift." plus
     the exercise's progression note when present.
   The ⓘ panel also carries `ex.load_guidance` when present (currently
   rendered nowhere).
4. **Calibration cue** (calibration week only, one row per session): a
   single inline line attached to the action it governs —
   `↳ Calibration: work up to a weight you could lift 3-4 more times.
   Log what you actually do — week 2 builds on it.` **Anchor rule, with
   fallback:** (1) the first row with `loadSource === 'estimate'`; else
   (2) the first row with `suggested_load_kg != null` (a `known_weight`
   day still gets the instruction); else (3) the first exercise row,
   with the rep-based variant `↳ Calibration: leave 3-4 reps in
   reserve. Log what you actually do.` (an all-bodyweight day still
   gets it). The anchor resolves to exactly one row for every
   calibration-week day with ≥1 exercise — asserted in
   `test:session-derive` (§7.5).
5. **Set grid** (§3.3 for the full row spec — same component in both
   modes): one row per set, rendered inline, always — tap-to-expand is
   gone for today's session. Ghost values from `getLastSessionSets` as
   placeholders; ✓ on an untouched row logs the ghost/prescribed values
   and writes them visibly back into the row (existing behaviour,
   kept); instant green check from `saveSet`'s synchronous return,
   never a promise.

Row-count reality check: a 5-exercise day renders 5 rows × (2–4 lines +
set grid). The bulk of the old card's height — banners ×7, duplicated
warm-up ramps, swap/ban icons ×35, footer forms — is gone or behind `⋯`.

### 1.7 F/G/H — cardio and off-plan work

- **F — Finisher row:** the prescribed cardio (`recommendedCardio` /
  `conditioning_note`) compresses to one line with a one-tap `Log`
  prefill (activity, duration, RPE prefilled; confirmable inline). This
  is the *prescribed* entry point.
- **G — `＋ Add unplanned work`:** one entry point for off-plan lifts
  and ad-hoc cardio (replacing the two footer buttons and the
  standalone `CardioLogger` mounted at `App.tsx:978` — §6.4). Opens an
  inline form, not a dialog. Cardio writes go through an optimistic,
  retriable wrapper (§7.6) — the current `insertCardioLog` path is a
  direct network write with silent failure (`:1829-1862`), which
  violates the local-first constraint and does not survive this round.
- **H — Additional work:** the union of *declared* names (user-typed,
  persisted in the session record) and *detected* off-plan work (logged
  sets whose exercise id is not in `plannedIds` — this is how
  chat-logged and swapped-away work appears, and it must not be lost:
  `offPlanWork = union(declaredOffPlan, detected)`, §5.2). Detected
  entries have no remove affordance (there is nothing to un-declare);
  declared entries with zero logged sets can be removed. Custom lifts
  keep `getExerciseId(name)` identity — no new id namespace — so
  ghosts, PRs, and detection keep working; "not in catalogue" is
  derived presentationally via `getExerciseEntry(name) == null`.

### 1.8 Rest and active-recovery days (first-class calm states)

Today both are dead ends with zero controls (`:188-267`). Rebuilt:

```
┌──────────────────────────────────────────────┐
│ Wk 3/16 · B1 Hypertrophy                  ⌄ │
│ Mon✓ Tue✓ Wed✓ [Thu–] Fri● Sat– Sun–         │
├──────────────────────────────────────────────┤
│ REST DAY · Thursday                          │
│                                              │
│ Recovery is where the adaptation happens.    │
│ This week: 3 of 4 sessions done.             │
│                                              │
│ Tomorrow · Pull & Hinge · 5 exercises      › │
│                                              │
│ ▸ Log a walk or other activity               │
│   Train anyway →                             │
└──────────────────────────────────────────────┘
```

- **Rest day:** calm copy, the week tally (`{done} of {planned}
  sessions done`, from `useTrainingWeek`), a one-line preview of the
  next training day (tap → peek), an activity-log entry (same
  optimistic path as G), and a `Train anyway →` escape.
- **Active recovery day:** same shell; the `recommendedCardio` block
  (activity / duration / RPE / reason) renders as the main content with
  a one-tap `Log` — an active recovery day is *loggable* now.
- **`Train anyway →`** opens a day picker over this week's training
  days; the pick sets `borrowedPrescription: {sourceDay, exercises}` in
  the session record — used for display, ramps, loads, and the progress
  denominator — while the session's `date`/`dayName` stamps stay real.
  Every set logged is (correctly) detected as off-plan against the rest
  day's empty `plannedIds`; the denominator renders
  `{n}/{m} (borrowed from Friday)`; Finish still stamps the session.
- The bottom region on a rest day shows **no primary action** (row B
  renders only the chat summon); `Train anyway` is deliberately an
  inline link, not a dock action — the dock advertises the *expected*
  act, and on a rest day the expected act is nothing.

### 1.9 Remaining states

- **Loading (`!ready`):** skeleton set rows, progress renders `—/—`
  (never `0/N` — a mid-workout reload showing zero checks reads as data
  loss), primary action renders disabled `Loading your session…`.
  `Start workout` never renders before `ready`. `ready` is a
  fetch-completion state, not connectivity — `getSetsForDate` never
  throws and resolves offline from the pending store
  (`set-log-store.ts:717-718`).
- **Session in progress (user left active mode or reloaded):** primary
  action `Resume · 11/21 sets`; `Finish now` is the first item in the
  row-B overflow `⋯`. A partial session is always finishable (§3.6).
- **All sets logged, not stamped:** primary action `Finish workout`.
- **Finished:** primary action gone; identity line gains the done
  state; the summary is re-openable from a `Session summary ›` line
  where the primary action was.
- **Legacy/no-mesocycle:** context line omitted; identity line
  `TODAY · Thu · {focus}` with no week token; rows render `sets × reps`
  with no load chip, no ramp strip, no ⓘ; week strip renders
  training-vs-rest marks plus today's own logged state only. The hook
  reports `liveWeek = 1`, `mesoWeek = undefined`.
- **Dead-letter warning:** when `deadLetterCount > 0`, a one-line
  non-dismissible banner above the exercise list — `{n} sets failed to
  sync · Review` — linking to the offline-status panel (§6.5). A failed
  set must not hide behind header chrome mid-session.

### 1.10 What leaves this screen entirely

| Today | Where it goes |
|---|---|
| PhaseBanner ×7 | context line + expansion (§1.2) |
| CalibrationBanner ×7 | inline cue on the anchored row (§1.6.4) |
| SessionDurationNote | `~52 min` token on the context line |
| Week/block navigator card (`:1227-1288`) | program surface (§2.4); the B1–B4 pills and week dots die with `jumpToBlock` |
| "Complete & Log All Sets" (`:1349-1366`) | **deleted from this surface.** Its one home is the Finish sheet's pre-filled `Log the rest as prescribed` (§3.7) — an unconfirmed, un-undoable bulk write of every prescribed set contradicts the settled action-safety model |
| Swap `⇄` / ban icons on every row ×7 days | row `⋯` overflow (§4) |
| Add Extra Lift / Log Cardio footer forms | `＋ Add unplanned work` (§1.7) |
| Six other days' cards | week strip + peek + program surface |
| OfflineStatusIndicator strip | app header, once (§6.5) |

---

## 2. Week navigation and the program surface

### 2.1 The three levels

1. **Week strip** (§1.3) — orientation and per-day state, zero scroll
   cost.
2. **Peek** — one other day's content, in place, one tap, one tap back.
3. **Program surface** — the full 16-week structure, embedded at
   `#/exercise/program` (D1).

### 2.2 The peek

Tap a non-today cell → `peekDay` (local state of `ExerciseTab`, **not**
in `useActiveSession` — it is browse state and must never touch
`liveWeek` or the write path). The session region below the strip is
replaced in place:

```
│ Mon✓ Tue· [Wed●] Thu● Fri● Sat– Sun–         │
├──────────────────────────────────────────────┤
│ ✕ Friday · Pull & Hinge          (this week) │
│ ┌──────────────────────────────────────────┐ │
│ │ Trap Bar Deadlift            4×8-11    ⋯ │ │
│ │ Ramp: 40×8 · 80×5 · 100×3                │ │
│ │ ~120 kg · suggested ⓘ                    │ │
│ │ …                                        │ │
```

- **Read-only for logging:** no set grid, no ✓; no `logSet` callback
  reaches this panel (asserted in `test:session-derive`). Swap/ban stay
  available via `⋯` (they are plan edits, not session acts) and use the
  scope-bearing confirm flow (D3).
- `progressedLoads` is **suppressed** (passed empty): today the
  today-only progression map leaks into every day's rows via name keys,
  showing other days a `logged` provenance they haven't earned
  (`ExercisePlan.tsx` E7 computes for today only, `:892-929`, while
  `:1424`/`:1603` read it for all seven days). A peeked day shows
  plan-derived loads and honest provenance only.
- Exit: `✕`, or tapping today's boxed cell. Back-button also exits when
  nothing else is above it (the peek pushes no route — it is ephemeral
  browse state; addressable browsing lives on the program surface).

### 2.3 From today to the program

One tap: the context line routes to `#/exercise/program/{liveWeek}`
(week detail, current week). The program surface's own header carries
`‹ Week n of N ›` stepping and a `Weeks ›` crumb up to the list.

### 2.4 The program surface (embedded, two levels)

**Level 1 — `#/exercise/program`, the week list.** A 16-week program in
four collapsible block sections (this is what retires the B1–B4 pills +
week dots + `jumpToBlock`):

```
│ ‹ Today                    Your program      │
│ ▾ Block 1 · Hypertrophy · weeks 1-4          │
│    Wk 1 · Calibration            done ✓      │
│    Wk 2 · loading                done ✓      │
│    Wk 3 · loading              ← you are here│
│    Wk 4 · deload                             │
│ ▸ Block 2 · Strength · weeks 5-8             │
│ ▸ Block 3 · Strength · weeks 9-12            │
│ ▸ Block 4 · Peak · weeks 13-16               │
```

The current block is expanded by default; the current week is marked.
Tapping a week row → level 2.

**Level 2 — `#/exercise/program/{n}`, the week detail.** Seven
collapsible day rows (counted labels: `Push & Press · 5 exercises`),
each expanding to the day's exercise list rendered with the same
`ExerciseRow readOnly` used by the peek — ramp strips and load chips
included, `progressedLoads` suppressed, no set grids. Header:
`‹ Week 3 of 16 ›` stepper — the **only** week-moving control in the
app, writing `browseWeek` only. Swap/ban via `⋯` with the scope row; a
swap in a browsed week targets `(browseWeek, dayName, exIndex)` — the
exact `exIndex` from the unfiltered `day.exercises` array, which
`swapExerciseInMesocycle` addresses positionally.

- **Deload weeks** carry their explanation in the week row's expansion,
  not as a banner.
- `DevTestPanel` mounts here (program surface, dev-gated) — never above
  the today hero.
- The legacy `DAY_ORDER.map` rendering serves as a **temporary
  read-only stand-in** for this surface during P2–P3 (§7.3) and is
  deleted with `ExercisePlan.tsx` in P4.

---

## 3. Active mode

### 3.1 Entry and exit

- **Entry:** `Start workout` (row B) → `status:'running'`,
  `startedAtIso` stamped, route pushes `#/train`, chrome (header,
  planner, tab bar) hidden by a conditional **below**
  `ActiveSessionProvider` (D5). The Start tap is also the user gesture
  that creates and `resume()`s the **one shared AudioContext** for the
  session (§3.8). `Resume · n/m sets` enters the same way with the
  cursor restored.
- **Deep link / reload on `#/train`:** if a running session record
  hydrates (§5.4), resume in place; if none, redirect to `#/exercise`.
  Entry paths that skip the Start tap have no AudioContext gesture yet —
  the chime ladder degrades to visual-only until any set-log tap
  (§3.8).
- **Exit (`✕` / back-button):** returns to `#/exercise` with the
  session still `running` — exiting is not abandoning. Nothing unmounts
  above the mode boundary, so the timer, drafts, and cursor survive by
  construction.

### 3.2 Flow — the rail

```
┌──────────────────────────────────────────────┐
│ ✕  Wednesday · Push & Press      41m  Finish │
│ ● Bench ─ ● A1/A2 ─ ○ OHP ─ ○ Fly ─ ○ Finshr │  rail
├──────────────────────────────────────────────┤
│ ▸ Warm-up · 4 moves · ~6 min          Dismiss│  step 0 (until dismissed)
│                                              │
│ BARBELL BENCH PRESS               3×8-11     │
│ ~90 kg · suggested ⓘ                         │
│ Ramp  ⊙ 20×10  ⊙ 50×5  ● 70×3  ○ 80×1        │
│                                              │
│  S1   90.0 kg × 9        ✓ done · edit       │
│  S2   90.0 kg × 8        ✓ done · edit       │
│  S3  [ 90.0 ]kg ⚙ [  8  ]reps          [ ✓ ] │
│  ＋ Add set                                  │
│                                              │
├──────────────────────────────────────────────┤
│ ⏱ 1:23 · Rest · Bench    −30s  +30s   Skip ▸ │  row A (while resting)
│ [      Next: Incline DB Press ▸      ]   💬  │  row B
└──────────────────────────────────────────────┘
```

- **One focused stop at a time.** The rail is a horizontal strip of
  stops — each stop an exercise or a fused superset group, plus a final
  `Finisher` stop when cardio is prescribed. States: done / current /
  upcoming / skipped. Tap any stop to jump — the cursor is a focus,
  never a lock.
- **Step 0 — warm-up:** a dismissible line above stop 1 (counted label,
  expands to General/Mobility). Dismissal persists for the session (in
  the session record), not forever. It is a step, not a gate — a gate
  mid-workout is the wrong instrument; the safety load is carried by
  the per-exercise ramp strip, permanently visible in both modes.
- **Ramp strip with tick-offs:** in active mode each ramp step gains a
  tick circle (`rampTicks` in the session record, UI-only — ramp sets
  are **not** written to the log store; they are preparation, not
  performance, and writing them would pollute `setsFor` counts).
  Ticking is optional; nothing depends on it.
- **Advance:** logging the last prescribed set of a stop advances the
  rail automatically; row B's `Next: {exercise} ▸` advances manually.
  After the last stop, row B becomes `Finish workout`.

### 3.3 The set row (shared component with the today view)

- **Anatomy:** `S{n}` · weight input (`inputMode="decimal"`, ghost as
  placeholder, plate-calculator glyph `⚙` at the field's trailing edge
  **on the focused row only**, seeding from
  `draft → ghost → defaultWeightFor(i)`) · reps input (unit caption
  from `getRepsLabel` for time/distance types) · `✓` (≥44px). Enter
  submits.
- **✓ semantics (kept):** blank fields resolve to ghost-then-prescribed
  values, written back into the row visibly; `saveSet` returns
  synchronously → instant green check; re-save is idempotent
  (natural-key upsert). Validation errors render inline per row.
- **Edit-after:** a completed row renders `✓ done · edit`; tapping
  reopens it editable (`updateSet` = `saveSet`). The expanded editor
  offers `Remove this set` (`deleteSet` — the durable undo for a set).
- **Set numbering — never renumber.** The rendered row list is
  `sortedUnion(1..prescribedSets, loggedSetNumbers, extraSetNumbers)`.
  `＋ Add set` appends `max(allKnownSetNumbers) + 1` to
  `extraSetNumbers` — an explicit number list in the session record,
  not a count, so removing a middle set leaves a visible gap `1, 3, 4`
  rendered as-is, and no recompute can silently overwrite a row via the
  store's natural-key upsert.
- **Bodyweight:** BW toggle as today (clears weight, logs
  `isBodyweight`). **Time/intervals:** the seconds field gets a sibling
  ≥44px stopwatch control on the same row (not inside the input — the
  same pixel must not mean both "start timing" and "select-all"); start
  does not focus the field; stop writes the elapsed value into the
  field, still editable. Unit from `prescriptionUnit`, never hardcoded.
- **RPE:** after the final prescribed set of an exercise logs, a
  one-line chip strip appears once per exercise (`rpeAnswered` dedupe):
  `RPE?  [5][6][7][8][9][10]  skip` — six chips ≥44px. A tap writes
  `rpe` onto that set via `updateSet`; skip dismisses. (The cardio
  form's ten-button strip reduces to the same six — §6.3.)
- **PR path:** `checkForPR` on save, PR pill on the top row, then
  `reEvaluatePR` — rewritten as a pure function over
  `setsFor(exerciseId)`-derived `SessionSet[]` in `session-derive.ts`
  (its current inputs, `savedSets` + `inputs`, are deleted state — a
  verbatim port is impossible). The call order against the
  cache-mutating `checkForPR` (`pr-engine.ts:62,84`) is preserved
  deliberately, with a snapshot test so a later "fix" is detected
  (§7.5). PRs land in the session record's `prs` — they cannot be
  recomputed at Finish because `checkForPR` mutates its cache before
  returning.

### 3.4 Supersets

- `groupExercises(exercises)` (pure, `session-derive.ts`) partitions
  the day into `{kind:'single'}` and `{kind:'superset', label,
  members}` groups, preserving each member's original `exIndex`
  (asserted round-trip in `test:session-derive` —
  `swapExerciseInMesocycle` addresses by position).
- A superset stop renders **round-based**: `Round 1: A1 row, A2 row`,
  `Round 2: …`. `rest === 'alternate'` renders the shared
  `alternate — no rest between` line once at group level; the rest that
  *does* start after the round's last member uses the group's resolved
  rest (A1's concrete rest when A2's is `'alternate'`).
- Grouping re-derives from props after every swap —
  `clearOrphanedSupersetLabels` (`mesocycle-edit.ts:108-121`) strips
  the label and rewrites rest to `'60s'` when a pair is broken, and the
  UI must reflect that immediately.

### 3.5 Mid-session changes (D3 applied)

Via the focused stop's `⋯`:

- **Swap (immediate):** candidate list (ranked
  `getReplacementCandidates`, then free search). Scope forced `today` —
  no scope row, therefore no confirm: one tap on a clean candidate
  applies (`swapExerciseInMesocycle` scope `'today'` →
  `saveMesocycleWeek`), receipt in row A's slot with `Undo` (D4). A
  warned candidate (compatibility warnings from free search) expands
  its warnings and requires a second tap `Use anyway`.
  Loads/ramps/provenance re-derive from the returned week — never
  cached across a swap. After any tap mutation, pending proposals on
  the same target are swept stale (vision `:248`).
- **Skip:** moves the stop to `skipped` (session record); the Finish
  sheet lists skipped stops; a skipped stop is re-enterable from the
  rail.
- **Do next / move to end:** reorders the session `order`
  (session-record-only — the *plan* is untouched; `order` stores
  original indices, so `exIndex` mapping survives).
- **Change rest time (today only):** sets
  `restOverrides[exerciseId] = seconds` in the session record —
  consumed by `startRest` only, writes nothing to the plan. The label
  says "today only".
- **No ban in active mode.** Ban lives on the today view and program
  surface, behind propose-and-confirm (§4.3).

### 3.6 The bottom region, state by state (D2)

| State | Row A | Row B |
|---|---|---|
| Today view, not started | — | `Start workout` + 💬 |
| Today view, in progress | timer if resting | `Resume · 11/21 sets` (+ `Finish now` in `⋯`) + 💬 |
| Today view, all logged | timer if resting | `Finish workout` + 💬 |
| Today view, rest day | — | 💬 only |
| Peek open | — | `Back to today` + 💬 |
| Active, working | — | `Next: {exercise} ▸` + 💬 |
| Active, resting | `⏱ 1:23 · Rest · Bench · −30s +30s Skip ▸` | unchanged + 💬 |
| Active, timer overrun | `Rest finished 0:45 ago · Dismiss` | unchanged + 💬 |
| Active, last stop done | timer if resting | `Finish workout` + 💬 |
| Receipt showing | receipt (`Swapped → DB Press · Undo`) occupies row A for its window; a running timer collapses to a `⏱ 1:23` chip at the receipt's edge and reclaims the row after | unchanged |
| Any set input focused (keyboard up) | region collapses to one thin line: `⏱ 1:23` if resting, else nothing | hidden |

Keyboard handling is net-new, named work (§7.6): a
`visualViewport`-driven bottom inset, scroll-focused-row-into-view on
focus, and a manual gate on a 375px viewport (iOS Safari + Android
Chrome) — `grep visualViewport src` returns nothing today. `Finish` in
the active-mode **header** is always reachable regardless of dock state
— a partial session (11/21) can always be finished.

The dock is mounted once at app root. Row A (timer/receipt) renders on
**any** surface while active — a rest started in active mode stays
visible if the user wanders to Meals. Row B renders on Exercise
surfaces only; the chat tab never shows the dock (it has its own input
dock).

### 3.7 Finish, abandonment, resume

**Finish** (header, always; row B when terminal): opens
`FinishSessionSheet`:

```
│ Finish workout                            ✕  │
│ 41 min · 18 sets · 4,120 kg volume           │
│ ★ PR: Bench 92.5 kg × 8                      │
│ Next session: 62.5 kg on OHP — you hit       │
│ every rep this week.                         │
│                                              │
│ Unlogged: OHP S3 · Fly S2, S3                │
│ [ Log the rest as prescribed ]  (rows shown) │
│ Skipped: Lateral Raise                       │
│                                              │
│ [           Finish session            ]      │
```

- Duration from `startedAtIso → getAppNow` (dev-clock-aware). Volume
  and set count from `setsFor`-filtered logs. PRs from the session
  record. The progression payoff line comes from `projectNextLoad` — a
  pure function extracted from `getDoubleProgressionRecommendation`'s
  core (§7.6) — run against today's sets.
- **`Log the rest as prescribed`** — the bulk-log's only home:
  pre-fills every unlogged row with exactly what it would write, rows
  visible, one confirm. Routes through `saveSet` per set; unlike the
  old bulk path it arms no timer and fires no completion side-effects.
- **`Finish session`:** synchronous — `finish(): void` sets
  `status:'finished'` locally, enqueues a `{kind:'finish'}` PendingOp
  (drained by the existing flush loop; resolves the server session id
  via `getSessionIdForDate` and calls
  `markSessionCompleted(sessionId, finishedAtIso)`), and routes to
  `#/exercise`. The confirmation is instant and local; sync status is
  exposed separately (`completionQueued` / `completionSyncedAt`). No
  call site can await completion — offline finishing must not block.
- A finished partial session records exactly what was logged; the
  sheet's partial variant lists the unlogged remainder and skipped
  stops without judgment.

**Abandonment and resume:**

- Reload / tab kill / OS kill mid-session → the session record
  hydrates; the today view shows `Resume · n/m sets`; `#/train`
  deep-links straight back in. Drafts (typed-but-unsaved values),
  cursor, order, skips, and the rest deadline all survive — they live
  in the record, not in component state.
- **Midnight (D7):** a running session whose `date` no longer matches
  the live date is kept alive while last activity is within **6
  hours**; the header shows `Still logging to Thursday ·
  [ End it now ]`; all writes keep the frozen
  `date`/`dayName`/`liveWeek`. `[ End it now ]` opens the Finish sheet.
- **Stale run** (grace expired): the local record closes silently
  (`status:'finished'`, `finishedAtIso = max(completed_at)` of its
  logs), and — because `markSessionCompleted` is never auto-called —
  the next today-view visit shows a dismissible strip:
  `Thursday's session was left open · [ Mark it complete ] [ ✕ ]`. The
  program surface's day rows offer the same completion affordance as a
  second path.

### 3.8 The rest timer (honest PWA contract)

- **Deadline-anchored, persisted, reconciled.** `startRest` writes
  `restEndsAt = getAppNow() + duration` (with `restOverrides` applied)
  into the session record; the card renders `restEndsAt − now`,
  recomputed on tick **and** on `visibilitychange` / `pageshow` /
  `focus`. Correct after throttling, backgrounding, reload, and mode
  switches — the current component's tick-counting, unmount-destroyed,
  never-resyncing behaviour (`RestTimer.tsx:16, :46-56`,
  `{restTimer && …}` at `ExercisePlan.tsx:2112`) is retired wholesale.
- **Controls: `−30s`, `+30s`, `Skip ▸`. No pause.** Pause is incoherent
  against a persisted deadline and reintroduces the tick-count model;
  `±30s` covers the real need by shifting `restEndsAt`. There is no
  paused state to persist.
- **Overrun is a designed state:** `Rest finished 0:45 ago · Dismiss` —
  never a frozen countdown.
- **Alerting, honestly:** the chime plays from the one shared
  AudioContext, `resume()`d on Start, on every set-log tap, and on
  every `visibilitychange → visible` (iOS suspends it on backgrounding;
  best-effort, never load-bearing). `navigator.vibrate` is Android-only
  — a permanent no-op on iOS — and is labelled an enhancement. **No
  notification tier ships in P1–P4**: scheduling a local notification
  for a future deadline is impossible in any browser (Notification
  Triggers never shipped), and reaching a backgrounded iOS PWA requires
  an installed PWA + service worker + server-sent push + a backend
  scheduler — none of which exists in this repo (no manifest, no
  service worker, no `public/`). The design promises: the timer is
  *right* whenever you look, and nothing in the flow depends on it
  firing — the next set is always loggable.
- Degradation ladder (every tier keeps the visual state as the only
  promised signal): gesture unlocked → chime + (Android) vibration; no
  gesture yet this session → visual only; backgrounded → correct on
  return, with the overrun state.
- **Optional wake lock** (`navigator.wakeLock`, iOS 16.4+): an explicit
  `Keep screen on` toggle in active mode's `⋯`, off by default,
  re-acquired on `visibilitychange`.
- The rest strip names the exercise the rest **belongs to**
  (`Rest · Bench` — the one just finished), fixing the current
  mislabelled `Next: {finished exercise}` (`RestTimer.tsx:123`).

---

## 4. Editing recedes

### 4.1 The row overflow `⋯`

Swap and ban currently shout from every row of every day (`7 ×
exercises` icon pairs, `:1553-1582`). All row-scoped editing moves
behind one `⋯` per row (≥44px), present on the today view, peek,
program day rows, and the active-mode focused stop:

```
│ Barbell Bench Press                          │
│ ─────────────────────────────────────────    │
│ ⇄  Swap exercise                          ›  │
│ ⚙  Plate calculator                          │
│ ⏱  Change rest time (today only)             │  active mode only
│ ⊘  Ban this exercise                      ›  │  not in active mode
```

- The plate-calculator entry here is the pre-session/browse path,
  seeding from `suggested_load_kg` (or the top `per_set_load` entry);
  the per-set seed lives on the focused set row (§3.3).
- Items with nothing behind them do not render — no dead promises.

### 4.2 Swap (scope-bearing surfaces)

From today view / peek / program: a bottom sheet (host visually
recessed), three stages:

1. **Candidates:** ranked `getReplacementCandidates` with
   decision-support deltas vs. the current exercise (the MealPlan swap
   pattern — count-bearing affordances, differences not absolutes, a
   dead-band so trivial differences don't shout), `Show {n} more`, then
   free-catalog search. Free-search results carry their compatibility
   warnings inline — the constraint filter is deliberately bypassed
   there and the warning must survive.
2. **Scope row:** `( • ) Today only   ( ) Rest of block` — the
   `rest_of_block` copy states what it does ("this block's remaining
   weeks; later blocks re-plan from your base program") and that tier-1
   replacements restart at a conservative weight. Never the word
   "permanent" (`VISION-ARCHITECTURE.md:180`; the `'permanent'` scope
   value is translated at this boundary).
3. **Confirm:** `[ Make the swap ]` → receipt with `Undo` (D4).

The dialog-based swap dies; `ui/dialog` remains only where leaving
context is the point.

### 4.3 Ban

Today ban is a one-tap, no-confirm, no-undo destructive act
(`:1562-1582` → walks every week of every block, may drop slots
entirely, `mesocycle-edit.ts:216-218`). It becomes propose-and-confirm
everywhere it exists: the `⋯` entry opens a confirm card stating blast
radius ("removes {name} from your whole plan and future suggestions;
slots refill with the best alternative"), and the receipt carries the
durable Undo (D4) — which reverses **both** writes
(`exercise_exclusions` and the mesocycle) via `handleUnbanExercise`
(§7.6), or it is not offered. If the unban path slips a phase, the
receipt omits Undo entirely — never a dead Undo button.

### 4.4 What editing never does

- No inline remove-exercise / add-to-plan / reorder-plan / volume
  affordances: the pure editors do not exist
  (`VISION-ARCHITECTURE.md:644`), and the UI must not promise a
  capability with no edit layer behind it. `＋ Add unplanned work` is
  visually and verbally a *logging* act ("unplanned"), not a plan
  edit.
- Session-record reorder (`Do next` / `Move to end`) is labelled
  today-only sequencing and never touches the mesocycle.

---

## 5. Component and state architecture

### 5.1 The tree

```
main.tsx
└─ App                                  state: profile, mesocycle, pools,
   │                                    exclusions, handlers (unchanged)
   ├─ ActiveSessionProvider             owns useActiveSession state (§5.2)
   │  │                                 + initSetLogStore() at app root
   │  ├─ if route = '#/dev-test'  → DevTestPage        (below provider)
   │  ├─ if route = '#/train'     → ActiveSessionScreen (full-screen)
   │  │     ├─ SessionHeader            ✕ · day/focus · elapsed · Finish
   │  │     ├─ ExerciseRail             stops from groupExercises + order
   │  │     ├─ FocusedStop              RampStrip(ticks) · LoadChip ·
   │  │     │                           SetGrid · RpeChips
   │  │     └─ FinishSessionSheet
   │  └─ else                     → AppChrome
   │        ├─ header (sticky)          logo · OfflineStatusIndicator ·
   │        │                           New Plan
   │        ├─ WeeklyPlannerCard        REBUILT: NutritionPanel only;
   │        │                           hidden when tab === 'exercise'
   │        └─ Tabs value={route.tab}   CONTROLLED (App.tsx:918 today)
   │           ├─ nutrition → NutritionDisplay
   │           ├─ exercise  → ExerciseTab
   │           │     ├─ view 'today'   → TodayPanel
   │           │     │     ├─ ContextLine (+ expansion panel)
   │           │     │     ├─ WeekStrip          ← useTrainingWeek
   │           │     │     ├─ PeekPanel          (peekDay ≠ null)
   │           │     │     ├─ StaleRunStrip      (conditional)
   │           │     │     ├─ DeadLetterBanner   (conditional)
   │           │     │     ├─ SessionCard        IdentityLine ·
   │           │     │     │   WarmupSection · ExerciseList
   │           │     │     │   (SupersetGroup | ExerciseRow →
   │           │     │     │    RampStrip · LoadChip · CalibrationCue ·
   │           │     │     │    SetGrid) · FinisherRow ·
   │           │     │     │   AdditionalWorkSection · AddUnplannedWork
   │           │     │     └─ RestDayCard / ActiveRecoveryCard (rebuilt)
   │           │     ├─ view 'program' → ProgramPanel
   │           │     │     ├─ ProgramWeekList    (block-collapsible)
   │           │     │     ├─ ProgramWeekDetail  (‹ Wk n of N › stepper
   │           │     │     │                      + 7 day rows)
   │           │     │     └─ DevTestPanel       (dev-gated)
   │           ├─ meals     → MealPlan
   │           └─ chat      → ChatAssistant (forceMount, unchanged)
   ├─ BottomDock                        row A + row B (§3.6), one mount
   ├─ ProposalHost                      confirm sheets · receipts ·
   │                                    undo executor (pre-image slot)
   ├─ PlateCalculator                   global host, seeded per call
   └─ Toast host                        progression toast, hoisted
```

`ExercisePlan.tsx` decomposes as: **extracted** (logic preserved,
relocated): `formatRampSets` → `session-derive.ts`, ghost/PR/save
semantics → `SetGrid`, swap candidate plumbing → the swap sheet;
**rebuilt**: WarmupSection, RestDayCard, ActiveRecoveryCard,
WeeklyPlannerCard, week navigation (as ProgramWeekList/Detail), cardio
entry; **retired**: PhaseBanner, CalibrationBanner, SessionDurationNote,
SetLogger (P2, replaced by SetGrid), the bulk-log button, `jumpToBlock`,
the swap Dialog, `active_session_cache`, the four parallel completion
maps (`completedSetsMap`/`setWeights`/`setReps`/`savedSets`), the
tick-count RestTimer internals.

### 5.2 `useActiveSession` — the one state owner

Net-new hook (nothing by this name exists in the repo; it consolidates
`sessionDateContext`, the session cache, and the timer into one owner).
Provided by `ActiveSessionProvider`, consumed via context.

```
identity   profileId · date · dayName · liveWeek · status
           ('idle' | 'running' | 'finished') · startedAtIso
           — frozen per D7; liveWeek has NO exposed setter (D8)
read       ready: boolean          (initial getSetsForDate resolved)
           logs, cardioLogs        (raw, for the finish audit list only)
           setsFor(exerciseId)     → logs filtered: id-match, !is_warmup,
                                     !isMalformedZeroWeight — the ONLY
                                     source for checkmarks, counts,
                                     isComplete, progress, off-plan
                                     detection, and the strip's today
                                     overlay
           progress                {exercisesDone, exercisesTotal,
                                    setsDone, setsTotal}
           ghosts(exerciseId)      (P2+; from getLastSessionSets — one
                                    fetcher app-wide once SetLogger dies)
           prs                     session-accumulated PRResults
           offPlanWork             union(declared, detected) (§1.7 H)
           completionQueued · completionSyncedAt
write      start() · finish(): void · logSet(input) · deleteSet(...)
facade     advance() · jumpTo(stopIndex) · skip(stopIndex) ·
           moveToEnd(stopIndex) · addExtraSet(exerciseId) ·
           declareOffPlan(name) · undeclareOffPlan(name) ·
           logCardio(entry) · tickRamp(exerciseId, stepIndex) ·
           answerRpe(exerciseId, rpe) · dismissWarmup() ·
           setRestOverride(exerciseId, seconds) ·
           setBorrowedPrescription(sourceDay)
rest       restEndsAt · restExerciseId · startRest(exerciseId) ·
           adjustRest(±seconds) · dismissRest()
```

Rules:
- Every write goes through `set-log-store` (`saveSet`/`deleteSet`) or
  the App-level mutation handlers. The hook adds **no** new write path
  to the plan.
- The hook does **not** subscribe to `subscribeSyncState`
  (`notifyListeners` fires per queue mutation and per flush iteration —
  binding the session view to it means 20 saves → 20 re-render storms).
  `OfflineStatusIndicator` is the app's sole subscriber (§6.5).
- `refresh()` re-runs `getSetsForDate` on `logsVersion` bumps (chat
  logging) and on return from peek/program.
- `useTrainingWeek(profileId, sessionDate)` is a sibling hook:
  `getWeeklyDashboard` over the dev-clock-derived Mon–Sun window,
  refetched on mount, `logsVersion`, and peek-return; never bound to
  sync state; today's cell overlaid from `setsFor`.

### 5.3 Routing

`useHashRoute` (`App.tsx:30-38`) generalises into `src/lib/app-route.ts`:

```
Route =
  | {kind:'tab', tab:'nutrition'|'exercise'|'meals'|'chat'}
  | {kind:'program', week?: number}      #/exercise/program[/{n}]
  | {kind:'train'}                       #/train
  | {kind:'devtest'}                     #/dev-test
```

- `<Tabs value onValueChange>` becomes controlled from the route — the
  prerequisite for every cross-surface navigation (planner → session,
  chat → session, deep links, back-button).
- **Initial route (interim answer to vision Q1):** `#/exercise` when
  today is a training day and today's session is unfinished; otherwise
  the last-used tab (localStorage), defaulting to nutrition. The
  landing decision moves to the dashboard when Phase G ships; this is
  recorded in §9 so the divergence isn't silent.
- `SurfaceContext` for chat (vision `:587`) is defined **once**, in
  `app-route.ts`:
  `{screen: 'session'|'active_session'|'program'|'nutrition'|'meals'|
  'chat', day, week, date, exerciseId?, slot?}` — `date` is an addition
  to the vision's five fields (a chat log at 00:15 must resolve against
  the frozen run date); `slot` is unset outside meals; `exerciseId` is
  the focused stop in active mode, unset elsewhere.

### 5.4 The persisted session record (one key, one schema — D6)

`localStorage['fitplan_active_session_v1:<profileId>']` — a map keyed
`date`, capped at 2 entries (so yesterday's stale run survives long
enough for the stale-run resolution, §3.7):

```
{
  profileId, date, dayName, liveWeek,          // identity, frozen (D7)
  status: 'running' | 'finished',
  startedAtIso, finishedAtIso?, lastActivityIso,
  planFingerprint,          // hash of the day's (name, sets) list —
                            // "plan changed while you were away" strip
  cursor,                   // focused stop index into order
  order: number[],          // stop order as ORIGINAL exercise indices
  skipped: number[],
  swaps: [{exIndex, from, to}],
  prs: PRResult[],
  drafts: { '<exerciseId>:<setNumber>': {weight, reps, isBodyweight} },
  extraSetNumbers: { '<exerciseId>': number[] },
  declaredOffPlan: string[],
  borrowedPrescription?: {sourceDay, exercises},
  restEndsAt?, restExerciseId?, restOverrides: {'<exerciseId>': seconds},
  rampTicks: string[],      // '<exerciseId>:<stepIndex>'
  rpeAnswered: string[],
  warmupDismissed: boolean,
  celebrated: string[]      // first-ever-log toast dedupe
}
```

Canonical names, no aliases: `status` (never `phase`), `cursor` (never
`focusedStopIndex`), `drafts` plural keyed `${exerciseId}:${setNumber}`.
**Not in the record:** anything derivable from the store — no completed
maps, no weights/reps copies. Hydration on mount: same `profileId` +
(`date` matches, or within the 6-hour grace) → restore as-is; otherwise
run the stale-run resolution (§3.7). The undo pre-image (D4) lives in
its own single-slot key, `fitplan_plan_undo_v1:<profileId>`. Both keys
join `handleReset`'s clear list (which today clears three keys nothing
ever writes — `App.tsx:793-795` — and misses the live ones).

### 5.5 Ownership boundaries (the no-fork rules)

| Fact | Sole owner | Everyone else |
|---|---|---|
| Logged sets, pending queue, dead letters, session registry, `clientId`, `completedAt`, set coalescing | `set-log-store` (module + localStorage) | read via `getSetsForDate` / `getLastSessionSets` only |
| Checkmarks / counts / completion | derived from `setsFor` | never a parallel map — the four current copies (§6.6 of the component read) collapse to one |
| Session identity, cursor, timer deadline, drafts | `useActiveSession` + its record | components render props; no local mirrors |
| `liveWeek` | frozen in the record | **no setter exists outside the hook** — grep-gated |
| `browseWeek`, `peekDay`, expansion state | `ExerciseTab` / view-local | never persisted, never touch writes |
| Plan (mesocycle) | App state + `mesocycle-edit` → persistence | UI passes intents up; `exIndex` always the original array position |
| Sync status | `set-log-store` singletons | `OfflineStatusIndicator` is the sole subscriber |
| The dev clock | `dev-clock.ts` | **no `new Date()` in any view** — always `getAppNow` / `getSessionDateContext`; `date` and `dayName` stay separate fields (a day-only override legitimately makes them disagree) |

### 5.6 The dev/QA path

`devBypassLocks` gets **one** definition: it unlocks logging on
`peekDay ?? dayName` — one day at a time, never all seven (today it
makes all seven days "today" simultaneously, `:1300`). When bypassing,
`logSet` stamps `day: bypassDay` while `date` remains
`sessionDateContext.date` — the same two-field split the day-only
override already relies on. Any loggable non-today surface renders a
persistent `DEV · {day}` marker. `#/train` accepts an `overrideDay`
param for QA entry. `devOverrideWeek`/`devOverrideDay` keep their
existing meanings (they feed session identity at freeze time).

---

## 6. Consistency across tabs (and where chat lives)

### 6.1 Shared idioms this design establishes

| Idiom | Rule | Exercise | Elsewhere (follow-up, not this round) |
|---|---|---|---|
| Collapse | `ui/collapsible` + counted label (`▸ Warm-up · 4 moves`) | §1.5, §2.4 | MealPlan's hand-rolled disclosure migrates; Nutrition's always-open history collapses |
| Empty, two grades | full recovery card w/ action vs. one-line dashed row | §1.8 vs. row-level | already MealPlan's pattern — keep |
| Loading ≠ empty | skeleton + `—/—`, never `0/N` | §1.9 | NutritionDisplay's WeighInCard gains a loading state |
| Busy | per-item `Loader2` swap, never global | set grid, swap sheet | already MealPlan's pattern |
| Today-marker | any 7-day render marks today | week strip | Nutrition's weekly table gains one |
| Disabled-with-reason | dead controls explain themselves | planner's interim Complete button (§7) | keep MealPlan's |
| ≥44px targets | every tap target | RPE chips, ✓, ⋯, stopwatch | cardio RPE strip reduced to six chips (§6.3) |

### 6.2 Provenance vocabulary (three states, app-wide)

`estimated` ("suggested", dashed chip) / `you told us` (confident
chip) / `from your log` (confident chip) — Exercise is the source of
truth; `known_weight` is a deliberate third state
(`ExercisePlan.tsx:65-74`), not collapsible into the other two without
lying. Nutrition's `(onboarding)` suffix maps to `you told us`; a
logged weigh-in maps to `from your log`. Bodyweight/no-load renders no
chip. Chip classes stay the structural distinction; colours are the
styling pass's.

### 6.3 What changes on the other tabs for coherence (noted, not designed)

- **MealPlan:** swap gains an error path (today a rejected `onSwap`
  strands the panel silently); `Regenerate all` is a plan mutation
  behaving append-only — it should eventually take the confirm-card
  shape; count-in-affordance and delta-display patterns flow *from*
  Meals *to* the Exercise swap sheet (§4.2).
- **NutritionDisplay:** WeighInCard eventually adopts the local-first
  shape (today server-first with no optimistic write — the inverse of
  the Exercise contract); static reference cards (profile, energy)
  are the same disease as the phase banners and should compress the
  same way.
- **Cardio RPE strip:** six chips (5–10) at ≥44px, replacing the
  ten-button row — same control, same answer, both surfaces.

### 6.4 One cardio path

`CardioLogger` (mounted at `App.tsx:978`) is retired in P2; the
session surface's Finisher row (prescribed) and `＋ Add unplanned
work` (ad-hoc) are the two entry points — one per *kind*, never two
routes to the same kind.

### 6.5 Offline status

`OfflineStatusIndicator` stays a real subscribing component — it is
the app's only surface for dead-letter review/retry/discard
(`OfflineStatusIndicator.tsx:6-38`) and must not be reduced to a
static token. It mounts once, in the AppChrome header; collapsed to a
single glyph shown only when `queuedCount > 0 || deadLetterCount > 0`;
tap opens the existing review panel. The session view's dead-letter
banner (§1.9) links to the same panel so a failed set is visible
mid-session.

### 6.6 Where chat lives

- **This round:** the persistent tab stays exactly as is
  (force-mounted, state-preserving). The dock's `💬` summon routes to
  the chat tab and attaches the current `SurfaceContext` (§5.3) to the
  next message — so "swap this" resolves against the focused exercise.
  `buildContext` gains `screen/day/week/date/exerciseId` from the
  route + session identity (small, additive, listed in §7.6).
- **Later (vision Q5's full answer):** a summonable overlay hosting
  the *same single ChatAssistant instance* (portaled — two instances
  would fork the transcript, double-write the cache key, and break the
  `[data-chat-send]` global-click hack, `ChatAssistant.tsx:934`). The
  overlay needs host-driven height, `visualViewport` handling, and a
  re-entrant scroll latch — real work, deliberately out of this
  round's scope. The dock reserves the summon slot so the overlay
  drops in without moving anything. Open question Q4 (§8) confirms
  the sequencing.

---

## 7. Build phases

Four slices. Each leaves the app fully working; the old rendering is
removable only at the end (P4). Three invariants make a phase legal:

- **F1 — No forked facts.** A phase may not add a new owner for a fact
  without deleting the old owner *in the same phase*. Where a phase
  cannot delete yet, the new owner does not ship yet either (this is
  why `ghosts` ships in P2, not P1).
- **F2 — Writes are single-path at every commit.** The legacy path
  stops writing a fact in the same commit the new path starts.
- **F3 — Session identity is stamped in exactly one function**
  (`start()` / hydration in `useActiveSession`), from
  `getSessionDateContext` + `getActiveMesocycleWeek`, from P1 onward.

### 7.1 Phase table

| Phase | Ships | Old rendering | Visual change | Gates |
|---|---|---|---|---|
| **P1 — Ownership lift** | `app-route.ts` + controlled Tabs + initial route; `ActiveSessionProvider` + hook v1 (identity, `logs`, `setsFor`, write facade, rest, status — **no ghosts**); session record v1; `BottomDock` v1 (deadline timer, row A only); `initSetLogStore()` at root; offline indicator → header; planner hidden on Exercise | Everything — `ExercisePlan` renders as today, reading the timer/logs it used to own via context | Small, confined: rest timer look/controls (no pause, ±30s), offline indicator position | `tsc` · `test:logging-roundtrip` · **new** `test:session-derive` · **new** `test:no-forked-state` · manual: timer survives tab switch + reload |
| **P2 — Today-first** | `ExerciseTab`, `TodayPanel` + all leaves (§5.1); `SetGrid` **replacing `SetLogger` in the same commit** (ghosts move into the hook — one fetcher); `RampStrip` module + rep-only variant; `WeekStrip` + `useTrainingWeek` + `PeekPanel`; rebuilt rest/recovery cards; cardio wrapper; keyboard handling; `CardioLogger` + planner `DayPill`/`TrainingPanel` deleted; `DevTestPanel` → program view | Legacy `DAY_ORDER.map` becomes the **read-only program stand-in** behind `#/exercise/program` (all days `isToday=false`; swap/ban functional; loggers never render) | Large — the headline change | `tsc` · **extended** `test:ramp-visibility` (§7.5) · `test:session-derive` · manual: keyboard on 375px viewport (iOS + Android) |
| **P3 — Active mode** | `ActiveSessionScreen` at `#/train` (rail, focused stop, RPE, wake-lock toggle); `FinishSessionSheet` + `finish()` PendingOp; `ProposalHost` (confirm sheets, receipts, persisted-pre-image undo); mid-session immediate swap; ban → propose-and-confirm + `handleUnbanExercise`; planner Complete button removed (interim: disabled-with-reason on dates with logged sets); chat `SurfaceContext` plumbing | Program stand-in unchanged | Large — the session experience | `tsc` · **new** `test:mesocycle-roundtrip` (ban→undo restores exclusions **and** `created_at`) · `test:logging-roundtrip` · manual: finish offline, resume after kill, midnight grace via dev clock |
| **P4 — Program rebuild & demolition** | `ProgramPanel` (`ProgramWeekList` + `ProgramWeekDetail`), `browseWeek` stepper; **`ExercisePlan.tsx` deleted**, with `SetLogger`, `WarmupSection`-legacy, the swap Dialog, `jumpToBlock`, `active_session_cache`, `offline-sync.ts`'s cache API | Nothing | Moderate — browse gets tidy | `tsc` · full suite · grep: no `ExercisePlan` import, no `active_session_cache` reference |

### 7.2 P1 notes

- P1's hook exposes `logs`/`setsFor` but `SetLogger` keeps `inputs`/
  `savedSets`/`ghostValues` until P2 — that is legal under F1 only
  because the hook's `logs` replaces `todayLogs` (deleted same
  commit); ghosts stay single-owner by *not* shipping in the hook yet.
- Day-keyed legacy states (`customExercises`, `addingCustom`,
  `addingCardioFinisher`) stay in `ExercisePlan` until P2 — the legacy
  loop still needs their day keys; the hook's flat `declaredOffPlan`
  arrives with the single-day surface that makes flat correct.
- `sessionLogged` survives as a local boolean inside the legacy
  bulk-log branch until P3 deletes the branch (its replacement,
  `status:'finished'`, has no trigger until Finish exists).
- The E6/E8 stale-closure effects (`:871-884`, `:931-950`) die in P1 —
  their jobs (cache restore, external refresh) move into the hook's
  hydration and `refresh()`.

### 7.3 P2 notes

- The stand-in program view is explicitly temporary and read-only:
  strip taps peek in place; the context line routes to the stand-in;
  `ProgramWeekList/Detail` land in P4. Until then block navigation is
  week-stepping on the stand-in — reachability is preserved, the nice
  IA waits.
- `WeeklyPlannerCard` deletions (DayPill grid, TrainingPanel) happen
  here; `NutritionPanel` + calendar header survive on
  nutrition/meals/chat.

### 7.4 What will fight this (from the component read, §7.1–7.13)

- `currentWeek`'s dual purpose — dissolved by D8 in P1.
- ~15 per-day derivations inside two nested closures — hoisted into
  `session-derive.ts` pure functions in P2 (`groupExercises`,
  `rowList`, `offPlanWork`, anchor resolution), each unit-tested
  rather than re-closed-over.
- `exIndex` positional addressing — every list transform carries
  original indices (`order`, `groups[].members[].exIndex`);
  round-trip asserted.
- Name-keyed vs id-keyed state — all new state is id-keyed;
  name-keyed survivors (`progressedLoads`, PR cache) are confined:
  progression map computed for the session day only and *passed only
  to the today surface*; peek/program receive `{}`.
- Undeclared-dependency effects — none survive; the hook's effects
  declare their inputs, and `test:no-forked-state` greps for the old
  patterns.
- `devBypassLocks` making seven days live — replaced by the one-day
  rule (§5.6) in P2.

### 7.5 Test gates (new/extended)

- **`test:session-derive`** (new, pure): `groupExercises` exIndex
  round-trip · `rowList` gap semantics (log 1–4, delete 2 → `[1,3,4]`,
  add → `5`) · `setsFor` filters (warmup + malformed excluded) ·
  calibration anchor resolves to exactly one row for every generated
  calibration-week day · `offPlanWork` includes a chat-logged fixture
  · `reEvaluatePR` snapshot · PeekPanel receives no `logSet`.
- **`test:ramp-visibility`** (extended, three assertions): (A) every
  tier1 externally-loaded exercise with matching `ramp_up` yields a
  non-empty, floored, plate-rounded kg list; (B) every
  `warmup.ramp_ups`-named exercise with `suggested_load_kg == null`
  yields the rep-only variant; (C) every stale-named `ramp_up` yields
  null **and** is flagged for the generic block — and no
  `ramp_ups` entry may be orphaned by the §1.5 deletion (count check).
- **`test:no-forked-state`** (new, grep-level): `setCurrentWeek`/
  `setLiveWeek` absent outside the hook · `new Date()` absent in view
  components · `getLastSessionSets` has one call site per phase ·
  literal `'custom:'` absent · `subscribeSyncState` only in
  `OfflineStatusIndicator` · `DevTestPanel` has one mount site.
- **`test:mesocycle-roundtrip`** (new, P3): swap→undo and ban→undo
  restore the mesocycle byte-equal, the exclusions array, and
  `created_at` (via `preserveCreatedAt`).

### 7.6 Required non-presentational prerequisites

The complete list of library/mutation work this "presentation-only"
round needs — anything not here does not change:

| # | Item | Phase |
|---|---|---|
| 1 | `set-log-store.getSessionIdForDate(userId, date)` export | P3 |
| 2 | PendingOp kind `'finish'`, drained by the existing flush loop | P3 |
| 3 | `markSessionCompleted(sessionId, finishedAtIso?)` — accept a dev-clock-correct timestamp | P3 |
| 4 | `progression-engine.projectNextLoad(name, sessionSets, repHigh)` extracted; the fetch wrapper delegates to it | P3 |
| 5 | Optimistic, retriable cardio write wrapper around `insertCardioLog` (visible failure, offline queue) | P2 |
| 6 | `App.handleUnbanExercise(name, preImage)` — exclusions re-read/remove/write + `saveMesocycle(pre, preserveCreatedAt)` | P3 |
| 7 | `formatRampSets` exported from `session-derive.ts` + rep-only variant | P2 |
| 8 | `visualViewport` keyboard inset handling (net-new; nothing exists) | P2 |
| 9 | `buildContext` gains `screen/day/week/date/exerciseId` from `SurfaceContext` | P3 |
| 10 | `useHashRoute` → `app-route.ts` Route parser; Tabs controlled | P1 |

---

## 8. Open questions (your taste, one answer each)

**Q1 — Rest-day treatment: how much should a rest day show?**
The design (§1.8) gives it calm copy, the week tally, a
tomorrow-preview line, an activity log, and `Train anyway`.
*Alternatives:* (a) as designed — **recommended**: the preview and
tally reward the visit without inviting work; (b) more minimal — just
"Rest day" and the strip, nothing else (calmest, but the tab feels
dead 2–3 days a week); (c) recovery-forward — add stretching/mobility
guidance content (more value, but it's new content the app doesn't
have and edges toward another banner problem).

**Q2 — Week strip: marks only, or richer cells?**
As designed, seven cells with the six-glyph vocabulary and nothing
else. *Alternatives:* (a) marks only — **recommended**: the strip is
orientation, the peek is detail, and glyph+label+volume per cell
recreates density; (b) marks + focus initial (`Ps`, `Pl`, `Lg`) —
more informative at a glance, slightly busier; (c) marks + tiny
volume bar per day — most informative, most busy, and volume data
needs the week read to resolve before the strip is stable.

**Q3 — Program context on the workout screen: how much?**
As designed, one tappable context line (`Wk 3/16 · B1 Hypertrophy ·
~52 min ⌄`) and nothing else program-shaped on the today view.
*Alternatives:* (a) as designed — **recommended**; (b) add a
block-progress dots row under the context line (nice orientation,
+1 permanent line for information that changes weekly, against the
Daily Space Rule); (c) identity only — drop even the context line and
put week/phase solely behind the program route (maximal calm, but
"what week am I in" becomes two taps and the calibration/deload
tokens lose their home).

**Q4 — Chat: route-with-context now and overlay later, or overlay
now?**
As designed (§6.6), the dock's 💬 routes to the chat tab carrying
`SurfaceContext`; the overlay (same instance, portaled) is a later
round. *Alternatives:* (a) as designed — **recommended**: mid-set
chat works on day one at near-zero cost, and the overlay's real
engineering (portal, keyboard, scroll latch) doesn't block the
layout round; (b) build the overlay in P3 — better mid-set ergonomics
(no context switch), at the cost of the ChatAssistant surgery
becoming a dependency of this round; (c) overlay only, demote the tab
— the vision's fallback, but it removes a working surface while its
replacement is newest code in the app.

---

## 9. Reconciliation with VISION-ARCHITECTURE.md

| Vision says | This design | Which gives |
|---|---|---|
| §6.3 today-first: today expanded, week collapses to a strip, week nav secondary (`:593`) | Adopted wholesale — §1 | — |
| §6.3 wireframe: strip **below** the exercise list, six days (`:609`) | Strip at the **top**, seven cells with today boxed (§1.3) — reach + peek-entry argument | **Vision gives** (explicitly, recorded here) |
| §6.3 wireframe: `[ Start session ]` inside the card | Row B of the fixed dock (D2) — reachability under scroll | Vision gives |
| §6.4 C1 merges as a *mode*, four open questions (`:621-627`) | Mode **with an address** (`#/train`, D5). Q1 answered: route + provider-above pattern; Q2: Finish calls `markSessionCompleted`, never auto (D7); Q3: no — C1 assumes the new single-day host; Q4: one bottom region with fixed precedence (D2) | Vision's questions answered, its recommendation kept |
| §6.2 chat: tab **and** overlay (`:587`) | Tab + context-carrying route this round; overlay deferred with its slot reserved (§6.6, Q4) | Timing gives, not the position |
| §2 action-safety: observations immediate, parameters proposed (`:163`); tap-path carve-out (`:714`) | D3 implements exactly this; the mechanical scope rule is the carve-out made precise | — |
| `propose_exercise_ban` demoted to proposing (`:177`) | Ban is propose-and-confirm everywhere, absent from active mode (§4.3) | — |
| Never call a swap "permanent" (`:180`) | Scope row reads `Today only / Rest of block`; translation at the boundary (§4.2) | — |
| Undo: 10 minutes or next mutation on target (`:286`); Q4 mandatory pre-image (`:689`) | D4: persisted pre-image, single slot, honest 10-minute claim | — |
| Reuse table: `ExercisePlan` modified in place (`:659`) | P1–P3 modify around it; P4 deletes it. The commitment's substance (no parallel rewrite while it lives) is honoured; the file's survival is not | Vision gives at P4 |
| §7.2 Phase F depends on A2 (append rail) (`:648`) | Active mode ships receipts/undo via `ProposalHost` — a narrow, session-scoped subset of A2's rail, not the full `pending_actions` architecture. Stated as scaffolding A2 replaces, not a fork of it | Sequencing gives; invariants kept |
| Q1 landing: Dashboard (`:684`) | Interim: `#/exercise` on unfinished training days, else last tab (§5.3) — revisited when the dashboard exists | Deferred, recorded |
| Dashboard owns the program narrative (Phase G) | Context-line expansion is the interim home (§1.2) | Timing only |

---

*End of document.*

