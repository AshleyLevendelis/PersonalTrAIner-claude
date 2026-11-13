import type { UserProfile, WorkoutDay, PlannedActivity } from '@/lib/types'
import { PATHWAY_RUN_FOCUS } from '@/lib/pathway'
import { addDays } from '@/lib/session-move'

// ---------------------------------------------------------------------------
// RUNNING (his 13 Nov 2026 strategy, slice 6, ruling 4 "the first sport is running"; built on his "Build it").
// docs/plans/running.md holds the ladder, the CSCS basis and his two answers of the day:
//   - a race date is asked for by the COACH only (setup asks only which distance);
//   - NO PACE anywhere: a run is minutes and effort (Easy / Steady / Hard), never minutes per km.
// Mine (CSCS, recorded in BACKLOG): running days REPLACE lifting days down to two (one for a half), because recovery is
// the limit for a new runner; a lifting day is never placed the day before the long run or the hard session.
//
// THE LADDER IS PURE AND CALENDAR-SHAPED: the plan lays out the weeks a runner would expect if every run were done.
// What he actually ran then holds it back where it must (`runForToday`): a long run is never more than 10% longer than
// the longest run logged in the last 30 days, and with nothing logged the stage's first number stands.
// ---------------------------------------------------------------------------

export type RunningGoal = 'run_20' | '5k' | '10k' | 'half'

export const RUNNING_GOAL_OPTIONS: { value: RunningGoal; label: string; short: string }[] = [
  { value: 'run_20', label: 'Run 20 minutes non-stop', short: '20 minutes non-stop' },
  { value: '5k', label: 'Run 5 km', short: '5 km' },
  { value: '10k', label: 'Run 10 km', short: '10 km' },
  { value: 'half', label: 'Run a half marathon', short: 'a half marathon' },
]

export function isRunningGoal(v: unknown): v is RunningGoal {
  return typeof v === 'string' && RUNNING_GOAL_OPTIONS.some(o => o.value === v)
}

export function runningGoalOf(profile: Pick<UserProfile, 'running_goal'> | null | undefined): RunningGoal | null {
  const g = profile?.running_goal
  return isRunningGoal(g) ? g : null
}

export function runningGoalLabel(goal: RunningGoal): string {
  return RUNNING_GOAL_OPTIONS.find(o => o.value === goal)!.label
}

// ---------------------------------------------------------------------------
// The sessions
// ---------------------------------------------------------------------------

export type RunKind = 'walk_run' | 'easy' | 'strides' | 'steady' | 'intervals' | 'long'

export interface RunSession {
  kind: RunKind
  /** The day's name on every screen ("Easy run", "Long run"). */
  focus: string
  /** Whole minutes, warm-up walk included. Never a pace: his ruling of 13 Nov 2026. */
  minutes: number
  /** The minutes spent RUNNING (walk-run: the run intervals; otherwise the session less its warm-up walk). */
  runMinutes: number
  /** On the app's 1-10 scale, read back as Easy (≤4) / Steady (5-6) / Hard (≥7) everywhere. */
  targetRpe: number
  /** What to do, in plain words: the intervals or the effort. Minutes and effort only. */
  detail: string
}

export interface RunWeek {
  sessions: RunSession[]
  /** Every fourth week is lighter: about 70% of the time and no hard session (CSCS: absorb before the next push). */
  lighter: boolean
  stage: 1 | 2 | 3 | 4 | 5
}

/** The warm-up walk every run opens with, counted in its minutes. */
const WARM_UP_WALK = 5

/** Walk-run steps: seconds running, seconds walking, rounds. The run grows, the walk shrinks, the time stays about 20. */
// THE TIME ON FEET NEVER JUMPS (mine, CSCS): in walk-run the load is the whole session, so each step's minutes rise by
// no more than 10% (25, 26, 26, 28, 29, 29 with the warm-up walk) while the share spent running grows from 8 to 21.
const WALK_RUN: readonly (readonly [number, number, number])[] = [
  [60, 90, 8],
  [90, 90, 7],
  [120, 90, 6],
  [180, 90, 5],
  [300, 60, 4],
  [420, 60, 3],
]
/** From 65 the walk-run stage is never skipped and lasts at least four weeks: age only adds safeguards (slice 3). */
const WALK_RUN_WEEKS_FROM_65 = 4
const OLDER_RUNNER_AGE = 65

