// ---------------------------------------------------------------------------
// The five themes and nine accents, as DATA — one table the settings sheet
// reads for its previews, its swatches and its contrast maths.
//
// These values duplicate index.css on purpose and it is worth saying why,
// because duplication is usually the bug. The sheet has to PAINT a theme it
// is not currently wearing: a preview card for Ruby, rendered while the
// app is in Nightshift, cannot read Ruby's tokens from the cascade —
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
  /** The theme's own accent: the fill of a button and the colour of its words. */
  accent: string
  accent2: string
}

export const THEME_PREVIEWS: Record<ThemeName, ThemePreview> = {
  nightshift: {
    label: 'Nightshift', subtitle: 'deep violet · mint',
    canvas: '#1A1636', surface: 'rgba(69,60,142,.30)',
    text: '#F5F3FF', muted: '#9A93C9', hairline: 'rgba(245,243,255,.11)',
    accent: '#5BE9C2', accent2: '#3ED3AA',
  },
  ruby: {
    label: 'Ruby', subtitle: 'wine violet · red',
    canvas: '#1E1430', surface: 'rgba(110,70,130,.30)',
    text: '#F8F0FA', muted: '#B39AC0', hairline: 'rgba(248,240,250,.11)',
    accent: '#FF5C7A', accent2: '#E8405F',
  },
  amethyst: {
    label: 'Amethyst', subtitle: 'deep violet · purple',
    canvas: '#1B1240', surface: 'rgba(90,64,170,.30)',
    text: '#F6F2FF', muted: '#A496D6', hairline: 'rgba(246,242,255,.11)',
    accent: '#B49BFF', accent2: '#8B6CF0',
  },
  sapphire: {
    label: 'Sapphire', subtitle: 'navy violet · blue',
    canvas: '#141838', surface: 'rgba(60,74,150,.30)',
    text: '#F1F4FF', muted: '#939FD0', hairline: 'rgba(241,244,255,.11)',
    accent: '#6FB7FF', accent2: '#3E8EF0',
  },
  emerald: {
    label: 'Emerald', subtitle: 'slate violet · green',
    canvas: '#151B34', surface: 'rgba(60,80,140,.30)',
    text: '#F0F5FA', muted: '#95A2C8', hairline: 'rgba(240,245,250,.11)',
    accent: '#5EE08A', accent2: '#34C46A',
  },
}

export interface AccentPreview {
  label: string
  /** Null for 'theme', which has no colour of its own — it borrows the theme's. */
  bright: string | null
  deep: string | null
  glowRgb: string | null
}

export const ACCENT_PREVIEWS: Record<AccentOverride, AccentPreview> = {
  theme:  { label: 'Match theme', bright: null, deep: null, glowRgb: null },
  mint:   { label: 'Mint',   bright: '#5BE9C2', deep: '#3ED3AA', glowRgb: '91,233,194' },
  coral:  { label: 'Coral',  bright: '#FF7A6B', deep: '#E8493A', glowRgb: '255,122,107' },
  violet: { label: 'Violet', bright: '#B49BFF', deep: '#7C5AE0', glowRgb: '155,125,245' },
  sky:    { label: 'Sky',    bright: '#6FB7FF', deep: '#2E7FE0', glowRgb: '111,183,255' },
  lime:   { label: 'Lime',   bright: '#C6F24E', deep: '#8FBE1F', glowRgb: '198,242,78' },
  amber:  { label: 'Amber',  bright: '#FF8A3D', deep: '#E85F14', glowRgb: '255,138,61' },
  rose:   { label: 'Rose',   bright: '#FF8FA3', deep: '#E85A78', glowRgb: '255,143,163' },
  gold:   { label: 'Gold',   bright: '#FFD166', deep: '#E6B02E', glowRgb: '255,209,102' },
}

/** Nightshift first (the default), then the four of 27 Nov 2026 in his order: red, purple, blue, green. */
export const THEME_ORDER: ThemeName[] = ['nightshift', 'ruby', 'amethyst', 'sapphire', 'emerald']
export const ACCENT_ORDER: AccentOverride[] = ['theme', 'mint', 'coral', 'violet', 'sky', 'lime', 'amber', 'rose', 'gold']

/**
 * The colour a given theme+accent pair actually paints with: 'theme' has no colour of its own and borrows the
 * theme's; any other accent is its bright end. Every theme is dark, so a button and a word share one colour.
 */
export function resolveAccentColor(theme: ThemeName, accent: AccentOverride): string {
  return ACCENT_PREVIEWS[accent].bright ?? THEME_PREVIEWS[theme].accent
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
  ruby:       { textTertiary: '#D6C4DE', numHero: '#FFE8EE', roleAiText: '#E2D9FB', primaryForeground: '#2A0610' },
  amethyst:   { textTertiary: '#C9BDF0', numHero: '#F1ECFF', roleAiText: '#E0D8FF', primaryForeground: '#1A0B45' },
  sapphire:   { textTertiary: '#C0C8EA', numHero: '#E6F1FF', roleAiText: '#DAD5FA', primaryForeground: '#04213F' },
  emerald:    { textTertiary: '#C0C9E2', numHero: '#E6FCEE', roleAiText: '#DAD5FA', primaryForeground: '#052A14' },
}
