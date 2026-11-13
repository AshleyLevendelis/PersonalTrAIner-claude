/**
 * THE COACH TEXTS YOU — her ask of 6 Nov 2026, held.
 *
 * Ashley: "like a WhatsApp notification ... even when you're having a back and
 * forth chat with the coach ... and when you open it, it's the same message in
 * the chat." Her rulings that day: "Chat, with a shortcut" and "Three levels".
 *
 * test:reach-out holds the reminders (chat row before the push, frequency).
 * This holds the rest:
 *   1. a coach REPLY saved in her chat and texted to her phone, from the code
 *      chat-gemini runs (reply-push.ts), driven with fakes — including every
 *      way it must refuse, because the function cannot see who is asking;
 *   2. the chat folding in what the server wrote while she was away, never
 *      dropping what the screen shows (chat-history-merge.ts);
 *   3. one clean-up of the coach's words for the screen and the server;
 *   4. the wiring that makes each of those run, read from the source, and
 *      said to be only that: whether the page truly re-reads on return is the
 *      browser driver's (verify:coach-texts-you).
 */
import { readFileSync } from 'fs'
import { deliverReply, preview, PREVIEW_CHARS, ROW_FRESH_MS, type ReplyPushDeps, type ReplyRow } from '../supabase/functions/chat-gemini/reply-push'
import { REPLY_WAITING } from '../supabase/functions/_shared/coach-moments'
import { cleanReplyText as serverClean } from '../supabase/functions/_shared/reply-text'
import { cleanReplyText as appClean } from '../src/lib/reply-text'
import { addServerMessages, rowToMessage } from '../src/lib/chat-history-merge'
import { frequencyLabel } from '../src/lib/coach-reach-out'
import type { ChatMessage } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ROW = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-11-06T09:00:00Z')