/** Where each goal holds once reached: easy-run minutes, long-run minutes. */
const TARGET: Record<RunningGoal, { easy: number; long: number }> = {
  run_20: { easy: 20, long: 25 },
  '5k': { easy: 30, long: 40 },
  '10k': { easy: 35, long: 70 },
  half: { easy: 40, long: 135 },
}

/** The first continuous runs, after walk-run: 20 minutes, the number "with nothing logged" falls back to. */
const FIRST_CONTINUOUS_MINUTES = 20
/** The 10% rule, for the long run off the log and for the week's total off the week before. */
const LONG_RUN_GROWTH = 1.1
const LIGHTER_FACTOR = 0.7

function secs(s: number): string {
  if (s % 60 === 0) return `${s / 60} minute${s === 60 ? '' : 's'}`
  if (s === 90) return '90 seconds'
  return `${Math.floor(s / 60)} min ${s % 60} s`
}

function walkRunSession(step: number, lighter = false): RunSession {
  const [run, walk, fullRounds] = WALK_RUN[Math.max(0, Math.min(WALK_RUN.length - 1, step))]
  // A lighter week keeps the step he can do and drops about a third of the rounds: less time on feet, same skill.
  const rounds = lighter ? Math.max(2, Math.round(fullRounds * 0.6)) : fullRounds
  const work = Math.round((rounds * (run + walk)) / 60)
  return {
    kind: 'walk_run',
    focus: 'Walk-run',
    minutes: WARM_UP_WALK + work,
    runMinutes: Math.round((rounds * run) / 60),
    targetRpe: 4,
    detail: `${WARM_UP_WALK} minutes brisk walking, then ${rounds} rounds: run ${secs(run)}, walk ${secs(walk)}. Easy: you can talk in full sentences while you run.`,
  }
}

function easySession(minutes: number, strides = false): RunSession {
  return {
    kind: strides ? 'strides' : 'easy',
    focus: strides ? 'Easy run + strides' : 'Easy run',
    minutes,
    runMinutes: Math.max(0, minutes - WARM_UP_WALK),
    targetRpe: 3,
    detail: strides
      ? `${WARM_UP_WALK} minutes walking, then ${minutes - WARM_UP_WALK} minutes Easy. Finish with 4 strides: 20 seconds quicker but relaxed, walk back between.`
      : `${WARM_UP_WALK} minutes walking, then ${minutes - WARM_UP_WALK} minutes Easy: you can talk in full sentences.`,
  }
}

function longSession(minutes: number): RunSession {
  return {
    kind: 'long',
    focus: 'Long run',
    minutes,
    runMinutes: Math.max(0, minutes - WARM_UP_WALK),
    targetRpe: 4,
    detail: `${WARM_UP_WALK} minutes walking, then ${minutes - WARM_UP_WALK} minutes Easy. The longest run of your week: slow is right, walk a minute whenever you need to.`,
  }
}

function steadySession(minutes: number, steady: number): RunSession {
  const rest = Math.max(0, minutes - WARM_UP_WALK - steady)
  const before = Math.ceil(rest / 2)
  const after = rest - before
  return {
    kind: 'steady',
    focus: 'Steady run',
    minutes,
    runMinutes: Math.max(0, minutes - WARM_UP_WALK),
    targetRpe: 6,
    detail: `${WARM_UP_WALK} minutes walking, ${before} minutes Easy, ${steady} minutes Steady (a few words at a time), then ${after} minutes Easy.`,
  }
}

