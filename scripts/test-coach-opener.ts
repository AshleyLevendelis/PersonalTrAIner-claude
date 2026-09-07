// ---------------------------------------------------------------------------
// THE ONE THING THE COACH SAYS FIRST — and the ways an opener goes wrong.
//
// coach-opener.ts picks the first bubble of a fresh conversation from real
// state (see its header). Built from Ashley's "build it with your
// recommendations" after a generic chat blueprint was reviewed against this
// codebase. The failure modes an opener has are specific, so the checks are:
//
//   §1  priority — the thing that matters most is the thing said, and only
//       one thing is ever said
//   §2  Ashley's ruling — NO chips under the how-did-it-feel question
//   §3  every chip is a sentence the coach's existing tools can finish
//   §4  attention (the chat button's indicator) lights for exactly the two
//       opener kinds that want an answer, and the wiring in
//       ChatAssistant/App/BottomTabBar carries it
//   §5  the model-side check-in ranks a missed yesterday where it belongs
//   §8  the third reason added 6 Sep 2026 — a coach reply nobody has read
//       yet (chat-unread.ts) — and the seen set that keeps three independent
//       reasons from hiding each other
//   §9  ...and what the button DOES about it: a ring and a pulse that both
//       vanish at glow Off and stop under reduced motion
//
// Pure functions where possible; source reads for the wiring, same split as
// test-session-feel.ts.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pickOpener, missedYesterdayFrom, type OpenerInput } from '../src/lib/coach-opener'
import { pickAccountabilityCheckIn, type AccountabilityInput } from '../src/lib/accountability'
import type { ChatMessage } from '../src/lib/types'
import { attentionReasons, nextSeenAttention, hasUnseenAttention, loadSeenAttention, saveSeenAttention } from '../src/lib/chat-unread'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const base: OpenerInput = {
  hour: 9,
  cutoffHour: 13,
  awaitingFeel: null,
  missedYesterday: null,
  todaySession: { focus: 'Push & Press', movements: 'Barbell Bench Press, Overhead Press, Dips' },
  todayLogged: false,
  tomorrowSession: { dayName: 'tomorrow', focus: 'Pull & Hinge', lead: 'Deadlifts' },
}
const restDay: OpenerInput = { ...base, todaySession: null }

console.log('\n1. Priority: the thing that matters most is the one thing said')
{
  const feel = pickOpener({ ...base, awaitingFeel: { date: '2026-09-01', day: 'Monday', isToday: false }, missedYesterday: { dayName: 'Monday', focus: 'Legs' } })
  check('an unreviewed session outranks a missed day', feel.kind === 'session_feel', feel.kind)
  check('...and names the session, so the question is specific', /Monday/.test(feel.text), feel.text)

  const missed = pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs & Calves' } })
  check('a missed yesterday outranks today\'s session', missed.kind === 'missed_yesterday', missed.kind)
  check('...names what was missed', /Legs & Calves/.test(missed.text), missed.text)
  // The prompt's rule for a miss, applied to the opener's own words.
  check('...and follows the no-drama rule rather than shaming', /no drama/.test(missed.text) && !/should have|failed|streak/i.test(missed.text), missed.text)

  const today = pickOpener(base)
  check('otherwise a training day ahead is the opener', today.kind === 'training_today', today.kind)
  const done = pickOpener({ ...base, hour: 20 })
  check('past the training cutoff it becomes "how did it go"', done.kind === 'training_done_today', done.kind)
  const rest = pickOpener(restDay)
  check('a rest day is the fallback', rest.kind === 'rest_day', rest.kind)
  check('...and previews the next session, with its lead lift', /Pull & Hinge/.test(rest.text) && /Deadlifts/.test(rest.text), rest.text)
  const restNoNext = pickOpener({ ...restDay, tomorrowSession: null })
  check('...but says nothing about a next session when there is none', !/leads with/.test(restNoNext.text), restNoNext.text)

  // Exactly one thing. An opener that mentions two situations is a status
  // report, and the check-in rule this is modelled on forbids stacking.
  const stacked = pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' }, hour: 20 })
  check('one situation per opener — a missed day does not also get "how did today go"', !/How'd it go/.test(stacked.text), stacked.text)
}

console.log('\n2. Ashley\'s ruling: no chips under the how-did-it-feel question')
{
  for (const isToday of [true, false]) {
    const o = pickOpener({ ...base, awaitingFeel: { date: '2026-09-02', day: 'Tuesday', isToday } })
    check(`the feel question (${isToday ? 'today' : 'a past day'}) carries NO chips`, o.chips.length === 0, o.chips)
  }
  // ...and every other kind may.
  check('a missed day carries chips', pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).chips.length > 0)
  check('a rest day carries chips', pickOpener(restDay).chips.length > 0)
  check('a training day ahead carries the trim chip', pickOpener(base).chips.some(c => /short on time/i.test(c)))
  check('...but not mid-session — trimming a session you are in is a different conversation',
    pickOpener({ ...base, todayLogged: true }).chips.length === 0, pickOpener({ ...base, todayLogged: true }).chips)
}

