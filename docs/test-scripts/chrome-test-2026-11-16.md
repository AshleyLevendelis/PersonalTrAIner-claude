# Chrome test: the 14-16 Nov changes

Paste everything between the two lines below into Claude in Chrome. Before starting:
- The chat function must be deployed (the prompt from the last merge). If it isn't, the coach parts (C, D, E) will
  fail for that reason alone.
- Use a phone-sized window if you can (Chrome DevTools, device toolbar, about 390 x 844).

---

You are testing a fitness and meal-planning web app, Personal TrAIner, at
https://personal-tr-a-iner-claude-yco8.vercel.app (use exactly this address; a similar-looking address without
"-yco8" is a broken copy). The owner wants to know whether the features built on 14-16 Nov 2026 work as described,
and work well. You are the tester: follow each step, compare what happens with what SHOULD happen, and report. Do
not try to fix anything.

Ground rules:
- Use the account that is already signed in. If the app shows setup, complete it as: name "Chrome Test", male, 35,
  80 kg, 180 cm, goal build muscle, intermediate, full gym, 4 days a week, 60 minutes, no injuries, no diet, and
  answer anything else with the first sensible option.
- Before every step, take a screenshot. After every step, take another one.
- Wait for the coach to finish replying (the text stops growing) before judging a chat step. If something takes over
  30 seconds, note "slow" and the time.
- Note anything odd you notice even if no step asks about it: wrong numbers, cut-off text, buttons that do nothing,
  two copies of a message, text that contradicts another screen, errors.
- Undo any change a step makes when the step says so, so later steps start from a normal plan.

## A. Opening screens from the chat
The rule: a plain ask to open a screen is answered by the app itself, at once. The screen opens, and the chat keeps a
line like "Opened the plate calculator." with a button under it to open it again. The coach never gives directions
like "go to the Tools tab and tap...".

A1. In the chat, send "Open the plate calculator". EXPECT: the app moves to Tools and the plate calculator opens;
    back in the chat, ONE line "Opened the plate calculator." with an "Open the plate calculator" button. FAIL if the
    line appears twice, or the coach explains where to find it.
A2. Send "Open the calculator at 120kg". EXPECT: the plate calculator opens with 120 in Target Weight, and the plates
    shown add up to 120 with a 20 kg bar (50 kg a side). The chat line says "Opened the plate calculator at 120 kg."
A3. Go back to the chat, scroll up, and tap the button under the 120 kg line. EXPECT: it opens at 120 again, not 40.
A4. Reload the page, open the chat, and count the "Opened..." lines. EXPECT: each appears once (not doubled).
A5. Send "show me my session history". EXPECT: the session history opens on Tools.
A6. Send "take me to my shopping list". EXPECT: the shopping list page opens.
A7. Send "open my program". EXPECT: the full program opens.
A8. Send "open my profile". EXPECT: Profile opens.
A9. Send "How many plates do I need for 100kg?". EXPECT: the COACH answers (40 kg a side: two 20 kg plates) in
    words. It must not give tab directions.

## B. Shopping list from the chat
B1. Send "add eggs and spinach to my shopping list". EXPECT: both added, with a receipt in the chat.
B2. Send "take the spinach off my shopping list". EXPECT: a receipt saying spinach was taken off, with an Undo. Open
    the list: spinach is gone, eggs are still there.
B3. Tap Undo on that receipt. EXPECT: spinach is back on the list.
B4. Send "remove the eggs from my shopping list". EXPECT: eggs taken off. (Leave it.)

## C. A meal you like reaches the plan
C1. Send "I like having greek yoghurt with fruit and almonds for breakfast". EXPECT: it is saved as a like AND the app
    asks "Want it in your plan too?" with three buttons: put it in tomorrow's breakfast, have it every breakfast this
    week, and "Just remember it".
C2. Tap "Just remember it". EXPECT: "Noted. It's in your likes, and the plan stays as it is." No change to the plan.
C3. Send the same sentence again, then tap the "every breakfast this week" button. EXPECT: an offer with the meal's
    amounts, calories and protein, and a line naming the days ("every day from ... to ..."), with Apply and Not now.
    It may ask which Greek yoghurt (fat-free, low-fat or full-fat); if so, answer "low-fat". Note which fruit it chose.
    NOTHING changes until Apply.
