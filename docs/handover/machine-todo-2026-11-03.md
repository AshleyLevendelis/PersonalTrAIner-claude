# Everything waiting on Ashley's machine (3 Nov 2026)

Paste the block below into Claude Code in VS Code, in the PersonalTrAIner-claude folder. Steps marked **(Ashley types)**
ask for the `yes-production` phrase or a secret; Claude Code cannot do those, so it prepares them and hands over.

```
GOAL: switch on everything the app has built but cannot use yet, then re-sit the coach exam so we know how good
the coach's advice really is today. You are working on Ashley's machine; a cloud session wrote this and cannot
see your environment, so verify every step yourself and report what you saw, not what a command printed.

WHY: since late September a lot of the coach's abilities (the kit list, moving calories between meals, swapping a
meal across days, the welcome back after a break, logging a run as extra, timer circuits, and more) were built in
the app but only work once the edge functions are deployed. Phone reminders are built but need a migration, a
deploy and three secrets. And the coach exam last ran on 26 Sep against a coach that has changed a great deal; its
freshness check (npm run test:coach-exam-fresh) currently fails for exactly that reason, plus a new one: the scores
predate the per-question stamps added on 3 Nov. Nothing below changes anyone's plan by itself.

WHAT YOU CANNOT DO: anything that asks for the typed phrase `yes-production` (db:push-both's production leg,
deploy:functions:prod, db:link-prod). Those scripts refuse without a real terminal, on purpose. Prepare the command,
tell Ashley exactly what to type, and wait for her to say it is done. Never ask her to paste a key or secret into the
chat, and never print a private key back.

STEP 1. Get the code (you can do this)
  git fetch origin
  git checkout claude/coach-empty-text-fix-2c4bzv && git pull origin claude/coach-empty-text-fix-2c4bzv
  VERIFY: git log --oneline -1 shows 5fa1a783 or later ("verify:warmup-rows: today's bodyweight rep work ...").
  VERIFY: git log --oneline -1 origin/main shows 5fa1a783 or later: merged 4 Nov 2026 with the exercise lists, machine
  swaps, the eight gym machines, the recovery colour, the tab icons and "RDL" in search. None of that changed anything
  under supabase/, so nothing below is new for it.
  VERIFY: git diff --stat origin/main...HEAD -- supabase/   prints NOTHING. That proves the edge functions on this
  branch are identical to main, so deploying from here ships exactly what main has. If it prints anything, stop and
  tell Ashley.

STEP 2. Database changes (Ashley types for production)
  Tell Ashley to run:  npm run db:push-both
  It pushes pending migrations to TEST, then asks for `yes-production` and pushes to PRODUCTION, then relinks TEST.
  The three that matter now: 20260924120000_coach_reach_out.sql (reminders), 20261022120000_add_distance_to_cardio_logs.sql,
  and 20261104120000_reminders_three_a_day.sql (up to three reminders a day, and the protein target for the protein nudge).
  VERIFY (you can run it): npm run test:schema-parity   must pass, saying both projects have the same migrations.
  "Remote database is up to date" alone proves nothing: it prints the same whether a push happened or not.

STEP 3. Edge functions to TEST (you can do this)
  npm run deploy:functions:test
  It deploys all five (chat-gemini, coach-reach-out, generate-meals, macro-calibration, onboarding-chat) to TEST and
  names the target. If it refuses because a shared copy is stale, run npm run sync:shared, commit, push, and retry.
  VERIFY: the output names the TEST project (vswuurrtbzbrgubddefv) and lists all five as deployed. Then
  npx supabase functions list   shows all five with today's date.

STEP 4. Edge functions to PRODUCTION (Ashley types)
  Tell Ashley to run:  npm run deploy:functions:prod
  VERIFY with her: the output names PRODUCTION (sdkhuczcfnqqimdgfiks) before the phrase, and every function after.

STEP 5. Phone reminders (you prepare, Ashley sets the secrets)
  a) node scripts/generate-vapid-keys.mjs   prints a VAPID_KEYS JSON. Do not echo it into the chat summary.
  b) Make a long random REACH_OUT_SECRET (e.g. openssl rand -hex 32), and a VAPID_CONTACT like mailto:<her email>.
  c) TEST (you can):  npx supabase secrets set VAPID_KEYS='<json>' REACH_OUT_SECRET='<secret>' VAPID_CONTACT='mailto:...'
     PRODUCTION (Ashley types): npm run db:link-prod, then the same secrets set command with her OWN fresh keys or
     the same ones (her choice), then npm run db:link-test.
  d) In each project's Supabase dashboard, SQL editor (Ashley does this; it holds a secret):
       select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
       select vault.create_secret('<the REACH_OUT_SECRET value>', 'reach_out_secret');
  VERIFY: curl "https://<project-ref>.supabase.co/functions/v1/coach-reach-out?vapid" -H "apikey: <anon key>"
  returns a public key (not an error). Then on the app's Profile, the reminders section no longer says "Not live
  yet" and offers the switch. A real buzz on a phone is the only proof the push works end to end; ask Ashley to turn
  it on and say whether one arrived.

STEP 6. Re-sit the coach exam (Ashley sets the key, you run it)
  The exam plays 34 conversations against the chat-gemini on the project in .env.local (VITE_SUPABASE_URL), which is
  TEST, deployed in step 3. The judge needs ANTHROPIC_API_KEY in Ashley's terminal environment: ask her to set it
  herself (export ANTHROPIC_API_KEY=... in the terminal, or in .env.local, never in the chat).
  npx tsx scripts/run-coach-exam.mts
  VERIFY: its header line "project:" names vswuurrtbzbrgubddefv (TEST). If it names another project, stop: that
  project's coach was not deployed in step 3, so the exam would grade an old coach.
  VERIFY: it prints "34 transcripts written" and no transport failures. If any turn failed in transport, run it again.
  npm run coach-exam:grade
  VERIFY: the report's judge line says "marked 34 of 34" (not 0, not a 401). Then:
  npm run test:coach-exam-fresh   must now PASS ("the exam's scores match the coach on disk").
  Commit coach-exam-scores.json, coach-exam-report.txt and coach-exam/ on this branch and push it.
  Report back to Ashley: the overall score, the voice score, any hard-rule breaches by name, and the four new cases
  (layoff-restart-offered-not-imposed, kit-said-is-remembered, extra-cardio-is-extra, circuit-is-one-workout).

DONE MEANS: schema parity passes; all five functions deployed to TEST and PRODUCTION with the right project named;
the reminder key endpoint answers on both; the exam has 34 marked cases and its freshness check passes; the results
are committed and pushed. Anything skipped or failed is said plainly, with the output.
```
