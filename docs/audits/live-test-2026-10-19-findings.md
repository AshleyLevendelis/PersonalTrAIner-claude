# Live test, 19 Oct 2026 — ten findings traced to cause

Ashley's live test as "Sam" (Minimalist kit: dumbbells to 24 kg, kettlebell, bands, pull-up bar, no bench;
bodybuilding; fat loss; a temporary knee ease-off until 22 Oct). Traced on the working branch
`claude/coach-empty-text-fix-2c4bzv` (30 commits past `main`, which is what the live app runs). NOTHING BUILT:
she asked for findings first. "Confirmed" = run through the app's own code in this session; "read" = traced from
the source only; "inferred" = from her numbers, her stored data cannot be read from a cloud session.

| # | What she saw | Root cause | On this branch already? |
|---|---|---|---|
| 1 | "Shoulders & Abs" with no press, leg work, "No overhead press fits your kit" | Stored plan from the old engine, built while the shoulder flag was on; the knee ease-off then swapped leg slots for knee-rehab leg moves; the note blames kit for anything | No (same family as runs 7-10 H38) |
| 2 | Heavy swing in a lighter phase; Plank 3 × 34-49s | Swing reinstated by a style floor and picked as a "same pattern" swap; the hold is a stored string from before holds were stepped in 5 s | No |
| 3 | Profile → Injuries "None" during the ease-off | The row summary reads only lasting injuries; the ease-off is shown only inside the sheet | No (same as runs 7-10 L53) |
| 4 | Coach said "a flat bench", offered a press that doesn't exist, swap dead-ended | Coach is never sent her tick list unless she said something; a remembered free-text kit fact likely says bench; the coach has no catalogue, so it invents names | Partly: the dead end now gives tap choices (H33), not the right press, and the bench claim stands |
| 5 | "Move lunch's calories to dinner" → "already add up… tell me which meal" | No tool moves calories between meals; it landed on the whole-day resize, whose refusal answers a different question | No |
| 6 | Swap card 466 kcal, screen 222 | The card reads the dish's saved size; the screen shows the size the day serves. The "higher-calorie" line is the model's own sentence, written before any numbers | No |
| 7 | Apply shrank breakfast and snack unannounced; "25% smaller" but −24% and −35% | The coach's swap card never shows the knock-on (only the screen does, after the tap); the banner prints the one factor asked for, and rounding each ingredient moves each meal differently | No |
| 8 | "On target" at 1736/1689 kcal and 185/162 P | Old bands (protein up to 1.15x, carbs and fat ±25%) | YES: runs 7-10 M59 (protein to 1.10x, carbs and fat ±10%); that day would read "protein 23 g over" |
| 9 | 1,689/162/150/49 vs "How it's set" 1684/161/152/48 | The panel worked from the raw latest weigh-in, the ring from the steadied weight | YES: runs 7-10 M58, the whole panel |
| 10 | Greek yoghurt and smoked turkey blocked as "doesn't fit nut-free" | A line the food list can't identify ("low fat greek yoghurt", "smoked turkey breast") is blocked for safety (right) and then described as CONTAINING something that doesn't fit nut-free (false) | No |

## 1. The shoulders day

**Confirmed** with Sam's profile through the real code:

- With no injury flag, five presses fit his kit: Dumbbell Shoulder Press, Arnold Press, Band Shoulder Press, Pike
  Push-Ups, Backpack Overhead Press. None needs a bench. There is no kettlebell press in the catalogue.
- With a shoulder flag: none. An exercise not hand-reviewed for an injury falls back to "every joint it loads is
  off limits", and every press loads the shoulder (`exercise-db.ts` `contraindicatedJoints`).
- The note, given today's day and no flag, prints "No overhead press fits your kit, so today is abs."

So the day on screen is not worked out today. It is the stored plan from before 9 Oct, generated while Sam had
the shoulder flag ticked (run 1). At that time legs were a main pattern of "Shoulders & Abs" (since 9 Oct they
are not). Removing the flag did not rebuild the plan. On top of that, the knee ease-off on 8 Oct swapped slot for
slot:

- Tempo Air Squat → **Spanish Squat** (confirmed): same pattern, and tagged as good for a sore knee.
- Single-Leg Glute Bridge → **Kettlebell Swing (Heavy)** (confirmed): the knee flag removes the bridge; the swing
  is not a bodybuilding move but a "keep four options per pattern" rule put it back in as if it were; Glute Bridge
  is refused as an easier version.
- Low Box Step-Up and Squat Marches stay, tagged good for or harmless to the knee.

**The note** (`day-gap-note.ts`) is the one part worked out live, and it is wrong three ways. It checks only lasting
injuries, so a temporary ease-off and a removed flag both fall through to "fits your kit", which nothing checks. It
has no leg branch, so three leg moves are ignored and the plank makes it "abs". It is keyed on the stored label,
which nothing recomputes after a change. One gate (`test:day-length`) pins that very sentence for a day with no
flag.

**Does the label still say Shoulders?** Yes, because the label is written once at generation and kept through every
edit.

