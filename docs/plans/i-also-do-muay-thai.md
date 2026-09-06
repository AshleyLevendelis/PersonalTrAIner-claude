# "I also do Muay Thai twice a week"

*Plan before build, per CLAUDE.md — this changes what the plan prescribes.
Written 5 Sep 2026 from a read-only trace; Ashley chose (a) on 6 Sep and it
was built the same day — see "BUILT" below.*

## What she asked for

> "I train in the gym mon, tue, thu, fri in the mornings but I also do muay
> thai twice a week in the evenings" — and have the chat acknowledge it and
> create a plan for that.

Three facts in one sentence: **which days** (Mon/Tue/Thu/Fri), **what time**
(mornings), and **a second sport with its own schedule** (Muay Thai, two
evenings). The app can already do the first. It has a dead field for the third.
It has never done the second at all.

## What happens today, traced

**"I train Mon/Tue/Thu/Fri"** — works. `propose_schedule_change` is live: the
coach proposes the complete day set, a before/after card appears, Confirm
rebuilds the plan from the live week forward through `rebuildFromCurrentWeek`,
and Undo restores the pre-image. §3e of the prompt handles the phrasing.

**"in the mornings"** — silently ignored. `preferred_time` is
`'morning' | 'evening'` on the profile, but:
- onboarding **hardcodes it to `'morning'`** with a comment saying it was
  measured to produce byte-identical plans for every answer
  (`onboarding-slots.ts:1026`);
- no Profile row, no coach tool, nothing in generation reads it;
- the coach is shown it in two prompt lines and does nothing with it.

Nothing about a session depends on when it happens. That is defensible today,
but it becomes false the moment the app knows about an *evening* Muay Thai
class on a *morning* gym day — same-day double sessions are exactly where time
of day starts to matter.

**"I also do Muay Thai twice a week in the evenings"** — the interesting one.
`concurrent_activities` exists: a jsonb column since July
(`20260708165004`), a `ConcurrentActivity` type
(`{ name, intensity, days[], movement_demands[] }`), hydrated from the DB in
App.tsx, and rendered into the coach's prompt as:

```
CONCURRENT ACTIVITIES (external training demands):
- Muay Thai: intensity 70%, days: Tuesday, Thursday, demands: …
```

And then:

- **Nothing writes it.** Not onboarding (no slot), not the Profile screen (no
  row), not the coach (no tool). The last commit that touched it was the
  pre-ceiling load audit, which only set it to `[]` in fixtures.
- **Nothing in plan generation reads it.** Not one reference in
  `exercise-plan.ts`. The split, the volume, the conditioning placement, the
  rest days — all computed as if the second sport did not exist.
- **The coach is given the list with no instruction about what to do with
  it.** The prompt block is a bare data dump; there is no rule anywhere saying
  "reduce", "avoid heavy legs the morning of", or even "mention it".
- `movement_demands` has **no vocabulary** — no enum, no example values, no
  reader. Whatever a writer put there, nothing could act on it.

So if she typed her sentence today: the coach would propose the four days (if
it caught that half), the plan would rebuild ignoring Muay Thai entirely, and
the only tool that knows the phrase "Muay Thai" is `swap_session_for_activity`
— which is for *"I'm skipping weights tonight and doing Muay Thai instead"*,
a one-off swap that marks a day, not a standing commitment.

## Where the levers already are

This matters because the right build reuses them rather than inventing a new
load model. All traced, none of them currently see a second sport:

| lever | where | what it does today |
|---|---|---|
| **day → focus is positional** | `getSplitForDays` returns an ordered list; `availableDays.map((day, index) => split[index % split.length])` | Day 1 gets focus 1. Nothing reorders by what else happens that day. |
| **heavy vs light days** | `heavyTrackDays` = Push & Press, Pull & Hinge, Squat & Carry, Legs & Calves, Full Body Power | Used only to decide where post-lift conditioning goes. |
| **rest-day cardio** | `restDayNames.slice(0, maxCardioRestDays)` | Takes the first N rest days blindly — would put a 45-min Zone 2 on a Muay Thai night. |
| **volume multiplier** | `RECOVERY_SET_MULTIPLIER` low .75 / moderate .9 / high 1.0 | Keyed on the recovery answer only. |
| **conditioning frequency** | `resolveConditioningFrequency` (love +1, avoid → 0-1) | Keyed on the cardio-preference answer only. Two Muay Thai sessions ARE conditioning and are not counted. |
| **rebuild plumbing** | `rebuildAgainstProfile(clone, …)` runs `generateExercisePlan`/`generateMesocycle` on the clone | Any profile field the generator reads flows through a rebuild for free. |

That last row is the good news: once generation reads `concurrent_activities`,
the existing confirm-card rebuild path carries it with no new plumbing.

