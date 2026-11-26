# Everything from main onto production and his phone (25 Nov 2026)

Ashley lost track of which sessions' work reached the live database, the coach's server and his phone app. One prompt
for Claude Code on his machine brings all three up to `main` as of PR #62 (the watch workout summary with heart rate
zones, sleep, and the coach's wider quick replies, 26 Nov 2026, merged on top of PR #61's plan fixes and watch
workouts, the walk recorder, own workouts and the one calorie method). The website deploys itself from `main` and was confirmed live in the cloud
session. Nothing is left on a side branch.

```
Goal: bring EVERYTHING on main live: the production database, the coach's server functions, and Ashley's phone app.
He has lost track across several Claude Code sessions of which changes reached which place, so do not trust any
earlier note: measure each place, bring it up to main, and prove it.

WHY. The app has four places that update separately:
  - Website: deploys itself from main through Vercel. Already done for main at PR #62, commit 970671c (nothing to do).
  - Database (Supabase, TEST vswuurrtbzbrgubddefv and PRODUCTION sdkhuczcfnqqimdgfiks): new tables and columns only
    arrive when migrations are pushed. Main has migrations up to 20261125140000_add_recorded_activity.sql. Features
    that need a missing column quietly fall back ("not switched on yet"), so the website can look fine while a
    migration is missing.
  - Coach server (six edge functions: chat-gemini, coach-reach-out, generate-meals, macro-calibration,
    onboarding-chat, report-email): each only changes when deployed. Many recent coach changes say "needs the
    chat-gemini deploy".
  - Phone app (Capacitor, android/ and ios/): the website is BUNDLED inside it, so the phone app only gets any change
    (web or native) when it is rebuilt and reinstalled. Recent native changes: heart rate and walk/run recording
    (Health Connect permissions: steps, heart rate, resting heart rate, distance, active calories, and since 26 Nov
    workouts and sleep), the heart rate strap (Bluetooth), coach notifications through Firebase.
Order matters: database first, then server functions (they read the new columns), then the phone app.

You CANNOT run the two production commands (db:push-both, deploy:functions:prod): they refuse without a real terminal
on purpose and ask Ashley to type "yes-production". Tell him exactly when to run each, wait, then read his output.
Never write to the PRODUCTION database any other way. Never print a secret's value.

1. Get main.
     git fetch origin && git checkout main && git pull
     git log --oneline -3          (must include 970671c "Merge pull request #62"; report the lines)
     npm ci
     ls supabase/migrations | tail -3   (must end with 20261125140000_add_recorded_activity.sql)

2. Database. Measure first, then push.
     npx supabase migration list        (the CLI is linked to TEST by default; report which local migrations show
                                         no Remote entry)
   Ashley runs, in his own terminal:
     npm run db:push-both
   It pushes to TEST, then asks for "yes-production" and pushes to PRODUCTION, then relinks to TEST.
   Read his output: report which migrations each project applied, or "up to date". "Up to date" alone proves nothing
   if step 1 did not show the newest file, so check step 1 first.
   Then verify both projects match:
     npm run test:schema-parity        (must say both projects have the identical migration set; report its last lines)

3. Coach server. Deploy ALL six, so nothing is left stale.
     npm run deploy:functions:test     (you may run this one; report each function's result)
   Ashley runs:
     npm run deploy:functions:prod     (no name = all six; he types "yes-production")
   If either refuses with "is stale or cannot run on Deno": run  npm run sync:shared , commit to a new branch, push,
   tell Ashley, and stop (main must hold what is deployed).
   Verify: npx supabase functions list --project-ref sdkhuczcfnqqimdgfiks
   Every one of the six must show today's date as updated. Report the table.

4. Server secrets: report, do not set.
     npx supabase secrets list --project-ref sdkhuczcfnqqimdgfiks     (names only)
   The functions read: GEMINI_KEY, VAPID_KEYS, VAPID_CONTACT, REACH_OUT_SECRET, FCM_SERVICE_ACCOUNT, RESEND_API_KEY,
   REPORT_EMAIL_SECRET, REPORT_EMAIL_FROM, REPORT_EMAIL_TO (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are built in).
   List which are missing and what each missing one switches off:
     GEMINI_KEY = the coach does not answer at all (urgent)
     VAPID_* / REACH_OUT_SECRET = no phone notifications from the website
     FCM_SERVICE_ACCOUNT = no notifications in the Android app (docs/handover/android-notifications.md has the steps)
     RESEND_API_KEY / REPORT_EMAIL_* = reported coach replies are saved but not emailed to him
   Do not set any of them yourself.

5. Phone app.
     grep VITE_SUPABASE_URL .env .env.local 2>/dev/null
   It must name sdkhuczcfnqqimdgfiks (PRODUCTION, his real account). If it names the TEST project, stop and ask Ashley.
     ls android/app/google-services.json   (present = Android notifications can work; absent = say so, carry on)
     npm run phone:sync                    (builds the website and copies it into both phone projects; report the
                                            plugin list it prints)
   Android: npx cap open android -> let Gradle sync -> his phone plugged in with USB debugging on -> Run.
   Installing over the existing app keeps his sign-in and data. If the build fails, report the error word for word;
   do not change the app id (uk.co.personaltrainerapp).
   iPhone (Mac with Xcode only): npx cap open ios -> pick his team under Signing -> his iPhone -> Run.

6. Tell Ashley what to check on the phone:
   - Profile > Steps from your phone: switch on "Workouts from your watch" (say Allow to workouts). Then start any
     workout on the watch, end it, let the watch sync, and open the app: Home shows "From your watch" with the
     workout as a summary (figures, a heart rate graph, time in five heart rate zones); one effort tap logs it.
   - Same page: switch on "Sleep from your watch" (say Allow to sleep). Home then shows last night against his usual
     with the week as bars (the usual needs five nights in Health Connect).
   - Chat: a question from the coach about today's session shows "Open today's session" and four answers under it. Also on that Profile page, with "Heart rate from your watch" on, Home > Progress
     should show a resting heart rate after a few nights (it is worked out from overnight readings on a Samsung).
   - Tools tab: "Start walk" / "Start run", then End: steps, distance and calories fill in, one effort tap logs it.
     The first time, the phone asks for distance and calories permission: say Allow.
   - Exercise tab: under any day, "Start your own workout" / "Log a workout you did" / "Plan a workout".
   - Nutrition: the "How your targets are set" sheet has the new look and no "Dynamic CSCS" option.
   - Chat: the coach answers (proves GEMINI_KEY and chat-gemini).
   - Profile > Steps from your phone, and heart rate, ask permission again if new permissions were added.

Done looks like: a short table with four rows (Website, Database TEST and PRODUCTION, Server functions, Phone app),
each saying "up to date with main 970671c (PR #62)" with the proof from above, or exactly what is missing and why. Plus the
list of missing secrets. Paste that table back to the cloud session.
```
