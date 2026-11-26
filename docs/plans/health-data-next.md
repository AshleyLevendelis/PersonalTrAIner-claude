# Health data: what to build next (for Ashley to evaluate, 26 Nov 2026)

Where it stands: the logic is well tested; nothing has run on a real watch. Confidence about 5 of 10 on his phone,
value about 6 of 10. Eight steps below, in the order recommended. Step 0 is built; the rest is not started.

Sizes: S is about half a day, M one to two days, L a week or more. "His machine" means it cannot be finished from a
cloud session.

## Step 0. A "Copy what my watch shared" button (S)

**BUILT 26 Nov 2026** (on the working branch; not merged, not on his phone). Profile, "Steps from your phone", last
section: "Check what your watch shares", Make the report, Copy the report. What to do with it is in
`docs/testing/watch-test-sheet.md` (B4).

- **What you get**: on Profile, one button that copies a short plain summary of what your phone's health store handed
  the app (how many workouts, heart readings a minute, whether sleep has stages, the last sync time). You paste it
  into the chat.
- **Why first**: when a test fails, a screenshot shows WHAT is wrong; this shows WHY. It can halve the fixing time.
- **Steps**: build the reader's summary; the button on Profile; checks; merge; phone rebuild.
- **From you**: nothing. It copies counts and times only, never the readings themselves.

## Step 1. Fix what the real-watch test finds (size unknown)

- **What you get**: the features working on your actual watch.
- **Steps**: you run `docs/testing/watch-test-sheet.md`; each "wrong" becomes a fix with its own check; one merge and
  one rebuild at the end, not one per fix.
- **From you**: the test reports.

## Step 2. Keep each workout's summary (M)

- **What you get**: tap any past run, walk or session and see its graph and zones again; and "same run as last week,
  6 beats lower" when you repeat a session.
- **Steps**: save a small picture of each workout (about sixty points and the zone minutes) when it is logged; a
  summary sheet opened from the day's log line and from session history; the like-for-like comparison.
- **From you, one decision**: save it to your account (follows you to a new phone; needs the database step on your
  machine) or keep it on this phone only (no database step; lost if the phone is). Recommended: your account.

## Step 3. One morning line from the coach (M)

- **What you get**: one sentence that joins sleep, resting heart rate and yesterday's training, and a suggestion when
  there is one ("Slept 7 h 40, resting heart rate normal, legs yesterday: good day to push the bench").
- **Steps**: one rule that reads the three together (the training science is mine, with the basis written down); the
  sentence in the day's first message; checks that it never contradicts the two offers already built.
- **From you, one decision**: every morning, or only when there is something worth saying. Recommended: only when
  there is something to say, so it never becomes noise. No score, as you ruled.

## Step 4. Steps that do something (M)

- **What you get**: a weekly steps trend on Home's Progress; and when a fortnight of real steps disagrees with the
  activity level you gave in setup, an offer to correct it (which moves your calories), with the numbers shown first.
- **Steps**: the weekly reader; the trend line; the rule for "disagrees" (mine); the offer on Home and from the coach.
- **From you**: nothing up front. Calories only ever move on your yes.

## Step 5. Your own top heart rate (S to M)

- **What you get**: zones based on YOU, not your age. Learned from your hardest sessions, or typed in if you know it.
- **Steps**: the learning rule (highest sustained reading over recent months, never a single spike); a row on Profile
  showing the figure and where it came from, with a box to type your own; zones and the "easy day ran hard" rule read it.
- **From you**: nothing.

## Step 6. Deeper run detail (M, uncertain)

- **What you get**: splits per kilometre, a pace graph, and how fast your heart rate comes down afterwards.
- **The catch**: it depends on Samsung sharing distance minute by minute, not just the total. Step 0's button answers
  that. If it shares totals only, splits and pace graphs are not possible without a watch app (step 7), and this step
  shrinks to heart rate recovery alone.
- **From you**: nothing until step 0 has run.

## Step 7. A watch app (L, his machine)

- **What you get**: start today's session from your wrist, see the rest timer and heart rate there, tick sets off.
- **Steps**: (a) a Wear OS app that starts and stops a recording and shows live heart rate; (b) today's session as a
  list with a tick per set; (c) the rest timer with a buzz. Each is its own release.
- **The catch**: it is a second app with its own store listing, it has to be built and tested in Android Studio on
  your machine with your watch in developer mode, and none of it can be proven from a cloud session.
- **From you**: a go-ahead after the rest is solid. Recommended last.

## Recommended order

0, then your test, then 1, 2, 3, 4, 5, 6, 7. Steps 0 to 5 can ship in two or three merges; 6 depends on what 0 shows;
7 is its own project.
