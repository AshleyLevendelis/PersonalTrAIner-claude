// ---------------------------------------------------------------------------
// A DIFFERENT OFFER FOR THE SAME THING REPLACES THE OPEN ONE (QA walk N1, 8 Nov 2026).
//
// The database holds one open offer per thing (a partial unique index). Asking for a different dinner while the first
// offer was still open was refused by that index, and the app answered with the FIRST offer's row: the new card showed
// the old dish again and the old card kept its buttons. The harness's fake database did not enforce the index, so no
// driver could see it; it does now (fake-supabase.ts). On the real chat at 390px:
//   1. the second ask names a DIFFERENT dish from the first;
//   2. exactly one offer on screen is live, the newer one; the older is greyed at once;
//   3. Apply on the newer one swaps to ITS dish;
//   4. the same ask twice (a retried call) still makes no second card (the index's original job).
//
// PORT 9883.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9883, page: 'chat.html', name: 'chat-offer-replace', timeoutMs: 300_000 })
const { origin, send, ev, check, until, wait, shoot, finish } = d

// The coach only parses: "swap my dinner" with no dish named, so the app picks the next option each time.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return json({ reply: '', proposal: { kind: 'propose_meal_swap', rawArgs: { meal_slot: 'dinner', reason: said } } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `${origin}/.tour-harness/chat.html?daymove=1&n=1` })
await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 60)
await until(() => ev(`window.__weekMeals ? Object.keys(window.__weekMeals()).length : 0`), v => v === 7, 60)

const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const cards = () => ev(`[...document.querySelectorAll('[data-testid="proposal-card"]')].map(c => ({ status: c.getAttribute('data-card-status'), text: c.innerText.trim(), apply: [...c.querySelectorAll('button')].some(b => /^Apply/.test(b.textContent.trim()) && !b.disabled) }))`)
// The dish a swap card offers: the "after" side of its first line.
const offered = c => (/^Meal: .* → (.+)$/m.exec(c?.text ?? '') ?? [])[1]?.trim() ?? null

console.log('\n1. Two asks for a different dinner\n')
check('1a. the first ask is sent', await say('swap my dinner'))
const one = await until(cards, c => Array.isArray(c) && c.length === 1 && c[0].status === 'pending', 60)
check('1b. ...and an offer comes back', one?.length === 1, one)
check('1c. the second ask is sent', await say('something else please'))
const two = await until(cards, c => Array.isArray(c) && c.length === 2, 60)
check('1d. ...and a second card comes back', two?.length === 2, two)
check('1e. the second card offers a DIFFERENT dinner from the first',
  !!two?.[0]?.text && !!two?.[1]?.text && two[1].text !== two[0].text, two?.map(c => c.text.slice(0, 160)))
await shoot('chat-offer-replace-two')

console.log('\n2. One live offer on screen, the newer one\n')
check('2a. the older card is no longer live', two?.[0]?.status !== 'pending' && two?.[0]?.apply === false, two?.[0])
check('2b. the newer card is live, with Apply', two?.[1]?.status === 'pending' && two?.[1]?.apply === true, two?.[1])

console.log('\n3. Apply on the newer card does what it says\n')
const newerOffers = offered(two?.[1]); const olderOffers = offered(two?.[0])
check('3a. each card names its dish (the read binds)', !!newerOffers && !!olderOffers && newerOffers !== olderOffers, { newerOffers, olderOffers })
const tapped = await ev(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); const b = c && [...c.querySelectorAll('button')].find(x => /^Apply/.test(x.textContent.trim())); if (!b) return false; b.click(); return true })()`)
check('3b. Apply on the newer card is tapped', tapped === true)
const applied = await until(() => ev(`window.__mealSwapsApplied ?? []`), v => Array.isArray(v) && v.length > 0, 40)
check('3c. exactly one swap was applied', applied?.length === 1, applied)
check('3d. ...the newer card\'s dish, for dinner', applied?.[0]?.slot === 'dinner' && applied?.[0]?.name === newerOffers, { applied, newerOffers })
const receipt = await until(() => ev(`[...document.querySelectorAll('[data-testid="chat-receipt"]')].map(r => r.innerText.trim()).join(' | ')`), v => !!v, 30)
check('3e. ...and a receipt says so', /Swapped/.test(receipt ?? '') , receipt)
await shoot('chat-offer-replace-applied')

console.log('\n4. The open-offer rule still does its first job: the same row back for a retried call\n')
const sameTwice = await ev(`(async () => {
  const s = window.__pendingStore; if (!s) return 'NO-STORE'
  const input = { profileId: 'p-retry', actionClass: 'plan_mutation', kind: 'propose_meal_swap', scopeKey: 'p-retry:propose_meal_swap:dinner', preconditions: {}, payload: { slot: 'dinner', chooseName: 'A' }, diff: { title: 't', rows: [] } }
  const a = await s.createPendingAction(input); const b = await s.createPendingAction({ ...input, payload: { chooseName: 'A', slot: 'dinner' } })
  const c = await s.createPendingAction({ ...input, payload: { slot: 'dinner', chooseName: 'B' } })
  return { sameRow: a.id === b.id, newRow: c.id !== a.id, replaced: c.supersededId === a.id }
})()`)
check('4a. the same offer asked twice is one row', sameTwice?.sameRow === true, sameTwice)
check('4b. a different one for the same thing is a new row, replacing it', sameTwice?.newRow === true && sameTwice?.replaced === true, sameTwice)

await finish('A different offer for the same thing replaces the open one.')
