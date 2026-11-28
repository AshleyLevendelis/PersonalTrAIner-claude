// A pretend phone health store for the browser test pages (20 Nov 2026, steps from the phone). Off unless the page
// address carries ?health=ios or ?health=android. Records what the app asked of it on window.__healthCalls, so a
// driver can check the app asked for steps only and nothing else.
//   &healthsteps=N      the day's count the phone reports (default 6400)
//   &healthdenied=1     the permission sheet is refused
//   &healthmissing=1    the phone has no health store (Android without Health Connect)
import type { HealthAdapter } from '@/lib/health-steps'

const q = new URLSearchParams(location.search)
const platform = q.get('health')
if (platform === 'ios' || platform === 'android') {
  const calls: unknown[] = []
  ;(window as unknown as { __healthCalls: unknown[] }).__healthCalls = calls
  const w = window as unknown as { __healthSteps?: number }
  w.__healthSteps = Number(q.get('healthsteps') ?? '6400')
  const adapter: HealthAdapter = {
    platform,
    isAvailable: async () => { calls.push('isAvailable'); return q.get('healthmissing') === '1' ? { available: false, reason: 'not installed' } : { available: true } },
    requestStepsAccess: async () => { calls.push({ request: ['steps'] }); return q.get('healthdenied') !== '1' },
    stepsBetween: async (start, end) => { calls.push({ steps: [start.toISOString(), end.toISOString()] }); return w.__healthSteps ?? 0 },
    // HEART RATE (24 Nov 2026, health-heart.ts): a working session's readings across any window asked (about 150, peaking
    // at 172), and a resting figure each night for 14 nights: 58 this week, 60 the week before.
    requestHeartAccess: async () => { calls.push({ request: ['heartRate', 'restingHeartRate'] }); return q.get('healthdenied') !== '1' },
    heartRateSamples: async (start, end) => {
      calls.push({ heart: [start.toISOString(), end.toISOString()] })
      // &healthheart=none: a watch whose heart rate has not reached the phone yet (a Galaxy Watch, 27 Nov 2026).
      if (q.get('healthheart') === 'none') return []
      const out: { bpm: number; at: string }[] = []
      // THE SHAPE OF A REAL SESSION across whatever window is asked (26 Nov 2026, so the summary's graph has something
      // true to draw): a warm-up climbing from 108, a steady middle near 150, a push to 172 late on, then easing off.
      const span = Math.max(1, end.getTime() - start.getTime())
      const shape = (f: number) => f < 0.12 ? 108 + (f / 0.12) * 40
        : f < 0.7 ? 148 + 6 * Math.sin(f * 18)
        : f < 0.85 ? 150 + ((f - 0.7) / 0.15) * 22
        : f < 0.93 ? 172 - ((f - 0.85) / 0.08) * 4
        : 168 - ((f - 0.93) / 0.07) * 30
      for (let t = start.getTime(); t <= end.getTime(); t += 30000) out.push({ bpm: Math.round(shape((t - start.getTime()) / span)), at: new Date(t).toISOString() })
      return out
    },
    // A RECORDED WALK OR RUN (25 Nov 2026, activity-recording.ts): what the watch wrote for the window.
    //   &healthkcal=N   calories the watch reports (default 300); &healthkcal=0 a watch that has not synced yet
    requestActivityAccess: async () => { calls.push({ request: ['steps', 'distance', 'calories', 'heartRate'] }); return q.get('healthdenied') !== '1' },
    distanceMetersBetween: async (start, end) => { calls.push({ distance: [start.toISOString(), end.toISOString()] }); return Number(q.get('healthdistance') ?? '3840') },
    activeKcalBetween: async (start, end) => { calls.push({ kcal: [start.toISOString(), end.toISOString()] }); return Number(q.get('healthkcal') ?? '300') },
    restingHeartRateSamples: async (_start, end) => {
      calls.push('resting')
      // &healthnoresting=1: a watch that shares heart rate and no resting figure (Samsung Health, as reported).
      if (q.get('healthnoresting') === '1') return []
      return Array.from({ length: 14 }, (_, i) => {
        const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 4, 0, 0)
        return { bpm: i < 7 ? 58 : 60, at: d.toISOString() }
      })
    },
    // WORKOUTS THE WATCH RECORDED (26 Nov 2026, watch-workouts.ts). &healthworkouts= chooses what the watch holds:
    //   run (default)  a 42 minute run that ended 90 minutes ago (5.2 km, 410 kcal, "Samsung Health"), and a
    //                  3 minute walk half an hour ago that is too short to be a workout
    //   two            that run, and 55 minutes of strength training five hours ago with no calories or distance
    //   none           nothing
    requestWorkoutAccess: async () => { calls.push({ request: ['workouts', 'distance', 'calories', 'heartRate', 'steps'] }); return q.get('healthdenied') !== '1' },
    workoutsBetween: async (start, end) => {
      calls.push({ workouts: [start.toISOString(), end.toISOString()] })
      const kind = q.get('healthworkouts') ?? 'run'
      if (kind === 'none') return []
      const at = (minsAgo: number) => new Date(end.getTime() - minsAgo * 60000).toISOString()
      const run = { id: 'w-run', type: 'running', start: at(132), end: at(90), kcal: 410, distanceM: 5200, source: 'Samsung Health' }
      const blip = { id: 'w-blip', type: 'walking', start: at(33), end: at(30), kcal: 9, distanceM: 210, source: 'Samsung Health' }
      const lift = { id: 'w-lift', type: 'strengthTraining', start: at(355), end: at(300), kcal: null, distanceM: null, source: 'Samsung Health' }
      return kind === 'two' ? [run, blip, lift] : [run, blip]
    },
  }
  // SLEEP (26 Nov 2026, sleep-nights.ts). &healthsleep= chooses what the watch holds for the last 16 nights, each a
  // session from about 23:15 to the morning with stages (light, deep, REM and one 20 minute spell awake):
  //   usual (default)  about 7 h 25 asleep every night
  //   short1           the same, but last night 5 h 40
  //   short2           the same, but the last TWO nights 5 h 40 and 5 h 50
  //   gap              the same, but the watch was off last night
  //   none             nothing
  adapter.requestSleepAccess = async () => { calls.push({ request: ['sleep'] }); return q.get('healthdenied') !== '1' }
  adapter.sleepSessions = async (start, end) => {
    calls.push({ sleep: [start.toISOString(), end.toISOString()] })
    const kind = q.get('healthsleep') ?? 'usual'
    if (kind === 'none') return []
    const out: { start: string; end: string; stages: { start: string; end: string; stage: string }[] }[] = []
    for (let back = 0; back < 16; back++) {
      if (kind === 'gap' && back === 0) continue
      // Minutes asleep that night: a little wobble around 7 h 25, the short nights as asked.
      const asleep = (kind === 'short1' || kind === 'short2') && back === 0 ? 340 : kind === 'short2' && back === 1 ? 350 : 445 + ((back * 7) % 5) * 4 - 8
      const bed = new Date(end.getFullYear(), end.getMonth(), end.getDate() - back - 1, 23, 15, 0)
      const t = (mins: number) => new Date(bed.getTime() + mins * 60000).toISOString()
      // light, deep, light, awake 20, REM, light: the sleep stages add up to `asleep`.
      const cuts = [0, 90, 170, asleep - 150, asleep - 130, asleep - 50, asleep + 20]
      const names = ['light', 'deep', 'light', 'awake', 'rem', 'light']
      out.push({ start: t(0), end: t(asleep + 20), stages: names.map((stage, i) => ({ start: t(cuts[i]), end: t(cuts[i + 1]), stage })) })
    }
    return out.filter(s => Date.parse(s.end) <= end.getTime() && Date.parse(s.end) >= start.getTime())
  }
  // THE WATCH REPORT (27 Nov 2026, health-diagnostics.ts): the records behind each figure, as when and from what.
  // &healthrecords= chooses how finely the watch shares them:
  //   fine (default)  steps, distance and calories one record a minute from the watch (and steps every five minutes
  //                   from the phone as well); heart rate every 30 seconds; a resting figure each night
  //   coarse          one record an hour; heart rate every 10 minutes
  //   none            nothing of any kind
  //   denied          distance refuses ("SecurityException: ... READ_DISTANCE"), the rest as fine
  adapter.recordsBetween = async (kind, start, end) => {
    calls.push({ records: kind, window: [start.toISOString(), end.toISOString()] })
    const how = q.get('healthrecords') ?? 'fine'
    if (how === 'none') return []
    if (how === 'denied' && kind === 'distance') throw new Error('SecurityException: the app has no android.permission.health.READ_DISTANCE')
    const rec = (t: number, lenMs: number, source: string, device: string | null) => ({ start: new Date(t).toISOString(), end: new Date(t + lenMs).toISOString(), source, device })
    const out: { start: string; end: string; source: string | null; device: string | null }[] = []
    if (kind === 'restingHeartRate') {
      if (q.get('healthnoresting') === '1') return []
      for (let i = 0; i < 14; i++) { const t = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 4).getTime(); if (t >= start.getTime() && t <= end.getTime()) out.push(rec(t, 0, 'Samsung Health', 'watch')) }
      return out
    }
    if (kind === 'heartRate') {
      const step = how === 'coarse' ? 600000 : 30000
      for (let t = start.getTime(); t <= end.getTime(); t += step) out.push(rec(t, 0, 'Samsung Health', 'watch'))
      return out
    }
    const step = how === 'coarse' ? 3600000 : 60000
    for (let t = start.getTime(); t + step <= end.getTime(); t += step) out.push(rec(t, step, 'Samsung Health', 'watch'))
    if (kind === 'steps' && how !== 'coarse') for (let t = start.getTime(); t + 300000 <= end.getTime(); t += 300000) out.push(rec(t, 300000, 'Google Fit', 'phone'))
    return out
  }
  ;(globalThis as { __healthAdapterForTest?: HealthAdapter }).__healthAdapterForTest = adapter
  // THE PHONE'S OWN STEP COUNTER (27 Nov 2026, live-steps.ts). &stepcounter= chooses it:
  //   on (default)  a counter at 120,000 since the phone started; window.__stepsSend(n) moves it on by n steps
  //   denied        "Physical activity" refused
  //   none          a phone with no step counter
  const sc = q.get('stepcounter') ?? 'on'
  // The counter outlives a page load, as a phone's does (it counts since the phone started, not since the app did).
  let total = 120000
  try { total = Number(localStorage.getItem('fake_step_counter_total') ?? '120000') || 120000 } catch { /* 120,000 */ }
  const subs = new Set<(t: number) => void>()
  ;(window as unknown as { __stepsSend: (n: number) => void }).__stepsSend = (n: number) => {
    total += n
    try { localStorage.setItem('fake_step_counter_total', String(total)) } catch { /* this page only */ }
    for (const f of subs) f(total)
  }
  ;(globalThis as { __stepCounterForTest?: unknown }).__stepCounterForTest = {
    start: async () => { calls.push({ stepCounter: 'start' }); return sc === 'denied' ? { started: false, reason: 'denied' } : sc === 'none' ? { started: false, reason: 'unavailable' } : { started: true, total } },
    stop: async () => { calls.push({ stepCounter: 'stop' }) },
    onTotal: async (cb: (t: number) => void) => { subs.add(cb); return () => { subs.delete(cb) } },
  }
  // THE WATCH APP SENDING ITS RUNNING COUNT (28 Nov 2026): window.__watchCardio(steps, distanceM) hands the app the
  // message the watch sends with its heart rate, for the workout open on the phone, through the app's own reader.
  // `ageMs` stamps the count that long ago by the watch's clock (a watch gone quiet); `gps` says it kept a route.
  ;(window as unknown as { __watchCardio: (steps: number, distanceM: number, o?: { ageMs?: number; gps?: boolean }) => Promise<void> }).__watchCardio = async (steps, distanceM, o = {}) => {
    const r = (await import('@/lib/recording-store')).readRecording()
    if (!r) return
    ;(await import('@/lib/watch-cardio-live')).noteWatchCardioLive({ type: 'hr', kind: 'cardio', activity: r.activity, startedAt: Date.parse(r.startedAt), steps, distanceM, at: Date.now() - (o.ageMs ?? 0), ...(o.gps ? { gps: true } : {}) })
  }
  ;(window as unknown as { __watchCardioReset: () => Promise<void> }).__watchCardioReset = async () => { (await import('@/lib/watch-cardio-live')).__resetWatchCardioLiveForTests() }
  if (q.get('healthon') === '1') { try { localStorage.setItem('fitplan_health_steps_connected', '1') } catch { /* */ } }
  if (q.get('hearton') === '1') { try { localStorage.setItem('fitplan_health_heart_connected', '1') } catch { /* */ } }
  if (q.get('sleepon') === '1') { try { localStorage.setItem('fitplan_health_sleep_connected', '1') } catch { /* */ } }
  if (q.get('workoutson') === '1') { try { localStorage.setItem('fitplan_health_workouts_connected', '1') } catch { /* */ } }
}
