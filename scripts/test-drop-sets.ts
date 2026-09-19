// ---------------------------------------------------------------------------
// Gate: A DROP IS A CONTINUATION OF THE SET ABOVE IT, NOT A SET OF ITS OWN.
//
// Ashley's ruling, 19 Sep 2026, from three options: a drop gets a proper
// marker in the record, over being stored as an ordinary extra set, over
// drawing it now and storing it later. The rejected middle option is what this
// gate exists to keep rejected — with drops numbered 4 and 5, every reader
// outside the exercise screen (history, personal bests, volume, the coach,
// next week's weights) would have counted five sets where three were
// performed, and each one would have had to be found and taught by hand.
//
// SO THE PROPERTY IS TWO NUMBERS THAT MUST NOT CONVERGE: how many sets, and
// how much work. `filterLoggableSets` answers the first and must never see a
// drop; `setsCountingTowardVolume` answers the second and must always see one.
// A single function with a flag would make them one question again, which is
// the shape this gate is aimed at.
//
// The CSCS half, recorded with its basis in
// docs/plans/ramp-and-working-sets.md: a drop counts toward volume and never
// toward a personal best or next week's anchor, because it is performed in a
// deliberately fatigued state with no rest — the easier half of one effort
// rather than a fresh attempt.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  filterLoggableSets, filterDropSets, setsCountingTowardVolume, isDropRow,
  rowKey, setLabel, setLabelLong,
} from '../src/lib/session-derive'
import type { ExerciseSetLog } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const row = (o: Partial<ExerciseSetLog>): ExerciseSetLog => ({
  user_id: 'u', date: '2026-09-19', exercise_name: 'Barbell Row', exercise_id: 'barbell-row',
  set_number: 1, weight_kg: 60, reps_completed: 8, is_bodyweight: false, ...o,
})

// Three working sets, the last one dropped twice, and a ramp step — the
// session 3a draws.
const logs: ExerciseSetLog[] = [
  row({ set_number: 1, is_warmup: true, weight_kg: 20, reps_completed: 8 }),
  row({ set_number: 1, weight_kg: 60, reps_completed: 8 }),
  row({ set_number: 2, weight_kg: 60, reps_completed: 8 }),
  row({ set_number: 3, weight_kg: 60, reps_completed: 8 }),
  row({ set_number: 3, drop_index: 1, weight_kg: 45, reps_completed: 6 }),
  row({ set_number: 3, drop_index: 2, weight_kg: 35, reps_completed: 5 }),
]

console.log('\n1. A drop is recognised, and 0 and absent mean the same thing')
check('a row with no drop_index is not a drop', !isDropRow(row({})))
check('...nor is one explicitly at 0', !isDropRow(row({ drop_index: 0 })))
check('a row at 1 is a drop', isDropRow(row({ drop_index: 1 })))
check('...and so is one at 2', isDropRow(row({ drop_index: 2 })))

console.log('\n2. The set COUNT does not move when a set is dropped')
const sets = filterLoggableSets(logs, 'barbell-row')
check(`three working sets, drops and ramp excluded (${sets.length})`, sets.length === 3, sets.map(l => l.set_number))
check('...and not one of them is a drop', sets.every(l => !isDropRow(l)))
check('...nor a warm-up', sets.every(l => !l.is_warmup))

console.log('\n3. The VOLUME does move — that is the whole point of logging them')
const vol = setsCountingTowardVolume(logs, 'barbell-row')
check(`five rows count as work (${vol.length})`, vol.length === 5, vol.length)
// THE TWO NUMBERS MUST DIFFER ON THIS FIXTURE, or the checks above and below
// could both pass against one function doing one thing.
check('...so the count and the work are genuinely two different answers',
  vol.length !== sets.length, { sets: sets.length, volume: vol.length })
const kg = (rows: ExerciseSetLog[]) => rows.reduce((t, l) => t + l.weight_kg * l.reps_completed, 0)
check(`the dropped work is in the total (${kg(vol)}kg vs ${kg(sets)}kg)`, kg(vol) > kg(sets), { vol: kg(vol), sets: kg(sets) })

console.log('\n4. The drops of one set can be found on their own')
check('both drops of set 3', filterDropSets(logs, 'barbell-row', undefined, 3).length === 2)
check('...and set 1 has none', filterDropSets(logs, 'barbell-row', undefined, 1).length === 0)
check('...and a ramp step is never a drop', filterDropSets(logs, 'barbell-row').every(l => !l.is_warmup))

console.log('\n5. A drop has its own identity, or it overwrites its parent')
check('set 3 and its first drop are different rows', rowKey({ kind: 'working', setNumber: 3 }) !== rowKey({ kind: 'working', setNumber: 3, dropIndex: 1 }))
check('...and the two drops are different rows',
  rowKey({ kind: 'working', setNumber: 3, dropIndex: 1 }) !== rowKey({ kind: 'working', setNumber: 3, dropIndex: 2 }))
