// verify:heart-strap, third part — TODAY'S WORKOUT WITH A STRAP (heart-strap.mjs has Profile, heart-strap-app.mjs the
// timers). On the training day the fixture names (the one verify:exercise-2a uses): Start the session, and the number
// sits on the card beside the sets done, which still read "N of M sets"; it goes when the strap is out of range.
// Every check runs every time.
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9743, passed: 'verify:heart-strap (today\'s workout) passed: the number sits beside the sets done while the strap sends.' })
const { ev, check, finish, until, wait, load, shoot, tapExpr, q } = b

await load('dock=1')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 15000)
const day = (await ev('window.__rampTarget'))?.date ?? ''
// localStorage is cleared by each load, so the strap is paired on the address (fake-strap.ts reads it).
await load(`dock=1&strap=1&strappaired=1&today=${day}`)
await until(`!!document.querySelector('[data-testid="hero-start"]')`, 15000)
check('W0. a training day is open on Exercise', !!day && (await ev(`!!document.querySelector('[data-testid="hero-start"]')`)) === true, day)
await ev(`window.__strapConnect()`); await wait(300)
await tapExpr(q('[data-testid="hero-start"]'))
await until(`!!document.querySelector('[data-testid="hero-sets"]')`, 5000)
const sets = () => ev(`document.querySelector('[data-testid="hero-sets"]')?.textContent?.trim() ?? ''`)
check('W1. started, with no reading: the card counts the sets and shows no heart', (await ev(`!!document.querySelector('[data-exercise-hero] [data-live-heart]')`)) === false && /^\d+ of \d+ sets$/.test((await sets()) ?? ''), await sets())
await ev(`window.__strapSend(118)`); await wait(500)
const h = await ev(`(() => { const hero = document.querySelector('[data-exercise-hero]'); const n = hero?.querySelector('[data-live-heart]'); const r = n?.getBoundingClientRect(); return hero ? { bpm: n?.getAttribute('data-live-heart') ?? null, onScreen: !!r && r.right <= innerWidth && r.left >= 0 && r.height > 0 } : null })()`)
check('W2. a reading: "♥ 118" on the card beside the sets done, on screen, the sets line unchanged', h?.bpm === '118' && h?.onScreen === true && /^\d+ of \d+ sets$/.test((await sets()) ?? ''), { h, sets: await sets() })
await shoot('heart-strap-4-workout')
await ev(`window.__strapDrop()`); await wait(500)
check('W3. the strap out of range: the card shows no number', (await ev(`!!document.querySelector('[data-exercise-hero]')`)) === true && (await ev(`!!document.querySelector('[data-exercise-hero] [data-live-heart]')`)) === false)
await finish()
