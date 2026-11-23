# Getting the phone app into the Play Store and the App Store (20 Nov 2026)

Ashley has an Android phone and does the Android steps on a **Windows laptop** (his word, 20 Nov 2026); a Mac comes
later, for the App Store. Both stores are wanted. This file is the order to do it in; the fenced blocks are prompts to
paste into Claude Code (Prompt 1 and 3A on Windows, Prompt 2 and 3B on the Mac).

## What is already done (cloud session)

- The app runs inside a native shell for Android and iPhone, reading steps from Health Connect / Apple Health
  (`docs/plans/phone-app.md`).
- Icon and launch-screen artwork: `assets/icon-only.png` (1024, square, no see-through corners: Apple rejects those),
  `assets/icon-foreground.png` + `assets/icon-background.png` (Android's shaped icons), `assets/splash*.png` (2732).
  Redrawn as vector by `scripts/make-phone-icons.cjs`. Cutting them into every size runs on his machine (Prompt 1).
- A draft privacy page at `/privacy.html` (needs his contact line).

## Things only Ashley can do (accounts and money)

1. **Google Play Console**: one-off fee (US$25). Sign up at https://play.google.com/console with the Google account
   he wants to own the app. Identity check takes a few days.
   - A NEW personal account must run a **closed test with at least 12 testers for 14 days** before it can publish to
     everyone. Line up 12 people with Android phones (friends, family). An organisation account (needs a D-U-N-S
     number) skips this.
2. **Apple Developer Program**: yearly fee (US$99 / £79). https://developer.apple.com/programs/enroll . As an
   individual, his own name shows as the seller; as an organisation, the company's (needs a D-U-N-S number).
3. **Decisions** (the cloud session asks these one at a time): the app's permanent ID, the contact email for the
   privacy page and listings, the store name and short description.

## His decision, 20 Nov 2026: Google Play first, the App Store later

So the order below runs the Android half only; the iPhone steps (Prompt 2, the iPhone half of Prompt 3, Apple's
account) wait. Google's rule on AI-generated content needs a way to report a coach reply from inside the app: BUILT
20 Nov 2026 (his "1, build it"): a flag beside each coach reply, four reasons and a note, kept in the
`coach_reply_reports` table (its migration goes with the next database step). Reading the reports: Supabase dashboard,
Table editor, `coach_reply_reports`.

## Order of work (both stores, for reference)

1. Accounts started (they take days, so first).
2. Android on his phone (Windows laptop + Android Studio), prompt below. Free, no account needed to run it on his own phone.
3. iPhone in the Simulator on the Mac (Xcode), prompt below. Free; HealthKit works in the Simulator with made-up
   steps. A real iPhone is needed only for TestFlight testing; Apple's reviewers use their own.
4. Release builds: Android signed app bundle uploaded to the Play Console's closed test; iPhone archive uploaded to
   App Store Connect (TestFlight). Prompts written once the accounts exist.
5. Store listings: screenshots, descriptions, Google's Data safety form and Health Connect declaration, Apple's
   privacy labels. Drafted by the cloud session; Ashley pastes them in.

## Worth knowing

- **The phone app carries a copy of the website inside it.** A change to the website reaches the phone app only when
  a new version goes through the store (a day or two of review), unless a live-update service is added later. The
  website itself keeps updating as now.
- Apple rejects apps that are "just a website". This one has steps from Apple Health and works offline, which helps;
  native push notifications would help more (a later job).
- Apple requires accounts to be deletable inside the app: Profile, Your data, Delete all, already exists.

## Prompt 1: Android on his phone (paste into Claude Code on the Windows laptop)

```
Goal: build the Personal TrAIner phone app for Android on this Windows laptop and install it on Ashley's Android phone,
so he can check it opens, signs in, reads steps from Health Connect, and that the new "report this reply" flag shows on
coach replies. Nothing goes to any store. Nothing changes the database.

WHY. A cloud session wrapped the web app in Capacitor 8 (folders android/, ios/, capacitor.config.ts) with one native
feature: Profile > "Steps from your phone" reads today's steps from Health Connect. It has never been built natively.
New icon and launch-screen artwork is in assets/ and has not been cut into Android's sizes yet. This machine is
WINDOWS: use PowerShell syntax, not bash (no "export", no "~/"). The ios/ folder is not built here (that needs a Mac).

1. Tools (install what is missing, say what you installed):
   - Node 20 or newer (node -v), and Git.
   - Android Studio (https://developer.android.com/studio). Open it once and let the setup wizard install the Android
     SDK (default location %LOCALAPPDATA%\Android\Sdk).
   - Java: use Android Studio's bundled one. In PowerShell for this session:
       $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
       $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
       $env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
     (If Android Studio is installed elsewhere, find its "jbr" folder.) Check: java -version shows 21; adb version works.
     To make them permanent, set the same three in Windows' "Edit the system environment variables" > Environment
     Variables, then open a new terminal.
2. git fetch; git checkout claude/coach-empty-text-fix-2c4bzv; git pull
   Check these exist: capacitor.config.ts, android\app\src\main\AndroidManifest.xml, assets\icon-only.png,
   src\lib\health-steps.ts
   npm ci
   npm run test:phone-app     (must end "The phone app asks for steps and nothing else, and says so everywhere it is asked.")
3. Check which database the build will use: Select-String VITE_SUPABASE_URL .env, .env.local (whichever exist)
   sdkhuczcfnqqimdgfiks = PRODUCTION (Ashley's real account). That is what he wants on his own phone. Do not edit .env.
4. Cut the icons and launch screen into every size (one line):
   npx @capacitor/assets generate --android --iconBackgroundColor "#1A1636" --iconBackgroundColorDark "#1A1636" --splashBackgroundColor "#1A1636" --splashBackgroundColorDark "#1A1636"
   Report how many Android files it wrote. Then: git status, and commit the new android\app\src\main\res files on
   this branch with the message "Phone app: icon and launch screen cut into Android sizes" and push.
5. npm run phone:sync   (builds the web app and copies it in; must list "@capgo/capacitor-health" for android)
6. Ashley turns on Developer options and USB debugging on his phone (Settings > About phone > tap Build number 7
   times; then Settings > System > Developer options > USB debugging), plugs it into the laptop with a data cable, and
   taps "Allow" on the phone's "Allow USB debugging?" prompt. Check: adb devices lists it as "device" (not
   "unauthorized"). If it is not listed at all, Windows may need the phone maker's USB driver (Samsung: "Samsung
   Android USB Driver"; Pixel: Android Studio > SDK Manager > SDK Tools > "Google USB Driver").
   npx cap run android     (pick his phone). If that fails, npx cap open android and press Run in Android Studio.
7. Report any build error word for word. Do not change the app id (uk.co.personaltrainerapp) without asking.

What Ashley checks on the phone:
- The app opens with the launch screen and the new coach-bubble icon, then his Home (sign in with his email on the
  setup screen's "Already have an account? Sign in" if needed).
- Profile > Personal TrAIner & app > "Steps from your phone" > "Use Health Connect": the phone asks for STEPS ONLY.
- Home's steps ring fills with today's count and says "From Health Connect"; it matches the Health Connect app (or
  Google Fit / Samsung Health, whichever writes into it).
- Tools: the four timers, the countdown beeps at zero.
- Chat: a small flag beside each coach reply opens "Report this reply". (Sending one only works once the
  coach_reply_reports database step has been done; until then it says it couldn't send, which is expected.)

Done looks like: the app is on his phone, the permission asked for steps only, and Home's count matched. Report the
phone model and Android version, the build result, and what Home showed against the health app's count.
```

## Prompt 2: iPhone in the Simulator (paste into Claude Code on the Mac)

```
Goal: build the Personal TrAIner iPhone app on this Mac and run it in the iOS Simulator, to check it opens, signs in
and reads steps from Apple Health. Nothing goes to the App Store.

WHY. Same Capacitor shell as Android (ios/ folder). HealthKit is switched on in ios/App/App/App.entitlements and asks
for steps only. Ashley has no iPhone, so the Simulator is the test; it has its own Health app where steps can be added.

1. Tools: Xcode from the Mac App Store (opened once to install its extra components), then
   xcode-select --install   (if not already) and   sudo xcode-select -s /Applications/Xcode.app
   CocoaPods is NOT needed (Capacitor 8 uses Swift Package Manager).
2. git checkout claude/coach-empty-text-fix-2c4bzv && git pull; npm ci; if Prompt 1 step 4 has not been run on this checkout, run it now.
3. npm run phone:sync   (must list "@capgo/capacitor-health" for ios)
4. npx cap run ios   and pick an iPhone simulator (e.g. iPhone 16). If it fails, npx cap open ios, choose a
   simulator and press Run. Signing: for the Simulator no team is needed; if Xcode asks, pick "Personal Team" with
   Ashley's Apple ID.
5. In the Simulator: open the Health app > Browse > Activity > Steps > Add Data, add e.g. 4,000 steps for today.
6. Report any build error word for word.

What Ashley checks in the Simulator:
- The app opens with the new icon and launch screen, then setup or his Home (sign in with his email if needed).
- Profile > Personal TrAIner & app > "Steps from your phone" > "Use Apple Health": the sheet asks for Steps only.
- Home's steps ring shows 4,000 and "From Apple Health".

Done looks like: it ran in the Simulator and Home showed the steps added in the Health app.
```

## Prompt 3A: the Android release build (once the Play Console account exists; paste into Claude Code on Windows)

```
Goal: make the first Play Store build of Personal TrAIner: a signed Android app bundle (.aab) for the Play Console's
closed test. Do not publish anything to the public. This machine is WINDOWS: PowerShell syntax.

WHY. Prompt 1 proved the app runs. The Android build signs a release from android\keystore.properties if that file
exists (android\app\build.gradle); the key and that file are never committed (android\.gitignore). Listing text and
privacy answers are drafted in docs\store\listing.md.

1. git checkout main; git pull; npm ci; npm run test:phone-app; npm run phone:sync
   (JAVA_HOME and ANDROID_HOME set as in Prompt 1.)
2. ANDROID UPLOAD KEY (once, ever; keep the file and its passwords safe, e.g. in a password manager AND a second copy
   of the file somewhere off the laptop: losing it means asking Google to reset it):
   keytool -genkey -v -keystore "$env:USERPROFILE\personal-trainer-upload.jks" -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   Ashley types the passwords and his name himself. Then create android\keystore.properties containing (forward
   slashes in the path, even on Windows):
     storeFile=C:/Users/<his Windows user name>/personal-trainer-upload.jks
     storePassword=...
     keyAlias=upload
     keyPassword=...
   Check: git status must NOT list keystore.properties or the .jks.
3. cd android; .\gradlew.bat bundleRelease
   Report the path of android\app\build\outputs\bundle\release\app-release.aab and its size. Ashley uploads it in
   the Play Console: Testing > Closed testing > create release, and turns on Play App Signing when asked.
4. Before EACH later upload, raise android\app\build.gradle versionCode (+1) and versionName, commit, and report the
   numbers used.

Done looks like: the .aab path and size, and the version numbers.
```

## Prompt 3B: the iPhone build (later, on the Mac, once the Apple account exists)

```
Goal: upload the first iPhone build of Personal TrAIner to App Store Connect (TestFlight). Do not publish anything.

1. git checkout main && git pull && npm ci && npm run test:phone-app
   npx @capacitor/assets generate --ios --iconBackgroundColor '#1A1636' --splashBackgroundColor '#1A1636'
   npm run phone:sync
2. npx cap open ios. In Xcode: App target > Signing & Capabilities > Team = his paid developer team; HealthKit
   capability listed. Product > Archive, then Distribute App > App Store Connect > Upload. Report any error word for word.
3. Before EACH later upload, raise the Version / Build in Xcode. Report the numbers used.

Done looks like: "upload succeeded" from Xcode's organiser, with the version numbers.
```
