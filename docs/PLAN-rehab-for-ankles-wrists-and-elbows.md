# Rehab for ankles, wrists and elbows

## The gap, measured

VISION.md already rules on this: *"An injury should produce a plan that
actively rehabilitates it, not one that merely avoids the joint."* Four of the
eight injuries do not meet that standard. Swept across 144 plan configurations
(4 splits × 3 styles × 4 equipment tiers × 3 session lengths), 576 training
days each:

| injury | exercises removed | given back | days carrying rehab |
|---|---|---|---|
| shoulders | 47 | 9 | 576 / 576 |
| knees | 25 | 10 | 576 / 576 |
| lower back | 12 | 3 | 576 / 576 |
| hips | 9 | 4 | 576 / 576 |
| **wrists** | **21** | **0** | **0 / 576** |
| **ankles** | **13** | **0** | **0 / 576** |
| **elbows** | **10** | **0** | **0 / 576** |
| **neck** | **5** | **0** | **0 / 576** |

A trainee with bad wrists loses 1 in 7 of the catalogue and is handed nothing
in return.

## Scope — Ashley's ruling

**Ankles, wrists and elbows. Not the neck.** Those three have standard,
benign, widely-agreed rehab. "My neck bothers me" spans a stiff desk neck to a
nerve problem that should not be loaded at all, and the app cannot tell which;
per VISION.md's *"never claims a capability it doesn't have"*, it says so
rather than prescribing. The neck's removal half (5 exercises) stays exactly
as it is.

## Mechanism — checked, not assumed

`pickRehabMovement` (exercise-plan.ts) fires once per training day and needs a
pool entry that is `isIndicatedFor` the flagged joint and **not**
`tier2_compound`. It prefers `primer`-tier entries where any exist, then picks
within 1.25× of the cheapest `avg_duration_seconds` and rotates inside that
band. So new entries must be `primer`, and their durations must sit close
enough together that all of them rotate rather than one winning every session
— the failure the knee set already hit (Seated Short-Arc Quad Set, 576/576).

Two properties make this safe by construction:
- `isContraindicatedFor` returns false whenever `isIndicatedFor` is true, so a
  wrist drill marked indicated survives the very filter that strips the other
  21 wrist exercises.
- `jointDisplayName` falls through to the raw tag for `ankle`/`wrist`/`elbow`,
  which already reads correctly. No display-map change (unlike
  `lower_back_axial`, which needed one).

Each entry also needs `primer_pattern_affinity`, or it is dead weight outside
the rehab slot: a primer with no affinity is never selected by
`getAffinityPrimerPool`.

## What gets added — 9 entries, all primer tier, none weight-bearing on the injured joint

- **Ankle**: Ankle Alphabet (bw), Banded Ankle Dorsiflexion (band/bw),
  Single-Leg Balance Hold (bw). Affinity: lower-body patterns.
- **Wrist**: Wrist Circles (bw), Banded Wrist Extension (band),
  Banded Wrist Flexion (band). Affinity: upper-body patterns.
- **Elbow**: Eccentric Wrist Extension (db/band), Forearm
  Pronation-Supination (bw), Isometric Grip Squeeze (bw). Affinity: upper-body.

Wrist and elbow rehab genuinely overlap — eccentric wrist work is standard for
both — so three entries carry both tags rather than being duplicated.

Deliberately NOT used: loaded calf raises for ankles (already contraindicated
for that joint) and any weight-bearing-on-the-hands drill for wrists. Marking
one indicated would force it past the contraindication filter onto exactly the
people it is wrong for.

**Every joint keeps bodyweight-tier coverage**, or the guarantee would hold at
full_gym and silently fail for someone training at home.

## Verification required before this is called done

1. `report-rehab-coverage.ts` extended to all seven treated injuries, same
   sweep both sides, so before/after are comparable by construction.
2. All three new joints reach 576/576 days and 0/144 plans-with-none.
3. Rotation is even within each joint — no single movement winning every day.
4. The uninjured control does not move: these are ordinary primers, so some
   incidental appearance is by design, but the injured/uninjured gap is what
   the guarantee buys and it must stay large.
5. Neck stays at 0 — proving the scope line held, not just that it was stated.
6. `test:rehab-prescribed` extended, with mutations proven to bite.

## Deploy

Client-side only → Vercel push. The exercise catalogue has no server-side copy
(only `food-db.ts` is duplicated under `supabase/functions/_shared/`).
