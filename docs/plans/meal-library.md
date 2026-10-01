# A library of meals for "more options"

30 Sep 2026. Ashley: *"We should add more meals, it must be so easy to search
the Internet for hundreds of meals with recipes and cooking instructions and
macros which we can take and ingest into the app as options."* Asked where they
should come from, from three options, she chose **write our own, and check
them** over an open recipe dataset and over copying recipe sites.

## Why not copy the internet (measured or read, in BACKLOG)

- This session cannot reach recipe sites at all (egress policy). Nothing external
  could be sampled, so any ingest of outside data would run on her machine.
- Outside macros cannot be taken as given: the app recomputes every macro from
  its own 333-food database and never reads a site's or a model's numbers.
- The ingredient reader was built for gram-style model output. On 115 ordinary
  recipe lines, 19 resolved to a food with a **misread amount** (8 oz chicken =
  8 g, 1 kg potatoes = 1 g) while coverage still read 100%. Scraped recipes would
  hit that on roughly one line in six. Separate BACKLOG item, not part of this.
  **CORRECTED 1 Oct 2026: fixed the same day (BACKLOG, "An amount is understood or it
  is asked about"); the 19-of-115 count was a different line set from the 31-of-53
  measured that day, so the two are not comparable.**
- A cooking method that names an amount is dropped whole (19 Sep rule), so
  copied instructions would mostly vanish.

## What gets built

**A library of original dishes**, each the same shape the meal writer already
returns: `{ slot, name, cuisine, prep, ingredients[] }`. Ingredients are written
in grams or counts (`"150g chicken breast"`, `"2 egg"`), using only foods the app
can cost. The method is technique with no amounts. **The library carries no
macros.** That is the point: the app works them out, per person, at the moment a
dish is offered.

**Every dish goes through `verifyProposal` for the person it is offered to**, the
same function every generated dish goes through: dislikes, food-database coverage,
the diet check (which fails closed on an unresolved name), scaling to the slot's
budget (0.4-2.5x), and the calorie and protein bands. A dish that does not suit
her targets, diet or dislikes is not offered, so library dishes can be no less
safe than a model's.

**Where it is used:** the "add more" path (`appendToExisting`): the Nutrition
"more options" offer, the swap list's "find more", and the coach's top-up. All of
them already call `generateMealPools`, so the library goes in at the one seam
where proposals arrive, before the model is asked. The model is asked only for
what the library could not supply. A fresh plan and "regenerate" are unchanged
(the model, with its steering); whether the library should also seed those is
hers to rule later.

**Choosing which dishes, pure and deterministic:** drop dishes already in her
pool (by name and by dish identity); rank by what she has said she likes
(cuisines, liked foods, hearted meals), by quick-to-make when her cooking time is
short, and by cuisines her pool does not yet have; ties broken by a rotation so
that each "more options" shows different dishes instead of the top of the same
list. The existing caps still apply (one exotic cuisine per slot, unique names,
pool limit).

**Stored as a lazily loaded data file in the app, not a database table.** No
migration, nothing touching live data, reviewable as a diff, and loaded only when
"more options" is used so it costs the first paint nothing.

## The fit (added the same day, after measuring)

The first 188 dishes were accepted by `verifyProposal` and almost none could be
served: a typical dish carried 1.2-2.1x the meal's protein, a day is on target at
0.95-1.15x, and acceptance asks only for the protein floor. So before a dish is
offered its protein foods and carb foods are re-portioned to the meal's own
budget (protein 0.55-1.35x, carbs 0.5-2x; vegetables, fats, sauces and counted
items never move). A straight-line model chooses the candidates, and the best
eight are proved through the scaler's own functions, because rounding moves
protein by more than the model can see. Servable: breakfast 94%, lunch 99%,
dinner 98%, snack 98%. The chooser ranks the WHOLE meal (a cap before the diet
check starved it: a vegan got 3 of 4 lunches when 13 exist). Named limit: a
high-energy, lower-protein target still gets few good dishes; more
low-protein-density dishes fix that, the fit will not.

## Lean dishes (1 Oct 2026)

The library's first 188 dishes were all protein-dense (the leanest 7.1 g per 100
kcal), so a big appetite on a modest protein target (3,040 kcal / 160 g, 5.2 g
per 100 kcal) had few dishes that fit. 102 carb-forward dishes were added
(5.3-6.9 g as written; 290 in all: 67 / 84 / 95 / 44). Good-fit dishes at that
target went 10/6/14/2 -> 24/30/33/13 (breakfast/lunch/dinner/snack). Rules the
build taught, now pinned by `test:meal-library`: a lean dish needs a protein or
carb food in grams for the fit to move (a counted bagel or wrap strands it), and
a dish built on legumes and rice is leaner than it feels and needs a real
protein food. The gate now holds per-target coverage rather than a per-dish
"half of the grid", because lean dishes serve the leaner half on purpose.

## Decisions taken here, recorded (CSCS delegation: general performance nutrition)

1. Effect: more variety inside the same calorie and protein targets. Nothing is
   prescribed differently; each dish is scaled to the slot budget by the same code.
2. What it takes away: the model is asked less often on the append path. Its
   steering (favourite cuisines) is reproduced in the ranking, not dropped.
3. Fundamentals: protein floor and calorie band are the existing ones, unchanged.
4. No floor or ceiling moves. `MIN_COVERAGE`, the scale limits and the bands are
   read, not edited.
5. Scope: not clinical. Allergen handling is the existing fail-closed diet check.

## Gates

`test:meal-library` (83 checks, 50 mutations, 50 caught): data integrity (every line strict, every food resolves,
names unique per slot, methods free of amounts, dishes slot-appropriate, cuisines
from the app's own vocabulary, enough dishes per slot), the chooser (exclusions,
likes, cuisine spread, rotation, determinism), and the wiring (library first, the
model only for the shortfall, the same acceptance loop). `measure:meal-library`
prints counts per slot and diet and the share of dishes that pass across a grid
of realistic budgets, so a dish nobody can be served is found by measurement.
Every check mutation-tested. Browser drivers for the top-up screens re-run.

## Named, not built

- A database-backed shared library and a per-dish source tag (not needed yet).
- The build script that asks the model for more dishes and adds only the ones
  that pass. It needs her model key, so it runs on her machine; a mocked
  end-to-end gate comes before it is ever run for real.
- Seeding fresh plans from the library (hers to rule); a visible "from our library" label.
- More vegetarian lunches and dinners (28 of each pass the vegetarian check); egg-led dishes cannot be leaned because eggs are counted.
- The ingredient-amount fix (oz, lb, kg, tins, pinch), needed before any outside
  recipe text is ever accepted.