function intervalSession(minutes: number, reps: number): RunSession {
  const work = reps * 4 // 2 minutes Hard, 2 minutes easy
  const rest = Math.max(0, minutes - WARM_UP_WALK - work)
  const before = Math.ceil(rest / 2)
  const after = rest - before
  return {
    kind: 'intervals',
    focus: 'Intervals',
    minutes,
    runMinutes: Math.max(0, minutes - WARM_UP_WALK),
    targetRpe: 7,
    detail: `${WARM_UP_WALK} minutes walking, ${before} minutes Easy, then ${reps} rounds: 2 minutes Hard, 2 minutes Easy. Finish with ${after} minutes Easy.`,
  }
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

export interface LadderOptions {
  /** The longest he says he runs non-stop now, in minutes (told to the coach). 20+ starts past walk-run. */
  baseMinutes?: number | null
  age?: number | null
}

interface LadderState {
  walkRunStep: number | null
  easy: number
  long: number
}

function startState(goal: RunningGoal, opts: LadderOptions): LadderState {
  const base = typeof opts.baseMinutes === 'number' && Number.isFinite(opts.baseMinutes) ? opts.baseMinutes : 0
  const older = typeof opts.age === 'number' && opts.age >= OLDER_RUNNER_AGE
  if (base >= FIRST_CONTINUOUS_MINUTES && !older) {
    const t = TARGET[goal]
    const long = Math.min(t.long, Math.round(base))
    return { walkRunStep: null, easy: Math.min(t.easy, long), long }
  }
  // From 65 the walk-run's last four steps are always run through, whatever he says he can do now.
  const firstStep = base >= FIRST_CONTINUOUS_MINUTES && older ? WALK_RUN.length - WALK_RUN_WEEKS_FROM_65 : 0
  return { walkRunStep: firstStep, easy: FIRST_CONTINUOUS_MINUTES, long: FIRST_CONTINUOUS_MINUTES }
}

function advance(goal: RunningGoal, s: LadderState): LadderState {
  if (s.walkRunStep !== null) {
    return s.walkRunStep + 1 < WALK_RUN.length
      ? { ...s, walkRunStep: s.walkRunStep + 1 }
      : { walkRunStep: null, easy: FIRST_CONTINUOUS_MINUTES, long: FIRST_CONTINUOUS_MINUTES }
  }
  const t = TARGET[goal]
  // The long run grows by the 10% rule, the easy runs by two minutes, each up to the goal's own number.
  const long = Math.min(t.long, Math.max(s.long + 1, Math.floor(s.long * LONG_RUN_GROWTH)))
  const easy = Math.min(t.easy, s.easy + 2, long)
  return { walkRunStep: null, easy, long }
}

function stageOf(goal: RunningGoal, s: LadderState): RunWeek['stage'] {
  if (s.walkRunStep !== null) return 1
  if (s.long < 30) return 2
  if (s.long <= 40 || goal === '5k' || goal === 'run_20') return 3
  if (s.long <= 70 || goal === '10k') return 4
  return 5
}

/** The quality session a goal earns once the long run has reached 40 minutes (the 5 km base). */
function qualityFor(goal: RunningGoal, s: LadderState, ladderWeek: number): RunSession | null {
  if (goal !== '10k' && goal !== 'half') return null
  if (s.long < 40) return null
  const steady = Math.min(25, 10 + Math.floor((s.long - 40) / 6) * 2)
  if (goal === 'half' && ladderWeek % 2 === 0) return intervalSession(s.easy + 5, Math.min(6, 3 + Math.floor((s.long - 40) / 20)))
  return steadySession(s.easy + 5, steady)
}

function weekFromState(goal: RunningGoal, s: LadderState, ladderWeek: number): RunSession[] {
  if (s.walkRunStep !== null) {
    const one = walkRunSession(s.walkRunStep)
    return [one, { ...one }, { ...one }]
  }
  const strides = goal !== 'run_20' && s.long >= 26
  const quality = qualityFor(goal, s, ladderWeek)
  const easy = WARM_UP_WALK + s.easy
  return [
    easySession(easy),
    quality ?? easySession(easy, strides),
    longSession(WARM_UP_WALK + s.long),
  ]
}

function lighten(sessions: RunSession[], goal: RunningGoal, s: LadderState): RunSession[] {
  if (s.walkRunStep !== null) {
    const one = walkRunSession(Math.max(0, s.walkRunStep - 1), true)
    return [one, { ...one }, { ...one }]
  }
  return sessions.map(x => {
    const m = WARM_UP_WALK + Math.max(10, Math.round((x.minutes - WARM_UP_WALK) * LIGHTER_FACTOR))
    // No hard session in a lighter week: the quality day is an easy run.
    if (x.kind === 'long') return longSession(m)
    return easySession(m, x.kind === 'strides' && goal !== 'run_20')
  })
}

/**
 * THE WEEK the ladder prescribes, ladder week 1 being his first running week. Every fourth week is lighter and does not
 * move the ladder on; the week after it carries on from where the one before it stood.
 */
export function runningWeek(goal: RunningGoal, ladderWeek: number, opts: LadderOptions = {}): RunWeek {
  let s = startState(goal, opts)
  const week = Math.max(1, Math.floor(ladderWeek))
  for (let w = 1; w < week; w++) {
    if (w % 4 !== 0) s = advance(goal, s)
  }
  const lighter = week % 4 === 0
  const plain = weekFromState(goal, s, week)
  return { sessions: lighter ? lighten(plain, goal, s) : plain, lighter, stage: stageOf(goal, s) }
}

/** The minutes a week holds, all sessions together. */
export function weekMinutes(week: RunWeek): number {
  return week.sessions.reduce((n, x) => n + x.minutes, 0)
}

/** How many ladder weeks until the long run first reaches the goal's own number, from this start. */
export function weeksToGoal(goal: RunningGoal, opts: LadderOptions = {}): number {
  for (let w = 1; w <= 200; w++) {
    const week = runningWeek(goal, w, opts)
    const long = week.sessions.find(x => x.kind === 'long')
    if (!week.lighter && long && long.minutes - WARM_UP_WALK >= TARGET[goal].long) return w
  }
  return 200
}

/** The two weeks before a race are a taper: the plan must reach the goal this many weeks before the race. */
const TAPER_WEEKS = 2

/**
 * A RACE DATE COUNTS BACK (told to the coach only, his ruling of 13 Nov 2026). The goal it can safely reach by then,
 * with the taper: his own when there is time, otherwise the biggest one that fits, otherwise null (not even 20
 * minutes non-stop can be reached safely before that date).
 */
export function reachableByRace(goal: RunningGoal, weeksUntilRace: number, opts: LadderOptions = {}): RunningGoal | null {
  const order: RunningGoal[] = ['run_20', '5k', '10k', 'half']
  const wanted = order.indexOf(goal)
  for (let i = wanted; i >= 0; i--) {
    if (weeksToGoal(order[i], opts) + TAPER_WEEKS <= weeksUntilRace) return order[i]
  }
  return null
}

/** Whole weeks from one date to another (YYYY-MM-DD), counted as dates, never instants. */
export function weeksBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.floor((b - a) / (7 * 86_400_000))
}

