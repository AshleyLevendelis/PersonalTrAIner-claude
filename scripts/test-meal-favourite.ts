// ---------------------------------------------------------------------------
// A MEAL SOMEBODY ACTUALLY WANTS AGAIN
//
// Ashley, 19 Sep 2026, from four options: **a heart on the meal row.** The app
// never asks whether a meal was any good. She rejected asking after every meal,
// asking once a day, and inferring it from what got logged — the last because
// not logging usually means a busy evening, not a bad dinner, and an app that
// draws conclusions from silence will be confidently wrong.
//
// THE GAP THIS CLOSES WAS ALREADY THERE AND UNCOUNTED. `favorite_meals` has
// existed since July, carries a times_used counter, and is read into the
// coach's context every turn — so the coach has always known your favourites
// and the screen has never been able to name one. Coach-only, and not on the
// exceptions list.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { favouriteInputFromOption } from '../src/lib/favourite-meals'
import { survivesRegeneration, type PoolOption } from '../src/lib/meal-generation'
import { USER_REQUESTED_TAG, FAVOURITE_TAG } from '../src/lib/meal-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

// ===========================================================================
console.log('\n1. What gets marked')
// ===========================================================================
{
  const option: PoolOption = {
    slot: 'dinner', name: 'Harissa salmon',
    ingredients: [{ name: 'salmon fillet', quantity: 165, unit: 'g' }],
    macros: { calories: 640, protein: 44, carbs: 52, fat: 24 },
    tags: ['Other', 'standard'], prep: 'Sear, then roast.',
  }
  const input = favouriteInputFromOption(option)
  check('the meal is identified by NAME, the way picks and pools already identify one',
    input.name === option.name)
  check('its slot and macros come across', input.slot === 'dinner' && input.calories === 640 && input.protein === 44)
  check('so does the method, which the table has had a column for since July',
    input.prep === 'Sear, then roast.')
  check('a meal with no method maps to null rather than an empty string',
    favouriteInputFromOption({ ...option, prep: undefined }).prep === null)
}

// ===========================================================================
console.log('\n2. What the heart buys: it survives a regenerate')
// ===========================================================================
{
  check('a hearted meal is kept when everything else is regenerated',
    survivesRegeneration([FAVOURITE_TAG]) === true)
  check('a meal asked for by name still is, unchanged',
    survivesRegeneration([USER_REQUESTED_TAG]) === true)
  check('an ordinary generated meal is not', survivesRegeneration(['Other', 'quick']) === false)
  check('no tags at all is not', survivesRegeneration(null) === false && survivesRegeneration(undefined) === false && survivesRegeneration([]) === false)
  check('the two tags are DIFFERENT facts — "I asked for this" and "I like this" stay countable apart',
    USER_REQUESTED_TAG !== FAVOURITE_TAG)

  // CALLED, NOT GREPPED. Three gates spent this morning pinned to one line of
  // JSX because the rule lived inside a condition; this one is a function the
  // gate can ask, and the loop is checked to be asking it.
  const gen = read('src/lib/meal-generation.ts')
  check('the regenerate path asks the predicate rather than re-deriving the rule',
    /previous\.filter\(row => survivesRegeneration\(row\.tags\)\)/.test(gen))
  check('...and no longer carries its own copy of the tag test',
    !/tags\.includes\(USER_REQUESTED_TAG\) \|\| tags\.includes\(FAVOURITE_TAG\)/.test(strip(gen).replace(/export function survivesRegeneration[\s\S]*?\n}/, '')))
}

