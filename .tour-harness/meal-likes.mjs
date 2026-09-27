// ---------------------------------------------------------------------------
// FOODS AND MEALS SHE LIKES, ON THE REAL PROFILE SCREEN — 27 Sep 2026.
//
// Ashley: "there's no way to let the app know what kind of meals a user
// likes". Her ruling, from three options: a "Foods and meals I like" list
// beside "Foods to avoid", the coach can add to it, and hearting a meal counts
// as a like too — with nothing learnt behind her back.
//
// WHICH HALF THIS PROVES. profile.tsx mounts the real ProfileScreen over the
// fake database (?likes=1 seeds two hearted meals and a like the coach
// recorded). Every write below is read back from the TABLE it lands in, not
// from the screen. What likes then DO to the meals — the generator's prompt and
// the day ranking — is held by test:meal-likes and test:soft-preferences.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/profile.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9447', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9447/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let ran = 0, failures = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const until = async (read, ok, ms = 6000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await read(); if (ok(v)) return v; await wait(120) } return v }

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?likes=1` })
await until(() => has('[data-slot="dialog-content"]'), v => v)
await wait(800)
await ev(`(() => { const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^Nutrition$/i.test((x.textContent || '').trim())); if (b && b.getAttribute('aria-expanded') !== 'true') b.click() })()`)
await until(() => has('[data-testid="profile-food-likes"]'), v => v)
await wait(400)

const box = () => ev(`(() => {
  const b = document.querySelector('[data-testid="profile-food-likes"]')
  if (!b) return null
  const label = (b.querySelector('span')?.textContent || '').trim()
  const likes = [...b.querySelectorAll('button[aria-label^="Remove "]')].filter(x => !x.closest('[data-testid="profile-hearted-meals"]')).map(x => x.getAttribute('aria-label').replace(/^Remove /, ''))
  const hearts = [...b.querySelectorAll('[data-hearted-meal]')].map(li => li.dataset.heartedMeal)
  const next = b.nextElementSibling ? (b.nextElementSibling.querySelector('span')?.textContent || '').trim() : null
  return { label, hint: (b.querySelector('p')?.textContent || '').trim(), likes, hearts, next, hasInput: !!b.querySelector('input') }
})()`)
const table = name => ev(`window.__fakeDb[${JSON.stringify(name)}].map(r => ({ ...r }))`)

console.log('\n[1] The list, where she will look for it')
const b0 = await box()
check('Profile has "Foods and meals I like"', b0?.label === 'Foods and meals I like', b0)
check('...right beside "Foods to avoid"', b0?.next === 'Foods to avoid', b0?.next)
check('...saying what a like does, and that it never overrides what she avoids', /made with these in mind/.test(b0?.hint ?? '') && /never override/.test(b0?.hint ?? ''), b0?.hint)
check('...with somewhere to type one', !!b0?.hasInput)
check('a like the coach recorded is on it', (b0?.likes ?? []).includes('curry'), b0?.likes)
check('...and so are the meals she has hearted, because they count too', JSON.stringify(b0?.hearts) === JSON.stringify(['Overnight oats', 'Salmon traybake']), b0?.hearts)
check('the like is not listed a second time among the other preferences',
  !(await ev(`[...document.querySelectorAll('[data-slot="dialog-content"] *')].some(e => e.children.length === 0 && /^likes curry$/i.test((e.textContent || '').trim()))`)))
await ev(`document.querySelector('[data-testid="profile-food-likes"]').scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('meal-likes-profile')

console.log('\n[2] Adding one, as the coach would')
await ev(`(() => { const i = document.querySelector('[data-testid="profile-food-likes"] input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'salmon'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(150)
await ev(`document.querySelector('[data-testid="profile-food-likes"] button[aria-label="Add"]').click()`)
const facts1 = await until(() => table('user_facts'), rows => rows.some(r => (r.resolved_refs ?? []).includes('salmon')))
const salmon = facts1.find(r => (r.resolved_refs ?? []).includes('salmon'))
check('it is saved as the same kind of row a "I love salmon" chat turn writes',
  !!salmon && salmon.kind === 'food_preference' && salmon.polarity === 'like' && salmon.hardness === 'soft' && salmon.status === 'active', salmon)
check('...and it shows on the list', (await until(box, v => (v?.likes ?? []).includes('salmon')))?.likes?.includes('salmon'))

console.log('\n[3] Taking things away')
await ev(`document.querySelector('[data-testid="profile-food-likes"] button[aria-label="Remove curry"]').click()`)
const facts2 = await until(() => table('user_facts'), rows => !rows.some(r => (r.resolved_refs ?? []).includes('curry')))
check('removing a like deletes its row', !facts2.some(r => (r.resolved_refs ?? []).includes('curry')), facts2.map(r => r.resolved_refs))
check('...leaving the other', facts2.some(r => (r.resolved_refs ?? []).includes('salmon')))
await ev(`document.querySelector('button[aria-label="Remove Overnight oats from your hearted meals"]').click()`)
const favs = await until(() => table('favorite_meals'), rows => !rows.some(r => r.name === 'Overnight oats'))
check('removing a hearted meal un-hearts it, in the favourites table', !favs.some(r => r.name === 'Overnight oats') && favs.some(r => r.name === 'Salmon traybake'), favs.map(r => r.name))
check('...and it leaves the list', JSON.stringify((await until(box, v => (v?.hearts ?? []).length === 1))?.hearts) === JSON.stringify(['Salmon traybake']))
const tiny = await ev(`[...document.querySelectorAll('[data-testid="profile-hearted-meals"] button')].map(x => { const r = x.getBoundingClientRect(); return [r.width, r.height, getComputedStyle(x, '::after').content] })`)
check('...by a control a thumb can hit (hit-slop on a small button)', tiny.length > 0 && tiny.every(([, , after]) => after !== 'none'), tiny)
await shoot('meal-likes-after')

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'meal likes: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
