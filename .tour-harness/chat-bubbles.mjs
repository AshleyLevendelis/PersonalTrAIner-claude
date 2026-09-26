// ---------------------------------------------------------------------------
// GROUPED BUBBLES, MEASURED ON THE REAL CHAT AT 390px — 26 Sep 2026.
//
// Ashley: the coach chat's messages "blur together". The agreed pattern: user
// on the right in the theme's main colour, coach on the left in a bordered
// surface bubble; same sender within five minutes is one group; 4px inside a
// group, 20px between groups; "Coach" and a 28px avatar once per coach group;
// one time per group; 18px corners with the sender-side bottom tucked to 6px;
// ~78% max width; 15px text; a day pill when the day changes; cards and the
// typing dots belong to the coach's group.
//
// The thread is ?seed=groups in chat.tsx, timed off the harness anchor, so
// every rule has at least TWO candidates on screen (a check on which of N
// things something attaches to needs N > 1). The typing dots are caught by
// holding the coach's reply open at the fetch boundary.
//
// Every check runs every time with a null-safe subject, so a broken feature
// prints the same number of checks as a working one.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, statSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0].split('#')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/chat.html' : p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const PORT = 9431
const chrome = spawn('/opt/pw-browsers/chromium',
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
async function call(fn, ...args) {
  const r = await send('Runtime.evaluate', { expression: `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0, ran = 0
const check = (l, ok, extra) => {
  ran++
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}
const near = (a, b, tol = 1) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
// The coach's reply is held until the driver lets it go, so the typing dots
// can be measured while they are on screen rather than raced.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.__release = null
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      await new Promise(r => { window.__release = r })
      return new Response(JSON.stringify({ reply: 'Good. Keep the rows light tomorrow.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?seed=groups` })
let up = false
for (let i = 0; i < 30 && !up; i++) { await wait(500); up = await call(() => document.querySelectorAll('[data-testid="chat-group"]').length >= 7) }
await wait(800)

// Everything the checks read, in one pass. Colours are compared against a
// probe painted with the SAME token, so the check follows the theme instead
// of pinning a hex that a theme change would silently break.
function read() {
  const px = v => parseFloat(v)
  const probe = (prop, token) => {
    const d = document.createElement('div'); d.style[prop] = `var(${token})`; document.body.appendChild(d)
    const v = getComputedStyle(d)[prop]; d.remove(); return v
  }
  const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height } }
  const thread = document.querySelector('[data-testid="chat-thread"]')
  const rows = thread ? [...thread.children] : []
  const groups = [...document.querySelectorAll('[data-testid="chat-group"]')]
  return {
    thread: box(thread),
    tokens: { primary: probe('backgroundColor', '--primary'), onPrimary: probe('color', '--primary-foreground'), card: probe('backgroundColor', '--card'), muted: probe('color', '--muted-foreground') },
    rows: rows.map(r => ({ kind: r.dataset.testid === 'chat-day' ? 'day' : r.dataset.testid === 'chat-group' ? 'group' : 'other', text: r.dataset.testid === 'chat-day' ? r.textContent.trim() : null, box: box(r) })),
    groups: groups.map(g => {
      const items = [...g.querySelectorAll('[data-testid="chat-bubble"], [data-testid="chat-cards"] > *')]
        .filter(e => e.getBoundingClientRect().height > 0)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      const bubbles = [...g.querySelectorAll('[data-testid="chat-bubble"]')]
      const names = [...g.querySelectorAll('[data-testid="chat-group-name"]')]
      const avatars = [...g.querySelectorAll('[data-testid="chat-avatar"]')]
      const times = [...g.querySelectorAll('[data-testid="chat-group-time"]')]
      return {
        role: g.dataset.role,
        box: box(g),
        items: items.map(e => ({ bubble: e.dataset.testid === 'chat-bubble', text: e.textContent.trim().slice(0, 40), box: box(e) })),
        bubbles: bubbles.map(b => {
          const s = getComputedStyle(b)
          return {
            position: b.dataset.position, role: b.dataset.role, text: b.textContent.trim().slice(0, 40), box: box(b),
            radius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(px),
            fontSize: px(s.fontSize), lineHeight: px(s.lineHeight),
            pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(px),
            bg: s.backgroundColor, color: s.color, borderWidth: px(s.borderTopWidth), borderStyle: s.borderTopStyle,
          }
        }),
        cards: [...g.querySelectorAll('[data-testid="chat-cards"] > *')].filter(e => e.getBoundingClientRect().height > 0).map(e => ({ text: e.textContent.trim().slice(0, 40), box: box(e) })),
        names: names.map(n => ({ text: n.textContent.trim(), box: box(n) })),
        avatars: avatars.map(a => box(a)),
        times: times.map(t => { const s = getComputedStyle(t); return { text: t.textContent.trim(), box: box(t), fontSize: px(s.fontSize), color: s.color } }),
      }
    }),
  }
}