interface World {
  rows: ReplyRow[]
  completed: { id: string; profileId: string; content: string }[]
  sent: { sub: string; payload: Record<string, unknown> }[]
  dropped: string[]
  settings: Record<string, unknown>
  subs: string[]
}
function world(over: Partial<World> = {}): { w: World; deps: ReplyPushDeps } {
  const w: World = {
    rows: [{ id: ROW, profile_id: ME, role: 'assistant', created_at: new Date(NOW.getTime() - 20_000).toISOString() }],
    completed: [], sent: [], dropped: [], settings: {}, subs: ['phone-1'], ...over,
  }
  const deps: ReplyPushDeps = {
    now: NOW,
    // THE FAKE ANSWERS THE QUESTION IT WAS ASKED: by id AND profile, as the real read does.
    loadRow: async (id, profileId) => w.rows.find(r => r.id === id && r.profile_id === profileId) ?? null,
    completeRow: async (id, profileId, content) => { w.completed.push({ id, profileId, content }) },
    loadSettings: async () => w.settings,
    listSubscriptions: async () => w.subs.map(id => ({ id, user_id: ME, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a', timezone: 'Europe/London' })),
    send: async (sub, payload) => {
      if (sub.id === 'gone-phone') return 'gone'
      if (sub.id === 'dead-phone') return 'failed'
      w.sent.push({ sub: sub.id, payload: payload as unknown as Record<string, unknown> }); return 'ok'
    },
    dropSubscription: async id => { w.dropped.push(id) },
  }
  return { w, deps }
}
const asked = (over: Record<string, unknown> = {}) => ({ message: 'how was that?', history: [], context: { profile_id: ME }, placeholder_id: ROW, ...over })
const PLAIN = { reply: 'Nice work this morning.\n[BREAK]\nHow did the last set feel?\n[QUICK_REPLIES: Easy | Hard]' }

async function main() {
  console.log('\n1. A plain reply: saved in her chat and texted to her phone, in the words the chat shows')
  {
    const { w, deps } = world()
    const out = await deliverReply(asked(), PLAIN, 200, deps)
    const words = appClean(PLAIN.reply)
    check('it is sent', out === 'sent', out)
    check('the reply is written into THE row the app made for it, the app markers taken out',
      w.completed.length === 1 && w.completed[0].id === ROW && w.completed[0].profileId === ME && w.completed[0].content === words
        && !/\[(BREAK|QUICK_REPLIES|ACTION)/.test(w.completed[0].content), w.completed)
    const p = w.sent[0]?.payload
    check('the phone gets the same words, from "Trainer", as a reply, opening the chat at that message',
      p?.body === words.replace(/\s+/g, ' ').trim() && p?.title === 'Trainer' && p?.moment === 'coach_reply' && p?.url === '/#/tab/chat' && p?.messageId === ROW, p)
  }

  console.log('\n2. A card turn: the app writes that bubble, so the server leaves the row alone')
  {
    const { w, deps } = world()
    const out = await deliverReply(asked(), { reply: 'Swap your squat for a leg press?', proposal: { kind: 'propose_exercise_swap' } }, 200, deps)
    check('nothing is written into the row (the model\'s own words for a card turn are never shown)', w.completed.length === 0, w.completed)
    check('...and the phone says only that the coach has replied', out === 'sent' && w.sent[0]?.payload.body === REPLY_WAITING && REPLY_WAITING === "I've replied. Tap to see it.", w.sent)
    const { w: w2, deps: d2 } = world()
    await deliverReply(asked(), { reply: '', memoryIntent: { tool: 'record_fact' } }, 200, d2)
    check('...the same for a saved memory, a log or any turn the app authors', w2.completed.length === 0 && w2.sent[0]?.payload.body === REPLY_WAITING, w2)
  }

  console.log('\n3. It writes only into her own fresh row: the function cannot see who is asking')
  {
    const cases: [string, Record<string, unknown>, Partial<World>, string][] = [
      ['no row named', asked({ placeholder_id: null }), {}, 'no_row'],
      ['a row id that is not an id', asked({ placeholder_id: "x' or 1=1" }), {}, 'no_row'],
      ['no profile named', asked({ context: {} }), {}, 'no_row'],
      ['someone else\'s row', asked({ context: { profile_id: OTHER } }), {}, 'not_hers'],
      ['a row of HER OWN message', asked(), { rows: [{ id: ROW, profile_id: ME, role: 'user', created_at: NOW.toISOString() }] }, 'not_hers'],
      ['a row older than ten minutes', asked(), { rows: [{ id: ROW, profile_id: ME, role: 'assistant', created_at: new Date(NOW.getTime() - ROW_FRESH_MS - 1000).toISOString() }] }, 'not_hers'],
    ]
    for (const [label, req, over, expect] of cases) {
      const { w, deps } = world(over)
      const out = await deliverReply(req, PLAIN, 200, deps)
      check(`${label}: nothing written, nothing sent`, out === expect && w.completed.length === 0 && w.sent.length === 0, { out, w })
    }
    check('...while a row nine minutes old is still hers (a slow reply is still a reply)', await (async () => {
      const { w, deps } = world({ rows: [{ id: ROW, profile_id: ME, role: 'assistant', created_at: new Date(NOW.getTime() - 9 * 60_000).toISOString() }] })
      return (await deliverReply(asked(), PLAIN, 200, deps)) === 'sent' && w.completed.length === 1
    })())
    const { w, deps } = world()
    check('a failed turn (500) is not a reply: nothing written, nothing sent', (await deliverReply(asked(), { error: 'x' }, 500, deps)) === 'not_a_reply' && w.sent.length === 0)
  }

  console.log('\n4. Her switches: the reply switch, never the frequency')
  {
    const { w, deps } = world({ settings: { coach_reply: false } })
    const out = await deliverReply(asked(), PLAIN, 200, deps)
    check('"Message me when the coach replies" off: no notification, but the reply is still saved in the chat',
      out === 'switched_off' && w.sent.length === 0 && w.completed.length === 1, { out, w })
    const { w: wl, deps: dl } = world({ settings: { frequency: 'light' } })
    check('Light reminders never hold a reply back: she asked, the coach answers', (await deliverReply(asked(), PLAIN, 200, dl)) === 'sent' && wl.sent.length === 1)
    const { w: wg, deps: dg } = world({ subs: ['gone-phone', 'phone-1'] })
    const og = await deliverReply(asked(), PLAIN, 200, dg)
    check('a phone that has gone is dropped, and her other phone still gets it', og === 'sent' && wg.dropped.includes('gone-phone') && wg.sent.length === 1, wg)
    const { deps: dn } = world({ subs: [] })
    check('no phone signed up: nothing to send, said so', (await deliverReply(asked(), PLAIN, 200, dn)) === 'no_phone')
    const { deps: dd } = world({ subs: ['dead-phone'] })
    check('every send failed: said so, never "sent"', (await deliverReply(asked(), PLAIN, 200, dd)) === 'not_delivered')
  }

  console.log('\n5. A long reply on a lock screen: its opening, cut at a word')
  {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
    const p = preview(long)
    check(`never longer than ${PREVIEW_CHARS} characters plus the ellipsis, and ends with one`, p.length <= PREVIEW_CHARS + 1 && p.endsWith('…'), p.length)
    check('...cut between words, never inside one', /word\d+…$/.test(p) && long.startsWith(p.slice(0, -1)), p.slice(-20))
    check('a short reply is untouched, its line breaks flattened', preview('Nice.\nWell done.') === 'Nice. Well done.')
  }

  console.log('\n6. One clean-up of the coach\'s words, for the screen and the server alike')
  {
    const samples = [
      PLAIN.reply, 'Plain.', '[ACTION: swap] Swapping now.', 'One\n[BREAK]\nTwo', '[QUICK_REPLIES: A | B]', '  spaced  ',
      'Mid [ACTION: x] line [QUICK_REPLIES: y] end', '[BREAK]',
    ]
    check('the server\'s copy answers exactly as the app\'s, on every marker', samples.every(t => serverClean(t) === appClean(t)),
      samples.filter(t => serverClean(t) !== appClean(t)))
    check('...and the copy is the same code, line for line below its header',
      readFileSync('src/lib/reply-text.ts', 'utf8').split('\n').slice(11).join('\n') === readFileSync('supabase/functions/_shared/reply-text.ts', 'utf8').split('\n').slice(11).join('\n'))
    const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    check('the chat cleans a reply with that same function, not a second copy of the patterns',
      /const stripTags = cleanReplyText/.test(chat) && !/const ACTION_TAG_RE =/.test(chat))
  }

  console.log('\n7. The chat folds in what the server wrote while she was away, and never loses what it shows')
  {
    const t = (m: number) => new Date(Date.UTC(2026, 10, 6, 8, m)).toISOString()
    const card = { kind: 'propose_exercise_swap' } as unknown as ChatMessage['pendingAction']
    const prev: ChatMessage[] = [
      ...Array.from({ length: 25 }, (_, i) => ({ id: `old-${i}`, role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}`, status: 'complete' as const, created_at: t(i) })),
      { id: 'open-card', role: 'assistant', content: 'Swap it?', status: 'complete', pendingAction: card, created_at: t(26) },
      { role: 'user', content: 'yes please', status: 'complete' },
      { id: 'waiting', role: 'assistant', content: '', status: 'pending' },
    ]
    const reminder = rowToMessage({ id: 'rem-1', role: 'assistant', content: 'Hey Ashley, are you ready for your session today?', status: 'complete', created_at: t(40),
      action_data: { source: 'reminder', moment: 'workout_today', shortcut: 'exercise' } })
    const page: ChatMessage[] = [
      ...prev.slice(10, 27).map(m => ({ id: m.id, role: m.role, content: m.content, status: m.status, created_at: m.created_at })),
      { id: 'user-row', role: 'user', content: 'yes please', status: 'complete', created_at: t(33) },
      { id: 'waiting', role: 'assistant', content: 'Done: swapped.', status: 'complete', created_at: t(31) },
      reminder,
    ]
    const merged = addServerMessages(prev, page)
    check('a reminder the server wrote is added at the end, even when the server\'s page is shorter than the screen',
      merged[merged.length - 1]?.id === 'rem-1' && page.length < prev.length, merged.slice(-2))
    check('...with its shortcut as its own field, never mistaken for a plan action',
      merged[merged.length - 1]?.reminder?.shortcut === 'exercise' && merged[merged.length - 1]?.action === undefined)
    check('an open card on screen is kept as the screen has it', merged.find(m => m.id === 'open-card')?.pendingAction === card)
    check('a reply this phone was still waiting on takes the words the server finished it with',
      merged.find(m => m.id === 'waiting')?.status === 'complete' && merged.find(m => m.id === 'waiting')?.content === 'Done: swapped.')
    check('her own message is never added a second time (the screen shows it without the server\'s id)',
      merged.filter(m => m.content === 'yes please').length === 1, merged.filter(m => m.content === 'yes please'))
    check('nothing is taken away: every message on screen is still there', prev.every(p => merged.some(m => m === p || (p.id && m.id === p.id))))
    check('a re-read with nothing new returns the very same list (no redraw)', addServerMessages(merged, page) === merged)
    const stale = rowToMessage({ id: 'old-coach', role: 'assistant', content: 'from last week', status: 'complete', created_at: t(1) })
    check('a coach message older than the newest one shown is not slotted in at the bottom', addServerMessages(prev, [stale]) === prev)
    // A PHONE CLOCK RUNNING FAST: a message this phone added stamps its own time, an hour ahead of the server.
    const fastPhone: ChatMessage[] = [...prev.slice(0, 26), { id: 'local-nudge', role: 'assistant', content: 'nudge', status: 'complete', created_at: '2026-11-06T09:30:00.000Z' }]
    const fromServer = [...page.slice(0, 17), { id: 'local-nudge', role: 'assistant' as const, content: 'nudge', status: 'complete' as const, created_at: t(35) }, reminder]
    const afterFast = addServerMessages(fastPhone, fromServer)
    check('a phone clock running fast never hides a new server message: "after" is read on the server\'s clock',
      afterFast[afterFast.length - 1]?.id === 'rem-1', afterFast.slice(-2).map(m => m.id))
    check('a stored plan action still reads as one', rowToMessage({ id: 'a', role: 'assistant', content: 'x', action_data: { type: 'swap_exercise' } }).action?.type === 'swap_exercise')
  }

  console.log('\n8. The wiring, read from the source (that each one RUNS is verify:coach-texts-you)')
  {
    const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    check('the chat tells the coach which row its reply goes in', /placeholder_id: placeholderId \?\? null/.test(chat) && /callGemini\(userText, placeholderId\)/.test(chat))
    check('...on a retry too', /callGemini\(userMsg\.content, failedMsg\.id\)/.test(chat))
    check('every read of the chat\'s rows goes through rowToMessage (three of them)', (chat.match(/\.map\(rowToMessage\)/g) ?? []).length === 3, (chat.match(/\.map\(rowToMessage\)/g) ?? []).length)
    check('the chat re-reads on return: visible again, focus, arriving at the chat, and the service worker\'s word',
      /visibilitychange/.test(chat) && /addEventListener\('focus'/.test(chat) && /'hashchange'/.test(chat) && /serviceWorker\?\.addEventListener\?\.\('message'/.test(chat) && /'coach-message'/.test(chat))
    check('a reminder\'s shortcut opens the tab through the chat\'s own link, worded by the phrasebook',
      /onClick=\{\(\) => \{?[^}]*openStripLink\(msg\.reminder!\.shortcut!\)/.test(chat) && /coachShortcutLabel\(msg\.reminder\.shortcut\)/.test(chat))
    const fn = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
    const serve = fn.slice(fn.indexOf('Deno.serve('), fn.indexOf('function replyPushDeps'))
    check('chat-gemini sends the reply AFTER building the response, never instead of it',
      /const res = await cleanCoachResponse\(await handleChatRequest\(req\)\)/.test(serve) && /deliverReply\(request, body, res\.status, replyPushDeps\(\)\)/.test(serve) && /return res;/.test(serve), serve.slice(0, 400))
    check('...and lets the platform finish it after the answer has gone (waitUntil)', /waitUntil\(job\)/.test(serve))
    const deps = fn.slice(fn.indexOf('function replyPushDeps'))
    check('its row write names the row AND the profile AND the coach', /chat_messages\?id=eq\.\$\{id\}&profile_id=eq\.\$\{profileId\}&role=eq\.assistant/.test(deps))
    check('...and its read of the row names the profile too', /chat_messages\?id=eq\.\$\{id\}&profile_id=eq\.\$\{profileId\}&select=/.test(deps))
    check('a reply never touches the reminders\' daily count', !/coach_notifications_sent/.test(strip(readFileSync('supabase/functions/chat-gemini/reply-push.ts', 'utf8'))) && !/coach_notifications_sent/.test(deps))
    check('the frequency is said in her words: "1 a day", "up to 3 a day", "up to 5 a day"',
      frequencyLabel('light').detail === '1 a day' && frequencyLabel('normal').detail === 'up to 3 a day' && frequencyLabel('lots').detail === 'up to 5 a day'
        && frequencyLabel('light').name === 'Light' && frequencyLabel('normal').name === 'Normal' && frequencyLabel('lots').name === 'Lots')
  }

  console.log(`\ncoach-texts-you: ${ran} checks ran`)
  if (failures > 0) { console.error(`coach-texts-you: ${failures} check(s) FAILED`); process.exit(1) }
  console.log('The coach texts like a person: the same words in the chat and on the phone, only where she asked.')
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1) })
