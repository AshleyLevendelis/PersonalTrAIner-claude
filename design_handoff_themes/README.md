# Handoff: PersonalTrAIner — themes 5 → 8, light canvases made readable

## Overview

Two problems, one change. (1) Daylight text is hard to read because three tokens never got a
light value: hero numbers are hard‑coded `#E4FCF4`, `--role-ai-text` (`#DAD5FA`) lives in `:root`,
and the accent is used *as text* at 11–13px where it measures 3.8:1. Glow text‑shadows haze small
type on paper. (2) Only one light theme exists. This handoff adds three tokens every theme must
define, retunes Daylight, adds two dark (Midnight, Rosewood) and two light (Linen, Frost) themes,
and grows accents from 6 to 8 with a dedicated text step for light canvases.

Design reference: `Themes.dc.html` — blocks **1a** (dark), **1b** (light), **1c** (accents), **1d**
(rules). Contrast ratios in the file are computed live from the same values below.

## New tokens (every `[data-theme]` block defines all three)

- `--primary-text` — the accent when it is *words*: links, "Nutrition ›", PR values, active tab
  label, `.ds-label` in accent, chip text. Dark themes: `var(--theme-primary)`. Light: a darker
  step ≥ 4.5:1. Replace every `text-primary` / `text-[color:var(--primary)]` on text with it;
  `--primary` stays for fills, rings, progress lines, borders.
- `--num-hero` — replaces every `#E4FCF4` literal (Dashboard, NutritionDisplay, active session).
- `--role-ai-text`, `--role-ai-bg`, `--role-ai-border` — move out of `:root` into each theme.
  `TrainerNudge` and `InsightBanner tone="ai"` read these.
- `--primary-foreground` becomes per‑theme (was a global `#08281F`).

## Floors — enforce in `scripts/test-appearance.ts` for every theme
foreground/canvas ≥ 12 · text‑tertiary/canvas ≥ 7 · muted‑foreground/canvas ≥ 4.5 ·
primary‑text/canvas ≥ 4.5 · num‑hero/canvas ≥ 7 · role‑ai‑text/canvas ≥ 4.5 ·
primary‑foreground/primary ≥ 4.5. The in‑app contrast guard (`AppearanceSection`) measures
`--primary-text` against the canvas, not the fill.

## Light‑canvas behaviour (`[data-canvas="light"]`)
- `.glow-text`, `.glow-mint`, `.glow-mint-lg`, `.glow-violet`, `.glow-warn` on **text** → `text-shadow:none`.
  Box glows (`.glow-mint-box`, FAB, CTA) stay at the `subtle` clamp.
- `--hero-wash` → `.08`. Grain stays inverted.
- CTA shadow: `0 6px 16px rgba(var(--glow-rgb),.25)` instead of the halo.

## Token blocks — `src/index.css`

Keep existing values for Nightshift / Graphite / Ember / Field and **add** these lines to each:

```css
[data-theme="nightshift"] { --primary-text: var(--theme-primary); --num-hero: #E4FCF4; --role-ai-bg: rgba(139,123,255,.10); --role-ai-border: rgba(139,123,255,.25); --role-ai-text: #DAD5FA; --primary-foreground: #08281F; }
[data-theme="graphite"]   { --primary-text: var(--theme-primary); --num-hero: #F3EEFF; --role-ai-bg: rgba(180,155,255,.10); --role-ai-border: rgba(180,155,255,.25); --role-ai-text: #DDD3FF; --primary-foreground: #08281F; }
[data-theme="ember"]      { --primary-text: var(--theme-primary); --num-hero: #FFF1E4; --role-ai-bg: rgba(255,138,61,.10);  --role-ai-border: rgba(255,138,61,.25);  --role-ai-text: #FFD9BD; --primary-foreground: #2A1300; }
[data-theme="field"]      { --primary-text: var(--theme-primary); --num-hero: #F4FBDD; --role-ai-bg: rgba(198,242,78,.08);  --role-ai-border: rgba(198,242,78,.22);  --role-ai-text: #E3F0B8; --primary-foreground: #1B2600; }
```

New dark themes:

