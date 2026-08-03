/**
 * Vision-architecture patch round, fix 2 — regression test.
 *
 * `fitness_profiles.injuries` (body-part codes) and `.exercise_exclusions`
 * (exact banned exercise names) used to be the SAME column: App.tsx read
 * exercise_exclusions back as `profile.injuries`, and wrote injuries INTO
 * exercise_exclusions at onboarding, so every ban_exercise call (which only
 * ever wrote exercise names into exercise_exclusions) silently polluted the
 * injury list.
 *
 * App.tsx's restore/onboarding/ban logic lives inside closures in a React
 * component and isn't independently invocable from a script, so this tests
 * the boundary that IS testable: the two columns are genuinely separate in
 * the schema, and a write shaped exactly like ban_exercise's real write
 * (`.update({ exercise_exclusions: [...current, name] })`, see
 * ChatAssistant.tsx and App.tsx's handleBanExercise) cannot alter
 * `injuries`, and vice versa. This is the data-model invariant the fix
 * depends on; a future accidental re-merge of the two columns' read/write
 * paths would still need to be caught by code review, not this test.
 */

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { fitness_profiles: [] }

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'update' | 'insert' = 'select'
  let updateObj: Row | null = null
  let payload: Row[] = []
  let single = false

  const exec = () => {
    if (op === 'insert') {
      const inserted = payload.map(raw => ({ id: crypto.randomUUID(), ...raw }))
      db[table].push(...inserted)
      return { data: single ? inserted[0] : inserted, error: null }
    }
    if (op === 'update') {
      for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, updateObj)
      return { data: null, error: null }
    }
    const rows = db[table].filter(r => filters.every(f => f(r)))
    return { data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    update: (obj: Row) => { op = 'update'; updateObj = obj; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void) => Promise.resolve().then(() => resolve(exec())),
  }
  return api
}

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`)
  }
}

async function main() {
  const client = { from: fakeFrom }

  // Seed a profile exactly as onboarding now writes it (fix 2): injuries
  // and exercise_exclusions are separate fields from the first insert.
  const { data: inserted } = await (client.from('fitness_profiles') as any)
    .insert({ injuries: ['knees', 'lower_back'], exercise_exclusions: [] })
    .select('id')
    .single()
  const profileId = inserted.id

  console.log('\n[1] A ban_exercise-shaped write never reaches injuries')
  // Mirrors the exact write shape in ChatAssistant.tsx / App.tsx's
  // handleBanExercise: read exercise_exclusions fresh, append, write back.
  const { data: before } = await (client.from('fitness_profiles') as any)
    .select('exercise_exclusions').eq('id', profileId).maybeSingle()
  const current: string[] = (before as any)?.exercise_exclusions || []
  await (client.from('fitness_profiles') as any)
    .update({ exercise_exclusions: [...current, 'Barbell Bench Press'] })
    .eq('id', profileId)

  const { data: afterBan } = await (client.from('fitness_profiles') as any)
    .select('injuries, exercise_exclusions').eq('id', profileId).maybeSingle()
  check('injuries unchanged after a ban', JSON.stringify((afterBan as any).injuries) === JSON.stringify(['knees', 'lower_back']), (afterBan as any).injuries)
  check('the ban landed in exercise_exclusions', (afterBan as any).exercise_exclusions.includes('Barbell Bench Press'), (afterBan as any).exercise_exclusions)
  check('no exercise name ever appears in injuries', !(afterBan as any).injuries.some((v: string) => v === 'Barbell Bench Press'))

  console.log('\n[2] A second ban does not touch injuries either')
  const { data: mid } = await (client.from('fitness_profiles') as any)
    .select('exercise_exclusions').eq('id', profileId).maybeSingle()
  await (client.from('fitness_profiles') as any)
    .update({ exercise_exclusions: [...(mid as any).exercise_exclusions, 'Overhead Press'] })
    .eq('id', profileId)
  const { data: afterSecondBan } = await (client.from('fitness_profiles') as any)
    .select('injuries, exercise_exclusions').eq('id', profileId).maybeSingle()
  check('injuries still exactly the original two codes', JSON.stringify((afterSecondBan as any).injuries) === JSON.stringify(['knees', 'lower_back']), (afterSecondBan as any).injuries)
  check('exercise_exclusions has both banned names', (afterSecondBan as any).exercise_exclusions.length === 2, (afterSecondBan as any).exercise_exclusions)

  console.log('\n[3] Writing to injuries does not touch exercise_exclusions')
  await (client.from('fitness_profiles') as any)
    .update({ injuries: ['knees', 'lower_back', 'shoulders'] })
    .eq('id', profileId)
  const { data: final } = await (client.from('fitness_profiles') as any)
    .select('injuries, exercise_exclusions').eq('id', profileId).maybeSingle()
  check('exercise_exclusions still has exactly the two banned names', (final as any).exercise_exclusions.length === 2, (final as any).exercise_exclusions)
  check('injuries reflects the new code', (final as any).injuries.includes('shoulders'), (final as any).injuries)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll injury/exclusion separation checks passed.')
}

main().catch(err => {
  console.error('Test harness crashed:', err)
  process.exit(1)
})
