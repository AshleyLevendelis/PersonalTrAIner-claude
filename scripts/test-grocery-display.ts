/**
 * test:grocery-display — what a shopping line SAYS on the grocery screen
 * (design 3a/3b, 27 Sep 2026), from src/lib/grocery-display.ts, checked
 * without a browser. verify:grocery drives the same rules on the real screen.
 *
 * Every boundary uses literal numbers, not the module's own constants: a
 * check compared against the constant that drives it can only agree with
 * itself.
 */
import {
  formatShoppingQuantity, stepperReadout, exactLabel, stepQuantity, purposeLine, mealRefLines, slotLabel, gramStep, coverageSentence,
} from '../src/lib/grocery-display'

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const item = (display_name: string, quantity: number, unit = 'g') => ({ display_name, quantity, unit })
const ref = (day: number, slot: string, mealName = 'Meal') => ({ day, slot, mealName })

console.log('grocery display')

console.log('\n[1] What a line is for')
check('one slot: "Lunch ×5"', purposeLine([0, 1, 2, 3, 4].map(d => ref(d, 'lunch'))) === 'Lunch ×5')
check('two slots, the bigger first: "Lunch ×3 · Dinner ×2"', purposeLine([ref(0, 'dinner'), ref(1, 'lunch'), ref(2, 'dinner'), ref(3, 'lunch'), ref(4, 'lunch')]) === 'Lunch ×3 · Dinner ×2',
  purposeLine([ref(0, 'dinner'), ref(1, 'lunch'), ref(2, 'dinner'), ref(3, 'lunch'), ref(4, 'lunch')]))
check('never more than two, and the smallest is the one dropped', purposeLine([ref(0, 'snack'), ref(1, 'lunch'), ref(2, 'lunch'), ref(3, 'dinner'), ref(4, 'dinner'), ref(5, 'dinner')]) === 'Dinner ×3 · Lunch ×2')
check('a line with no meals behind it (added by hand) says nothing', purposeLine([]) === '')
check('slot names read as words, a numbered slot as its kind', slotLabel('breakfast') === 'Breakfast' && slotLabel('snack_2') === 'Snack' && slotLabel('brunch') === 'Brunch')

console.log('\n[2] The meals it came from')
const refs = [ref(3, 'lunch', 'Wrap'), ref(0, 'dinner', 'Traybake'), ref(0, 'lunch', 'Rice bowl')]
check('with the build date known, weekdays are named from it (16 Sep 2026 is a Wednesday)', JSON.stringify(mealRefLines(refs, '2026-09-16')) === JSON.stringify(['Wed · Lunch · Rice bowl', 'Wed · Dinner · Traybake', 'Sat · Lunch · Wrap']), mealRefLines(refs, '2026-09-16'))
check('...in day order, then meal order within a day', mealRefLines(refs, '2026-09-16')[0].includes('Lunch') && mealRefLines(refs, '2026-09-16')[1].includes('Dinner'))
check('with no build date, the line says the day offset it actually holds ("Day 1"), never a guessed weekday', JSON.stringify(mealRefLines(refs, null)) === JSON.stringify(['Day 1 · Lunch · Rice bowl', 'Day 1 · Dinner · Traybake', 'Day 4 · Lunch · Wrap']), mealRefLines(refs, null))
check('a week crossing a month end still lands on the right weekday (Tue 29 Sep + 5 = Sun)', mealRefLines([ref(5, 'lunch', 'X')], '2026-09-29')[0] === 'Sun · Lunch · X', mealRefLines([ref(5, 'lunch', 'X')], '2026-09-29'))

console.log('\n[3] The stepper: counted items step whole units')
check('broccoli is shown by the head: 600g reads "2 heads"', formatShoppingQuantity(item('Broccoli', 600)).primary === '2 heads' && stepperReadout(item('Broccoli', 600)) === '2 heads')
check('plus is one more head, stored as three heads\' weight (900g)', stepQuantity(item('Broccoli', 600), 1) === 900)
check('minus is one fewer (300g)', stepQuantity(item('Broccoli', 600), -1) === 300)
check('...and at one head there is no minus (null), never zero heads', stepQuantity(item('Broccoli', 300), -1) === null)
check('an odd weight snaps to whole units before stepping: 650g (2 heads) steps to 900g, not 950g', stepQuantity(item('Broccoli', 650), 1) === 900, stepQuantity(item('Broccoli', 650), 1))

