/**
 * Gate: every local-first queue publishes, and every publisher is subscribed.
 *
 * This app writes five kinds of thing locally first and syncs them in the
 * background: logged sets, water, grocery items, cardio logs and meal events.
 * Four of them had a notify/subscribe pair. meal-store did not, and the
 * consequences were three separate bug reports that nobody connected:
 *
 *   - logging a meal on the Nutrition tab did not move the macro rings
 *     directly above it on the same screen;
 *   - the coach's "calories remaining" was frozen at whatever the day looked
 *     like when the chat tab first read it, and the chat tab never unmounts;
 *   - a meal event that exhausted its retries dead-lettered in silence,
 *     because subscribeAllQueues had no meal subscription to repaint with.
 *
 * One missing listener, three symptoms, and every existing gate green. So
 * this holds the SHAPE rather than any of the three: a queue that can lose
 * work must be able to say so, and something must be listening.
 *
 * Text checks over imports, deliberately. These stores are module singletons
 * that touch localStorage at import time; asserting the wiring statically
 * needs no DOM and cannot be satisfied by a mock.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

/**
 * The five queues, by the two names each one is known by: its module, and the
 * subscribe function it must export.
 *
 * set-log-store is listed with subscribeSyncState because it predates the
 * shared trio and carries online/syncing/queued counts the others do not —
 * a different signature for the same obligation, not an exemption.
 */
const QUEUES = [
  { module: 'src/lib/set-log-store.ts', subscribe: 'subscribeSyncState' },
  { module: 'src/lib/water-store.ts', subscribe: 'subscribeWaterStore' },
  { module: 'src/lib/grocery-store.ts', subscribe: 'subscribeGroceryStore' },
  { module: 'src/lib/cardio-log-store.ts', subscribe: 'subscribeCardioLogStore' },
  { module: 'src/lib/meal-store.ts', subscribe: 'subscribeMealStore' },
] as const

const queueHealth = read('src/lib/queue-health.ts')

console.log('\n1. Every queue can say that something changed\n')
for (const { module, subscribe } of QUEUES) {
  const src = read(module)
  check(`${module} exports ${subscribe}`, new RegExp(`export function ${subscribe}\\b`).test(src))
  // A subscribe with no notify is a listener list nothing ever calls — the
  // same dead wiring one layer down.
  check(`...and actually notifies from more than one place`,
    (src.match(/notifyListeners\(\)|notify\(\)|emit\(\)/g) ?? []).length >= 3, module)
}

console.log('\n2. Every queue is reachable from the one health reader\n')
for (const { module } of QUEUES) {
  const name = module.replace('src/lib/', './').replace('.ts', '')
  check(`queue-health imports ${name}`, queueHealth.includes(`from '${name}'`))
}
// The three verbs the offline indicator needs. A queue in the import list but
// missing from one of these switches is a failure the user can see but not
// retry, or retry but not discard.
for (const verb of ['getAllFailedItems', 'retryFailedItem', 'discardFailedItem', 'flushAllQueues']) {
  const at = queueHealth.indexOf(`export function ${verb}`) >= 0
    ? queueHealth.indexOf(`export function ${verb}`)
    : queueHealth.indexOf(`export async function ${verb}`)
  check(`${verb} exists (sanity check on this check)`, at >= 0)
  const body = queueHealth.slice(at, queueHealth.indexOf('\n}', at))
  for (const store of ['setLogStore', 'waterStore', 'groceryStore', 'cardioStore', 'mealStore']) {
    check(`...and ${verb} covers ${store}`, body.includes(store), verb)
  }
}

console.log('\n3. subscribeAllQueues really subscribes to all of them\n')
{
  const at = queueHealth.indexOf('export function subscribeAllQueues')
  check('subscribeAllQueues exists (sanity check on this check)', at >= 0)
  const body = queueHealth.slice(at, queueHealth.indexOf('\n}', at))
  for (const { subscribe } of QUEUES) {
    // set-log-store's own subscribeSyncState is the indicator's primary
    // signal and is subscribed separately by the component, which is why it
    // is allowed to be absent HERE specifically and nowhere else.
    if (subscribe === 'subscribeSyncState') continue
    check(`...it subscribes ${subscribe}`, body.includes(subscribe), body)
  }
}

console.log('\n4. Offline is not a failed attempt, and a failure gets retried\n')
for (const { module } of QUEUES) {
  const src = read(module)
  // Burning retry attempts against a queue while the phone has no connection
  // is how an entry reaches its dead-letter cap without a single real try —
  // cardio-log-store was doing exactly that until 5 Sep 2026.
  check(`${module} does not flush while offline`, /navigator\.onLine/.test(src))
  // And a failure that happens while ONLINE has to try again on its own: the
  // `online` event never fires for a connection that never dropped.
  check(`...and schedules its own retry after a failure`,
    /scheduleRetry|setTimeout\([\s\S]{0,80}flushPending/.test(src), module)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log(`\n${QUEUES.length} local-first queues, all publishing, all read.\n`)
