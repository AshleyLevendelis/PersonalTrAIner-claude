// ---------------------------------------------------------------------------
// NUTRITION, READABLE AND REACHABLE (1 Nov 2026, whole-app test). THE ALLERGY LINE READS IN EVERY THEME. "Ingredients are filtered, not verified. Check
// labels if you have an allergy." was the faintest text on Nutrition in all nine themes. It is safety wording, so it
// is held to 4.5:1 against what is actually behind it, read off the screen (computed colour, the first opaque
// background up the tree), on the whole app (app-boot.html), theme by theme. PORT 9543.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'
// A THEME IS SET THE WAY THE APP SETS IT (applyAppearance): the name AND the light-canvas flag the light themes carry,
// or every token keyed on the flag (warning text, the light red) is measured at its dark value. Mirrors LIGHT_THEMES.

const THEMES = ['nightshift', 'ember', 'field', 'graphite', 'daylight', 'midnight', 'rosewood', 'linen', 'frost']
const d = await startDriver({ port: 9543, page: 'app-boot.html', name: 'nutrition-readable' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
const NOT_NOW = `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Not now')`
if (await ev(`!!(${NOT_NOW})`)) { await clickAt(NOT_NOW); await wait(500) }
await clickAt(`document.querySelector('[data-tour="navNutrition"]')`); await wait(2500)

const MEASURE = String.raw`(() => {
  const el = document.querySelector('[data-testid="allergen-limit"]'); if (!el) return null
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  let n = el, bg = null
  while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.95) { bg = c; break } n = n.parentElement }
  if (!bg) bg = rgb(getComputedStyle(document.body).backgroundColor)
  const cs = getComputedStyle(el); const fg = rgb(cs.color); const alpha = (fg[3] ?? 1) * Number(cs.opacity)
  const mixed = fg.slice(0, 3).map((c, i) => c * alpha + bg[i] * (1 - alpha))
  const a = lum(mixed), b = lum(bg); return { ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100, text: el.textContent.trim().slice(0, 40) }
})()`
const results = {}
for (const t of THEMES) {
  await ev(`(() => { const h = document.documentElement; h.setAttribute('data-theme', ${JSON.stringify(t)}); if (${JSON.stringify(['daylight', 'linen', 'frost'].includes(t))}) h.setAttribute('data-canvas', 'light'); else h.removeAttribute('data-canvas') })()`); await wait(300)
  results[t] = await ev(MEASURE)
}
check('2. the line is on Nutrition', !!results.nightshift && /filtered, not verified/.test(results.nightshift.text), results.nightshift)
for (const t of THEMES) check(`3. ${t}: the allergy line reads at 4.5:1 or better`, (results[t]?.ratio ?? 0) >= 4.5, results[t])
await shoot('nutrition-readable')
// THE WATER BUTTONS (same test): "+250 ml" and "+500 ml" were 84x40, under the 44px floor.
await ev(`(() => { const h = document.documentElement; h.setAttribute('data-theme', 'nightshift'); h.removeAttribute('data-canvas') })()`)
await clickAt(`document.querySelector('[aria-label^="Water:"][aria-label$="Tap to log water."]')`); await wait(600)
const water = await ev(`[...document.querySelectorAll('button')].filter(b => /^\\+\\s?(250|500)\\s?ml$/i.test(b.textContent.trim())).map(b => Math.round(b.getBoundingClientRect().height))`)
check('4. the two water buttons are on the screen', Array.isArray(water) && water.length === 2, water)
check('5. ...and each is at least 44px tall', Array.isArray(water) && water.length === 2 && water.every(h => h >= 44), water)
await finish('verify:nutrition-readable PASSED')
