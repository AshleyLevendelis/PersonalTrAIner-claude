// verify:account-row — PROFILE HAS AN ACCOUNT ROW, AND IT TELLS THE TRUTH ABOUT WHICH OF THREE STATES IT IS IN.
//
// His request 20 Nov 2026, "Build the account row": the email prompt could be snoozed for a week and there was
// nowhere else to save an email, so somebody worried about losing their progress had no way to act on it. The page
// is the Profile test page with the real ProfileScreen; its fake sign-in holds the user, and a save writes into it
// so the row is re-read from what the save did. ?confirm=1 is a project that holds the address until the link in
// its email is tapped, which must never be called "saved".
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9976, page: 'profile.html', name: 'account-row', timeoutMs: 200_000 })
const { ev, check, wait, go, until, shoot, finish } = d

const ROW = 'Email & sign-in'
const rowValue = () => ev(`(() => { const r = document.querySelector('[data-profile-row=${JSON.stringify(ROW)}]'); return r ? r.textContent : null })()`)
const state = () => ev(`document.querySelector('[data-account-state]')?.getAttribute('data-account-state') ?? null`)
const sheetText = () => ev(`document.querySelector('[data-profile-sheet="account"]')?.textContent ?? ''`)
const open = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
  await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
  await until(rowValue, v => v != null && !v.includes('…'), 60)
  await wait(300)
}
const openSheet = async () => {
  await ev(`document.querySelector('[data-profile-row=${JSON.stringify(ROW)}]')?.click()`)
  await until(() => ev(`!!document.querySelector('[data-profile-sheet="account"]')`), v => v === true, 30)
  await wait(300)
}
const type = (id, text) => ev(`(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return false
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)})
  el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const save = async () => { await ev(`document.querySelector('[data-account-save]')?.click()`); await wait(900) }
const inView = () => ev(`(() => { const r = document.querySelector('[data-profile-row=${JSON.stringify(ROW)}]')?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight })()`)

console.log('\n  1. NOT SAVED: THE ROW SAYS SO AND THE SHEET SAVES IT')
await open('&account=none')
check('1a. the row is on Profile and says "Not saved yet"', /Not saved yet/.test((await rowValue()) ?? ''), await rowValue())
check('1b. ...without scrolling: it is the first row', (await inView()) === true)
await shoot('account-row-1-row')
await openSheet()
check('1c. the sheet explains what is at stake and holds the form', (await state()) === 'not-saved' && /only on this phone/.test(await sheetText()), await sheetText())
check('1d. ...and its secondary button is Cancel, not the prompt\'s week-long "Not now"', /Cancel/.test(await sheetText()) && !/Not now/.test(await sheetText()))
await type('account-email', 'nope')
await type('account-password', 'longenough')
await save()
check('1e. a bad address is refused in words, and nothing is written', /doesn't look like an email/.test(await sheetText()) && (await ev(`(window.__authWrites ?? []).length`)) === 0)
await type('account-email', 'sam@example.com')
await save()
check('1f. a good one is written to the account', (await ev(`JSON.stringify(window.__authWrites ?? [])`)).includes('sam@example.com'))
check('1g. the sheet says it is tied to that email and how to get back in', (await state()) === 'just-saved' && /tied to sam@example.com/.test(await sheetText()) && /Already have an account\? Sign in/.test(await sheetText()), await sheetText())
await shoot('account-row-1-saved')
await ev(`document.querySelector('[data-profile-back]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-profile-sheet]')`), v => v === false, 20)
check('1h. back on Profile, the row now names the email', /sam@example\.com/.test((await rowValue()) ?? ''), await rowValue())

console.log('\n  2. A PROJECT THAT ASKS FOR THE LINK TO BE TAPPED: NEVER CALLED SAVED')
await open('&account=none&confirm=1')
await openSheet()
await type('account-email', 'sam@example.com')
await type('account-password', 'longenough')
await save()
check('2a. after the save the sheet says to tap the link, and that it is NOT saved yet', (await state()) === 'just-saved' && /Tap it to finish/.test(await sheetText()) && /isn't saved/.test(await sheetText()) && !/tied to/.test(await sheetText()), await sheetText())
await ev(`document.querySelector('[data-profile-back]')?.click()`)
await wait(500)
check('2b. ...and the row says "Check your email", not the address', /Check your email/.test((await rowValue()) ?? '') && !/sam@example/.test((await rowValue()) ?? ''), await rowValue())

console.log('\n  3. ALREADY SAVED, AND ALREADY WAITING')
await open('&account=saved')
check('3a. a saved account shows its email on the row', /sam@example\.com/.test((await rowValue()) ?? ''), await rowValue())
await openSheet()
check('3b. ...and the sheet says signed in, with no form', (await state()) === 'saved' && /Signed in as/.test(await sheetText()) && !(await ev(`!!document.getElementById('account-email')`)))
await shoot('account-row-3-signed-in')
await open('&account=confirming')
check('3c. an address waiting on its link reads "Check your email"', /Check your email/.test((await rowValue()) ?? ''), await rowValue())
await openSheet()
check('3d. ...and the sheet names it and says it is not saved yet', (await state()) === 'confirming' && /sam@example\.com/.test(await sheetText()) && /isn't saved/.test(await sheetText()))

console.log('\n  4. A USER THE APP CANNOT READ IS NEVER "NOT SAVED"')
await open('')
check('4a. no user read: the row says it could not check', /Couldn.t check/.test((await rowValue()) ?? ''), await rowValue())
await openSheet()
check('4b. ...and offers no form that would write to nothing', (await state()) === 'unknown' && !(await ev(`!!document.getElementById('account-email')`)))

await finish('verify:account-row passed: the Account row says which of three states the account is in, and saves an email from Profile.')
