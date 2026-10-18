# Runs 7-10, Batch 1 — safety (H41, H34, H33), 18 Oct 2026

Ashley tested the live build (main, 2b096a93) as "Sam": home, adjustable dumbbells to 24 kg and a flat bench ONLY,
bodybuilding, fat loss, shoulder flag, TREE-NUT ALLERGY, no pork, no mushrooms. Each item below is a symptom she saw;
the causes were traced before anything was built (three read-only traces, cited in BACKLOG).

## H41 — a named allergen is a preference to the coach

**Cause, traced.**
1. There is no allergy field. A tree-nut allergy is stored only as the diet tag `nut-free` in
   `dietary_preferences`, the same list as vegan or keto, so the app cannot tell an allergy from a choice; the coach
   is told "Dietary Restrictions: nut-free" and never the word allergy.
2. **The swap builder substitutes silently.** `buildMealSwapProposal` looks the named dish up in the slot's pool;
   when the name is not there (almond butter on toast never is), `requested` is undefined and the code falls through
   to `nextPoolOption`, which handed Sam a protein shake. Asked for X, given Y, nothing said.
3. **Nothing checks the food the user NAMED.** The pool filter checks pool meals; the only guard on a named food is
   `explainRejection` on the add-a-meal path, which runs after the model has already offered to build the dish.
4. The prompt tells the model the add path "will refuse it if it clashes", so it defers to the app instead of warning.

**Her ruling, 18 Oct 2026, from three options: "Say 'nut-free'"** — over adding an allergy mark (a migration) and
over saying "allergy" for every nut-free profile (untrue for someone who avoids nuts by choice). The words:
*"Almond butter has tree nuts in it, and your profile says nut-free, so I won't suggest it or add it to your meals."*
Every allergen-type diet is still enforced as strictly as an allergy; only the sentence is about what is stored.

**Her second ruling, the same day**, asked because the coach's own words after the sentence could still offer to add
the food (what Sam saw, and the app cannot guarantee the coach obeys a prompt): *"If the user has specified an allergy
dont offer to add it to a meal. Refuse and say if they dont have an allergy they should go to the settings and update
the allergy."* So on an ALLERGEN filter the reply is the app's refusal and nothing else: the sentence, then *"If you
don't have a nut allergy, change it on Profile, under Food, Diet."* (Profile's Food group, Diet row, the one screen that
edits the restriction; a gate checks the place exists). The coach's words are dropped on that turn only. A diet
(vegetarian) or the avoid list is not an allergy: a card is still refused with the sentence, prose is left alone.

**Build (code first, because code is the half that is enforced):**
- One pure function, `namedFoodClash(message, dietaryPreferences, dislikedFoods)`: the foods the message names
  (`findFoodsNamedIn`, the food database's own scanner, plus the allergen word list for words the database has no
  entry for) checked against `FORBIDDEN_TAGS` and the avoid list through the app's existing matchers. Returns the
  food, what it contains and the restriction, or null.
- On any turn whose message names a clashing food: **no meal card is built** (swap, addition, custom meal), and the
  reply **starts with the app's own sentence** above, whatever the model said. A log of something already eaten is
  not blocked (it is a record of what happened), but still opens with the sentence.
- The swap builder never substitutes: a named dish that is not in the pool is refused in words ("That isn't one of
  your saved snacks…") and handed to the add path, never rotated past.
- Prompt (needs the `chat-gemini` deploy; model behaviour, graded by the exam, not enforced): the profile line says
  which restrictions are allergen filters; a request naming a restricted food is answered by saying so first and
  never with an offer to build it; the "the app will refuse it" lines no longer invite deferring; no "pre-verified"
  or "verified pool" in anything the coach is told to say (L59).
- NOT built (her ruling): an allergy mark. Named: an allergy said to the coach AFTER setup goes to memory, not the
  diet filter (the comment claiming otherwise in `meal-swap-proposal.ts` is wrong and is corrected).

## H34 — the kit list is the tier's assumption, not what Sam said

**Cause, traced.** With no kit statement recorded, the ticks and the generator both use the equipment tier's set.
Sam's nearest tier is Minimalist ("no barbell or bench"), whose assumption is dumbbells, kettlebell, bands, pull-up
bar and bag — exactly what Profile ticked, bench unticked, and why bands and a kettlebell swing reached his plan. The
catalogue tags are right: every band exercise carries `resistance band` and the swing carries `kettlebell`. Setup
records a kit statement only if the setup model emits it AND every item is in his own words; nothing in code catches
"dumbbells and a flat bench" if the model does not.

**Build:**
- A code backstop in setup, the same shape as the allergen backstop: Sam's own message is read for a kit statement
  through the existing parser and own-words guard, and recorded as `only:` when he lists his kit. Then the ticks and
  the plan are what he said.
- The swap sheet's "I haven't got the kit" gains "Update what I have, for good", which opens the same ticks Profile
  uses (the one kit controller: priced and shown before Save, and the plan rebuilt from it). The tier options stay,
  labelled for what they are: a change for this week. This answers her open question in `kit-list.md`.
- Asked her, 18 Oct 2026: when someone picks a home equipment option in setup, should setup show the ticks once?
  **Her ruling, from three options: "Show ticks once"** — over keeping her 9 Oct "no new setup question" and over
  assuming dumbbells only. One screen, home options only, pre-ticked with the guess; the plan is built from what is
  left ticked. It partly REVERSES her 9 Oct "no new setup question"; she was told so in the question.

## H33 — a failed lookup is the whole reply

**Cause, traced.** `propose_exercise_swap` is a courier; the client resolves `new_item` against the catalogue, and on
no match returns one sentence that becomes the entire bubble ("I don't have 'Dumbbell Step-Up' in the exercise
library — try another name for it"). The model never sees the failure.

**Build:** a name the catalogue cannot resolve is answered with real alternatives: the old exercise's same-pattern
peers that the person's own kit allows (the generator's own `allowedEquipmentFor`), named and offered as the swap's
choices, never a dead end. When the message also states missing kit, the kit-change offer goes with it.

## CSCS review (H34, H33 change what is prescribed)
1. Effect: removes exercises Sam cannot perform; a prescription he cannot do has no training effect at all.
2. Takes away: band and kettlebell work for people who have none. Nothing for people who have it (no statement, no
   change; the 9,216-profile grid is untouched because the tier sets do not change).
3. Fundamentals: the kit controller rebuilds through the shared rebuild, which keeps pattern coverage.
4. No floor or ceiling is redefined.
5. In scope.

## Checks
`test:named-food-clash` (pure function and wiring), `test:kit-list` and `test:swap-target` extended, a browser driver
for the coach's refusal and for the swap sheet's kit route; each mutation-tested. Deploys: frontend; `chat-gemini`
for the prompt half; `onboarding-chat` is not needed (the setup backstop is client code).
