// ---------------------------------------------------------------------------
// Gate: the phone's Back closes what is open on top (the Profile walk, 18 Nov 2026, finding P3).
//
// verify:profile-back drives the real Profile in a browser with the browser's own history. This holds what one
// driver cannot walk: every order of open, close-by-button, Back and a move to another tab, against a fake history
// that behaves as a browser's does (a back is NOT instant: it lands after the code that asked for it has finished).
// The property throughout is the one he would feel: a press of Back does exactly one visible thing.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { BackStack, type BackHistory } from '../src/lib/back-closes'

let ran = 0
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

/** A browser's history, small: entries with an address and a state, a position, and backs that land later. */
class FakeHistory implements BackHistory {
  entries: { hash: string; state: unknown }[] = [{ hash: '#/tab/home', state: null }]
  at = 0
  private queued = 0
  stack!: BackStack
  /** Presses that ran off the front of the history (he left the app). */
  left = 0
  get state() { return this.entries[this.at].state }
  get hash() { return this.entries[this.at].hash }
  pushState(state: unknown) { this.entries = [...this.entries.slice(0, this.at + 1), { hash: this.hash, state }]; this.at++ }
  replaceState(state: unknown) { this.entries[this.at] = { hash: this.hash, state } }
  back() { this.queued++ }
  /**
   * The app moves to another address (location.hash = ...): a new entry, then POPSTATE, then hashchange. The popstate
   * is what a browser really sends on a move, and this fake left it out until 19 Nov 2026, so "closed by its own
   * button, then a tab tapped" passed here while the real app undid the tap. A fake must fire what the browser fires.
   */
  go(hash: string) {
    if (hash === this.hash) return
    this.entries = [...this.entries.slice(0, this.at + 1), { hash, state: null }]; this.at++
    this.stack.onBack()
    this.stack.onNavigate()
    this.settle()
  }
  /** Everything asked for lands, each as a browser would deliver it: popstate, then hashchange if the address moved. */
  settle() {
    while (this.queued > 0) {
      this.queued--
      if (this.at === 0) { this.left++; continue }
      const from = this.hash
      this.at--
      this.stack.onBack()
      if (this.hash !== from) this.stack.onNavigate()
    }
  }
  /** He presses Back once. */
  press() { this.back(); this.settle() }
}

// TWO places before the tab he is on, so a press that walks back one step too many lands somewhere visibly wrong.
const BEFORE = ['#/tab/tools', '#/tab/exercise']
const fresh = (before: string[] = []) => {
  const h = new FakeHistory()
  const s = new BackStack(h, () => h.hash)
  h.stack = s
  // Somewhere he was before: so "where Back would have gone" is a real place, not the edge of the app.
  h.entries = [...before.map(hash => ({ hash, state: null })), { hash: '#/tab/home', state: null }]
  h.at = h.entries.length - 1
  return { h, s }
}
/** A layer that records being closed, and can be closed by its own button. */
const layer = (s: BackStack, log: string[], name: string) => {
  const release = s.open(() => { log.push(name); release() })
  return { byButton: release }
}

console.log('\n1. Back closes the top layer, one a press')
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  layer(s, log, 'profile')
  check('opening Profile adds one step, at the same address', h.entries.length === 4 && h.hash === '#/tab/home', h.entries.length)
  h.press()
  check('Back closes Profile', log.join() === 'profile' && s.depth === 0, log)
  check('...and he is still on the tab he was on', h.hash === '#/tab/home' && h.left === 0, h.hash)
  h.press()
  check('the next Back goes where Back always went', h.hash === '#/tab/exercise' && log.length === 1, h.hash)
}
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  layer(s, log, 'profile'); layer(s, log, 'sheet')
  h.press()
  check('with a sheet open over Profile, Back closes the sheet only', log.join() === 'sheet' && s.depth === 1, log)
  h.press()
  check('...and the next Back closes Profile', log.join() === 'sheet,profile' && s.depth === 0 && h.hash === '#/tab/home', log)
  h.press()
  check('...and the one after leaves the tab, as it always did', h.hash === '#/tab/exercise' && log.length === 2, h.hash)
}

console.log('\n2. Closed by its own button: Back is never a press that does nothing')
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  layer(s, log, 'profile').byButton()
  check('closing by the button asks the phone for nothing (a back here could undo the move that follows)', h.at === 3 && s.depth === 0, h.at)
  h.press()
  check('ONE press of Back then goes where it would have gone had Profile never been open', h.hash === '#/tab/exercise' && log.length === 0, { hash: h.hash, at: h.at })
}
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  const p = layer(s, log, 'profile'); const sh = layer(s, log, 'sheet')
  sh.byButton()
  h.press()
  check('sheet closed by its arrow, then Back: Profile closes on that one press', log.join() === 'profile' && s.depth === 0 && h.hash === '#/tab/home', log)
  h.press()
  check('...and the next press leaves the tab (no dead press in between)', h.hash === '#/tab/exercise', { hash: h.hash, at: h.at })
  void p
}
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  const p = layer(s, log, 'profile'); const sh = layer(s, log, 'sheet')
  // Profile closed with a sheet still open (the X): both go in one tap.
  p.byButton(); sh.byButton()
  h.press()
  check('Profile and its sheet closed together, then ONE Back: he leaves the tab', h.hash === '#/tab/exercise' && log.length === 0, { hash: h.hash, at: h.at })
}
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  for (let i = 0; i < 5; i++) layer(s, log, 'profile').byButton()
  check('opened and closed five times: the steps do not pile up', h.entries.length === 4, h.entries.length)
  h.press()
  check('...and one Back still leaves the tab', h.hash === '#/tab/exercise', h.hash)
}
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  layer(s, log, 'profile').byButton()
  layer(s, log, 'profile')
  check('opened again after a close by the button: one layer, no extra step', s.depth === 1 && h.entries.length === 4, h.entries.length)
  h.press()
  check('...Back closes it', log.join() === 'profile' && h.hash === '#/tab/home')
}

