# The allergy card (his ruling 15 Nov 2026, "Allergy card, peanuts split")

Two live tests found the same gap from both ends. Marcus (tree-nut allergy, carries an adrenaline pen) was stored as a
"Nut-free" diet tick that also bans peanuts and says nothing about how serious it is. A coeliac tester was stored as a
"Gluten-free" tick plus a free-text note ("needs certified gluten-free foods") that "doesn't change your plan by
itself", with oats on her Foods to avoid beside her dislikes, and the coach promised "everything strictly avoids
cross-contamination", which the app cannot check. His ruling, from three options: an allergy is its own record.

## What is kept (one row per allergy, new column `fitness_profiles.allergies`, jsonb, default `[]`)
- **allergen**: one of the UK 14 as people say them: peanuts, tree nuts, gluten (coeliac), milk, egg, soy, sesame,
  fish, crustaceans, molluscs, celery, mustard, lupin, sulphites.
- **adrenaline pen**: yes / no / not said.
- **traces ("may contain")**: avoid / fine / not said.
- gluten only: **coeliac** yes / no, and **oats**: certified gluten-free oats are fine / avoid all oats.

## What each part does
- The allergen drives the meal filters through the one reader every meal path already uses (`mealRestrictionsOf`):
  peanuts -> a new `peanut-free` rule on a new `contains_peanuts` tag; tree nuts -> `tree-nut-free` on
  `contains_tree_nuts` (the 22 foods tagged `contains_nuts` today split by hand: peanuts, peanut butter and peanut oil
  are peanuts; the rest are tree nuts; chocolate bar, cereal bar, granola, muesli, trail mix, protein bar and mixed
  nuts carry both, the safe side). The "Nut-free" tick stays and still means both.
- Coeliac with "avoid all oats" adds an oat rule (`contains_oats` on oats, porridge, granola, muesli, oat milk, oat
  cakes...). Coeliac with "certified oats fine" keeps oats, and the shopping list says "certified gluten-free" beside them.
- Traces and coeliac cross-contamination are things the app cannot see. They change no filter; they change what is
  SAID: the meals keep "filtered, not verified", and the shopping list adds "check the label for a certified gluten-free
  mark" (coeliac) or "check for 'may contain' warnings" (traces: avoid) on the high-risk aisles (stock, sauces,
  cereals, bars, protein powder, baked goods).
- The adrenaline pen changes nothing on a plate. It is told to the coach.
- Every write of a liked food, dish or swap already refuses a food a restriction keeps out (28d812b2); the allergy
  feeds the same restriction list, so nothing more is needed there.

## Where it is set
- Profile, Food, a new **Allergies** row above Diet: add an allergy (pick from the 14), then its two or three taps.
- The coach: "I'm allergic to tree nuts" offers the card (the app's offer, like the pregnancy tick), never saves silently.
- Setup: records the allergen from his words (the existing allergen detection) and nothing more, to keep setup short
  (his 14 Nov "Setup should get SHORTER"); the details are offered on Profile and by the coach. (Question 3 below.)

## The coach
- Never promises what it cannot check: no "strictly avoids", "guaranteed", "completely safe", "free from traces".
  A code check on the reply, like the texting door, replaces such a sentence with the app's own honest one.
- An allergy QUESTION is answered as a question (Marcus's Snickers turn): what the app can check (its own food list)
  and what it cannot (a branded product's label, traces), and for a swap it names alternatives that fit (tamari or
  coconut aminos for soy sauce, for a coeliac), never only a refusal.

## His questions (one at a time when building)
1. With an allergy recorded, should the refusal say "your tree-nut allergy" (true now that it is recorded) or keep
   "your profile says nut-free" (his 18 Oct "Say 'nut-free'")? Recommend: "your tree-nut allergy" when the card says
   allergy, the profile wording for a diet tick.
2. When someone with an adrenaline pen mentions a reaction (swelling, can't breathe, tingling mouth), should the coach
   say "Use your adrenaline pen now and call 999" before anything else? Recommend yes: it is the NHS first-aid line,
   not a diagnosis, and the existing red-flag rule already names a professional.
3. Setup: record the allergen only (recommended, shorter), or ask the pen and traces there too?

## CSCS / scope review
Not a training change. Food safety is filtering on the app's own list and saying plainly what it cannot check; no
clinical nutrition, no diagnosis. The coach's reaction line (question 2) is first aid, his call.

## Needs
A migration (`allergies`), the `chat-gemini` and `generate-meals` deploys (the coach's words; the meal writer's rule
list gains the new rules), and the food table split kept in both copies (`npm run sync:shared`).
