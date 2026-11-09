// ---------------------------------------------------------------------------
// THE COACH SPEAKING FIRST, MID-CONVERSATION — and the ways that goes wrong.
//
// coach-nudge.ts posts an unprompted message into an EXISTING chat thread,
// which the opener could never do (see its header, and the plan doc
// docs/plans/the-coach-speaks-first.md). An unprompted message has failure
// modes an opener does not, so the checks are:
//
//   §1  one thing, ranked — the most actionable event is the one said, and
//       only one message is ever produced
//   §2  said ONCE — a burnt key never speaks again, and the key is the EVENT
//       rather than its kind, so a second PR on a different lift still does
//   §3  Ashley's rulings: no chips under the how-did-it-feel question, and
//       the five events she chose — no nutrition, water or weigh-in nudge
//   §4  a PR from the session being asked about folds in rather than queuing,
//       and only when it is that session's PR
//   §5  a half-loaded plan never becomes a claim about today
//   §6  every chip is a sentence the coach's existing tools can finish
//   §7  the store: burnt keys and the quiet period survive a reload, and the
//       opener burns without starting the quiet period
//   §8  THE WIRING — the message is written to chat_messages (which is what
//       lights the button AND blocks the next one), and every guard in
//       ChatAssistant that keeps a nudge from being a nag is present
//
// Pure functions where possible; source reads for the wiring, the same split
// test-coach-opener.ts uses.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  pickNudge, nudgeKeys, keysCoveredByOpener, rememberNudge, rememberWithoutSpeaking,
  STREAK_MILESTONES, NUDGE_MIN_GAP_MS, type NudgeInput, type NudgeStore,
  pickUnprompted, keysSaidByMarkers, helloKey, greeted, HELLO_MOMENT, MOMENT_MIN_GAP_MS, openerSkips, type UnpromptedInput, type CoachNudge,
} from '../src/lib/coach-nudge'
import { momentsToRaise, dailyCap, type MomentFacts } from '../src/lib/coach-moments'
import { hasUnreadCoachMessage } from '../src/lib/chat-unread'
import { isBirthday } from '../src/lib/body-units'
import type { ChatMessage } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

/** Source with comments stripped — a check must never be satisfied by prose ABOUT the code. */
const sourceOf = (rel: string): string =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const chat = sourceOf('src/components/ChatAssistant.tsx')
const nudgeSrc = sourceOf('src/lib/coach-nudge.ts')

/** A training day, still ahead, nothing else going on. */
const base: NudgeInput = {
  today: '2026-09-07',
  hour: 9,
  cutoffHour: 13,
  planKnown: true,
  awaitingFeel: null,
  missedYesterday: null,
  recentPR: null,
  streak: 3,
  todaySession: { focus: 'Push & Press', movements: 'Barbell Bench Press, Overhead Press, Dips' },
  todayLogged: false,
}
const FEEL = { date: '2026-09-07', day: 'Push & Press', isToday: true }
const MISSED = { date: '2026-09-06', dayName: 'Sunday', focus: 'Legs' }
// THE KIND TRAVELS WITH THE NUMBER (re-anchored 9 Oct 2026, M16/L32): this
// fixture carried a bare `weightKg`, the shape that printed "at 0kg" for a
// reps record.
const PR = { exerciseName: 'Barbell Bench Press', metric: 'load' as const, value: 80, date: '2026-09-07' }

console.log('\n1. One thing, ranked by how actionable it is right now')
{
  const all: NudgeInput = { ...base, awaitingFeel: FEEL, missedYesterday: MISSED, recentPR: PR, streak: 30 }
  const first = pickNudge(all, [])
  check('an unreviewed session outranks everything', first?.kind === 'session_feel', first?.kind)

  const noFeel = pickNudge({ ...all, awaitingFeel: null }, [])
  check('a missed day outranks a PR', noFeel?.kind === 'missed_yesterday', noFeel?.kind)

  const noMissed = pickNudge({ ...all, awaitingFeel: null, missedYesterday: null }, [])
  check('a PR outranks a streak milestone', noMissed?.kind === 'personal_best', noMissed?.kind)

  const noPR = pickNudge({ ...all, awaitingFeel: null, missedYesterday: null, recentPR: null }, [])
  check('a streak milestone outranks today\'s session', noPR?.kind === 'streak_milestone', noPR?.kind)

  const only = pickNudge(base, [])
  check('today\'s session is what is left', only?.kind === 'session_due', only?.kind)

  check('nothing to say returns null, rather than filler',
    pickNudge({ ...base, todaySession: null }, []) === null)

  // pickNudge returns ONE nudge, not a list — the type says so, and this is
  // what keeps "at most one observation" structural rather than a convention.
  check('the return is a single message, never a queue', !Array.isArray(first))
}

