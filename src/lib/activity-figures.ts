// ---------------------------------------------------------------------------
// WHAT A RECORDED WALK OR RUN SHOWS (his request 25 Nov 2026: "start workout and recording and end the workout and
// recording and the app then logs. 5k steps logged 300kcal burned ... taking the kcal from the device"; his ruling the
// same day, "A, build it": with a strap and no watch, calories are an ESTIMATE from heart rate, marked as one).
//
// Pure and import-free, so the cardio row can print the line without pulling the recorder into its download.
//
// WHICH CALORIES (mine, measurement): the device's own figure wins, whenever there is one. The estimate is used only
// when no device gave a figure and a heart rate was recorded, and it is always printed with "≈" and "estimate", so it
// can never pass for a measured number.
//
// THE ESTIMATE (mine, the published method): Keytel et al. 2005, J Sports Sci 23(3), energy expenditure from heart
// rate, weight, age and sex, in kJ a minute, divided by 4.184 for kcal. It measures TOTAL energy, and a watch's figure
// is ACTIVE calories, so the resting share (about 1 kcal per kg an hour) is taken off to make the two comparable. It is
// only valid with the heart clearly working, so an average under 90 gives no estimate rather than a silly one. With
// no sex on the profile the two equations are averaged. A typical error is 15-20%, which is why it says "estimate".
//
// CALORIES BURNED NEVER CHANGE THE FOOD TARGET (CSCS, mine): the target already counts how active he is, and watch
// figures run high, so adding them would count the same exercise twice. They are shown, and that is all.
// ---------------------------------------------------------------------------

export interface HeartFigure { avg: number; max: number }

export interface BodyForEstimate { weightKg?: number | null; age?: number | null; gender?: 'male' | 'female' | null }

/** Most steps, kcal and metres one recording may carry: past these the number is a fault, never a walk. */
const MAX_RECORDED_STEPS = 200_000
const MAX_RECORDED_KCAL = 10_000
const MIN_HR_FOR_ESTIMATE = 90

/** Active kcal from heart rate (Keytel 2005, resting share removed), or null when it cannot be worked out honestly. */
export function estimateActiveKcal(heart: HeartFigure | null | undefined, minutes: number, body: BodyForEstimate): number | null {
  if (!heart || !(heart.avg >= MIN_HR_FOR_ESTIMATE) || !(minutes > 0)) return null
  const w = Number(body.weightKg), a = Number(body.age)
  if (!(w >= 30 && w <= 300) || !(a >= 13 && a <= 100)) return null
  const hr = heart.avg
  const male = (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * a) / 4.184
  const female = (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * a) / 4.184
  const perMinute = body.gender === 'male' ? male : body.gender === 'female' ? female : (male + female) / 2
  const resting = w / 60
  const kcal = Math.round((perMinute - resting) * minutes)
  return kcal > 0 && kcal <= MAX_RECORDED_KCAL ? kcal : null
}

export interface RecordingReadings {
  start: Date
  end: Date
  /** What the phone's health store said for the window; null where it said nothing or could not be asked. */
  steps?: number | null
  distanceM?: number | null
  deviceKcal?: number | null
  heart?: HeartFigure | null
}

export interface RecordingFigures {
  minutes: number
  steps: number | null
  distanceKm: number | null
  kcal: number | null
  kcalEstimated: boolean
  avgHeartRate: number | null
  maxHeartRate: number | null
}

/** The figures a recording keeps. A zero is "nothing recorded", never a claim of no steps. */
export function recordingFigures(r: RecordingReadings, body: BodyForEstimate): RecordingFigures {
  const minutes = Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 60000))
  const steps = r.steps != null && Number.isFinite(r.steps) && r.steps >= 1 && r.steps <= MAX_RECORDED_STEPS ? Math.round(r.steps) : null
  const km = r.distanceM != null && Number.isFinite(r.distanceM) && r.distanceM >= 10 ? Math.round(r.distanceM / 10) / 100 : null
  const distanceKm = km != null && km <= 500 ? km : null
  const device = r.deviceKcal != null && Number.isFinite(r.deviceKcal) && r.deviceKcal >= 1 && r.deviceKcal <= MAX_RECORDED_KCAL ? Math.round(r.deviceKcal) : null
  const estimate = estimateActiveKcal(r.heart, minutes, body)
  return {
    minutes,
    steps,
    distanceKm,
    kcal: device ?? estimate,
    // The device's figure wins whenever there is one: an estimate fills in only where the device said nothing.
    kcalEstimated: device == null && estimate != null,
    avgHeartRate: r.heart?.avg ?? null,
    maxHeartRate: r.heart?.max ?? null,
  }
}

/** "5,012 steps · 300 kcal", "≈ 280 kcal (estimate)", or null when the log carries neither. */
export function activityFiguresLine(log: { steps?: number | null; active_kcal?: number | null; kcal_estimated?: boolean | null }): string | null {
  const parts: string[] = []
  if (log.steps != null && log.steps > 0) parts.push(`${log.steps.toLocaleString('en-GB')} steps`)
  if (log.active_kcal != null && log.active_kcal > 0) parts.push(log.kcal_estimated ? `≈ ${log.active_kcal} kcal (estimate)` : `${log.active_kcal} kcal`)
  return parts.length ? parts.join(' · ') : null
}

/** "12:04" or "1:02:09", for the running clock. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
