// ---------------------------------------------------------------------------
// THE WATCH REPORT (step 0 of docs/plans/health-data-next.md; his "Start the planned work", 27 Nov 2026).
//
// Nothing about the watch features has run on a real watch, and when one misbehaves a screenshot shows WHAT is wrong
// and not WHY. This makes a short plain report of what the phone's health store hands the app, for him to copy and
// send with a bug report: how many records of each kind, how long each covers, how far apart they are, how old the
// newest is, and which app and device wrote them.
//
// COUNTS AND TIMES ONLY (the promise in the plan he read). No step count, heart rate, distance, calorie figure or
// sleep length is in it, and the records it reads carry none (HealthRecord has no value). It reads ONLY what his own
// switches already allow, so making a report never shows a permission sheet; a kind whose switch is off says so.
// Nothing is saved or sent: the text sits on the screen until he copies it.
//
// The two questions it exists to answer first (plan, steps 1 and 6): does Samsung share a workout's distance minute by
// minute or only as a total, and how often does it share heart rate during one.
// ---------------------------------------------------------------------------

import type { HealthRecord, HealthRecordKind, WatchWorkout } from './health-steps'

const MIN = 60000
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export interface RecordSummary {
  count: number
  /** The middle record's length in seconds (0 for an instant reading), or null with no records. */
  typicalLengthSec: number | null
  /** The middle gap between one record's start and the next, in seconds, or null with fewer than two. */
  typicalGapSec: number | null
  /** Minutes since the newest record ended, or null with none. */
  newestAgoMin: number | null
  /** Which app and device wrote them, most first. */
  sources: { name: string; count: number }[]
}

/** What a list of records looks like, without anything a record measured. */
export function summariseRecords(records: readonly HealthRecord[], now: Date): RecordSummary {
  const rows = records
    .map(r => ({ a: Date.parse(r.start), b: Date.parse(r.end), from: [r.source ?? 'unnamed app', r.device].filter(Boolean).join(', ') }))
    .filter(r => Number.isFinite(r.a) && Number.isFinite(r.b))
    .sort((x, y) => x.a - y.a)
  if (rows.length === 0) return { count: 0, typicalLengthSec: null, typicalGapSec: null, newestAgoMin: null, sources: [] }
  const gaps: number[] = []
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i].a - rows[i - 1].a)
  const by = new Map<string, number>()
  for (const r of rows) by.set(r.from, (by.get(r.from) ?? 0) + 1)
  return {
    count: rows.length,
    typicalLengthSec: Math.round(median(rows.map(r => Math.max(0, r.b - r.a))) / 1000),
    typicalGapSec: gaps.length ? Math.round(median(gaps) / 1000) : null,
    newestAgoMin: Math.max(0, Math.round((now.getTime() - Math.max(...rows.map(r => r.b))) / MIN)),
    sources: [...by.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
  }
}

/** A read that worked, one that failed (with the phone's own words), or one not tried because its switch is off. */
export type Read<T> = { state: 'ok'; value: T } | { state: 'failed'; why: string } | { state: 'off' }

export interface WorkoutDetail {
  type: string
  start: string
  minutes: number
  source: string | null
  ownDistance: boolean
  ownCalories: boolean
  /** Records inside the workout's own time, by kind. Null where that kind could not be read. */
  inside: Record<'heartRate' | 'distance' | 'steps', number | null>
}

