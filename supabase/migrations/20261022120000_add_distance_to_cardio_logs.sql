-- How far a cardio session went, in kilometres (Sam live test, 20 Oct 2026; Ashley's pick 22 Oct: "a proper field").
-- "I went for a 40 minute run at lunch, about 6km" had nowhere to keep the 6 km. Null when not given, which is most
-- sessions: nothing is ever estimated into it. The bound only refuses a typo; it is not a judgement about training.
ALTER TABLE public.cardio_logs
  ADD COLUMN IF NOT EXISTS distance_km numeric NULL
  CHECK (distance_km IS NULL OR (distance_km > 0 AND distance_km <= 500));
