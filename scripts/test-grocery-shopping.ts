/**
 * Gate: the shopping list reads like a shopping list.
 *
 * 9 Oct 2026, the test log's M23 and L26. Run against the list as it was,
 * this gate's own week of meals produced "white rice cooked" 650g and "pasta
 * cooked" 300g, with eggs under Meat & Fish, butter under Dry Goods and tofu
 * beside the chicken; ticking a row said "blueberries is in the trolley"; and
 * a list that had never been built told you to tap "Rebuild".
 *
 * WHAT IS HELD:
 *   1. aisles — a protein is in Meat & Fish only if it is meat or fish; eggs
 *      and butter are with dairy, and the aisle is called "Dairy & eggs";
 *   2. names and amounts — no row is named "... cooked", and a recipe's cooked
 *      grams become the dry grams to buy; an amount somebody typed is left
 *      alone; the row's KEY never changes;
 *   3. the tick's sentence and the build button's label.
 */

const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
// The harness's stand-in database asks `window` whether the network is down.
if (!('window' in globalThis)) Object.defineProperty(globalThis, 'window', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true })

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const { makeFakeSupabase } = await import('../.tour-harness/fake-supabase')
  const db: Record<string, Record<string, unknown>[]> = { grocery_items: [] }
  setSupabaseClient(makeFakeSupabase(db) as never)
  const { FOOD_DB, lookupIngredient } = await import('../src/lib/food-db')
  const { resolveGroceryTarget, AS_BOUGHT, generateGroceryList, addItemLocal, getAllItems, flushPending } = await import('../src/lib/grocery-store')
  const { GROCERY_AISLE_LABEL, trolleyToast, buildListLabel, formatShoppingQuantity } = await import('../src/lib/grocery-display')

  const aisle = (name: string) => resolveGroceryTarget(name).category

  // -------------------------------------------------------------------------
  console.log('\n1. Aisles')
  // -------------------------------------------------------------------------
  check('eggs are with dairy', aisle('egg') === 'dairy' && aisle('egg white') === 'dairy' && aisle('2 eggs'.replace(/^\d+ /, '')) === 'dairy', [aisle('egg'), aisle('egg white')])
  check('...and the aisle says so: "Dairy & eggs"', GROCERY_AISLE_LABEL.dairy === 'Dairy & eggs', GROCERY_AISLE_LABEL.dairy)
  check('the aisle names are in one case ("Meat & fish", "Dry goods"), not two', GROCERY_AISLE_LABEL.meat_fish === 'Meat & fish' && GROCERY_AISLE_LABEL.dry_goods === 'Dry goods' && Object.values(GROCERY_AISLE_LABEL).every(l => /^[A-Z][a-z& ]*$/.test(l)), GROCERY_AISLE_LABEL)
  check('butter and ghee are with dairy', aisle('butter') === 'dairy' && aisle('ghee') === 'dairy', [aisle('butter'), aisle('ghee')])
  check('oils, nuts and seeds stay in dry goods', ['olive oil', 'almonds', 'chia seeds', 'peanut butter'].every(n => aisle(n) === 'dry_goods'))
  const meatFree = ['tofu firm', 'tofu silken', 'tempeh', 'seitan', 'seitan strips', 'soy mince', 'quorn mince', 'quorn fillet', 'vegan mince', 'vegan sausage', 'falafel']
  check('tofu, tempeh, seitan, Quorn and the meat-free minces are not in Meat & Fish', meatFree.every(n => aisle(n) !== 'meat_fish'), meatFree.filter(n => aisle(n) === 'meat_fish'))
  check('...and Quorn (bound with egg) is not filed under "Dairy & eggs" either', aisle('quorn mince') === 'dry_goods' && aisle('quorn fillet') === 'dry_goods', [aisle('quorn mince'), aisle('quorn fillet')])
  check('beans, lentils and protein powder are still dry goods', ['chickpeas', 'lentils red', 'whey protein powder'].every(n => aisle(n) === 'dry_goods'))
  // THE WHOLE TABLE, not a sample: everything in Meat & Fish is meat or fish, and every meat or fish is there.
  const isAnimal = (f: { tags: Record<string, unknown> }) => !!(f.tags.contains_meat || f.tags.contains_pork || f.tags.contains_fish || f.tags.contains_shellfish)
  const proteins = FOOD_DB.filter(f => f.category === 'protein')
  const wrongIn = proteins.filter(f => aisle(f.name) === 'meat_fish' && !isAnimal(f)).map(f => f.name)
  const wrongOut = proteins.filter(f => aisle(f.name) !== 'meat_fish' && isAnimal(f)).map(f => f.name)
  check(`of ${proteins.length} protein foods: nothing in Meat & Fish that is not meat or fish`, proteins.length > 60 && wrongIn.length === 0, wrongIn)
  check('...and no meat or fish anywhere else', wrongOut.length === 0, wrongOut)
  check('chicken, salmon, prawns and bacon are in Meat & Fish', ['chicken breast', 'salmon', 'prawns', 'bacon'].every(n => aisle(n) === 'meat_fish'))
  check('milk, yoghurt and cheese did not move', ['milk whole', 'greek yoghurt 0%', 'cheddar cheese'].every(n => aisle(n) === 'dairy'))
  check('the coach\'s receipt and the list read one table of aisle names',
    /CATEGORY_LABEL_FOR_RECEIPT = GROCERY_AISLE_LABEL/.test(code('src/components/ChatAssistant.tsx')) && /CATEGORY_LABEL = GROCERY_AISLE_LABEL/.test(code('src/components/GroceryList.tsx')))

  // -------------------------------------------------------------------------
  console.log('\n2. Names and amounts: what you buy, not what is on the plate')
  // -------------------------------------------------------------------------
  const targets = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const profileId = 'shop-1'
  // A week's worth in one day: 650g of cooked rice and 300g of cooked pasta — the test log's two rows.
  const pools = {
    lunch: [{ slot: 'lunch' as const, name: 'Rice bowl', macros: targets, tags: [], ingredients: [
      { name: 'white rice cooked', quantity: 650, unit: 'g' }, { name: 'chicken breast', quantity: 150, unit: 'g' }, { name: 'egg', quantity: 2, unit: 'whole' },
      { name: 'butter', quantity: 10, unit: 'g' }, { name: 'tofu firm', quantity: 100, unit: 'g' },
    ] }],
    dinner: [{ slot: 'dinner' as const, name: 'Pasta', macros: targets, tags: [], ingredients: [
      { name: 'penne', quantity: 300, unit: 'g' }, { name: 'quinoa cooked', quantity: 200, unit: 'g' }, { name: 'blueberries', quantity: 100, unit: 'g' },
    ] }],
  }
  await generateGroceryList({ profileId, mealPools: pools as never, targets, startDate: '2026-09-28', days: 1, mealShape: {} as never })
  await flushPending()
  const rows = await getAllItems(profileId)
  const byKey = (k: string) => rows.find(r => r.canonical_key === k)
  const rice = byKey('white rice cooked'), pasta = byKey('pasta cooked'), quinoa = byKey('quinoa cooked')
  check('the list was built (8 rows)', rows.length === 8, rows.map(r => r.display_name))
  check('no row is named "... cooked"', rows.length > 0 && !rows.some(r => /cooked/i.test(r.display_name)), rows.map(r => r.display_name))
  check('the rice row is "white rice"', rice?.display_name === 'white rice', rice?.display_name)
  check('...and asks for the dry weight: 650g cooked is 234g from the bag (x0.36)', rice?.quantity === 234 && rice?.unit === 'g', rice?.quantity)
  check('...which the row shows as about 250g, not 650g', !!rice && formatShoppingQuantity(rice).primary === '~250g', rice && formatShoppingQuantity(rice))
  check('the pasta row is "pasta", 300g cooked is 129g dry (x0.43)', pasta?.display_name === 'pasta' && pasta?.quantity === 129, [pasta?.display_name, pasta?.quantity])
  check('quinoa: 200g cooked is 66g dry (x0.33)', quinoa?.display_name === 'quinoa' && quinoa?.quantity === 66, [quinoa?.display_name, quinoa?.quantity])
  check('THE KEY DID NOT CHANGE (it is unique per profile; a new key would duplicate the row)',
    !!rice && !!pasta && !!quinoa && !rows.some(r => ['white rice', 'pasta', 'quinoa'].includes(r.canonical_key)), rows.map(r => r.canonical_key))
  check('a food that is bought as it is eaten is untouched (150g chicken, 100g blueberries)', byKey('chicken breast')?.quantity === 150 && byKey('blueberries')?.quantity === 100)
  check('on the real list: eggs and butter are under dairy, tofu is not under meat', byKey('egg')?.category === 'dairy' && byKey('butter')?.category === 'dairy' && byKey('tofu firm')?.category === 'dry_goods',
    [byKey('egg')?.category, byKey('butter')?.category, byKey('tofu firm')?.category])

  // Built twice: the same rows, the same keys, the same amounts (no drift, no duplicates).
  await generateGroceryList({ profileId, mealPools: pools as never, targets, startDate: '2026-09-28', days: 1, mealShape: {} as never })
  await flushPending()
  const again = await getAllItems(profileId)
  check('rebuilding gives the same eight rows and the same 234g of rice (the factor is not applied twice)',
    again.length === 8 && again.find(r => r.canonical_key === 'white rice cooked')?.quantity === 234, again.map(r => `${r.display_name} ${r.quantity}`))

  // AN AMOUNT SOMEBODY TYPED IS WHAT THEY MEAN TO BUY.
  const typed = addItemLocal({ profileId: 'shop-2', name: 'rice', quantity: 500, unit: 'g', source: 'manual', currentItems: [] })
  check('"500g rice" added by hand is 500g, not 180g', typed.row.quantity === 500 && typed.row.display_name === 'white rice' && typed.row.canonical_key === 'white rice cooked', typed.row)

  // Every entry in the table: a real food, a name that still finds that same food, a sane factor, no two rows with one name.
  const names = FOOD_DB.map(f => resolveGroceryTarget(f.name).displayName)
  check('no two foods share a shopping name', new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i))
  const entries = Object.entries(AS_BOUGHT)
  check('every as-bought entry is a food in the database', entries.length >= 12 && entries.every(([k]) => FOOD_DB.some(f => f.name === k)), entries.filter(([k]) => !FOOD_DB.some(f => f.name === k)).map(([k]) => k))
  check('...whose shopping name still finds the same food (the row looks its food up by that name)', entries.every(([k, v]) => lookupIngredient(v.name)?.name === k), entries.filter(([k, v]) => lookupIngredient(v.name)?.name !== k).map(([k]) => k))
  check('...with a dry-per-cooked factor a cook would recognise (between a fifth and a half)', entries.every(([, v]) => v.perCooked >= 0.2 && v.perCooked <= 0.5), entries.filter(([, v]) => !(v.perCooked >= 0.2 && v.perCooked <= 0.5)))
  check('every food whose database name says "cooked" has an as-bought entry', FOOD_DB.filter(f => /\bcooked\b/.test(f.name)).every(f => !!AS_BOUGHT[f.name]), FOOD_DB.filter(f => /\bcooked\b/.test(f.name) && !AS_BOUGHT[f.name]).map(f => f.name))
  check('no shopping name anywhere says "cooked"', !names.some(n => /\bcooked\b/.test(n)), names.filter(n => /\bcooked\b/.test(n)))

  // -------------------------------------------------------------------------
  console.log('\n3. What the screen says')
  // -------------------------------------------------------------------------
  check('ticking blueberries: "Blueberries — in the trolley"', trolleyToast('blueberries') === 'Blueberries — in the trolley', trolleyToast('blueberries'))
  check('...and no "is" for any name, singular or plural', !/\bis\b/.test(trolleyToast('eggs')) && !/\bis\b/.test(trolleyToast('white rice')), [trolleyToast('eggs'), trolleyToast('white rice')])
  check('a list the plan has never filled offers "Build my list"', buildListLabel([]) === 'Build my list' && buildListLabel([{ source: 'manual' }, { source: 'chat' }] as never) === 'Build my list')
  check('...and "Rebuild" once it has', buildListLabel([{ source: 'manual' }, { source: 'generated' }] as never) === 'Rebuild')
  const screen = code('src/components/GroceryList.tsx')
  // Source only — verify:grocery reads the button's words off the real screen.
  check('the screen prints the label in both places (the button and the empty list), and no fixed "Rebuild" of its own',
    (screen.match(/\{buildListLabel\(items\)\}/g) ?? []).length === 2 && !/^\s*Rebuild\s*$/m.test(screen) && !/tap Rebuild above/.test(screen))
  check('the toast is the phrasebook\'s', /\{trolleyToast\(toast\.name\)\}/.test(screen) && !/is in the trolley/.test(screen))
  // Her ruling: the list is never built behind her back. Nothing but her tap calls the builder.
  const calls = screen.match(/generateGroceryList\(/g) ?? []
  const handler = /const handleGenerate = [\s\S]*?\n {2}\}/.exec(screen)?.[0] ?? ''
  check('the list is still only built by her tap (one call, inside the button\'s handler, no effect builds it)',
    calls.length === 1 && /generateGroceryList\(/.test(handler) && !/useEffect\([^)]*handleGenerate/.test(screen), { calls: calls.length, inHandler: /generateGroceryList\(/.test(handler) })

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} grocery-shopping check(s) FAILED.`); process.exit(1) }
  console.log('The shopping list reads like a shopping list.')
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1) })
