/**
 * Gate: WHAT THE COACH IS TOLD HAPPENED (H23, and the context half of H8 / H22.1).
 *
 * 9 Oct 2026. The tester closed a session at 7 of 9 sets with one exercise
 * untouched and asked the coach what he had done. The app's own header said
 * "ALREADY DONE — finished and logged", and the coach recited the untouched
 * exercise as work. Three more things it was never told: that Tuesday had been
 * swapped for football, that a walk was already prescribed after the lifting,
 * and that yesterday's refused dinner request was closed — so it came back as a
 * dinner card in answer to a question about a workout.
 *
 * All of it is app-authored context built in the frontend
 * (src/lib/chat-plan-context.ts, and ChatAssistant's context builder), which
 * the deployed function interpolates verbatim: no function deploy is needed
 * for any of this to reach the coach.
 *
 * A SEPARATE FILE FROM test:coach-plan-context, ON PURPOSE. That gate
 * generates real plans and takes most of a minute; these checks are pure and
 * run in a second, which is what makes mutation-testing every one of them
 * affordable. Whether the MODEL then reads what it is told is the coach
 * exam's to grade — nothing here can see that.
 */
import { buildCoachExerciseSummary, buildTodayHeader as headerOf, buildTodayByExercise, summariseTodayWork, todayWorkTotals, outcomeOfCard, stampTurnOutcome, stampTurnTime as stampTime } from '../src/lib/chat-plan-context'
import { pendingWindowPassed } from '../src/lib/pending-actions-store'
import type { Exercise } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

