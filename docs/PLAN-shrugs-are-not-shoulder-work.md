# Shrugs are not shoulder work

Came from Ashley running her own generated session past Gemini, which flagged
shrugs appearing on a push day. It was right, and the cause was a tag.

---

## The defect

A real session — "Push & Press", Monday — carried **Dumbbell Shrugs
3×15-18 · 16kg** between a bench press and a tricep extension. Shrugs are
upper-trap work: scapular elevation, functionally a pulling movement.

`Shrugs` and `Dumbbell Shrugs` both carried
`movement_pattern: 'isolation_shoulder'`, and `'Push & Press'` has an
`isolation_shoulder` accessory slot. That pattern had four members — two
genuine deltoid, two traps:

| isolation_shoulder (before) | what it actually is |
|---|---|
| Lateral Raises | deltoid ✓ |
| Cable Lateral Raises | deltoid ✓ |
| Shrugs | **trap** |
| Dumbbell Shrugs | **trap** |

**Not one unlucky roll.** Swept across 4 splits × 3 styles × 6 seeds (288
training days): shrugs appeared on 59 days, and **31 of those were a pressing
day** — the majority of all shrug placements were wrong.

**The codebase already knew the tag was wrong.** `categorize()` carries a
name-matched special case — `if (n.includes('shrug')) return 'shrug'` — under
a comment saying shrugs and lateral raises share the `isolation_shoulder` tag
but need different anchors, *"shrugs track deadlift; lateral raises track
bench."* That workaround fixed the **weight** and never the **placement**.

Third defect of this exact shape in as many rounds: a tag answering one
question being used to answer another.

## The fix

- New `MovementPattern` value **`isolation_trap`**; both shrug entries
  retagged. `isolation_shoulder` is now deltoid work only.
- Shrugs get `tier3_isolation` slots on the pulling tracks —
  **`'Pull & Hinge'`** and **`'Upper Pull & Core'`**.
- The three pattern-keyed maps updated deliberately (all are
  `Partial<Record<…>>`, so nothing was forced by the compiler):
  `NEAREST_PATTERN_FALLBACK`, `PATTERN_TO_RELATED_ISOLATION`,
  `MUSCLE_SIZE_RANK`.
- `categorize()`'s isolation switch gains `case 'isolation_trap'` — see below.

Fixing the data rather than adding a second name-based exclusion was the
point. A `n.includes('shrug')` guard in selection would have been a *third*
place that knows shrugs are special, and this round exists because the second
one was never enough.

## Measured

| | before | after |
|---|---|---|
| shrugs on a **pressing** day | **31** | **0** |
| shrugs reachable at all | 59 days | 54 days, 2 tracks |
| `categorize()` result | `shrug` | `shrug` |
| prescribed load | 28kg/hand | **28kg/hand** |

The load line matters: this was a **placement** change and had to move zero
kilos. `categorize()` name-matches `'shrug'` before any pattern logic, and
`ISOLATION_FRACTION_OF_COMPOUND.shrug` is untouched.

## Two things found while building

**The gate caught a worse trapdoor than the one it was written for.** A
tier3 trap movement whose *name* lacks "shrug" resolved to **`isolation_chest`**
— trap work priced as a cable fly. `categorize()` checks isolation tier
first, and that block's own switch has a chest `default`; the fallback case
at the bottom of the cascade is unreachable for isolation-tier entries. Both
switches now know the pattern. Today's two shrugs are name-matched so nothing
moved, but the next trap movement added would have been mispriced silently.

**`patternLabel` lost exhaustiveness, and the compiler said so.** It is the
one place a pattern name reaches a trainee (`pattern_gap_note`); a missing
case would have printed "undefined" into user-facing copy.

## A slot that could not be afforded

`'Back & Biceps'` is the textbook home for shrugs, and it does **not** get
the trap slot. Swapping its duplicate `isolation_bicep` slot for one put that
track's 30-45min sessions at **43min against a 37min budget** — 4 `duration`
failures in an audit that was otherwise at zero. Verified as caused, not
merely revealed: stashing the change returned the audit to 0.

That track is already at its time ceiling at the short tier, and shrugs have
two other homes carrying all 54 measured placements. Worth revisiting if its
budget ever loosens; not worth buying with a duration overrun.

## Verified

- **`npm run test:audit` — 0 failures across 13,967 combinations**, held.
- **New gate `npm run test:pattern-tags`**, named for the class rather than
  the instance because this is the third defect of the shape: the tag holds
  one kind of thing; shrugs are off pressing days; shrugs are *not orphaned*
  by the split; lateral raises still get their push-day slot (the over-fire
  check); load byte-identical; and the trapdoor is shut.
- **`test:quality` over 9,216 combinations: Selection 1.94 → 1.95**, every
  other dimension unchanged (Time fit 1.53, Structure 1.95, Progression 1.66,
  Goal alignment 1.97, Primer fit 2.00; overall 11.05/12, the +0.01 hidden by
  rounding). Small, but Selection is precisely the dimension a placement fix
  should move, and it is the only one that did.
- `test:per-side-load`, `test:workout`, `test:injury-separation`,
  `test:slot-replacement`, `test:assumed-body`, `test:weight-basis`,
  `test:mesocycle-roundtrip`, `test:block-consistency`,
  `test:ramp-visibility`, `test:session-derive`, `test:dashboard`,
  `test:starting-out`, `test:onboarding-slots`, `tsc -b`, `npm run build`.
- **No deploy** — engine and exercise data only.

## The rest of that review, not done here

Gemini made three points. This addressed one.

- **Band Shoulder Press over a dumbbell press** — also right, for a sharper
  reason than given: a resistance band is not in `LOADED_EQUIPMENT`, so the
  app shows **no weight at all** and the lift can only progress by reps.
  Nothing ranks candidates by implement, so in a full gym it is a coin flip.
  Open — it changes candidate ranking, so it wants its own measurement pass.
- **Session length** — not a defect. The app reserves warm-up time *before*
  allocating exercises (`budgetSeconds = totalBudgetSeconds − warmupReserve`,
  20% clamped to 6.5-14min) and `estimateDaySeconds` counts the warm-up.
- Noted in passing: `getWarmupReserveSeconds`' comment says 15% / 5min / 12min
  while the code is 20% / 6.5min / 14min. Doc drift, no behaviour change.
