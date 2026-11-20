// verify:health-steps — STEPS FROM THE PHONE (20 Nov 2026, his "Start on the App Store version with step counting").
//
// The phone's health store is pretended (fake-health.ts, ?health=ios|android): no browser can read a real one. What
// this proves is the app's half: Profile offers the switch only in the phone app, asks the phone for steps and
// nothing else, says what it reads, handles a refusal and a missing Health Connect, and Home fills its ring from the
// phone's count, keeps a bigger number he typed, and names where the number came from. What it cannot prove is the
// phone's half: Apple's and Google's own permission sheets and real step counts. That needs a real phone.
//
// Every check runs every time with a null-safe subject. PORT 9977.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9977, page: 'profile.html', name: 'health-steps', timeoutMs: 300_000 })
const { send, ev, check, wait, go, until, shoot, clickAt, finish } = d

const ROW = 'Steps from your phone'
const rowValue = () => ev(`document.querySelector('[data-profile-row=${JSON.stringify(ROW)}]')?.textContent ?? null`)
const sheet = () => ev(`document.querySelector('[data-profile-sheet="health"]')?.textContent ?? ''`)
const state = () => ev(`document.querySelector('[data-health-steps]')?.getAttribute('data-health-steps') ?? null`)
const calls = () => ev(`JSON.stringify(window.__healthCalls ?? null)`)
const openProfile = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
  await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
  await until(() => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`), v => v === true, 60)
  await wait(500)
}
const openSheet = async () => {
  await ev(`document.querySelector('[data-profile-row=${JSON.stringify(ROW)}]')?.click()`)
  await until(() => ev(`!!document.querySelector('[data-profile-sheet="health"]')`), v => v === true, 30)
  await wait(300)
}
const tap = async sel => { await ev(`document.querySelector('${sel}')?.click()`); await wait(700) }

console.log('\n  1. IN A BROWSER THERE IS NO SWITCH')
await openProfile('')
check('1a. no "Steps from your phone" row when the app is not the phone app', (await rowValue()) === null, await rowValue())

console.log('\n  2. ON AN IPHONE: OFFERED, ASKED FOR STEPS ONLY, THEN ON')
await openProfile('&health=ios')
check('2a. the row is there and says Off', /Off/.test((await rowValue()) ?? ''), await rowValue())
await openSheet()
check('2b. the sheet names Apple Health and says it reads steps only and writes nothing', /Apple Health/.test(await sheet()) && /steps only/.test(await sheet()) && /writes nothing/.test(await sheet()), await sheet())
check('2c. nothing was asked of the phone before the tap', (await calls()) === '[]', await calls())
await tap('[data-health-connect]')
const iosCalls = JSON.parse((await calls()) ?? '[]')
check('2d. the tap asked the phone for steps and nothing else', iosCalls.some(c => c && JSON.stringify(c.request) === '["steps"]') && !iosCalls.some(c => c && c.request && JSON.stringify(c.request) !== '["steps"]'), iosCalls)
check('2e. it is now on, and says where to look if the count stays at 0', (await state()) === 'on' && /Data Access/.test(await sheet()), await sheet())
await shoot('health-steps-2-ios-on')
check('2f. it is remembered on the phone', (await ev(`localStorage.getItem('fitplan_health_steps_connected')`)) === '1')
await ev(`document.querySelector('[data-profile-back]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-profile-sheet]')`), v => v === false, 20)
check('2g. the row now reads "On · Apple Health"', /On · Apple Health/.test((await rowValue()) ?? ''), await rowValue())
await openSheet()
await tap('[data-health-off]')
check('2h. "Stop reading steps" turns it off and forgets it', (await state()) === 'off' && (await ev(`localStorage.getItem('fitplan_health_steps_connected')`)) === null)

console.log('\n  3. ANDROID: A REFUSAL, AND NO HEALTH CONNECT')
await ev(`localStorage.removeItem('fitplan_health_steps_connected')`)
await openProfile('&health=android&healthdenied=1')
await openSheet()
check('3a. on Android the sheet names Health Connect', /Health Connect/.test(await sheet()), await sheet())
await tap('[data-health-connect]')
check('3b. a refused permission says so and stays off', (await state()) === 'off' && /weren’t allowed/.test(await ev(`document.querySelector('[data-health-note]')?.textContent ?? ''`)), await ev(`document.querySelector('[data-health-note]')?.textContent ?? null`))
await openProfile('&health=android&healthmissing=1')
await openSheet()
await tap('[data-health-connect]')
check('3c. with no Health Connect it says where to get it, and stays off', (await state()) === 'off' && /Play Store/.test(await ev(`document.querySelector('[data-health-note]')?.textContent ?? ''`)), await ev(`document.querySelector('[data-health-note]')?.textContent ?? null`))
check('3d. ...and never asked for permission it could not use', !JSON.parse((await calls()) ?? '[]').some(c => c && c.request))

console.log('\n  4. HOME: THE RING FILLS FROM THE PHONE, A BIGGER TYPED NUMBER STANDS')
// The whole app, on the page that starts it the way the phone does.
await send('Page.navigate', { url: `${d.origin}/.tour-harness/app-boot.html?load=h1&health=ios&healthon=1&healthsteps=6400` })
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
await wait(2000)
const NOT_NOW = `[...document.querySelectorAll('button')].find(b => /^Not now$/.test(b.innerText.trim()))`
if (await ev(`!!(${NOT_NOW})`)) { await clickAt(NOT_NOW); await wait(600) }
const stepsRow = () => ev(`(() => { const r = (window.__fakeDb && window.__fakeDb.daily_steps) || []; const x = r[r.length - 1]; return x ? { steps: x.steps, source: x.source, n: r.length } : null })()`)
const sourceLine = () => ev(`document.querySelector('[data-home-steps-source]')?.textContent ?? null`)
const ringText = () => ev(`document.querySelector('[data-home-rings] > :nth-child(4)')?.textContent ?? document.querySelector('[data-home-rings]')?.lastElementChild?.textContent ?? null`)
await until(stepsRow, v => v != null, 40)
check('4a. opening Home saved the phone\'s 6,400 as the day\'s steps, marked as from Apple Health', JSON.stringify(await stepsRow()) === JSON.stringify({ steps: 6400, source: 'healthkit', n: 1 }), await stepsRow())
check('4b. the ring shows it, and says it came from Apple Health', /6[.,]?4/.test((await ringText()) ?? '') && (await sourceLine()) === 'From Apple Health', { ring: await ringText(), source: await sourceLine() })
await shoot('health-steps-4-home')
// He types a bigger number (the phone was left in a bag).
const RING = `document.querySelector('[data-home-rings] > :nth-child(4) button, [data-home-rings] > :nth-child(4)')`
await clickAt(RING); await wait(400)
check('4c. the open box says the higher of the two numbers is kept', /higher is kept/.test(await ev(`document.querySelector('[data-home-steps-health-note]')?.textContent ?? ''`)))
await ev(`(() => { const el = document.querySelector('[aria-label="Steps today"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '9000'); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await clickAt(`[...document.querySelectorAll('button')].find(b => /^Log steps$/.test(b.innerText.trim()))`); await wait(800)
check('4d. his 9,000 is saved as his', JSON.stringify(await stepsRow()) === JSON.stringify({ steps: 9000, source: 'manual', n: 1 }), await stepsRow())
await ev(`document.dispatchEvent(new Event('visibilitychange'))`); await wait(800)
check('4e. coming back to the app with the phone still at 6,400 does NOT lower his 9,000', JSON.stringify(await stepsRow()) === JSON.stringify({ steps: 9000, source: 'manual', n: 1 }), await stepsRow())
check('4f. ...and a typed number names no source', (await sourceLine()) === null, await sourceLine())
await ev(`window.__healthSteps = 12000; document.dispatchEvent(new Event('visibilitychange'))`); await wait(800)
check('4g. once the phone passes it (12,000), the phone\'s count takes over', JSON.stringify(await stepsRow()) === JSON.stringify({ steps: 12000, source: 'healthkit', n: 1 }), await stepsRow())
const asked = JSON.parse((await calls()) ?? '[]').filter(c => c && c.steps)
check('4h. it asked the phone for today only: local midnight to now', asked.length >= 2 && asked.every(c => new Date(c.steps[0]).getHours() === 0 && new Date(c.steps[0]).getMinutes() === 0 && new Date(c.steps[1]) > new Date(c.steps[0])), asked.slice(0, 2))

console.log('\n  5. WITH IT SWITCHED OFF, HOME NEVER ASKS THE PHONE')
await send('Page.navigate', { url: `${d.origin}/.tour-harness/app-boot.html?load=h2&health=ios&healthsteps=6400` })
await ev(`localStorage.removeItem('fitplan_health_steps_connected')`)
await send('Page.navigate', { url: `${d.origin}/.tour-harness/app-boot.html?load=h3&health=ios&healthsteps=6400` })
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
await wait(2500)
check('5a. switched off: no step count read from the phone and none saved', !JSON.parse((await calls()) ?? '[]').some(c => c && c.steps) && (await stepsRow()) === null, { calls: await calls(), row: await stepsRow() })

await finish('verify:health-steps passed: the phone switch, the permission asked, and Home filling its steps ring from the phone.')
