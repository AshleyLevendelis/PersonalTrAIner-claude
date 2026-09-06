# Handoff: PersonalTrAIner — app polish (direction 1a: one column, no boxes)

## Overview

The five tabs stay (Home · Nutrition · [Personal TrAIner FAB] · Exercise · Tools) and every
store, hook and route stays. This is a **presentation pass** with four goals, in priority order:

1. **Home becomes informative.** Greeting, streak, the TrAIner's one line for today, session +
   CTA + week strip, a 2×2 "Today so far" (calories · water with quick‑add · steps · weight),
   the weight trend, recent PRs, tomorrow. Nothing new is *owned* by Home — water and steps
   still write through their stores; calories stay read‑only and deep‑link to Nutrition.
2. **Cards go away.** Sections are a `.ds-label` + hairline‑separated rows in one column. The
   only remaining filled containers are: the TrAIner nudge, the Tools tiles, the "Tomorrow" row,
   set rows in the active session, and the composer/dock.
3. **The Personal TrAIner shows up outside chat.** One "TrAIner says" line at the top of Home,
   Nutrition and Exercise, and one in the active‑session rail. Fed by the existing
   `adaptationMessages` / coach tip / progression payoff — no new model calls.
4. **Tools stops being a junk drawer.** A 6‑tile utility grid (Rest timer, Rounds & intervals,
   Plate calculator, Grocery list, Session history, Your program) with a grocery preview below.

Also in scope: the profile screen re‑grouped into four lists; the chat FAB's ring + pulse become
the **unread** state only (see `design_handoff_chat_grouped_bubbles/README.md`, already
delivered — the chat itself is that handoff, not this one).

## About the design files

`App Revamp.dc.html` is a **design reference created in HTML** — a static prototype, not code
to copy. Recreate it in the codebase (React 18 + Vite + TypeScript + Tailwind v4 + shadcn/ui)
using its own patterns: `src/index.css` tokens, `ds-*` / `glow-*` / `tabular-mono` utilities,
`@/components/ui/*`, lucide‑react, existing hooks. Only the **1a** block applies; ignore 1b/1c.

## Fidelity

**High‑fidelity.** Type, spacing, radii, colours and states are final. Copy is final except the
TrAIner lines, which are live data.

## Token map (hex → `src/index.css`)

| Prototype | Token | Used for |
|---|---|---|
| `#1A1636` | `--background` | canvas |
| `#221C48` | `--surface-deep` | tab bar, active‑session dock |
| `#241E4E` | `--card` | (chat bubbles only — not used on these tabs) |
| `rgba(69,60,142,.28)` | `--surface-raised` | Tools tiles, streak chip, set rows, "Tomorrow" row, week‑strip cells |
| `rgba(245,243,255,.11)` | `--hairline` | every row separator |
| `#F5F3FF` / `#C2BCE8` / `#9A93C9` | `--foreground` / `--text-tertiary` / `--muted-foreground` | text |
| `#E4FCF4` | literal (as in Dashboard.tsx) | hero numbers |
| `#5BE9C2` / `#3ED3AA` | `--primary` / `--primary-2` | accent |
| `#7DEDCD→#5BE9C2→#3ED3AA` | existing CTA gradient | Start session |
| `#08281F` | `--primary-foreground` | text on accent |
| `rgba(139,123,255,.10)` fill + `rgba(139,123,255,.25)` border, `#DAD5FA` text | `--role-ai` @10% / @25%, `--role-ai-text` | TrAIner nudge |
| `#8B7BFF` / `#FFB454` / `#C2BCE8` / `#6FB7FF` | `--role-ai` / `--role-warn` / `--text-tertiary` / `--chart-3` | protein / carbs / fat / water |
| `rgba(111,183,255,.15)` + `#6FB7FF` | `--chart-3` @15% / `--chart-3` | water quick‑add chips |
| `#453C8E` | `--border` | unchecked grocery box |
| `#FF8A8A` / `rgba(255,107,107,.35)` | `--destructive` text / border | "Start a new plan…" |

