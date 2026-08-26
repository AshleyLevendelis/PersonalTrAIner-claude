# The set log can record added weight

## Context

Last round gave weighted pull-ups and dips a prescription
(`suggested_added_load_kg`). This closes the other half of the loop: the app
can now tell you to add 15kg, and has nowhere to record that you did.

**The chain, traced rather than assumed:**

1. **Prescription** — done (`583718a`, `2398d0c`).
2. **The log has no column for it.** `SetGrid` already lets you type a weight
   on a pull-up, and writes `weight_kg: 15, is_bodyweight: false` — i.e.
   *"the pull-up weighed 15kg"*. That is not a missing feature, it is a
   **wrong one**: the row is indistinguishable from an ordinary 15kg lift.
3. **The read-back never runs.** `TodayPanel:152` filters
   `.filter(ex => ex.suggested_load_kg != null)` before asking for a
   recommendation, and a pull-up's is null — so
   `getDoubleProgressionRecommendation` is **never called for these lifts at
   all**. The loop was open at both ends.

**The precedent that decided the shape.** `assistance_kg` was added by
migration `20260811100000`, and its own comment says the write path "is NOT
built in this migration — see the round's decision log for why that's scoped
as its own pass." That pass never happened: two weeks on, the column exists
and nothing writes it. Adding a column and stopping is the failure mode here,
so this round does column **and** write **and** read-back or it is not done.

## The build

### 1. A separate column, not a reinterpretation of `weight_kg`

```sql
alter table exercise_set_logs add column if not exists added_load_kg numeric null;
```

`weight_kg` means *the weight of the thing you lifted*. Overloading it to
mean *the weight you hung off yourself* — switching on `is_bodyweight` —
would be one field answering two questions, which is the defect class this
repo has now hit five times (`loads_joints`, the shrug `isolation_trap`, the
slot-inheritance leak…). A weighted pull-up logs
`weight_kg: 0, is_bodyweight: true, added_load_kg: 15`, and every existing
reader — `isMalformedZeroWeight`, `maxWorkingWeight`, ghosts, PR cache —
carries on seeing exactly what it saw before.

### 2. The write must not break logging before the migration runs

Both insert paths spread a fixed object. Adding a column unconditionally
means **every set write fails** with "column does not exist" until Ashley
runs `db:push-both` — a live-user breakage, on the one path where losing data
is unforgivable, for a feature almost nobody is using yet.

So, two rules:

- **Omit the field entirely when it is null.** An ordinary set's payload is
  byte-identical to today's, so 99.9% of logging cannot be affected.
- **Degrade rather than lose the set.** If a write carrying
  `added_load_kg` fails on a missing column, retry once without it. The
  trainee still gets their reps recorded; only the added weight is lost, and
  only until the migration runs. **A set someone actually did must never be
  lost to a pending migration.**

### 3. The input says what it means

On a lift with `accepts_added_load`, `SetGrid`'s weight box is labelled and
written as ADDED weight. Today typing 15 there silently means "this pull-up
weighs 15kg"; after this it means "+15kg", matching the `AddedLoadChip` the
prescription already renders.

### 4. The read-back, and the rule it follows

`getAddedLoadProgression` mirrors `getDoubleProgressionRecommendation`
exactly — hit the top of the rep range on every set and the weight goes up by
one increment; anything short and it holds and you chase reps first. On
`added_load_kg` rather than `weight_kg`, with a 2.5kg step (one plate pair,
matching `prescribeAddedLoad`'s own rounding).

`TodayPanel`'s filter widens to include `suggested_added_load_kg != null`, so
these lifts finally ask the question at all.

## Verification

- **New gate `npm run test:added-load-log`**, on `test-logging-roundtrip`'s
  injected fake Supabase client (no credentials):
  - a weighted pull-up round-trips: `added_load_kg` written, read back, and
    `weight_kg` stays 0 with `is_bodyweight` true;
  - an ordinary loaded set's payload **does not contain the key at all** —
    the pre-migration safety property, asserted on the payload rather than
    the outcome;
  - a write that fails on the missing column still records the set, minus
    the added weight;
  - double progression on added load: all sets at top reps → +2.5kg; short
    of it → holds;
  - `isMalformedZeroWeight` still rejects the rows it always did, and does
    NOT reject a bodyweight+added row.
- `test:logging-roundtrip`, `test:added-load`, `test:dashboard`,
  `test:no-forked-state`, `test:session-derive`, `test:audit`, `tsc -b`,
  `npm run build`.
- **`npm run test:schema-parity`** after the migration is applied.

## What Ashley has to run, and what is inert until she does

```
npm run db:push-both        # the added_load_kg column
```

Not reachable from this sandbox — `*.supabase.co` returns 403 at the network
layer. Until it runs: ordinary logging is completely unaffected (that is the
point of §2), and a weighted pull-up logs its reps with the added weight
dropped and a console warning. This is now the **third** owed migration,
alongside `weight_basis_offers` and `swapped_for_activity`.

## Out of scope, flagged

- **`assistance_kg` is still unwired**, and this round builds the exact
  plumbing its own migration comment said it needed. Deliberately not
  widened into — it is the mirror case (less over time = stronger) and wants
  its own pass — but it is now a strictly smaller job than it was.
- **Chat's `log_set` tool** doesn't take added weight either. The edge
  function is a separate deploy; noted rather than half-done.