// ---------------------------------------------------------------------------
// The week: which days run, which days lift
// ---------------------------------------------------------------------------

const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
function dayIndex(name: string): number {
  return Math.max(0, WEEK_ORDER.indexOf(name.toLowerCase().slice(0, 3)))
}

export interface RunningSplit {
  liftDays: string[]
  /** In calendar order, each with the session kind it carries in a full week. */
  runDays: { day: string; role: 'easy' | 'quality' | 'long' }[]
}

/**
 * HOW MANY OF EACH (mine, CSCS): three runs a week where the days allow, lifting kept at two (one for a half) and
 * never below one, running days replacing lifting days down to that. With three days: two runs and one full-body
 * lift. With two: one of each. With one day the running goal cannot be planned beside lifting and the day lifts.
 */
export function runningCounts(goal: RunningGoal, days: number): { runs: number; lifts: number } {
  if (days <= 1) return { runs: 0, lifts: days }
  const minLift = goal === 'half' ? 1 : 2
  const lifts = Math.max(1, Math.min(Math.max(minLift, days - 3), days - 2 >= 1 ? days - 2 : 1))
  const runs = Math.min(3, days - lifts)
  return { runs, lifts: days - runs }
}

/**
 * WHICH DAYS, by trying every way of choosing the run days and keeping the best: a lifting day the day before the
 * long run or the hard session costs most (CSCS: sore legs spoil both); runs back to back, lifts back to back and a
 * long run off the weekend cost a little. Earliest wins a tie, so the answer is the same every time.
 */
