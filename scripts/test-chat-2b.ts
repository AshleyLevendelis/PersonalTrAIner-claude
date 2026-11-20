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
import { kcalPillText } from '../src/lib/chat-context-strip'
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

console.log('[1] No context strip, and one name (his request, 20 Nov 2026)')
// "The session done and kcal left in the chat is unnecessary lets remove thay and the text above 'sees todays session'
// remove that too. And instead of trainer personal trainer chamge it to just Personal TrAIner."
check('the chat draws no context strip and no pills', !/data-testid="chat-context-strip"/.test(chat) && !/data-context-pill/.test(chat) && !/chatContextPills\(/.test(chat))
check('...and no "Sees today\'s session" line', !/chat-header-live/.test(chat) && !/Sees today/.test(chat))
const h2 = (chat.match(/<h2[^>]*>([^<]*)<\/h2>/) || [])[1] ?? ''
check('the header says "Personal TrAIner", once', h2 === 'Personal TrAIner' && (chat.match(/>Personal TrAIner</g) || []).length === 1, h2)
const nutritionHero = (target: number, eaten: number) => { const [amount, word] = kcalLeftOrOver(target - eaten).split(' '); return `${Number(amount).toLocaleString()} kcal ${word}` }
check('the calorie words the coach still uses are Nutrition\'s, either side of the target', [[3040, 630], [2000, 2160], [2500, 2499.6], [1800, 0]].every(([t, e]) => kcalPillText(t, e) === nutritionHero(t, e)))

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

// A LONG QUICK REPLY WRAPS INSIDE THE SCREEN (8 Nov 2026, QA round 3): "Swap Leg Extensions for Banded Terminal Knee
// Extension" ran off the right edge (it ended at x=405 on a 390px screen) because each chip was held to one line.
{
  const row = chat.slice(chat.indexOf('data-testid="chat-quick-replies"'), chat.indexOf('data-testid="chat-quick-replies"') + 800)
  const cls = row.match(/className="(hit-slop-44 min-h-\[40px\][^"]*)"/)?.[1] ?? ''
  check('a quick-reply chip may wrap its words and never grows past the screen', /\bmax-w-full\b/.test(cls) && !/\bwhitespace-nowrap\b/.test(cls) && !/\bshrink-0\b/.test(cls), cls)
}

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('chat 2b: all checks passed')
