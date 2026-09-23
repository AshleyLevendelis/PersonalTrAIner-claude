// ---------------------------------------------------------------------------
// WHICH ONE THING IS WORTH A BUZZ IN SOMEONE'S POCKET
//
// Ashley chose notifications 17 Sep 2026 and ruled the scope in her own words:
// "Everything but the user should be able to toggle notifications on or off to
// reduce noise." All seven moments, each switchable, all on to begin with.
//
// WHAT THIS GATE IS FOR, and what it deliberately is not. It holds the
// DECISION — order, quiet hours, switches, and the fact that every sentence
// comes from the phrasebook. It cannot prove a notification ever arrives on a
// phone; nothing here can, and the plan doc says so. That proof is a real
// device with the app shut, in a later slice.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  momentToRaise, liveMoments, MOMENT_KEYS, DEFAULT_MOMENT_SWITCHES,
  QUIET_BEFORE_HOUR, QUIET_AFTER_HOUR, NOT_LOGGED_AFTER_HOUR, QUIET_WEEK_DAYS,
  type MomentFacts, type MomentKey,
} from '../src/lib/coach-moments'
import { notification } from '../src/lib/coach-voice'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
/** Comments blanked before any ABSENCE check: a note about a removal would otherwise satisfy the check that it was removed. */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

/** A quiet afternoon with nothing live. Every case below moves ONE fact off this. */
const QUIET: MomentFacts = {
  localHour: 12, awaitingFeel: false, plannedToday: false, loggedToday: false,
  missedYesterday: false, daysSinceAnyLog: 0, streakDays: 0,
  blockJustEnded: false, beatTargetPending: false,
}

console.log('\n1. Silence is the default, and it is easy to reach')
{
  check('a day with nothing happening says nothing', momentToRaise(QUIET) === null, momentToRaise(QUIET))
  check('...and nothing is live on it', liveMoments(QUIET).length === 0, liveMoments(QUIET))
  // THE ONE RULE HERE THAT IS NOT ABOUT COACHING. A notification outside
  // waking hours is not accountability, it is a bad night's sleep.
  const loud: MomentFacts = { ...QUIET, awaitingFeel: true }
  check('a live moment does speak in the day', momentToRaise({ ...loud, localHour: 12 })?.key === 'session_feel')
  check('...but never before the morning',
    momentToRaise({ ...loud, localHour: QUIET_BEFORE_HOUR - 1 }) === null)
  check('...nor after the evening',
    momentToRaise({ ...loud, localHour: QUIET_AFTER_HOUR + 1 }) === null)
  check('...and the boundary hours themselves are allowed',
    momentToRaise({ ...loud, localHour: QUIET_BEFORE_HOUR }) !== null
    && momentToRaise({ ...loud, localHour: QUIET_AFTER_HOUR }) !== null)
  // 3am is the case everyone pictures; pinned separately so a later change to
  // the window cannot quietly re-open it.
  check('...so 3am is silent whatever is going on', momentToRaise({
    ...QUIET, localHour: 3, awaitingFeel: true, missedYesterday: true,
    plannedToday: true, daysSinceAnyLog: 30, blockJustEnded: true, beatTargetPending: true,
  }) === null)
}

console.log('\n2. At most ONE thing, ever')
{
  // Three buzzes in a row is how a person learns to swipe without reading,
  // and the two that mattered go with the one that did not.
  const everything: MomentFacts = {
    localHour: 19, awaitingFeel: true, plannedToday: true, loggedToday: false,
    missedYesterday: true, daysSinceAnyLog: 30, streakDays: 9,
    blockJustEnded: true, beatTargetPending: true,
  }
  check('every moment really is live on this day', liveMoments(everything).length === MOMENT_KEYS.length,
    liveMoments(everything))
  const got = momentToRaise(everything)
  check('...and exactly one is raised', !!got && MOMENT_KEYS.includes(got.key), got)
  // ORDER IS THE BEHAVIOUR, so it is pinned by name rather than by index: the
  // finished session nobody has asked about outranks everything, because it is
  // the signal that goes stale fastest.
  check('...the one that goes stale fastest', got?.key === 'session_feel', got)
  check('...and the order is a declared list, not an accident of the switch',
    MOMENT_KEYS[0] === 'session_feel' && MOMENT_KEYS.indexOf('week_gone_quiet') > MOMENT_KEYS.indexOf('missed_yesterday'),
    [...MOMENT_KEYS])
}

