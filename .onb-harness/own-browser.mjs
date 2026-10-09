// ---------------------------------------------------------------------------
// A BROWSER OF ITS OWN, AND NO WAITING ON ANYTHING WITHOUT A DEADLINE.
//
// Shared by the drivers written on 9 Oct 2026. It exists because, on a machine
// where other checks were running at the same time, a driver built the usual
// way (fixed debug port, default profile, `chrome.kill()`) stalled repeatedly
// in ways that looked exactly like the page hanging. None of them were the
// page:
//   - killing Chromium's main process leaves its children holding the debug
//     port's listening socket for a while. The next run connected to that
//     dead socket and waited for an answer that could never come;
//   - a run that was killed from outside left its browser alive on the fixed
//     port, and the next run attached to THAT one;
//   - Chromium started without its own profile directory can hand itself to
//     an instance that is already running and exit;
//   - and, measured, the browser itself was ended from outside mid-run (its
//     own HTTP endpoint dead) by something else on the machine.
//
// So: a port counts as free only when a connection to it is REFUSED; the
// browser gets a throwaway profile and is killed as a whole process group
// however the run ends; every call has a time limit; and a browser that goes
// away mid-run is reported as NOT A RESULT and the run starts again from the
// top (three attempts), rather than being reported as failures of the app.
//
// Date.now() below is a stopwatch (elapsed milliseconds), never a calendar date.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { spawn, spawnSync } from 'child_process'
import { connect } from 'net'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
export const wait = ms => new Promise(r => setTimeout(r, ms))

/**
 * @param dist   absolute path of the built harness
 * @param index  the page served at "/", relative to dist
 * @param ports  [first, last] debug ports this driver may use
 */
export async function ownBrowser({ dist, index, ports }) {
  const server = createServer((q, r) => {
    const p = q.url.split('?')[0]
    const f = join(dist, p === '/' ? index : p)
    if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
    r.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
    r.end(readFileSync(f))
  })
  await new Promise(r => server.listen(0, r))
  const origin = `http://127.0.0.1:${server.address().port}`

  const refused = p => new Promise(res => {
    const sock = connect({ port: p, host: '127.0.0.1' })
    const done = v => { sock.destroy(); res(v) }
    sock.once('connect', () => done(false))
    sock.once('error', e => done(e.code === 'ECONNREFUSED'))
    sock.setTimeout(1000, () => done(false))
  })
  let debugPort = 0
  for (let p = ports[0]; p <= ports[1] && !debugPort; p++) if (await refused(p)) debugPort = p
  if (!debugPort) { console.error(`  FAIL: no free debug port in ${ports[0]}-${ports[1]}`); process.exit(1) }

  const profile = mkdtempSync(join(tmpdir(), 'own-browser-'))
  const chrome = spawn('/opt/pw-browsers/chromium',
    ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', 'about:blank'],
    { stdio: 'ignore', detached: true })
  let gone = null
  let closing = false
  const waiting = []
  chrome.on('exit', (code, signal) => {
    if (closing) return
    gone = signal ? `signal ${signal}` : `exit code ${code}`
    for (const fail of waiting.splice(0)) fail()
  })
  const shutDown = () => {
    closing = true
    // The whole group, so no child is left holding the port.
    try { process.kill(-chrome.pid, 'SIGKILL') } catch {}
    try { rmSync(profile, { recursive: true, force: true }) } catch {}
    server.close()
  }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { shutDown(); process.exit(130) })

  let target
  for (let i = 0; i < 80 && !target && !gone; i++) {
    try {
      const l = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(2000) }).then(r => r.json())
      target = l.find(x => x.type === 'page')?.webSocketDebuggerUrl
    } catch {}
    if (!target) await wait(250)
  }
  const ws = target ? new WebSocket(target) : null
  const attached = ws && await Promise.race([
    new Promise(r => ws.addEventListener('open', () => r(true), { once: true })),
    wait(15000).then(() => false),
  ])
  if (!attached && !gone) gone = 'it never came up'

  let id = 0
  const pend = new Map()
  ws?.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  })
  const send = (m, p = {}) => new Promise((r, reject) => {
    if (gone) { reject(new Error('the browser is gone')); return }
    const i = ++id
    waiting.push(() => { pend.delete(i); reject(new Error('the browser is gone')) })
    const began = Date.now()
    const timer = setTimeout(() => { pend.delete(i); reject(new Error(`the page did not answer ${m} within 60s`)) }, 60000)
    pend.set(i, v => {
      clearTimeout(timer)
      // Said out loud, because a slow machine and a stuck page look the same
      // from outside until one of them finally answers.
      const took = Date.now() - began
      if (took > 5000) console.log(`      (slow: ${m} took ${Math.round(took / 1000)}s)`)
      r(v)
    })
    ws.send(JSON.stringify({ id: i, method: m, params: p }))
  })
  const ev = x => send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }).then(r => r.result?.result?.value)
  const evj = async x => JSON.parse(await ev(`JSON.stringify(${x})`) ?? 'null')

  if (!gone) {
    try {
      await send('Page.enable'); await send('Runtime.enable')
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    } catch {}
  }

  // --- the run: checks, sections, and exactly one way out -----------------
  let failures = 0
  let ran = 0
  const check = (label, ok, extra) => {
    ran++
    if (ok) console.log(`  ok: ${label}`)
    else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`) }
  }
  // One section per behaviour. A step that throws (an element missing or off
  // screen, a page that stopped answering) is a FAILED check in its own
  // section rather than a crash that silently skips the rest; ONLY=4,7 runs a
  // subset.
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null
  const section = async (n, title, fn) => {
    if (only && !only.includes(String(n))) return
    if (gone) return
    console.log(`\n[${n}] ${title}`)
    try { await fn() } catch (e) { check(`section ${n} ran to its end — ${e instanceof Error ? e.message : String(e)}`, false) }
  }
  /** The one exit. Prints the count, or says the browser was lost and starts again. */
  const finish = okLine => {
    shutDown()
    if (gone) {
      const attempt = Number(process.env.OWN_BROWSER_ATTEMPT ?? '1')
      console.log(`\nNOT A RESULT: the browser went away mid-run (${gone}) after ${ran} checks — something outside this check ended it.`)
      if (attempt >= 3) { console.error('Three attempts, three lost browsers. Run this again on a quieter machine.\n'); process.exit(2) }
      console.log(`Starting again from the top (attempt ${attempt + 1} of 3).\n`)
      const again = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, OWN_BROWSER_ATTEMPT: String(attempt + 1) } })
      process.exit(again.status ?? 2)
    }
    console.log(`\n${ran} checks ran.`)
    if (failures > 0) { console.error(`${failures} check(s) failed.\n`); process.exit(1) }
    console.log(`${okLine}\n`)
    process.exit(0)
  }

  return { origin, send, ev, evj, check, section, finish, isGone: () => !!gone }
}