console.log('\n3. Every chip is a sentence the coach\'s existing tools can finish')
{
  const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const allChips = [
    ...pickOpener(base).chips,
    ...pickOpener(restDay).chips,
    ...pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).chips,
  ]
  check('chips are full sentences, not labels (they are SENT on tap)', allChips.every(c => c.split(' ').length >= 3), allChips)
  // The missed-day chips map to things that exist: training today needs no
  // tool at all, and "call yesterday a rest day" needs propose_rest_day to
  // accept a DATE — which it does. A "move it to tomorrow" chip was left out
  // on purpose: the only schedule tool changes the week permanently.
  check('propose_rest_day accepts a date, so "call yesterday a rest day" can be honoured',
    /name: "propose_rest_day"[\s\S]{0,1200}date: \{/.test(chat))
  const missedChips = pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).chips
  check('no chip promises a one-off reschedule the coach cannot do', !missedChips.some(c => /move|tomorrow|next/i.test(c)), missedChips)
  // The trim chip maps to propose_volume_change, direction lighter.
  check('propose_volume_change exists for the short-on-time chip', /name: "propose_volume_change"/.test(chat) && /"lighter"/.test(chat))
}

console.log('\n4. Attention: the chat button lights for exactly the opener kinds that want an answer')
{
  check('an unreviewed session wants an answer', pickOpener({ ...base, awaitingFeel: { date: '2026-09-02', isToday: true } }).attention)
  check('a missed day wants an answer', pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).attention)
  // A dot that is on every training day is a dot nobody sees.
  check('an ordinary training day does NOT', !pickOpener(base).attention)
  check('a finished-looking training day does NOT', !pickOpener({ ...base, hour: 20 }).attention)
  check('a rest day does NOT', !pickOpener(restDay).attention)

  const chatUi = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  const bar = readFileSync(join(ROOT, 'src/components/BottomTabBar.tsx'), 'utf8')
  // The same rule, stated in ChatAssistant without going through pickOpener.
  // Pinned here so the tab and the bubble cannot drift apart.
  check('ChatAssistant feeds the same two facts into the reason set',
    /awaitingFeelDate: feelContext\?\.awaiting\?\.date \?\? null/.test(chatUi) && /missedYesterdayDay: missedYesterday\?\.dayName \?\? null/.test(chatUi))
  check('...and the transcript, so an unread reply is the third reason', /attentionReasons\(\{[\s\S]{0,240}\n\s+messages,\n\s+\}\)/.test(chatUi))
  check('...judged against a seen SET, not one flag', /hasUnseenAttention\(activeAttention, seenAttention\)/.test(chatUi))
  check('...and reports the verdict upward', /onAttentionChange\?\.\(hasAttention\)/.test(chatUi))
  check('...knowing whether the chat is actually on screen', /chatVisible=\{activeTab === 'chat'\}/.test(app))
  check('App receives it', /onAttentionChange=\{setChatAttention\}/.test(app))
  check('...and never shows it while already on the chat tab', /chatAttention=\{chatAttention && activeTab !== 'chat'\}/.test(app))
  // The bug that made three reasons necessary: a single seen-flag upstream
  // remembers that ONE thing was looked at, so a new coach reply arriving
  // under an already-seen feel question could never light the button. If a
  // flag ever comes back here, that failure mode comes back with it.
  // Comments stripped first — App.tsx's own note records why the flag went,
  // and an absence check that a comment can satisfy proves nothing.
  const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('...with no second seen-flag left in App to swallow one of them', !/attentionSeen/.test(appCode))
  check('the tab bar draws it', /data-testid="chat-attention-dot"/.test(bar))
  // The wording changed on 6 Sep 2026 when the assistant took one name in UI
  // text ("Personal TrAIner" everywhere). What this check is FOR is unchanged:
  // the dot is a coloured circle, so a screen reader has to be told what it
  // means or the signal exists only for people who can see it.
  check('...and says so to a screen reader', /your Personal TrAIner has something for you/.test(bar))

  // The opener composes from the LIVE week, not the base plan, so a
  // mesocycle user is told about the right day.
  check('the opener reads the live week\'s days', /const liveWeekDays = mesocycle\.find\(w => w\.week_number === openerWeek\)\?\.days \?\? exercisePlan/.test(chatUi))
  check('...and the week strip\'s own states decide "missed"', /missedYesterdayFrom\(trainingWeek\.days, yesterdayDate, liveWeekDays\)/.test(chatUi))
  check('chips ride on the opener message', /quickReplies: opener\.chips\.length > 0 \? opener\.chips : undefined/.test(chatUi))
}

