<!-- Written from a read-only trace of the setup questions (an investigator agent, 14 Nov 2026), saved and checked by
the main session. Nothing here is built: it is his to choose. -->
# Shorter setup: proposal for Ashley (14 Nov 2026, NOT BUILT)

**Intro.** Setup asks about 22 questions. Some of them change the first plan a lot. Others only nudge a sentence in the meal writer or the coach's greeting. This proposal keeps everything a coach needs before prescribing (goal, experience, injuries, kit, days, time, food restrictions). It cuts or defers the rest. Nothing is removed from Profile, so every answer stays editable later.

| Question | What it changes | Proposal | Cost of the change |
|---|---|---|---|
| Name | Greeting only | LATER (ask at the end, or skip) | None |
| Main goal | Training and food (everything) | KEEP | n/a |
| Training experience | Training: sets, loads, exercise difficulty | KEEP | n/a |
| Daily activity | Food: calorie target (large effect) | KEEP in the light trim. Deeper trim: DEFAULT "moderate" | Calories could be about 15% off until the weight trend corrects them |
| Equipment | Training: the whole exercise pool | KEEP | n/a |
| Kit ticks (non-gym only) | Training: which home exercises appear | KEEP, it is one screen and pre-ticked | n/a |
| Start preference (beginners only) | Training: walking pathway or proper training | KEEP | n/a |
| Injuries | Training: safety filtering | KEEP (safety) | n/a |
| Know your lifts? | Training: skips the calibration week | LATER (the calibration week finds the weights) | One easy week instead of correct weights from day one |
| Squat / bench / deadlift numbers | Training: starting weights | LATER, same as above | Same |
| Training days | Training: the week's shape | KEEP, and ask together with session length | n/a |
| Session length | Training: sets per session | MERGE with days. Deeper trim: DEFAULT 45-60 | Wrong guess means over- or under-long sessions |
| Training style | Training: rep ranges, rest, exercise choice | Light trim: KEEP. Deeper trim: DEFAULT "mixed" and offer it in week 1 | Less tailored first week |
| Cardio feeling | Training: how much cardio is added | DEFAULT from the goal, LATER | Slightly more or less cardio than they like |
| Running goal (cardio lovers only) | Training: running ladder | LATER, the coach can offer it | None |
| Swimming/cycling (walking pathway only) | Training: swaps one walk a week | LATER | None |
| Recovery (sleep, stress, job) | Training: the whole block's volume, about 19% fewer sets at "low" | KEEP | A tired person gets too much work |
| Age / height / weight / sex | Food: calorie target | MERGE into one card (already grouped) | n/a |
| Meals per day | Food: how the day is split | DEFAULT 3, LATER | Wrong meal count until changed |
| Snacks | Food | DEFAULT off, LATER | Minor |
| Diet / allergies | Food: safety filter | KEEP (safety) | n/a |
| Foods to leave out | Food | MERGE into the diet question as "anything else to leave out" | n/a |
| Usual meals | Food: his own meals come first | LATER (Nutrition's "My meals" and the swap list already offer it) | First week less personal |
| Cooking time | A prompt sentence | DROP from the required flow (default "moderate") | Negligible |
| Cuisines, breakfast style | A prompt sentence | Already never blocking, so stop asking proactively | Negligible |

**Counts today.**
- Gym lifter (about 23 asks): name, goal, experience, activity, equipment, injuries, know-lifts, the lift card, days, length, style, cardio, recovery, age, height, weight, sex, meals, diet, leave-outs, usual meals, cooking, snacks. The running-goal question joins only if the person says they love cardio.
- Beginner from nothing (about 21-22): the same, minus the lift questions, plus the start preference. Add the swim/cycle question if they chose the walking pathway.

**Options.**
1. **Light trim.** Merge body numbers into one card (already grouped), days with length, and leave-outs with diet. Drop cooking, snacks and name from the flow. Move the lifts, running and usual meals to later. Gym lifter about 15, beginner about 15.
2. **Deeper trim.** Light trim, plus default activity, style, cardio and meals. Gym lifter about 11, beginner about 11. Plan accuracy drops a little, mostly food calories.
3. **Learn later.** Ask only the 9 essentials: goal, experience, equipment (and kit), injuries, days with length, recovery, body card, diet. Everything else comes as one question a day in the first week's chat. Gym lifter about 9 up front, beginner about 10. Most work to build, and it relies on the coach asking.

**Recommendation: Option 1,** with the lifts moved to "ask on the first session". It is the biggest saving with no safety or training cost a coach would object to.

---
**Evidence (read, not run).**
- Question list and requirement rules: onboarding-slots.ts:930-1042. The conditional asks are the lifts (willBeLiftingBarbells, :766-770), the start preference (needsStartPreferenceAnswer, :728), the running goal (lovesCardio, :717) and the swim/cycle question (choseThePathway, :705).
- Never-blocking list: onboarding-slots.ts:1223-1256. It covers snacks, name, cooking time, cuisines, breakfast, exercise dislikes, the dumbbell/kettlebell/bag ceilings, kit list, other sport and date of birth.
- Defaults when skipped: activity 'moderate', meals 3, cooking 'moderate' (:1380-1383).
- Skipped lifts: skip_calibration_week is true only with a number behind it (:1415).
- Body numbers: macro-calculator.ts:69-91 returns null targets without height, age or sex, so those four must stay as one card.
- Activity feeds calories at macro-calculator.ts:105 and :369.
- Recovery: the comment at onboarding-slots.ts:979-998 says "low" removes 213 sets, 19% of the block, and left it required.
- Style, duration and conditioning: the generator already falls back to 'hybrid' and '45-60' (exercise-plan.ts:3656-3658). Cardio frequency is at exercise-plan.ts:5458, and the metabolic-phase scaling by cardio preference is at :7635-7636.
- Cooking, cuisines and breakfast style only steer the meal-writer prompt (generate-meals/index.ts:301, :308).
- Pathway reads session length at pathway.ts:231.
- The setup coach already groups asks and caps follow-ups (onboarding-chat/index.ts:253-257, :269).

**Unverified.** I did not measure how much each question changes the plan. I assumed Profile edits all of these answers, from the code comments. The question counts are my own tally from the slot list and the conditional rules. They are not taken from a run.

**Rules that apply.** The "no live users" ruling means no transition messaging is needed for any of this. Option 3 needs `onboarding-chat` and `chat-gemini` deploys.

---
**Corrections and notes from the main session, 14 Nov 2026.**
- His ruling the same day on health conditions was "fold into injuries": no new question, so none of the counts above
  grows from it.
- "Breakfast style only steers a prompt sentence" stops being true with the Sal/Margaret fixes: on a two-meal day,
  "usually skip" now gives lunch and dinner. It still never blocks.
- The counts are a tally from the question list, not a measured walk. Before building any option, walk setup end to
  end for a gym lifter and a beginner and count the questions actually asked.
