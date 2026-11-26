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
  ;(globalThis as { __healthAdapterForTest?: HealthAdapter }).__healthAdapterForTest = adapter
  if (q.get('healthon') === '1') { try { localStorage.setItem('fitplan_health_steps_connected', '1') } catch { /* */ } }
  if (q.get('hearton') === '1') { try { localStorage.setItem('fitplan_health_heart_connected', '1') } catch { /* */ } }
  if (q.get('sleepon') === '1') { try { localStorage.setItem('fitplan_health_sleep_connected', '1') } catch { /* */ } }
  if (q.get('workoutson') === '1') { try { localStorage.setItem('fitplan_health_workouts_connected', '1') } catch { /* */ } }
}
