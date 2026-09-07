// ---------------------------------------------------------------------------
// The coach can log what you ate — behind a confirmation, and only behind one.
//
// Ashley, 7 Sep 2026, asking why the coach could compute her macros and never
// keep them. The answer was that log_meal's handler once inserted into
// `daily_food_logs`, a table that appears in NO migration and has never
// existed on the live database. Every attempt failed, so it was retired to an
// honest decline — and the decline outlived the reason, sitting there long
// after meal_events existed and the Nutrition tab was writing to it.
//
// Her ruling when asked how it should feel: ASK FIRST, LOG ON CONFIRM.
//
// The two properties this file exists for:
//   1. The slot list the model is handed is the slot list the database
//      accepts. It was not, and that is what makes this file more than
//      paperwork — see §1.
//   2. Nothing is written before the tap, and what is written after it goes
//      through the client's own ledger, not a server-side insert.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildMealLogProposal, normaliseSlot, LOGGABLE_SLOTS } from '../src/lib/meal-log-proposal'
import { MIN_COVERAGE } from '../src/lib/meal-generation'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const fn = read('supabase/functions/chat-gemini/index.ts')
const ui = read('src/components/ChatAssistant.tsx')

console.log('\n1. The slots the model is offered are the slots the database accepts\n')
{
  // THE LANDMINE THIS FILE WAS WRITTEN FOR. log_meal's schema said
  // "breakfast, lunch, dinner, snack_1, snack_2" until 7 Sep 2026. meal_events
  // accepts four values and snack_1 is not one of them, so every snack log
  // would have been rejected on arrival the moment logging was wired up — and
  // in the meantime "snack_1" was reaching users' replies verbatim.
  //
  // Parsed from the migration rather than typed out here, so the check reads
  // the same source the database does.
  const migration = raw('supabase/migrations/20260803120000_create_meal_pools_and_events.sql')
  const eventsTable = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS meal_events'))
  const constraint = /slot text CHECK \(slot IS NULL OR slot IN \(([^)]+)\)\)/.exec(eventsTable)?.[1] ?? ''
  const dbSlots = constraint.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean).sort()
  check('the CHECK constraint was found (sanity check on this check)', dbSlots.length === 4, dbSlots)

  const enumLine = /meal_slot: \{[\s\S]{0,200}?enum: \[([^\]]+)\]/.exec(fn)?.[1] ?? ''
  const toolSlots = enumLine.split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean).sort()
  check('the tool declares its slots as an enum, not just prose', toolSlots.length > 0, enumLine)
  check('...and that enum is exactly what the database accepts',
    JSON.stringify(toolSlots) === JSON.stringify(dbSlots), { toolSlots, dbSlots })
  check('...and the app\'s own slot type agrees with both',
    JSON.stringify([...LOGGABLE_SLOTS].sort()) === JSON.stringify(dbSlots), { LOGGABLE_SLOTS, dbSlots })
  // The specific values that were wrong, named so they cannot creep back into
  // the part that MATTERS — the definition handed to the model. They survive
  // deliberately in humanSlot, which maps stale inputs to words rather than
  // echoing them, and that is not the same thing as offering them.
  const toolDef = fn.slice(fn.indexOf('name: "log_meal"'), fn.indexOf('name: "log_workout_set"'))
  check('the tool definition was located (sanity check on this check)', toolDef.length > 500, toolDef.length)
  check('no snack_1/snack_2 is offered to the model', !/snack_1|snack_2/.test(toolDef))
  check('...and every slot the ledger accepts has a human word to print',
    dbSlots.every(slot => new RegExp(`${slot}: "`).test(fn)), dbSlots)
}

console.log('\n2. Nothing is written before the tap\n')
{
  const handler = fn.slice(fn.indexOf('name === "log_meal"'), fn.indexOf('if (name === "log_workout")'))
  check('the log_meal handler was located (sanity check on this check)', handler.length > 300, handler.length)
  check('a logging intent returns a proposal', /kind: "propose_meal_log"/.test(handler))
  check('...with an empty reply, so the model cannot narrate a write',
    /reply: ""[\s\S]{0,120}propose_meal_log/.test(handler))
  // A COURIER, not a writer — the same shape test-meal-addition.ts pins for
  // propose_meal_addition. If this handler ever gains an HTTP write, the
  // confirmation card stops being the thing that decides.
  check('...and the handler performs no write of its own',
    !/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(handler), handler.slice(0, 160))
  check('a question still gets prose, not a card',
    /const asked = args\.intent === "question"/.test(handler) && /if \(!asked\)/.test(handler))
}

