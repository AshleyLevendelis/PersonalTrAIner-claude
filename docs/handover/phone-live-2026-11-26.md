# Main (PR #63) onto his phone, 26 Nov 2026

Cardio now starts from Exercise's "Start a workout", and a recorded workout with a heart rate is logged by its zone.
Two sessions built overlapping versions; both are in `main` at `5379d67` (PR #63). His phone holds the other session's
build from the side branch. The website build of this merge was REFUSED by Vercel ("Deployment rate limited, retry in
24 hours"), so the website is still on PR #62 until a redeploy; the phone app bundles its own copy and does not wait.

```
Goal: put main (commit 5379d67, "Merge pull request #63") on Ashley's Android phone, and bring the coach's server
functions up to the same commit. He wants to start a walk today from Exercise and test with his watch and strap.

WHY, and what is different this time.
  - Two Claude sessions built the same change today. A session on THIS machine made branch
    claude/walk-zones-on-exercise (walk recorder moved to Exercise, logged by heart rate zone) and installed it on
    the phone at 14:21. A cloud session built "Start a workout > pick the cardio > Start" on another branch. The cloud
    session merged the two and then merged to main. Main now holds BOTH: starting is the cloud version (a list: Walk,
    Jog, Run, Hill sprints, Hike, Cycling, Swim, Skipping, gym machines, "Something else"); ending is this machine's
    version ("Mostly zone 3 · Steady" and one Log button when there is a heart rate, Easy / Steady / Hard when not).
    So the phone must be rebuilt from MAIN, not from the side branch. Do not build from claude/walk-zones-on-exercise
    again, and do not continue work on it: it is fully inside main.
  - The phone app carries its own copy of the website, so it only changes when rebuilt and reinstalled.
  - The website build of this merge was refused by Vercel ("Deployment rate limited, retry in 24 hours"). That does
    not affect the phone. Do nothing about it; just tell Ashley it will need a Redeploy in Vercel tomorrow (or it
    happens on the next merge to main).

You CANNOT run db:push-both or deploy:functions:prod: they need a real terminal and Ashley typing "yes-production".
Say exactly when he should run each, wait, then read his output. Never write to the PRODUCTION database any other
way. Never print a secret's value. Do not change the app id (uk.co.personaltrainerapp). Do not remove or add health
permissions in the Android manifest (it declares exactly seven, read only).

1. Get main, losing nothing.
     git status                       (if anything is uncommitted, STOP and tell Ashley what; do not discard it)
     git fetch origin && git checkout main && git pull
     git log --oneline -3             (must include 5379d67 "Merge pull request #63"; report the lines)
     git branch -r --merged origin/main | grep walk-zones     (must print the branch: proof its work is in main)
     npm ci

2. Database: measure only. There is NO new migration in this merge (newest is 20261125140000_add_recorded_activity).
     npx supabase migration list      (linked to TEST by default)
   Only if a local migration shows no Remote entry: ask Ashley to run  npm run db:push-both  and read his output.
   Otherwise say "database already up to date" and move on.

3. Coach server: deploy all six so nothing is stale (chat-gemini and coach-reach-out changed this week).
     npm run deploy:functions:test    (you may run this; report each function's result)
   Ashley runs, in his own terminal:
     npm run deploy:functions:prod    (he types "yes-production")
   Verify:  npx supabase functions list --project-ref sdkhuczcfnqqimdgfiks
   All six (chat-gemini, coach-reach-out, generate-meals, macro-calibration, onboarding-chat, report-email) must
   show today's date. Report the table.

4. Phone app.
     grep VITE_SUPABASE_URL .env .env.local 2>/dev/null     (must name sdkhuczcfnqqimdgfiks; if not, STOP and ask)
     npm run phone:sync               (builds the website and copies it into the phone projects)
   Install it on his phone the same way the 14:21 install was done today (phone on USB, USB debugging on). If that
   was Android Studio:  npx cap open android  > let Gradle sync > Run. Installing over the app keeps his sign-in.
   If the build fails, report the error word for word.

5. PROVE the new build is the one on the phone. Ask Ashley to open the app and check all three:
   a. Exercise > "Start a workout" (or "Start your own workout" on a session day) shows a CARDIO list first:
      Walk, Jog, Run, Hill sprints and more. This is the proof: the old build has no such list.
   b. Exercise no longer shows a "Record a walk or run" card with Start walk / Start run. Tools has none either.
   c. Profile > "Steps from your phone" shows four sections: steps, heart rate, workouts from your watch, sleep.
   If (a) is missing, the phone still has the old build: say so and redo step 4.

6. Tell Ashley how to do today's walk:
     Exercise > Start a workout > Walk > Start Walk. Lock the phone and walk. Back in the app the workout sits at
     the top of Exercise: End workout. With his strap or watch reading, it says "Mostly zone N" and one Log button;
     with no heart rate it asks Easy / Steady / Hard. First time, the phone asks for steps, distance, calories and
     heart rate: Allow all.
   The test sheet is docs/testing/watch-test-sheet.md (T7 is this flow). He reports back to the cloud session as
   "T7 ok" or "T7 wrong: what happened" with a screenshot.

Done looks like: a short table, four rows.
  Phone app: built from main 5379d67, with Ashley's answers to 5a, 5b, 5c.
  Server functions: six rows with today's date.
  Database: "up to date" or what was pushed.
  Website: "waiting on Vercel's limit; Redeploy tomorrow".
Paste that table back to the cloud session.
```
