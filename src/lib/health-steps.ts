// ---------------------------------------------------------------------------
// STEPS FROM THE PHONE (his request 20 Nov 2026, "Start on the App Store version with step counting").
//
// In the phone app (the Capacitor shell), today's steps are read from Apple Health on an iPhone and from Health
// Connect on Android, and saved into the same daily_steps row Home's ring already reads (its `source` column was
// built for exactly this in August: 'healthkit' / 'health_connect'). In a browser none of this exists and nothing
// here runs: the typed steps box is untouched.
//
// READ ONLY, STEPS ONLY. The app asks for one thing, steps, and writes nothing to Health. Asking for less is what
// Apple and Google review hardest, and it is all this feature needs.
//
// WHICH NUMBER WINS (mine, 20 Nov 2026): Health's count replaces an earlier Health count for the day, and NEVER
// lowers a number he typed himself. A phone left on the bench undercounts; a typed number is his statement about
// his day, so it stands until the phone's count passes it. The day's ring then shows the larger.
//
// THE PLUGIN IS LOADED ONLY INSIDE THE PHONE APP, by a dynamic import, so the website's download does not grow and
// the plugin's own web stub (which throws) is never reached. Tests and the browser harness hand in a fake adapter.
// ---------------------------------------------------------------------------

import { getStepsForDate, isPlausibleStepCount, isHealthStepsConnected, isPhoneApp, HEALTH_STEPS_CONNECTED_KEY, type DailyStepsRow } from './steps-store'
export { isHealthStepsConnected, stepsSourceLine } from './steps-store'
import { supabase } from './supabase'

export type HealthPlatform = 'ios' | 'android'

/** The four things this feature asks of the phone's health store. */
export interface HealthAdapter {
  platform: HealthPlatform
  isAvailable(): Promise<{ available: boolean; reason?: string }>
  /** Shows the phone's own permission sheet. Resolves whether steps can be read afterwards, as far as the phone says. */
  requestStepsAccess(): Promise<boolean>
  /** Total steps between two instants, summed by the phone (it removes the double count of phone + watch). */
  stepsBetween(start: Date, end: Date): Promise<number>
  /** HEART RATE (health-heart.ts, his 24 Nov 2026 "1 + 2"): the phone's sheet for heart rate and resting heart rate. */
  requestHeartAccess?(): Promise<boolean>
  /** Heart rate readings (beats a minute) between two instants, as the watch or strap wrote them. */
  heartRateSamples?(start: Date, end: Date): Promise<{ bpm: number; at: string }[]>
  /** Resting heart rate, one or more a day, between two instants. */
  restingHeartRateSamples?(start: Date, end: Date): Promise<{ bpm: number; at: string }[]>
  /** A RECORDED WALK OR RUN (activity-recording.ts, his 25 Nov 2026 "A, build it"): the phone's sheet for steps,
   *  distance, calories burned and heart rate, asked on the first Start. */
  requestActivityAccess?(): Promise<boolean>
  /** Metres between two instants, summed by the phone. */
  distanceMetersBetween?(start: Date, end: Date): Promise<number>
  /** Active calories burned between two instants (the watch's or phone's own figure), summed by the phone. */
  activeKcalBetween?(start: Date, end: Date): Promise<number>
  /** WORKOUTS THE WATCH RECORDED (watch-workouts.ts, 26 Nov 2026): the phone's sheet for workouts, and with them the
   *  distance, calories and heart rate that fill one in. */
  requestWorkoutAccess?(): Promise<boolean>
  /** Workouts recorded by a watch or another app between two instants, as the phone's health store holds them. */
  workoutsBetween?(start: Date, end: Date): Promise<WatchWorkout[]>
  /** SLEEP (sleep-nights.ts, his pick "A", 26 Nov 2026): the phone's sheet for sleep, read only, asked on his tap. */
  requestSleepAccess?(): Promise<boolean>
  /** Sleep sessions between two instants, each with its stages where the watch wrote them. */
  sleepSessions?(start: Date, end: Date): Promise<{ start: string; end: string; stages?: { start: string; end: string; stage: string }[] | null }[]>
  /** THE WATCH REPORT ONLY (health-diagnostics.ts, 27 Nov 2026): the individual records behind a figure, as WHEN and
   *  FROM WHAT, never the figure itself (no value leaves this function), so the report can say how finely a watch
   *  shares something. It reads; it never shows a permission sheet. */
  recordsBetween?(kind: HealthRecordKind, start: Date, end: Date): Promise<HealthRecord[]>
}

export type HealthRecordKind = 'steps' | 'distance' | 'calories' | 'heartRate' | 'restingHeartRate'
/** One record's when and where-from. No reading. */
export interface HealthRecord { start: string; end: string; source: string | null; device: string | null }