Font Space Grotesk. Numbers `.tabular-mono`. Screen padding **22px**. Section gap **26px**.
Section = `.ds-label` (11px/.14em/uppercase/muted) + 6px + content. Rows: 11–13px vertical
padding, `border-bottom: 1px solid var(--hairline)`, list opens with a `border-top`.

---

## Shared pieces

### TrAIner nudge (`<TrainerNudge>` — new, `src/components/TrainerNudge.tsx`)
`display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:14px;
background: color-mix(in oklab, var(--role-ai) 10%, transparent); border: 1px solid
color-mix(in oklab, var(--role-ai) 25%, transparent)`. Avatar 22px circle, `linear-gradient(180deg,
color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))`, `MessageCircle` 12px
`strokeWidth 2.6`, `--primary-foreground`. Text 13px/1.5 `--role-ai-text`. Optional trailing
`ChevronRight` 14px muted → opens chat (`tabHash('chat')`). Compact variant (active session):
padding `10px 12px`, radius 12, avatar 20px, text 12.5px, no border.
**Source of the line, in order:** the first `adaptationMessages` item (with its confirm/decline
as inline text buttons, replacing today's `InsightBanner` stack) → the Home coach tip → the
progression payoff (`projectNextLoad`) → nothing (component unmounts; never filler).
`InsightBanner tone="ai"` in `App.tsx` is retired for these; `tone="warning"` (write errors)
stays.

### Week strip
7 cells, `flex:1`, `gap:6px`, `padding:6px 0`, radius 9px, `--surface-raised`; 9px/.1em
uppercase day + 12px glyph, both `--muted-foreground` (done days `--text-tertiary`). Today:
`rgba(var(--glow-rgb),.14)` fill, `1px solid rgba(var(--glow-rgb),.4)`, `--primary` text.
Glyphs unchanged (`✓ ◐ ● ○ – ~`). Existing `HomeWeekStrip` / `WeekContextRow` — restyle only.

### Top‑right
Only the existing `ProfileMenu` gear (32px ghost, top 10px right 12px). `OfflineStatusIndicator`
stays top‑left as today.

---

## Screens (each 390×844 in the prototype; all fluid)

### Home — `Dashboard.tsx`
Order, `gap:26px`, padding `52px 22px 24px` (top clears the fixed icons):
1. **Header row.** Left: `.ds-label` "Wednesday · Week 3 of 16"; under it greeting 28px/700/
   −.03em/1.1 "Morning, Ashley" (morning/afternoon/evening from `getAppNow`; profile
   first name). Right: streak chip — `--surface-raised`, radius 999, `5px 10px`, 5px dot
   (`--primary` if >0 else `--text-dim`), mono 13px/600 count, 11px muted "day streak".
2. **TrAIner nudge** (see above).
3. **Today's session.** Row: `.ds-label` "Today's session" ↔ 11px muted "~52 min"
   (`estimateSessionMinutes`). Focus 25px/700/−.02em with `text-shadow: 0 0 26px
   rgba(var(--glow-rgb),.35)` — NOT `truncate` (see the existing comment in Dashboard.tsx).
   Glance line 12.5px muted "6 exercises · 21 sets · Bench, Squat, RDL +3". CTA 52px, radius
   14, existing gradient, `.glow-bloom-once`, "Start session" / "Continue session" → `#/exercise`.
   Then the **week strip** (moved *under* the CTA; its label row is dropped — the header row
   already says the week).
   *Rest day:* focus "Rest day", glance "Recovery is part of the program · 3 of 4 sessions
   done", no CTA, strip stays.
4. **Today so far** — `.ds-label`, then a 2×2 grid with **hairlines, not tiles**: grid
   `grid-template-columns:1fr 1fr`, `border-top` on the grid, each cell `padding:14px 0`,
   right cells `padding-left:14px`, left cells `padding-right:14px; border-right`, top cells
   `border-bottom`. Cell: 11px muted label with a 12px lucide icon (`Flame`, `Droplets`,
   `Footprints`, `Scale`) → mono 22px/700 value with 11px muted unit suffix → third line:
   - Calories: 2px progress line (`--hairline` track, `--primary` fill), eaten ÷ target.
     Cell taps → `tabHash('nutrition')`. Read‑only.
   - Water: two 28px chips `+250` `+500` (`--chart-3` @15% fill, `--chart-3` 11px/600 text)
     → `logWater` from `water-store` (this is the one store call that returns to Home; keep the
     transient `undo` link the Nutrition row already has, rendered as a third 11px chip for 6s).
   - Steps: 11px `--primary` "Log ›" opens the existing inline number input in place
     (`logStepsManual`).
   - Weight: value "78.4" + " kg · today ✓" (or the last date); third line 11px `--primary`
     "−2.0 kg since week 1" (suppressed when `weightSeries.length < 2`).
5. **Weight trend** — `.ds-label` "Weight trend" ↔ 11px muted "goal 72 kg" (from
   `weightGoalKg`; omit if none). Existing `WeighInTrendChart`, height 60, `margin-top:10px`.
   Empty state copy unchanged.
6. **Recent PRs** — `.ds-label`, hairline list, up to 3 rows: 13px name ↔ mono 13px
   `--primary` "60 kg × 9". From `computeSessionPRs` / PR store. Section unmounts when empty.
7. **Tomorrow** — the one filled row: `--surface-raised`, radius 14, `12px 14px`; 11px muted
   "Tomorrow" over 13.5px/500 "Pull & Hinge · 5 exercises"; trailing chevron →
   `#/exercise` peek of that day. Rest day tomorrow: "Rest day".
Removed from Home: the hero wash gradients + `grain-overlay`, the "Progress" rolling‑average
block (its number now lives in the Weight cell), the "What's left" warn line (the nudge carries
it when relevant).

### Nutrition — `NutritionDisplay.tsx` + `MealPlan.tsx`
1. `.ds-label` "Nutrition · Wednesday".
2. **Ring meter** unchanged geometry (112px, five rings, colours per the tab‑restructure
   handoff). Right: mega number `1240` (46px/700/−.04em, `#E4FCF4`, `.glow-mint-lg`), caption
   10.5px/.16em "kcal · 1240 left", then a **2×2 legend** (`gap:4px 12px`, 11px): 8px swatch,
   muted letter (P/C/F/H₂O), mono value. Replaces the five stacked legend rows.
3. **TrAIner nudge** — protein/water shortfall line (derive: `target − eaten` per macro; pick
   the largest % gap; mention which planned meal covers it). If nothing is behind, unmount.
4. **Today's meals** — `.ds-label` ↔ 11px `--primary` "Grocery list ›" (→ `#/tools`). Hairline
   rows: `.ds-label-compact` slot, 16px/500 name (truncate), right mono 13px kcal (`--primary`
   + " ✓" when logged, else muted) + `ChevronRight` 14px muted. Expand‑in‑place behaviour from
   the previous handoff is unchanged — only the collapsed row is restyled.
5. **Target** — one hairline row, no card: `.ds-label` "Target", 13px "2480 kcal · <muted>TDEE
   2780 − 300 for fat loss</muted>", right 11px `--primary` "How it's set ›" → opens the
   existing BMR/TDEE strip + method selector in a sheet (`ui/drawer` / `Dialog`). The
   "How your targets are set", "Weekly Dynamic Targets" and "Nutrition Method" `Card`s leave
   the scroll. `WeighInCard` leaves too — weigh‑in is logged from Home's Weight cell (tap →
   existing weigh‑in input) and from chat.
