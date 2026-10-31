/**
 * test:chat-2b — the coach chat's design-2b pass (31 Oct 2026, Ashley's "build,
 * keep my rulings") and her same-day "Option 1, add a listen button".
 *
 *   1. The context strip, called: the three day states, the calorie pill in
 *      Nutrition's own words, and no strip at all when there is nothing to say.
 *   2. Its numbers come from the SAME readings Home and Nutrition draw (source
 *      checks: they can prove the wiring, not that it is reached — the browser
 *      driver verify:chat-2b reads the pills off the real screen).
 *   3. The offer's reply pills are the SAME confirm scopes, in order, with the
 *      same labels; the one-line preview only for a single replacement; and
 *      every state an offer can be in still renders (rendered through React).
 *   4. Listen: drawn only where the phone can speak; the words spoken are the
 *      bubble's; one at a time; a second tap stops it; the chat stops it when it
 *      goes away or its tab is left.
 *   5. The header's live line is true: the coach IS sent today's session, the
 *      day's meals and the logs.
 *
 * One exit, and the number of checks is the same on every run.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chatContextPills, kcalPillText } from '../src/lib/chat-context-strip'
import { kcalLeftOrOver } from '../src/lib/coach-voice'
import { offerChanges, previewChange, scopeLabel } from '../src/lib/offer-text'
import { makeReadAloud, spokenTextOf, deviceSynth } from '../src/lib/read-aloud'
import { ProposalCard } from '../src/components/chat/ProposalCard'
import { ListenButton } from '../src/components/chat/ListenButton'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const chat = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
const stripSrc = strip(readFileSync(join(ROOT, 'src/lib/chat-context-strip.ts'), 'utf8'))
const cardSrc = strip(readFileSync(join(ROOT, 'src/components/chat/ProposalCard.tsx'), 'utf8'))
const listenSrc = strip(readFileSync(join(ROOT, 'src/components/chat/ListenButton.tsx'), 'utf8'))

console.log('[1] The context strip, called')
const base = { session: null, running: false, count: null, minutes: null, kcal: null }
const mid = chatContextPills({ ...base, session: { status: 'in_progress', focus: 'Full Body Power' }, count: { logged: 4, planned: 12 }, kcal: { target: 3040, eaten: 630 } })
check('mid-session: "<focus> · N of M sets", linking to Exercise, then the calories', JSON.stringify(mid) === JSON.stringify([
  { kind: 'session', text: 'Full Body Power · 4 of 12 sets', to: 'exercise' }, { kind: 'kcal', text: '2,410 kcal left', to: 'nutrition' }]), mid)
const started = chatContextPills({ ...base, session: { status: 'not_started', focus: 'Legs' }, running: true, count: { logged: 0, planned: 9 } })
check('started on this phone with no set in yet: still mid-session', started.length === 1 && started[0].kind === 'session' && started[0].text === 'Legs · 0 of 9 sets', started)
const notStarted = chatContextPills({ ...base, session: { status: 'not_started', focus: 'Legs' }, count: { logged: 0, planned: 9 } })
check('due but not begun: no workout pill', notStarted.length === 0, notStarted)
const done = chatContextPills({ ...base, session: { status: 'done', focus: 'Legs' }, minutes: 52, count: { logged: 9, planned: 9 } })
check('done: a static "Session done · 52 min", with no link', done.length === 1 && done[0].kind === 'done' && done[0].text === 'Session done · 52 min' && !('to' in done[0]), done)
const doneUntimed = chatContextPills({ ...base, session: { status: 'done', focus: 'Legs' }, minutes: null })
check('done with no measured minutes: "Session done", never an invented time', doneUntimed[0]?.text === 'Session done', doneUntimed)
const quiet = (['rest', 'moved', 'unknown'] as const).map(status => chatContextPills({ ...base, session: { status, focus: 'X' }, running: true, count: { logged: 1, planned: 9 } }))
check('rest day, moved day, not known: no workout pill', quiet.every(p => p.length === 0), quiet)
const over = chatContextPills({ ...base, kcal: { target: 2000, eaten: 2160 } })
check('over the target, the pill says so: "160 kcal over"', over[0]?.text === '160 kcal over', over)
const nutritionHero = (target: number, eaten: number) => { const [amount, word] = kcalLeftOrOver(target - eaten).split(' '); return `${Number(amount).toLocaleString()} kcal ${word}` }
check('...word for word what Nutrition\'s hero says, either side of the target', [[3040, 630], [2000, 2160], [2500, 2499.6], [1800, 0]].every(([t, e]) => kcalPillText(t, e) === nutritionHero(t, e)), [[3040, 630], [2000, 2160]].map(([t, e]) => [kcalPillText(t, e), nutritionHero(t, e)]))
check('nothing to say: no pills', chatContextPills(base).length === 0 && chatContextPills({ ...base, session: { status: 'rest', focus: null }, kcal: { target: 0, eaten: 0 } }).length === 0)
check('...and the screen draws the strip only when there is a pill', /\{contextPills\.length > 0 && \(\s*<div data-testid="chat-context-strip"/.test(chat))

console.log('\n[2] The strip reads what Home and Nutrition read')
const call = (chat.match(/const contextPills = chatContextPills\(\{([\s\S]*?)\n  \}\)/) || [])[1] ?? ''
check('the screen builds its pills with the strip function', call.length > 0)
check('session status and focus: Home\'s aggregate (proactiveData is loadDashboardData)', /status: proactiveData\.session\.status/.test(call) && /focus: proactiveData\.session\.focus/.test(call), call.slice(0, 300))
check('the set count: sessionSetCount over today\'s cell of the training week, as Home', /count: sessionSetCount\(stripCell\?\.session, stripCell\?\.workingLogs\)/.test(call)
  && /const stripCell = trainingWeek\.days\.find\(d => d\.date === activeSession\.date\)/.test(chat))
check('the minutes: the finish card first, then Home\'s session minutes', /minutes: readSessionSummary\(profile\.id, activeSession\.date\)\?\.summary\.durationMinutes \?\? proactiveData\?\.sessionMinutes/.test(call))
check('calories eaten: the meal ledger\'s snapshot, else Home\'s figure; against the target Nutrition uses', /getLedgerSnapshot\(profile\.id, activeSession\.date\)\?\.eaten\.kcal \?\? proactiveData\?\.caloriesEaten/.test(chat) && /target: macros\.calories, eaten: stripEaten/.test(call))
check('...and the words come from the phrasebook (kcalLeftOrOver), never a second sum', /kcalLeftOrOver\(target - eaten\)/.test(stripSrc))
check('the strip re-reads when a meal is logged', /subscribeMealStore\(\(\) => setLedgerTick/.test(chat))

console.log('\n[3] The offer: the same scopes, the preview, every state')
// RE-ANCHORED 31 Oct 2026, her "Mix": "Just today" / "Whole block" / "Keep <the exercise>".
check('scope labels are her 31 Oct words', scopeLabel('today') === 'Just today' && scopeLabel('permanent') === 'Whole block' && scopeLabel('block') === 'Whole block' && scopeLabel('extra', { extra: 'Log it' }) === 'Log it' && scopeLabel('x') === 'x')
const scopeMap = (cardSrc.match(/scopeField\.options\.map\(\(opt, i\) => \(([\s\S]*?)\)\)\s*\)\s*:/) || [])[1] ?? ''
check('each scope pill confirms with ITS scope, the first is the primary', /onClick=\{\(\) => void handleConfirm\(opt\)\}/.test(scopeMap) && /data-offer-weight=\{i === 0 \? 'primary' : 'scope'\}/.test(scopeMap) && /scopeLabel\(opt, scopeField\.labels\)/.test(scopeMap), scopeMap.slice(0, 300))
check('"Not now" rejects', /onClick=\{handleReject\}[\s\S]{0,80}data-offer-weight="reject"/.test(cardSrc))
const one = offerChanges([{ field: 'Exercise', before: 'RDL', after: 'Hip Thrust' }])
check('one replacement is previewed', previewChange(one)?.from === 'RDL' && previewChange(one)?.to === 'Hip Thrust')
check('a list, an addition or a bare removal is not', previewChange(offerChanges([{ field: 'Mon', before: 'A', after: 'B' }, { field: 'Tue', before: 'C', after: 'D' }])) === null
  && previewChange(offerChanges([{ field: 'Breakfast', before: '', after: 'Eggs' }])) === null
  && previewChange(offerChanges([{ field: 'Lunch', before: '—', after: 'Soup' }])) === null)
const view = (status: string, extra: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(ProposalCard, {
  pendingAction: { id: 'p1', kind: 'propose_exercise_swap', status: status as never, diff: { rows: [{ field: 'Exercise', before: 'RDL', after: 'Hip Thrust' }], editable: [{ field: 'scope', options: ['today', 'permanent'] }], alternatives: [{ label: 'Glute bridge', prompt: 'swap for glute bridge' }] }, ...extra } as never,
  onConfirm: async () => {}, onReject: async () => {}, onAlternative: () => {}, bubble: f => React.createElement('div', { 'data-testid': 'chat-bubble' }, f),
}))
const pending = view('pending')
check('pending: the preview, "Just today", "Whole block", "Keep RDL" and the alternatives', /data-testid="offer-preview"/.test(pending) && />Just today</.test(pending) && />Whole block</.test(pending) && />Keep RDL</.test(pending) && /Or swap in/.test(pending) && /Glute bridge/.test(pending))
check('...the preview is a change line whose words are the offer\'s own row', /data-offer-line="change"/.test(pending) && /Exercise: <\/span>.*RDL.*→.*Hip Thrust/.test(pending))
const states: [string, RegExp][] = [
  ['claimed', /disabled=""/], ['done', /Already applied\./], ['partial', /Already applied\./], ['declined', /Left as it was\./],
  ['failed', /didn(&#x27;|')t go through/], ['expired', /timed out/], ['stale', /This changed since I proposed it/],
]
const stateOk = states.map(([st, re]) => [st, re.test(view(st, st === 'expired' ? { expiresAt: '2000-01-01T00:00:00Z' } : {}))] as const)
check('every terminal and stale state still says so in words (claimed shows the buttons disabled)', stateOk.every(([, ok]) => ok), stateOk)
check('a terminal or stale offer offers no alternatives and no buttons', ['done', 'declined', 'stale'].every(st => !/Or swap in/.test(view(st)) && !/offer-buttons/.test(view(st))))
check('an unreachable-server notice still shows under a live offer', /data-testid="proposal-notice"[^>]*>Couldn(&#x27;|')t reach/.test(view('pending', { notice: "Couldn't reach the server" })))

console.log('\n[4] Listen (her 31 Oct 2026 ruling)')
type Call = string
const fakeSynth = () => { const log: Call[] = []; const spoken: string[] = []; return { log, spoken, synth: { speak: (u: { text: string }) => { log.push('speak'); spoken.push(u.text) }, cancel: () => { log.push('cancel') } } } }
const utter = (text: string) => ({ text } as unknown as SpeechSynthesisUtterance)
check('(1) no speech engine, no synth: nothing to draw', deviceSynth(undefined) === null && deviceSynth({}) === null && deviceSynth({ speechSynthesis: {} }) === null && deviceSynth({ speechSynthesis: {}, SpeechSynthesisUtterance: function () {} }) !== null)
const noSpeech = renderToStaticMarkup(React.createElement(ListenButton, { messageKey: 'm1' }))
const g = globalThis as unknown as Record<string, unknown>
g.window = { speechSynthesis: fakeSynth().synth, SpeechSynthesisUtterance: function () {} }
const withSpeech = renderToStaticMarkup(React.createElement(ListenButton, { messageKey: 'm1' }))
delete g.window
check('(1) ...the button renders where the phone can speak, and only there', noSpeech === '' && /data-listen/.test(withSpeech) && /aria-label="Listen to this message"/.test(withSpeech) && /aria-pressed="false"/.test(withSpeech), { noSpeech, withSpeech: withSpeech.slice(0, 200) })
check('(2) the words are the bubble\'s as shown, whitespace collapsed', spokenTextOf({ innerText: '  Since your back\n is tight,  swap  ' }) === 'Since your back is tight, swap' && spokenTextOf(null) === '')
check('(2) ...read off the bubble the tapped button sits in', /closest\('\[data-testid="chat-bubble"\]'\)/.test(listenSrc) && /readAloud\.toggle\(messageKey, spokenTextOf\(bubble\)\)/.test(listenSrc))
{
  const f = fakeSynth(); const r = makeReadAloud(() => f.synth, utter)
  r.toggle('a', 'First message.')
  check('(2) tapping Listen speaks exactly the text it was given', f.spoken.join('|') === 'First message.' && r.current() === 'a', f)
  r.toggle('b', 'Second message.')
  check('(3) starting another stops the first: cancel, then speak the new one; only the new one plays', f.log.join() === 'cancel,speak,cancel,speak' && f.spoken.join('|') === 'First message.|Second message.' && r.current() === 'b', f.log)
  const before = f.spoken.length
  r.toggle('b', 'Second message.')
  check('(4) a second tap on the playing one stops it, and speaks nothing new', f.log[f.log.length - 1] === 'cancel' && f.spoken.length === before && r.current() === null, f.log)
  r.toggle('a', 'First message.'); r.stop()
  check('(5) stop() cancels whatever is playing', f.log[f.log.length - 1] === 'cancel' && r.current() === null)
  const f2 = fakeSynth(); const r2 = makeReadAloud(() => null, utter)
  r2.toggle('a', 'x')
  check('no engine: a tap does nothing at all, and nothing is playing', f2.log.length === 0 && r2.current() === null)
}
check('(5) the chat stops reading when it unmounts, and when its tab is left', /useEffect\(\(\) => \(\) => readAloud\.stop\(\), \[\]\)/.test(chat) && /useEffect\(\(\) => \{ if \(!chatVisible\) readAloud\.stop\(\) \}, \[chatVisible\]\)/.test(chat))
check('one Listen per coach bubble, never on yours, never while the words are still arriving', /msg\.role === 'assistant' && !isInterrupted\(msg\) && !\(msg\.id != null && msg\.id === animatingMessageId\) && \(\s*<ListenButton messageKey=/.test(chat))

console.log('\n[5] The header\'s live line is true')
const ctx = (chat.match(/const buildContext = [\s\S]*?\n  \}\n/) || [''])[0]
check('the line is on the header', /data-testid="chat-header-live"[\s\S]{0,300}Sees today&apos;s session, meals and logs/.test(chat))
check('...and the coach is sent today\'s session, the day\'s meals and the logs', /buildCoachExerciseSummary\(\{[\s\S]*?today: \{/.test(ctx) && /buildCoachMealSummary\(mealPlan\)/.test(ctx) && /workout_log_history: workoutLogHistory/.test(ctx) && /logs: activeSession\.logs/.test(ctx), ctx.length)

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('chat 2b: all checks passed')
