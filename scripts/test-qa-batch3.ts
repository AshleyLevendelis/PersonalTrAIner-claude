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
import { firmFoodExclusions, foodDislikesToAsk, DISLIKE_ASK } from '../src/lib/food-exclusions'
import { computeMealMacros } from '../src/lib/food-db'
import { datesFrom, buildRotation, serveMealWeek } from '../src/lib/meal-rotation'
import { isRedFlagTurn, unpromptedAfterRedFlag, redFlagStateAt, RED_FLAG_WORDS } from '../src/lib/red-flag'
import * as appMoments from '../src/lib/coach-moments'
import * as serverMoments from '../supabase/functions/_shared/coach-moments'
import { pickUnprompted, RED_FLAG_CHECKIN_MOMENT } from '../src/lib/coach-nudge'
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

console.log('\n12. "I don\'t like X" is asked about; a swap holds the next day (his "Ask, and hold Tuesday")')
{
  check('"I don\'t like salmon", "I hate mushrooms", "not a fan of tuna": asked, never saved at once',
    ["I don't like salmon", 'I hate mushrooms', 'not a fan of tuna'].every(t => foodDislikesToAsk(t).length === 1 && firmFoodExclusions(t).length === 0))
  check('an allergy, "I don\'t eat pork", "no pork for me" and "Never give me salmon": saved at once, never asked',
    ["I'm allergic to peanuts", "I don't eat pork", 'no pork for me', 'Never give me salmon'].every(t => firmFoodExclusions(t).length === 1 && foodDislikesToAsk(t).length === 0))
  check('...and in one message each is read on its own', JSON.stringify(foodDislikesToAsk("I'm allergic to peanuts and I don't like salmon")) === '["salmon"]' && JSON.stringify(firmFoodExclusions("I'm allergic to peanuts and I don't like salmon")) === '["peanuts"]')
  const turn = DISLIKE_ASK.turn(['salmon'])
  check('the app asks "just this meal, or never?" with two buttons, and the "never" button is itself a firm statement',
    /just this meal, or should I keep salmon off your meals for good\?/.test(turn) && /\[QUICK_REPLIES: "Just this meal" \| "Never give me salmon"\]/.test(turn) && firmFoodExclusions(DISLIKE_ASK.never(['salmon'])).length === 1)
  const chat = read('src/components/ChatAssistant.tsx')
  check('the coach\'s save of a food dislike waits for the answer, and the backstop saves only what was said firmly',
    /args\?\.polarity !== 'like' && toAsk\.length > 0\) \{\s*return \{ text: DISLIKE_ASK\.turn\(toAsk\) \}/.test(chat) && /mergeFoodsToAvoid\(already, firmFoodExclusions\(userText\)\)/.test(chat))
  check('...and when the coach recorded nothing, the app asks under its reply', /const toAsk = foodDislikesToAsk\(userText\)\s*if \(toAsk\.length > 0\) \{\s*const turn = DISLIKE_ASK\.turn\(toAsk\)/.test(chat))
  const coach = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the coach is told the app asks, and not to record or ask it itself', (coach.match(/just this meal, or never\?/g) ?? []).length >= 2)

  // HOLD TUESDAY: swap a day's dinner for another of the plan's dinners; the next day's lunch is re-made from it, and
  // the next day's breakfast and dinner keep the dishes the plan served.
  type Opt = { slot: string; name: string; ingredients: { name: string; quantity: number; unit: string }[]; tags: string[]; macros: { calories: number; protein: number; carbs: number; fat: number } }
  const dish = (slot: string, name: string, chicken: number, rice: number, oil: number): Opt => {
    const ingredients = [{ name: 'chicken breast', quantity: chicken, unit: 'g' }, { name: 'white rice', quantity: rice, unit: 'g' }, { name: 'olive oil', quantity: oil, unit: 'g' }]
    const c = computeMealMacros(ingredients)
    return { slot, name, ingredients, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } }
  }
  const pools = {
    breakfast: [dish('breakfast', 'Oats bowl', 60, 150, 8), dish('breakfast', 'Rice porridge', 55, 160, 7), dish('breakfast', 'Egg rice', 65, 140, 9), dish('breakfast', 'Small bowl', 55, 110, 6)],
    lunch: [dish('lunch', 'Chicken salad', 150, 200, 12), dish('lunch', 'Rice and greens', 140, 220, 11), dish('lunch', 'Grain bowl', 160, 190, 13)],
    dinner: [dish('dinner', 'Tray bake', 170, 220, 14), dish('dinner', 'Rice pot', 160, 240, 12), dish('dinner', 'Baked chicken', 180, 210, 15), dish('dinner', 'Light supper', 165, 150, 9), dish('dinner', 'Chicken broth bowl', 170, 130, 8)],
  }
  const t = [pools.breakfast[0], pools.lunch[0], pools.dinner[0]].reduce((a, o) => ({ calories: a.calories + o.macros.calories, protein: a.protein + o.macros.protein, carbs: a.carbs + o.macros.carbs, fat: a.fat + o.macros.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
  const today = '2026-09-27'
  const dates = datesFrom(today, 7)
  const shape = { mealsPerDay: 3, includeSnacks: false, batchCooking: true }
  const serving = (pinsByDate: Record<string, Record<string, unknown>>) => serveMealWeek({ today, dates, todaysPins: {}, pinsByDate, pools, targets: t, softLikedFoods: [], shape, rotation: buildRotation(pools as never, t, [], shape as never) } as never)
  const base = serving({})
  let cases = 0, lunchMoved = 0, held = 0, collisions = 0, ghost = 0; const broke: string[] = []
  for (let i = 1; i < dates.length - 1; i++) {
    const was = base[i].day.chosen.dinner?.name
    for (const other of pools.dinner.filter(d => d.name !== was)) {
      const after = serving({ [dates[i]]: { dinner: other } })
      const next = after[i + 1].day.chosen, before = base[i + 1].day.chosen
      cases++
      if (next.lunch?.name !== before.lunch?.name) lunchMoved++
      // A lunch served as last night's leftovers is of the dinner actually cooked, never of the one swapped out.
      if (next.lunch?.leftoverFrom === 'dinner' && was && next.lunch.name.startsWith(was) && !next.lunch.name.startsWith(other.name)) ghost++
      // A dinner that would be the lunch's own dish again changes (never the same dish twice a day); nothing else does.
      const dinnerOk = before.dinner?.name === other.name ? (!!next.dinner && !!next.lunch && !next.lunch.name.startsWith(next.dinner.name) && !next.dinner.name.startsWith(next.lunch.name)) : next.dinner?.name === before.dinner?.name
      if (before.dinner?.name === other.name) collisions++
      if (next.breakfast?.name === before.breakfast?.name && dinnerOk) held++
      else broke.push(`${dates[i]} -> ${other.name}: ${before.breakfast?.name}/${before.dinner?.name} became ${next.breakfast?.name}/${next.dinner?.name}`)
    }
  }
  check('the fixture binds: a swapped dinner re-makes the next day\'s lunch in most cases', cases >= 10 && lunchMoved >= cases / 2, { cases, lunchMoved })
  check('...and the next day\'s breakfast and dinner keep the dishes the plan served, every time (where the lunch would repeat the dinner\'s dish, one of the two changes)', held === cases, broke.slice(0, 4))
  check('...and the next day\'s lunch is never the leftovers of the dinner swapped out', ghost === 0, { ghost })
  check('...the repeat case is in the fixture, so that exception is tested too', collisions >= 1, { collisions })
}

console.log('\n13. After a red flag the app parks the session and goes quiet (his "Park it, go quiet")')
{
  const ref = 'That needs a GP to look at it, so please stop for today and get it checked.'
  check('a symptom in his words answered by a referral is a red flag: chest pain, sharp pain, dizziness, pelvic pain',
    isRedFlagTurn('I had chest pain on the bike', ref) && isRedFlagTurn('sharp pain in my knee when I squat', 'See a physio before you load it again.')
    && isRedFlagTurn('felt really dizzy after the second set', 'Please speak to your doctor.') && isRedFlagTurn("I've got pelvic pain today", 'Talk to your midwife today.'))
  check('...ordinary soreness answered with advice is not, nor a referral about something else, nor a symptom answered without one',
    !isRedFlagTurn('my legs are sore from yesterday', 'Totally normal, ease in with a warm-up.')
    && !isRedFlagTurn('should I take creatine?', 'Check with your doctor if you take any medication.')
    && !isRedFlagTurn('I had chest pain on the bike', 'Let us do lighter work today.'))
  const t0 = Date.parse('2026-11-14T10:00:00Z'), h = 3600_000
  const st = redFlagStateAt(t0)
  check('quiet straight away; the one check-in on a later open; quiet again once asked; normal after 48 hours',
    unpromptedAfterRedFlag(st, t0 + h) === 'quiet' && unpromptedAfterRedFlag(st, t0 + 5 * h) === 'checkin'
    && unpromptedAfterRedFlag({ ...st, checkedIn: true }, t0 + 30 * h) === 'quiet' && unpromptedAfterRedFlag({ ...st, checkedIn: true }, t0 + 49 * h) === 'normal'
    && unpromptedAfterRedFlag(null, t0) === 'normal')
  const F = { localHour: 9, awaitingFeel: false, plannedToday: true, loggedToday: false, missedYesterday: false, daysSinceAnyLog: 0, blockJustEnded: false, beatTargetPending: false }
  const quiet = { quiet_until: new Date(t0 + 48 * h).toISOString() }
  check('no reminder while the quiet holds, on the phone\'s server and in the app alike; one again after it',
    [appMoments, serverMoments].every(m => m.momentsToRaise(F as never, quiet as never, t0 + h).length === 0 && m.momentsToRaise(F as never, quiet as never, t0 + 49 * h).length > 0))
  check('...and the server and the chat both hand it the time', /momentsToRaise\(facts, profile\.settings, deps\.now\.getTime\(\)\)/.test(read('supabase/functions/_shared/reach-out.ts'))
    && /momentsToRaise\(facts, reminderSettings, now\)/.test(read('src/components/ChatAssistant.tsx')))
  const base = { now: t0 + h, today: '2026-11-14', cap: 3, unpromptedToday: 0, lastUnpromptedAt: 0, momentsSaidToday: [], said: [], greeting: 'Hey Priya',
    event: { kind: 'due', text: 'Ready for your session?', chips: [], keys: ['due:x'] } as never, hello: () => ({ text: 'Hey Priya — morning!', chips: [] }), moments: [] }
  const checkIn = { text: RED_FLAG_WORDS.checkin('Hey Priya'), chips: RED_FLAG_WORDS.checkinChips, key: 'red-flag-checkin:1' }
  check('the chat says nothing unprompted while quiet, not even a due session or the hello', pickUnprompted({ ...base, redFlag: { mode: 'quiet', checkIn } }) === null)
  const ci = pickUnprompted({ ...base, cap: 0, unpromptedToday: 3, redFlag: { mode: 'checkin', checkIn } })
  check('...the check-in is said once, whatever the day\'s limit, and asks how he is', ci?.moment === RED_FLAG_CHECKIN_MOMENT && /how are you feeling today\?/.test(ci.text)
    && pickUnprompted({ ...base, said: ['red-flag-checkin:1'], redFlag: { mode: 'checkin', checkIn } }) === null)
  const chat = read('src/components/ChatAssistant.tsx')
  const park = chat.slice(chat.indexOf('if (!failed && finalStatus === \'complete\' && isRedFlagTurn(userText, cleanedText)'), chat.indexOf('// The food backstop, after the coach'))
  check('a red flag ends an open workout where it stands (sets kept) and clears the rest banner', park.length > 0 && /if \(wasRunning\) await activeSession\.finishSession\(\)/.test(park) && /else if \(activeSession\.restEndsAt\) activeSession\.dismissRest\(\)/.test(park))
  check('...and stores the quiet for the phone\'s reminders as well as this phone', /quiet_until: new Date\(state\.until\)\.toISOString\(\)/.test(park) && /saveSwitches\(profile\.id, next\)/.test(park) && /writeRedFlag\(profile\.id, state\)/.test(park))
  check('...and the check-in, once said, is remembered', /if \(pick\.moment === RED_FLAG_CHECKIN_MOMENT && redFlag\) writeRedFlag\(profileId, \{ \.\.\.redFlag, checkedIn: true \}\)/.test(chat))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:qa-batch3 FAILED'); process.exit(1) }
console.log('Batches 2 and 3 of 14 Nov hold.')
