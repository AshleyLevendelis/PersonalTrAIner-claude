# Meals cooked for him elsewhere

Ashley, 11 Nov 2026: *"I have breakfast and lunch cooked for me at work Monday to Friday and the menu varies. It
would be good if I could let the coach know ... what the work menu is this week and the coach help plan my meals with
this."* His ruling the same day, from three options: **"Set days + optional menu"**, amended in his own words:
**"I dont want it to stop posing the meals, I want it to incorporate the meals into its plan."**

So: he says once which meals are cooked for him on which days. Those meals STAY in the day's plan, shown and
counted. They are never shopped for. If he tells the coach the menu, each meal is estimated and his dinner and
snacks fit around it; if he says nothing, a normal-sized meal is assumed. An estimate is marked as one.

Status: **plan, nothing built.** This one touches the allergen path and needs a database step, so it is written
out before any build.

## What exists today (traced, read from source)

- A day's meals are not stored: each date and meal names a dish from the pool (a "pick"), and everything else is
  worked out. A pick can be written for a future date. A dish can be marked so it is served only where a pick names
  it, which is how an edited copy is kept out of every other day.
- A dish he pins re-plans the rest of that day around it (his 1 Sep "plan the rest of my meals").
- A meal he has eaten stays as eaten and the rest of today fits around it (10 Oct).
- Every dish is checked before it is kept: every food identified, amounts readable, his diet, avoids and allergens.
  A dish the app cannot identify against a restriction is "can't confirm", and is blocked (20 Oct). A food he names
  that clashes with an allergen on his profile is refused in his words (18 Oct).
- The shopping list buys for every meal of every day on it.
- Nothing knows about weekdays. Meals a day and snacks are one setting for every day.
- A remembered fact can only be one of four kinds, enforced by the database, and none fits "lunch is cooked for me
  on weekdays". So the standing answer needs a new column.

## The design

**1. The standing answer.** Profile, Food: "Meals cooked for me", a small grid of meals by weekday (tick breakfast
and lunch, Monday to Friday, in two taps with a "weekdays" shortcut). The coach has the same thing as an offer card
(`propose_meals_elsewhere`) when he says it in chat; setup records it when he volunteers it and does not ask.
Stored on his profile, so it follows him to another phone.

**2. What a cooked-elsewhere meal is in the plan.** For each date and meal the answer covers, the day holds a row
drawn like any meal, with a quiet label ("At work"), in one of two states:
- **No menu given**: "A normal-sized lunch, about 650 kcal and 45 g protein", which is that meal's own share of his
  day. The rest of the day is planned exactly as it would be around a plan dish of that size. Marked "assumed".
- **Menu given**: the dish he named, with the app's estimate of it, marked "estimate". The rest of that day re-fits
  around it by the route a pinned dish already uses, and the card says by how much dinner and snacks moved.
Derived, not stored, for the no-menu state: nothing is written until he gives a menu, so changing the standing
answer changes every future day at once and leaves no orphans.

**3. Telling the coach the menu.** "Work menu this week: Monday chicken curry and rice, Tuesday ..." The coach
breaks each dish into foods with ordinary portions and says they are assumed (the rule its meal logging already
follows); the APP costs them from its own table and builds one card listing each day's estimate and what moves.
One tap keeps them. Each kept meal is a dish served only on that date and meal (the copy mark above), so a canteen
curry never turns up on a Sunday. He can correct a portion afterwards the way he corrects any logged meal.

**4. The allergen path: existing rulings, applied unchanged.** Nothing is loosened for a meal somebody else cooks.
- A work dish naming a food that clashes with an allergen or diet on his profile is not put in his plan, and the
  reply is the app's sentence from his 18 Oct ruling, naming the food and where to change the profile.
- A work dish with a food the app cannot identify, for someone with a restriction, is "can't confirm": it is not
  kept as an estimate, the meal stays in the "normal-sized, assumed" state, and the line says which part could not
  be confirmed and to check with the kitchen. For someone with no restriction it is asked about ("roughly how many
  grams?") as any unread line is.
- The assumed state claims nothing about what is on the plate, and says so: the app does not know what the kitchen
  serves and never says the meal fits his diet.

**5. Shopping.** A cooked-elsewhere meal is never on the list, in either state, and the list says how many meals it
left out and why, once, so a short list is not a surprise.

**6. Logging.** On the day, the row logs like any meal ("I ate this"). If what he ate was different he tells the
coach, and the existing "stays as eaten, the rest of today fits around it" rule does the rest.

## The database step

One new column on the profile for the standing answer. It needs his word and his machine (`db:push-both`), and the
app must work on both sides of it: reads take the whole row and default in code; the write retries without the
column and says the setting could not be saved yet (the pattern the reminders switch used).

## What decides "done"

- `test:meals-elsewhere`: the covered dates, the assumed meal equals the meal's own share, the rest of the day
  unchanged in the assumed state and re-fitted in the estimate state, the list leaves them out, each allergen case
  above with its own sentence, and a dish kept for one date is never served on another. Mutation-tested.
- `verify:meals-elsewhere` at phone size: the grid, a weekday's Nutrition day with the two rows labelled, the card
  for a week's menu, the shopping list line.
- Coach half: source checks, `coach-parity`, exam cases (a menu given; a menu with an allergen). Needs the
  `chat-gemini` deploy. Whether the coach breaks dishes down sensibly is model behaviour.

## Open, his to say when it is in front of him

- The wording of the two labels ("assumed", "estimate") and the "At work" label (it may not be work).
- Whether setup should ask about it. This plan does not: it records it only when volunteered.
