// ---------------------------------------------------------------------------
// GROUPED BUBBLES, MEASURED ON THE REAL CHAT AT 390px — 26 Sep 2026.
//
// Ashley: the coach chat's messages "blur together". The agreed pattern: user
// on the right in the theme's main colour, coach on the left; same sender
// within five minutes is one group; a 28px avatar once per coach group; one
// time per group; 15px text; a day pill when the day changes; cards and the
// typing dots belong to the coach's group.
//
// DESIGN 2a, the same day: the chat is the whole page. A 56px header (avatar,
// "Coach", "Personal TrAIner", clear, the settings gear) replaces the per-group
// name; coach bubbles are the theme's secondary colour with no border (since
// 27 Sep: the flat main colour, her ruling); 6px inside a group, 24px between; every corner 18px except a 4px tail on the
// sender side of the last bubble; coach bubbles up to 88% of the column, yours
// 82%; the composer is the page's last row, sitting straight on the tab bar,
// and the tab bar's chat button lies flat so it cannot cover it.
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
      return new Response(JSON.stringify({ reply: 'Good. Keep the rows light tomorrow.\\n[QUICK_REPLIES: "Sounds good" | "What weight?"]' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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
    tokens: { primary: probe('backgroundColor', '--primary'), onPrimary: probe('color', '--primary-foreground'), secondary: probe('backgroundColor', '--secondary'), background: probe('backgroundColor', '--background'), deep: probe('backgroundColor', '--surface-deep'), muted: probe('color', '--muted-foreground') },
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
            bg: s.backgroundColor, bgImage: s.backgroundImage, shadow: s.boxShadow, color: s.color, borderWidth: px(s.borderTopWidth), borderStyle: s.borderTopStyle,
            links: [...b.querySelectorAll('a')].map(a => { const t = getComputedStyle(a); return { color: t.color, underline: t.textDecorationLine } }),
            retry: [...b.querySelectorAll('button')].filter(x => /retry/i.test(x.textContent)).map(x => { const t = getComputedStyle(x); return { color: t.color, weight: t.fontWeight } }),
          }
        }),
        cards: [...g.querySelectorAll('[data-testid="chat-cards"] > *')].filter(e => e.getBoundingClientRect().height > 0).map(e => ({ text: e.textContent.trim().slice(0, 40), box: box(e) })),
        names: names.map(n => ({ text: n.textContent.trim(), box: box(n) })),
        avatars: avatars.map(a => box(a)),
        avatarImages: avatars.map(a => getComputedStyle(a).backgroundImage),
        times: times.map(t => { const s = getComputedStyle(t); return { text: t.textContent.trim(), box: box(t), fontSize: px(s.fontSize), color: s.color } }),
      }
    }),
  }
}

