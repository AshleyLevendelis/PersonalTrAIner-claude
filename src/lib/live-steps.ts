// ---------------------------------------------------------------------------
// LIVE STEPS DURING A RECORDED WORKOUT (his words 27 Nov 2026, from his phone: "While the exercise is running I should
// be able to see my heart rate and the zone and steps if applicable"). His 5-minute walk came back with no steps: the
// watch's steps reach Health Connect through Samsung Health minutes or hours late, so End found none.
//
// The live count comes from the PHONE'S OWN step counter (Android's TYPE_STEP_COUNTER, read by the app's own small
// plugin, android/.../StepCounterPlugin.java). It counts every step since the phone started, so the app keeps the
// count it saw first after Start and shows the difference. That survives the app being closed mid-walk (the start
// figure is kept on the phone with the recording's start time) and a phone restart (the counter drops to zero, and what
// was already counted is carried).
//
// It counts what the PHONE feels: in a pocket or on an armband. A phone left on a treadmill's shelf counts nothing, and
// zero is treated as "no count" so the watch's figure is still used when it arrives.
//
// On foot only (cardio-kinds.ts tracksSteps): a bike shakes the phone. Android only: an iPhone has no such plugin here,
// and the count is simply absent. Nothing is saved to the database from here; at End the recorder uses this count when
// the phone's health store has none (activity-recording.ts).
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'
import { isPhoneApp } from './steps-store'

export interface StepCounterAdapter {
  /** Starts listening, asking "Physical activity" the first time. `total` is the counter now, when the phone has one. */
  start(): Promise<{ started: boolean; reason?: 'denied' | 'unavailable'; total?: number }>
  stop(): Promise<void>
  /** Every new counter value. Returns a function that stops listening. */
  onTotal(cb: (total: number) => void): Promise<() => void>
}

const KEY = 'fitplan_live_steps'
type Kept = { startedAt: string; base: number | null; carried: number; steps: number }
export type LiveStepsState = 'off' | 'starting' | 'counting' | 'denied' | 'unavailable'

function testAdapter(): StepCounterAdapter | null | undefined {
  return (globalThis as { __stepCounterForTest?: StepCounterAdapter | null }).__stepCounterForTest
}

let real: Promise<StepCounterAdapter | null> | null = null
/** The phone's step counter, or null in a browser or on a phone without the plugin. */
function stepCounterAdapter(): Promise<StepCounterAdapter | null> {
  const fake = testAdapter()
  if (fake !== undefined) return Promise.resolve(fake)
  if (!isPhoneApp()) return Promise.resolve(null)
  if (!real) {
    real = (async (): Promise<StepCounterAdapter | null> => {
      try {
        const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor
        if (cap?.getPlatform?.() !== 'android') return null
        const { registerPlugin } = await import('@capacitor/core')
        type Plugin = {
          start(): Promise<{ started: boolean; reason?: 'denied' | 'unavailable'; total?: number }>
          stop(): Promise<void>
          addListener(e: 'step', cb: (d: { total: number }) => void): Promise<{ remove: () => Promise<void> }>
        }
        const p = registerPlugin<Plugin>('StepCounter')
        return {
          start: () => p.start(),
          stop: () => p.stop(),
          onTotal: async cb => { const h = await p.addListener('step', d => { if (Number.isFinite(d?.total)) cb(Number(d.total)) }); return () => { void h.remove() } },
        }
      } catch { return null }
    })()
  }
  return real
}

function readKept(): Kept | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const k = JSON.parse(raw) as Partial<Kept>
    return typeof k.startedAt === 'string' ? { startedAt: k.startedAt, base: typeof k.base === 'number' ? k.base : null, carried: Number(k.carried) || 0, steps: Number(k.steps) || 0 } : null
  } catch { return null }
}
function writeKept(k: Kept | null): void {
  try { if (k) localStorage.setItem(KEY, JSON.stringify(k)); else localStorage.removeItem(KEY) } catch { /* the live number still shows */ }
}

let kept: Kept | null = null
let state: LiveStepsState = 'off'
let stopListening: (() => void) | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

/** A new counter value: the steps since Start, carried across a phone restart. Exported for the tests. */
export function takeTotal(k: Kept, total: number): Kept {
  if (!(total >= 0)) return k
  if (k.base == null) return { ...k, base: total }
  if (total < k.base) return { ...k, base: total, carried: k.steps } // the phone restarted: the counter began again
  return { ...k, steps: k.carried + Math.round(total - k.base) }
}

/** Count steps for the recording that started at `startedAt`. Safe to call again; never throws. */
export async function startLiveSteps(startedAt: string): Promise<LiveStepsState> {
  const a = await stepCounterAdapter()
  if (!a) { state = 'unavailable'; emit(); return state }
  const before = readKept()
  kept = before && before.startedAt === startedAt ? before : { startedAt, base: null, carried: 0, steps: 0 }
  writeKept(kept)
  if (stopListening) return state
  state = 'starting'; emit()
  try {
    const off = await a.onTotal(total => {
      if (!kept) return
      kept = takeTotal(kept, total)
      writeKept(kept)
      emit()
    })
    stopListening = off
    const r = await a.start()
    if (!r.started) { off(); stopListening = null; state = r.reason === 'denied' ? 'denied' : 'unavailable'; emit(); return state }
    if (typeof r.total === 'number' && kept) { kept = takeTotal(kept, r.total); writeKept(kept) }
    state = 'counting'
  } catch { stopListening = null; state = 'unavailable' }
  emit()
  return state
}

/** Stop counting (End, Cancel). The last count stays readable for the recording until it is cleared. */
export async function stopLiveSteps(): Promise<void> {
  const off = stopListening
  stopListening = null
  if (off) off()
  if (state === 'counting' || state === 'starting') state = 'off'
  emit()
  try { await (await stepCounterAdapter())?.stop() } catch { /* already stopped */ }
}

/** Forget the count (the workout was logged or thrown away). */
export function clearLiveSteps(): void { kept = null; writeKept(null); emit() }

/** The steps counted for this recording, or null when none were (0 is "none": the phone was not carried). */
export function liveStepsFor(startedAt: string): number | null {
  const k = kept ?? readKept()
  return k && k.startedAt === startedAt && k.steps > 0 ? k.steps : null
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export function useLiveSteps(startedAt: string | null): number | null {
  return useSyncExternalStore(subscribe, () => (startedAt ? liveStepsFor(startedAt) : null), () => null)
}
export function useLiveStepsState(): LiveStepsState {
  return useSyncExternalStore(subscribe, () => state, () => 'off' as LiveStepsState)
}

/** Tests only. */
export function __resetLiveStepsForTests(): void { kept = null; state = 'off'; stopListening = null; real = null }