6. Water row: **removed from the scroll** — water is the H₂O ring/legend here and the quick‑add
   is on Home. Keep the target editor inside "How it's set ›".

### Exercise · today — `exercise/TodayPanel.tsx`, `WeekContextRow.tsx`, `ExerciseRow.tsx`
1. Context line 12.5px `--text-tertiary` "Wk 3/16 · B1 Hypertrophy · ~52 min" with a
   `ChevronDown` 14px `--primary` (expansion behaviour unchanged). The `--surface-raised` card
   around it goes; the **week strip** sits directly under (`margin-top:12px`).
2. Hero: 10.5px/.2em `--primary` "Today · Wednesday"; focus 36px/700/−.035em/1.02 +
   `.glow-text`; 2px progress line (`--hairline` / `--primary`), `margin-top:12px`.
3. **TrAIner nudge** — today's coaching line for the first main lift (progression /
   calibration cue / coach_note, in that order).
4. Warm‑up counted line 13px `--text-tertiary` (unchanged).
5. **Exercise list** — hairline rows (already specced in the previous handoff; unchanged):
   `.ds-label-compact` section label, 16px/500 name, right mono 12px `--text-tertiary`
   "3×8–11 · 62.5 kg" + chevron.
6. "＋ Add unplanned work" 13px `--text-tertiary`.
7. **Primary action** is a fixed bar above the tab bar: `padding:10px 22px 12px`, fade
   `linear-gradient(to top, var(--background) 70%, transparent)`, 52px gradient CTA
   "Start workout". This is the existing BottomDock row B — restyle only. List gets
   `padding-bottom:100px`.