// The page around the thread (design 2a), read in one pass.
function readPage() {
  const px = v => parseFloat(v)
  const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height } }
  const probe = (prop, token) => { const d = document.createElement('div'); d.style[prop] = `var(${token})`; document.body.appendChild(d); const v = getComputedStyle(d)[prop]; d.remove(); return v }
  const q = sel => document.querySelector(sel)
  const header = q('[data-testid="chat-header"]'), scroller = q('[data-testid="chat-scroller"]'), composer = q('[data-testid="chat-composer"]')
  const nav = q('nav[aria-label="Primary"]')
  const disc = nav ? [...nav.querySelectorAll('button')].find(b => /^Chat/.test(b.getAttribute('aria-label') || '')) : null
  const clear = header ? [...header.querySelectorAll('button')].find(b => /clear/i.test(b.getAttribute('aria-label') || '')) : null
  const gear = header ? header.querySelector('button[aria-label="Profile and settings"]') : null
  const avatar = q('[data-testid="chat-header-avatar"]')
  const title = header?.querySelector('h2'), sub = header?.querySelector('p')
  const pill = composer?.querySelector('textarea')?.parentElement
  const groups = [...document.querySelectorAll('[data-testid="chat-group"]')]
  const cs = e => e ? getComputedStyle(e) : null
  return {
    viewport: { w: innerWidth, h: innerHeight },
    screen: box(q('[data-testid="chat-screen"]')), header: box(header), scroller: box(scroller), composer: box(composer), nav: box(nav), disc: box(disc),
    clear: box(clear), gear: box(gear), avatar: box(avatar), avatarGlow: cs(avatar)?.boxShadow ?? '',
    title: title ? { text: title.textContent.trim(), size: px(cs(title).fontSize), weight: cs(title).fontWeight } : null,
    sub: sub ? { text: sub.textContent.trim(), size: px(cs(sub).fontSize), color: cs(sub).color } : null,
    scrollbar: cs(scroller)?.scrollbarWidth ?? null,
    composerBg: cs(composer)?.backgroundColor ?? null, composerBorderTop: px(cs(composer)?.borderTopWidth ?? '0'),
    pillRadius: pill ? px(cs(pill).borderTopLeftRadius) : null,
    lastGroupBottom: groups.length ? groups[groups.length - 1].getBoundingClientRect().bottom : null,
    tokens: { deep: probe('backgroundColor', '--surface-deep'), muted: probe('color', '--muted-foreground') },
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

console.log('\n[2] Spacing: 6px inside a group, 24px between groups')
const inner = R.groups.flatMap(g => g.items.slice(1).map((it, k) => Math.round((it.box.top - g.items[k].box.bottom) * 10) / 10))
check('every bubble or card inside a group is 6px below the one before', inner.length >= 3 && inner.every(d => near(d, 6)), inner)
const rowGaps = R.rows.slice(1).map((r, k) => Math.round((r.box.top - R.rows[k].box.bottom) * 10) / 10)
check('every group and day pill is 24px from the next', rowGaps.length >= 8 && rowGaps.every(d => near(d, 24)), rowGaps)

console.log('\n[3] Alignment, width, type and colour')
const all = R.groups.flatMap(g => g.bubbles)
const users = all.filter(b => b.role === 'user'), coach = all.filter(b => b.role === 'assistant')
check('user bubbles sit against the right edge', users.length >= 4 && users.every(b => near(b.box.right, R.thread.right)), users.map(b => [b.box.right, R.thread.right]))
check('coach bubbles sit to the right of the avatar column (28px + 8px)', coach.length >= 5 && coach.every(b => near(b.box.left, R.thread.left + 36)), coach.map(b => b.box.left - R.thread.left))
const pct = b => Math.round(b.box.width / R.thread.width * 100)
check('no bubble passes its cap: yours 82% of the chat column, the coach\'s 88%', users.every(b => b.box.width <= R.thread.width * 0.82 + 1) && coach.every(b => b.box.width <= R.thread.width * 0.88 + 1), all.map(b => `${b.role[0]}${pct(b)}`))
check('...and a long one of EACH reaches its cap, so the cap is what stopped it', users.some(b => b.box.width >= R.thread.width * 0.80) && coach.some(b => b.box.width >= R.thread.width * 0.86), all.map(b => `${b.role[0]}${pct(b)}`))
check('body text 15px on a ~1.45 line', all.every(b => b.fontSize === 15 && near(b.lineHeight, 21.75, 0.5)), all.map(b => [b.fontSize, b.lineHeight]))
check('padding 10px 14px', all.every(b => b.pad.join() === '10,14,10,14'), all.map(b => b.pad))
check('user bubbles are filled with the theme\'s main colour and its own ink', users.every(b => b.bg === R.tokens.primary && b.color === R.tokens.onPrimary), { users: users.map(b => [b.bg, b.color]), tokens: R.tokens })
// THE COACH'S BUBBLE IS THE FLAT MAIN COLOUR (Ashley's ruling, 27 Sep 2026,
// over the avatar's fade, which measured under 4.5:1 in three themes). Compared
// against a probe of the same token, so it follows every theme and accent.
check('coach bubbles are the flat main colour with the theme\'s own ink — no fade', coach.length >= 5 && coach.every(b => b.bg === R.tokens.primary && b.bgImage === 'none' && b.color === R.tokens.onPrimary), { coach: coach.map(b => [b.bg, b.bgImage.slice(0, 40), b.color]), primary: R.tokens.primary, ink: R.tokens.onPrimary })
check('...with no border, and none of the avatar\'s glow', coach.every(b => b.borderWidth === 0 && b.shadow === 'none'), coach.map(b => [b.borderWidth, b.shadow]))
check('...and your bubbles keep the flat main colour, no gradient', users.every(b => b.bgImage === 'none'), users.map(b => b.bgImage))
const coachLinks = coach.flatMap(b => b.links), coachRetry = coach.flatMap(b => b.retry)
check('a link inside a coach bubble is the dark ink, underlined — not mint on mint', coachLinks.length >= 1 && coachLinks.every(l => l.color === R.tokens.onPrimary && /underline/.test(l.underline)), coachLinks)
check('a "tap to retry" inside a coach bubble is the dark ink too, not amber on mint', coachRetry.length >= 1 && coachRetry.every(r => r.color === R.tokens.onPrimary && Number(r.weight) >= 500), coachRetry)

console.log('\n[4] Corners: 18px all round, one 4px tail on the sender side of the last bubble')
const expectRadius = (role, pos) => {
  const tail = pos === 'last' || pos === 'single' ? 4 : 18
  return role === 'user' ? [18, 18, tail, 18] : [18, 18, 18, tail]
}
const wrong = all.filter(b => b.radius.join() !== expectRadius(b.role, b.position).join())
check('every bubble\'s corners match its place in the group', all.length >= 9 && wrong.length === 0, wrong.map(b => [b.role, b.position, b.radius]))
const positions = new Set(all.map(b => `${b.role}:${b.position}`))
check('...tested on firsts and lasts for BOTH senders, not only singles', ['user:first', 'user:last', 'assistant:first', 'assistant:last', 'user:single', 'assistant:single'].every(p => positions.has(p)), [...positions])
const cardGroup = R.groups[4]
check('a card between two coach bubbles does not count as a bubble: they are first and last', cardGroup?.bubbles.map(b => b.position).join() === 'first,last', cardGroup?.bubbles.map(b => b.position))

console.log('\n[5] The avatar and the time — once per group; the header names the coach')
const coachGroups = R.groups.filter(g => g.role === 'assistant'), userGroups = R.groups.filter(g => g.role === 'user')
check('no group carries a name label any more — the header says who this is', coachGroups.length >= 4 && R.groups.every(g => g.names.length === 0), R.groups.map(g => g.names.length))
check('every coach group has one 28px avatar, level with the bottom of its last bubble or card', coachGroups.every(g => g.avatars.length === 1 && near(g.avatars[0].width, 28) && near(g.avatars[0].bottom, g.items[g.items.length - 1]?.box.bottom, 2)), coachGroups.map(g => [g.avatars.length, g.avatars[0]?.width, g.avatars[0]?.bottom, g.items[g.items.length - 1]?.box.bottom]))
check('no user group has an avatar', userGroups.every(g => g.avatars.length === 0))
check('every group shows its time once, under its last bubble', R.groups.slice(0, 7).every(g => g.times.length === 1 && g.times[0].box.top >= g.items[g.items.length - 1]?.box.bottom), R.groups.map(g => g.times.length))
check('...small and muted (11-12px, the muted colour), and it reads as a time', R.groups.slice(0, 7).every(g => g.times[0] && g.times[0].fontSize >= 11 && g.times[0].fontSize <= 12 && g.times[0].color === R.tokens.muted && /^\d{1,2}:\d{2}\s?(AM|PM)$/.test(g.times[0].text)), R.groups.map(g => g.times[0]))

console.log('\n[6] A card belongs to the coach\'s group')
const card = cardGroup?.cards[0]
const before = cardGroup?.bubbles[0], after = cardGroup?.bubbles[1]
check('the card is between its two bubbles, inside the same group', !!card && before.box.bottom <= card.box.top && card.box.bottom <= after.box.top, { card, before: before?.box, after: after?.box })
check('...lined up with the coach\'s bubbles, and 6px from each', !!card && near(card.box.left, before.box.left) && near(card.box.top - before.box.bottom, 6) && near(after.box.top - card.box.bottom, 6), { left: [card?.box.left, before?.box.left], gaps: [card?.box.top - before?.box.bottom, after?.box.top - card?.box.bottom] })

console.log('\n[6b] The chat is the page (design 2a)')
await call(() => { const s = document.querySelector('[data-testid="chat-scroller"]'); if (s) s.scrollTop = s.scrollHeight; return true })
await wait(400)
const P = await call(readPage)
check('a 56px header runs across the top of the screen', !!P.header && near(P.header.top, 0) && near(P.header.height, 56) && near(P.header.width, P.viewport.w), P.header)
check('...with a 32px glowing avatar, "Coach" (15px, semibold) over "Personal TrAIner" (11px, muted)',
  near(P.avatar?.width, 32) && /rgba?\(/.test(P.avatarGlow) && P.title?.text === 'Coach' && P.title?.size === 15 && Number(P.title?.weight) >= 600 && P.sub?.text === 'Personal TrAIner' && P.sub?.size === 11 && P.sub?.color === P.tokens.muted,
  { avatar: P.avatar?.width, glow: P.avatarGlow, title: P.title, sub: P.sub })
check('...then the 40px clear button, then the settings gear, both in the header', !!P.clear && !!P.gear && near(P.clear.width, 40) && P.gear.left >= P.clear.right && P.clear.top >= P.header.top && P.gear.bottom <= P.header.bottom, { clear: P.clear, gear: P.gear })
check('the thread fills everything between the header and the composer', !!P.scroller && near(P.scroller.top, P.header?.bottom) && near(P.scroller.bottom, P.composer?.top), { header: P.header?.bottom, scroller: P.scroller, composer: P.composer?.top })
check('...with no scrollbar showing', P.scrollbar === 'none', P.scrollbar)
check('the composer sits straight on the tab bar — no gap, no overlap', !!P.composer && !!P.nav && near(P.composer.bottom, P.nav.top) && near(P.screen?.bottom, P.nav.top), { composer: P.composer?.bottom, nav: P.nav?.top, screen: P.screen?.bottom })
check('...on the dark bottom surface, with a hairline above it and the 22px pill inside', P.composerBg === P.tokens.deep && P.composerBorderTop === 1 && P.pillRadius === 22, { bg: P.composerBg, deep: P.tokens.deep, border: P.composerBorderTop, pill: P.pillRadius })
check('the tab bar\'s chat button lies flat (44px, inside the bar) and covers none of the composer', !!P.disc && near(P.disc.width, 44) && P.disc.top >= P.nav.top - 0.5 && P.disc.top >= P.composer.bottom - 0.5, { disc: P.disc, nav: P.nav?.top, composer: P.composer?.bottom })
check('the newest message sits above the composer', P.lastGroupBottom !== null && P.lastGroupBottom <= P.composer.top + 0.5, { last: P.lastGroupBottom, composer: P.composer?.top })

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
      // Colours on the mint (27 Sep 2026), each against a probe painted from
      // the SAME token at the same strength, so the check follows the theme.
      bubbleImage: getComputedStyle(dots.closest('[data-testid="chat-bubble"]')).backgroundImage,
      bubbleBg: getComputedStyle(dots.closest('[data-testid="chat-bubble"]')).backgroundColor,
      dot: getComputedStyle(dots).backgroundColor,
      label: getComputedStyle(dots.parentElement.parentElement).color,
      want: (() => {
        const d = document.createElement('div'); document.body.appendChild(d)
        d.style.backgroundColor = 'color-mix(in oklab, var(--primary-foreground) 50%, transparent)'
        d.style.color = 'color-mix(in oklab, var(--primary-foreground) 70%, transparent)'
        d.style.borderTopColor = 'var(--primary)'
        const cs = getComputedStyle(d), v = { dot: cs.backgroundColor, label: cs.color, primary: cs.borderTopColor }; d.remove(); return v
      })(),
    }
  })
}
await call(() => { const s = document.querySelector('[data-testid="chat-thread"]')?.parentElement; if (s) s.scrollTop = s.scrollHeight; return true })
await wait(200)
await shoot('chat-bubbles-typing')
check('while the coach is typing, the dots are a bubble in a COACH group with its avatar', typing?.role === 'assistant' && typing?.names === 0 && typing?.avatars === 1, typing)
check('...and the group shows no time until the reply lands', typing?.times === 0, typing)
check('the typing bubble is the flat main colour too, its dots and "Thinking" in the dark ink', !!typing && typing.bubbleImage === 'none' && typing.bubbleBg === typing.want.primary && typing.dot === typing.want.dot && typing.label === typing.want.label, typing && { image: typing.bubbleImage?.slice(0, 50), bg: typing.bubbleBg, dot: typing.dot, label: typing.label, want: typing.want })
check('...and what she just sent is in the user group before it', typing?.prevRole === 'user', typing)
// "Jump to latest" appears when something new arrives while she is scrolled
// UP — so scroll up while the coach is typing, then let the reply land.
await call(() => { const s = document.querySelector('[data-testid="chat-scroller"]'); if (s) { s.scrollTop = 0; s.dispatchEvent(new Event('scroll')) } return true })
await wait(300)
await call(() => { window.__release?.(); return true })
let jump = null
for (let i = 0; i < 20 && !jump; i++) {
  await wait(250)
  jump = await call(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Jump to latest/.test(x.textContent || ''))
    if (!b) return null
    const r = b.parentElement.getBoundingClientRect(), s = document.querySelector('[data-testid="chat-scroller"]').getBoundingClientRect(), c = document.querySelector('[data-testid="chat-composer"]').getBoundingClientRect()
    return { bottom: r.bottom, scrollerBottom: s.bottom, composerTop: c.top }
  })
}
await shoot('chat-bubbles-jump')
check('"Jump to latest" sits 12px above the bottom of the thread, clear of the composer', !!jump && near(jump.bottom, jump.scrollerBottom - 12) && jump.bottom <= jump.composerTop, jump)
await call(() => { [...document.querySelectorAll('button')].find(x => /Jump to latest/.test(x.textContent || ''))?.click(); return true })
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
let chips = []
for (let i = 0; i < 20 && chips.length < 2; i++) {
  await wait(250)
  chips = await call(() => [...document.querySelectorAll('button')].filter(b => /^(Sounds good|What weight\?)$/.test((b.textContent || '').trim()))
    .map(b => { const s = getComputedStyle(b); return { h: b.getBoundingClientRect().height, minH: parseFloat(s.minHeight), padL: parseFloat(s.paddingLeft) } }))
}
check('the reply\'s tap-to-answer chips are 40px tall with 14px sides', chips.length === 2 && chips.every(c => c.minH === 40 && c.h >= 40 && c.padL === 14), chips)
// FOUND HERE, 26 Sep 2026, NOT FIXED: tap "Jump to latest" while a reply is
// still arriving and the thread stops short when the reply's chips appear —
// the jump scrolls SMOOTHLY, the scroll handler reads "not near the bottom"
// part-way through, so the late chips are not followed (48px short,
// measured). Proven by switching the jump to instant: every check here then
// passes. It is a scroll HANDLER, which the design-2a brief put out of
// scope, so it is named in BACKLOG as its own task and deliberately not
// checked here until that fix is agreed. What IS checked: the send button.
let sendBox = null
for (let i = 0; i < 12 && !sendBox; i++) {
  await wait(250)
  sendBox = await call(() => {
    const c = document.querySelector('[data-testid="chat-composer"]').getBoundingClientRect()
    const s = document.querySelector('[data-chat-send]')?.getBoundingClientRect()
    return s ? { send: { left: s.left, right: s.right, top: s.top, bottom: s.bottom }, composer: { left: c.left, right: c.right, top: c.top, bottom: c.bottom } } : null
  })
}
check('the send button is inside the composer', !!sendBox && sendBox.send.left >= sendBox.composer.left && sendBox.send.right <= sendBox.composer.right && sendBox.send.top >= sendBox.composer.top && sendBox.send.bottom <= sendBox.composer.bottom, sendBox)
await wait(1500)
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
      ink: u ? cs(u).color : null,
    }
  }, theme, accent, canvas)
  contrasts.push(c)
  if (theme === 'daylight') { await wait(250); await shoot('chat-bubbles-light') }
}
console.log('      ' + contrasts.map(c => `${c.theme}: you ${c.user}:1${KNOWN_SHORT.has(c.theme) ? '  (known: the app\'s own colour pair)' : ''}`).join('\n      '))
const main = contrasts.filter(c => !KNOWN_SHORT.has(c.theme))
check('your bubbles read at 4.5:1 or better (dark, light, and a white-ink accent)', main.length === 3 && main.every(c => c.user >= 4.5), main)
check('...where the app says white reads, the text IS white on the main colour', contrasts[2]?.ink === 'rgb(255, 255, 255)' && contrasts[2]?.user >= 4.5, contrasts[2])
check('the named shortfall (rose on a light theme) is no worse than the 3:1 floor', contrasts[3] !== undefined && contrasts[3].user >= 3, contrasts[3])