console.log('\n5. missedYesterdayFrom reads only a real miss')
{
  const plan = [{ day: 'Monday', focus: 'Legs & Calves' }, { day: 'Tuesday', focus: 'Push' }]
  const days = (state: string) => [{ date: '2026-09-01', dayName: 'Monday', state }, { date: '2026-09-02', dayName: 'Tuesday', state: 'due' }]
  check('a missed yesterday is found, with its focus', missedYesterdayFrom(days('missed'), '2026-09-01', plan)?.focus === 'Legs & Calves')
  for (const s of ['done', 'partial', 'swapped', 'rest_chosen', 'rest', 'before_plan', 'due']) {
    check(`'${s}' is not a miss`, missedYesterdayFrom(days(s), '2026-09-01', plan) === null, s)
  }
  check('a yesterday outside the week (a Monday) is not judged', missedYesterdayFrom(days('missed'), '2026-08-31', plan) === null)
}

console.log('\n6. The model-side check-in ranks a missed yesterday where it belongs')
{
  const quiet: AccountabilityInput = {
    hour: 10, proteinEaten: 0, proteinTarget: 150, caloriesEaten: 0, caloriesTarget: 2500,
    waterMl: 0, waterTargetMl: 2500, streak: 0, daysSinceWeighIn: 2,
    sessionDueUnlogged: false, setsLoggedToday: 0, setsPlannedToday: 0, onTrackForGoal: null,
  }
  const line = pickAccountabilityCheckIn({ ...quiet, missedYesterday: { dayName: 'Monday', focus: 'Legs' } })
  check('a missed yesterday produces a check-in', !!line && /Yesterday/.test(line), line)
  check('...that states the fact without a verdict', !!line && !/shame|failed|should/i.test(line), line)
  check('...and says they did not rest or swap it, so the coach does not assume', !!line && /rested or swapped/.test(line), line)
  // Ranking: below a stalled mid-session (they are training NOW), above
  // today's-unlogged (an evening fact) and above the streak.
  const stalled = pickAccountabilityCheckIn({ ...quiet, missedYesterday: { dayName: 'Monday', focus: 'Legs' }, setsPlannedToday: 20, setsLoggedToday: 6 })
  check('a stalled session in progress still outranks it', !!stalled && /part-way/.test(stalled), stalled)
  const vsStreak = pickAccountabilityCheckIn({ ...quiet, missedYesterday: { dayName: 'Monday', focus: 'Legs' }, streak: 6 })
  check('it outranks the streak line', !!vsStreak && /Yesterday/.test(vsStreak), vsStreak)
  check('nothing changes when yesterday was fine', pickAccountabilityCheckIn(quiet) === null)
}

