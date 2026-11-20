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
  }
  ;(globalThis as { __healthAdapterForTest?: HealthAdapter }).__healthAdapterForTest = adapter
  if (q.get('healthon') === '1') { try { localStorage.setItem('fitplan_health_steps_connected', '1') } catch { /* */ } }
}