// THE COACH'S BUBBLE, READ IN EVERY THEME (27 Sep 2026). The reader measures
// whatever the bubble actually draws: a flat fill is one colour, and a fade —
// should one ever come back — is read at BOTH ends off the bubble's own
// computed stops, never off a copy written here. Colours go through a canvas
// to sRGB, because the browser can report a colour in oklab.
//
// HISTORY, so the numbers below mean something. Her brief first gave the
// bubble the avatar's fade; measured, its darker bottom and lighter top put
// long messages at 3.3:1 in Graphite, 4.0:1 in Midnight and 3.8:1 in Frost.
// From three options she chose the flat main colour, which reads in all nine
// themes on their own colours. The same flat fill is your bubble's, so across
// every accent it shares your bubble's six named shortfalls (coral and rose on
// the three light themes, the app's own colour pair).
const themeNames = await call(() => [...new Set([...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules] } catch { return [] } })
  .flatMap(r => (r.selectorText || '').split(',').map(x => x.trim().match(/^\[data-theme="([a-z]+)"\]$/)?.[1])).filter(Boolean))])
// "theme" is the theme's own colour (no override rule of its own), then every
// override the stylesheet defines.
const accentNames = await call(() => [...new Set(['theme', ...[...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules] } catch { return [] } })
  .flatMap(r => (r.selectorText || '').split(',').map(x => x.trim().match(/\[data-accent="([a-z]+)"\]$/)?.[1])).filter(Boolean)])])