console.log('\n2. Said once — and the key is the EVENT, not its kind')
{
  const withPR: NudgeInput = { ...base, recentPR: PR }
  const said = pickNudge(withPR, [])!
  check('a PR is announced', said.kind === 'personal_best', said.kind)
  const again = pickNudge(withPR, said.keys)
  check('...and never announced twice', again?.kind !== 'personal_best', again?.kind)

  const secondLift = { exerciseName: 'Back Squat', metric: 'load' as const, value: 100, date: '2026-09-08' }
  const other = pickNudge({ ...withPR, recentPR: secondLift }, said.keys)
  check('a PR on a DIFFERENT lift is its own event, and does speak',
    other?.kind === 'personal_best' && other.text.includes('Back Squat'), other?.text)

  const heavier = { ...PR, value: 85, date: '2026-09-09' }
  const beaten = pickNudge({ ...withPR, recentPR: heavier }, said.keys)
  check('beating the same lift again is a new event too',
    beaten?.kind === 'personal_best' && beaten.text.includes('85'), beaten?.text)

  const keys = nudgeKeys({ ...base, awaitingFeel: FEEL, missedYesterday: MISSED, recentPR: PR, streak: 30 })
  check('every key carries the identity of the thing, not just its kind',
    keys.feel === 'feel:2026-09-07' && keys.missed === 'missed:2026-09-06' &&
    keys.pr === 'pr:Barbell Bench Press:2026-09-07:80' && keys.streak === 'streak:30' &&
    keys.due === 'due:2026-09-07', keys)

  // A key outranked today must NOT be burnt — otherwise the second thing
  // worth saying is lost rather than delayed.
  const top = pickNudge({ ...base, awaitingFeel: FEEL, missedYesterday: MISSED }, [])!
  check('the outranked event is left unburnt, so it is said later not lost',
    top.keys.length === 1 && top.keys[0] === 'feel:2026-09-07', top.keys)
  const later = pickNudge({ ...base, awaitingFeel: null, missedYesterday: MISSED }, top.keys)
  check('...and it is still there the next time', later?.kind === 'missed_yesterday', later?.kind)
}

console.log('\n3. Ashley\'s rulings, 7 Sep 2026')
{
  const feel = pickNudge({ ...base, awaitingFeel: FEEL }, [])!
  check('NO chips under the how-did-it-feel question', feel.chips.length === 0, feel.chips)
  check('...and it asks for a feeling, not a number', /feel/i.test(feel.text), feel.text)

  // "Training + wins", chosen over "everything it tracks". accountability.ts
  // can already produce evening protein/water shortfalls and a stale weigh-in;
  // this module must not reach for them.
  const kinds = [...nudgeSrc.matchAll(/kind: '([a-z_]+)'/g)].map(m => m[1])
  const unique = [...new Set(kinds)].sort()
  // RE-ANCHORED 9 Nov 2026: his request "the chat should also be able to proactively wish you happy birthday" adds a
  // sixth, and nothing else (no food, water or weigh-in still).
  check('exactly the events he chose: the five, and the birthday he asked for',
    JSON.stringify(unique) === JSON.stringify(
      ['birthday', 'missed_yesterday', 'personal_best', 'session_due', 'session_feel', 'streak_milestone']),
    unique)
  // Checked two ways, because one alone is weak. `weightKg` legitimately
  // appears (a PR is a weight), so this cannot be a bare search for "weight".
  check('no nutrition, water or weigh-in concept enters at all',
    !/\bprotein|\bwaterMl|\bcalorie|weighIn/i.test(nudgeSrc),
    nudgeSrc.match(/\bprotein|\bwaterMl|\bcalorie|weighIn/i)?.[0])
  check('and it does not import the module that produces them',
    !/accountability/.test(nudgeSrc))

  check('the milestones are stated, not scattered', STREAK_MILESTONES.length > 0)
  check('a non-milestone streak says nothing',
    pickNudge({ ...base, streak: 8, todaySession: null }, []) === null)
  check('a milestone streak does', pickNudge({ ...base, streak: STREAK_MILESTONES[0] }, [])?.kind === 'streak_milestone')
}

