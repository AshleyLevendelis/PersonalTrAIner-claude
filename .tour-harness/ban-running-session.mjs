// ---------------------------------------------------------------------------
// A BAN TAPPED MID-SESSION TAKES THE EXERCISE OFF THE SESSION ON SCREEN
// (24 Nov 2026). Ashley, with the session running and nothing logged, banned
// Clamshell from the ⋮ menu. The sheet said "It isn't in any session still to
// come … The session already behind you keeps it"; the receipt said "out for
// good"; Clamshell stayed on his day. scripts/test-ban-running-session.ts holds
// the guard. This holds the screen: Start session, ⋮ → Ban, the sheet does not
// call today "behind you", and after Take it out the row is gone from the card
// in front of him, while an exercise with a logged set stays.
//
// Every check runs every time, with null-safe subjects.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9979, passed: 'A ban tapped during a running session takes the exercise off that session.' })
const { ev, check, finish, tapExpr, q, byText, until, wait, load, tick, exerciseNames, shoot, ensureOpen, J, record } = b
const running = async () => (await record())?.status === 'running'

const sheetText = () => ev(`(document.querySelector('[data-testid="ban-exercise-sheet"]')?.innerText || '').replace(/\\s+/g, ' ')`)
const openMenu = async name => {
  await ensureOpen(name)
  const row = `[data-exercise-name=${J(name)}]`
  await tapExpr(q(`${row} button[aria-label="Exercise options"]`))
  return !!(await until(`!!document.querySelector('[data-testid="ban-exercise"]')`, 4000))
}
const banVia = async name => {
  const menu = await openMenu(name)
  await tapExpr(q('[data-testid="ban-exercise"]'))
  const sheet = !!(await until(`!!document.querySelector('[data-testid="ban-confirm"]') && !/Working out/.test(document.querySelector('[data-testid="ban-exercise-sheet"]')?.innerText || '')`, 6000))
  await wait(600)
  return { menu, sheet, said: await sheetText() }
}

console.log('\nBAN DURING A RUNNING SESSION\n')
await load('')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(1000)
const names = (await exerciseNames()) ?? []
const victim = names[names.length - 1] ?? 'NO-ROW'
const logged = names[0] ?? 'NO-ROW'
check('0. today has at least three exercises', names.length >= 3, names)

check('1a. Start session is tapped', await tapExpr(byText('Start session')))
await wait(600)
check('1b. the session is running (its own record says so)', await running(), await record())

const one = await banVia(victim)
check('2a. ⋮ → Ban opens the for-good sheet', one.menu && one.sheet, one)
check('2b. the sheet says sessions change ahead, not "nothing changes ahead"', /sessions? gets? rebuilt/.test(one.said) && !/nothing changes ahead/i.test(one.said), one.said.slice(0, 400))
await shoot('ban-running-session-sheet')
await tapExpr(q('[data-testid="ban-confirm-yes"]'))
check('2c. the receipt shows', !!(await until(`!!document.querySelector('[data-testid="ban-receipt"]')`, 6000)))
await shoot('ban-running-session-receipt')
await tapExpr(byText('Done'))
await wait(900)
const after = (await exerciseNames()) ?? []
check(`2d. ${victim} IS GONE FROM THE SESSION ON SCREEN`, !after.includes(victim) && after.length > 0, after)
check('2e. the session is still running', await running(), await record())

// An exercise with a set logged today keeps today as the record.
await ensureOpen(logged)
check(`3a. a set of ${logged} is logged`, (await tick(logged, 0)) === true)
await wait(600)
const two = await banVia(logged)
check('3b. ⋮ → Ban opens the sheet for it', two.menu && two.sheet, two)
await tapExpr(q('[data-testid="ban-confirm-yes"]'))
await until(`!!document.querySelector('[data-testid="ban-receipt"]')`, 6000)
await tapExpr(byText('Done'))
await wait(900)
check(`3c. ${logged}, already started, stays on today`, ((await exerciseNames()) ?? []).includes(logged), await exerciseNames())
await shoot('ban-running-session-after')
finish()
