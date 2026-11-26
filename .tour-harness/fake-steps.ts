// A pretend phone step sensor for the browser test pages (26 Nov 2026, a counted walk, walk-session.ts). Off unless the
// page address carries ?stepsensor=1. The driver sends the walk's steps so far with window.__stepSend(n), as the real
// sensor reports steps since its start. Records what the app asked on window.__stepCalls.
//   &stepsdenied=1   he says no to the phone's "physical activity" question
import type { StepSensor } from '@/lib/walk-session'

const q = new URLSearchParams(location.search)
if (q.get('stepsensor') === '1') {
  const calls: unknown[] = []
  let on: ((n: number) => void) | null = null
  const w = window as unknown as Record<string, unknown>
  w.__stepCalls = calls
  w.__stepSend = (n: number) => { on?.(n) }
  const sensor: StepSensor = {
    available: async () => { calls.push('available'); return true },
    requestAccess: async () => { calls.push('request'); return q.get('stepsdenied') !== '1' },
    start: async (f) => { calls.push('start'); on = f },
    stop: async () => { calls.push('stop'); on = null },
  }
  ;(globalThis as { __stepSensorForTest?: StepSensor }).__stepSensorForTest = sensor
}
