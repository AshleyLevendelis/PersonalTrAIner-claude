# Onboarding live test, 14 Nov 2026: Sal and Margaret — traced

Ashley ran two full chat onboardings on the live app ("Sal", "Margaret") and listed 22 problems; the 9 highest were
traced to root cause, READ-ONLY, before any fix (four investigators plus my own checks). Nothing below is built. Each
"confirmed" was read in the code and, where marked, run; each "inferred" needs his saved rows (TEST/PROD, which this
cloud session cannot reach) to settle.

Two findings change the picture from the report:
- **Defects 1, 2 and 8 are one bug.** "Start a new plan" resets the app in place and leaves the OLD profile's weight
  anchor, its "targets moved" message and two internal markers behind. Margaret's numbers were Sal's-era weight (80 kg)
  run through Margaret's age and height. Storage keys are not the leak.
- **Defect 5 is a label, not a selection.** Clamshell is a bodyweight exercise that may use a band; it was picked
  correctly and then printed as "Band" by a label that never looks at the person's kit.

---

## Group A — "Start a new plan" carries the old profile's state (defects 1, 2, 8)

### 1. Invented nutrition numbers when weight is refused — CONFIRMED
- **Root cause:** `src/App.tsx` macro effect, line 919: `computeTargets(profile, { latestWeightKg: targetWeightAnchorKg ?? profile.weight_kg })`.
  `effectiveProfile` (`src/lib/nutrition-targets.ts:41`) swaps that weight in BEFORE the null check, so the
  "no weight → no targets" rule in `macro-calculator.ts:83` never sees Margaret's missing weight.
- **Why the anchor was stale:** `handleReset` (`App.tsx:2928-2998`) clears `macros` and `latestWeightKg` but NOT
  `targetWeightAnchorKg`, `adaptationMessages`, `anchorUnknownRef` or `lastMacroInputsRef` (checked by grep: none are
  touched in that range).
- **Arithmetic check:** 62F, 160 cm, 80 kg, sedentary, no deficit → about 1,595 kcal; protein 2.0 × 80 = 160 g; fat
  0.6 × 80 = 48 g; carbs 131 g. Matches her screen exactly. Sal's notice "protein 167 → 160" is 2.0 × 83.5 → 2.0 × 80,
  so the stale anchor was **80 kg**.
- **Worse than a display:** `snapshotTargetsIfChanged` (`App.tsx:958`) SAVED the invented targets to
  `daily_nutrition_targets` under Margaret's id, with `calculated_weight_kg = 80`. Her first real weigh-in would
  compare against 80 kg (inferred).
