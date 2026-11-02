// ---------------------------------------------------------------------------
// THE SMALL PRINT READS, IN EVERY THEME (2 Nov 2026, the UX pass, item 3). The whole-app test found small print on
// Profile, the grocery list and the program page under readable contrast in every theme, and "Get more options",
// "Delete everything" and "Start a new plan" especially faint in the light themes. Every piece of visible text on
// those three screens is read off the screen (its computed colour against the first opaque background up the tree)
// and held to 4.5:1, theme by theme. A disabled control is left out: it is meant to look unavailable. PORT 9557.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'
// A THEME IS SET THE WAY THE APP SETS IT (applyAppearance): the name AND the light-canvas flag the light themes carry,
// or every token keyed on the flag (warning text, the light red) is measured at its dark value. Mirrors LIGHT_THEMES.

const THEMES = ['nightshift', 'ember', 'field', 'graphite', 'daylight', 'midnight', 'rosewood', 'linen', 'frost']
const d = await startDriver({ port: 9557, page: 'app-boot.html', name: 'small-print' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

/** Every element that draws its own text, visible on screen, with its contrast. */
const MEASURE = String.raw`((root) => {
  // ANY CSS COLOUR TO sRGB, through a canvas pixel: a faded token computes to oklab()/color-mix(), which a number
  // regex reads as near-black, and a check that misreads the colour proves nothing either way.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgb = s => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255] }
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const scope = document.querySelector(root) || document.body
  const out = []
  for (const el of scope.querySelectorAll('*')) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim()
    if (!own || own.length < 2) continue
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
    if (el.closest('[disabled], [aria-disabled="true"], [data-disabled], [aria-hidden="true"]')) continue
    let op = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
    if (op < 0.05) continue
    let n = el, bg = null
    while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.95) { bg = c; break } n = n.parentElement }
    if (!bg) bg = rgb(getComputedStyle(document.body).backgroundColor)
    const fg = rgb(getComputedStyle(el).color); const alpha = (fg[3] ?? 1) * op
    const mixed = fg.slice(0, 3).map((c, i) => c * alpha + bg[i] * (1 - alpha))
    const a = lum(mixed), z = lum(bg)
    out.push({ text: own.slice(0, 32), ratio: Math.round(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)) * 100) / 100 })
  }
  return out
})`
const lowIn = async (root) => {
  const by = {}
  for (const t of THEMES) {
    await ev(`(() => { const h = document.documentElement; h.setAttribute('data-theme', ${JSON.stringify(t)}); if (${JSON.stringify(['daylight', 'linen', 'frost'].includes(t))}) h.setAttribute('data-canvas', 'light'); else h.removeAttribute('data-canvas') })()`); await wait(250)
    const all = await ev(`${MEASURE}(${JSON.stringify(root)})`)
    by[t] = { n: (all ?? []).length, low: (all ?? []).filter(x => x.ratio < 4.5) }
  }
  await ev(`(() => { const h = document.documentElement; h.setAttribute('data-theme', 'nightshift'); h.removeAttribute('data-canvas') })()`); await wait(250)
  return by
}
const report = (screen, by) => {
  check(`${screen}: there is text to read (sanity: the screen is open)`, (by.nightshift?.n ?? 0) >= 8, by.nightshift?.n)
  for (const t of THEMES) check(`${screen}, ${t}: all small print reads at 4.5:1 or better`, (by[t]?.n ?? 0) >= 8 && by[t].low.length === 0, by[t]?.low)
}
const named = re => `[...document.querySelectorAll('button,[role=menuitem],a')].find(b => ${re}.test((b.getAttribute('aria-label') || '').trim()) || ${re}.test(b.textContent.trim()))`

await go('&session-day=1')
check('0. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${named('/^Not now$/')})`)) { await clickAt(named('/^Not now$/')); await wait(500) }

// --- 1. Profile ---------------------------------------------------------------------------------------------------
await clickAt(named('/Profile and settings/')); await wait(600)
await clickAt(named('/^Profile$/')); await wait(1500)
report('Profile', await lowIn('[data-profile-page]'))
await shoot('small-print-profile')

// --- 2. The program page ------------------------------------------------------------------------------------------
// PROFILE CLOSED FIRST, so nothing of it is measured with the next screen (checked: no Profile page left in the DOM).
for (let i = 0; i < 3 && await ev(`!!document.querySelector('[data-profile-page]')`); i++) {
  await d.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await d.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(700)
}
check('Profile is closed before the next screen', await ev(`!document.querySelector('[data-profile-page]')`) === true)
await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
await ev(`location.hash = '#/exercise/program'`); await wait(2000)
// The week list, then the first week opened, so its days' small print is measured too.
await clickAt(`document.querySelector('[data-program-week], [data-testid^="program-week"]') ?? [...document.querySelectorAll('button')].find(b => /^Week 1\\b/.test(b.textContent.trim()))`); await wait(1500)
check('Program: it is open', await ev(`/program/.test(location.hash)`) === true, await ev('location.hash'))
report('Program', await lowIn('body'))
await shoot('small-print-program')

// --- 3. The grocery list ------------------------------------------------------------------------------------------
await ev(`location.hash = '#/tab/nutrition'`); await wait(1500)
await ev(`location.hash = '#/nutrition/grocery'`); await wait(2500)
check('Grocery list: it is open', await ev(`/grocery/.test(location.hash)`) === true, await ev('location.hash'))
report('Grocery list', await lowIn('body'))
await shoot('small-print-grocery')

await finish('verify:small-print PASSED')
