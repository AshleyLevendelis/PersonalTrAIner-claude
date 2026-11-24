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
    // HEART RATE (24 Nov 2026, health-heart.ts): a working session's readings across any window asked (about 140, peaks
    // near 170), and a resting figure each night for 14 nights: 58 this week, 60 the week before.
    requestHeartAccess: async () => { calls.push({ request: ['heartRate', 'restingHeartRate'] }); return q.get('healthdenied') !== '1' },
    heartRateSamples: async (start, end) => {
      calls.push({ heart: [start.toISOString(), end.toISOString()] })
      const out: { bpm: number; at: string }[] = []
      for (let t = start.getTime(), i = 0; t <= end.getTime(); t += 60000, i++) out.push({ bpm: 132 + (i % 10) * 4, at: new Date(t).toISOString() })
      return out
    },
    restingHeartRateSamples: async (_start, end) => {
      calls.push('resting')
      return Array.from({ length: 14 }, (_, i) => {
        const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 4, 0, 0)
        return { bpm: i < 7 ? 58 : 60, at: d.toISOString() }
      })
    },
  }
  ;(globalThis as { __healthAdapterForTest?: HealthAdapter }).__healthAdapterForTest = adapter
  if (q.get('healthon') === '1') { try { localStorage.setItem('fitplan_health_steps_connected', '1') } catch { /* */ } }
  if (q.get('hearton') === '1') { try { localStorage.setItem('fitplan_health_heart_connected', '1') } catch { /* */ } }
}