export function chooseRunningDays(available: string[], goal: RunningGoal): RunningSplit {
  const all = [...available].sort((a, b) => dayIndex(a) - dayIndex(b))
  // AT LEAST ONE FULL REST DAY A WEEK for a runner (mine, CSCS): a seven-day week gives up the day that suits it best.
  const weeks = all.length > MAX_RUNNING_WEEK_DAYS ? all.map((_, i) => all.filter((__, k) => k !== i)) : [all]
  let best: { score: number; split: RunningSplit } | null = null
  for (const days of weeks) {
    const { runs } = runningCounts(goal, days.length)
    if (runs === 0) return { liftDays: days, runDays: [] }
    const n = days.length
    for (let mask = 0; mask < 1 << n; mask++) {
      if (bitCount(mask) !== runs) continue
      const runIdx = days.map((_, i) => i).filter(i => mask & (1 << i))
      const liftIdx = days.map((_, i) => i).filter(i => !(mask & (1 << i)))
      for (const split of roleChoices(days, runIdx, liftIdx)) {
        const score = scoreSplit(split)
        if (!best || score < best.score) best = { score, split }
      }
    }
  }
  return best!.split
}

/** A runner's week holds at most six sessions: one day is always a full rest. */
const MAX_RUNNING_WEEK_DAYS = 6

function bitCount(m: number): number {
  let c = 0
  for (; m; m &= m - 1) c++
  return c
}

/**
 * Every way of naming one run day the long run and (with three runs) another the hard session, the long run on the
 * weekend first so a tie keeps it there.
 */
function roleChoices(days: string[], runIdx: number[], liftIdx: number[]): RunningSplit[] {
  const runNames = runIdx.map(i => days[i])
  const liftDays = liftIdx.map(i => days[i])
  const longFirst = [...runNames].sort((a, b) => {
    const wa = dayIndex(a) >= 5 ? 0 : 1, wb = dayIndex(b) >= 5 ? 0 : 1
    return wa - wb || dayIndex(b) - dayIndex(a)
  })
  const out: RunningSplit[] = []
  for (const long of longFirst) {
    const others = runNames.filter(d => d !== long)
    const qualities: (string | null)[] = others.length >= 2 ? others : [null]
    for (const quality of qualities) {
      out.push({ liftDays, runDays: runNames.map(d => ({ day: d, role: d === long ? 'long' : d === quality ? 'quality' : 'easy' })) })
    }
  }
  return out
}

function scoreSplit(split: RunningSplit): number {
  const lift = new Set(split.liftDays.map(dayIndex))
  const run = new Set(split.runDays.map(r => dayIndex(r.day)))
  const before = (i: number) => (i + 6) % 7
  let score = 0
  for (const r of split.runDays) {
    if ((r.role === 'long' || r.role === 'quality') && lift.has(before(dayIndex(r.day)))) score += 10
  }
  for (const i of run) if (run.has((i + 1) % 7)) score += 2
  for (const i of lift) if (lift.has((i + 1) % 7)) score += 1
  const long = split.runDays.find(r => r.role === 'long')
  if (long && dayIndex(long.day) < 5) score += 3
  // No two hard days back to back: the long run and the hard session never sit side by side.
  const quality = split.runDays.find(r => r.role === 'quality')
  if (long && quality) {
    const g = Math.abs(dayIndex(long.day) - dayIndex(quality.day))
    if (Math.min(g, 7 - g) === 1) score += 10
  }
  return score
}