## The shape of the build (whichever answer she gives)

Common to every option below, and none of it needs a decision:

1. **A writer.** A new coach tool, `propose_concurrent_activity`, in the
   family of `propose_schedule_change`: the model extracts *name*, *days*,
   *time of day*, and a rough *intensity* from what the user said; the client
   builds a before/after card ("Adds: Muay Thai, Tuesday & Thursday evenings ·
   Rebuilds 12 weeks from week 5"); Confirm writes `concurrent_activities` via
   `updateProfileField` and rebuilds from the live week; Undo restores the
   pre-image, exactly as schedule changes do. **Nothing applies without the
   tap** — that is the standing rule for anything that rewrites the plan.
2. **One combined card when both halves arrive in one sentence.** Her example
   carries a day change AND an activity. Two separate confirm cards for one
   sentence is the kind of thing that reads as the app not listening. The
   proposal should carry both (`training_days` + `activities`) and rebuild
   once. `propose_schedule_change` stays as-is for the days-only case.
3. **A place to see and edit it.** A "Other training" row on the Profile
   screen, beside the training-days editor, so a stored activity is not
   invisible until someone asks the coach about it.
4. **Define `movement_demands` or drop it.** A field with no vocabulary is a
   field that lies about carrying information. Recommend a small closed set
   drawn from the existing `MovementPattern` enum plus `'striking'`,
   `'grappling'`, `'running'`, `'conditioning'` — enough to say "Muay Thai =
   knee_dominant + hip_hinge + conditioning" — with the coach mapping the
   sport to it.
5. **`preferred_time` gets its first real reader.** The activity carries its
   own `timeOfDay`; the gym sessions' time comes from `preferred_time`; a
   same-day collision is only knowable when both are known. Until the app
   asks, the value stays a hardcoded 'morning' — so the tool should also
   accept the time of day the user just stated for their gym sessions and
   write it.
6. **The coach's prompt block stops being a data dump.** It gets a rule: name
   the activity when discussing that day, never schedule extra conditioning on
   an activity night, and never describe a day as a "rest day" when it has a
   class on it.
7. **Gates for the class, not the instance:** every `context.*` field the
   generator is *meant* to read is actually read (this one has been sent and
   ignored for two months — `test:context-is-read` covers the coach, nothing
   covers generation); a proposal kind the server can emit has a client
   builder and an executor (the existing `test:coach-volume-schedule` §8
   pattern); and the rebuild is byte-identical when `concurrent_activities`
   is empty, so nobody without a second sport is touched.

## The question, and three ways to answer it

**When someone has two hard evenings a week outside the gym — say Muay Thai on
Tuesday and Thursday — what should their gym plan actually do about it?**

**(a) Put the lighter gym sessions on those days.** Keep her four days, but
reorder which day gets which focus so the heavy leg session is never the
morning of a kicking class — pull/upper work lands on Tue/Thu, squats and
hinges on Mon/Fri. And keep prescribed cardio off the activity nights (the two
classes *are* the conditioning). Total lifting volume unchanged. Downside: a
four-day split has a fixed shape, so this is a reordering, not a redesign —
sometimes the best available order still has a hard day near a class.

**(b) Do (a) and also count the classes as training load.** Treat two hard
evenings as what they are — about the same weekly stress as one lower gym
session — and let that feed the existing recovery multiplier one notch down
(a 'moderate' recovery answer behaves like 'low' while the activity is active),
so accessory volume comes off the top. Downside: this **changes prescribed
training volume**, which is the kind of change that needs its own measurement
and gate, and it will make some plans visibly lighter than the same person's
plan without Muay Thai — which is correct, and needs saying on the card.

**(c) Record it and tell the coach, change nothing in the plan.** The activity
is written, shown on the Profile, and the coach knows about it and can talk
about it — but the generated plan is the same one she would get without it.
Honest and small. Downside: it is exactly the state the field is in now, minus
the "nobody wrote it" part — the plan she asked the app to "create for that"
would not actually be for that.

### Ashley's ruling, 6 Sep 2026: **(a)**

Asked in the conversation, one question, three options with a recommendation.
She chose *"put the lighter gym days on the Muay Thai days"* — the
recommendation. (b) counting the classes as load is therefore a separate later
piece and is not authorised by this answer; (c) is declined.
**Update 6 Sep 2026 (later): (b) was then asked for, ruled and built — see
[count-the-classes-as-load.md](count-the-classes-as-load.md).**

**Recommendation as put to her: (a) now, (b) as its own measured piece after.** (a) is a
reordering of decisions the generator already makes — it changes *which day*
gets a session, not *how much* — so it can be built and gated without a load
or volume argument, and it is what a human coach does first on hearing this
sentence. (b) is the right second step and deserves the same treatment the
recovery multiplier got: measured on the grid, a named threshold, a gate that
pins the direction. Folding it into (a) would make one plan doc carry two
separate risks.

## BUILT, 6 Sep 2026 — (a), end to end

**Slice 1 — the generator reads the field.** `src/lib/concurrent-activity.ts`:
`HEAVY_TRACKS` hoisted out of a local in `assignConditioningNotes` so one fact
serves both decisions; `reorderTracksForClassDays` — a stable, greedy
PERMUTATION of the split (light tracks onto class days first, the rest in the
split's own order), returning `unavoidable` for any class day that still has
to take a heavy track; `activityDays` canonicalising day spellings and
dropping the rest; closed `MOVEMENT_DEMANDS` / `TIMES_OF_DAY` vocabularies so
the field stops lying about carrying information; `describeActivity`, which
never invents a time of day. In `exercise-plan.ts` the split is reordered
before day→focus assignment, and both the rest-day and the post-session
cardio loops skip class days.

**Proven, not asserted:** `scripts/fingerprint-plans.ts` hashes day, focus and
conditioning for every week of every plan on a 250-plan stride of the quality
grid — **byte-identical before and after** when `concurrent_activities` is
empty. Her exact sentence, probed:

```
WITHOUT                         WITH Muay Thai Tue/Thu
Mon  Push & Press               Mon  Push & Press
Tue  Pull & Hinge               Tue  Upper Pull & Core   ← the light day moved here
Thu  Squat & Carry              Thu  Pull & Hinge        ← unavoidable: 4-day split, 1 light track
Fri  Upper Pull & Core          Fri  Squat & Carry
Wed  rest-day walk              Wed  rest-day walk
```

Tuesday also shows a post-session mobility flow — that is the session-LENGTH
filler topping up a short light session in the morning, not budgeted cardio;
the probe prints `FILLER` beside it and §2 of the gate excludes fillers.

**Slice 2 — the writer.** Everything follows the `propose_style_change`
footprint: `propose_concurrent_activity` declared and handled (courier only,
I1) with `training_days` / `gym_time_of_day` as optional PASSENGERS so her
sentence is one card, not two; §3g in the prompt separating the three
look-alike sentences (standing sport → this; one-off swap →
`swap_session_for_activity`; a day removed → `propose_schedule_change`); the
bare `CONCURRENT ACTIVITIES` data dump replaced with a block plus RULES (name
the class, never add cardio there, never call it a rest day); the client
builder validating every field against the app's own vocabularies and naming
the `unavoidable` day on the card; `executeConcurrentActivity` — rebuild
first, write second, replace-by-name; confirm and undo branches, undo
restoring the activity and both passengers; an **Other training** block on
the Profile (remove only — adding stays with the coach, who can ask which
evenings); `detectPlanInvalidation` offers a rebuild when the sport is
removed, because the week was arranged around it; `APP_REALITY` updated in
both copies.

**Gates:** new `test:concurrent-activity` (the reorder as a unit incl. a
120-case permutation sweep across four split shapes × every class-day subset;
her sentence end to end across all 16 weeks; byte-identity on 10 profiles for
empty AND undefined; a legacy row with junk in it changes nothing; the field
is read/written/shown/undoable). `test:coach-volume-schedule` §8's executor
map and `test:coach-promises` §6b extended. **Ten mutations, ten caught** —
including the executor writing before it rebuilds and `Squat & Carry`
quietly leaving the heavy set. `test:no-dead-code` back to 39/40 by
consumption, not by budget.

## Deliberately NOT in scope

- **Onboarding.** The right place to ask "do you do any other sport?" is at
  signup, and it will want its own slot with its own gate
  (`test:onboarding-slots` pins the slot list). This plan makes it *possible*
  to record; asking every new user is a separate change to a flow that has
  been measured carefully.
- **Multiple activities.** The type is an array and the code will treat it as
  one, but the card, the prompt rule and the reorder logic will be built and
  measured for one activity. Two overlapping sports is a real case and a later
  one.
- **`swap_session_for_activity` stays exactly as it is.** "I'm doing Muay Thai
  instead of legs tonight" and "I do Muay Thai every Tuesday" are different
  sentences and the prompt will need one clear rule separating them — that rule
  is part of this build, the tool is not.

## Verification

`tsc`, `npm run build`, the full 129-gate suite; `test:audit` (17,423/0) and
`test:quality` (11.51/12) re-run — and **byte-identical plans for every profile
with no concurrent activity**, proven by generating the audit grid with the
field empty before and after and diffing. New gates as listed in item 7,
mutation-tested. Needs `deploy:functions:prod -- chat-gemini` for the new
tool and prompt rule. **No migration** — the column has existed since July.
