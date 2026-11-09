// ---------------------------------------------------------------------------
// A CLEARED CHAT IS NOT A NEW ACCOUNT (QA round 3, 8 Nov 2026), at 390px.
//
// A tester in week 2 tapped Clear chat and came back to "welcome aboard. Your plan's built", a tour of an app they
// had been training on, naming a session from the plan's first week rather than the week they were in. Held here:
//   1. no chat rows AND a session trained last week: the returning opener, never "welcome aboard";
//   2. no chat rows and nothing trained: the welcome still comes (the fixture binds; a brand-new account keeps it);
//   3. the welcome names the session of the week it is in: a swap made for the block is what it says, not week 1's.
// Every check runs every time. Ports 9781-9782.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from '../.onb-harness/own-browser.mjs'

const { origin, send, ev, evj, check, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.tour-harness/chat.html',
  ports: [9781, 9782],
})
let loads = 0
const bodyText = () => ev(`document.body.innerText`)
async function open(q) {
  await send('Page.navigate', { url: `${origin}/?${q}&n=${++loads}` })
  // Settled: the opener is composed once the plan and the history have both arrived.
  let t = ''
  for (let i = 0; i < 60; i++) { await wait(250); t = (await bodyText()) ?? ''; if (/welcome aboard|\?/i.test(t) && (await ev(`window.__planArrived`))) break }
  await wait(1200)
  return (await bodyText()) ?? ''
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./chat-cleared-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}

console.log('\nA CLEARED CHAT IS NOT A NEW ACCOUNT, AT 390px\n')

const fresh = await open('seed=opener&rows=0&planDelay=300')
check('1a. the fixture binds: no rows and nothing trained is still welcomed aboard', /welcome aboard/i.test(fresh), fresh.slice(0, 300))
await shot('fresh')

const cleared = await open('seed=opener&rows=0&trained=1&planDelay=300')
check('1b. no rows after training: never "welcome aboard"', !/welcome aboard/i.test(cleared), cleared.slice(0, 400))
check('1c. ...and never "your plan\'s built"', !/plan's built/i.test(cleared), cleared.slice(0, 400))
check('1d. ...the coach still speaks first (the returning opener)', /Hey\b/.test(cleared) && cleared.trim().length > 20, cleared.slice(0, 300))
await shot('cleared')

const swapped = await open('seed=opener&rows=0&swapLive=1&planDelay=300')
const week1 = (await evj(`window.__week1First`)) ?? []
const named = week1.filter(n => n && swapped.includes(n))
check('2a. the fixture binds: the welcome names a session (its session is spelled out)', /welcome aboard/i.test(swapped) && /Day one|Today is|next session is|ready when you are/i.test(swapped), swapped.slice(0, 500))
check('2b. the welcome names the live week\'s exercise (the block swap), not week 1\'s', /Seated Leg Curl/.test(swapped), swapped.slice(0, 600))
check('2c. ...and none of week 1\'s replaced first exercises', named.length === 0 && week1.some(Boolean), { named, week1 })
await shot('swapped')

finish('A cleared chat gets the returning opener, and the welcome names the week it is in.')
