// ---------------------------------------------------------------------------
// SLEEP, AS THE APP READS IT (his pick 26 Nov 2026, "A": read sleep, show it on Home against his usual, tell the
// coach; after two or more short nights the coach OFFERS a lighter session, main lift kept, extras trimmed; never
// changes the plan unasked, and no score). docs/plans/watch-data.md, step 2. Pure rules, no imports, so every gate
// can run them; health-sleep.ts reads the phone and hands the sessions in.
//
// WHAT A NIGHT IS. A watch writes sleep as sessions, usually with stages (light, deep, REM, awake). Time ASLEEP is the
// stages that are sleep; awake time and time merely in bed are not counted. A session with no stages at all counts
// whole (the watch said "asleep from here to here" and nothing finer). Stretches less than 90 minutes apart are one
// sleep (waking in the night does not make two nights). Each sleep belongs to the day it ENDED into, and that day's
// night is its LONGEST sleep: a nap is never added to the night and never stands in for it. Under two hours asleep is
// not a night at all: it is a watch put on at five in the morning, or a nap on a day the watch was off overnight, and
// calling that a short night would be the app inventing a bad night.
//
// HIS USUAL is the median of the nights from 3 to 16 nights back, at least five of them: the two nights being judged
// are never part of their own baseline, and one terrible night cannot move a median.
//
// A SHORT NIGHT (CSCS, mine; basis in BACKLOG, 26 Nov 2026) is an hour or more under his usual AND under seven hours.
// Both halves matter: someone who usually sleeps nine hours and got eight has not slept badly, and an hour is outside
// ordinary night-to-night wobble. One short night is said and nothing more: a single bad night costs a few percent of
// strength at most and is no reason to change a session. TWO IN A ROW is where the evidence says multi-joint lifting
// and how hard work feels start to suffer, so that is where the coach offers the shortest version of today's session
// (the main lift at its weight, the extras trimmed). It is an OFFER, never an automatic change, and the words name no
// cause and give no advice about sleep itself: persistent poor sleep is a GP's, not a trainer's.
// ---------------------------------------------------------------------------

export type SleepStage = 'asleep' | 'light' | 'deep' | 'rem' | 'awake' | 'inBed'
export interface SleepSession { start: string; end: string; stages?: { start: string; end: string; stage: string }[] | null }

const ASLEEP: ReadonlySet<string> = new Set(['asleep', 'light', 'deep', 'rem'])
const BRIDGE_MS = 90 * 60000
export const MIN_NIGHT_MINUTES = 120
export const SHORT_BY_MINUTES = 60
export const SHORT_UNDER_MINUTES = 420
const USUAL_FROM = 3
const USUAL_TO = 16
const USUAL_MIN_NIGHTS = 5
/** A sleep that ends before 6 pm belongs to that day; one that ends later is the start of the next day's night. */
const DAY_TURNS_AT_HOUR = 18

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** A date string moved by whole days, as a LOCAL calendar date (never an instant: clock changes do not move it). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + days, 12))
}

/** Minutes asleep on each night, keyed by the date he woke into. */
export function nightsFromSessions(sessions: readonly SleepSession[]): Map<string, number> {
  const spans: { a: number; b: number }[] = []
  for (const s of sessions) {
    const staged = (s.stages ?? []).filter(st => Number.isFinite(Date.parse(st.start)) && Number.isFinite(Date.parse(st.end)))
    const parts = staged.length > 0 ? staged.filter(st => ASLEEP.has(st.stage)) : [{ start: s.start, end: s.end }]
    for (const p of parts) {
      const a = Date.parse(p.start), b = Date.parse(p.end)
      // Longer than a day is a fault in the record, not a sleep.
      if (Number.isFinite(a) && Number.isFinite(b) && b > a && b - a <= 24 * 3600000) spans.push({ a, b })
    }
  }
  spans.sort((x, y) => x.a - y.a)
  // One sleep = stretches less than 90 minutes apart. Its minutes are the stretches themselves, never the gaps, and
  // two watches writing the same night are not counted twice (an overlap is counted once).
  const sleeps: { end: number; ms: number }[] = []
  let cur: { end: number; ms: number } | null = null
  for (const sp of spans) {
    if (cur && sp.a - cur.end <= BRIDGE_MS) {
      if (sp.b > cur.end) { cur.ms += sp.b - Math.max(sp.a, cur.end); cur.end = sp.b }
    } else {
      cur = { end: sp.b, ms: sp.b - sp.a }
      sleeps.push(cur)
    }
  }
  const nights = new Map<string, number>()
  for (const s of sleeps) {
    const minutes = Math.round(s.ms / 60000)
    if (minutes < MIN_NIGHT_MINUTES) continue
    const end = new Date(s.end)
    const date = end.getHours() >= DAY_TURNS_AT_HOUR ? shiftDate(localDate(end), 1) : localDate(end)
    if (minutes > (nights.get(date) ?? 0)) nights.set(date, minutes)
  }
  return nights
}

