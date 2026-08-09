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
  /** Ms remaining in the CURRENT phase — always >= 0 (0 only when complete). */
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
 * Derives round/phase/remaining purely from elapsed time against the round
 * schedule — no stored per-phase deadline, no stateful stepping. The previous
 * implementation walked forward from a persisted phase deadline that its
 * caller advanced WITHOUT re-anchoring, so stored round/phase and the stored
 * deadline disagreed after the first transition and every subsequent tick
 * compounded the error (racing through rounds / stalling). Deriving from the
 * single immutable start anchor makes any moment — including a return from
 * hours in the background or a reload — land on exactly the right round and
 * phase, because there is no intermediate state to drift.
 */
export function computeRoundState(config: RoundConfig, roundStartedAtIso: string, now: number): RoundState {
  const start = new Date(roundStartedAtIso).getTime()
  const workMs = config.workSeconds * 1000
  const cycleMs = workMs + config.restSeconds * 1000
  const elapsed = Math.max(0, now - start)

  if (elapsed >= config.rounds * cycleMs) {
    return { currentRound: config.rounds, currentPhase: 'rest', phaseRemainingMs: 0, isComplete: true }
  }

  const round = Math.floor(elapsed / cycleMs) + 1
  const inCycle = elapsed % cycleMs
  const phase: RoundPhase = inCycle < workMs ? 'work' : 'rest'
  const phaseRemainingMs = phase === 'work' ? workMs - inCycle : cycleMs - inCycle
  return { currentRound: round, currentPhase: phase, phaseRemainingMs, isComplete: false }
}

/**
 * Monotonic position of a round-timer state on the schedule: work/rest of
 * round N map to 2(N-1) / 2(N-1)+1, completion to rounds*2. The cue logic
 * diffs consecutive indices — a difference of exactly 1 is a live transition
 * (play its cue); a larger jump means phases were missed while backgrounded,
 * and firing a burst of stale cues on return would be noise, not information.
 */
export function roundPhaseIndex(state: RoundState, config: RoundConfig): number {
  if (state.isComplete) return config.rounds * 2
  return (state.currentRound - 1) * 2 + (state.currentPhase === 'rest' ? 1 : 0)
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
