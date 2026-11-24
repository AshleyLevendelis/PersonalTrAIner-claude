// ---------------------------------------------------------------------------
// "LOGGED THE WRONG EXERCISE?" MOVES EVERY SET, WITH AN UNDO (24 Nov 2026). Ashley logged Seated Leg Curl and had done
// Leg Extensions; the only fix was to delete each set and type it again. The whole app (app-boot.html, ?session-day):
// the first exercise of today's session is logged twice, then its ⋮ offers the move, he searches "leg ext", picks Leg
// Extensions, and the stored rows are read back: the sets under Leg Extensions with the same numbers, none left under
// the first exercise, the line in sight, and Undo putting them back. PORT 9655.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9655, page: 'app-boot.html', name: 'wrong-exercise' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const rows = name => ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => r.exercise_name === ${JSON.stringify(name)} && !r.is_warmup).map(r => [r.set_number, Number(r.weight_kg), r.reps_completed]).sort((a, b) => a[0] - b[0])`)

await go('&session-day=1')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/exercise'`); await wait(2000)
await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1200)

// Two working sets on whatever comes first, through the big button (never by name: catalogue packs re-roll it).
for (let i = 0; i < 2; i++) { await clickAt(`document.querySelector('[data-next-set-button]')`); await wait(900) }
const from = await ev(`(() => { const l = (window.__fakeDb?.exercise_set_logs ?? []).filter(r => !r.is_warmup); return l.length ? l[l.length - 1].exercise_name : null })()`)
const before = from ? await rows(from) : []
check('2. two sets are logged on today\'s first exercise', !!from && before.length >= 1, { from, before })

const ROW = `[...document.querySelectorAll('[data-exercise-name]')].find(r => r.getAttribute('data-exercise-name') === ${JSON.stringify(from)})`
await clickAt(`${ROW}?.querySelector('button[aria-label="Exercise options"]')`); await wait(600)
const offered = await ev(`!!document.querySelector('[data-testid="wrong-exercise"]')`)
check('3. its ⋮ offers "Logged the wrong exercise?"', offered === true && /Logged the wrong exercise\?/.test(await ev(`document.querySelector('[data-testid="wrong-exercise"]')?.textContent ?? ''`)))
await clickAt(`document.querySelector('[data-testid="wrong-exercise"]')`); await wait(700)
check('4. the sheet asks which exercise he did', /Which exercise did you actually do\?/.test(await ev(`document.querySelector('[data-testid="wrong-exercise-sheet"]')?.textContent ?? ''`)))
await ev(`(() => { const el = document.querySelector('[data-testid="wrong-exercise-search"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'leg ext'); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(600)
const options = await ev(`[...document.querySelectorAll('[data-testid="wrong-exercise-option"]')].map(b => b.textContent.trim())`)
check('5. "leg ext" finds Leg Extensions', Array.isArray(options) && options.includes('Leg Extensions'), options)
await shoot('wrong-exercise-sheet')
await clickAt(`[...document.querySelectorAll('[data-testid="wrong-exercise-option"]')].find(b => b.textContent.trim() === 'Leg Extensions')`)
await wait(1200)

const moved = await rows('Leg Extensions')
const left = await rows(from)
check('6. every set is under Leg Extensions with the same weights and reps', JSON.stringify(moved) === JSON.stringify(before), { moved, before })
check('7. ...and none is left under the exercise logged by mistake', Array.isArray(left) && left.length === 0, left)
const line = await ev(`(() => { const el = document.querySelector('[data-testid="wrong-exercise-moved"]'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), inView: r.top >= 0 && r.bottom <= innerHeight } })()`)
check('8. the card says what moved, in sight, with an Undo', !!line && line.inView && line.text.includes(`${from} → Leg Extensions`) && /Undo$/.test(line.text), line)
await shoot('wrong-exercise-moved')

await clickAt(`document.querySelector('[data-testid="wrong-exercise-moved"] button')`); await wait(1200)
check('9. Undo puts the sets back where they were', JSON.stringify(await rows(from)) === JSON.stringify(before), await rows(from))
check('10. ...and takes them off Leg Extensions', (await rows('Leg Extensions')).length === 0, await rows('Leg Extensions'))

await finish('Logged the wrong exercise moves every set and Undo puts them back.')
