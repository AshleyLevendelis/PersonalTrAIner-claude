// ---------------------------------------------------------------------------
// REPORTING A COACH REPLY, ON THE REAL CHAT AT 390px (20 Nov 2026, his choice "1, build it", for Google Play's rule
// that an AI reply can be reported without leaving the app). Every finished coach bubble has a flag; it opens a sheet
// with four reasons and an optional note; Send writes one row with the reply's own words and the note; a write that
// fails says so and keeps the sheet; your own messages have no flag. Every check runs every time. PORT 9979.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9979, page: 'chat.html', name: 'report-reply' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const rows = () => ev(`(window.__fakeDb?.coach_reply_reports ?? []).map(r => ({ reason: r.reason, note: r.note, text: r.reply_text, user: r.user_id }))`)
const sheet = () => ev(`(() => { const s = document.querySelector('[data-report-sheet]'); if (!s) return null; const r = s.getBoundingClientRect(); return { title: s.querySelector('h2')?.textContent?.trim() ?? null, reasons: s.querySelectorAll('[data-report-reason]').length, sendDisabled: !!s.querySelector('[data-report-send]')?.disabled, failed: !!s.querySelector('[data-report-failed]'), right: Math.round(r.right), left: Math.round(r.left) } })()`)

await go('')
check('1. the chat is up', (await until(() => ev(`document.querySelectorAll('[data-testid="chat-bubble"]').length`), v => v >= 6, 80)) >= 6)
await wait(800)
const counts = await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="chat-bubble"]')]; const coach = b.filter(x => /Coach line/.test(x.textContent)); const you = b.filter(x => /User line/.test(x.textContent)); return { coach: coach.length, coachFlags: coach.filter(x => x.querySelector('[data-report-reply]')).length, youFlags: you.filter(x => x.querySelector('[data-report-reply]')).length } })()`)
check('2. every coach reply has a report flag', counts && counts.coach >= 3 && counts.coachFlags === counts.coach, counts)
check('3. ...and your own messages have none', counts?.youFlags === 0, counts)
const flagSize = await ev(`(() => { const f = document.querySelector('[data-report-reply]'); const r = f.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: f.getAttribute('aria-label') } })()`)
check('4. the flag is named for a screen reader', flagSize?.label === 'Report this reply', flagSize)

const FIRST = `[...document.querySelectorAll('[data-testid="chat-bubble"]')].filter(x => /Coach line/.test(x.textContent))`
const firstText = await ev(`${FIRST}[0].textContent`)
await clickAt(`${FIRST}[0].querySelector('[data-report-reply]')`); await wait(600)
const s1 = await sheet()
check('5. the flag opens "Report this reply" with four reasons', s1?.title === 'Report this reply' && s1?.reasons === 4, s1)
check('6. ...Send is off until a reason is picked', s1?.sendDisabled === true, s1)
check('7. ...and the sheet fits the screen', !!s1 && s1.left >= 0 && s1.right <= 390, s1)
await shoot('report-reply-sheet')
await clickAt(`document.querySelector('[data-report-reason="unsafe"]')`); await wait(200)
await ev(`(() => { const t = document.getElementById('report-note'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Told me to max out with a sore back'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(200)
check('8. a reason picked turns Send on', (await sheet())?.sendDisabled === false, await sheet())
await clickAt(`document.querySelector('[data-report-send]')`)
const saved = await until(rows, v => Array.isArray(v) && v.length === 1, 30)
check('9. Send keeps ONE report, with the reason and the note', saved?.length === 1 && saved[0].reason === 'unsafe' && saved[0].note === 'Told me to max out with a sore back', saved)
check('10. ...and the reply\'s own words, and who sent it', !!saved?.[0]?.text && /Coach line 1/.test(saved[0].text) && /Coach line 1/.test(firstText ?? '') && !!saved[0].user, saved?.[0])
check('11. the sheet says thanks', (await sheet())?.title === 'Thanks, reported', await sheet())
await shoot('report-reply-sent')
await clickAt(`[...document.querySelectorAll('[data-report-sheet] button')].find(b => b.textContent.trim() === 'Done')`); await wait(500)
check('12. the flag stays marked as reported', (await ev(`${FIRST}[0].querySelector('[data-report-reply]')?.getAttribute('data-report-reply')`)) === 'sent')

// A write that fails: said, sheet kept open, nothing kept.
await ev(`window.__failWrite = (t) => t === 'coach_reply_reports'`)
await clickAt(`${FIRST}[1].querySelector('[data-report-reply]')`); await wait(600)
await clickAt(`document.querySelector('[data-report-reason="wrong"]')`); await wait(200)
await clickAt(`document.querySelector('[data-report-send]')`); await wait(1200)
const s2 = await sheet()
check('13. a report that did not save says so, and the sheet stays open to try again', !!s2 && s2.failed === true && s2.title === 'Report this reply' && s2.sendDisabled === false, s2)
check('14. ...and nothing extra was kept', (await rows())?.length === 1, await rows())
await shoot('report-reply-failed')

await finish('verify:report-reply PASSED')
