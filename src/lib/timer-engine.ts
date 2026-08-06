// ---------------------------------------------------------------------------
// Pure timer math for the standalone stopwatch/lap/round timers — no I/O, no
// React. Deadline-anchored throughout, mirroring the rest timer's own
// contract (useActiveSession.tsx's restRemainingMs): every function
// recomputes its result fresh from a stored anchor timestamp and `now`,
// never from an incremented counter, so a missed/throttled tick or a
// backgrounded tab only delays the redraw, never corrupts the value.
// ---------------------------------------------------------------------------

export interface RoundConfig {
  rounds: number
  workSeconds: number
  restSeconds: number
}

export type RoundPhase = 'work' | 'rest'

export interface RoundState {
  currentRound: number
  currentPhase: RoundPhase
  /** Ms remaining in the CURRENT phase — negative/zero handled by the caller same as rest's overrun (shouldn't occur once isComplete is walked forward correctly). */
  phaseRemainingMs: number
  isComplete: boolean
}

/**
 * A stopwatch is deadline-anchored the same way a countdown is, just
 * counting up: anchored to when it last started/resumed, plus whatever was
 * already banked before that run.
 */
export function computeStopwatchElapsedMs(
  accumulatedMs: number,
  startedAtIso: string | null,
  running: boolean,
  now: number
): number {
  if (!running || !startedAtIso) return accumulatedMs
  return accumulatedMs + (now - new Date(startedAtIso).getTime())
}

/**
 * Recomputes round/phase from the current phase's stored deadline. If `now`
 * has passed that deadline by more than one phase (the app was closed
 * mid-interval for a while), walks forward phase-by-phase — bounded by
 * rounds*2 — to land on the correct round/phase rather than assuming reload
 * always happens inside the same phase.
 */
export function computeRoundState(
  config: RoundConfig,
  phaseEndsAtIso: string,
  currentRound: number,
  currentPhase: RoundPhase,
  now: number
): RoundState {
  let round = currentRound
  let phase = currentPhase
  let phaseEndsAt = new Date(phaseEndsAtIso).getTime()
  const maxSteps = config.rounds * 2
  let steps = 0

  while (now >= phaseEndsAt && steps < maxSteps) {
    if (phase === 'work') {
      phase = 'rest'
      phaseEndsAt += config.restSeconds * 1000
    } else {
      round += 1
      if (round > config.rounds) {
        return { currentRound: config.rounds, currentPhase: 'rest', phaseRemainingMs: 0, isComplete: true }
      }
      phase = 'work'
      phaseEndsAt += config.workSeconds * 1000
    }
    steps += 1
  }

  if (steps >= maxSteps && now >= phaseEndsAt) {
    return { currentRound: config.rounds, currentPhase: 'rest', phaseRemainingMs: 0, isComplete: true }
  }

  return { currentRound: round, currentPhase: phase, phaseRemainingMs: phaseEndsAt - now, isComplete: false }
}

/**
 * Matches the "N rounds of Xs .../ Ys ..." shape used by every conditioning
 * profile string in exercise-plan.ts (e.g. "6 rounds of 20s hard / 40s
 * easy"). Returns null — never a guess — when the text doesn't match.
 */
export function parseConditioningInterval(activityText: string | undefined | null): RoundConfig | null {
  if (!activityText) return null
  const match = /(\d+)\s*rounds?\s+of\s+(\d+)s\s+[a-z\s]+?\/\s*(\d+)s/i.exec(activityText)
  if (!match) return null
  const rounds = parseInt(match[1], 10)
  const workSeconds = parseInt(match[2], 10)
  const restSeconds = parseInt(match[3], 10)
  if (!Number.isFinite(rounds) || !Number.isFinite(workSeconds) || !Number.isFinite(restSeconds)) return null
  if (rounds <= 0 || workSeconds <= 0 || restSeconds <= 0) return null
  return { rounds, workSeconds, restSeconds }
}