console.log('\n3. A close that sends him somewhere is never undone')
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  // "Open the list" on Profile: the layer closes and the app moves, in one tap.
  layer(s, log, 'profile').byButton()
  h.go('#/nutrition/grocery')
  h.settle()
  check('Profile closes and the app moves: he is where he was sent', h.hash === '#/nutrition/grocery' && h.left === 0, h.hash)
  h.press()
  check('Back from there returns to the tab he came from, in one press', h.hash === '#/tab/home' && h.entries[h.at].state === null, { hash: h.hash, state: h.entries[h.at].state })
  h.press()
  check('...and the next goes on back, not round again', h.hash === '#/tab/exercise', h.hash)
}
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  layer(s, log, 'profile').byButton()
  h.go('#/tab/nutrition'); h.go('#/tab/tools')
  h.press()
  check('two moves after a close by the button: Back goes back ONE of them', h.hash === '#/tab/nutrition', h.hash)
}
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  layer(s, log, 'profile').byButton()
  h.go('#/tab/nutrition')
  layer(s, log, 'profile')
  h.press()
  check('opened again on another tab: Back closes it and stays on that tab', log.join() === 'profile' && h.hash === '#/tab/nutrition', { log, hash: h.hash })
  h.press()
  check('...then one Back returns to the first tab, past the old spent step', h.hash === '#/tab/home' && h.entries[h.at].state === null, { hash: h.hash, state: h.entries[h.at].state })
}

console.log('\n4. Three deep, and the edge of the app')
{
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  layer(s, log, 'profile'); layer(s, log, 'sheet'); const inner = layer(s, log, 'inner')
  inner.byButton()
  h.press()
  check('innermost closed by its button, then Back: the sheet closes, Profile stays', log.join() === 'sheet' && s.depth === 1, log)
  h.press()
  check('...next Back closes Profile', log.join() === 'sheet,profile' && s.depth === 0, log)
  h.press()
  check('...next leaves the tab', h.hash === '#/tab/exercise', h.hash)
}
{
  const { h, s } = fresh()
  const log: string[] = []
  layer(s, log, 'profile')
  h.press()
  check('at the first screen of the app, Back with Profile open closes Profile and stays in the app', log.join() === 'profile' && h.left === 0)
  h.press()
  check('...and only the next Back leaves', h.left === 1, h.left)
}

console.log('\n4b. Closed by its own button, THEN he taps a tab: the tap stands (found by the full sweep, 19 Nov 2026)')
{
  // The browser sends popstate for a MOVE as well as for a Back. From a spent step that read as a Back: the step
  // "owed" was taken and the tab he had just tapped was undone.
  const { h, s } = fresh(BEFORE)
  const log: string[] = []
  const p = layer(s, log, 'profile')
  p.byButton()
  h.go('#/tab/nutrition')
  check('the app is on the tab he tapped, not bounced back', h.hash === '#/tab/nutrition' && h.at === h.entries.length - 1, { hash: h.hash, at: h.at, of: h.entries.length })
  check('...nothing was closed, and he did not leave the app', log.length === 0 && h.left === 0, { log, left: h.left })
  h.press()
  check('one Back from there returns to the tab he was on (the spent step is walked through)', h.hash === '#/tab/home' && h.state === null, { hash: h.hash, state: h.state })
  h.press()
  check('...and the next goes to the tab before that, as if Profile had never been opened', h.hash === BEFORE[1], h.hash)
}
{
  // THE OTHER HALF: a REAL Back off a spent step still takes the step it owes (the same address is how it is known).
  const { h, s } = fresh(BEFORE)
  const p = layer(s, [], 'profile')
  p.byButton()
  h.press()
  check('a real Back off a spent step is still ONE press to the tab before (not a press that does nothing)', h.hash === BEFORE[1], h.hash)
}
{
  // Twice over: closed by its button, a tab tapped, opened and closed again, another tab tapped.
  const { h, s } = fresh(BEFORE)
  layer(s, [], 'profile').byButton()
  h.go('#/tab/nutrition')
  layer(s, [], 'profile').byButton()
  h.go('#/tab/exercise')
  check('every tap after a close stands, however many times', h.hash === '#/tab/exercise' && h.left === 0, { hash: h.hash, left: h.left })
}

console.log('\n5. Who uses it (source; the driver proves it on the real screen)')
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const lib = strip(readFileSync('src/lib/back-closes.ts', 'utf8'))
  const closeBody = lib.slice(lib.indexOf('return () => {'), lib.indexOf('onNavigate()'))
  check('a close by its own button never asks the phone to go back', !/history\.back\(|history\.go\(/.test(closeBody), closeBody.slice(0, 120))
  check('the stack listens for the phone going back and for the app moving', /addEventListener\('popstate'/.test(lib) && /addEventListener\('hashchange'/.test(lib))
  const profile = strip(readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
  check('Profile is a layer while it is open', /useBackCloses\(open, \(\) => onOpenChange\(false\)\)/.test(profile))
  check('...and so is the sheet open over it', /useBackCloses\(open && sheet != null, \(\) => setSheet\(null\)\)/.test(profile))
  check('...Profile before its sheet, so the sheet is the top layer', profile.indexOf('useBackCloses(open, ') > 0 && profile.indexOf('useBackCloses(open, ') < profile.indexOf('useBackCloses(open && sheet'))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1) }
console.log('\nALL PASSED')
