// ---------------------------------------------------------------------------
// The eight themes and nine accents, as DATA — one table the settings sheet
// reads for its previews, its swatches and its contrast maths.
//
// These values duplicate index.css on purpose and it is worth saying why,
// because duplication is usually the bug. The sheet has to PAINT a theme it
// is not currently wearing: a preview card for Daylight, rendered while the
// app is in Nightshift, cannot read Daylight's tokens from the cascade —
// nothing on the page has that theme applied. Custom properties are not
// enumerable from JS either, so there is no honest way to derive them.
//
// test-appearance.ts asserts the two files agree, so a value edited in one
// and not the other turns a gate red rather than silently showing a preview
// that lies about what you are choosing.
// ---------------------------------------------------------------------------
import type { ThemeName, AccentOverride } from './appearance-store'

export interface ThemePreview {
  label: string
  /** The two-word description under the name. */
  subtitle: string
  canvas: string
  surface: string
  text: string
  muted: string
  hairline: string
  /** The theme's own accent as a FILL — what "Match theme" paints a button with. */
  accent: string
  accent2: string
  /**
   * The same accent as WORDS. A fill only has to be found; a word has to be
   * read at 11-13px, and on a light canvas those stopped being the same
   * colour. Dark themes repeat `accent` here: there the two jobs still agree.
   */
  accentText: string
  /** True where the canvas is paper: drives the accent dark-step and the glow clamp. */
  light: boolean
}

export const THEME_PREVIEWS: Record<ThemeName, ThemePreview> = {
  nightshift: {
    label: 'Nightshift', subtitle: 'deep violet · mint',
    canvas: '#1A1636', surface: 'rgba(69,60,142,.30)',
    text: '#F5F3FF', muted: '#9A93C9', hairline: 'rgba(245,243,255,.11)',
    accent: '#5BE9C2', accent2: '#3ED3AA', accentText: '#5BE9C2', light: false,
  },
  graphite: {
    label: 'Graphite', subtitle: 'near-black · violet',
    canvas: '#121216', surface: 'rgba(53,51,63,.34)',
    text: '#F1F0F5', muted: '#9B9AA8', hairline: 'rgba(241,240,245,.11)',
    accent: '#B49BFF', accent2: '#7C5AE0', accentText: '#B49BFF', light: false,
  },
  ember: {
    label: 'Ember', subtitle: 'warm dark · amber',
    canvas: '#171210', surface: 'rgba(90,62,40,.32)',
    text: '#F7EFE7', muted: '#B5A292', hairline: 'rgba(247,239,231,.11)',
    accent: '#FF8A3D', accent2: '#E85F14', accentText: '#FF8A3D', light: false,
  },
  field: {
    label: 'Field', subtitle: 'olive · lime',
    canvas: '#141810', surface: 'rgba(70,82,52,.34)',
    text: '#F1F4E9', muted: '#A6AF92', hairline: 'rgba(241,244,233,.11)',
    accent: '#C6F24E', accent2: '#8FBE1F', accentText: '#C6F24E', light: false,
  },
  daylight: {
    label: 'Daylight', subtitle: 'paper · deep mint',
    canvas: '#F4F2FA', surface: 'rgba(90,80,150,.10)',
    text: '#15122B', muted: '#5C5680', hairline: 'rgba(21,18,43,.14)',
    accent: '#19B894', accent2: '#0E9C7C', accentText: '#00705B', light: true,
  },
  midnight: {
    label: 'Midnight', subtitle: 'navy · sky',
    canvas: '#0E1626', surface: 'rgba(60,84,130,.28)',
    text: '#EEF3FB', muted: '#8E9FBC', hairline: 'rgba(238,243,251,.11)',
    accent: '#6FB7FF', accent2: '#2E7FE0', accentText: '#6FB7FF', light: false,
  },
  rosewood: {
    label: 'Rosewood', subtitle: 'plum · coral',
    canvas: '#1C1018', surface: 'rgba(110,60,90,.30)',
    text: '#FBEFF4', muted: '#B899A9', hairline: 'rgba(251,239,244,.11)',
    accent: '#FF8FA3', accent2: '#E85A78', accentText: '#FF8FA3', light: false,
  },
  linen: {
    label: 'Linen', subtitle: 'cream · amber',
    canvas: '#F7F2EA', surface: 'rgba(120,90,60,.10)',
    text: '#231A12', muted: '#6E5E4E', hairline: 'rgba(35,26,18,.13)',
    accent: '#F0843F', accent2: '#D8651E', accentText: '#9A3F0B', light: true,
  },
  frost: {
    label: 'Frost', subtitle: 'ice · cobalt',
    canvas: '#EEF3F8', surface: 'rgba(60,90,130,.10)',
    text: '#0F1B2D', muted: '#56697F', hairline: 'rgba(15,27,45,.13)',
    accent: '#2569D0', accent2: '#1B57B8', accentText: '#1A5FBF', light: true,
  },
}

