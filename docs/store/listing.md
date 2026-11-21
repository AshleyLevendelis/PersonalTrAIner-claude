# Store listing and privacy forms: DRAFT (20 Nov 2026)

Everything here is a draft for Ashley to approve before it is pasted into the Play Console and App Store Connect.
Each answer describes what the app does today; when the app changes, these change with it.

## Names and short text

| Field | Limit | Draft |
|---|---|---|
| App name (both stores) | 30 | Personal TrAIner |
| Apple subtitle | 30 | AI coach for training & meals |
| Google short description | 80 | Your training plan, your meals, and a coach that knows both. |
| Apple keywords | 100, commas | workout,gym,meal plan,macros,personal trainer,strength,coach,nutrition,fitness,calories |
| Category | | Health & Fitness |

## Full description (both stores; Google allows 4,000 characters, Apple 4,000)

Personal TrAIner builds your training plan and your meals around you, and gives you a coach you can text.

YOUR TRAINING PLAN
- Built from your goal, experience, equipment, injuries, the days you have and how long you can train.
- Blocks, phases and lighter weeks, with a weight for every lift and rest that suits the exercise.
- Log your sets in the gym, even with no signal. The weights move up as you get stronger.
- Swap, move, add or remove any exercise, and the plan keeps its balance.

YOUR MEALS
- Meals sized to your calories and protein, from real foods, with a shopping list.
- Your likes, dislikes, diet and allergies are taken into account.
- Swap a meal, eat out, log what you ate, and the rest of the day adjusts.

YOUR COACH
- Ask anything about training or food, any time, and get an answer about YOUR plan.
- Ask the coach to change things, and it shows you the change before anything happens.

TOOLS
- Round timer for Tabata, EMOM and intervals, a countdown timer, a stopwatch and a plate calculator.
- Steps from Apple Health or Health Connect, if you allow it.

Personal TrAIner gives general fitness and nutrition guidance. It does not diagnose or treat anything. For pain, an
injury, a medical condition or pregnancy, talk to a doctor, physio or midwife.

## Google Play pictures (made 20 Nov 2026)

In `docs/store/play/`, made by `node scripts/make-store-assets.cjs` (after building the test pages):
`icon-512.png` (store icon), `feature-graphic.png` (1024 x 500 banner), `screenshot-1..5.png` (1080 x 1920: Home,
Exercise, the coach, Nutrition, Tools). The screens are the app's own, showing the test pages' made-up "Sam".

## Apple: App Privacy ("nutrition labels")

Data used to track you: **none**. Every item below is **linked to the user** and used for **App Functionality** only
(no advertising, no analytics sold or shared).

| Apple category | What the app keeps |
|---|---|
| Health & Fitness: Health | weight, height, injuries and conditions told to the app, allergies, pregnancy tick |
| Health & Fitness: Fitness | workouts and sets logged, steps (from Apple Health if allowed), meals and water |
| Contact Info: Email Address | only if saved on Profile (Account) |
| User Content: Other User Content | messages to the coach |
| Identifiers: User ID | the account's own id |

Photos sent to the coach are read once and not stored, so they are not "collected" in Apple's sense; say so in the
review notes.

## Google: Data safety form

- Does the app collect or share user data? **Yes, collects. Does not share** (Google's Gemini service processes coach
  messages on our behalf, which Google's form counts as a service provider, not sharing).
- Encrypted in transit: **Yes**. Can users ask for data to be deleted: **Yes** (Profile, Your data, Delete all).
- Data types collected, all **required for app functionality**, none optional except where marked:
  - Personal info: Email address (optional)
  - Health and fitness: Health info; Fitness info (steps optional)
  - Messages: Other in-app messages (the coach chat)
  - App activity: Other user-generated content (logged sets and meals, and a coach reply he chooses to report)
- **AI-generated content** (Google's policy): the coach's replies are written by AI. Each one has a flag that reports
  it from inside the app (reason + optional note, kept for review). Say so in the Play Console's content questions.

## Google: Health Connect declaration

- Permission: **Steps (read)** only.
- Why: "Shows the user's daily step count on their Home screen and lets the coach take today's activity into account
  when it gives training and nutrition advice. Steps are read only when the user switches it on in Profile."
- Privacy policy link: https://personal-tr-a-iner-claude-yco8.vercel.app/privacy.html

## Apple: notes for the reviewer

"No sign-in is needed: the app creates an account on first open. Answer the setup questions (about two minutes) to
reach the plan. To see Apple Health: Profile > Personal TrAIner & app > Steps from your phone. The coach is on the
middle tab. Photos sent to the coach are read once to answer and are not stored."

## Open for Ashley

0. DECIDED 20 Nov 2026: the app ID stays `app.personaltrainer.coach` (his choice; permanent after the first upload).

1. DECIDED 20 Nov 2026: the public contact email is ashleylevendelis@gmail.com (his choice; on the privacy page and both listings).
2. **Apple's rule on AI (guideline 5.1.2)**: an app must say clearly when personal data is sent to a third-party AI and
   get the person's permission first. The coach sends your plan, logs and profile to Google's Gemini to write each
   reply. The privacy page says so, but the app never asks. Before the App Store submission the app needs a one-time
   "the coach uses Google's Gemini; this is what it sees" screen with an OK, before the first chat. Wording is his.
3. Screenshots: the cloud session can make them from the app at each store's sizes once the wording above is settled.