C4. Before tapping Apply, open Nutrition and check tomorrow's breakfast: it should still be the old one. Then go back
    and tap Apply. Check Nutrition: tomorrow and each later day named should now show the yoghurt breakfast.
C5. Do the day totals still look sensible (calories near the target, not wildly over)? Note the numbers for tomorrow.
C6. In the chat, tap Undo on the receipt. EXPECT: every one of those breakfasts goes back to what it was before.
C7. Send "I usually have chicken, rice and broccoli for dinner". EXPECT: the offer has tomorrow's dinner and "Just
    remember it", but NO "every dinner this week" button (only breakfast and snacks offer every day). Tap "Just
    remember it".
C8. Send "I like eggs for breakfast" (one food). EXPECT: saved as a like, but NO offer to put a meal in the plan.

## D. Questions get an answer first, then the offer
D1. Send "Should I swap squats for leg press?". EXPECT: one or two lines answering yes or no and why, then the app's
    offer with Apply / Not now underneath. FAIL if there is only the offer and no answer, or the answer claims it has
    already swapped. Tap Not now.
D2. Send "Swap squats for leg press". EXPECT: straight to the offer, with no answer above it. Tap Not now.
D3. Send "How much should I have of chicken breast, rice and broccoli for lunch?". EXPECT: the app's own amounts
    (raw weights, with cooked weights beside), calories and protein against lunch's share, and an add button. The
    coach must not write its own grams. Tap Not now / decline.

## E. Advice that knows what's coming up
E1. Open Exercise and note what is planned tomorrow and what was done the last two days. Then in the chat send:
    "Should I do a hard 15k run tonight?". EXPECT: the answer takes the plan into account. If tomorrow (or yesterday)
    is a heavy leg day, it must say so by name and suggest a better option (shorter, easier, or another day). FAIL if
    it just says "go for it" with a heavy leg session tomorrow. Paste the reply in your report.
E2. Send "Can I skip legs today and do them tomorrow?". EXPECT: a reply that looks at what is on tomorrow, not a
    generic yes.

## F. Timers from the chat
F1. Send "give me a 10 minute skipping workout, 30 seconds on 30 off". EXPECT: the reply has a button like
    "10 × 30s, 30s rest · Start". Tap it. EXPECT: the round timer starts on Tools with those numbers.
    Stop the timer.
F2. Send "I want to time how long I can hold a plank". EXPECT: a "Start the stopwatch" button, which starts the
    stopwatch on Tools. Stop it.

## G. Exercise screen (15-16 Nov)
G1. Open Exercise. EXPECT: the day strip starts at TODAY and shows the next six days. The arrows (and a swipe) move
    seven days back or forward; "Today" comes back.
G2. Open the Week view. EXPECT: Monday to Sunday.
G3. Look at the main lifts across two different weeks of the program (Full Program). EXPECT: the same exercises week
    to week inside a block, rather than changing every week.

## H. Profile items (15 Nov)
H1. Profile, injuries: EXPECT "Hips & pelvis" and "Other (describe)" on the list. Don't save anything.
H2. Profile: find the plan pause. Pause the plan. EXPECT: Home and Exercise show no session due and nothing as
    missed. Then RESUME the plan straight away and check today's session is back.

## Report
End with:
1. A table: step | PASS / FAIL / PARTLY | one line on what happened.
2. Every FAIL in detail: what you did, what you expected, what you saw, screenshot names.
3. Anything odd you noticed outside the steps.
4. The coach's exact replies for D1, E1 and E2.

---

## Your own 10-minute phone check (after the Chrome run)

On your phone, not the computer:
1. Log two sets of today's first exercise and tick them. Did the boxes and buttons feel easy to hit?
2. Chat: "Open the calculator at 100kg". Did it open at 100?
3. Chat: say a breakfast you really eat ("I like having ... for breakfast"). Was the offer clear?
4. Nutrition: scroll the day strip. Do tomorrow's meals look like food you'd eat?
5. Ask the coach one real question you'd ask a trainer. Was the answer short and useful?
6. Anything slow, confusing or ugly: screenshot it and send it to me.
