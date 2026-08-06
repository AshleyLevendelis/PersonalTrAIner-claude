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
