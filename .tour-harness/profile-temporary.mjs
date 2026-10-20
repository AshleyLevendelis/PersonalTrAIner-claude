// ---------------------------------------------------------------------------
// A TEMPORARY CHANGE IS NAMED ON PROFILE'S OWN ROWS (live test, 19 Oct 2026).
//
// Ashley, as Sam: Profile → Injuries read "None" while the Exercise tab said
// "Easing off your knees until 22 Oct". The row summary read only the lasting
// injuries; the running change was inside the sheet behind it. This loads the
// real ProfileScreen with no change running, then with a running knee
// ease-off, a running bodyweight-only week and a shoulder ease-off that has
// ENDED, and reads the two rows as she would: the words, and that they fit.
//
// PORT 9671.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9671, page: 'profile.html', name: 'profile-temporary' })
const { ev, check, until, wait, go, shoot, finish } = d

const row = label => ev(`(() => { const b = document.querySelector('[data-profile-row=${JSON.stringify(label)}]'); if (!b) return null; const v = b.querySelector('span.ml-auto'); return { text: (v?.textContent ?? '').trim(), fits: !!v && v.scrollWidth <= v.clientWidth + 1 } })()`)
const load = async q => { await go(q); await until(() => ev(`!!document.querySelector('[data-profile-row="Injuries"]')`), v => v, 60); await wait(300) }

await load('')
const plain = await row('Injuries')
check('1. with nothing running and nothing on file, Injuries reads None (the baseline the fix must keep)', plain?.text === 'None', plain)
const plainKit = await row('Equipment')
check('1b. ...and Equipment reads the choice alone', plainKit?.text === 'Home gym', plainKit)
// WHAT IT MEASURES: every row's right edge against the phone's, not a scroll width. A scroll width checked only the
// document and the dialog, and both stayed 390 while the rows inside were pushed past the edge (the first run's
// screenshot showed it; the first version of this check passed).
const pageWidth = () => ev(`(() => { const rows = [...document.querySelectorAll('[data-profile-row]')]; return { widest: Math.round(Math.max(0, ...rows.map(r => r.getBoundingClientRect().right))), inner: innerWidth, rows: rows.length } })()`)
const w0 = await pageWidth()
await shoot('profile-temporary-none')

await load('&ease=1')
const inj = await row('Injuries')
check('2. a running knee ease-off is NAMED FIRST on the Injuries row, in the sheet\'s own words, then the lasting one', /^Easing off your knees until \d{1,2} [A-Z][a-z]{2}, Lower back$/.test(inj?.text ?? ''), inj)
check('2b. ...and the shoulder ease-off that already ENDED is not', !/shoulder/i.test(inj?.text ?? ''), inj)
// A row this long may end in an ellipsis; what must be on screen is the running change, which is why it goes first.
check('2c. ...and the running change is inside the row\'s visible width', await ev(`(() => { const v = document.querySelector('[data-profile-row="Injuries"] span.ml-auto'); if (!v) return false; const r = document.createRange(); r.selectNodeContents(v.firstChild ?? v); const t = v.textContent; const i = t.indexOf(' Sep') >= 0 ? t.indexOf(' Sep') + 4 : t.indexOf(' Oct') + 4; r.setEnd(v.firstChild, i); return r.getBoundingClientRect().right <= v.getBoundingClientRect().right + 1 })()`), inj)
const kit = await row('Equipment')
check('3. a running kit change is what the Equipment row says while it runs (the sheet keeps the lasting choice)', /^Bodyweight only until \d{1,2} [A-Z][a-z]{2}$/.test(kit?.text ?? ''), kit)
check('3b. ...and fits on the row too', kit?.fits === true, kit)
const w1 = await pageWidth()
check('5. no row reaches past the phone\'s edge with the longer text (390px)', w1.rows > 5 && w1.widest <= w1.inner && w0.widest <= w0.inner, { before: w0, after: w1 })
await shoot('profile-temporary')
check('4. the profile was never written: injuries still empty in the store', await ev(`JSON.stringify((window.__fakeDb?.fitness_profiles ?? []).map(p => p.injuries ?? []))`).then(s => !/knees/.test(s ?? '')))

await finish('Profile rows name the temporary changes that are running.')
