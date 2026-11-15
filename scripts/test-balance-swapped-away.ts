// The week-balance step never gives more sets to an exercise that was swapped away (15 Nov 2026, CSCS; the coeliac
// nurse swapped out a floor press for her shoulder and the card said "I'll also add 2 sets of floor press on
// Wednesday"). One exit: the count of failures.
import { settleWeek } from '../src/lib/settle-week'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { MesocycleWeek, Exercise, UserProfile } from '../src/lib/types'

let ran = 0, failed = 0
const ok = (c: boolean, m: string, d?: unknown) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`) } }

const ex = (name: string, sets: number, extra: Partial<Exercise> = {}): Exercise => {
  const e = getExerciseEntry(name)
  return { name, sets, reps: '10-12', rest: '75s', intensity: 'RPE 7', load_guidance: '', tier: e?.mechanics_tier === 'tier3_isolation' ? 'tier_3_isolation' : 'tier_2_secondary', ...extra } as unknown as Exercise
}
const profile = { training_experience: 'beginner', equipment_access: 'home_gym', fitness_goal: 'fat_loss', training_style: 'hybrid',
  session_duration_preference: '45-60', injuries: ['shoulders'] } as unknown as UserProfile

// Pressing is short against pulling (7 push sets to 11 pull), so the pass must add a press somewhere. The floor press
// sits on the FIRST day, where the pass looks first.
const week = (swapped: boolean): MesocycleWeek => ({
  week_number: 2, is_deload: false,
  days: [
    { day: 'Monday', focus: 'Upper', exercises: [ex('Dumbbell Floor Press', 2), ex('Push-Ups', 2), ex('Seated Cable Row', 4)] },
    { day: 'Wednesday', focus: 'Upper', exercises: [
      ex('Incline Dumbbell Press', 3, swapped ? { swapped_for: 'Dumbbell Floor Press' } : {}), ex('Lat Pulldown', 4), ex('Face Pulls', 3)] },
  ],
} as unknown as MesocycleWeek)

console.log('§1 The fixture binds: with nothing swapped, the floor press is the press that gets more sets')
const control = settleWeek(week(false), 'Wednesday', profile)
const ctlFloor = control.week.days[0].exercises.find(e => e.name === 'Dumbbell Floor Press')!.sets
ok(['Dumbbell Floor Press', 'Push-Ups', 'Seated Cable Row', 'Incline Dumbbell Press', 'Lat Pulldown', 'Face Pulls'].every(n => !!getExerciseEntry(n)), 'every fixture lift is in the catalogue')
ok(ctlFloor > 2, `the floor press is topped up when nothing was swapped (2 -> ${ctlFloor})`, control.balance.changes)

console.log('§2 Swapped away: never topped up, anywhere in the week')
const settled = settleWeek(week(true), 'Wednesday', profile)
const floor = settled.week.days[0].exercises.find(e => e.name === 'Dumbbell Floor Press')!.sets
ok(floor <= 2, `the floor press keeps its 2 sets (${floor})`, settled.balance.changes)
ok(!settled.balance.changes.some(c => c.exercise === 'Dumbbell Floor Press' && c.to > c.from), 'the card has no line adding floor-press sets', settled.balance.changes)
const pushAfter = settled.week.days.flatMap(d => d.exercises).filter(e => /Press|Push-Ups/.test(e.name)).reduce((n, e) => n + e.sets, 0)
ok(pushAfter > 7, `the week still gets its pressing from another press (${pushAfter} push sets, was 7)`, settled.balance.changes)

console.log(`${ran} checks ran, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
