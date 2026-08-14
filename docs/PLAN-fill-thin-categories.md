# Plan: Fill the thin spots left in the catalogue (Vision Step 3)

## Why this is happening

Earlier this session I fixed real bugs in how the app *offers* swaps (the
swap logic itself, plus 10 new exercises for the worst gaps found at the
time). That was a real fix, but it treated the symptom in the spots I
happened to test. I went back and actually measured the catalogue as it
stands today — every exercise, against every equipment level and every
common injury — to find what's still thin, rather than guessing where to
add next.

The numbers: out of 1,364 realistic (equipment, injury, exercise)
situations checked, **59 have zero alternative exercise on offer at all**
— if that one exercise is unavailable (busy machine, disliked, hurts),
the app has nothing else to suggest. A further **151 have exactly one**
alternative — one busy machine away from the same problem. This is
exactly the gap your vision calls out: *"A busy machine needs a swap
that's actually available."*

## What's actually thin — the real pattern, not a guess

Two things stood out clearly in the numbers, not just anecdotally:

1. **Leg and lower-body isolation work is thin everywhere**, not just on
   one equipment tier. Quad isolation, hamstring isolation, calf work,
   and single-leg movements account for over half of every "zero
   alternative" case, across full gym, home gym, minimalist, and
   bodyweight alike. A handful of specific exercises — a banded knee
   extension, a step-up variation, a sliding leg curl, a carry — show up
   as the *only* option in their slot in more than one situation each.
2. **Bodyweight-only is the single hardest equipment level.** It has the
   most "nothing else to offer" situations of any tier, which makes
   sense — it's the smallest slice of the catalogue — but it's also the
   tier where someone genuinely has the fewest real alternatives in
   their own gym, so a thin app catalogue hurts most exactly where it
   can least afford to.

## In plain terms — what changes

I add new, real exercises — the same kind of careful, tagged additions
as the 10 done earlier this session — specifically targeting these two
gaps: more genuine variety in leg/lower-body isolation work, and more
bodyweight-tier options generally. Not a random pile of new exercises —
each one is chosen because it directly fills a spot the measurement
showed was empty or down to one option.

Every new exercise gets the same real work the existing 125 have: which
equipment it needs, which joints it loads or should avoid, what movement
pattern it belongs to, and what it can stand in for. Getting these tags
wrong would be worse than not adding the exercise at all — a wrongly-tagged
"shoulder-safe" exercise that isn't could put someone with a shoulder
injury into pain. So this gets the same care as any of the app's existing
safety-tagged data, not a shortcut because it "just" looks like adding
rows to a list.

## How I'll prove it actually worked

- Re-run the exact same before/after measurement I used to find these
  gaps, and report the real change in numbers — how many of the 59 zero
  situations are now covered, and by how much the 151 fragile
  one-option situations improved. Not "I added exercises," but "here's
  the actual number that moved and by how much."
- Run the full safety/correctness check suite unchanged — new exercises
  must never let something through that shouldn't be (an injury-unsafe
  pick, a skill-inappropriate one, a duplicate movement family).
- Spot-check a handful of the specific worst cases from the numbers
  above by hand — confirm a real person hitting that exact
  equipment+injury combo now sees a genuine second option, not just
  that a count went up somewhere.

## Model and effort

**Sonnet 5, medium effort.** This is careful data-authoring work —
picking real, correct exercises and getting their safety tags right —
not new algorithm design. Medium effort matches the amount of judgment
needed to tag each addition correctly without the deeper architectural
thinking Step 1 needed.

---

*Status: proposed, not yet built. Waiting on approval to start.*
