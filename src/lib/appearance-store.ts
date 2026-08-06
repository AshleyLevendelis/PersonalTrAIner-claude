// ---------------------------------------------------------------------------
// Appearance preferences — the two axes the density-pass exploration itself
// varied along, exposed as settings (design doc option 1f): "Glow maps to one
// intensity variable; canvas swaps two surface values — no separate themes."
// Both resolve to a data-attribute on <html>; index.css does the rest.
//
// DELIBERATE DEVIATION from the fitplan_<domain>_v1:<profileId> convention
// used by active-session-store.ts / timer-store.ts: this key carries NO
// profile suffix. Appearance is a device-level display preference, not
// per-profile data, and a global key is what lets main.tsx apply it
// synchronously before React mounts — a per-profile key couldn't be read
// until the profile resolved, which would mean a visible flash of the wrong
// canvas on every cold load. Precedent: `fitplan_dev_mode` in dev-clock.ts.
// ---------------------------------------------------------------------------

const KEY = 'fitplan_appearance_v1'

export type GlowLevel = 'off' | 'subtle' | 'full'
export type CanvasLevel = 'deep' | 'lifted'

export interface AppearanceRecord {
  glow: GlowLevel
  canvas: CanvasLevel
}

/** Turn 3 "Borderless" is the shipped default: lifted canvas at full glow. */
export const DEFAULT_APPEARANCE: AppearanceRecord = { glow: 'full', canvas: 'lifted' }

const GLOW_VALUES: GlowLevel[] = ['off', 'subtle', 'full']
const CANVAS_VALUES: CanvasLevel[] = ['deep', 'lifted']

export function getAppearance(): AppearanceRecord {
  if (typeof localStorage === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_APPEARANCE
    const rec = parsed as Partial<AppearanceRecord>
    // Field-by-field validation rather than a blanket cast: a stale or
    // hand-edited value must fall back to the default, never reach the DOM
    // as an unknown data-attribute that matches no rule.
    return {
      glow: GLOW_VALUES.includes(rec.glow as GlowLevel) ? (rec.glow as GlowLevel) : DEFAULT_APPEARANCE.glow,
      canvas: CANVAS_VALUES.includes(rec.canvas as CanvasLevel) ? (rec.canvas as CanvasLevel) : DEFAULT_APPEARANCE.canvas,
    }
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
 * Writes both axes onto <html>. Called from main.tsx before render (so there
 * is no flash) and again from useAppearance on every change.
 */
export function applyAppearance(record: AppearanceRecord): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.setAttribute('data-glow', record.glow)
  el.setAttribute('data-canvas', record.canvas)
}
