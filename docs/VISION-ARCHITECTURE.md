# Vision Architecture — chat-first app, memory, progressive onboarding

**Status:** design only. No code, no migrations, no commits.
**Method:** 5 subsystem readers mapped the real code; 7 designers drafted sections against that map; 2 adversarial reviewers found 89 defects across the draft. This document is the reconciled result — where the drafts disagreed, the conflict and its resolution are stated inline.

---

## 0. Read this first — eight live defects found while mapping

These are **not** design gaps. They exist in `main` today and were found by reading the code for this document. Several are prerequisites for the work below.

| # | Defect | Evidence | Severity |
|---|---|---|---|
| 1 | **`replace_exercise` guard asymmetry.** Server declines only on `permanent === true` (`chat-gemini/index.ts:1347`); client takes the permanent branch on `permanent !== false` (`ChatAssistant.tsx:560`). An **omitted** `permanent` slips past the server guard and executes a client-side UPDATE against `exercise_plans`. | both files | **High** — a plan mutation still executes unconfirmed |
| 2 | **`injuries` and `exercise_exclusions` are the same column.** `App.tsx:327` writes injuries into `exercise_exclusions`; `:136`/`:149` read it back as both. After one `ban_exercise`, `profile.injuries` contains exercise names. | `App.tsx` | **High** — corrupts the injury filter |
| 3 | **`log_workout_set` reports failure on success.** Server writes `exercise_set_logs` (`:1283-1331`) and returns an action; the type is absent from the `PlanAction` union (`types.ts:322`) so `applyPlanAction` falls through to `return false` (`ChatAssistant.tsx:665`). User is told "Action failed" about a write that landed. | both files | Medium |
| 4 | **`ban_exercise` double-writes `exercise_exclusions`** — once in `applyPlanAction` from a fresh DB read (`:632-643`), then again in `handleBanExercise` from possibly-stale state (`App.tsx:694-701`). The second can clobber the first. Returns `true` unconditionally. | both files | Medium |
| 5 | **`swapPoolMeal` fuses a plan change with a ledger write.** It unconditionally calls `recordMealEvent({eventType:'swapped_in'})` (`meal-store.ts:299-331`), and `getTodayLedger` sums `confirmed\|swapped_in\|extra`. Browsing meal alternatives inflates calories-in. | `meal-store.ts` | Medium |
| 6 | **Onboarding's known-lift answers have no home.** `known_squat_kg` / `known_bench_kg` / `known_deadlift_kg` / `skip_calibration_week` exist in `UserProfile` and influence the first `generateMesocycle`, but have **no column in any of the 28 migrations**, are absent from the INSERT (`App.tsx:303-335`) and from `restoreSession` (`:113-147`). They are irrecoverable on reload. | migrations + `App.tsx` | Medium |
| 7 | **`retryMessage` re-executes actions** (`ChatAssistant.tsx:778-824`) with no idempotency key. Set logs and metrics are upserts so they survive; `favorite_meals.times_used` double-increments. | `ChatAssistant.tsx` | Low |
| 8 | **`replace_food` advertises a `Post-Workout` meal slot** (`:247`) that cannot exist — `MealSlotName` is a closed four-value union with a DB CHECK; inserting one dead-letters as a permanent `23xxx`. | `chat-gemini/index.ts` | Low |

Defects 1–4 should be fixed in Phase A0 below, before any new chat work.

---

## 1. Memory & goals

### 1.0 The governing idea

**Memory is a compiler, not a mutator.** Facts are stored as typed rows. A pure module (`src/lib/fact-compiler.ts`, new) reads them and emits *the arguments the existing pure generators already accept* — chiefly the `exclusions: string[]` parameter of `generateExercisePlan(profile, exclusions)` (`exercise-plan.ts:2492`) and a `DietRuleSet` for the meal pipeline. No generator learns about memory. No memory row writes plan state.

This is the single most important structural property: it means memory can never bypass the edit layers, because it never writes at all.

### 1.1 Discriminator: typed satellites, not polymorphic jsonb

**Decision: a `user_facts` spine plus per-kind satellite tables.**

The rejected alternative — one table with `kind` + `payload jsonb` — cannot express the one constraint that matters: *this fact's target resolved to at least one real exercise/food*. The entire bug class this schema exists to prevent is an unresolved reference silently becoming a no-op. jsonb hides exactly that.

> **Conflict resolved:** the build-sequencing draft shipped the polymorphic version. The typed version wins; the reasoning above is why.

**`user_facts` (spine)**

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid NOT NULL FK → `fitness_profiles` CASCADE | |
| `kind` | text CHECK IN (`preference`,`timing_rule`,`availability`,`injury`,`known_metric`) | determines which satellite must exist |
| `class` | text NOT NULL CHECK IN (`plan`,`context`) | **the barrier.** Only `plan` is visible to the compiler |
| `status` | text CHECK IN (`proposed`,`needs_clarification`,`blocked`,`active`,`superseded`,`retired`) | |
| `precedence_tier` | smallint 1–7 | denormalised so ordering is one indexed sort |
| `source` | text CHECK IN (`chat`,`manual`,`onboarding`,`derived`) | mirrors `MealEventSource` |
| `source_message_id` | uuid NULL FK → `chat_messages` **ON DELETE SET NULL** | lets the memory UI deep-link "you said this, here". `SET NULL` is required — `handleClearChat` deletes all messages |
| `raw_phrase` | text NOT NULL | verbatim, never rewritten |
| `display_text` | text NOT NULL | the only string the prompt and memory UI render |
| `supersedes_id` | uuid NULL FK → `user_facts` **ON DELETE SET NULL** | edits are new rows |
| `effective_from` / `effective_until` | date NULL | fixes the binary-permanent injury model: "sore this week" and "torn labrum" are indistinguishable today, and both delete ~36 exercises forever |
| `reinforcement_count` | int DEFAULT 1 | drives retrieval ranking |
| `blocked_reason` | text NULL | populated when the viability check fails |
| `client_id` | text, partial UNIQUE WHERE NOT NULL | same idempotency mechanism as `exercise_set_logs` / `meal_events` |
| `created_at` / `confirmed_at` / `retired_at` | timestamptz | |

Indexes: `(profile_id, status)`, `(profile_id, kind, status)`, partial unique on `client_id`.
Satellites denormalise `profile_id` so per-kind partial uniques are expressible without a trigger.

**`fact_preference`** — `domain` (food\|exercise), `polarity` (like\|dislike), `hardness` (**hard**=filter, **soft**=rank), `target_phrase`, `target_kind` (item\|family\|pattern\|tag), `resolved_refs text[]`, `resolution_status`, with
`CHECK (resolution_status <> 'resolved' OR cardinality(resolved_refs) > 0)`.

`resolved_refs` stores **stable slugs**, not display names. Names are compile-time strings in a 2094-line const array; renaming "Barbell Bench Press" would silently orphan every stored ref (exact-match filter → no error → exercise reappears). The compiler resolves slug→name at compile time and fails loudly on an unresolvable slug.

