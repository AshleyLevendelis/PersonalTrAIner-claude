// ---------------------------------------------------------------------------
// test:coach-knows — WHAT THE COACH IS TOLD, AND WHAT IT IS TOLD NOT TO CLAIM
// (runs 3-4 of the live-app test, 9-10 Oct 2026).
//
// H26: asked about yesterday, the coach said it couldn't see what was logged and
//      sent the tester to "calorie rings for yesterday", a view that does not
//      exist. Ashley: give the coach yesterday's totals and stop it naming a
//      view that does not exist.
// M36: "be honest about my week" got "you hit your lifting sessions" for two
//      sessions closed at 9/24 and 5/18, and praise for a meal never eaten.
// M37: the coach said data export does not exist; Profile > App has it.
// LOW: "your full home gym setup" to a Minimalist user, who was sent the raw
//      word "minimalist".
//
// Whether the MODEL uses these well is the coach exam's to judge; this holds
// that it is GIVEN them, in the right words, and not told the opposite.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildCoachEatenSummary, eatenWindow } from '../src/lib/coach-eaten'
import { describeEquipmentAccess } from '../src/lib/picker-options'
import { selectCoachTipWithKey } from '../src/lib/coach-tips'
import { swapKnockOnLine } from '../src/lib/coach-voice'
import { buildCoachExerciseSummary, type CoachWeekRow } from '../src/lib/chat-plan-context'
import type { WorkoutDay, ExerciseSetLog } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

console.log('\n1. What they logged as eaten, per day (H26)')
{
  const today = '2026-10-10'
  const win = eatenWindow(today)
  check('today and the seven days before, today first', win.length === 8 && win[0] === today && win[1] === '2026-10-09' && win[7] === '2026-10-03', win)
  const block = buildCoachEatenSummary({
    '2026-10-10': { kcal: 812.4, protein: 61.2, carbs: 70, fat: 30, meals: 2 },
    '2026-10-09': { kcal: 1801, protein: 120, carbs: 180, fat: 60, meals: 4 },
  }, today) ?? ''
  const lines = block.split('\n')
  check('one line per day', lines.length === 8, lines)
  check('today is named and given its totals, rounded', /^- Today \(Sat 10 Oct\): 812 kcal · P 61 g · C 70 g · F 30 g, from 2 logged entries$/.test(lines[0]), lines[0])
  check('yesterday is named "Yesterday", which is what she asked about', /^- Yesterday \(Fri 9 Oct\): 1801 kcal/.test(lines[1]), lines[1])
  check('a day with nothing logged says so, and nothing else', lines[2] === '- Thu 8 Oct: nothing logged', lines[2])
  // The read returns EVERY date, empty ones as zeros (getEatenByDate seeds
  // them), so the zero-entry day is the one that actually arrives.
  const seeded = buildCoachEatenSummary({ '2026-10-10': { kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 } }, today) ?? ''
  check('...including a day the read returned as zeros, which is never "0 kcal"', seeded.split('\n')[0] === '- Today (Sat 10 Oct): nothing logged', seeded.split('\n')[0])
  check('a log that could not be read is null, never a week of zeros', buildCoachEatenSummary(null, today) === null)
}

