# Handoff: Nutrition tab — rings card, clearer meal rows, and the week ahead

Approved by Ashley on 11 Nov 2026 in the design project (pages *Nutrition Numbers* and *Plan Views*). **Nutrition tab only.** Home, Exercise, Tools and Chat are unchanged. The Exercise look-ahead is a separate, later handoff.

Build exactly the three screens in `Nutrition Week.dc.html`:

| Id | Screen | What it is |
|---|---|---|
| **N1** | Today | The rings card (option **3d**) and the meal rows (option **M2**) |
| **W1** | A future day tapped in the strip | The rings card shows that day's **planned** totals |
| **W3** | Week view | The next seven days on one screen; tap a day to open its meals |

Open the file in a browser with `support.js` beside it. It is a **design reference built in HTML**, not production code. Recreate it inside the existing React + Tailwind code using the app's tokens, lucide icons and theme system, so all nine themes keep working. The hex values below are the default dark theme as drawn.

**Fidelity: high.** Layout, sizes and copy are final. All meals, numbers and dates in the file are **sample data**. Every real value comes from the app's existing data (see "Data: nothing new").

---

## Decisions this changes — record them

- **"Rings live on Home only"** (CLAUDE.md, his rulings of 17 Oct 2026, one-page tabs) is **reversed for Nutrition**: Ashley chose the 3d rings card on 11 Nov 2026 ("I want one circle with all the rings inside it like I used to have before, including water"). Home keeps its own rings. Record the new ruling in CLAUDE.md and BACKLOG, with the date and his words.
- Meal macros: he rejected boxed tiles and plain text, and chose **M2** (the split bar).
- Week view: he chose **W1 + W3**. He rejected W2 (a long scroll of full day cards).

---

## Shared tokens (default dark theme)

- **Page:** `#1A1636`. Card `#221C48`.
- **Hero card:** radial mint glow `radial-gradient(120% 90% at 100% 0%, rgba(91,233,194,.20), transparent 55%)` over `#221C48`, border `1px rgba(91,233,194,.30)`, radius 24, padding 20.
- **Ink:** `#F5F3FF`, secondary `#C2BCE8`, muted `#9A93C9`. Hairline `rgba(245,243,255,.10)`.
- **Ring and macro colours:**
  - Calories: mint `#5BE9C2`.
  - Protein: `#8B7BFF` (ring and bar); text label `#B4A9FF`.
  - Carbs: `#FFB454`.
  - Fat: `#C2BCE8`.
  - Water: `#6FB7FF`.
- **Selected future day:** violet. Border `rgba(180,169,255,.7)`, fill `rgba(139,123,255,.16)`, kicker text `#B4A9FF`.
- **Verdict:** "on target" in mint. A miss is in white `#F5F3FF` with a 13 px warning-triangle icon in front (lucide `triangle-alert`), e.g. `⚠ 330 kcal under`. **Not amber:** the warning amber is almost the carbs colour, so on this screen it read as carbs (his ruling, 12 Nov 2026, option 1).
- **Type:** Space Grotesk. Numbers in `ui-monospace` where noted.
- **Tap targets:** at least 44 × 44.

---

## N1 — Today

**Header:** day kicker (`Wednesday`), title `Nutrition`, and a **`Week ▾` pill** on the right that opens W3. Then the existing day strip ("keep it on top", his 17 Oct ruling).

**Rings card** (replaces the current calorie and macro card):

1. **Top row:**
   - Left: `Today · 2 of 3 meals` (mint kicker).
   - Right: a `+ Water` pill (blue outline). It logs water through the existing water action, the same one as today's water cell, so his 17 Oct "water from Nutrition" ruling holds.
2. **One circle, 196 px, five concentric rings**, from outside in:

   | Ring | Radius | Stroke |
   |---|---|---|
   | Water | 94 | 6 |
   | Calories | 80 | 13, slight mint glow |
   | Protein | 63 | 9 |
   | Carbs | 50 | 9 |
   | Fat | 37 | 9 |

   - Each ring has a faint track `rgba(245,243,255,.09)` and round caps, and starts at 12 o'clock.
   - Fill = eaten ÷ target, capped at 100%.
   - In the centre: calories left (mono 16/700, mint) over `kcal left` (9.5px).
   - Give the SVG `role="img"` with an `aria-label` that says what it shows.
3. **Five legend rows** under the circle, each 40 px with a hairline above. A row reads: 10 px swatch · name (14/600) · `eaten / target` (mono 14, eaten bold) · `N left` (12, right-aligned).
   - Kcal: `1,630 / 3,040` · `1,410 left`. No unit on this row; the name says it.
   - Protein, Carbs and Fat: grams.
   - Water: litres.

**Meal rows (M2):**

1. **Top line:** the existing status circle or tick (eaten, next, later) on the left, unchanged. Then:
   - Slot label (10.5 uppercase), with `· eaten` once logged, or `· leftovers` in amber `#FFC47A` when the meal is last night's dinner (`leftoverFrom === 'dinner'`).
   - Meal name, 15.5/600.
   - On the right: an 8 px mint (`#5BE9C2`) swatch, radius 3, then calories as mono 17/700, with `KCAL` 10 px underneath. The swatch matches the protein, carbs and fat swatches, so calories carry their ring colour too (his comment, 12 Nov 2026).