check('...and a warm-up 3 is still nothing to do with a working 3',
  rowKey({ kind: 'warmup', setNumber: 3 }) !== rowKey({ kind: 'working', setNumber: 3 }))

console.log('\n6. What the row is CALLED, on screen and out loud')
check('a ramp step reads R2 on screen', setLabel({ kind: 'warmup', setNumber: 2 }) === 'R2')
check('a working set reads as its number', setLabel({ kind: 'working', setNumber: 3 }) === '3')
check('a drop reads as its parent and its place', setLabel({ kind: 'working', setNumber: 3, dropIndex: 1 }) === '3·1')
// THE SPOKEN NAME IS THE HALF THAT DID NOT CHANGE. Shortening the visible
// label to R2 must not re-create the defect that made two rows share one
// spoken name, which is why these three are asserted beside each other.
check('...but a screen reader still hears "Warm-up 2"', setLabelLong({ kind: 'warmup', setNumber: 2 }) === 'Warm-up 2')
check('...and "Set 3" for the parent', setLabelLong({ kind: 'working', setNumber: 3 }) === 'Set 3')
check('...and "Set 3, drop 1" for the child', setLabelLong({ kind: 'working', setNumber: 3, dropIndex: 1 }) === 'Set 3, drop 1')
check('no two rows of this session share a spoken name',
  new Set([
    setLabelLong({ kind: 'warmup', setNumber: 3 }),
    setLabelLong({ kind: 'working', setNumber: 3 }),
    setLabelLong({ kind: 'working', setNumber: 3, dropIndex: 1 }),
    setLabelLong({ kind: 'working', setNumber: 3, dropIndex: 2 }),
  ]).size === 4)

console.log('\n7. The record can actually hold it')
// READ FROM THE MIGRATION, not restated — the column and the key have to grow
// together or the second drop on a set collides with the first and the tap
// does nothing the lifter can see.
const mig = readFileSync(join(ROOT, 'supabase/migrations/20260919160000_add_drop_index_to_set_logs.sql'), 'utf8')
check('the column exists', /ADD COLUMN IF NOT EXISTS drop_index integer NOT NULL DEFAULT 0/.test(mig))
check('...and every existing row defaults to "not a drop", so nothing is backfilled', /DEFAULT 0/.test(mig))
check('the unique key grew with it', /UNIQUE \(user_id, session_id, exercise_id, set_number, is_warmup, drop_index\)/.test(mig))
check('...and the old key is dropped first, or the ALTER fails on a live table', mig.indexOf('DROP CONSTRAINT IF EXISTS unique_set_per_session') < mig.indexOf('ADD CONSTRAINT unique_set_per_session'))
check('a drop can never also be a warm-up', /CHECK \(drop_index = 0 OR is_warmup = false\)/.test(mig))

console.log('\n8. The two questions stay two functions')
// The failure mode this is aimed at is a later kindness: someone adding
// `{ includeDrops: true }` to the one function every count depends on.
const derive = readFileSync(join(ROOT, 'src/lib/session-derive.ts'), 'utf8')
const loggable = derive.slice(derive.indexOf('export function filterLoggableSets'), derive.indexOf('export function isDropRow'))
check('filterLoggableSets was located (sanity check on this check)', loggable.length > 200, loggable.length)
check('...and it refuses drops itself rather than taking an option', /if \(isDropRow\(l\)\) return false/.test(loggable))
check('...and takes no flag that would change what a count means', !/include|opts|options|withDrops/i.test(loggable.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')))

console.log('\n9. The CLIENT key grows with the database key')
// FOUND BY A MISSED MUTATION, 19 Sep 2026: removing drop_index from
// set-log-store's naturalKey was caught by nothing. The database constraint
// would still have refused the collision, but the local pending queue coalesces
// on this key BEFORE anything reaches the server — so the second drop on a set
// would replace the first in the queue and the lifter would watch a row they
// just saved disappear, with no error anywhere.
const store = readFileSync(join(ROOT, 'src/lib/set-log-store.ts'), 'utf8')
const keyFn = store.slice(store.indexOf('function naturalKey('), store.indexOf('function opNaturalKey('))
check('the key function was located (sanity check on this check)', keyFn.length > 80 && keyFn.length < 1600, keyFn.length)
check('...and the drop index is part of the key it returns', /\[[^\]]*dropIndex[^\]]*\]\.join/.test(keyFn), keyFn.match(/return \[[^\]]*\]/)?.[0])
// AND EVERY CALLER PASSES IT. A key that can take the coordinate and callers
// that omit it is the same bug with an extra step — which is exactly how
// isWarmup's four callers defaulted to false for weeks.
const calls = store.match(/naturalKey\([^)]*\)/g) ?? []
check(`every naturalKey call was found (sanity check on this check) (${calls.length})`, calls.length >= 4, calls.length)
check('...and not one of them omits the drop index',
  calls.filter(c => !/function/.test(c)).every(c => /dropIndex|drop_index/.test(c)),
  calls.filter(c => !/dropIndex|drop_index/.test(c)))

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
console.log('\nA drop is a continuation, not a set.\n')
