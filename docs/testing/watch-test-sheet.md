# Testing the watch, heart rate, steps and sleep on a real phone

Written 26 Nov 2026 for Ashley's first run on his own Samsung phone and watch. Nothing here has run on a real watch
yet, so every line is a real test. Each test has a number so a report can be one line.

## Before you start (once)

- **B1. Let Samsung Health share with the phone.** Samsung Health → the three dots → Settings → Health Connect →
  allow Exercise, Heart rate, Sleep, Steps, Distance and Calories burned. Without this the app sees nothing.
- **B2. Switch the app's four readers on.** In the app: gear → Profile → "Steps from your phone". Switch on Steps,
  Heart rate from your watch, Workouts from your watch, and Sleep from your watch. Say Allow each time.
- **B3. Wear the watch to bed.** The sleep row shows last night straight away; "your usual" needs five nights.

## The tests

| No. | What to do | What you should see |
| --- | --- | --- |
| T1 | Open Home after walking about. | The steps ring matches Samsung Health's step count (near enough). |
| T2 | Start a walk or run on the WATCH, 10 minutes or more. End it. Open Samsung Health so it syncs, then open the app. | Home shows "From your watch" with the workout's name, time, distance, pace, calories, average and highest heart rate, a heart rate graph, and five heart rate zones. Note how long it took to appear. |
| T3 | On that card tap Easy, Steady or Hard. | The card stays as a summary and says "Logged". It is not offered again when you reopen the app. |
| T4 | Record a strength workout on the watch (any length over 5 minutes). | The card shows time and the heart rate graph, NO zones, and a line about logging exercises on Exercise. |
| T5 | On any watch card tap "Not mine". | It goes and never comes back, even after closing the app. |
| T6 | On a day your plan has a cardio session, record that kind of workout on the watch. | The card shows "Today's plan" with Planned and You did, and "Today's session" is chosen. After logging, the day reads done. |
| T7 | Tools → Start walk (or run) → walk 5+ minutes → End. | The same style of summary, then one effort tap logs it. |
| T8 | Do a lifting session in the app while wearing the watch. Finish it. Open Home a little later. | Under the session: average and highest heart rate. |
| T9 | After two or three nights with the watch on. | Home → Progress shows a resting heart rate line. |
| T10 | The morning after wearing the watch to bed. | Home shows a Sleep row: hours last night, and bars for the week. Compare the hours with Samsung Health's "time asleep". |
| T11 | Wait for the morning session reminder, then open the app. | ONE message about today's session (not two), with "Open today's session" and four answers under it. |
| T12 | Only if you have a chest strap: Profile → pair it, then start a timer. | A live "♥ number" on the timer and beside the gear. |

## How to report (in the chat with Claude, from your phone)

One line per test, with a screenshot when it is wrong:

- `T2 ok` when it is right.
- `T2 wrong: app says 3.1 km, watch says 5.2 km` plus a screenshot of the app AND of Samsung Health's page for the
  same workout or night. The pair is what lets the cause be found.
- `T10 nothing: no sleep row at all` when something never appears.
- `IDEA: ...` for anything you would like changed or added, in your own words.
- `LOOKS: ...` for anything that works but looks wrong.

Voice typing is fine. There is no need to be tidy: the test number and what you saw are enough.
