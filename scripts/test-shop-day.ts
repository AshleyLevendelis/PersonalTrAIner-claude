// ---------------------------------------------------------------------------
// SHOP DAY — when the Home shopping card is up, and when it is not.
//
// Design handoff 2d, 12 Sep 2026. The shopping list left the Tools tab and
// became a card that finds you on the day you shop. A card that appears on
// the wrong day is worse than no card: it is the app being confidently wrong
// about your week, on the screen you open first.
//
// THREE CONDITIONS, AND ALL OF THEM. There is something unchecked to buy,
// today is the shop day, and she has not said "not today". Each one is
// checked on its own AND in combination, because the failure that matters is
// one of them being quietly dropped from the `&&`.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { defaultShopDay, getShopDay, setShopDay, isGroceryDueToday, isSnoozed, snoozeForADay, DAY_NAMES } from '../src/lib/shop-day-store'
import type { WorkoutDay } from '../src/lib/types'

// A DOM-less localStorage, because the store is a browser module and this is
// not a browser. Kept deliberately dumb: the point is to exercise the store's
// own rules, not to model a storage engine.
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 200)}` : ''}`) }
}

const day = (name: string, exercises: number): WorkoutDay =>
  ({ day: name, focus: 'x', exercises: Array.from({ length: exercises }, () => ({})) } as unknown as WorkoutDay)
/** Trains Tuesday and Thursday — so the shop day is Monday, not Sunday. */
const TUE_THU = [day('Monday', 0), day('Tuesday', 3), day('Wednesday', 0), day('Thursday', 3), day('Friday', 0), day('Saturday', 0), day('Sunday', 0)]
/** Trains Monday — so the shop day is the Sunday before it. */
const MON = [day('Monday', 3), day('Tuesday', 0), day('Wednesday', 0), day('Thursday', 0), day('Friday', 0), day('Saturday', 0), day('Sunday', 0)]

const NOW = Date.parse('2026-09-12T09:00:00Z')

console.log('\n1. The default is the day before the week starts, not a guess at Sunday\n')
{
  check('a Monday-start week shops on Sunday', defaultShopDay(MON) === 'Sunday', defaultShopDay(MON))
  // THE CASE THAT MAKES IT WORTH DERIVING. Hard-coding Sunday would put the
  // card up two days early for anyone whose week starts on Tuesday.
  check('a Tuesday-start week shops on Monday', defaultShopDay(TUE_THU) === 'Monday', defaultShopDay(TUE_THU))
  check('no plan falls back to Sunday rather than crashing', defaultShopDay(undefined) === 'Sunday')
  check('a plan with no training in it does the same', defaultShopDay([day('Monday', 0)]) === 'Sunday')
  check('...and every answer is a real day name', DAY_NAMES.includes(defaultShopDay(TUE_THU)))
}

console.log('\n2. Her choice beats the default\n')
{
  mem.clear()
  check('unset, the derived day applies', getShopDay(TUE_THU) === 'Monday', getShopDay(TUE_THU))
  setShopDay('Friday')
  check('set, hers applies', getShopDay(TUE_THU) === 'Friday', getShopDay(TUE_THU))
  check('...even against a different plan', getShopDay(MON) === 'Friday', getShopDay(MON))
  setShopDay(null)
  check('cleared, the derived day is back', getShopDay(TUE_THU) === 'Monday', getShopDay(TUE_THU))
}

console.log('\n3. All three conditions, and each one on its own\n')
{
  mem.clear()
  const base = { todayName: 'Monday', plan: TUE_THU, uncheckedCount: 4, nowMs: NOW }
  check('all three met: the card is up', isGroceryDueToday(base) === true)
  check('nothing left to buy: no card', isGroceryDueToday({ ...base, uncheckedCount: 0 }) === false)
  check('wrong day: no card', isGroceryDueToday({ ...base, todayName: 'Wednesday' }) === false)
  snoozeForADay(NOW)
  check('snoozed: no card', isGroceryDueToday(base) === false)
  check('...and the snooze knows it is on', isSnoozed(NOW) === true)
  // IT IS A DAY, NOT FOREVER. A "not today" that never expires is a control
  // that silently deletes a feature.
  check('...and it lifts a day later', isSnoozed(NOW + 25 * 60 * 60 * 1000) === false)
  check('...so the card comes back next week', isGroceryDueToday({ ...base, nowMs: NOW + 25 * 60 * 60 * 1000 }) === true)
}

console.log('\n4. A preference that cannot be read must not delete the feature\n')
{
  mem.clear()
  mem.set('fitplan_shop_day_v1', 'not json at all')
  check('unreadable storage falls back to the derived day', getShopDay(TUE_THU) === 'Monday', getShopDay(TUE_THU))
  check('...and does not read as snoozed', isSnoozed(NOW) === false)
  check('...so the card still shows on the right day',
    isGroceryDueToday({ todayName: 'Monday', plan: TUE_THU, uncheckedCount: 2, nowMs: NOW }) === true)
  mem.set('fitplan_shop_day_v1', JSON.stringify({ day: 'Casual Friday', snoozedUntil: 'soon' }))
  check('a nonsense day is ignored rather than trusted', getShopDay(TUE_THU) === 'Monday', getShopDay(TUE_THU))
  check('...and a nonsense snooze is not a snooze', isSnoozed(NOW) === false)
}

console.log('\n5. One owner for the rule, and the card obeys it\n')
{
  const card = readFileSync('src/components/ShopDayCard.tsx', 'utf8')
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const bare = strip(card)
  // THE CARD MUST NOT RE-DERIVE THE RULE. Two copies of "should this show" is
  // how a card and the sentence describing it come to disagree.
  check('the card asks the store rather than deciding for itself', /isGroceryDueToday\(/.test(bare))
  check('...and does not test the day itself', !/todayName ===/.test(bare))
  // A LIST THAT CANNOT BE READ IS NOT AN EMPTY LIST.
  check('an unreadable list shows no card at all', /setItems\(null\)/.test(bare) && /if \(!items \|\| dismissed\) return null/.test(bare))
  check('the day is the app\'s frozen one, not a fresh clock', !/new Date\(\)/.test(bare))
  check('...it is given one', /todayName: string/.test(card))
  const dash = readFileSync('src/components/Dashboard.tsx', 'utf8')
  check('Home really mounts it', /<ShopDayCard/.test(dash) && /todayName=\{activeSession\.dayName\}/.test(dash))
  // AND SHE CAN MOVE IT. A card the app schedules for her with no way to
  // change the day is the app being confidently wrong on the screen she opens
  // first — and the store already supports the choice, so not exposing it
  // would be a setting that exists and cannot be reached.
  const prof = readFileSync('src/components/ProfileScreen.tsx', 'utf8')
  check('Profile can change the shopping day', /Shopping day/.test(prof) && /setShopDay\(/.test(prof))
  check('...including handing it back to the app', /value: 'auto'/.test(prof) && /v === 'auto' \? null/.test(prof))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe shopping card turns up on the day you shop, and not otherwise.\n')
