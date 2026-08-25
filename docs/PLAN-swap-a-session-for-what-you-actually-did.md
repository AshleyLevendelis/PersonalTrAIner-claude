# "I'm doing Muay Thai instead" — make that mean something

## Context

Ashley told the coach, in advance, that she was skipping her weights day and
doing Muay Thai that evening. The coach replied:

> *"Since you're skipping the weights, I'll make sure today is marked as a rest
> day for lifting so we stay on track."*

It did nothing. It could not have: **there is no tool that marks a day as rest
or skipped.** The coach has 21 tools — meal and exercise swaps, injury
adaptations, volume, bans, logging weight/meals/sets/water, facts, goals,
grocery — and not one of them touches a single day's status.

The one schedule tool that exists, `update_workout_schedule`, is deliberately
disabled, and its own description records this exact failure happening before:

> *"NOT SAFELY WIRED UP YET — calling this will decline... It used to write to
> a profile field the app doesn't actually render from, so schedule 'changes'
> looked applied in chat but never showed up on the Exercise tab."*

So the lesson was already learned once and written down, and the coach walked
into it anyway — because nothing stops it promising, and nothing gives it a
real way to deliver.

**It is worse than a no-op.** `classifyDay` (`useTrainingWeek.ts:78`) ends
`dateStr < todayStr ? 'missed' : 'due'`, and there is no state between them. So
the day Ashley told the app about in advance will show as **missed** tomorrow,
and the Muay Thai she actually did is recorded nowhere at all. That is the same
shape as the pre-plan days she already ruled on: *the reward for engaging is
being told you failed.*

**Ashley's ruling:** swap it, and record what she actually did. Not merely
"don't count it against me" (which leaves the real training invisible), and not
merely stopping the coach from promising (which leaves her to do it by hand).

## The build

### 1. A day can be swapped, and the record says what for

`workout_sessions` is already one row per `(profile_id, date)` with
`is_completed` and a `UNIQUE (profile_id, date)` constraint — it is *the*
session record for a date, so the fact belongs there rather than in a new
table. Additive migration, matching every migration in this repo's history:

```sql
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS swapped_for_activity text;
```

Presence means "the lifting for this day was deliberately swapped for that
activity". Absence means what it means today. Nothing existing changes
meaning, so no backfill and no reinterpretation of old rows.

### 2. The calendar learns the state

- `DayGlyphState` (`useTrainingWeek.ts:16`) gains `'swapped'`.
- `classifyDay` returns it **below** the logged-work checks and above the
  date judgement. Logged work must keep outranking everything — the file's own
  comment says *"if they trained that day it counts... anything else would
  erase real work to make a tidier calendar"*, and someone who swapped and then
  lifted anyway has earned the `done`.
- `WeekStrip`'s glyph and `aria-label` map — the label map exists because
  interpolating a raw state name once made screen readers announce "partial".

### 3. The tally, and the one judgement call in this plan

`countsTowardWeekTally` currently excludes `rest`, `recovery`, `before_plan`.
**I am adding `swapped` to that list**, so a swapped day is neither a missed
session nor a completed one — it drops out of "N of M sessions" entirely.

Reasoning, stated because this changes what the number measures: the tally
counts sessions *of the lifting plan*. A swapped day is one the trainee
deliberately did not do, so counting it as done would inflate lifting
adherence, and counting it as missed is the bug being fixed. Dropping it
mirrors `before_plan` exactly.

The alternative — count it as done, on the grounds that Muay Thai is real
training — is defensible and Ashley may prefer it. Flagged rather than assumed
silently; easy to switch, it is one entry in one predicate.

### 4. The coach gets a tool that actually writes

New `swap_session_for_activity` in `chat-gemini`, taking the activity name and
optional duration/intensity/date. It writes **both**:

- the `swapped_for_activity` column on that date's `workout_sessions` row
  (upserting on the existing unique constraint), and
- a `cardio_logs` row for the activity, through the same shape
  `src/lib/cardio-log-store.ts` already uses — which means the Muay Thai
  counts toward the streak for free, since `streak.ts` already reads that
  table.

Writes immediately rather than going through `propose_*`/`pending_actions`.
Those exist for changes to the *plan*; this is a statement of fact about a
single day, the same class as `log_weight` or `log_meal`, which also write
directly.

**The trap to avoid is the one already documented**: `update_workout_schedule`
died because it wrote somewhere the app does not render from. This tool must
write only to tables the Exercise tab actually reads, and the gate below
asserts the day's rendered state changes — not merely that a row appeared.

### 5. Stop the coach promising what it cannot do

The system prompt gains a rule: never claim a day has been marked, moved or
rescheduled unless the corresponding tool was actually called. If the trainee
asks for something outside the tools, say so and point at the in-app control —
the behaviour `update_workout_schedule`'s decline message already models.

## Verification

- **New gate `npm run test:session-swap`**, against the local mock harness:
  - a swapped day renders as `swapped`, not `missed`, on the day after;
  - a swapped day that *also* has logged sets renders `done` — logged work
    still outranks everything;
  - the weekly tally excludes it, and the count moves from "0 of 3" to
    "0 of 2" rather than "0 of 3" with a black mark;
  - the activity reaches `cardio_logs` and the streak sees it;
  - an ordinary missed day still renders `missed` — the over-fire check.
- **`test:training-week`** extended for the new state, since it exists
  precisely because the calendar cannot reproduce these cases on demand.
- `test:dashboard`, `test:activity-streak`, `test:cardio-log`,
  `test:chat-app-reality`, `test:no-forked-state`, `test:pending-actions`,
  `tsc -b`, `npm run build`.
- **A scripted-model gate for the tool itself** — the reply-guarantee work
  established this pattern: drive `chat-gemini` with a fake model that emits
  the tool call, and assert the writes land. That is the only way to test the
  edge function without a deploy.
- **`npm run test:schema-parity`** after the migration is applied.

## What Ashley has to run, and why the feature is inert until she does

Neither is reachable from this sandbox — `*.supabase.co` returns 403 at the
network layer.

```
npm run db:push-both                        # the swapped_for_activity column
npx supabase functions deploy chat-gemini   # the new tool
```

Until the migration runs, the column does not exist and the write fails. Until
the function deploys, the coach still has no tool. The frontend half ships with
the Vercel push and is harmless on its own — a state that never occurs.

## Out of scope

- Moving the missed session to another day. A swap says what happened, not
  what the plan becomes; rescheduling is `update_workout_schedule`'s job and
  that tool needs its own round.
- Inferring a swap from silence. This fires only when the trainee says so.
- The other 20 tools' honesty. The prompt rule in §5 is general, but only this
  path gets a gate in this round.
