// ---------------------------------------------------------------------------
// WHAT THE HEART RATE SAYS ABOUT HIS TRAINING (his "Build 1, 2 and 3 now", 25 Nov 2026). Pure rules, no imports, so
// every gate can run them; health-heart.ts reads the rows and hands them in.
//
// 1. FITNESS: the same steady cardio session at a lower heart rate over the weeks is aerobic fitness improving, the
//    plainest proof there is. Compared like for like only: one activity, steady efforts (Easy or Steady, RPE 6 or
//    under; an interval session's average says nothing about fitness), durations within a quarter of each other, at
//    least four sessions over at least three weeks. The first two against the last two, so one hot day cannot make the
//    line. Shown only when it FELL by 3 or more: a rise has too many causes (heat, poor sleep, a cold, a hard week) to
//    say anything true about fitness, so the app says nothing rather than something it cannot stand behind.
// 2. RECOVERY: a resting heart rate 5 or more above his usual on each of the last three mornings is a common sign of
//    carrying fatigue. "Usual" is the median of the 4 to 17 days before (at least five readings), so the three days
//    being judged are never part of their own baseline. It is an OFFER of a lighter day through the coach, never an
//    automatic change, and the words name no cause: it is not a diagnosis.
//
// CSCS, mine (basis in BACKLOG, 25 Nov 2026). Neither is a target: effort stays in words (his 14 Nov 2026 ruling).
// ---------------------------------------------------------------------------

export interface CardioHeartRow {
  date: string
  activity_name: string
  duration_minutes: number
  intensity_rpe: number | null
  avg_heart_rate?: number | null
}

export interface FitnessTrend {
  activity: string
  from: number
  to: number
  weeks: number
  sessions: number
  line: string
}

const STEADY_RPE_MAX = 6
const MIN_SESSIONS = 4
const MIN_DAYS = 21
const DURATION_BAND = 0.25
const MIN_FALL = 3

const dayNum = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86400000)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** One line per activity whose steady sessions now run at a clearly lower heart rate, best first. */
export function fitnessTrends(rows: CardioHeartRow[]): FitnessTrend[] {
  const groups = new Map<string, CardioHeartRow[]>()
  for (const r of rows) {
    if (!(Number(r.avg_heart_rate) > 0) || !(r.duration_minutes > 0)) continue
    if (r.intensity_rpe == null || r.intensity_rpe > STEADY_RPE_MAX) continue
    const k = keyOf(r.activity_name)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const out: FitnessTrend[] = []
  for (const list of groups.values()) {
    // Like for like: sessions near the group's usual length only.
    const usual = median(list.map(r => r.duration_minutes))
    const alike = list.filter(r => Math.abs(r.duration_minutes - usual) <= usual * DURATION_BAND).sort((a, b) => dayNum(a.date) - dayNum(b.date))
    if (alike.length < MIN_SESSIONS) continue
    const span = dayNum(alike[alike.length - 1].date) - dayNum(alike[0].date)
    if (span < MIN_DAYS) continue
    const from = Math.round(mean(alike.slice(0, 2).map(r => Number(r.avg_heart_rate))))
    const to = Math.round(mean(alike.slice(-2).map(r => Number(r.avg_heart_rate))))
    if (from - to < MIN_FALL) continue
    const weeks = Math.max(3, Math.round(span / 7))
    const activity = alike[alike.length - 1].activity_name.trim()
    out.push({ activity, from, to, weeks, sessions: alike.length, line: `${activity}: average heart rate ${from} → ${to} over ${weeks} weeks` })
  }
  return out.sort((a, b) => (b.from - b.to) - (a.from - a.to))
}

export interface RecoveryFlag {
  usual: number
  above: number
  /** The first of the raised mornings, so one run of them is raised once. */
  since: string
  line: string
}

const RAISED_BY = 5
const RAISED_DAYS = 3
const BASELINE_FROM = 4
const BASELINE_TO = 17
const BASELINE_MIN = 5

/** Raised resting heart rate on each of the last three mornings (today included), or null. */
export function recoveryFlag(rows: { date: string; bpm: number }[], today: string): RecoveryFlag | null {
  const t = dayNum(today)
  const byAgo = new Map<number, number>()
  for (const r of rows) byAgo.set(t - dayNum(r.date), r.bpm)
  const baseline: number[] = []
  for (let a = BASELINE_FROM; a <= BASELINE_TO; a++) if (byAgo.has(a)) baseline.push(byAgo.get(a)!)
  if (baseline.length < BASELINE_MIN) return null
  const usual = Math.round(median(baseline))
  const recent: number[] = []
  for (let a = 0; a < RAISED_DAYS; a++) {
    const v = byAgo.get(a)
    if (v == null || v < usual + RAISED_BY) return null
    recent.push(v)
  }
  const above = Math.round(mean(recent)) - usual
  // From the date string as a LOCAL calendar date (session-move's addDays, inlined: this file has no imports), never back
  // from the rounded day number (which sits half a day off and named the next day).
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() - (RAISED_DAYS - 1))
  const since = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { usual, above, since, line: `Your resting heart rate has been about ${above} above your usual (${usual}) for ${RAISED_DAYS} mornings.` }
}