const LIGHT = new Set(['daylight', 'linen', 'frost'])
function readCoachInk(theme, accent, light) {
  const el = document.documentElement
  el.setAttribute('data-theme', theme); el.setAttribute('data-accent', accent)
  if (light) el.setAttribute('data-canvas', 'light'); else el.removeAttribute('data-canvas')
  const toRGB = css => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.fillStyle = css; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3) }
  const probe = css => { const d = document.createElement('div'); d.style.backgroundColor = css; document.body.appendChild(d); const v = getComputedStyle(d).backgroundColor; d.remove(); return toRGB(v) }
  const lum = rgb => rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100 }
  const bubble = document.querySelector('[data-testid="chat-bubble"][data-role="assistant"]')
  const mine = document.querySelector('[data-testid="chat-bubble"][data-role="user"]')
  const page = document.querySelector('[data-testid="chat-screen"]')
  if (!bubble || !mine || !page) return { theme, accent, top: 0, bottom: 0, pageTop: 0, pageBottom: 0, flat: false, sameAsYours: false }
  const cs = getComputedStyle(bubble)
  const ink = toRGB(cs.color), bg = toRGB(getComputedStyle(page).backgroundColor)
  const image = cs.backgroundImage
  const inner = (image.match(/^linear-gradient\((.*)\)$/) || [])[1] || ''
  const parts = []; let depth = 0, cur = ''
  for (const ch of inner) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = '' } else cur += ch }
  if (cur.trim()) parts.push(cur.trim())
  const stops = parts.filter(t => !/deg|^to /.test(t)).map(t => t.replace(/\s+[\d.]+%$/, ''))
  const fill = toRGB(cs.backgroundColor)
  const top = stops.length >= 2 ? probe(stops[0]) : fill, bottom = stops.length >= 2 ? probe(stops[stops.length - 1]) : fill
  return {
    theme, accent,
    top: ratio(ink, top), bottom: ratio(ink, bottom),
    pageTop: ratio(bg, top), pageBottom: ratio(bg, bottom),
    flat: image === 'none',
    sameAsYours: image === 'none' && cs.backgroundColor === getComputedStyle(mine).backgroundColor && cs.color === getComputedStyle(mine).color,
  }
}
// The canvas conversion is itself checked first, on colours whose answer is
// known, so a browser that refused the colour could not pass as black text.
const toRgbSanity = await call(() => {
  const toRGB = css => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.fillStyle = css; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3).join() }
  return [toRGB('rgb(10, 20, 30)'), toRGB('oklab(1 0 0)'), toRGB('color-mix(in oklab, rgb(0, 0, 0) 50%, white)')]
})
check('the colour reader turns rgb, oklab and a colour-mix into the right sRGB (sanity)', toRgbSanity[0] === '10,20,30' && toRgbSanity[1] === '255,255,255' && toRgbSanity[2] === '99,99,99', toRgbSanity)
const ownAccent = []
for (const theme of themeNames) ownAccent.push(await call(readCoachInk, theme, 'theme', LIGHT.has(theme)))
console.log('      coach text on its bubble, each theme on its own colours: ' + ownAccent.map(x => `${x.theme} ${Math.min(x.top, x.bottom)}:1`).join(', '))
check('every theme there is was measured (9 in the stylesheet today)', ownAccent.length >= 9, ownAccent.map(x => x.theme))
check('in every theme the coach bubble is one flat colour, the same as yours', ownAccent.length >= 9 && ownAccent.every(x => x.flat && x.sameAsYours), ownAccent.map(x => [x.theme, x.flat, x.sameAsYours]))
check('the coach\'s text reads at 4.5:1 or better in EVERY theme on its own colours — no named exceptions', ownAccent.length >= 9 && ownAccent.every(x => Math.min(x.top, x.bottom) >= 4.5), ownAccent.map(x => [x.theme, Math.min(x.top, x.bottom)]))
// THE MINT STANDS CLEAR OF ITS PAGE, which settles the 26 Sep question about
// faint light-theme bubbles (1.10:1 then). SEPARATION_FLOOR is set just under
// the faintest measured on the day it was written (27 Sep 2026: Daylight
// 2.27:1, Linen 2.33:1, every dark theme 7.9:1 or more), so a theme whose
// bubble melts further into its page fails.
const SEPARATION_FLOOR = 2.2
console.log('      coach bubble against the page: ' + ownAccent.map(x => `${x.theme} ${Math.min(x.pageTop, x.pageBottom)}:1`).join(', '))
check(`in every theme the coach bubble stands clear of the page, ${SEPARATION_FLOOR}:1 or more`, ownAccent.length >= 9 && ownAccent.every(x => Math.min(x.pageTop, x.pageBottom) >= SEPARATION_FLOOR), ownAccent.map(x => [x.theme, x.pageTop, x.pageBottom]))
// THE ACCENT OVERRIDE: every theme with every accent. The bubble must stay the
// same flat colour as yours wherever she has taken the accent; the readability
// of each pair is printed, and it is your bubble's own figure.
const everyPair = []
for (const theme of themeNames) for (const accent of accentNames) everyPair.push(await call(readCoachInk, theme, accent, LIGHT.has(theme)))
const pairsOk = everyPair.filter(x => Math.min(x.top, x.bottom) >= 4.5).length
console.log(`      every theme x accent: ${pairsOk} of ${everyPair.length} reach 4.5:1; lowest ${Math.min(...everyPair.map(x => Math.min(x.top, x.bottom)))}:1`)
check('every theme with every accent was tried (81 pairs today)', everyPair.length >= 81 && accentNames.length >= 9, [everyPair.length, accentNames])
check('...and in every one of them the coach bubble is flat and the same as yours', everyPair.length >= 81 && everyPair.every(x => x.flat && x.sameAsYours), everyPair.filter(x => !(x.flat && x.sameAsYours)).map(x => `${x.theme}/${x.accent}`))
await call(() => { const el = document.documentElement; el.setAttribute('data-theme', 'nightshift'); el.setAttribute('data-accent', 'theme'); el.removeAttribute('data-canvas'); return true })

