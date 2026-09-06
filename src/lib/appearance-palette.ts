// ---------------------------------------------------------------------------
// The five themes and six accents, as DATA — one table the settings sheet
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
}

export const THEME_ORDER: ThemeName[] = ['nightshift', 'graphite', 'ember', 'field', 'daylight']
export const ACCENT_ORDER: AccentOverride[] = ['theme', 'mint', 'coral', 'violet', 'sky', 'lime']

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

/** Below this, a button you have to FIND is too close to its canvas. */
export const CONTRAST_FLOOR = 3