export interface AccentPreview {
  label: string
  /** Null for 'theme', which has no colour of its own — it borrows the theme's. */
  bright: string | null
  deep: string | null
  /** The step used on a light canvas as a fill, where the bright end washes out. */
  dark: string | null
  /** The step used on a light canvas as WORDS — darker still than `dark`. */
  text: string | null
  glowRgb: string | null
}

export const ACCENT_PREVIEWS: Record<AccentOverride, AccentPreview> = {
  theme:  { label: 'Match theme', bright: null, deep: null, dark: null, text: null, glowRgb: null },
  mint:   { label: 'Mint',   bright: '#5BE9C2', deep: '#3ED3AA', dark: '#19B894', text: '#00705B', glowRgb: '91,233,194' },
  coral:  { label: 'Coral',  bright: '#FF7A6B', deep: '#E8493A', dark: '#E8493A', text: '#B32A1D', glowRgb: '255,122,107' },
  violet: { label: 'Violet', bright: '#B49BFF', deep: '#7C5AE0', dark: '#7C5AE0', text: '#5A3FC4', glowRgb: '155,125,245' },
  sky:    { label: 'Sky',    bright: '#6FB7FF', deep: '#2E7FE0', dark: '#2569D0', text: '#1A5FBF', glowRgb: '111,183,255' },
  lime:   { label: 'Lime',   bright: '#C6F24E', deep: '#8FBE1F', dark: '#7FAF12', text: '#4E7300', glowRgb: '198,242,78' },
  amber:  { label: 'Amber',  bright: '#FF8A3D', deep: '#E85F14', dark: '#F0843F', text: '#9A3F0B', glowRgb: '255,138,61' },
  rose:   { label: 'Rose',   bright: '#FF8FA3', deep: '#E85A78', dark: '#E85A78', text: '#B7264B', glowRgb: '255,143,163' },
  gold:   { label: 'Gold',   bright: '#FFD166', deep: '#E6B02E', dark: '#D9A21E', text: '#7A5600', glowRgb: '255,209,102' },
}

/**
 * DARK FIRST, THEN LIGHT, and the settings sheet draws the break between them
 * as two labelled rows. Six and three at three per row on a 390px screen.
 */
export const DARK_THEME_ORDER: ThemeName[] = ['nightshift', 'graphite', 'ember', 'field', 'midnight', 'rosewood']
export const LIGHT_THEME_ORDER: ThemeName[] = ['daylight', 'linen', 'frost']
export const THEME_ORDER: ThemeName[] = [...DARK_THEME_ORDER, ...LIGHT_THEME_ORDER]
export const ACCENT_ORDER: AccentOverride[] = ['theme', 'mint', 'coral', 'violet', 'sky', 'lime', 'amber', 'rose', 'gold']

/**
 * The colour a given theme+accent pair actually paints with.
 *
 * Three rules make this more than a lookup: 'theme' has no colour of its own
 * and borrows the theme's; a light canvas takes the dark step because the
 * bright end disappears against paper; and `forText` takes a further step
 * down, because the colour that reads as a button does not read as an 11px
 * word. The settings sheet passes forText for its swatches, so a chip is
 * honest about what a LINK will look like — which is what people actually
 * judge an accent by.
 */
export function resolveAccentColor(theme: ThemeName, accent: AccentOverride, forText = false): string {
  const t = THEME_PREVIEWS[theme]
  const a = ACCENT_PREVIEWS[accent]
  if (!a.bright) return forText ? t.accentText : t.accent
  if (!t.light) return a.bright
  return forText ? (a.text ?? a.dark ?? a.bright) : (a.dark ?? a.deep ?? a.bright)
}

