// ---------------------------------------------------------------------------
// Pure timer math for the standalone stopwatch/lap/round timers — no I/O, no
// React. Deadline-anchored throughout, mirroring the rest timer's own
// contract (useActiveSession.tsx's restRemainingMs): every function
// recomputes its result fresh from a stored anchor timestamp and `now`,
// never from an incremented counter, so a missed/throttled tick or a
// backgrounded tab only delays the redraw, never corrupts the value.
// ---------------------------------------------------------------------------

/**
 * WHAT THIS SESSION ALREADY DID before the current block began — the one
 * field a mid-round protocol switch needs, and deliberately the only one.
 *
 * Tapping 40/20 during round 3 of 8 must pick up at round 4, still of 8. That
 * is two schedules in one block, and this file's single hard-won property is
 * that everything derives from ONE immutable anchor (see computeRoundState's
 * header, and the per-phase deadline that corrupted it before). So a switch
 * starts a genuinely new block whose `rounds` is only what remains, and hands
 * it what came before rather than trying to describe both schedules at once.
 *
 * DISPLAY ONLY. computeRoundState never reads it: the block's own arithmetic
 * is about the block. Only the words a person reads — the headline, the
 * subline, the pips, the log — are about the session.
 */
export interface CarriedRounds {
  /** Rounds of this session completed before this block. */
  rounds: number
  /** Work+rest seconds of this session completed before this block. */
  seconds: number
}

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
  /**
   * EMOM — every minute on the minute. Ashley, 12 Sep 2026: build it.
   *
   * A SINGLE-PHASE CLOCK, and that is the whole of it: N intervals of
   * `workSeconds`, `restSeconds` zero, nothing alternating. The athlete rests
   * whatever is left of the interval after their reps; the TIMER never tracks
   * that and never needs to.
   *
   * WHICH IS WHY THE ENGINE NEEDED NO NEW MATH. I told Ashley on 12 Sep that
   * EMOM "needs a different kind of clock — its rest is the remainder of the
   * minute, which this engine has no way to express", and that was wrong. I
   * reasoned about the protocol instead of running computeRoundState: with
   * restSeconds 0 the cycle IS the interval, the phase never leaves 'work',
   * and 10 x 60/0 completes at exactly 600s. What actually blocked EMOM was
   * the setup form clamping rest to a minimum of 1, and nothing calling an
   * interval a minute. Both were UI.
   *
   * SO WHY A FLAG AT ALL, rather than inferring it from `restSeconds === 0`?
   * Because it decides only the WORDS. "Minute 3 of 10" is right for a
   * 60-second EMOM and wrong for eight continuous 40-second intervals, and
   * the numbers cannot tell those apart.
   *
   * OPTIONAL AND READ AS `?? 'intervals'` EVERYWHERE, for the same reason
   * leadInSeconds is: a round already in flight from a persisted record has
   * no such field and must keep behaving exactly as it started.
   */
  style?: 'intervals' | 'emom'
  /**
   * WHAT THIS SESSION ALREADY DID before this block — see CarriedRounds. Set
   * only by a mid-round protocol switch, and read only by the words a person
   * sees. Optional and read as `?? 0` everywhere, like the two fields above
   * and for the same reason: a round already in flight from a persisted
   * record has none and must keep behaving exactly as it started.
   */
  carried?: CarriedRounds
}

export type RoundPhase = 'lead_in' | 'work' | 'rest'

/** Rounds in the SESSION, not in this block — the number a person is counting to. */
export function sessionTotalRounds(config: RoundConfig): number {
  return (config.carried?.rounds ?? 0) + config.rounds
}

