# Ask what you can actually load

## Context

Ashley's question, which the previous round only half-answered: *"how do we
know the user's backpack is 20kg or that they can add weight to it each
week?"*

We don't. Onboarding asks one equipment question — four boxes — and the only
weights a user can ever state are squat, bench and deadlift. Everything else
is inferred from strength standards and then clamped by tables the app
invented:

| implement | ceiling the app uses | where it comes from |
|---|---|---|
| weighted backpack | 8 / 12 / 20 / 25kg by experience | `IMPROVISED_IMPLEMENT_CEILING_KG` — a guess about straps and posture |
| dumbbell | 50kg **per hand** | `LOADING_CEILING_KG_PER_HAND_OR_TOTAL` — a *commercial gym rack* |
| kettlebell / single implement | 48kg | same table, same assumption |

The dumbbell row is the worst of them, and the code already says so:

> *"Values are full-gym ceilings and do not scale down by equipment tier — a
> home_gym/minimalist trainee's actual adjustable dumbbells realistically top
> out well below 50kg. Tracked in BACKLOG.md as a follow-up, not addressed
> here."*

The last round made the app stop *asserting* what it doesn't know. This round
makes it ask.

**What already works, and must not be rebuilt.**
`getDoubleProgressionRecommendation` reads the last logged sets and works
from that number, so from session two the app is already correct. This is
about session one, the 16-week plan shown up front, and the ceiling that
clamps every week after.

**Ashley's ruling: ask for the real ceiling, at first use.** Not onboarding —
her call, and the right one: someone who has never trained cannot answer
"how much can you load", and onboarding is where people drop out.

## The build

### 1. One number per implement, asked only when it appears

`loadingMode` (`load-prescription.ts:489`) already classifies every exercise
into `barbell | ez_bar | dumbbell | single_implement | stack`, and
`isImprovisedLoadImplement` separates the backpack. A home trainee only ever
owns three of those, so there are at most **three** questions ever:

- `dumbbell` — "the heaviest pair you own"
- `single_implement` — kettlebell / single dumbbell
- `improvised` — what the bag actually holds

`barbell` is already covered by the existing squat/bench/deadlift questions,
and `stack` means a machine, which means a gym. Neither is asked.

Asked **only when an exercise using that implement appears in a real
session** — so a bodyweight trainee is never asked about dumbbells, and
nobody is asked about all three at once.

### 2. Storage: a real column, not a fact string

`user_facts` already carries `constraintKind: 'equipment'`, and it is the
wrong home. It stores `rawPhrase` / `displayText` — free text — and the load
engine needs a number it can clamp against. Re-parsing "I've got 12kg
dumbbells" into a figure is one-field-two-questions, the defect class this
repo has now hit six times.

New migration, `profiles` columns:

```sql
alter table profiles
  add column if not exists max_dumbbell_kg numeric null,
  add column if not exists max_single_implement_kg numeric null,
  add column if not exists max_improvised_kg numeric null,
  add column if not exists load_ceilings_declined boolean not null default false;
```

**`declined` is a real value, not an absence.** The body-metrics round proved
that: "optional" meant the plan could be built without it, but the
conversation still held the user hostage until it was confirmed. A trainee
who says "I don't know" must be able to say it once and never be asked
again.

**Degrades without the migration**, following `added_load_kg`'s pattern
exactly: reads use `select('*')` so a missing column is simply absent, the
prompt never appears, and every prescription is byte-identical to today.
This matters because the migration cannot be applied from the sandbox and
Ashley is not at her machine.

### 3. The engine reads it as a ceiling, nothing more

`getLoadingCeilingKg(entry, category)` is the single choke point every load
already passes through. It gains the profile's number when one exists:

```
effectiveCeiling = min(tableCeiling, userStatedCeiling ?? Infinity)
```

**Only ever downward.** A user's stated 15kg replaces the invented 50kg; a
stated 60kg does NOT raise a dumbbell past the table, because that table is
also a safety backstop and this is the loading path. Same asymmetry the
weight-basis offer used.

`IMPROVISED_IMPLEMENT_CEILING_KG` is treated the same way — a stated bag
weight lowers it, never raises it above the strap/posture limit.

### 4. Answering rebuilds the live week onward, never the past

Precedent is settled: the weight-basis offer round ruled that a new fact
rebuilds from the current week forward through `rebuildAgainstProfile`, and
never rewrites a week already trained. Reuse it directly rather than
inventing a second rebuild path.

### 5. Where it appears

Inline on the exercise row in `TodayPanel`, next to the load chip that
already says *"A starting guess — I do not know which weights you actually
have."* That sentence is the question's own set-up; putting the answer next
to it is the smallest possible interface.

**Not a modal.** Someone opening the app in a gym wants to start training.
The prompt is ignorable, and ignoring it is not the same as declining —
declining is a deliberate tap that stops it returning.

## Verification

- **`test:audit` 0 / 13,967 with the columns absent** — proves the
  degradation, which is the property that matters most while the migration
  is unapplied.
- **A stated ceiling only ever lowers**: sweep every implement, assert
  `effectiveCeiling <= tableCeiling` for every stated value including absurd
  ones (a claimed 200kg dumbbell must not move anything).
- **Nobody is asked about kit they don't use**: a bodyweight profile is never
  prompted for dumbbells; a full-gym profile is never prompted at all.
- **Declining is permanent** and does not block: a declined profile still
  generates a full plan, still gets loads, and is never asked again.
- **Read a real 16-week plan** for a trainee who states 10kg dumbbells, and
  confirm nothing anywhere exceeds 10kg.
- `test:quality` before/after, and `test:load-suggestions`,
  `test:assumed-body`, `test:ceiling-units`, `test:starting-out`.
- **Deploy note:** frontend + migration. No `chat-gemini` change.

## Out of scope, flagged

- **"Which weights do you own", rather than "the heaviest".** Far more
  useful — it would let the app round to 10 or 15kg instead of a 12.5kg the
  trainee does not have — and a much harder question to answer and to build.
  The ceiling is the 80% version; named here so choosing it is visibly a
  decision.
- **The coach asking conversationally.** A real option Ashley considered and
  set aside; it needs an edge-function deploy and the coach has twice this
  session promised things it could not do.
- **Re-asking when kit changes.** Someone who buys heavier dumbbells has no
  way to tell the app except by editing a profile field that does not exist
  yet.
