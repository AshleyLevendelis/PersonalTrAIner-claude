// Walks the tour across the REAL screens and asks, at every stop, the one
// question the stub harness cannot: does the spotlight land on the thing the
// copy is talking about?
//
// The stub run proves the tour's behaviour. This proves its aim.
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const file = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', [
  '--headless=new', '--remote-debugging-port=9337', '--no-sandbox', '--disable-gpu',
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
const until = async (fn, ok, tries = 40) => { let v = await fn().catch(() => null); for (let i = 0; i < tries && !ok(v); i++) { await wait(250); v = await fn().catch(() => null) } return v }
let targetWs
for (let i = 0; i < 80; i++) {
  try {
    const list = await fetch('http://127.0.0.1:9337/json/list').then(r => r.json())
    const page = list.find(t => t.type === 'page')
    if (page) { targetWs = page.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
if (!targetWs) { console.error('no chrome'); process.exit(1) }
const ws = new WebSocket(targetWs)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
let failures = 0
let ran = 0
let practiceSaved = null
let practiceBefore = null
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const errors = []
await send('Runtime.consoleAPICalled')
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params?.exceptionDetails?.exception?.description ?? '').slice(0, 200))
})

/** SPOT_PAD in AppTour.tsx — the hole is the target's rect grown by this. */
const SPOT_PAD = 6

const state = () => evalJs(`(() => {
  const card = document.querySelector('[role="dialog"][aria-label="App tour"] .tour-fade')
  const spot = document.querySelector('[role="dialog"][aria-label="App tour"] div[style*="2000px"]')
  const r = spot && spot.getBoundingClientRect()
  return {
    counter: card ? (card.querySelector('span:nth-child(2)')||{}).textContent : null,
    stepKey: card ? card.getAttribute('data-tour-step') : null,
    later: card ? !!card.querySelector('[data-tour-later]') : false,
    title: card ? (card.querySelector('h2,h3,p')||{}).textContent : null,
    body: card ? [...card.querySelectorAll('p')].map(p=>p.textContent).join(' | ') : null,
    cta: card ? (([...card.querySelectorAll('button')].pop())||{}).textContent : null,
    hasCard: !!card, pulsing: !!document.querySelector('.tour-breathe'),
    spot: r ? { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null,
    hash: location.hash,
  }
})()`)

const targetRect = key => evalJs(`(() => {
  const el = document.querySelector('[data-tour="${key}"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
           tag: el.tagName, text: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 70) }
})()`)

const clickCta = () => evalJs(`(() => { const c = document.querySelector('.tour-fade'); const b=[...c.querySelectorAll('button')].pop(); b.click(); return b.textContent })()`)
const tapTarget = key => evalJs(`(() => {
  const el = document.querySelector('[data-tour="${key}"]')
  if (!el) return 'MISSING'
  const r = el.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2)
  const blocked = !(el === top || el.contains(top) || (top && top.contains(el)))
  el.click(); return blocked ? 'CLICK-BLOCKED' : 'ok'
})()`)
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./real-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}

await send('Page.navigate', { url: `http://127.0.0.1:${port}/#/tab/dashboard` })
await wait(2500)
// THE TOUR'S OWN STEP LIST, read out of the page rather than restated here.
// The hand-written copy this replaces had the chat tab's nav key as
// 'navChat'; it is 'chatfab', and the driver reported a target missing that
// was never missing.
const STOPS = (await evalJs('JSON.stringify(window.__TOUR_STEPS__)')
  .then(j => JSON.parse(j)))
  .map(st => ({ key: st.key, target: st.target ?? null, tab: st.tab, tap: st.nav ?? null, gate: !!st.gate, last: !!st.last }))
if (!STOPS.length) { console.error('could not read TOUR_STEPS from the page'); process.exit(1) }