async function main() {

// ---------------------------------------------------------------------------
// WHAT THE COACH IS TOLD HAPPENED
//
// 9 Oct 2026. The tester closed a session at 7 of 9 sets with one exercise
// untouched and asked the coach what he had done. The app's own header said
// "ALREADY DONE — finished and logged", and the coach recited the untouched
// exercise as work. Three more things it was never told: that Tuesday had
// been swapped for football, that a walk was already prescribed after the
// lifting, and that yesterday's refused dinner request was closed.
// ---------------------------------------------------------------------------
console.log('\nWhat the coach is told happened\n')
{
  type Today = Parameters<typeof headerOf>[0]
  const build = buildCoachExerciseSummary
  const ex = (id: string, name: string, sets = 3) => ({ id, name, sets, reps: '10-12', rest: '60s' }) as unknown as Exercise
  const session = {
    day: 'Monday', focus: 'Chest & Triceps',
    exercises: [ex('floor-press', 'Dumbbell Floor Press'), ex('pushdown', 'Band Tricep Pushdown'), ex('kickback', 'Band Tricep Kickback')],
    recommendedCardio: { activity: 'Incline Walk', duration: 30, targetRpe: 4, timing: 'post_workout', reason: 'fat loss' },
  } as never
  const row = (exercise_id: string | undefined, exercise_name: string, set_number: number, extra: Record<string, unknown> = {}) =>
    ({ user_id: 'u', date: '2026-10-09', exercise_id, exercise_name, set_number, weight_kg: 20, reps_completed: 12, is_bodyweight: false, ...extra }) as never
  // NINE ROWS IN THE LOG, SIX OF THEM PLANNED WORKING SETS. The old count was
  // `logs.length` against the plan's nine: 9 of 9, "ALREADY DONE".
  const logs = [
    row('floor-press', 'Dumbbell Floor Press', 1), row('floor-press', 'Dumbbell Floor Press', 2), row('floor-press', 'Dumbbell Floor Press', 3),
    row('pushdown', 'Band Tricep Pushdown', 1, { is_warmup: true }),
    row('pushdown', 'Band Tricep Pushdown', 1), row('pushdown', 'Band Tricep Pushdown', 2), row('pushdown', 'Band Tricep Pushdown', 3),
    row('pushdown', 'Band Tricep Pushdown', 3, { drop_index: 1 }),
    row('goblet', 'Goblet Squat', 1, { weight_kg: 16, reps_completed: 10 }),
  ]
  check('(fixture) the raw log is as long as the plan — the count the old header used', logs.length === 9)

  const work = summariseTodayWork({ session, logs, cardioLoggedToday: null })!
  const totals = todayWorkTotals(work)
  check('working sets on planned exercises: 6 of 9, not 9 of 9', totals.logged === 6 && totals.planned === 9, totals)
  check('a warm-up row and a drop are not sets: the pushdown is 3 of 3, not 5', work.exercises[1].setsLogged === 3, work.exercises[1])
  check('the untouched exercise is the one named as not logged', totals.notLogged.map(e => e.name).join() === 'Band Tricep Kickback', totals.notLogged)
  check('an exercise that was not on the plan is "added", not counted toward it', work.added.length === 1 && work.added[0].name === 'Goblet Squat' && work.added[0].setsLogged === 1, work.added)
  const junk = summariseTodayWork({ session, logs: [...logs, row('floor-press', 'Dumbbell Floor Press', 5, { weight_kg: 0, is_bodyweight: false })], cardioLoggedToday: null })!
  check('a planned exercise\'s own unusable row is neither a set nor "added work"', junk.exercises[0].setsLogged === 3 && junk.added.map(a => a.name).join() === 'Goblet Squat', { ex: junk.exercises[0], added: junk.added })
  check('a set logged by NAME only (through the chat) still counts for its exercise',
    summariseTodayWork({ session, logs: [row(undefined, 'Band Tricep Kickback', 1)], cardioLoggedToday: null })!.exercises[2].setsLogged === 1)
  const over = summariseTodayWork({ session, logs: [...logs, row('floor-press', 'Dumbbell Floor Press', 4)], cardioLoggedToday: null })!
  check('a fourth set on a three-set lift does not cover a set missing elsewhere', todayWorkTotals(over).logged === 6, todayWorkTotals(over))
  check('nothing to join is null, not an empty shell', summariseTodayWork({ session: null, logs: [], cardioLoggedToday: null }) === null)

  const closed: Today = {
    dayName: 'Friday', hour: 11, clock: '11:05 AM', focus: 'Chest & Triceps', isGymSession: true,
    setsLogged: logs.length, setsPlanned: 9, finished: true, next: null, work,
  }
  const header = headerOf(closed)
  check('CLOSED AT 6 OF 9 IS NOT "ALREADY DONE"', !/ALREADY DONE/.test(header), header)
  check('...it says how far it got, like for like', /CLOSED the session with 6 of 9 planned sets logged/.test(header), header)
  check('...and names the planned work that is not logged', /NOT LOGGED: Band Tricep Kickback \(0 of 3\)/.test(header), header)
  check('...without calling it skipped (the app has no record; it does not know)', !/skipp/i.test(header), header)
  const movedHeader = headerOf({ ...closed, movedFrom: { dayName: 'Monday' } })
  check('the same on a session moved onto today', !/ALREADY DONE/.test(movedHeader) && /Monday's Chest & Triceps, MOVED TO TODAY/.test(movedHeader) && /6 of 9/.test(movedHeader) && /Band Tricep Kickback \(0 of 3\)/.test(movedHeader), movedHeader)
  check('...and no doubled full stop', !/\.\./.test(movedHeader) && !/\.\./.test(header), movedHeader)

  const allIn = summariseTodayWork({ session, logs: [...logs, row('kickback', 'Band Tricep Kickback', 1), row('kickback', 'Band Tricep Kickback', 2), row('kickback', 'Band Tricep Kickback', 3)], cardioLoggedToday: null })!
  check('a session with EVERY planned set logged is still "ALREADY DONE"', /ALREADY DONE/.test(headerOf({ ...closed, work: allIn })), headerOf({ ...closed, work: allIn }))
  check('part-done, still open, counts working sets too: "6 of 9", never the 9 raw rows',
    /PART-DONE: 6 of 9 sets logged/.test(headerOf({ ...closed, finished: false })), headerOf({ ...closed, finished: false }))

  // The block.
  const block = buildTodayByExercise(closed)
  check('today is listed exercise by exercise', /^TODAY, EXERCISE BY EXERCISE/.test(block) && (block.match(/^- /gm) ?? []).length === 5, block)
  check('...each with logged against planned and the sets themselves', /- Dumbbell Floor Press: 3 of 3 sets logged \(20kg x 12, 20kg x 12, 20kg x 12\)/.test(block), block)
  check('...the unlogged one says NOT LOGGED', /- Band Tricep Kickback: 0 of 3 sets logged — NOT LOGGED/.test(block), block)
  check('...the added one is marked as not on the plan', /Added, not on today's plan — Goblet Squat: 1 set logged \(16kg x 10\)/.test(block), block)
  check('...the finisher is named, with no cardio logged against it', /Finisher on the plan after the lifting: Incline Walk, 30 min at RPE 4\/10 — no cardio logged today/.test(block), block)
  const walked = buildTodayByExercise({ ...closed, work: summariseTodayWork({ session, logs, cardioLoggedToday: 'Walk for 30min at RPE 4' }) })
  check('...and when the walk IS logged, it says so in the cardio history\'s own words', /Incline Walk, 30 min at RPE 4\/10 — cardio logged today: Walk for 30min at RPE 4/.test(walked), walked)
  check('nothing logged and not closed: no block (the header already says NOT LOGGED)',
    buildTodayByExercise({ ...closed, finished: false, work: summariseTodayWork({ session, logs: [], cardioLoggedToday: null }) }) === '')
  check('no join, no block', buildTodayByExercise({ ...closed, work: null }) === '')

  // In the payload, in order, and never on an empty plan.
  const days = [session, { day: 'Tuesday', focus: 'Back & Biceps', exercises: [ex('row', 'Dumbbell Rows')] }] as never
  const summary = build({ days, today: closed })
  check('the block sits between the header and the rows', summary.indexOf('CLOSED the session') < summary.indexOf('TODAY, EXERCISE BY EXERCISE') && summary.indexOf('TODAY, EXERCISE BY EXERCISE') < summary.indexOf('Tuesday'), summary.slice(0, 500))
  check('an empty plan is still exactly \'\' with today\'s work attached (the prompt keys on it)', build({ days: [], today: closed }) === '')

  // The finisher on a lifting day's row.
  check('a lifting day\'s row carries its finisher', /Monday: Chest & Triceps - .*\| then the finisher: Incline Walk, 30 min at RPE 4\/10/.test(build({ days })), build({ days }).split('\n')[0])
  check('...and a day without one is exactly as it was', /^Tuesday: Back & Biceps - Dumbbell Rows \(3x10-12, rest 60s\)$/m.test(build({ days })), build({ days }).split('\n')[1])

  // Day states on the week rows.
  const cell = (dayName: string, date: string, extra: Record<string, unknown> = {}) => ({ date, dayName, session: null, ...extra })
  const back = { day: 'Tuesday', focus: 'Back & Biceps', exercises: [ex('row', 'Dumbbell Rows')] }
  const legs = { day: 'Thursday', focus: 'Legs', exercises: [ex('squat', 'Goblet Squat')] }
  const weekDays = [session, back, legs] as never
  const week = [
    cell('Monday', '2026-10-05', { session, state: 'done' }),
    cell('Tuesday', '2026-10-06', { session: back, state: 'swapped', swappedForActivity: 'Football', swappedLine: 'Football · 60 min · Hard' }),
    cell('Wednesday', '2026-10-07', { state: 'rest' }),
    cell('Thursday', '2026-10-08', { session: legs, state: 'missed', markedMissed: true }),
    cell('Friday', '2026-10-09', { session: legs, state: 'done' }),
    cell('Saturday', '2026-10-10', { session: back, state: 'rest_chosen' }),
    cell('Sunday', '2026-10-11', { session: back, state: 'due' }),
  ] as never
  const rows = build({ days: weekDays, week, today: { ...closed, work: null, finished: false, setsLogged: 0 } })
  const line = (d: string) => rows.split('\n').find(l => l.startsWith(d)) ?? ''
  check('a day swapped for football SAYS so, with what was logged for it',
    /^Tuesday: Back & Biceps \[NOT DONE AS PLANNED — they did Football · 60 min · Hard instead/.test(line('Tuesday')), line('Tuesday'))
  check('...and still lists what the plan had, for reference', /Dumbbell Rows/.test(line('Tuesday')))
  check('a day SAID missed says they said so', /^Thursday: Legs \[MISSED — they said so\]/.test(line('Thursday')), line('Thursday'))
  check('a day that only looks missed does not put words in their mouth',
    /\[NOTHING LOGGED — the day has passed/.test(build({ days: weekDays, week: (week as never as Record<string, unknown>[]).map(c => c.dayName === 'Thursday' ? { ...c, markedMissed: false } : c) as never, today: { ...closed, work: null } }).split('\n').find(l => l.startsWith('Thursday')) ?? ''))
  check('a chosen rest day is not missed', /^Saturday \(tomorrow\): Back & Biceps \[RESTED ON PURPOSE — they said so; not missed/.test(line('Saturday')), line('Saturday'))
  check('a past closed session is "closed, work logged" — not a claim that every set was done', /^Monday: Chest & Triceps \[CLOSED — work was logged that day\]/.test(line('Monday')) && !/\[DONE/.test(rows), line('Monday'))
  check('TODAY\'s row carries no state tag (the header and the block say today exactly)', /^Friday \(TODAY\): Legs - /.test(line('Friday')), line('Friday'))
  check('a day still to come says nothing', /^Sunday: Back & Biceps - /.test(line('Sunday')), line('Sunday'))
  check('a rest day is still a rest day', /^Wednesday: Rest - no session prescribed$/.test(line('Wednesday')), line('Wednesday'))
  check('a row sent with no state is exactly as before', /^Tuesday: Back & Biceps - /.test(build({ days: weekDays, week: [cell('Tuesday', '2026-10-06', { session: back })] as never }).split('\n')[0]))

  // How a request ended.
  check('an applied card reads as closed', /^\[CLOSED: they tapped Apply/.test(stampTurnOutcome('Want me to swap dinner?', outcomeOfCard('done', false))))
  check('a declined card reads as closed, nothing changed', /^\[CLOSED: they declined this — nothing was changed\] Want me/.test(stampTurnOutcome('Want me to swap dinner?', outcomeOfCard('declined', false))))
  check('a timed-out card reads as closed', /^\[CLOSED: this offer timed out unanswered/.test(stampTurnOutcome('Want me to swap dinner?', outcomeOfCard('expired', false))))
  check('...including one nobody has tapped since its ten minutes ran out', outcomeOfCard('pending', true) === 'expired' && outcomeOfCard('pending', false) === 'open')
  check('a live card reads as open', /^\[OPEN: /.test(stampTurnOutcome('Want me to swap dinner?', outcomeOfCard('pending', false))))
  check('a refusal reads as closed', /^\[CLOSED: the app could not do this — nothing was changed\] I couldn't portion/.test(stampTurnOutcome("I couldn't portion that salmon.", 'refused')))
  check('a turn with nothing to say about is untouched', stampTurnOutcome('Morning!', null) === 'Morning!' && stampTurnOutcome('Morning!', undefined) === 'Morning!')
  const yesterday = stampTime(stampTurnOutcome("I couldn't portion that salmon.", 'refused'), '2026-10-08T19:02:00', new Date('2026-10-09T11:00:00'))
  check('yesterday\'s refused request reaches the coach dated AND closed', /^\[said on Thursday evening, [^\]]+\] \[CLOSED: the app could not do this/.test(yesterday), yesterday)
  check('the window is read on the real clock: past is passed, future and unknown are not',
    pendingWindowPassed('2026-10-09T10:00:00Z', Date.parse('2026-10-09T10:00:01Z')) === true
    && pendingWindowPassed('2026-10-09T10:00:00Z', Date.parse('2026-10-09T09:59:59Z')) === false
    && pendingWindowPassed(undefined) === false && pendingWindowPassed('not a date') === false)

  // The wiring, from source (a driver proves it runs: verify:coach-context).
  {
    const { readFileSync } = await import('fs')
    const { join, dirname } = await import('path')
    const { fileURLToPath } = await import('url')
    const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
    const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    check('the app sends today\'s joined work', /work: summariseTodayWork\(\{/.test(chat))
    check('...from the session RUN today and today\'s own logs', /summariseTodayWork\(\{[\s\S]{0,200}?logs: activeSession\.logs/.test(chat))
    check('every assistant turn in the history is stamped with how it ended', /stampTurnTime\(m\.role === 'assistant' \? stampTurnOutcome\(m\.content, turnOutcomeOf\(m\)\)/.test(chat))
    check('a card the app refused to build is recorded as refused', /outcome: 'refused'/.test(chat))
    check('a card carries when it stops working', /expiresAt: row\.expires_at/.test(chat))
    check('the outcome survives history being re-read from the server', /known\.get\(m\.id\)/.test(chat))
    check('a confirmed card leaves its outcome behind when its view is replaced by the receipt', /pendingAction: undefined, outcome: outcomeOfCard\(status, false\)/.test(chat))
  }
}

}

await main()
console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('All "what the coach is told happened" checks pass.')