/** The training days a running goal leaves to lifting; everything else in the app sees only these. */
export function liftingDaysFor(profile: Pick<UserProfile, 'running_goal' | 'training_days'>, isStartingOutPlan: boolean): Set<string> | null {
  const goal = runningGoalOf(profile)
  if (!goal || isStartingOutPlan) return null
  const available = (profile.training_days ?? []).filter(d => d.available).map(d => d.day)
  return new Set(chooseRunningDays(available, goal).liftDays)
}

// ---------------------------------------------------------------------------
// Into the plan
// ---------------------------------------------------------------------------

/** The plan marks a run day by this activity name; the logs read it back by the same word. */
export const RUN_ACTIVITY = 'Run'
const WALK_RUN_ACTIVITY = 'Walk-run'

export function isRunDay(day: Pick<WorkoutDay, 'plannedActivity'> | null | undefined): boolean {
  const a = day?.plannedActivity?.activity
  return a === RUN_ACTIVITY || a === WALK_RUN_ACTIVITY
}

function asActivity(s: RunSession): PlannedActivity {
  return {
    activity: s.kind === 'walk_run' ? WALK_RUN_ACTIVITY : RUN_ACTIVITY,
    duration: s.minutes,
    targetRpe: s.targetRpe,
    reason: s.detail,
  }
}

/** A week's sessions fitted to the days it has: two days keep an easy run and the long run, one keeps an easy run. */
function fitSessions(week: RunWeek, roles: RunningSplit['runDays']): RunSession[] {
  const [easy, middle, long] = week.sessions
  if (roles.length >= 3) {
    return roles.map(r => (r.role === 'long' ? long : r.role === 'quality' ? middle : easy))
  }
  if (roles.length === 2) return roles.map(r => (r.role === 'long' ? long : easy))
  return roles.map(() => easy)
}

function runDay(day: string, s: RunSession): WorkoutDay {
  return { day, focus: s.focus, exercises: [], is_scheduled: true, plannedActivity: asActivity(s) } as WorkoutDay
}

/**
 * The ordinary plan's week with its run days added, in calendar order. Days already carrying a run (a rebuild handed
 * a saved week) are dropped first, so a week never holds the same run twice.
 */
export function withRunDays(
  days: WorkoutDay[],
  ladderWeek: number,
  profile: Pick<UserProfile, 'running_goal' | 'training_days' | 'running_base_minutes' | 'age'>,
): WorkoutDay[] {
  const goal = runningGoalOf(profile)
  if (!goal || ladderWeek < 1) return days
  const available = (profile.training_days ?? []).filter(d => d.available).map(d => d.day)
  const split = chooseRunningDays(available, goal)
  const week = runningWeek(goal, ladderWeek, { baseMinutes: profile.running_base_minutes, age: profile.age })
  const sessions = fitSessions(week, split.runDays)
  // A run day takes the whole day: whatever the lifting plan left there (an active-recovery suggestion) goes, but a
  // day carrying exercises is never dropped (lifting days are chosen apart from run days, so none should be there).
  const runNames = new Set(split.runDays.map(r => r.day.toLowerCase().slice(0, 3)))
  const kept = days.filter(d => !isRunDay(d) && (d.exercises.length > 0 || !runNames.has(d.day.toLowerCase().slice(0, 3))))
  const added = split.runDays.map((r, i) => runDay(r.day, sessions[i]))
  return [...kept, ...added].sort((a, b) => dayIndex(a.day) - dayIndex(b.day))
}

/** The pathway's ladder starts in week 3 (weeks 1-2 stay walks): his walk days become the runs, up to three. */
const PATHWAY_RUNNING_FROM_WEEK = 3

/**
 * ON THE PATHWAY (starting out), the walks become the ladder's sessions from week 3: every day with a walk, up to
 * three. A walk-only day carries the run as the day's session (the last of them the long run); a home strength day
 * carries it after the circuit, where the walk was (the circuit is light, easy effort, and the run is Easy).
 */