console.log('\n3. What the tap writes, and where\n')
{
  check('the client builds the proposal through the verifier',
    /result\.proposal\.kind === 'propose_meal_log'[\s\S]{0,600}buildMealLogProposal\(/.test(ui))
  check('...and the card asks rather than announces',
    /kind === 'propose_meal_log'\) return `Log this to your \$\{rows\[0\]\.before\}\?`/.test(ui))
  // THE WRITE. Through the store, not a bare table call: recordMealEvent is
  // what carries the offline queue, the client_id idempotency, the synchronous
  // listener notify and the void-based undo.
  const executor = ui.slice(ui.indexOf("row.kind === 'propose_meal_log'"), ui.indexOf("row.kind === 'propose_meal_addition' ||"))
  check('the confirm executor was located (sanity check on this check)', executor.length > 200, executor.length)
  check('confirm writes through recordMealEvent', /recordMealEvent\(\{/.test(executor))
  check('...marking the event as coming from chat', /source: 'chat'/.test(executor))
  check('...as an eaten event, not a skip', /eventType: 'confirmed'/.test(executor))
  check('...and never by reaching for the table directly',
    !/from\('meal_events'\)/.test(executor), executor.slice(0, 200))
  // The receipt reports the write, and the framework exists because one once
  // claimed a change the Nutrition tab never showed.
  check('the receipt names what was actually logged', /receipt = \{ landed: \[`\$\{payload\.slot\}: \$\{payload\.mealName\}/.test(executor))
}

console.log('\n4. The verifier refuses rather than logging a number too low to trust\n')
{
  const base = {
    rawArgs: { food_name: 'Greek yoghurt with honey', meal_slot: 'snack' },
    computed: { kcal: 149, protein: 15.1, carbs: 22.6, fat: 0.3, unmatched: [], coverage: 1 },
    profileId: 'p1',
    todayDate: '2026-09-07',
  }
  const ok = buildMealLogProposal(base)
  check('a clean meal builds a proposal', ok.ok === true, ok)
  check('...filed under the slot that was asked for', ok.ok && ok.payload.slot === 'snack', ok.ok && ok.payload.slot)
  check('...carrying the numbers the coach already quoted, unchanged',
    ok.ok && ok.payload.macros.kcal === 149 && ok.payload.macros.protein === 15.1, ok.ok && ok.payload.macros)

  // AN UNDER-RESOLVED MEAL IS NOT A LIGHT MEAL. Logging 40 kcal for a real
  // dinner does not read as missing; it reads as a light day, and every
  // number downstream believes it. Same floor every generated meal passes.
  const thin = buildMealLogProposal({ ...base, computed: { ...base.computed, coverage: MIN_COVERAGE - 0.2, unmatched: ['mystery sauce'] } })
  check('a meal the food database barely recognised is refused', thin.ok === false, thin)
  check('...saying which part it could not identify',
    !thin.ok && /mystery sauce/.test(thin.reason), !thin.ok && thin.reason)

  const noSlot = buildMealLogProposal({ ...base, rawArgs: { food_name: 'Toast', meal_slot: 'elevenses' } })
  check('an unrecognisable slot is asked about, never guessed', noSlot.ok === false, noSlot)
  const noName = buildMealLogProposal({ ...base, rawArgs: { food_name: '   ', meal_slot: 'lunch' } })
  check('a nameless meal is refused', noName.ok === false, noName)
  const badMacros = buildMealLogProposal({ ...base, computed: { ...base.computed, protein: Number.NaN } })
  check('a macro that is not a number is refused', badMacros.ok === false, badMacros)

  // The stale-value mapping. A cached tool definition or a model ignoring the
  // enum can still send snack_1; mapping it beats refusing a real meal over a
  // field the user never saw.
  check('snack_1 still maps onto the real snack slot', normaliseSlot('snack_1') === 'snack')
  check('...and so does snack_2', normaliseSlot('snack_2') === 'snack')
  check('...while nonsense maps to nothing', normaliseSlot('elevenses') === null)
  check('every mapped value is one the database accepts',
    ['breakfast', 'Lunch', 'DINNER', 'snack_1', 'brunch', 'supper'].every(v => {
      const m = normaliseSlot(v)
      return m !== null && (LOGGABLE_SLOTS as readonly string[]).includes(m)
    }))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nIt asks first, and what it writes is what it showed you.\n')
