/**
 * test:coach-rhythm — his strategy of 13 Nov 2026, slice 2 (docs/plans/coach-rhythm.md):
 *   1. weekly consistency in place of the streak (his "Replace"): the on-plan rule, the count over the last 12
 *      finished weeks, the pill's words; no streak left anywhere a person or the coach reads it;
 *   2. the comeback path: one small step at 3 quiet days with no word of what was missed, one "door is open" at 14,
 *      then SILENCE until he logs again;
 *   3. the weekly review (Saturday from noon, one number) and plan-the-week (Sunday from noon), switchable, inside the
 *      daily limit, both copies saying the same;
 *   4. the server's facts: the week's count trusted only inside its own week, the weekday on his calendar;
 *   5. the weeks-on-plan milestone in the chat.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
process.env.TZ = 'Europe/London'

let ran = 0, failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const ROOT = process.cwd()
const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function main() {
  const c = await import('../src/lib/consistency')
  const voice = await import('../src/lib/coach-voice')
  const app = await import('../src/lib/coach-moments')
  const srv = await import('../supabase/functions/_shared/coach-moments')
  const ro = await import('../supabase/functions/_shared/reach-out')
  const nudge = await import('../src/lib/coach-nudge')
  const labels = await import('../src/lib/coach-reach-out')

  console.log('\n1. Weekly consistency, in place of the streak')
  check('on plan needs three quarters, rounded up: 2/2, 3/3, 3/4, 4/5, 5/6',
    [2, 3, 4, 5, 6].map(c.sessionsForOnPlan).join() === '2,3,3,4,5', [2, 3, 4, 5, 6].map(c.sessionsForOnPlan))
  check('one missed of four is still on plan; one missed of three is not', c.weekIsOnPlan(3, 4) && !c.weekIsOnPlan(2, 3))
  check('a week with nothing planned is never on plan', !c.weekIsOnPlan(0, 0))
  const w = (done: number, planned: number) => ({ sessionsDone: done, sessionsPlanned: planned })
  const r = c.weeksOnPlan([w(4, 4), w(2, 4), w(0, 0), w(3, 4), w(3, 3)])
  check('weeks with nothing planned are left out, never counted against him (3 of 4)', r.onPlan === 3 && r.of === 4, r)
  const long = c.weeksOnPlan(Array.from({ length: 20 }, (_, i) => w(i < 12 ? 4 : 0, 4)))
  check('only the last 12 finished weeks are counted', long.of === 12 && long.onPlan === 12 && c.WEEKS_LOOKED_BACK === 12, long)
  check('nothing finished yet: nothing to show', c.weeksOnPlan([]).of === 0 && voice.weeksOnPlanPill({ onPlan: 0, of: 0 }) === null)
  check('the pill says "9 of 12 weeks"; one week says "week"', voice.weeksOnPlanPill({ onPlan: 9, of: 12 }) === '9 of 12 weeks' && voice.weeksOnPlanPill({ onPlan: 1, of: 1 }) === '1 of 1 week')
  check('a screen reader hears "9 of the last 12 weeks on plan"', voice.weeksOnPlanSentence({ onPlan: 9, of: 12 }) === '9 of the last 12 weeks on plan')
  const home = src('src/components/Dashboard.tsx')
  check('Home draws the weeks-on-plan pill and no streak', /data-testid="home-consistency"/.test(home) && /weeksOnPlanPill\(data\.weeksOnPlan\)/.test(home) && !/home-streak/.test(home) && !/in a row/.test(home))
  const dash = src('src/lib/dashboard-data.ts')
  check('Home counts the finished weeks from the strip\'s own week builder, 13 weeks in one read',
    /readTrainingWeeksBack\(profileId, todayStr, activeWeekDays, mesocycle, planCreatedAt \?\? undefined, WEEKS_LOOKED_BACK \+ 1, windowMoves\)/.test(dash)
    && /weeksOnPlan\(weeksBack\.slice\(1\)\.map\(w => tallyWeek\(w, todayStr\)\)\)/.test(dash) && !/computeStreak/.test(dash))
  const fn = src('supabase/functions/chat-gemini/index.ts')
  const rules = src('supabase/functions/_shared/coach-rules.ts')
  check('the coach is told weeks on plan, and that there is no streak', /WEEKS ON PLAN: \$\{context\.weeks_on_plan\}/.test(fn) && !/CURRENT STREAK/.test(fn) && /9 of 12 weeks/.test(rules) && !/12 in a row/.test(rules))
  check('no "in a row" left in what the app says (phrasebook, chat, nudges, accountability)',
    ['src/lib/coach-voice.ts', 'src/lib/coach-nudge.ts', 'src/lib/accountability.ts', 'src/components/ChatAssistant.tsx', 'supabase/functions/_shared/coach-moments.ts', 'supabase/functions/_shared/reminder-writer.ts']
      .every(f => !/in a row/.test(src(f).replace(/the way a person sends two texts in a row/g, ''))))

  console.log('\n2. The comeback path')
  const base = { localHour: 10, awaitingFeel: false, plannedToday: true, loggedToday: false, missedYesterday: true, daysSinceAnyLog: 0, blockJustEnded: false, beatTargetPending: false, name: 'Ashley' }
  const keys = (f: object, m: typeof app = app) => m.momentsToRaise(f as never).map(x => x.key)
  const at3 = keys({ ...base, daysSinceAnyLog: 3 })
  check('3 quiet days: the comeback comes first', at3[0] === 'comeback', at3)
  check('...and nothing says what was missed, nor nags about sessions: it is the one training message', !at3.includes('missed_yesterday') && !at3.includes('workout_today') && !at3.includes('session_not_logged'), at3)
  check('the session reminders stay quiet all through the lapse (day 7)', !keys({ ...base, daysSinceAnyLog: 7 }).some(k => k === 'workout_today' || k === 'missed_yesterday'), keys({ ...base, daysSinceAnyLog: 7 }))
  const cb = app.momentsToRaise({ ...base, daysSinceAnyLog: 3 } as never)[0]
  check('...one small step, no word of a miss or a session', /ten-minute walk/.test(cb?.text ?? '') && !/miss|skipp|session|yesterday/i.test(cb?.text ?? ''), cb?.text)
  check('said on the day the gap reaches 3, not every day after', !keys({ ...base, daysSinceAnyLog: 4 }).includes('comeback') && !keys({ ...base, daysSinceAnyLog: 2 }).includes('comeback'))
  check('14 quiet days: the door is open, once', keys({ ...base, daysSinceAnyLog: 14 })[0] === 'door_open' && !keys({ ...base, daysSinceAnyLog: 13 }).includes('door_open'))
  check('then SILENCE: nothing at all after day 14, not even the session reminder', keys({ ...base, daysSinceAnyLog: 15 }).length === 0 && keys({ ...base, daysSinceAnyLog: 40 }).length === 0)
  // A CASE WHERE THE SILENCE BINDS: a Saturday evening with the food nudges and the review all live on day 13.
  const busy = { ...base, plannedToday: false, missedYesterday: false, localHour: 19, weekday: 6, weekSessionsDone: 0, weekSessionsPlanned: 3, logsMeals: true, mealsAccountedToday: 0, proteinTargetG: 160, proteinEatenToday: 20 }
  check('silence binds: on day 13 the food and review messages are live, on day 15 none of them is',
    keys({ ...busy, daysSinceAnyLog: 13 }).length >= 2 && keys({ ...busy, daysSinceAnyLog: 15 }).length === 0, { d13: keys({ ...busy, daysSinceAnyLog: 13 }), d15: keys({ ...busy, daysSinceAnyLog: 15 }) })
  check('...until he logs again (0 days: reminders as before)', keys({ ...base, daysSinceAnyLog: 0 }).includes('workout_today'))
  check('never logged at all: none of this fires', !keys({ ...base, daysSinceAnyLog: null }).some(k => k === 'comeback' || k === 'door_open'))

  console.log('\n3. The weekly review and plan the week')
  const sat = { ...base, missedYesterday: false, plannedToday: false, weekday: 6, localHour: 13, weekSessionsDone: 3, weekSessionsPlanned: 4 }
  const rv = app.momentsToRaise(sat as never).find(m => m.key === 'week_review')
  check('Saturday from noon: the review, with its one number', !!rv && /3 of 4 sessions done/.test(rv.text), rv?.text)
  check('not before noon, not on a Friday, not with nothing planned',
    !keys({ ...sat, localHour: 11 }).includes('week_review') && !keys({ ...sat, weekday: 5 }).includes('week_review') && !keys({ ...sat, weekSessionsPlanned: 0 }).includes('week_review'))
  check('every session done says so; none done carries no blame',
    /all 4 sessions done/.test(voice.coachMessage('week_review', { weekDone: 4, weekPlanned: 4 })) && !/miss|fail|behind/i.test(voice.coachMessage('week_review', { weekDone: 0, weekPlanned: 4 })))
  check('Sunday from noon: plan the week', keys({ ...sat, weekday: 0 }).includes('plan_week') && !keys({ ...sat, weekday: 0, localHour: 10 }).includes('plan_week') && !keys(sat).includes('plan_week'))
  check('each has its own switch, on by default, and a label', ['comeback', 'door_open', 'week_review', 'plan_week'].every(k => (app.DEFAULT_MOMENT_SWITCHES as Record<string, boolean>)[k] === true && !!(labels.MOMENT_LABELS as Record<string, string>)[k]))
  check('a switch off silences it', !app.momentsToRaise(sat as never, { week_review: false }).some(m => m.key === 'week_review'))
  check('still inside waking hours (21:00 is quiet)', !keys({ ...sat, localHour: 21 }).includes('week_review'))
  const cases = [{ ...base, daysSinceAnyLog: 3 }, { ...base, daysSinceAnyLog: 14 }, sat, { ...sat, weekday: 0 }, { ...sat, weekSessionsDone: 4 }, { ...sat, weekSessionsDone: 0 }]
  check('the server\'s copy says exactly the same, word for word', cases.every(f => JSON.stringify(app.momentsToRaise(f as never)) === JSON.stringify(srv.momentsToRaise(f as never))),
    cases.map(f => [app.momentsToRaise(f as never).map(m => m.text), srv.momentsToRaise(f as never).map(m => m.text)]))
  check('the streak moment is gone from both copies', !(app.MOMENT_KEYS as readonly string[]).includes('streak_at_risk') && !(srv.MOMENT_KEYS as readonly string[]).includes('streak_at_risk'))

  console.log('\n4. The server\'s facts')
  const live = { activityDates: ['2026-09-16'], marks: {}, movedInto: [], unratedRecentSession: false, beatTargetOffered: false }
  const row = (asOf: string) => ({ training_weekdays: ['Monday'], week_sessions_done: 2, week_sessions_planned: 3, week_as_of: asOf })
  const satFacts = ro.factsFor(row('2026-09-19') as never, live as never, '2026-09-19', 13)
  check('Saturday 19 Sep is weekday 6, and the week counted that day is trusted', satFacts.weekday === 6 && satFacts.weekSessionsDone === 2 && satFacts.weekSessionsPlanned === 3, satFacts)
  check('a count from yesterday in the same week is trusted', ro.factsFor(row('2026-09-18') as never, live as never, '2026-09-19', 13).weekSessionsPlanned === 3)
  check('a count from last week (Sunday, read on Monday) is NOT', ro.factsFor(row('2026-09-20') as never, live as never, '2026-09-21', 13).weekSessionsPlanned === 0)
  check('nor one older than yesterday', ro.factsFor(row('2026-09-15') as never, live as never, '2026-09-19', 13).weekSessionsPlanned === 0)
  check('days since anything was logged, on his calendar', satFacts.daysSinceAnyLog === 3, satFacts.daysSinceAnyLog)

  console.log('\n5. The weeks-on-plan milestone')
  const nIn = { today: '2026-09-16', hour: 10, cutoffHour: 18, planKnown: true, awaitingFeel: null, missedYesterday: null, recentPR: null, todaySession: null, todayLogged: false, weeksOnPlan: 4 }
  const m4 = nudge.pickNudge(nIn as never, [])
  check('4 weeks on plan is worth a word, and it is a count', m4?.kind === 'consistency_milestone' && /4 weeks on plan/.test(m4.text) && !/in a row|streak/i.test(m4.text), m4)
  check('5 is not; said once', nudge.pickNudge({ ...nIn, weeksOnPlan: 5 } as never, []) == null && nudge.pickNudge(nIn as never, m4?.keys ?? []) == null)

  console.log('\n6. The shortest version, a floor that counts')
  const ep = await import('../src/lib/exercise-plan')
  const { seededRngFromKey } = await import('../src/lib/seeded-random')
  const { estimateDaySeconds } = await import('../src/lib/session-duration')
  const { getExerciseEntry } = await import('../src/lib/exercise-db')
  const profile = {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: [], training_style: 'hybrid', training_experience: 'intermediate',
    session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(day) })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  } as never
  ep.setRandomSource(seededRngFromKey('coach-rhythm-floor'))
  const week = ep.generateMesocycle(profile)[1]
  ep.resetRandomSource()
  const day = week.days.find(d => d.exercises.length > 0)!
  const full = estimateDaySeconds(day) / 60
  const floor = ep.shortenOrFloor(week, day.day, profile, ep.SHORTEST_VERSION_MINUTES)
  const floorDay = floor.week.days.find(d => d.day === day.day)!
  const thirty = ep.shortenOrFloor(week, day.day, profile, 30)
  const tier1 = (d: typeof day) => d.exercises.filter(e => getExerciseEntry(e.name)?.mechanics_tier === 'tier1_compound').map(e => `${e.name}:${e.sets}`)
  check('asked as 0 minutes it is the shortest the session goes: shorter than the full one and no longer than "30 minutes"',
    floor.changed && floor.achievedMinutes < full && floor.achievedMinutes <= (thirty.changed ? thirty.achievedMinutes : full), { full: Math.round(full), floor: floor.achievedMinutes, thirty: thirty.achievedMinutes })
  check('...the main lift kept whole, every set', tier1(day).length > 0 && tier1(day).every(t => tier1(floorDay).includes(t)), { before: tier1(day), after: tier1(floorDay) })
  check('...and at least three real exercises', floorDay.exercises.filter(e => e.tier !== 'tier_0_primer').length >= 3, floorDay.exercises.map(e => e.name))
  check('...marked with the minutes it really takes, never the 0 asked', floorDay.shortened_to_minutes === floor.achievedMinutes && floor.achievedMinutes > 0, floorDay.shortened_to_minutes)
  check('any other number still means that number', ep.shortenOrFloor(week, day.day, profile, 30).achievedMinutes === ep.shortenDayTo(week, day.day, profile, 30).achievedMinutes)
  const sheet = src('src/components/exercise/WhatHappenedSheet.tsx')
  check('the day menu offers it, and says it still counts', /onClick=\{\(\) => runShorten\(SHORTEST_VERSION_MINUTES\)\} data-shorten-floor/.test(sheet) && /still counts as today/.test(sheet))
  check('the screen, the coach\'s card and its executor all go through the one function',
    /shortenOrFloor\(week, target\.planDayName, profile, minutes\)/.test(src('src/components/exercise/TodayPanel.tsx'))
    && /shortenOrFloor\(week, payload\.dayName, profile, payload\.minutes\)/.test(src('src/lib/pending-action-executor.ts'))
    && /shortenOrFloor\(week, day\.day, profile, minutes\)/.test(src('src/components/ChatAssistant.tsx')))
  check('the coach is told 0 is the short version', /0 means THE SHORTEST VERSION/.test(fn) && /call propose_session_shorten with minutes 0/.test(fn))

  console.log('\n7. Ignored three times running turns the coach down a level')
  const e = await import('../src/lib/engagement')
  const H = 3600 * 1000
  const now = Date.parse('2026-09-20T12:00:00Z')
  const sent = (moment: string, h: number, answered = false) => ({ moment, sent_at: new Date(now - h * H).toISOString(), answered_at: answered ? new Date(now - h * H + 60000).toISOString() : null })
  const three = [sent('protein_short', 24), sent('protein_short', 48), sent('protein_short', 72)]
  check('three in a row unanswered: Normal goes to Light', JSON.stringify(e.turnDownFor(three, 'normal', null, now)) === JSON.stringify({ to: 'light', moment: 'protein_short' }), e.turnDownFor(three, 'normal', null, now))
  check('Lots goes to Normal; Light stays Light', e.turnDownFor(three, 'lots', null, now)?.to === 'normal' && e.turnDownFor(three, 'light', null, now) === null)
  check('two is not three', e.turnDownFor(three.slice(0, 2), 'normal', null, now) === null)
  check('an answer in between starts again', e.turnDownFor([sent('protein_short', 24), sent('protein_short', 48, true), sent('protein_short', 72), sent('protein_short', 96)], 'normal', null, now) === null)
  check('three different moments ignored once each is not "the same message three times"', e.turnDownFor([sent('a', 24), sent('b', 48), sent('c', 72)], 'normal', null, now) === null)
  check('a drop needs three NEW ignores after the last one', e.turnDownFor(three, 'normal', new Date(now - 50 * H).toISOString(), now) === null && e.IGNORED_BEFORE_TURNING_DOWN === 3)
  check('the coach says so, naming the level and where to change it', voice.turnedDownLine('Light') === "I've turned my messages down to Light, because the last few went unanswered. You can change it any time in Profile, Reminders.")
  const chatSrc = src('src/components/ChatAssistant.tsx')
  check('the chat saves the lower level first and only then says so, with the drop time stored',
    /if \(await saveSwitches\(profileId, next\) !== 'saved'\) return/.test(chatSrc) && /frequency_dropped_at: new Date\(nowMs\)\.toISOString\(\)/.test(chatSrc)
    && chatSrc.indexOf("if (await saveSwitches(profileId, next) !== 'saved') return") < chatSrc.indexOf('const text = turnedDownLine('))

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) process.exit(1)
  console.log('PASSED — weeks on plan, never a run; a way back after a lapse, then quiet; a weekly review and plan.')
}
main().catch(e => { console.error(e); process.exit(1) })