console.log('\n4. A PR folds into the question about that session')
{
  const folded = pickNudge({ ...base, awaitingFeel: FEEL, recentPR: PR }, [])!
  check('the PR leads, the feel question follows',
    folded.kind === 'session_feel' && folded.text.startsWith('Nice PR on Barbell Bench Press at 80kg.'), folded.text)
  check('...and BOTH keys are burnt, so it is not congratulated again',
    folded.keys.includes('feel:2026-09-07') && folded.keys.includes('pr:Barbell Bench Press:2026-09-07:80'), folded.keys)
  check('so the next message is not the PR', pickNudge({ ...base, recentPR: PR }, folded.keys)?.kind !== 'personal_best')

  const stale = { ...PR, date: '2026-09-04' }
  const notFolded = pickNudge({ ...base, awaitingFeel: FEEL, recentPR: stale }, [])!
  check('a PR from a DIFFERENT day is not tacked onto today\'s question',
    !notFolded.text.includes('Nice PR'), notFolded.text)
  check('...and its key stays unburnt, so it gets its own message later',
    !notFolded.keys.some(k => k.startsWith('pr:')), notFolded.keys)
}

console.log('\n5. A half-loaded plan never becomes a claim about today')
{
  // Deliberately INCONSISTENT input: a session present while planKnown is
  // false. The caller cannot produce that today (an empty week yields a null
  // session), which is exactly why the earlier version of this check passed
  // with the guard deleted. The guard is defence against the 7 Sep bug class —
  // "we don't know yet" being read as a fact about today — so the check has to
  // be the one thing that guard is for.
  const loading: NudgeInput = { ...base, planKnown: false }
  check('no session_due while the plan is unknown, even with a session in hand',
    pickNudge(loading, []) === null, pickNudge(loading, [])?.kind)
  check('...and no key is even minted for it', nudgeKeys(loading).due === null)
  // The events that do NOT depend on the plan are still allowed through — they
  // come from logged sessions and the week strip's own states.
  check('an unreviewed session is still asked about',
    pickNudge({ ...loading, awaitingFeel: FEEL }, [])?.kind === 'session_feel')

  check('past the cutoff, today\'s session is not asked about',
    pickNudge({ ...base, hour: 20 }, []) === null)
  check('once a set is logged, today\'s session is not asked about',
    pickNudge({ ...base, todayLogged: true }, []) === null)
}

console.log('\n6. Every chip is a sentence the coach can finish')
{
  const inputs: NudgeInput[] = [
    { ...base, awaitingFeel: FEEL },
    { ...base, missedYesterday: MISSED },
    { ...base, recentPR: PR },
    { ...base, streak: STREAK_MILESTONES[0] },
    base,
  ]
  const all = inputs.map(i => pickNudge(i, [])!).filter(Boolean)
  check('all five kinds are reachable', all.length === 5, all.map(n => n.kind))
  for (const n of all) {
    for (const chip of n.chips) {
      // Each chip is SENT as the trainee's own message, so a bare "Yes" or
      // "Lighter" would reach the coach with nothing to attach it to.
      check(`chip stands alone when sent: ${chip}`,
        chip.trim().split(/\s+/).length >= 3 && /^[A-Z]/.test(chip.trim()))
    }
    for (const chip of n.chips) {
      check(`${n.kind}: chip says nothing about nutrition or weigh-ins`,
        !/\bprotein|\bwater|\bcalorie|weigh.?in/i.test(chip), chip)
    }
    check(`${n.kind}: the message itself stays off nutrition and weigh-ins`,
      !/\bprotein|\bwater|\bcalorie|weigh.?in/i.test(n.text), n.text)
    check(`${n.kind}: the message stands alone without its chips`, n.text.trim().length > 12 && /[?.]$/.test(n.text.trim()))
    check(`${n.kind}: no greeting — this lands mid-conversation`, !/^(hi|hey|hello)\b/i.test(n.text))
  }
}

