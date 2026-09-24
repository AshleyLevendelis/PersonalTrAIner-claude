// ---------------------------------------------------------------------------
// THE APP'S HALF OF "THE COACH CAN REACH YOU WHEN THE APP IS SHUT".
//
// docs/plans/the-coach-can-reach-you.md, slices 2 and 3. Ashley, 17 Sep 2026:
// "Everything but the user should be able to toggle notifications on or off to
// reduce noise." All seven moments, each switchable, all on to begin with.
// Built 24 Sep 2026 on her "implement all the chat fixes".
//
// Two jobs, each safe on both sides of a migration that may not be pushed:
//   1. the switches — which moments may buzz the phone;
//   2. this phone saying yes or no to notifications at all.
// The third — sending ahead the few plan-shaped facts the server cannot work
// out — lives in moment-facts.ts, because Home runs it and Home is in the
// first download; this file loads only when Profile's Reminders section does.
// See supabase/functions/_shared/reach-out.ts for the server's half.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { isMissingColumnError } from './missing-column'
import { MOMENT_KEYS, type MomentKey, type MomentSwitches } from './coach-moments'

/**
 * WHAT EACH SWITCH DOES, in the words the plan asked for ("Remind me if I
 * haven't logged a session"): named for what arrives, never for a mechanism.
 * Ashley's to reword — these are the app speaking.
 */
export const MOMENT_LABELS: Record<MomentKey, string> = {
  session_feel: 'Ask how a session felt',
  session_not_logged: "Remind me if I haven't logged a session",
  missed_yesterday: 'Check in when I miss a day',
  week_gone_quiet: 'Check in if a week goes quiet',
  streak_at_risk: 'Tell me when a streak is at risk',
  block_review: 'Tell me when a block is done',
  beat_target: "Tell me when I'm beating my weights",
}

export const SWITCH_ORDER: readonly MomentKey[] = MOMENT_KEYS

// --- 1. The switches ----------------------------------------------------------------

/**
 * select('*'), never the column by name: a column named in a select is a
 * migration dependency, and before the migration lands this must read "all
 * on" rather than fail. Absent key means ON — a person never asked has not
 * said no.
 *
 * `live` is whether the column EXISTS on the row that came back — the one
 * honest way for the screen to know the migration has landed before it offers
 * a switch that could not save.
 */
export async function loadSwitches(profileId: string): Promise<{ switches: MomentSwitches; live: boolean }> {
  const { data } = await supabase.from('fitness_profiles').select('*').eq('id', profileId).maybeSingle()
  const row = data as Record<string, unknown> | null
  const sw = row?.notification_switches
  return {
    switches: sw && typeof sw === 'object' ? sw as MomentSwitches : {},
    live: !!row && 'notification_switches' in row,
  }
}

export type SaveOutcome = 'saved' | 'not_live_yet' | 'failed'

export async function saveSwitches(profileId: string, switches: MomentSwitches): Promise<SaveOutcome> {
  const { error } = await supabase.from('fitness_profiles').update({ notification_switches: switches }).eq('id', profileId)
  if (!error) return 'saved'
  if (isMissingColumnError(error, 'notification_switches')) return 'not_live_yet'
  console.error('[reach-out] saving the switches failed:', error)
  return 'failed'
}

// --- 2. This phone ----------------------------------------------------------------------

export type PushSupport = 'ok' | 'needs_home_screen' | 'unsupported'

/**
 * CAN THIS PHONE BE REACHED AT ALL? On iPhone only once the app is on the
 * home screen (iOS 16.4+) — the plan's honest limit, said on screen rather
 * than discovered by a button that silently does nothing.
 */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (ios && !standalone) return 'needs_home_screen'
  return apis ? 'ok' : 'unsupported'
}

/**
 * The service worker this phone registered, or null. Registered in production
 * builds only (main.tsx), so on a dev server or a harness page there is none —
 * and waiting on `serviceWorker.ready` there would wait for ever.
 */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export type PushState = 'on' | 'off' | 'blocked' | PushSupport
export async function currentPushState(): Promise<PushState> {
  const support = pushSupport()
  if (support !== 'ok') return support
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await registration()
  if (!reg) return 'unsupported'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/** The public half of the push key, from the function that signs with the private half. */
export async function fetchPushKey(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-reach-out?vapid`, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    })
    if (!res.ok) return null
    const body = await res.json() as { publicKey?: string }
    return typeof body.publicKey === 'string' && body.publicKey ? body.publicKey : null
  } catch {
    return null
  }
}

function keyBytes(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4)
  const raw = atob(b64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export type TurnOnOutcome = 'on' | 'blocked' | 'not_live_yet' | 'unsupported' | 'failed'

/**
 * ASKED ONLY FROM A TAP. The browser's permission prompt is shown when she
 * turns this on herself, never on load — the plan's rule, because a prompt
 * nobody asked for is the one people reflexively decline, and a declined
 * prompt cannot be asked again.
 */
export async function turnOnPush(profileId: string): Promise<TurnOnOutcome> {
  if (pushSupport() !== 'ok') return 'unsupported'
  const reg = await registration()
  if (!reg) return 'unsupported'
  const key = await fetchPushKey()
  if (!key) return 'not_live_yet'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'blocked'
  try {
    const sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: profileId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }, { onConflict: 'endpoint' })
    if (error) {
      // A subscription the server cannot see is a phone that will never
      // buzz; undo it so the screen does not say "on" over nothing.
      await sub.unsubscribe().catch(() => {})
      console.error('[reach-out] saving this phone failed:', error)
      return 'failed'
    }
    return 'on'
  } catch (err) {
    console.error('[reach-out] subscribing failed:', err)
    return 'failed'
  }
}

export async function turnOffPush(): Promise<boolean> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return true
  const endpoint = sub.endpoint
  const ok = await sub.unsubscribe().catch(() => false)
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return ok !== false
}