**Category expansion happens at write time.** "I hate lunges" stores `target_kind='family'` and expands `resolved_refs` to every matching `EXERCISE_DATABASE` entry — so a category fact exists without touching either exact-name filter site (`:2529`, `:2483`), which must stay byte-identical or a banned exercise returns via rotation.

**`fact_timing_rule`** — `subject_kind`, `subject_refs text[]`, `relation` (before\|after\|on_day\|not_on_day), `anchor` (training\|wake\|sleep\|slot), `anchor_ref`, `window_minutes`, `effect` (forbid\|prefer\|require), with `CHECK (anchor <> 'slot' OR anchor_ref IS NOT NULL)`.

> **Conflict: timing rules vs the day-agnosticism of `meal_plan_slots`.** The M0 migration deliberately has no day-of-week column — "any pool option is valid for its slot any day". **The pool model does not give; assembly does.** A pool option is a recipe, not a schedule. Timing rules become a predicate filtering each slot's candidate list inside `assembleDay` (`meal-generation.ts:373`), which is already pure and per-day. `meal_plan_slots` is untouched.

**Prerequisite:** resolving "before training" needs to know when the user trains. `preferred_time` is two-valued because `OnboardingFlow.tsx:337` collapses the five-way answer at submit. Rules with `window_minutes IS NULL` work today; windowed rules need that granularity restored. (Note: a `training_time_preference` column exists from `20260709190815` and is read by nothing — **do not resurrect it**; that is how `weekly_schedule` became a ghost field.)

**`fact_availability`** — `weekday`, `availability` (unavailable\|available\|constrained), `max_minutes`, `equipment_override`. The last two are designed in now but unused: `stageTimeCap` and `enforceDayDurationBudget` already take per-day `budgetSeconds`; only `getDurationBudgetSeconds` is global.

**`user_goals`**

Key columns: `metric` (body_fat_pct\|body_weight_kg\|lift_1rm_kg\|lift_working_kg\|sessions_per_week\|waist_cm\|custom), `metric_ref`, `direction`, `baseline_value`, `baseline_captured_at`, `baseline_source`, `target_value`, `deadline`, `priority` (1\|2), `status` CHECK IN (`needs_baseline`,`active`,`achieved`,`missed`,`abandoned`,`superseded`), `implied_levers jsonb`, `client_id`.

**Decision #4 as a database constraint:**
```
CHECK (status <> 'active' OR (baseline_value IS NOT NULL
       AND baseline_captured_at IS NOT NULL AND target_value IS NOT NULL))
```
Plus a partial UNIQUE `(profile_id) WHERE priority = 1 AND status = 'active'` — at most one primary goal, structurally.

**No `goal_measurements` table.** A pure `readGoalSeries(goal)` dispatches to what exists: body weight → `getDailyMetrics`/`getLatestWeightKg` (available today); body fat → `daily_metrics.body_fat_percentage` (column exists; adding a second input to the existing WeighInCard is the whole cost); sessions/week → `workout_sessions`. **Lift goals are *not* baseline-able today** — `pr-engine.ts` is a one-shot localStorage cache seeder whose own comment says DB-backed PRs land later. A lift goal must derive from `getLastSessionSets` or wait.

**`user_context_facts`** (class b) — separate table entirely. Tone/context only. It is unreachable by the compiler because the compiler's only input query filters `class='plan'` on a different table.

### 1.2 Consumption — what reads each fact

| Fact | Compiles to | Consumed at | Notes |
|---|---|---|---|
| Hard exercise dislike | `exclusions: string[]` | `generateExercisePlan(profile, exclusions)` `:2492`, `getConstrainedPool` `:2476` | The existing, proven channel |
| Soft exercise dislike/like | ranking | **Scoped to `getReplacementCandidates` only** | See conflict below |
| Hard food exclusion | `DietRuleSet.excludedFoodRefs` | `verifyProposal` diet gate, alongside `validateMealAgainstDiet` | Fail-closed, same as diet-rules |
| Soft food preference | score bias | `assembleDay` candidate scoring | |
| Timing rule | per-day predicate | `assembleDay(pools, targets, ctx)` | New `ctx.dayContext` |
| Availability | `training_days` | `generateExercisePlan` `:2555` | |
| Injury | `injuries` (once separated from exclusions — defect 2) | injury filter | |

> **Conflict: soft exercise preferences claim to reorder `rotateVariation`.** They can't cheaply — `rotateVariation` already takes 6+ positional params and is called *inside* `generateMesocycle`, a pure sync function with no fact parameter. Threading a ranker through means changing two exported signatures, `generateMesocycle`'s parameter list, and `dev-constraint-audit.ts`'s independent copies.
> **Resolution:** scope soft exercise preferences to `mesocycle-edit.getReplacementCandidates` (swap-dialog ordering) and **say plainly that rotation is unaffected.** Revisit only if it proves to matter.

### 1.3 Conflict resolution

**Precedence (highest first):** 1 medical/injury → 2 hard dietary → 3 hard user exclusion → 4 availability → 5 goal-implied lever → 6 soft preference → 7 tone.

**"No chicken" against chicken-heavy pools.** The fact activates immediately (it is a filter input). Existing pools are **not** silently regenerated — that would be an unconfirmed plan mutation. Instead: affected pool options are suppressed from `assembleDay`'s candidate list at render, the Meals tab shows what was suppressed and why, and a `propose_meal_regenerate` card offers to rebuild the affected slots. If suppression empties a slot: that slot renders the escalation card, `mealTotals` excludes it and is labelled incomplete, and the chat-context adapter omits it so the model cannot claim a meal exists.

**Two goals that fight.** `implied_levers` records each goal's directional demand (e.g. aggressive cut ⇒ calorie deficit; strength PR ⇒ surplus/maintenance). Sign-opposition is detected in code at goal-activation time and surfaced as a *choice*, never auto-resolved: "These pull opposite ways. Which is primary?" With a deadline, feasibility arithmetic can quantify it; without one, degrade to sign-opposition only and say so.

**A memory contradicting an onboarding answer.** The memory wins for *future* compilation (it is newer and more specific), the onboarding answer is marked superseded, and the change is surfaced. If the contradiction implies a plan change, that arrives as a proposal.

**A memory that would make the plan ungeneratable.** `assertPlanViable(profile, compiledFacts)` runs *before* a fact activates and checks: ≥1 available training day; pool size and pattern coverage per track; every per-day `max_minutes` above the warmup floor (`getWarmupReserveSeconds` clamps at 390s — a 5-minute day yields a negative exercise budget). On failure the fact is stored with `status='blocked'` + `blocked_reason`, visibly, and the chat explains the conflict. **Never silently inert.**

### 1.4 Lifecycle and the memory UI

Facts are written **client-side, local-first**, through `memory-store.ts` mirroring `set-log-store`'s queue/dead-letter pattern. The edge function returns an *intent*; it never writes `user_facts` with a service key. (Two writers on one table, one of them server-side and unauditable, is the exact shape of the trace-report defect.)

The *payload* is immutable — edits create a new row with `supersedes_id`. Lifecycle/telemetry columns (`status`, `reinforcement_count`) are mutable; say so rather than claiming "facts are immutable".

