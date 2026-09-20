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

  check('the coach writes through the shared module', /markFavourite\(/.test(chat))
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
  check('a read that fails shows unfilled hearts rather than every meal favourited',
    /return new Set\(\)/.test(mod))
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

console.log(failures === 0 ? '\nAll meal-favourite checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
