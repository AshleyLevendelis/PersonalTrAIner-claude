// ---------------------------------------------------------------------------
// A SHORT REST AFTER THE LAST WARM-UP, NONE BETWEEN THE OTHERS (24 Nov 2026, his "build it"; warmup-rest.ts).
// The whole app (app-boot.html, ?session-day: today trains a squat with a ramp of three or more rows). The first
// warm-up is ticked by hand: no rest. The rest are logged with one tap: a rest appears where the build-up folded,
// right above Set 1, counting down to it, no longer than two minutes. Set 1 is ticked: that rest is replaced by the working rest,
// under Set 1. Every check runs every time, with null-safe subjects. PORT 9588.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9588, page: 'app-boot.html', name: 'warmup-rest' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
/** Where the on-card rest sits: which tick buttons come before and after it, and its clock in seconds. */
const restAt = () => ev(`(() => {
  const rest = document.querySelector('[data-testid="inline-rest"]')
  if (!rest) return null
  const ticks = [...document.querySelectorAll('button[aria-label]')].filter(b => /^(Save )?(warm-up|set) \\d+/i.test(b.getAttribute('aria-label')))
  const before = ticks.filter(b => b.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING).pop()
  const after = ticks.find(b => b.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_PRECEDING)
  const m = /(\\d+):(\\d\\d)/.exec(document.querySelector('[data-testid="inline-rest-clock"]')?.textContent ?? '')
  return { before: before?.getAttribute('aria-label') ?? null, after: after?.getAttribute('aria-label') ?? null, seconds: m ? Number(m[1]) * 60 + Number(m[2]) : null }
})()`)

await go('&session-day=1')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/exercise'`); await wait(2000)
await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1200)
// The sets before the squat (its movement prep) are logged with the big button until it names the squat's ramp.
for (let i = 0; i < 8 && !/Squat|Warm-up/.test(await ev(`document.querySelector('[data-next-set-button]')?.textContent ?? 'Squat'`)); i++) {
  await clickAt(`document.querySelector('[data-next-set-button]')`); await wait(900)
}
await ev(`document.querySelector('[data-testid="inline-rest-skip"]')?.click()`); await wait(400)
const N = await ev(`document.querySelectorAll('button[aria-label^="Save warm-up"]').length`)
check('2. today\'s squat has three or more warm-up rows (the case binds)', N >= 3, N)

await clickAt(`document.querySelector('button[aria-label^="Save warm-up 1"]')`); await wait(1000)
const r1 = await restAt()
check('3. ticking the FIRST warm-up starts no rest', r1 === null, r1)

await clickAt(`document.querySelector('[data-testid="log-all-warmups"]')`); await wait(1500)
const r2 = await until(restAt, v => !!v, 15)
await shoot('warmup-rest-after-last')
// The build-up folds shut once every row is logged, so the rest is drawn where the fold was: after every warm-up tick
// (none on screen once folded) and right before Set 1.
check(`4. after the LAST warm-up a rest appears on the card, right before Set 1`,
  /^Save set 1$/i.test(r2?.after ?? '') && !/^Set \d/i.test(r2?.before ?? ''), r2)
check('5. ...a short one: more than 40 seconds, never over two minutes', (r2?.seconds ?? 0) > 40 && (r2?.seconds ?? 999) <= 120, r2)

await clickAt(`document.querySelector('button[aria-label="Save set 1"]')`); await wait(1200)
const r3 = await until(restAt, v => !!v && /^Set 1/i.test(v.before ?? ''), 15)
await shoot('warmup-rest-after-set-1')
check('6. ticking Set 1 moves the rest under Set 1 (the working rest takes over)', /^Set 1/i.test(r3?.before ?? ''), r3)
check('7. ...and none is left under the warm-ups', (await ev(`document.querySelectorAll('[data-testid="inline-rest"]').length`)) === 1)

await finish('verify:warmup-rest PASSED')
