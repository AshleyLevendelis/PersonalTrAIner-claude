

# Personal TrAIner — test log
 · 
Latest run: Run 2 · Friday 9 October is at the end of this page. 5 new High bugs, 7 Medium, 7 Low; nothing from run 1 is fixed yet because the build has not changed.

## Summary
One 45-minute pass as a brand-new user on the live site found 18 high-severity problems, 25 medium ones and a long tail of small ones. The plumbing mostly works; the plan the app builds, and the coach's ability to change it, are where it falls short of a real coach.
I tested by clicking through the real app in Chrome on Thursday 8 October, 21:50–22:35. The test user is "Sam": 34, male, 82 kg, 178 cm, fat loss, three years of training, sedentary job. He told the coach he owns adjustable dumbbells to 24 kg and a flat bench, with no barbell or pull-up bar. He trains Mon/Tue/Thu/Sat with a 40-minute hard stop, has a shoulder niggle and a tree-nut allergy, and eats no pork or mushrooms.
Fix these first, in this order:
- 
The plan ignores what the user owns. Sam got band exercises, a kettlebell prompt, a "Backpack Row" as his main back lift and a 24 kg kettlebell swing. Nothing in onboarding, the swap screen or chat can record "no bands" (H1–H3).
- 
A shoulder flag guts the programme. One chest exercise all week, and "Shoulders & Abs" day is a bodyweight leg day with no shoulder work. Removing the flag in Profile changes nothing (H4, H5).
- 
Calories are wrong where the user types food in. A chicken caesar wrap and a large latte logged as 187 kcal, and the coach defended the number when challenged (H6).
- 
Cardio logged in the Exercise tab disappears, and the coach loops on one canned line when asked to add it (H7, H8).
- 
Small actions change big things without asking. Adding a banana replaced dinner and the snack. A typo weigh-in of 62 kg cut the calorie target by 183 kcal. A knee adaptation rewrote a session already finished (H9–H11).
- 
The coach promises things the app doesn't store. "Pork stays off the menu" was said three times and saved as a chat-tone note that "never" affects the plan (H12).
Every bug below has an ID. Ones marked seen once happened a single time; the rest I saw at least twice or confirmed a second way.

## Decisions for you
Six of the fixes need a product ruling from you before Claude Code can build them. The last column is my recommendation.
| 
# | 
Decision | 
Options | 
I'd pick | 
| 
1 | 
How does a user say what kit they own? (H1–H3) | 
A: keep the four tiers. B: tier as a shortcut, then a tick-list of items (dumbbells, bench, bands, kettlebell, pull-up bar, weighted bag, barbell). | 
B. The tier is why Sam got bands and a backpack and lost his bench. | 
| 
2 | 
What does a shoulder flag remove? (H4) | 
A: all pressing, as now. B: ask one follow-up ("which movements?") and remove only those. C: add a severity level, "niggle" or "injury". | 
B, matching your ask-before-prescribing house style. | 
| 
3 | 
May one meal edit replace other meals that day? (H9) | 
A: yes, silently, as now. B: re-portion the other meals but keep the recipes. C: show the knock-on and ask. | 
B by default, C when a recipe must change. | 
| 
4 | 
How should a surprising weigh-in be handled? (H10) | 
A: accept anything from 25 to 350 kg, as now. B: confirm when it differs from the last one by more than about 3%. | 
B, and hold the calorie target until a second weigh-in agrees. | 
| 
5 | 
A user asks for a specific meal that doesn't fit the macros (H16) | 
A: refuse, as now. B: do it and show the cost ("dinner goes 80 kcal over, protein 12 g under"). | 
B. A coach says yes and shows the trade-off. | 
| 
6 | 
Off-topic questions during onboarding (M1) | 
A: answer in full, as it does now. B: defer with a reason, as you decided in August. | 
Your call. It currently contradicts the August decision. | 

## High severity
These 18 either give the user wrong information, lose what they entered, or leave them with no way forward.

### Equipment
H1 · The plan prescribes kit the user said he doesn't have
- 
Did: in onboarding typed "At home. Adjustable dumbbells up to 24kg each and a flat bench, no barbell or pull-up bar".
- 
Got: saved as "Equipment — Minimalist", whose own description says "no barbell or bench". Week 1 contains Standing Band Hip Abduction, Band Dislocates, Band Tricep Kickback and "Backpack Row ~20kg" as Tuesday's main lift. The Exercise tab asks "What is your heaviest kettlebell?". A dumbbell bench press is flagged "outside your minimalist equipment".
- 
Should: only prescribe what was named. Dumbbell Rows exists in the catalogue and was passed over for Backpack Row.
H2 · No screen lets the user say "I don't own that"
- 
Did: (a) typed 0 into the kettlebell prompt. (b) On a band exercise chose Swap → "I haven't got the kit" → Minimalist.
- 
Got: (a) "Give a number between 1 and 100kg"; the only way out is "I'm not sure". (b) Red text: "Everything in this week already works with that — nothing to change." The band exercise stays.
- 
Should: "I don't have one" on the prompt; the kit swap should remove that item of kit.
H3 · The coach can't fix it either
- 
Did: in chat, "My plan has band exercises and a backpack row, but I don't own bands, a kettlebell, a backpack or a pull-up bar. I only have dumbbells up to 24kg and a flat bench. Can you fix the plan?"
- 
Got: "I couldn't find that on your current plan — it may have changed since you last looked."
- 
Should: update the equipment record and propose the swaps.
H18 · The dumbbell limit is ignored when logging, then built on
- 
Did: logged Romanian Deadlifts at 30 kg per hand. Profile says heaviest dumbbell 24 kg.
- 
Got: no warning. Quick-pick chips offered "+2 · 32" and "+4 · 34". Home then said "Week 2 now starts Romanian Deadlifts from your 30kg set".
- 
Should: ask "new dumbbells?" and either raise the limit or cap the suggestion.