- **Fix:** (a) `handleReset` clears every per-profile piece of state and ref (list in Group A fix); (b) the macro
  effect only uses an anchor that belongs to the current profile; (c) `effectiveProfile` never substitutes a weight
  for a profile that has none (the absence rule holds at the source, not only at the caller); (d) a one-off cleanup of
  any saved target row whose weight does not belong to its profile is NOT proposed (no live users; his "fix it and let
  the new value stand").
- **Risk:** the macro effect drives Home, Nutrition and the coach's numbers; a wrong reset could leave a real profile
  with no targets. Held by checks on both halves (a profile with a weight still gets targets).

### 2. Data leaks between profiles — CONFIRMED (Margaret), LIKELY (Sal's day one)
- **Margaret's Home showing Sal's notice:** the SAME in-memory message. `adaptationMessages` (`App.tsx:291`) is never
  cleared on reset, and Home shows `adaptationMessages[0]` (`App.tsx:2887`).
- **Sal's notice on day one (likely, needs her rows):** same mechanism one profile earlier. Sal's sign-up anchor
  (83.5 kg → 1,926 / 167) is written at `App.tsx:2043`, but its `.then` only updates state when
  `activeProfileIdRef.current === data.id`, and that ref is still null until `commitPlan` sets it (`App.tsx:2016`) —
  so the anchor is silently dropped, the effect then computes Sal at the previous 80 kg, overwrites her row and reads
  the 83.5 row as "previous": "targets moved with your recent weigh-ins". This needs an 80 kg profile before Sal on the
  same device in the same app session.
- **Storage audit:** every local key was checked (table in the investigator's notes, summarised): all target, set,
  cardio and moment caches are scoped by profile id or cleared on New Plan. Two are not: `fitplan_shop_day_v1` (the old
  profile's shopping day and snooze carry over; medium) and `fitplan_chat_prefill_v1` (session only, low).
- **Server side:** New Plan inserts a new profile row with a new id; nothing is copied server-side. What crosses is
  in-memory state, which then gets WRITTEN under the new id.
- **Also never reset (not traced whether they refetch):** `mealRegenerateError`, `mealTopUpNote`, `activeAdaptations`,
  `planInvalidation`, `groceryItems`, memory goals/facts, `unrecognisedDietaryRestrictions`, `writeError`.
- **Fix:** the strongest version is to stop resetting in place: a New Plan reloads the app (or remounts App keyed on
  the profile id), so no state can cross by construction. The narrow version clears each named piece. I recommend the
  reload, held by a check that a second profile on the same device shows nothing of the first.
- **Why nothing caught it:** `test:reset-clears-draft` audits localStorage keys only, and the anchor gates never test
  the reset path.

### 8. Margaret's meal plan never generated — CONFIRMED, same root as 1
- **Root cause:** `App.tsx:2253`: `if (calculatedMacros) startInitialMealBuild(...)`. With no weight, sign-up targets are
  (correctly) null, so no build starts and nothing says why; Nutrition falls through to "Complete onboarding to generate
  your meal pools" (`MealPlan.tsx:427-444`), which is false after onboarding.
- **Fix:** an honest empty state when there is no weight: "Add your weight and I'll build your meals and targets", with
  the add-weight control right there; and fixing 1 stops "Generate meals" from building at invented targets.

---

## 3. Health conditions never reach the plan — CONFIRMED (no route exists)
- There is no slot, column or code path for a condition or medication. Conditions become notes
  (`record_context_fact` → `user_context_facts`), and the post-setup coach is told a note "must never be described as
  something that will change the plan" (`chat-gemini/index.ts:2905`).
- The setup prompt says "never ask health-screening questions: the app's one doctor line at the end is the only one"
  (`onboarding-chat/index.ts:334`). That doctor line (`ConversationalOnboarding.tsx:2455`) only shows to someone who is
  a beginner AND sedentary (`isStartingFromNothing`), and a stated condition never triggers it.
- What a condition COULD plug into without new science: effort caps (RPE ceilings exist), no max-effort testing (the
  calibration week tests heavy sets), the cardio effort labels (Easy/Steady/Hard rather than heart-rate zones, which
  beta-blockers make unreliable), the starting-out pathway, the doctor line.
- **CSCS boundary:** "avoid maximal efforts and breath-holding, keep effort moderate, get GP clearance" for high blood
  pressure is general exercise guidance and inside my delegation. Warfarin and vitamin K, and a pre-diabetes diet, are
  clinical nutrition and outside it: the honest version is a referral line, never a diet rule.
- **PRODUCT DECISION 1 (yours)** — see the decisions below.

## 4. A medical safety question was deferred — CONFIRMED
- The setup prompt's park rule (`onboarding-chat/index.ts:339-344`) parks "a perfectly good training, nutrition or
  supplement question" and calls itself "firmer than anything else in this prompt". Its own examples include "are
  squats bad for your knees?", a safety-flavoured question. The never-parked list (`:351-355`) covers pain, medication,
  extreme targets and eating disorders, and NOT "is it safe to exercise with my condition". So "is it safe to lift
  with high blood pressure?" was parked like creatine.
- No client guard: `addParkedQuestion` (`parked-questions.ts:34`) parks anything.
- **Fix:** add "is it safe to … with a health condition / medication / pregnancy" to the never-parked list and the
  `park_question` tool description, with the answer shape (brief, safe, GP clearance, note the condition, back to the
  question); plus a client backstop that refuses to park a question naming a condition (blood pressure, heart, diabet,
  pregnan, warfarin/blood thinner, asthma, epilep…) and shows a fixed safe line instead. The park rule is your
  ruling, so this is DECISION 2.

## 5. "Clamshell — Band" for a bodyweight-only person — CONFIRMED, a label bug
- Clamshell (`exercise-db.ts:4186`) is `['bodyweight', 'resistance band']` with `equipment_alternatives: true`, so it
  rightly passes the bodyweight filter (the band-only Standing Band Hip Abduction is rightly excluded).
- The word "Band" comes from `unloadedLoadLabel` (`load-prescription.ts:1380`): `if (entry.equipment.includes('resistance band')) return 'Band'`,
  ignoring both `equipment_alternatives` and the person's kit. Same for Banded Ankle Dorsiflexion.
- **Related, inferred:** Eccentric Wrist Extension and Forearm Pronation-Supination list a dumbbell as an alternative,
  so a bodyweight-only person with a sore wrist may be shown a kg figure.
- **"Squat & Carry":** its required carry slot can be the Loaded Backpack Walk, because the bodyweight tier assumes a
  weighted backpack (`exercise-plan.ts:557`, `kit-list.ts:98`) unless he untick it. For someone who said "no equipment
  at all" that is a real implement (inferred for Margaret: depends on her kit ticks).
- **Fix:** the label reads the person's kit (band only when a band is the only way they can do it, else
  "Bodyweight"); the same for any primer that carries a weight only through an alternative; "Bodyweight only" stops
  assuming a backpack unless he ticks one (that also fixes his #21 "Bodyweight only lists a pull-up bar and a
  weighted bag").

## 6. Changing experience to Beginner "deleted" the lift numbers — CONFIRMED, they are hidden, not deleted, and still USED
- Beginner hides the lift questions (`willBeLiftingBarbells`, `onboarding-slots.ts:766`) and the summary filters them
  out (`ConversationalOnboarding.tsx:2347`); nothing tells her.
- **Then Generate writes them anyway**: `assembleProfile` (`onboarding-slots.ts:1415`) checks the stored answer, not
  whether the question still applies. Run here: beginner + squat 60 → `known_squat_kg: 60`, `skip_calibration_week:
  true`. The plan still gives a beginner the calibration week, but her hidden numbers anchor its loads. So the summary
  she approves is not what is saved.
- **Fix:** the summary and the saved profile agree. DECISION 4 is which way.

## 7. The meal plan ignored the meal answers — CONFIRMED in part
- **2 meals means breakfast + dinner, always** (`meal-generation.ts:73-77`: `2: { breakfast: 0.45, dinner: 0.55 }`).
  "Usually skip" breakfast never removes it; it only tells the meal writer to make breakfast "extremely light"
  (`generate-meals/index.ts:169`) while giving it about 40% of the day's calories. That clash leaves one breakfast that
  fits ("None of your 1 breakfasts") and a day that misses (inferred for the 315 kcal over).
- **Why she got FOUR meals with a lunch is NOT confirmed:** from the code, 2 meals + snacks gives breakfast + dinner +
  snack (3). Four with a lunch is what 3 meals + snacks gives, and the day serves whatever meal pools exist without
  checking the profile (`meal-generation.ts:2029`). Either her saved row says 3, or a lunch pool came by another route.
  Needs her row on TEST/PROD to settle.
- **Her usual meals:** setup's answer becomes "likes" only, which steer the meal writer; your "My usual meals first"
  (first call on the menu, about half the week) applies only to dishes tagged as his own (Profile → My meals, or the
  coach), which setup never tags. And satay (nut-free), spag bol and pizza (dairy-free) would be refused by her own
  restrictions anyway; salmon and rice had no reason to fail (needs the generation log).
- **"None of your 1 breakfasts"**: `coach-voice.ts:218-220` always uses the plural.
- **Fix (mechanical):** "skip breakfast" means no breakfast: 2 meals + skip = lunch + dinner (+ snack); the day only
  serves meals the profile asks for; setup's usual meals are treated as his own meals (your ruling's intent) and,
  where one clashes with a restriction, the nearest safe version is asked for; the plural. The meaning of "2 meals"
  when breakfast is NOT skipped is DECISION 5.

## 9. Days added that nobody chose — CONFIRMED
- `assignConditioningNotes` (`exercise-plan.ts:5439-5518`) adds real "Active Recovery + Cardio" rows to the stored plan
  on non-training days: as many as the goal's cardio frequency (fat loss 3, conditioning 4, "love cardio" +1), on the
  first free weekdays from Monday, keeping back ONE true rest day. Recovery capacity only ever keeps that one day back;
  age, experience and first-timer status are not read.
- They are not counted as sessions (they read as recovery), but the labelling is inconsistent: Today says "Suggested",
  the Full Program prints the prescription with no "optional".
- **CSCS view (mine):** a first-timer, a stretched-thin parent, and a 62-year-old with high blood pressure should not
  be handed six active days; recovery is the limiter. For everyone, extra cardio is useful only if it is optional and
  light. **Whether it appears at all on days he did not choose is DECISION 3.**

---

## Product decisions (yours)

1. **Health conditions (defect 3).** (A, recommended) one optional setup question, "Anything your doctor has told you
   to watch?" with taps (high blood pressure, heart condition, diabetes or pre-diabetes, blood thinners, pregnancy,
   something else): it shows the doctor line, keeps max-effort testing and very hard sets out (a moderate effort
   ceiling), uses effort words not heart rates, and tells the coach; it never changes her food (that is clinical) and
   says so. (B) No new question: a condition said in passing triggers the same guards. (C) Notes only, but the summary
   says plainly the plan does not adjust for medical conditions and to check with her GP.
2. **Safety questions during setup (defect 4).** Your ruling parks real questions during setup. (A, recommended) a
   question about exercising or eating safely with a health condition, medication or pregnancy is never parked: a brief
   safe answer and "check with your GP before starting", the condition noted, then back to setup. (B) Still parked, but
   with the GP sentence said now.
3. **Extra activity on days nobody chose (defect 9).** (A) Never: the goal's cardio goes inside the chosen sessions.
   (B, recommended) Only as clearly optional suggestions ("Optional: a 20-minute walk"), drawn differently from a
   session, and none for a beginner, low recovery or someone starting from nothing. (C) Ask in setup whether she wants
   optional extra activity on rest days.
4. **Lift numbers after switching to Beginner (defect 6).** (A, recommended) Keep them and say so: "As a beginner you'll
   still start with a test week; your numbers will guide it." The summary shows them. (B) Drop them and say so.
5. **What "2 meals" means when breakfast is NOT skipped (defect 7).** (A, recommended) Breakfast + dinner, as now.
   (B) Lunch + dinner always. (Skip breakfast → lunch + dinner either way.)

---

## How each fix will be verified, LIVE as well as by test
The persona script and the harness pages bypass parts of the app (no App.tsx boot, a stand-in coach), so they cannot
be the only check:
- Group A: a new whole-app harness check (the `verify:app-boot` page boots App.tsx): profile 1 with a weight, Start a
  new plan, profile 2 with none — no number on Home or Nutrition, no "targets moved" line, the add-weight empty state,
  and a profile WITH a weight still gets targets.
- 4: source checks on the prompt plus a client check; whether the live model obeys is the coach exam's (two cases).
- 5, 6, 7, 9: gates on the real generator and assembler, plus a browser driver per screen.
- LIVE, on his machine (this cloud session cannot reach the database or the coach): a prompt for his local Claude to
  run Sal and then Margaret through the real setup on the branch's preview against TEST, Start a new plan between them,
  and read back the target rows (`daily_nutrition_targets.calculated_weight_kg`), Margaret's meal state, the Clamshell
  row's label, Sal's meal slots and both weeks' day list.

## Also from his list, not traced yet (after these 9)
#10 session length can't go below 30-45 (confirmed in passing: no shorter band exists; only the pathway's ~15-minute
home strength is shorter); #11 mixed gym and home weeks; #12 two answers that didn't stick; #13 no "No thanks" on the
running goal; #14 no "general health" goal and athletic wording for Margaret; #15 the end-of-setup "Almost" contradiction
and a kit question with no options; #16 ticks under the wrong message; #17 history wiped; #18 the progress counter;
#19 repeats; #20 the missing-weight warning's reason; #21 the smaller list; #22 the points to check (peanuts vs
nut-free especially, which is in the allergen band and needs a plan before a build).
