/**
 * test:setup-follow-ups — SETUP IS A CONVERSATION (Ashley, 7 Nov 2026: "it
 * shouldn't be a rigid form ... a real person isn't just going to go on to the
 * next question"; her ruling the same day, "Up to 3, then back").
 *
 *   1. The setup coach's instructions: follow-ups on what she volunteers come
 *      FIRST, one question a turn, up to three on a topic, noted as it goes,
 *      then steered back; the sport the app records is followed up, never
 *      re-asked; and no rule left demanding "the next question, same turn"
 *      unconditionally.
 *   2. The app: the step-in counts HER replies since her last recorded answer
 *      (so a tap and a typed answer count the same), lets three follow-ups
 *      stand and steps in on the fourth; a "Welcome back" is not a coach turn;
 *      a reply that asks nothing while something is still needed gets the next
 *      question from the app.
 *   3. The notes: shown on the summary before they are kept, each one can be
 *      forgotten, said not to change the plan by itself, and a clinical label
 *      is replaced by her own words.
 * Whether the deployed MODEL follows up is model behaviour: section 1 holds the
 * words it is given, never what it does (a probe or a real session on her
 * machine). The browser half is verify:onboarding-turns §27 and §8.
 */
import { readFileSync } from 'node:fs'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n1. What the setup coach is told')
const fn = readFileSync('supabase/functions/onboarding-chat/index.ts', 'utf8')
const at = fn.indexOf('=== FOLLOW-UPS COME FIRST')
const form = fn.indexOf('=== TALK LIKE A PERSON, NOT A FORM ===')
const job = fn.indexOf('=== YOUR JOB ===')
check('the follow-ups section exists, named for her ruling, before the rules it outranks', at > 0 && at < form && at < job && fn.slice(at, at + 120).includes('"Up to 3, then back"'), { at, form, job })
const sec = at > 0 ? fn.slice(at, form) : ''
check('...it outranks the checklist and every "then the next question"', /OUTRANKS the checklist and every "then the next question"/.test(sec))
check('...what she volunteers gets a follow-up, not the next checklist question', /YOUR NEXT TURN IS A FOLLOW-UP ABOUT IT, not the next checklist question/.test(sec))
check('...one question per turn', /ONE QUESTION PER TURN/.test(sec))
check('...up to three on one topic, then steer back', /UP TO THREE FOLLOW-UPS ON ONE TOPIC/.test(sec) && /THEN STEER BACK, NATURALLY/.test(sec))
check('...noted as it goes, in plain kind words, and a slot is used where there is one', /NOTE IT AS YOU GO/.test(sec) && /record_context_fact/.test(sec) && /never a clinical label/.test(sec) && /goes in its slot/.test(sec))
check('...the sport the app records is followed up, never re-asked or set by the coach', /ANOTHER SPORT IS RECORDED BY THE APP/.test(sec) && /Never ask its days again and never try to set it yourself/.test(sec))
const still = fn.indexOf('STILL UNKNOWN — ')
check('the checklist itself says a follow-up comes before it', still > 0 && /A follow-up on something they just volunteered comes BEFORE this list/.test(fn.slice(still, still + 400)))
const bare = [...fn.matchAll(/Then the next question, same turn\.(?! *Keep)/g)].length + [...fn.matchAll(/Then the next question, same turn(?!, unless)/g)].length
check('no rule demands "the next question, same turn" without the follow-up exception', bare === 0, bare)
check('...and folding into the next question gives way to a follow-up', /fold what they said straight into the next question and keep the conversation moving, unless they volunteered something worth a follow-up/.test(fn))