/** The round they are on, counted from the start of the session. */
export function sessionRoundNumber(config: RoundConfig, blockRound: number): number {
  return (config.carried?.rounds ?? 0) + blockRound
}

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
  // ONE PIP PER ROUND OF THE SESSION. A switch mid-way starts a shorter block,
  // and pips that shrank with it would report the session getting smaller as
  // it went on. The carried rounds are done by definition.
  const carried = config.carried?.rounds ?? 0
  const here = sessionRoundNumber(config, state.currentRound)
  for (let r = 1; r <= Math.max(0, sessionTotalRounds(config)); r++) {
    if (r <= carried) out.push('done')
    // Nothing is current during the lead-in: round 1 has not started, and a
    // lit first pip would say it had.
    else if (state.currentPhase === 'lead_in') out.push('upcoming')
    else if (state.isComplete || r < here) out.push('done')
    else if (r === here) out.push('current')
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
  // "Boxing", not "Boxing rounds": the chip carries "3×3 min" beside the name
  // since 4a, and "Boxing rounds 3×3 min" says rounds twice.
  { key: 'boxing', label: 'Boxing', config: { rounds: 3, workSeconds: 180, restSeconds: 60 } },
  // EMOM, built 12 Sep 2026 after Ashley reported the tile advertising it.
  // Ten minutes is the common prescription; E2MOM is here because the whole
  // point of naming the style separately is that the interval is not always
  // sixty seconds, and a table with only the 60s case would not prove that.
  { key: 'emom', label: 'EMOM', config: { rounds: 10, workSeconds: 60, restSeconds: 0, style: 'emom' } },
  { key: 'e2mom', label: 'E2MOM', config: { rounds: 10, workSeconds: 120, restSeconds: 0, style: 'emom' } },
]

/**
 * "8 × 20s / 10s" — the numbers under a preset's name, so nothing is opaque.
 *
 * An EMOM has no rest to show, and "10 × 60s / 0s" would put a rest interval
 * on screen that the protocol does not have. It states its interval instead.
 */
/**
 * The preset a config came from, by its numbers.
 *
 * MATCHED, NEVER STORED. The config is the fact; a "this came from Tabata"
 * flag would be a second one to keep in step with it, and the two would
 * eventually disagree after an edit. Lived in RoundCard until 4a needed the
 * same answer for the chip row and the queued strip.
 */
export function presetForConfig(config: RoundConfig): RoundPreset | null {
  return ROUND_PRESETS.find(p =>
    p.config.rounds === config.rounds
    && p.config.workSeconds === config.workSeconds
    && p.config.restSeconds === config.restSeconds
    && roundStyleOf(p.config) === roundStyleOf(config)) ?? null
}

/**
 * What to CALL a config in a sentence — "Tabata", "40/20", or "Custom".
 *
 * A protocol switch and a chip both have to name one, and "your 8 × 40/20"
 * read out mid-sentence is the numbers twice. The preset's own label is the
 * name people use; anything not in the table is honestly Custom rather than
 * given an invented name.
 */
export function protocolNameOf(config: RoundConfig): string {
  return presetForConfig(config)?.label ?? 'Custom'
}

/**
 * "20s work · 10s rest" / "every 60s" — the line beside the idle card's total.
 *
 * SHORTER THAN roundSubline AND FOR A DIFFERENT MOMENT: that one narrates a
 * round in progress ("Round 3 of 8 — 10s rest next"), and there is no round in
 * progress to narrate. This says what the protocol IS.
 */
