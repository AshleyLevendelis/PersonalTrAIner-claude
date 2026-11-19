// verify:remembers-words — PROFILE'S "REMEMBERS" LIST READS IN PLAIN WORDS, AND THE DATA BUTTONS CAN BE TAPPED.
//
// The Profile walk of 18 Nov 2026 (findings P4 and P6): a note read "won't eat/do mushrooms" with a pill saying
// "hard" and "manual · Sep 16, 2026" under it; "Download my data" and "Delete everything" were 32px tall.
// scripts/test-fact-display.ts holds the words; this is the real Profile screen at phone size.
//
// THE FIXTURE IS INPUT ONLY (?remembers=1): two stored notes written the OLD way, as rows saved before this change
// are: an exercise ban ("won't eat/do Barbell Squats", source "manual", hardness "hard") and a timing rule from
// chat. Food likes and dislikes are not in this list (they have their own rows), so neither is used here.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9972, page: 'profile.html', name: 'remembers-words', timeoutMs: 200_000 })
const { ev, check, wait, go, until, shoot, finish } = d

await go('&remembers=1')
await until(() => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`), v => v === true, 120)
await wait(600)
await ev(`(() => { window.__err = null; window.addEventListener('error', e => { window.__err = String(e.message) }); window.addEventListener('unhandledrejection', e => { window.__err = String(e.reason) }) })()`)

console.log('\n  1. THE DATA BUTTONS ARE FULL HEIGHT')
const btn = re => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => ${re}.test((x.innerText || '').trim())); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) } })()`)
const dl = await btn('/^Download my data$/')
const del = await btn('/^Delete everything$/')
check('1a. "Download my data" is at least 44px tall (it was 32)', !!dl && dl.h >= 44, dl)
check('1b. "Delete everything" is at least 44px tall (it was 32)', !!del && del.h >= 44, del)
await ev(`[...document.querySelectorAll('button')].find(x => /^Delete everything$/.test((x.innerText || '').trim()))?.click()`)
await wait(400)
const confirm = await btn('/^Delete everything, permanently$/')
const cancel = await btn('/^Cancel$/')
check('1c. the confirm step\'s two buttons are full height too, and nothing was deleted by opening it', !!confirm && confirm.h >= 44 && !!cancel && cancel.h >= 44 && (await ev(`(window.__fakeDb?.fitness_profiles || []).length`)) >= 1, { confirm, cancel })
await shoot('remembers-words-1-data')
await ev(`[...document.querySelectorAll('button')].find(x => /^Cancel$/.test((x.innerText || '').trim()))?.click()`)
await wait(300)

console.log('\n  2. A REMEMBERED NOTE, IN PLAIN WORDS')
await ev(`document.querySelector('[data-profile-row="Remembers"]')?.scrollIntoView({ block: 'center' })`)
await ev(`document.querySelector('[data-profile-row="Remembers"]')?.click()`)
await until(() => ev(`document.querySelectorAll('[data-profile-sheet] [data-testid="fact-text"]').length`), v => v >= 2, 40)
await wait(400)
const notes = await ev(`[...document.querySelectorAll('[data-profile-sheet] [data-testid="fact-text"]')].map(t => { const card = t.closest('.rounded-md'); const r = t.getBoundingClientRect(); return { text: t.textContent.trim(), source: card?.querySelector('[data-testid="fact-source"]')?.textContent.trim() ?? null, all: (card?.innerText || '').replace(/\\s+/g, ' ').trim(), onScreen: r.top >= 0 && r.bottom <= innerHeight } })`)
const avoid = (notes ?? []).find(n => /Squats/.test(n.text))
const like = (notes ?? []).find(n => /caffeine/.test(n.text))
check('2a. both stored notes are listed (more than one, so "which note" is a real question)', (notes ?? []).length >= 2 && !!avoid && !!like, notes)
check('2b. the exercise he banned reads "won\'t do Barbell Squats" (it read "won\'t eat/do Barbell Squats"), on screen', avoid?.text === "won't do Barbell Squats" && avoid.onScreen === true, avoid)
check('2c. ...and the other note is left word for word', like?.text === 'no caffeine before training', like)
const DATE = '\\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{4}'
check('2d. where each came from is in words with its date: "Added by you · 16 Sep 2026", "From chat · 20 Sep 2026"', avoid?.source === 'Added by you · 16 Sep 2026' && like?.source === 'From chat · 20 Sep 2026' && new RegExp(`· ${DATE}$`).test(avoid?.source ?? ''), [avoid?.source, like?.source])
check('2e. no stored label is on either note: not "manual", "hard", "soft" or "eat/do"', (notes ?? []).length >= 2 && (notes ?? []).every(n => !/\bmanual\b|\bhard\b|\bsoft\b|eat\/do/.test(n.all)), (notes ?? []).map(n => n.all))
check('2f. the ban still says what it does, in words', /excludes 1 exercise/.test(avoid?.all ?? ''), [avoid?.all, like?.all])
check('2g. the rule about training says plainly that it is kept and NOT applied, with no builder\'s words', /remembered, not applied: your meals are not planned around when you train/.test(like?.all ?? '') && !/day-context|generation|pool|not yet/.test(like?.all ?? ''), like?.all)
await shoot('remembers-words-2-notes')

console.log('\n  3. EDITING STARTS FROM THE WORDS HE SEES')
await ev(`(() => { const t = [...document.querySelectorAll('[data-profile-sheet] [data-testid="fact-text"]')].find(x => /Squats/.test(x.textContent)); t?.closest('.rounded-md')?.querySelector('button[aria-label^="Edit note"]')?.click() })()`)
await wait(400)
const editing = await ev(`document.querySelector('[data-profile-sheet] .rounded-md input')?.value ?? null`)
check('3a. the edit box opens on "won\'t do Barbell Squats", not the stored label', editing === "won't do Barbell Squats", editing)
await ev(`document.querySelector('[data-profile-sheet] button[aria-label="Cancel editing"]')?.click()`)
await wait(300)
check('3b. cancelling leaves the store as it was', (await ev(`(window.__fakeDb?.user_facts || []).find(f => /Squats/.test(f.raw_phrase || ''))?.display_text ?? null`)) === "won't eat/do Barbell Squats")

check('4. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('Profile\'s remembered notes read in plain words, and the data buttons are full height.')
