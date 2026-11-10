// ---------------------------------------------------------------------------
// ONE TAP LOGS THE WHOLE WARM-UP (2 Nov 2026, Ashley's ruling "One tap for all", UX item 6). Measured first: a
// 19-set session took 26 taps and the only part above one tap a set was the warm-up, one tap per row. The whole app
// (app-boot.html, ?session-day: today trains a squat with a four-row ramp). One warm-up is ticked by hand first, so
// the button must log only the ones still open, and must log them as written: the rows' own weights and reps, filed
// as warm-ups, with the working-set count untouched. PORT 9567.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9567, page: 'app-boot.html', name: 'warmups-one-tap' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const warmRows = () => ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => r.is_warmup).map(r => ({ ex: r.exercise_name, set: r.set_number, kg: r.weight_kg, reps: r.reps_completed })).sort((a, b) => a.set - b.set)`)
const workingRows = () => ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => !r.is_warmup).length`)
const allButton = () => ev(`document.querySelector('[data-testid="log-all-warmups"]')?.textContent.trim() ?? null`)

await go('&session-day=1')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/exercise'`); await wait(2000)
await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1200)

// The session opens on its movement prep; the squat's rows open once the sets before it are logged, as on her phone.
// Whatever comes first is logged with the big button until the button names the squat or a warm-up, and counted for
// 4b. NOT BY NAME (3 Nov 2026): the prep was pinned as box jumps, then squat marches, and each catalogue pack re-rolled
// it (broad jumps since the machine pack), so a pinned name stopped the loop before it started.
let before = 0
for (let i = 0; i < 8 && !/Squat|Warm-up/.test(await ev(`document.querySelector('[data-next-set-button]')?.textContent ?? 'Squat'`)); i++) {
  await clickAt(`document.querySelector('[data-next-set-button]')`); await wait(900); before++
}
console.log(`  (logged ${before} set(s) before the squat)`)
// The squat's ramp, read off its own rows: what each box would log if ticked blank.
const ramp = await ev(`[...document.querySelectorAll('button[aria-label^="Save warm-up"], button[data-next-set^="Warm-up"]')].length`)
check('2. today\'s squat has four warm-up rows (the case binds)', ramp === 4, ramp)
const label0 = await until(allButton, v => !!v, 20)
check('3. one button offers to log all four', label0 === 'Log all 4 warm-ups', label0)
await ev(`document.querySelector('[data-testid="log-all-warmups"]')?.scrollIntoView({ block: 'center' })`); await wait(400)
await shoot('warmups-one-tap-before')

// One by hand first, so "all" has to mean "all still open".
await clickAt(`document.querySelector('button[aria-label^="Save warm-up 1"]')`); await wait(900)
const label1 = await allButton()
check('4. after one is ticked by hand it offers the three still open', label1 === 'Log all 3 warm-ups', label1)

// THE ROWS' OWN NUMBERS, read off the screen before the tap (RE-ANCHORED 10 Nov 2026: the four were pinned as
// 20/25/32.5/40, and went stale when a catalogue batch moved this plan's squat weight; the check is "as written").
const shown = await ev(`[...document.querySelectorAll('button[aria-label^="Save warm-up"]')].map(b => {
  let row = b; for (let i = 0; i < 6 && row.parentElement && row.querySelectorAll('input').length < 2; i++) row = row.parentElement
  const n = [...row.querySelectorAll('input')].map(x => parseFloat(String(x.value || x.placeholder).replace(/[^\\d.]/g, '')))
  return { label: b.getAttribute('aria-label'), n }
})`)
const working0 = await workingRows()
check('4b. (the sets before the squat are the only working sets so far)', before >= 1 && working0 === before, { working0, before })
const tapped = await clickAt(`document.querySelector('[data-testid="log-all-warmups"]')`)
await wait(1500)
const rows = await until(warmRows, v => (v ?? []).length >= 4, 20)
check('5. one tap logs the rest: four warm-ups stored', tapped && (rows ?? []).length === 4, rows)
const want = [[20, 10], ...(shown ?? []).map(r => r.n.slice(0, 2))]
check('6. ...as written: each the numbers its own row showed (the first, ticked by hand, at the bar)', (shown ?? []).length === 3 && JSON.stringify((rows ?? []).map(r => [r.kg, r.reps])) === JSON.stringify(want), { stored: (rows ?? []).map(r => [r.kg, r.reps]), want, shown })
check('7. ...all filed as warm-ups on the squat, none as a working set', (rows ?? []).every(r => /squat/i.test(r.ex)) && (await workingRows()) === working0, { working0, now: await workingRows() })
check('8. the button goes once nothing is left to log', (await allButton()) === null)
const next = await ev(`document.querySelector('[data-next-set-button]')?.textContent.trim() ?? null`)
check('9. the big button moves on to the squat\'s first working set', /^Log set 1 · .*Squat/.test(next ?? ''), next)
await shoot('warmups-one-tap-after')

await finish('verify:warmups-one-tap PASSED')
