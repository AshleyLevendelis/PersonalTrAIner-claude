# Plan: Real choosing, not filtering (Vision Step 1)

## Why this is happening

`VISION.md` sets the bar: "The engine must rank, not shuffle... Selection should score eligible candidates on quality, goal fit, experience fit, what's already in the session, and variety across the block — then pick the best, not any valid one. This is the difference between a generator and a trainer."

Today, that's not what happens. I read the actual selection code (not guessed) to confirm: once the app narrows exercises down to whatever fits your equipment, injuries, and experience, it picks one **at random** from what's left. Two people with identical profiles can get different exercises for no reason other than the luck of a dice roll — not because one was actually the better choice. That's the single biggest gap between what the app does today and what your vision describes.

This plan is Step 1 of the 5-step roadmap toward the vision (the other four — explaining its reasoning, filling thin exercise categories, learning from patterns, and living fatigue management — come after, in that order, since each one builds on this).

## In plain terms — what changes

Instead of grabbing a random allowed exercise, the app will **score every allowed option** — like a coach mentally weighing candidates — and pick the one that scores best. Five things go into that score, matching your vision's own list, and each one already has a related signal in the app to build on (nothing invented from nothing):

1. **Quality for the role** — an accessory exercise that directly supports today's main lift (e.g. hamstring work on a deadlift day) outscores one that's only generically eligible.
2. **Fits your goal** — a preference that exists today as an on/off switch becomes a proper weighted factor, and gets a couple of goal-specific additions (e.g. a fat-loss plan favoring bigger, more efficient movements over pure isolation).
3. **Fits your experience** — an easier "on-ramp" version of a move only wins if nothing more appropriate for your level is available. Same rule as today, folded into one scoring system instead of a separate, blunter step.
4. **Balance within the session** — avoid two exercises back-to-back that train the exact same muscles the same way, even if they're technically different movements.
5. **Variety within the week** — an exercise already used twice this week loses a little priority to something fresher.

One thing I confirmed while reading the code: **variety across the weeks of a training block is already handled** by a separate, existing rotation system that swaps in variations every few weeks. So this piece only needs to make the *first* pick smarter — it doesn't need to build long-term memory from scratch.

## Recommended scope for this first pass

Apply real scoring to what you'd actually notice: main lifts and the primary supporting exercises. Leave smaller filler exercises (curls, calf raises, that kind of thing) on the current simpler method for now — a deliberate first slice that keeps risk contained while still delivering the visible part of "feels hand-crafted." Extending scoring to the smaller exercises would be a natural fast-follow once this is proven out.

This is a scope choice, not a fixed decision — happy to include everything from day one instead if you'd rather.

## How I'll prove it actually worked

This is the most central piece of logic in the app — it decides what every workout looks like — so it gets extra verification, not less:

- Run the full existing safety/correctness checks with unchanged expectations. This shouldn't touch equipment or injury filtering at all, only *which already-valid exercise wins*.
- Run the app's own plan-quality scoring tool before and after, and expect the score to genuinely **rise** — if the scoring is working, plans should measurably improve, not just look different.
- Run the existing tool that checks different fitness goals actually feel different from each other, before and after.
- Print real example plans for a couple of representative profiles, before and after, so the difference can be eyeballed directly, not just trusted on faith.

## Model and effort

**Sonnet 5, high effort.** Worth the extra thinking time given how central this is, but the design above is concrete and grounded in real code already — not open-ended enough to need a smarter (and pricier) model.

---

*Status: proposed, not yet built. Waiting on approval to start.*
