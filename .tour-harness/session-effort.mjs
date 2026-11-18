// ---------------------------------------------------------------------------
// HOW HARD WAS IT, 1 TO 10 (his ruling 18 Nov 2026, "Build the 1–10"). The real Exercise tab (real.html): log a set,
// finish, and the session summary asks for a 1-10, one tap, saved onto the day's session with its feel word, read
// back when the summary is opened again. PORT 9963.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9963, passed: 'The summary asks how hard the session was, 1 to 10, one tap, saved and read back.' })
const { ev, check, finish, tapExpr, q, byText, until, wait, load, tick, exerciseNames, shoot, escape } = b
const row = () => ev(`(() => { const r = ${q('[data-testid="summary-effort"]')}; if (!r) return null; const bs = [...r.querySelectorAll('[role="radio"]')]; return { n: bs.length, labels: bs.map(x => x.textContent.trim()), checked: bs.filter(x => x.getAttribute('aria-checked') === 'true').map(x => x.textContent.trim()), small: bs.filter(x => x.getBoundingClientRect().height < 44).length, right: Math.max(...bs.map(x => x.getBoundingClientRect().right)), line: r.querySelector('[data-testid="effort-line"]')?.textContent ?? '' } })()`)
const saved = () => ev(`(window.__fakeDb?.workout_sessions ?? []).map(r => ({ effort: r.effort ?? null, felt: r.felt ?? null }))`)

await load('')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(1000)
const names = (await exerciseNames()) ?? []
let logged = false
for (const name of names) { if (await tick(name, 0, { weight: 20, reps: 8 }) || await tick(name, 0, { reps: 8 })) { logged = true; break } }
check('1. a set is logged', logged, names)
await ev('window.scrollTo(0, 0)'); await wait(250)
await tapExpr(byText('Finish session')); await wait(700)
await tapExpr(q('[data-testid="finish-anyway"]'))
check('2. the session summary opens', (await until(`[...document.querySelectorAll('[role="dialog"] h2')].some(h => /^Session (complete|saved)$/.test(h.textContent))`, 8000)) !== false)
await wait(600)
const r0 = await row()
check('3. it asks "How hard was it?" with ten numbers, 1 to 10', r0?.n === 10 && r0.labels.join() === '1,2,3,4,5,6,7,8,9,10', r0)
check('4. nothing is picked for him, and the words name the bands', r0?.checked.length === 0 && r0?.line === '1-3 Easy · 4-6 Moderate · 7-8 Hard · 9-10 All-out', r0)
check('5. every number is at least 44px tall and fits a 390px screen', r0?.small === 0 && r0.right <= 390, r0)
await shoot('session-effort-ask')
await tapExpr(q('[data-testid="effort-8"]')); await wait(800)
const r1 = await row()
check('6. one tap on 8: it is picked and says "8 · Hard · saved"', r1?.checked.join() === '8' && r1.line === '8 · Hard · saved', r1)
check('7. ...saved on the day\'s session, with the feel word "good" (a normal hard day, not a warning)', JSON.stringify(await saved()) === JSON.stringify([{ effort: 8, felt: 'good' }]), await saved())
await shoot('session-effort-saved')
await tapExpr(q('[data-testid="effort-10"]')); await wait(800)
const r2 = await row()
check('8. changing to 10 replaces it: "10 · All-out · saved", feel word "hard"', r2?.checked.join() === '10' && r2.line === '10 · All-out · saved' && JSON.stringify(await saved()) === JSON.stringify([{ effort: 10, felt: 'hard' }]), { r2, db: await saved() })
await escape(); await wait(500)
await tapExpr(q('[data-testid="session-finished"]')); await wait(1200)
const r3 = await row()
check('9. opened again, the summary shows the 10 he gave', r3?.checked.join() === '10' && /^10 · All-out/.test(r3.line), r3)
await finish()