### Programme quality
H4 · A shoulder flag strips the week
- 
Did: ticked Shoulders at "anything that regularly flares up". No follow-up question came.
- 
Got: Monday Chest & Triceps is three exercises and 9 sets, labelled "~37 min". Saturday "Shoulders & Abs" is Bodyweight Squat Marches, Scapular Push-Ups, Tempo Air Squat (main lift), Single-Leg Glute Bridge, Low Box Step-Up and Plank. That is a second leg day 48 hours after Legs & Calves, with no shoulder work. Sets per day run 9, 11, 20, 19.
- 
Should: keep shoulder-friendly delt and chest work, rename a day that changes purpose, and fill each day to the time asked for. The coach agreed in chat: "the name 'Shoulders & Abs' is a glitch".
H5 · Removing the shoulder flag changes nothing
- 
Did: coach said "Once … we remove that injury, the plan will immediately bring back your full chest and shoulder volume". Turned Shoulders off in Profile.
- 
Got: no prompt, no message, and the whole-programme view is identical. The only route to a new plan is "Start a new plan…", which makes all history unreachable.
- 
Should: offer to rebuild from today, keeping history.

### Logging and numbers
H6 · Typed-in meals are logged about four times too low
- 
Did: in chat, "I had a chicken caesar wrap and a large latte for lunch today instead of what was planned, can you log that".
- 
Got: card "187 kcal (P 5.1g · C 30g · F 4.8g)", note "Assuming assumed standard chicken caesar wrap portion". A realistic figure is 700–800 kcal. When I said a wrap is about 550 on its own, the coach replied "a wrap at around 550 calories plus a large latte actually fits right into that slot's budget" of 594 and kept the 187.
- 
Should: a plausible estimate, and a correction when challenged.
H7 · Cardio logged in the Exercise tab vanishes
- 
Did: Add unplanned work → Cardio → Other → "skipping rope", 12 min, Steady → tick.
- 
Got: the panel closed. Nothing in the session, the Session complete summary, Session history or Home. The coach later said "it hasn't been written down yet".
- 
Should: appear under Additional work and in history.
H8 · The coach loops when asked to add cardio to a training day
- 
Did: "I also did 12 minutes of skipping rope after my workout tonight - did that get logged?"
- 
Got: "Thursday already has a session on it — do you want this instead of that one, or on a different day?" I answered "in addition", tapped "Yes, add it", and clarified again. The same sentence came back three times.
- 
Should: add it alongside the session.
H10 · A typo weigh-in rewrites the calorie target (seen once)
- 
Did: on Home entered 62 as today's weight, an hour after 81.2.
- 
Got: accepted. Target dropped at once from 1,689 to 1,506 kcal and the screen read "7-day avg 62 kg". Earlier, a single 81.2 weigh-in had already moved it from 1,697 to 1,689 with no notice.
- 
Should: confirm a 19 kg change, and follow the 7-day-average and 1 kg rule you set.

### Changes made without asking
H9 · Adding a banana replaced dinner and the snack (seen once)
- 
Did: lunch → Add food → 100 g banana → Add it.
- 
Got: dinner changed from Mexican Lime and Cilantro Chicken with Rice (455 kcal) to Italian Chicken Cacciatore with Penne (360), and the snack from Cottage Cheese and Crispbreads to Turkey and Cheese Roll-ups. The preview said only "The rest of the day re-fits around it".
- 
Should: say which meals will change and ask.
H11 · The 14-day knee adaptation is unsafe to trust
- 
Did: told the coach about a sharp pinch below the kneecap when lunging, then accepted its offer to ease off for two weeks.
- 
Got: rows in jumbled order. It rewrote Thursday week 1, which I had already finished, so the completed day now shows Spanish Squat where I logged Box Squat. Replacements need kit I don't own: Spanish Squat and Banded Terminal Knee Extension need a band, and "Kettlebell Swing (Heavy)" at ~24 kg replaced a Single-Leg Glute Bridge. Profile shows no sign the adaptation is active.
- 
Should: never touch a completed session, respect equipment, sort by date.
H12 · "I don't eat pork" was confirmed three times and never saved
- 
Did: "I'm allergic to tree nuts, and I don't eat pork". Later used "Change Foods to avoid" and typed "mushrooms and pork".
- 
Got: coach said "make sure pork stays off the menu", "nut-free, pork-free diet" and "no mushrooms, no pork". The summary still read "Foods to avoid: mushrooms". Profile filed it under Things it remembers: "Does not eat pork — Shapes how your Personal TrAIner talks to you — never your plan".
- 
Should: any stated food exclusion goes into Foods to avoid.
H13 · Onboarding over-promises on allergy
- 
Got: "We will absolutely keep your meals entirely tree-nut free" and "absolutely no tree nuts in your plan", directly above the app's own line that it can't check brands or cross-contamination.
- 
Should: use the honest wording the main chat already has ("tag-matching … not a lab check").

