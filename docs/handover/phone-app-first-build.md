# The phone app's first build, on Ashley's machine (20 Nov 2026)

Paste the block below into Claude Code on your machine. It needs a Mac with Xcode for the iPhone app, and Android
Studio (Mac or Windows) for the Android app. It installs the app on YOUR phone from your computer; nothing goes to the
App Store or Play Store yet.

```
Goal: build the new phone app (iPhone and/or Android) from the branch claude/coach-empty-text-fix-2c4bzv and install it
on Ashley's own phone, so he can check that steps come in from Apple Health / Health Connect. Nothing is submitted to
any store. Nothing touches the database or the live website.

WHY. A cloud session wrapped the web app in Capacitor 8 (folders ios/ and android/, capacitor.config.ts) and added one
native feature: Profile > "Steps from your phone" reads today's step count from Apple Health (iPhone) or Health
Connect (Android) and fills Home's steps ring. The cloud session cannot run Xcode or Android Studio, so nothing native
has ever been built. Browser tests used a pretend health store; this is the first real run.

1. git fetch && git checkout claude/coach-empty-text-fix-2c4bzv && git pull
   Prove the checkout holds the work:
     ls capacitor.config.ts ios/App/App/App.entitlements android/app/src/main/AndroidManifest.xml src/lib/health-steps.ts
     npm ci
     npm run test:phone-app        (must end "The phone app asks for steps and nothing else, and says so everywhere it is asked.")
1b. The phone app talks to whichever database the build is pointed at. Check .env (or .env.local):
     grep VITE_SUPABASE_URL .env .env.local 2>/dev/null
   Report which project it names. sdkhuczcfnqqimdgfiks = PRODUCTION (his real account, the one with his email);
   vswuurrtbzbrgubddefv = TEST (a throwaway account). Ask Ashley which he wants on his phone; for checking his own
   steps against his own account it is production. Do not edit any database.
2. npm run phone:sync             (builds the web app and copies it into both native projects)
   It must list "@capgo/capacitor-health" as a plugin for ios and android. Report that part of the output.

== iPhone (Mac only) ==
3. npx cap open ios   -> Xcode opens.
   - Select the "App" target > Signing & Capabilities. Pick Ashley's team (his Apple ID works for installing on his
     own phone; a paid developer account is only needed for the store).
   - Check that "HealthKit" is listed as a capability. The entitlements file is already set; if Xcode does not show
     it, press "+ Capability" and add HealthKit (do not tick "Clinical Health Records").
   - Plug in his iPhone, choose it as the run destination, press Run. On the phone he may have to trust the developer
     in Settings > General > VPN & Device Management.
4. Report any build error word for word. Do not change the app's id (app.personaltrainer.coach) without asking.

== Android ==
5. npx cap open android  -> Android Studio opens. Let Gradle finish syncing.
   - With his phone in developer mode and USB debugging on, choose it and press Run.
   - If the phone is older than Android 14 it needs "Health Connect by Android" from the Play Store.
6. Report any build error word for word.

== What Ashley checks on the phone (tell him) ==
- The app opens on the setup or his Home as on the website. If he's signed out, he signs in with his email on
  the setup screen ("Already have an account? Sign in").
- Profile > Personal TrAIner & app > "Steps from your phone" > "Use Apple Health" (or Health Connect). The phone's own
  permission sheet appears and offers STEPS ONLY. Allow it.
- Go back to Home: within a few seconds the steps ring shows today's count and "From Apple Health" under it. Compare
  with the Health app's own count for today.
- Walk a little, switch away and back to the app: the count goes up.
- On the website this row does not exist. That is correct.

== Done looks like ==
The app built and ran on his phone, the permission sheet asked for steps only, and Home's ring matched the Health app.
Report: which phone(s), the build result, and what Home showed against the Health app's count.
```
