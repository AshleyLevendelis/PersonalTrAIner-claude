# My usual meals first

Ashley, 11 Nov 2026: *"For meal plans how do we ensure we are helping users fit meals around foods they already
enjoy without always prescribing meals they have never had before?"* His ruling the same day, from three options:
**"My usual meals first"**: setup asks what he usually eats, he can add his own meals on Nutrition or by telling the
coach (his fridge included), and about half of each week is his own meals resized to his targets, the rest new.

Status: **the ranking, the mark, the screen's "My meals" and the coach's two add routes are BUILT (11 Nov 2026).
Setup's question and the meal writer's half are not.** See "What was built" at the end. The trace behind it is in
BACKLOG (11 Nov, "his four points").

## What exists today (traced, read from source)

- **A like** is a phrase on Profile ("Foods and meals I like") or said to the coach, or a heart on a meal. It steers
  what the meal writer writes (up to a half of a meal's options), takes up to half of a week's menu of eight, and the
  day's pick prefers a day with at least ONE liked dish. It is matched as one phrase against a dish's name and
  ingredient names, so "chicken and rice" as one like matches almost nothing.
- **His own meal**: the coach can add a dish by name (re-portioned to the meal) or from his own foods at his own
  amounts. It joins that meal's options, tagged as asked for, and is served on the day asked. Nothing after that
  makes it come round: in a deep pool it is one dish in a hundred.
- **The screen** cannot add a meal at all (one of the two coach-only entries in the parity list, on the reason that
  a dish NAME is a model call).
- **Setup** never asks what he eats now.

## The design

**1. A familiar dish is a fact about a dish, not a phrase.** A dish is FAMILIAR when he added it (a new mark,
"my meal", written by the add routes below) or hearted it. Edited and resized copies carry the mark of the dish they
were made from and no more: a copy the app made for one day is not a second meal of his.

**2. Familiar dishes come first, about half.** Two places, the ones likes already use:
- the week's menu: familiar dishes take the first call on the liked half of each meal's menu (up to four of eight),
  ahead of dishes that merely contain a liked food;
- the day's pick: a new sort key, after the variety keys and before the like key: how far the day is short of half
  its meals being familiar. Like every preference here it is a SORT KEY among days already on target, never a
  penalty, so it can never buy a day that misses his numbers.
- **Variety stays outermost** (his 28 Sep and 29 Sep rulings). With two usual dinners he does not get them on
  alternate nights for ever; he gets them as often as "not yesterday, not in the last three days" allows. "About
  half" is therefore a ceiling the app works towards, reached only when he has enough usual meals. That is said on
  the screen where he adds them.
- A liked FOOD keeps its own rule (once a day is enough: the salmon rule).

**3. A like that names several foods matches a dish with all of them.** "Chicken and rice", "porridge with banana":
split on "and", "with", "&", commas; every part must be found. Mechanical; today such a like does nothing.

**4. Add my own meal, on the screen.** Nutrition, the "＋ Add" sheet: a name, which meal, and its foods one per
line with amounts ("2 eggs", "2 slices toast", "150g chicken breast"). No model is involved: the foods are read by
the same reader and costed from the same table as everything else, a line it cannot read is asked about in place
(his 1 Oct ruling), and the dish goes through the same check as the coach's (diet, avoids, allergens). The card
shows the dish re-portioned to that meal and says it joins his options and comes round first. This closes the
"add a meal" half of the parity list for a meal he can describe; "a dish by NAME, work out its ingredients" stays
the coach's, because that part is still a model call.

**5. The coach.** Its two add tools write the same mark. A new line in its instructions: when he lists what is in
his fridge or what he usually eats, offer dishes built from those foods as additions, one card each, never more
than three in a turn; amounts he did not give are asked or re-portioned exactly as today.

**6. Setup asks once.** One optional question after the food questions: "What do you usually eat? A few meals or
foods you have most weeks." What he says is kept as likes (the existing rows, so it shows on Profile and can be
changed there) and handed to the meal writer, which is asked to write each named MEAL as its own dish for the meal
it belongs to; a dish that comes back for a named meal is marked as his. Never blocks setup.

