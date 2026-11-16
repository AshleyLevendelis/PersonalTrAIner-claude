// ---------------------------------------------------------------------------
// verify:live-test-nov14 — HIS EVENING LIVE TEST, 14 NOV 2026, ON THE REAL SCREENS AT 390px.
//   A. the chat: "how do I do box jumps?" gets the app's "Watch a video" button (https, YouTube, new tab, 44px);
//      "show me a video" gets it again and a bare address the coach typed becomes a link; a long change row on an
//      offer keeps the new half wide enough to read (his screenshot: one or two letters a line);
//   B. Nutrition (the whole app): a day on the shopping list whose dinner changed since says so, with "Update list",
//      and after the tap it is on the list again;
//   C. Exercise (the whole app): with the plan begun today, the days of this week before it read "Before your plan
//      began", never as sessions.
// The coach is stubbed at the fetch boundary; every other answer is the app's own. Every check runs every time.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url).pathname)
const { chromium } = require('playwright')
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = join(DIST, p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message)))
const wait = ms => new Promise(r => setTimeout(r, ms))
let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }
const shot = async name => { try { writeFileSync(new URL(`./live-nov14-${name}.png`, import.meta.url).pathname, await page.screenshot()) } catch { /* not a check */ } }
const dismissEmail = async () => { const b = page.getByRole('button', { name: /Not now/ }); if (await b.count()) { await b.first().click({ timeout: 3000 }).catch(() => {}); await wait(500) } }
const body = () => page.evaluate(() => document.body.innerText)
const until = async (fn, ok, tries = 40) => { let v; for (let i = 0; i < tries; i++) { v = await fn().catch(() => null); if (ok(v)) return v; await wait(250) } return v }

// The coach, stubbed: a how-to, a video request answered with a bare address, and a swap offer.
await page.addInitScript(() => {
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const reply = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/skipping rope/i.test(said)) return reply({ reply: 'Skipping rope is a great pick for 10 minutes! Try 30 seconds of jumping followed by 30 seconds of rest for 10 rounds.' })
      if (/box jumps/i.test(said)) return reply({ reply: '1. Stand a foot from the box.\n2. Swing your arms and jump.\n3. Land softly, then step down.' })
      if (/video/i.test(said)) return reply({ reply: 'Here is a great tutorial: www.youtube.com/watch?v=abc123' })
      if (/signed up for a 10k/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_running_goal', rawArgs: { goal: '10k', reason: 'Signed up for a 10k.' } } })
      if (/swap/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_exercise_swap', rawArgs: { day: '', old_item: window.__swapOld, new_item: 'leg press', scope: 'today', reason: 'Rack is busy.' } } })
      return reply({ reply: 'Good question.' })
    }
    return realFetch(url, init)
  }
})
const say = async text => {
  await page.evaluate(t => { const a = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(a, t); a.dispatchEvent(new Event('input', { bubbles: true })) }, text)
  await wait(300)
  const sent = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })
  await wait(2500)
  return sent
}
const videoButtons = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="form-video"]')].map(a => {
  const r = a.getBoundingClientRect()
  return { text: a.textContent.trim(), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight }
}))

