# The injury substitution repeats itself

## How this was found

Chasing the two red assertions in `test:injury-rebuild`, which say the
injury **rebuild** must keep more slots than pointwise **substitution**.
Both fail:

| | slots |
|---|---|
| original plan | 448 |
| after substitution | **444** (4 dropped, 0.9% loss) |
| after rebuild | **436** |

The obvious reading is "the rebuild regressed". It hadn't. The loss is
**spread, not concentrated** — 80 sessions in both, 16 gained a slot, 28 lost
one, and the four deload weeks are untouched. Nothing fails to fill.

Then the structural comparison, which is what the count was standing in for:

| | slots | distinct exercises | duplicates **within one session** |
|---|---|---|---|
| original (uninjured) | 448 | 62 | 0 |
| substituted | 444 | 45 | **28** |
| rebuilt | 436 | 49 | **0** |

A real substituted session, printed verbatim rather than counted:

```
wk1/Monday: Band Dislocates | Barbell Floor Press | Landmine Press |
            Landmine Press | Tricep Pushdowns | Side Plank | Barbell Floor Press
```

Seven "exercises", four movements. **Substitution's 444 is inflated by
duplicates**, so the gate was comparing an honest number against a padded
one. Rebuild was never the problem.

Also visible in the same table: substitution leaves `vertical_push` at 9.9%
of the plan for a SHOULDER-injured trainee, where the rebuild takes it to
3.7%. Nothing unsafe is prescribed either way (`0 unsafe` passes for both),
but overhead pressing volume is exactly what a shoulder wants less of.

## The defect

`substituteSlots` (`src/lib/plan-adaptations.ts:36`) **has** a
duplicate guard, and the surrounding code makes it impossible to work:

```ts
const alreadyUsedInDay = new Set(day.exercises.filter((_, i) => i !== idx).map(e => e.name))
const candidates = getReplacementCandidates(slot.name, candidateProfile, exclusions)
  .filter(c => !alreadyUsedInDay.has(c.exercise.name))
```

Two things defeat it:

1. It reads `day.exercises` — the **original** array — so it can only avoid
   names that were already there, never ones chosen during this pass.
2. Every slot is substituted **in parallel** (`Promise.all(day.exercises.map(...))`),
   so no slot can observe another's choice.

Two conflicting slots in one session therefore compute the same
`alreadyUsedInDay`, receive the same ranked candidate list, and both take
`candidates[0]`. The comment above it explaining the filtering gives false
confidence — a correct-looking guard over a mechanism that cannot run.

## The change

Sequence the substitution **within a day**, accumulating chosen names:

- Replace the inner `Promise.all(day.exercises.map(...))` with a `for` loop
  that awaits each slot in turn and adds each replacement's name to a running
  `usedInDay` set seeded from the untouched original names.
- Weeks and days stay parallel — only slots inside one day need ordering,
  and that is the only place the collision can occur.

Nothing else moves. `getReplacementCandidates`, `applyReplacement`,
`recomputeLoad` and the drop path are untouched.

## The consequence to flag, not bury

Some slots that currently take a duplicate will find **no unique candidate**
and drop to `null` instead. So `dropped` rises above 4 and `planLossRatio`
rises with it.

That is the honest number — a dropped slot is better than a session listing
the same lift twice — but it feeds `assessAdaptation`, whose
`shouldRebuild` fires at `dropped / totalSlots >= REBUILD_PLAN_LOSS_RATIO`.
**So this fix can change which mode a user is offered**, pushing more
injuries toward a rebuild. That is arguably correct (the rebuild is measurably
the better plan here) but it is a live behaviour change and must be measured
and reported, not discovered later.

## The gate

`test:injury-rebuild`'s two count assertions are replaced, because raw count
was never the property worth guarding:

- **no within-session duplicates after substitution** — the bug above, which
  no gate currently catches;
- **rebuild introduces no duplicates either** (already true, kept honest);
- **rebuild retains at least as many DISTINCT exercises as substitution** —
  what "rebuild beats substitution" actually meant;
- the existing `slotsAfter >= slotsBefore * 0.8` floor stays, so a genuinely
  hollow rebuild still fails.

Mutation: restore the parallel `map` and confirm the duplicate check goes
red.

## Verification

- `test:injury-rebuild` green on the new assertions; the duplicate count for
  substitution goes **28 → 0**.
- Report `dropped` and `planLossRatio` before and after, and say how many
  profiles change `shouldRebuild`.
- `test:injury-separation`, `test:injury-adaptation-safety`,
  `test:rehab-prescribed`, `test:band-slots`, `test:audit` (expect 0 / 13,967
  held — this changes adaptation, not generation).
- Full 67-gate sweep, `npx tsc -b`, `npm run build`.

## Flagged, not fixed here

`test:band-slots` is still red (318 against a floor of 335) and is a separate
count proxy; its property checks all pass — 48 of 48 knee-injured profiles
still get a knee-indicated movement. Investigated alongside this because both
count placements in injury-aware selection, but the duplicate bug is in the
substitution path and band-slots measures generation, so they are not the
same cause.
