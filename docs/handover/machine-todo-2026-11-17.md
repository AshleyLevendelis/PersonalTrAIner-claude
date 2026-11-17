```
Two jobs, READ ONLY on production (sdkhuczcfnqqimdgfiks) unless a step says Ashley does it himself. Change nothing:
no deploy, no SQL that writes, no secrets set. Paste every answer back to the cloud session word for word.

WHY. (1) Ashley wants to know everything merged to main is live, with nothing outstanding. The frontend ships itself
on merge; the server functions and database changes do not. (2) He has NEVER had a daily reminder or check-in from the
coach on his phone, though every test push has arrived. The reminders are sent by the coach-reach-out function, called
every hour by a database schedule. Nobody has ever confirmed that hourly call succeeds on production. A cloud session
also found and fixed (on branch claude/coach-empty-text-fix-2c4bzv, not yet on main) one app-side cause: starting a
new profile cut the link between his phone and the profile he uses, while Profile still said reminders were on.

== PART 1: is everything live? ==
1. git checkout main && git pull. `git log --oneline -1` must show 9f8e0ef2 or later.
2. Server functions:
     npx supabase functions list --project-ref sdkhuczcfnqqimdgfiks
   Report the UPDATED date of each. The last change on main to each one (it needs a deploy if its date is earlier):
     chat-gemini        17 Nov 2026
     onboarding-chat    16 Nov 2026
     generate-meals     15 Nov 2026
     coach-reach-out    15 Nov 2026
     macro-calibration   6 Nov 2026
   For each that is older, tell Ashley to run in his own terminal (it asks him to type yes-production; you cannot):
     npm run deploy:functions:prod -- <name>
   On Windows run `npm run sync:shared` first if the deploy calls a shared file STALE.
3. Database changes:
     npx supabase migration list --linked      (the default link is TEST; this shows TEST)
   Then read PRODUCTION's own record in the dashboard SQL editor (a read):
     select version from supabase_migrations.schema_migrations order by version desc limit 15;
   Compare with the files in supabase/migrations. These are the newest; report any missing from PRODUCTION:
     20261115120000_add_due_date, 20261114180000_add_plan_paused_since, 20261114150000_health_conditions,
     20261114120000_running_goal, 20261113140000_flexible_nutrition, 20261113130000_enjoyed_activities,
     20261113120000_coach_moment_log, 20261111120000_add_meals_elsewhere, 20261109120000_add_date_of_birth
   If any are missing, Ashley runs `npm run db:push-both` himself (typed confirmation), then `npm run test:schema-parity`.

== PART 2: why no reminders? (all reads, PRODUCTION SQL editor) ==
4. The schedule:
     select jobname, schedule, active from cron.job;
     select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   EXPECT coach-reach-out-hourly, '0 * * * *', active = true, a run in the last hour, status succeeded.
5. What the function answered each hour (kept for about six hours). THIS IS THE KEY ONE:
     select created, status_code, left(content::text, 300) from net._http_response order by created desc limit 8;
   Read it like this:
     403 "Forbidden"     -> the Vault secret reach_out_secret no longer matches the function's REACH_OUT_SECRET (a
                            production secret was replaced on 5 Nov). Ashley re-sets ONE of them so they match; tell
                            him which, and do not print either value.
     404                 -> the function is not deployed, or project_url in Vault is wrong.
     500 + error text    -> report the text.
     200 {"people":0,...}-> no phone is linked to any profile: Part 2 step 6.
     200 with "quiet"    -> phones found, nothing due that hour (normal for many hours; look for any "sent":1).
     no rows at all      -> the schedule is not calling out (step 4), or Vault project_url is missing:
                            select name from vault.secrets;   (names only; expect project_url and reach_out_secret)
6. His phone and profile:
     select id, display_name, created_at from fitness_profiles order by created_at desc limit 5;
     select user_id, endpoint like 'https://web.push.apple.com%' as iphone, timezone, created_at from push_subscriptions;
     select notification_switches from fitness_profiles where id = '<his newest profile id>';
   EXPECT a row whose user_id is his NEWEST profile. A row on an older profile, or none, is the link the cloud
   session's fix restores (once merged, opening the app re-links it). Until then, Profile > Reminders > turn it off and
   on again re-links it by hand.
7. What has been sent:
     select user_id, moment, sent_on, sent_at from coach_notifications_sent order by sent_at desc limit 10;
8. Function logs: dashboard > Edge Functions > coach-reach-out > Logs, last 24 hours. Copy any error line word for word.

DONE MEANS: the dates from step 2, the missing migrations from step 3, and the printed results of steps 4-8, pasted
back. Nothing on production changed by you.
```