console.log('\n[1] The thread is grouped the way the rules say')
const R = await call(read)
check('the real chat mounted the grouped thread', !!R.thread && R.groups.length >= 7, R.groups.length)
const days = R.rows.filter(r => r.kind === 'day').map(r => r.text)
check('a day pill where the day changes: "Yesterday", then "Today"', days[0] === 'Yesterday' && days[1] === 'Today', days)
const shape = R.groups.slice(0, 7).map(g => `${g.role}:${g.bubbles.length}${g.cards.length ? `+${g.cards.length}card` : ''}`)
const EXPECTED = ['assistant:1', 'user:1', 'assistant:1', 'user:2', 'assistant:2+1card', 'assistant:1', 'user:1']
check('groups, in order: two user messages 30s apart are ONE group; a card sits inside its coach group', JSON.stringify(shape) === JSON.stringify(EXPECTED), shape)
check('more than five minutes of silence starts a NEW group from the same sender', R.groups[4]?.role === 'assistant' && R.groups[5]?.role === 'assistant', shape)
const todayAt = R.rows.findIndex(r => r.kind === 'day' && r.text === 'Today')
const rowsBeforeToday = R.rows.slice(0, todayAt).filter(r => r.kind === 'group').length
check('the "Today" pill sits between yesterday\'s groups and today\'s', rowsBeforeToday === 2, rowsBeforeToday)

console.log('\n[2] Spacing: 4px inside a group, 20px between groups')
const inner = R.groups.flatMap(g => g.items.slice(1).map((it, k) => Math.round((it.box.top - g.items[k].box.bottom) * 10) / 10))
check('every bubble or card inside a group is 4px below the one before', inner.length >= 3 && inner.every(d => near(d, 4)), inner)
const rowGaps = R.rows.slice(1).map((r, k) => Math.round((r.box.top - R.rows[k].box.bottom) * 10) / 10)
check('every group and day pill is 20px from the next', rowGaps.length >= 8 && rowGaps.every(d => near(d, 20)), rowGaps)

console.log('\n[3] Alignment, width, type and colour')
const all = R.groups.flatMap(g => g.bubbles)
const users = all.filter(b => b.role === 'user'), coach = all.filter(b => b.role === 'assistant')
check('user bubbles sit against the right edge', users.length >= 4 && users.every(b => near(b.box.right, R.thread.right)), users.map(b => [b.box.right, R.thread.right]))
check('coach bubbles sit to the right of the avatar column (28px + 8px)', coach.length >= 5 && coach.every(b => near(b.box.left, R.thread.left + 36)), coach.map(b => b.box.left - R.thread.left))
check('no bubble is wider than ~78% of the chat column', all.every(b => b.box.width <= R.thread.width * 0.78 + 1), all.map(b => Math.round(b.box.width / R.thread.width * 100)))
check('...and a long one reaches it, so the cap is what stopped it', all.some(b => b.box.width >= R.thread.width * 0.74), all.map(b => Math.round(b.box.width / R.thread.width * 100)))
check('body text 15px on a ~1.45 line', all.every(b => b.fontSize === 15 && near(b.lineHeight, 21.75, 0.5)), all.map(b => [b.fontSize, b.lineHeight]))
check('padding 10px 14px', all.every(b => b.pad.join() === '10,14,10,14'), all.map(b => b.pad))
check('user bubbles are filled with the theme\'s main colour and its own ink', users.every(b => b.bg === R.tokens.primary && b.color === R.tokens.onPrimary), { users: users.map(b => [b.bg, b.color]), tokens: R.tokens })
check('coach bubbles are the surface colour with a 1px border', coach.every(b => b.bg === R.tokens.card && b.borderWidth === 1 && b.borderStyle === 'solid'), coach.map(b => [b.bg, b.borderWidth]))

console.log('\n[4] Corners: 18px, the sender-side bottom tucked to 6px, joins tucked')
const expectRadius = (role, pos) => {
  const top = pos === 'middle' || pos === 'last' ? 6 : 18
  return role === 'user' ? [18, top, 6, 18] : [top, 18, 18, 6]
}
const wrong = all.filter(b => b.radius.join() !== expectRadius(b.role, b.position).join())
check('every bubble\'s corners match its place in the group', all.length >= 9 && wrong.length === 0, wrong.map(b => [b.role, b.position, b.radius]))
const positions = new Set(all.map(b => `${b.role}:${b.position}`))
check('...tested on firsts and lasts for BOTH senders, not only singles', ['user:first', 'user:last', 'assistant:first', 'assistant:last', 'user:single', 'assistant:single'].every(p => positions.has(p)), [...positions])
const cardGroup = R.groups[4]
check('a card between two coach bubbles does not count as a bubble: they are first and last', cardGroup?.bubbles.map(b => b.position).join() === 'first,last', cardGroup?.bubbles.map(b => b.position))

