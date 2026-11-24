// Notifications in the phone app (his report 23 Nov 2026: "Now the app is on my phone as a proper app ...
// Notifications dont seem to be working"; his "yes build it for Android"). Holds both halves:
//   1-4. the phone (src/lib/native-push.ts), against a pretend plugin and a pretend database: asked only from the tap,
//        "on" only over a saved row, off removes the row, the daily re-link follows a rotated token, a tap opens only
//        a tab of this app;
//   5-7. the server (supabase/functions/_shared/fcm.ts), the very file the functions run: a signature Google can
//        check, the message Android shows, which answers mean "this phone is gone";
//   8.   the wiring: the switch, Home, the chat and the start use it; push.ts routes an `fcm:` row through it.
import { readFileSync } from 'node:fs'
import { generateKeyPairSync, createVerify } from 'node:crypto'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

// --- A pretend phone ----------------------------------------------------------------------
const store = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) },
}
const events: { type: string; detail: unknown }[] = []
;(globalThis as Record<string, unknown>).window = {
  location: { hash: '#/tab/home' },
  dispatchEvent: (e: { type: string; detail: unknown }) => { events.push({ type: e.type, detail: e.detail }); return true },
}
;(globalThis as Record<string, unknown>).CustomEvent = class { type: string; detail: unknown; constructor(t: string, o?: { detail?: unknown }) { this.type = t; this.detail = o?.detail } }

interface FakePhone {
  perm: 'granted' | 'denied' | 'prompt'
  answer: 'granted' | 'denied'
  token: string
  registerFails: boolean
  asked: number
  channels: number
  unregistered: number
  tap?: (d: Record<string, unknown>) => void
  received?: (d: Record<string, unknown>) => void
}
const phone: FakePhone = { perm: 'prompt', answer: 'granted', token: 'TOKEN-1', registerFails: false, asked: 0, channels: 0, unregistered: 0 }
;(globalThis as Record<string, unknown>).__nativePushForTest = {
  checkPermission: async () => phone.perm,
  requestPermission: async () => { phone.asked++; phone.perm = phone.answer; return phone.perm },
  register: async () => { if (phone.registerFails) throw new Error('no play services'); return phone.token },
  unregister: async () => { phone.unregistered++ },
  createChannel: async () => { phone.channels++ },
  onTap: (l: (d: Record<string, unknown>) => void) => { phone.tap = l },
  onReceived: (l: (d: Record<string, unknown>) => void) => { phone.received = l },
}

