// ---------------------------------------------------------------------------
// Appearance preferences. Turn 9 ("Rounded again — colour system kept,
// themes moved into Settings") replaces the old 2-option canvas
// (Lifted/Deep) with 4 full themes, each carrying its own canvas/surface/
// text tokens AND a default accent hue — plus an independent accent
// override so the user can pick a hue without changing the theme. Both
// resolve to data-attributes on <html>; index.css does the rest. Glow is
// unchanged from the prior round.
//
// DELIBERATE DEVIATION from the fitplan_<domain>_v1:<profileId> convention
// used by active-session-store.ts / timer-store.ts: this key carries NO
// profile suffix. Appearance is a device-level display preference, not
// per-profile data, and a global key is what lets main.tsx apply it
// synchronously before React mounts — a per-profile key couldn't be read
// until the profile resolved, which would mean a visible flash of the wrong
// theme on every cold load. Precedent: `fitplan_dev_mode` in dev-clock.ts.
// ---------------------------------------------------------------------------

const KEY = 'fitplan_appearance_v2'
const LEGACY_KEY = 'fitplan_appearance_v1'

export type GlowLevel = 'off' | 'subtle' | 'full'
export type ThemeName = 'nightshift' | 'ember' | 'field' | 'graphite' | 'daylight'
/** 'theme' means "use the active theme's own default accent" — not an override. */
export type AccentOverride = 'theme' | 'mint' | 'coral' | 'violet' | 'sky' | 'lime'

/**
 * Themes that paint on paper rather than on a dark canvas.
 *
 * A SET, not a `theme === 'daylight'` check, because two rules key off it —
 * the accent's dark step and the glow clamp — and both must stay true for any
 * light theme added later, not just this one.
 */
const LIGHT_THEMES: ReadonlySet<ThemeName> = new Set<ThemeName>(['daylight'])

export function isLightTheme(theme: ThemeName): boolean {
  return LIGHT_THEMES.has(theme)
}

/**
 * The glow actually applied, which is not always the glow stored.
 *
 * A halo is a bloom of light; on paper it is a grey smudge. Picking Daylight
 * therefore caps glow at 'subtle'. Deliberately resolved HERE rather than
 * written back into the record: someone who chose Full and tries Daylight for
 * an afternoon gets Full again the moment they switch back, because their
 * preference was never overwritten — only overridden while it could not work.
 */
export function resolveGlow(record: AppearanceRecord): GlowLevel {
  if (isLightTheme(record.theme) && record.glow === 'full') return 'subtle'
  return record.glow
}

export interface AppearanceRecord {
  glow: GlowLevel
  theme: ThemeName
  accent: AccentOverride
}

/** Nightshift (deep violet · mint) at full glow, no accent override — the shipped default, matching turn 3/9's Lifted-canvas values verbatim. */
export const DEFAULT_APPEARANCE: AppearanceRecord = { glow: 'full', theme: 'nightshift', accent: 'theme' }

const GLOW_VALUES: GlowLevel[] = ['off', 'subtle', 'full']
const THEME_VALUES: ThemeName[] = ['nightshift', 'ember', 'field', 'graphite', 'daylight']
const ACCENT_VALUES: AccentOverride[] = ['theme', 'mint', 'coral', 'violet', 'sky', 'lime']

/**
 * The old accent set was four of the other themes' own accents plus blue — an
 * axis that looked like five choices and offered one. The replacements are
 * picked to work across all five canvases, so two names change meaning and
 * two disappear.
 *
 * Anything unrecognised lands on 'theme' rather than a hue: a stored value we
 * cannot read is not evidence the user wanted any particular colour, and
 * 'theme' is the only option that is right by definition.
 */
const ACCENT_MIGRATIONS: Record<string, AccentOverride> = {
  orange: 'coral',
  yellowgreen: 'lime',
  blue: 'sky',
  purple: 'violet',
  mint: 'mint',
}

function readAccent(raw: unknown): AccentOverride {
  if (ACCENT_VALUES.includes(raw as AccentOverride)) return raw as AccentOverride
  if (typeof raw === 'string' && raw in ACCENT_MIGRATIONS) return ACCENT_MIGRATIONS[raw]
  return DEFAULT_APPEARANCE.accent
}

/** Pre-turn-9 shape, read once for migration. */
interface LegacyAppearanceRecord {
  glow?: unknown
  canvas?: unknown
}

/**
 * Both `canvas: 'lifted'` and `canvas: 'deep'` migrate to theme 'nightshift'
 * — turn 9's Settings mockup has no "Deep" equivalent at all, so this is the
 * simplest safe fallback rather than inventing a mapping the design never
 * specified. Glow carries over unchanged.
 */
function migrateLegacy(): AppearanceRecord | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const rec = parsed as LegacyAppearanceRecord
    const glow = GLOW_VALUES.includes(rec.glow as GlowLevel) ? (rec.glow as GlowLevel) : DEFAULT_APPEARANCE.glow
    return { glow, theme: 'nightshift', accent: 'theme' }
  } catch {
    return null
  }
}

export function getAppearance(): AppearanceRecord {
  if (typeof localStorage === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const rec = parsed as Partial<AppearanceRecord>
        // Field-by-field validation rather than a blanket cast: a stale or
        // hand-edited value must fall back to the default, never reach the
        // DOM as an unknown data-attribute that matches no rule.
        return {
          glow: GLOW_VALUES.includes(rec.glow as GlowLevel) ? (rec.glow as GlowLevel) : DEFAULT_APPEARANCE.glow,
          theme: THEME_VALUES.includes(rec.theme as ThemeName) ? (rec.theme as ThemeName) : DEFAULT_APPEARANCE.theme,
          accent: readAccent(rec.accent),
        }
      }
    }
    const migrated = migrateLegacy()
    if (migrated) {
      saveAppearance(migrated)
      return migrated
    }
    return DEFAULT_APPEARANCE
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function saveAppearance(record: AppearanceRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Quota/private-mode failures are non-fatal — the in-memory state still
    // drives this session, it just won't survive a reload.
  }
}

/**
 * Writes all three axes onto <html>. Called from main.tsx before render (so
 * there is no flash) and again from useAppearance on every change.
 */
export function applyAppearance(record: AppearanceRecord): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.setAttribute('data-glow', resolveGlow(record))
  el.setAttribute('data-theme', record.theme)
  el.setAttribute('data-accent', record.accent)
  // One flag, not a theme name, so index.css can resolve every accent to its
  // dark step with a single rule pair instead of one per theme x accent.
  if (isLightTheme(record.theme)) el.setAttribute('data-canvas', 'light')
  else el.removeAttribute('data-canvas')
}