**A real question for Ashley, outside my coaching delegation:** an "ease off your knee" change currently fills the
gap with knee-REHAB moves (Spanish Squat, step-ups) on a day that is not a leg day. Deciding the app prescribes
rehab is outside what CLAUDE.md lets me decide.

## 2. Swing and plank

- "(Heavy)" is only part of the name, to tell it apart from the warm-up swing. Its load is set at the phase's reps
  and effort. No phase rule removes exercises; Anatomical Adaptation changes the dose only. The real problem is
  that it is off-style for a bodybuilder and was picked over Romanian Deadlifts (see 1).
- "34-49s" is 30-45 s +3 for the phase +1 for week 2, the arithmetic from before 9 Oct. Today's generator steps
  holds by 5 s and cannot produce it. Nothing tidies a stored hold, so it stays until the plan is rebuilt.

## 3. Profile injuries row

The row summary reads only the saved injuries. The ease-off lives as a separate temporary record on purpose (it
must never be written into the profile, and a gate holds that). The sheet behind the row already shows "Easing off
your knees until 22 Oct" with End now; only the row's one-line summary misses it. The Equipment row has the same
blind spot for a temporary kit change.

## 4. Coach kit and the invented press

- Minimalist's own description says "no barbell or bench", and the coach is told exactly that.
- The coach is sent her own tick list ONLY when she has said something about kit. Otherwise it gets the
  one-sentence choice and "nothing beyond the choice above".