## Safety and honesty

- Nothing here loosens a check. A usual meal that breaks his diet, an avoid or an allergen is refused or asked about
  by the checks that already exist; a kept meal he now avoids is still not served (his 27 Sep ruling).
- The app does not claim "half your week is your own meals". It says his meals come first and how many he has.
- A familiar dish is re-portioned to his targets like any dish: the same dish, a different amount, stated on the card.

## What decides "done"

- `test:usual-meals`: the mark, the menu order, the day key (with a case where the key binds and one where variety
  outranks it), the split-phrase matcher, the screen builder's refusals. Mutation-tested.
- `verify:usual-meals`: the Add sheet at phone size: an unreadable line asked in place, the card, the dish in the
  day strip after confirm.
- `measure:` familiar share of a week with 2, 4 and 8 usual dinners, and days on target before and after (it must
  not fall).
- Coach half: source checks and an exam case; whether the coach offers fridge dishes is model behaviour.
- Needs the `chat-gemini`, `generate-meals` and `onboarding-chat` deploys for the coach, the writer and setup's
  question. The screen's Add and the ranking work without them.

## Not in this plan

Meals cooked for him elsewhere (work, a canteen menu): `docs/plans/meals-cooked-elsewhere.md`, its own ruling.

## What was built (11 Nov 2026), and where it differs from the plan above

- **Familiar is a mark on a dish** (`my-meal`, or a heart), as planned. Both of the coach's add routes write it, so a
  meal added by telling the coach is one of his with no deploy.
- **The week's menu** takes his dishes first on the liked half. **The day's pick** works towards half the day's meals
  being his, as one key after the variety keys. **Changed from the plan:** a meal of his counts towards that only once
  it has RESTED (not served in that meal in the last three days). Without it the key decided which meal came back
  when something had to, and brought his back a day early.
- **A like naming several foods** matches a dish holding all of them, as planned.
- **Add my own meal is on Profile, under "Foods and meals I like", not on Nutrition's Add sheet.** That is where he
  already tells the app what he eats, and the two lists read as one thing. Nutrition has no route to it yet.
- **Three versions of a typed meal are tried, not one**: re-portioned the way the library's own dishes are, then sized
  by energy alone, then kept exactly as he wrote it. The first that can be part of a day on his targets is kept; when
  none can, it is kept as written and the card says it will not come up often. Measured before this: sized by energy
  alone, 150 g of chicken with rice became 350 g to fill a dinner. A usual meal the app cannot size (porridge and a
  banana) was being REFUSED; now it is kept at his amounts.
- **Found and fixed on the way: the same dish on a Wednesday and again on the Thursday.** A week's days are worked out
  as a cycle of seven starting on a Thursday, each day avoiding the days before it, and the first day of a cycle
  avoided nothing. His meals are on every week's menu, so they were the dishes it happened to most. The cycle's last
  day is now told what the next first day serves (this cycle's own, or the next week's menu's). It was already
  happening to ordinary plan dishes.
- **Measured** (`npm run measure:usual-meals`: 22 ordinary meals as typed, 5 targets, a real-sized plan, 28 days,
  leftovers off):
  - typed meals kept: 105 of 110 (5 refused: one food the app has no figures for); 79 of the 105 can be part of a day
    on target (60 before the three versions).
  - his own share of what is served: 9.8% with 2 usual dinners, 19.8% with 4, 48% with a full set across the meals
    (3 breakfasts, 3 lunches, 4 dinners, 2 snacks), on 98% of days.
  - days on target: 140 of 140 before and after, in every row.
  - the same dish two days running: 13 in 560 servings with no usual meals (was 18 before the cycle fix); 0 of his in
    every row but one (1 in 560).
- **Not built:** setup's question; the meal writer being told his usual meals; a route from Nutrition; an exam case.
  The coach is not told anything new: its two add tools already do this, and now mark the dish.
- **Named limits:** with usual dinners only, nearly every dinner served is one of his (four usual dinners: 79% of
  days), so "about half" is a share of the whole day, not of each meal. A meal of his held as a pick on another date
  and then removed is unverified. Never run on a real phone or against his own saved meals.
