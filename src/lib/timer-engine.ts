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

  // THE FINAL REST DOES NOT EXIST (design handoff v2 §6, build note 3):
  // "Six rounds means six work intervals and five rests."
  //
  // This used to run for rounds x (work + rest), so a 6 x 40/20 session took
  // 6:00 and ended by sitting through a rest with nothing left to recover
  // for. The honest duration is 5:40, and the handoff makes the same point
  // about the total it is derived from: never rounds x (work + rest).
  const totalMs = config.rounds * workMs + Math.max(0, config.rounds - 1) * config.restSeconds * 1000
  if (elapsed >= totalMs) {
    return { currentRound: config.rounds, currentPhase: 'work', phaseRemainingMs: 0, isComplete: true }
  }

  const round = Math.floor(elapsed / cycleMs) + 1
  const inCycle = elapsed % cycleMs
  const phase: RoundPhase = inCycle < workMs ? 'work' : 'rest'
  const phaseRemainingMs = phase === 'work' ? workMs - inCycle : cycleMs - inCycle
  return { currentRound: round, currentPhase: phase, phaseRemainingMs, isComplete: false }
}

/**
 * The run's DERIVED length: ROUNDS x WORK + (ROUNDS - 1) x REST.
 *
 * The handoff asks for this explicitly — "Derive the total, never state it" —
 * because the obvious arithmetic overstates every session by one rest.
 */
export function totalRoundSeconds(config: RoundConfig): number {
  const rounds = Math.max(0, config.rounds)
  return rounds * config.workSeconds + Math.max(0, rounds - 1) * config.restSeconds
}

/**
 * One pip per round (design handoff v2 §6).
 *
 * "The ring is the current interval only ... Overall progress is the pips'
 * job — one graphic, one meaning." So the ring reads phaseRemainingMs and
 * these read the round, and neither tries to say both.
 */
export function roundPips(state: RoundState, config: RoundConfig): ('done' | 'current' | 'upcoming')[] {
  const out: ('done' | 'current' | 'upcoming')[] = []
  for (let r = 1; r <= Math.max(0, config.rounds); r++) {
    if (state.isComplete || r < state.currentRound) out.push('done')
    else if (r === state.currentRound) out.push('current')
    else out.push('upcoming')
  }
  return out
}

/** 0..1 through the CURRENT interval — what the ring draws, and nothing else. */
export function intervalProgress(state: RoundState, config: RoundConfig): number {
  if (state.isComplete) return 1
  const span = (state.currentPhase === 'work' ? config.workSeconds : config.restSeconds) * 1000
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, 1 - state.phaseRemainingMs / span))
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