console.log('\n[5] "Coach", the avatar and the time — once per group')
const coachGroups = R.groups.filter(g => g.role === 'assistant'), userGroups = R.groups.filter(g => g.role === 'user')
check('every coach group has "Coach" once, above its first bubble', coachGroups.length >= 4 && coachGroups.every(g => g.names.length === 1 && g.names[0].text === 'Coach' && g.names[0].box.bottom <= g.items[0]?.box.top), coachGroups.map(g => g.names.length))
check('no user group is labelled', userGroups.every(g => g.names.length === 0), userGroups.map(g => g.names.length))
check('every coach group has one 28px avatar, level with the bottom of its last bubble or card', coachGroups.every(g => g.avatars.length === 1 && near(g.avatars[0].width, 28) && near(g.avatars[0].bottom, g.items[g.items.length - 1]?.box.bottom, 2)), coachGroups.map(g => [g.avatars.length, g.avatars[0]?.width, g.avatars[0]?.bottom, g.items[g.items.length - 1]?.box.bottom]))
check('no user group has an avatar', userGroups.every(g => g.avatars.length === 0))
check('every group shows its time once, under its last bubble', R.groups.slice(0, 7).every(g => g.times.length === 1 && g.times[0].box.top >= g.items[g.items.length - 1]?.box.bottom), R.groups.map(g => g.times.length))
check('...small and muted (11-12px, the muted colour), and it reads as a time', R.groups.slice(0, 7).every(g => g.times[0] && g.times[0].fontSize >= 11 && g.times[0].fontSize <= 12 && g.times[0].color === R.tokens.muted && /^\d{1,2}:\d{2}\s?(AM|PM)$/.test(g.times[0].text)), R.groups.map(g => g.times[0]))

console.log('\n[6] A card belongs to the coach\'s group')
const card = cardGroup?.cards[0]
const before = cardGroup?.bubbles[0], after = cardGroup?.bubbles[1]
check('the card is between its two bubbles, inside the same group', !!card && before.box.bottom <= card.box.top && card.box.bottom <= after.box.top, { card, before: before?.box, after: after?.box })
check('...lined up with the coach\'s bubbles, and 4px from each', !!card && near(card.box.left, before.box.left) && near(card.box.top - before.box.bottom, 4) && near(after.box.top - card.box.bottom, 4), { left: [card?.box.left, before?.box.left], gaps: [card?.box.top - before?.box.bottom, after?.box.top - card?.box.bottom] })

await call(() => { const s = document.querySelector('[data-testid="chat-thread"]')?.parentElement; if (s) s.scrollTop = 0; return true })
await wait(300)
await shoot('chat-bubbles')
await call(() => { document.querySelectorAll('[data-testid="chat-group"]')[4]?.scrollIntoView({ block: 'center' }); return true })
await wait(300)
await shoot('chat-bubbles-card')

console.log('\n[7] The typing dots join the coach\'s group')
await call(() => {
  const t = document.querySelector('textarea')
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  set.call(t, 'Thanks, will do.'); t.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})
await wait(300)
await call(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); b?.click(); return !!b })
let typing = null
for (let i = 0; i < 20 && !typing; i++) {
  await wait(250)
  typing = await call(() => {
    const groups = [...document.querySelectorAll('[data-testid="chat-group"]')]
    const g = groups[groups.length - 1]
    const dots = g?.querySelector('[data-testid="chat-bubble"] .animate-bounce')
    if (!dots) return null
    return {
      role: g.dataset.role,
      names: g.querySelectorAll('[data-testid="chat-group-name"]').length,
      avatars: g.querySelectorAll('[data-testid="chat-avatar"]').length,
      times: g.querySelectorAll('[data-testid="chat-group-time"]').length,
      prevRole: groups[groups.length - 2]?.dataset.role,
      prevLast: groups[groups.length - 2]?.querySelector('[data-testid="chat-bubble"]:last-of-type')?.textContent.trim(),
    }
  })
}
await call(() => { const s = document.querySelector('[data-testid="chat-thread"]')?.parentElement; if (s) s.scrollTop = s.scrollHeight; return true })
await wait(200)
await shoot('chat-bubbles-typing')
check('while the coach is typing, the dots are a bubble in a COACH group with its name and avatar', typing?.role === 'assistant' && typing?.names === 1 && typing?.avatars === 1, typing)
check('...and the group shows no time until the reply lands', typing?.times === 0, typing)
check('...and what she just sent is in the user group before it', typing?.prevRole === 'user', typing)
await call(() => { window.__release?.(); return true })
let landed = null
for (let i = 0; i < 20 && !landed; i++) {
  await wait(300)
  landed = await call(() => {
    const groups = [...document.querySelectorAll('[data-testid="chat-group"]')]
    const g = groups[groups.length - 1]
    if (!g || !/Keep the rows light/.test(g.textContent)) return null
    return {
      role: g.dataset.role,
      bubbles: g.querySelectorAll('[data-testid="chat-bubble"]').length,
      dots: g.querySelectorAll('.animate-bounce').length,
      time: g.querySelector('[data-testid="chat-group-time"]')?.textContent.trim() ?? null,
      coachGroupsAtEnd: groups.slice(-2).map(x => x.dataset.role),
    }
  })
}
check('the reply takes the dots\' place in the same coach group — one bubble, no dots', landed?.role === 'assistant' && landed?.bubbles === 1 && landed?.dots === 0, landed)
check('...and now shows the time it arrived', typeof landed?.time === 'string' && /^\d{1,2}:\d{2}\s?(AM|PM)$/.test(landed.time), landed)
await wait(300)
await shoot('chat-bubbles-reply')

