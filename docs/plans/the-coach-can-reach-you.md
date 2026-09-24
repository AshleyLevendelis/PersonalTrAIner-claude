# The coach can reach you when the app is shut

**Ashley chose this, 17 Sep 2026**, from four options, as the thing pulling her
toward a real mobile app. Her ruling on scope, in her own words: *"Everything
but the user should be able to toggle notifications on or off to reduce
noise."* All seven of the coach's proactive moments, each switchable, all on to
begin with.

## The problem, measured rather than assumed

**The coach can only speak when the app is open.** All seven proactive moments
are check-on-load, decided in the browser during a render:

| Moment | Module | Lines |
|---|---|---|
| The opening line | `coach-opener.ts` | 264 |
| The nudge | `coach-nudge.ts` | 330 |
| Session not started | `session-nudge.ts` | 58 |
| "How did that feel?" | `session-feel.ts` | 217 |
| Streak | `streak.ts` | 86 |
| Block review | `block-review.ts` | 227 |
| Beat-the-target offer | `beat-target-offer.ts` | 375 |

The code says so itself — *"no scheduled-job infra exists in this codebase"*
(`block-review.ts`, `beat-target-offer.ts`). Confirmed by search: **no
`pg_cron`, no `pg_net`, no push-subscription or device-token storage anywhere.**

So CLAUDE.md's line *"Accountability is active — the coach opens, asks how it
went, follows up"* is true only of someone who opens the app. For anyone who
does not, the coach is silent precisely when it matters most. That is the
opposite of accountability, and it is the gap this closes.

## What makes this affordable

**`pickOpener` is already pure.** It takes a plain `OpenerInput` — hour, cutoff,
whether a session is awaiting feedback, whether yesterday was missed, today's
session, tomorrow's — and returns a decision. It does not read a database, a
clock, or a screen. The same is true in shape of the other six.

So the server does not need a second brain. It needs the same functions, called
with facts it gathered itself instead of facts the browser gathered. **That is
the ~70% that is identical whether delivery is web push or a native app**, and
it is why this is worth building before any wrapper.

## The build, in slices

### Slice 1 — one decision, two callers *(this session)*
`src/lib/coach-moments.ts`: given a profile's facts, which moments are live
right now and what would each say. Pure, no I/O, no clock of its own — the
calendar comes in as an argument, per the harness-clock rule. Every sentence
from `coach-voice.ts`, so the exam and `test:coach-voice` grade them.

It does not replace the seven modules; it ASKS them, in a fixed order, and
returns at most one thing to say. The browser keeps its in-app behaviour
unchanged — this is the second caller, not a replacement.