export interface Diagnostics {
  madeAt: Date
  platform: 'ios' | 'android'
  storeName: string
  store: { available: boolean; reason?: string }
  switches: { steps: boolean; heart: boolean; workouts: boolean; sleep: boolean; strap: 'none' | 'paired' | 'connected' }
  /** Whether asking the phone for today's step total gave an answer above zero. */
  stepsTotal: Read<boolean>
  records: Record<HealthRecordKind, Read<RecordSummary>>
  workouts: Read<{ count: number; kinds: { name: string; count: number }[]; sources: { name: string; count: number }[]; latest: WorkoutDetail | null }>
  sleep: Read<{ sessions: number; withStages: number; stageNames: string[]; newestEnd: string | null; nights: number }>
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
/** "Wed 26 Nov 14:05", on the phone's own clock. */
export function stamp(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** "45 s", "1 min", "2 h 5 min": a length of time as the report says it. */
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
const ago = (min: number) => (min < 1 ? 'just now' : `${span(min * 60)} ago`)
const n = (x: number) => x.toLocaleString('en-GB')
const tally = (xs: { name: string; count: number }[]) => xs.map(x => `${x.name} ${n(x.count)}`).join(', ')
const perMinute = (count: number, minutes: number) => { const r = count / Math.max(1, minutes); return r >= 10 ? String(Math.round(r)) : r.toFixed(1) }

function recordLines(title: string, r: Read<RecordSummary>, what: 'records' | 'readings'): string[] {
  if (r.state === 'off') return [title, ' not read: its switch is off']
  if (r.state === 'failed') return [title, ` could not be read: ${r.why}`]
  const v = r.value
  if (v.count === 0) return [title, ` ${what}: 0`]
  const parts = [`${what}: ${n(v.count)}`]
  if (what === 'records' && v.typicalLengthSec != null) parts.push(`each about ${span(v.typicalLengthSec)} long`)
  if (v.typicalGapSec != null) parts.push(`about ${span(v.typicalGapSec)} apart`)
  if (v.newestAgoMin != null) parts.push(`newest ${ago(v.newestAgoMin)}`)
  return [title, ` ${parts.join(' · ')}`, ` from: ${tally(v.sources)}`]
}

/** The report, as the plain text he copies. Every line is a count, a time, or the name of an app or device. */
export function diagnosticsText(d: Diagnostics): string {
  const on = (b: boolean) => (b ? 'on' : 'off')
  const out: string[] = [
    'WATCH REPORT (counts and times only, no readings)',
    `Made ${stamp(d.madeAt)} · ${d.platform === 'android' ? 'Android' : 'iPhone'} · ${d.storeName} ${d.store.available ? 'available' : `NOT available${d.store.reason ? ` (${d.store.reason})` : ''}`}`,
    `Switches: steps ${on(d.switches.steps)}, heart rate ${on(d.switches.heart)}, workouts ${on(d.switches.workouts)}, sleep ${on(d.switches.sleep)}, strap ${d.switches.strap === 'none' ? 'not paired' : d.switches.strap}`,
    '',
  ]
  const total = d.stepsTotal.state === 'off' ? null
    : d.stepsTotal.state === 'failed' ? ` today's total could not be read: ${d.stepsTotal.why}`
    : ` today's total: ${d.stepsTotal.value ? 'came back' : 'came back as nothing'}`
  const steps = recordLines('STEPS, last 24 hours', d.records.steps, 'records')
  out.push(steps[0], ...(total ? [total] : []), ...steps.slice(1), '')
  out.push(...recordLines('DISTANCE, last 24 hours', d.records.distance, 'records'), '')
  out.push(...recordLines('CALORIES BURNED, last 24 hours', d.records.calories, 'records'), '')
  out.push(...recordLines('HEART RATE, last 24 hours', d.records.heartRate, 'readings'), '')
  out.push(...recordLines('RESTING HEART RATE, last 14 days', d.records.restingHeartRate, 'readings'), '')

  out.push('WORKOUTS, last 14 days')
  if (d.workouts.state === 'off') out.push(' not read: its switch is off')
  else if (d.workouts.state === 'failed') out.push(` could not be read: ${d.workouts.why}`)
  else {
    const w = d.workouts.value
    out.push(` found: ${n(w.count)}`)
    if (w.count > 0) out.push(` kinds: ${tally(w.kinds)}`, ` from: ${tally(w.sources)}`)
    const l = w.latest
    if (l) {
      const inside = (label: string, c: number | null) => (c == null ? `  ${label} inside it: could not be read` : `  ${label} inside it: ${n(c)} (${perMinute(c, l.minutes)} a minute)`)
      out.push(
        ` latest: ${l.type} · ${stamp(new Date(l.start))} · ${l.minutes} min`,
        `  its own distance: ${l.ownDistance ? 'yes' : 'no'} · its own calories: ${l.ownCalories ? 'yes' : 'no'}`,
        inside('heart readings', l.inside.heartRate), inside('distance records', l.inside.distance), inside('step records', l.inside.steps),
      )
    }
  }
  out.push('', 'SLEEP, last 16 nights')
  if (d.sleep.state === 'off') out.push(' not read: its switch is off')
  else if (d.sleep.state === 'failed') out.push(` could not be read: ${d.sleep.why}`)
  else {
    const s = d.sleep.value
    out.push(` sessions: ${n(s.sessions)} · with stages: ${n(s.withStages)}${s.stageNames.length ? ` (${s.stageNames.join(', ')})` : ''}`)
    out.push(` nights the app counts: ${n(s.nights)}${s.newestEnd ? ` · newest ended ${stamp(new Date(s.newestEnd))}` : ''}`)
  }
  return out.join('\n')
}

/** The phone's own words for a failed read, short enough for one line and with nothing but the message. */
function why(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : 'no reason given'
  return m.replace(/\s+/g, ' ').trim().slice(0, 120) || 'no reason given'
}
async function attempt<T>(allowed: boolean, read: (() => Promise<T>) | null): Promise<Read<T>> {
  if (!allowed) return { state: 'off' }
  if (!read) return { state: 'failed', why: 'this phone app cannot read it' }
  try { return { state: 'ok', value: await read() } } catch (e) { return { state: 'failed', why: why(e) } }
}

/** Read the phone and build the report. Null in a browser (no phone health store to report on). */
export async function gatherDiagnostics(now: Date = new Date()): Promise<Diagnostics | null> {
  const [{ healthAdapter, healthStoreName, isHealthStepsConnected }, heart, workouts, sleep, strap, nights] = await Promise.all([
    import('./health-steps'), import('./health-heart'), import('./watch-workouts'), import('./health-sleep'), import('./strap-live'), import('./sleep-nights'),
  ])
  const adapter = await healthAdapter()
  if (!adapter) return null
  let store: { available: boolean; reason?: string }
  try { store = await adapter.isAvailable() } catch (e) { store = { available: false, reason: why(e) } }
  const switches = {
    steps: isHealthStepsConnected(), heart: heart.isHealthHeartConnected(), workouts: workouts.isWatchWorkoutsConnected(), sleep: sleep.isHealthSleepConnected(),
    strap: (!strap.pairedStrap() ? 'none' : strap.strapState() === 'connected' ? 'connected' : 'paired') as 'none' | 'paired' | 'connected',
  }
  const dayAgo = new Date(now.getTime() - 24 * 60 * MIN), fortnight = new Date(now.getTime() - 14 * 24 * 60 * MIN)
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const records = (kind: HealthRecordKind, from: Date, to: Date) => (adapter.recordsBetween ? () => adapter.recordsBetween!(kind, from, to) : null)
  const summary = (kind: HealthRecordKind, allowed: boolean, from: Date) =>
    attempt(allowed, records(kind, from, now)).then((r): Read<RecordSummary> => (r.state === 'ok' ? { state: 'ok', value: summariseRecords(r.value, now) } : r))
  // Distance and calories are allowed with a recorded workout or the watch's workouts, steps with either of those too.
  const activity = switches.steps || switches.workouts
  const [stepsTotal, stepRecs, distRecs, kcalRecs, heartRecs, restingRecs] = await Promise.all([
    attempt(switches.steps, () => adapter.stepsBetween(midnight, now).then(x => x > 0)),
    summary('steps', activity, dayAgo), summary('distance', activity, dayAgo), summary('calories', activity, dayAgo),
    summary('heartRate', switches.heart || switches.workouts, dayAgo), summary('restingHeartRate', switches.heart, fortnight),
  ])
  const found = await attempt(switches.workouts, adapter.workoutsBetween ? () => adapter.workoutsBetween!(fortnight, now) : null)
  let workoutsRead: Diagnostics['workouts']
  if (found.state !== 'ok') workoutsRead = found
  else {
    const list: WatchWorkout[] = [...found.value].sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
    const count = (key: (w: WatchWorkout) => string) => {
      const by = new Map<string, number>()
      for (const w of list) by.set(key(w), (by.get(key(w)) ?? 0) + 1)
      return [...by.entries()].map(([name, c]) => ({ name, count: c })).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name))
    }
    // The latest workout long enough to say anything about (a three-minute blip tells nothing of how finely it is shared).
    const l = list.find(w => Date.parse(w.end) - Date.parse(w.start) >= 5 * MIN) ?? list[0] ?? null
    let latest: WorkoutDetail | null = null
    if (l) {
      const a = new Date(l.start), b = new Date(l.end)
      const inside = async (kind: HealthRecordKind) => { const r = await attempt(true, records(kind, a, b)); return r.state === 'ok' ? r.value.length : null }
      const [h, dist, st] = await Promise.all([inside('heartRate'), inside('distance'), inside('steps')])
      latest = {
        type: l.type, start: l.start, minutes: Math.max(1, Math.round((b.getTime() - a.getTime()) / MIN)), source: l.source,
        ownDistance: l.distanceM != null && l.distanceM > 0, ownCalories: l.kcal != null && l.kcal > 0,
        inside: { heartRate: h, distance: dist, steps: st },
      }
    }
    workoutsRead = { state: 'ok', value: { count: list.length, kinds: count(w => w.type), sources: count(w => w.source ?? 'unnamed app'), latest } }
  }
  const slept = await attempt(switches.sleep, adapter.sleepSessions ? () => adapter.sleepSessions!(new Date(now.getTime() - 17 * 24 * 60 * MIN), now) : null)
  const sleepRead: Diagnostics['sleep'] = slept.state !== 'ok' ? slept : {
    state: 'ok',
    value: {
      sessions: slept.value.length,
      withStages: slept.value.filter(s => (s.stages ?? []).length > 0).length,
      stageNames: [...new Set(slept.value.flatMap(s => (s.stages ?? []).map(st => st.stage)))].sort(),
      newestEnd: slept.value.length ? slept.value.map(s => s.end).sort().slice(-1)[0] : null,
      nights: nights.nightsFromSessions(slept.value).size,
    },
  }
  return {
    madeAt: now, platform: adapter.platform, storeName: healthStoreName(adapter.platform), store, switches, stepsTotal,
    records: { steps: stepRecs, distance: distRecs, calories: kcalRecs, heartRate: heartRecs, restingHeartRate: restingRecs },
    workouts: workoutsRead, sleep: sleepRead,
  }
}