// --- WCAG contrast, for the guard ------------------------------------------

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance of a #rrggbb colour, per WCAG 2.1. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** Contrast ratio between two opaque colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Below this, accent WORDS are too close to their canvas. */
export const CONTRAST_FLOOR = 3

/**
 * The seven floors every theme is held to, from design_handoff_themes.
 *
 * They differ because the jobs differ. Body copy needs 4.5:1 and a heading
 * can live at 3:1, so the tokens that carry small text (muted-foreground,
 * primary-text, role-ai-text) sit at 4.5; the ones that carry large or
 * structural text (foreground, text-tertiary, num-hero) sit higher; and
 * primary-foreground is measured against the FILL it is printed on rather
 * than against the canvas, because that is where it lands.
 */
export const CONTRAST_FLOORS = {
  foreground: 12,
  textTertiary: 7,
  mutedForeground: 4.5,
  primaryText: 4.5,
  numHero: 7,
  roleAiText: 4.5,
  /** Against --primary, not against the canvas. */
  primaryForeground: 4.5,
} as const

/**
 * The per-theme values the floors are measured on that the preview table does
 * not already carry. Duplicated from index.css for the same reason everything
 * else here is — a gate cannot read a theme it is not wearing — and pinned
 * against it by test-appearance.ts §3.
 */
export interface ThemeInk {
  textTertiary: string
  numHero: string
  roleAiText: string
  /** The ink printed ON --primary. Per theme since 6 Sep 2026. */
  primaryForeground: string
}

export const THEME_INKS: Record<ThemeName, ThemeInk> = {
  nightshift: { textTertiary: '#C2BCE8', numHero: '#E4FCF4', roleAiText: '#DAD5FA', primaryForeground: '#08281F' },
  graphite:   { textTertiary: '#C4C1D2', numHero: '#F3EEFF', roleAiText: '#DDD3FF', primaryForeground: '#08281F' },
  ember:      { textTertiary: '#DCC9B7', numHero: '#FFF1E4', roleAiText: '#FFD9BD', primaryForeground: '#2A1300' },
  field:      { textTertiary: '#CBD3B7', numHero: '#F4FBDD', roleAiText: '#E3F0B8', primaryForeground: '#1B2600' },
  midnight:   { textTertiary: '#C2CFE3', numHero: '#E6F1FF', roleAiText: '#CFE2FF', primaryForeground: '#04213F' },
  rosewood:   { textTertiary: '#E0C7D3', numHero: '#FFEEF3', roleAiText: '#FFD3DC', primaryForeground: '#3A0A16' },
  daylight:   { textTertiary: '#3A3462', numHero: '#0F3D33', roleAiText: '#3F2E8C', primaryForeground: '#08281F' },
  linen:      { textTertiary: '#4A3B2D', numHero: '#3A1E0C', roleAiText: '#7A3A12', primaryForeground: '#2A1300' },
  frost:      { textTertiary: '#2F4260', numHero: '#0C2A4A', roleAiText: '#1E4D8F', primaryForeground: '#FFFFFF' },
}

/** The ink an accent override prints on its own fill, on a light canvas. */
export const ACCENT_INKS: Record<Exclude<AccentOverride, 'theme'>, string> = {
  mint: '#08281F', coral: '#FFFFFF', violet: '#FFFFFF', sky: '#FFFFFF',
  lime: '#08281F', amber: '#08281F', rose: '#FFFFFF', gold: '#08281F',
}

/**
 * The ink actually printed on the button for a theme+accent pair.
 *
 * On a light canvas an accent override brings its own (--accent-on), because
 * the theme's ink is tuned for the theme's own accent — near-black on cobalt
 * would fail. On a dark canvas the accent only replaces the fill's bright
 * step, which every theme's ink already clears, so the theme keeps its own.
 */
export function resolveInkOnFill(theme: ThemeName, accent: AccentOverride, light: boolean): string {
  if (accent === 'theme' || !light) return THEME_INKS[theme].primaryForeground
  return ACCENT_INKS[accent]
}
