# Coach rhythm (strategy slice 2, 13 Nov 2026)

His strategy of 13 Nov 2026, slice 2: "Plan-the-week chat, comeback path, weekly consistency in place of the streak, and a
floor version of each day." Plus his ruling 6 (a weekly review from the coach, on by default, a switchable moment) and the
prompt's "a moment ignored three times running drops a level and the coach says so". Every new moment sits inside his
Light / Normal / Lots limit and has its own switch (collision e, a constraint).

## His rulings that bind this slice

- **Replace the streak with weekly consistency** (13 Nov ruling 2), CONFIRMED 13 Nov from three options ("Replace") after
  being told it REVERSES his 17 Oct "12 in a row" pill. His 8 Nov "Count it as a session" stays: a swapped day with the
  activity logged is a session done.
- **A weekly review, on by default, switchable** (ruling 6).
- "Go with your recommendations" (13 Nov) covers the wording and timing drafted below; each sentence is his to change.

## 2a. Weekly consistency

- **A week is on plan** when at least three quarters of its planned sessions are done, rounded up: 2 of 2, 3 of 3, 3 of 4,
  4 of 5, 5 of 6. Planned rest and moved sessions never count against a week (the week tally already handles both), and
  the week still running is never judged. Weeks with nothing planned, and weeks before the plan began, are left out.
  CSCS basis: the dose that matters is weekly, and the twice-a-week-per-muscle frequency the plans are built on survives
  one missed session in four or more; missing one of two or three halves the week's dose, so those weeks need all.
- **Shown** as "9 of 12 weeks" on Home's pill (the last 12 finished weeks, fewer early on; hidden in week 1, where
  this week's "N of M" already says it), "N of the last M weeks on plan" for a screen reader and the coach. A run, and a
  broken run, is never shown.
- **The streak goes**: the pill, the evening `streak_at_risk` moment (loss-framed, the strategy's "never"), the streak
  milestone event (becomes a weeks-on-plan milestone: "That's 4 weeks on plan now."), the coach's "N sessions in a row"
  lines (accountability, lessons, reminder writer, the context's `CURRENT STREAK: N day(s)`, which also had the unit
  wrong). Read by one function, `weeksOnPlan`, over one multi-week read of the strip's own week builder.

## 2b. Comeback path (phone and chat)

- **3 quiet days** (nothing logged for three days, and he had logged before): one message, no mention of what was missed,
  one small next step. Draft: "Hey Ashley, how about a 10-minute walk today? Small counts." Once per lapse (the day the
  gap reaches 3).
- **14 quiet days**: one "door is open" message. Draft: "Hey Ashley, no pressure. Whenever you want to pick it back up,
  I'm here, and we'll start gently." Then SILENCE: no unprompted phone message at all until he logs something again.
  On return, weights ease by the existing layoff rules.
- Replaces `week_gone_quiet` (7 days), which the chat never raised. Measured in the chat and on the server from the
  same facts (days since anything was logged).

## 2c. Weekly review and plan-the-week (both new, switchable, on by default, inside the daily limit)

- **Weekly review, Saturday from noon**: one thing that went well, one number, one adjustment offered. Draft: "Hey Ashley,
  your week: 3 of 4 sessions. Best bit: every planned session on Tuesday and Thursday got done. Want to look at next
  week?" Built from the week tally only (what went well is chosen from facts: all sessions done, a personal best, meals
  logged most days, else the sessions done); the coach takes the conversation from there.
- **Plan the week, Sunday from noon**: "Hey Ashley, shall we plan next week? Which days suit training, and any meals out?"
  The reply goes to the coach, which already moves sessions and marks meals out.
- Weekend lunchtime: the strategy's evidence (largest effect at weekend lunchtimes).

## 2d. The floor version of a session

- "Short version" on the day menu and from the coach: the session cut to the shortest it can go while keeping the main
  lift and three real exercises (the existing shorten-today path and its floor, tried from 15 minutes up), for today
  only. A floor session finished is a session done, as any finished session is.

## 2e. Ignored three times running

- When the same moment has gone unanswered three times running (the moment log, slice 1), his daily limit drops one level
  (Lots to Normal, Normal to Light) and the coach says so once, in the chat: "I've turned my messages down to Light,
  because the last few went unanswered. Change it any time in Profile, Reminders." At Light it stays at Light.
  A drop needs three NEW ignores after the last drop. Chat-side (needs the moment-log migration to have anything to read).

## Not built

- A per-meal "floor" day (that is slice 4's starter tier).
- Changing the daily limit back up automatically.