### Slice 2 — the switches
One row per moment in Profile, named for what it does ("Remind me if I haven't
logged a session"), all on by default, plus a single master off. Two rules that
make them honest:
- A switch turns off the **notification**, never the coach's in-app moment. The
  coach still raises it next time she opens the app.
- The app never re-asks about a moment she switched off.

Stored on the profile so it follows her between devices. **Needs a migration,
which needs Ashley's word and her machine.**

### Slice 3 — delivery
A push-subscription table, a permission ask at the right moment (never on first
load — that is the reflex-decline pattern), and a scheduled edge function
beside the existing four, driven by `pg_cron` + `pg_net`. **Needs a migration
and a deploy, both Ashley's.**

### Honest limits, stated before anything is built
On iPhone, web push works only once the app is on the home screen, and only on
iOS 16.4+. On Android it works normally. That limitation is what a Capacitor
wrapper would remove, and it is the whole reason the wrapper is stage two
rather than stage one.

## Verification

1. Slice 1 proven by its own gate, mutation-tested, and by the browser's
   behaviour being unchanged — the existing `verify:coach-speaks-first` must
   still pass untouched.
2. **A switch is proven on BOTH halves**: off means no notification, AND the
   coach still raises that moment in the app. A build that silenced the coach
   entirely would pass a check that only looked at the phone.
3. Slice 3 proven by a notification arriving on a real phone with the app
   **closed** — not by a scheduled function exiting 0 — and by the scheduler
   firing on its own and not twice.

## Named, not done

- The coach exam still has no baseline against the current coach, and this
  makes the coach speak unprompted more often. Getting that number first is the
  safer order; it is already in the handover prompt.
- A fifth edge function adds another hand-deploy to the list.

## Slices 2 and 3, as built — 24 Sep 2026

Ashley, 24 Sep 2026: *"Implement all the chat fixes you just mentioned in the
order you mentioned them"* — this was the fourth. Built as far as a cloud
session can: every file written and gated, nothing applied or deployed. The
migration, the function deploy, the keys and the real-phone test are hers, in
the handover prompt.

### The one design decision that shrank it
The plan above assumed the server gathers every fact itself. Measured on
reading: "is today a training day?" is the whole plan engine — the stored
mesocycle, the week it is in, moves, rest-day marks, swaps — and it exists
only in `src/`, which no edge function imports (every shared rule here is a
copy in `_shared/` held equal by a parity gate). Porting it would be the
largest parity risk in the repository.

So **the app sends the plan-shaped facts ahead, and the server reads
everything else live**. CORRECTED while building, the same day: the first
draft of this section said the app would send four weeks of training DATES
with moves and marks applied. It sends less, and that is better:
- **Sent ahead, from Home, only when something changed** (`moment-facts.ts`,
  `sendFactsAhead`): the weekday pattern the streak counts by, the day after
  the plan's last week, the day after the current block's last week (read
  off the weeks carrying that block's number — never "four weeks", because a
  block's length is the plan's business), and the streak Home just counted
  with the date it counted it on.
- **Read live by the server, every hour**: sets and cardio logged in the last
  five weeks (to the person's own calendar date), rest / moved / swapped /
  missed marks on recent days, sessions moved ONTO a day, a session finished
  in the last 36 hours with no "how did it feel", and an open beat-the-target
  offer. So a day she moved or made a rest day is not nagged about even if the
  app was never reopened after the change.
- Each fact that could otherwise repeat for ever is bounded: a streak only
  counts if Home counted it yesterday or today; a block end only for three
  days; an unrated session only for 36 hours.

What it costs, named: a plan changed somewhere other than the app (nowhere,
today) is not seen until Home next opens. Somebody who does not open the app
at all still gets the right answer about moves, marks and logs; only the
weekday pattern and the streak go stale, and a stale streak is simply not
used.

### What proves it, and what does not
- `test:reach-out` (60 checks) drives the whole loop with a fake clock,
  database and push service; the service worker's push and tap handlers,
  actually executed; and the app's half — what is sent ahead, when, and that a
  missing table reads "not live yet" while a refusal that merely names the
  table does not.
- `verify:reminders` (30 checks, 390px): the Profile switches before and after
  the migration, the phone switch asking permission only from a tap, the
  honest dead ends, and Home sending the streak it shows.
- `verify:reach-out-function` runs the REAL function file in Deno against a
  fake database and a fake push endpoint that decrypts what arrives — so the
  keys, the signing and the encryption are proven, not assumed.
- NOT proven: that Apple or Google accept the push, that the schedule fires,
  that a real phone buzzes. Those need the deploy and a phone.

### What goes in the migration (one file, hers to push)
- `fitness_profiles.notification_switches` (jsonb, default all on).
- `coach_moment_facts` — the row above, one per profile.
- `push_subscriptions` — one per device, with its timezone.
- `coach_notifications_sent` — at most one notification per person per day.
- A `pg_cron` job, hourly, calling the new function through `pg_net`, reading
  the project URL and a shared secret from Vault — so the same migration is
  correct on TEST and PRODUCTION, with the secrets set per project.
- Row-level security on the three new tables, scoped to the owner the same
  way as every other table.

### Two defaults that are mine, not hers, and easy to move
- **Quiet hours 8am-9pm** on her own clock (from slice 1).
- **At most one notification a day.** Slice 1 already allowed one at a time;
  hourly runs would otherwise send "you haven't logged" at 6pm and "your
  streak is at risk" at 7pm about the same session. How often the app speaks
  is hers — this is the conservative default until she rules.

### The one question that is hers before anyone sees it
When the app first asks permission to send notifications. Built: a switch in
Profile that she turns on herself — the app never asks unprompted. Whether the
coach should also offer it (for instance after the first logged session) is
how the app speaks, so it is asked, not decided.
