-- A drop set is a CONTINUATION of the set above it, not a set of its own.
--
-- Ashley's ruling, 19 Sep 2026, from three options: give it a proper marker,
-- over recording drops as ordinary extra sets and over drawing them now and
-- storing them later. The rejected middle option is the reason this column
-- exists: with drops stored as sets 4 and 5, every reader outside the exercise
-- screen — history, personal bests, volume, the coach, next week's weights —
-- would have seen five sets where three were performed, and each one would
-- have needed finding and teaching by hand.
--
-- HOW IT WORKS. `drop_index` is 0 for a real set and 1, 2, ... for the drops
-- hanging off it. `set_number` still names the set a row belongs to, so:
--   working set COUNT  = rows with is_warmup = false AND drop_index = 0
--   working VOLUME     = those rows PLUS their drops
-- Two different questions, two different reads, neither one quietly changing
-- meaning — which is what the column buys over a convention.
--
-- NO BACKFILL AND NO BEHAVIOUR CHANGE. Every existing row defaults to 0, which
-- is exactly what it already was: a set that is not a drop.
--
-- THE UNIQUE CONSTRAINT HAS TO GROW WITH IT. unique_set_per_session pins one
-- row per (user, session, exercise, set number, warm-up or not). A drop shares
-- its parent's set_number by design, so without drop_index in the key the
-- second drop on set 3 would collide with the first and the insert would be
-- rejected — silently, from the lifter's point of view, as a tap that did
-- nothing.

ALTER TABLE exercise_set_logs
  ADD COLUMN IF NOT EXISTS drop_index integer NOT NULL DEFAULT 0;

ALTER TABLE exercise_set_logs
  DROP CONSTRAINT IF EXISTS unique_set_per_session;

ALTER TABLE exercise_set_logs
  ADD CONSTRAINT unique_set_per_session
  UNIQUE (user_id, session_id, exercise_id, set_number, is_warmup, drop_index);

-- A drop cannot be a warm-up: the ramp is what you do BEFORE the working sets,
-- a drop is what you do after one. Enforced rather than assumed, because the
-- two flags are independent columns and nothing else would stop the
-- combination being written by a future caller.
ALTER TABLE exercise_set_logs
  DROP CONSTRAINT IF EXISTS drop_sets_are_not_warmups;

ALTER TABLE exercise_set_logs
  ADD CONSTRAINT drop_sets_are_not_warmups
  CHECK (drop_index = 0 OR is_warmup = false);

COMMENT ON COLUMN exercise_set_logs.drop_index IS
  '0 = a set in its own right; 1,2,... = a drop hanging off the set with the same set_number. Counts toward volume, never toward the set count, a personal best, or the weight the plan anchors to next week.';
