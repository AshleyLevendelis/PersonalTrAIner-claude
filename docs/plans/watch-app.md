# A watch app for the Galaxy Watch (plan for Ashley to evaluate, 27 Nov 2026)

His question (27 Nov 2026), after a test walk logged time only: can the app show live heart rate from the watch while a
workout runs? Answer: yes, but only with an app ON the watch. Samsung hands a phone app the watch's readings late,
through Samsung Health and Health Connect; only an app running on the watch can read the heart sensor live (Google's
Health Services on Wear OS: heart rate about once a second during an exercise). The watch app then sends the readings
to the phone app over the watch's own Bluetooth link (Google's Data Layer). Nothing here is started.

Sizes: S about half a day, M one to two days, L a week or more of building, plus his test sessions.

## What has to be true before any of it works (facts, not choices)

- **The watch app is the same app as the phone app to Google**: same app id (`uk.co.personaltrainerapp`) and signed with
  the same key, or the two cannot talk. It lives beside the phone app in the same project and goes in the same Play
  Store listing as a watch version.
- **It is built and tested on Ashley's computer only**: Android Studio, the Galaxy Watch 7 in developer mode with
  Wi-Fi debugging, the phone app installed. This cloud session can write the code but cannot build it or run it on a
  watch (no Android toolkit here, no watch). Every step ends with a short test he does with the watch on.
- **Android only.** An Apple Watch app is a separate project in a different language; not in this plan.
- **No new data leaves the phone.** The watch sends readings to the phone app; the phone app logs the workout exactly
  as today (the same log, the same summary). No new database table, no new server function. The privacy page gains
  one sentence.

## The steps

### W1. Live heart rate from the watch (L)

- **What you get**: start a walk or run on the watch app; the phone's running workout shows your heart rate and zone
  live, the same tile a chest strap fills today. End on the watch or the phone; the summary and the log are the ones
  you already have, with the watch's readings in the graph.
- **Steps**: (a) the watch app: one screen, Start / End, the clock, heart rate; it starts an exercise with Health
  Services and sends each reading to the phone. (b) the phone app: a small listener (the same kind of native piece as
  the step counter) that feeds those readings into the live store the strap uses, so the card, the zone and the
  summary need no change. (c) the readings are kept on the watch until the phone has them, so a phone left in a
  locker still gets the whole workout afterwards. (d) checks for the phone half here; a test script for his watch.
- **The risk**: Samsung's own limits on a third-party watch app (battery saving stopping it in the background, how
  often it may send). W1 exists to find these out before anything bigger is built on top.
- **From you**: test sessions with the watch, and decision 1 below.

### W2. The workout on the wrist (M)

- **What you get**: the watch shows what you picked on the phone (Walk, Run, Assault bike...), the clock, heart rate
  with its zone, and steps on foot. End on the watch, then one tap for the zone or effort, and it is logged.
- **Steps**: the phone tells the watch what was started; the watch's own steps, distance and calories come with the
  readings (better than the phone's count when the phone is not on you); the End and effort tap on the watch are
  sent to the phone, which logs it.
- **From you**: decision 2.

### W3. Today's lifting session on the watch (L)

- **What you get**: today's session as a list on the wrist, a tick per set, the rest timer with a buzz when rest ends,
  heart rate throughout. The phone app holds the plan and the log; the watch only shows and ticks.
- **Steps**: (a) the session list and a tick per set, sent to the phone, which saves the set as a tap on the phone
  does; (b) the rest timer with a buzz; (c) what happens when phone and watch disagree (the phone always wins).
  Each is its own release.
- **From you**: decision 3, and whether to do W3 at all before the app has users.

## Decisions that are yours

1. **Where a workout starts.** (a) On the watch only, the phone shows it when open. (b) On the phone, and the watch app
   opens itself. (c) Either. **Recommended: (a) for W1, (c) by W2.** Starting on the watch is the most reliable way to
   get the watch's sensor running; making the phone wake the watch app is where Samsung's background limits bite, so
   W1 finds out first.
2. **What the watch screen shows during cardio.** Recommended: the clock, heart rate with its zone, steps on foot,
   and End. Nothing that needs reading mid-stride.
3. **The watch's screen for lifting (W3).** Recommended: one exercise at a time, its sets as ticks, the rest timer
   with a buzz, and no weights typed on the watch (the phone's prescription is ticked as done; a different weight is
   changed on the phone).

The training side is unchanged: zones describe a workout, nothing is prescribed by heart rate, and no zone shows with
a health condition, pregnancy or no age.

## Recommended order

Your phone test of today's build first (live steps, strap, watch report). Then W1 on your go-ahead; W2 only once W1
holds up on your watch for a week of real walks; W3 last.

## Sources

- Health Services on Wear OS, recording an exercise: https://developer.android.com/health-and-fitness/health-services/active-data
- The Data Layer (same app id and signing key on watch and phone): https://developer.android.com/training/wearables/data/overview