### Coach and screen out of step
H14 · Onboarding shows the wrong buttons for the question (seen once)
- 
Did: answered the recovery question in free text.
- 
Got: coach asked "how old are you, and what are your current height and weight?" above chips reading 2 meals / 3 meals / 4 meals. Two turns later the real meals question arrived with no chips.
H15 · Chat can't see a session the user moved
- 
Did: moved Monday's Chest & Triceps to Friday in the Exercise tab. Then in chat: "Swap the Band Tricep Kickback on my Chest & Triceps day for a dumbbell triceps exercise".
- 
Got: "Friday is a rest day — there's nothing on it to swap." Minutes later the coach's own text mentioned "your Friday session (moved from Monday)".
H16 · A simple meal request is refused
- 
Did: "Can you change tomorrow's dinner to salmon and cut the chicken down to once a day at most?" Chicken is in 13 of 14 lunches and dinners.
- 
Got: "I couldn't portion Mediterranean Lemon Herb Grilled Salmon to fit your dinner target without distorting it". The chicken request was ignored.
H17 · Travel week is applied to the wrong week
- 
Did: "I'm away with work all next week with no equipment, hotel room only" → chose 5 days.
- 
Got: a proposal for "the next 5 days" listing this week's sessions. Swaps included Dumbbell Floor Press → Backpack Row and Band Tricep Kickback → Box Squat, and it put Box Squat back over the knee adaptation applied five minutes earlier. I declined it.

## Medium severity
These 25 confuse or mislead but have a workaround.
| 
ID | 
Area | 
What I did | 
What happened | 
| 
M1 | 
Onboarding | 
Asked "what does creatine actually do, should I take it?" mid-flow | 
Answered in full. Your August decision was to defer with a reason. | 
| 
M2 | 
Onboarding | 
Took that detour, then was re-asked session length | 
Chips are not shown again. They stay on the older message, off screen. | 
| 
M3 | 
Onboarding | 
Reached the style question | 
"Combat / conditioning — Fight-ready fitness" is still offered. You decided to remove it. | 
| 
M4 | 
Onboarding | 
Tapped a row under "Tap anything above to change it" | 
Looks like nothing happens. The reply is inserted above the summary card, off screen, and stacks a duplicate per tap. | 
| 
M5 | 
Onboarding | 
Said "40 minutes tops, hard stop" | 
Stored as the 30–45 min bucket. The add-exercise warning treats 45 as the cap. | 
| 
M6 | 
Tour | 
Followed step 7, "Your turn — log a set" | 
It logs a real set into history and starts a session without Start workout being pressed. | 
| 
M7 | 
Exercise | 
Watched the "Session running" pill for 12 minutes | 
It read 0:00 throughout. | 
| 
M8 | 
Exercise | 
Swap → "I haven't got the kit" | 
Dialog overflows sideways with clipped cards and a scrollbar. After Back, the old red error is still showing. | 
| 
M9 | 
Exercise | 
"Anything feeling tight?" → Hips | 
Adds World's Greatest Stretch and Bodyweight Squat to Stand, both already in the warm-up. Says "do these first" but lists them last. Warm-up grows from 6 to 10 min. | 
| 
M10 | 
Exercise | 
Chose "Ban exercise" | 
Fires instantly. No confirm, no message, no undo. Deleting one set does ask. | 
| 
M11 | 
Exercise | 
Logged Box Squat set 1 at 22.5 kg, ticked set 2 blank | 
Set 2 saved as Bodyweight. Weight doesn't carry down. | 
| 
M12 | 
Exercise | 
Pressed Finish session at 9 of 24 sets | 
Ends at once with no check. Summary lists five "New PRs", all first-ever logs. | 
| 
M13 | 
Exercise | 
"Add an exercise" on leg day | 
Suggests Arm Circles and two band moves: "Your shoulders gets the least work in this session". | 
| 
M14 | 
Exercise | 
"I did something else instead": football, 60 min, Hard | 
Only a ⇄ glyph on the strip. The day card and programme view still show Back & Biceps. | 
| 
M15 | 
History | 
Opened Session history | 
"3 sessions" includes "swapped · 0m · 0kg · 0 sets" and "moved · 0m · 0kg · 0 sets". The real one is titled "Thursday". | 
| 
M16 | 
Home | 
Looked at Home half an hour after signing up | 
"2 days streak". After reload: "New PR this week: Standing Band Hip Abduction at 0kg". | 
| 
M17 | 
Nutrition | 
Swapped one ingredient, or added a food | 
The recipe method is deleted and replaced by "Swapped the blueberries. Your day has been re-fitted around it." | 
| 
M18 | 
Nutrition | 
Swapped a meal already logged | 
Card keeps the logged title and tick but shows the new meal's calories, ingredients and method. | 
| 
M19 | 
Nutrition | 
Read the prawn salad method | 
Uses "chilli flakes", which is not in the ingredient list. | 
| 
M20 | 
Nutrition | 
Checked the cacciatore numbers | 
"37g dry penne pasta" with 19 g carbs for the whole dish. Dry penne alone is about 27 g. Looks costed as cooked pasta. Needs checking in the food database. | 
| 
M21 | 
Nutrition | 
Tapped the favourite heart | 
No visible change. Console: "Couldn't save Italian Chicken Cacciatore with Penne as a favourite". | 
| 
M22 | 
Nutrition | 
Pressed Regenerate all | 
No confirm, about 20 seconds with a tiny spinner, and it overwrote my edited lunch. | 
| 
M23 | 
Grocery | 
Rebuilt the list | 
"white rice cooked ~650g", "pasta cooked ~300g", "rye crispbread ~5g". Recipe says oat flour, list says plain flour. | 
| 
M24 | 
Chat | 
Described knee pain | 
"I'll adjust your plan to ease off your knees" with no card until I asked again. It called tomorrow "leg work"; tomorrow is Chest & Triceps. | 
| 
M25 | 
Profile | 
Looked for the active knee adaptation and the banned exercise | 
The adaptation isn't shown anywhere. "Exercises to avoid" sits in the Nutrition section, labelled "won't eat/do Band Dislocates". | 

