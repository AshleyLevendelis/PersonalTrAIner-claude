// ---------------------------------------------------------------------------
// THIS PHONE STAYS LINKED TO THE PROFILE IT IS SHOWING (his report 17 Nov 2026: "in general I don't get notifications
// from the app ... no check ins arrive, no reminders, nothing", while every test push had arrived).
//
// The server sends to the phones in its subscriptions table, one row per phone, tied to a profile. The phone's own
// "yes" lives in the browser and survives everything; the server's row does not. Starting a new profile deletes the
// old profile's rows (or leaves the row on the old profile), and the server drops a row a push service calls gone. In
// each case Profile still reads "On" (it asks the browser), the hourly run finds no phone for this profile, and the
// coach never speaks first, with nothing on screen to say why.
//
// So on every open, once a day per profile and phone, a phone that has already said yes is written back for the
// profile on screen (the same upsert the "turn on" tap makes, keyed by the phone). Never asks for permission: a phone
// that has not said yes is left alone.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'
import { getLocalDateString } from './dev-clock'

export type LinkOutcome = 'linked' | 'already_today' | 'not_on' | 'unsupported' | 'failed'

export interface PushLinkDeps {
  /** The phone's existing subscription, or null when it never said yes (or cannot). */
  subscription: () => Promise<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null | 'unsupported'>
  save: (row: { user_id: string; endpoint: string; p256dh: string; auth: string; timezone: string }) => Promise<{ error: unknown }>
  timezone: () => string
  today: () => string
  memo: { get: (k: string) => string | null; set: (k: string, v: string) => void }
}

const MEMO_KEY = 'push-link-v1'

export async function keepPhoneLinked(profileId: string, deps: PushLinkDeps = realDeps()): Promise<LinkOutcome> {
  if (!profileId) return 'not_on'
  let sub: Awaited<ReturnType<PushLinkDeps['subscription']>>
  try { sub = await deps.subscription() } catch { return 'unsupported' }
  if (sub === 'unsupported') return 'unsupported'
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return 'not_on'
  const timezone = deps.timezone() || 'UTC'
  const stamp = `${profileId}|${sub.endpoint}|${timezone}|${deps.today()}`
  if (deps.memo.get(MEMO_KEY) === stamp) return 'already_today'
  const { error } = await deps.save({ user_id: profileId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, timezone })
  if (error) {
    console.error('[reach-out] re-linking this phone failed:', error)
    return 'failed'
  }
  deps.memo.set(MEMO_KEY, stamp)
  return 'linked'
}

function realDeps(): PushLinkDeps {
  return {
    subscription: async () => {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof window === 'undefined'
        || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported'
      if (Notification.permission !== 'granted') return null
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      return sub ? sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } : null
    },
    save: async (row) => {
      const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
      return { error }
    },
    timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    today: () => getLocalDateString(new Date()),
    memo: {
      get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
      set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private window: links again next open */ } },
    },
  }
}
