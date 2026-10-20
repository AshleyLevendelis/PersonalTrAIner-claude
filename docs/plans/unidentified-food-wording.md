# A food the app cannot identify, against a restriction

Live test, 19 Oct 2026 (finding 10 in `docs/audits/live-test-2026-10-19-findings.md`). Allergen path: this plan comes
before the build, as CLAUDE.md requires.

## What happens now (confirmed by running the real code)

- The meal check (`validateMealAgainstDiet`, `diet-rules.ts`) looks every ingredient line up in the food list. A line
  it cannot identify ("low fat greek yoghurt", "smoked turkey breast") is treated as breaking EVERY restriction the
  person has. That is fail-closed, and it is right: the app never assumes an unknown food is safe.
- The check records why ("could not be resolved to a known ingredient"), but `checkMealAgainstRestrictions` drops
  the reason, and `describeIssues` then prints `Contains low fat greek yoghurt, which doesn't fit "nut-free".` That
  sentence is FALSE: nothing says the yoghurt contains nuts.
- Her breakfast passed because its line was "greek yoghurt", which the list knows.

## Her ruling, 20 Oct 2026 ("Can't confirm it's nut-free", from three options)

The meal stays blocked. The reason says the app cannot confirm the food fits, never that it contains something:

> I can't confirm smoked turkey breast is nut-free, so this one's off for you.

She rejected hiding such meals entirely and the vaguer "Couldn't check this food against your diet."

## The build

1. **Carry the fact, not the sentence.** The violation gains a machine field, `unidentified: true`, set only on the
   could-not-resolve branch. `MealRestrictionIssue` gains the same field and the check copies it across. Nothing reads
   the `reason` text to decide anything.
2. **One sentence for it, in one place.** `describeIssues`: when the first issue is unidentified, the line is
   `I can't confirm <ingredient> is <restrictions>, so this one's off for you.` Every restriction that line could not
   be confirmed against is named (joined with "or"), because one unknown line breaks each of them at once and "and 1
   more" would read as a second food. A real clash keeps its sentence unchanged.
3. **The past-tense note** (`describeEatenBeforeChange`, a meal already eaten before a restriction was added) says
   "This had <ingredient>". For an unidentified line that is still true (the meal had that line) and claims nothing
   about nuts, so it is left as it is.
4. **The rule does not move.** Fail-closed stays exactly as it is: an unknown line still blocks. A gate holds that the
   unidentified meal is still `ok: false`, and that a known clash still reads "Contains …".
5. **Teach the list the common ones, by adding foods, never by loosening the matcher.** Each new entry carries the
   same allergen tags as the food it is a version of (checked by the diet-tag gates), and the coach's copy is
   regenerated (`npm run sync:shared`, held by `test:food-db-parity`):
   - `greek yoghurt 2%`: "low fat greek yoghurt", "2% greek yoghurt", "light greek yoghurt" and the "-yogurt"
     spellings. Dairy, like both Greek yoghurts already listed. Figures: USDA "Yogurt, Greek, plain, lowfat",
     73 kcal, 9.95 g protein, 3.94 g carbs, 1.92 g fat per 100 g.
   - `smoked turkey breast`: "smoked turkey", "deli turkey", "turkey slices", "sliced turkey breast". Meat and
     processed meat, like ham. Figures: a typical UK pre-sliced cooked turkey breast label, about 104 kcal, 23 g
     protein, 1 g carbs, 1 g fat per 100 g (named as a label figure, not a USDA one). The existing alias "sliced
     turkey" stays on roast turkey breast; not changing an existing answer.
   - NOT added: flavoured yoghurts ("vanilla greek yoghurt"). The sugar varies too much by brand to have one honest
     figure, so they stay unidentified and blocked, now with the true sentence.
   - NOT added to the global "harmless words" list: "smoked" there would make "smoked anything" match its base food,
     which is the loosening this plan avoids.

## Proof

- `test:unidentified-food` (new): the exact lines from her screen give the new sentence and stay blocked; a real clash
  (granola under nut-free) keeps "Contains granola"; an identified food passes; each new food resolves with its
  parent's tags; vanilla Greek yoghurt still does not resolve. Mutation-tested.
- The swap list on a real screen (`verify:kept-meal` or the meal-swap driver that shows a blocked row) reads the new
  sentence where the tap is.
- Re-run every gate reading `diet-rules.ts`, `meal-restriction-check.ts` and `food-db.ts` (the food list is read
  widely, so the broad set).

## Deploys

Frontend for the screen. `chat-gemini` for the coach's copy of the food list (the new foods), since the coach costs
foods too.