// ---------------------------------------------------------------------------
// 3. AN EASY SESSION THAT RAN HARD (his pick 26 Nov 2026, "A": the coach mentions it and offers; nothing changes
//    without a yes). The plan asked for Easy and the heart rate says otherwise: its AVERAGE over the session sat in
//    zone 4 or 5 (80% or more of his estimated maximum). The one gap the app speaks about, because it is the commonest
//    real fault and the one with a clear cost: an easy day run hard stops being recovery or base work and borrows from
//    the hard days. A hard session that ran easy is not raised (intervals rest between efforts, so their average says
//    little), nor is a Steady one. By the average, which every logged session keeps whatever recorded it, so a strap,
//    a watch that synced late and a phone restart all reach the same answer. Looked for on today and yesterday only:
//    older than that it is not news. CSCS, mine; the maximum is an estimate (heart-series.ts), so the words say what
//    was seen and ask, and never tell him he got it wrong. Not for anyone with a health condition or pregnancy
//    ticked, and not without an age: the caller passes no maximum for them.
// ---------------------------------------------------------------------------
export interface EffortGap {
  /** One per session, so it is raised once. */
  key: string
  line: string
}
const EASY_RPE_MAX = 4
const HARD_FROM_SHARE = 0.8
const MIN_MINUTES = 10

export function easyRanHard(p: {
  /** Logged cardio with a heart figure, any order. */
  logs: { date: string; activity_name: string; duration_minutes: number; avg_heart_rate?: number | null; max_heart_rate?: number | null }[]
  /** The plan's session on a date: its activity name and target effort, or null. */
  plannedOn: (date: string) => { activity: string; targetRpe?: number | null } | null
  /** His estimated maximum heart rate, or null when heart rate is not to be judged for him. */
  estimatedMax: number | null
  today: string
}): EffortGap | null {
  if (p.estimatedMax == null) return null
  const t = dayNum(p.today)
  const recent = p.logs
    .filter(l => { const ago = t - dayNum(l.date); return ago === 0 || ago === 1 })
    .sort((a, b) => b.date.localeCompare(a.date))
  for (const l of recent) {
    const avg = Number(l.avg_heart_rate)
    if (!(avg > 0) || !(l.duration_minutes >= MIN_MINUTES)) continue
    const plan = p.plannedOn(l.date)
    if (!plan || plan.targetRpe == null || plan.targetRpe > EASY_RPE_MAX) continue
    if (keyOf(plan.activity) !== keyOf(l.activity_name)) continue
    const max = Math.max(p.estimatedMax, Number(l.max_heart_rate) || 0)
    const share = avg / max
    if (share < HARD_FROM_SHARE) continue
    const zone = share >= 0.9 ? 5 : 4
    const name = l.activity_name.split(/\s+[—–-]\s+/)[0].trim()
    const when = l.date === p.today ? "Today's" : "Yesterday's"
    return {
      key: `effort-gap:${l.date}:${keyOf(l.activity_name)}`,
      line: `${when} ${name} was planned easy, and your heart rate averaged ${Math.round(avg)}, which is zone ${zone} for you.`,
    }
  }
  return null
}
