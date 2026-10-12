# Plan: a recipe's cooking steps are checked against her allergies and foods to avoid

**Status: plan written 11 Oct 2026, then built the same day** (Ashley's 9 Oct ruling "Build
all four", item (4), told to build on 11 Oct). Test log M19, with M17 alongside; tracer G.
Safety-adjacent (dietary enforcement), so this plan came first.

## 1. What is wrong

The cooking method ("prep") is checked for one thing only: an amount of food written in the
prose, which would contradict the rescaled ingredient list (`methodSafeToShow`). Nothing else
reads it. So:

- **The allergen and avoid filters never see it.** Tracer G ran the real functions: a dish whose
  list is chicken, rice, garlic, oil and broccoli, and whose method says "Fry the mushrooms in
  butter … scatter over toasted walnuts", was accepted for a nut-free profile avoiding
  mushrooms, the method shown in full, and the display re-check said `ok`. "Halloumi and chicken
  quinoa salad" ("…top with halved boiled eggs", no egg on the list) was accepted for egg-free.
- **The method can name a food that is not in the dish** (M19: the prawn salad's "chilli
  flakes"). Tracer G found 8 of the 188 library dishes of that day doing it (a splash of milk
  with no milk, avocado with no avocado, beans with no beans...).

## 2. The rule (one sentence)

**A method is shown only if it is true of the ingredient list beside it and names nothing she
must not eat.** Otherwise the whole method goes and the meal stays — the house rule already
written for amounts ("the whole method goes, never one sentence"), because a meal with no
steps is a smaller loss than steps that disagree with the meal or tell her to add an allergen.

## 3. What gets built

One pure function in a new leaf module `src/lib/meal-method-check.ts`:
`methodToShow(prep, ingredientNames, rules)` → the text to show, or `''`, plus the reason it was
hidden (for gates and logs, not printed). Three checks, in this order:

1. **Amounts** — the existing rule, moved here unchanged (`methodSafeToShow` keeps its name and
   calls it, so every current caller keeps working).
2. **Restrictions (the safety half; independent of 3).** The food words in the method are found
   with the food database's own names and aliases (longest first, whole words). Each found food
   goes through the same diet check as the ingredients (`validateMealAgainstDiet`), and the
   method text goes through the same avoid matcher as the dish (`containsPhrase`, which reaches
   categories like "pork" or "dairy" through the found foods' tags). Two more catches for words
   that are not a full food name:
   - a bare word every food it can name shares a tag on: "chicken" alone names only foods tagged
     meat, so a vegetarian's method saying "add the chicken" is caught; "cheese" is not (vegan
     cheese exists), and falls to the next catch;
   - the allergen words the setup backstop already uses ("nuts", "macadamia", "tahini",
     "cheese", "prawns"...), moved to a small shared module, read only over the words NOT already
     inside a found food — so "coconut milk" is a coconut milk, not "milk", for dairy-free.
   A hit hides the method for that person. This runs whether or not check 3 is ever loosened.
3. **Truth (M19).** Every food the method names must be one of the dish's ingredients (the same
   food entry, or a word of an ingredient's name). Allowed without being listed, because nobody
   lists them and they carry no tag and no calories: salt, pepper, black pepper, water, ice.
   **Everything else must be listed** — including chilli flakes and dried herbs. That is the
   strict version of her open question (below); built strict because it is the version that
   never shows a step for a food that is not in the meal.

Applied **twice**, like the amount rule and the dietary re-check: at verification
(`verifyProposal`, with the person's own restrictions; a hidden method keeps the meal) and at
display (`MealPlan.tsx`, every place a method is drawn, with today's restrictions — so a
restriction added after a meal was made hides its steps at once).

Also:
- **Data**: the library dishes whose methods name a food not on their list are fixed in the
  data (the food added to the list with an amount, or taken out of the sentence), so the library
  keeps its methods. The gate holds every library dish to the rule and prints the hide rate.
- **New food entry `chilli flakes`** (with "red pepper flakes", "crushed chillies"), so the check
  can see the M19 word at all.
- **Prompt** (`generate-meals`, rule 6): name only foods that are in the ingredient list; a
  seasoning you cook with goes in the list with an amount. The prompt is a request; the check is
  the guarantee.
- **The coach's context**: if the coach reads a method, it reads the same `methodToShow` result,
  so it cannot quote steps the screen hides. (Checked while building; recorded in BACKLOG.)

## 4. M17 (a food edit and the steps) — the plumbing, not the decision

Today every food edit (add, remove, replace, resize, move to another slot) stores the edited
copy with NO method. Tracer G: "Keep them whenever they still match the food list" is its
recommendation, and the question "when someone changes one food in a recipe, what happens to the
cooking steps?" is listed as hers. **Not decided here: edits keep hiding the steps, as now.**
The check in section 3 is exactly what option B would need, so once she answers B it is a small
change (carry `prep` through the five builders and the insert; the check decides). Named, not
built.

One drop that is NOT an edit and is fixed: a dish the coach adds by name keeps the model's
method through verification and then loses it at the write (`pending-action-executor.ts`, the
insert has no `prep`). Fixed through the existing missing-column-safe insert; the check runs on
it like any other method. (If the write path is not a straight fix it is named and left.)

## 5. Questions that are hers (the safe version is built)

1. **Seasonings with no real calories** (chilli flakes, dried herbs, spices): must they be on the
   ingredient list for the steps to show (built), or may a short fixed list appear unlisted
   (tracer's recommendation)? The gate prints how many library methods each answer hides.
2. **A step that mentions an avoided food**: hide the whole method and keep the dish (built),
   rewrite the step, or refuse the dish?
3. **Say why the steps are missing?** Built silent, the same as the amount rule today.
4. **M17**: after a food edit, keep the steps when they still match (B), hide (A, built), or
   keep with a line (C)?

## 6. Gates

- New `test:meal-method-check`: the three checks with cases both ways (a nut word hides for
  nut-free and not otherwise; "coconut milk" does not trip dairy-free; "add the chicken" hides
  for a vegetarian; an avoided "mushrooms" hides; an unlisted "chilli flakes" hides; salt and
  pepper do not), the tracer's two reproductions through the real `verifyProposal` and the real
  display function, every library dish passing, the hide rate printed, and source checks that
  both `verifyProposal` and every method render in `MealPlan.tsx` go through the check with the
  person's rules (comments stripped).
- Existing, re-run: `test:meal-method`, `test:meal-library`, `measure:meal-library`,
  `test:kept-meal-restriction`, `test:food-db-parity`, `test:diet-tag-sync`, `test:bundle`,
  `verify:meal-method` (extended: a restriction hides a method on the real screen).
- Mutation-tested; counts in BACKLOG.

## 7. Deploys

Frontend on merge. `generate-meals` for the prompt line. No migration.
