# Handoff: FitPlan Pro — tab restructure (Home / Nutrition / Exercise)

## Overview

The app currently spreads ownership of the same facts across tabs: the Dashboard ("Home")
renders the macro ring meter, water logging, steps, weight trend, PRs and program phase,
while Nutrition owns meals + targets and Exercise owns the session. This handoff moves to
**one owner per fact**:

| Fact | Owner after this change |
|---|---|
| Macro rings / calories eaten | **Nutrition** (moved off Home) |
| Water logging | **Nutrition** (moved off Home) |
| Meals, targets derivation, weigh-in | **Nutrition** (unchanged) |
| Program phase / week / block context | **Exercise** (moved off Home) |
| Today's session, sets, ramps, loads | **Exercise** (unchanged) |
| Timers, grocery list | **Tools** (unchanged) |
| Session CTA, coach line, streak, trend, PRs, steps | **Home** (its new job) |

Home keeps *read-only* calorie and water tiles that deep-link into Nutrition; it never
mutates nutrition state. Steps and weigh-in are still logged on Home. The tab bar keeps
its five slots: Home · Nutrition · [Chat FAB] · Exercise · Tools.

## About the design files

`FitPlan Tab Restructure.dc.html` in this bundle is a **design reference created in HTML** —
a static prototype showing intended layout, hierarchy and states. It is **not production
code to copy**. The task is to recreate these screens inside the existing FitPlan Pro
codebase (React 18 + Vite + TypeScript + Tailwind v4 + shadcn/ui), using its established
patterns: `src/index.css` CSS custom properties, the `ds-*` / `glow-*` / `tabular-mono`
utility classes, `@/components/ui/*` primitives, and the existing hooks
(`useActiveSession`, `useTrainingWeek`, `useTimers`, `useViewportInset`).

Every colour in the prototype is a **literal hex of an existing token** in `src/index.css`
(Nightshift theme). In the real implementation use the token, not the hex — the app has
four themes (Nightshift / Ember / Field / Graphite) and five accent overrides, and
hard-coded hexes will break all of them.

## Fidelity

**High-fidelity.** Final colours, type scale, spacing and states. Recreate pixel-perfectly
using the codebase's own tokens and components. Copy is final unless noted.

## Design tokens (map hex → token before writing any code)

| Prototype hex | Token in `src/index.css` | Used for |
|---|---|---|
| `#1A1636` | `--background` | app canvas |
| `#221C48` | `--surface-deep` | bottom tab bar fill |
| `#241E4E` | `--card` / `--muted` | cards |
| `rgba(69,60,142,.28)` | `--surface-raised` | tiles, set rows, inputs |
| `rgba(245,243,255,.11)` | `--hairline` | section dividers |
| `#F5F3FF` | `--foreground` | primary text |
| `#C2BCE8` | `--text-tertiary` | secondary text |
| `#9A93C9` | `--muted-foreground` | labels, captions |
| `#5BE9C2` / `#3ED3AA` | `--primary` / `--primary-2` | accent, CTA, positive |
| `#08281F` | `--primary-foreground` | text on accent |
| `#E4FCF4` | *(literal, as used today in Dashboard.tsx)* | hero numbers |
| `#8B7BFF` / `#DAD5FA` | `--role-ai` / `--role-ai-text` | coach voice |
| `#FFB454` / `#FFD9A6` | `--role-warn` / `--role-warn-text` | needs-you |
| `#6FB7FF` | `--chart-3` / `--chart-5` | water |
| `#C2BCE8` (ring) | `--text-tertiary` | fat ring |

**Type:** `Space Grotesk` (`--font-sans`), already loaded. Numeric values use
`.tabular-mono` (ui-monospace, `font-variant-numeric: tabular-nums`).

**Existing utility classes to reuse rather than re-implement:**
`.ds-label` (11px/uppercase/.14em/muted), `.ds-label-compact` (9.5px/.12em),
`.ds-num-mega` (46px/700/-.04em), `.ds-num-tile` (32px), `.ds-num-lg` (32px),
`.glow-mint`, `.glow-mint-lg`, `.glow-mint-box`, `.glow-violet`, `.glow-warn`,
`.glow-warn-dot`, `.glow-text`, `.glow-icon`, `.glow-bloom-once`, `.grain-overlay`,
`.hit-slop-44`, `.hit-slop-day`.

**Radii:** tiles/cards 16px, buttons 12–14px, set rows 12px, inner inputs 9px.
**Screen padding:** 22px horizontal. **Section rhythm:** `.ds-label` + 14px to content;
26–32px between sections. **Hit targets:** ≥44px on every log/confirm control.

