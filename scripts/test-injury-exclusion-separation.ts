/**
 * Vision-architecture patch round, fix 2 — regression test.
 * Updated by "Fix — food/exercise preferences have two competing stores".
 *
 * `fitness_profiles.injuries` (body-part codes) and exercise exclusions
 * used to be the SAME column: App.tsx read exercise_exclusions back as
 * `profile.injuries`, and wrote injuries INTO exercise_exclusions at
 * onboarding, so every ban_exercise call (which only ever wrote exercise
 * names into exercise_exclusions) silently polluted the injury list.
 *
 * The preferences-unification round moved exercise exclusions out of
 * `fitness_profiles.exercise_exclusions` entirely — handleBanExercise now
 * writes a `user_facts` row (kind='exercise_preference', polarity='dislike',
 * hardness='hard') instead of updating that column, which the docs on
 * UserProfile.disliked_foods (types.ts) explain was needed to fix a
 * SEPARATE two-stores bug (a profile-column preference was invisible to
 * chat). Cross-contaminating with `injuries` is now structurally
 * impossible rather than merely avoided by convention: the two live in
 * different tables, not different columns of the same row, so there is no
 * shared cell left for a bad write to land on.
 *
 * App.tsx's restore/onboarding/ban logic lives inside closures in a React
 * component and isn't independently invocable from a script, so this tests
 * the boundary that IS testable: a write shaped exactly like
 * handleBanExercise's real write (an INSERT into user_facts) cannot alter
 * `fitness_profiles.injuries`, and vice versa. This is the data-model
 * invariant the fix depends on; a future accidental re-merge of the two
 * paths would still need to be caught by code review, not this test.
 */

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { fitness_profiles: [], user_facts: [] }

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

/** Mirrors handleBanExercise's real createFact call shape (App.tsx). */
async function banExercise(client: { from: typeof fakeFrom }, profileId: string, exerciseName: string) {
  await (client.from('user_facts') as any).insert({
    profile_id: profileId,
    kind: 'exercise_preference',
    status: 'active',
    source: 'manual',
    raw_phrase: exerciseName,
    display_text: `won't eat/do ${exerciseName}`,
    polarity: 'dislike',
    hardness: 'hard',
    resolved_refs: [exerciseName],
  })
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

  // Seed a profile exactly as onboarding now writes it: injuries on the
  // profile row, exercise exclusions nowhere on it at all (they live in
  // user_facts, a different table entirely).
  const { data: inserted } = await (client.from('fitness_profiles') as any)
    .insert({ injuries: ['knees', 'lower_back'] })
    .select('id')
    .single()
  const profileId = inserted.id

  console.log('\n[1] A ban_exercise-shaped write never reaches injuries')
  await banExercise(client, profileId, 'Barbell Bench Press')

  const { data: profileAfterBan } = await (client.from('fitness_profiles') as any)
    .select('injuries').eq('id', profileId).maybeSingle()
  const factsAfterBan = db.user_facts.filter(f => f.profile_id === profileId && f.kind === 'exercise_preference')
  check('injuries unchanged after a ban', JSON.stringify((profileAfterBan as any).injuries) === JSON.stringify(['knees', 'lower_back']), (profileAfterBan as any).injuries)
  check('the ban landed in user_facts', factsAfterBan.some(f => f.raw_phrase === 'Barbell Bench Press'), factsAfterBan)
  check('no exercise name ever appears in injuries', !(profileAfterBan as any).injuries.some((v: string) => v === 'Barbell Bench Press'))

  console.log('\n[2] A second ban does not touch injuries either, and both bans coexist')
  await banExercise(client, profileId, 'Overhead Press')
  const { data: profileAfterSecondBan } = await (client.from('fitness_profiles') as any)
    .select('injuries').eq('id', profileId).maybeSingle()
  const factsAfterSecondBan = db.user_facts.filter(f => f.profile_id === profileId && f.kind === 'exercise_preference')
  check('injuries still exactly the original two codes', JSON.stringify((profileAfterSecondBan as any).injuries) === JSON.stringify(['knees', 'lower_back']), (profileAfterSecondBan as any).injuries)
  check('user_facts has both banned exercises', factsAfterSecondBan.length === 2, factsAfterSecondBan)

  console.log('\n[3] Writing to injuries does not touch user_facts')
  await (client.from('fitness_profiles') as any)
    .update({ injuries: ['knees', 'lower_back', 'shoulders'] })
    .eq('id', profileId)
  const { data: finalProfile } = await (client.from('fitness_profiles') as any)
    .select('injuries').eq('id', profileId).maybeSingle()
  const finalFacts = db.user_facts.filter(f => f.profile_id === profileId && f.kind === 'exercise_preference')
  check('user_facts still has exactly the two banned exercises', finalFacts.length === 2, finalFacts)
  check('injuries reflects the new code', (finalProfile as any).injuries.includes('shoulders'), (finalProfile as any).injuries)

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
