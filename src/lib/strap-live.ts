// ---------------------------------------------------------------------------
// LIVE HEART RATE FROM A STRAP, the phone half (docs/plans/live-heart-rate.md, stage 2; his "then start working on 3",
// 24 Nov 2026). heart-strap.ts reads the bytes; this file pairs the strap, keeps it connected while the app is open,
// holds the one live number every screen shows, and keeps the readings a session's figure is worked out from.
//
// ONE LIVE READER: the round timer, the countdown and today's workout all ask `useLiveHeartRate`, so they cannot show
// two numbers. A reading older than STALE_MS is not live and nothing is drawn (a strap out of range shows nothing,
// never its last number).
//
// READINGS STAY ON THE PHONE, the last four hours only, and are thrown away once nothing could still need them. They
// are never sent anywhere raw: only a session's average and highest are saved (health-heart.ts, fillHeartFromStrap).
//
// THE BLUETOOTH PLUGIN IS LOADED ONLY INSIDE THE PHONE APP, by a dynamic import, as the health plugin is. Tests and the
// browser test pages hand in a pretend strap on a global.
//
// NOTHING IS PRESCRIBED BY IT (CSCS, mine): the number is shown, never judged. No zone, no target, no colour.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'
import { HEART_RATE_MEASUREMENT, HEART_RATE_SERVICE, StrapReadings, parseHeartRateMeasurement } from './heart-strap'
import { isPhoneApp } from './steps-store'

export interface PairedStrap { id: string; name: string }

/** What the app asks of Bluetooth. The real one wraps the plugin; tests hand in a pretend one. */
export interface StrapAdapter {
  /** The phone's own picker, filtered to things sending heart rate. Null when he closes it. */
  pick(): Promise<PairedStrap | null>
  /** Connect and start notifications. `onValue` gets each raw notification; `onGone` when the link drops. */
  connect(id: string, onValue: (v: DataView) => void, onGone: () => void): Promise<void>
  disconnect(id: string): Promise<void>
}

const PAIRED_KEY = 'fitplan_heart_strap'
const READINGS_KEY = 'fitplan_heart_strap_readings'
export const STALE_MS = 5000
const KEEP_MS = 4 * 3600 * 1000

function testAdapter(): StrapAdapter | null | undefined {
  return (globalThis as { __strapAdapterForTest?: StrapAdapter | null }).__strapAdapterForTest
}

let realAdapter: Promise<StrapAdapter | null> | null = null

/** Bluetooth on this phone, or null in a browser. */
export function strapAdapter(): Promise<StrapAdapter | null> {
  const fake = testAdapter()
  if (fake !== undefined) return Promise.resolve(fake)
  if (!isPhoneApp()) return Promise.resolve(null)
  if (!realAdapter) {
    realAdapter = (async (): Promise<StrapAdapter | null> => {
      try {
        const { BleClient } = await import('@capacitor-community/bluetooth-le')
        // neverForLocation: the scan is for straps, never for where he is (the manifest says the same).
        await BleClient.initialize({ androidNeverForLocation: true })
        return {
          pick: async () => {
            try {
              const d = await BleClient.requestDevice({ services: [HEART_RATE_SERVICE] })
              return { id: d.deviceId, name: d.name?.trim() || 'Heart rate strap' }
            } catch { return null }
          },
          connect: async (id, onValue, onGone) => {
            await BleClient.connect(id, () => onGone())
            await BleClient.startNotifications(id, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT, onValue)
          },
          disconnect: async (id) => { try { await BleClient.disconnect(id) } catch { /* already gone */ } },
        }
      } catch {
        return null
      }
    })()
  }
  return realAdapter
}

// ---------------------------------------------------------------------------
// The paired strap, remembered on this phone (a fact about this phone's Bluetooth, not about him).
// ---------------------------------------------------------------------------
export function pairedStrap(): PairedStrap | null {
  try {
    const raw = localStorage.getItem(PAIRED_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<PairedStrap>
    return typeof p.id === 'string' && p.id ? { id: p.id, name: typeof p.name === 'string' && p.name ? p.name : 'Heart rate strap' } : null
  } catch { return null }
}
function rememberStrap(s: PairedStrap | null): void {
  try { if (s) localStorage.setItem(PAIRED_KEY, JSON.stringify(s)); else localStorage.removeItem(PAIRED_KEY) } catch { /* asked again next open */ }
}

// ---------------------------------------------------------------------------
// The live number and the session readings. One store; screens subscribe.
// ---------------------------------------------------------------------------
type Live = { bpm: number; at: number } | null
export type StrapState = 'none' | 'connecting' | 'connected' | 'lost'

let live: Live = null
let state: StrapState = 'none'
const listeners = new Set<() => void>()
const readings = new StrapReadings()
let loaded = false
let lastSaved = 0

function emit(): void { for (const l of listeners) l() }

function loadReadings(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(READINGS_KEY)
    if (!raw) return
    const cutoff = Date.now() - KEEP_MS
    for (const [t, bpm] of JSON.parse(raw) as [number, number][]) if (t >= cutoff) readings.add(bpm, new Date(t))
  } catch { /* nothing kept */ }
}
function saveReadings(force = false): void {
  const now = Date.now()
  if (!force && now - lastSaved < 30000) return
  lastSaved = now
  try {
    const cutoff = now - KEEP_MS
    const kept = readings.all().filter(r => Date.parse(r.at) >= cutoff)
    // To the millisecond: a reading rounded to the second can land just outside its session.
    localStorage.setItem(READINGS_KEY, JSON.stringify(kept.map(r => [Date.parse(r.at), r.bpm])))
  } catch { /* the figure may be missed; the live number is unaffected */ }
}