---

## Screens

### 1. Home — `Dashboard.tsx` (option `1a`, the recommended direction)

**Purpose:** answer "what do I do next" in one screen, and hand off everything else to the
tab that owns it.

Order, top to bottom:

1. **Day + streak row.** Left: `.ds-label` "Wednesday · Week 3 of 16". Right: streak number
   26px/700/-.03em in `--primary` + `.glow-mint` when > 0 (else `--muted-foreground`), with
   a 9px/.18em uppercase "days streak" caption under it. *(Unchanged from today.)*
2. **Session hero.** Focus name 25px/700/-.02em + `.glow-text`; right-aligned 11px status
   ("Not started" / "11/21 sets" / "Done"). Below: 12.5px muted line of the first three
   exercise names + "+N more". Then a full-width 52px CTA, radius 14px,
   `linear-gradient(180deg,#7DEDCD 0%,#5BE9C2 55%,#3ED3AA 100%)`, `.glow-bloom-once`,
   label "Start session" / "Continue session". Then 12px muted "Tomorrow · …".
   The CTA routes to `tabHash('exercise')`. *(Unchanged from today.)*
3. **Coach tip.** ⚡ in `--role-ai` + `.glow-violet`, text 13px/1.5 in `--role-ai-text`.
   *(Unchanged.)*
4. **`TODAY` — two read-only tiles, `grid-cols-2`, gap 10px, radius 16px,
   `--surface-raised`, padding 14px.** THIS IS THE CHANGE: the ring meter and the water
   log leave Home.
   - *Calories tile:* 34px single-ring SVG (r=14, stroke 4, track `rgba(69,60,142,.9)`,
     fill `--primary`, `rotate(-90)`) + `1240` mono 19px/700 and 9px/.14em caption
     "of 2480 kcal". Footer link 11px `--primary` "Nutrition ›".
   - *Water tile:* `1250 ml` mono 19px/700, caption "of 2000 water", a 2px progress line
     (`--hairline` track, `--primary` fill, `.glow-mint-box`), footer "Nutrition ›".
   - Both tiles are **navigation only** — tapping either sets `window.location.hash =
     tabHash('nutrition')`. No `logWater` call remains on this screen.
5. **Steps row.** Hairline top border, 14px vertical padding, label 13px `--text-tertiary`,
   right: number input (h30, radius 8, `--surface-raised`) + 12px/600 `--primary` "Log".
   Keeps `logStepsManual`. *(Unchanged.)*
6. **Weigh-in block (NEW graph).** Hairline top border. Header row: "Weigh-in" +
   mono "78.4 kg" + muted "today ✓". Below it a **weight trend chart**: SVG
   `viewBox="0 0 320 60"`, `width="100%"`, `preserveAspectRatio="none"`, containing
   (a) an area `<polygon>` filled `rgba(91,233,194,.10)`, (b) a `<polyline>` stroke
   `--primary`, `stroke-width="2"`, `vector-effect="non-scaling-stroke"`, round caps/joins,
   `filter: drop-shadow(0 0 8px rgba(91,233,194,.6))`, (c) a 3.5r circle on the last point.
   Footer row: `.ds-label`-ish 10px "8 weigh-ins" + 11px `--primary` "−2.0 kg since week 1".
   **Data:** map the last N `daily_metrics` weigh-ins to the 0–320 x-range evenly and the
   min/max weight to y 48→8 (leave 8px headroom top, 12px bottom). Render the empty state
   ("Log a weigh-in to see your trend here.") when `sampleCount === 0`; render the line but
   suppress the "since week 1" delta when `sampleCount === 1`.
7. **`PROGRESS`.** Rolling-average weight `.ds-num-tile .tabular-mono` in `#E4FCF4` +
   `.glow-mint-lg`, "kg" 15px muted; rate line 13px `--primary` when losing to target.
   Then recent PR lines. *(Unchanged.)*
8. **What's-left line.** 6px `--role-warn` dot with `.glow-warn-dot` + 12.5px
   `--role-warn-text`. *(Unchanged.)*

**Home states** (screen `1h` in the prototype):
- *Rest day:* "Rest day" 25px/700, 13px muted recovery copy + week tally, a
  `--surface-raised` "Tomorrow · Pull & Hinge · 5 exercises ›" card, and a 12.5px
  `--primary` link "Log a walk or other activity". **No primary CTA.**