/** One workout as the phone's health store holds it. `type` is the store's own word ('running', 'strengthTraining'). */
export interface WatchWorkout {
  id: string
  type: string
  start: string
  end: string
  /** The recorder's own calories and distance, when it wrote them. */
  kcal: number | null
  distanceM: number | null
  /** The app that recorded it ('Samsung Health'), when the store says. */
  source: string | null
}

/** Tests and the browser test pages hand in a pretend health store on this global; `null` means "no phone app". */
function testAdapter(): HealthAdapter | null | undefined {
  return (globalThis as { __healthAdapterForTest?: HealthAdapter | null }).__healthAdapterForTest
}

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string }

let realAdapter: Promise<HealthAdapter | null> | null = null

/** The phone's health store, or null in a browser. */
export function healthAdapter(): Promise<HealthAdapter | null> {
  const fake = testAdapter()
  if (fake !== undefined) return Promise.resolve(fake)
  if (!isPhoneApp()) return Promise.resolve(null)
  if (!realAdapter) {
    realAdapter = (async (): Promise<HealthAdapter | null> => {
      try {
        const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
        const platform = cap?.getPlatform?.() === 'android' ? 'android' : 'ios'
        const { Health } = await import('@capgo/capacitor-health')
        return {
          platform,
          isAvailable: () => Health.isAvailable(),
          requestStepsAccess: async () => {
            const status = await Health.requestAuthorization({ read: ['steps'] })
            return status.readAuthorized.includes('steps')
          },
          stepsBetween: async (start, end) => {
            const res = await Health.queryAggregated({
              dataType: 'steps', startDate: start.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: 'sum',
            })
            return res.samples.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0)
          },
          requestHeartAccess: async () => {
            const status = await Health.requestAuthorization({ read: ['heartRate', 'restingHeartRate'] })
            return status.readAuthorized.includes('heartRate')
          },
          heartRateSamples: async (start, end) => {
            const res = await Health.readSamples({ dataType: 'heartRate', startDate: start.toISOString(), endDate: end.toISOString(), limit: 5000, ascending: true })
            return res.samples.map(s => ({ bpm: s.value, at: s.startDate }))
          },
          requestActivityAccess: async () => {
            const status = await Health.requestAuthorization({ read: ['steps', 'distance', 'calories', 'heartRate'] })
            return status.readAuthorized.includes('steps')
          },
          distanceMetersBetween: async (start, end) => {
            const res = await Health.queryAggregated({ dataType: 'distance', startDate: start.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: 'sum' })
            return res.samples.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0)
          },
          activeKcalBetween: async (start, end) => {
            const res = await Health.queryAggregated({ dataType: 'calories', startDate: start.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: 'sum' })
            return res.samples.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0)
          },
          restingHeartRateSamples: async (start, end) => {
            const res = await Health.readSamples({ dataType: 'restingHeartRate', startDate: start.toISOString(), endDate: end.toISOString(), limit: 200, ascending: true })
            return res.samples.map(s => ({ bpm: s.value, at: s.startDate }))
          },
          requestWorkoutAccess: async () => {
            const status = await Health.requestAuthorization({ read: ['workouts', 'distance', 'calories', 'heartRate', 'steps'] })
            return status.readAuthorized.includes('workouts')
          },
          workoutsBetween: async (start, end) => {
            const res = await Health.queryWorkouts({ startDate: start.toISOString(), endDate: end.toISOString(), limit: 50, ascending: false })
            return res.workouts.map(w => ({
              // The store's own id; where it gives none, the start and type name the workout just as well.
              id: w.platformId ?? `${w.workoutType}@${w.startDate}`,
              type: String(w.workoutType),
              start: w.startDate,
              end: w.endDate,
              kcal: typeof w.totalEnergyBurned === 'number' && Number.isFinite(w.totalEnergyBurned) ? w.totalEnergyBurned : null,
              distanceM: typeof w.totalDistance === 'number' && Number.isFinite(w.totalDistance) ? w.totalDistance : null,
              source: w.sourceName ?? null,
            }))
          },
          recordsBetween: async (kind, start, end) => {
            const res = await Health.readSamples({ dataType: kind, startDate: start.toISOString(), endDate: end.toISOString(), limit: 5000, ascending: true })
            return res.samples.map(x => ({ start: x.startDate, end: x.endDate, source: x.sourceName ?? null, device: x.deviceType ?? null }))
          },
          requestSleepAccess: async () => {
            const status = await Health.requestAuthorization({ read: ['sleep'] })
            return status.readAuthorized.includes('sleep')
          },
          // Android gives a session with its stages inside; Apple gives one sample per stage (its own state on it).
          // Both become sessions with stages, so one rule reads them (sleep-nights.ts).
          sleepSessions: async (start, end) => {
            const res = await Health.readSamples({ dataType: 'sleep', startDate: start.toISOString(), endDate: end.toISOString(), limit: 2000, ascending: true })
            return res.samples.map(x => ({
              start: x.startDate, end: x.endDate,
              stages: x.stages && x.stages.length > 0 ? x.stages.map(st => ({ start: st.startDate, end: st.endDate, stage: st.stage }))
                : x.sleepState ? [{ start: x.startDate, end: x.endDate, stage: x.sleepState }] : null,
            }))
          },
        }
      } catch {
        return null
      }
    })()
  }
  return realAdapter
}