```css
/* Midnight — navy · sky */
[data-theme="midnight"] {
  --background: #0E1626; --foreground: #EEF3FB;
  --card: #16223A; --card-foreground: #EEF3FB; --popover: #16223A; --popover-foreground: #EEF3FB;
  --secondary: #1C2C48; --secondary-foreground: #EEF3FB; --muted: #16223A; --muted-foreground: #8E9FBC;
  --accent: #1C2C48; --accent-foreground: #EEF3FB; --border: #2B3A58; --input: #16223A;
  --text-tertiary: #C2CFE3; --text-dim: #2B3A58; --surface-deep: #121C30; --surface-raised: rgba(60,84,130,.28);
  --line-emphasis: #34496F; --hairline: rgba(238,243,251,.11); --grain-rgb: 238,243,251;
  --theme-primary: #6FB7FF; --theme-primary-2: #2E7FE0; --theme-glow-rgb: 111,183,255;
  --primary-text: var(--theme-primary); --primary-foreground: #04213F; --num-hero: #E6F1FF;
  --role-ai-bg: rgba(111,183,255,.10); --role-ai-border: rgba(111,183,255,.25); --role-ai-text: #CFE2FF;
  --hero-wash: rgba(111,183,255,.16);
}
/* Rosewood — plum · coral */
[data-theme="rosewood"] {
  --background: #1C1018; --foreground: #FBEFF4;
  --card: #2A1824; --card-foreground: #FBEFF4; --popover: #2A1824; --popover-foreground: #FBEFF4;
  --secondary: #382030; --secondary-foreground: #FBEFF4; --muted: #2A1824; --muted-foreground: #B899A9;
  --accent: #382030; --accent-foreground: #FBEFF4; --border: #4E2F42; --input: #2A1824;
  --text-tertiary: #E0C7D3; --text-dim: #4E2F42; --surface-deep: #23141E; --surface-raised: rgba(110,60,90,.30);
  --line-emphasis: #5E3A50; --hairline: rgba(251,239,244,.11); --grain-rgb: 251,239,244;
  --theme-primary: #FF8FA3; --theme-primary-2: #E85A78; --theme-glow-rgb: 255,143,163;
  --primary-text: var(--theme-primary); --primary-foreground: #3A0A16; --num-hero: #FFEEF3;
  --role-ai-bg: rgba(255,143,163,.10); --role-ai-border: rgba(255,143,163,.25); --role-ai-text: #FFD3DC;
  --hero-wash: rgba(255,143,163,.14);
}
```

Light themes (Daylight replaces the shipped block):

```css
/* Daylight — paper · deep mint (retuned) */
[data-theme="daylight"] {
  --background: #F4F2FA; --foreground: #15122B;
  --card: #FFFFFF; --card-foreground: #15122B; --popover: #FFFFFF; --popover-foreground: #15122B;
  --secondary: #E9E6F3; --secondary-foreground: #15122B; --muted: #EFEDF7; --muted-foreground: #5C5680;
  --accent: #E9E6F3; --accent-foreground: #15122B; --border: #D3CDE4; --input: #FFFFFF;
  --text-tertiary: #3A3462; --text-dim: #B3ADCB; --surface-deep: #E9E6F3; --surface-raised: rgba(90,80,150,.10);
  --line-emphasis: #C6BFDE; --hairline: rgba(21,18,43,.14); --grain-rgb: 21,18,43;
  --theme-primary: #19B894; --theme-primary-2: #0E9C7C; --theme-glow-rgb: 25,184,148;
  --primary-text: #00705B; --primary-foreground: #08281F; --num-hero: #0F3D33;
  --role-ai-bg: rgba(124,90,224,.10); --role-ai-border: rgba(124,90,224,.22); --role-ai-text: #3F2E8C;
  --hero-wash: rgba(156,141,255,.08);
}
/* Linen — cream · amber */
[data-theme="linen"] {
  --background: #F7F2EA; --foreground: #231A12;
  --card: #FFFDF9; --card-foreground: #231A12; --popover: #FFFDF9; --popover-foreground: #231A12;
  --secondary: #EEE6DA; --secondary-foreground: #231A12; --muted: #F1EBE1; --muted-foreground: #6E5E4E;
  --accent: #EEE6DA; --accent-foreground: #231A12; --border: #D9CDBD; --input: #FFFDF9;
  --text-tertiary: #4A3B2D; --text-dim: #C4B5A3; --surface-deep: #EEE6DA; --surface-raised: rgba(120,90,60,.10);
  --line-emphasis: #CDBDA8; --hairline: rgba(35,26,18,.13); --grain-rgb: 35,26,18;
  --theme-primary: #F0843F; --theme-primary-2: #D8651E; --theme-glow-rgb: 240,132,63;
  --primary-text: #9A3F0B; --primary-foreground: #2A1300; --num-hero: #3A1E0C;
  --role-ai-bg: rgba(154,63,11,.08); --role-ai-border: rgba(154,63,11,.20); --role-ai-text: #7A3A12;
  --hero-wash: rgba(240,132,63,.08);
}
/* Frost — ice · cobalt */
[data-theme="frost"] {
  --background: #EEF3F8; --foreground: #0F1B2D;
  --card: #FFFFFF; --card-foreground: #0F1B2D; --popover: #FFFFFF; --popover-foreground: #0F1B2D;
  --secondary: #E1E9F1; --secondary-foreground: #0F1B2D; --muted: #E7EEF5; --muted-foreground: #56697F;
  --accent: #E1E9F1; --accent-foreground: #0F1B2D; --border: #C9D6E4; --input: #FFFFFF;
  --text-tertiary: #2F4260; --text-dim: #A9B8CA; --surface-deep: #E1E9F1; --surface-raised: rgba(60,90,130,.10);
  --line-emphasis: #B9C9DA; --hairline: rgba(15,27,45,.13); --grain-rgb: 15,27,45;
  --theme-primary: #2569D0; --theme-primary-2: #1B57B8; --theme-glow-rgb: 37,105,208;
  --primary-text: #1A5FBF; --primary-foreground: #FFFFFF; --num-hero: #0C2A4A;
  --role-ai-bg: rgba(26,95,191,.08); --role-ai-border: rgba(26,95,191,.20); --role-ai-text: #1E4D8F;
  --hero-wash: rgba(37,105,208,.08);
}
```

