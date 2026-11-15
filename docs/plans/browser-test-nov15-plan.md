# Fix plan: the browser tests of 15 Nov 2026 (Priya test profile)

All three Claude-in-Chrome reports in one plan. Each item says what I'd do, and where I'd do it differently from the
tester's suggestion and why. **Status**: DONE-BRANCH = fixed on the working branch (not live yet); FIX = clear right
answer, I build it; YOURS = your decision first; LATER = a bigger feature for you to prioritise.

Nothing here is built until you say so.

---

## Wave 0: before anything else
- Two checks went red on my own earlier fixes (235 of 237 passed). Both pin lines I rewrote; update them. FIX.

## Wave 1: safety and pregnancy (your rulings needed)

**A1 / A4. Pregnancy only lives in chat notes; the plan is still a fat-loss deficit.** YOURS (clinical band).
- Agree: saying "I'm pregnant" in chat or setup should OFFER to tick Pregnant (Apply / Not now), never set it
  silently. The three near-copy notes collapse into that one tick. FIX once you rule below.
- Your 14 Nov ruling was "exercise rules only: calories and food untouched". The test shows the cost: the app's
  own coach says weight loss isn't appropriate, while the plan runs a 363 kcal deficit.
- **My recommendation:** while Pregnant is ticked, no deficit. The target becomes maintenance, and the screen
  says "Check your calories with your midwife or GP". Fat loss is not offered until it's unticked. I would NOT add
  the extra pregnancy calories (+200-300 kcal later on). That number is a midwife's to give, not the app's.