console.log('\n3. Each moment fires on its own fact, and only on it')
{
  const cases: [MomentKey, Partial<MomentFacts>][] = [
    ['session_feel', { awaitingFeel: true }],
    ['session_not_logged', { plannedToday: true, localHour: 19 }],
    ['missed_yesterday', { missedYesterday: true }],
    ['week_gone_quiet', { daysSinceAnyLog: QUIET_WEEK_DAYS }],
    ['streak_at_risk', { streakDays: 5, plannedToday: true, localHour: 19 }],
    ['block_review', { blockJustEnded: true }],
    ['beat_target', { beatTargetPending: true }],
  ]
  for (const [key, patch] of cases) {
    const live = liveMoments({ ...QUIET, ...patch })
    check(`${key} goes live on its own fact`, live.includes(key), live)
  }
  // EVERY KEY COVERED, derived rather than counted by hand — a new moment
  // added to MOMENT_KEYS and forgotten here fails this line.
  check('...and every declared moment was exercised',
    MOMENT_KEYS.every(k => cases.some(([c]) => c === k)), MOMENT_KEYS.filter(k => !cases.some(([c]) => c === k)))
}

console.log('\n4. The two that wait for the evening, because a morning nag is about nothing')
{
  const trainingDay: MomentFacts = { ...QUIET, plannedToday: true, streakDays: 5 }
  check('a session unlogged at 9am says nothing',
    liveMoments({ ...trainingDay, localHour: 9 }).length === 0,
    liveMoments({ ...trainingDay, localHour: 9 }))
  check('...and at the evening it does',
    liveMoments({ ...trainingDay, localHour: NOT_LOGGED_AFTER_HOUR }).includes('session_not_logged'))
  check('...and a logged session never does, however late',
    !liveMoments({ ...trainingDay, localHour: 22, loggedToday: true }).includes('session_not_logged'))
  // A STREAK ONLY COUNTS ONCE THERE IS ONE. Telling somebody on day zero that
  // their streak is at risk is the app inventing a stake they never had.
  check('a streak of nothing is never "at risk"',
    !liveMoments({ ...QUIET, localHour: 19, plannedToday: true, streakDays: 0 }).includes('streak_at_risk'))
  check('...nor is a streak of two',
    !liveMoments({ ...QUIET, localHour: 19, plannedToday: true, streakDays: 2 }).includes('streak_at_risk'))
  check('...while a real one is',
    liveMoments({ ...QUIET, localHour: 19, plannedToday: true, streakDays: 3 }).includes('streak_at_risk'))
}

console.log('\n5. A quiet week is days, not a guess, and "never logged" is not a quiet week')
{
  check(`${QUIET_WEEK_DAYS - 1} days is not yet a quiet week`,
    !liveMoments({ ...QUIET, daysSinceAnyLog: QUIET_WEEK_DAYS - 1 }).includes('week_gone_quiet'))
  check(`${QUIET_WEEK_DAYS} days is`,
    liveMoments({ ...QUIET, daysSinceAnyLog: QUIET_WEEK_DAYS }).includes('week_gone_quiet'))
  // NULL IS NOT A BIG NUMBER. Someone who has never logged anything has not
  // "gone quiet" — they have not started, which is a different conversation
  // and not one to open by telling them off.
  check('somebody who has never logged is not told their week went quiet',
    !liveMoments({ ...QUIET, daysSinceAnyLog: null }).includes('week_gone_quiet'))
}

