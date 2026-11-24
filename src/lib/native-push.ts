// ---------------------------------------------------------------------------
// NOTIFICATIONS IN THE PHONE APP (his report 23 Nov 2026: "Now the app is on my phone as a proper app ... Notifications
// dont seem to be working"; his "yes build it for Android").
//
// The website reaches a phone through the browser's push service and a service worker. The phone app has neither, so
// Profile said "This browser can't show notifications". Here the phone's own route is used instead: Firebase Cloud
// Messaging on Android, through @capacitor/push-notifications, loaded by a dynamic import only so the website's
// download does not grow.
//
// ONE TABLE, NO MIGRATION. A phone-app device is a row in push_subscriptions like any browser, its endpoint
// `fcm:<token>` and its two browser keys empty. Every server that sends (the hourly reminders, the coach's reply)
// already reads every row for a person, and `_shared/push.ts` sends an `fcm:` row through Firebase instead.
//
// THE SAME RULES AS THE WEBSITE: the permission prompt only from his tap on the switch, never on load; a phone that has
// said yes is written back for the profile on screen once a day (push-link.ts's reason: rows go missing); a tap on a
// notification opens the tab it names, and only a tab of this app.
//
// What a test or browser page uses instead of the phone: `globalThis.__nativePushForTest`.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'
import { getLocalDateString } from './dev-clock'

export const FCM_PREFIX = 'fcm:'
/** The Android notification channel every coach message goes to. The server names the same id. */
export const COACH_CHANNEL_ID = 'coach'

export type NativePermission = 'granted' | 'denied' | 'prompt'

/** What this file needs from the phone: the plugin, narrowed to the calls the app makes. */
export interface NativePushAdapter {
  checkPermission(): Promise<NativePermission>
  requestPermission(): Promise<NativePermission>
  /** Ask Firebase for this phone's token. Rejects on a registration error. */
  register(): Promise<string>
  unregister(): Promise<void>
  createChannel(): Promise<void>
  /** Called with the data of a notification he tapped. */
  onTap(listener: (data: Record<string, unknown>) => void): void
  /** Called with the data of a notification that arrived while the app was open (Android shows nothing then). */
  onReceived(listener: (data: Record<string, unknown>) => void): void
}

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string }

/** The phone app, on Android. iPhone is not built yet (Apple's push key), so it stays "can't" there. */
export function inAndroidApp(): boolean {
  const fake = (globalThis as { __nativePushForTest?: NativePushAdapter | null }).__nativePushForTest
  if (fake !== undefined) return fake !== null
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android'
}

/** True in the phone app on any platform: there, the browser route never works. */
export function inPhoneApp(): boolean {
  if (inAndroidApp()) return true
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  return !!cap?.isNativePlatform?.()
}

let realAdapter: Promise<NativePushAdapter | null> | null = null

function adapter(): Promise<NativePushAdapter | null> {
  const fake = (globalThis as { __nativePushForTest?: NativePushAdapter | null }).__nativePushForTest
  if (fake !== undefined) return Promise.resolve(fake)
  if (!inAndroidApp()) return Promise.resolve(null)
  if (!realAdapter) {
    realAdapter = (async (): Promise<NativePushAdapter | null> => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const norm = (s: string): NativePermission => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt')
        return {
          checkPermission: async () => norm((await PushNotifications.checkPermissions()).receive),
          requestPermission: async () => norm((await PushNotifications.requestPermissions()).receive),
          register: () => new Promise<string>((resolve, reject) => {
            let settled = false
            const handles: { remove: () => Promise<void> }[] = []
            const done = (fn: () => void) => {
              if (settled) return
              settled = true
              for (const h of handles) void h.remove()
              fn()
            }
            void PushNotifications.addListener('registration', t => done(() => resolve(t.value))).then(h => handles.push(h))
            void PushNotifications.addListener('registrationError', e => done(() => reject(new Error(e.error)))).then(h => handles.push(h))
            // No answer from Firebase in 20 seconds (no signal, no Google Play services) is a failure he can retry.
            setTimeout(() => done(() => reject(new Error('no token from Firebase'))), 20_000)
            PushNotifications.register().catch(err => done(() => reject(err)))
          }),
          unregister: () => PushNotifications.unregister(),
          createChannel: () => PushNotifications.createChannel({
            id: COACH_CHANNEL_ID, name: 'Coach', description: 'Messages and reminders from your coach',
            importance: 4, visibility: 1, vibration: true,
          }),
          onTap: listener => { void PushNotifications.addListener('pushNotificationActionPerformed', a => listener(a.notification?.data ?? {})) },
          onReceived: listener => { void PushNotifications.addListener('pushNotificationReceived', n => listener(n.data ?? {})) },
        }
      } catch {
        return null
      }
    })()
  }
  return realAdapter
}

// --- The token this phone gave, kept on the phone -------------------------------------------

const TOKEN_KEY = 'native-push-token-v1'
const LINK_KEY = 'native-push-link-v1'

function memoGet(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function memoSet(k: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode */ }
}

function timezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

async function saveDevice(profileId: string, token: string) {
  return await supabase.from('push_subscriptions').upsert({
    user_id: profileId, endpoint: FCM_PREFIX + token, p256dh: '', auth: '', timezone: timezone(),
  }, { onConflict: 'endpoint' })
}

