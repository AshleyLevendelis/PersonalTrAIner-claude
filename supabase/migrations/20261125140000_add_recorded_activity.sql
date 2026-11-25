-- A RECORDED WALK OR RUN (his request 25 Nov 2026, "start workout and recording and end the workout ... the app then
-- logs. 5k steps logged 300kcal burned ... taking the kcal from the device"; his ruling "A, build it": a strap alone
-- gives an ESTIMATE, marked as one). src/lib/activity-recording.ts.
--
-- Start and End in the app set the window; the phone's health store (Health Connect / Apple Health), which the watch
-- and the phone write to, is read for that window. The figures sit on the cardio log the recording becomes.
--   started_at      the instant Start was tapped. Non-null marks a recorded log; its window is started_at to completed_at.
--   steps           steps in that window.
--   active_kcal     calories burned in that window: the device's own figure, or the app's estimate from heart rate.
--   kcal_estimated  true when active_kcal is the app's estimate (strap only); a device figure later replaces it.
-- Calories burned are shown, never added to the food target (CSCS, mine: the target already counts activity level).
-- Every column is nullable and read with select('*'), and the app retries an insert without them, so it works the
-- same before this runs.

ALTER TABLE cardio_logs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE cardio_logs ADD COLUMN IF NOT EXISTS steps integer CHECK (steps IS NULL OR (steps >= 0 AND steps <= 200000));
ALTER TABLE cardio_logs ADD COLUMN IF NOT EXISTS active_kcal integer CHECK (active_kcal IS NULL OR (active_kcal >= 0 AND active_kcal <= 10000));
ALTER TABLE cardio_logs ADD COLUMN IF NOT EXISTS kcal_estimated boolean;
