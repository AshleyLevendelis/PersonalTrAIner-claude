# Making the meal plan something people come back to

Asked by Ashley, 19 Sep 2026: *"What would be ways in which you would improve
the meal generation to drive user engagement"*.

Report only. Nothing built. Everything in §1 was MEASURED today by reading the
code; everything in §2 is a proposal and needs her word, because what the app
says, how often it speaks, and what it offers are hers to decide.

**The professional frame, so the ranking is not a taste call.** At the
population level the nutrition outcome that dominates every other is
ADHERENCE. A day of meals that hits the targets and does not get cooked scores
zero. So the ranking below is by "how much does this change the odds the food
actually gets eaten", not by how clever it is.

---

## 1. What is true today — measured

### 1a. The same three meals, every single day

`assembleDay` searches every combination of the pools and keeps the one closest
to the day's targets. It is deterministic for fixed inputs — the grocery
module's own header says so. It takes a `recentNames` argument whose whole job
is to stop today repeating yesterday.

**The app's own screen passes it `{}`** (`App.tsx:328`). The variety rule is
wired, documented, and switched off on the surface a person actually looks at.
So until the targets move or the pool is regenerated, breakfast, lunch and
dinner are the same dishes tomorrow, and the day after.

**And the shopping list disagrees with the tab.** `assembleHorizon`
(`grocery-store.ts:625-656`) threads `recentNames` forward across seven days
exactly as intended, so the list is built for a VARIED week — a week the
Nutrition tab will never show. The list shops for meals the plan does not
serve.

This is the biggest one. It is also the cheapest: one argument at one call site,
plus deciding where "what you had yesterday" is read from.

### 1b. The recipe is generated and then thrown away

The edge function asks for, and Gemini returns, a `prep` field — the cooking
method — for every dish (`generate-meals/index.ts` prompt, `RawProposal.prep`).

It is used twice: to guess whether a dish is too heavy for breakfast, and to
tag it `quick` or `standard`. Then it is discarded. `PoolOption` has no field
for it and `meal_plan_slots` has no column for it.

So a person is handed *"Harissa Salmon with Lemon Couscous — 165g salmon fillet,
80g couscous, 1 tbsp olive oil…"* and no instructions. The app already paid for
the words and then dropped them on the floor.

### 1c. Five options per slot, and that is the whole world

`DEFAULT_POOL_SIZE = 5`. Until something regenerates, breakfast is one of five
dishes for as long as the plan lasts. Asking for another meal walks the same
five.

### 1d. Nothing ever asks whether it was any good

There is no rating, no thumbs, no favourite, anywhere in the meal code. Logging
records that a meal was eaten, never whether it was worth eating again. The
pool therefore cannot improve, and a dish someone quietly hates sits in
rotation for ever. The only channels that feed back are the hard dislike ban
and the soft "I love salmon" like — both typed by the user, neither observed.

---

## 2. What I would do, ranked by effect on adherence

### 1. Turn the variety back on, and make the tab and the shopping list agree
Measured gap, not a new feature. The day-to-day variety tiebreak exists, is
tested, and is fed an empty history by the one screen that matters.
**Cost: near zero. Effect: the plan stops looking finished on day two.**
Decision needed from Ashley: does "recently" mean the last 3 days of what the
app SHOWED, or of what she actually LOGGED eating? I recommend what she logged
— a meal she swapped away from should not count as had.

### 2. Keep the cooking method
The app is already buying it. Storing it turns a shopping list into something
cookable without leaving the app. **Cost: a column, a field, and a place on the
card to put it.**

### 3. Ask one question after a logged meal
"Worth having again?" — two taps, once a day at most. It is the only way the
pool can get better rather than just bigger, and it is the input a real
nutritionist would take on the second consultation.
Decision needed: whether the app is allowed to ask at all, and how often. This
is squarely hers.

### 4. Top the pool up in the background instead of on demand
Today the pool only deepens when someone asks. A slow drip — one new dish per
slot a week, weighted toward whatever rated well — means the plan is never the
same plan twice and no one ever has to press a button to get variety.

### 5. Cook once, eat twice
Nothing in the generator knows about leftovers. Deliberately proposing a dinner
that portions into tomorrow's lunch is the single change most likely to make a
week's plan survive contact with a Wednesday. It is a real prompt change and a
real constraint on the assembler, so it is the largest of the five.

---

## 3. What I did NOT propose, and why

- **Photos of the dishes.** Every image would be either generated (and so a
  picture of food nobody will produce) or licensed (a cost, and a catalogue to
  maintain). The app's standing rule is that it never shows a number it
  invented; a picture is the same promise in a louder form.
- **Streaks, badges or scores on the food side.** The app already holds the
  line that the plan-quality score stays behind the scenes. Gamifying eating is
  also the one place where an engagement mechanic can push against the goal.
- **Anything that notifies.** That belongs with the mobile/notification work
  already deferred, not bolted onto meals.