console.log('\n7. No React hook is called after App.tsx\'s early return')
{
  // THE BUG THIS SECTION EXISTS FOR, and it reached production.
  //
  // The attention effect in §4 was written under handleTabChange, a few lines
  // before the JSX — which is ~70 lines AFTER `if (!profile) {`. On the first
  // render profile is null, App returns early, and the effect never runs; once
  // the profile resolves the render goes past the return and it does. One more
  // hook than the previous render is precisely what React forbids. It threw
  // "Rendered more hooks than during the previous render", unmounted the tree,
  // and every user got a black screen on load.
  //
  // Nothing caught it: tsc and the bundler do not check hook ordering, §4 above
  // asserts the effect's CONTENT rather than its POSITION, and no gate renders
  // App. Ashley found it on her phone after the merge.
  //
  // Asserted over the WHOLE FILE rather than over the one effect, because the
  // defect is positional and any future hook can repeat it.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  const returnIdx = app.indexOf('\n  if (!profile) {')
  check('the early return exists to measure against (sanity check on this check)', returnIdx > 0, returnIdx)

  const after = app.slice(returnIdx)
  // Only calls at component-body indentation (two spaces) count. A hook inside
  // a nested component, a callback or a JSX prop is a different scope and is
  // not a rules-of-hooks violation of THIS component.
  const offenders = [...after.matchAll(/^  (?:const .*= )?(useState|useEffect|useRef|useCallback|useMemo|useLayoutEffect|useReducer|useContext)\(/gm)]
    .map(m => ({
      hook: m[1],
      line: app.slice(0, returnIdx + (m.index ?? 0)).split('\n').length,
    }))
  check('no hook is called after it — a hook below an early return is a black screen on load',
    offenders.length === 0, offenders)

  // The effect that caused it now lives in ChatAssistant (the seen set moved
  // there on 6 Sep 2026 — see §8), so what is anchored here is the state it
  // used to drive, which is still declared in App and still has to sit above
  // the return. The check above is the one that actually guards the defect;
  // this one keeps a named example of it in place.
  const stateIdx = app.indexOf('const [chatAttention, setChatAttention] = useState(false)')
  check('the chat-attention state is above the early return', stateIdx > 0 && stateIdx < returnIdx, { stateIdx, returnIdx })
}

console.log('\n8. An unread coach reply is the third reason, and no reason hides another')
{
  const reply = (over: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id: 'msg-1', role: 'assistant', content: 'Nice work.', status: 'complete', ...over })
  const said = (text: string): ChatMessage => ({ id: 'u-1', role: 'user', content: text, status: 'complete' })

  // --- what counts as unread -----------------------------------------------
  const reasonsFor = (messages: ChatMessage[], feel: string | null = null, missed: string | null = null) =>
    attentionReasons({ awaitingFeelDate: feel, missedYesterdayDay: missed, messages })

  check('a finished coach reply at the end of the transcript is a reason',
    reasonsFor([said('how did I do'), reply()]) === 'unread:msg-1', reasonsFor([said('how did I do'), reply()]))
  check('...but not once the trainee has answered it',
    reasonsFor([reply(), said('thanks')]) === '', reasonsFor([reply(), said('thanks')]))
  check('a reply still streaming is not a message yet',
    reasonsFor([said('hi'), reply({ status: 'pending', content: '' })]) === '')
  // A failed turn shows its own retry in the transcript. Lighting the button
  // for it sends the trainee to look at an error.
  check('a failed reply does not light it', reasonsFor([said('hi'), reply({ status: 'failed' })]) === '')
  // THE ONE THAT KEEPS THE BUTTON MEANINGFUL. The opener and the first-run
  // intro are composed on the client on every mount and never carry a DB id;
  // counting them lights the button every single day, which is the "a dot
  // that is always on is a dot nobody sees" failure BottomTabBar warns about.
  check('the client-composed opener does NOT light it — it has no id',
    reasonsFor([{ role: 'assistant', content: 'Morning Ashley — today\'s Push & Press.', status: 'complete' }]) === '')
  check('an empty transcript is no reason at all', reasonsFor([]) === '')

  // --- the three compose, in a stable order --------------------------------
  const all = reasonsFor([said('hi'), reply()], '2026-09-05', 'Thursday')
  check('all three reasons can be live at once', all === 'feel:2026-09-05|missed:Thursday|unread:msg-1', all)
  check('each carries the identity of the thing wanting an answer, not just its kind',
    reasonsFor([], '2026-09-05') !== reasonsFor([], '2026-09-04'))

  // --- the seen set ---------------------------------------------------------
  // Nothing stored yet: the transcript on screen is what they last read
  // (chat-cache.ts writes it in the same tick they saw it), so shipping this
  // must not light the button for a conversation finished days ago. The two
  // opener reasons are deliberately NOT seeded — they re-arm on a fresh mount
  // today and this change does not touch that.
  check('a first run seeds the unread reply as already seen',
    nextSeenAttention(null, 'feel:2026-09-05|unread:msg-1', false) === 'unread:msg-1',
    nextSeenAttention(null, 'feel:2026-09-05|unread:msg-1', false))
  check('...and seeds nothing else, so an open feel question still nudges',
    !hasUnseenAttention('unread:msg-1', nextSeenAttention(null, 'unread:msg-1', false)) &&
    hasUnseenAttention('feel:2026-09-05|unread:msg-1', nextSeenAttention(null, 'feel:2026-09-05|unread:msg-1', false)))
  check('being on the chat tab marks everything showing as seen, answered or not',
    nextSeenAttention('', 'feel:2026-09-05|unread:msg-1', true) === 'feel:2026-09-05|unread:msg-1')
  check('a reason that goes away is dropped, so the same kind can nudge again later',
    nextSeenAttention('missed:Thursday', 'feel:2026-09-05', false) === '')

  // --- the bug the seen SET exists for --------------------------------------
  // Ashley opened the chat on an unanswered feel question, went back to
  // another tab, and a later coach reply never lit the button: one seen-flag
  // was already set and there was nothing to distinguish the two.
  {
    const seenTheFeelQuestion = nextSeenAttention('', 'feel:2026-09-05', true)
    const replyArrives = 'feel:2026-09-05|unread:msg-9'
    check('a new reply under an already-seen feel question DOES light the button',
      hasUnseenAttention(replyArrives, nextSeenAttention(seenTheFeelQuestion, replyArrives, false)))
    // ...and the mirror image: reading the reply must not re-light the button
    // for the feel question they already looked at.
    const afterReading = nextSeenAttention(replyArrives, replyArrives, true)
    check('...and reading it does not re-light the feel question they already saw',
      !hasUnseenAttention('feel:2026-09-05', nextSeenAttention(afterReading, 'feel:2026-09-05', false)))
  }
  check('nothing live means nothing unseen', !hasUnseenAttention('', 'feel:2026-09-05'))

  // --- what survives a reload ----------------------------------------------
  // Only the message id. It is durable, so a reply read yesterday must not
  // light the button again after a reload; feel/missed are re-derived from
  // live state on every mount and keeping them out leaves that as it was.
  {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    }
    check('nothing written yet reads back as "never stored", not as "nothing seen"',
      loadSeenAttention('p1') === null)
    saveSeenAttention('p1', 'feel:2026-09-05|missed:Thursday|unread:msg-1')
    check('only the unread reason is persisted', loadSeenAttention('p1') === 'unread:msg-1', loadSeenAttention('p1'))
    check('...so the reply stays read across a reload',
      !hasUnseenAttention('unread:msg-1', loadSeenAttention('p1')!))
    check('...and the feel question still nudges after one, as it did before this change',
      hasUnseenAttention('feel:2026-09-05', loadSeenAttention('p1')!))
    saveSeenAttention('p2', 'feel:2026-09-05')
    check('a profile with nothing durable to remember stores an empty set, not null',
      loadSeenAttention('p2') === '')
    check('profiles do not share a seen set', loadSeenAttention('p1') === 'unread:msg-1')
  }
}

