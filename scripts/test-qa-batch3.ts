// ---------------------------------------------------------------------------
// HIS LIVE-TEST BATCHES 2 AND 3, 14 NOV 2026 (Priya and his own phone): the findings built on his "build it". Each is
// held here by the function or the line that decides it; what waits on his decisions is in BACKLOG, not here.
//   1. "Leave it as it is" on a goal change puts the old goal back (his ruling: "Undo the goal change");
//   2. a regenerate keeps one-day meals (a meal out, freestyle, cooked for him, a moved meal);
//   3. the reps box selects what is in it, so typing replaces it, and is wide enough for three digits;
//   4. Home counts a borrowed day's sets as Exercise does;
//   5. the page leaves room for the floating bars;
//   6. a liquid is shopped in ml, and the list's line names a meal out;
//   7. a move to a day that only holds another day's moved session says so; the card names what the day holds; the
//      coach's own note is not printed on a move card;
//   8. a rebuild card lists a week begun mid-week in date order;
//   9. the coach never gives a blanket safety assurance, and logs one meal per call.
// One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { detectPlanInvalidation } from '../src/lib/plan-invalidation'
import { survivesRegeneration } from '../src/lib/meal-generation'
import { eatingOutOption } from '../src/lib/eating-out'
import { boughtByVolume } from '../src/lib/grocery-store'
import { ELSEWHERE_WORDS } from '../src/lib/meals-elsewhere'
import { resolveMoveTarget } from '../src/lib/session-move'
import { describeRebuild } from '../src/lib/rebuild-card'
import { computeMealMacros, lookupIngredient } from '../src/lib/food-db'
import { buildDayGuard, buildOwedGuard } from '../src/lib/plan-guard'
import type { UserProfile, WorkoutDay, MesocycleWeek } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(fs.readFileSync(p, 'utf8'))

console.log('\n1. "Leave it as it is" on a goal change puts the old goal back')
{
  const inv = detectPlanInvalidation({ fitness_goal: 'hypertrophy' } as UserProfile, { fitness_goal: 'fat_loss' } as Partial<UserProfile>)
  check('the goal question carries the goal it replaced', inv?.field === 'fitness_goal' && inv.previousGoal === 'hypertrophy', inv)
  const app = read('src/App.tsx')
  const leave = app.slice(app.indexOf('const leaveAsItIs = async'), app.indexOf('const leaveAsItIs = async') + 700)
  check('"Leave it as it is" runs leaveAsItIs, not a bare close', /data-testid="rebuild-leave"/.test(app) && /onClick=\{\(\) => void leaveAsItIs\(\)\}/.test(app))
  check('...which puts the goal back on screen and in the store', /field !== 'fitness_goal'/.test(leave) && /fitness_goal: inv\.previousGoal/.test(leave) && /handleProfilePatched\(patch\)/.test(leave) && /updateProfileField\(profile\.id, patch\)/.test(leave))
}

console.log('\n2. A regenerate keeps one-day meals')
{
  const out = eatingOutOption('dinner', '2026-11-15', { calories: 800, protein: 50, carbs: 80, fat: 30 }, 'normal')
  check('a meal out survives a regenerate', survivesRegeneration(out.tags))
  check('...a plan dish does not (the fixture binds)', !survivesRegeneration(['ai-generated']))
}

console.log('\n3. The reps box')
{
  const grid = read('src/components/exercise/SetGrid.tsx')
  check('both boxes select what is in them on focus, so typing replaces it', (grid.match(/onFocus=\{e => \{ e\.currentTarget\.select\(\); scrollRowIntoView\(e\) \}\}/g) ?? []).length === 2 && !/onFocus=\{scrollRowIntoView\}/.test(grid))
  check('the reps column is wide enough for three digits beside "reps"', /grid-cols-\[28px_minmax\(0,1fr\)_88px_44px\]/.test(grid))
}

console.log('\n4. Home counts a borrowed day as Exercise does')
{
  const dash = read('src/lib/dashboard-data.ts')
  check('logged and planned come from sessionSetCount', /setsLogged: counted\?\.logged \?\? nonWarmupToday\.length/.test(dash) && /setsPlanned: counted\?\.planned \?\? planned/.test(dash))
}