console.log('\n7. The store: what survives a reload')
{
  const empty: NudgeStore = { said: [], lastAt: 0 }
  const after = rememberNudge(empty, ['pr:Bench:2026-09-07:80'], 1_000_000)
  check('speaking burns the key', after.said.includes('pr:Bench:2026-09-07:80'))
  check('...and starts the quiet period', after.lastAt === 1_000_000)
  check('the quiet period is a real gap, not zero', NUDGE_MIN_GAP_MS > 0)

  const openerBurn = rememberWithoutSpeaking(after, ['feel:2026-09-07'])
  check('the opener burns its key', openerBurn.said.includes('feel:2026-09-07'))
  check('...but does NOT start the quiet period — she opened the chat herself',
    openerBurn.lastAt === after.lastAt, openerBurn.lastAt)

  const dup = rememberNudge(after, ['pr:Bench:2026-09-07:80'], 2_000_000)
  check('burning the same key twice does not grow the store',
    dup.said.filter(k => k === 'pr:Bench:2026-09-07:80').length === 1, dup.said)

  // Unbounded growth would eventually blow the localStorage quota and take the
  // seen set and the chat mirror down with it.
  let big: NudgeStore = empty
  for (let i = 0; i < 500; i++) big = rememberNudge(big, [`pr:Lift${i}:2026-01-01:${i}`], i)
  check('the store is bounded', big.said.length <= 100, big.said.length)
  check('...and keeps the NEWEST keys, which are the ones still live',
    big.said[big.said.length - 1] === 'pr:Lift499:2026-01-01:499', big.said.slice(-1))

  const keys = nudgeKeys({ ...base, awaitingFeel: FEEL, missedYesterday: MISSED, recentPR: PR })
  check('the opener\'s feel bubble covers the feel key',
    keysCoveredByOpener('session_feel', keys, false).includes(keys.feel!))
  check('the opener\'s missed bubble covers the missed key',
    keysCoveredByOpener('missed_yesterday', keys, false).includes(keys.missed!))
  check('the opener\'s today bubble covers the due key',
    keysCoveredByOpener('training_today', keys, false).includes(keys.due!))
  check('...on both sides of the cutoff',
    keysCoveredByOpener('training_done_today', keys, false).includes(keys.due!))
  check('the opener\'s PR line covers the PR key wherever it appears',
    keysCoveredByOpener('rest_day', keys, true).includes(keys.pr!))
  check('...and covers nothing else on a rest day',
    keysCoveredByOpener('rest_day', keys, true).length === 1)
  check('a plan-unknown opener claims nothing about today',
    !keysCoveredByOpener('plan_unknown', keys, false).includes(keys.due!))
}