export function secondsPhrase(config: RoundConfig): string {
  const unit = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s}s`)
  return roundStyleOf(config) === 'emom'
    ? `every ${unit(config.workSeconds)}`
    : `${unit(config.workSeconds)} work · ${unit(config.restSeconds)} rest`
}

/**
 * Two configs describe the same protocol.
 *
 * BY THE FOUR THINGS THAT DECIDE WHAT RUNS, and nothing else: rounds, work,
 * rest and style. Not the lead-in (a running block's is 10 and a chip's is
 * absent) and not `carried` (a switch's second block would otherwise stop
 * matching the chip that started it, and the row would show nothing selected
 * in the middle of running that very protocol).
 */
export function sameRoundConfig(a: RoundConfig, b: RoundConfig): boolean {
  return a.rounds === b.rounds
    && a.workSeconds === b.workSeconds
    && a.restSeconds === b.restSeconds
    && roundStyleOf(a) === roundStyleOf(b)
}

/**
 * The small mono number beside a protocol chip's name — "8×20/10", "10 min".
 *
 * SHORTER THAN describeRoundPreset ON PURPOSE, and separate from it: the chip
 * carries this at 11px inside a 44px pill, and the setup rows carry the long
 * form under a name with room for it. One function for both would have to
 * pick, and the picked one would be wrong in the other place.
 */
export function chipNumbers(config: RoundConfig, label?: string): string {
  if (roundStyleOf(config) === 'emom') {
    const totalSeconds = config.rounds * config.workSeconds
    return totalSeconds % 60 === 0 ? `${totalSeconds / 60} min` : `${config.rounds}×${config.workSeconds}s`
  }
  // NEVER SAY IT TWICE. Some protocols are NAMED after their numbers — the
  // "40/20" chip beside "8×40/20" reads as a stutter — so when the label
  // already carries the work and rest, the suffix carries what the label
  // cannot: how many rounds of it. Read from the label rather than from a
  // list of which presets are numeric, so a new one behaves correctly by
  // itself. Found on a real screen, 13 Sep 2026.
  if (label && label.includes(`${config.workSeconds}/${config.restSeconds}`)) {
    return `${config.rounds} rds`
  }
  // MINUTES ONLY WHEN MINUTES ARE HOW IT IS SAID, and the threshold is two of
  // them, not one. A boxing round is three minutes, not 180 seconds — but the
  // minute form states the WORK alone, so a one-minute round with thirty
  // seconds off rendered as "6×1 min" and the rest vanished off the chip.
  // Read off a real screen, 13 Sep 2026; every check passed while it was
  // wrong, because none of them looked at a 60-second interval with a rest.
  const unit = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s}s`)
  return config.workSeconds >= 120
    ? `${config.rounds}×${unit(config.workSeconds)}`
    : `${config.rounds}×${config.workSeconds}/${config.restSeconds}`
}

export function describeRoundPreset(p: RoundPreset): string {
  return roundStyleOf(p.config) === 'emom'
    ? `${p.config.rounds} × every ${p.config.workSeconds}s`
    : `${p.config.rounds} × ${p.config.workSeconds}s / ${p.config.restSeconds}s`
}

// ---------------------------------------------------------------------------
// WHAT TO CALL AN INTERVAL — the only thing `style` decides.
//
// Kept here rather than in RoundField so the wording can be driven by a gate
// and so the dock's one-line summary and the full-screen field cannot drift
// into calling the same interval two different things.
// ---------------------------------------------------------------------------

/** The `?? 'intervals'` rule, in one place. */
export function roundStyleOf(config: RoundConfig): 'intervals' | 'emom' {
  return config.style === 'emom' ? 'emom' : 'intervals'
}

/**
 * "Minute" only when it really is one. A 90-second EMOM is a common
 * prescription and calling its intervals minutes would be a small, confident
 * lie of exactly the kind the tile that started this was telling.
 */
export function intervalNoun(config: RoundConfig): 'minute' | 'interval' | 'round' {
  if (roundStyleOf(config) !== 'emom') return 'round'
  return config.workSeconds === 60 ? 'minute' : 'interval'
}

/** "Round 3 of 10" / "Minute 3 of 10" — the headline over the clock. */
export function roundHeadline(config: RoundConfig, currentRound: number): string {
  const noun = intervalNoun(config)
  return `${noun[0].toUpperCase()}${noun.slice(1)} ${sessionRoundNumber(config, currentRound)} of ${sessionTotalRounds(config)}`
}

/** "10 of 10 minutes done" — the same noun, at the end. */
export function roundDoneLabel(config: RoundConfig): string {
  const total = sessionTotalRounds(config)
  return `${total} of ${total} ${intervalNoun(config)}s done`
}

/**
 * The line under the clock. EMOM has no rest to promise, so it says what
 * actually happens next instead — the same rule the interval version already
 * follows on its final round, where "20s rest next" was untrue.
 */
