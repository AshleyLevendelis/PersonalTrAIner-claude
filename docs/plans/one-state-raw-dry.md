# One state: counted, shown and shopped raw or dry (runs 7-10, H36 / M64), 18 Oct 2026

Her fix, in the bug list: **"every ingredient is counted, shown and shopped in the same state (raw/dry)."** Then measure
across the meal pool and the library: how many dishes were wrong, and by how much.

Her ruling the same day, asked how a line reads, from two options: **"Dry, plus cooked hint"** —
*"71g dry rice (about 200g cooked)"*, over the dry weight alone.

## What is already true (run 7, H32, on this branch, not live)

A stored meal is costed from its own lines with today's table on every read (`readPools` → `costStoredMeal`), so
"177g raw chicken breast" is costed as raw chicken, and the H32 numbers match her estimate (~540 kcal / 53 P / 45 C).
That fixed the *counting*. It did not fix what is *shown* or *shopped*.

## Causes, traced

1. **H36, two portions of one dish costed two ways.** The leftover lunch is always re-costed from its scaled lines
   (`leftoverLunchFrom`, "recomputed, not multiplied"); the dinner showed its STORED numbers. H32 makes both read
   from lines, except one path: when a stored dinner's lines cannot be costed well (`costStoredMeal`'s fallback keeps
   the stored numbers whole), its leftover lunch is still re-costed from lines with no such check. Same dish, two ways.
2. **M64, the list buys "potato boiled" and "sweet potato baked 190g".** The list converts cooked rice, pasta and
   other grains to the bag (`AS_BOUGHT`, kcal-ratio factors) but has no entry for boiled/baked potato or sweet potato,
   and buys cooked meat and fish at their cooked weight. Its gate asks only about foods named "cooked", so "boiled"
   and "baked" slipped through. ("pasta cooked" / "white rice cooked" on her list cannot come from today's builder:
   most likely rows saved before the 9 Oct conversion and never rebuilt. Rebuilding the list fixes them.)
3. **Shown cooked.** Meal lines are written cooked by default: the meal writer is told "a weight is the COOKED
   weight unless the line says otherwise", and the library's 147 starch lines are all cooked/boiled/baked. The card
   shows the line as stored.

## Build

1. **One conversion, from the food table itself.** `asWeighed(line)`: when a line's food is a cooked entry with a
   dry or raw twin, the line becomes that twin at the weight that holds the same amount of the nutrient the food is
   mostly made of (protein for meat and fish, carbs for grains, potatoes and lentils; `weighedFactor`), rounded to
   the gram, and named
   CHANGED WHILE BUILDING (measured): the plan said "the same energy". Measured over all 21 pairs, energy and the main
   nutrient agree within a few percent for 20; for chicken thigh USDA's roasted and raw figures disagree, and the
   energy factor turned 26 g of protein into 34 g. Cooking moves water, not protein or starch, so the main nutrient is
   the honest factor; thigh's energy is what moves (about 24% lower), named in the gate rather than hidden. The list's
   factors are read from the same function, so the grain factors moved slightly too (rice 0.36 -> 0.35).
   in the person's own word with the state in front ("cooked spaghetti" → "dry spaghetti", "chicken breast" → "raw
   chicken breast"). The new name is PROVED through the real lookup: if it does not resolve to the twin, the twin's own
   name is used. A food with no twin is left exactly as it is (tinned beans, a sauce).
2. **Potatoes get their raw twin**: `potato raw` (USDA 11352) for boiled and baked potato, and the existing
   `sweet potato raw` linked to `sweet potato baked`. Both copies of the food table (the coach's is held
   byte-identical).
3. **Applied where lines come in**: every stored meal on read (`readPools`, before costing), and every new dish at
   verification (generated, library, asked-for, custom), so the card, the day, the leftovers, the edits, the list
   and the coach all see one state. Nothing is written back; the stored row is converted each time it is read.
4. **The card's hint**: the card shows "(about 200g cooked)" after a dry or raw line with a cooked twin, worked out
   from the same factor, rounded to 10 g. The hint is drawn, never stored, so it can never be read as an ingredient.
5. **H36's last path**: the leftover lunch is costed by the same rule as the dinner it comes from
   (`costStoredMeal` on the scaled lines, with the scaled stored numbers as its fallback), never one way for the
   dinner and another for the lunch.
6. **The list**: boiled/baked potato and sweet potato gain their bag factors; raw potato passes through; the gate
   asks about every cooked state word (cooked, boiled, baked, roasted, steamed), not only "cooked".
7. **The meal writer** (`generate-meals`, needs its deploy) is told to write grains and potatoes dry/raw and meat and
   fish raw. The read converts whatever it writes either way, so the deploy is tidiness, not correctness.

## Measure

- The library (290 dishes): how many lines and dishes are converted, and the largest change to a dish's calories,
  protein, carbs and fat after conversion (`measure:one-state`). RESULT, 18 Oct: 229 of 1,578 lines in 168 of 290
  dishes were written cooked. Largest change to a dish: calories -15.6% (a chicken-thigh dish), protein -6.8%,
  carbs -3.4%, fat -48.8% (a small number: cooked grains carry a little more fat than dry ones a gram of starch).
- H36 rebuilt: the Bolognese dinner and its leftover lunch cost the same per gram.
- **Her own stored pools: not measurable from here** (no database). The read converts them regardless.

## CSCS review

Population nutrition (mine under the delegation): 1. effect: what she weighs and what the day counts are the same
food in the same state, so the targets are hit with what is on the plate. 2. what it takes away: nothing; a few
percent of energy moves on some dishes, thigh up to a quarter, named. 3. fundamentals: protein, the number a deficit
protects, is carried exactly. 4. no floor or band redefined. 5. not clinical.

## Checks

`test:one-state` (the conversion, the twins, the hint, the read, verification, leftovers, the list), extended
`test:grocery-shopping`, a browser driver on Nutrition reading a card line and its hint, every check mutation-tested.
Deploys: frontend; `chat-gemini` (its food table copy gains the raw potato); `generate-meals` (the writer's rule).