console.log('\n[9] A running timer\'s dock never covers the composer')
// A real stopwatch, started on the harness page, raises the REAL BottomDock
// — the dock that was reported covering the input from a gym floor.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?seed=groups&dock=1` })
let dock = null
for (let i = 0; i < 30 && !dock; i++) {
  await wait(400)
  dock = await call(() => {
    const d = [...document.querySelectorAll('div.fixed.z-50')].find(e => e.getBoundingClientRect().height > 0)
    const c = document.querySelector('[data-testid="chat-composer"]')
    if (!d || !c) return null
    const db = d.getBoundingClientRect(), cb = c.getBoundingClientRect(), nav = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect()
    return { dockTop: db.top, dockBottom: db.bottom, composerTop: cb.top, composerBottom: cb.bottom, navTop: nav.top }
  })
}
await shoot('chat-bubbles-dock')
check('with a timer running, the dock is up (sanity: this section is about something)', !!dock && dock.dockBottom <= dock.navTop, dock)
check('...and the composer sits directly on top of it, not underneath', !!dock && near(dock.composerBottom, dock.dockTop) && dock.composerTop < dock.dockTop, dock)

console.log('\n[10] On every other tab, the chat button is still the raised disc')
// ?seed=nudge puts the harness on Home with the chat off screen — the same
// tab bar component, asked the other half of the question.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?seed=nudge` })
let other = null
for (let i = 0; i < 20 && !other; i++) {
  await wait(300)
  other = await call(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]')
    const disc = nav ? [...nav.querySelectorAll('button')].find(b => /^Chat/.test(b.getAttribute('aria-label') || '')) : null
    if (!disc) return null
    const d = disc.getBoundingClientRect(), n = nav.getBoundingClientRect()
    return { discWidth: d.width, discTop: d.top, navTop: n.top, current: disc.getAttribute('aria-current') }
  })
}
// Measured 26 Sep 2026: the raised disc's top sits 8px above the bar's (its
// -24px margin inside a centred 64px row). The first version of this check
// guessed "more than 10px" and failed on correct code.
check('off the chat, the disc is 56px and stands proud of the bar', !!other && near(other.discWidth, 56) && other.discTop <= other.navTop - 6 && other.current === null, other)

chrome.kill(); server.close()
console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed\n`); process.exit(1) }
console.log('The coach chat reads as grouped bubbles.\n')
