/**
 * Gate: the day's calorie total must not wait on the network to change.
 *
 * THE DEFECT. Ashley, 8 Sep 2026: "tapping Log this meal doesn't update the
 * top-level daily calorie counter without an app reload."
 *
 * The WRITE was already local-first — recordMealEvent persists to the pending
 * queue synchronously and notifies before it even tries to flush. The READ was
 * not: getTodayLedger begins with an await on a meal_events select and merges
 * the pending queue only after it resolves, so every screen showing today's
 * calories re-read through a request it did not need. Measured in the browser
 * harness at ?slow=5000: the tap logged the meal in the same tick and the
 * counter sat on 0 for five seconds. On a phone whose request hangs instead of
 * failing, that wait has no end — which is the app restart she was doing.
 *
 * getLedgerSnapshot is the same arithmetic over what the store already holds,
 * with no request at all. This gate holds the two properties that make it safe
 * to render: it agrees with the authoritative read, and it stays SILENT until
 * the server has actually answered once — because a cache that says "you have
 * eaten nothing" off a read that never happened is worse than a slow number.
 */

// --- Environment shims (before any lib module is imported) ------------------
const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
    get length() { return storeMap.size },
    key: (i: number) => [...storeMap.keys()][i] ?? null,
  },
  configurable: true,
})
const navShim = { onLine: true }
Object.defineProperty(globalThis, 'navigator', { value: navShim, configurable: true })

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
/** Comment-stripped source — an absence check a doc comment can satisfy is not a check. */
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const TARGETS = { calories: 2000, protein: 150, carbs: 200, fat: 60 } as MacroTargets
const PROFILE = 'gate-profile'
const DATE = '2026-09-08'

// --- A meal_events table, and a count of how often it is actually read ------
type Row = Record<string, unknown>
let serverRows: Row[] = []
let reads = 0
let readFails = false

