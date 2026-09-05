# "I also do Muay Thai twice a week"

*Plan before build, per CLAUDE.md — this changes what the plan prescribes.
Written 5 Sep 2026 from a read-only trace. Nothing built. The one product
question it turns on is at the bottom and the build waits on Ashley's answer.*

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

**Recommendation: (a) now, (b) as its own measured piece after.** (a) is a
reordering of decisions the generator already makes — it changes *which day*
gets a session, not *how much* — so it can be built and gated without a load
or volume argument, and it is what a human coach does first on hearing this
sentence. (b) is the right second step and deserves the same treatment the
recovery multiplier got: measured on the grid, a named threshold, a gate that
pins the direction. Folding it into (a) would make one plan doc carry two
separate risks.

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
