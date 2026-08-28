// ---------------------------------------------------------------------------
// Chat typewriter reveal-speed preference. Per-profile (unlike
// appearance-store.ts's deliberately device-level key): this is a taste
// preference tied to the person, not the device, and — unlike appearance —
// has no pre-mount flash to avoid, so it follows the standard
// fitplan_<domain>_v1:<profileId> convention (active-session-store.ts's
// shape) instead of appearance's global key.
// ---------------------------------------------------------------------------

export type RevealSpeed = 'off' | 'slow' | 'normal' | 'fast'

/** Normal is ~50ms/word, frame-aligned — see TypewriterMarkdown.tsx for the measurement that set it. */
export const DEFAULT_REVEAL_SPEED: RevealSpeed = 'normal'

const VALUES: RevealSpeed[] = ['off', 'slow', 'normal', 'fast']

function storageKey(profileId: string): string {
  return `fitplan_reveal_speed_v1:${profileId}`
}

export function getRevealSpeed(profileId: string | undefined): RevealSpeed {
  if (!profileId || typeof localStorage === 'undefined') return DEFAULT_REVEAL_SPEED
  try {
    const raw = localStorage.getItem(storageKey(profileId))
    return VALUES.includes(raw as RevealSpeed) ? (raw as RevealSpeed) : DEFAULT_REVEAL_SPEED
  } catch {
    return DEFAULT_REVEAL_SPEED
  }
}

export function saveRevealSpeed(profileId: string, speed: RevealSpeed): void {
  try {
    localStorage.setItem(storageKey(profileId), speed)
  } catch {
    // Quota/private-mode failures are non-fatal — the in-memory state still drives this session.
  }
}
