# Personal TrAIner — privacy policy (DRAFT, for Ashley to review)

Drafted 25 Nov 2026 from what the app's code actually stores and sends, on his "carry on with the rest of the list".
**Not legal advice and not live.** Before it goes in the app or the stores: fill every `[bracket]`, have it read by
someone qualified in UK data protection (the app handles health data, which is special category data under UK GDPR),
and check each sentence against the app on the day it is published. Every claim below is a claim about the app; if the
app changes, this changes.

---

## Who we are

Personal TrAIner is run by [name or business], [address]. Contact: [email]. We are the controller of the personal data
described here.

## What the app keeps, and why

| What | Examples | Why |
|---|---|---|
| Your account | email address, sign-in | so you can sign in on another phone and get your plan back |
| About you | name, date of birth, sex, height, weight, goal weight | to work out your calorie and protein targets and your plan |
| Health you tell us | injuries, what a doctor has said to watch, pregnancy and due date, allergies, an adrenaline pen | to keep exercises and foods you must avoid out of your plan, and so the coach knows |
| Training | your plan, sets, weights, reps, how hard a session felt, cardio, saved workouts | to show your progress and set your next weights |
| Food | meal plans, meals logged, likes and dislikes, shopping list, water, weigh-ins | to plan meals that hit your targets |
| From your phone (only if you switch it on) | steps; heart rate after a session and resting heart rate (Apple Health / Health Connect); live heart rate from a strap you pair by Bluetooth | shown back to you, and told to the coach; never used to set a target |
| Your chat with the coach | your messages and its replies; a running summary of what it should remember | so the coach can answer from your plan and remember what you told it |
| Reminders | whether you turned each one on, the phone's notification address | to send the reminders you chose |
| Reports you send | a coach reply you flagged, or a tester report (your note, a picture of the screen unless you untick it, the last things you did) | so problems can be found and fixed |
| Tester recording (only if you agree to help test) | screens opened, buttons tapped, what you type (never your password or email address), errors | so problems can be found without you having to describe them |

We do not collect your location. We do not sell your data, and the app shows no advertising.

## Who else handles it

- **Supabase** stores the data above. [Region: confirm in the Supabase dashboard.]
- **Google (Gemini)** receives your messages to the coach, with the parts of your plan, meals and logs the coach needs to
  answer, and writes the replies and new meals. A photo you send the coach is sent once to answer you and is not kept.
  [Check Google's terms for the API tier in use: whether inputs are used for training.]
- **Vercel** hosts the app.
- **Resend** sends emails: reports to us, and sign-in emails to you.
- **Google Firebase** (Android) and your browser's push service deliver reminders.
- Your phone's **Apple Health / Health Connect** provides steps and heart rate only when you switch them on, and only
  those.

## Your choices and rights

- Every setup answer can be changed on Profile.
- **Download my data** (Profile, Your data) gives you everything the app holds about you, as one file.
- **Delete everything** (Profile, Your data) removes your plan, meals, weigh-ins, logged sets, chat and reports. It
  cannot be undone.
- Phone data, reminders and tester recording each have their own switch, off until you turn them on.
- You can ask us at [email] to access, correct or delete your data, or object to how we use it, and you can complain to
  the Information Commissioner's Office (ico.org.uk).

## The legal basis [to be confirmed by the reviewer]

- Running your account and plan: providing the service you asked for.
- Health data (injuries, conditions, pregnancy, allergies, heart rate): your explicit consent, given when you enter it
  or switch it on, and withdrawn by removing it or switching it off.
- Tester recording: your consent, on Profile, Help test the app.

## How long we keep it

Until you delete it or your account. [Decide: a time limit for tester recording and reports, and for inactive
accounts.]

## Children

The app is not for anyone under [16]. [Confirm: setup does not currently check age at sign-up.]

## Medical note

The app and its coach give general fitness and nutrition guidance. They do not diagnose or treat anything. For pain,
a medical condition, pregnancy or an allergy, follow your doctor, midwife or pharmacist.

## Changes

We will update this page when the app changes what it keeps, and say so in the app.

Last updated: [date].

---

## For Ashley: what needs deciding before this goes live

1. Who the controller is (you personally or a business), the contact address, and the region the data is stored in.
2. Whether Google's terms for your Gemini key allow your users' messages to be used for training (this changes a
   sentence above).
3. How long tester recordings and reports are kept (currently: until deleted).
4. A minimum age, and whether setup should ask for it (it does not today: setup takes a date of birth but no gate).
5. A qualified review: health data plus an AI coach is the part a reviewer will look at hardest.