## Low severity and wording
Small things, grouped by where they show.
| 
ID | 
Where | 
Issue | 
| 
L1 | 
Onboarding | 
Confirmation ticks appear for typed answers (Name, Goal, Experience) but not for chip answers (Activity, Injuries, Days, Style, Cardio). | 
| 
L2 | 
Onboarding | 
Ticks carry no units: "Heaviest dumbbells — 24", "Height — 178", "Weight — 82". | 
| 
L3 | 
Onboarding | 
Wording: "Nut-free will be kept out of every meal", "type what you'd like foods to avoid to be instead", "pick a different equipment". | 
| 
L4 | 
Onboarding | 
Coach promised "a focused, high-intensity dumbbell circuit"; the engine has no circuits. Said "you know your way around a gym" to a home trainer. | 
| 
L5 | 
Onboarding | 
"3 meals and one snack" is ticked as "Meals a day — 3 meals". The plan did include the snack. | 
| 
L6 | 
Onboarding | 
Body-fat goal inferred but stated, not confirmed. Two near-identical goals were saved from one sentence. | 
| 
L7 | 
Tour | 
Step 2 says "Home shows; it never logs". Step 3 says water, steps and weigh-in "are logged right here". | 
| 
L8 | 
Home | 
Seconds after sign-up at 21:53: "You're about 1850ml behind on water for this time of day". | 
| 
L9 | 
Home | 
Session line reads "romanian deadlifts from 16 kg" in lower case, after I logged 30. Recent PRs lists three warm-up moves and neither loaded lift. | 
| 
L10 | 
Exercise | 
On desktop the number spinner covers the digits in Reps and Minutes. Enter doesn't log a set. | 
| 
L11 | 
Exercise | 
An "Add a drop" row can't be removed, and it stops a finished exercise collapsing. | 
| 
L12 | 
Exercise | 
Plate calculator with a 20 kg bar sits on every set row for a user with no barbell. | 
| 
L13 | 
Exercise | 
Focusing a field scrolls the page about 60 px, so the next tap lands on the row below. I logged the wrong set twice. | 
| 
L14 | 
Exercise | 
Cardio presets are Incline walk, Heavy bag, HIIT bike and Zone 2 for a home user. Minutes accepts up to 1,440. | 
| 
L15 | 
Exercise | 
Volume counts a per-hand load once: 30 kg per hand shows as 30, not 60. | 
| 
L16 | 
Exercise | 
"Rest complete — re…" is cut off, and stays up after the session is finished. | 
| 
L17 | 
Exercise | 
Header shows today's "~46 min" while another day is open. Programme view says warm-up "4 moves · ~6 min" when the tab says 7 and 10. | 
| 
L18 | 
Nutrition | 
Quantities nobody can measure: "1.3 tsp olive oil", "0.8 tsp olive oil", "119g liquid egg whites", "239g raw king prawns". | 
| 
L19 | 
Nutrition | 
Ingredient swaps match macros, not food: for blueberries in pancakes it offers "65g lime" and "80g avocado". | 
| 
L20 | 
Nutrition | 
"ON THE NUMBER" at 179 of 164 g protein, "MACROS OFF" at 181. Past days can't be opened. | 
| 
L21 | 
Chat | 
Coach bubbles are the accent colour and the user's are dark. Your September decision was the reverse. | 
| 
L22 | 
Chat | 
The input jumps 40 px when the session pill disappears. Weight saves straight away but water asks again after "log both". | 
| 
L23 | 
Chat | 
"When you're carrying that kind of weight", said to a fat-loss client who feels awful about himself. "This app is completely free" stated as fact. | 
| 
L24 | 
Everywhere | 
Dates switch between "2026-10-08" and "Oct 8, 2026". US spellings "Favorite cuisines" and "Cilantro" beside "Sulphite" and kg. | 
| 
L25 | 
Everywhere | 
The page shifts about 15 px sideways each time a dialog opens. | 
| 
L26 | 
Tools | 
Grocery list stays empty until Rebuild is pressed. Eggs are under Meat & Fish, butter under Dry Goods. Toast says "blueberries is in the trolley". | 

