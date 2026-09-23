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