export function roundSubline(config: RoundConfig, phase: 'ready' | 'work' | 'rest' | 'done', round: number): string {
  const noun = intervalNoun(config)
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`
  // COUNTED IN THE SESSION, not in the block. After a protocol switch the
  // block restarts at 1 and the person has not — telling someone mid-session
  // that they are on round 1 of 5 is the exact defect the carry exists for.
  const total = sessionTotalRounds(config)
  const here = sessionRoundNumber(config, round)
  if (phase === 'ready') return `${Noun} ${sessionRoundNumber(config, 1)} of ${total} starts in a moment. Tap anywhere to start now.`
  if (phase === 'done') return `All ${total} ${noun}s done — nice.`
  if (phase === 'work') {
    if (round >= config.rounds) return `Last ${noun} — finish this one and you’re done.`
    return roundStyleOf(config) === 'emom'
      // NO REST TO NAME. The next interval starts the moment this one ends —
      // that IS the protocol, and promising a rest here would invent one.
      ? `${Noun} ${here} of ${total} — the next one starts as this hits zero.`
      : `${Noun} ${here} of ${total} — ${config.restSeconds}s rest next.`
  }
  return `${Noun} ${Math.min(here + 1, total)} of ${total} starts when this hits zero.`
}

// ---------------------------------------------------------------------------
// WHAT A FINISHED ROUND IS, AS A THING TO LOG.
//
// Ashley, 12 Sep 2026, from the live app: "I started a round timer and did 3
// rounds 120s each with 30s rest. When I finished, the app asked me if i
// wanted to log the workout. I logged it but it doesn't show anywhere on the
// app and the coach has no knowledge of it."
//
// IT NEVER LOGGED ANYTHING. The finished field's button said "Log session"
// and its handler called timers.reset() and changed the tab — nothing was
// written, and the reset destroyed the round on the way out, so by the time
// she arrived on the Exercise tab the app no longer knew what she had done.
// Its own comment claimed "A REAL ACTION, not a decoration ... a button that
// only dismissed itself would be lying about what it does". Navigating away
// IS dismissing itself, with extra steps.
//
// A round is CONDITIONING, not sets and reps, so it belongs in the cardio log
// — which the week strip already counts as work done, the streak already
// reads, and the coach already receives as cardio_log_history. One honest
// write lands in all three.
//
// THE COUNTDOWN IS NOT TRAINING, so it is not in the duration: the figure is
// the schedule the person actually worked, rounds x work + (rounds-1) x rest,
// which is totalRoundSeconds minus the lead-in. Same no-trailing-rest rule as
// everywhere else in this file.
//
// WHAT THIS DELIBERATELY DOES NOT INVENT: how hard it was. saveCardioLog
// requires an RPE and this module has no way to know one, so the caller asks
// — the same question AddUnplannedWork already asks for any other unplanned
// conditioning. A default effort would be a number the app made up about her
// training, which is the class of thing this codebase keeps finding and
// removing.
// ---------------------------------------------------------------------------
export interface RoundLogSummary {
  /** What to call it in the log — the noun a person would use. */
  activityName: string
  /** Whole minutes of work+rest, countdown excluded. At least 1. */
  durationMinutes: number
  /** "3 rounds · 120s work / 30s rest" — the detail line, for the note. */
  detail: string
}

export function roundLogSummary(config: RoundConfig): RoundLogSummary {
  const emom = roundStyleOf(config) === 'emom'
  // THE WHOLE SESSION, INCLUDING WHAT CAME BEFORE A SWITCH. Eight rounds
  // happened; a log reading five because the protocol changed at round four
  // would be the app disbelieving her — the same defect this function's own
  // header was written about, in a new place.
  const carried = config.carried
  const blockSeconds = config.rounds * config.workSeconds
    + Math.max(0, config.rounds - 1) * config.restSeconds
  // The rest that joined the two blocks belongs to the session too: the
  // carried figure counts full work+rest cycles, so nothing is double-counted.
  const workedSeconds = (carried?.seconds ?? 0) + blockSeconds
  const detail = emom
    ? `${config.rounds} × every ${config.workSeconds}s`
    : `${config.rounds} rounds · ${config.workSeconds}s work / ${config.restSeconds}s rest`
  return {
    activityName: emom ? 'EMOM' : 'Intervals',
    // Rounded, never floored to zero: a 40-second round is still a thing that
    // happened, and a log reading "0 min" would be the app disbelieving her.
    durationMinutes: Math.max(1, Math.round(workedSeconds / 60)),
    detail: carried && carried.rounds > 0
      ? `${sessionTotalRounds(config)} rounds · first ${carried.rounds}, then ${detail}`
      : detail,
  }
}