/** What the store is called on this phone, for every sentence that names it. */
export function healthStoreName(platform: HealthPlatform): string {
  return platform === 'ios' ? 'Apple Health' : 'Health Connect'
}

function sourceFor(platform: HealthPlatform): DailyStepsRow['source'] {
  return platform === 'ios' ? 'healthkit' : 'health_connect'
}

// ---------------------------------------------------------------------------
// Whether he switched it on. Kept on the phone: it is a fact about this phone's permission, not about him, and a
// second phone asks again (as the phone's own permission sheet would).
// ---------------------------------------------------------------------------
function setConnected(on: boolean): void {
  try { if (on) localStorage.setItem(HEALTH_STEPS_CONNECTED_KEY, '1'); else localStorage.removeItem(HEALTH_STEPS_CONNECTED_KEY) } catch { /* asked again next open */ }
}

/** Local midnight to now, for the date string given (YYYY-MM-DD, his calendar day). */
export function dayBounds(date: string, now: Date): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const endOfDay = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
  return { start, end: now < endOfDay ? now : endOfDay }
}

/**
 * The count to keep for the day, given what is stored and what the phone says. Pure, so the rule can be checked.
 * `null` means "leave the stored row as it is".
 */
export function stepsToKeep(stored: Pick<DailyStepsRow, 'steps' | 'source'> | null, fromPhone: number): number | null {
  const phone = Math.round(fromPhone)
  if (!isPlausibleStepCount(phone)) return null
  if (!stored) return phone > 0 ? phone : null
  if (stored.source === 'manual') return phone > stored.steps ? phone : null
  return phone !== stored.steps ? phone : null
}

export type ConnectResult =
  | { ok: true; store: string }
  | { ok: false; reason: 'not-phone-app' | 'unavailable' | 'denied' | 'error'; store?: string; detail?: string }

/** The Profile switch: shows the phone's permission sheet and remembers the answer. */
export async function connectHealthSteps(): Promise<ConnectResult> {
  const adapter = await healthAdapter()
  if (!adapter) return { ok: false, reason: 'not-phone-app' }
  const store = healthStoreName(adapter.platform)
  try {
    const avail = await adapter.isAvailable()
    if (!avail.available) return { ok: false, reason: 'unavailable', store, detail: avail.reason }
    const granted = await adapter.requestStepsAccess()
    // APPLE NEVER SAYS "DENIED" FOR A READ (its privacy rule): a refused read looks like a day of no steps. So on an
    // iPhone a completed sheet counts as connected, and Home says where to look when the count stays at 0.
    if (!granted && adapter.platform === 'android') return { ok: false, reason: 'denied', store }
    setConnected(true)
    return { ok: true, store }
  } catch (err) {
    return { ok: false, reason: 'error', store, detail: err instanceof Error ? err.message : String(err) }
  }
}

export function disconnectHealthSteps(): void {
  setConnected(false)
}

export type SyncResult =
  | { status: 'off' }
  | { status: 'unchanged'; row: DailyStepsRow | null; fromPhone: number }
  | { status: 'saved'; row: DailyStepsRow; fromPhone: number }
  | { status: 'failed'; detail: string }

/**
 * Read today's steps from the phone and save them, by the rule in `stepsToKeep`. Called when Home opens and when
 * the app comes back to the front. Never throws: a failed read leaves the ring as it was.
 */
export async function syncStepsFromHealth(profileId: string, date: string, now: Date = new Date()): Promise<SyncResult> {
  if (!isHealthStepsConnected()) return { status: 'off' }
  const adapter = await healthAdapter()
  if (!adapter) return { status: 'off' }
  try {
    const { start, end } = dayBounds(date, now)
    const fromPhone = await adapter.stepsBetween(start, end)
    const stored = await getStepsForDate(profileId, date)
    const keep = stepsToKeep(stored, fromPhone)
    if (keep == null) return { status: 'unchanged', row: stored, fromPhone }
    const { data, error } = await supabase
      .from('daily_steps')
      .upsert({ profile_id: profileId, date, steps: keep, source: sourceFor(adapter.platform), client_id: null }, { onConflict: 'profile_id,date' })
      .select()
      .single()
    if (error) throw error
    return { status: 'saved', row: data as DailyStepsRow, fromPhone }
  } catch (err) {
    return { status: 'failed', detail: err instanceof Error ? err.message : String(err) }
  }
}
