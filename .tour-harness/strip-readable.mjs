// ---------------------------------------------------------------------------
// THE EXERCISE WEEK STRIP'S LETTERS READ IN EVERY THEME (2 Nov 2026, the UX pass, item 3). The whole-app test found
// the rest days' letters, and today's own letter once another day is selected, at 1.4-1.8:1 in every theme: a day
// you cannot read is a strip you cannot use. Every letter is held to 4.5:1 against what is actually behind it (the
// computed colour, the first opaque background up the tree), theme by theme, with another day selected so today's
// letter is in its unselected state. The dot and the dash still say which days train. PORT 9555.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'
// A THEME IS SET THE WAY THE APP SETS IT (applyAppearance): the name AND the light-canvas flag the light themes carry,
// or every token keyed on the flag (warning text, the light red) is measured at its dark value. Mirrors LIGHT_THEMES.

const THEMES = ['nightshift', 'ember', 'field', 'graphite', 'daylight', 'midnight', 'rosewood', 'linen', 'frost']
const d = await startDriver({ port: 9555, page: 'app-boot.html', name: 'strip-readable' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
const NOT_NOW = `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Not now')`
if (await ev(`!!(${NOT_NOW})`)) { await clickAt(NOT_NOW); await wait(500) }
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
// ANOTHER DAY SELECTED, so today's letter is drawn unselected — the state the test found it unreadable in.
const other = await ev(`(() => { const b = [...document.querySelectorAll('[data-exercise-strip] [data-strip-day]')].find(x => x.getAttribute('aria-current') !== 'date' && x.getAttribute('data-dot') !== 'none'); return b ? b.getAttribute('data-strip-day') : null })()`)
check('2. another training day can be selected', !!other && await clickAt(`document.querySelector('[data-exercise-strip] [data-strip-day="${other}"]')`), other)
await wait(800)

const MEASURE = String.raw`(() => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  return [...document.querySelectorAll('[data-exercise-strip] [data-strip-day]')].map(b => {
    const el = b.lastElementChild
    let n = el, bg = null
    while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.95) { bg = c; break } n = n.parentElement }
    if (!bg) bg = rgb(getComputedStyle(document.body).backgroundColor)
    const cs = getComputedStyle(el); const fg = rgb(cs.color); const alpha = (fg[3] ?? 1) * Number(cs.opacity)
    const mixed = fg.slice(0, 3).map((c, i) => c * alpha + bg[i] * (1 - alpha))
    const a = lum(mixed), z = lum(bg)
    return { day: b.getAttribute('data-strip-day'), rest: b.getAttribute('data-dot') === 'none', selected: b.getAttribute('aria-current') === 'date', ratio: Math.round(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)) * 100) / 100 }
  })
})()`
const results = {}
for (const t of THEMES) {
  await ev(`(() => { const h = document.documentElement; h.setAttribute('data-theme', ${JSON.stringify(t)}); if (${JSON.stringify(['daylight', 'linen', 'frost'].includes(t))}) h.setAttribute('data-canvas', 'light'); else h.removeAttribute('data-canvas') })()`); await wait(300)
  results[t] = await ev(MEASURE)
}
check('3. the strip has its seven letters, rest days among them', (results.nightshift ?? []).length === 7 && results.nightshift.some(x => x.rest), results.nightshift)
for (const t of THEMES) {
  const low = (results[t] ?? []).filter(x => x.ratio < 4.5)
  check(`4. ${t}: every day's letter reads at 4.5:1 or better`, (results[t] ?? []).length === 7 && low.length === 0, low)
}
await ev(`(() => { const h = document.documentElement; h.setAttribute('data-theme', 'frost'); h.setAttribute('data-canvas', 'light') })()`); await wait(300)
await shoot('strip-readable-frost')
await finish('verify:strip-readable PASSED')
