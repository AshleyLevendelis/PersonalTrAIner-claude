# Whole-app test, 1 Nov 2026

Ashley: *"Run a comprehensive test in the entire app and look for issues."*

**How:** five testers used the real app at phone size (390 × 844, and 360 × 740 for the visual pass), tapping through every tab like a person and reading screenshots, while the full set of 455 automatic checks ran separately. All nine themes were checked. The coach's model was stubbed, so the chat's *screens* were tested, not its advice.

**Status:** findings are **leads, not facts** until each is fixed with its own check. Items marked *fixed* are proven in a browser and mutation-tested. Items marked *needs a trace* involve the plan generator and get traced before anyone changes them. Screenshots are in `.tour-harness/qa-*.png` on the machine that ran the test, and the testers' scripts are in that session's scratchpad (`qa/<area>/`).

---

## 1. Wrong numbers, lost data, or the app saying something untrue

| # | What you'd notice | Where | State |
|---|---|---|---|
| 1 | Tapping **Log steps** on an empty box wiped the day's steps to 0. The last count shows as a faint hint, which looks like a filled box. | Home → steps ring | **fixed**: `verify:home-steps`, 8 checks, 3 mutations |
| 2 | The chat box stayed one line when the app filled it ("Adjust today", "What changed?"), so the question was cut off. Today's earlier fix only covered typing. | Home → chat | **fixed**: `verify:chat-composer` §4, 2 mutations |
| 3 | **"Make it a rest day"** changes the week strip, but the session card still says "Start session" with the full workout. | Exercise → ⋯ → What happened? | confirmed in the code: the card ignores a chosen rest |
| 4 | **Moving an exercise** earlier or later quietly takes a set off a different exercise, and moving it back doesn't return it. Sets went from 20 to 19 with no message. | Exercise → ⋮ → Move | measured |
| 5 | **"Make it easier today"** applies at once with no preview or Undo. The card then says the session is short because of "your equipment" and points to a button that doesn't exist. | Exercise → What happened? | seen |
| 6 | After **finishing a session short**, the screen still says "Set 1 done. Set 2 next." and marks the main lift as NOW. | Exercise | seen |
| 7 | The **chat's session pill says "0 of 20 sets"** while Home and Exercise say 3. Exercise's own "This week" line also stays at 0 until you finish. | Chat, Exercise | seen |
| 8 | **Adding a food "for today"** changes that meal for the rest of the week, and shrinks tonight's dinner without saying so. | Nutrition → Add food | seen |
| 9 | **Moving lunch and dinner** changed the snack to a different dish while the line said "Same dishes". The total also moved by a different amount than the card promised. | Nutrition → Move | seen |
| 10 | The **swap sheet names a dinner change that never happens**: "Salmon pasta is now Salmon and potatoes". | Nutrition → Swap | seen |
| 11 | **Changing an ingredient amount** silently changes tonight's dinner to a different dish. The receipt only says "Changed the egg." | Nutrition → food row | seen |
| 12 | After you log a meal, the **"the rest of the day fits around it" line can be wrong**. It says "0% smaller" when nothing changed, and "18% bigger" when dinner actually got smaller. | Nutrition → I ate this | seen |
| 13 | A **day swap can put the same dish on one day twice**: lunch, and the same lunch as dinner. | Nutrition → Move to another day | seen |
| 14 | The coach greets a **9-day-old plan as brand new**: "welcome aboard … Day one is today". | Chat, first open | seen |
| 15 | Home says **"you're ahead of your usual pace"** when two sessions this week were missed. | Home coach line | seen |
| 16 | When the coach crashes, the **raw developer error** appears in the chat bubble ("Cannot read properties of undefined"). | Chat | confirmed in the code |
| 17 | A coach offer to **swap Thursday's exercise is labelled "Just today"**, and it changes Thursday. | Chat | seen (stubbed offer) |
| 18 | The **plate calculator assumes a 20 kg barbell** for everything. It tells you a 10 kg EZ-bar curl is "lighter than the bar", and splits a T-bar row (loaded on one end) "per side". | Exercise → plates | EZ bar seen; T-bar suspected |
| 19 | A **knee-rehab drill (Seated Short-Arc Quad Set) appeared on an upper-body day** after a knee injury was added, and even after switching to home gym with no injury. Your 20 Oct ruling says no knee-rehab move goes on a non-leg day. | Profile → rebuild | **needs a trace** (safety-adjacent) |
| 20 | **The same lift gets two very different weights.** Swapping to Dumbbell Shrugs prescribes ~26 kg per hand; the plan's own Dumbbell Shrugs for the same person are ~12 kg. | Exercise → swap | **needs a trace** |
| 21 | **"+ Add exercise" suggestions don't fit the day**: Bird Dog, Elliptical and Skater Bounds on an upper-pull day, "for your glutes". | Exercise → + Add | seen |
| 22 | The ban sheet says "the session you've already done keeps it" when you never did a session with that exercise. | Exercise → ban | suspected |

## 2. Controls that don't work, or leave you stuck

