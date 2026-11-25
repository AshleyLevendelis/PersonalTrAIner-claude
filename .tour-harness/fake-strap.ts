// A pretend heart rate strap for the browser test pages (25 Nov 2026, option 3, strap-live.ts). Off unless the page
// address carries ?strap=1. It speaks the real thing's bytes: the driver sends a beats-a-minute number and this turns
// it into a Heart Rate Measurement notification (flags 0x06, contact reported and in contact), so the app's own parser
// reads it. Records what the app asked of it on window.__strapCalls.
//   &strappaired=1   a strap already paired on this phone (the remembered one)
//   &strapnone=1     the phone's picker is closed with nothing chosen
import type { StrapAdapter } from '@/lib/strap-live'
import { connectPairedStrap } from '@/lib/strap-live'

const q = new URLSearchParams(location.search)
if (q.get('strap') === '1') {
  const calls: unknown[] = []
  let onValue: ((v: DataView) => void) | null = null
  let onGone: (() => void) | null = null
  const w = window as unknown as Record<string, unknown>
  w.__strapCalls = calls
  w.__strapSend = (bpm: number) => { onValue?.(new DataView(new Uint8Array([0x06, bpm]).buffer)) }
  w.__strapNoContact = (bpm: number) => { onValue?.(new DataView(new Uint8Array([0x04, bpm]).buffer)) }
  w.__strapDrop = () => { const g = onGone; onValue = null; onGone = null; g?.() }
  w.__strapConnect = () => connectPairedStrap()
  const adapter: StrapAdapter = {
    pick: async () => { calls.push('pick'); return q.get('strapnone') === '1' ? null : { id: 'C0:FF:EE', name: 'Polar H10 1A2B3C' } },
    connect: async (id, v, g) => { calls.push({ connect: id }); onValue = v; onGone = g },
    disconnect: async (id) => { calls.push({ disconnect: id }); onValue = null; onGone = null },
  }
  ;(globalThis as { __strapAdapterForTest?: StrapAdapter }).__strapAdapterForTest = adapter
  if (q.get('strappaired') === '1') { try { localStorage.setItem('fitplan_heart_strap', JSON.stringify({ id: 'C0:FF:EE', name: 'Polar H10 1A2B3C' })) } catch { /* */ } }
}