- Everything the app remembers about her is sent too. In run 1 Sam told the coach "adjustable dumbbells and a flat
  bench"; if that is still remembered as a free-text fact, the coach is told "bench" while the plan is not. Most
  likely cause; not confirmed (her data can't be read here).
- "Seated Dumbbell Overhead Press" is not in the catalogue. The coach has no list of real exercise names, so any
  plausible name reaches the app and fails there.
- This branch (runs 7-10 H33) replaces the dead end with "I don't have X under that name" plus up to three choices
  that fit her kit, as tap buttons. But it does not correct the bench claim. Its look-alike search keeps "seated"
  and does not equate "overhead" with "shoulder", so it would not land on Dumbbell Shoulder Press. And its choices
  are the swapped-out exercise's peers, which may not be presses.

## 5. Moving calories between meals

The refusal sentence is the app's, from the whole-day resize ("make my food match my targets"), which takes no
meal names and correctly finds the day already fits. Nothing on either surface moves part of one meal's calories
to another: moving a meal swaps whole meals, and editing a food changes one food. So this is a missing capability
on both surfaces, not a parity break. The minimum fix is that a message naming two meals never reaches the day
resize. The real fix is a new "shift calories from A to B" change, and how it behaves is a product choice.

## 6. Swap card numbers

The swap card reads the dish as saved in her meals (466). The screen shows the day as served, which can resize a
dish to fit around other meals (222). Which resize shrank it is inferred: a factor of 0.48 is outside the usual
around-a-swap range, so most likely the fit around an eaten meal. Applying the swap then serves the new dish at its
saved size, so the real change can be nearly double behind a "−7 kcal" card. The "higher-calorie" sentence is the
coach model's free text, written before the app picks the dish or knows a number, and printed as the card's reason.
That breaks the rule that the app's own phrasebook writes the card's sentences.

## 7. Hidden knock-on on Apply

The coach's swap card lists no other changes. The screen's swap shows them only after the tap, as a banner with
Undo (her 10 Oct "Resize, else leave"). The banner's "25%" is the one factor the app asked every other meal to
move by, often the edge of its range. Each meal is then resized line by line, rounding to 5 g, quarter spoons and
whole items, so a snack of counted items lands at −35% while the banner says 25%.

## 8 and 9. Already fixed on this branch

- 8: day bands since 18 Oct are calories ±5%, protein 0.95-1.10x, carbs and fat ±10%. 1736/1689 is inside;
  185/162 is outside, so the day reads "protein 23 g over" (or names fat, if fat was further out).
- 9: since 18 Oct the "How it's set" panel works from the same steadied weight as the ring, every tile.
- Neither is live: they need the frontend merge.

## 10. "Doesn't fit nut-free"

**Confirmed** through the real lookup and the restriction check:

| Line | Found as | Verdict |
|---|---|---|
| greek yoghurt | greek yoghurt 0% (dairy) | fine |
| low fat / 2% / vanilla / light greek yoghurt | not found | blocked: "Contains low fat greek yoghurt, which doesn't fit "nut-free"." |
| smoked turkey, smoked turkey breast, turkey slices, deli turkey | not found | blocked the same way |
| turkey breast, sliced turkey | turkey breast (meat) | fine |

Blocking a food the app cannot identify is the right safety rule and should stay. The sentence is wrong: the check
records "could not be identified" and the card's sentence drops that, so it says "contains". Today's breakfast
passed because its yoghurt line is one the list knows. Two fixes, both in the allergen path (a plan first, and the
wording is Ashley's): say "I can't confirm X is nut-free" for an unidentified line; and add the reviewed names
(smoked turkey, low-fat / 2% / vanilla Greek yoghurt) with their plain parent's tags, rather than loosening the rule.

---

# Part 2 — five more, same day (setup and coach)

| # | What she saw | Root cause | On this branch already? |
|---|---|---|---|
| 11 | "I know my numbers" → "Got those numbers down." → next question, no numbers asked | The three lift boxes are marked "never needed" (so nothing asks for them) and the setup model is told never to bring them up unprompted; the sentence is the model's, and nothing was recorded | No |
| 12 | Age, height and weight asked in one free-text sentence | A proper three-box card with units already exists, but only appears if the setup model asks for it, and its instructions (written before the card existed) tell it not to | No |
| 13 | "I don't have bands" → a swap card | The coach picked a one-exercise swap for TODAY when its instructions say a kit statement takes the kit change; nothing in code backs that rule up. The card itself waited for a tap (the receipt shows it was tapped). The card is the big one used for every change | No |
| 14 | "I did rdl" → "How many sets and reps for Single-Leg RDL (Bodyweight)?" | No short names or aliases anywhere; the only catalogue name containing "rdl" is the single-leg one, so the app took it as certain | No |
| 15 | Wants "a cardio workout today" / "a functional workout today" | Nothing on either surface changes today's session TYPE or STYLE; "rebuild today" keeps the main lift (her 16 Sep ruling) and swaps like for like | No |

## 11. "I know my numbers"

- The question offers "I know my numbers — Enter my current working weights" (`onboarding-slots.ts`). The three boxes
  behind it are on the "never blocks" list, so they never reach the list of things still to ask, and the setup
  model is told such slots must not be raised just because they are empty. A gate (`test:onboarding-slots`, "known-
  lift numbers never block") holds that absence in place.
- "Got those numbers down." is not in the app's code anywhere: the setup model wrote it, and it is false.
- SAFETY HELD: with no numbers, the plan does not skip the calibration week (a backstop added after a measured case
  where the same path prescribed 2.2x a woman's real loads). So week 1 is safe; the harm is a broken promise and a
  calibration week she said she didn't need.
- The lift boxes take kg only; someone typing pounds would be stored as kg.

## 12. Age, height and weight

- The card exists and is good: three labelled boxes, one Save, height as cm or 5'10", weight as kg, lb or stone.
- It only appears when the setup model asks for it. Two lines of its instructions, written before the card
  existed, say numbers "have no chips" and the tool should not be used for them. The model grouped the three as
  prose, as told.
- Fix: when the question plainly asks age/height/weight, the app shows the card itself, whatever the model did.
  A labelled box cannot record a wrong answer the way wrong chips can, so this is safe to do in code.

## 13. The swap card after "I don't have bands"

- Nothing auto-applied: the "Swapped … Undo" receipt replaces the card after a tap or a typed yes.
- The wrong tool: the coach's own rules say "I don't own bands" is about the kit she owns and takes the kit change,
  which reprices every day; the swap fixed one exercise, today only, and the other band work stays. Nothing in code
  enforces the rule, and the swap tool skips the "was this a command?" check the others run.
- The live coach may not have the kit-change tool at all if it was not redeployed after 11 Oct. Worth checking first.
- The second scope button reads "permanent" (raw), confirmed in the code.
- Her ask (a text question with a small approve button) touches one component that draws every card, about forty
  kinds. It partly reverses her 24 Sep line that the Apply cards for changes she ASKS for stay as they are, so it is
  hers to rule on; and a "smaller" button meets the 44px one-handed tap floor.
- Her plan day has a trap bar deadlift and chest dips, which Minimalist kit does not allow, so her stored kit may be
  Home gym or edited. Can't read her profile here.

## 14. "rdl"

Confirmed through the real resolver: "rdl" → Single-Leg RDL (Bodyweight), certain; "dumbbell rdl", "stiff leg
deadlift" and "ohp" → not recognised. Romanian Deadlifts does not contain the letters "rdl". The follow-up only asks
for sets and reps, so the wrong name can't be corrected there, and because it is bodyweight it would log her RDL at
0 kg. Fix (mechanical, mine): one short-name table (rdl, ohp, sldl, db, kb…) gated against the catalogue, and a
short query matched only by letters is offered as a choice, never taken as certain.

## 15. A different kind of workout today

| Exists | Changes today's type or style? |
|---|---|
| Rebuild today (screen and coach) | No: keeps the main lift, swaps the rest like for like |
| I did something else instead / activity swap | No: records what she did, prescribes nothing |
| Add a cardio session (coach) | Refused on a day that already has a session |
| Circuit log | Records a finished circuit |
| Style change | Lasting, rebuilds the block; the coach is told not to use it for one day |

- Sled push is not in the catalogue at all. Box jumps exist but only as a warm-up move (one per day). For Minimalist
  or Home gym the cardio pool is jump rope, burpees and mountain climbers; every cardio machine is excluded.
- Building it collides with her 16 Sep "keep the main lift and rebuild around it". The rule here is to put both in
  front of her, not pick the newer one. What a one-day conditioning or functional session contains is my call as
  a CSCS; whether "something different today" may drop the main lift is hers.