console.log('\n8. The wiring — what makes it a nudge rather than a nag')
{
  // THE LOAD-BEARING ONE. A nudge composed in memory (like the opener) has no
  // database id, so chat-unread.ts would not count it, the button would not
  // light, and nothing would stop a second one landing on top of it.
  // Since 7 Nov 2026 the row also carries the reminder marker, so the day's count and the phone can read it.
  const insert = /from\('chat_messages'\)[\s\S]{0,400}?insert\(\{[\s\S]{0,300}?content: text[\s\S]{0,80}?action_data: marker[\s\S]{0,60}?\}\)[\s\S]{0,120}?select\('id'\)/
  check('the nudge is written to chat_messages and its id read back', insert.test(chat))
  check('...and the id is what goes into the transcript',
    /setMessages\(prev => \[\.\.\.prev, \{[\s\S]{0,200}?id: data\.id/.test(chat))

  check('a failed write stays silent instead of showing a message that would vanish',
    /coach nudge: insert failed/.test(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')))

  // Each guard, pinned as the PROPERTY rather than as a line of code.
  check('never twice unanswered', /if \(hasUnreadCoachMessage\(messages, seenAttention\)\) return/.test(chat))
  check('never on a brand-new account', /isFirstEverChat !== false/.test(chat))
  check('never while a reply is in flight', /\|\| isLoading\) return/.test(chat))
  check('never on half-loaded data',
    /if \(!proactiveData \|\| !feelContext \|\| trainingWeek\.loading \|\| !planKnown\) return/.test(chat))
  check('never on top of the opener — one bubble with no id IS the opener',
    /if \(messages\.length === 1 && !messages\[0\]\.id\) return/.test(chat))
  check('never over an open proposal she has been asked to confirm',
    /if \(messages\.some\(m => m\.pendingAction\?\.status === 'pending'\)\) return/.test(chat))
  check('never over a clarification waiting on a choice',
    /if \(messages\[messages\.length - 1\]\?\.clarification\) return/.test(chat))
  // Since 7 Nov 2026 the spacing lives in pickUnprompted (section 9 runs it); the chat hands it the store's time.
  check('the quiet period is enforced against the persisted store',
    /lastUnpromptedAt: Math\.max\(nudgeStore\(\)\.lastAt, lastRowAt\)/.test(chat))
  check('a refusing database is not retried every render',
    /writeNudgeStore\(\{ \.\.\.nudgeStore\(\), lastAt: now \}\)/.test(chat))
  check('the opener burns what it covered, without starting the quiet period',
    /rememberWithoutSpeaking\([\s\S]{0,120}?keysCoveredByOpener\(opener\.kind/.test(chat))
  check('the store is persisted, not just held in memory', /saveNudgeStore\(profile\.id, next\)/.test(chat))

  // The opener and the nudge must describe the same day in the same words.
  //
  // RE-ANCHORED 8 Sep 2026. This pinned the exact expression
  // `const todayPlan = liveWeekDays.find(` — the mechanism, not the property —
  // and broke the moment today's session started resolving through
  // session-move.ts as well as the plan ("I'll do it tomorrow"). The property
  // it was defending is unchanged and is now stronger: ONE resolution of
  // today, feeding both.
  check('today is resolved exactly once', (chat.match(/const todayPlan = /g) ?? []).length === 1)
  check('...from the one resolver that also knows about moved sessions',
    /const todayResolved = sessionForDate\(\{ date: activeSession\.date, plan: liveWeekDays, moves: trainingWeek\.moves \}\)/.test(chat))
  // AND todayPlan IS THAT RESOLUTION. Without this the re-anchor above passes
  // on a todayPlan that has gone back to a bare `liveWeekDays.find(...)` —
  // caught by mutating exactly that, 8 Sep 2026, and the check was weaker than
  // the one it replaced until this line was added.
  const todayPlanAt = chat.indexOf('const todayPlan = ')
  const todayPlanDecl = todayPlanAt >= 0 ? chat.slice(todayPlanAt, todayPlanAt + 220) : ''
  check('...and today\'s session comes from that resolution, not a second plan lookup',
    /todayResolved/.test(todayPlanDecl) && !/liveWeekDays\.find/.test(todayPlanDecl), todayPlanDecl.slice(0, 160))
  check('...and the nudge reads that same value, not its own lookup',
    /todaySession: todayPlan \? \{ focus: todayPlan\.focus, movements: movementsOf\(todayPlan\) \} : null,[\s\S]{0,200}todayLogged/.test(chat))

  // hasUnreadCoachMessage must be about the LAST message specifically —
  // "somewhere in the transcript" would silence the coach permanently.
  const unread = sourceOf('src/lib/chat-unread.ts')
  check('the unread predicate reads the newest coach message only',
    /export function hasUnreadCoachMessage[\s\S]{0,300}?newestCoachMessageId\(messages\)/.test(unread))

  const msgs: ChatMessage[] = [
    { role: 'user', content: 'hi' },
    { id: 'm2', role: 'assistant', content: 'hello', status: 'complete' },
  ]
  check('an unseen coach reply silences the coach', hasUnreadCoachMessage(msgs, ''))
  check('...and a seen one does not', !hasUnreadCoachMessage(msgs, 'unread:m2'))
  check('the trainee having spoken last never silences it',
    !hasUnreadCoachMessage([...msgs, { role: 'user', content: 'ok' }], ''))
  check('a client-composed bubble with no id does not silence it',
    !hasUnreadCoachMessage([{ role: 'assistant', content: 'opener', status: 'complete' }], ''))
}

console.log('\n9. Hello + more moments (her ruling 7 Nov 2026): one decision over the day, capped by her setting')
{
  const T = '2026-11-07'
  const NOW = Date.parse('2026-11-07T19:30:00')
  const HOUR = 3_600_000
  const event: CoachNudge = { kind: 'missed_yesterday', keys: [`missed:2026-11-06`], text: "Yesterday's Legs didn't happen — no drama.", chips: ['Mark it missed'] }
  let helloBuilt = 0
  const inp = (over: Partial<UnpromptedInput> = {}): UnpromptedInput => ({
    now: NOW, today: T, cap: 3, unpromptedToday: 0, lastUnpromptedAt: 0, momentsSaidToday: [], said: [],
    event: null, greeting: 'Hey Ashley',
    hello: () => { helloBuilt++; return { text: "Hey Ashley — rest day today. How's the body feeling?", chips: [], kind: 'rest_day' } },
    moments: [], ...over,
  })
  // An ordinary evening: she logs meals, nothing logged today (the phone's own test, run for real).
  const facts: MomentFacts = {
    localHour: 19, awaitingFeel: false, plannedToday: false, loggedToday: false, missedYesterday: false,
    daysSinceAnyLog: null, streakDays: 0, blockJustEnded: false, beatTargetPending: false,
    mealsAccountedToday: 0, logsMeals: true, proteinEatenToday: 0, proteinTargetG: 130, name: 'Ashley',
  }
  const moments = momentsToRaise(facts, {})
  check('the phone\'s evening food moment is live on that evening (fixture binds)', moments.some(m => m.key === 'meal_not_logged'), moments.map(m => m.key))

  const h = pickUnprompted(inp())
  check('a quiet day with nothing said yet: the HELLO, from the opener', h?.moment === HELLO_MOMENT && h.fromOpener === true && h.keys.includes(helloKey(T)), h)
  check('...greeting her by name', /^Hey Ashley/.test(h?.text ?? ''), h?.text)
  check('...carrying the opener\'s kind, so its rotation advances', h?.openerKind === 'rest_day', h)
  const second = pickUnprompted(inp({ said: [helloKey(T)], unpromptedToday: 1, lastUnpromptedAt: NOW - 10 * 60_000 }))
  check('never a second hello the same day', second === null, second)
  const fromPhone = pickUnprompted(inp({ momentsSaidToday: [HELLO_MOMENT], unpromptedToday: 1, lastUnpromptedAt: NOW - 4 * HOUR }))
  check('a hello another phone already put in the chat counts as today\'s', fromPhone?.moment !== HELLO_MOMENT, fromPhone)

  const e = pickUnprompted(inp({ event }))
  check('an event due is the day\'s first message, greeted', e?.text === greeted('Hey Ashley', event.text) && /^Hey Ashley — yesterday's Legs/.test(e?.text ?? ''), e?.text)
  check('...and it IS the hello: the hello key burns with it', !!e && e.keys.includes(helloKey(T)) && e.keys.includes(event.keys[0]), e?.keys)
  check('...marked as the phone\'s moment name', e?.moment === 'missed_yesterday', e)
  const e2 = pickUnprompted(inp({ event, said: [helloKey(T)], unpromptedToday: 1, lastUnpromptedAt: NOW - HOUR }))
  check('an event after the hello is not greeted again', e2?.text === event.text, e2?.text)
  check('an event waits the 30-minute spacing', pickUnprompted(inp({ event, lastUnpromptedAt: NOW - (NUDGE_MIN_GAP_MS - 1000) })) === null)

  const m = pickUnprompted(inp({ said: [helloKey(T)], unpromptedToday: 1, lastUnpromptedAt: NOW - 4 * HOUR, moments }))
  check('after the hello, the evening food moment, in the phone\'s words', m?.moment === 'meal_not_logged' && m.text === moments.find(x => x.key === 'meal_not_logged')!.text, m)
  check('...with the phone\'s shortcut', m?.shortcut === 'nutrition', m)
  check('a moment waits the phone\'s three hours, not 30 minutes',
    pickUnprompted(inp({ said: [helloKey(T)], unpromptedToday: 1, lastUnpromptedAt: NOW - (MOMENT_MIN_GAP_MS - 60_000), moments })) === null)
  check('a moment the phone already sent today is not said again',
    pickUnprompted(inp({ said: [helloKey(T)], unpromptedToday: 1, lastUnpromptedAt: NOW - 4 * HOUR, moments, momentsSaidToday: [HELLO_MOMENT, 'meal_not_logged'] }))?.moment !== 'meal_not_logged')
  check('nor one this phone already said', pickUnprompted(inp({ said: [helloKey(T), `moment:meal_not_logged:${T}`], unpromptedToday: 1, lastUnpromptedAt: NOW - 4 * HOUR, moments }))?.moment !== 'meal_not_logged')
  const feelMoment = [{ key: 'session_feel', text: 'Hey Ashley, how was it?', shortcut: null }]
  check('a moment an event speaks for is left to the event', pickUnprompted(inp({ said: [helloKey(T)], unpromptedToday: 1, lastUnpromptedAt: NOW - 4 * HOUR, moments: feelMoment })) === null)

  check('Light (1 a day): nothing after the first', pickUnprompted(inp({ cap: dailyCap('light'), unpromptedToday: 1, event, lastUnpromptedAt: NOW - 5 * HOUR })) === null)
  check('Normal allows a second', pickUnprompted(inp({ cap: dailyCap('normal'), unpromptedToday: 1, event, lastUnpromptedAt: NOW - 5 * HOUR })) !== null)
  check('Normal stops at three', pickUnprompted(inp({ cap: dailyCap('normal'), unpromptedToday: 3, event, lastUnpromptedAt: NOW - 5 * HOUR })) === null)
  check('Lots allows a fourth', pickUnprompted(inp({ cap: dailyCap('lots'), unpromptedToday: 4, event, lastUnpromptedAt: NOW - 5 * HOUR })) !== null)
  helloBuilt = 0
  pickUnprompted(inp({ event }))
  check('the opener is not even built when an event speaks', helloBuilt === 0, helloBuilt)

  const keys = nudgeKeys({ ...base, today: T, awaitingFeel: { date: T, isToday: true }, todaySession: { focus: 'Legs', movements: 'Squat' } })
  const byMarkers = keysSaidByMarkers(keys, ['session_feel', 'workout_today'])
  check('the phone\'s "how was it" and session reminder count as the chat\'s feel and due', byMarkers.includes(keys.feel!) && byMarkers.includes(keys.due!), byMarkers)

  // NEVER ASKED TWICE (simulated week, 7 Nov 2026): Monday's unanswered feel question was asked again by Tuesday's hello.
  const k2 = nudgeKeys({ ...base, today: '2026-11-10', awaitingFeel: { date: '2026-11-09', isToday: false }, missedYesterday: { date: '2026-11-09', dayName: 'Monday', focus: 'Legs' } })
  const fresh = openerSkips(k2, [])
  const asked = openerSkips(k2, [k2.feel!, k2.missed!])
  check('a feel question not yet asked: the hello may ask it', fresh.feel === false && fresh.missed === false, fresh)
  check('...one already asked and unanswered: the hello skips both the feel and the missed-day question', asked.feel === true && asked.missed === true, asked)
  check('...each on its own key', openerSkips(k2, [k2.feel!]).missed === false && openerSkips(k2, [k2.missed!]).feel === false)
  check('the chat builds the hello\'s opener without what was already asked',
    /const opener = composeOpener\(openerSkips\(keys, said\)\)/.test(chat)
    && /awaitingFeel: feelContext\?\.awaiting && !skip\.feel/.test(chat)
    && /missedYesterday: skip\.missed \? null : missedYesterday/.test(chat))

  // THE WIRING: these values are what the chat hands it.
  check('the chat decides through pickUnprompted', /const pick = pickUnprompted\(\{/.test(chat))
  check('...capped by her own frequency', /cap: dailyCap\(reminderSettings\.frequency\)/.test(chat))
  check('...counting every unprompted row of today in the chat', /const unprompted = messages\.filter\(m => m\.role === 'assistant' && m\.reminder && m\.created_at[\s\S]{0,80}=== today\)/.test(chat))
  check('...with the phone\'s moments, her switches applied', /moments: facts \? momentsToRaise\(facts, reminderSettings\) : \[\]/.test(chat))
  check('...and the phone\'s markers counted as said', /const said = \[\.\.\.nudgeStore\(\)\.said, \.\.\.keysSaidByMarkers\(keys, momentsSaidToday\)\]/.test(chat))
  check('every unprompted row carries the reminder marker', /const marker = \{ source: 'reminder', moment: pick\.moment, shortcut: pick\.shortcut \}/.test(chat))
  check('the empty-chat opener counts as today\'s hello', /rememberWithoutSpeaking\([\s\S]{0,200}helloKey\(nudgeInputRef\.current\.today\)/.test(chat))
  check('a failed history read no longer silences the coach for the visit', /Failed to load chat history[\s\S]{0,400}setIsFirstEverChat\(prev => prev \?\? false\)/.test(chat))
  check('the clock is checked again while the app sits open', /setInterval\(bump, 10 \* 60 \* 1000\)/.test(chat) && /clockTick, reminderSettings, logsMeals\]\)/.test(chat))
}

console.log('\n10. Happy birthday (his request, 9 Nov 2026): the coach wishes him, first, once, on the right day')
{
  check('the birthday itself', isBirthday('1990-06-15', '2026-06-15'))
  check('...not the day before, nor the day after', !isBirthday('1990-06-15', '2026-06-14') && !isBirthday('1990-06-15', '2026-06-16'))
  check('born 29 February: wished on 1 March in a year without one, the day the age goes up', isBirthday('2000-02-29', '2027-03-01') && !isBirthday('2000-02-29', '2027-02-28'))
  check('...and on 29 February in a year with one', isBirthday('2000-02-29', '2028-02-29') && !isBirthday('2000-02-29', '2028-03-01'))
  check('no date of birth (an age typed instead): never', !isBirthday(null, '2026-06-15') && !isBirthday(undefined, '2026-06-15') && !isBirthday('', '2026-06-15'))
  const all: NudgeInput = { ...base, birthdayToday: true, awaitingFeel: FEEL, missedYesterday: MISSED, recentPR: PR, streak: 30 }
  const first = pickNudge(all, [])
  check('on the day it comes first, ahead of a session to ask about', first?.kind === 'birthday' && /happy birthday/i.test(first.text), first)
  check('...and it is a wish: no chips, no training in it', first?.chips.length === 0 && !/session|train|workout|lift/i.test(first?.text ?? ''), first?.text)
  const key = nudgeKeys(all).birthday
  check('it is keyed to the day, so it is said once', key === `birthday:${all.today}` && pickNudge(all, [key!])?.kind === 'session_feel', { key, next: pickNudge(all, [key!])?.kind })
  check('not the birthday: never said', nudgeKeys({ ...base, birthdayToday: false }).birthday === null && pickNudge({ ...base }, [])?.kind !== 'birthday')
  const hello = pickUnprompted({ now: 10 * 3600000, today: all.today, cap: 1, unpromptedToday: 0, lastUnpromptedAt: 0, momentsSaidToday: [], said: [],
    event: first, greeting: 'Hey Ashley', hello: () => null, moments: [] })
  check('as the day\'s first message it is the hello, greeted by name, and fits within Light\'s one a day',
    hello?.text === "Hey Ashley — happy birthday! Hope it's a good one." && hello?.moment === 'birthday' && hello.keys.includes(helloKey(all.today)), hello)
  check('the chat works it out from the date of birth he picked', /birthdayToday: isBirthday\(profile\.date_of_birth, activeSession\.date\)/.test(chat))
}

console.log(failures === 0 ? '\nAll coach-nudge checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
