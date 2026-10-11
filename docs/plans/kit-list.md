# The kit you actually have (the kit list)

Ashley, 9 Oct 2026, asked "How should someone tell the app what kit they
have?" (revisiting her 9 Sep "fix the words"), chose **"Remember what they
say"**: keep the four equipment choices; also remember the specifics people say
in setup or to the coach ("I've got dumbbells and a bench", "I don't own
bands"), shown as ticks on Profile. No new setup question. Nobody's plan
changes unless they say something. **"Build it", 11 Oct 2026.**

Her 9 Sep worry ("narrowing the sets would change every existing plan on those
tiers") does not arise: the tier sets are not touched. The list is per person
and read only when that person has said something.

Started from the lead branch `wip/k3-kit-list` (one unfinished, unrun commit).
This file replaces its plan; what changed from it is under **Departures**.

## What it is

A per-person list of **statements about kit**, each naming items from a closed
list of nine, applied in the order they were said on top of what the person's
equipment choice assumes.

| Key | Shown as | Catalogue strings |
|---|---|---|
| `dumbbells` | Dumbbells | `dumbbells`, `dumbbell` |
| `bench` | Flat bench | `bench` |
| `incline_bench` | Adjustable / incline bench | `incline bench` |
| `barbell` | Barbell and plates | `barbell`, `EZ bar`, `trap bar`, `t-bar` |
| `squat_rack` | Squat rack | `squat rack` |
| `kettlebell` | Kettlebell | `kettlebell` |
| `bands` | Resistance bands | `resistance band` |
| `pull_up_bar` | Pull-up bar | `pull-up bar` |
| `weighted_bag` | Weighted bag | `weighted backpack` |

Three kinds of statement: `has` adds, `hasnt` removes, `only` is the whole kit
(nothing off the list is owned: not the box, dip bars, ab wheel, medicine ball
or skipping rope, not a gym's machines). After `has`/`hasnt` alone, everything
not mentioned stays as the tier has it.

**Storage, no migration:** existing `user_facts` rows — `hard_constraint` /
`equipment`, the item keys in `resolved_refs`, `polarity` like = has, dislike =
hasn't, like + `hardness: 'hard'` = only. The coach's old free-text equipment
facts have no item keys and stay inert. Each row shows under "Things it
remembers" ("Kit: no resistance bands") with its delete.

**The derived tier:** engine reads that are about the KIND of trainee
(bodyweight phase rules, the implement preference, the warm-up's general block,
whether a ceiling is asked) read `equipmentTierFor(profile)`: a full gym stays
a full gym unless a whole-kit list was given; otherwise a barbell is a home
gym, dumbbells/kettlebell/bands Minimalist, else bodyweight. Never written back.

## Where it is read (ONE function each)

- `allowedEquipmentFor(profile)` (exercise-plan.ts) — `isEquipmentAllowed` and
  the pool's equipment stage, so generation, swaps, add-an-exercise, injury
  substitution, rebuilds, session rebuild, rotation and the scorer all follow.
  With no list it returns the tier's own set object, unchanged.
- `equipmentTierFor(profile)` — every engine read of the tier
  (`test:kit-list` §8 fails on a direct read).
- The warm-up: its own narrower map stays the base; with a list a drill also
  needs the item owned, and a positive statement widens it.
- Ceilings: an implement the person has said they lack is never their cap and
  never asked about.
- A travel tier (temporary equipment) describes somewhere else: that tier's
  plain set, minus bands or a bag they have said they lack.
- App: the profile every tab and the coach receive is
  `profileWithKit(storedProfile, compileKitStatements(memoryFacts))`; the
  cold-load chain reads the facts with the plan and attaches them the same way.
  So every rebuild path that is handed `profile` carries the kit.

## The doors

- **Profile → Equipment → "What you have"**: the nine as ticks. A change is
  priced first (kit-change.ts `planKitChange`: which exercises move, from which
  date) and saved only on Save (`recordKitStatement`), Cancel writes nothing.
  Changing the equipment choice retires the list (a whole-kit list would
  otherwise cancel a move to a gym); the ticks then show the new choice's own
  assumption, and the rebuild offer comes after.
- **The coach**: `propose_kit_change` (has / hasnt / only, items from the nine).
  The card is refused before it is built unless every item is in her own words
  the right way round (`kitStatementInUserWords`), priced by the same
  controller Profile uses, and confirmed through the same function.
- **Setup**: a never-asked `kitList` slot, recorded only when volunteered and
  only when in her own words; the first plan is built from it and it is then
  saved as the same kit row. The worked example that taught "dumbbells at home
  → Minimalist" as CERTAIN is replaced.
- App builds one `KitController` (`makeKitController`) and hands it to both
  Profile and the coach: parity by construction.

## Departures from the lead branch

- **No dumbbell pack and none of E2's fixes in this build.** Seven catalogue
  entries and a selection-pool rule change every trainee's plan, which would
  make "nobody's plan changes unless they say something" unmeasurable on the
  grid. They are their own job, and the cost of not having them is below.
- No change to `dev-constraint-audit.ts`: the gate keeps its own independent
  table of what each item unlocks instead.
- Statements are a list (`statements: KitStatement[]`) so a changed tick-list
  is one `has` and one `hasnt`; earlier rows a new one makes redundant are
  retired, provably without changing the kit (`supersededStatementIndexes`).
- A statement that changes nothing is not saved; a warm-up that asks for kit
  now missing is re-made even on a day whose exercises did not change.

## CSCS review

1. **Training effect.** Better for the person who has said something: a
   prescribed movement they cannot perform has none. Unchanged for everyone
   else (byte-identical plans, measured below).
2. **What it takes away.** An honest kit is thinner. Measured on the tester's
   profile (Minimalist, shoulder flag, dumbbells + bench): the week loses its
   chest-and-triceps day because no triceps isolation survives a shoulder flag
   without bands, pushing falls to one press, and the back day is led by a
   Towel Row while the dumbbell row sits on two other days. Every kit plan in
   the gate's grid still clears the 7.2 quality floor, and the app's own
   push-pull ruling (24 Sep) does not count a pull-heavy week as a flaw when
   injuries left one press. The fix is the dumbbell pack. Also seen: a "no
   bands" swap replaces a band lat pulldown with Scapular Pull-Ups ahead of
   Pull-Ups, because the swap ranker prefers lower joint stress; that ranking
   predates this and applies to every swap.
3. **Fundamentals.** Push, pull, hinge and squat survive every kit in the
   grid; vertical pulling does not exist without a bar or bands and the plan
   says so as it already does.
4. **Floors and ceilings.** None moved for anyone who has said nothing. For
   someone who has, a dumbbell-or-kettlebell lift is capped by the dumbbell
   number when they have said they have no kettlebell — the cap is the
   heaviest thing they HAVE that can do the lift; with only a kettlebell
   number on file that leaves the lift uncapped, priced from the tables like
   any other dumbbell lift, and the ceiling prompt then asks for the dumbbell.
5. **Scope.** Inside: equipment selection, substitution and load. Nothing
   diagnoses or treats; the pain rule is untouched.

## Questions that are hers (not decided here; the neutral version is built)

- The swap sheet: "I don't own it" (for good, through this list) as well as
  "not this week" (the current seven-day trip)? Today the sheet is unchanged.
- After somebody logs above a limit they stated: ask "new dumbbells?" once?
  Today nothing asks.
- The wording on the ticks and the card is the app's voice, so hers to change.

## Gates

`test:kit-list` (the engine on a grid of five kits x five profiles, the
tester's profile, ceilings, travel, the doors' function against a fake
database that records what it was asked, the own-words guard on sentences,
source wiring) and `verify:kit-ticks` (Profile at 390x844). Plus the grid
(`test:quality`) run before and after on the same machine.
