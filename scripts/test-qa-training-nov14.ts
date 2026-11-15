// ---------------------------------------------------------------------------
// THE TRAINING-DAY QA OF 14 NOV 2026 (after his live test). Each confirmed finding is held here by the function that
// now decides it:
//   1. "See Wednesday" when Wednesday is today, and the strip's TODAY cell, go back to today's live card;
//   2. the week view draws a chosen rest as a rest, and (3) a missed day as missed, with where it went;
//   4. two warm-up-move sets and Finish are not a session done;
//   5. a rebuild never turns a loaded lift into an unloaded drill;
//   6. a move to a taken or next-week day falls back to the free days before it, never "no free day left";
//   7. the move's receipt gives the same reason as its card;
//   8. a rest or recovery day before the plan began is before the plan.
// One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { weekDayRow } from '../src/lib/exercise-week'
import { resolveMoveTarget } from '../src/lib/session-move'
import { classifyDay } from '../src/hooks/useTrainingWeek'
import { rebuildDayAroundMainLift } from '../src/lib/session-rebuild'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import type { WorkoutDay, UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const hush = async <T>(fn: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn() } finally { console.log = l; console.warn = w } }

async function main() {
  console.log('\n1. Back to today, never a read-only copy of it')
  {
    const panel = strip(fs.readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
    check('"See Wednesday" when Wednesday is today closes the peek', /onClick=\{\(\) => openPeek\(peekMovedTo\.date\)\}/.test(panel) && /if \(!date \|\| date === today\) \{ setPeekDate\(null\); return \}/.test(panel))
    check('a tap on today in the strip closes the peek', /onSelectDate=\{openPeek\}/.test(panel))
    const row = strip(fs.readFileSync('src/components/exercise/WeekContextRow.tsx', 'utf8'))
    check('...and the strip passes today\'s tap on (it used to be dropped)', /onClick=\{\(\) => onSelectDate\(d\.date\)\}/.test(row) && !/if \(!isToday\) onSelectDate/.test(row))
  }

  console.log('\n2-3. The week view: a chosen rest and a missed day')
  {
    const session = { day: 'Monday', focus: 'Squat & Carry', exercises: [{ name: 'Front Squat', sets: 3, reps: '5', rest: '120s' }] } as unknown as WorkoutDay
    const day = (state: string, extra: object = {}) => ({ date: '2026-11-16', dayName: 'Monday', state, session, workingLogs: [], ...extra } as never)
    const rest = weekDayRow(day('rest_chosen'), () => null)
    check('a rest chosen on a session day is drawn as a rest, "chosen rest"', rest.kind === 'rest' && (rest as { note?: string }).note === 'chosen rest', rest)
    check('...while the same day due is the session (the fixture binds)', weekDayRow(day('due'), () => null).kind === 'session')
    const movedOn = weekDayRow({ ...(day('missed') as object), session: undefined, movedTo: { date: '2026-11-21', dayName: 'Saturday' } } as never, () => null)
    check('a missed day whose session was moved on says missed and where it went', (movedOn as { note?: string }).note === 'Missed · moved to Saturday', movedOn)
    const missedEmpty = weekDayRow({ ...(day('missed') as object), session: undefined } as never, () => null)
    check('...and a missed day with no session left says "Missed", never "Rest day"', (missedEmpty as { note?: string }).note === 'Missed', missedEmpty)
  }

  // A plan begun Sat 14 Nov; sessions Mon, Wed, Fri; Tuesday a recovery row, Thursday nothing.
  const s = (day: string, exercises: object[] = [{ name: 'Front Squat', sets: 3, reps: '5', rest: '120s', tier: 'tier_1_primary' }]) => ({ day, focus: 'Squat & Carry', exercises }) as unknown as WorkoutDay
  const plan = [s('Monday', [{ name: 'Clamshell', sets: 2, reps: '12', rest: '30s', tier: 'tier_0_primer' }, { name: 'Front Squat', sets: 3, reps: '5', rest: '120s', tier: 'tier_1_primary' }]),
    s('Tuesday', []), s('Wednesday'), s('Friday')]

  console.log('\n4. Warm-up-move sets and Finish are not a session done')
  {
    const log = (name: string) => ({ exercise_name: name, set_number: 1, weight_kg: 0, reps: 12, date: '2026-11-16' })
    const dash = (logs: object[]) => ({ date: '2026-11-16', workingLogs: logs, warmupLogs: [], cardioLogs: [], session: { is_completed: true } } as never)
    const prepOnly = classifyDay('Monday', '2026-11-16', '2026-11-16', plan, dash([log('Clamshell'), log('Clamshell')]), '2026-11-14')
    check('two Clamshell sets and Finish: not done, not partly done', prepOnly !== 'done' && prepOnly !== 'partial', prepOnly)
    check('...one Front Squat set and Finish: done (the fixture binds)', classifyDay('Monday', '2026-11-16', '2026-11-16', plan, dash([log('Front Squat')]), '2026-11-14') === 'done')
  }

  console.log('\n8. Before the plan began, a rest or recovery day is before the plan')
  {
    check('Tuesday\'s recovery row before the plan: before the plan', classifyDay('Tuesday', '2026-11-10', '2026-11-16', plan, undefined, '2026-11-14') === 'before_plan')
    check('Thursday (no row) before the plan: before the plan', classifyDay('Thursday', '2026-11-12', '2026-11-16', plan, undefined, '2026-11-14') === 'before_plan')
    check('...the same days after it began: recovery and rest (the fixture binds)', classifyDay('Tuesday', '2026-11-17', '2026-11-16', plan, undefined, '2026-11-14') === 'recovery' && classifyDay('Thursday', '2026-11-19', '2026-11-16', plan, undefined, '2026-11-14') === 'rest')
  }

  console.log('\n6. A move never says "no free day left" while one is free')
  {
    // Week 1 runs Sat 14 - Fri 20; today Mon 16; Wednesday's session.
    const weekOf = (d: string) => (d >= '2026-11-14' && d <= '2026-11-20' ? 1 : d < '2026-11-14' ? 0 : 2)
    const base = { fromDate: '2026-11-18', todayDate: '2026-11-16', plan, weekOf, existing: [] }
    const nextWeek = resolveMoveTarget({ ...base, requestedDate: '2026-11-23' })
    check('Wednesday to next Monday (another training week): Thursday, the next free day, and says why', nextWeek.ok && nextWeek.date === '2026-11-19' && (nextWeek as { requestedWhyNot?: string }).requestedWhyNot === 'other_week', nextWeek)
    const taken = resolveMoveTarget({ ...base, requestedDate: '2026-11-20' })
    check('Wednesday to Friday (a session): Thursday, free and before it, "busy"', taken.ok && taken.date === '2026-11-19' && (taken as { requestedWhyNot?: string }).requestedWhyNot === 'busy', taken)
    const asked = resolveMoveTarget({ ...base, requestedDate: '2026-11-19' })
    check('...Thursday asked for: Thursday, as wanted', asked.ok && asked.date === '2026-11-19' && asked.asWanted, asked)
  }

  console.log('\n7. The receipt says the card\'s reason')
  {
    const exec = strip(fs.readFileSync('src/lib/pending-action-executor.ts', 'utf8'))
    check('a day that had gone is said as gone, another week as another week', /requestedWhyNot === 'gone' \? ` \(\$\{payload\.requestedDayName\} had already gone\)`/.test(exec) && /requestedWhyNot === 'other_week'/.test(exec))
    const chat = strip(fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    check('...and the card hands the reason to the receipt', /requestedDayName: target\.requestedDayName, \.\.\.\(target\.requestedWhyNot \? \{ requestedWhyNot: target\.requestedWhyNot \} : \{\}\)/.test(chat))
  }

  console.log('\n5. A rebuild never turns a loaded lift into an unloaded drill')
  {
    const profile = { id: 'p', equipment_access: 'full_gym', training_experience: 'intermediate', training_style: 'bodybuilding', injuries: [], goal: 'muscle_gain', fitness_goal: 'hypertrophy', training_days: [] } as unknown as UserProfile
    const ex = (name: string, tier = 'tier_3_isolation') => ({ id: name, name, sets: 3, reps: '10-12', rest: '60s', tier })
    // The one loaded alternative to Leg Extensions is already elsewhere in the week, as in the QA plan.
    const week = { week_number: 1, days: [
      { day: 'Monday', focus: 'Legs', exercises: [ex('Barbell Back Squat', 'tier_1_primary'), ex('Leg Extensions')] },
      { day: 'Thursday', focus: 'Legs B', exercises: [ex('Single-Leg Leg Extension')] },
    ] } as unknown as MesocycleWeek
    const out = await hush(() => rebuildDayAroundMainLift({ mesocycle: [week], profile, weekNumber: 1, dayName: 'Monday', exclusions: [] } as never))
    const monday = out.mesocycle[0].days.find(d => d.day === 'Monday')
    const slot = monday?.exercises.find(e => e.name !== 'Barbell Back Squat')
    const entry = slot ? getExerciseEntry(slot.name) : undefined
    check('Leg Extensions stays a loaded lift (kept, or swapped for another loaded one)', !!entry && isExternallyLoaded(entry), { slot: slot?.name, kept: out.kept })
    check('...and when it is kept, the reason says why', slot?.name !== 'Leg Extensions' || out.kept.some(k => /carry no weight/.test(k.reason)), out.kept)
  }

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) { console.error('test:qa-training-nov14 FAILED'); process.exit(1) }
  console.log('The training-day QA findings of 14 Nov hold.')
}

main().catch(err => { console.error(err); process.exit(1) })