2. **Split bar:**
   - 8 px tall, fully rounded, 2 px gaps between segments.
   - Three segments sized by each macro's share of the meal's energy: protein g × 4, carbs g × 4, fat g × 9.
   - Colours: protein `#8B7BFF`, carbs `#FFB454`, fat `#C2BCE8`.
3. **Legend line** under the bar, gap 12: `■ 42g protein  ■ 92g carbs  ■ 18g fat`.
   - 8 px swatch in the macro colour.
   - Grams in 14/700 white.
   - The word in 13 `#C2BCE8`.
4. Tapping a row still opens the existing recipe sheet. Keep every existing control: chevron, Grocery list pill, `+` for off-plan food.

## W1 — a future day tapped in the strip

1. **Strip and header:**
   - The tapped day takes the violet selected style. Today keeps its mint text.
   - The header kicker becomes the tapped day's name (`Friday`).
   - `Week ▾` stays on the right.
2. **Rings card, "planned" state** (violet border `rgba(180,169,255,.35)`, no mint glow):
   - **Top row:**
     - Kicker `Friday 18 · planned` in violet.
     - On the right, the day's verdict from the existing **`dayVerdictLabel(totals, targets)`**: `on target` in mint, otherwise exactly what it returns (`330 kcal under`, `protein 26 g over`) in white with the warning icon in front. Never write a separate verdict.
   - **Circle:** 150 px, four rings (calories, protein, carbs, fat), each filled by **planned ÷ target**. **No water ring**, because water isn't planned.
   - **Beside the circle, four rows:** swatch · name · `planned/target` in mono.
   - **Footer:** a full-width pill, `🛒 Add Friday to the shopping list`. This is the strip's existing add-day action, moved into the card.
3. **Below the card:** `FRIDAY'S MEALS`, then that day's meals as M2 rows, with no status circles because none can be eaten yet.

## W3 — the week on one screen

Opened by the `Week ▾` pill on N1 or W1. The pill reads `Week ▴` here and closes the view.

1. **Header:** kicker is the date range (`16 – 22 September`), title `Nutrition`.
2. **One row per day** for the same seven days as the strip (`useMealDays`): today plus six.
   - **Height and spacing:** min 64 px, radius 18, 8 px gap.
   - **Mini rings:** 44 px, four rings (calories, protein, carbs, fat) filled by **planned ÷ target**.
   - **Day:** `Today` in mint, otherwise `Thu 17`.
   - **Right:** the same 8 px mint swatch, then the day's planned calories (mono 14/700) + `kcal`.
   - **Second line:** the meal names joined by ` · `, on one line with an ellipsis.
   - **Chevron:** ▾.
   - **Today's row** has a mint tint and border.
3. **Tap a row to open it in place.** Only one day is open at a time.
   - The open day gets a violet border.
   - Its header shows `2,710 kcal · ` + `dayVerdictLabel`.
   - Under it, that day's meals as M2 rows.
4. **Footer:** a full-width `🛒 Shop the whole week` pill. It opens the grocery list on the existing **7-day** choice, which rebuilds at once (his 8 Nov ruling). No new list logic.

---

## Data: nothing new

Everything shown already exists. This is presentation only:

- **Days and meals:** `useMealDays`, the same 7-day window and derivation as the strip.
- **Totals and verdict:** the day totals the strip already computes, plus `dayVerdict`, `namedMiss` and `dayVerdictLabel` in `meal-generation.ts`. The bands are unchanged.
- **Leftovers:** `option.leftoverFrom`.
- **Water:** the existing log and target.
- **Shopping:** the existing add-day action and the grocery list's 7-day choice.

Because no new action is added, **coach/screen parity is unaffected**. If the coach's description of the Nutrition tab in `chat-gemini` mentions the old card or strip, update it so it never describes a control that isn't there (`test:chat-app-reality`).

## Gates (per CLAUDE.md)

- **Existing gates likely to need deliberate updates, never silencing:**
  - `test:one-page` and `verify:one-page`
  - `test:nutrition-3a` and the Nutrition layout gates
  - `test:meal-days` and `verify:meal-days`
  - `test:tab-ownership`, `test:app-tour` and `verify:tour-real` (the tour spotlights Nutrition)
  - `test:chat-app-reality`
  - `verify:grocery`
- **New: a `verify:` driver for N1, W1 and W3** at 390 × 844, with each check **mutation-tested**. It should check that:
  - the rings and legend match the stored totals;
  - the W1 verdict text equals `dayVerdictLabel`;
  - there's no water ring on a future day;
  - only one W3 day is open at a time;
  - `Shop the whole week` lands on 7 days;
  - every number on screen carries its unit.

## Files

- `Nutrition Week.dc.html`: N1, W1 and W3.
- `support.js`: the runtime needed to open it.
- `README.md`: this file.