| # | What you'd notice | Where |
|---|---|---|
| 23 | In the **full-screen round timer**, the "leave full screen" button sits under the settings gear, so tapping it opens Profile. | Tools → Round timer |
| 24 | Saying **"Leave it as it is"** to a rebuild offer closes all of Profile and drops you on Home. | Profile |
| 25 | The **running-timer chip** at the bottom does nothing when tapped, except on Exercise. On Tools it's the only sign a timer is running. | Home, Nutrition, Tools |
| 26 | **Sending a message doesn't scroll to it** if you'd scrolled up, or after a long reply. | Chat |
| 27 | **Appearance opens scrolled halfway down**, with its title and back button off screen. | Profile → Appearance |
| 28 | **"Starting from"** is an empty dropdown for anyone setup never asked. | Profile → Goal |
| 29 | **Rebuilding from Profile** says nothing afterwards, even though the plan changed. | Profile |
| 30 | If the setup coach fails after you tap an answer, it says "say that again" (you didn't say anything), offers no retry, and the next question never appears. | Setup |
| 31 | On failure the chat shows **two identical "tap to retry" controls** and tells you to tap "Retry", which nothing is called. | Chat |

## 3. Hard to read, or too small to tap

- **The allergy line on Nutrition and the grocery list** ("Ingredients are filtered, not verified. Check labels if you have an allergy.") is the faintest text on the tab, in all nine themes. It's safety wording, so it's first in this group.
- **Exercise week strip:** rest days' letters, and today's own letter once another day is selected, almost disappear (1.4–1.8 contrast) in every theme.
- **Small print** across Profile, the grocery list and the program page is below readable contrast in every theme. In the light themes, "Get more options", "Delete everything" and "Start a new plan" are especially faint. Frost is just under the line almost everywhere.
- **Tap sizes below 44px:**
  - every ⋮ / ⋯ menu item is 32px;
  - Profile's boxes, dropdowns and day chips are 28px;
  - the What-happened, remove and ban options are 36px;
  - the rest timer's −30s / +30s / Skip are 28px;
  - the bodyweight toggle is 28px;
  - the "Why this weight" ⓘ is 10px;
  - the water buttons are 40px;
  - the program page's links are 16–18px;
  - the steps box and the weigh-in Save are 20–28px.
- **At 360px wide** (smaller phones):
  - "How your targets are set" runs its labels together ("HYPERTROPHYTARGET");
  - the water ring reads "0.0…";
  - the Progress line, the chat header and the program block names are cut off.
- **Meal cards show internal labels as chips**: "own recipe" and "user-requested".
- **Plate colours** on the plate calculator are hard to read (white on light green or grey).

## 4. Wording and small things

- The Appearance preview says **"12 day streak"**. Your ruling is "12 in a row".
- The Undo receipt reads "Put back · Undone Swapped was taken back."
- The timer says "All 1 intervals done".
- A 10-second round is logged as 1 minute and can be counted as the whole workout.
- Lap times show the running total instead of the lap.
- The **grocery list** shows milk in grams ("milk whole 600g"), adds a second milk row, shows "1000ml" rather than 1 L, "egg 2 whole" and "watermelon 0.5 whole". Its hero shows "7 days" beside a list built from 2.
- A day can name **two misses at once** ("fat 11 g under" and "87 kcal under").
- Removing spinach is blamed for a protein gap that was already there.
- The planned-macros line is 1 g off the sum of the cards (rounding).
- On Exercise:
  - the program says 18 sets while today says 20;
  - "Add set" shows "Working 2/3" with 4 rows;
  - bodyweight rows show "0" in the weight box;
  - the cardio session's rows have a "Weight" box.
- On Home:
  - "Rest day" appears on a day the plan calls active recovery;
  - "Adjust today" is offered on a rest day;
  - the weigh-in shows 79.5 in one place and 79.55 in another;
  - the change since start has no unit.
- Profile's back button says "‹ Dashboard", but the tab is called Home.
- Setup's counter changes from "of 17" to "of 18".

## Checked and fine

- Calories left agree on Home, Nutrition and the chat, before and after logging.
- The week strips agree between Home and Exercise.
- A surprising weigh-in is asked about, and the target holds.
- Day-swap Undo and grocery tick/Undo work.
- Cooked hints show beside raw and dry amounts.
- Nothing scrolls sideways on any screen or sheet at 390 or 360px.
- Nothing fixed covers content at the bottom of a scroll.
- No uncaught errors anywhere.
- Voice typing and the growing chat box (today's fix) pass.

## Harness-only (not the app, so nobody re-investigates)

- The chat's "Sun 1 Nov" times, and Tools "Week 8 · deload", come from the test page mixing the real date with its fixed date. On a phone the two agree. Tools does read the machine clock rather than the app's date (`App.tsx:3359`), which only matters under the developer date override.
- The email prompt on every open comes from the test page's anonymous user.
- The rest timer freezing is the test page's pinned clock.
- The stock test meals sit about 1,000 kcal under target, so the meal tests used a patched fixture with more dishes.

## Not reached

- A real phone keyboard and real speech.
- The coach's actual advice.
- A personal-best state.
- Drop sets and supersets while logging.
- Reminders, data download and delete, and a full setup run.
- A successful "Get more options" (the meal writer is offline here).