- Built as ONE switch: the Pregnant tick drives the exercise rules, the calorie rule and the food rule together, so
  they can never disagree again (Gemini's review, 15 Nov, agreed). Muscle-growth surplus is also off while ticked.
- Options: (1) maintenance + midwife line (recommended); (2) keep the deficit but say so plainly on screen;
  (3) leave as ruled.

**A2. Weeks pregnant, and the plan's timeline.** YOURS.
- Agree the app should know how far along. I'd ask for the **due date**, not "weeks pregnant". Weeks go out of date
  in a week; a due date stays right and the app works out the weeks.
- Today every pregnancy is treated as past week 16, which is the safe side for the rules we have.
- Using the date to change exercise further on (lighter, shorter, fewer single-leg moves in the last trimester) is
  standard guidance, but it is pregnancy exercise prescription. I'd keep it to "past 28 weeks: effort capped one
  notch lower and no new heavier weights", and nothing more, unless you want to go further.
- Bug, FIX: after "Leave it as it is" the screen still says "I'll keep your sets short of all-out". Untrue when
  nothing was applied.

**A3. Pregnancy-safe foods.** YOURS (food safety). **I differ from the tester here.**
- Most of what it flagged is fine by NHS guidance: cooked ham, mozzarella and cheddar (pasteurised and hard),
  sardines and canned tuna (in limits).
- The real list is: pâté, liver, raw or undercooked meat and eggs, cold cured meats (salami, chorizo), mould-ripened
  and soft blue cheeses unless cooked, raw shellfish, shark/swordfish/marlin. Plus limits: tuna up to 4 cans a week,
  oily fish up to 2 portions a week.
- **Recommendation:** a "Pregnancy" food rule built from that list, switched on automatically with the tick. Hard
  bans are refused. The limits are watched across the week ("that's your 4th tin of tuna this week").

**A5. Sharp pain on an exercise: no Pause button.** YOURS (your 15 Sep ruling: that branch changes nothing).
- Recommend adding "Pause my plan" next to "Leave my plan as it is", as the chat already does.
- I'd NOT add "skip this exercise", because a sharp pain is a reason to stop, not to train around it.

**A6. No pelvis area, no "Other".** YOURS, partly.
- Add "Hips & pelvis" to the injuries list (it uses the hip rules we already have) and "Other (describe)", which goes
  through the same three-way pain question.
- Pelvic pain in pregnancy is a physio's job. The app should name that and change nothing beyond what "lasting"
  already does. That holds the line: the app is no rehab prescriber.

## Wave 2: the coach

- **B1. "Pause my plan for a week" got "have a great holiday" and nothing paused.** FIX. The coach has the pause
  tool and didn't use it. Add an app-side check: when you ask to pause and the coach replies without the card, the
  app adds the card itself. The same guard pattern stops it claiming any change it didn't make.
  - The "until" date is YOURS: your pause has no end date. I'd add an optional "back on" date that resumes on its
    own, with a message the day before.
- **B2. "Tomorrow is a rest day" when Monday has a session.** FIX. Trace what the coach is told about tomorrow
  (likely the same week-boundary mix-up as C4). Schedule answers come from the app's data, never the model's
  guess.
- **B3. "40 pizzas".** FIX: pizza goes in the food table with whole and slice sizes. An unknown food is asked about
  as a food ("what kind, or roughly how many calories?"), not as an amount. A huge count (over 10, or over 3,000
  kcal) is asked once, like odd reps.
- **B4. Same-day weigh-in replaced silently.** FIX: "Replaced this morning's 79.4 kg." Rounded to one decimal like
  the screen.
- **B5. Prompt-injection refusal.** Keep. An exam case already covers it.

## Wave 3: plan and program

- **C1. Week-2 text contradicts the numbers.** FIX. The sentence is built from the real change ("Same weight, reps
  up"). Agree with the tester.
- **C2. "Maximal Strength" block at 14-16 reps with 6 kg dumbbells.** FIX (training decision).
  - When the heaviest weight you own is reached, more reps is the wrong lever past about 15. Progress through
    slower tempo, pauses, single-leg versions, then an extra set.
  - The block is named for what it actually does at that kit. The wrong week blurb ("work capacity") is a bug.
  - The phase bar and block names must come from one source.
- **C3. "30-45 min" but Monday is ~46.** FIX. Trace whether it's the cap or the estimate rounding. Either way the
  number shown and the cap must agree.
- **C4. Week boundaries.** FIX.
  - The plan already starts on sign-up day (Sat 14). The calendar is right; the list was wrong (it counted from the
    Monday before). Fix the list.
  - **Small disagreement with the tester:** I'd also show the date beside each week in the list ("Week 1 · Sat 14
    Nov"), so a Saturday-start week never reads as a mistake.
- **C5. "1 of 1 done / WEEK COMPLETE" on a rest day.** FIX. I'd write "This week: 1 of 1 · next session Mon"
  rather than "Yesterday's session done": it's a week count, it should say so, and say what's next. In a part first
  week: "since you started".
- **C6. Every session "Full Body Power".** FIX. Names that say what the day is ("Full body A / B", or by focus),
  never "Power" for a beginner on 6 kg.
- **C7. Blank calendar for 3-5 s.** FIX: load it with the page (it's tiny).
- **C8. More goals (maintain, pregnancy & postnatal) and a target weight.** LATER / YOURS.
  - "Maintain" is a real gap, and it's what A1 needs anyway, so I'd build that one now if you choose A1 option 1.
  - "Pregnancy & postnatal" as a goal I'd fold into the Pregnant tick rather than make a separate goal.
  - A target weight and date is a feature for later.
- **C9. "Balanced" is 44% protein.** FIX, mostly naming.
  - 2.0 g per kg is within the evidence for fat loss, so the protein is right.
  - The label is wrong: a fixed protein target makes every split protein-heavy at low calories. Show grams per kg,
    and name the presets by what they change (carbs vs fat).
- **C10. "Shop Sunday" vs "Work it out for me".** FIX: one source of truth.

## Wave 4: nutrition

- **D1. "Freestyle this day" on a planned day.** FIX after a trace.
- **D2. The meal circle isn't a tick.** YOURS: recommend tap = I ate it, tap again = take it off with Undo. Also
  make "Logged · Take it off" look like a button.
- **D3. Adding a cola changed lunch.**
  - DONE-BRANCH: the note now says what changed.
  - **YOURS:** your 10 Oct ruling says an edited meal re-plans the rest of the day. For an ADDED food, I'd reverse
    that: keep the other dishes and resize them, like a swap does. Adding a drink should never change what's for
    lunch.
- **D4. Name after add-then-remove; cola as 100 g.**
  - DONE-BRANCH: cola is 1 can.
  - Name, FIX: removing the very food you added puts the meal back as it was (the same as Undo). It does not make
    a third copy with "+ cola without cola".
- **D5. Swap list empty for packaged food.** DONE-BRANCH: soft drinks now swap like for like. Extend to crisps,
  bars and sandwiches. FIX.
- **D6. "I don't like salmon": wrong meal, asked twice.** DONE-BRANCH.
- **D7. Rebuild lists unrelated changes.** FIX: a rebuild keeps every exercise still allowed and changes only what
  the limit touches. Agree with the tester.
- **D8. Raw dates.** DONE-BRANCH for the pause. FIX the rest: session history and anywhere else a stored date is
  printed, plus a check that no screen shows YYYY-MM-DD.
- **D9. Pause not shown on Home/Exercise.** DONE-BRANCH. The "eased" note only appears after 10+ days away, and
  the words now say so.
- **D10. Meals 375 kcal over target.** FIX after a trace. Partly D3's re-plan; if new plans themselves come out
  that far over, that's a generator defect.

## Wave 5: shopping

- **E1. List starts yesterday.** FIX: the list starts today. Past days drop off its count.
- **E2. "30 g milk", "5 g garlic", "40 g oil".** FIX: liquids in ml, garlic as cloves or a bulb, oil as a bottle
  you probably have ("check you have olive oil"), herbs as a pack.
- **E3. Near-duplicates.** **I differ:** light mozzarella and regular are different things to buy, so merging them
  would be wrong.
  - The real fix is upstream: the meal plan shouldn't use both in one week when one would do. Separately a FIX.
  - Egg weights that disagree are a bug, FIX. Bread moves to Bakery, FIX.
- **E4 / E5. Two counts (63 vs 64); "Rebuild" only opens the list.** FIX: one count, one date range, said on both
  screens. Button reads "Open the list". The rebuild stays your tap there (your ruling).
- **E6. Bar overlapping an open item on a short screen.** FIX.
- **E7. Junk accepted ("xqzv", "!!! ###").** FIX: must contain letters, 2-40 characters, and says why when refused.
  I wouldn't reject unknown words like "xqzv" outright: people buy things the app doesn't know. Letters-only is the
  honest check.

## Wave 6: settings and polish

- **F1. No account: clearing the browser loses everything.** LATER but **I'd rate it the biggest risk in the app**
  once anyone real uses it. Supabase can link the anonymous account to an email or Google/Apple sign-in without
  losing data. Worth its own plan next: a magic link (email, no password) and Google first, Apple later (Gemini's
  review, 15 Nov, agreed).
- **F2. kg/lb setting.** YOURS/LATER. Setup already has the toggles; one saved preference, used everywhere.
- **F3. Reminders on while "On this phone" is off; no "quiet until".** FIX:
  - Grey the switches out and say why.
  - Show "Quiet until Tue" after a red flag.
  - Holiday mode = the pause (B1).
- **F4. "TONE / Chat reveal speed".** FIX: "Typing speed".
- **F5. Glow highlight wrong on Daylight; preview numbers look real.** FIX: correct the highlight and label the card
  "Sample".
- **F6. Back button.** FIX: Profile and Program screens become routes, so phone Back closes them.
- **F7. Low contrast; day chips barely show.** FIX: measured to 4.5:1, and a selected chip gets a fill.
- **F8. Labels.**
  - "How do you feel about cardio?", the steps box cut off, and a 44px Listen button: FIX.
  - "Sedentary" next to 6,000 steps: FIX the wording to say the activity level is from your job, steps are on top
    (or merge them; trace first).
- **F9 / F10. "6 kg × 312" in history; typing 12 gave 212.**
  - The reps-box fix and the odd-reps question shipped this week, so I'll check whether this set came from before
    them.
  - FIX either way: edit and delete a set in history, labelled "1 set · 6 kg × 312 reps".
- **F11. Meals & shopping: no save feedback, chips show no selection.** FIX.

## Keep (don't regress)
Prompt-injection refusal, height/weight validation, like-vs-avoid conflict check, "Start a new plan?" warning,
chest-pain and bleeding replies, themes, timers, stopwatch pill, egg merging on the list, the Pregnant rebuild preview.

---

## What I need from you, in order (one at a time when we start)
1. A1: pregnancy calories (maintenance + midwife line recommended).
2. A3: the pregnancy food rule (NHS list, on with the tick).
3. A2: ask the due date (yes / no).
4. D3: an added food keeps the day's other meals (reverses 10 Oct for adds only).
5. D2: tap the circle to log.
6. A5: Pause on the sharp-pain screen.
7. B1: an optional "back on" date for a pause.
8. A6: hips & pelvis + "Other".
9. Later list: accounts (F1, my top pick), kg/lb (F2), goals and target weight (C8).

## Order of work once you've answered
Wave 0, then 1, then 2-6. Each fix gets a check that fails on the old code, screens are driven at phone size, and a
full sweep runs before anything goes to main. Deploys needed: the coach (`chat-gemini`) for A1, A4, B1-B4; a
database step for the due date (A2) and the pause "back on" date (B1).
