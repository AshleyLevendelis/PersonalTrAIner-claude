# Everything waiting on Ashley's machine (4 Nov 2026)

Replaces the 3 Nov prompt. Paste the block below into Claude Code in VS Code, in the PersonalTrAIner-claude folder.
Steps marked **(Ashley types)** ask for the `yes-production` phrase or a secret; Claude Code cannot do those, so it
prepares them and hands over.

```
GOAL: switch on the coach's phone reminders, and everything else the app has built but cannot use yet, then
re-sit the coach exam. You are working on Ashley's machine; a cloud session wrote this and cannot see your
environment, so verify every step yourself and report what you saw, not what a command printed.

WHY: Ashley reports that the app sends no push notifications. That is expected: the reminder sender (the
coach-reach-out edge function), its database tables and its keys have never been set up on either Supabase
project. Being a web app is NOT the reason: web push works on Android in Chrome, and on iPhone (iOS 16.4+) once
the app is added to the home screen and opened from that icon. On 4 Nov the reminders grew to up to three a day,
three hours apart, with a training-day morning reminder, a "log your meals" nudge and a "behind on protein" nudge
(her ruling "Up to 3, spaced"). Separately, many coach abilities built since late September only work once the
edge functions are deployed, and the coach exam last ran on 26 Sep against a much older coach. Nothing below
changes anyone's plan by itself.

WHAT YOU CANNOT DO: anything that asks for the typed phrase `yes-production` (db:push-both's production leg,
deploy:functions:prod, db:link-prod). Those scripts refuse without a real terminal, on purpose. Prepare the command,
tell Ashley exactly what to type, and wait for her to say it is done. Never ask her to paste a key or secret into the
chat, and never print a private key or secret back.

STEP 1. Get the code (you can do this)
  git fetch origin
  git checkout claude/coach-empty-text-fix-2c4bzv && git pull origin claude/coach-empty-text-fix-2c4bzv
  VERIFY: git log --oneline origin/main | grep "Reminders: up to three a day"   prints one line. That is the 4 Nov
  merge carrying the three-a-day reminders; if it prints nothing, main does not have them yet: stop and tell Ashley.
  VERIFY: git diff --stat origin/main...HEAD -- supabase/   prints NOTHING. That proves the edge functions and
  migrations on this branch are identical to main, so deploying from here ships exactly what main has. If it prints
  anything, stop and tell Ashley.

STEP 2. Database changes (Ashley types for production)
  Tell Ashley to run:  npm run db:push-both
  It pushes pending migrations to TEST, then asks for `yes-production` and pushes to PRODUCTION, then relinks TEST.
  The three that matter: 20260924120000_coach_reach_out.sql (reminders: tables and the hourly schedule),
  20261022120000_add_distance_to_cardio_logs.sql, and 20261104120000_reminders_three_a_day.sql (three a day, and
  the protein target for the protein nudge).
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

STEP 5. The reminder keys (you prepare, Ashley sets the production ones)
  a) node scripts/generate-vapid-keys.mjs   prints a VAPID_KEYS JSON. Do not echo it into the chat summary.
  b) Make a long random REACH_OUT_SECRET (e.g. openssl rand -hex 32), and VAPID_CONTACT=mailto:<Ashley's email>.
  c) TEST (you can):  npx supabase secrets set VAPID_KEYS='<json>' REACH_OUT_SECRET='<secret>' VAPID_CONTACT='mailto:...'
     PRODUCTION (Ashley types): npm run db:link-prod, then the same secrets set command (fresh keys or the same
     ones, her choice), then npm run db:link-test. Keep a note of which REACH_OUT_SECRET went to which project:
     step d and step 6 need it.
  d) In EACH project's Supabase dashboard, SQL editor (Ashley does this; it holds a secret):
       select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
       select vault.create_secret('<that project''s REACH_OUT_SECRET>', 'reach_out_secret');
     Without these two the hourly schedule has no address to call and nothing is ever sent.
  VERIFY: curl "https://<project-ref>.supabase.co/functions/v1/coach-reach-out?vapid" -H "apikey: <anon key>"
  returns {"publicKey": ...} on BOTH projects, not an error.
  VERIFY (SQL editor, each project): select jobname, schedule from cron.job;   shows coach-reach-out-hourly, 0 * * * *

STEP 6. A real buzz on Ashley's phone (Ashley does the phone part)
  a) Tell Ashley: on iPhone, add the app to the home screen first (Share, Add to Home Screen) and open it from that
     icon; on Android, Chrome is fine. Then Profile, Reminders: it must no longer say "Not live yet". Turn on
     "On this phone" and allow notifications when the phone asks.
  b) Find her profile id (PRODUCTION SQL editor, a read): select user_id, timezone, created_at from push_subscriptions
     order by created_at desc limit 5;   Her phone's row should be the newest, with her real timezone.
  c) Send ONE test push (Ashley runs it, it holds the production secret):
       curl -X POST "https://sdkhuczcfnqqimdgfiks.supabase.co/functions/v1/coach-reach-out" \
         -H "x-reach-out-secret: <production REACH_OUT_SECRET>" -H "Content-Type: application/json" \
         -d '{"test":"<her profile id>"}'
     VERIFY: the reply says "devices":1 and "outcomes":["ok"], AND Ashley says "Reminders are working on this phone"
     arrived. The reply alone is not proof; only the buzz is. If outcomes says "gone", the phone's subscription
     expired: turn "On this phone" off and on again and repeat.
  d) After the next full hour, VERIFY the schedule really fires (SQL editor, a read):
       select status, return_message, start_time from cron.job_run_details order by start_time desc limit 3;
     shows "succeeded" runs, one an hour. A real reminder arrives only when one is due (a training morning, an
     unlogged evening, and so on), so silence in a given hour is not a fault.

STEP 7. Re-sit the coach exam (Ashley sets the key, you run it)
  The exam plays 34 conversations against the chat-gemini on the project in .env.local (VITE_SUPABASE_URL), which is
  TEST, deployed in step 3. The judge needs ANTHROPIC_API_KEY in Ashley's terminal environment: ask her to set it
  herself (export ANTHROPIC_API_KEY=... in the terminal, or in .env.local, never in the chat).
  npx tsx scripts/run-coach-exam.mts
  VERIFY: its header line "project:" names vswuurrtbzbrgubddefv (TEST). If it names another project, stop.
  VERIFY: it prints "34 transcripts written" and no transport failures. If any turn failed in transport, run it again.
  npm run coach-exam:grade
  VERIFY: the report's judge line says "marked 34 of 34" (not 0, not a 401). Then:
  npm run test:coach-exam-fresh   must now PASS.
  Commit coach-exam-scores.json, coach-exam-report.txt and coach-exam/ on this branch and push it.
  Report back to Ashley: the overall score, the voice score, and any hard-rule breaches by name.

DONE MEANS: schema parity passes; all five functions deployed to TEST and PRODUCTION with the right project named;
the reminder key endpoint answers on both; the test push buzzed Ashley's phone; the hourly job shows succeeded runs;
the exam has 34 marked cases and its freshness check passes. Anything skipped or failed is said plainly, with the
output.
```