console.log('\n[8] Readable in every kind of theme — the ink is the theme\'s own, never a fixed white')
// The request said white text on the main colour. Every theme and accent
// already names the ink that reads on its own main colour (--primary-
// foreground), and white on the default mint measures 1.5:1. So the bubble
// uses that ink, which IS white exactly where the app decided white reads.
//
// MEASURED ACROSS ALL 81 THEME x ACCENT PAIRS, 26 Sep 2026: 75 reach 4.5:1.
// The six that do not are coral and rose on the three light themes, where the
// app's OWN pair is white on a mid-tone fill (3.4-3.9:1) — the same pair every
// main button uses there. That is a token decision outside a layout change and
// is Ashley's to make; it is named here, not hidden, and held to the 3:1 floor
// so it cannot quietly get worse.
const KNOWN_SHORT = new Set(['daylight/coral', 'daylight/rose', 'linen/coral', 'linen/rose', 'frost/coral', 'frost/rose'])
const THEMES = [['nightshift', 'theme', null], ['daylight', 'theme', 'light'], ['frost', 'sky', 'light'], ['linen', 'rose', 'light']]
const contrasts = []
for (const [theme, accent, canvas] of THEMES) {
  const c = await call((theme, accent, canvas) => {
    const el = document.documentElement
    el.setAttribute('data-theme', theme); el.setAttribute('data-accent', accent)
    if (canvas) el.setAttribute('data-canvas', canvas); else el.removeAttribute('data-canvas')
    const lum = str => {
      const [r, g, b] = (str.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
    const pick = role => document.querySelector(`[data-testid="chat-bubble"][data-role="${role}"]`)
    const u = pick('user'), a = pick('assistant')
    const cs = e => e ? getComputedStyle(e) : null
    return {
      theme: `${theme}/${accent}`,
      user: u ? Math.round(ratio(cs(u).color, cs(u).backgroundColor) * 10) / 10 : 0,
      coach: a ? Math.round(ratio(cs(a).color, cs(a).backgroundColor) * 10) / 10 : 0,
      ink: u ? cs(u).color : null,
    }
  }, theme, accent, canvas)
  contrasts.push(c)
  if (theme === 'daylight') { await wait(250); await shoot('chat-bubbles-light') }
}
console.log('      ' + contrasts.map(c => `${c.theme}: you ${c.user}:1, coach ${c.coach}:1${KNOWN_SHORT.has(c.theme) ? '  (known: the app\'s own colour pair)' : ''}`).join('\n      '))
const main = contrasts.filter(c => !KNOWN_SHORT.has(c.theme))
check('your bubbles read at 4.5:1 or better (dark, light, and a white-ink accent)', main.length === 3 && main.every(c => c.user >= 4.5), main)
check('the coach\'s bubbles read at 4.5:1 or better in every theme tried', contrasts.length === 4 && contrasts.every(c => c.coach >= 4.5), contrasts)
check('...where the app says white reads, the text IS white on the main colour', contrasts[2]?.ink === 'rgb(255, 255, 255)' && contrasts[2]?.user >= 4.5, contrasts[2])
check('the named shortfall (rose on a light theme) is no worse than the 3:1 floor', contrasts[3] !== undefined && contrasts[3].user >= 3, contrasts[3])

chrome.kill(); server.close()
console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed\n`); process.exit(1) }
console.log('The coach chat reads as grouped bubbles.\n')
