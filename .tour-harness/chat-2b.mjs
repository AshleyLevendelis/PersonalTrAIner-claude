// ---------------------------------------------------------------------------
// CHAT 2b (design handoff, 31 Oct 2026), ON THE REAL CHAT AT 390px.
//
// Ashley's "build, keep my rulings": the header's live line, the context strip
// in its three day states, the offer as the coach's sentence + a one-line
// preview + weighted reply pills mapped onto the SAME confirm scopes, the
// receipt as one line with its Undo, the composer whose main button is the mic
// until there is text, and her 31 Oct "Option 1, add a listen button": the
// phone's own voice reads a coach bubble, one at a time, a second tap stops it,
// and nothing is drawn where the phone cannot speak.
//
// INPUT ONLY from the fixture (?day=mid|done|rest, ?ate=1); every number on the
// strip is the app's own reading, compared here against literal arithmetic on
// those inputs. The model is stubbed at the fetch boundary; the speech engine
// is stubbed on the page, recording what it was ASKED to say.
//
// Every check runs every time with a null-safe subject. PORT 9847.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9847, page: 'chat.html', name: 'chat-2b' })
const { send, ev, check, until, wait, go, shoot, finish } = d
const SHOTS = new URL('../docs/design/tab-polish-oct31/built/', import.meta.url).pathname
const keep = async name => { await shoot(`chat-2b-${name}`); try { (await import('fs')).copyFileSync(new URL(`./chat-2b-${name}.png`, import.meta.url).pathname, `${SHOTS}chat-${name}.png`) } catch { /* the folder is made by the run below */ } }
;(await import('fs')).mkdirSync(SHOTS, { recursive: true })

await send('Emulation.setFocusEmulationEnabled', { enabled: true })
// The model, stubbed: a swap when asked for one, else a plain answer. And the
// speech engine, stubbed: what it was asked to say, and every cancel. With
// ?nospeech=1 the page has no speech engine at all.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const reply = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/swap/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_exercise_swap', rawArgs: { day: '', old_item: window.__swapOld, new_item: 'leg press', scope: 'today', reason: 'Rack is busy.' } } })
      return reply({ reply: 'Good question. Keep the first set easy and build from there.' })
    }
    return realFetch(url, init)
  }
  window.__speech = { spoken: [], cancels: 0, log: [] }
  if (/nospeech=1/.test(location.search)) {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true })
  } else {
    const fake = {
      speak: u => { window.__speech.spoken.push(u.text); window.__speech.log.push('speak') },
      cancel: () => { window.__speech.cancels++; window.__speech.log.push('cancel') },
    }
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true })
  }
