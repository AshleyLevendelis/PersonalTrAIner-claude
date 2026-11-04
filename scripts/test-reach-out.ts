/**
 * THE COACH REACHING SOMEONE WHOSE APP IS SHUT — driven end to end, with fakes,
 * before its first real run.
 *
 * Slice 3 of docs/plans/the-coach-can-reach-you.md, built 24 Sep 2026 on
 * Ashley's "implement all the chat fixes". CLAUDE.md: a script whose first real
 * run costs something gets a mocked end-to-end gate BEFORE it runs. This one's
 * first real run is a buzz on her phone. So the exact loop the edge function
 * runs (supabase/functions/_shared/reach-out.ts) is driven here with a fake
 * clock, a fake database and a fake push service.
 *
 * WHAT IT CANNOT PROVE, and says so: that a notification arrives on a phone,
 * that the scheduler fires hourly and not twice, that the push library's
 * encryption is accepted by Apple and Google. Those are a real device, in the
 * handover prompt.
 */

import {
  runReachOut, factsFor, isPlanned, mayNotify, dayAllows, tapTarget, localParts, weekdayOf, addDays,
  type ReachOutDeps, type PushSubscriptionRow, type MomentFactsRow, type LiveFacts, type SentRecord,
} from '../supabase/functions/_shared/reach-out'
import * as server from '../supabase/functions/_shared/coach-moments'
import * as app from '../src/lib/coach-moments'
import { notification as appNotification } from '../src/lib/coach-voice'

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const NONE: LiveFacts = { activityDates: [], marks: {}, movedInto: [], unratedRecentSession: false, beatTargetOffered: false }
const TODAY = '2026-09-23' // a Wednesday
const MWF: MomentFactsRow = { training_weekdays: ['Monday', 'Wednesday', 'Friday'], plan_ends_on: '2026-12-01' }

