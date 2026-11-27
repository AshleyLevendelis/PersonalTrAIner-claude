// ---------------------------------------------------------------------------
// THE NEXT SET NUDGED BY THE REPS JUST DONE — on a real screen (his ruling 23 Nov 2026, "1": one question per lift,
// plus a tap-free nudge). test:set-nudge holds the rule. This holds what a gate cannot: that after a set clearly over
// or under the rep range the NEXT box offers the moved weight, the line under it says why, the Exercise tab's button
// promises the same number, a blank tick logs it, and a set inside the range moves nothing.
//
// THE HARNESS CHOOSES THE INPUT ONLY (real.tsx, ?effort=ask: a loaded lift on today's card, nothing logged); the reps
// are typed as he would type them. Every number checked is read off the card the app drew. Every check runs every
// time, with a null-safe subject.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9431, page: 'real.html', name: 'set-nudge', timeoutMs: 300_000 })
const { ev, send, check, wait, go, clickAt, shoot, finish, until } = d

const cardExpr = name => `(() => {
  const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === ${JSON.stringify(name)})
  if (!leaf) return null
  let card = leaf
  for (let i = 0; i < 12 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('input') && /kg/i.test(card.innerText)) break }
  return card
})()`
const openRow = async name => {
  await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===${JSON.stringify(name)});
    if(!n) return false; let p=n; for(let i=0;i<6&&p.parentElement;i++){p=p.parentElement; if(p.tagName==='BUTTON'||p.getAttribute('role')==='button'){p.click();return true}} return false})()`)
  await wait(1500)
}
const read = name => ev(`(() => {
  const card = ${cardExpr(name)}
  if (!card) return { found: false, weights: [], range: null, nudge: null, dock: '' }
  const num = s => parseFloat(String(s).replace(/[^\\d.]/g, ''))
  const boxes = [...card.querySelectorAll('input')].filter(i => /^setgrid-weight-/.test(i.id))
  const m = /×\\s*(\\d+)\\s*[-–]\\s*(\\d+)/.exec(card.innerText)
  const n = card.querySelector('[data-testid="set-nudge"]')
  const r = n?.getBoundingClientRect()
  const dock = [...document.querySelectorAll('button')].map(b => b.innerText.replace(/\\s+/g, ' ')).find(t => /^Log set \\d/.test(t)) ?? ''
  return {
    found: true,
    weights: boxes.map(i => num(i.value || i.placeholder)),
    range: m ? [Number(m[1]), Number(m[2])] : null,
    nudge: n ? { text: n.textContent, direction: n.getAttribute('data-direction'), inView: r.top >= 0 && r.bottom <= innerHeight } : null,
    dock,
  }
})()`)
const NOTHING = { found: false, weights: [], range: null, nudge: null, dock: '' }
const typeReps = async (name, setN, reps) => {
  await clickAt(`[...(${cardExpr(name)})?.querySelectorAll('input') ?? []].filter(i => /^setgrid-reps-/.test(i.id))[${setN - 1}]`)
  await wait(150)
  await send('Input.insertText', { text: String(reps) })
  await wait(300)
}
const saveSet = async (name, n) => {
  await clickAt(`(${cardExpr(name)})?.querySelector('[aria-label="Save set ${n}"]')`)
  await until(() => ev(`!!(${cardExpr(name)})?.querySelector('[aria-label="Set ${n} saved"]')`), v => v === true, 16)
  await wait(1000)
}
const loggedKg = (name, n) => ev(`(() => { const t = (${cardExpr(name)})?.innerText ?? ''; const m = new RegExp('Set ${n}: \\\\d+ reps @ ([\\\\d.]+)kg').exec(t); return m ? Number(m[1]) : null })()`)
const load = async () => {
  await go('&tour=off&effort=ask', '#/tab/exercise')
  await wait(1200)
  await ev('localStorage.clear(); sessionStorage.clear()')
  await go('&tour=off&effort=ask', '#/tab/exercise')
  await wait(4500)
  const t = (await ev('window.__effortTarget')) ?? { name: '', sets: 0 }
  if (t.name) await openRow(t.name)
  return { t, card: t.name ? ((await read(t.name)) ?? NOTHING) : NOTHING }
}

console.log('\n[1] Set 1 well over the range: set 2 goes up, and says why')
{
  const { t, card } = await load()
  const [lo, hi] = card.range ?? [0, 0]
  const start = card.weights[0] ?? 0
  check('harness: a loaded lift with a rep range and the same weight on every set', !!t.name && t.sets >= 2 && hi > 0 && start > 0 && card.weights.every(w => w === start), { t, card })
  check('1a. nothing is said before a set is done', card.nudge === null, card.nudge)
  await typeReps(t.name, 1, hi + 3)
  await saveSet(t.name, 1)
  const after = t.name ? ((await read(t.name)) ?? NOTHING) : NOTHING
  const next = after.weights[1] ?? 0
  check('1b. set 2 offers a heavier weight, about 5% (one step, never 10%)', next > start && next <= start * 1.08 + 2.5, { start, next })
  check('1c. the line names the reps, the set and the new weight', after.nudge?.text === `${hi + 3} reps on set 1, so up to ${next} kg` && after.nudge?.direction === 'up', after.nudge)
  check('1d. ...on screen', after.nudge?.inView === true, after.nudge)
  check('1e. the Exercise tab\'s button promises the same weight', after.dock.includes(`${next} kg`), after.dock)
  await shoot('set-nudge-up')
  await saveSet(t.name, 2)
  const logged = t.name ? await loggedKg(t.name, 2) : null
  check('1f. a blank tick on set 2 logs the moved weight', logged === next, { logged, next })
}

console.log('\n[2] Set 1 inside the range: nothing moves')
{
  const { t, card } = await load()
  const [, hi] = card.range ?? [0, 0]
  const start = card.weights[0] ?? 0
  await typeReps(t.name, 1, hi)
  await saveSet(t.name, 1)
  const after = t.name ? ((await read(t.name)) ?? NOTHING) : NOTHING
  check('2a. set 2 keeps set 1\'s weight', start > 0 && after.weights[1] === start, { start, w: after.weights })
  check('2b. no line', after.nudge === null, after.nudge)
  // HIS "COPY THE LAST SET" (27 Nov 2026, T-Bar Row 9-11: set 1 at 11, set 2 offered 9): set 2's reps follow set 1,
  // in the box and on the Log set button.
  const set2Reps = await ev(`(() => { const b = [...((${cardExpr('__NAME__')})?.querySelectorAll('input') ?? [])].filter(i => /^setgrid-reps-/.test(i.id))[1]; return b ? Number(b.value || b.placeholder) : null })()`.replace('__NAME__', t.name))
  const lo = (card.range ?? [0, 0])[0]
  check('2c. set 2\'s reps copy set 1 (the top of the range), not the bottom', hi > lo && set2Reps === hi, { set2Reps, lo, hi })
  check('2d. ...and the Log set button promises the same reps', new RegExp(`× ${hi}$`).test(after.dock), after.dock)
}

console.log('\n[3] Set 1 well under the range: set 2 comes down')
{
  const { t, card } = await load()
  const [lo] = card.range ?? [0, 0]
  const start = card.weights[0] ?? 0
  await typeReps(t.name, 1, Math.max(1, lo - 2))
  await saveSet(t.name, 1)
  const after = t.name ? ((await read(t.name)) ?? NOTHING) : NOTHING
  const next = after.weights[1] ?? 0
  check('3a. set 2 offers a lighter weight, about 5%', lo > 2 && next < start && next >= start * 0.9 - 2.5, { start, next })
  check('3b. the line says so', after.nudge?.direction === 'down' && after.nudge?.text === `${Math.max(1, lo - 2)} reps on set 1, so down to ${next} kg`, after.nudge)
  await shoot('set-nudge-down')
}

await finish('A set clearly over or under its rep range moves the next set\'s weight a step, and says why.')