// --- A pretend database --------------------------------------------------------------------
const rows = new Map<string, Record<string, unknown>>()
let failNextWrite = false
async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: (table: string) => ({
    upsert: async (row: Record<string, unknown>, opts: { onConflict?: string }) => {
      if (table !== 'push_subscriptions' || opts?.onConflict !== 'endpoint') return { error: { message: 'wrong table or key' } }
      if (failNextWrite) { failNextWrite = false; return { error: { message: 'offline' } } }
      rows.set(String(row.endpoint), row); return { error: null }
    },
    delete: () => ({ eq: async (col: string, v: string) => { if (table === 'push_subscriptions' && col === 'endpoint') rows.delete(v); return { error: null } } }),
  }) } as never)
  const np = await import('../src/lib/native-push')
  const reach = await import('../src/lib/coach-reach-out')

  console.log('1. Nothing is asked until he taps, and "on" means a row the server can see')
  check('the phone app counts as the phone app', np.inPhoneApp() && np.inAndroidApp())
  check('before the tap: off, and nothing asked', await reach.currentPushState() === 'off' && phone.asked === 0, phone.asked)
  failNextWrite = true
  const failed = await reach.turnOnPush('profile-A')
  check('a save that fails says failed, never on', failed === 'failed' && rows.size === 0 && await np.nativePushState() === 'off', failed)
  const on = await reach.turnOnPush('profile-A')
  const row = rows.get('fcm:TOKEN-1')
  check('the tap: asked once more, the channel made, the row saved for this profile', on === 'on' && phone.channels >= 1 && row?.user_id === 'profile-A', { on, row })
  check('the row is the phone-app shape: fcm: endpoint, empty browser keys, a timezone', row?.p256dh === '' && row?.auth === '' && typeof row?.timezone === 'string' && (row.timezone as string).length > 0, row)
  check('Profile now reads on', await reach.currentPushState() === 'on')

  console.log('\n2. A refusal and a broken phone are said, not hidden')
  phone.perm = 'prompt'; phone.answer = 'denied'
  store.clear(); rows.clear()
  check('refused: blocked, nothing saved', await np.turnOnNativePush('profile-A') === 'blocked' && rows.size === 0)
  check('Profile reads blocked once the phone says denied', await np.nativePushState() === 'blocked')
  phone.perm = 'prompt'; phone.answer = 'granted'; phone.registerFails = true
  check('no token from Firebase: failed, nothing saved, not on', await np.turnOnNativePush('profile-A') === 'failed' && rows.size === 0 && await np.nativePushState() === 'off')
  phone.registerFails = false

  console.log('\n3. Off removes the row; the daily re-link follows the profile and a new token')
  check('on again', await np.turnOnNativePush('profile-A') === 'on' && rows.has('fcm:TOKEN-1'))
  check('the same day: not written again', await np.keepNativePhoneLinked('profile-A') === 'already_today')
  rows.clear()
  check('a new profile on screen gets this phone', await np.keepNativePhoneLinked('profile-B') === 'linked' && rows.get('fcm:TOKEN-1')?.user_id === 'profile-B', [...rows.values()])
  phone.token = 'TOKEN-2'
  store.set('native-push-link-v1', 'stale')
  check('a rotated token: the new row saved, the old one removed', await np.keepNativePhoneLinked('profile-B') === 'linked' && rows.has('fcm:TOKEN-2') && !rows.has('fcm:TOKEN-1'), [...rows.keys()])
  phone.perm = 'denied'; phone.token = 'TOKEN-3'; store.set('native-push-link-v1', 'stale')
  check('notifications switched off in the phone\'s settings: not re-linked', await np.keepNativePhoneLinked('profile-B') === 'not_on' && !rows.has('fcm:TOKEN-3'), [...rows.keys()])
  phone.perm = 'granted'; phone.token = 'TOKEN-2'
  check('off: the row goes and the phone unregisters', await reach.turnOffPush() === true && rows.size === 0 && phone.unregistered === 1 && await np.nativePushState() === 'off')
  check('never re-linked once off (no prompt, no row)', await np.keepNativePhoneLinked('profile-B') === 'not_on' && rows.size === 0)

  console.log('\n4. A tap opens only a tab of this app; a message while open makes the chat re-read')
  check('the listeners are set up', await np.listenForNativePush() === true && !!phone.tap && !!phone.received)
  phone.tap!({ url: '/#/tab/exercise', messageId: 'm1' })
  const w = (globalThis as unknown as { window: { location: { hash: string } } }).window
  check('a tab it names opens', w.location.hash === '#/tab/exercise', w.location.hash)
  phone.tap!({ url: 'https://elsewhere.example/#/tab/chat' })
  check('anything else opens the chat, never a link out', w.location.hash === '#/tab/chat', w.location.hash)
  phone.tap!({ url: '/#/tab/chat/../../x' })
  check('...including a tab path with more after it', w.location.hash === '#/tab/chat', w.location.hash)
  const before = events.length
  phone.received!({ messageId: 'm2' })
  check('arriving while open: the chat is told', events.length === before + 1 && events[events.length - 1].type === 'coach-message', events.slice(before))

  // --- The server's half ------------------------------------------------------------------
  const fcm = await import('../supabase/functions/_shared/fcm')
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const sa = { client_email: 'coach@proj.iam.gserviceaccount.com', private_key: pem, project_id: 'proj-123' }

  console.log('\n5. The secret is read as Google writes it, and signed so Google can check it')
  check('the key file parses', !!fcm.parseServiceAccount(JSON.stringify({ ...sa, type: 'service_account' })))
  check('missing or broken: null, never a half-read', fcm.parseServiceAccount(undefined) === null && fcm.parseServiceAccount('{"client_email":"x"}') === null && fcm.parseServiceAccount('not json') === null)
  const jwt = await fcm.signedAssertion(sa, Date.UTC(2026, 10, 23, 12))
  const [h, c, s] = jwt.split('.')
  const verifier = createVerify('RSA-SHA256'); verifier.update(`${h}.${c}`)
  check('the signature verifies with the service account\'s public key', verifier.verify(publicKey, Buffer.from(s, 'base64url')))
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
  check('it asks for messaging only, from this account, for an hour', claims.scope === 'https://www.googleapis.com/auth/firebase.messaging' && claims.iss === sa.client_email && claims.aud === 'https://oauth2.googleapis.com/token' && claims.exp - claims.iat === 3600, claims)
  const escaped = { ...sa, private_key: pem.replace(/\n/g, '\\n') }
  const jwt2 = await fcm.signedAssertion(escaped, Date.UTC(2026, 10, 23, 12)).catch(() => '')
  check('a key pasted with its line breaks written as \\n still signs', jwt2 === jwt)

  console.log('\n6. What Android shows')
  const reply = fcm.fcmMessage('T', { title: 'Trainer', body: 'Nice work today.', moment: 'coach_reply', url: '/#/tab/chat', messageId: 42 })
  check('title and words as the browser shows them', reply.message.notification.title === 'Trainer' && reply.message.notification.body === 'Nice work today.')
  check('every data value is a string (Firebase refuses anything else)', Object.values(reply.message.data).every(v => typeof v === 'string') && reply.message.data.messageId === '42', reply.message.data)
  check('high priority, the coach channel, the reply tag', reply.message.android.priority === 'HIGH' && reply.message.android.notification.channel_id === 'coach' && reply.message.android.notification.tag === 'coach-chat', reply.message.android)
  const reminder = fcm.fcmMessage('T', { title: 'Trainer', body: 'Ready?', moment: 'session_morning', url: '/#/tab/exercise' }, { topic: 'coach' })
  check('a reminder takes the reminder tag and replaces the last one', reminder.message.android.notification.tag === 'coach' && (reminder.message.android as { collapse_key?: string }).collapse_key === 'coach', reminder.message.android)
  check('no title falls back to Trainer', fcm.fcmMessage('T', { body: 'x' }).message.notification.title === 'Trainer')
  check('the server\'s channel is the one the phone makes', fcm.COACH_CHANNEL_ID === np.COACH_CHANNEL_ID && fcm.FCM_PREFIX === np.FCM_PREFIX)

  console.log('\n7. Which answers mean "this phone is gone"')
  const calls: { url: string; body: string }[] = []
  let sendStatus = 200; let sendText = '{}'
  const fakeFetch = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body })
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 })
    return new Response(sendText, { status: sendStatus })
  }) as unknown as typeof fetch
  let now = Date.UTC(2026, 10, 23, 12)
  const send = fcm.makeFcmSender(sa, { fetch: fakeFetch, now: () => now })
  check('sent: ok', await send('fcm:TOK', { body: 'hi' }) === 'ok')
  const sent = calls.find(x => x.url.includes('messages:send'))
  check('to this project, for this token', !!sent && sent.url === 'https://fcm.googleapis.com/v1/projects/proj-123/messages:send' && JSON.parse(sent.body).message.token === 'TOK', sent?.url)
  await send('fcm:TOK', { body: 'again' })
  check('one access token for two sends inside the hour', calls.filter(x => x.url.includes('oauth2')).length === 1)
  now += 2 * 3600_000
  await send('fcm:TOK', { body: 'later' })
  check('a new access token once it has run out', calls.filter(x => x.url.includes('oauth2')).length === 2)
  sendStatus = 404; sendText = '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}'
  check('404 UNREGISTERED: gone (the row is dropped)', await send('fcm:TOK', { body: 'x' }) === 'gone')
  sendStatus = 400; sendText = '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}'
  check('UNREGISTERED in any answer: gone', await send('fcm:TOK', { body: 'x' }) === 'gone')
  sendStatus = 400; sendText = '{"error":{"status":"INVALID_ARGUMENT"}}'
  check('a bad message is our fault: failed, the phone is kept', await send('fcm:TOK', { body: 'x' }) === 'failed')
  sendStatus = 500; sendText = 'oops'
  check('Firebase down: failed, the phone is kept', await send('fcm:TOK', { body: 'x' }) === 'failed')
  check('a browser row is never sent through Firebase', await send('https://fcm.googleapis.com/fcm/send/abc', { body: 'x' }) === 'failed')

  console.log('\n8. The wiring')
  const strip = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const push = strip('supabase/functions/_shared/push.ts')
  const fcmAt = push.indexOf('startsWith(FCM_PREFIX)'); const subAt = push.indexOf('server.subscribe(')
  check('push.ts sends an fcm: row through Firebase before the browser route', fcmAt > 0 && subAt > 0 && fcmAt < subAt, { fcmAt, subAt })
  check('a missing secret is failed, never gone', /if \(!sa\)[^}]*return "failed"/.test(push))
  const rs = strip('src/lib/coach-reach-out.ts')
  check('Profile\'s switch reads, turns on and turns off the phone app\'s way', /inPhoneApp\(\)\) return await \(await import\('\.\/native-push'\)\)\.nativePushState\(\)/.test(rs) && /inPhoneApp\(\)\) return await \(await import\('\.\/native-push'\)\)\.turnOnNativePush\(/.test(rs) && /inPhoneApp\(\)\) return await \(await import\('\.\/native-push'\)\)\.turnOffNativePush\(\)/.test(rs))
  check('Home re-links the phone app daily', /m\.keepNativePhoneLinked\(id\)/.test(strip('src/components/Dashboard.tsx')))
  check('the start listens for taps', /listenForNativePush\(\)/.test(strip('src/main.tsx')))
  check('the chat re-reads on the phone app\'s message', /addEventListener\('coach-message'/.test(strip('src/components/ChatAssistant.tsx')))
  check('the plugin is loaded by a dynamic import only', /await import\('@capacitor\/push-notifications'\)/.test(strip('src/lib/native-push.ts')) && !/^import[^\n]*@capacitor\/push-notifications/m.test(readFileSync('src/lib/native-push.ts', 'utf8')))
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
  check('Android declares the notification permission and the coach channel', /android\.permission\.POST_NOTIFICATIONS/.test(manifest) && /default_notification_channel_id"\s*android:value="coach"/.test(manifest))
  check('the Firebase file is applied when present (the build reads google-services.json)', /google-services\.json/.test(readFileSync('android/app/build.gradle', 'utf8')))
}

main().then(() => {
  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('Notifications in the phone app hold.')
}, err => { console.error(err); console.log(`\n${ran} checks ran`); process.exit(1) })
