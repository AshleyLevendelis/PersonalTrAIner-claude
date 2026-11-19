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

console.log('\n[3b] The list never shows less than the meals need (the Nutrition walk, 18 Nov 2026, N5)')
{
  const shown = (name: string, q: number, unit = 'g') => formatShoppingQuantity({ display_name: name, quantity: q, unit }).primary
  // A food bought by weight with no piece of its own, so the step rule is what is read.
  check('270 g reads "~300g", not "~250g" (it rounded to the nearest step, and came up short)', shown('Lean beef mince', 270) === '~300g', shown('Lean beef mince', 270))
  check('615 g reads "~650g", not "~600g"', shown('Lean beef mince', 615) === '~650g', shown('Lean beef mince', 615))
  check('an amount already on a step is shown as it is, with no "~"', shown('Lean beef mince', 300) === '300g' && shown('Lean beef mince', 1200) === '1.2kg', [shown('Lean beef mince', 300), shown('Lean beef mince', 1200)])
  check('1,110 g reads "~1.2kg" (the next step up, not down to 1.1)', shown('Lean beef mince', 1110) === '~1.2kg', shown('Lean beef mince', 1110))
  check('millilitres the same: 1,110 ml reads "~1.2L", 260 ml "~300ml"', shown('Semi-skimmed milk', 1110, 'ml') === '~1.2L' && shown('Semi-skimmed milk', 260, 'ml') === '~300ml', [shown('Semi-skimmed milk', 1110, 'ml'), shown('Semi-skimmed milk', 260, 'ml')])
  // EVERY AMOUNT ON A GRID: what is shown is never under what is needed, and never a whole step over.
  let short = 0, over = 0
  for (let g = 20; g <= 3000; g += 7) {
    const m = /^~?([\d.]+)(kg|g)$/.exec(shown('Lean beef mince', g))
    const got = m ? Number(m[1]) * (m[2] === 'kg' ? 1000 : 1) : NaN
    // A kilo figure is printed to one decimal, which is the 100 g step itself.
    if (!(got >= g - 1e-6)) short++
    if (!(got - g < gramStep(g) + 1e-6)) over++
  }
  check('over 20 g to 3 kg in 7 g steps: never under what is needed, never a whole step over', short === 0 && over === 0, { short, over })
  // Pieces: a quarter of one is let go, no more.
  const heads = (g: number) => shown('Broccoli', g)
  check('pieces round up too: 2.2 heads of broccoli is 2, 2.3 heads is 3 (it was 2 up to 2.49)', heads(660) === '2 heads' && heads(690) === '3 heads', [heads(660), heads(690)])
  check('...and one and a half is two, never one', heads(450) === '2 heads', heads(450))
  check('...and for pieces: 690 g of broccoli shows 3 heads, so plus is 4 heads (1,200 g) and minus is 2 (600 g)', stepQuantity(item('Broccoli', 690), 1) === 1200 && stepQuantity(item('Broccoli', 690), -1) === 600, [stepQuantity(item('Broccoli', 690), 1), stepQuantity(item('Broccoli', 690), -1)])
  check('the stepper moves the number he is looking at: 270 g shows 300, plus is 350, minus is 250', stepQuantity(item('Lean beef mince', 270), 1) === 350 && stepQuantity(item('Lean beef mince', 270), -1) === 250, [stepQuantity(item('Lean beef mince', 270), 1), stepQuantity(item('Lean beef mince', 270), -1)])
}

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

// MILLILITRES READ LIKE GRAMS (whole-app QA walk, 7 Nov 2026): "1000ml" sat beside "1kg".
{
  const ml = (q: number) => ({ display_name: 'semi-skimmed milk', quantity: q, unit: 'ml' })
  check('1,000ml reads "1L", as 1,000g reads "1kg"', formatShoppingQuantity(ml(1000)).primary === '1L' && formatShoppingQuantity(ml(1000)).exact === '1000ml', formatShoppingQuantity(ml(1000)))
  check('1,180ml reads "~1.2L", and the stepper says "1.2 L"', formatShoppingQuantity(ml(1180)).primary === '~1.2L' && stepperReadout(ml(1180)) === '1.2 L', [formatShoppingQuantity(ml(1180)), stepperReadout(ml(1180))])
  check('under a litre it stays in ml, rounded to the same step as grams', formatShoppingQuantity(ml(333)).primary === '~350ml')
}

// A PANTRY ITEM IS BOUGHT AS A BOTTLE OR A JAR (15 Nov 2026, the coeliac nurse: "Olive oil 10 ml").
{
  const row = (n: string, q: number, u = 'ml') => ({ display_name: n, quantity: q, unit: u })
  check('10ml of olive oil reads "1 bottle (uses 10ml)"', formatShoppingQuantity(row('olive oil', 10)).primary === '1 bottle (uses 10ml)', formatShoppingQuantity(row('olive oil', 10)))
  check('honey is a jar, paprika a pack, soy sauce a bottle',
    formatShoppingQuantity(row('honey', 20, 'g')).primary.startsWith('1 jar') && formatShoppingQuantity(row('paprika', 3, 'g')).primary.startsWith('1 pack')
    && formatShoppingQuantity(row('soy sauce', 30)).primary.startsWith('1 bottle'),
    [formatShoppingQuantity(row('honey', 20, 'g')).primary, formatShoppingQuantity(row('paprika', 3, 'g')).primary, formatShoppingQuantity(row('soy sauce', 30)).primary])
  check('coconut oil is a jar, not a bottle', formatShoppingQuantity(row('coconut oil', 10, 'g')).primary.startsWith('1 jar'), formatShoppingQuantity(row('coconut oil', 10, 'g')).primary)
  check('a lot of oil is shown as an amount (600ml)', formatShoppingQuantity(row('olive oil', 600)).primary === '600ml', formatShoppingQuantity(row('olive oil', 600)).primary)
  check('butter, peanut butter and broccoli are not pantry items',
    formatShoppingQuantity(row('butter', 20, 'g')).primary === '20g' && formatShoppingQuantity(row('peanut butter', 30, 'g')).primary === '30g'
    && !/bottle|jar|pack/.test(formatShoppingQuantity(row('broccoli', 378, 'g')).primary))
  check('a small amount of an ordinary food is still an amount (garlic 10g, oats 40g, spinach 50g)',
    ['garlic', 'oats', 'spinach'].every((n, i) => !/bottle|jar|pack/.test(formatShoppingQuantity(row(n, [10, 40, 50][i], 'g')).primary)),
    ['garlic', 'oats', 'spinach'].map((n, i) => formatShoppingQuantity(row(n, [10, 40, 50][i], 'g')).primary))
  check("the stepper keeps the real amount, so it never looks stuck", stepperReadout(row('olive oil', 10)) === '10 ml', stepperReadout(row('olive oil', 10)))
  check('the exact figure stays', formatShoppingQuantity(row('olive oil', 10)).exact === '10ml', formatShoppingQuantity(row('olive oil', 10)).exact)
}

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('grocery display: all checks passed')