- *Session done (previous day):* a card with `1px solid rgba(91,233,194,.28)` and
  `linear-gradient(160deg,rgba(91,233,194,.12),rgba(69,60,142,.2))`, label
  "YESTERDAY · SESSION DONE", three mono 22px stats (min / sets / PR) and a 12.5px summary
  line. Feed from `computeSessionSummary` + `computeSessionPRs`.
- *New profile:* keep the existing honest empty states; the calorie tile reads `0`, the
  water tile `0 ml`, and the trend block shows its empty copy.

**Alternate Home directions in the same file, not specced here:** `1b` progress-led
(trend number as hero, 7-week volume bars, per-week consistency grid, session collapsed to
one row) and `1c` coach-led (coach paragraph leads, then a horizontally-scrolling
"3 things today" card deck with paging dots). Confirm which one ships before building —
`1a` is the assumed default.

---

### 2. Nutrition — `NutritionDisplay.tsx` (screens `1d`, `1e`)

**Purpose:** own everything about intake — what you ate, what's left, where the numbers
come from.

1. **Header:** `.ds-label` "Nutrition · Wednesday".
2. **Ring meter (moved here from `Dashboard.tsx`).** 112×112 SVG, `flex` row with 18px gap.
   **Five rings now, each its own colour** (this is a change from the current
   all-`currentColor` treatment):

   | Ring | r | stroke-width | colour | value shown |
   |---|---|---|---|---|
   | Water (outermost, NEW) | 50 | 3 | `--chart-3` `#6FB7FF` | ml / target |
   | Calories | 40 | 8 | `--primary` `#5BE9C2` + `.glow-icon` | kcal eaten / target |
   | Protein | 30 | 5 | `--role-ai` `#8B7BFF` | g / target |
   | Carbs | 22 | 5 | `--role-warn` `#FFB454` | g / target |
   | Fat | 14 | 5 | `--text-tertiary` `#C2BCE8` | g / target |

   Each ring is a track circle (`rgba(69,60,142,.45)`) plus a fill circle with
   `stroke-linecap="round"`, `stroke-dasharray="${circumference * min(1, eaten/target)} ${circumference}"`,
   `transform="rotate(-90 56 56)"`, and `transition: stroke-dasharray 400ms ease`.
   Right of the rings: `.ds-num-mega .tabular-mono` calories in `#E4FCF4` + `.glow-mint-lg`,
   a 10.5px/.16em caption "kcal · of 2480", then **five legend rows** — 9px square swatch
   in the ring's own colour, 10px/.16em uppercase label, mono 12.5px `98 / 160g` value.
3. **Water row (moved here from `Dashboard.tsx`).** Hairline top and bottom, 14px padding.
   Label "Water"; right side mono "1250 / 2000 ml", then `+250`, `+500` quick-adds and
   `edit`, all 12px — **quick-adds and the progress bar use `--chart-3` blue**, matching
   the water ring, not the mint accent. Under the row a 3px progress bar
   (`--hairline` track, `#6FB7FF` fill, `box-shadow: 0 0 10px rgba(111,183,255,.7)`).
   Behaviour is the existing `logWater` / `undoLog` / `setWaterTargetMl` from `water-store`,
   including the inline target editor and the transient `undo` link.
4. **Today's meals** — `MealPlan.tsx`, structurally unchanged, with one behaviour change:
   **every slot row expands in place** to the detail treatment (previously only visually
   implied). Collapsed row: `.ds-label-compact` slot name, 16.5px/500 meal name
   (`min-width:0`, truncate), right side mono kcal (`--primary` + "✓" when logged, else
   `--muted-foreground`) **plus a `⌄` chevron** so the affordance reads. Expanded row:
   slot label turns `--primary` + `.glow-mint` with " · open", name grows to 19px/600,
   then a 32px mono kcal number with a "kcal" + `P · C · F` caption block, a
   `.ds-label-compact` "N ingredients" heading with a mono 12px list, then the action row —
   44px-min "Log this meal" (`--primary` fill, `.glow-mint-box`) or the logged pill
   (`bg-primary/15`, `--primary` text, "✓ Logged"), a 36px ↻ regenerate, and a
   "Swap · N options" text button. Swap list: rows with name + mono `kcal · P g`, and a
   right-aligned delta (`--primary` when lower/better, `--role-warn` when higher,
   `--muted-foreground` inside a ±20 kcal dead-band).
5. **How your targets are set** — the existing 4-column BMR / TDEE / adjustment / target
   strip in a `Card`, target value in `--primary` + `.glow-mint`, 11px derivation caption.