## What worked
These held up under deliberate attempts to break them, so fixes elsewhere should leave them alone.
- 
Allergy and avoid guards on every manual path. Walnuts, pesto and peanut butter were blocked for nut-free; bacon was flagged for pork. The week's meals contained no nuts, pork or mushrooms.
- 
Honest allergy answer in chat. "That's tag-matching against the ingredient list, not a lab check, so I can't call it verified nut-free."
- 
800 calories a day. The coach asked what was driving it, then refused to set the target and said why.
- 
Low mood. "This sounds heavier than just low motivation. What's been going on?" It asked before prescribing.
- 
No invented screens. Asked where to cancel a subscription and export data, it said neither exists.
- 
Off-topic. It declined the resignation email kindly and stayed in character.
- 
Moving a session. Monday to Friday in the Exercise tab and Saturday to Sunday in chat both gave a clear card and "won't count as missed".
- 
Input checks. Reps 1–999, steps up to 100,000 and weight 25–350 kg all gave friendly messages.
- 
Swap search. It warns "Needs barbell, bench — outside your minimalist equipment" and "Loads your shoulder — you've flagged an injury there".
- 
Saved data survived a reload.

## Not tested yet
Five areas are untouched, so a clean result here means nothing for them.
- 
Phone width. The browser window would not resize in this session. Everything above was seen at 1,321 px wide. You use the app on a phone, so this is the biggest gap.
- 
Anything that needs days to pass. Missed-session handling, streaks over a real week, week rollover, the weight trend, the 7-day calorie average, block changes and deloads.
- 
Accounts. I can't create accounts or type passwords, so the "Add an email" step and sign-in on a second device are untested. Sam's data lives only in this Chrome profile.
- 
Other kinds of user. One persona only. A full-gym user, a beginner, a woman, a vegetarian and a no-injury profile will each hit different paths.
- 
Smaller tools. Timers, voice input, the appearance themes, the classic questionnaire and weeks 2–16 of the programme.

## Claude Code prompts
Eight prompts, in the order I'd run them. Each starts report-only, matching your CLAUDE.md rule, so nothing is built until you say "build it". Lines that say "Ashley's ruling" or "Ruling" carry my recommended option from the decisions table, not a choice you have made. Change them before pasting if you decide differently.

### 1 · Equipment the user actually owns
Model: Opus · Effort: high. It crosses onboarding, profile, engine, swap and chat.
```
 "I haven't got the kit" > Minimalist returns "Everything in this week
  already works with that — nothing to change." and the band exercise stays.
- H3: chat message "I don't own bands, a kettlebell, a backpack or a pull-up bar.
  I only have dumbbells up to 24kg and a flat bench. Can you fix the plan?" returns
  "I couldn't find that on your current plan — it may have changed since you last
  looked."
- H18: logging 30 kg per hand with a 24 kg ceiling gives no warning, offers
  "+2 · 32" / "+4 · 34" chips, and Home says "Week 2 now starts Romanian Deadlifts
  from your 30kg set".

Ashley's ruling: tier stays as a shortcut, plus a per-item owned/not-owned list
(dumbbells, bench, bands, kettlebell, pull-up bar, weighted bag, barbell).

Report: where equipment is read at each stage (onboarding slot, profile, engine
filter, swap dialog, chat tools); the smallest schema change; how existing profiles
migrate; which gates need new cases. Flag every product choice for Ashley in plain
language with options. Do not push.]]>
```

### 2 · Injury filtering and under-filled days
Model: Opus · Effort: high. This is engine reasoning, and past fixes here took several rounds.
```

```

### 3 · Coach chat acting on the wrong plan state
Model: Opus · Effort: high. Tool and prompt logic in chat-gemini, which tsc doesn't check.
```
 "Thursday already has a session on it — do you want this instead
  of that one, or on a different day?" Returned verbatim three times, including
  after the user tapped "Yes, add it". There is no path to add work alongside a
  session.
- H15: after Monday's session was moved to Friday in the UI, a swap request on that
  session returned "Friday is a rest day — there's nothing on it to swap." The
  model's later prose knew about the move. Which tools read the base plan and
  ignore day moves?
- H17: "I'm away with work all next week with no equipment" produced a 5-day
  bodyweight proposal starting today, on this week's sessions. It swapped Dumbbell
  Floor Press -> Backpack Row and Band Tricep Kickback -> Box Squat, and re-added
  Box Squat over an active knee adaptation.
- H11: the 14-day knee adaptation card listed rows unsorted, included a session
  already completed today (its logged exercises are now replaced in the plan view),
  and proposed Spanish Squat, Banded Terminal Knee Extension and "Kettlebell Swing
  (Heavy)" for a user with no bands or kettlebell.
- M24: the coach said "I'll adjust your plan to ease off your knees for the next
  two weeks" without calling the proposal tool.

Report one root cause per item and whether they share a choke point, as the earlier
swap/ban/adaptation bugs did at applyReplacement. Propose a gate that would have
caught each.]]>
```

### 4 · Numbers the user can't trust
Model: Sonnet · Effort: high. Contained, but each needs tracing through the food database.
```

```

### 5 · Onboarding conversation
Model: Sonnet · Effort: medium.
```

```

