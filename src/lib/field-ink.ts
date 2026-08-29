// ---------------------------------------------------------------------------
// THE FIELD'S INK LADDER (design handoff v2 §1).
//
// The handoff is emphatic that these are "measured, not guessed", and that
// "every contrast failure this design went through came from a hand-picked
// alpha". So they live here as named constants and nowhere else — a component
// asking for `rgba(ink, .6)` is the bug this file exists to prevent.
//
// The ladder was measured against mint (#3ED3AA). It does not survive on most
// of this app's other grounds: across all 15 theme x accent combinations, 11
// could not carry it with ANY ink, black or white included. Rather than lower
// the ladder, Ashley ruled (30 Aug 2026) that the FIELD adjusts instead — see
// --field / --field-ink in index.css, where each ground is the same hue moved
// to the nearest lightness that clears solid >= 7:1, .88 >= 5.5:1, .78 >=
// 4.5:1. So these alphas are valid on every theme by construction, and
// test:field-contrast re-measures all 15 rather than trusting that.
// ---------------------------------------------------------------------------

export const FIELD_INK = {
  /** Text 13px and up. */
  text: 0.78,
  /** Text 10-12px — smaller type needs more ink, not less. */
  textSmall: 0.88,
  /** Text under 10px, and EVERY glyph in the week strip. Solid, no alpha. */
  textTiny: 1,
  /** Hairlines and dividers. */
  hairline: 0.22,
  /** Ring tracks (the unfilled part of an arc). */
  ringTrack: 0.17,
  /** The 3px rim behind a coloured arc that lets a light hue survive the field. */
  keyline: 0.55,
} as const

export type FieldInkStep = keyof typeof FIELD_INK

/**
 * Ink at one rung of the ladder, as a CSS colour.
 *
 * color-mix rather than rgba(): --field-ink is a hex token that changes per
 * theme AND per accent, so there is no single channel triple to interpolate.
 */
export function ink(step: FieldInkStep): string {
  const a = FIELD_INK[step]
  return a === 1 ? 'var(--field-ink)' : `color-mix(in srgb, var(--field-ink) ${a * 100}%, transparent)`
}

/** Ink at an explicit alpha — for the ring only, which needs per-arc values. */
export function inkAlpha(alpha: number): string {
  return alpha >= 1 ? 'var(--field-ink)' : `color-mix(in srgb, var(--field-ink) ${alpha * 100}%, transparent)`
}
