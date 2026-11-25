# The coach's voice and proactivity (25 Nov 2026)

Ashley: *"The coach's voice I'm still not happy with, it's still robotic, still no personality, still not enthusiastic.
And still not proactive enough."* He brought a brief (his and Gemini's): a sharp, upbeat, grounded training partner;
opinionated; context-aware; two gears (gym floor and chat); proactive messages that each carry a "so what", lead with
the observation and the move, give an easy out, and respect quiet windows. His instruction: "Review, build, but also
add in our change what you think will make it better."

## What was making it flat (found before building)

1. **The coach's instructions defined its voice almost entirely by prohibitions.** The opening line was "warm,
   encouraging, knowledgeable, and honest", then pages of "never". Nothing said what the coach IS like, what it thinks,
   or that it should pick.
2. **The second-pass editor sanded the personality off.** Its job was "two to four short lines ... Drop everything
   else", so a reaction, an opinion or a pleased line was exactly what it cut.
3. **The reminders knew almost nothing.** The reminder writer was told "Today is a training day and nothing is logged
   yet", so the best it could say was "are you ready for your session today?" every training morning. Every reminder
   also had to open with the word "Hey".
4. **A reminder offered something with no easy answer.** "Want to move it or let it go?" had no buttons; answering
   meant typing.

## What changed

**Voice (the coach's server):**
- A new first section, WHO YOU ARE: sharp, upbeat, grounded and invested; makes the call and says why; real energy
  about real wins (one exclamation mark is fine, fake hype is not); sounds like a person; context first; two gears
  (gym floor when today's session is part-done and the message is about it: one or two lines, the cue first; chat
  everywhere else); spots patterns and offers the fix. Four say/don't-say pairs, all invented.
- What a tap on one of its own messages means, mapped to tools that exist.
- The second-pass editor now shortens and never flattens: keep the reaction, the opinion, the energy; make the call.

**Proactivity:**
- Home works out yesterday's, today's and tomorrow's sessions (name, main lift and weight, heavy legs or not, hard
  classes that day) and one pattern (a stuck lift, "too hard" piling up, protein short three logged days), and sends
  them ahead with the other reminder facts (`src/lib/days-ahead.ts`, one new database column).
- The morning reminder names the session: "Hey Ashley, Upper Push today, with Barbell Bench Press at 70kg. Ready for
  it?"
- **New: a clash warning** (its own switch). A heavy leg day with a hard class the same day or the day before:
  "Muay Thai yesterday and Lower Body Strength today, so your legs may be tired. Want me to trim the extras and keep
  Barbell Squats as planned?" It replaces the plain reminder that morning, and in the chat it is the day's hello.
- **New: a pattern** (its own switch), in the afternoon, at most once a week: "Barbell Squats has sat at 80kg for 3
  sessions. Normal, and there's a fix. Want it?"
- **The easy out**: a message that offers something carries one-tap answers (the yes and the no) in the chat, kept on
  the row so they survive a reload. The coach knows what each tap means.
- The reminder writer is the same coach (the persona), is given those facts, must give something (never "just checking
  in"), greets by the time of day ("Morning Ashley, ..."), and ends on the question its buttons answer.

## The Saturday review says what moved (added the same day, his request)

This week's bests (Monday to Sunday, at most two, each said with its unit) and the one thing that dragged (the
pattern finders), offered with a one-tap yes and no. Nothing moved and nothing dragged: the old sentence. On a review
Saturday the pattern message waits, because the review carries it. `test:coach-proactive` §9.

## Decisions

- **Upbeat and grounded, over dry and punchy.** Gemini asked which; his brief says "sharp, upbeat, grounded" and he
  asked for enthusiasm. His to change.
- **A greeting that fits the time, over always "Hey".** His 6 Nov example was "Hey Ashley, are you ready ...", and
  every reminder had to start with "Hey". Widened to Hey / Hi / Morning / Afternoon / Evening, because the same first
  word on every message reads as a template. Flagged to him.
- **What counts as a clash** (CSCS, mine): hard leg-dominant conditioning, running or combat sport (combat, or the
  coach's effort estimate at "hard") on the day of, or the day before, a session whose main lift is a lower-body lift.
  That is where fatigue and the interference effect cost the lift's quality most. The answer offered is the standard
  one and his own 13 Sep ruling for a short day: keep the main lift, cut the extras (the "shortest version"). Gentle
  activity (yoga, an easy run) is never a clash.
- **Patterns** reuse the chat's own finders and thresholds (17 Nov, mine). Afternoon only, so never in front of the
  morning's session; at most once a week, so a stuck lift is not a daily chant.
- **Both new messages sit inside his daily limit** (Light / Normal / Lots) and the three-hour gap, and each has its own
  switch, on by default (his 17 Sep "every message switchable").

## Not built, named

- Pattern of a squeezed weekday ("third week Tuesday's got squeezed"): the app has no finder for it yet.
- An iPhone notification route (separate job).
- Whether the model now SOUNDS different is unproven until the coach exam runs after the deploy. Three exam cases
  were added (making the call, the trim tap, the keep tap).

## Checks

`test:coach-proactive` (72 checks, 22 mutations, all caught). The briefs and pattern finders load only when Home
works them out, so the first download stays inside its budget. `test:coach-moments` and `test:coach-nudge` updated for
the two new moments.

## Needs

The `days_ahead` migration, and the `chat-gemini` and `coach-reach-out` deploys. Frontend on merge.
