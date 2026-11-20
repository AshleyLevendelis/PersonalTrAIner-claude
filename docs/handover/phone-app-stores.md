# Getting the phone app into the Play Store and the App Store (20 Nov 2026)

Ashley has a Mac and an Android phone. Both stores are wanted. This file is the order to do it in; the fenced blocks
are prompts to paste into Claude Code on the Mac.

## What is already done (cloud session)

- The app runs inside a native shell for Android and iPhone, reading steps from Health Connect / Apple Health
  (`docs/plans/phone-app.md`).
- Icon and launch-screen artwork: `assets/icon-only.png` (1024, square, no see-through corners: Apple rejects those),
  `assets/icon-foreground.png` + `assets/icon-background.png` (Android's shaped icons), `assets/splash*.png` (2732).
  Redrawn as vector by `scripts/make-phone-icons.cjs`. Cutting them into every size runs on the Mac (step 2 below).
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

## Order of work

1. Accounts started (they take days, so first).
2. Android on his phone (Mac + Android Studio), prompt below. Free, no account needed to run it on his own phone.
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

## Prompt 1: Android on his phone (paste into Claude Code on the Mac)

```
Goal: build the Personal TrAIner phone app for Android on this Mac and install it on Ashley's Android phone, so he can
check it opens, signs in and reads steps from Health Connect. Nothing goes to any store. Nothing changes the database.

WHY. A cloud session wrapped the web app in Capacitor 8 (folders android/, ios/, capacitor.config.ts) with one native
feature: Profile > "Steps from your phone" reads today's steps from Health Connect. It has never been built natively.
New icon and launch-screen artwork is in assets/ and has not been cut into Android's sizes yet.

1. Tools (install what is missing, say what you installed):
   - Android Studio (https://developer.android.com/studio), opened once so it installs the Android SDK.
   - Java 21 (Android Studio's bundled one is fine: export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home").
2. git fetch && git checkout claude/coach-empty-text-fix-2c4bzv && git pull
   ls capacitor.config.ts android/app/src/main/AndroidManifest.xml assets/icon-only.png src/lib/health-steps.ts
   npm ci
   npm run test:phone-app     (must end "The phone app asks for steps and nothing else, and says so everywhere it is asked.")
3. Check which database the build will use: grep VITE_SUPABASE_URL .env .env.local 2>/dev/null
   sdkhuczcfnqqimdgfiks = PRODUCTION (Ashley's real account). That is what he wants on his own phone. Do not edit .env.
4. Cut the icons and launch screen into every size:
   npx @capacitor/assets generate --iconBackgroundColor '#1A1636' --iconBackgroundColorDark '#1A1636' --splashBackgroundColor '#1A1636' --splashBackgroundColorDark '#1A1636'
   Report how many Android and iOS files it wrote.
5. npm run phone:sync   (builds the web app and copies it in; must list "@capgo/capacitor-health" for android)
6. Ashley turns on Developer options and USB debugging on his phone (Settings > About phone > tap Build number 7
   times; then Settings > System > Developer options > USB debugging) and plugs it in.
   npx cap run android     (pick his phone). If that fails, npx cap open android and press Run in Android Studio.
7. Report any build error word for word. Do not change the app id (app.personaltrainer.coach) without asking.

What Ashley checks on the phone:
- The app opens with the dumbbell launch screen and the new icon, then his Home (sign in with his email on the setup
  screen's "Already have an account? Sign in" if needed).
- Profile > Personal TrAIner & app > "Steps from your phone" > "Use Health Connect": the phone asks for STEPS ONLY.
- Home's steps ring fills with today's count and says "From Health Connect"; it matches the Health Connect app (or
  Google Fit / Samsung Health, whichever writes into it).
- Tools: the four timers, the countdown beeps at zero.

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