### 6 · Exercise tab logging
Model: Sonnet · Effort: medium.
```
 Cardio > Other > "skipping rope", 12 min, Steady > tick.
  The panel closes and the entry appears nowhere. Is it saved?
- M6: tour step 7 logs a real set and starts a session.
- M7: the "Session running" pill stays at 0:00.
- M10: "Ban exercise" has no confirm, toast or undo.
- M11: weight entered on set 1 doesn't carry to set 2; a blank tick logs Bodyweight.
- M12: Finish session ends at 9 of 24 sets without asking. First-ever logs count as
  PRs, including a "PR … at 0kg" banner on Home.
- M9: "Anything feeling tight?" adds moves already in the warm-up and lists them
  last while saying "do these first".
- M13: "Add an exercise" on a leg day suggests shoulder primers because "Your
  shoulders gets the least work in this session".
- M14 and M15: "I did something else instead" and day moves show in Session history
  as "swapped" / "moved" with 0m · 0kg · 0 sets, and the day card shows nothing.
- M8: the kit-swap dialog overflows sideways and keeps a stale error after Back.
- Small: number spinner covers digits; drop-set row can't be removed; plate
  calculator shown with no barbell; focus scroll moves the tap target.]]>
```

### 7 · Nutrition tab
Model: Sonnet · Effort: medium.
```

```

### 8 · Wording and polish
Model: Haiku · Effort: low. Mechanical text and layout changes, no logic.
```

```

## Daily test routine
A daily pass should cover what one evening cannot: behaviour that depends on days passing. Each run uses the same test user in the same Chrome profile, adds new findings to this doc under a dated heading, and re-checks open bugs after each deploy.
| 
Day | 
Focus | 
What it checks | 
| 
Every day | 
Morning state | 
Greeting, streak, banners, water and calorie nudges, yesterday's totals, any console errors. | 
| 
Every day | 
One real day of use | 
Log two meals from the plan and one typed in chat, water, steps and a weigh-in. Ask the coach one plan question. | 
| 
Training days | 
A full session | 
Log every set with weights, use the rest timer, add cardio, finish, then compare Session history and Home. | 
| 
Rest days | 
Skipping and moving | 
Leave yesterday's session untouched and see how "missed" is shown and worded. Move or skip tomorrow's. | 
| 
Monday | 
Week rollover | 
New week's loads against last week's logs, the 30 kg deadlift carry-over, whether the knee adaptation and day moves expired correctly. | 
| 
Friday | 
Regression sweep | 
Re-run every High item in this doc and mark it fixed or still open. | 
| 
Once | 
Fresh users | 
Onboard three more personas: full gym with no injuries, a beginner on bodyweight, a vegetarian. | 

