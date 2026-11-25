// verify:heart-strap — A HEART RATE STRAP, LIVE (option 3, 25 Nov 2026; docs/plans/live-heart-rate.md, strap-live.ts).
//
// The strap is pretended (fake-strap.ts, ?strap=1): it sends the real notification bytes, which the app's own parser
// reads. What this proves is the app's half: Profile offers "Find my strap" only in the phone app, asks Bluetooth for
// nothing before the tap, remembers the strap and says it is connected with the live number; the countdown, the round
// timer and today's workout show "♥ N" while readings arrive and nothing when they stop or the strap goes out of range;
// a reading taken without skin contact is never shown; Forget forgets. What it cannot prove is a real strap pairing on a
// real phone: that is stage 3, on his phone.
//
// Every check runs every time with a null-safe subject. PORT 9979.
import { startDriver } from './driver-kit.mjs'

const P = await startDriver({ port: 9979, page: 'profile.html', name: 'heart-strap', timeoutMs: 300_000 })
const { ev, check, wait, go, until, shoot, clickAt, finish } = P

const section = () => ev(`document.querySelector('[data-heart-strap]')?.textContent ?? null`)
const paired = () => ev(`document.querySelector('[data-heart-strap]')?.getAttribute('data-heart-strap') ?? null`)
const status = () => ev(`document.querySelector('[data-heart-strap-status]')?.textContent ?? null`)
const calls = () => ev(`JSON.stringify(window.__strapCalls ?? null)`)
const openSheet = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
  await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
  await until(() => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`), v => v === true, 60)
  await ev(`document.querySelector('[data-profile-row="Steps from your phone"]')?.click()`)
  await until(() => ev(`!!document.querySelector('[data-heart-strap]')`), v => v === true, 40)
  await wait(300)
}

console.log('\n  A. IN A BROWSER THERE IS NO STRAP ROW')
await go('&strap=1')
await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`), v => v === true, 60)
check('A1. outside the phone app, nothing offers a strap', (await ev(`!!document.querySelector('[data-heart-strap]') || !!document.querySelector('[data-profile-row="Steps from your phone"]')`)) === false)

console.log('\n  B. PAIRING ON THE PHONE')
await ev(`localStorage.removeItem('fitplan_heart_strap')`)
await openSheet('&health=android&strap=1')
check('B1. the row is there, says what it does, and that readings stay on this phone', /Heart rate strap/.test((await section()) ?? '') && /live/.test((await section()) ?? '') && /stay on this phone/.test((await section()) ?? ''), await section())
check('B2. nothing was asked of Bluetooth before the tap', (await calls()) === '[]', await calls())
await clickAt(`document.querySelector('[data-heart-strap-find]')`)
await until(paired, v => v === 'paired', 30)
const c1 = JSON.parse((await calls()) ?? '[]')
check('B3. the tap opened the phone\'s picker, then connected to the strap chosen', c1[0] === 'pick' && c1[1]?.connect === 'C0:FF:EE', c1)
check('B4. the strap is named and remembered on this phone', /Polar H10 1A2B3C/.test((await section()) ?? '') && /C0:FF:EE/.test((await ev(`localStorage.getItem('fitplan_heart_strap')`)) ?? ''), await section())
check('B5. connected with no reading yet says so, never a number', /waiting for a reading/.test((await status()) ?? ''), await status())
await ev(`window.__strapSend(148)`)
await until(status, v => /♥ 148/.test(v ?? ''), 20)
check('B6. a reading shows as "Connected · ♥ 148"', (await status()) === 'Connected · ♥ 148', await status())
await shoot('heart-strap-1-paired')
await ev(`window.__strapNoContact(171)`)
await wait(400)
check('B7. a reading the strap took without skin contact is not shown', (await status()) === 'Connected · ♥ 148', await status())
await ev(`window.__strapDrop()`)
await until(status, v => /Not in range/.test(v ?? ''), 20)
check('B8. the strap going out of range says so and drops the number, with Connect to try again', (await status()) === 'Not in range' && (await ev(`!!document.querySelector('[data-heart-strap-reconnect]')`)) === true, await status())
await clickAt(`document.querySelector('[data-heart-strap-reconnect]')`)
await until(status, v => /waiting/.test(v ?? ''), 20)
check('B9. Connect connects again', /waiting for a reading/.test((await status()) ?? ''), await status())
await clickAt(`document.querySelector('[data-heart-strap-forget]')`)
await until(paired, v => v === 'none', 20)
const c2 = JSON.parse((await calls()) ?? '[]')
check('B10. Forget forgets the strap on this phone and lets it go', (await ev(`localStorage.getItem('fitplan_heart_strap')`)) === null && c2.some(c => c?.disconnect === 'C0:FF:EE') && (await ev(`!!document.querySelector('[data-heart-strap-find]')`)) === true, c2)

console.log('\n  C. THE PICKER CLOSED WITH NOTHING CHOSEN')
await openSheet('&health=android&strap=1&strapnone=1')
await clickAt(`document.querySelector('[data-heart-strap-find]')`)
await wait(800)
check('C1. nothing is paired and nothing complains', (await paired()) === 'none' && (await ev(`!!document.querySelector('[data-heart-strap-note]')`)) === false && (await ev(`localStorage.getItem('fitplan_heart_strap')`)) === null)

await finish('verify:heart-strap (Profile) passed: the strap pairs on the phone, says it is connected, and forgets.')
