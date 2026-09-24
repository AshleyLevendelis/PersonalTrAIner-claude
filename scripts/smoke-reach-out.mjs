// ---------------------------------------------------------------------------
// THE REAL coach-reach-out FILE, RUN FOR REAL, AGAINST A FAKE WORLD.
//
// test:reach-out drives the decision loop with fakes. This runs the edge
// function file itself — the one that will be deployed — in an actual Deno
// process, with its real imports fetched from jsr, against:
//   - a fake PostgREST holding one person who is due a nudge, and
//   - a fake push endpoint that DECRYPTS what arrives, per RFC 8291, with the
//     subscriber keys this script made up — so a push the library encrypted
//     wrongly fails here instead of silently on her phone.
//
// It proves the file parses, resolves its imports, reads the tables it
// names, signs with the key format scripts/generate-vapid-keys.mjs emits,
// refuses a caller without the secret, and records what it sent. It does NOT
// prove Apple or Google accept the push — that is a real phone.
//
// Needs network for the first run (Deno from npm, the library from jsr).
//   npm run verify:reach-out-function
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { spawn } from 'child_process'
import { webcrypto, createECDH, createHmac, createDecipheriv, randomBytes } from 'crypto'

let failures = 0
let ran = 0
const check = (label, ok, extra) => {
  ran++
  if (ok) console.log(`    ✓ ${label}`)
  else { failures++; console.error(`    ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const wait = ms => new Promise(r => setTimeout(r, ms))

// --- keys ----------------------------------------------------------------------
const { subtle } = webcrypto
const vapid = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const VAPID_KEYS = JSON.stringify({ publicKey: await subtle.exportKey('jwk', vapid.publicKey), privateKey: await subtle.exportKey('jwk', vapid.privateKey) })
const vapidPublic = Buffer.from(await subtle.exportKey('raw', vapid.publicKey)).toString('base64url')
// The phone's side of a subscription: an ECDH key pair and a 16-byte auth secret.
const ua = createECDH('prime256v1'); ua.generateKeys()
const uaPublic = ua.getPublicKey()
const authSecret = randomBytes(16)

// --- RFC 8291 decryption, the phone's half ---------------------------------------
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
const expand = (prk, info, len) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len)
function decrypt(body) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const ciphertext = body.subarray(21 + idlen)
  const shared = ua.computeSecret(asPublic)
  const prkKey = hmac(authSecret, shared)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic])
  const ikm = expand(prkKey, keyInfo, 32)
  const prk = hmac(salt, ikm)
  const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
  const plain = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()])
  let end = plain.length - 1
  while (end >= 0 && plain[end] === 0) end--
  return plain.subarray(0, end).toString('utf8') // drop the 0x02 delimiter
}

// --- the fake world ------------------------------------------------------------------
const USER = '11111111-1111-4111-8111-111111111111'
// A CHECK MUST GIVE THE SAME ANSWER AT ANY HOUR (CLAUDE.md). The person lives
// in whichever fixed-offset zone makes it 19:00 for them right now, so every
// run exercises the evening nudge. Etc/GMT signs are inverted: UTC+7 is
// "Etc/GMT-7". Offsets run -12..+14, which covers every hour.
const now = new Date()
let offset = (19 - now.getUTCHours() + 24) % 24
if (offset > 14) offset -= 24
const ZONE = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'long', hour: 'numeric', hourCycle: 'h23' })
  .formatToParts(now).map(p => [p.type, p.value]))
const hour = Number(parts.hour)
const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const daysBefore = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }
const writes = []
const reads = []
const pushes = []
let dbPort = 0
const db = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const table = url.pathname.replace('/rest/v1/', '')
  let body = ''
  for await (const c of req) body += c
  if (req.method === 'GET') reads.push({ table, query: decodeURIComponent(url.search) })
  if (req.method !== 'GET') { writes.push({ method: req.method, table, query: url.search, body: body ? JSON.parse(body) : null }); res.writeHead(201); res.end(); return }
  const rows = {
    push_subscriptions: [{ id: 'sub-1', user_id: USER, endpoint: `http://127.0.0.1:${dbPort}/push/1`, p256dh: uaPublic.toString('base64url'), auth: authSecret.toString('base64url'), timezone: ZONE }],
    coach_moment_facts: [{ user_id: USER, training_weekdays: [parts.weekday], plan_ends_on: '2099-01-01' }],
    fitness_profiles: [{ id: USER, notification_switches: {} }],
    exercise_set_logs: [], cardio_logs: [], workout_sessions: [], pending_actions: [], coach_notifications_sent: [],
  }[table]
  if (!rows) { res.writeHead(404); res.end(JSON.stringify({ message: `no table ${table}` })); return }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rows))
})
db.on('request', (req) => {
  if (!req.url.startsWith('/push/')) return
})
// The push endpoint shares the server: POST /push/1.
const origEmit = db.emit.bind(db)
db.emit = (ev, req, res) => {
  if (ev === 'request' && req.url.startsWith('/push/')) {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      pushes.push({ headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(201); res.end()
    })
    return true
  }
  return origEmit(ev, req, res)
}
await new Promise(r => db.listen(0, r))
dbPort = db.address().port