/** A raw notification from the strap. Exported for the pretend strap and the gate. */
export function onStrapValue(v: DataView, at: Date = new Date()): void {
  const bpm = parseHeartRateMeasurement(v)
  if (bpm == null) return
  loadReadings()
  readings.add(bpm, at)
  live = { bpm, at: at.getTime() }
  saveReadings()
  emit()
}

/** Writes the readings to the phone now: when the app goes to the back, where it may be closed. */
export function flushStrapReadings(): void { if (loaded) saveReadings(true) }

/** The readings a session's figure is worked out from, the last four hours. */
export function strapReadingsBetween(start: Date, end: Date) {
  loadReadings()
  return readings.summary(start, end)
}

/** The readings themselves for a window, oldest first: a session's graph (heart-series.ts). */
export function strapSamplesBetween(start: Date, end: Date): { bpm: number; at: string }[] {
  loadReadings()
  const a = start.getTime(), b = end.getTime()
  return readings.all().filter(r => { const t = Date.parse(r.at); return t >= a && t <= b })
}

/** Once every session that could use them has its figure, the readings go. */
export function forgetStrapReadingsBefore(t: Date): void {
  loadReadings()
  readings.dropBefore(t)
  saveReadings(true)
}

export function strapState(): StrapState { return state }

function setState(s: StrapState): void { state = s; emit() }

/** Pick a strap with the phone's own picker, remember it, connect. */
export async function pairStrap(): Promise<{ ok: true; strap: PairedStrap } | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' }> {
  const adapter = await strapAdapter()
  if (!adapter) return { ok: false, reason: 'unavailable' }
  const s = await adapter.pick()
  if (!s) return { ok: false, reason: 'cancelled' }
  rememberStrap(s)
  const connected = await connectPairedStrap()
  return connected ? { ok: true, strap: s } : { ok: false, reason: 'failed' }
}

/** Connect to the remembered strap, when there is one. Quietly does nothing otherwise. */
export async function connectPairedStrap(): Promise<boolean> {
  const s = pairedStrap()
  if (!s || state === 'connected' || state === 'connecting') return state === 'connected'
  const adapter = await strapAdapter()
  if (!adapter) return false
  setState('connecting')
  try {
    await adapter.connect(s.id, v => onStrapValue(v), () => { live = null; saveReadings(true); setState('lost') })
    setState('connected')
    return true
  } catch {
    setState('lost')
    return false
  }
}

/** Forget the strap on this phone. Its readings go too: nothing else would use them. */
export async function forgetStrap(): Promise<void> {
  const s = pairedStrap()
  rememberStrap(null)
  live = null
  readings.clear()
  try { localStorage.removeItem(READINGS_KEY) } catch { /* gone */ }
  setState('none')
  const adapter = await strapAdapter()
  if (s && adapter) await adapter.disconnect(s.id)
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  // A reading goes stale with no new notification, so the screens re-ask once a second while anyone is watching.
  const tick = setInterval(l, 1000)
  return () => { listeners.delete(l); clearInterval(tick) }
}

/** The live number, or null when there is none worth showing (no strap, out of range, older than STALE_MS). */
export function liveHeartRate(now: number = Date.now()): number | null {
  return live && now - live.at <= STALE_MS ? live.bpm : null
}

export function useLiveHeartRate(): number | null {
  return useSyncExternalStore(subscribe, () => liveHeartRate(), () => null)
}

export function useStrapState(): StrapState {
  return useSyncExternalStore(subscribe, () => state, () => 'none' as StrapState)
}

/** Tests only: a clean store. */
export function __resetStrapForTests(): void {
  live = null; state = 'none'; readings.clear(); loaded = false; lastSaved = 0; realAdapter = null
}