### Exercise · active session — `#/train` (`ActiveSessionScreen`)
- **Header** 14px/16px: `X` 32px ghost · focus 13px/600 over 11px muted "Wednesday · <mono>41:12</mono>" · "Finish" 13px/600 `--primary` text button.
- **Rail** — horizontal chips 30px, radius 999, `0 10px`, 12px: current `rgba(glow,.14)` +
  `1px rgba(glow,.4)` + `--primary`; others `--surface-raised` `--text-tertiary`. Marks `● ○ ✓`.
- **Focused stop**: `.ds-label-compact` "Main lift · 2 of 6"; name 30px/700/−.03em/1.05; load
  row — mono 32px/700 `#E4FCF4` + 13px muted "kg · from your last session ⓘ" (provenance
  labels unchanged).
- **TrAIner nudge, compact** — the progression/PR line for this lift (`projectNextLoad`,
  `checkForPR`).
- **Ramp** — `.ds-label-compact` "Ramp", mono 12px inline `⊙ 20×10 · ⊙ 40×5 · ○ 50×3 …`
  (ticked steps `--primary`). Never collapsible.
- **Set rows** (existing `SetGrid`): logged — `--surface-raised`, radius 12, `9px 12px`, mono
  `S1` 11px muted 20px wide, mono 13px "62.5 kg × 9", `Check` 14px `--primary`. Active —
  `1px solid rgba(glow,.3)`, two inline inputs (56px/44px × 36px, radius 9, `--background`,
  mono 13px) with 10px unit captions, trailing 44×36 `--primary` confirm with `.glow-mint-box`.
  "＋ Add set" 12px muted.
- **Dock** (`--surface-deep`, `10px 16px 14px`): row A rest timer 44px `--surface-raised`
  radius 12 — `Timer` icon `--primary`, mono 18px/600, 12px muted "Rest · Bench", `−30s`
  `+30s` `--text-tertiary`, "Skip ▸" `--primary`. Row B: 48px `--primary` "Next: Goblet Squat ▸"
  flex 1 + two 48px `--surface-raised` squares — `Calculator` (`--primary`, opens
  `PlateCalculator` seeded with the current load) and `MessageCircle` (chat summon). State
  table from `LAYOUT-DESIGN.md` §3.6 is unchanged.

