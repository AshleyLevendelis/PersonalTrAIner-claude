// ---------------------------------------------------------------------------
// DOES THE ROUND TIMER ACTUALLY FLOOD THE SCREEN?
//
// The design is a full-bleed colour field: the colour IS the state, readable
// across a gym without picking the phone up. What shipped was a card filling
// about 60% of the screen inside the page's own padding.
//
// THE PREVIEW HARNESS IS WHY IT SHIPPED. render-timer-field.tsx drew each
// state inside `position:relative;width:390px;height:700px`, which is exactly
// the positioned ancestor the real app never provides — so RoundField's
// `position:absolute` filled the harness perfectly and looked correct. The
// app wrapped it in a `relative` box of minHeight:60vh instead, and absolute
// positioning resolves against the nearest POSITIONED ancestor. A harness
// that differs from the app in precisely the dimension under test proves
// nothing, which is the second time this week that shape has bitten (the
// other was a hand-copied replica of the onboarding composer).
//
// So this measures the field against the VIEWPORT, with no helpful wrapper,
// through a real browser's own layout engine.
// ---------------------------------------------------------------------------
import { chromium } from 'playwright-core'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { RoundField } from '../src/components/timers/RoundField'
import { TimersContextForTests } from '../src/hooks/useTimers'
import { TAB_BAR_HEIGHT_PX } from '../src/components/BottomTabBar'
import type { TimersValue } from '../src/hooks/useTimers'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const CHROME = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium']
  .filter(Boolean).find(p => existsSync(p as string)) as string | undefined
if (!CHROME) { console.log('\nSKIPPED — no Chromium; this gate needs a real layout engine.\n'); process.exit(0) }
if (!existsSync(join(ROOT, 'dist/assets'))) { console.error('dist/assets missing — run `npm run build` first.'); process.exit(1) }

const cssFile = readdirSync(join(ROOT, 'dist/assets')).find(f => f.endsWith('.css'))!
const css = readFileSync(join(ROOT, 'dist/assets', cssFile), 'utf8')

const value = {
  mode: 'round', running: true, currentRound: 6, currentPhase: 'rest',
  phaseRemainingMs: 9000, isRoundComplete: false,
  roundConfig: { rounds: 8, workSeconds: 30, restSeconds: 15 },
  startRound: () => {}, pauseRound: () => {}, resumeRound: () => {},
} as unknown as TimersValue

// The page the field really lives in: the app's padded tab content, and
// ToolsTab's own wrapper. Deliberately NOT a sized, positioned box.
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<body style="margin:0;background:#1A1636">
  <div style="padding:1.5rem;max-width:48rem;margin:0 auto">
    <div data-tour="toolsall">
      ${renderToStaticMarkup(React.createElement(TimersContextForTests.Provider, { value }, React.createElement(RoundField)))}
    </div>
  </div>
  <nav id="tabbar" style="position:fixed;left:0;right:0;bottom:0;height:${TAB_BAR_HEIGHT_PX}px;z-index:40;background:#221C48"></nav>
</body>`

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true })
await page.setContent(html)

const box = await page.evaluate(() => {
  const el = document.querySelector('[role="status"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const nav = document.getElementById('tabbar')!.getBoundingClientRect()
  return {
    left: Math.round(r.left), right: Math.round(r.right),
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    vw: window.innerWidth, vh: window.innerHeight,
    navTop: Math.round(nav.top),
    // What a person actually sees at the very edges.
    topLeftPaint: getComputedStyle(document.elementFromPoint(4, 4) as Element).backgroundColor,
    bottomRightPaint: getComputedStyle(document.elementFromPoint(386, 770) as Element).backgroundColor,
  }
})

console.log('\n1. The field reaches every edge of the screen')
check('the field is on the page at all', box !== null)
if (box) {
  check('flush to the left edge', box.left === 0, box.left)
  check('flush to the right edge', box.right === box.vw, { right: box.right, vw: box.vw })
  check('flush to the top edge', box.top === 0, box.top)
  // EXACT, not "most of it". A loose threshold let the absolute-positioning
  // mutation pass this line by stretching to the DOCUMENT height (2056px on a
  // 844px screen) — bigger than the screen reads as "fills the screen" to a
  // >85% check, and is just as wrong as too small.
  check('...and it is exactly the screen minus the tab bar — not a card, and not the document',
    box.bottom - box.top === box.vh - TAB_BAR_HEIGHT_PX,
    { height: box.bottom - box.top, expected: box.vh - TAB_BAR_HEIGHT_PX })

  console.log('\n2. It stops exactly at the tab bar, which stays uncovered')
  check('the field ends where the tab bar begins', box.bottom === box.navTop, { fieldBottom: box.bottom, navTop: box.navTop })
  check('...which is the tab bar height off the bottom', box.vh - box.bottom === TAB_BAR_HEIGHT_PX, box.vh - box.bottom)

  console.log('\n3. The colour is what a person sees at the edges')
  // The point of the design: no dark page showing through at the corners.
  check('the top-left corner is painted by the field', box.topLeftPaint !== 'rgba(0, 0, 0, 0)' && box.topLeftPaint !== 'rgb(26, 22, 54)', box.topLeftPaint)
  check('the bottom-right, just above the tab bar, too', box.bottomRightPaint !== 'rgb(26, 22, 54)', box.bottomRightPaint)
}

await browser.close()

console.log('\n4. The other half of the bug: nothing may re-capture the field')
{
  // `position: fixed` resolves against the viewport ONLY while no ancestor is
  // itself positioned/transformed. ToolsTab used to wrap this in
  // `relative` + minHeight:60vh, which is what turned a full-bleed field into
  // a card. The geometry checks above cannot see that on their own — they
  // render the field without ToolsTab — so the wrapper is asserted directly.
  const tools = readFileSync(join(ROOT, 'src/components/ToolsTab.tsx'), 'utf8')
  const at = tools.indexOf('<RoundField />')
  check('ToolsTab still renders the field', at !== -1)
  const wrapperOpen = tools.lastIndexOf('<div', at)
  const wrapper = at === -1 ? '' : tools.slice(wrapperOpen, at)
  check('...and its wrapper is not positioned',
    !/\brelative\b|\babsolute\b|\bsticky\b|position\s*:/.test(wrapper), wrapper.trim())
  check('...and does not force a height that would imply a card',
    !/minHeight|min-h-/.test(wrapper), wrapper.trim())
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll timer-field geometry checks passed.\n')