// WHAT EACH STOP SHOWS, read off the opened thing itself (his request 22 Nov 2026: "Make sure every step shows what it
// is describing"). A stop about something behind a tap must have it OPEN, and holding what the copy names.
const SHOWS = {
  progress: { words: ['Weight'], why: 'Progress is open, with the weigh-in row' },
  mealsheet: { words: ['Ingredients'], sel: '[aria-label*="favourite"]', appWords: ['Eating out'], why: 'a meal sheet is open: its foods and its heart' },
  effort: { words: ['Too easy', 'About right', 'Too hard'], why: 'the effort question is on screen' },
  exmenu: { words: ['About this exercise', 'Swap exercise', 'Ban exercise'], why: "the exercise's menu is open" },
  'about-howto': { words: ['Find a video on YouTube', 'How to do it'], tab: 'How to', why: 'About is open on How to, with the video and the steps' },
  'about-muscles': { svg: true, tab: 'Muscles', why: 'About is open on Muscles, with the body map' },
  'about-history': { words: ['Strength trend', 'PRs', 'Sessions'], tab: 'History', why: 'About is open on History' },
  daymenu: { words: ['What happened?', 'Session history'], why: 'the day menu is open' },
  whathappened: { verbs: true, why: 'What happened? is open, with its choices' },
  // THE GEAR AND PROFILE ARE APP.TSX'S OWN, so they are checked on the page that boots the whole app (app-boot.html):
  // the tour page draws its own copy of the gear, and checking a copy proves nothing about the app.
  settings: { app: true, words: ['Profile', 'Replay the tour'], why: 'the gear menu is open' },
  profile: { app: true, words: ['Goal', 'Injuries'], why: 'Profile is open, the rows it names first in sight' },
}
// WHAT IT SHOWS, AND THAT IT CAN BE SEEN: each thing a stop names must be on the screen and NOT under the tour's own
// card (found 22 Nov 2026: the How to stop's card sat on the very video button it named, and the gear's menu opened
// off the top of the screen, while every "is it there" check passed).
const shows = (target, want) => evalJs(`(() => {
  const want = ${JSON.stringify(want)}
  const el = document.querySelector('[data-tour="${target}"]')
  if (!el) return null
  const card = document.querySelector('[role="dialog"][aria-label="App tour"] .tour-fade')
  const cr = card ? card.getBoundingClientRect() : null
  const seen = node => {
    if (!node) return 'missing'
    const r = node.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return 'no size'
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return 'off screen'
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    if (cr && x >= cr.left && x <= cr.right && y >= cr.top && y <= cr.bottom) return 'under the tour card'
    return 'ok'
  }
  const deepest = word => {
    let best = null
    for (const n of el.querySelectorAll('*')) {
      if (n.children.length > 0 && [...n.children].some(c => (c.innerText || '').toLowerCase().includes(word))) continue
      if ((n.innerText || '').toLowerCase().includes(word)) { best = n; break }
    }
    return best
  }
  const text = (el.innerText || '').replace(/\\s+/g, ' ')
  const active = el.querySelector('[role="tab"][data-state="active"]')
  const words = [...(want.words || []), ...(want.extra || [])]
  const visible = {}
  for (const w of words) visible[w] = seen(deepest(w.toLowerCase()))
  if (want.tab) visible['tab ' + want.tab] = active && active.textContent.trim() === want.tab ? seen(active) : 'not the open tab'
  if (want.svg) visible.svg = seen(el.querySelector('svg'))
  if (want.verbs) visible.verbs = seen(el.querySelector('[data-verb]'))
  if (want.sel) visible[want.sel] = seen(el.querySelector(want.sel))
  return { text: text.slice(0, 160), visible }
})()`)