export function pathwayWithRuns(
  days: WorkoutDay[],
  weekNumber: number,
  profile: Pick<UserProfile, 'running_goal' | 'running_base_minutes' | 'age' | 'running_start_week'>,
): WorkoutDay[] {
  const goal = runningGoalOf(profile)
  const start = Math.max(PATHWAY_RUNNING_FROM_WEEK, profile.running_start_week ?? 1)
  if (!goal || weekNumber < start) return days
  const walkOnly = (d: WorkoutDay) => !!d.plannedActivity && d.exercises.length === 0
  const afterStrength = (d: WorkoutDay) => d.exercises.length > 0 && !!d.recommendedCardio
  const picks = days.map((d, i) => ({ d, i })).filter(x => walkOnly(x.d) || afterStrength(x.d)).slice(0, 3)
  if (picks.length === 0) return days
  const week = runningWeek(goal, weekNumber - start + 1, { baseMinutes: profile.running_base_minutes, age: profile.age })
  // The long run on the last walk-only day (never after a circuit); the hard session, if any, on a walk-only day too.
  const longAt = [...picks].reverse().find(x => walkOnly(x.d)) ?? picks[picks.length - 1]
  const qualityAt = picks.find(x => x !== longAt && walkOnly(x.d) && picks.length === 3) ?? null
  const roles: RunningSplit['runDays'] = picks.map(x => ({ day: x.d.day, role: x === longAt ? 'long' : x === qualityAt ? 'quality' : 'easy' }))
  const sessions = fitSessions(week, roles)
  const out = days.map(d => ({ ...d }))
  picks.forEach((x, k) => {
    const s = sessions[k]
    if (walkOnly(x.d)) { out[x.i] = runDay(x.d.day, s); return }
    out[x.i] = {
      ...x.d,
      focus: PATHWAY_RUN_FOCUS,
      recommendedCardio: { activity: asActivity(s).activity, duration: s.minutes, targetRpe: s.targetRpe, timing: 'post_session', reason: `After the strength work: ${s.detail}` },
    }
  })
  return out
}

/** The run a day carries, as the day's session or after its strength work. */
export function runOnDay(day: WorkoutDay): { activity: string; duration: number; targetRpe?: number } | null {
  if (isRunDay(day)) return day.plannedActivity!
  const c = day.recommendedCardio
  return c && (c.activity === RUN_ACTIVITY || c.activity === WALK_RUN_ACTIVITY) ? c : null
}

/** The line a running week adds to the week's coaching: the count, the minutes, the effort. Never a pace. */
export function runningWeekNote(days: WorkoutDay[]): string {
  const runs = days.map(runOnDay).filter((r): r is NonNullable<typeof r> => !!r)
  if (runs.length === 0) return ''
  const minutes = runs.reduce((n, r) => n + r.duration, 0)
  const hard = runs.some(r => (r.targetRpe ?? 0) >= 6)
  return `Running this week: ${runs.length} run${runs.length === 1 ? '' : 's'}, about ${minutes} minutes, ${hard ? 'one of them harder and the rest Easy' : 'all of it Easy'}.`
}

// ---------------------------------------------------------------------------
// What he actually ran holds today's run back (the 10% rule off the log)
// ---------------------------------------------------------------------------

export interface LoggedRun { date: string; minutes: number; activity: string }

/** A logged cardio row that was a run: the plan's own words, and the ones people type. Never a walk. */
export function isRunLog(activity: string): boolean {
  const a = activity.trim().toLowerCase()
  if (/\bwalk\b/.test(a) && !/walk-?run/.test(a)) return false
  return /\b(run|running|jog|jogging|walk-?run|parkrun)\b/.test(a)
}

export interface RunToday {
  /** The minutes to show and pre-fill, after the log's limit. */
  minutes: number
  /** One sentence saying why it is shorter than planned, or null when it is as planned. */
  heldBack: string | null
}