### State Sam was left in
- 
Updated after run 2, Friday 9 October, about 09:10.
- 
Week 1 of 16. Thursday's session finished at 9 of 24 sets. Friday's Chest & Triceps (Monday's session, moved) finished at 7 of 9 sets plus one added exercise and the 30-minute walk.
- 
Saturday's session is moved to Sunday; Tuesday was marked as football instead. Home shows tomorrow as Rest.
- 
A 14-day knee adaptation is active until 22 October.
- 
Shoulders flag has been off in Profile since Thursday 22:30. The plan still has not reacted.
- 
Banned: Band Dislocates, Band Tricep Kickback (replaced by Overhead Tricep Extension). Backpack Row swapped permanently for Dumbbell Rows.
- 
Pork added to Foods to avoid by hand.
- 
Logged Friday: planned breakfast 466 kcal, water 500 ml, steps 3,200, weight 81.0 kg. Calorie target 1,689.
- 
No email added, so all of this exists only in this browser.

## Run 2 · Friday 9 October
The app build is the same one as Thursday, so nothing from run 1 has been fixed yet and every run 1 bug is still open. This run covered the morning after an overnight rollover, a full training session, a day's logging and a handful of coach requests. It found 5 new High bugs, 7 Medium and 7 Low, and it changed what we know about several run 1 bugs.
One caveat on conditions: the browser tool I test through was slow all morning and the connection dropped for about ten minutes mid-session. I can't tell whether the drop came from the app's side or mine. The bugs below marked "connection" are about how the app behaves when that happens, which a real user in a gym with patchy signal will hit either way.

### New High bugs
- 
H19 · A moved session can't be edited from its own screen
- 
Did: opened Friday's Chest & Triceps (the screen says "This is Monday's session, moved here"), session timer running, and tried to take Band Tricep Kickback out.
- 
Got: "I'm short on time" → "There's no session on Friday to shorten." Then "Just get on with it" → "Drop it" → "Today only" → "I couldn't find that exercise on that day."
- 
Expected: the exercise comes out of the session I am looking at.
- 
Same root as H15. Every edit tool looks up the original day and ignores the move. I had to leave a band exercise I can't do sitting unfinished in the session.
- 
Recommend: fix once, at the place edits look up "which session is on this date", so the chat, swap, remove and shorten tools all see moves.
- 
H20 · After a connection drop, logged sets look like they were lost (connection)
- 
Did: logged 7 sets, then the connection dropped for about ten minutes.
- 
Got: Wall Slides showed "0 logged" and Floor Press "1 logged", for minutes, and still about 5 seconds after a full reload. A pill said "1 thing didn't save — tap to review", which opened "Didn't save · Dumbbell Floor Press · set 4 · TypeError: Failed to fetch".
- 
What was really true: nothing was lost. All sets reappeared later and Retry saved set 4. I believed 6 sets were gone until I traced it.
- 
Why High: a user who sees "0 logged" mid-workout will re-enter the sets, or stop trusting the app.
- 
Recommend: keep showing the sets the app already knows about while it reloads, show a plain "Reconnecting — your sets are safe" state, and replace the raw error text with words a person would use. The lilac labels on the pink error card are also close to unreadable.
- 
H21 · Cardio never reaches the session summary or history
- 
Did: logged the planned finisher, "Brisk Walk or Light Cycling · 30 min · Easy". The screen confirmed it with a tick and an Undo.
- 
Got: it is missing from the Session complete card and from Session history. The coach then told me it is "already logged under your conditioning as a solid Zone 2 session".
- 
This widens H7, which was unplanned cardio only. Planned cardio disappears from the record too.
- 
Recommend: one fix for both — cardio entries appear in the summary, the history and the weekly totals.
- 
H22 · The coach answers an older request instead of the question just asked
- 
"What did I do in today's session, and did the 30 minute walk count?" → a dinner swap card for salmon, quoting "change tomorrow's dinner to salmon", which was Thursday's request. The card also says it "becomes your dinner for today".
- 
"I didn't do the band kickbacks - I don't own a band. For breakfast I had 2 scrambled eggs on 2 slices of buttered toast and a black coffee. Log it please." → "I can't find Band Tricep Kickback in your breakfast. It has 200g non-fat Greek yoghurt…"
- 
"Log my breakfast: 2 scrambled eggs on 2 slices of buttered toast and a black coffee." → "Friday is a rest day — there's nothing on it to swap."
- 
Three in a row within ten minutes. Each time, the previous topic leaked into the next reply. Asking a second time, alone, worked.
- 
Recommend: an unfinished request should be dropped when the next message is clearly about something else, and a message with two requests in it should be handled as two.
- 
H23 · The coach reports work that was never done
- 
Asked what I did today. It listed "Band Tricep Kickback: 3 sets of 15-18 reps". I logged none; that is the exercise I couldn't remove.
- 
It is reading the plan, not the log. It got Wall Slides, Floor Press and the added skullcrushers right.
- 
Recommend: the session recap is built only from logged sets, and unlogged planned work is named as skipped.

### What run 2 changed about run 1 bugs
- 
H6 (typed meals logged far too low) — now seen twice, and there is a pattern. "2 scrambled eggs on 2 slices of buttered toast" came back as 266 kcal with 6.8 g protein. That is the toast and butter without the eggs; two eggs alone carry about 12 g of protein and the real meal is roughly 420 kcal. Thursday's "chicken caesar wrap and a large latte" came back as 187 kcal, about what the latte alone comes to. Both times the first item in the sentence looks to have been dropped. This is a guess from two results, not something I traced in code.
- 
H2 and H3 (no way to say "I don't own that") — behaviour changed, still not solved. "I don't own any resistance bands. Please take every band exercise out of my plan." now offers to ban one exercise, Band Tricep Kickback, from 8 sessions. Applying it worked and it was replaced by Overhead Tricep Extension. But Banded Terminal Knee Extension is still in week 2, Spanish Squat (which needs a band or strap behind the knees) is still there twice, and the equipment setting was not touched. The coach never said it was handling one exercise out of several.
- 
H4 and H5 (shoulder flag) — the app now says so itself. Week 2 Saturday, "Shoulders & Abs", carries this note: "Your current equipment and injury settings leave nothing eligible for an overhead press today — not a bug, just a real gap in what's available." The session is Bodyweight Squat Marches, Scapular Push-Ups, Spanish Squat, Kettlebell Swing (Heavy) 4×10–12 at about 24 kg, Low Box Step-Up and Plank. So it is a third leg day, two days after Legs & Calves, repeating two of Thursday's exercises, led by a kettlebell Sam doesn't own. The shoulder flag has been off since Thursday night and Sam owns dumbbells to 24 kg.
- 
H4 (time cap) — the minutes label doesn't add up. Week 2 Monday is labelled "9 sets · ~37 min". It contains a 6-minute warm-up, 9 sets, a 33-minute walk and an optional 14-minute mobility flow. Sam said 40 minutes, hard stop. Either the label leaves the walk out and the real session is over an hour, or the walk is in and the lifting is given 4 minutes.
- 
H10 (typo weigh-in) — cause found. There is a range check: 18 kg is refused with "Enter a weight between 25 and 350 kg". Thursday's 62 kg passed because it is inside that range. The missing check is against the last weigh-in.
- 
H18 (dumbbell ceiling) — the app contradicts itself. Thursday's message said week 2 starts Romanian Deadlifts "from your 30kg set". The week 2 programme shows about 24 kg per hand. Dumbbell Rows are also at 24 kg per hand in week 2, which is Sam's maximum with 14 weeks to go.
- 
H7 is widened by H21. H15 is widened by H19. M12, M15 and M16 were seen again.
- 
Correction to M7. "Session running · 0:00" only happens when a session is started by ticking a set without pressing Start workout. With Start workout the timer runs properly.
- 
Correction to one of my own notes. A swap that looked like it failed silently had shown a message, "That swap didn't save — check your connection and try again.", at the top of the page where I couldn't see it. See M29.

### New Medium bugs
- 
M26 · "Take out of this session" takes five steps and hides the real action. The option that removes the exercise sits behind "Just get on with it". "I'm wiped today" answers "Every exercise is already at its minimum." Red error text from one step stays on screen through the next. The question says "Just this week, or the rest of the block?" and the button says "Today only". Recommend: Remove → today or always → done.
- 
M27 · "I don't like it — and not again" has no "never again" option. It still asks Today only or Rest of block. It offered 3 alternatives for a triceps exercise, one of them another band exercise, and no dumbbell kickback or skullcrusher.
- 
M28 · "It hurts" leads to a dead end. Choosing "Sharp, one-sided or getting worse" gives a good see-a-physio message, but the only button is "Leave my plan as it is". It never asks where it hurts and can't skip the exercise for today.
- 
M29 · Error messages appear at the top of the page, out of sight. When scrolled down mid-session the user sees nothing happen. The message then follows from tab to tab until dismissed. Recommend: show it where the user tapped, or as a fixed toast.
- 
M30 · Session history is mislabelled. After two workouts it reads "5 sessions · 7 PRs". One entry is "moved · 2026-10-10", a future date. Friday's is titled "training · 2026-10-09" while Thursday's is "Thursday · 2026-10-08".
- 
M31 · Streak says "2 days" on both days. It read 2 after the first workout and 2 after the second.
- 
M32 · The replacement exercise starts very heavy. Overhead Tricep Extension is set at 3×16–19 at about 22 kg, near Sam's heaviest dumbbell, for a high-rep isolation move. The app had a logged 10 kg × 8 skullcrusher to go on. Worth a coach's eye rather than a certain bug.

### New Low bugs
- 
L27 · Exercise cards shift 8 px sideways and clip. After focusing a field the card title reads "3and Tricep Kickback" and stays that way.
- 
L28 · "Behind" before breakfast. At 8:30 the Nutrition tab says "Protein is behind — 162g to go" and then "Water is behind — 2000ml to go". Home shows an amber "no meals logged yet" at 07:01.
- 
L29 · Session summary counts. "80m · 710kg · 7/9": the 9 leaves out the exercise I added, and the 80 minutes includes the outage. Finishing at 7 of 9 again asked for no confirmation.
- 
L30 · Tempo text on the wrong kind of exercise. Kettlebell Swing and the timed Spanish Squat hold both show "2s down · drive up". Plank is "3×34-49s".
- 
L31 · "-0.2 kg since week 1". It measures from the first weigh-in, 81.2 kg, not the 82 kg given at sign-up.
- 
L32 · Small wording and keyboard slips. "Assuming assumed large eggs" on the meal card. "New PR this week: Standing Band Hip Abduction at 0kg." Tab from the weight field jumps to the plate calculator, not reps.
- 
L33 · Expired offers look almost the same as live ones. An Apply pressed late gets "This one's timed out — ask me again and I'll suggest it fresh." The wording is good; nothing on the card says beforehand that it expires.

### What worked
- 
The date rolled over correctly with the tab left open overnight.
- 
Add warm-up gives a ramp row marked "not counted", and the volume total was right with it excluded (630 + 80 = 710 kg).
- 
Weight chips ("same · 14 / +2 · 16 / +4 · 18") make logging quick.
- 
An unplanned lift appears under Additional work and logs properly.
- 
The retry queue recovered the set that failed to save.
- 
"Week 2 now starts Dumbbell Floor Press from your 18kg set — not the guess it was printed with." is the right behaviour and well worded.
- 
Logging a planned meal, water, steps and a weigh-in all worked first time, and the weight range check caught an 18 kg typo.
- 
Asked alone, the coach's session recap knew the session had been moved to Friday.

### Claude Code prompts from this run
Two new prompts, then lines to add to Thursday's.
Prompt 9 · Exercise tab when the connection drops — Sonnet, high effort
```

```

Prompt 10 · Coach chat carrying an old request into a new answer — Opus, high effort
```

```

Lines to add to Thursday's prompts:
- 
Prompt 1, Equipment (Opus, high): add the bands request above. "Take every band exercise out" banned one exercise and left Banded Terminal Knee Extension and Spanish Squat in week 2. Kettlebell Swing (Heavy) is still there too, with no kettlebell owned.
- 
Prompt 2, Injury filtering and under-filled days (Opus, high): add the week 2 Saturday note quoted under H4 and H5, and ask how the "~37 min" label is calculated and whether the finisher walk counts toward the time cap.
- 
Prompt 3, Coach chat acting on the wrong plan state (Opus, high): add H19. Prompt 10 covers H22 and H23 and can be merged into this one if you would rather run them together.
- 
Prompt 4, Numbers the user can't trust (Sonnet, high): add the eggs-on-toast result and the first-item-dropped pattern for H6; add a check of each weigh-in against the previous one for H10; add the 30 kg versus 24 kg contradiction for H18.
- 
Prompt 6, Exercise tab logging (Sonnet, medium): add H21, M26, M27, M28, M30, M31 and L29.
- 
Prompt 8, Wording and polish (Haiku, low): add L27, L28, L30, L31, L32 and L33.

### Still not tested
Phone width, the email and account step, a second persona, timers, voice and themes, weeks 2 to 16 in practice, a missed session, and the week rollover on Monday. Monday's run will cover the rollover and the missed-session wording.