async function main() {
  console.log('\n1. Her clock, not the server\'s')
  // 23 Sep 2026 18:30 UTC. London is BST (+1): 19:30 the same day. Auckland is
  // NZST (+12): 06:30 the NEXT day. A server reading its own clock gets both wrong.
  const now = new Date('2026-09-23T18:30:00Z')
  const lon = localParts(now, 'Europe/London')
  const akl = localParts(now, 'Pacific/Auckland')
  check('London reads 19:00 on the 23rd', lon.date === '2026-09-23' && lon.hour === 19, lon)
  check('Auckland reads 06:00 on the 24th — a different day entirely', akl.date === '2026-09-24' && akl.hour === 6, akl)
  check('an unknown zone falls back to UTC rather than throwing', JSON.stringify(localParts(now, 'Not/AZone')) === JSON.stringify({ date: '2026-09-23', hour: 18 }), localParts(now, 'Not/AZone'))
  check('weekdays are read off the date itself', weekdayOf('2026-09-23') === 'Wednesday' && weekdayOf('2026-09-27') === 'Sunday')

  console.log('\n2. Is today owed — the pattern, then her own changes')
  check('a pattern day is planned', isPlanned(TODAY, MWF, NONE) === true)
  check('a non-pattern day is not', isPlanned('2026-09-24', MWF, NONE) === false)
  check('...unless a session was moved onto it', isPlanned('2026-09-24', MWF, { ...NONE, movedInto: ['2026-09-24'] }) === true)
  check('a day made a rest day is not owed', isPlanned(TODAY, MWF, { ...NONE, marks: { [TODAY]: { rest: true } } }) === false)
  check('...nor one moved away, nor one swapped for something else',
    isPlanned(TODAY, MWF, { ...NONE, marks: { [TODAY]: { movedAway: true } } }) === false
      && isPlanned(TODAY, MWF, { ...NONE, marks: { [TODAY]: { swapped: true } } }) === false)
  check('nothing is owed after the plan ends', isPlanned('2026-12-02', MWF, NONE) === false && isPlanned('2026-11-30', MWF, NONE) === true)
  check('no row at all means nothing is planned — never a guess', isPlanned(TODAY, null, NONE) === false)

  console.log('\n3. The facts, each bounded so a stale one cannot nag for ever')
  const base = factsFor(MWF, NONE, TODAY, 19)
  check('a training day with nothing logged', base.plannedToday && !base.loggedToday, base)
  check('never logged anything is "no quiet week", not a quiet week', base.daysSinceAnyLog === null, base.daysSinceAnyLog)
  check('logged today', factsFor(MWF, { ...NONE, activityDates: [TODAY] }, TODAY, 19).loggedToday === true)
  check('eight days since the last log', factsFor(MWF, { ...NONE, activityDates: ['2026-09-15'] }, TODAY, 12).daysSinceAnyLog === 8)
  // Yesterday (Tue) is not a pattern day for MWF, so use a Monday-today case.
  const MON = '2026-09-22'
  const tueRow: MomentFactsRow = { training_weekdays: ['Monday', 'Tuesday'], plan_ends_on: '2026-12-01' }
  check('yesterday planned and nothing logged is a miss', factsFor(tueRow, NONE, TODAY, 12).missedYesterday === true)
  check('...but not once she has said she missed it', factsFor(tueRow, { ...NONE, marks: { [MON]: {}, [addDays(TODAY, -1)]: { missed: true } } }, TODAY, 12).missedYesterday === false)
  check('...nor if she logged it', factsFor(tueRow, { ...NONE, activityDates: [addDays(TODAY, -1)] }, TODAY, 12).missedYesterday === false)
  check('a streak Home counted yesterday is trusted', factsFor({ ...MWF, streak_days: 5, streak_as_of: '2026-09-22' }, NONE, TODAY, 19).streakDays === 5)
  check('...one counted three days ago is not — it may already be broken', factsFor({ ...MWF, streak_days: 5, streak_as_of: '2026-09-20' }, NONE, TODAY, 19).streakDays === 0)
  check('a block that ended two days ago has just ended', factsFor({ ...MWF, block_ends_on: '2026-09-21' }, NONE, TODAY, 12).blockJustEnded === true)
  check('...one that ended a week ago has not', factsFor({ ...MWF, block_ends_on: '2026-09-16' }, NONE, TODAY, 12).blockJustEnded === false)
  check('...and one still to come has not', factsFor({ ...MWF, block_ends_on: '2026-09-25' }, NONE, TODAY, 12).blockJustEnded === false)
  // FOOD (4 Nov 2026), carried from the live read and the sent-ahead target.
  const fed = factsFor({ ...MWF, protein_target_g: 160 }, { ...NONE, mealsAccountedToday: 2, proteinEatenToday: 90, mealLoggedRecently: true }, TODAY, 19)
  check('the meal count, protein eaten, the target and "logs meals" all reach the decision',
    fed.mealsAccountedToday === 2 && fed.proteinEatenToday === 90 && fed.proteinTargetG === 160 && fed.logsMeals === true, fed)
  const unfed = factsFor(MWF, NONE, TODAY, 19)
  check('...and a read with no food in it reads as nothing known, never as a target of something',
    unfed.mealsAccountedToday === 0 && unfed.proteinTargetG === 0 && unfed.logsMeals === false, unfed)

  console.log('\n4. How often — up to three a day, three hours apart (her ruling, 4 Nov 2026)')
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 23, h, m))
  const sentAt = (moment: SentRecord['moment'], h: number, on = TODAY): SentRecord => ({ moment, sent_on: on, sent_at: at(h).toISOString() })
  check('nothing sent yet: ok', dayAllows([], TODAY, at(12)) === 'ok' && mayNotify([], TODAY, 'session_not_logged') === 'ok')
  check('one sent two hours ago: too soon', dayAllows([sentAt('workout_today', 10)], TODAY, at(12)) === 'too_soon')
  check('...two hours fifty-nine: still too soon', dayAllows([sentAt('workout_today', 9)], TODAY, at(11, 59)) === 'too_soon')
  check('...three hours: ok, a second one may go', dayAllows([sentAt('workout_today', 9)], TODAY, at(12)) === 'ok')
  check('two sent, the last long enough ago: a third may go', dayAllows([sentAt('workout_today', 8), sentAt('session_feel', 12)], TODAY, at(17)) === 'ok')
  check('three sent: the day is full, however long ago',
    dayAllows([sentAt('workout_today', 7), sentAt('session_feel', 10), sentAt('block_review', 13)], TODAY, at(20)) === 'day_full')
  check('the gap holds across midnight too', dayAllows([sentAt('meal_not_logged', 23, '2026-09-22')], TODAY, new Date(Date.UTC(2026, 8, 24, 1))) === 'too_soon')
  check('a record with no time counts as just now (hold back, never guess)', dayAllows([{ moment: 'block_review', sent_on: TODAY }], TODAY, at(20)) === 'too_soon')
  check('the same moment already today: not again', mayNotify([sentAt('session_not_logged', 8)], TODAY, 'session_not_logged') === 'said_today')
  check('...a different one today: ok', mayNotify([sentAt('workout_today', 8)], TODAY, 'session_not_logged') === 'ok')
  check('the same moment yesterday: no', mayNotify([{ moment: 'missed_yesterday', sent_on: '2026-09-22' }], TODAY, 'missed_yesterday') === 'same_as_yesterday')
  check('a different moment yesterday: ok', mayNotify([{ moment: 'missed_yesterday', sent_on: '2026-09-22' }], TODAY, 'session_not_logged') === 'ok')
  check('...but the training-day reminder comes every training day, yesterday\'s or not',
    mayNotify([{ moment: 'workout_today', sent_on: '2026-09-22' }], TODAY, 'workout_today') === 'ok')
  check('a tap opens the right tab: the session, Nutrition, or the chat',
    tapTarget('workout_today') === '/#/tab/exercise' && tapTarget('meal_not_logged') === '/#/tab/nutrition'
    && tapTarget('protein_short') === '/#/tab/nutrition' && tapTarget('session_feel') === '/#/tab/chat',
    app.MOMENT_KEYS.map(k => tapTarget(k)))

  console.log('\n5. The whole run, against a fake world')
  type Person = { sub: PushSubscriptionRow[]; row: MomentFactsRow | null; live: LiveFacts; switches?: Record<string, boolean>; throws?: boolean }
  const sub = (id: string, user: string, tz = 'Europe/London'): PushSubscriptionRow => ({ id, user_id: user, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a', timezone: tz })
  const people: Record<string, Person> = {
    due: { sub: [sub('s1', 'due')], row: MWF, live: NONE },
    asleep: { sub: [sub('s2', 'asleep', 'Pacific/Auckland')], row: MWF, live: NONE },
    goneDevice: { sub: [sub('s3', 'goneDevice'), sub('s3b', 'goneDevice')], row: MWF, live: NONE },
    switchedOff: { sub: [sub('s4', 'switchedOff')], row: { ...MWF, streak_days: 4, streak_as_of: '2026-09-22' }, live: NONE, switches: { session_not_logged: false } },
    movedAway: { sub: [sub('s5', 'movedAway')], row: MWF, live: { ...NONE, marks: { [TODAY]: { movedAway: true } } } },
    broken: { sub: [sub('s6', 'broken')], row: MWF, live: NONE, throws: true },
    allFail: { sub: [sub('s7', 'allFail')], row: MWF, live: NONE },
    raced: { sub: [sub('s8', 'raced')], row: MWF, live: NONE },
  }
  const sent: { sub: string; body: string; moment: string }[] = []
  const recorded: Record<string, SentRecord[]> = {}
  const dropped: string[] = []
  const deps = (at: Date): ReachOutDeps => ({
    now: at,
    listSubscriptions: async () => Object.values(people).flatMap(p => p.sub),
    loadFactsRow: async u => people[u].row,
    loadSwitches: async u => people[u].switches ?? {},
    loadLive: async u => { if (people[u].throws) throw new Error('read failed'); return people[u].live },
    loadRecentSends: async u => [...(recorded[u] ?? [])].reverse(),
    send: async (s, payload) => {
      if (s.id === 's3') return 'gone'
      if (s.id === 's7') return 'failed'
      sent.push({ sub: s.id, body: payload.body, moment: payload.moment }); return 'ok'
    },
    // 'raced' is another run that got there first: the reservation is refused.
    recordSent: async (u, date, moment) => {
      if (u === 'raced') return false
      ;(recorded[u] ??= []).push({ moment, sent_on: date, sent_at: at.toISOString() }); return true
    },
    unrecordSent: async (u, date, moment) => {
      recorded[u] = (recorded[u] ?? []).filter(r => !(r.sent_on === date && r.moment === moment))
      if (recorded[u].length === 0) delete recorded[u]
    },
    dropSubscription: async id => { dropped.push(id) },
  })
  // A RUN THAT THROWS IS A FAILED CHECK, NOT A CRASHED GATE: the whole point of
  // one of these checks is that it must not throw, and a gate that dies there
  // prints fewer checks than it has (CLAUDE.md: the count is constant).
  const safeRun = async (d: ReachOutDeps) => {
    try { return { ...(await runReachOut(d)), threw: null as string | null } }
    catch (err) { return { people: 0, sent: 0, quiet: 0, alreadyToday: 0, failed: 0, dropped: 0, threw: String(err) } }
  }
  const report = await safeRun(deps(new Date('2026-09-23T18:30:00Z')))
  const to = (id: string) => sent.filter(x => x.sub === id)
  check('the run itself never throws, whatever one person\'s data does', report.threw === null, report.threw)
  check('it looked at every person with a device', report.people === 8, report)
  check('a training day at 19:00 with nothing logged gets the evening nudge, in the phrasebook\'s words',
    to('s1').length === 1 && to('s1')[0].moment === 'session_not_logged' && to('s1')[0].body === appNotification('session_not_logged'), to('s1'))
  check('...and it is recorded, so it is not said again today', recorded.due?.length === 1 && recorded.due[0].sent_on === TODAY, recorded.due)
  check('06:00 in Auckland is quiet hours — nothing sent', to('s2').length === 0 && !recorded.asleep, to('s2'))
  check('a device that has gone is dropped, and the person\'s other device still gets it',
    dropped.includes('s3') && to('s3b').length === 1 && !dropped.includes('s3b'), { dropped, s3b: to('s3b') })
  check('a switched-off moment is not sent — and a different live one still can be',
    to('s4').length === 1 && to('s4')[0].moment === 'streak_at_risk', to('s4'))
  check('a session she moved away is not nagged about on the day it left', to('s5').length === 0, to('s5'))
  check('one person whose read fails does not stop the rest of the run', report.failed >= 1 && to('s1').length === 1, report)
  check('a send that failed everywhere is not recorded as said — next hour tries again', !recorded.allFail, recorded.allFail)
  check('a reservation the database refused sends nothing (another run got there first)', to('s8').length === 0, to('s8'))

  const again = await safeRun(deps(new Date('2026-09-23T19:30:00Z')))
  check('the next hour, nobody who heard an hour ago hears again (three hours apart)',
    to('s1').length === 1 && to('s3b').length === 1 && to('s4').length === 1 && again.alreadyToday >= 3, { again, s1: to('s1').length })
  check('...and the one whose send failed is tried again', again.failed >= 1 && !recorded.allFail)

  console.log('\n5b. One person, one whole day: three at most, spaced, each the next thing worth saying')
  {
    // A training day for someone who logs meals and has logged none today.
    const me: Person = { sub: [sub('d1', 'me')], row: { ...MWF, protein_target_g: 160 }, live: { ...NONE, mealLoggedRecently: true, mealsAccountedToday: 0 } }
    const rec: SentRecord[] = []
    const got: string[] = []
    const dayDeps = (when: Date): ReachOutDeps => ({
      now: when,
      listSubscriptions: async () => me.sub,
      loadFactsRow: async () => me.row,
      loadSwitches: async () => ({}),
      loadLive: async () => me.live,
      loadRecentSends: async () => [...rec].reverse(),
      send: async (_s, payload) => { got.push(`${when.toISOString().slice(11, 16)} ${payload.moment} ${payload.url}`); return 'ok' },
      recordSent: async (_u, date, moment) => { rec.push({ moment, sent_on: date, sent_at: when.toISOString() }); return true },
      unrecordSent: async () => {},
      dropSubscription: async () => {},
    })
    // Every hour of a London day, 23 Sep (BST): 07:00Z is 8am there, 20:00Z is 9pm.
    for (let h = 0; h < 24; h++) await safeRun(dayDeps(new Date(Date.UTC(2026, 8, 23, h, 5))))
    check(`no more than ${server.MAX_NOTIFICATIONS_PER_DAY} in the day`, got.length === server.MAX_NOTIFICATIONS_PER_DAY, got)
    check('the morning reminder first, at 8am, opening the session', got[0] === '07:05 workout_today /#/tab/exercise', got)
    check('then the evening nudge at 6pm, opening the chat', got[1] === '17:05 session_not_logged /#/tab/chat', got)
    check('then the meal nudge three hours later, opening Nutrition — not at 7pm, too close to 6pm',
      got[2] === '20:05 meal_not_logged /#/tab/nutrition', got)
    const gaps = rec.slice(1).map((r, i) => (Date.parse(r.sent_at!) - Date.parse(rec[i].sent_at!)) / 3_600_000)
    check('...every gap at least three hours', gaps.every(g => g >= server.MIN_HOURS_BETWEEN), gaps)
  }

  console.log('\n6. The server\'s copy of the decision is the app\'s, answer for answer')
  // EVERY combination of the eight booleans, at hours either side of every
  // threshold, with every single switch off in turn. Words included.
  const hours = [7, 8, 12, 17, 18, 21, 22]
  const switchSets: Record<string, boolean>[] = [{}, ...app.MOMENT_KEYS.map(k => ({ [k]: false }))]
  let compared = 0
  const disagreements: unknown[] = []
  for (let bits = 0; bits < 256; bits++) {
    for (const localHour of hours) {
      for (const days of [null, 3, 7]) {
        const f: app.MomentFacts = {
          localHour,
          awaitingFeel: !!(bits & 1), plannedToday: !!(bits & 2), loggedToday: !!(bits & 4),
          missedYesterday: !!(bits & 8), daysSinceAnyLog: days, streakDays: bits & 16 ? 5 : 1,
          blockJustEnded: !!(bits & 32), beatTargetPending: !!(bits & 64),
        }
        for (const sw of switchSets) {
          compared++
          const a = app.momentToRaise(f, sw)
          const b = server.momentToRaise(f, sw)
          if (JSON.stringify(a) !== JSON.stringify(b)) disagreements.push({ f, sw, app: a, server: b })
        }
      }
    }
  }
  check(`the two copies agree on all ${compared} cases`, compared > 40_000 && disagreements.length === 0, disagreements.slice(0, 2))
  // THE FOOD FACTS AND THE MORNING WINDOW, the same way: every combination
  // that moves an answer, with the full best-first list compared, not only its head.
  let foodCompared = 0
  const foodDisagreements: unknown[] = []
  for (const localHour of [7, 8, 11, 12, 18, 19, 21, 22]) {
    for (const meals of [0, 1, 2, 3]) {
      for (const logsMeals of [false, true]) {
        for (const [target, eaten] of [[0, 0], [160, 100], [160, 127], [160, 129], [60, 45], [60, 35]]) {
          for (const bits of [0, 2, 6, 3]) {
            for (const sw of [{}, { workout_today: false }, { meal_not_logged: false }, { protein_short: false }]) {
              const f: app.MomentFacts = {
                localHour, awaitingFeel: !!(bits & 1), plannedToday: !!(bits & 2), loggedToday: !!(bits & 4),
                missedYesterday: false, daysSinceAnyLog: 1, streakDays: 0, blockJustEnded: false, beatTargetPending: false,
                mealsAccountedToday: meals, logsMeals, proteinTargetG: target, proteinEatenToday: eaten,
              }
              foodCompared++
              const a = JSON.stringify(app.momentsToRaise(f, sw)), b = JSON.stringify(server.momentsToRaise(f, sw))
              if (a !== b) foodDisagreements.push({ f, sw, app: a, server: b })
            }
          }
        }
      }
    }
  }
  check(`...and on all ${foodCompared} food and morning cases, the whole list`, foodCompared > 6_000 && foodDisagreements.length === 0, foodDisagreements.slice(0, 2))
  check('...and on the thresholds they share', app.QUIET_BEFORE_HOUR === server.QUIET_BEFORE_HOUR && app.QUIET_AFTER_HOUR === server.QUIET_AFTER_HOUR
    && app.NOT_LOGGED_AFTER_HOUR === server.NOT_LOGGED_AFTER_HOUR && app.QUIET_WEEK_DAYS === server.QUIET_WEEK_DAYS
    && app.WORKOUT_REMINDER_BEFORE_HOUR === server.WORKOUT_REMINDER_BEFORE_HOUR && app.FOOD_NUDGE_AFTER_HOUR === server.FOOD_NUDGE_AFTER_HOUR
    && app.PROTEIN_SHORT_SHARE === server.PROTEIN_SHORT_SHARE && app.PROTEIN_SHORT_MIN_G === server.PROTEIN_SHORT_MIN_G
    && app.MAX_NOTIFICATIONS_PER_DAY === server.MAX_NOTIFICATIONS_PER_DAY && app.MIN_HOURS_BETWEEN === server.MIN_HOURS_BETWEEN
    && JSON.stringify(app.MOMENT_KEYS) === JSON.stringify(server.MOMENT_KEYS))
  check('...and every sentence is the phrasebook\'s', app.MOMENT_KEYS.every(k => [0, 1].every(m => server.notification(k, 4, m) === appNotification(k, 4, m))))

  console.log('\n7. The phone\'s half: what the service worker does with a push')
  {
    // public/sw.js is plain JS run by the browser. It is run HERE with a fake
    // `self`, so the push and tap handlers are exercised, not read.
    const { readFileSync } = await import('fs')
    const src = readFileSync('public/sw.js', 'utf8')
    const handlers: Record<string, (e: unknown) => void> = {}
    const shown: { title: string; opts: Record<string, unknown> }[] = []
    const opened: string[] = []
    const focused: string[] = []
    let windows: { url: string; focus: () => Promise<void>; navigate: (u: string) => Promise<void> }[] = []
    const fakeSelf = {
      addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn },
      registration: { showNotification: async (title: string, opts: Record<string, unknown>) => { shown.push({ title, opts }) } },
      clients: {
        matchAll: async () => windows,
        openWindow: async (u: string) => { opened.push(u) },
        claim: async () => {},
      },
      location: { origin: 'https://app.example' },
      skipWaiting: () => {},
    }
    new Function('self', 'caches', src)(fakeSelf, {})
    const fire = async (type: string, event: Record<string, unknown>) => {
      const waits: Promise<unknown>[] = []
      handlers[type]?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) })
      await Promise.all(waits)
    }
    check('the worker listens for pushes and taps', typeof handlers.push === 'function' && typeof handlers.notificationclick === 'function', Object.keys(handlers))
    await fire('push', { data: { json: () => ({ title: 'Your coach', body: appNotification('missed_yesterday'), moment: 'missed_yesterday' }) } })
    check('a push shows the coach\'s words, under one shared tag so a new one replaces an unread one',
      shown.length === 1 && shown[0].opts.body === appNotification('missed_yesterday') && shown[0].opts.tag === 'coach', shown)
    check('...and carries where a tap should go: the chat', (shown[0]?.opts.data as { url?: string })?.url === '/#/tab/chat', shown[0]?.opts.data)
    await fire('push', { data: { json: () => ({ title: 'Your coach', body: 'x', moment: 'meal_not_logged', url: '/#/tab/nutrition' }) } })
    check('...or the tab the server names (a food nudge opens Nutrition)', (shown[1]?.opts.data as { url?: string })?.url === '/#/tab/nutrition', shown[1]?.opts.data)
    await fire('push', { data: { json: () => ({ title: 'Your coach', body: 'x', moment: 'x', url: 'https://elsewhere.example/#/tab/chat' }) } })
    check('...but never anywhere outside the app: a link out falls back to the chat', (shown[2]?.opts.data as { url?: string })?.url === '/#/tab/chat', shown[2]?.opts.data)
    shown.splice(1)
    await fire('push', { data: { json: () => ({ title: 'x', body: '' }) } })
    await fire('push', { data: null })
    check('a push with no words shows nothing', shown.length === 1, shown.length)
    const note = { close: () => {}, data: { url: '/#/tab/chat' } }
    await fire('notificationclick', { notification: note })
    check('a tap with the app shut opens it at the chat', opened.length === 1 && opened[0] === '/#/tab/chat', opened)
    windows = [{ url: 'https://app.example/#/tab/dashboard', focus: async () => { focused.push('w') }, navigate: async (u: string) => { focused.push(u) } }]
    await fire('notificationclick', { notification: note })
    check('...and with it open, brings that window forward and takes it to the chat rather than opening a second',
      opened.length === 1 && focused.join(',') === 'w,/#/tab/chat', { opened, focused })
  }

  console.log('\n8. The app\'s half: the facts it sends ahead, and when')
  {
    const { momentFactsFrom, sendFactsAhead } = await import('../src/lib/moment-facts')
    const { loadSwitches } = await import('../src/lib/coach-reach-out')
    const { setSupabaseClient } = await import('../src/lib/supabase')
    type W = import('../src/lib/types').WorkoutDay
    type M = import('../src/lib/types').MesocycleWeek
    const day = (name: string, n: number): W => ({ day: name, focus: 'x', exercises: Array.from({ length: n }, () => ({ name: 'e' })) } as unknown as W)
    const plan = [day('Monday', 4), day('Tuesday', 0), day('Wednesday', 4), day('Friday', 3)]
    // Blocks of UNEQUAL length on purpose: a hard-coded four-week block would
    // put the end in the wrong week on this plan, and that is the mistake the
    // derivation exists to avoid.
    const meso = [1, 1, 1, 2, 2, 2, 2, 2].map((b, i) => ({ week_number: i + 1, block_number: b, days: [] }) as unknown as M)
    const created = '2026-09-02T09:00:00'
    const f = momentFactsFrom({ exercisePlan: plan, mesocycle: meso, planCreatedAt: created, now: new Date('2026-09-10T12:00:00'), streakDays: 4, today: '2026-09-10' })
    check('the weekday pattern holds only days that train', JSON.stringify(f.trainingWeekdays) === '["Monday","Wednesday","Friday"]', f.trainingWeekdays)
    check('the plan ends the day after its last week', f.planEndsOn === '2026-10-28', f.planEndsOn)
    check('block 1 (three weeks) ends the day after ITS last week, not after a four-week guess', f.blockEndsOn === '2026-09-23', f.blockEndsOn)
    const f2 = momentFactsFrom({ exercisePlan: plan, mesocycle: meso, planCreatedAt: created, now: new Date('2026-09-25T12:00:00'), streakDays: -2, today: '2026-09-25' })
    check('...and once block 2 has started, its end is block 2\'s', f2.blockEndsOn === '2026-10-28', f2.blockEndsOn)
    check('the streak is sent as counted, with the day it was counted on, never below zero', f.streakDays === 4 && f.streakAsOf === '2026-09-10' && f2.streakDays === 0, { f, f2 })
    const noBlocks = momentFactsFrom({ exercisePlan: plan, mesocycle: meso.map(w => ({ ...w, block_number: undefined })), planCreatedAt: created, now: new Date('2026-09-10T12:00:00'), streakDays: 0, today: '2026-09-10' })
    check('a plan with no blocks sends no block end, rather than inventing one', noBlocks.blockEndsOn === null && noBlocks.planEndsOn === '2026-10-28', noBlocks)
    const withTarget = momentFactsFrom({ exercisePlan: plan, mesocycle: meso, planCreatedAt: created, now: new Date('2026-09-10T12:00:00'), streakDays: 0, today: '2026-09-10', proteinTarget: 159.6 })
    check('the protein target goes ahead, in whole grams; none known sends none (never a 0 that reads as a target)',
      withTarget.proteinTargetG === 160 && f.proteinTargetG === null
      && momentFactsFrom({ exercisePlan: plan, mesocycle: meso, planCreatedAt: created, now: new Date('2026-09-10T12:00:00'), streakDays: 0, today: '2026-09-10', proteinTarget: 0 }).proteinTargetG === null,
      { withTarget: withTarget.proteinTargetG, none: f.proteinTargetG })

    // A fake client that records upserts and can be told to fail.
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } }
    const upserts: unknown[] = []
    let nextError: { code?: string; message: string } | null = null
    let profileRow: Record<string, unknown> | null = { id: 'p1' }
    const fake = {
      from: (table: string) => ({
        upsert: async (row: unknown, opts: unknown) => {
          if (nextError) { const e = nextError; nextError = null; return { error: e } }
          upserts.push({ table, row, opts }); return { error: null }
        },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow, error: null }) }) }),
      }),
    }
    setSupabaseClient(fake as never)
    const r1 = await sendFactsAhead('p1', f)
    const r2 = await sendFactsAhead('p1', f)
    check('facts are sent once, and an identical repeat is not sent again', r1 === 'sent' && r2 === 'unchanged' && upserts.length === 1, { r1, r2, n: upserts.length })
    check('...as one row per person, keyed on the person', (upserts[0] as { opts?: { onConflict?: string } })?.opts?.onConflict === 'user_id', upserts[0])
    const r3 = await sendFactsAhead('p1', { ...f, streakDays: 5 })
    check('...and a changed fact IS sent', r3 === 'sent' && upserts.length === 2, { r3, n: upserts.length })
    nextError = { code: 'PGRST205', message: "Could not find the table 'public.coach_moment_facts' in the schema cache" }
    const r4 = await sendFactsAhead('p1', { ...f, streakDays: 6 })
    check('a missing table (migration not pushed) is "not live yet", not an error', r4 === 'not_live_yet', r4)
    nextError = { code: '42501', message: 'new row violates row-level security policy for table "coach_moment_facts"' }
    const r5 = await sendFactsAhead('p1', { ...f, streakDays: 7 })
    check('...but a refusal that merely NAMES the table is a real failure', r5 === 'failed', r5)
    const r6 = await sendFactsAhead('p1', { ...f, streakDays: 7 })
    check('...and a failed send is retried next time, not remembered as sent', r6 === 'sent', r6)
    // BEFORE THE 4 NOV MIGRATION: the protein column is missing. The rest of
    // the facts must still go, without it — a missing column costs the
    // protein nudge, never the streak.
    nextError = { code: 'PGRST204', message: "Could not find the 'protein_target_g' column of 'coach_moment_facts' in the schema cache" }
    const n = upserts.length
    const r7 = await sendFactsAhead('p1', { ...f, streakDays: 8, proteinTargetG: 150 })
    const retried = upserts[n] as { row?: Record<string, unknown> } | undefined
    check('a missing protein column: the facts still go, once, without it',
      r7 === 'sent' && upserts.length === n + 1 && retried?.row?.streak_days === 8 && !('protein_target_g' in (retried?.row ?? {})), { r7, retried })
    const r8 = await sendFactsAhead('p1', { ...f, streakDays: 9, proteinTargetG: 150 })
    check('...and once it lands, the target is sent', r8 === 'sent' && (upserts[upserts.length - 1] as { row?: Record<string, unknown> }).row?.protein_target_g === 150, upserts[upserts.length - 1])

    profileRow = { id: 'p1' }
    const before = await loadSwitches('p1')
    profileRow = { id: 'p1', notification_switches: { missed_yesterday: false } }
    const after = await loadSwitches('p1')
    check('the screen knows the switches are live only when the column exists on the row', before.live === false && after.live === true && after.switches.missed_yesterday === false, { before, after })
  }

  console.log(`\nreach-out: ${ran} checks ran`)
  if (failures > 0) { console.error(`reach-out: ${failures} check(s) FAILED`); process.exit(1) }
  console.log('The coach reaches the right person, at their hour, once, and only with what is true.')
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1) })
