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
  /**
   * A GET-READY COUNTDOWN BEFORE ROUND 1 — Ashley, 11 Sep 2026, from the app:
   * "The round timer starts with no countdown. As soon as you start it
   * begins." It did: startRound anchored to now and elapsed 0 sat inside the
   * first work interval, so round 1 was running before the phone was back in
   * a pocket.
   *
   * OPTIONAL, AND READ AS `?? 0` EVERYWHERE — never `?? 10`. A round already
   * in flight from a persisted record has no such field, and defaulting it to
   * ten would make a live timer jump BACKWARDS ten seconds on its next tick.
   * New starts write 10; anything already running keeps what it started with.
   *
   * Once only, before round 1. Not between rounds — the rest interval is
   * already that.
   */
  leadInSeconds?: number
}

export type RoundPhase = 'lead_in' | 'work' | 'rest'

/** Ms of lead-in this config asks for. The one place the `?? 0` rule lives. */
export function leadInMsOf(config: RoundConfig): number {
  return Math.max(0, config.leadInSeconds ?? 0) * 1000
}

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

  // THE LEAD-IN IS AN OFFSET ON THE SAME ANCHOR, not a phase of its own that
  // something has to step into. This file's one hard-won property, stated in
  // its header and earned by a bug, is that everything derives from a single
  // immutable anchor; a stored "counting down" flag would be exactly the
  // second source of truth that made the old per-phase deadline drift. So the
  // schedule simply begins leadInMs after the anchor, and a negative elapsed
  // means it has not begun.
  const leadInMs = leadInMsOf(config)
  const sinceAnchor = Math.max(0, now - start)
  if (sinceAnchor < leadInMs) {
    return { currentRound: 1, currentPhase: 'lead_in', phaseRemainingMs: leadInMs - sinceAnchor, isComplete: false }
  }
  const elapsed = sinceAnchor - leadInMs

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
  // The lead-in counts. This figure is what useTimers banks into accumulatedMs
  // to hold the finished state once a run completes; leave the countdown out
  // and a finished round lands ten seconds short of complete and un-finishes
  // itself.
  return leadInMsOf(config) / 1000 + rounds * config.workSeconds + Math.max(0, rounds - 1) * config.restSeconds
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
    // Nothing is current during the lead-in: round 1 has not started, and a
    // lit first pip would say it had.
    if (state.currentPhase === 'lead_in') out.push('upcoming')
    else if (state.isComplete || r < state.currentRound) out.push('done')
    else if (r === state.currentRound) out.push('current')
    else out.push('upcoming')
  }
  return out
}

/** 0..1 through the CURRENT interval — what the ring draws, and nothing else. */
export function intervalProgress(state: RoundState, config: RoundConfig): number {
  if (state.isComplete) return 1
  const span = (state.currentPhase === 'lead_in'
    ? Math.max(0, config.leadInSeconds ?? 0)
    : state.currentPhase === 'work' ? config.workSeconds : config.restSeconds) * 1000
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
  // -1, so round 1's work stays 0 and the lead-in -> work step is a diff of
  // exactly 1. That makes the existing cue diffing fire its "go" tone at the
  // moment work begins — a beep at the start the timer has never had — with
  // no change to the cue effect at all, and a return from the background
  // still skips the stale ones because the jump is larger than 1.
  if (state.currentPhase === 'lead_in') return -1
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

// ---------------------------------------------------------------------------
// THE PRESETS THAT WERE ADVERTISED BEFORE THEY EXISTED.
//
// Ashley, 12 Sep 2026, from the live app: "under rest timers the app shows
// emom and tabata but these timers dont exist". They did not: the round tab
// had three number inputs and nothing else, so Tabata was reachable only by
// already knowing to type 8 / 20 / 10, and EMOM was not reachable at all.
//
// Asked whether to correct the label or build the timers, she chose BUILD:
// one-tap presets now, EMOM left out because it is a different clock — its
// rest is whatever remains of the minute after the work is done, which this
// engine, built on a fixed work/rest pair, has no way to express. Faking it
// as 60s work / 0s rest would be the same kind of claim this list exists to
// stop making.
//
// HERE RATHER THAN IN THE PANEL because a table inside a component is not
// something a gate can call — the same reason chat-plan-context.ts exists.
// Each entry is checked against the engine's own arithmetic by
// test:round-presets, so a preset whose label disagrees with its numbers
// cannot ship.
// ---------------------------------------------------------------------------
export interface RoundPreset {
  /** Stable id — what a gate and a test click name it by. */
  key: string
  /** What the button says. */
  label: string
  config: RoundConfig
}

export const ROUND_PRESETS: RoundPreset[] = [
  // The canonical protocol, and the one that was named on the tile: eight
  // rounds of twenty seconds hard against ten seconds off, four minutes total.
  { key: 'tabata', label: 'Tabata', config: { rounds: 8, workSeconds: 20, restSeconds: 10 } },
  { key: '40-20', label: '40/20', config: { rounds: 8, workSeconds: 40, restSeconds: 20 } },
  { key: '30-30', label: '30/30', config: { rounds: 10, workSeconds: 30, restSeconds: 30 } },
  // Three three-minute rounds with a minute between them. Here because the app
  // already knows some people train a combat sport alongside their lifting
  // (concurrent_activities), and "rounds" is what that word means to them.
  { key: 'boxing', label: 'Boxing rounds', config: { rounds: 3, workSeconds: 180, restSeconds: 60 } },
]

/** "8 × 20s / 10s" — the numbers under a preset's name, so nothing is opaque. */
export function describeRoundPreset(p: RoundPreset): string {
  return `${p.config.rounds} × ${p.config.workSeconds}s / ${p.config.restSeconds}s`
}