/** "6 h 10", "7 h", "45 min": time asleep as the app says it. */
export function hoursMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60), r = m % 60
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${pad(r)}`
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export interface SleepFlag {
  /** How many nights in a row, last night included. */
  nights: number
  /** The first of them, so one run is raised once. */
  since: string
  line: string
}
export interface SleepPicture {
  /** Minutes asleep last night (the night he woke from today), or null when the watch has none yet. */
  lastNight: number | null
  usual: number | null
  /** Last night against his usual, in minutes (negative is under). Null without both. */
  against: number | null
  /** The last seven nights, oldest first, today's last; null where the watch holds none. */
  week: { date: string; minutes: number | null }[]
  short: boolean
  flag: SleepFlag | null
  /** One line for Home, or null with nothing to say. */
  line: string | null
}

/** His usual: the median of nights 3 to 16 back from `today`, or null with fewer than five. */
export function usualSleep(nights: ReadonlyMap<string, number>, today: string): number | null {
  const xs: number[] = []
  for (let back = USUAL_FROM - 1; back < USUAL_TO; back++) {
    const v = nights.get(shiftDate(today, -back))
    if (v != null) xs.push(v)
  }
  return xs.length >= USUAL_MIN_NIGHTS ? Math.round(median(xs)) : null
}

/** An hour or more under his usual and under seven hours. Never without a usual to measure against. */
export function isShortNight(minutes: number | null | undefined, usual: number | null): boolean {
  return minutes != null && usual != null && minutes <= usual - SHORT_BY_MINUTES && minutes < SHORT_UNDER_MINUTES
}

export function sleepPicture(nights: ReadonlyMap<string, number>, today: string): SleepPicture {
  const lastNight = nights.get(today) ?? null
  const usual = usualSleep(nights, today)
  const against = lastNight != null && usual != null ? lastNight - usual : null
  const week = Array.from({ length: 7 }, (_, i) => { const date = shiftDate(today, i - 6); return { date, minutes: nights.get(date) ?? null } })
  const short = isShortNight(lastNight, usual)
  // The run of short nights ending last night. A night the watch did not measure ends the run: it is not known short.
  let run = 0
  while (run < 14 && isShortNight(nights.get(shiftDate(today, -run)), usual)) run++
  let flag: SleepFlag | null = null
  if (run >= 2 && usual != null) {
    const mean = Math.round(Array.from({ length: run }, (_, i) => nights.get(shiftDate(today, -i))!).reduce((a, b) => a + b, 0) / run)
    flag = {
      nights: run, since: shiftDate(today, -(run - 1)),
      line: `You've slept about ${hoursMinutes(mean)} a night for the last ${run} nights, against your usual ${hoursMinutes(usual)}.`,
    }
  }
  const line = lastNight == null ? null
    : against == null ? `${hoursMinutes(lastNight)} asleep last night`
    : Math.abs(against) < 20 ? `${hoursMinutes(lastNight)} asleep last night, about your usual`
    : `${hoursMinutes(lastNight)} asleep last night, ${hoursMinutes(Math.abs(against))} ${against < 0 ? 'under' : 'over'} your usual`
  return { lastNight, usual, against, week, short, flag, line }
}

/**
 * THE COACH IS TOLD: facts only, and empty when there is nothing, so someone with no watch costs the coach no words.
 * The rule it may not cross sits beside them in the coach's own instructions.
 */
export function sleepContextForCoach(p: SleepPicture): string {
  if (p.lastNight == null && p.usual == null) return ''
  const lines: string[] = []
  if (p.lastNight != null) lines.push(`Last night: ${hoursMinutes(p.lastNight)} asleep.`)
  else lines.push('Last night: nothing from the watch yet.')
  if (p.usual != null) lines.push(`Usual: ${hoursMinutes(p.usual)} (the middle of the last fortnight's nights).`)
  const earlier = p.week.slice(0, -1).filter(n => n.minutes != null).map(n => `${n.date} ${hoursMinutes(n.minutes!)}`)
  if (earlier.length) lines.push(`Earlier this week: ${earlier.join(', ')}.`)
  if (p.flag) lines.push(`${p.flag.nights} short nights in a row.`)
  else if (p.short) lines.push('One short night (a single one is no reason to change a session).')
  return lines.join('\n')
}