### Tools — `ToolsTab.tsx`
1. `.ds-label` "Tools".
2. **Grid** `grid-template-columns:1fr 1fr; gap:10px`. Tile: `--surface-raised`, radius 16,
   `16px 14px`, `min-height:104px`, column `gap:12px`: lucide 20px `--primary` (`Timer`,
   `TimerReset`, `Disc`, `List`, `History`, `BookOpen`) → 15px/600 name → 11.5px muted sub.
   Subs are live: "Auto‑starts after a set" · "EMOM, Tabata, laps" · "20 kg bar · your plates"
   · "14 items · 3 checked" · "10 sessions · 7 PRs" · "16 weeks · block 1 of 4".
   Targets: rest‑timer settings sheet; `TimersPanel` (round/interval) full‑screen as today;
   `PlateCalculator` host; grocery section below (scroll to); `SessionHistoryDialog`;
   `#/exercise/program`.
3. **Grocery · this week** — `.ds-label`, hairline rows: 20px checkbox (radius 6, `1.5px
   solid var(--border)`; checked = `--primary` fill + 12px `Check` in `--primary-foreground`,
   row text struck + muted), 14px name, mono 12px muted quantity. Show 3 + "All 14 items ›"
   12px `--primary` expanding in place. Existing `GroceryList` logic; restyle rows.
   The `RoundField` full‑bleed takeover behaviour is unchanged.

### Profile — `ProfileScreen.tsx`
Full‑screen as today. `X` 32px + "Profile" 15px/600. Identity: 56px initial circle
(`--surface-raised` @50%) + 20px/700 name + 12px muted "Fat loss · 4 days/week · Home gym".
Four `.ds-label` groups of hairline rows (14px key ↔ 12.5px muted value + chevron):
**You** (Body & goal · Training days · Equipment) · **Nutrition** (Dietary restrictions · Foods
to avoid · Method) · **TrAIner** (Injuries & niggles · Things it remembers · Reply speed) ·
**App** (Appearance · Units · Replay the tour). Each row opens the existing section editor
(the `initialSection` refs already exist). Footer: 44px outlined destructive "Start a new
plan…" → existing confirm dialog.

### Tab bar — `BottomTabBar.tsx`
Unchanged geometry. FAB: plain glowing disc by default; ring + `chat-unread` pulse only while
`chatAttention` (the prop already exists) — keyframes in the chat handoff README.

---

## Behaviour / state
No new stores. New derived data: greeting period; `sessionGlance` (exists); macro shortfall
for the Nutrition nudge; tile subtitles for Tools (counts from `useTimers`, grocery store,
session history, mesocycle). `Dashboard` regains `logWater` (quick‑add only) — water *ownership*
stays with Nutrition's ring/legend and target editor.

## Motion
Nudge and CTA: `.glow-bloom-once` on first paint. Row expand/collapse 180ms. Everything off
under `prefers-reduced-motion`.

## Files
- `App Revamp.dc.html` — reference; **use block `1a` only** (Home, Nutrition, Exercise today,
  Active session, Tools, Profile). `1b`/`1c` are rejected alternatives.
- New: `src/components/TrainerNudge.tsx`.
- Modify: `Dashboard.tsx`, `NutritionDisplay.tsx`, `MealPlan.tsx`, `exercise/TodayPanel.tsx`,
  `exercise/WeekContextRow.tsx`, `exercise/ExerciseRow.tsx`, `exercise/SetGrid.tsx`, the
  `#/train` screen + `BottomDock.tsx`, `ToolsTab.tsx`, `GroceryList.tsx`, `ProfileScreen.tsx`,
  `App.tsx` (retire `InsightBanner tone="ai"` stack in favour of the nudge), `BottomTabBar.tsx`
  (unread ring/pulse). `index.css` unchanged.

## Suggested Claude Code prompt

> Read `design_handoff_app_polish/README.md` and open `App Revamp.dc.html` in a browser —
> only the `1a` block applies. Implement the polish one screen per commit: Home, then Tools,
> Nutrition, Exercise today, active session, Profile. Build `TrainerNudge` first and feed it
> from the existing adaptation messages / coach tip / progression payoff — no new model calls.
> Use tokens from `src/index.css`, never the prototype's hex values; keep every write on the
> existing local‑first stores. Run the relevant `scripts/test-*.ts` after each screen and check
> each tab on a 390×844 viewport against the prototype.
