# Plan: Explain the pick (Vision Step 2)

## Why this is happening

`VISION.md` says: "Where a choice is non-obvious, say why: 'trap bar rather
than conventional because your recovery is stretched thin this block.'
This is the clearest signal that a coach designed the session rather than
a filter, and it lets the user learn rather than just comply."

Step 1 (already live) made the app actually pick the best exercise instead
of a random valid one. But I checked the code before writing this plan,
and right now that reasoning is thrown away the instant it's used. The
app scores every option, picks the winner — and then keeps only the name.
Nothing about *why* it won survives. Three consequences of that, all
confirmed by reading the code:

- **The app never tells you.** There's nowhere in the workout screen that
  says why an exercise was chosen — every other note you see (like "why
  this weight" on the load chip) is about the weight, never the exercise
  itself.
- **The plan itself doesn't remember.** If you swap tabs, come back
  tomorrow, or the app rebuilds your week, there's no trace left of what
  made today's picks the right call.
- **The coach chat is guessing.** If you ask "why did you pick Dumbbell
  Rows instead of Cable Rows," the chat currently only knows the
  exercise's name, sets, reps and rest time — nothing about why it beat
  the alternatives. It would have to invent an answer, which is exactly
  what your vision says the app must never do ("never claims a capability
  it doesn't have").

This step fixes all three by capturing the reason at the moment a pick is
made and carrying it through to wherever it's needed.

## In plain terms — what changes

When the app builds your plan, and a pick was decided by something
specific — not just "this was the only sensible option left" — it keeps a
short, plain-English note about why, right on that exercise. That note
then shows up in two places:

1. **On the exercise itself**, using the same small "ⓘ" info button
   your load numbers already have (tap it, a one-line explanation drops
   down — no redesign, just the same pattern used for "why this weight,"
   reused for "why this exercise").
2. **In the coach chat**, so if you ask "why this exercise," it answers
   with the real reason instead of guessing one.

### The important design call: only speak up when it mattered

Not every exercise gets a note. Most picks come down to "this was simply
the best fit, nothing dramatic happened" — and your vision is explicit
that this only kicks in when a choice is **non-obvious**. So a note only
gets attached when I can point to the actual runner-up and say "this beat
that specifically because of X" — not just "X was true of the winner."

Concretely: at the moment of picking, the app already ranks every valid
option. I'll compare the winner against whichever option came second and
identify what actually separated them — an easier variation because
you're newer to a movement, a lighter-impact option because your goal
prefers it, a pick that avoids repeating a muscle you already worked
minutes earlier that session, or a fresher option because something else
already showed up twice this week. If nothing meaningfully separated the
top two — they were close enough that either would've been a fine, normal
choice — no note is attached, same as today.

This is a genuine trade-off, and I want your call on it before I build:

- **Quieter (my recommendation)**: notes appear only when they'd actually
  teach you something — probably a handful of exercises per week, not
  every day. Feels earned when it shows up, but easy to miss it exists at
  all if you're not paying attention.
- **Chattier**: lower the bar so more picks get a note, even smaller
  ones. Makes the "a coach designed this" feeling more constant and
  visible, but risks it feeling like filler commentary on autopilot picks
  — which is exactly what the vision says to avoid.

I'll ask you this directly, separately from this document, rather than
guess — it changes what you'll actually see day to day.

## What doesn't change

- Nothing about *which* exercise gets picked. This only adds an
  explanation to a decision Step 1 already makes — it can't cause a
  different exercise to be chosen.
- No database migration needed. I checked: your workout weeks are already
  stored as one flexible block per week (not fixed columns), so adding
  this note to an exercise is just new information riding along with data
  that's already being saved — nothing to change in the database itself.
- Plans you already have won't retroactively gain notes — only plans
  generated or rebuilt after this ships will have them. Nothing is lost
  or broken on existing plans; they simply won't have notes until they're
  next regenerated (which already happens periodically as part of normal
  use).

## How I'll prove it actually worked

- Confirm notes appear only on picks that were genuinely close calls, by
  checking a sample of generated plans by hand — not just trusting the
  code compiles.
- Confirm a plan with zero non-obvious picks in it produces zero notes —
  the feature must be able to stay silent, not force a note onto every
  exercise to seem more active than it is.
- Ask the coach chat "why this exercise" on a few real picks and confirm
  the answer matches the actual reason the app captured, not an invented
  one.
- Run the full existing safety/correctness checks with unchanged
  expectations — this doesn't touch which exercises are chosen, so
  nothing about equipment, injury or experience filtering should move.

## Model and effort

**Sonnet 5, medium effort.** This is smaller and more contained than Step
1 — no new selection logic, just capturing and carrying forward a reason
that's already computed today and thrown away. The one place it needs
real judgment rather than mechanical wiring is the wording of the notes
themselves (making them sound like a coach, not a system message), which
I'll draft and show you before it ships broadly.

---

*Status: proposed, not yet built. Waiting on approval to start.*
