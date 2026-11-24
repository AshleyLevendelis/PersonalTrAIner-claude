# A warm-up move weighs the same on every route, and a swing is not halved

Ashley, 24 Nov 2026, week 2: *"Kettlebell Swings at 8kg was way too light"*, beside a 95 kg trap bar deadlift. CSCS decision, mine.

## Traced and run

The warm-up price is half the swing's own easy-effort estimate (RPE 6 at ten reps). It was priced two ways:

| Route | How it was priced | Male, intermediate, 85 kg |
|---|---|---|
| A plan built fresh | Price above, once | 14 kg |
| Any edit: swap, rebuild, adaptation, ban, add | Took the testing week's half too, then the warm-up half | **8 kg**, his number |

Four more defects:
- A halved warm-up could be read back as last week's weight.
- A logged swing raised the card a step every session, because "5 of 5" is always the top of the range.
- The testing week's anchor treated a warm-up as a test.
- The gate's fixture priced a 50 kg, 60-year-old woman and only asked for a weight above zero.

## What changed

1. **One price on every route.** A warm-up move is priced from the person, the way generation prices it (`primerPrescription`). There is no testing-week discount and no logged or last-week weight fed back.
2. **The swing is not halved.** Its job before a hinge is a hard hip snap, and half of its easy estimate cannot ask for one: a trained man warms up with 16-24 kg. It now carries its own easy estimate.
   - Male, intermediate, 85 kg: 26 kg.
   - The other loaded warm-ups (wrist and forearm drills) keep the half.
3. **Never progressed from its log.** The card no longer reads a warm-up's log for a next weight, which is the engine's own rule elsewhere. The testing week's anchors skip warm-ups.
4. **A saved plan is corrected on open.** Any stored warm-up weight that disagrees with the price is rewritten once and saved (`repricePrimerSlots`). This is what moves his 8 kg.

## CSCS review

1. **Training effect:** the swing primes the hinge with a load that asks for power. 2 x 5 at an RPE-6 bell is still easy.
2. **What it takes away:** nothing. No working set, exercise or rest changes, and the session length is unchanged.
3. **Fundamentals:** untouched. The warm-up is not progressed, and it scales with the person's strength estimate and stated kit limit.
4. **Floors redefined:** the 18 Sep "half the working load" now applies to non-ballistic primers only. This is said here and in CLAUDE.md.
5. **Scope:** warm-up dosing, inside the delegation.

## Checks

- `test:primer-dose` (16 checks; 7 mutations, 7 caught).
- **Warm-up figures from before 24 Nov are not comparable for the swing.**