console.log('\n[4] The stepper: weights step the amount they are shown in')
check('the grid is 5g, 10g, 50g, 100g by size', gramStep(10) === 5 && gramStep(50) === 10 && gramStep(300) === 50 && gramStep(1180) === 100)
check('1,180g reads "1.2 kg" on the stepper, "exact 1,180g" beside it', stepperReadout(item('Chicken breast', 1180)) === '1.2 kg' && exactLabel(item('Chicken breast', 1180)) === 'exact 1,180g', [stepperReadout(item('Chicken breast', 1180)), exactLabel(item('Chicken breast', 1180))])
check('plus from 1,180g is 1,300g — up from the shown 1.2 kg, not from the raw figure', stepQuantity(item('Chicken breast', 1180), 1) === 1300, stepQuantity(item('Chicken breast', 1180), 1))
check('minus from 1,180g is 1,100g', stepQuantity(item('Chicken breast', 1180), -1) === 1100)
check('small amounts step small: 300g → 350g, 45g → 40g', stepQuantity(item('Spinach', 300), 1) === 350 && stepQuantity(item('Harissa', 45), -1) === 40, [stepQuantity(item('Spinach', 300), 1), stepQuantity(item('Harissa', 45), -1)])
check('the smallest amount has no minus: 5g of anything', stepQuantity(item('Harissa', 5), -1) === null)
check('the ceiling holds: nothing steps past 100kg', stepQuantity(item('Rice', 100_000), 1) === null)
check('a manual unit steps by one ("2 fillets" → 3, 1 → none)', stepQuantity(item('Salmon fillet', 2, 'fillets'), 1) === 3 && stepQuantity(item('Salmon fillet', 1, 'fillets'), -1) === null)
check('a manual unit reads and labels as itself', stepperReadout(item('Salmon fillet', 2, 'fillets')) === '2 fillets' && exactLabel(item('Salmon fillet', 2, 'fillets')) === 'exact 2 fillets')


console.log('\n[dates] A row that carries its date, and the note that names the days (27 Sep 2026)')
// A REFERENCE WITH ITS OWN DATE WINS over the offset — a day added from the
// strip has no build date to count from, and a list covering Friday and next
// Tuesday has no single one.
check('a dated reference names its own weekday, whatever the build memo says',
  mealRefLines([{ day: 0, slot: 'dinner', mealName: 'Rice pot', date: '2026-09-18' }], '2026-09-01')[0] === 'Fri · Dinner · Rice pot',
  mealRefLines([{ day: 0, slot: 'dinner', mealName: 'Rice pot', date: '2026-09-18' }], '2026-09-01'))
check('...and dated references sort by their dates', mealRefLines([
  { day: 0, slot: 'lunch', mealName: 'B', date: '2026-09-19' }, { day: 5, slot: 'lunch', mealName: 'A', date: '2026-09-18' },
], null).map(l => l.split(' · ')[2]).join() === 'A,B')
const T = '2026-09-16'
const run = (from: number, n: number) => Array.from({ length: n }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`)
check('a Rebuild from today reads as it always did', coverageSentence(run(16, 7), T) === 'Built from your next 7 days of meals.', coverageSentence(run(16, 7), T))
check('...and one day from today is "today\'s meals"', coverageSentence(run(16, 1), T) === "Built from today's meals.")
check('one added day is named in full', coverageSentence(['2026-09-18'], T) === "Built from Friday's meals.", coverageSentence(['2026-09-18'], T))
check('a run that does not start today says so, with its ends', coverageSentence(run(18, 3), T) === 'Built from 3 days of meals, Fri 18 to Sun 20 Sept.', coverageSentence(run(18, 3), T))
check('...across a month end both months are named', coverageSentence(['2026-09-30', '2026-10-01'], T) === 'Built from 2 days of meals, Wed 30 Sept to Thu 1 Oct.', coverageSentence(['2026-09-30', '2026-10-01'], T))
check('a gap is a separate run, not "3 days" stretched over it', coverageSentence(['2026-09-18', '2026-09-21', '2026-09-22'], T) === 'Built from the meals for Fri 18 Sept and Mon 21 to Tue 22 Sept.', coverageSentence(['2026-09-18', '2026-09-21', '2026-09-22'], T))
check('...and a run that started before today is not "your next" days', coverageSentence(run(14, 4), T) === 'Built from 4 days of meals, Mon 14 to Thu 17 Sept.', coverageSentence(run(14, 4), T))
check('no dated rows: no sentence, so the screen falls back to its memo', coverageSentence([], T) === null)

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('grocery display: all checks passed')