6. **Weigh-in** — existing `WeighInCard`.
7. **Nutrition method** — existing two-option selector, stays at the bottom.

---

### 3. Exercise — `exercise/TodayPanel.tsx` + `ProgramPanel` (screens `1f`, `1g`)

**Purpose:** own the session *and* the program context that used to be echoed on Home.

1. **Context card (`WeekContextRow`), expanded state.** Radius 16px, `--surface-raised`,
   padding 14px. Line 1: 12.5px "Wk 3/16 · B1 Hypertrophy · ~52 min" + a `⌃`/`⌄` chevron in
   `--primary`. Expanded: 12px/1.5 `--text-tertiary` phase-focus paragraph, then the
   `coach_note` in `--role-ai-text`. Then the **week strip**: 7 equal cells, each a 9px
   uppercase day abbreviation over a 12px glyph (`✓` done, `◐` partial, `●` due,
   `○` missed, `–` rest, `~` active recovery); today's cell gets
   `background: rgba(91,233,194,.14)`, `1px solid rgba(91,233,194,.4)`, radius 9px, and its
   label + glyph in `--primary`. Use `.hit-slop-day` on the cells. Footer: 11.5px
   `--primary` "See the whole program ›" → `#/exercise/program`.
2. **Session hero.** 10.5px/.2em `--primary` + `.glow-mint` "Today · Wednesday"; focus name
   36px/700/-.035em/1.02 + `.glow-text`; a 2px progress line (logged sets ÷ planned sets);
   a 40px "Start session" / "Finish session" button.
3. **Warm-up:** collapsed counted line "▸ Warm-up · 4 moves · ~6 min", 13px
   `--text-tertiary`.
4. **Exercise list — restyled to match the meal-slot idiom** (this is the visual change):
   the list is now **hairline-separated rows in one column**, not gap-separated cards.
   - *Collapsed row:* `.ds-label-compact` section label ("Superset A · alternate, no rest",
     "Accessory", "Finisher"), then name 16.5px/500 (`min-width:0`) with a right-side
     no-wrap `flex-shrink:0` group: mono 12px `3×10 · 30 kg` + a `⌄` chevron.
   - *Open row:* label turns `--primary` + `.glow-mint` with " · open"; name 19px/600;
     then the **load as a 32px mono hero number** with a "kg" + provenance caption block
     ("from your last session ⓘ" / "suggested ⓘ" / "you told us ⓘ") — mirroring the meal
     card's kcal hero; then a `.ds-label-compact` "4 ramp sets" heading over a mono 12px
     list (`20 kg × 10`, `50 kg × 5`, …) — same shape as the meal's ingredient list; then
     "3 working sets · 2 logged" over the set rows; then a text action row
     ("Swap · N alternatives" in `--primary`, "Plate calculator" in `--muted-foreground`).
   - *Set rows:* radius 12px, `--surface-raised`, 9px/12px padding. Logged:
     `S1` (mono 11px, 20px wide) + mono 13px "92.5 kg × 9" + a `--primary` `✓` with
     `.glow-mint`. Active: `1px solid rgba(91,233,194,.3)`, two 36px inline inputs
     (radius 9px, `--background` fill, mono 13px) with "kg"/"reps" captions, and a
     44×36 `--primary` confirm button with `.glow-mint-box`.
   - Behaviour is unchanged: `saveSet` returns synchronously for the instant green check,
     blank fields resolve to ghost-then-prescribed values, `startRest` fires on completion.
     Ramp data stays permanently visible (never collapsible) per `LAYOUT-DESIGN.md` §1.6.
5. **Program surface (`1g`)** — `#/exercise/program`, rendered inside the tab shell:
   "‹ Today" + "YOUR PROGRAM" header, a 28px/700 "16 weeks · 4 blocks" title with a start
   date + deload caption, a 4-segment block progress bar (completed segments `--primary`,
   current one with `.glow-mint-box`, remainder `rgba(69,60,142,.5)` flexed by week count),
   then the **current block expanded** in a `--surface-raised` card with one hairline row
   per week (`Wk 3 · Loading` + `done ✓` / `← you are here` in `--primary`), and the other
   three blocks as 16px collapsed rows. Below: "WEEK 3 AT A GLANCE" — hairline rows of
   `Monday · Legs & Core` + `5 exercises ✓`. Tapping a week → `#/exercise/program/{n}`.

---

### 4. Bottom tab bar — `BottomTabBar.tsx` (unchanged, shown on every screen)

