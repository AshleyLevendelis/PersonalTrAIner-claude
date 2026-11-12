# Eating out

**His request, 12 Nov 2026:** "build it, start with out for dinner", after an idea message about a nutrition engine
that copes with real life ("tell the coach you're heading to a restaurant ... and it dynamically adjusts the remaining
meals"). **His ruling the same day**, from three options: **"Ask: light/normal/big"**. When he marks a meal out without
saying what he'll order, the app asks Light / Normal / Big night; that drives how much the rest of the day shrinks; the
meal is an estimate; telling the coach the actual dish later replaces it.

## What it does

- **Two doors, one road.** A meal's sheet on Nutrition has "Eating out" (today and the six strip days, never on a
  meal logged as eaten). The coach has `propose_eating_out`. Both call ONE controller from `useMealDays`
  (`eatingOut.mark` / `eatingOut.clear`), the `meal-refit` pattern: the estimate, the refusals and the write cannot
  differ between them.
- **The app asks the size, on both surfaces.** The screen shows the three answers. In the chat, the size comes only
  from his own words in the message he sent (`eatingOutSizeSaid`), never from the coach's arguments (the tool has no
  size field); with no size said, the APP replies "How big a night out is Thursday's dinner?" with three buttons whose
  words carry the size, the meal and the day, so one tap answers it.
- **The meal.** A one-day option named "Dinner out (Friday)": no foods, the estimate's numbers, marked cooked
  elsewhere (never shopped for, never resized, never moved) and served only on that date. The row reads
  "Eating out", badged "Estimate", with the size buttons and "Not eating out".
- **The day around it.** The day's other meals keep their dishes. If the day still runs over, they are made smaller
  together, never by more than a quarter (the app's own "still the same dish" limit); what is left over the day's
  verdict says. Nothing is skipped.
- **Nothing changes silently.** A dinner out leaves no leftovers for the next day's lunch, so that lunch becomes a
  fresh dish, and the rotation can then move a meal or two later in the week (an ordinary dinner swap does exactly the
  same). Every such change is read off the same trial a swap's card uses (`meal-knock-on.ts`) and named: on the
  screen's line under the meals, and on the coach's card before Apply.
- **Undo** on both (the line's Undo, the receipt's Undo) puts back the dish the meal showed before. A size changed on
  the row has no Undo: the old size is one tap away, and an Undo there would take the meal off eating out altogether.

## The sizes (mine, CSCS delegation, population nutrition)

Light 1.0, Normal 1.35, Big night 1.7 times the meal's own share of his day. Protein stays at the share; the extra
energy is carbs and fat in the share's proportion. Basis in BACKLOG.

## Measured (12 Nov 2026, four targets 1,800-3,000 kcal, six days each, the real library)

| Size | Day on target | Rest of day smaller | Day over | Protein of target |
|---|---|---|---|---|
| Light | 20/24 | 0% | about 0 kcal | 107% |
| Normal | 12/24 | 11.5% | about 25 kcal | 98% |
| Big night | 0/24 | 11.6% (capped at a quarter per meal) | about 250 kcal | 98% |

"On target" uses the 18 Oct bands (every number inside its band), so Normal misses mostly on a macro, not calories.

## Not built

- A menu link or a photo of a menu. Telling the coach the dish works today (`propose_custom_meal`, `cooked_for_me`).
- Spreading a big night over the week (a weekly calorie budget). The day says how far over it is; nothing earlier or
  later in the week is cut to pay for it.
- Drinks as their own line.
- Marking a meal out from setup or Profile as a standing answer (that is "Meals cooked for me").
