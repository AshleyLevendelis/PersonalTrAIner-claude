// ---------------------------------------------------------------------------
// SEE ALL FOUR TIMER STATES AT ONCE, without a phone and without waiting out
// eight rounds.
//
// The round timer's phase is now carried by COLOUR across the whole tab
// (design handoff "Timer colour states", 2a), and no assertion about
// milliseconds can tell you whether that reads correctly. This is the same
// bargain render-screens.tsx makes: render the real component at a real phone
// width and take a picture.
//
// It renders work / rest / last-round / finished side by side by feeding the
// timer context directly, so every state is visible in one pass rather than
// only the one the clock happens to be in.
//
// NOTE THE STYLESHEET. It reads the BUILT css from dist/, not src/index.css —
// the source is Tailwind v4 input, so `rounded-full`, `flex` and `mt-auto` do
// not exist in it yet. A first run against the source produced a page with no
// layout at all and a decorative "ring" rendered as a giant square, which
// looks exactly like a broken component and is not one. Run `npm run build`
// first.
//
//   npm run build && npx tsx scripts/render-timer-field.tsx
//   then open /tmp/field.html, or screenshot it.
// ---------------------------------------------------------------------------

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync, readFileSync } from 'fs'
import { RoundField } from '../src/components/timers/RoundField'
import { TimersContextForTests } from '../src/hooks/useTimers'
import type { TimersValue } from '../src/hooks/useTimers'

const base: TimersValue = {
  mode: 'round', running: true, elapsedMs: 0, laps: [],
  roundConfig: { rounds: 8, workSeconds: 40, restSeconds: 15 },
  currentRound: 2, currentPhase: 'work', phaseRemainingMs: 27000, isRoundComplete: false,
  isActive: true, screenOpenRequested: false,
  requestScreenOpen: () => {}, clearScreenOpenRequest: () => {},
  setMode: () => {}, start: () => {}, stop: () => {}, reset: () => {}, lap: () => {},
  startRound: () => {}, pauseRound: () => {}, resumeRound: () => {},
}

const states: [string, TimersValue][] = [
  ['work', base],
  ['rest', { ...base, currentPhase: 'rest', phaseRemainingMs: 9000, currentRound: 2 }],
  ['last-round', { ...base, currentRound: 8, phaseRemainingMs: 5000 }],
  ['done', { ...base, running: false, isRoundComplete: true, currentRound: 8, phaseRemainingMs: 0 }],
]

import { readdirSync } from 'fs'
const builtCss = readdirSync('dist/assets').find(f => f.endsWith('.css'))!
const css = readFileSync('dist/assets/' + builtCss, 'utf8')
// EACH PANEL IS AN IFRAME, and that is a correctness fix, not a style choice.
// These panels used to be `position:relative` divs of a fixed size — which
// handed RoundField exactly the positioned ancestor the real app never gives
// it. The field is `position:absolute` no longer, but the lesson stands: a
// preview that supplies a containing block the app does not have will show a
// full-bleed design working when it does not. An iframe IS its own viewport,
// so `fixed` resolves the same way it does on a phone and the picture cannot
// flatter the code.
const panelDoc = (v: TimersValue) => `<!doctype html><meta charset="utf-8"><style>${css}
  html,body{margin:0;height:100%;background:#1A1636}</style>
  <body>
    <div style="padding:1.5rem">
      <div data-tour="toolsall">${renderToStaticMarkup(<TimersContextForTests.Provider value={v}><RoundField /></TimersContextForTests.Provider>)}</div>
    </div>
    <nav style="position:fixed;left:0;right:0;bottom:0;height:64px;z-index:40;background:#221C48"></nav>
  </body>`

const panels = states.map(([name, v]) => `
  <figure style="margin:0">
    <figcaption style="color:#9A93C9;font:600 11px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px">${name}</figcaption>
    <iframe title="${name}" style="width:390px;height:700px;border:0;border-radius:28px;background:#1A1636"
      srcdoc="${panelDoc(v).replace(/"/g, '&quot;')}"></iframe>
  </figure>`).join('')

writeFileSync('/tmp/field.html', `<!doctype html><meta charset="utf-8"><style>${css}</style>
<body style="margin:0;padding:32px;background:#12102a;display:flex;gap:28px;font-family:system-ui">${panels}</body>`)
console.log('wrote /tmp/field.html')
