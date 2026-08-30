/*
  # The spend counter was still callable by the key that ships in the app

  Found by running the migrations against a real PostgreSQL with Supabase's
  privilege setup (scripts/test-rls-local.mjs), not by reading them.

  ## What was wrong

  20260830090000 closed `increment_ai_usage` with:

      REVOKE ALL ON FUNCTION increment_ai_usage(text, text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION increment_ai_usage(text, text) TO service_role;

  which reads as airtight and is not. Supabase grants `anon` and
  `authenticated` privileges on new objects in `public` through DEFAULT
  PRIVILEGES, and those land as DIRECT grants on the role. Revoking from
  PUBLIC does not remove a direct grant, so `anon` kept EXECUTE — and the
  anon key ships inside the app's JavaScript.

  ## Why that matters

  Anyone holding that key could call

      increment_ai_usage('profile:<someone-elses-uuid>', 'chat-gemini')

  in a loop and push that person over their daily cap, locking them out of
  their coach until midnight. Pointed at the `global` scope it takes the
  coach down for everybody at once, via the 503 path the cap uses for a
  service-wide ceiling. A rate limiter the attacker can drive is worse than
  none: it converts a spend problem into an availability one.

  The counting itself was never wrong — only who was allowed to do it.

  ## The fix

  Name the roles. REVOKE against PUBLIC alone is not a way to close a
  function on Supabase; the grants that exist are on `anon` and
  `authenticated`, so those are what has to be revoked.

  Idempotent, and safe whether or not 20260830090000 has already been
  applied anywhere.
*/

REVOKE ALL ON FUNCTION increment_ai_usage(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_ai_usage(text, text) TO service_role;

-- The two functions the RLS policies depend on stay callable by anon and
-- authenticated ON PURPOSE — a policy's function runs with the caller's
-- privileges, so revoking these would deny every user their own rows.
-- Neither leaks anything: owns_profile() answers false for a profile the
-- caller does not own, and claim_profile() only touches unowned rows.