64px tall, `--surface-deep` fill with
`linear-gradient(180deg, rgba(0,0,0,0) 0%, var(--surface-deep) 45%)`, no top border,
`padding-bottom: env(safe-area-inset-bottom)`, hidden while `isKeyboardOpen`.
Four flanking tabs (lucide `LayoutDashboard`, `PieChart`, `Activity`, `Wrench`, 20px,
`--primary` + `.glow-mint`/`.glow-icon` when active, else `--muted-foreground`) with 10px
labels, and the raised 56px chat FAB (`-mt-6`, `linear-gradient(180deg,
color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))`, `.glow-mint-box`,
lucide `MessageCircle` in `--primary-foreground`).

---

## Interactions & behaviour

- **Navigation:** hash routes only, via `tabHash(tab)` / `useAppRoute` — `#/dashboard`,
  `#/nutrition`, `#/exercise`, `#/exercise/program`, `#/exercise/program/{n}`, `#/train`,
  `#/tools`, `#/chat`. Home's tiles and CTA set `window.location.hash`; they never render
  another tab's component.
- **Expand/collapse** (meal slots, exercise rows, context card, program blocks): local
  component state, one open at a time within a list, collapsed by default on every visit.
  In the exercise list the default-open row is the first incomplete exercise, recomputed
  from live logs (existing `firstIncompleteExIndex` logic) with user overrides on top.
- **Logging:** all writes keep going through the existing local-first stores
  (`set-log-store`, `water-store`, `steps-store`, `meal-store`, `daily-tracking`) — the
  green check / logged pill must render from the store's synchronous return, never from a
  resolved promise.
- **Transitions:** ring `stroke-dasharray` 400ms ease; CTA entrance `.glow-bloom-once`
  (900ms `cubic-bezier(.2,.8,.2,1)`, one-shot). All halos scale with `--glow-strength`
  and every animation is disabled under `prefers-reduced-motion`.
- **Loading:** Home renders "Loading your day…" until `activeSession.ready`; the session
  hero never shows `0/N` before logs resolve (show `—/—`).

## State

No new stores. New/changed derived data only:

- `Dashboard`: needs the weigh-in **series** (not just the rolling average) for the trend
  chart — extend `loadDashboardData` to return `weightSeries: { date, kg }[]` from
  `daily_metrics`; drop `waterLogs` / `logWater` / `setWaterTargetMl` usage entirely.
- `NutritionDisplay`: gains the water state (`getAllLogs`, `logWater`, `undoLog`,
  `setWaterTargetMl`, `water_target_ml`) and the macro-eaten totals the ring meter needs
  (today's `meal_events` ledger, already available via `getTodayLedger`).
- `MealPlan`: `expandedSlot` already exists; no change beyond rendering the chevron.
- `TodayPanel` / `ExerciseRow`: presentation only — no change to `progressedLoads`,
  `groupExercises`, or the swap/ban paths.

## Assets

No new assets. Icons are lucide-react (already a dependency) — the prototype inlines
lucide path data for `LayoutDashboard`, `PieChart`, `Activity`, `Wrench` and
`MessageCircle`; use the real components. No images. Chart SVGs are hand-authored inline.

## Files

- `FitPlan Tab Restructure.dc.html` — the design reference (open in a browser; screens are
  labelled `1a`–`1h` and each is a 390×844 phone frame).
  - `1a` Home, command center **(recommended)** · `1b` Home, progress-led ·
    `1c` Home, coach briefing deck · `1h` Home, rest day + session done
  - `1d` Nutrition, default · `1e` Nutrition, meal open + swap
  - `1f` Exercise, today · `1g` Exercise, program browse

Source files to modify in the app: `src/components/Dashboard.tsx`,
`src/components/NutritionDisplay.tsx`, `src/components/MealPlan.tsx`,
`src/components/exercise/TodayPanel.tsx`, `src/components/exercise/ExerciseRow.tsx`,
`src/components/exercise/WeekContextRow.tsx`, `src/lib/dashboard-data.ts`.
`src/components/BottomTabBar.tsx` and `src/index.css` need no changes.

## Suggested Claude Code prompt

> Read `design_handoff_tab_restructure/README.md` and open
> `FitPlan Tab Restructure.dc.html` in a browser to see the target screens.
> Implement the tab restructure it describes in this codebase, one screen per commit,
> starting with Nutrition (it receives the moved components), then Home, then Exercise.
> Use the existing tokens in `src/index.css` — never hard-code the hex values from the
> prototype — and keep every write on the existing local-first stores. Run the relevant
> `scripts/test-*.ts` checks after each screen.
