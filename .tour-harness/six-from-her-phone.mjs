// ---------------------------------------------------------------------------
// The two things from 7 Sep that only a browser can settle.
//
// The gates prove the code says what it should. These are the questions a
// source check cannot answer: does the plate calculator actually draw several
// loadings and redraw the bar when you tap one, and does Home paint numbers
// rather than a grey line when you come back to it.
//
// The fake Supabase now takes ?slow=N (fake-supabase.ts), which is what makes
// the second one observable at all: with instant reads there is no window to
// look at, and the bug Ashley reported lives entirely inside that window.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9341', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9341/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
const W = 390, H = 844
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })

// A React-controlled input ignores `el.value = x`: the setter it installed
// swallows it. Going through the native prototype setter and then firing the
// event is what React itself listens for.
const SET_INPUT = `(sel, value) => {
  const el = document.querySelectorAll(sel)[arguments.length]
  return el
}`

console.log('\n2. THE PLATE CALCULATOR — several loadings, and tapping one redraws the bar\n')
{
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/tools` })
  await wait(2500)
  await ev(`location.hash = '#/tab/tools'`)
  await wait(1200)

  const opened = await ev(`(() => {
    const tile = [...document.querySelectorAll('button')].find(b => /Plate calculator/i.test(b.innerText))
    if (!tile) return 'no tile'
    tile.click()
    return 'clicked'
  })()`)
  check('the Plate calculator tile is there and opens', opened === 'clicked', opened)
  await wait(700)

  // 60kg on a 20kg bar: Ashley's own example — "2x10kg or 1x20kg".
  const typed = await ev(`(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const inputs = [...document.querySelectorAll('input[type="number"]')]
    if (inputs.length < 2) return 'inputs missing: ' + inputs.length
    setter.call(inputs[0], '60'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(inputs[1], '20'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    return 'typed'
  })()`)
  check('the target and bar can be typed into', typed === 'typed', typed)
  await wait(500)

  const read = () => ev(`(() => {
    const group = document.querySelector('[role="group"][aria-label="Ways to load each side"]')
    if (!group) return JSON.stringify({ rows: [], bar: [] })
    const rows = [...group.querySelectorAll('button')].map(b => ({
      text: b.innerText.replace(/\\s+/g, ' ').trim(),
      pressed: b.getAttribute('aria-pressed'),
    }))
    // The barbell picture: the coloured plate divs, in order along the sleeve.
    const bar = [...document.querySelectorAll('div')]
      .filter(d => !d.children.length && /^(25|20|15|10|5|2\\.5|1\\.25)$/.test(d.textContent.trim()) && /rounded-sm/.test(d.className))
      .map(d => d.textContent.trim())
    return JSON.stringify({ rows, bar })
  })()`)

  const before = JSON.parse(await read())
  check('more than one loading is offered', before.rows.length > 1, before.rows)
  check('...including the single 20 and the pair of 10s Ashley asked for',
    before.rows.some(r => /^1x 20kg$/.test(r.text)) && before.rows.some(r => /^2x 10kg$/.test(r.text)),
    before.rows.map(r => r.text))
  check('...with exactly one selected', before.rows.filter(r => r.pressed === 'true').length === 1, before.rows)
  check('the bar draws the selected one', before.bar.length > 0, before.bar)
  await shoot('six-plate-options')

  // THE WIRE. A list of options nobody can act on is decoration.
  const second = await ev(`(() => {
    const group = document.querySelector('[role="group"][aria-label="Ways to load each side"]')
    const rows = [...group.querySelectorAll('button')]
    const i = rows.findIndex(b => /^2x 10kg$/.test(b.innerText.replace(/\\s+/g, ' ').trim()))
    if (i < 0) return 'no 2x10 row'
    rows[i].click()
    return 'tapped'
  })()`)
  check('the 2x 10kg row can be tapped', second === 'tapped', second)
  await wait(400)

  const after = JSON.parse(await read())
  check('...and the bar picture changes to match',
    JSON.stringify(after.bar) !== JSON.stringify(before.bar) && after.bar.join('+') === '10+10',
    { before: before.bar, after: after.bar })
  check('...and the selection moves with it',
    after.rows.filter(r => r.pressed === 'true').length === 1
    && after.rows.find(r => r.pressed === 'true')?.text === '2x 10kg',
    after.rows)
  await shoot('six-plate-tapped')
}

console.log('\n5. HOME — last known numbers, not a grey line, on a tab switch\n')
{
  // 900ms per read, so the aggregate takes long enough to see. Without this
  // the fake answers in the same microtask and the window under test does not
  // exist.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&slow=900#/tab/dashboard` })
  await wait(1000)
  const early = await ev(`document.body.innerText.slice(0, 400)`)
  check('a genuinely cold Home still says it is loading (nothing to paint yet)',
    /Loading your day/.test(early), early.slice(0, 120))

  await ev(`location.hash = '#/tab/dashboard'`)
  await wait(14000)
  const loaded = await ev(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)`)
  check('...and it finishes loading', !/Loading your day/.test(loaded), loaded.slice(0, 160))
  await shoot('six-home-loaded')

  const cached = await ev(`Object.keys(localStorage).filter(k => k.startsWith('dashboard_cache_'))`)
  check('a snapshot was written for today', cached.length === 1, cached)
  check('...keyed by profile and date', /^dashboard_cache_.+_\d{4}-\d{2}-\d{2}$/.test(cached[0] ?? ''), cached[0])

  // THE SWITCH. Away and back, then look immediately — this is the window
  // Ashley spent seconds staring at.
  await ev(`location.hash = '#/tab/nutrition'`)
  await wait(900)
  await ev(`location.hash = '#/tab/dashboard'`)
  await wait(120)
  const onReturn = await ev(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)`)
  check('coming back paints straight away, with no "Loading your day"',
    !/Loading your day/.test(onReturn), onReturn.slice(0, 200))
  check('...and what it paints is the real screen, not an empty card',
    /Today so far|kcal|Tomorrow/i.test(onReturn), onReturn.slice(0, 200))
  await shoot('six-home-on-return')

  // And it is still not stale: the re-read runs and swaps in.
  await wait(14000)
  const settled = await ev(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)`)
  check('...and the fresh read still lands behind it', !/Loading your day/.test(settled), settled.slice(0, 160))
}

console.log('\nRAMP — the warm-up steps can be ticked off, and the tick survives a tab switch\n')
{
  // Ashley, mid-session: "theres no way to log the ramp up weights." A tick is
  // only worth anything if it registers AND is still there when she comes back
  // from another tab, so both are driven here rather than argued from source.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
  await wait(2500)
  await ev(`location.hash = '#/tab/exercise'`)
  await wait(1500)

  // The main lift starts collapsed — the primer is the open row — and the ramp
  // lives on the main lift. Open it the way a thumb would.
  const opened = await ev(`(() => {
    const hdr = [...document.querySelectorAll('div,button')]
      .find(e => /MAIN LIFT/.test(e.innerText || '') && (e.innerText || '').length < 200)
    if (!hdr) return 'no MAIN LIFT row'
    ;(hdr.querySelector('[role="button"],button') || hdr).click()
    return 'opened'
  })()`)
  check('the main lift row opens', opened === 'opened', opened)
  await wait(900)

  // NOTE the case: the label renders through a small-caps utility, so
  // innerText comes back "RAMP:". A case-sensitive selector found nothing and
  // sailed past two checks on an empty array — see the length guards below.
  const readRamp = () => ev(`(() => {
    const strip = [...document.querySelectorAll('div')].find(d => /^\s*RAMP:/i.test((d.innerText || '')))
    if (!strip) return JSON.stringify({ found: false, steps: [] })
    const steps = [...strip.querySelectorAll('button')].map(b => ({
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      pressed: b.getAttribute('aria-pressed'),
      label: b.getAttribute('aria-label'),
    }))
    return JSON.stringify({ found: true, steps })
  })()`)

  const before = JSON.parse(await readRamp())
  check('the ramp strip is on the exercise card', before.found === true, before)
  // EVERY ONE OF THESE ASSERTS A NON-EMPTY LIST FIRST. The first version used
  // a bare .every(), which is true of [], so two checks reported green against
  // a strip that had not been found at all.
  check('...and every step is a control, not plain text', before.steps.length >= 3, before.steps)
  check('...none of them ticked to begin with',
    before.steps.length >= 3 && before.steps.every(s => s.pressed === 'false'), before.steps)
  check('...and each says what tapping will do',
    before.steps.length >= 3 && before.steps.every(s => /tap to mark done/.test(s.label ?? '')), before.steps[0])
  await shoot('six-ramp-before')

  const tapped = await ev(`(() => {
    const strip = [...document.querySelectorAll('div')].find(d => /^\s*RAMP:/i.test((d.innerText || '')))
    const steps = [...strip.querySelectorAll('button')]
    steps[0].click(); steps[1].click()
    return 'tapped ' + steps.length
  })()`)
  check('two steps can be tapped', /^tapped/.test(tapped), tapped)
  await wait(400)

  const after = JSON.parse(await readRamp())
  check('...and both come back ticked',
    after.steps.filter(s => s.pressed === 'true').length === 2, after.steps)
  check('...with the rest untouched',
    after.steps.filter(s => s.pressed === 'false').length === before.steps.length - 2, after.steps)
  check('...and a ticked step now offers to unmark itself',
    /tap to unmark/.test(after.steps.find(s => s.pressed === 'true')?.label ?? ''), after.steps[0])
  await shoot('six-ramp-ticked')

  // THE POINT OF STORING IT AT ALL. A phone gets put down between sets, and
  // component state would drop every tick the moment she looked at Nutrition.
  await ev(`location.hash = '#/tab/nutrition'`)
  await wait(900)
  await ev(`location.hash = '#/tab/exercise'`)
  await wait(1500)
  await ev(`(() => {
    const hdr = [...document.querySelectorAll('div,button')]
      .find(e => /MAIN LIFT/.test(e.innerText || '') && (e.innerText || '').length < 200)
    if (hdr && !/OPEN/.test(hdr.innerText || '')) (hdr.querySelector('[role="button"],button') || hdr).click()
  })()`)
  await wait(900)
  const returned = JSON.parse(await readRamp())
  check('the ticks survive a trip to another tab',
    returned.steps.filter(s => s.pressed === 'true').length === 2, returned.steps)

  // And it unticks — a mis-tap has to be undoable.
  await ev(`(() => {
    const strip = [...document.querySelectorAll('div')].find(d => /^\s*RAMP:/i.test((d.innerText || '')))
    ;[...strip.querySelectorAll('button')][0].click()
  })()`)
  await wait(400)
  const undone = JSON.parse(await readRamp())
  check('...and a mis-tap can be taken back',
    undone.steps.filter(s => s.pressed === 'true').length === 1, undone.steps)

  // NOT A LOG. The working-set counter must not have moved.
  // NOT A LOG. Nothing on the page may claim a set was logged. Read as "is
  // there ANY non-zero logged counter", not "does the main lift's counter say
  // zero" — the first version pinned one row's exact wording and came back
  // empty when that row was collapsed, which is a check that cannot fail for
  // the wrong reason and cannot pass for the right one either.
  const counters = await ev(`JSON.stringify(document.body.innerText.match(/\\d+ working sets · \\d+ logged/g) || [])`)
  const rows = JSON.parse(counters)
  check('the working-set counters are on screen (sanity check on this check)', rows.length > 0, rows)
  check('ticking a warm-up logs nothing — every counter still reads 0 logged',
    rows.length > 0 && rows.every(r => / 0 logged$/.test(r)), rows)
}

console.log('\nCHAT BUTTON — one unread indicator at a time, in both glow settings\n')
{
  // Ashley, seeing the new ring and the old dot together: "we no longer need
  // the orange dot because the glowing outer ring now does that job." True
  // where the ring is drawn; at glow Off it is scaled to nothing, so the dot
  // is the fallback. Both settings are driven here because the whole point is
  // that exactly one of them shows.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/dashboard` })
  await wait(2500)

  // Force the indicator on rather than waiting for real unread state: this
  // section is about which marker is VISIBLE, not about when it lights.
  const look = (glow) => ev(`(() => {
    document.documentElement.setAttribute('data-glow', ${JSON.stringify(glow)})
    const btn = document.querySelector('[data-tour="chatfab"]') || [...document.querySelectorAll('button')].find(b => /Chat/.test(b.getAttribute('aria-label') || ''))
    if (!btn) return JSON.stringify({ found: false })
    btn.classList.add('chat-unread')
    let dot = btn.querySelector('[data-testid="chat-attention-dot"]')
    if (!dot) {
      dot = document.createElement('span')
      dot.setAttribute('data-testid', 'chat-attention-dot')
      dot.className = 'chat-attention-dot absolute'
      btn.appendChild(dot)
    }
    const cs = getComputedStyle(dot)
    return JSON.stringify({
      found: true,
      dotDisplay: cs.display,
      glowStrength: getComputedStyle(document.documentElement).getPropertyValue('--glow-strength').trim(),
    })
  })()`)

  const on = JSON.parse(await look('on'))
  check('the chat button is on screen (sanity check on this check)', on.found === true, on)
  check('with glow on, the glow system is live', on.glowStrength === '1', on)
  check('...and the orange dot is not drawn — the ring has the job', on.dotDisplay === 'none', on)

  const off = JSON.parse(await look('off'))
  check('with glow off, the ring is scaled to nothing', off.glowStrength === '0', off)
  check('...and the dot takes over, so the signal is never lost', off.dotDisplay !== 'none', off)

  const subtle = JSON.parse(await look('subtle'))
  // The computed value comes back as ".5", not "0.5" — compare numerically
  // rather than by string, or this fails on a correct app.
  check('subtle still draws a ring, so still no dot',
    Number(subtle.glowStrength) === 0.5 && subtle.dotDisplay === 'none', subtle)
}

console.log(failures === 0 ? '\nAll four verified in a browser at 390x844.\n' : `\n${failures} failures above.\n`)
chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
