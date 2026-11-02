// ---------------------------------------------------------------------------
// THE RUNNING-TIMER CHIP TAKES HER TO THE TIMER, FROM ANY TAB (1 Nov 2026, whole-app test). The chip at the bottom
// asked the Exercise screen to open the timers, so on Home, Nutrition and Tools a tap did nothing. Whole app
// (app-boot.html): a stopwatch is started on Tools, she goes to Home and to Nutrition, and taps the chip. PORT 9547.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9547, page: 'app-boot.html', name: 'timer-chip' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const CHIP = `[...document.querySelectorAll('button')].find(b => /^Stopwatch · \\d/.test((b.textContent || '').trim()))`
const sheetOpen = () => ev(`[...document.querySelectorAll('[role=dialog]')].some(x => /Stopwatch/.test(x.innerText))`)

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/tools'`); await wait(1800)
await clickAt(btn('/^Stopwatch/')); await wait(800)
await clickAt(`[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Start')`); await wait(1200)
await clickAt(`[...document.querySelectorAll('[role=dialog] button')].find(b => /Back to the timer list/.test(b.getAttribute('aria-label') || ''))`); await wait(800)
check('2. a stopwatch is running, and its sheet is closed', (await sheetOpen()) === false)

for (const tab of ['dashboard', 'nutrition', 'tools']) {
  await ev(`location.hash = '#/tab/${tab}'`); await wait(1500)
  const chip = await until(() => ev(`!!(${CHIP})`), v => v === true, 20)
  check(`3. ${tab}: the chip is there`, chip === true)
  await clickAt(CHIP); await wait(1200)
  const where = await ev(`({ hash: location.hash, sheet: [...document.querySelectorAll('[role=dialog]')].some(x => /Stopwatch/.test(x.innerText)) })`)
  check(`4. ${tab}: tapping it opens the stopwatch, on Tools`, /#\/tab\/tools/.test(where?.hash ?? '') && where?.sheet === true, where)
  if (tab === 'nutrition') await shoot('timer-chip-opened')
  await clickAt(`[...document.querySelectorAll('[role=dialog] button')].find(b => /Back to the timer list/.test(b.getAttribute('aria-label') || ''))`); await wait(700)
}
await finish('verify:timer-chip PASSED')
