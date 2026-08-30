/*
  # A ceiling on what the AI functions can cost (audit §1.3)

  1. What this is for
     The four edge functions are gated by a valid key, and the only key is the
     anon key that ships inside the app's JavaScript. Anyone holding it can
     call the coach in a loop, and there was no rate limit, per-user quota or
     spend cap anywhere. This is the durable half of the fix — the in-memory
     burst limiter in _shared/spend-cap.ts works without it.

  2. Tables
     - `ai_usage_daily` — one row per (scope, day, function). `scope` is
       either `profile:<uuid>` or `ip:<addr>` for callers with no profile yet,
       plus the literal `global` row that bounds the total bill.

  3. Security
     THIS TABLE IS NOT ANON-READABLE OR ANON-WRITABLE, unlike every other
     table in this database. It is written only by the edge functions, which
     hold the service-role key and bypass RLS. RLS is enabled with NO policy
     for anon, which denies by default — a spend cap the caller can read,
     reset or inflate is not a spend cap.

     This is also the shape every other table should eventually have (§1.1),
     and is here as the first example of it rather than as an exception.

  4. The increment function
     `increment_ai_usage` does the insert-or-increment and returns the new
     count in ONE statement. A read-then-write would let two concurrent
     requests both see a number below the cap and both proceed, which is
     exactly the traffic pattern a cap exists to stop.

     SECURITY DEFINER so it runs as the owner, with an empty search_path so
     the function body cannot be redirected by a caller-controlled one.
*/

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  function_name text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_daily_unique UNIQUE (scope, day, function_name)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_day ON ai_usage_daily (day);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Deliberately no policy. RLS enabled with no policy denies every role that
-- is subject to it; the service role bypasses RLS entirely, which is the only
-- access this table should ever have. If you are adding a policy here, stop
-- and check why the caller isn't using the service key.
DROP POLICY IF EXISTS "anon_select_ai_usage_daily" ON ai_usage_daily;
DROP POLICY IF EXISTS "anon_insert_ai_usage_daily" ON ai_usage_daily;
DROP POLICY IF EXISTS "anon_update_ai_usage_daily" ON ai_usage_daily;

CREATE OR REPLACE FUNCTION increment_ai_usage(p_scope text, p_function text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO ai_usage_daily (scope, day, function_name, requests, updated_at)
  VALUES (p_scope, CURRENT_DATE, p_function, 1, now())
  ON CONFLICT (scope, day, function_name)
  DO UPDATE SET requests = ai_usage_daily.requests + 1, updated_at = now()
  RETURNING requests INTO new_count;

  RETURN new_count;
END;
$$;

-- The edge functions call this with the service-role key. Granting it to anon
-- would let anyone inflate another caller's counter until they were locked
-- out, so anon is deliberately not granted.
REVOKE ALL ON FUNCTION increment_ai_usage(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_ai_usage(text, text) TO service_role;

/*
  Housekeeping: rows older than 60 days are of no further use. There is no
  scheduled-job infrastructure in this project (the same gap the plan
  adaptations note), so this is a statement to run by hand or wire to a cron
  later, not an automatic policy:

    DELETE FROM ai_usage_daily WHERE day < CURRENT_DATE - INTERVAL '60 days';
*/
