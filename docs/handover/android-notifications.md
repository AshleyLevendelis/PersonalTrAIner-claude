# Coach notifications in the Android app (23 Nov 2026)

Two parts: about 10 minutes in a browser (you), then one prompt for Claude Code on your machine.

## Part 1, you, in a browser (Firebase is Google's free notification service)

1. Go to console.firebase.google.com and sign in with your Google account. If a "Personal Trainer" project is already
   there, **open it and use it** (one project is all the app needs). Otherwise create one; Google Analytics is not
   needed. If the project already lists an Android app with the package below, skip to step 2's download.
2. On the project's home page press the **Android** icon ("Add app").
   - Android package name: `app.personaltrainer.coach` (exactly this).
   - Nickname: anything. Leave the SHA-1 box empty. Press **Register app**.
   - Press **Download google-services.json**. Skip the remaining steps (Next, Next, Continue to console).
3. Gear icon (top left) > **Project settings** > **Service accounts** tab > **Generate new private key** > Generate.
   A second file downloads (its name ends in `-firebase-adminsdk-....json`). **This one is a password**: never email
   it, never paste it into a chat, never put it in the repository.
4. Leave both files in Downloads and paste the prompt below into Claude Code.

## Part 2, the prompt

```
Goal: make coach notifications work in the Android phone app. Branch ccr-74a169c3-gto5y6.

WHY. The phone app (Capacitor) cannot use the browser's push service, so Profile > Reminders said "This browser can't
show notifications from the app". A cloud session added the phone's own route: @capacitor/push-notifications on the
phone (src/lib/native-push.ts) and Firebase Cloud Messaging on the server (supabase/functions/_shared/fcm.ts, used by
_shared/push.ts, so BOTH coach-reach-out and chat-gemini send to the app). A phone-app device is an ordinary
push_subscriptions row with endpoint "fcm:<token>": NO database migration. Nothing native has been built or run yet;
the checks used a pretend plugin and a pretend Firebase.

Ashley has downloaded two files to Downloads: google-services.json, and a service-account key whose name ends in
-firebase-adminsdk-<something>.json. The key is a secret: never print its contents, never commit it, never copy it
into the repo.

1. git fetch && git checkout ccr-74a169c3-gto5y6 && git pull && npm ci
   npm run test:native-push   (must end "Notifications in the phone app hold.")
2. Copy ~/Downloads/google-services.json to android/app/google-services.json.
   VERIFY: grep '"package_name"' android/app/google-services.json  names app.personaltrainer.coach.
   Do not commit it (add android/app/google-services.json to .gitignore if git status shows it).
3. Which database does the phone app use?  grep VITE_SUPABASE_URL .env .env.local 2>/dev/null
   sdkhuczcfnqqimdgfiks = PRODUCTION (his real account), vswuurrtbzbrgubddefv = TEST. Report which.
4. The server's secret. Find the key file:  ls ~/Downloads/*firebase-adminsdk*.json
   TEST (you can run it):
     npx supabase secrets set FCM_SERVICE_ACCOUNT="$(cat ~/Downloads/<the key file>)" --project-ref vswuurrtbzbrgubddefv
   PRODUCTION: ASK ASHLEY FIRST, in plain words ("this lets the live reminder service send to your phone app"). On his
   yes, the same command with --project-ref sdkhuczcfnqqimdgfiks.
   VERIFY: npx supabase secrets list --project-ref <ref>  shows FCM_SERVICE_ACCOUNT (names only, never values).
5. Deploys. These ask for a typed phrase, so ASHLEY types them in a terminal; you cannot:
     npm run deploy:functions:prod -- coach-reach-out
     npm run deploy:functions:prod -- chat-gemini
   (and the TEST ones without :prod if the phone app points at TEST). Both are needed: one sends reminders, the other
   the "the coach replied" message. VERIFY each prints the production project ref and finishes without an error.
6. npm run phone:sync
   VERIFY the output lists @capacitor/push-notifications@8.1.3 as an Android plugin. Report that part.
   npx cap open android -> Android Studio. Plug in his phone, press Run. Report any build error word for word.
   (If Gradle says the google-services plugin was not applied, step 2's file is in the wrong place.)
7. Ashley, on the phone: Profile > Reminders > "On this phone" > Allow. It must turn on, and must NOT say "This browser
   can't show notifications".
   VERIFY on the server (SQL editor of the project from step 3, a read):
     select user_id, left(endpoint, 12) as kind, timezone, created_at from push_subscriptions order by created_at desc limit 3;
   The newest row's kind starts "fcm:".
8. One test message. Ashley runs it (it holds the REACH_OUT_SECRET), with the user_id from step 7, the app CLOSED
   (swiped away or in the background):
     curl -X POST "https://<ref>.supabase.co/functions/v1/coach-reach-out" \
       -H "x-reach-out-secret: <REACH_OUT_SECRET>" -H "Content-Type: application/json" -d '{"test":"<user_id>"}'
   VERIFY: the reply's outcomes include "ok" for the fcm row AND Ashley says "Reminders are working on this phone" arrived.
   Then he taps it: the app must open on the chat.
   If the outcome is "failed": read the function's logs (Supabase dashboard > Edge Functions > coach-reach-out > Logs)
   for a line starting "[fcm]" or "[push]" and report it word for word. "FCM_SERVICE_ACCOUNT is not set" = step 4 on
   the wrong project.

Done means: step 8's message arrived on his phone with the app shut, and tapping it opened the chat. Report each step
as passed, failed (with the output), or not done and why.
```

## Known limits

- iPhone app: not built. It needs an Apple push key from a paid Apple developer account. The iPhone app says so on the
  Reminders screen.
- The small icon in the status bar is the app's own icon, which Android may draw as a plain white circle. A proper
  white outline icon is a small follow-up.
- With the app OPEN, Android shows no banner (the message is already in the chat, which refreshes itself), the same as
  the website.
