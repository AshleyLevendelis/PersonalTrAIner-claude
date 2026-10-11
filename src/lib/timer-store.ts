// ---------------------------------------------------------------------------
// Persisted state for the standalone stopwatch/lap/round timers — mirrors
// active-session-store.ts's shape exactly (one record per profile, upsert on
// every change) since nothing here syncs to a server: timer state is
// device-local and ephemeral, so the heavier pending-queue/dead-letter
// machinery water-store.ts uses for server-synced writes doesn't apply.
// ---------------------------------------------------------------------------

import type { RoundConfig, RoundPhase } from './timer-engine'

const KEY_PREFIX = 'fitplan_timers_v1:'

export type TimerMode = 'stopwatch' | 'lap' | 'round'

export interface LapEntry {
  lapNumber: number
  /** Total elapsed ms at the moment this lap was captured. */
  elapsedMs: number
}

export interface TimerRecord {
  mode: TimerMode
  accumulatedMs: number
  startedAtIso: string | null
  running: boolean
  laps: LapEntry[]
  roundConfig: RoundConfig | null
  /**
   * WHAT "START" WOULD RUN — design handoff 4a, 13 Sep 2026. The Tools card is
   * always on screen now, so there is an idle state to describe and something
   * has to remember which protocol it is describing. Separate from
   * `roundConfig`, which is the one actually RUNNING: conflating them would
   * make choosing a protocol indistinguishable from starting it.
   *
   * Persisted, so picking 40/20 and going to look at your plan does not lose
   * the choice on the way back.
   */
  selectedRoundConfig: RoundConfig | null
  /**
   * A PROTOCOL TAPPED WHILE A ROUND IS RUNNING. It applies at the next round
   * boundary, never mid-round — 4a: "a tap QUEUES, it never restarts
   * mid-round". Null the rest of the time, and cleared by Undo.
   */
  queuedRoundConfig: RoundConfig | null
  /**
   * HER OWN NUMBERS, kept. The Custom chip has to show what she saved last
   * time rather than a placeholder, and it has to keep showing them after she
   * taps Tabata — so it cannot just be "whatever is selected and is not a
   * preset". One field, written when the Custom panel changes anything.
   */
  customRoundConfig: RoundConfig | null
  phaseEndsAtIso: string | null
  currentRound: number
  currentPhase: RoundPhase
}

export function defaultTimerRecord(mode: TimerMode): TimerRecord {
  return {
    mode,
    accumulatedMs: 0,
    startedAtIso: null,
    running: false,
    laps: [],
    roundConfig: null,
    selectedRoundConfig: null,
    queuedRoundConfig: null,
    customRoundConfig: null,
    phaseEndsAtIso: null,
    currentRound: 1,
    currentPhase: 'work',
  }
}

function storageKey(profileId: string): string {
  return `${KEY_PREFIX}${profileId}`
}

export function getTimerRecord(profileId: string): TimerRecord | null {
  try {
    const raw = localStorage.getItem(storageKey(profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveTimerRecord(profileId: string, record: TimerRecord): void {
  localStorage.setItem(storageKey(profileId), JSON.stringify(record))
}

export function clearTimerRecord(profileId: string): void {
  localStorage.removeItem(storageKey(profileId))
}

// ---------------------------------------------------------------------------
// HOW SHE LIKES HER ROUND TIMER — design handoff 4c, 10 Oct 2026: countdown
// length, beeps, buzz, and whether Start opens full screen.
//
// ITS OWN RECORD, not four more fields on TimerRecord. The timer record is
// rebuilt from defaultTimerRecord at four sites (mode change, reset, start,
// the queued switch) that copy forward only what they know about, so a
// setting stored there would quietly reset itself the first time she pressed
// Reset. Settings are not part of a run, so they do not live in one.
// ---------------------------------------------------------------------------
const PREFS_PREFIX = 'fitplan_timer_prefs_v1:'

export interface TimerPrefs {
  /** Get-ready seconds before round 1: 0 (off), 5, 10 or 15. */
  countdownSeconds: number
  beepsOn: boolean
  buzzOn: boolean
  openFullScreenOnStart: boolean
}

/** Ten seconds, sound and buzz on, full screen off — exactly what the timer did before 4c. */
export const DEFAULT_TIMER_PREFS: TimerPrefs = { countdownSeconds: 10, beepsOn: true, buzzOn: true, openFullScreenOnStart: false }

export function getTimerPrefs(profileId: string): TimerPrefs {
  try {
    const raw = localStorage.getItem(`${PREFS_PREFIX}${profileId}`)
    if (!raw) return DEFAULT_TIMER_PREFS
    const p = JSON.parse(raw)
    // Field by field, so a record from an older build (or a hand-edited one)
    // falls back per setting rather than all at once.
    return {
      countdownSeconds: [0, 5, 10, 15].includes(p?.countdownSeconds) ? p.countdownSeconds : DEFAULT_TIMER_PREFS.countdownSeconds,
      beepsOn: typeof p?.beepsOn === 'boolean' ? p.beepsOn : DEFAULT_TIMER_PREFS.beepsOn,
      buzzOn: typeof p?.buzzOn === 'boolean' ? p.buzzOn : DEFAULT_TIMER_PREFS.buzzOn,
      openFullScreenOnStart: typeof p?.openFullScreenOnStart === 'boolean' ? p.openFullScreenOnStart : DEFAULT_TIMER_PREFS.openFullScreenOnStart,
    }
  } catch {
    return DEFAULT_TIMER_PREFS
  }
}

export function saveTimerPrefs(profileId: string, prefs: TimerPrefs): void {
  try { localStorage.setItem(`${PREFS_PREFIX}${profileId}`, JSON.stringify(prefs)) } catch { /* a full or blocked store keeps the in-memory value */ }
}
