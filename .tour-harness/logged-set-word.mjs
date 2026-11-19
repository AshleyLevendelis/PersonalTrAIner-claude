// verify:logged-set-word — A LOGGED SET SAYS WHAT IT WAS DONE WITH, IN THE CARD'S OWN WORD.
//
// The Exercise walk of 18 Nov 2026 (finding E9): a band move logged with no weight read "10 reps · Bodyweight" under
// a card whose own badge says "Band". scripts/test-set-row.ts holds the sentence; this is the real screen: the day's
// warm-up band move and its first bodyweight lift are each logged with the running button, and each line is read
// beside its card's badge. PORT 9971.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9971, page: 'real.html', name: 'logged-set-word', timeoutMs: 200_000 })
const { ev, check, wait, go, until, shoot, finish, clickAt } = d

await go('&tour=off#/tab/exercise')
await until(() => ev(`document.querySelectorAll('[data-exercise-name]').length`), v => v > 0, 80)
await wait(800)
if (await ev(`!!document.querySelector('[data-testid="hero-start"]')`)) { await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1500) }

/** The OPEN card (only it draws its badge and its logged lines): its name, the word on its badge, the lines under its sets. */
const openCard = () => ev(`(() => {
  const c = document.querySelector('[data-exercise-open]')
  if (!c) return null
  return {
    name: c.getAttribute('data-exercise-name'),
    badge: c.querySelector('[data-testid="bodyweight-load"]')?.textContent.trim() ?? null,
    lines: [...c.querySelectorAll('*')].filter(n => n.children.length === 0 && /^Set \\d+: /.test(n.textContent.trim())).map(n => n.textContent.trim()),
  }
})()`)
const NEXT = `document.querySelector('[data-next-set-button]')`
const label = () => ev(`${NEXT}?.getAttribute('aria-label') ?? null`)

// The running button logs the lift marked NOW, set by set. After each press the open card is read; pressed until a
// band move AND a bodyweight lift have each shown a logged line (ten presses at most).
const seen = {}
for (let i = 0; i < 10 && !(seen.Band && seen.BW); i++) {
  const before = await label()
  const card = await openCard()
  await clickAt(NEXT)
  // The line lands on the card that was open at the press; it is read before the next card takes over.
  let after = null
  for (let k = 0; k < 20; k++) { await wait(150); after = await openCard(); if (after?.name === card?.name && after.lines.length > (card?.lines.length ?? 0)) break; if ((await label()) !== before && after?.name !== card?.name) break }
  const read = after?.name === card?.name ? after : null
  if (read?.badge && read.lines.length > 0 && !seen[read.badge]) seen[read.badge] = read
  await until(label, v => v !== before, 20)
  await wait(300)
}
const band = seen.Band ?? null, body = seen.BW ?? null
check('0. a band move and a bodyweight lift were each logged, each card saying which it is (the fixture binds)', !!band && !!body, { band, body, seen: Object.keys(seen) })
check('1a. THE BAND MOVE\'S LINE SAYS "Band" (it said "Bodyweight" under a card that says Band)', (band?.lines ?? []).length > 0 && band.lines.every(l => / · Band\b/.test(l) && !/Bodyweight/.test(l)), band?.lines)
check('1b. ...and the bodyweight lift\'s still says "Bodyweight"', (body?.lines ?? []).length > 0 && body.lines.every(l => / · Bodyweight\b/.test(l)), body?.lines)
await shoot('logged-set-word')
await finish('A logged set says what it was done with, in its card\'s own word.')