**Does an extracted fact need confirming before it affects a plan?** Split by blast radius:
- **Hard exclusions and injuries** — confirm. They remove options and can cascade into a regeneration.
- **Soft preferences and tone** — auto-activate with an undo-only receipt.

> This is a deliberate, named carve-out from Decision #1: a soft preference biases which meal you're offered without removing anything. It is safe *because* soft facts provably cannot enter `compileExclusions` or `excludedFoodRefs` — the compiler routes on `hardness`, and a build-time assertion enforces it.

**The memory UI** ("What I know about you") is a first-class screen listing every fact grouped by kind, each showing `display_text`, `raw_phrase`, source, date, deep-link to the originating message, and current effect ("excludes 4 exercises", "recorded — not yet applied to your plan"). Every row is editable and deletable. Blocked and pending-implication facts render as their own states.

### 1.5 Retrieval and bounding

Per-turn budget: **1200 tokens** for memory, assembled server-side.

Tiers: **A** active goals (always) · **B** injuries + availability · **C** hard dietary + food exclusions · **D** timing rules · **E** soft preferences (top-N by `reinforcement_count`) · **F** tone (top-N).

B+C+D are hard-capped at **600 tokens** combined. On overflow, C collapses to categories ("won't eat: 47 items across poultry, dairy, shellfish") with a **client-rendered** full list. It must not say "ask me for the full list" — the edge function handles one `functionCall` per turn and never returns a tool result for a second turn, so the model physically cannot ask and receive within a turn.

> **The two-turn tool protocol is a real missing capability.** Four independent designs invented workarounds for it. Decide it once: either build it (restructure `callGemini` + the `contents` mapping at `:976-988`) or accept that every "the model can ask for more" affordance is fiction.

**One context budget table** must exist and sum to a stated ceiling, asserted at build time in the prompt assembler. Today's baseline is ~9–12k tokens rebuilt per turn with no caching, and six separate designs each proposed adding to it while each claiming to pay for it by deleting the same ~30-line periodization block (`:803-832`). That block can go **once the model cannot change the plan** — but it can only be spent once.

---

## 2. The action framework

### 2.0 Four invariants

- **I1 — The chat never writes plan state.** Server-side writes to plan tables are forbidden. The edge function returns intent; the client executes through the edit layers.
- **I2 — Every mutation goes through an edit layer.** `set-log-store`, `meal-store`, `mesocycle-edit`+`saveMesocycle`, `memory-store`, `grocery-store`. No exceptions.
- **I3 — Plan mutations are structurally gated.** A pending row must exist and be confirmed before any plan write.
- **I4 — Default deny.** An unrecognised tool executes nothing.

### 2.1 Taxonomy

**The rule:** does the action record *something that happened* (immediate) or change *a parameter of what will be prescribed* (proposing)? Observations are immediate; parameters are proposed.

**Tool prefixes:** `log_` · `record_` · `undo_` (immediate) · `propose_` (proposing) · `offer_` (soft suggestion) · `get_` (read, reserved). The dispatcher rejects anything else, and a build-time assertion requires every `toolDeclarations` entry to have a registry entry with a legal prefix.

**IMMEDIATE** — `log_workout` (consolidated; replaces `log_workout_session` + `log_workout_set`), `log_weight`, `log_meal`, `log_meal_skipped`, `log_cardio`, `record_grocery_items`, `record_grocery_removal`, `record_context_fact`, `record_fact`, `record_goal`, `record_profile_answer`, `record_display_name`, `record_coaching_persona`, `undo_action`.

**PROPOSING** — `propose_exercise_swap`, `propose_exercise_ban`, `propose_exercise_add`, `propose_exercise_remove`, `propose_volume_change`, `propose_schedule_change`, `propose_meal_swap`, `propose_meal_regenerate`, `propose_dietary_change`, `propose_profile_change`, `propose_injury_change`, `propose_target_override`, `propose_plan_regeneration`, `propose_reset`.

**Decided edge cases:**

- **Weigh-in → IMMEDIATE.** Targets aren't stored; `computeTargets` recomputes on read. But the upsert is on `(profile_id, date)` and destroys a prior same-day entry, so `log_weight` is the one immediate op that must **read before it writes** and carry the pre-image into its `reverse` spec.
- **"Set my calorie target to 2500" → PROPOSING.** That's a parameter override outliving recomputation.
- **Grocery add → IMMEDIATE.** Nothing reads a grocery list to prescribe anything.
- **Goal statement → IMMEDIATE record, inert by construction.** No generator reads `user_goals`. Any consequence arrives as a separate proposal. A goal with no resolvable baseline is written `status='needs_baseline'` and no proposal may cite it as rationale.
- **`propose_exercise_ban` is DEMOTED from immediate.** It is the one verified-correct chat mutation today, but it removes a name from *every week of every block*, may drop a slot entirely when no substitute exists (`mesocycle-edit.ts:216-218`), and recomputes every replacement's load. Doubly irreversible ⇒ propose.
- **`propose_injury_change` is BLOCKED** until defect 2 (conflated `injuries`/`exercise_exclusions`) is fixed.

> **Never call a swap "permanent".** `mesocycle-edit.ts:161-167` patches only `block_number === current && week_number >= current`; later blocks rotate from the untouched base plan. The scope field is `today` | `rest_of_block`, and the card says which.

### 2.2 The pending action

**One table.** (Three drafts designed this three times, incompatibly; this is the reconciliation.)

```
pending_actions                                        (new)
  id                uuid PK
  profile_id        uuid NOT NULL FK fitness_profiles CASCADE
  message_id        uuid NULL FK chat_messages ON DELETE SET NULL
  action_class      text NOT NULL CHECK IN ('plan_mutation','append','clarification')
  kind              text NOT NULL                  -- the propose_* tool name
  status            text NOT NULL CHECK IN
                    ('unresolved','pending','claimed','executing','done',
                     'partial','failed','stale','superseded','declined','expired')
  origin            text NOT NULL CHECK IN ('chat','ui')
  scope_key         text NOT NULL                  -- dedupes concurrent proposals for one target
  subject_key       text NULL                      -- what this is ABOUT (for decline-suppression)
  suppressed_until  date NULL                      -- set on decline; detectors respect it
  preconditions     jsonb NOT NULL                 -- content fingerprints, checked at claim
  payload           jsonb NOT NULL                 -- the ops to execute
  payload_version   smallint NOT NULL              -- mismatch at claim ⇒ stale, never executed
  pre_image         jsonb NULL                     -- REQUIRED for every plan_mutation; backs undo
  diff              jsonb NOT NULL                 -- the generic render contract
  edited_payload    jsonb NULL
  result            jsonb NULL
  client_id         text  UNIQUE (partial, WHERE NOT NULL)
  expires_at        timestamptz NOT NULL
  created_at / claimed_at / resolved_at
  PARTIAL UNIQUE (profile_id, scope_key) WHERE status IN ('unresolved','pending','claimed')
  INDEX (profile_id, status), (profile_id, subject_key, suppressed_until)
```

