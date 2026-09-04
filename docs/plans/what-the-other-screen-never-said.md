# What the other screen never said — whole-app audit, 3 Sep 2026

Ashley: *"go through the entire app and see how well we meet the intended
targets of the app and fix any issues you find."*

An audit first, a fix list second. This records both, including the parts that
came back clean, because "checked and sound" is worth as much to the next pass
as "found and fixed".

## The shape of every defect found

The app meets VISION.md well. Every defect this audit turned up is the same
shape, and none of them is a coaching error:

> a fact the app already computes, on the right side of a decision it already
> got right, that never reaches a screen the user actually looks at.

That is the same shape as the four defects from Ashley's phone the day before,
and the same shape as the dead "How to do it" menu item. It says where the next
audit should start: not in the engine.

## What was checked and found sound

- **All 126 gates.** Two reds, both explained below — one environmental, one a
  genuine finding.
- **Day-level parity across the three day surfaces.** `recommendedCardio`,
  `pattern_gap_note` and `block_size_note` all render on both TodayPanel and
  ProgramBrowse.
- **Dead dialogs** — the "How to do it" bug class, a control wired in one
  return branch of a component and not the other. Every multi-branch component
  in `src/` scanned. One hit, `SessionSummaryDialog` in TodayPanel, and it is a
  false positive: the second `return` belongs to `ExerciseList`, a different
  component in the same file.
- **`prescription_type` on the browse surface.** Looked like a bug and is not.
  The browse row renders `{sets}×{reps}` knowing nothing about whether `reps`
  is a count, a hold or a distance — but `quality-score.ts` and
  `dev-constraint-audit.ts` both enforce that a `time`/`intervals` entry's
  `reps` string carries its own unit, so `3×30-45s` reads correctly everywhere.

## 1. The coaching rationale was invisible when browsing the plan

`selection_note` is VISION's *"where a choice is non-obvious, say why"*, which
the same paragraph calls *"the clearest signal that a coach designed the
session rather than a filter."* It is written by `exercise-plan.ts`, fed to the
coach through `chat-plan-context.ts`, and rendered by `ExerciseRow` — **today's
session screen only.**

Measured across a 64-plan sweep: **4,292 of 24,592 exercise slots (17.5%)
carry a note, in 60 of the 64 plans.** All of it invisible on the Full Program
screen — the one place you go to understand the shape of a plan rather than to
execute one set of it.

Fixed by giving `ReadOnlyDayList` the same `why this exercise` toggle, on its
own `explainedPickKey`. Deliberately a separate key from `explainedKey`, which
explains the *weight*: two different questions, and a shared key would make
opening one close the other.

## 2. Rest was shown on no screen at all

A field-by-field parity scan of the three exercise surfaces found this.
`ex.rest` reached `ExerciseRow` only as `restTime={…}` into `SetGrid`, whose
one use for it is starting the timer *after* a set is logged. `ExerciseLine`'s
summary is `sets×reps · load · assist · added load · tempo` and stops.

So Ashley's 3 Sep ruling — two minutes on a loaded main lift, conditioning
keeps 90 seconds — could not be read anywhere in the app before doing the work.
Worse: the handover written for her said to *"open the Full Program screen and
check the first exercise says 120s"*, which was not possible.

Fixed on **both** rows, in the expanded body, same words and same placement.

*Judgment call, flagged.* Putting it on the session row too was mine, not
Ashley's — the alternative was browse-only, on the argument that the timer
already expresses rest functionally. Chosen because the parity gate below is
only worth having if it has no exceptions, and because "how long do I rest
here?" is asked standing at the rack. Cheap to reverse.

## 3. The gate that could not see module-private dead code

`exercise-plan.ts` carried a complete four-week volume-modifier system —
`MesocycleVolumeModifier`, `getMesocycleModifier`, `bumpReps`,
`addRestSeconds`, `applyWeekModifiers` — with per-week `setsMultiplier`,
`repsAdjust`, `restAdjust` and RPE strings (*"RPE 8-9 — Peak overload week"*,
*"RPE 5-6 — Deload"*). **Nothing called any of it.** `periodization.ts` owns
phases. Roughly 90 lines in the middle of the generation engine that read
exactly like live coaching output and reached no user.

`test:no-dead-code` missed it for two structural reasons, and both are fixed
because both are why it sat there:

1. It scanned only `^export function` / `^export const` in `src/lib` and
   `src/hooks`. These were **module-private**, so it never looked. New **§4**,
   budget **zero** — §1's budget exists because an unused export is often
   legitimate (a seam a gate reads, a call site that moved); a private function
   nothing calls has no such excuse, since nothing outside the file can ever
   reach it.
