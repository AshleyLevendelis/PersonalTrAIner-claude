# Record a walk or run

His request, 25 Nov 2026: "You should be able to start workout and recording and end the workout and recording and the
app then logs. 5k steps logged 300kcal burned for example taking the kcal from the device which is recording ie watch
or strap". Asked what calories a strap alone should give (a strap sends heart rate only): **"A, build it"**, an
estimate, marked as one (over showing nothing).

## What he gets

- Tools → **Record a walk or run** → Start walk / Start run. The first Start asks the phone, once, for steps, distance,
  calories burned and heart rate.
- While recording: the clock, the strap's live "♥ N", End, and Cancel (which asks first). The recording is two instants
  kept on the phone, so it survives the phone locking or the app closing.
- End: what the phone holds for exactly that window. Steps, distance and calories from Health Connect / Apple Health
  (the watch and phone write there); heart rate from the strap's own readings, else the watch's. One effort tap
  (Easy / Steady / Hard, nothing chosen for him) logs it as a cardio log: "Walk · 48 min · Steady · 3.84 km · 5,012
  steps · 300 kcal · ♥ 112 avg". Keep going takes End back; Throw it away logs nothing.
- A watch that syncs late: the log saves at once, the card says the steps or calories will fill in, and when Home next
  opens (or the app comes back to the front) the missing figures are read again and filled. A watch's calories replace
  the estimate; nothing else is ever overwritten.

## Mine (CSCS and measurement)

- **Calories burned never change the food target.** The target already counts activity level, and watch figures run
  high, so adding them would count the same exercise twice. Shown, and that is all (`test:recorded-activity` §6).
- **The device's figure always wins.** The estimate is used only where no device gave calories.
- **The estimate**: Keytel et al. 2005 (J Sports Sci 23:289), energy from heart rate, weight, age and sex. It is total
  energy, a watch reports active, so about 1 kcal per kg an hour is taken off to make them comparable. Not given with an
  average under 90 (the equation is for a working heart), nor without weight and age; no sex on the profile averages the
  two equations. Typical error 15-20%: hence "≈" and "estimate" wherever it is printed.
- **A zero is "nothing recorded"**, never a claim of no steps or no calories.
- Over 6 hours is "forgotten": the card says so and offers Throw it away.

## Engineering

- `src/lib/activity-figures.ts` (pure), `src/lib/activity-recording.ts` (the store, the reads, the log, the late fill),
  `src/components/RecordActivityCard.tsx` (Tools).
- The phone adapter gains `requestActivityAccess`, `distanceMetersBetween`, `activeKcalBetween` (the plugin's
  `distance` and `calories`, Health Connect's DistanceRecord and ActiveCaloriesBurnedRecord).
- Android declares READ_DISTANCE and READ_ACTIVE_CALORIES_BURNED (were removed); iPhone's permission sentence and the
  privacy page name distance and calories.
- Migration `20261125120000_add_recorded_activity.sql`: `cardio_logs.started_at`, `steps`, `active_kcal`,
  `kcal_estimated`. An insert on a database without them is retried without each, so the walk always saves.

## Not built

- GPS (a route, pace, distance without a watch or phone that records it): the app reads only what the phone stores.
- The coach being told a log's steps and calories burned (needs a `chat-gemini` change and deploy).
- A recording indicator outside Tools (Home or the corner) while a walk runs.
- Strap readings while the app is in the background: whether the phone keeps the strap's notifications flowing to a
  closed app is untested on a real phone; a watch's heart rate fills in either way.