// THE SAME CHECKS EVERY RUN (CLAUDE.md: a driver's check count is constant, or its mutations are worthless). Each stop
// owns a fixed list of checks, worked out from the stop itself before the walk; the walk records what it finds, and a
// check the walk never reached (it broke off, or a stop was skipped) is reported as failed, never left out.
const CHECK_TEXT = {
  reach: 'the real control it waits for is reachable through the hole',
  onscreen: 'its target is on screen',
  spot: 'the spotlight is ON the target (±2px)',
  hole: 'the hole is fully inside the viewport',
  nospot: 'an untargeted stop draws no spotlight',
  shows: 'it SHOWS what it describes, in sight',
  'typed-told': 'a row with no weight to offer is told to type one',
  'typed-box': '...and the weight box is inside the spotlight, so it can be typed in',
  afterlog: 'the after-log line makes only the claim this row bears out',
}
function checksFor(stop, wholeApp) {
  const names = []
  const appOnly = SHOWS[stop.key]?.app && !wholeApp
  if (stop.tap || stop.gate) names.push('reach')
  if (appOnly) { /* App.tsx's own gear and Profile: held on the whole-app walk */ }
  else if (stop.target) names.push('onscreen', 'spot', 'hole')
  else names.push('nospot')
  if (SHOWS[stop.key] && !appOnly) names.push('shows')
  if (stop.key === 'set') names.push('typed-told', 'typed-box', 'afterlog')
  return names
}