console.log('\n6. The switches turn things OFF, and absent means on')
{
  const live: MomentFacts = { ...QUIET, awaitingFeel: true, missedYesterday: true }
  check('with nothing stored, it still speaks', momentToRaise(live, {})?.key === 'session_feel')
  check('...switching that one off falls through to the next',
    momentToRaise(live, { session_feel: false })?.key === 'missed_yesterday')
  check('...switching both off says nothing at all',
    momentToRaise(live, { session_feel: false, missed_yesterday: false }) === null)
  check('...and an explicit ON is the same as absent',
    momentToRaise(live, { session_feel: true })?.key === 'session_feel')
  // ASHLEY'S RULING, as a check: all of them, on to begin with.
  check('every moment is on by default',
    MOMENT_KEYS.every(k => DEFAULT_MOMENT_SWITCHES[k] === true), DEFAULT_MOMENT_SWITCHES)
  check('...and the defaults cover every moment, derived not listed',
    Object.keys(DEFAULT_MOMENT_SWITCHES).length === MOMENT_KEYS.length)
  // A MASTER OFF IS EVERY SWITCH OFF, not a separate rule to keep in step.
  const allOff = Object.fromEntries(MOMENT_KEYS.map(k => [k, false]))
  check('turning everything off is silent on the loudest possible day', momentToRaise({
    localHour: 19, awaitingFeel: true, plannedToday: true, loggedToday: false,
    missedYesterday: true, daysSinceAnyLog: 30, streakDays: 9,
    blockJustEnded: true, beatTargetPending: true,
  }, allOff) === null)
}

console.log('\n7. Every word comes from the phrasebook')
{
  const src = strip(read('src/lib/coach-moments.ts'))
  // A NOTIFICATION IS THE COACH SPEAKING. A second place to write its words is
  // a second voice, and the half that drifts is the half nobody re-reads.
  check('the decider writes no sentences of its own',
    !/return\s*[`'"][a-z]/i.test(src.replace(/notification\(/g, '')), src.match(/return\s*[`'"][a-z][^`'"]*/gi)?.slice(0, 3))
  check('...it asks the phrasebook', /notification\(/.test(src))
  check('every moment has words', MOMENT_KEYS.every(k => notification(k).length > 0),
    MOMENT_KEYS.filter(k => !notification(k)))
  check('...and they all differ', new Set(MOMENT_KEYS.map(k => notification(k))).size === MOMENT_KEYS.length)
  // PROVING THAT DETECTOR: an unknown key must come back empty rather than
  // with something generic, so a new moment cannot ship in words nobody wrote.
  check('...while an unknown moment has none', notification('not_a_moment') === '')
  check('the streak line is the only one carrying a number',
    /\b9\b/.test(notification('streak_at_risk', 9))
    && MOMENT_KEYS.filter(k => k !== 'streak_at_risk').every(k => !/\d/.test(notification(k, 9))),
    MOMENT_KEYS.map(k => notification(k, 9)))
  // The house voice, applied to a surface that arrives uninvited.
  check('...and none of them shouts', MOMENT_KEYS.every(k => !notification(k).includes('!')))
}

console.log('\n8. It is pure, so a server can ask it too')
{
  const src = strip(read('src/lib/coach-moments.ts'))
  // THE WHOLE POINT OF THE MODULE. A decision that reads a store, a clock or a
  // screen is one only the browser can make — and the browser is exactly where
  // the coach already can speak.
  check('it reads no clock of its own', !/Date\.now\(|new Date\(/.test(src), src.match(/new Date\([^)]*\)/g))
  check('...no database', !/supabase/i.test(src))
  check('...no browser', !/localStorage|window\.|document\./.test(src))
  check('...and imports only the phrasebook',
    [...src.matchAll(/^import .*?from '([^']+)'/gm)].every(m => m[1] === './coach-voice'),
    [...src.matchAll(/^import .*?from '([^']+)'/gm)].map(m => m[1]))
  // The same facts twice give the same answer — pinned by running it, because
  // a source check cannot see a hidden clock read inside a helper.
  const f: MomentFacts = { ...QUIET, localHour: 19, plannedToday: true }
  check('the same day answers the same way twice',
    JSON.stringify(momentToRaise(f)) === JSON.stringify(momentToRaise(f)))
}

console.log(failures === 0 ? '\nOne decision, and a server could make it too.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