const FN_PORT = 8765
const deno = spawn('npx', ['-y', 'deno@2.9.6', 'run', '--allow-net', '--allow-env', '--no-lock', '--quiet', 'supabase/functions/coach-reach-out/index.ts'], {
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    VAPID_KEYS, REACH_OUT_SECRET: 'shh', VAPID_CONTACT: 'mailto:test@example.com',
    DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN_PORT}`, PORT: String(FN_PORT),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  // ITS OWN PROCESS GROUP, so the whole tree can be stopped. Killing npx alone
  // left the Deno server under it listening, and the NEXT run then measured
  // that stale server — old keys, a dead database port — and failed in ways
  // that looked like the function's fault.
  detached: true,
})
const stopDeno = () => { try { process.kill(-deno.pid, 'SIGTERM') } catch { /* already gone */ } }
process.on('exit', stopDeno)
let log = ''
deno.stdout.on('data', d => { log += d })
deno.stderr.on('data', d => { log += d })
const base = `http://127.0.0.1:${FN_PORT}/`
// A server already on the port would be measured instead of this one.
try { await fetch(`${base}?vapid`); console.error(`port ${FN_PORT} is already answering — a stale run is still up. Stop it first.`); stopDeno(); db.close(); process.exit(1) } catch { /* free: good */ }
let up = false
for (let i = 0; i < 240 && !up; i++) { try { await fetch(`${base}?vapid`); up = true } catch { await wait(500) } }

console.log('\nTHE REAL coach-reach-out FILE, RUN FOR REAL\n')
check('0. the function starts and answers (imports resolved, file parses)', up, log.slice(-600))
try {
  const key = await fetch(`${base}?vapid`).then(r => r.json()).catch(() => ({}))
  check('1. it hands out the PUBLIC key a phone subscribes with', key.publicKey === vapidPublic, key)
  const refused = await fetch(base, { method: 'POST' })
  check('2. a run without the secret is refused', refused.status === 403, refused.status)
  const res = await fetch(base, { method: 'POST', headers: { 'x-reach-out-secret': 'shh' } })
  const report = await res.json().catch(() => ({}))
  check(`3. a run with it reports on the one person (their hour: ${hour}, ${ZONE})`, res.status === 200 && report.people === 1 && hour === 19, { status: res.status, report, hour, log: log.slice(-400) })
  check('4. an evening training day with nothing logged sends one push', pushes.length === 1 && report.sent === 1, { pushes: pushes.length, report })
  let payload = null
  try { payload = JSON.parse(decrypt(pushes[0].body)) } catch (err) { payload = { error: String(err) } }
  check('5. what arrives decrypts, with the phone\'s own keys, to the phrasebook\'s words',
    payload?.moment === 'session_not_logged' && payload?.body === "today's session is still waiting — got twenty minutes?", payload)
  check('6. ...signed with the VAPID key it advertised', String(pushes[0]?.headers.authorization ?? '').includes(`k=${vapidPublic}`), pushes[0]?.headers.authorization)
  check('7. and what was sent is recorded, so the next hour stays quiet',
    writes.some(w => w.method === 'POST' && w.table === 'coach_notifications_sent' && w.body?.moment === 'session_not_logged' && w.body?.user_id === USER), writes)
  // THE SERVICE KEY BYPASSES ROW-LEVEL SECURITY, so the function's own filters
  // are the only thing keeping one person's logs out of another's nudge. Every
  // per-person read must name this person — checked on the reads it actually
  // made, not on the source.
  const PER_PERSON = ['coach_moment_facts', 'fitness_profiles', 'exercise_set_logs', 'cardio_logs', 'workout_sessions', 'pending_actions', 'coach_notifications_sent']
  const unscoped = PER_PERSON.filter(tbl => {
    const mine = reads.filter(r => r.table === tbl)
    return mine.length === 0 || mine.some(r => !new RegExp(`(user_id|profile_id|id)=eq\\.${USER}(&|$)`).test(r.query.slice(1)))
  })
  check('8. every per-person read was filtered to this person (the service key sees everyone)', unscoped.length === 0, { unscoped, reads })
  // THE TEST PUSH: the phone's words, to that person only, and nothing
  // recorded — it must not use up the day's one real notification.
  const recordedBefore = writes.filter(w => w.table === 'coach_notifications_sent').length
  const tested = await fetch(base, { method: 'POST', headers: { 'x-reach-out-secret': 'shh', 'Content-Type': 'application/json' }, body: JSON.stringify({ test: USER }) })
  const testReport = await tested.json().catch(() => ({}))
  let testPayload = null
  try { testPayload = JSON.parse(decrypt(pushes[1].body)) } catch (err) { testPayload = { error: String(err) } }
  check('9. a test push reaches THAT person\'s phones only, in words saying it is a test',
    tested.status === 200 && testReport.devices === 1 && reads.some(r => r.table === 'push_subscriptions' && r.query.includes(`user_id=eq.${USER}`)) && pushes.length === 2 && testPayload?.body === 'Reminders are working on this phone.', { status: tested.status, testReport, testPayload })
  check('10. ...and is not recorded as the day\'s notification',
    writes.filter(w => w.table === 'coach_notifications_sent').length === recordedBefore, writes)
  const noSecretTest = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: USER }) })
  check('11. ...and needs the secret like everything else', noSecretTest.status === 403 && pushes.length === 2, noSecretTest.status)
  const setRead = reads.find(r => r.table === 'exercise_set_logs')?.query ?? ''
  check(`12. ...and the logs were read from five weeks before THEIR today (${localToday}), not the server's`,
    setRead.includes(`completed_at=gte.${daysBefore(localToday, 35)}`), setRead)
} finally {
  stopDeno(); db.close()
}
console.log(`\nreach-out-function: ${ran} checks ran`)
console.log(failures === 0 ? 'The deployable file runs, and what it pushes decrypts to the right words.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
