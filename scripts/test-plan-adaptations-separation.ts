/**
 * Injury/equipment adaptation — storage-separation regression test.
 *
 * plan_adaptations is a THIRD store, deliberately separate from both
 * fitness_profiles.injuries (the static onboarding list) and user_facts
 * (kind='exercise_preference', permanent bans) — see the migration's own
 * doc comment. This proves that separation the same way
 * test-injury-exclusion-separation.ts proves the injuries/user_facts split:
 * a fake-Supabase harness mirroring the REAL write shapes
 * (createPlanAdaptation's insert, checkAndRevertExpiredAdaptations'
 * update), asserting neither ever touches the other two stores.
 */

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { fitness_profiles: [], user_facts: [], plan_adaptations: [] }

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
    lt: (c: string, v: string) => { filters.push(r => (r[c] as string) < v); return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void) => Promise.resolve().then(() => resolve(exec())),
  }
  return api
}

/** Mirrors createPlanAdaptation's real insert shape (plan-adaptations-store.ts). */
async function createPlanAdaptation(client: { from: typeof fakeFrom }, profileId: string, injuryCode: string, durationDays: number) {
  const startsAt = new Date()
  const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
  await (client.from('plan_adaptations') as any).insert({
    profile_id: profileId,
    kind: 'injury',
    status: 'active',
    injury_code: injuryCode,
    equipment_override: null,
    affected_week_numbers: [1],
    pre_image: [{ week_number: 1, days: [] }],
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  })
}

/** Mirrors checkAndRevertExpiredAdaptations' real update shape. */
async function revertAdaptation(client: { from: typeof fakeFrom }, adaptationId: string) {
  await (client.from('plan_adaptations') as any)
    .update({ status: 'expired', ended_at: new Date().toISOString() })
    .eq('id', adaptationId)
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

  const { data: inserted } = await (client.from('fitness_profiles') as any)
    .insert({ injuries: ['knees', 'lower_back'] })
    .select('id')
    .single()
  const profileId = inserted.id

  console.log('\n[1] Creating a plan_adaptations row never writes to fitness_profiles.injuries')
  await createPlanAdaptation(client, profileId, 'shoulders', 7)
  const { data: profileAfterCreate } = await (client.from('fitness_profiles') as any)
    .select('injuries').eq('id', profileId).maybeSingle()
  check('injuries unchanged after creating an adaptation', JSON.stringify((profileAfterCreate as any).injuries) === JSON.stringify(['knees', 'lower_back']), (profileAfterCreate as any).injuries)
  check('the adaptation landed in plan_adaptations, not injuries', db.plan_adaptations.some(a => a.injury_code === 'shoulders'), db.plan_adaptations)

  console.log('\n[2] Creating a plan_adaptations row never writes a user_facts row')
  check('user_facts is still empty', db.user_facts.length === 0, db.user_facts)

  console.log('\n[3] Reverting an adaptation (the expiry sweep\'s update) never touches injuries or user_facts')
  const adaptation = db.plan_adaptations.find(a => a.injury_code === 'shoulders')!
  await revertAdaptation(client, adaptation.id as string)
  const { data: profileAfterRevert } = await (client.from('fitness_profiles') as any)
    .select('injuries').eq('id', profileId).maybeSingle()
  check('injuries unchanged after a revert', JSON.stringify((profileAfterRevert as any).injuries) === JSON.stringify(['knees', 'lower_back']), (profileAfterRevert as any).injuries)
  check('user_facts still empty after a revert', db.user_facts.length === 0, db.user_facts)
  check('the reverted row is marked expired, not deleted', db.plan_adaptations.find(a => a.id === adaptation.id)?.status === 'expired', db.plan_adaptations)

  console.log('\n[4] Writing to injuries (the existing onboarding path) never touches plan_adaptations')
  await (client.from('fitness_profiles') as any)
    .update({ injuries: ['knees', 'lower_back', 'neck'] })
    .eq('id', profileId)
  check('plan_adaptations unchanged by an injuries write', db.plan_adaptations.length === 1, db.plan_adaptations)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll plan-adaptations separation checks passed.')
}

main().catch(err => {
  console.error('Test harness crashed:', err)
  process.exit(1)
})