// ===========================================================================
console.log('\n3. One write path, so the two surfaces cannot drift')
// ===========================================================================
{
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  const card = strip(read('src/components/MealPlan.tsx'))
  const mod = read('src/lib/favourite-meals.ts')

  // RE-ANCHORED 27 Sep 2026: the coach used to heart every meal it swapped
  // in, through this module. A heart is a like now, and nothing is learnt
  // behind her back, so the coach writes no favourite at all. The property
  // this section exists for, one writer of the table, is unchanged.
  check('the coach does not heart a meal it swaps in (nothing learnt behind her back)', !/markFavourite\(/.test(chat))
  // THE POINT OF THE MODULE. Before it, the only writer was a closure inside
  // ChatAssistant; a heart could easily have become a second, subtly different
  // upsert of the same table.
  check('...and no longer keeps its own upsert of the table',
    !/from\('favorite_meals'\)[\s\S]{0,200}\.(insert|update)\(/.test(chat), chat.match(/from\('favorite_meals'\)[\s\S]{0,80}/)?.[0])
  check('the meal card writes through the same module',
    /markFavourite\(/.test(card) && /unmarkFavourite\(/.test(card))
  check('...and does not reach the table itself either',
    !/favorite_meals/.test(card))
  check('only the module touches the table', /from\('favorite_meals'\)/.test(mod))

  // A failed write must not move the heart — every other control on that card
  // reports a failure rather than showing the change anyway.
  check('a failed write leaves the heart where it was',
    /if \(!ok\) return null/.test(card))
  check('...and the module reports failure rather than throwing',
    /return false/.test(mod) && /console\.error/.test(mod))
  // The pool tag is best-effort ON PURPOSE: the favourite is already saved by
  // then, so shouting about it would misdescribe what happened.
  check('the pool tag write is allowed to fail without failing the favourite',
    /FAILS QUIETLY AND ON PURPOSE/.test(read('src/lib/favourite-meals.ts')))
  // RE-ANCHORED 27 Sep 2026: a failed read is null, not an empty list, and
  // the watcher keeps the last good answer (hearts are likes now, so "none"
  // would change the meals). Behaviour is held in test:meal-likes §4.
  check('a read that fails is null rather than every meal favourited or none',
    /return null/.test(mod) && !/return new Set\(\)/.test(mod))
}

// ===========================================================================
console.log('\n4. The control itself')
// ===========================================================================
{
  const card = read('src/components/MealPlan.tsx')
  check('there is a heart on the meal row', /data-meal-favourite=/.test(card) && /<Heart /.test(card))
  check('it shows which state it is in, to a screen reader as well as an eye',
    /aria-pressed=\{isFavourite\}/.test(card) && /data-meal-favourite-on=/.test(card))
  check('...and is labelled with the meal it belongs to, so two rows are never one spoken name',
    /aria-label=\{isFavourite \? `Remove \$\{option\.name\}/.test(card))
  check('it meets the phone tap floor', /data-meal-favourite[\s\S]{0,400}min-h-\[44px\]|min-h-\[44px\][\s\S]{0,400}data-meal-favourite/.test(card))
  check('it cannot be double-tapped into two writes', /disabled=\{favouriteBusy\}/.test(card))
  // Sliced rather than matched with a bounded gap: the button carries enough
  // attributes that a character budget is a guess about formatting, and a
  // guess that fails silently the next time a line wraps.
  const guardAt = card.indexOf('{profileId && (')
  const heartAt = card.indexOf('data-meal-favourite=')
  const closeAt = card.indexOf('            )}', guardAt)
  check('it is hidden when there is no profile to write against',
    guardAt >= 0 && heartAt > guardAt && closeAt > heartAt, { guardAt, heartAt, closeAt })

  const parity = read('docs/coach-screen-parity.md')
  check('the parity list records it as BOTH now', /favourite a meal \| BOTH/.test(parity))
}

// ===========================================================================
console.log('\n5. The detector is not vacuous')
// ===========================================================================
{
  check('the survive rule rejects a tag list it should reject',
    survivesRegeneration(['not-a-real-tag']) === false)
  check('...and accepts one it should accept',
    survivesRegeneration(['not-a-real-tag', FAVOURITE_TAG]) === true)
}

// ===========================================================================
console.log('\n6. The heart writes whole numbers, because the table only takes whole numbers')
// ===========================================================================
// 9 Oct 2026 (M21). favorite_meals.calories / protein / carbs / fat are
// `integer`. A meal's macros carry one decimal. PostgREST rejects a decimal
// for an integer column rather than rounding it, so the heart had never saved
// a real meal — and no check noticed, because every stand-in database here
// accepted 46.6. Run against the write as it was, the first check below
// printed: 22P02, invalid input syntax for type integer: "46.6".
{
  const storeMap = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => storeMap.get(k) ?? null, setItem: (k: string, v: string) => { storeMap.set(k, String(v)) }, removeItem: (k: string) => { storeMap.delete(k) } }, configurable: true })
  if (!('window' in globalThis)) Object.defineProperty(globalThis, 'window', { value: { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true } }, configurable: true })
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const { makeFakeSupabase, INTEGER_COLUMNS, integerViolation } = await import('../.tour-harness/fake-supabase')
  const { markFavourite } = await import('../src/lib/favourite-meals')
  const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')
  const { verifyProposal, computeSlotBudgets } = await import('../src/lib/meal-generation')
  const { integerColumns } = await import('./integer-columns.mjs')
  const db: Record<string, Record<string, unknown>[]> = { favorite_meals: [], meal_plan_slots: [] }
  const client = makeFakeSupabase(db)
  setSupabaseClient(client as never)

  // A REAL MEAL, as the app serves it: the first library dinner that verifies, with its decimals.
  const budget = computeSlotBudgets({ calories: 2300, protein: 160, carbs: 250, fat: 72 }, 3, true).dinner!
  // ...and ALL THREE of protein, carbs and fat off a whole number, so each of
  // the three roundings has something to do (a dish with 41.0 g of carbs let a
  // missing round on carbs through).
  const real = MEAL_LIBRARY.filter(d => d.slot === 'dinner').map(d => verifyProposal(d, 'dinner', budget, [], []))
    .find(o => o !== null && [o.macros.protein, o.macros.carbs, o.macros.fat].every(v => !Number.isInteger(v)))!
  const m = real?.macros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
  check('the fixture is a real served meal whose protein, carbs and fat are each NOT a whole number (so every rounding has something to do)',
    !!real && [m.protein, m.carbs, m.fat].every(v => !Number.isInteger(v)), m)

  const quiet = console.error; const logged: unknown[] = []; console.error = (...a: unknown[]) => { logged.push(a) }
  const ok = await markFavourite('p-heart', favouriteInputFromOption(real as PoolOption))
  console.error = quiet
  // Null-safe from here on: when the save is refused there is no row, and the
  // checks below must FAIL, not crash (a crash runs fewer checks and reads as
  // a broken gate rather than a caught bug).
  const row: Record<string, unknown> = db.favorite_meals[0] ?? {}
  check('hearting it saves', ok === true && db.favorite_meals.length === 1, { ok, rows: db.favorite_meals.length, logged: JSON.stringify(logged).slice(0, 200) })
  check('...as four whole numbers', ['calories', 'protein', 'carbs', 'fat'].every(k => Number.isInteger(row[k])), row)
  check('...each the meal\'s own figure, rounded (not zero, not truncated)',
    row.calories === Math.round(m.calories) && row.protein === Math.round(m.protein) && row.carbs === Math.round(m.carbs) && row.fat === Math.round(m.fat), { row, m })
  // The second heart on the same meal goes down the UPDATE path, which has its own row.
  console.error = (...a: unknown[]) => { logged.push(a) }
  const again = await markFavourite('p-heart', favouriteInputFromOption(real as PoolOption))
  console.error = quiet
  check('hearting it again (the update path) saves too, and counts to two', again === true && db.favorite_meals.length === 1 && db.favorite_meals[0]?.times_used === 2, db.favorite_meals[0] ?? null)

  // THE STAND-IN DATABASE REFUSES WHAT POSTGRES REFUSES.
  const refused = await (client.from('favorite_meals') as { insert: (r: unknown) => Promise<{ data: unknown; error: { code: string; message: string } | null }> }).insert({ profile_id: 'x', name: 'Decimal dinner', calories: 512, protein: 46.6, carbs: 40, fat: 12 })
  check('a decimal in a whole-number column is refused with Postgres\'s own code', refused.error?.code === '22P02' && /invalid input syntax for type integer: "46\.6"/.test(refused.error.message), refused.error)
  check('...and the refused row is not stored', !db.favorite_meals.some(r => r.name === 'Decimal dinner'))
  const updated = await (client.from('favorite_meals') as never as { update: (r: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: { code: string } | null }> } }).update({ fat: 12.5 }).eq('profile_id', 'p-heart')
  check('...an update is refused the same way, and changes nothing', updated.error?.code === '22P02' && Number.isInteger(db.favorite_meals[0]?.fat), [updated.error, db.favorite_meals[0]?.fat ?? null])
  check('a whole number and a null are both fine', integerViolation('favorite_meals', { calories: 500, protein: null, carbs: 40, fat: 0 }) === null)
  check('a table with no whole-number columns is never judged', integerViolation('grocery_items', { quantity: 12.5 }) === null)

  // The fake's list is the migrations' list. A new integer column that nobody adds here fails this.
  const fromSql = integerColumns(ROOT) as Record<string, string[]>
  const same = JSON.stringify(Object.entries(fromSql).sort()) === JSON.stringify(Object.entries(INTEGER_COLUMNS).map(([t, c]) => [t, [...c].sort()]).sort())
  check(`the stand-in's whole-number columns are exactly the ones the migrations declare (${Object.keys(fromSql).length} tables)`, same && Object.keys(fromSql).length >= 15,
    { onlyInSql: Object.keys(fromSql).filter(t => JSON.stringify(fromSql[t]) !== JSON.stringify([...(INTEGER_COLUMNS[t] ?? [])].sort())), onlyInFake: Object.keys(INTEGER_COLUMNS).filter(t => !fromSql[t]) })
  check('...and favorite_meals\' four macro columns are among them', ['calories', 'protein', 'carbs', 'fat'].every(c => (INTEGER_COLUMNS.favorite_meals ?? []).includes(c)))
}

// ===========================================================================
console.log('\n7. A heart that does not save says so')
// ===========================================================================
{
  const card = readFileSync(join(ROOT, 'src/components/MealPlan.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const handler = /const handleFavouriteToggle = async \(\) => \{[\s\S]*?\n {2}\}/.exec(card)?.[0] ?? ''
  check('the heart\'s handler reads whether the save worked (it used to throw the answer away)', /const saved = await onToggleFavourite\(/.test(handler) && /saved === null/.test(handler), handler.slice(0, 300))
  check('...and on a failure sets a sentence from the shared phrasebook', /setFavouriteError\(didNotSave\(/.test(handler))
  check('...which is cleared before the next attempt', handler.indexOf('setFavouriteError(null)') > -1 && handler.indexOf('setFavouriteError(null)') < handler.indexOf('await onToggleFavourite('))
  check('the sentence is rendered on the card (verify:meal-favourite reads it off the screen)', /\{favouriteError && \(\s*<p[^>]*data-testid="meal-favourite-error"[^>]*>\{favouriteError\}<\/p>/.test(card))
}

console.log(failures === 0 ? '\nAll meal-favourite checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