console.log('\n2. When the app steps in')
const co = strip(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
const fnStart = co.indexOf('function turnsSinceLastConfirmation(')
const counter = fnStart >= 0 ? co.slice(fnStart, co.indexOf('\n}\n', fnStart) + 2) : ''
check('the count is of HER replies since her last recorded answer, this one included',
  /let count = 1/.test(counter) && /if \(m\.role === 'user'\) \{ count\+\+; continue \}/.test(counter) && /if \(m\.isReceipt \|\| \(m\.slotCard && m\.slotCardResolved\)\) return count/.test(counter), counter)
check('...so a coach message (the "Welcome back" line included) never adds to it', !/count\+\+;?\s*\}?\s*$/m.test(counter.replace(/if \(m\.role === 'user'\) \{ count\+\+; continue \}/, '')))
check('three follow-ups stand; the app steps in on the fourth', /const STALL_TURN_LIMIT = 4\b/.test(co))
// The same counting, run: a typed answer the coach recorded puts the tick AFTER
// its question, a tap puts it BEFORE; both must give the same number.
type M = { role: 'user' | 'assistant'; content: string; isReceipt?: boolean; slotCard?: string; slotCardResolved?: boolean }
// eslint-disable-next-line no-new-func
const count = new Function('msgs', counter.replace(/^function turnsSinceLastConfirmation\(msgs: ChatMsg\[\]\): number \{/, '').replace(/\}\s*$/, '')) as (m: M[]) => number
const typed: M[] = [{ role: 'user', content: 'fine' }, { role: 'assistant', content: 'Which days?' }, { role: 'assistant', content: '✓ Recovery', isReceipt: true }]
const tapped: M[] = [{ role: 'user', content: 'Getting by' }, { role: 'assistant', content: '✓ Recovery', isReceipt: true }, { role: 'assistant', content: 'Which days?' }, { role: 'assistant', content: 'Welcome back — picking up right where we left off.' }]
const tangent = (base: M[], n: number): M[] => { const out = [...base]; for (let i = 0; i < n; i++) out.push({ role: 'user', content: `aside ${i}` }, { role: 'assistant', content: `follow-up ${i}?` }); return out }
// What the app counts at the k-th follow-up: everything before her newest
// message (it is not in the list yet), then that follow-up.
const before = (msgs: M[]) => [...msgs.slice(0, -2), msgs[msgs.length - 1]]
check('...a typed answer and a tap count the same: follow-ups 1-3 under the limit, the 4th at it',
  [1, 2, 3, 4].map(k => count(before(tangent(typed, k)))).join() === '1,2,3,4' && [1, 2, 3, 4].map(k => count(before(tangent(tapped, k)))).join() === '1,2,3,4',
  [[1, 2, 3, 4].map(k => count(before(tangent(typed, k)))), [1, 2, 3, 4].map(k => count(before(tangent(tapped, k))))])
check('a reply that asks nothing, with something still needed, gets the next question from the app',
  /const coachAsked = responseWs\.newMessages\.some\(m => m\.role === 'assistant' && !m\.isReceipt && \(!!m\.slotCard \|\| m\.content\.includes\('\?'\)\)\)/.test(co) && /if \(\(stuck \|\| !coachAsked\) && !askedThisTurn\) \{/.test(co))
check('...plainly, with no "let\'s lock this in" lead (that is for a stuck conversation)', /const lead = stuck \? forcedAskLead\(timesSteppedIn, target !== canonicalNext\) : ''/.test(co))

console.log('\n3. The notes')
check('the summary lists the notes, each with Forget, and says they do not change the plan by themselves',
  /data-testid="onboarding-notes"/.test(co) && /What I'll remember/.test(co) && /setPendingContextFacts\(prev => prev\.filter\(x => x\.displayText !== f\.displayText\)\)/.test(co) && /They don&apos;t change your plan by themselves/.test(co))
check('...each Forget is a 44px target', /min-h-\[44px\] min-w-\[44px\]/.test(co.slice(co.indexOf('data-testid="onboarding-notes"'), co.indexOf('data-testid="onboarding-notes"') + 1600)))
check('a clinical label is replaced by her own words before it is kept or shown',
  /const displayText = rawPhrase \? contextNoteText\(String\(action\.args\.display_text \?\? ''\)\.trim\(\), rawPhrase\) : ''/.test(co))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`setup follow-ups: ${failures} check(s) failed`); process.exit(1) }
console.log('setup follow-ups: all checks passed')