/**
 * THE 10% RULE OFF THE LOG. A continuous run is never more than 10% longer than the longest run logged in the 30 days
 * before today; with nothing logged in that time, the stage's first number (20 minutes of running) stands. Walk-run
 * sessions are left alone: they are built to be the same 20-odd minutes every week while the running inside them grows.
 */
export function runForToday(planned: PlannedActivity, today: string, logs: LoggedRun[], raceDate?: string | null): RunToday {
  if (planned.activity !== RUN_ACTIVITY) return { minutes: planned.duration, heldBack: null }
  const capped = cappedToLog(planned, today, logs)
  return taperForRace(capped, today, raceDate ?? null)
}

/**
 * THE TAPER (his race date, told to the coach): the week before the race is half the minutes, the week before that
 * seven tenths, so he arrives fresh; race day itself is the race. Never makes a run longer than the log allows.
 */
export function taperForRace(run: RunToday, today: string, raceDate: string | null): RunToday {
  if (!raceDate || today > raceDate) return run
  const days = Math.round((Date.UTC(+raceDate.slice(0, 4), +raceDate.slice(5, 7) - 1, +raceDate.slice(8, 10))
    - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000)
  if (days === 0) return { minutes: run.minutes, heldBack: 'Race day. Start Easy for the first ten minutes, then run your race.' }
  if (days > 14) return run
  const factor = days <= 7 ? 0.5 : 0.7
  const minutes = WARM_UP_WALK + Math.max(10, Math.round((run.minutes - WARM_UP_WALK) * factor))
  if (minutes >= run.minutes) return run
  return { minutes, heldBack: `Kept to ${minutes} minutes: ${days <= 7 ? 'race week' : 'two weeks out from your race'}, so you arrive fresh.` }
}

function cappedToLog(planned: PlannedActivity, today: string, logs: LoggedRun[]): RunToday {
  const from = shiftDate(today, -30)
  const recent = logs.filter(l => l.date >= from && l.date < today && isRunLog(l.activity) && l.minutes > 0)
  const longest = recent.reduce((m, l) => Math.max(m, l.minutes), 0)
  const runPart = Math.max(0, planned.duration - WARM_UP_WALK)
  const allowedRun = longest > 0 ? Math.floor(longest * LONG_RUN_GROWTH) : FIRST_CONTINUOUS_MINUTES
  if (runPart <= allowedRun) return { minutes: planned.duration, heldBack: null }
  const minutes = WARM_UP_WALK + allowedRun
  return {
    minutes,
    heldBack: longest > 0
      ? `Kept to ${minutes} minutes today: no more than 10% longer than your longest run in the last 30 days (${longest} minutes).`
      : `Kept to ${minutes} minutes today: log your runs and this one grows with them, 10% at a time.`,
  }
}

function shiftDate(date: string, days: number): string {
  return addDays(date, days)
}

/** "Sunday 11 April 2027": a race date in words, read as a date (never an instant). */
export function raceDateWords(date: string): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)))
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * THE WEEK THE LADDER STARTS, for a rebuild. A running goal added mid-plan must start at walk-run (or his stated base),
 * never mid-ladder: the ladder starts at the first week of the existing plan that already holds a run, else at the
 * first week being rebuilt. Not stored: worked out from the plan each time, so a later rebuild carries it on.
 */
export function runningStartWeek(mesocycle: { week_number: number; days: WorkoutDay[] }[], fromWeek: number): number {
  const first = mesocycle
    .filter(w => w.week_number < fromWeek && w.days.some(d => runOnDay(d)))
    .reduce((m, w) => Math.min(m, w.week_number), Infinity)
  return Number.isFinite(first) ? first : Math.max(1, fromWeek)
}

/** The ladder week a plan week is: 0 or less before the ladder has started (no runs that week). */
export function ladderWeekOf(planWeek: number, startWeek: number | null | undefined): number {
  return planWeek - Math.max(1, startWeek ?? 1) + 1
}