console.log('\nA. The chat')
await page.goto(`${origin}/.tour-harness/chat.html?day=mid`)
await until(() => page.evaluate(() => !!document.querySelector('textarea')), v => v === true, 120)
check('A0. the chat is up', await page.evaluate(() => !!document.querySelector('textarea')))
check('A1. "how do I do box jumps?" is sent', await say('how do I do box jumps?'))
const v1 = await until(videoButtons, v => Array.isArray(v) && v.length >= 1)
check('A2. the reply carries a "Watch a video" button for Box Jumps', v1?.length === 1 && /Watch a video: Box Jumps/.test(v1[0].text), v1)
check('A3. ...to a YouTube search the app built: https, the exercise\'s name', v1?.[0]?.href === 'https://www.youtube.com/results?search_query=Box%20Jumps%20exercise%20form%20tutorial', v1?.[0]?.href)
check('A4. ...opening in a new tab, safely', v1?.[0]?.target === '_blank' && /noopener/.test(v1?.[0]?.rel ?? ''), v1?.[0])
check('A5. ...a thumb\'s height (44px)', (v1?.[0]?.h ?? 0) >= 44, v1?.[0]?.h)
await shot('video')
check('A6. "show me a video" is sent', await say('show me a video'))
const v2 = await until(videoButtons, v => Array.isArray(v) && v.length >= 2)
check('A7. its reply carries the button again, named from what he asked before', v2?.length === 2 && /Box Jumps/.test(v2[1].text), v2)
const typed = await page.evaluate(() => [...document.querySelectorAll('a')].filter(a => /youtube\.com\/watch\?v=abc123/.test(a.getAttribute('href') || '')).map(a => ({ href: a.getAttribute('href'), target: a.getAttribute('target') })))
check('A8. the address the coach typed is now a link the chat opens in a new tab', typed.length === 1 && typed[0].target === '_blank', typed)
check('A9. a plain question gets no video button', await say('did I train well this week?') && (await videoButtons()).length === 2)
// HIS SCREENSHOT, 16 Nov 2026: "Show me videos of today's exercises" drew ONE button, for an exercise not in the session.
const sessionNames = await page.evaluate(() => window.__todaysExercises ?? null)
check('A9c. "Show me videos of today\'s exercises" is sent', await say("Show me videos of today's exercises"))
const v3 = await until(videoButtons, v => Array.isArray(v) && v.length > 2)
const added = (v3 ?? []).slice(2).map(b => b.text.replace(/^Watch a video: /, ''))
check('A9d. it draws a button for EACH exercise of today\'s session (not one, and not one that is not in it)', added.length >= 3 && new Set(added).size === added.length && !added.includes('Scapular Pull-Ups') && (!Array.isArray(sessionNames) || JSON.stringify(added) === JSON.stringify(sessionNames)), { added, sessionNames })
await shot('video-session')
await shot('video-2')
check('A9b. "I\'ve signed up for a 10k" with no date: the app asks when, and draws no Apply', await say("I've signed up for a 10k and I want to train for it")
  && await until(() => body(), b => /When is it\?/.test(b ?? '')).then(b => /When is it\?/.test(b ?? ''))
  && await page.evaluate(() => ![...document.querySelectorAll('button')].some(b => /^Apply/.test(b.textContent.trim()))))