console.log('\n9. The ring and the pulse vanish at glow Off and stop under reduced motion')
{
  const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
  const bar = readFileSync(join(ROOT, 'src/components/BottomTabBar.tsx'), 'utf8')

  // Brace-matched bodies for a rule or @keyframes block (keyframes nest, so
  // indexOf('}') is not enough). ALL of them, because a selector can appear
  // more than once — and matched only where the header STARTS a rule, so
  // `.chat-unread-ring` does not also pick up `[data-canvas="light"]
  // .chat-unread-ring`, and `@keyframes chatUnreadPulse` does not pick up
  // `...PulseLight`. Both of those silently returned the wrong block while
  // this section was being written, and every check passed on the wrong one.
  const blocks = (header: string): string[] => {
    const re = new RegExp(`(?:^|[\\n,{])\\s*${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'g')
    const out: string[] = []
    for (const m of css.matchAll(re)) {
      let depth = 0
      const i = css.indexOf('{', (m.index ?? 0) + m[0].length - 1)
      for (let j = i; j < css.length; j++) {
        if (css[j] === '{') depth++
        else if (css[j] === '}' && --depth === 0) { out.push(css.slice(i + 1, j)); break }
      }
    }
    return out
  }
  const block = (header: string): string => blocks(header)[0] ?? ''

  const FRAMES = ['chatUnreadPulse', 'chatUnreadRing', 'chatUnreadPulseLight', 'chatUnreadRingLight']
  for (const name of FRAMES) {
    const body = block(`@keyframes ${name}`)
    check(`@keyframes ${name} exists`, body.length > 0)
    // THE GLOW-OFF GUARANTEE. Ashley asked for these to vanish when glow is
    // turned off. --glow-strength is 0 at "off", so every colour these
    // animate has to carry it in its ALPHA — a blur that shrinks to nothing
    // still paints if the alpha does not.
    const alphas = [...body.matchAll(/rgba\([^)]*var\(--glow-rgb\)\s*,\s*([^;]*?)\)\s*[;,]/g)].map(m => m[1])
    check(`...and every colour in it fades to nothing at glow Off (${alphas.length} found)`,
      alphas.length > 0 && alphas.every(a => a.includes('var(--glow-strength)')), alphas)
    // A transform is not a halo: it would keep pulsing at strength 0, which
    // is exactly what "vanishing when glow is turned off" rules out.
    check('...and animates no transform, which glow Off cannot switch off', !/transform/.test(body), body.slice(0, 120))
  }
  // The house rule for a DARK-canvas halo is both blur AND alpha (see the
  // glow-system comment). The light variants are flat drop shadows, where
  // the alpha alone does the vanishing — same as dsBloomInLight.
  for (const name of ['chatUnreadPulse', 'chatUnreadRing']) {
    const blurs = [...block(`@keyframes ${name}`).matchAll(/(\d+px)(?!\s*\*)/g)].map(m => m[0])
    check(`${name} scales its blur radii too, not just its alphas`,
      blurs.length === 0 && /calc\(\d+px \* var\(--glow-strength\)\)/.test(block(`@keyframes ${name}`)), blurs)
  }

  // The pulse starts and ends on .glow-mint-box's own resting shadow, so
  // adding or removing the class does not make the button jump.
  const resting = /0 0 calc\(12px \* var\(--glow-strength\)\) rgba\(var\(--glow-rgb\), calc\(\.90 \* var\(--glow-strength\)\)\),\s*0 0 calc\(24px \* var\(--glow-strength\)\) rgba\(var\(--glow-rgb\), calc\(\.45 \* var\(--glow-strength\)\)\)/
  check('the pulse rests exactly where .glow-mint-box already sits',
    resting.test(block('.glow-mint-box')) && resting.test(block('@keyframes chatUnreadPulse')))

  // Reduced motion strips the animations. What is LEFT has to still say
  // something, so the ring's resting border is glow-multiplied in the class
  // itself rather than only inside the keyframes.
  // There is more than one reduced-motion block in the file (onboarding has
  // its own); the pulse only has to be stopped by one of them.
  const reduced = blocks('@media (prefers-reduced-motion: reduce)')
  check('there are reduced-motion blocks to look in', reduced.length > 0, reduced.length)
  check('reduced motion stops the pulse', reduced.some(b => /\.chat-unread\s*,/.test(b)))
  check('...and the ring', reduced.some(b => /\.chat-unread-ring\s*,/.test(b)))
  check('...leaving a static ring behind, which still scales with glow',
    /border:\s*1\.5px solid rgba\(var\(--glow-rgb\), calc\([.\d]+ \* var\(--glow-strength\)\)\)/.test(block('.chat-unread-ring')))

  // On paper a halo under a button reads as a printing fault — the same
  // reason .glow-bloom-once swaps keyframes on a light canvas.
  check('a light canvas swaps the pulse for a flat drop shadow',
    /\[data-canvas="light"\] \.chat-unread \{\s*animation-name: chatUnreadPulseLight/.test(css))
  check('...and drops the ring\'s halo, leaving its border to do the work',
    /\[data-canvas="light"\] \.chat-unread-ring \{\s*animation-name: chatUnreadRingLight/.test(css) &&
    !/box-shadow/.test(block('@keyframes chatUnreadRingLight')))

  // ...and the button actually wears them, only when something is waiting.
  check('the button wears the pulse only while something is waiting',
    /chatAttention \? 'chat-unread' : ''/.test(bar))
  check('the ring is drawn only then too', /\{chatAttention && \([\s\S]{0,400}className="chat-unread-ring"/.test(bar))
  // The dot survives both: at glow Off with reduced motion on it is the only
  // thing left saying the coach is waiting.
  check('...and the dot is still drawn underneath, outside the glow system',
    /data-testid="chat-attention-dot"[\s\S]{0,300}bg-amber-400/.test(bar))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nOne thing said first, no chips under the question that wants a sentence, and the dot means it.\n')
