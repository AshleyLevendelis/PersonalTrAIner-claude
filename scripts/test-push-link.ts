// This phone stays linked to the profile on screen (his report 17 Nov 2026: test pushes arrived, daily reminders never
// did; he had started a new profile the day before, which deletes the old profile's phone rows while the phone itself
// still says yes). Holds: a phone that said yes is written for THIS profile; once a day, again on a new day, a new
// profile or a new timezone; never for a phone that has not said yes; a failed write is tried again; and Home calls it.
import { readFileSync } from 'node:fs'
import { keepPhoneLinked, type PushLinkDeps } from '../src/lib/push-link'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P', auth: 'A' } }
function world(over: Partial<PushLinkDeps> = {}) {
  const saved: Record<string, string>[] = []
  const store = new Map<string, string>()
  let day = '2026-11-17'
  let tz = 'Europe/London'
  const deps: PushLinkDeps = {
    subscription: async () => SUB,
    save: async (row) => { saved.push(row); return { error: null } },
    timezone: () => tz,
    today: () => day,
    memo: { get: k => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } },
    ...over,
  }
  return { deps, saved, setDay: (d: string) => { day = d }, setTz: (t: string) => { tz = t } }
}

async function main() {
  console.log('1. A phone that said yes is linked to the profile on screen')
  const w = world()
  const first = await keepPhoneLinked('new-profile', w.deps)
  check('his case: the new profile gets this phone', first === 'linked' && w.saved.length === 1 && w.saved[0].user_id === 'new-profile', w.saved)
  check('...with the phone\'s own keys and timezone', w.saved[0]?.endpoint === SUB.endpoint && w.saved[0]?.p256dh === 'P' && w.saved[0]?.auth === 'A' && w.saved[0]?.timezone === 'Europe/London', w.saved[0])

  console.log('\n2. Once a day, and again when anything changes')
  check('a second open the same day writes nothing', (await keepPhoneLinked('new-profile', w.deps)) === 'already_today' && w.saved.length === 1, w.saved.length)
  w.setDay('2026-11-18')
  check('the next day it is written again (a row the server dropped comes back)', (await keepPhoneLinked('new-profile', w.deps)) === 'linked' && w.saved.length === 2, w.saved.length)
  check('another profile on the same phone the same day is linked at once', (await keepPhoneLinked('other-profile', w.deps)) === 'linked' && w.saved.at(-1)?.user_id === 'other-profile', w.saved.at(-1))
  w.setTz('America/New_York')
  check('a new timezone is written at once (the reminders follow his clock)', (await keepPhoneLinked('other-profile', w.deps)) === 'linked' && w.saved.at(-1)?.timezone === 'America/New_York', w.saved.at(-1))

  console.log('\n3. Never for a phone that has not said yes')
  const off = world({ subscription: async () => null })
  check('no subscription: nothing written', (await keepPhoneLinked('p', off.deps)) === 'not_on' && off.saved.length === 0)
  const bad = world({ subscription: async () => ({ endpoint: SUB.endpoint, keys: {} }) })
  check('a subscription with no keys: nothing written', (await keepPhoneLinked('p', bad.deps)) === 'not_on' && bad.saved.length === 0)
  const none = world({ subscription: async () => 'unsupported' })
  check('a phone that cannot take notifications: nothing written', (await keepPhoneLinked('p', none.deps)) === 'unsupported' && none.saved.length === 0)
  const throws = world({ subscription: async () => { throw new Error('no worker') } })
  const thrown = await keepPhoneLinked('p', throws.deps).catch(() => 'threw')
  check('a phone whose check throws: nothing written, no crash', thrown === 'unsupported' && throws.saved.length === 0, thrown)
  const noProfile = world()
  check('no profile yet: nothing written', (await keepPhoneLinked('', noProfile.deps)) === 'not_on' && noProfile.saved.length === 0)

  console.log('\n4. A failed write is tried again')
  let fail = true
  const flaky = world({ save: async () => ({ error: fail ? { message: 'offline' } : null }) })
  const origErr = console.error; console.error = () => {}
  const r1 = await keepPhoneLinked('p', flaky.deps)
  console.error = origErr
  fail = false
  const r2 = await keepPhoneLinked('p', flaky.deps)
  check('failed, then linked on the next open the same day', r1 === 'failed' && r2 === 'linked', [r1, r2])

  console.log('\n5. Wired')
  const dash = readFileSync('src/components/Dashboard.tsx', 'utf8').replace(/\/\/.*$/gm, '')
  check('Home links the phone for the profile it shows', /keepPhoneLinked\(profile\.id\)/.test(dash))
  const src = readFileSync('src/lib/push-link.ts', 'utf8').replace(/\/\/.*$/gm, '')
  check('the real write is the turn-on tap\'s upsert, keyed by the phone', /from\('push_subscriptions'\)\.upsert\(row, \{ onConflict: 'endpoint' \}\)/.test(src))
  check('never asks for permission (only reads it)', !/requestPermission|pushManager\.subscribe\(/.test(src) && /Notification\.permission !== 'granted'/.test(src))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
  console.log('All push-link checks passed.')
}
main().catch(e => { console.error(e); process.exit(1) })