console.log('\n2. The coach is handed it, read fresh for the turn')
{
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  const store = strip(read('src/lib/meal-store.ts'))
  check('the message reads the eaten log as it is sent',
    /const eatenByDay = profile\.id\s*\?\s*buildCoachEatenSummary\(await getEatenByDate\(profile\.id, eatenWindow\(eatenToday\)\)/.test(chat))
  check('...and builds this turn\'s context from it', /context: buildContext\(eatenByDay\)/.test(chat))
  check('...as a block, and whether it could be read', /eaten_by_day: eatenByDay,/.test(chat) && /eaten_by_day_read: eatenByDay != null,/.test(chat))
  check('the streak and the coach count eaten food one way', /export async function getEatenProteinByDate\([^)]*\)[^{]*\{\s*const byDay = await getEatenByDate\(/.test(store))
}

console.log('\n3. The coach is told to use it, and never sent to a view that does not exist')
{
  const prompt = read('supabase/functions/chat-gemini/index.ts')
  const shared = read('supabase/functions/_shared/coach-rules.ts')
  check('the old "you are not told what they have eaten" rule is gone', !/YOU ARE NOT TOLD WHAT THEY HAVE EATEN/.test(prompt) && !/you are not told what they ate, on any day/.test(prompt))
  check('the block is rendered when it was read', /context\.eaten_by_day_read === true && typeof context\.eaten_by_day === 'string' \? `\nWHAT THEY LOGGED AS EATEN/.test(prompt))
  check('...and says "could not be read" when it was not', /context\.eaten_by_day_read === false \? `\nWHAT THEY LOGGED AS EATEN — could not be read this turn/.test(prompt))
  check('logged is said as logged, and a plan is not a meal eaten', /Quote it as logged/.test(prompt) && /a planned meal is not an eaten one/.test(prompt))
  check('it is told never to send them to a past day on Nutrition', /NEVER send them to look at a past day on the Nutrition tab/.test(prompt))
  for (const [name, src] of [['coach', prompt], ['setup chat', shared]] as const) {
    check(`the ${name}'s app map says Nutrition cannot open an earlier day`, /a strip of today and the next six days \(no earlier day can be opened there/.test(src))
  }
}

console.log('\n4. Data export exists (M37)')
{
  const profile = read('src/components/ProfileScreen.tsx')
  check('Profile has "Download my data" and "Delete everything"', /Download my data/.test(profile) && /Delete everything/.test(profile))
  for (const [name, src] of [['coach', read('supabase/functions/chat-gemini/index.ts')], ['setup chat', read('supabase/functions/_shared/coach-rules.ts')]] as const) {
    const denied = src.match(/These do NOT exist[^\n]*/)?.[0] ?? ''
    check(`the ${name} is not told data export does not exist`, denied.length > 0 && !/export/i.test(denied), denied.slice(0, 120))
    check(`the ${name} names it where it is`, /under App a Your data section: Download my data/.test(src))
  }
}

console.log('\n5. Their kit, in the setup screen\'s words (LOW)')
{
  check('Minimalist is described as the picker describes it', describeEquipmentAccess('minimalist') === 'Minimalist — Dumbbells, kettlebells, bands, pull-up bar, weighted bag — no barbell or bench', describeEquipmentAccess('minimalist'))
  check('an unknown value is "not recorded", never a guess', describeEquipmentAccess(undefined) === 'not recorded' && describeEquipmentAccess('garage') === 'not recorded')
  check('the coach is sent the words', /equipment_access_described: describeEquipmentAccess\(profile\.equipment_access\),/.test(strip(read('src/components/ChatAssistant.tsx'))))
  check('...and reads them first, told never to call it a home or full gym otherwise',
    /Equipment Access: \$\{context\.profile\.equipment_access_described \|\| context\.profile\.equipment_access/.test(read('supabase/functions/chat-gemini/index.ts'))
    && /never call it a home gym or a full gym unless it says so/.test(read('supabase/functions/chat-gemini/index.ts')))
}

console.log('\n6. A session closed short is said as the fraction (M36)')
{
  const session: WorkoutDay = {
    day: 'Monday', focus: 'Lower', exercises: [
      { name: 'Barbell Squats', sets: 4, reps: '6-8' },
      { name: 'Romanian Deadlifts', sets: 4, reps: '8-10' },
      { name: 'Walking Lunges', sets: 3, reps: '10' },
    ],
  } as unknown as WorkoutDay
  const log = (name: string, n: number): ExerciseSetLog => ({ exercise_name: name, set_number: n, weight_kg: 40, reps_completed: 8, is_warmup: false, date: '2026-10-06' } as unknown as ExerciseSetLog)
  const row = (state: string, logs: ExerciseSetLog[]): CoachWeekRow => ({ date: '2026-10-06', dayName: 'Monday', session, state, workingLogs: logs })
  const out = (state: string, logs: ExerciseSetLog[]) => buildCoachExerciseSummary({ days: [session], week: [row(state, logs)] })
  const closedShort = out('done', [log('Barbell Squats', 1), log('Barbell Squats', 2), log('Romanian Deadlifts', 1)])
  check('a session closed at 3 of 11 says "CLOSED at 3 of 11 planned working sets"', /\[CLOSED at 3 of 11 planned working sets/.test(closedShort), closedShort.match(/\[CLOSED[^\]]*\]/)?.[0])
  check('...and is told not to call it hit', /never "you hit it", unless they are equal/.test(closedShort))
  const partial = out('partial', [log('Barbell Squats', 1)])
  check('a session left open says how far it got', /\[PART-DONE — 1 of 11 planned working sets logged/.test(partial), partial.match(/\[PART-DONE[^\]]*\]/)?.[0])
  const noLogs = buildCoachExerciseSummary({ days: [session], week: [{ date: '2026-10-06', dayName: 'Monday', session, state: 'done' }] })
  check('with no logs handed over it falls back to the old wording, claiming no number', /\[CLOSED — work was logged that day\]/.test(noLogs))
  const week = read('src/hooks/useTrainingWeek.ts')
  check('the week hands each day its working sets', /workingLogs: dashboardDay\?\.workingLogs \?\? \[\],/.test(strip(week)))
}

console.log('\n7. The tip claims only the sessions already due (M39)')
{
  const ctx = {
    today: '2026-10-08', proteinAdherenceStreakDays: 0, knownLiftProgress: [], sessionsThisWeekSoFar: 2,
    sessionsLastWeekSameSpan: 2, scheduledSoFarThisWeek: 2, loggedOfScheduledSoFarThisWeek: 2,
    weightTrend: null, recentPRs: [], waterMl: 2000, waterTargetMl: 2000, hourOfDay: 12, firstDay: false,
  }
  const tip = selectCoachTipWithKey(ctx as never)
  check('two of two due sessions says "so far", not the whole week',
    tip?.key === 'perfect_adherence' && tip.text === 'Every session due so far this week, done — 2 for 2.', tip)
}

console.log('\n8. A meal swap says what else it changed (M34)')
{
  check('a different dish is named, with what it replaced',
    swapKnockOnLine({ slot: 'snack', kind: 'dish', from: 'Yoghurt and banana', to: 'Rice cakes and peanut butter', fromKcal: 230, toKcal: 260 }) === 'Snack changed too, so the day still fits: Yoghurt and banana is now Rice cakes and peanut butter.')
  check('a resize is said as a size',
    swapKnockOnLine({ slot: 'dinner', kind: 'size', from: 'Salmon and potatoes', to: 'Salmon and potatoes', fromKcal: 610, toKcal: 540 }) === 'Dinner changed size so the day still fits: Salmon and potatoes, 610 → 540 kcal.')
  const mp = strip(read('src/components/MealPlan.tsx'))
  const fn = mp.slice(mp.indexOf('const handleChoose = async'), mp.indexOf('const handleChoose = async') + 700)
  check('the swap runs the same trial as add-food BEFORE it writes', fn.indexOf('dayMove.knockOn(date, slot, picked)') > -1 && fn.indexOf('dayMove.knockOn(date, slot, picked)') < fn.indexOf('await onSwap(slot, name)'))
  // Re-anchored 10 Oct 2026 (M34, her "Resize, else leave"): a re-size now has
  // its own line on the day, so this note names only a DIFFERENT dish.
  check('...and names only the OTHER meals of THAT day, and only a different dish', /trial\?\.changes\.filter\(c => c\.date === date && c\.slot !== slot && c\.kind === 'dish'\)/.test(fn))
  check('...each changed meal becomes its line, and the line is drawn under the row',
    /setSwapNote\(sameDay\.length > 0 \? sameDay\.map\(swapKnockOnLine\) : null\)/.test(fn) && /data-testid="swap-knock-on">\{swapNote\.join\(' '\)\}/.test(mp))
}

console.log(`\ncoach-knows: ${ran} checks ran`)
console.log(failures === 0 ? 'All coach-knows checks passed.\n' : `${failures} coach-knows check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