2. It did not recognise `export { X }`. That is how `MESOCYCLE_WEEK_LABELS`
   (declared in `exercise-plan.ts`, re-exported ~700 lines below) was invisible
   too — exported, imported by nobody, while `App.tsx` kept its own literal
   copy of the same four strings. §1 counts the form now, and `App.tsx` imports
   the shared list instead of duplicating it.

## 4. A merged change left a gate red, and the merge is what missed it

**`test:main-lift-rest` was red at HEAD** — five failing checks, confirmed by
stashing this session's work and re-running. Not caused by this audit; caused
by **PR #15, merged to `main` the day before.**

§3's last loop asserted *"no goal other than conditioning has a floor of its
own"*, which was true when the 2 Sep ruling gave conditioning alone a 90s
loaded-main-lift floor. Ashley's 3 Sep ruling inverted it: two minutes for
every other goal. The gate went red on the merge and nobody read the output —
including whoever merged it, which was me.

The check was never wrong about its **intent** — conditioning must not be
dragged up to everyone else's rest — only about the incidental fact that
everyone else had no floor. It asserts the intent now: conditioning's floor is
90, every other goal's is 120, and 120 is above 90. The numbers are hardcoded
on purpose. This is where a ruling is pinned; changing one should cost a
conversation, not pass silently.

## Gates and mutations

`test:one-day-one-look` gains **§4, the two rows say the same things** — the
file previously checked only how a day *looks* (shared row, section labels, no
`<Table>`, no fourth surface) and never what it *says*, which is the hole both
defects fell through.

- §4a the `selection_note` control on both rows: the guard, the visible label
  as a text node between `>` and `<`, and the note interpolated — three
  separate assertions, because any one alone is satisfiable by something that
  renders nothing.
- §4b rest as a **text node, not a prop**. Every `prop={…}` is stripped before
  the check. This matters: `restTime={ex.rest}` was already true of
  `ExerciseRow` throughout the entire period the number was invisible, so a
  plain `/ex\.rest/` would have passed against the bug.
- §4c backstop, derived from source rather than listed: the symmetric
  difference of `ex.<field>` references between the session pair
  (`ExerciseRow` ∪ `ExerciseLine`) and the browse pair (`ReadOnlyDayList` ∪
  `ExerciseLine`) must be empty except for three named allowances —
  `per_set_load` and `prescription_type` (both feed `SetGrid`, which a
  read-only surface may not have) and `load_source` (today's row takes it as a
  prop). A field added tomorrow is covered without anyone remembering this
  file, and an allowance that stops being asymmetric is flagged as stale.

Nine mutations, **each confirmed to apply** before its result was believed —
a mutation that silently no-ops reads as "survived", which has happened here
before:

| mutation | result |
|---|---|
| `selection_note` block deleted from `ReadOnlyDayList` | 4 red |
| …deleted from `ExerciseRow` | 4 red |
| rest line deleted from `ReadOnlyDayList` | 3 red |
| rest line deleted from `ExerciseRow`, `restTime={ex.rest}` kept | **2 red** |
| `ex.intensity` added to the browse row only | 1 red (§4c) |
| a private function with no caller re-added | red (`no-dead-code` §4) |
| a const exported only via `export { X }`, imported by nobody | red (§1, 41 > 40) |
| conditioning's floor dragged up to 120 | 6 red (`main-lift-rest` §3) |
| hypertrophy's two-minute floor deleted | 3 red |

The fourth is the one that matters: it proves the prop alone does not satisfy
§4b.

## What could not be proven from here

All of fixes 1 and 2 are render behaviour; the sandbox cannot reach Supabase
and headless rendering stops at the sign-in screen. The gates prove the markup
is wired. They cannot prove the text paints. On her phone: **Full Program → any
day → any exercise** should now show **Rest 120s** on a main lift and a **why
this exercise** toggle on roughly one row in six.

`test:meal-quality` remains red in the sandbox and only there — all five of its
profiles die on `Host not in allowlist: vswuurrtbzbrgubddefv.supabase.co`. It
needs a live database and a live edge function.

## 5. The coach asked about a session too old to remember, east of UTC

`test:local-dates` §3 was red. `session-feel.ts` built its "which recent
sessions can I still ask about?" window as a LOCAL midnight and then read the
calendar date off `toISOString().slice(0, 10)` — **three lines below its own
comment warning that "the UTC-vs-local date bug this codebase already fixed
once came from a second one."**

For anyone east of UTC that slice lands a day early, so `ASK_WITHIN_DAYS = 3`
silently became four days and the coach asked *"how did Monday feel?"* about a
session the constant exists to say is too old to answer honestly. Fixed by
using the codebase's own `getLocalDateString`. Mutation: put the slice back →
red.

This shipped in PR #15 as well, and it is the third thing that merge left
broken. Which is the finding underneath all three.

