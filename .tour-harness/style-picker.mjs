// ---------------------------------------------------------------------------
// THE STYLE PICKER ON THE REAL PROFILE SCREEN.
//
// Ashley's ruling, August 2026 (test log M3, 9 Oct 2026: still offered):
// "remove combat from the picker for now ... Removal must handle existing
// profiles that already have combat set."
//
// test:style-picker holds the rule for every surface from the source and by
// calling the functions. This is the half only a screen can show: that
// someone ALREADY on combat opens Profile and still sees their style named —
// not an empty box where their answer used to be — while someone on any other
// style is simply not offered it.
//
// The browser comes from .onb-harness/own-browser.mjs (its own profile, a free
// port, killed as a group, restarted if something outside ends it). Ports
// 9730-9749 belong to this driver.
// ---------------------------------------------------------------------------
import { ownBrowser, wait } from '../.onb-harness/own-browser.mjs'

const { origin, send, ev, evj, check, section, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.tour-harness/profile.html',
  ports: [9730, 9749],
})

const until = async (fn, pred, tries = 40) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(250); v = await fn() } return v }

async function openProfile(query) {
  await send('Page.navigate', { url: `${origin}/${query}` })
  await until(() => ev(`!!document.querySelector('[data-slot="dialog-content"]')`), v => v)
  // "You" is collapsed by default, so its rows are not in the DOM until opened.
  await ev(`(() => {
    const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^You$/i.test((x.textContent || '').trim()))
    if (b && b.getAttribute('aria-expanded') !== 'true') b.click()
  })()`)
  await wait(500)
}
/** The Style row's select trigger, found by the row's own label. */
const STYLE_TRIGGER = `(() => {
  const label = [...document.querySelectorAll('span')].find(s => (s.textContent || '').trim() === 'Style')
  return label ? label.parentElement.querySelector('[data-slot="select-trigger"]') : null
})()`
const shownStyle = () => ev(`(${STYLE_TRIGGER})?.innerText.trim() ?? null`)
async function openStyleList() {
  await ev(`(() => { const t = ${STYLE_TRIGGER}; t.scrollIntoView({ block: 'center' });
    // Radix opens on pointerdown, not click.
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1 }))
  })()`)
  await wait(700)
  // The label only — an option may carry its description on a second line.
  return evj(`[...document.querySelectorAll('[data-slot="select-item"]')].map(e => e.innerText.split('\\n')[0].trim())`)
}

await section(1, 'Someone already on combat still has their style', async () => {
  await openProfile('?style=combat')
  const shown = await until(shownStyle, v => !!v)
  check('the Style row names it — not an empty box where the answer used to be', shown === 'Combat / conditioning', shown)
  const list = await openStyleList()
  check('their own list still has it, so they can keep it', list.includes('Combat / conditioning'), list)
  check('...alongside the three that are offered', ['Functional / athletic', 'Bodybuilding', 'Hybrid'].every(l => list.includes(l)) && list.length === 4, list)
})

await section(2, 'Nobody else is offered it', async () => {
  await openProfile('')
  const shown = await until(shownStyle, v => !!v)
  check('harness: this profile is on another style', shown === 'Bodybuilding', shown)
  const list = await openStyleList()
  check('the list has no combat option', !list.some(l => /combat/i.test(l)), list)
  check('...and still offers the other three', list.join(' | ') === 'Functional / athletic | Bodybuilding | Hybrid', list)
})

finish('The style picker offers what is offered, and keeps what someone already has.')