async function walk(query, tag, wholeApp = false) {
  console.log(`\nTHE TOUR, STOP BY STOP, AGAINST THE REAL SCREENS — ${tag}\n`)
  await evalJs('(() => { try { localStorage.clear() } catch {} ; return 1 })()')
  const page = wholeApp ? '.tour-harness/app-boot.html' : ''
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}${query}#/tab/dashboard` })
  await wait(3000)
  // THE WHOLE APP (app-boot.html) has no setup to finish, so the tour is started the way Settings' "Replay the tour" does.
  if (wholeApp) {
    await until(() => evalJs(`!!document.querySelector('[data-tour="hero"]')`), v => v === true, 60)
    await evalJs(`window.dispatchEvent(new CustomEvent('fitplan:replay-tour'))`)
    await wait(1500)
  }
  const results = new Map()
  const rec = (key, name, ok, detail) => { if (!results.has(`${key}|${name}`)) results.set(`${key}|${name}`, { ok: !!ok, detail }) }
  // DRIVEN BY THE TOUR'S OWN COUNTER, not by a loop index: the gated set stop has two phases under one number.
  const byKey = Object.fromEntries(STOPS.map(s => [s.key, s]))
  const asserted = new Set()
  const seen = []
  const taps = {}
  let practiceShown = null
  // Set once the set stop's row turns out to have no weight to offer, so the after-log line can be held to the
  // narrower claim. Ashley's ruling, 24 Sep 2026: on those days the tour says to type the weight, then tap the ✓.
  let typedWeightRow = false
  let total = null
  let walkEnd = 'the walk ran out of steps'
  let finished = null
  let guard = 0
  while (guard++ < 60) {
    const s = await state()
    if (!s.hasCard) { walkEnd = `the tour left the screen at ${s.hash}`; break }
    const stop = byKey[s.stepKey]
    if (!stop) { walkEnd = `the card named an unknown stop "${s.stepKey}"`; break }
    const m = /(\d+) of (\d+)/.exec(s.counter ?? '')
    const n = m?.[1] ?? '?'
    total = m ? Number(m[2]) : total

    // Assert a stop's aim ONCE, in the info phase, where its target is live.
    if (!asserted.has(n) && !s.pulsing) {
      asserted.add(n)
      seen.push(stop.key)
      const appOnly = SHOWS[stop.key]?.app && !wholeApp
      // Give an opened menu or sheet a moment to land before measuring it.
      if (SHOWS[stop.key]) await wait(500)
      const s2 = await state()
      if (appOnly) {
        console.log(`      (${stop.key}: App.tsx's own, checked on the whole-app walk)`)
      } else if (stop.target) {
        const tr = await targetRect(stop.target)
        rec(stop.key, 'onscreen', !!tr && tr.t < 844 && tr.t + tr.h > 0 && tr.w > 0 && tr.h > 0, tr ?? { missing: stop.target, hash: s2.hash })
        if (tr && s2.spot) {
          // The hole is the target grown by the padding, kept on the screen (AppTour clamps it to the viewport).
          const want = {
            t: Math.max(0, tr.t - SPOT_PAD), l: Math.max(0, tr.l - SPOT_PAD),
            b: Math.min(844, tr.t + tr.h + SPOT_PAD), r: Math.min(390, tr.l + tr.w + SPOT_PAD),
          }
          const off = {
            dt: Math.abs(s2.spot.t - want.t), dl: Math.abs(s2.spot.l - want.l),
            dw: Math.abs(s2.spot.w - (want.r - want.l)), dh: Math.abs(s2.spot.h - (want.b - want.t)),
          }
          rec(stop.key, 'spot', Object.values(off).every(v => v <= 2), { spot: s2.spot, target: tr, off })
          rec(stop.key, 'hole', s2.spot.t >= -2 && s2.spot.l >= -2 && s2.spot.t + s2.spot.h <= 846 && s2.spot.l + s2.spot.w <= 392, s2.spot)
        } else {
          rec(stop.key, 'spot', false, { target: tr, spot: s2.spot })
          rec(stop.key, 'hole', false, { target: tr, spot: s2.spot })
        }
      } else {
        rec(stop.key, 'nospot', !s2.spot, s2.spot)
      }
      const want = SHOWS[stop.key]
      if (want && !appOnly) {
        const got = await shows(stop.target, { ...want, extra: wholeApp ? want.appWords ?? [] : [] })
        rec(stop.key, 'shows', !!got && Object.values(got.visible).every(v => v === 'ok'), { why: want.why, got })
      }
      if (stop.key === 'set') {
        // A row that offered a weight had nothing to type: those two checks hold by what the row offered.
        if (!typedWeightRow) { rec('set', 'typed-told', true, 'the row offered a weight'); rec('set', 'typed-box', true, 'the row offered a weight') }
        rec('set', 'afterlog', typedWeightRow ? /Wherever I've given you a weight/.test(s2.body ?? '') : /Leave the fields blank/.test(s2.body ?? ''), { typedWeightRow, body: s2.body })
      }
      if (stop.key === 'exercise') practiceShown = await evalJs(`document.querySelector('[data-testid="tour-practice-day"]')?.textContent ?? null`)
      console.log(`      ${s2.counter} · ${String(s2.cta).trim()} · ${String(s2.body).slice(0, 72)}`)
      await shot(`${tag.replace(/\s+/g, '-')}-${n}-${stop.key}`)
    }

    if (/Finish|Done/i.test(s.cta ?? '') && !s.pulsing) {
      await clickCta(); await wait(700)
      finished = !(await state()).hasCard
      walkEnd = null
      break
    }

    if (s.pulsing) {
      const key = stop.tap ?? stop.target
      if (taps[key] >= 2) { walkEnd = `${stop.key}: the tour did not advance after the real tap`; break }
      taps[key] = (taps[key] ?? 0) + 1
      if (key === 'setrow') practiceBefore = await evalJs(`(window.__fakeDb?.exercise_set_logs ?? []).length`)
      const needsWeight = key === 'setrow' && await evalJs(`(() => { const el = document.querySelector('[data-tour="setrow"]'); return !!el && el.getAttribute('data-needs-weight') === 'true' })()`)
      if (needsWeight && !typedWeightRow) {
        typedWeightRow = true
        rec('set', 'typed-told', /Type the weight you're using/.test(s.body ?? ''), s.body)
        const typed = await evalJs(`(() => {
          const row = document.querySelector('[data-tour="setrow"]')
          const input = row && [...row.querySelectorAll('input')].find(i => i.placeholder === 'enter')
          if (!input) return { error: 'no empty weight box in the row' }
          const r = input.getBoundingClientRect()
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          const reachable = input === top || input.contains(top)
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, '6'); input.dispatchEvent(new Event('input', { bubbles: true }))
          return { reachable, value: input.value }
        })()`)
        rec('set', 'typed-box', typed?.reachable === true && typed?.value === '6', typed)
        await wait(300)
      }
      const res = needsWeight ? await evalJs(`(() => {
        const row = document.querySelector('[data-tour="setrow"]')
        const btn = row && row.querySelector('button.glow-pulse')
        if (!btn) return 'MISSING'
        const r = btn.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        const blocked = !(btn === top || btn.contains(top))
        btn.click(); return blocked ? 'CLICK-BLOCKED' : 'ok'
      })()`) : await tapTarget(key)
      rec(stop.key, 'reach', res === 'ok', res)
      if (res !== 'ok') { walkEnd = `${stop.key}: its control could not be tapped (${res})`; break }
      await wait(1600)
      if (key === 'setrow') practiceSaved = await evalJs(`(window.__fakeDb?.exercise_set_logs ?? []).length`) - (practiceBefore ?? 0)
    } else {
      await clickCta(); await wait(1100)
    }
  }
  // EVERY STOP'S CHECKS, reached or not, in the tour's own order.
  for (const stop of STOPS) {
    for (const name of checksFor(stop, wholeApp)) {
      const r = results.get(`${stop.key}|${name}`)
      check(`${tag} · ${stop.key}: ${CHECK_TEXT[name]}`, r?.ok === true, r ? r.detail : 'never reached')
    }
  }
  check(`${tag}: the walk reached the last stop`, walkEnd === null, walkEnd)
  check(`${tag}: finishing closes the tour`, finished === true, finished)
  // ONE TOUR, NOTHING SKIPPED (his ruling 22 Nov 2026): every stop the tour has was shown, the set stop included.
  check(`${tag}: ONE tour, every stop shown (${seen.length} of ${STOPS.length}), the set stop included`,
    seen.length === STOPS.length && total === STOPS.length && STOPS.every(st => seen.includes(st.key)), { seen, total })
  return { practiceShown }
}

practiceSaved = null; practiceBefore = null
await walk('', 'training day')
// ...and once the tour has moved on, the practice set is gone: nothing counts, and today is not started.
await wait(2500)
await evalJs(`location.hash = '#/tab/exercise'`)
await wait(1500)
const afterTour = await evalJs(`({ sets: (window.__fakeDb?.exercise_set_logs ?? []).length, running: /Session running/.test(document.body.innerText) || !document.querySelector('[data-testid="hero-start"]') })`)
check('the tour\'s practice set was really saved while its stop was showing', practiceSaved === 1, practiceSaved)
check('...and is taken back off once the tour moves on, with no session left running (Exercise offers Start again)', afterTour?.sets === practiceBefore && afterTour?.running === false, afterTour)

// A REST DAY (his request 22 Nov 2026: "Even if it's trying to show how to log a set on a day that there is no sets
// to log it should still show the user"): the same tour, every stop, with the next session put up to practise on.
const restDay = await evalJs('window.__tourRestDay')
check('the plan has a rest day to walk the tour on', !!restDay, restDay)
practiceSaved = null; practiceBefore = null
const rest = restDay ? await walk(`?today=${restDay}`, 'rest day') : { practiceShown: null }
check('rest day: the Exercise stops put up the next session, labelled as practice', /'s session · practice$/.test(rest.practiceShown ?? ''), rest.practiceShown)
check('rest day: the practice set was really saved while its stop was showing', practiceSaved === 1, practiceSaved)
await evalJs(`location.hash = '#/tab/exercise'`)
await wait(1800)
const restAfter = await evalJs(`({ sets: (window.__fakeDb?.exercise_set_logs ?? []).length, practice: !!document.querySelector('[data-testid="tour-practice-day"]') })`)
check('rest day: ...and afterwards the practice session and its set are gone, today is a rest day again', restAfter?.sets === practiceBefore && restAfter?.practice === false, restAfter)

// THE WHOLE APP (app-boot.html boots the real App.tsx): every stop again, the gear and Profile included.
practiceSaved = null; practiceBefore = null
await walk('', 'whole app', true)
check('whole app: the practice set was really saved while its stop was showing', practiceSaved === 1, practiceSaved)

if (errors.length) console.log('\n  page errors: ' + errors.slice(0, 3).join(' | '))
check('no uncaught error on any page', errors.length === 0, errors.slice(0, 3))
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? '\nEvery stop landed on its real target and showed what it describes.\n' : `\n${failures} FAILED\n`)
chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