// HIS REQUEST, 16 Nov 2026: the coach suggests intervals, and one tap starts the round timer at those numbers.
check('A12. "Skipping rope?" is sent', await say('Skipping rope?'))
const tb = await until(() => page.evaluate(() => { const b = document.querySelector('[data-testid="start-intervals"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), h: Math.round(r.height) } }), v => !!v)
check('A13. the reply carries a one-tap "Start the timer" at its own numbers, 10 × 30s with 30s rest', !!tb && tb.text === 'Start the timer · 10 × 30s, 30s rest' && tb.h >= 44, tb)
await shot('intervals-button')
await page.locator('[data-testid="start-intervals"]').first().click({ timeout: 6000 }).catch(() => {})
await wait(800)
const started = await page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith('fitplan_timers_v1:'))
  const rec = key ? JSON.parse(localStorage.getItem(key) || 'null') : null
  return { hash: location.hash, mode: rec?.mode ?? null, config: rec?.roundConfig ?? null }
})
check('A14. ...and tapping it starts the round timer at those numbers and opens Tools', started.mode === 'round' && started.config?.rounds === 10 && started.config?.workSeconds === 30 && started.config?.restSeconds === 30 && /tools/.test(started.hash), started)
check('A15. a reply with no intervals in it carries no timer button', await page.evaluate(() => [...document.querySelectorAll('[data-testid="start-intervals"]')].length === 1))

// A long change row: the offer's own row, with the two halves given his screenshot's lengths.
await page.goto(`${origin}/.tour-harness/chat.html?day=mid&n=2`)
await until(() => page.evaluate(() => !!document.querySelector('textarea')), v => v === true, 120)
const target = await until(() => page.evaluate(() => window.__swapTarget ?? null), v => !!v)
await page.evaluate(t => { window.__swapOld = t }, target?.loose ?? '')
await say('swap it please')
const row = await until(() => page.evaluate(() => {
  const p = document.querySelector('[data-testid="offer-preview"]')
  const to = p?.querySelector('[data-offer-to]')
  const from = p?.querySelector('.line-through')
  if (!p || !to || !from) return null
  from.textContent = "Hunter's chicken with potato wedges"
  to.textContent = 'Eating out, normal (about 600-800 kcal, an estimate)'
  return true
}), v => v === true)
await wait(200)
const geo = await page.evaluate(() => {
  const to = document.querySelector('[data-testid="offer-preview"] [data-offer-to]')
  const r = to?.getBoundingClientRect()
  const lineH = to ? parseFloat(getComputedStyle(to).lineHeight) || 20 : 20
  return r ? { w: Math.round(r.width), lines: Math.round(r.height / lineH) } : null
})
check('A10. a swap offer with its change row is drawn', row === true, row)
check('A11. with his screenshot\'s two halves the new half is at least 140px wide and two lines at most (it was a few letters a line)', !!geo && geo.w >= 140 && geo.lines <= 2, geo)
await shot('offer-row')

console.log('\nB. Nutrition: a list day that changed')
await page.goto(`${origin}/.tour-harness/app-boot.html?clear-storage&list-stale`)
await page.waitForFunction(() => /Today|Home/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
await wait(2500)
await dismissEmail()
await page.evaluate(() => { location.hash = '#/tab/nutrition' })
await wait(2500)
await dismissEmail()
const days = await page.evaluate(() => [...document.querySelectorAll('[data-meal-day]')].map(b => b.getAttribute('data-meal-day')))
const tomorrow = days[1]
await page.locator(`[data-meal-day="${tomorrow}"]`).first().click({ timeout: 6000 }).catch(() => {})
const state = await until(() => page.evaluate(() => document.querySelector('[data-testid="meal-day-grocery"]')?.getAttribute('data-state') ?? null), v => v === 'stale')
check('B1. tomorrow, on the list from a dinner it no longer serves: "out of date", never "already on your list"', state === 'stale', state)
const line = await page.evaluate(() => document.querySelector('[data-testid="meal-day-grocery"]')?.textContent ?? '')
check('B2. ...in words: its meals changed since the list was made, with "Update list"', /changed since your shopping list was made/.test(line) && /Update list/.test(line), line)
await shot('list-stale')
await page.locator('[data-testid="meal-day-grocery-refresh"]').click({ timeout: 4000 }).catch(() => {})
const after = await until(() => page.evaluate(() => document.querySelector('[data-testid="meal-day-grocery"]')?.getAttribute('data-state') ?? null), v => v === 'already')
check('B3. "Update list" puts it right: on the list', after === 'already', after)
const rows = await page.evaluate(() => (window.__fakeDb?.grocery_items ?? []).filter(r => !r.dismissed).flatMap(r => r.meal_refs ?? []).map(m => m.mealName))
check('B4. ...and the list no longer shops for the dinner it does not serve', !rows.includes("Hunter's chicken with potato wedges") && rows.length > 0, rows.slice(0, 6))

console.log('\nC. Exercise: the plan began today')
await page.goto(`${origin}/.tour-harness/app-boot.html?clear-storage&plan-today&n=3`)
await page.waitForFunction(() => /Today|Home/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
await wait(2500)
await dismissEmail()
await page.evaluate(() => { location.hash = '#/tab/exercise' })
await wait(2500)
await dismissEmail()
await page.locator('[data-testid="week-pill"]').click({ timeout: 6000 }).catch(() => {})
await wait(800)
const week = await page.evaluate(() => [...document.querySelectorAll('[data-week-day]')].map(n => ({ date: n.getAttribute('data-week-day'), kind: n.getAttribute('data-week-day-kind'), text: n.textContent.replace(/\s+/g, ' ').trim() })))
const before = week.filter(d => d.kind === 'before-plan')
check('C1. the week view is open with seven days', week.length === 7, week.map(d => d.kind))
check('C2. the days before the plan began read "Before your plan began"', before.length >= 1 && before.every(d => /Before your plan began/.test(d.text)), before)
check('C3. ...and none of them is drawn as a session', week.filter(d => d.kind === 'session').every(d => !before.some(b => b.date === d.date)) && before.every(d => !/min/.test(d.text)), week)
await shot('before-plan')
// C4-C5 (his report 15 Nov 2026): TAPPING a day before the plan on the strip opened that weekday's workout.
await page.locator('[data-testid="week-pill"]').click({ timeout: 6000 }).catch(() => {})
await wait(600)
const firstBefore = before[0]?.date
const beforeName = firstBefore ? new Date(`${firstBefore}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }) : null
// C6-C9 (his ruling 15 Nov 2026, "Next 7 days from today but arrow and swipe to see previous and next days").
const stripDates = () => page.evaluate(() => [...document.querySelectorAll('[data-exercise-strip] [data-strip-date]')].map(n => ({ date: n.getAttribute('data-strip-date'), label: n.textContent.replace(/\s+/g, ' ').trim() })))
const plusDays = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA') }
const s0 = await stripDates()
const todayIso = s0[0]?.date
await shot('strip-from-today')
check('C6. the strip starts today and runs seven days', s0.length === 7 && /^Today/.test(s0[0]?.label ?? '') && s0[6]?.date === plusDays(todayIso, 6), s0)
// A swipe to the left shows the next seven days.
await page.evaluate(() => {
  const el = document.querySelector('[data-exercise-strip]'); const r = el.getBoundingClientRect(); const y = r.top + r.height / 2
  const touch = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(r.right - 20)], changedTouches: [touch(r.right - 20)] }))
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(r.left + 20)] }))
})
await wait(1000)
const s1 = await stripDates()
check('C7. a swipe left shows the next seven days, with a way back to today', s1[0]?.date === plusDays(todayIso, 7) && !s1.some(d => /^Today/.test(d.label)) && await page.locator('[data-testid="strip-today"]').count() === 1, s1)
await page.locator('[data-testid="strip-today"]').click({ timeout: 6000 }).catch(() => {})
await wait(800)
const s2 = await stripDates()
check('C8. "Today" brings the strip back to today', s2[0]?.date === todayIso, s2)
// A WEEKDAY IS NOT A DAY: the same weekday a week after a day before the plan is a plan day, and opens as one.
const sameNameLater = firstBefore ? plusDays(firstBefore, 7) : null
if (sameNameLater) await page.locator(`[data-strip-date="${sameNameLater}"]`).first().click({ timeout: 6000 }).catch(() => {})
await wait(1200)
const later = await page.evaluate(() => ({ rest: document.querySelector('[data-testid="peek-rest-day"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null, rows: document.querySelectorAll('[data-exercise-name]').length, plan: !!document.querySelector('[data-testid="peek-plan"]'), selected: document.querySelector('[data-exercise-strip] [aria-current="date"]')?.getAttribute('data-strip-date') ?? null }))
check('C10. the same weekday next week opens as next week\'s day, never as the day before the plan', !!sameNameLater && later.selected === sameNameLater && !/before your plan began/.test(later.rest ?? '') && (later.plan || !!later.rest), { sameNameLater, ...later })
await page.locator('[data-testid="strip-today"], [data-strip-date="' + todayIso + '"]').first().click({ timeout: 6000 }).catch(() => {})
await wait(800)
await page.locator('[data-testid="strip-prev"]').click({ timeout: 6000 }).catch(() => {})
await wait(1000)
const s3 = await stripDates()
check('C9. the back arrow shows the seven days before today, the plan\'s first days among them', s3[0]?.date === plusDays(todayIso, -7) && s3.some(d => d.date === firstBefore), s3)
if (firstBefore) await page.locator(`[data-strip-date="${firstBefore}"]`).first().click({ timeout: 6000 }).catch(() => {})
await wait(1200)
const panel = await page.evaluate(() => ({ rest: document.querySelector('[data-testid="peek-rest-day"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null, rows: document.querySelectorAll('[data-exercise-name]').length, text: document.body.innerText.slice(0, 600) }))
check('C4. tapping a day before the plan says so, and names no workout', !!beforeName && /was before your plan began/.test(panel.rest ?? ''), { beforeName, rest: panel.rest })
check('C5. ...and lists no exercises', panel.rows === 0, { rows: panel.rows })
await shot('before-plan-tapped')

console.log('\nD. A saved plan made on a rest-day Sunday (his 16 Nov calendar)')
await page.goto(`${origin}/.tour-harness/app-boot.html?clear-storage&plan-sunday&n=4`)
await page.waitForFunction(() => /Today|Home/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
await wait(2500)
await dismissEmail()
await page.evaluate(() => { location.hash = '#/tab/exercise' })
await wait(2500)
await dismissEmail()
await page.locator('[data-testid="program-pill"]').click({ timeout: 6000 }).catch(() => {})
await wait(1500)
await page.locator('button', { hasText: /^Calendar$/ }).first().click({ timeout: 6000 }).catch(() => {})
await wait(1500)
const calRows = await page.evaluate(() => [...document.querySelectorAll('[data-calendar-row]')].slice(0, 5).map(r => ({ monday: r.getAttribute('data-calendar-row'), label: r.querySelector('[data-calendar-row-label]')?.textContent.trim() ?? '', kind: r.querySelector('[data-calendar-row-label]')?.getAttribute('data-calendar-row-label') ?? null })))
check('D1. the calendar opens on the Monday after the Sunday it was made, labelled W1', calRows.length >= 4 && calRows[0].label === 'W1' && new Date(`${calRows[0].monday}T12:00:00`).getDay() === 1, calRows)
check('D2. ...and every row reads one week, W1 W2 W3 W4, never "W1–2" and no row of the week before', JSON.stringify(calRows.slice(0, 4).map(r => r.label)) === '["W1","W2","W3","W4"]', calRows)
await shot('calendar-sunday')
check('harness: no page errors', errors.length === 0, errors.slice(0, 3))

console.log(`\n${ran} checks ran.${failures ? ` ${failures} FAILED.` : ' His 14 Nov findings hold on screen.'}`)
await browser.close()
server.close()
process.exit(failures > 0 ? 1 : 0)
