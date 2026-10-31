# Handoff: Five-tab polish (Home, Nutrition, Exercise, Tools, Chat)

## Overview
A visual and usability pass over all five tabs of FitPlan Pro so they share one language: **Home 2c**. That means one glowing hero card per screen, everything else as hairline rows or text sitting straight on the page, mint (#5BE9C2) for "now / done / primary", violet (#8B7BFF / #B4A9FF) for secondary and warm-up, and no boxed cards unless the content needs a container.

Approved options (each HTML file holds several options; build ONLY these):

| Tab | File | Option id |
|---|---|---|
| Home | `Home Screen.dc.html` | **2c** |
| Nutrition | `Nutrition Screen.dc.html` | **3a** (closed) + **3b** (recipe sheet open) |
| Exercise | `Exercise Screen.dc.html` | **2a** |
| Tools | `Tools Screen.dc.html` | **2a** |
| Chat | `Chat Screen.dc.html` | **2b** |

Every option has a visible badge (`2c`, `3a`…) and a matching `id`, so `#2a` in the URL scrolls to it.

## About the design files
The `.dc.html` files are **design references built in HTML**, not production code. Open them in a browser (keep `support.js` beside them). Recreate the designs inside the existing React + Tailwind codebase (`fitplan-pro/src`) using its components, CSS variables (`--primary`, `--hairline`, `--surface-raised`, `--role-warn`…), lucide icons and theme system. Hex values below are the **Midnight/default dark theme** as rendered; map each one to the matching token so the other eight themes keep working.

Behaviour and copy come from the existing code wherever it already exists (opener logic, proposal states, timer engine, grocery store…). These designs change **presentation and layout**, not data rules. Do not break the gates in `scripts/test-*.ts`; several read `ToolsTab.tsx` and `ChatAssistant.tsx` source directly (see "Gates to watch").

## Fidelity
**High fidelity.** Colours, type sizes, spacing, radii and copy are final. The phone frames are 412px wide; the real app is fluid, so let widths flex and keep the padding.

---

## Shared design tokens (default dark theme)

**Colour**
- Page `#100D24`; hero card `#221C48` + `radial-gradient(120% 90% at 100% 0%, rgba(91,233,194,.20), transparent 55%)`, border `1px rgba(91,233,194,.30)`, shadow `0 10px 30px rgba(0,0,0,.35)`
- Ink `#F5F3FF`, secondary `#C2BCE8`, muted `#9A93C9`, soft `#DAD5FA`
- Mint `#5BE9C2` (gradient `#7BEECE → #5BE9C2 55% → #3ED3AA`, ink on mint `#08281F`, glow `0 0 16–22px rgba(91,233,194,.4–.6)`)
- Violet `#8B7BFF` / `#A897FF` (gradient), label violet `#B4A9FF`, ink on violet `#15122B`
- Amber `#FFB454` (carbs, rest phase), water blue `#6FB7FF`
- Hairline `rgba(245,243,255,.10)`; field/tile fill `rgba(69,60,142,.18–.35)`
- Chat bubbles: yours `#453C8E`, coach `#173B3D` (solid, no fade)

**Type:** Space Grotesk 400/500/600/700; numbers in `ui-monospace` where noted.
- Screen title 28/700, −0.03em · hero title 32/700, −0.03em, line-height 1.05
- Section label 10/600, uppercase, letter-spacing .12em
- Row title 15/500 · body 14–15 · meta 11.5–12.5 · caption 10–11

**Radius:** hero 24 · group card 20 · tiles/fields 14–16 · inputs 8–12 · pills 999
**Spacing:** screen padding 16px sides; vertical stack gap 20–24; rows min-height 60–64 with a 1px hairline between
**Hit targets:** at least 44×44 for every tappable control (ticks, steppers, timer buttons)

**Bottom nav** (unchanged except the active marker): the active tab is mint, label 700, and has an 18×3 mint bar 9px above the icon with `0 0 8px` glow. Shown on Tools 2a; apply it to all tabs so the active tab isn't lost next to the glowing centre chat button.

---

## 1. Home — 2c (`Dashboard.tsx`, `HomeWeekStrip.tsx`)
Only two boxes: the session hero card, and one card for highlights + tomorrow. Coach and recovery sit on the page with no fill.

1. **Header:** eyebrow `Monday · Week 2 of 16`, title `Morning, Ashley`, streak `6 days` on the right.
2. **Session hero card:** eyebrow `Today · Session 1 of 3` + right status; title `Full Body ` + mint glowing `Power`; meta `4 exercises · ~45 min · Deadlift from 72.5 kg`.
   - Set progress bar (4px, mint) + `7 of 12 sets`, shown **only once started**.
   - Mint CTA, 54px: `Start session` / `Continue session`; hidden when done.
   - Week strip inside the card under a hairline: 7 cells, today outlined mint with a dot, training days `●`, rest days `–`, M–S labels.
3. **Coach line** (no box): mint chat avatar + `Coach` label; text "Your bench moved from **60 to 62.5 kg** in two weeks — the higher-rep block is doing its job."; actions `What changed?` and `Adjust today` (send as chat prompts).
4. **Recovery:** three rings in a row (steps 2,140, sleep 6h 40, water 0.75 L) with small labels. Calories and water as a **log** moved to Nutrition (Ashley); the water ring is read-only.
5. **One card:** `+2.5 kg · Bench PR · 62.5 kg` (Recent PRs collapsible, `3 this month` / `Hide`, chevron rotates), then `Pull Day · Tomorrow · ~50 min`.

States (`sessionState`): Not started / In progress / Done. Copy for each lives in the file's logic class.

## 2. Nutrition — 3a closed, 3b recipe open (`NutritionDisplay.tsx`, `MealPlan.tsx`)
1. **Rings card** (top hero): concentric calorie, protein, carbs, fat **and water** rings. Legend on the right, one row per macro: 8px swatch · name · `62/150g` (mono) · a **3px progress bar** under each in that macro's colour (protein `#8B7BFF`, carbs `#FFB454`, fat `#9A93C9`, water `#6FB7FF`).
2. **"Today's meals" header row:** `Grocery list` as a pill button (32px tall, mint tint `rgba(91,233,194,.12)`, border `.3`, cart icon), plus a round **+** to log off-plan food. There's no big "Log lunch" button.
3. **Meal rows** (min-height 62, hairline):
   - **Status circle (26px):**
     - Logged: mint filled with a tick.
     - **Next meal:** 2px mint ring + glow, and the slot label reads `Lunch · next` in mint.
     - Later meals: faint ring, and the name uses the softer `#C2BCE8` ink. Don't lower the opacity; that fails contrast.
     - Off-plan extra: blue tick, labelled `Extra · 10:40`.
   - **Middle:** slot label (10px uppercase) / meal name (14.5/500) / **macro line**: `P 42g  C 72g  F 18g`. Each letter is 10.5/600 in its colour (P `#B4A9FF`, C `#FFB454`, F `#C2BCE8`); numbers 12/500, `#DAD5FA`, tabular-nums, gap 12.
   - **Right:** calories as a 16/700 mono number (mint when logged) with `KCAL` 9px uppercase underneath; chevron.
4. **3b, tapping a meal** opens a bottom sheet over a dimmed list (`rgba(8,6,20,.62)`):
   - **Header:** meal name, a bold `640 kcal`, the same P/C/F styling as the rows, and `25 min`.
   - **Recipe / Swap** tabs.
   - **Recipe tab:** ingredients, then numbered steps.
   - **Footer:** primary `I ate this`.

## 3. Exercise — 2a (`exercise/TodayPanel.tsx` and the set grid)
Builds on the approved ramp-vs-working-sets layout (`design_handoff_ramp_vs_working_sets`).
1. **Header:** `Week 2 of 16 · B1`, title `Exercise`, `Program ›` pill, gear.
2. **Hero card:**
   - Top: `Today · Monday`, `Full Body Power`, meta.
   - Progress bar + `N of 12 working sets`.
   - `Finish session` (outline) while in progress.
   - Week strip.
3. **Coach line, dynamic by logged working sets:**
   - **0 sets:** "Set 1 is a probe. Stop with 3-4 reps in reserve."
   - **1 set:** "Set 1 moved well. Hold 72.5 kg for set 2."
   - **2 sets:** "One set left. Same weight, same reserve."
   - **3 sets:** "Deadlifts done. Next: Bench Press, 3 × 8 at 60 kg."

   One sentence only; it never grows.
4. **Warm-up row:** `Warm-up · 6 min · 4 moves` + `Feeling tight?` chip.
5. **Open exercise card** (mint border `.22`):
   - **Header:** `Main lift · now`, `Deadlifts`, `3 × 6 · 72.5 kg · rest 120s`, and a segmented track bar (5 violet ramp segments, a 7px gap, then 3 mint working segments).
   - **Ramp up collapses into one 44px row:**
     - Violet tick dot.
     - `RAMP UP`, then a summary (`5 of 5 done`, or `2 of 5 · 20 → 67.5 kg`), then `not counted`.
     - A chevron that rotates 180° when open.
     - Tapping the row reveals R1–R5 rows. These are the same grid as working sets and still loggable; the ticks are violet.
   - **Set rows** (grid `24px | 1fr | 28px | 56px | 32px`):
     - Label.
     - **kg field (44px) with a plate button inside it on the right** (32×36, `rgba(139,123,255,.12)`, disc icon). It opens the plate calculator pre-filled with that row's weight.
     - Dumbbell glyph.
     - Reps field.
     - 30px tick.
   - **Rest timer:**
     - **Trigger:** ticking a working set inserts a rest row right under that set. It doesn't appear after the final set.
     - **Panel:** radius 16, `rgba(91,233,194,.08)`, border `.28`.
     - **Contents:** timer icon, `REST` + `1:42` (17/700 mono), and a 3px mint bar draining from the prescribed rest (120s).
     - **Buttons:** `−15`, `+15` (44×44, radius 12, gap 8) and `Skip`.
     - **At 0:** it reads `GO · Set 2`.
     - **Unticking** a set cancels its timer.
     - Use the existing session dock rest engine; don't create a second timer.
   - **Footer:** `+ Add set` only. The "Plate calculator" link is removed, because the plate button now lives in the fields.
6. **Other exercises:** hairline rows with a status circle, name and mono meta.
7. **Finish section:** `Bike · 10 min easy`.
8. **Bottom actions:** one full-width `Add exercise` button (52px, mint tint + border); under it a quiet line, `Did something off-plan? I also did…` (the link is `#B4A9FF`, nowrap).

## 4. Tools — 2a (`ToolsTab.tsx`)
Keeps Ashley's 14 Sep ruling: **no round card at rest**, and a list rather than a tile grid for the utilities.
1. **Header:** `Week 2 of 16 · B1`, `Tools`, gear.
2. **Timers hero card** (idle):
   - **Top:** `TIMERS` label, with `Set rest runs in your session` on the right. This replaces the old footnote.
   - **Three tiles** in a 3-column grid (min-height 88, radius 16). Content is top-aligned with a 12px gap, so the titles line up.
     - **Round** (mint border): `Tabata, EMOM, intervals`.
     - **Stopwatch:** `Counts up`.
     - **Lap:** `Records each lap`.

     Each tile opens that timer directly (`setTimerPick(mode)` and open the sheet on that panel). There's no chooser step.
   - **Under a hairline:** `LAST ROUND · Tabata 8 × 20s / 10s · 4:00` + a mint `Start` (44px). It reruns `selectedRoundConfig`.
3. **Live state** (`roundLive`): the same card becomes the running round.
   - **Phase colour:** border and glow are mint for work, amber for rest.
   - **Clock:** 56px mono, `Round 3 of 8`.
   - **Progress:** 8 pips (done mint, current = phase colour).
   - **Buttons:** `Pause` and `Full screen`.
   - **Note:** "Stopwatch and lap open once this round ends or is reset."

   Keep `RoundCard`, `RoundField` and the existing phase map; restyle only.
4. **Plate calculator card**, directly under the timers (radius 20, `rgba(69,60,142,.18)`):
   - **Top row:**
     - Disc icon tile.
     - `Plate calculator` / `Deadlifts · ± 2.5 kg`.
     - A **stepper**: `−` | `72.5 kg` | `+`, each segment 40×44, steps of 2.5 kg, clamped 20–300. Pre-fill it with the next prescribed barbell lift.
   - **Under a hairline:** `EACH SIDE`, then the plate chips, then `20 kg bar` ›.
   - **Plate maths:** per side = (kg − 20) / 2, taken greedily from 25 / 20 / 15 / 10 / 5 / 2.5 / 1.25. If nothing is needed, show `Bar only`.
   - **Plate colours (IWF), height by weight:**
     - 25: red `#E5484D`, 40px.
     - 20: blue `#3E7BFA`, 38px.
     - 15: yellow `#F5C542`, 36px.
     - 10: green `#3DBE6E`, 34px.
     - 5: white `#F5F3FF`, 30px.
     - 2.5: red, 26px.
     - 1.25: silver `#C9CBD3`, 24px.

     Ink is white or dark for contrast; chips have radius 7 and a mono 12/700 label. Tapping the row opens the full `PlateCalculator`.
5. **Grouped lists**, each a rounded group card (radius 20, `rgba(69,60,142,.18)`, internal hairlines, rows 64px). Icons sit in 36px tinted tiles (`rgba(139,123,255,.14)`, `#B4A9FF`).
   - **PLAN:**
     - `Your program`: `16 weeks · block 1 of 4`, plus a mint progress bar (48×4, glow).
     - `Session history`: `5 sessions logged`, plus a glowing **`↗ 3 PRs` pill** (mint tint, border `.45`, glow `0 0 12px rgba(91,233,194,.35)`).
   - **SHOP:** `Grocery list`: `14 items · 6 checked`, plus `6/14` (mono) and a mint bar.

   Subtitles keep their live sources (`getSessionHistory`, `getPRCache`, `subscribeGroceryStore`, the mesocycle).

## 5. Chat — 2b (`ChatAssistant.tsx`, `chat/ProposalCard.tsx`, `chat/ReceiptCard.tsx`)
A back-and-forth chat in the style of WhatsApp.
1. **Header:** 36px mint avatar, `Coach`, a live dot + `Sees today's session, meals and logs`, and clear (trash).
2. **Context strip** under the header (pills 32px). They change by day state:
   - **Mid-session:** `〰 Full Body Power · set 2 of 12 ›` (mint tint), which deep-links to Exercise on the current set.
   - **Session done:** a static `✓ Session done · 45 min`, with no arrow and no link.
   - **Rest day / no session:** the workout pill is removed.
   - **Always** (while relevant): `1,410 kcal left ›`, which deep-links to Nutrition at the next meal.
   - Hide the whole strip if there are no pills.
3. **Bubbles:**
   - **Yours:** right-aligned, `#453C8E`, radius `20 20 6 20`, max-width 82%.
   - **Coach:** left-aligned, **`#173B3D` solid**, radius `20 20 20 6`, max-width 88%, 15px / 1.5.
   - Coach groups start with a small header: 22px avatar + `COACH` + time.
   - ⚠ This replaces Ashley's 27 Sep "same colour both sides" ruling. Confirm with her, and check that white text passes **4.5:1 on both bubble colours in all nine themes**.
4. **Voice note** (optional; see the open question below):
   - **Layout:** the play button sits inside a mint **progress ring**, a conic-gradient ring 46px across. Next to it, a 30-bar waveform whose bars fill mint as it plays, and the time.
   - **Time:** `0:24` at rest, `0:07 / 0:24` in mint while playing.
   - **Transcript:** always shown inside the same bubble.
5. **Commands are not bubbles:**
   - **Receipt (water):** one line: blue tick, `**500 ml water logged** · 1.25 of 2.5 L`, `Undo`.
   - **Proposal (swap):**
     - The coach's sentence in a bubble: "Since your lower back is tight, let's swap RDLs for Hip Thrusts today… Want me to update today's session?"
     - Then a soft one-line preview: `RDL` (struck through) → `Hip Thrust` · `3 × 10 · 60 kg`.
     - Then reply pills, weighted:
       1. `Yeah, do it`: mint filled, applies today's scope.
       2. `Whole block`: mint outline.
       3. `Keep RDLs`: grey outline, muted text.
     - Then `Or swap in` + small tag pills (`⇄ Glute bridge`, `⇄ Cable pull-through`), which send the alternative prompt.
     - **On answer:** your pill text appears as your bubble, followed by the coach's confirmation and `Undo`.
     - Map these onto the existing `ProposalCard` scopes (`today` / `block`), reject, and `onAlternative`. Keep the terminal and stale notes.
6. **Reply chips** (`QUICK_REPLIES`): 40px pills, violet border, nowrap.
7. **Composer:**
   - **Field:** a 52px pill, placeholder `Tap the mic, or type…`.
   - **While empty:** the **mic is the primary button** (mint, glowing, on the right), and send is muted.
   - **Once there's text:** send becomes the mint primary.

**Open question:** the coach is AI, so a "voice note" means text-to-speech of its own message. Ship it behind a flag, or skip it.

---

## Interactions summary
- **Ticks** (Exercise): toggle logged state. Unticking a working set clears its rest timer.
- **Ramp row:** expands and collapses, and remembers its state per exercise for the session. Default: collapsed once the ramp is complete, open before.
- **Chevron rotation:** 180°, ~150 ms ease.
- **Tools steppers:** ±2.5 kg; plate chips recompute instantly.
- **Chat proposal answers** go through the existing confirm/reject handlers. Undo uses the receipt undo window.
- **Meal tap** (Nutrition): opens the 3b sheet. **+** opens off-plan logging (the existing add flow).

## Gates to watch (`scripts/`)
- `test-tools-grid.ts`, `test-plate-math.ts`, `test-timer-field*.ts`, `test-round-*.ts`: they assert Tools structure, such as `<PlateCalculator open={plateOpen}`, `<RoundCard live idleConfig`, the `roundLive` condition, `groceryHash()`, `programHash()`, the copy `runs itself in the session dock`, and no hard-coded `'Tabata'`. The hero "Last round" label must come from `protocolNameOf` / the presets, not a string literal. Update the gates deliberately where this design changes structure; don't silence them.
- `test-chat-app-reality.ts`, `test-tab-ownership.ts`: if Tools copy changes, keep the coach's description of the tabs accurate.
- `test-nutrition-layout.ts`: the grocery list has two doors (Tools + Nutrition).

## Files in this bundle
- `Home Screen.dc.html` (build **2c**)
- `Nutrition Screen.dc.html` (build **3a**, **3b**)
- `Exercise Screen.dc.html` (build **2a**; tweak `sessionState`)
- `Tools Screen.dc.html` (build **2a**; tweak `roundTimer` Idle/Running)
- `Chat Screen.dc.html` (build **2b**; tweak `dayState`)
- `support.js`: the runtime needed to open the files.

Related earlier handoffs in the repo: `design_handoff_ramp_vs_working_sets`, `design_handoff_rest_day`.
