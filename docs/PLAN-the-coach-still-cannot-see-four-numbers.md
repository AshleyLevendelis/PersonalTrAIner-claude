# The coach still can't see four numbers the Exercise tab shows

**Status: PLAN ONLY. Nothing here is built.** Load prescription gets a plan
before a build (CLAUDE.md), and the last change in this area went in without
one — which is how these were missed.

## How these were found

A code review of `f516748` (the commit that started sending the coach the
prescribed weight) found that the same omission it fixed is still live in four
other fields. Each one was **verified by running the builder**, not by reading:

| input | what the coach is sent | what the Exercise tab shows |
|---|---|---|
| `Pull-Ups (Assisted)`, `suggested_assistance_kg: 35` | `@ Bodyweight` | `35kg assist` (`AssistanceChip`) |
| a primer | `@ Light` | no weight at all |
| an uncategorised lift | `@ Choose by feel` | — |
| `{ day: 'Sunday', focus: 'Active recovery', exercises: [] }` | `Sunday: Active recovery - ` | a rest/activity day |

`@ Bodyweight` for the assisted pull-up is the worst of the four, and it is
worse than sending nothing: the prompt now teaches the model that `@ Bodyweight`
means **no external load**, so the coach is not merely missing the 35kg — it is
being told something false about it, confidently, in the exact shape of the
incident this whole thread began with.

## Two more, of a different kind

5. **The `assumed_body` hedge is stripped.** `LoadChip` labels a load from
   substituted body metrics *"starting light"* and explains *"it starts low on
   purpose rather than guessing"* — a deliberate honesty guarantee
   (`PLAN-honest-loads-without-a-body.md`). `load_source` never reaches the
   coach, and the new prompt tells it to read the number back and take a
   one-word yes. That turns a deliberately conservative floor into a firm
   prescription, in chat, after the UI was specifically fixed not to do that.

6. **Added load diverges between the two surfaces.** `TodayPanel` substitutes a
   *progressed* added load before rendering ("a trainee who hit their reps last
   week actually sees +17.5kg rather than the plan's +15kg"). The coach is sent
   the stored value. Tab says +17.5kg, coach says +15kg, about the same set.

Also noted, lower stakes: `tempo` and `intensity` are prescribed per exercise
and rendered on the tab, and are still withheld. For a rep-based lift with no
weight to add, tempo *is* the prescription — and those are exactly the
exercises whose load clause is the uninformative `@ Bodyweight`.

## What I'd propose, and the question inside it

The mechanical half is not in doubt: send assistance, send the progressed added
load rather than the stored one, name a primer as a primer rather than as a
weight, and drop the dangling separator on a day with no exercises. Those have
right answers.

**The one that is Ashley's call is (5).** When a load was built on a body we
substituted rather than one she gave us, should the coach:

- **(a)** quote the number with the hedge attached — *"the plan has ~40kg, but
  that's a deliberately light starting point because I never got your height"* —
  and still accept a confirmation; or
- **(b)** quote it plainly like any other prescription, on the grounds that the
  hedge is already on screen and repeating it every time is noise; or
- **(c)** not read it back at all, and ask what she actually lifted?

I'd recommend **(a)**: it costs one clause, it keeps chat and the Exercise tab
saying the same thing about the same number, and the whole reason `load_source`
exists is that a guessed load must never be presented as a known one.

## Verification this would need

- A structural gate over a real generated sweep: for every exercise, if any of
  `suggested_load_kg` / `suggested_added_load_kg` / `suggested_assistance_kg` /
  `per_set_load` is set, the coach clause contains that number. The current
  gate checks one hand-built literal with no load fields at all, which is why
  the assisted pull-up sailed past it.
- The same sweep asserting no day ever renders a trailing `- `.
- Whatever (5) resolves to, asserted on both surfaces at once, so they cannot
  drift apart again.
