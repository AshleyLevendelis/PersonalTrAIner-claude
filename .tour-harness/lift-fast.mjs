// verify:lift-fast — "LIFT FAST, LOWER SLOW" ON AN OLDER TRAINEE'S MAIN LIFTS (his "yes fix all four", 22 Nov 2026,
// on a 70-year-old's plan). The harness's own seeded plan, read at age 70 and at 30: at 70 every multi-joint lift on
// today's card says it, and the warm-up move and the isolation lifts do not; at 30 none does. PORT 9974.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9974, page: 'real.html', name: 'lift-fast', timeoutMs: 200_000 })
const { ev, check, wait, go, until, shoot, finish } = d

const read = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(c => ({
  name: c.getAttribute('data-exercise-name'),
  prep: c.hasAttribute('data-movement-prep'),
  cue: c.querySelector('[data-testid="lift-fast-cue"]')?.textContent.trim() ?? null,
}))`)
// Every card open, so each one draws its chips (only an open card does).
const openAll = async () => {
  const n = await ev(`document.querySelectorAll('[data-exercise-name]').length`)
  const out = []
  for (let i = 0; i < n; i++) {
    await ev(`(() => { const c = document.querySelectorAll('[data-exercise-name]')[${i}]; if (c && !c.hasAttribute('data-exercise-open')) { const t = c.querySelector('[role="button"]'); t && t.click() } })()`)
    await wait(500)
    const all = await read()
    out.push(all[i])
  }
  return out
}

await go('&age=70&tour=off#/tab/exercise')
await until(() => ev(`document.querySelectorAll('[data-exercise-name]').length`), v => v > 0, 80)
await wait(800)
const old = await openAll()
const withCue = old.filter(r => r?.cue)
check('0. today\'s card has a warm-up move and several lifts (the fixture binds)', old.length >= 5 && old.some(r => r?.prep), old)
check('1a. at 70, its multi-joint lifts say "Lift fast, lower slow" (two on this pull day: Chin-Ups, Chest-Supported Row)', withCue.length >= 2 && withCue.every(r => r.cue === 'Lift fast, lower slow'), old)
check('1b. ...never the warm-up move', old.filter(r => r?.prep).every(r => !r.cue), old.filter(r => r?.prep))
check('1c. ...and not every row: the isolation and trunk lifts go without', withCue.length < old.length, { cue: withCue.length, all: old.length })
await ev(`document.querySelector('[data-testid="lift-fast-cue"]')?.closest('[data-exercise-name]')?.scrollIntoView({ block: 'start' })`)
await wait(400)
await shoot('lift-fast-70')

await go('&age=30&tour=off#/tab/exercise')
await until(() => ev(`document.querySelectorAll('[data-exercise-name]').length`), v => v > 0, 80)
await wait(800)
const young = await openAll()
check('2. at 30, the same card carries it nowhere', young.length === old.length && young.every(r => !r?.cue), young)
await finish('An older trainee\'s main lifts say "Lift fast, lower slow"; nobody else\'s do.')