Accents (replace the block; each gains `--accent-text` for light canvases):

```css
[data-accent="mint"]   { --accent-bright:#5BE9C2; --accent-deep:#3ED3AA; --accent-dark:#19B894; --accent-text:#00705B; --theme-glow-rgb:91,233,194; }
[data-accent="coral"]  { --accent-bright:#FF7A6B; --accent-deep:#E8493A; --accent-dark:#E8493A; --accent-text:#B32A1D; --theme-glow-rgb:255,122,107; }
[data-accent="violet"] { --accent-bright:#B49BFF; --accent-deep:#7C5AE0; --accent-dark:#7C5AE0; --accent-text:#5A3FC4; --theme-glow-rgb:155,125,245; }
[data-accent="sky"]    { --accent-bright:#6FB7FF; --accent-deep:#2E7FE0; --accent-dark:#2569D0; --accent-text:#1A5FBF; --theme-glow-rgb:111,183,255; }
[data-accent="lime"]   { --accent-bright:#C6F24E; --accent-deep:#8FBE1F; --accent-dark:#7FAF12; --accent-text:#4E7300; --theme-glow-rgb:198,242,78; }
[data-accent="amber"]  { --accent-bright:#FF8A3D; --accent-deep:#E85F14; --accent-dark:#F0843F; --accent-text:#9A3F0B; --theme-glow-rgb:255,138,61; }
[data-accent="rose"]   { --accent-bright:#FF8FA3; --accent-deep:#E85A78; --accent-dark:#E85A78; --accent-text:#B7264B; --theme-glow-rgb:255,143,163; }
[data-accent="gold"]   { --accent-bright:#FFD166; --accent-deep:#E6B02E; --accent-dark:#D9A21E; --accent-text:#7A5600; --theme-glow-rgb:255,209,102; }

[data-accent]:not([data-accent="theme"]) { --theme-primary: var(--accent-bright); --theme-primary-2: var(--accent-deep); --primary-text: var(--accent-bright); }
[data-canvas="light"][data-accent]:not([data-accent="theme"]) { --theme-primary: var(--accent-dark); --theme-primary-2: var(--accent-dark); --primary-text: var(--accent-text); }
```
On a light canvas with an accent override, `--primary-foreground` resolves per accent: white for
sky/violet/coral/rose, `#08281F` for mint/lime/gold/amber — add a `--accent-on` per accent and
map it in the light rule.

## Code changes
- `appearance-store.ts`: `ThemeName` += `midnight | rosewood | linen | frost`; `LIGHT_THEMES` +=
  `linen, frost`; `AccentOverride` += `amber | rose | gold`; validation arrays updated; migration
  leaves stored values untouched.
- `appearance-palette.ts`: add the four themes (`canvas/surface/text/muted/hairline/accent/accent2/light`)
  plus a new `accentText` field per theme and `text` per accent; `resolveAccentColor` gains a
  `forText` flag returning the text step on light canvases. Keep `test-appearance.ts` asserting
  css ↔ ts agreement and add the seven floor checks above per theme.
- `AppearanceSection.tsx`: theme grid becomes two labelled rows — **Dark** (Nightshift, Graphite,
  Ember, Field, Midnight, Rosewood) and **Light** (Daylight, Linen, Frost), 3 per row on 390px.
  Prepend a **Match system** chip (`prefers-color-scheme` → Nightshift / Daylight). Accent chips
  render `resolveAccentColor(theme, accent, /*forText*/ true)` so the swatch is honest about what
  a link will look like. The contrast guard compares `--primary-text`.
- Component sweep: replace `#E4FCF4` → `var(--num-hero)`; text uses of `text-primary` /
  `var(--primary)` → `var(--primary-text)`; `InsightBanner tone="ai"` + `TrainerNudge` read
  `--role-ai-*`. `grep -n "E4FCF4\|DAD5FA\|text-primary" src/` should return nothing user‑facing.

## Files
- `Themes.dc.html` — reference. 1a dark, 1b light (with the "as shipped" Daylight failing on purpose), 1c accents, 1d rules.
- Modify: `src/index.css`, `src/lib/appearance-store.ts`, `src/lib/appearance-palette.ts`,
  `src/components/AppearanceSection.tsx`, `scripts/test-appearance.ts`, plus the literal sweep.

## Suggested Claude Code prompt

> Read `design_handoff_themes/README.md` and open `Themes.dc.html`. Implement in this order, one
> commit each: (1) the three new tokens + light‑canvas glow rules and the `#E4FCF4` / `text-primary`
> / `role-ai` sweep — verify Daylight (retuned values) reads correctly on every tab at 390×844;
> (2) the four new themes and three new accents in CSS, store and palette; (3) the settings
> sheet (Dark/Light rows, Match system, text‑step swatches, guard on `--primary-text`); (4) extend
> `scripts/test-appearance.ts` with the seven contrast floors for all 8 themes × 9 accents and
> make it pass. Report the measured ratios, not that the script exited 0.