Rejected: client state only (dies on unmount — the existing swap dialog does exactly this); `chat_messages.action_data` (it is semantically a *receipt*, written after a mutation — overloading it conflates "proposed" with "done", precisely the incident's ambiguity); localStorage only (the cache/DB divergence guard at `ChatAssistant.tsx:307` makes it non-deterministic).

**Large artifacts go in a side table.** A regeneration proposal would otherwise store a full 16-week `MesocycleWeek[]` **twice** (candidate + pre-image) in one row, in the chat-history read path. Use `proposal_artifacts(proposal_id, kind, week_number, days jsonb)` keyed per week — which is also what `saveMesocycleWeek` wants.

**Rehydration must project columns.** Fetch `(id, status, kind, diff, expires_at)` for rendering; lazy-load `payload`/`pre_image` only on confirm/undo.

### 2.3 Lifecycle

```
        model emits intent
                │
                ▼
        ┌───────────────┐   client resolves diff against live plan
        │  unresolved   │──────────────────────────────┐
        └───────────────┘                              ▼
                                              ┌─────────────────┐
   user taps Confirm  ◄─────── card ──────────│     pending     │
        │                                     └─────────────────┘
        ▼                                        │          │
  ┌───────────┐  preconditions re-checked      decline    expire
  │  claimed  │  (fingerprints, payload_version)  │          │
  └───────────┘                                   ▼          ▼
        │ pass                              declined     expired
        ▼          fail ⇒ stale             (+suppressed_until)
  ┌───────────┐
  │ executing │──► edit layer ops (idempotent, correlation-keyed)
  └───────────┘
        ├── all ok ────► done    ──► receipt (+ Undo if reversible)
        ├── some ok ───► partial ──► receipt naming exactly what landed
        └── none ──────► failed  ──► card stays, error explained, retry offered
```

**Staleness is a content fingerprint, not a version number or timestamp.** Preconditions capture a hash of the affected slot/pool/plan identity. At claim, mismatch ⇒ `stale` with a re-propose affordance. (A timestamp stamped by a hook inside `persistPools` would fire for the quality harness's throwaway profiles and would mark a *failed* regeneration as a change.)

**After any tap mutation, sweep pending proposals** on the same target and mark them stale immediately — so the user never taps Confirm on a card invalidated by their own tap a second earlier.

**On `propose_reset` execution**, every pending/claimed proposal for the profile is marked `superseded` in the same operation, and `plan_identity` becomes a mandatory precondition on every mesocycle-scoped proposal.

### 2.4 The proposal payload — rendering the effect, not prose

```jsonc
{
  "kind": "propose_exercise_swap",
  "title": "Swap Thursday's deadlift for RDL",
  "scope": { "label": "This week only", "value": "today" },
  "diff": {                                  // generic render contract, all domains
    "rows": [
      { "field": "Exercise", "before": "Trap Bar Deadlift", "after": "Romanian Deadlift" },
      { "field": "Load",     "before": "~67.5 kg",          "after": "~55 kg",
        "note": "recomputed for the new movement" },
      { "field": "Sets×Reps","before": "4×8-11",            "after": "3×8-10" }
    ],
    "unchanged": ["Thursday's other 5 exercises", "Weeks 5-16"]
  },
  "implications": [
    { "severity": "info", "text": "Hinge volume drops ~15% this week." },
    { "severity": "warn", "text": "Your logged deadlift history won't carry to RDL." }
  ],
  "rationale": "You said your lower back is sore.",
  "editable": [ { "field": "scope", "options": ["today", "rest_of_block"] } ],
  "reversible": true
}
```

A single `<ProposalCard>` renders any domain from `diff.rows` + `implications`. No domain-specific card components.

### 2.5 Idempotency, undo, failure

**Idempotency** is deterministic-key based, at three levels: the utterance (a hash of `profile_id` + normalized message + log date, *not* the message row id — a user re-typing the same sentence must not double-log), the proposal (`client_id`), and each op (correlation id).

> **Dead-letter retry breaks naive matching.** `set-log-store.retryDeadLetterItem` mints a *fresh* clientId and resets attempts. Reconciliation must match on a `correlationId` preserved across dead-letter retry — which changes `set-log-store`'s documented "clientId identifies the queued op" contract. Say so explicitly when doing it.

**Undo** is a `reverse` spec per op, offered for **10 minutes** or until the next mutation on the same target.
- `saveSet` → `deleteSet` (exists).
- `recordMealEvent` → **`voided_at` + `voided_by`**, with `getTodayLedger` filtering `voided_at IS NULL`. Not a hard DELETE: it destroys the audit trail the append-only ledger exists for, and a deleted row cannot be replayed idempotently by `client_id`.
- `upsertDailyMetric` → restore the captured pre-image, or delete the row it created.
- Plan mutations → restore `pre_image`. **This is why `pre_image` is mandatory** — `saveMesocycleWeek` (the preferred path) captures nothing on its own, and without it the Undo button in the wireframes is unimplementable.

**Partial failure** is a first-class terminal state. The receipt names exactly which ops landed and which didn't, with per-op retry. An offline confirm caches its claim in a **fourth localStorage key owned by the action framework** (`fitplan_proposal_claims_v1`) — not inside the domain queues, which have incompatible op shapes and know nothing about proposals.

### 2.6 The ambiguity problem — making the original failure impossible

The incident had two halves: the schedule was **mutated**, and the user was **told** "Schedule updated" for a change the Exercise tab never showed. A pending-action table kills the first. It does not kill the second — and telling the user something happened that didn't is the same harm.

**Five structural defences, in order of strength:**

**D1 — The client discards model prose on any turn that produced a proposal.**
When a turn yields a `pending_actions` row with `action_class='plan_mutation'`, `processResponse` renders **only client-authored copy plus the card**. Model free text is permitted only on turns that produced no proposal and no execution. Enforced client-side, no model cooperation required. (Evidence this is needed: `stripStreamingTags` already line-filters `^Schedule updated —` as a hack.)

**D2 — Server-side imperative classification.**
The tool call must carry `origin.verbatim_quote`, asserted to be a literal substring of the user's message *this turn*. That alone is a null gate — "I didn't train today" is a substring of itself. So the quote is additionally run through a **deterministic imperative classifier in code** (closed verb list + interrogative/negation heuristics). Fails ⇒ downgrade from `propose_` to `offer_`.

**D3 — Offers, not proposals, for non-imperative input.**
An `offer_` renders as a lightweight suggestion chip ("Want me to move Thursday's session?") with no Confirm button and no pending row. Accepting it produces an *imperative* user turn, which then travels the normal `propose_` path. One open offer at a time.

**D4 — Declines are remembered.** `subject_key` + `suppressed_until` stop a detector re-proposing something the user already rejected — the dynamic that made the old PROACTIVE EXECUTION RULE feel necessary in the first place.

**D5 — One plan-mutation proposal per turn.** More than one ⇒ take none, ask. (This rule applies **only** to plan mutations — immediate-class calls batch freely, or onboarding stalls on its own happy path when a user answers four fields in one sentence.)

**Traced against the incident:** "I didn't train today" → D2's classifier finds no imperative → downgraded to an offer → no pending row, no card, no write → D1 means the assistant's own text can't claim a change either. The failure is structurally unreachable.

---

## 3. Natural-language workout logging

### 3.1 Division of labour

**Hybrid with a hard line, matching the meal pipeline's proven shape: the model segments, code owns every number.**

The model calls `log_workout({ date?, entries: [{ raw_text, exercise_phrase, sets_phrase }] })` — it identifies *which span of text is which exercise* and nothing else. A pure `src/lib/set-parse.ts` parses every quantity. The model never emits a number that reaches the database.

This is the same principle that makes meal generation trustworthy: the AI proposes, code measures.

**Grammar handles:** `6x8 @100kg` · `4x12 @20kg DB flyes` · `3 sets of 8-10 at 60` · `bench 100 for 5,5,4` (explicit per-set reps) · `5x5 @ bodyweight+10kg` · `3x failure` · `20 mins on the bike` (routes to cardio).

**The sets×reps rule:** in `A×B`, if exactly one of A,B is ≤ 10 and the other > 12, the smaller is sets. Otherwise **A is sets** (the overwhelming gym convention), and when both are ≤ 10 and unequal the card shows the interpretation with a one-tap flip. Ranges (`8-10`) are stored as the midpoint with the range retained for display. `@bodyweight` sets `is_bodyweight` and weight 0 — never a fabricated 0kg loaded row.

### 3.2 Exercise resolution

Resolution order: exact slug → `EXERCISE_DATABASE` name/alias → **`exercise_name_aliases`** (new: learned user phrasings, keyed to a stable slug) → fuzzy within the day's plan → fuzzy globally.

Three outcomes: **resolved** (log it) · **ambiguous** ("flyes" → cable vs rear-delt: the card asks, one tap, and the answer writes an alias so it never asks again) · **unknown** (log against a `custom:` slug with the user's own name — it counts toward volume and history but is excluded from progression, and the card says so).

Movements not in today's plan log fine — logging is append-only and does not require plan membership.

### 3.3 Partial, extra, substituted

- **Partial** (3 of 4 prescribed): logged as-is. No plan implication. Set numbering must **offset from existing rows for that exercise/session**, never restart at 1 — restarting would overwrite via the natural key `(user_id, session_id, exercise_id, set_number, is_warmup)`.
- **Extra** (not in the plan): logged with `substituted_for_exercise_id = NULL`. Append-only.
- **Substituted** (did Y where the plan said X): logged as Y with `substituted_for_exercise_id = X`. Needs a supporting index: `(user_id, substituted_for_exercise_id, completed_at DESC) WHERE substituted_for_exercise_id IS NOT NULL`. Two occurrences of the same pair within a block ⇒ an *offer* to make it permanent — never an automatic plan change.

### 3.4 The confirmation card, reconciled with "immediate"

Logging is immediate per Decision #1, and the card is **not** a confirmation gate. Two states:

- **RECEIPT** (confidence high, everything resolved) — writes happen, the card shows what was written, `[Undo]` and `[Edit]` are offered. This is the normal path.
- **CLARIFICATION** (something ambiguous or unresolved) — `action_class='clarification'`. Nothing writes yet; the card asks the one question it needs. This is not a plan-mutation confirmation, so it doesn't contradict "logging is immediate" — it is the parse asking for a missing input.

```
┌─ Logged · Thursday ────────────────────────┐
│ Barbell Bench Press   6 × 8  @ 100 kg      │
│ Cable Flyes           4 × 12 @ 20 kg   ⓘ   │
│   └ "DB flyes" → Cable Flyes  [not this?]  │
│ Cycling               20 min               │
│                                            │
│ 3 exercises · 10 sets · first log today    │
│                        [ Undo ]  [ Edit ]  │
└────────────────────────────────────────────┘
```

### 3.5 The estimate → truth transition

This is the moment prescriptions stop being guesses. Design it explicitly.

Detection compares logged working weight against prescribed, per exercise, using the existing load-provenance labels (`estimate` / `known_weight` / `logged`):

| Signal | Response |
|---|---|
| Single session within ±15% | Nothing. Normal variance. |
| Single session >15% off | Nothing yet — one bad day is not a trend. Recorded. |
| **2 consecutive sessions >15% off, same direction** | **`propose_load_recalibration`** — a card showing current vs suggested prescription across remaining weeks |
| Logged load *below* prescription with an `estimate` provenance | Higher confidence — the estimate was wrong, not the day. Same proposal, stronger copy. |
| Order-of-magnitude outlier (>3×, or a 1000kg typo) | **Never** proposes. Flags the *log* as suspect and offers to correct the entry. |

**The plan change is always a proposal.** Correcting a prescription is a plan mutation.

**One detector module.** `src/lib/plan-signals.ts` evaluates recalibration *and* the dashboard's stall-detection rule over the same snapshot, and emits **at most one proposal per `exercise_id` per window**, with recalibration taking precedence over swap (correcting a number is strictly less destructive than replacing a movement). Two independent detectors would otherwise propose contradictory changes to the same slot, and confirming either invalidates the other's preconditions.

---

## 4. Progressive onboarding & unlocking

### 4.1 The hard constraint

`generateExercisePlan` needs far less than the 19-step flow collects. The true GATE set — the minimum before a first plan can exist — is: **training days** (`training_days`), **equipment** (`equipment_access`), **goal** (`fitness_goal`), **experience** (`training_experience`), **session length** (`session_duration_preference`). Everything else has a working default or affects only nutrition.

Body metrics (age/sex/height/weight) gate **nutrition**, not training. That distinction is what makes progressive onboarding possible: a user can have a working training plan before telling the app their weight.

### 4.2 Profile row and drafts — resolving a three-way conflict

Three drafts disagreed on whether the `fitness_profiles` NOT NULLs get relaxed. **Both mechanisms, for different reasons:**

- **Relax the eight NOT NULLs and create the row on first contact** (id + created_at only). Not for the answers — for the **foreign key**. `exercise_set_logs.user_id` and `chat_messages.profile_id` are NOT NULL FKs. Without a row, the headline chat-first promise ("you can log a workout in your first thirty seconds, before you have a plan") is unimplementable.
- **`onboarding_drafts`** holds accumulating answers *and the conversation transcript*, keyed to that profile id. A `materializeProfile()` completeness predicate — a code gate, not a schema gate — decides when enough exists to generate.

Resumability: answers persist per turn. Abandon at question 3 and return a week later ⇒ the chat summarises what it already knows and picks up. Second device ⇒ the draft is server-side, so it follows. (Retention/expiry needs a decision on scheduled jobs — see §7.)

### 4.3 Tier / unlock matrix

| Field / fact | Tier | Obtained | Effect if missing |
|---|---|---|---|
| `training_days` | **REQUIRED** | chat / tap | No plan at all |
| `equipment_access` | **REQUIRED** | chat / tap | No plan (pool cannot be constrained) |
| `fitness_goal` | **REQUIRED** | chat / tap | No plan (drives goal policy) |
| `training_experience` | **REQUIRED** | chat / tap | No plan (drives volume + calibration) |
| `session_duration_preference` | **REQUIRED** | chat / tap | No plan (time budget) |
| `age`, `gender`, `height_cm`, `weight_kg` | **UNLOCKS** | chat / tap | **Nutrition tab, meal plans, grocery list** all locked |
| `activity_level` | IMPROVES | chat / tap | TDEE defaults to moderate — the fabricated input M0 fixed |
| `meals_per_day`, `include_snacks` | IMPROVES | chat / tap | Defaults 3 + snacks |
| `cooking_time_preference` | IMPROVES | chat / tap | Defaults moderate |
| `dietary_preferences` | IMPROVES | chat / tap | No restrictions enforced |
| `injuries` | IMPROVES | chat / tap | No injury filtering |
| `recovery_capacity`, `conditioning_preference` | IMPROVES | chat / tap | Defaults moderate / tolerate |
| `training_style`, `workout_split_preference` | IMPROVES | chat / tap | Defaults hybrid / ai_recommendation |
| `coaching_persona`, `display_name` | IMPROVES (tone) | chat / tap | Defaults supportive / no name |
| Known working lifts | **UNLOCKS** | chat / tap | **Calibration-week skip** unavailable — week 1 is a calibration week |
| Body-fat measurement | **UNLOCKS** | weigh-in card | **Body-fat goals** cannot be baselined (Decision #4) |
| Goal + baseline | **UNLOCKS** | chat / tap | Goal-linked recommendations inert |

### 4.4 Locked features are invitations

```
┌─ Meals ────────────────────────────────────┐
│                                            │
│   I can build your meals once I know       │
│   your height, weight, age and sex —       │
│   that's what sets your calorie target.    │
│                                            │
│   Takes about 20 seconds.                  │
│                                            │
│         [ Tell the coach ]  [ Fill in ]    │
└────────────────────────────────────────────┘
```

Two doors, always — chat and tap — per the vision's "everything the chat can do, the user can do by tapping." Retroactive unlock is explicit and celebrated: *"Got it. Meals are unlocked — want me to build this week's now?"* — itself a proposal, not an automatic generation.

### 4.5 First-launch wireframe

```
┌────────────────────────────────────────────┐
│  Hey — I'm your coach. I'll build you a    │
│  training plan. Five quick questions and   │
│  you'll have one; everything else can      │
│  wait, and the more I know the better it   │
│  gets.                                     │
│                                            │
│  Which days can you train?                 │
│  [Mon][Tue][Wed][Thu][Fri][Sat][Sun]       │
│  [ 3 days, you pick ]  [ Skip for now ]    │
└────────────────────────────────────────────┘
                    ⋮
┌────────────────────────────────────────────┐
│  user: mon wed fri, and I've got a full    │
│        gym. hypertrophy. been lifting      │
│        ~2 years. hour sessions.            │
│                                            │
│  That's everything I need. Building it     │
│  now…                                      │
│                                            │
│  ✓ 12-week plan · Mon/Wed/Fri · Upper-     │
│    Lower-Full                              │
│                                            │
│  Week 1 is a calibration week — I'll       │
│  start light and learn your numbers.       │
│  (If you already know your working         │
│  weights, tell me and I'll skip it.)       │
│                                            │
│  [ See the plan ]   [ Set up meals too ]   │
└────────────────────────────────────────────┘
```

One turn answered five fields — which is why D5's one-call-per-turn rule must be scoped to plan mutations only.

### 4.6 What happens to the 19-step flow

**It becomes the tap-equivalent, restructured around the tier model** — not deleted, not left as-is. The vision requires a tap path for everything; a form is the right tap affordance. But it is re-cut: the five GATE questions first with a "Generate my plan" button available immediately after them, then IMPROVES and UNLOCKS questions as clearly-optional sections.

Existing profiles: nothing is re-asked. Their answers backfill as `source='onboarding'` facts where a fact type exists, and they see a one-time "here's what I know about you — correct anything" pass into the memory UI.

---

## 5. Dashboard & grocery list

### 5.1 The rule

**The Dashboard owns no number.** Every element derives from an existing source. It is read-only by construction; every affordance either navigates or hands control to the action framework.

| Element | Derived from | Notes |
|---|---|---|
| Streak | `workout_sessions` (DISTINCT date) + `cardio_logs` | See definition below |
| Logged vs planned | `workout_sessions` vs `mesocycle_weeks.days` | |
| Calories in | `getTodayLedger` (`meal_events`) | Requires the `swapPoolMeal` split (defect 5) or it inflates |
| Calories out | `computeTargets`' BMR/TDEE + session estimate | **Honest labelling required** — see below |
| Weight trend | `daily_metrics` | |
| Upcoming session | `mesocycle_weeks` + `getActiveMesocycleWeek` | |
| Recommendations | `plan-signals.ts` (deterministic) | Never AI-generated |

**Calories out must not overclaim.** The app has no wearable and no measured burn. It knows BMR/TDEE from `computeTargets` and can estimate session expenditure. Label it "estimated" with its provenance visible. Do not invent a tracker.

**Streak — a decision, not a derivation.** *Recommended:* a day counts if any set or cardio was logged; rest days are transparent (they neither count nor break); the streak breaks on a **scheduled** training day with nothing logged; one make-up token per plan week.

> **Two traps.** (a) Resolving "was this day scheduled?" from the *current* mesocycle makes a plan change retroactively rewrite history — and `saveMesocycle` is delete-then-insert, so the old prescription is gone. **Fix: freeze it.** `ensureSessionSynced` already stamps `week_number` and `day`; add `was_scheduled boolean`. (b) Make-up tokens must key on the **plan week** (`getActiveMesocycleWeek`), not the ISO week, or they straddle plan boundaries.

**Read-cost discipline.** Split the dashboard read: *today* is local-first (`getSetsForDate`, `getTodayLedger`) and recomputes freely; the *history window* fetches once per mount and once per local-date change — **never** on every sync-state change. Naively binding the whole dashboard to `subscribeSyncState` means logging 20 sets triggers 20 full 90-day refetches. Project columns explicitly; the streak needs `SELECT DISTINCT date`, not full set rows.

### 5.2 Dashboard wireframe

```
┌──────────────────────────────────────────────┐
│  Thursday                        🔥 12 days  │
├──────────────────────────────────────────────┤
│  TODAY · Pull & Hinge            Week 3 / 12 │
│  Deadlift · Pull-Ups · Rows · +4             │
│                          [ Start session ]   │
├──────────────────────────────────────────────┤
│  Calories    1,240 / 1,979    ████████░░░░   │
│  Protein       118 / 174 g    ███████░░░░░   │
│                              [ Log a meal ]  │
├──────────────────────────────────────────────┤
│  This week      3 logged / 4 planned         │
│  Weight         84.2 kg   ↓ 0.6 this month   │
├──────────────────────────────────────────────┤
│  ⚡ Bench has stalled 3 sessions.            │
│     [ See options ]          [ Not now ]     │
└──────────────────────────────────────────────┘
```

`[Not now]` writes `suppressed_until` — the decline is remembered.

### 5.3 Grocery list

```
grocery_lists          id, profile_id, horizon_start, horizon_end, created_at
grocery_items          id, list_id FK CASCADE, canonical_key, display_name,
                       total_grams numeric, purchased_grams numeric,
                       display_quantity text, category text,
                       sources jsonb,            -- provenance: which meals/days
                       is_checked bool, user_overridden bool, needs_review bool,
                       raw_text text, client_id text,
                       UNIQUE (list_id, canonical_key)
```

`purchased_grams` (rather than a second row for a delta) is what keeps the unique key intact when a regenerated plan needs more of something already bought.

**Generation** walks the assembled days across the horizon — not the whole pool. A pool holds ~5 options per slot; only the *chosen* option per day is shopped for. Unit merging goes through food-db's existing conversion machinery (`unitToGrams`) to a common gram basis, with `display_quantity` rendered back into shopping units.

**Unresolved items are not errors.** `lookupIngredient` returns null on a genuine miss; the item still appears under "Other" with `needs_review`. A grocery list is not a macro computation and must not fail closed. Manual adds that don't resolve get a `manual:` key and are re-resolved on each list load, migrating when food-db later learns the ingredient.

**Regeneration sync** compares against a content fingerprint of the chosen options (not a timestamp), preserves `is_checked` and `user_overridden` rows, and presents the delta as a diff.

### 5.4 The chat door — worked example

> "add chicken and rice to my shopping list"

1. Model calls `record_grocery_items({ items: [...], origin: {verbatim_quote} })` — an IMMEDIATE tool.
2. Edge function **writes nothing**; returns the intent.
3. Client's `grocery-store.addGroceryItems` resolves each via `lookupIngredient`, merges on `canonical_key`, enqueues local-first with a `client_id`.
4. Receipt renders:
```
┌─ Added to your list ───────────────────────┐
│  Chicken breast          → Meat            │
│  White rice              → Grains          │
│                                 [ Undo ]   │
└────────────────────────────────────────────┘
```
5. `[Undo]` reverses via the op's `reverse` spec within 10 minutes.

Every step obeys I1 (no server write), I2 (through the store), and Decision #1 (append-only ⇒ immediate + receipt + undo).

---

## 6. Information architecture

### 6.1 Shells

**First launch:** chat only, full screen. No tab bar. It appears as the five GATE answers land.

**Returning user:** lands on **Dashboard**.

> **Rationale:** chat-first describes how the app is *controlled*, not what it *opens to*. A returning user's most common intent is "what am I doing today / how am I tracking" — a glanceable answer, not a prompt. The chat is one tap away everywhere. *(This is Open Question 1.)*

### 6.2 Where chat lives

**Both: a persistent tab and a global overlay.** The overlay is summonable from any screen and carries a `SurfaceContext` (`{screen, day, week, exerciseId?, slot?}`) so "swap this" resolves against what the user is looking at. Same component, same transcript, same pending-action rail.

This is cheap today: `ChatAssistant` is already `forceMount`ed with `data-[state=inactive]:hidden` (`App.tsx:972`), so its state already survives tab switches.

### 6.3 The two UX complaints

**"Scrolling past six days to reach today."** The Exercise tab becomes **today-first**: today's session at the top, full-width, expanded; the rest of the week collapses to a single strip below it. Week navigation stays but is secondary.

```
┌──────────────────────────────────────────────┐
│  ← Week 3 of 12 →              Thursday      │
├──────────────────────────────────────────────┤
│  TODAY · Pull & Hinge                        │
│  ┌────────────────────────────────────────┐  │
│  │ Trap Bar Deadlift   4×8-11  ~67.5kg ⓘ │  │
│  │ [ 1 ][ 2 ][ 3 ][ 4 ]          ⇄  ⋯    │  │
│  ├────────────────────────────────────────┤  │
│  │ Pull-Ups            4×8-11  bodyweight │  │
│  │ [ 1 ][ 2 ][ 3 ][ 4 ]          ⇄  ⋯    │  │
│  └────────────────────────────────────────┘  │
│                          [ Start session ]   │
├──────────────────────────────────────────────┤
│  Mon ✓   Tue ·   Wed ✓   Fri ·   Sat ·      │
└──────────────────────────────────────────────┘
```

**"The plan screen is too busy."** Moves: week navigation → a compact header. Load-provenance explainers → behind the ⓘ. Per-set chips → visible only for the expanded/active exercise. Other days → the strip. Stays: today's exercises, sets, loads, swap.

### 6.4 Reconciling C1 — conditional

**The C1 spec is not in this repo** (no reference in code or git history; C0 was the logging foundation). What follows is reasoning, not reconciliation.

An active-workout screen must: hold one exercise at a time, log sets with minimal taps, run rest timers, survive backgrounding, and stamp session completion.

**Recommendation: C1 merges into the today-first view as a *mode*, not a separate screen.** "Start session" expands today's card to full-screen focus. Rationale: two screens rendering the same day's exercises is exactly the duplicated-state pattern this codebase has been paying down all year, and the chat overlay must work *during* a session (logging by voice/text mid-workout is a headline use case) — which is far simpler with one host.

**Questions that must be answered before this is a decision:**
1. Does C1 have its own route/state, or is it a mode?
2. Does "Finish" call `markSessionCompleted`? (**It must** — it is the only measured input the burn estimate has, and `useDailyTracker` already exposes it.)
3. Does C1 assume the current all-days ExercisePlan layout?
4. How does the rest timer coexist with a chat dock at the bottom of the screen?

---

## 7. Build sequencing

### 7.1 Principle

Never ship a half-migrated gate. The current safety posture — blanket server-side refusal keyed on tool name — is crude but **total**. It stays until a structural replacement is complete for the tool being migrated.

### 7.2 Phases

| Phase | Ships | Leaves working | Depends on |
|---|---|---|---|
| **A0 — Disarm & de-lie** | Fix defects 1–4 + 8. Split `injuries` from `exercise_exclusions`. Give known-lifts a column (defect 6). Export the seams other phases need (`isTrackViable`, `normalize`, `lookupKeys`). Delete the dead `adjust_volume`/`handleScheduleUpdate` client code so it can't be re-armed. | Yes — strictly fewer lies | — |
| **A1 — The confirm rail** | `pending_actions` table (full shape, incl. `pre_image`, `subject_key`, `preconditions`), `<ProposalCard>`, the state machine, D1 prose-discard, D2 classifier. Migrate **one** tool (`propose_meal_swap`) end-to-end. Split `swapPoolMeal` into `choosePoolOption` + `recordMealEvent` first. | Yes | A0 |
| **A2 — The append rail** | Receipts + undo for all immediate ops. `voided_at` on `meal_events`. `client_id` on `recordMealEvent` and `cardio_logs`. Re-enable `log_meal`. Consolidate `log_workout`. | Yes | A1 |
| **B — Chat-tool rebuild** | The remaining `propose_*` tools. **The real work is the missing pure editors** — there is no public per-day add/remove, no volume editor, no schedule editor. Each is a new `mesocycle-edit` function mirroring `swapExerciseInMesocycle`. | Yes | A1, A2 |
| **C — Memory** | `user_facts` + satellites + `user_goals`, `memory-store`, `fact-compiler`, the memory UI. Facts that can't yet be applied render as **pending implications** — a first-class visible state, never silent. | Yes | A1 (facts propose), A2 |
| **D — Regeneration** | The plan-change engine. Prerequisite: a `generateMesocycle` entry point that can continue from existing loading state — see the trap below. | Yes | B, C |
| **E — Chat-first onboarding** | Drafts, the conversational flow, tier gating, retroactive unlock. | Yes | C, D (retroactive unlock needs regeneration to be honest) |
| **F — Active workout / C1** | Whatever C1 resolves to. Must call `markSessionCompleted`. | Yes | A2 |
| **G — Dashboard & grocery** | `plan-signals.ts`, dashboard derivations, grocery store. | Yes | A2, F (for burn provenance) |

**Before Phase B specifically:** A0 (the guards are inconsistent), A1 (the rail must exist), and the `swapPoolMeal` split. Memory (C) is **not** a prerequisite for B — the tools work on explicit user requests without any facts. C is a prerequisite for D.

> **Regeneration trap.** `generateMesocycle` always emits from week 1 with `lastUnverifiedLoadingWeekKg` initialised empty and accumulated *across* blocks. Splicing a fresh run's later weeks onto an existing plan silently reverts every unverified lift toward first-block estimates, and the 1.25× backstop won't catch it because it guards a *carried* baseline, not a missing one. Either add `{startAtWeek, carryForwardLoads}` to the signature, or restrict D to whole-plan regeneration with "you will restart at week 1" stated on the card. Do not ship "regenerate from block 3" without the former.

### 7.3 Reuse / replace / retire

**Reuse unchanged:** `set-log-store` (the reference pattern), `mesocycle-edit` + `mesocycle-persistence`, `food-db`, `diet-rules`, `portion-scaler`, `meal-generation`'s verification pipeline, `nutrition-targets`, the whole exercise generator.

**Reuse with a parity pass:** `meal-store` (split `swapPoolMeal`; add `client_id`; add `voided_at`), `ChatAssistant` (`processResponse` is rewritten), `ExercisePlan` (today-first).

**Replace:** the chat tool roster; `OnboardingFlow` (restructured, not deleted); `applyPlanAction`'s `boolean|string` contract (needs a real error taxonomy — today `false` conflates six distinct failures into one identical message).

**Retire:** `exercise_plans` as a write target (legacy; invisible when a mesocycle exists), `weekly_schedule` (already inert — do not resurrect), `workout_logs`, `set_logs`, `meal_plans`, `nutrition_cache`, `workout_exercises`, `favorite_meals` (verify each has no live caller first), `swap_meal` (alias for `replace_food`).

### 7.4 Cross-cutting gaps that need an owner

- **No scheduled-job infrastructure**, but proposal expiry, draft retention, and fact decay all assume one. Either adopt `pg_cron`/scheduled functions, or design every expiry as lazy-on-read (works for proposals, not for retention).
- **`handleReset` never deletes the profile row** — it clears localStorage only. Every new table CASCADEs from a row that survives, so "New Plan" would orphan a full memory of injuries and goals indefinitely. Fix in A0, with one exported `ALL_STORAGE_KEYS` const every store contributes to.
- **No export / delete-my-data path.** ~30 lines on the same CASCADE, and it is what makes a memory feature defensible.
- **No user timezone.** All dates come from the device; a user who flies shifts streak buckets and can collide on `workout_sessions(profile_id, date)`.
- **Auth.** Every table is `USING (true)` with identity in localStorage. This is fine for a single user and a hard blocker before a second. Either schedule it or state once, at the top, that this is single-user — repeating the caveat in five sections without scheduling it is the worst of both.
- **`test:chat-safety` must test the client, not the edge function.** Under this design the edge function writes nothing by construction, so "assert zero rows written" passes trivially even if the client auto-applies everything. Run the recorded trace transcript through `processResponse` against a fake-Supabase mutation log and assert zero mutations + `status='pending'`.

### 7.5 Riskiest phase

**D (regeneration).** It is the only phase that destroys and rebuilds a plan the user has logged against, it has the loading-state trap above, and it is where "a fact changed, so your plan changed" becomes real. Its quality gate should extend `dev-constraint-audit`'s `block_transition_jump` check across a regeneration boundary.

---

## 8. Open questions

Six, each with a recommended default.

**Q1 — Returning-user landing: Dashboard or Chat?**
*Recommend: Dashboard.* Chat-first is about control, not the opening screen; the most common returning intent is glanceable. Counter-argument: landing on chat makes the coaching relationship the product. Reversible either way.

**Q2 — Streak: what breaks it?**
*Recommend:* any logged set/cardio counts a day; rest days transparent; breaks on a **scheduled** day with nothing logged; one make-up token per plan week. Stricter feels punishing; looser is meaningless. Requires freezing `was_scheduled` at session creation.

**Q3 — Does `ban_exercise` become a proposal?**
*Recommend: yes.* It touches every week of every block, can drop a slot entirely, and recomputes every replacement's load. It is the highest-blast-radius mutation in the app and currently the only one that executes immediately. Cost: one extra tap on a deliberate action.

**Q4 — Plan-mutation undo: mandatory `pre_image` everywhere, or no undo?**
*Recommend: mandatory `pre_image`.* Without it the Undo button is a lie, and a lying affordance is what this whole architecture exists to prevent. Cost: every plan proposal carries a snapshot (mitigated by the artifacts side-table).

**Q5 — Chat placement: tab, overlay, or both?**
*Recommend: both* — persistent tab plus context-carrying overlay. Cost is low because the component already force-mounts. If only one: overlay, since acting on the current screen is the higher-value half.

**Q6 — Does the 19-step form survive?**
*Recommend: restructured, not deleted.* Re-cut around the tier model with the five GATE questions first and a "Generate" button immediately after. The vision requires a tap path for everything, and a form is the right one — but the current all-or-nothing 19 steps contradicts progressive onboarding.

---

## 9. Vision vs. existing commitments — where each gives

| Tension | Resolution |
|---|---|
| Timing rules vs `meal_plan_slots`' deliberate day-agnosticism | **Pool model wins.** Timing becomes an `assembleDay` predicate; the table is untouched |
| Memory-driven plans vs generation running exactly once | **Vision wins, but phased.** Facts are honest about not yet applying until D ships regeneration |
| Soft preferences vs "everything confirms" | **Named carve-out.** Soft facts auto-activate; they are structurally barred from exclusion lists |
| Chat-first logging vs `NOT NULL` profile FKs | **Schema gives.** Relax eight NOT NULLs; the row exists as an FK target from first contact |
| "Everything the app believes about you" vs `USING(true)` RLS | **Neither, yet.** The memory UI must not use the word *private* until auth exists |
| Rich soft-preference ranking vs closed generator signatures | **Architecture wins.** Scope soft exercise prefs to the swap dialog; say rotation is unaffected |
| Tap-path immediacy vs universal confirmation | **Tap gives, narrowly.** Direct manipulation stays immediate except for high-blast-radius actions (ban, regenerate, reset), which share `<ProposalCard>` |