console.log('\n5. The page leaves room for the floating bars')
{
  const app = read('src/App.tsx')
  check('the main page pads by the dock\'s measured height', /<DockPaddedMain className=/.test(app) && /paddingBottom: `calc\(7rem \+ \$\{dockHeightPx\}px\)`/.test(app) && !/<main className="max-w-6xl mx-auto px-4 pt-12 pb-28/.test(app))
}

console.log('\n6. The shopping list')
{
  const liquids = ['milk semi skimmed', 'oat milk', 'olive oil', 'orange juice', 'chicken stock', 'double cream']
  const solids = ['cream cheese', 'ice cream', 'milk chocolate', 'protein powder', 'peanut butter', 'greek yoghurt', 'cheddar', 'butter']
  check('liquids are bought by volume', liquids.every(boughtByVolume), liquids.filter(k => !boughtByVolume(k)))
  check('...cheese, spreads, powders and chocolate are not', solids.every(k => !boughtByVolume(k)), solids.filter(boughtByVolume))
  const store = read('src/lib/grocery-store.ts')
  check('the list writes ml for them', /unit: boughtByVolume\(agg\.canonicalKey\) \? 'ml' : 'g'/.test(store))
  check('the line for meals left off names a meal out', /eaten out or cooked for you/.test(ELSEWHERE_WORDS.listLine(1)))
}

console.log('\n7. Moves')
{
  const s = (day: string) => ({ day, focus: 'Full Body', exercises: [{ name: 'Goblet Squat', sets: 3, reps: '8', rest: '90s' }] }) as unknown as WorkoutDay
  const plan = [s('Tuesday'), s('Thursday'), s('Saturday')]
  const weekOf = (d: string) => (d >= '2026-11-14' && d <= '2026-11-20' ? 1 : 2)
  // Saturday's session already moved to Sunday; now Thursday's is asked onto Sunday.
  const r = resolveMoveTarget({ fromDate: '2026-11-19', requestedDate: '2026-11-15', todayDate: '2026-11-14', plan, weekOf, existing: [{ fromDate: '2026-11-14', toDate: '2026-11-15' }] } as never)
  check('a day holding only a moved session: "moved_in", never "busy"', r.ok && (r as { requestedWhyNot?: string }).requestedWhyNot === 'moved_in', r)
  const r2 = resolveMoveTarget({ fromDate: '2026-11-17', requestedDate: '2026-11-19', todayDate: '2026-11-14', plan, weekOf, existing: [] } as never)
  check('...a day with its own session is still "busy" (the fixture binds)', r2.ok && (r2 as { requestedWhyNot?: string }).requestedWhyNot === 'busy', r2)
  const chat = read('src/components/ChatAssistant.tsx')
  check('the card and the receipt say it', /requestedWhyNot === 'moved_in' \? `\$\{target\.requestedDayName\} already has another day's session moved onto it`/.test(chat)
    && /requestedWhyNot === 'moved_in' \? ` \(\$\{payload\.requestedDayName\} already had another day's session moved onto it\)`/.test(read('src/lib/pending-action-executor.ts')))
  const move = chat.slice(chat.indexOf('{ field: trueFromDayName, before: session.focus'), chat.indexOf('const buildScheduleChangeProposal'))
  check('the card names what the day holds now, never a fixed "Nothing scheduled"', move.length > 0 && !/before: 'Nothing scheduled'/.test(move) && /sessionForDate\(\{ date: target\.date/.test(move))
  check('...and prints no coach note of its own', move.length > 0 && !/rationale: reason/.test(move))
}

console.log('\n8. A rebuild card in date order')
{
  const day = (d: string, focus: string) => ({ day: d, focus, exercises: [{ name: focus, sets: 3, reps: '8', rest: '90s' }] })
  const before = [{ week_number: 1, days: [day('Tuesday', 'A'), day('Thursday', 'B'), day('Saturday', 'C')] }] as unknown as MesocycleWeek[]
  const after = [{ week_number: 1, days: [day('Monday', 'X'), day('Friday', 'Y')] }] as unknown as MesocycleWeek[]
  const lines = describeRebuild(before, after, { start: { fromWeek: 1, fromDate: '2026-11-14', said: 'today' }, planCreatedAt: '2026-11-14T20:40:00' } as never)
  const week = lines.find(l => /^Week 1:/.test(l)) ?? ''
  const order = ['Sat 14', 'Mon 16', 'Tue 17', 'Thu 19', 'Fri 20'].map(d => week.indexOf(d))
  check('a week begun on a Saturday reads Saturday first, then on in date order', order.every(i => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), week)
}

console.log('\n9. The coach')
{
  const coach = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('never a blanket safety assurance about the plan', /NEVER A BLANKET SAFETY ASSURANCE about their plan/.test(coach))
  check('one meal per log_meal call', /ONE MEAL PER CALL/.test(coach))
}

console.log('\n10. Standard UK packs (his ruling "Add standard UK packs")')
{
  const deal = computeMealMacros([
    { name: 'chicken and bacon sandwich', quantity: 1, unit: 'whole' },
    { name: 'ready salted potato crisps', quantity: 1, unit: 'bag' },
    { name: 'coca cola original', quantity: 1, unit: 'can' },
  ] as never)
  check('"a meal deal, one of each, normal sizes" is counted whole (sandwich 200 g, crisps 25 g, can 330 ml)', deal.coverage === 1 && deal.unmatched.length === 0 && deal.kcal > 650 && deal.kcal < 850, { kcal: deal.kcal, coverage: deal.coverage, unmatched: deal.unmatched })
  const sandwich = lookupIngredient('chicken and bacon sandwich')
  check('a sandwich carries every allergen it may hold (gluten, egg, dairy, mustard, soy, sesame) and its pork', !!sandwich && ['contains_gluten', 'contains_egg', 'contains_dairy', 'contains_mustard', 'contains_soy', 'contains_sesame', 'contains_pork'].every(t => (sandwich.tags as Record<string, boolean>)[t] === true), sandwich?.tags)
  const crisps = lookupIngredient('crisps')
  check('"crisps" with no flavour carries the flavours\' allergens (dairy, gluten, shellfish); ready salted does not', !!crisps && (crisps.tags as Record<string, boolean>).contains_dairy === true && (crisps.tags as Record<string, boolean>).contains_shellfish === true && !(lookupIngredient('ready salted crisps')?.tags as Record<string, boolean> | undefined)?.contains_dairy)
  check('a diet cola is near nothing; a regular can about 140 kcal', (lookupIngredient('diet coke')?.per100g.kcal ?? 99) < 1 && Math.abs((lookupIngredient('coke')?.per100g.kcal ?? 0) * 3.3 - 139) < 5)
}

console.log('\n11. A moved session survives a change of days (his "Keep it, still owed")')
{
  const day = (d: string) => ({ day: d, focus: d, exercises: [{ name: 'Goblet Squat', sets: 3, reps: '8', rest: '90s' }] })
  const meso = [1, 2].map(n => ({ week_number: n, days: [day('Tuesday'), day('Thursday'), day('Saturday')] })) as unknown as MesocycleWeek[]
  const cal = { planCreatedAt: '2026-11-14T08:00:00', today: '2026-11-14', loggedDates: [], closedDates: [] }
  const cal0 = { planCreatedAt: cal.planCreatedAt, today: cal.today }
  const withMove = buildOwedGuard(meso, { ...cal0, moves: [{ fromDate: '2026-11-14', toDate: '2026-11-15' }] })
  const noMove = buildOwedGuard(meso, { ...cal0, moves: [] })
  check('Saturday\'s session, moved to Sunday and not yet done, is kept by a rebuild', withMove(1, 'Saturday') === true)
  check('...with no move the same row is open to the rebuild (the fixture binds)', noMove(1, 'Saturday') === false)
  check('...a move to a day already gone keeps nothing', buildOwedGuard(meso, { ...cal0, today: '2026-11-16', moves: [{ fromDate: '2026-11-14', toDate: '2026-11-15' }] })(1, 'Saturday') === false)
  check('...and an injury ease-off still reaches a moved session (the trained-day guard leaves it open)', buildDayGuard(meso, { ...cal, moves: [{ fromDate: '2026-11-14', toDate: '2026-11-15' }] })(1, 'Saturday') === false)
  const adapt = read('src/lib/plan-adaptations.ts')
  check('the rebuild asks the owed guard before changing a day', /const owed = buildOwedGuard\(mesocycle, context\.calendar\)/.test(adapt) && /!context\.isProtected\(original\.week_number, dayName\) && !owed\(original\.week_number, dayName\)/.test(adapt))
  const before = [{ week_number: 1, days: [day('Tuesday'), day('Thursday'), day('Saturday')] }] as unknown as MesocycleWeek[]
  const after = [{ week_number: 1, days: [day('Monday'), day('Friday'), day('Saturday')] }] as unknown as MesocycleWeek[]
  const lines = describeRebuild(before, after, { start: { fromWeek: 1, fromDate: '2026-11-14', said: 'today' }, planCreatedAt: '2026-11-14T08:00:00', moves: [{ fromDate: '2026-11-14', toDate: '2026-11-15' }], today: '2026-11-14' } as never)
  check('the change-days card says the moved session stays, before the tap', lines.some(l => /moved to Sun 15 Nov stays there/.test(l)), lines)
  const past = describeRebuild(before, after, { start: { fromWeek: 1, fromDate: '2026-11-16', said: 'today' }, planCreatedAt: '2026-11-14T08:00:00', moves: [{ fromDate: '2026-11-14', toDate: '2026-11-15' }], today: '2026-11-16' } as never)
  check('...and a move to a day already gone is not announced', !past.some(l => /stays there/.test(l)), past)
  const app = read('src/App.tsx'); const chat = read('src/components/ChatAssistant.tsx')
  check('...on both surfaces (the moves are handed to the card)', /moves: context\.calendar\.moves, today \}\) \}\)/.test(app) && /moves: context\.calendar\.moves, today: context\.calendar\.today \}\)/.test(chat))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:qa-batch3 FAILED'); process.exit(1) }
console.log('Batches 2 and 3 of 14 Nov hold.')