` })

const loaded = () => until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 60)

// 1-3. NO CONTEXT STRIP, AND ONE NAME (his request 20 Nov 2026: "The session done and kcal left in the chat is unnecessary
// ... the text above 'sees todays session' remove that too ... change it to just Personal TrAIner"). Asked on the three
// days that used to draw pills: mid-session with food eaten, a finished session, a rest day.
const HEAD = String.raw`(() => {
  const a = document.querySelector('[data-testid="chat-header-avatar"]')
  const h = document.querySelector('[data-testid="chat-header"] h2')
  const hd = document.querySelector('[data-testid="chat-header"]')
  return { avatar: a ? Math.round(a.getBoundingClientRect().width) : 0, title: h ? h.textContent.trim() : null,
    live: !!document.querySelector('[data-testid="chat-header-live"]') || /Sees today/.test(hd?.textContent ?? ''),
    pills: document.querySelectorAll('[data-context-pill]').length, strip: !!document.querySelector('[data-testid="chat-context-strip"]'),
    text: (hd?.textContent ?? '').replace(/\s+/g, ' ').trim() }
})()`
for (const [n, q, name] of [['1', '&day=mid&ate=1', 'mid-session'], ['2', '&day=done', 'session-done'], ['3', '&day=rest&ate=1', 'rest-day']]) {
  console.log(`\n${n}. ${name}`)
  await go(q)
  check(`${n}a. the chat is up`, (await loaded()) === true)
  await wait(2500)
  const head = await ev(HEAD)
  check(`${n}b. no pills under the header ("Session done", "kcal left", the set count)`, head?.strip === false && head?.pills === 0 && !/kcal left|kcal over|Session done|of \d+ sets/.test(head?.text ?? ''), head)
  check(`${n}c. the header says "Personal TrAIner" once, with no "Trainer" and no "Sees today's..." line`,
    head?.title === 'Personal TrAIner' && head?.live === false && !/\bTrainer\b/.test((head?.text ?? '').replace('Personal TrAIner', '')), head)
  check(`${n}d. ...and the avatar is still 36px`, head?.avatar === 36, head?.avatar)
  await keep(name)
}

// 4. AN OFFER: the sentence, the preview, the weighted pills on the same scopes.
console.log('\n4. A swap offer')
await go('')
await loaded()
const target = await until(() => ev('window.__swapTarget ?? null'), v => !!v, 40)
await ev(`window.__swapOld = ${JSON.stringify(target?.loose ?? '')}`)
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
// The composer's main button before and after typing.
const lead = () => ev(`[...document.querySelectorAll('[data-testid="chat-composer"] [data-composer-lead]')].map(b => b.getAttribute('aria-label'))`)
const speechListens = await ev(`!!(window.SpeechRecognition || window.webkitSpeechRecognition)`)
const emptyLead = await lead()
const placeholder = await ev(`document.querySelector('textarea').getAttribute('placeholder')`)
check('4a. empty composer: ONE main button — the mic where the phone can listen (else send), with the matching placeholder',
  Array.isArray(emptyLead) && emptyLead.length === 1 && (speechListens ? /voice/i.test(emptyLead[0]) && placeholder === 'Tap the mic, or type…' : /send/i.test(emptyLead[0])), { emptyLead, speechListens, placeholder })
await ev(`(() => { const t = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, 'x'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(200)
const typedLead = await lead()
check('4b. once there is text, send is the one main button', Array.isArray(typedLead) && typedLead.length === 1 && /send/i.test(typedLead[0]), typedLead)
const pillH = await ev(`Math.round(document.querySelector('[data-testid="chat-composer-pill"]')?.getBoundingClientRect().height ?? 0)`)
check('4c. the field is a 52px pill', pillH === 52, pillH)
// She names the replacement (re-anchored 7 Nov 2026): with nothing named, a coach pick of a different movement now
// becomes the swap list's first (coach-swap-pick.ts).
check('4d. she asks for a swap', await say('swap this exercise for leg press, the rack is busy') === true)
const OFFER = String.raw`(() => {
  const o = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop()
  if (!o) return null
  const bubble = o.querySelector('[data-testid="chat-bubble"]'), preview = o.querySelector('[data-testid="offer-preview"]')
  const probe = c => { const d = document.createElement('div'); d.style.backgroundColor = c; document.body.appendChild(d); const v = getComputedStyle(d).backgroundColor; d.remove(); return v }
  const btns = [...o.querySelectorAll('[data-testid="offer-buttons"] button')].map(b => {
    const r = b.getBoundingClientRect(), p = b.firstElementChild, ps = p ? getComputedStyle(p) : null
    // The glow is read off BOTH the button and the pill drawn in it: a glow on either is a glowing button.
    return { label: b.textContent.trim(), weight: b.getAttribute('data-offer-weight'), h: r.height, w: r.width, pillH: p ? p.getBoundingClientRect().height : 0, bg: ps ? ps.backgroundColor : '', border: ps ? ps.borderTopWidth : '', shadow: ps ? ps.boxShadow : '?', buttonShadow: getComputedStyle(b).boxShadow }
  })
  return {
    status: o.getAttribute('data-card-status'),
    previewText: preview ? preview.textContent.replace(/\s+/g, ' ').trim() : null,
    struck: preview ? [...preview.querySelectorAll('.line-through')].map(e => e.textContent.trim()) : [],
    previewOutsideBubble: !!preview && !!bubble && !bubble.contains(preview) && preview.getBoundingClientRect().top >= bubble.getBoundingClientRect().bottom - 0.5,
    previewIsChangeLine: preview ? preview.getAttribute('data-offer-line') === 'change' : false,
    bubbleChanges: bubble ? bubble.querySelectorAll('[data-offer-line="change"]').length : -1,
    btns, primary: probe('var(--primary)'),
  }
})()`
const offer = await until(() => ev(OFFER), v => v?.status === 'pending', 60)
await wait(1500)
const o = await ev(OFFER)
check('4e. the change is a soft line under the bubble, not inside it', o?.previewOutsideBubble === true && o?.previewIsChangeLine === true && o?.bubbleChanges === 0, o && { out: o.previewOutsideBubble, line: o.previewIsChangeLine, inBubble: o.bubbleChanges })
check('4f. ...what goes struck through, an arrow, and what comes in', !!target && (o?.struck ?? []).join() === target.full && new RegExp(`${target.full} → Leg Press`, 'i').test(o?.previewText ?? ''), { struck: o?.struck, text: o?.previewText })
const [b0, b1, b2] = o?.btns ?? []
// RE-ANCHORED 31 Oct 2026, her "Mix": "Just today" / "Whole block" / "Keep <the lift>".
check('4g. the reply pills are the scopes in her words, in order: "Just today" (primary), "Whole block", then "Keep <the lift>"',
  b0?.label === 'Just today' && b0?.weight === 'primary' && b1?.label === 'Whole block' && b1?.weight === 'scope' && !!target && b2?.label === `Keep ${target.full}` && b2?.weight === 'reject' && (o?.btns ?? []).length === 3, o?.btns?.map(b => [b.label, b.weight]))
// RE-ANCHORED 1 Nov 2026, her "All outlined": no pill is filled with the main colour; each is a 1px outline, the
// first included. (Was "the primary is the filled main colour", the 2b design.)
check('4h. every pill is an outline, the first included; none is filled with the main colour', !!b0 && !!b1 && !!b2 && [b0, b1, b2].every(b => b.bg !== o?.primary && b.border === '1px'), o?.btns?.map(b => [b.label, b.bg, b.border]))
check('4i. every pill keeps the 44px tap target, draws no taller than 40px, and has no glow', (o?.btns ?? []).length === 3 && o.btns.every(b => b.h >= 44 && b.w >= 44 && b.pillH <= 40 && b.shadow === 'none' && b.buttonShadow === 'none'), o?.btns?.map(b => [b.label, b.h, b.pillH, b.shadow, b.buttonShadow]))
await ev(`[...document.querySelectorAll('[data-testid="proposal-card"]')].pop()?.scrollIntoView({ block: 'end' })`)
await wait(300)
await keep('swap-offer')

// 5. APPLY (the primary pill) — the receipt is one line with its Undo.
console.log('\n5. Apply, and the receipt')
await ev(`[...document.querySelectorAll('[data-testid="proposal-card"]')].pop()?.querySelector('[data-offer-weight="primary"]')?.click()`)
const RECEIPT = String.raw`(() => {
  const r = [...document.querySelectorAll('[data-testid="chat-receipt"]')].pop()
  if (!r) return null
  // ONE LINE means Undo sits level with the title's words and to their right — measured against the TEXT, not
  // against the row that contains both (which would hold anything placed anywhere inside it).
  const title = r.querySelector('[data-receipt-line] p'), undo = r.querySelector('[data-receipt-undo]')
  const tr = title ? title.getBoundingClientRect() : null, ur = undo ? undo.getBoundingClientRect() : null
  const mid = b => b.top + b.height / 2
  return { text: r.textContent.replace(/\s+/g, ' ').trim(), oneLine: !!tr && !!ur && Math.abs(mid(ur) - mid(tr)) <= 4 && ur.left >= tr.right - 0.5, undo: ur && { h: ur.height, w: ur.width }, title: tr && { mid: mid(tr), right: tr.right }, at: ur && { mid: mid(ur), left: ur.left } }
})()`
const rec = await until(() => ev(RECEIPT), v => !!v && !!v.undo, 60)
check('5a. the applied swap leaves a receipt whose Undo sits on its title line', !!rec && rec.oneLine === true, rec)
check('5b. ...a 44px Undo', !!rec?.undo && rec.undo.h >= 44 && rec.undo.w >= 44, rec?.undo)
// The applied offer gives way to its receipt, as it did before 2b: nothing is left waiting for a tap.
const openOffers = await ev(`document.querySelectorAll('[data-testid="proposal-card"][data-card-status="pending"]').length`)
check('5c. ...and no offer is left open for a tap', openOffers === 0, openOffers)
await ev(`[...document.querySelectorAll('[data-testid="chat-receipt"]')].pop()?.scrollIntoView({ block: 'end' })`)
await wait(300)
await keep('applied-receipt')

// 6. LISTEN — her 31 Oct ruling.
console.log('\n6. Listen')
check('6a. she asks something ordinary', await say('what about the first set?') === true)
await until(() => ev(`[...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')].some(b => /Keep the first set easy/.test(b.textContent))`), v => v === true, 60)
await wait(2500)
const LISTEN = String.raw`(() => {
  const bubbles = [...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')]
  const userListen = document.querySelectorAll('[data-testid="chat-bubble"][data-role="user"] [data-listen]').length
  return { coach: bubbles.length, withListen: bubbles.filter(b => b.querySelectorAll('[data-listen]').length === 1).length, userListen,
    sizes: bubbles.map(b => b.querySelector('[data-listen]')).filter(Boolean).map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }) }
})()`
const L = await ev(LISTEN)
check('6b. every coach bubble has exactly one Listen button; no user bubble has one', !!L && L.coach >= 2 && L.withListen === L.coach && L.userListen === 0, L)
const tap = idx => ev(`(() => { const b = [...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')].filter(x => x.querySelector('[data-listen]'))[${idx}]; const btn = b && b.querySelector('[data-listen]'); if (!btn) return null; btn.click(); return { text: b.innerText.replace(/\\s+/g, ' ').trim() } })()`)
const state = idx => ev(`(() => { const b = [...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')].filter(x => x.querySelector('[data-listen]'))[${idx}]; const btn = b && b.querySelector('[data-listen]'); return btn ? { pressed: btn.getAttribute('aria-pressed'), label: btn.getAttribute('aria-label') } : null })()`)
const last = (await ev(`document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]').length`)) - 1
const t1 = await tap(last)
await wait(200)
const s1 = await ev('window.__speech')
check('6c. tapping Listen speaks the bubble\'s own words, as shown', !!t1 && s1.spoken.length === 1 && s1.spoken[0] === t1.text && /Keep the first set easy/.test(s1.spoken[0]), { spoken: s1.spoken, shown: t1?.text })
const p1 = await state(last)
check('6d. ...and the button says it is playing: pressed, "Stop reading"', p1?.pressed === 'true' && p1?.label === 'Stop reading', p1)
await keep('listen-playing')
const cancelsBefore = (await ev('window.__speech')).cancels
await tap(last)
await wait(200)
const s2 = await ev('window.__speech'), p2 = await state(last)
check('6e. a second tap stops it: cancel() is called, nothing new is spoken, the button is back to "Listen to this message"', s2.cancels > cancelsBefore && s2.spoken.length === 1 && p2?.pressed === 'false' && p2?.label === 'Listen to this message', { s2, p2 })
await tap(0)
await wait(150)
const logBefore = (await ev('window.__speech')).log.length
await tap(last)
await wait(150)
const s3 = await ev('window.__speech'), pFirst = await state(0), pLast = await state(last)
check('6f. starting another message stops the first: cancel() comes before the new speak(), and only the new one is pressed',
  s3.log.slice(logBefore).join() === 'cancel,speak' && pFirst?.pressed === 'false' && pLast?.pressed === 'true', { log: s3.log.slice(logBefore), pFirst, pLast })
await tap(last)

console.log('\n7. No speech engine, no button')
await go('&nospeech=1')
await loaded()
await until(() => ev(`document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]').length`), v => v >= 2, 40)
await wait(800)
const none = await ev(LISTEN)
check('7a. where the phone cannot speak, no coach bubble draws a Listen button', !!none && none.coach >= 2 && none.withListen === 0, none)
check('8. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))

await finish('verify:chat-2b PASSED')
