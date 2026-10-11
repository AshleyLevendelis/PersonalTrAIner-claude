// ---------------------------------------------------------------------------
// THE ROUND-TIMER SETUP SHEET'S ARITHMETIC — design handoff 4c, 10 Oct 2026.
//
// Pure, so the sheet and its gate ask the same function. The sheet replaces
// the old chip row + Custom panel: preset cards, a preview with a timeline,
// three steppers, and the countdown / beeps / buzz options.
//
// THE STEP LISTS ARE THE BRIEF'S. A value outside a list (Today's 40s rest,
// a custom 25s) steps to the NEAREST listed value in the direction tapped,
// never back to the start of the list.
// ---------------------------------------------------------------------------
import { roundStyleOf, type RoundConfig } from './timer-engine'

export const WORK_STEPS = [10, 15, 20, 30, 40, 45, 60, 90, 120, 180, 240, 300]
export const REST_STEPS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120]
export const ROUNDS_MIN = 1
export const ROUNDS_MAX = 50
/** Off, then 5, 10, 15 — what one tap on the Countdown chip walks through. */
export const COUNTDOWN_STEPS = [0, 5, 10, 15]

/** The next value in `list` from `current`, one step in `dir`; held at the ends. */
export function stepThrough(list: number[], current: number, dir: 1 | -1): number {
  if (dir > 0) return list.find(v => v > current) ?? list[list.length - 1]
  for (let i = list.length - 1; i >= 0; i--) if (list[i] < current) return list[i]
  return list[0]
}

export function nextCountdown(current: number): number {
  const i = COUNTDOWN_STEPS.indexOf(current)
  return COUNTDOWN_STEPS[(i + 1) % COUNTDOWN_STEPS.length]
}

/**
 * NO REST MAKES IT AN EMOM — the rule the old Custom panel already had, kept.
 * Rest back above zero makes it intervals again, so the style can never
 * disagree with the numbers.
 */
export function withRest(config: RoundConfig, restSeconds: number): RoundConfig {
  const { style: _style, carried: _c, leadInSeconds: _l, ...rest } = config
  return restSeconds === 0 ? { ...rest, restSeconds: 0, style: 'emom' } : { ...rest, restSeconds }
}

/** The draft after one stepper tap. Never carries a lead-in or `carried`: those belong to a run. */
export function stepConfig(config: RoundConfig, field: 'rounds' | 'work' | 'rest', dir: 1 | -1): RoundConfig {
  const base = withRest(config, config.restSeconds)
  if (field === 'rounds') return { ...base, rounds: Math.min(ROUNDS_MAX, Math.max(ROUNDS_MIN, base.rounds + dir)) }
  if (field === 'work') return { ...base, workSeconds: stepThrough(WORK_STEPS, base.workSeconds, dir) }
  return withRest(base, stepThrough(REST_STEPS, base.restSeconds, dir))
}

/** "0:40", "12:00". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Work time plus the rests between rounds — no rest after the last, and never the countdown. */
export function workingSeconds(config: RoundConfig): number {
  const r = Math.max(0, config.rounds)
  return r * config.workSeconds + Math.max(0, r - 1) * config.restSeconds
}

/** What the first stepper is called: "Minutes" for a one-minute EMOM, "Intervals" for any other. */
export function roundsLabel(config: RoundConfig): 'Rounds' | 'Minutes' | 'Intervals' {
  if (roundStyleOf(config) !== 'emom') return 'Rounds'
  return config.workSeconds === 60 ? 'Minutes' : 'Intervals'
}

/** The sentence under the total. */
export function roundCaption(config: RoundConfig, name: string): string {
  if (roundStyleOf(config) === 'emom') {
    const noun = config.workSeconds === 60 ? 'minute' : 'interval'
    const label = name === 'Custom' || name === 'Today' ? 'EMOM' : name
    return `${label} · a new ${noun} starts every ${clock(config.workSeconds)}, ${config.rounds} time${config.rounds === 1 ? '' : 's'}`
  }
  const rounds = `${config.rounds} round${config.rounds === 1 ? '' : 's'}`
  // ONE ROUND HAS NO REST AT ALL — saying "no rest after the last" about it
  // would describe a rest that never existed.
  if (config.rounds <= 1) return `${rounds} · ${clock(config.workSeconds)} work`
  return `${rounds} · ${clock(config.workSeconds)} work · ${clock(config.restSeconds)} rest · no rest after the last`
}

export interface TimelineSegment { kind: 'countdown' | 'work' | 'rest'; seconds: number }

/** The bar under the caption: countdown, then work/rest alternating, no rest after the last round. */
export function timelineSegments(config: RoundConfig, countdownSeconds: number): TimelineSegment[] {
  const out: TimelineSegment[] = []
  if (countdownSeconds > 0) out.push({ kind: 'countdown', seconds: countdownSeconds })
  for (let i = 0; i < config.rounds; i++) {
    out.push({ kind: 'work', seconds: config.workSeconds })
    if (i < config.rounds - 1 && config.restSeconds > 0) out.push({ kind: 'rest', seconds: config.restSeconds })
  }
  return out
}

/** "done ~18:47": now, plus the countdown, plus the whole round. Local time, 24h, as the mock writes it. */
export function doneAt(nowMs: number, config: RoundConfig, countdownSeconds: number): string {
  const d = new Date(nowMs + (countdownSeconds + workingSeconds(config)) * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The Start button: what will happen when it is pressed. */
export function startLabel(countdownSeconds: number): string {
  return countdownSeconds > 0 ? `Start · ${countdownSeconds}s countdown` : 'Start now'
}
