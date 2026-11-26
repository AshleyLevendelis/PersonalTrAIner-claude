# Watch data: steps, heart rate, workouts and sleep (26 Nov 2026)

His brief: "work on the steps and heart rate monitor features. Look at how other apps use steps and heart data ...
with my Samsung Watch, I could just go in, start a workout, and it starts recording the time and my heart rate. Then
it gives me a summary at the end ... log workouts that are not necessarily in the plan ... maybe even sleep monitoring
... knowing if they've recovered well and planning workouts around that."

## What the best apps do

- **Watch makers** (Samsung Health, Garmin): tap start, pick a type, time and live heart rate, a summary at the end.
- **Recovery apps** (Whoop, Garmin Training Readiness): a morning score from last night's sleep, resting heart rate
  and heart rate variability, each against the person's own baseline. Whoop shows green, amber or red and suggests how
  hard to go; Garmin gives five bands with a phrase each.
- **Lifting apps** (Strong, Jefit): sets, reps and weight, with a watch app for logging from the wrist.

The gap we can fill: recovery apps do not know the plan, and lifting apps do not know the recovery. We have the plan
and a coach, so the coach can act on recovery with the plan in front of it. (Not a survey of every app.)

## What the evidence says (so the app does not overclaim)

- Acute sleep loss costs about 3% of strength; several short nights in a row cost compound lifts more (Craven et al.
  meta-analysis; Knowles et al. 2018).
- Heart-rate-variability-guided training shows small benefits in endurance work and has little evidence for lifting
  (Addleman et al. 2024 narrative review; two 2021 meta-analyses).
- So: the app OFFERS a lighter session and never changes one by itself, which is already how the raised-resting-
  heart-rate offer works (his 25 Nov ruling). No number is presented with more precision than it has.

## What his Samsung watch gives us

Samsung Health writes to Health Connect: steps, exercise sessions, heart rate, sleep with stages, blood oxygen, weight.
It is widely reported NOT to write resting heart rate or heart rate variability (third-party guides and a developer
issue; no Samsung document found). A phone app cannot start or stop a recording on the watch; that needs a Wear OS app
of our own.

## Build order

1. **BUILT (this change): pick up what the watch recorded.** He starts a workout on the watch as he always does. With
   Profile's "Workouts from your watch" on, Home offers any workout the app does not already hold ("Run · 42 min ·
   5.2 km · 410 kcal · Today, 09:48 · Samsung Health") and one effort tap logs it, at the watch's own start, with the
   steps and heart rate the phone holds for that time. Never logged unasked, never counted twice, "Not mine" puts one
   away for good. A strength workout says that the watch log keeps time and heart rate, and where to log the
   exercises. **And resting heart rate works on a watch that shares none**: worked out from the night's readings
   (midnight to 6 am, the reading a tenth of the way up from the lowest, 8 readings or no figure), only when the store
   holds no resting figure at all.
2. **BUILT 26 Nov 2026 (his pick "A"): sleep.** Its own switch on Profile ("Sleep from your watch", read only). Home
   shows last night against his usual with the week as seven bars. The coach is told last night, his usual and the
   week with each message, and after two short nights in a row its first message of the day offers the shortest
   version of today's session (main lift kept, extras trimmed). Never automatic, no score. Nothing about his sleep is
   saved: the nights are read from the phone each time, so there is no migration. Needs READ_SLEEP (declared) and the
   `chat-gemini` deploy. Rules and basis: `src/lib/sleep-nights.ts`.
   **And the watch workout card was redrawn the same day** on his word that the first one was too simple: tiles, a
   heart-rate graph, time in five heart rate zones (his ruling the same day, over my three effort bands), the plan
   beside what he did on a planned cardio day. And his pick "A": when a session planned easy averaged zone 4 or 5,
   the coach says so once and asks whether he wants the next one slower; nothing changes without a yes. `src/lib/heart-series.ts`, `src/components/WorkoutFigures.tsx`.
3. **Smarter steps**: a weekly trend, and an OFFER to correct the activity level when a fortnight of steps disagrees
   with it. Calories burned still never change the food target.
4. **A Wear OS app**: start on the wrist, live heart rate in the app, tick sets from the watch. Native, his machine.

## Decisions in step 1 (mine: measurement and mechanics; nothing here changes a prescription)

- Offered, never auto-logged: a watch auto-detects walks nobody would call a workout, and a log he did not make is the
  app speaking for him. Effort is asked (his 24 Sep rule).
- Under 5 minutes is not offered; the look-back is two days.
- "Already held" is: an app session or log covering half of the workout's time, or the same activity typed that day at
  about the same length (within a quarter). A read that cannot see what the app holds offers nothing.
- It is extra work (his 22 Oct ruling for cardio already done): logged beside the plan, never in place of a session.
- Steps are kept on foot only. The watch's own calories and distance are used where it wrote them and are never
  marked an estimate.
- One new permission, read only, from its own switch: workouts (READ_EXERCISE on Android). The privacy page says so.

## Not proven

Nothing here has run on a real watch. The phone's health store is pretended in the checks; what Samsung actually
writes, and when it syncs, is only known from reports. The first run on his phone is the test.