function makeFake() {
  const builder = (table: string) => {
    const api: Record<string, unknown> = {}
    const chain = () => api
    Object.assign(api, {
      select: chain, eq: chain, is: chain, order: chain, limit: chain, in: chain,
      gte: chain, lte: chain, not: chain, maybeSingle: chain, single: chain,
      insert: (row: Row) => {
        // client_id is UNIQUE on meal_events, which is what makes a retry
        // idempotent — modelled here rather than assumed, because the
        // dedupe case above is precisely a row that exists in both places.
        if (table === 'meal_events' && !serverRows.some(r => r.client_id === row.client_id)) {
          serverRows.push({ ...row })
        }
        return Promise.resolve({ error: null })
      },
      update: (patch: Row) => ({
        eq: (col: string, val: unknown) => {
          for (const r of serverRows) if (r[col] === val) Object.assign(r, patch)
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }),
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        reads++
        if (readFails) return Promise.resolve().then(() => reject ? reject(new Error('offline')) : undefined)
        return Promise.resolve().then(() => resolve({ data: serverRows.filter(r => r.voided_at == null), error: null }))
      },
    })
    return api
  }
  return { from: (t: string) => builder(t) }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient(makeFake() as never)
  const {
    getTodayLedger, getLedgerSnapshot, logMealEaten, voidMealEvent, flushPending,
  } = await import('../src/lib/meal-store')

  console.log('\n1. Silent until the server has actually answered\n')

  check('no snapshot before anything has been read', getLedgerSnapshot(PROFILE, DATE) === null)

  readFails = true
  await getTodayLedger(PROFILE, DATE, TARGETS)
  check('a FAILED read leaves it silent — "nothing eaten" is not a fact we have',
    getLedgerSnapshot(PROFILE, DATE) === null, getLedgerSnapshot(PROFILE, DATE))
  readFails = false

  const first = await getTodayLedger(PROFILE, DATE, TARGETS)
  check('after one successful read there is a snapshot', getLedgerSnapshot(PROFILE, DATE) !== null)
  check('...and it agrees with the read it came from',
    getLedgerSnapshot(PROFILE, DATE)!.eaten.kcal === first.eaten.kcal)

  console.log('\n2. A logged meal changes it with no request at all\n')

  const readsBefore = reads
  // Offline for the moment, so the write stays in the queue where the next
  // few checks can see it — the flush is fired in the background otherwise
  // and the fake answers before the assertion below can run.
  navShim.onLine = false
  logMealEaten(PROFILE, DATE, 'breakfast', 'Porridge', { kcal: 480, protein: 45, carbs: 60, fat: 12 })
  const afterLog = getLedgerSnapshot(PROFILE, DATE)
  check('the meal is in the total immediately', afterLog?.eaten.kcal === 480, afterLog?.eaten)
  check('...and its macros with it',
    afterLog?.eaten.protein === 45 && afterLog?.eaten.carbs === 60 && afterLog?.eaten.fat === 12, afterLog?.eaten)
  check('...with the row on screen too, not just the sum', afterLog?.events.length === 1, afterLog?.events.length)
  check('THE NETWORK WAS NOT ASKED — this is the whole fix', reads === readsBefore, { reads, readsBefore })

  // THE ROW EXISTS IN BOTH PLACES AT ONCE, which is the only window in which
  // deduping by client_id does anything — and so the only way to test it. It
  // is the ordinary shape of a lost acknowledgement: the insert landed, the
  // response did not, and the queue is still holding the row for a retry.
  const queued = JSON.parse(localStorage.getItem('fitplan_mealevent_pending_v1') ?? '[]') as
    { clientId: string; date: string; slot: string; eventType: string; mealName: string; macros: Row; source: string; createdAt: string }[]
  serverRows.push({
    client_id: queued[0].clientId, date: queued[0].date, slot: queued[0].slot,
    event_type: queued[0].eventType, meal_name: queued[0].mealName, macros: queued[0].macros,
    source: queued[0].source, created_at: queued[0].createdAt, voided_at: null,
  })
  await getTodayLedger(PROFILE, DATE, TARGETS)
  check('a meal on the server AND still in the queue is counted ONCE, not twice',
    getLedgerSnapshot(PROFILE, DATE)!.eaten.kcal === 480, getLedgerSnapshot(PROFILE, DATE)!.eaten)

  navShim.onLine = true
  await flushPending()
  const afterSync = await getTodayLedger(PROFILE, DATE, TARGETS)
  check('once it syncs, the authoritative read says the same number', afterSync.eaten.kcal === 480, afterSync.eaten)
  check('...and the snapshot agrees with it', getLedgerSnapshot(PROFILE, DATE)!.eaten.kcal === 480, getLedgerSnapshot(PROFILE, DATE)!.eaten)

  console.log('\n3. Undo of an already-synced meal, which the queue no longer holds\n')

  const synced = afterSync.events[0]
  check('the meal really has left the pending queue',
    !(JSON.parse(localStorage.getItem('fitplan_mealevent_pending_v1') ?? '[]') as { clientId: string }[])
      .some(e => e.clientId === synced.clientId))
  const readsBeforeUndo = reads
  const undo = voidMealEvent(synced.clientId)
  check('the total drops before the server is told', getLedgerSnapshot(PROFILE, DATE)?.eaten.kcal === 0,
    getLedgerSnapshot(PROFILE, DATE)?.eaten)
  check('...again without a read', reads === readsBeforeUndo, { reads, readsBeforeUndo })
  await undo
  check('and it stays gone once the server has it', (await getTodayLedger(PROFILE, DATE, TARGETS)).eaten.kcal === 0)

  console.log('\n4. A void that did not land puts the meal back\n')

  // A second meal, synced, then voided against a server that ignores it —
  // exactly the case voidMealEvent's own comment describes.
  logMealEaten(PROFILE, DATE, 'lunch', 'Chicken and rice', { kcal: 700, protein: 50, carbs: 80, fat: 20 })
  await flushPending()
  const lunch = (await getTodayLedger(PROFILE, DATE, TARGETS)).events.find(e => e.mealName === 'Chicken and rice')!
  const rows = serverRows
  serverRows = rows.map(r => ({ ...r })) // detach, so the update below hits a copy we then discard
  await voidMealEvent(lunch.clientId)
  serverRows = rows // the void never actually landed
  check('the optimistic drop happened', getLedgerSnapshot(PROFILE, DATE)?.eaten.kcal === 0)
  await getTodayLedger(PROFILE, DATE, TARGETS)
  check('and the server\'s answer puts it back rather than hiding a failed undo',
    getLedgerSnapshot(PROFILE, DATE)?.eaten.kcal === 700, getLedgerSnapshot(PROFILE, DATE)?.eaten)

  console.log('\n5. Every screen that shows the number uses it\n')

  const nutrition = code('src/components/NutritionDisplay.tsx')
  check('the Nutrition rings apply the snapshot on notify, before the re-read',
    /subscribeMealStore\(\(\) => \{[\s\S]{0,400}?getLedgerSnapshot[\s\S]{0,300}?setEaten/.test(nutrition))
  check('...and still trigger the authoritative re-read',
    /getLedgerSnapshot[\s\S]{0,400}?setLedgerVersion\(v => v \+ 1\)/.test(nutrition))

  const meals = code('src/components/MealPlan.tsx')
  // Scoped to reloadLogged's own body. Matching the whole file would be
  // satisfied by the import line alone — which is exactly what happened when
  // this check was first mutation-tested.
  const reload = meals.slice(meals.indexOf('const reloadLogged'), meals.indexOf('void reloadLogged()'))
  check('the meal row flips before its own read resolves',
    /getLedgerSnapshot\(profileId, date\)[\s\S]{0,200}?setLoggedBySlot/.test(reload)
    && reload.indexOf('getLedgerSnapshot') < reload.indexOf('return getTodayLedger'), reload.slice(0, 200))

  const dash = code('src/components/Dashboard.tsx')
  check('Home subscribes to the meal store at all — it had no subscription',
    /subscribeMealStore/.test(dash))
  check('...and corrects its paint cache on the way IN, for the meal logged while it was unmounted',
    /useState<DashboardData \| null>\(\s*\(\) => withMealSnapshot\(loadDashboardCache/.test(dash))
  check('...and writes the correction back, so the next cold open is not stale',
    /saveDashboardCache\(profile\.id, activeSession\.date, next\)/.test(dash))

  console.log(failures === 0 ? '\nAll meal-ledger-snapshot checks pass.\n' : `\n${failures} FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