// --- What Profile's switch reads and does -----------------------------------------------------

export type NativePushState = 'on' | 'off' | 'blocked' | 'unsupported'

/** "On" only when the phone allows it AND this phone has a token it saved: never "on" over nothing. */
export async function nativePushState(): Promise<NativePushState> {
  const a = await adapter()
  if (!a) return 'unsupported'
  let perm: NativePermission
  try { perm = await a.checkPermission() } catch { return 'unsupported' }
  if (perm === 'denied') return 'blocked'
  return perm === 'granted' && memoGet(TOKEN_KEY) ? 'on' : 'off'
}

export type NativeTurnOnOutcome = 'on' | 'blocked' | 'unsupported' | 'failed'

/** ASKED ONLY FROM A TAP, like the website's switch. */
export async function turnOnNativePush(profileId: string): Promise<NativeTurnOnOutcome> {
  const a = await adapter()
  if (!a) return 'unsupported'
  try {
    const perm = await a.requestPermission()
    if (perm !== 'granted') return 'blocked'
    await a.createChannel()
    const token = await a.register()
    if (!token) return 'failed'
    const { error } = await saveDevice(profileId, token)
    if (error) {
      // A token the server cannot see is a phone that will never buzz: do not say "on" over it.
      console.error('[native-push] saving this phone failed:', error)
      return 'failed'
    }
    const old = memoGet(TOKEN_KEY)
    if (old && old !== token) await supabase.from('push_subscriptions').delete().eq('endpoint', FCM_PREFIX + old)
    memoSet(TOKEN_KEY, token)
    memoSet(LINK_KEY, `${profileId}|${token}|${timezone()}|${getLocalDateString(new Date())}`)
    return 'on'
  } catch (err) {
    console.error('[native-push] turning on failed:', err)
    return 'failed'
  }
}

/** Off for this phone: the server's row goes first, so a failed unregister still stops the messages. */
export async function turnOffNativePush(): Promise<boolean> {
  const a = await adapter()
  const token = memoGet(TOKEN_KEY)
  if (token) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', FCM_PREFIX + token)
    if (error) { console.error('[native-push] removing this phone failed:', error); return false }
  }
  memoSet(TOKEN_KEY, null)
  memoSet(LINK_KEY, null)
  try { await a?.unregister() } catch { /* the row is gone, which is what stops the messages */ }
  return true
}

export type NativeLinkOutcome = 'linked' | 'already_today' | 'not_on' | 'unsupported' | 'failed'

/**
 * ONCE A DAY, A PHONE THAT SAID YES IS WRITTEN BACK FOR THE PROFILE ON SCREEN (push-link.ts, for the website). Here it
 * also catches a token Firebase has rotated: the new one is saved and the old row removed. Never asks permission.
 */
export async function keepNativePhoneLinked(profileId: string): Promise<NativeLinkOutcome> {
  if (!profileId) return 'not_on'
  const a = await adapter()
  if (!a) return 'unsupported'
  const old = memoGet(TOKEN_KEY)
  if (!old) return 'not_on'
  try {
    if (await a.checkPermission() !== 'granted') return 'not_on'
    const stamp = `${profileId}|${old}|${timezone()}|${getLocalDateString(new Date())}`
    if (memoGet(LINK_KEY) === stamp) return 'already_today'
    const token = await a.register()
    const { error } = await saveDevice(profileId, token)
    if (error) { console.error('[native-push] re-linking this phone failed:', error); return 'failed' }
    if (token !== old) await supabase.from('push_subscriptions').delete().eq('endpoint', FCM_PREFIX + old)
    memoSet(TOKEN_KEY, token)
    memoSet(LINK_KEY, `${profileId}|${token}|${timezone()}|${getLocalDateString(new Date())}`)
    return 'linked'
  } catch (err) {
    console.error('[native-push] re-linking failed:', err)
    return 'failed'
  }
}

// --- A notification tapped, or arriving with the app open ------------------------------------

/** ONLY EVER A TAB OF THIS APP, the service worker's rule: anything else opens the chat. */
function tabFromPushData(data: Record<string, unknown> | null | undefined): string {
  const url = data?.url
  return typeof url === 'string' && /^\/#\/tab\/[a-z]+$/.test(url) ? url.slice(1) : '#/tab/chat'
}

/** The chat re-reads itself on this event, as it does on the service worker's message. */
const COACH_MESSAGE_EVENT = 'coach-message'

let listening = false
/** Called once when the phone app starts. A tap opens the tab; a message while open makes the chat re-read. */
export async function listenForNativePush(): Promise<boolean> {
  if (listening) return true
  const a = await adapter()
  if (!a) return false
  listening = true
  a.onTap(data => {
    window.location.hash = tabFromPushData(data)
    window.dispatchEvent(new CustomEvent(COACH_MESSAGE_EVENT, { detail: { messageId: data?.messageId ?? null } }))
  })
  a.onReceived(data => {
    window.dispatchEvent(new CustomEvent(COACH_MESSAGE_EVENT, { detail: { messageId: data?.messageId ?? null } }))
  })
  return true
}