## 6. The injury rebuild got worse — put to Ashley, decided, pinned

`test:injury-rebuild` is red, and it is not this audit's doing. Bisected:

| commit | original | after substitution | after rebuild | gate |
|---|---|---|---|---|
| `c27cdb4` (before PR #15) | 452 | 436 | **452** | green |
| `6fa4116` (PR #15) | 448 | 432 | **424** | **red** |

Before, a shoulder injury that wipes a whole movement pattern produced a
rebuilt plan with **every slot intact** and 16 more than pointwise
substitution would have left. Now the rebuild loses 24 slots and comes in
**8 below substitution** — so the expensive path is no longer better than the
cheap one, which is the entire premise of VISION's *"rebuild the plan around
it rather than removing slots one by one and leaving a gutted week."*

**Cause isolated to one thing, not guessed.** Removing only the three
`minLoadedMainLiftRestSeconds: 120` lines from `goal-policies.ts` at that same
commit restores 452 / 452 and turns the gate green. It is Ashley's two-minute
main-lift rest ruling meeting the session-duration trimmer: longer rest per set
leaves less room under the time cap, and the trimmer cuts exercises to keep the
cap's promise. Both halves are correct. They are in tension.

**Put to Ashley rather than fixed**, on two standing rules — CLAUDE.md's
*"injury filtering… always get a plan before a build, even when the fix looks
obvious"* and *"stop and wait… anything in the safety path"*. This is injury
filtering AND load prescription, and the resolution is a coaching trade-off
rather than something with a right answer.

**She answered "decide for me", so this is my call, recorded as mine:
FULL REST WINS.** Rest is the half that keeps a rep from failing under load,
and it matters most on a plan that exists precisely because someone is already
hurt. The rebuild pays for it in size. Nothing about the app's behaviour
changes; what changes is the gate, which was asserting the wrong thing.

The rebuilt plan is still **safe and not gutted** — every neighbouring check
passes: nothing contraindicated anywhere, at least one shoulder-indicated
movement programmed, 94.6% of slots kept against an 80% floor, 410 of 424
shared slots holding a different exercise from substitution, and exercises
substitution can never reach. **The rebuild's advantage was never the slot
count**; it is that it programmes AROUND the injury. So:

- `rebuild beats what substitution would have left` (strictly greater) becomes
  **`rebuild is not materially smaller than substitution`** — it may fall a
  little behind paying for the rest and no further. Measured today: 424 of 432,
  **98.1%**, against a 95% bar.
- and a **new** check closes the door the loosening would otherwise open. The
  cheapest way to win the count back is to exempt a rebuild from the rest floor
  — exactly the trade that was declined — so the gate now asserts the floor
  holds INSIDE the rebuilt plan: every loaded main lift in it rests at least as
  long as its goal allows. **32 loaded main lifts, 0 short of 120s.** This
  section comes out stronger than the line it replaces, not weaker.

Mutations: the loaded floor made inert (`mainLiftRestFloor` returning the flat
60) → **26 of 32 short, red**; the floor raised to 180s without checking its
cost → rebuild 392 of 420, ratio 0.933, **red**. One mutation did NOT fire and
is recorded rather than dressed up: dropping the floor argument passed into
`trimWeekRestForBudget` left the count and the rest untouched, because on this
profile the main lift's rest is set at prescription time by `mainLiftRestFloor`
and the trimmer never reaches it. That check stands as a guard, not as
something this mutation proved.

## The one thing not fixed, and why

VISION: *"Settings and chat are equal paths, not a primary and a fallback.
Anything a user can do in the Profile screens they should be able to ask the
coach for."*

They are not equal. The coach's 26 tools cover exercise swaps, bans, rest days,
schedule, volume, equipment, injuries, meals, grocery and every kind of
logging. There is **no** tool for training style, experience, session length,
activity level, recovery capacity, conditioning preference, cooking time, meals
per day, snacks or breakfast style — all editable in Profile.

This is the largest remaining distance between the app and the vision, and it
is **not a defect**, which is why it is not in the list above: the app is
honest about it. The prompt describes the Profile screen and its editable
fields, and `test:coach-promises` and `test:chat-app-reality` both hold — the
coach says what it cannot do rather than inventing a screen or claiming a
change it did not make. VISION allows exactly that: *"If the chat can't perform
a change, it says so plainly and offers what it can."*

Closing it is ten server tools, ten client confirm branches and the rebuild
plumbing each one triggers. That is a feature, not a fix, and it is Ashley's to
schedule. **Smallest sensible first step:** `propose_style_change` — style is
the one on that list that changes the programme itself rather than a preference
the next generation happens to read, and it can reuse
`propose_equipment_adaptation`'s propose → confirm → rebuild path almost
unchanged.
