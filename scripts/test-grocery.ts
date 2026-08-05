/**
 * Grocery list regression suite (VISION-ARCHITECTURE.md §5 Part 5).
 *
 * Against an in-memory fake Supabase (house style, matching
 * test-memory.ts/test-pending-actions.ts):
 *   1. Unit-merged duplicates aggregate correctly (cross-unit, cross-day)
 *   2. Regeneration preserves manual items and checked state
 *   3. Removed meals drop their generated lines
 *   4. Chat-added items land identically to manually-added ones
 *   5. Undo removes exactly what was added (fresh insert vs. a merge)
 */

// --- Environment shims --------------------------------------------------

const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

// --- Fake Supabase (test-pending-actions.ts's shape: select/insert/upsert/update/delete) --

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { grocery_items: [] }
const UNIQUES: Record<string, string[][]> = { grocery_items: [['profile_id', 'canonical_key']] }

function uniqueViolation(table: string, row: Row): boolean {
  const keys = UNIQUES[table] ?? []
  return keys.some(cols => db[table].some(existing => existing.id !== row.id && cols.every(c => existing[c] === row[c])))
}

function cmp(a: unknown, b: unknown): number {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let updateObj: Row | null = null
  let single = false

  const exec = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (op === 'insert') {
      const inserted: Row[] = []
      for (const raw of payload) {
        const row: Row = { id: crypto.randomUUID(), created_at: raw.created_at ?? new Date().toISOString(), ...raw }
        if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        db[table].push(row)
        inserted.push(row)
      }
      return { data: single ? inserted[0] ?? null : inserted, error: null }
    }
    if (op === 'upsert') {
      for (const raw of payload) {
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
        if (existing) {
          Object.assign(existing, raw)
        } else {
          const row: Row = { created_at: new Date().toISOString(), ...raw }
          if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          db[table].push(row)
        }
      }
      return { data: null, error: null }
    }
    if (op === 'update') {
      const updated: Row[] = []
      for (const r of db[table]) if (filters.every(f => f(r))) { Object.assign(r, updateObj); updated.push(r) }
      return { data: single ? (updated[0] ?? null) : updated.map(r => ({ ...r })), error: null }
    }
    if (op === 'delete') {
      db[table] = db[table].filter(r => !filters.every(f => f(r)))
      return { data: null, error: null }
    }
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    const data = single ? (rows[0] ?? null) : rows.map(r => ({ ...r }))
    return { data, error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
      op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]
      onConflict = opts?.onConflict ? opts.onConflict.split(',') : null
      return api
    },
    update: (obj: Row) => { op = 'update'; updateObj = obj; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}

const fakeClient = { from: fakeFrom }

// --- Test harness -----------------------------------------------------------

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
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(fakeClient as any)

  const {
    getAllItems, addItemLocal, editItemLocal, setCheckedLocal, deleteItemLocal, clearCheckedLocal,
    undoAddLocal, generateGroceryList, flushPending,
  } = await import('../src/lib/grocery-store')
  const { classifyImperative } = await import('../src/lib/imperative-classifier')

  const profileId = crypto.randomUUID()
  const targets = { calories: 0, protein: 0, carbs: 0, fat: 0 } // dayWithinTolerance short-circuits true when calories<=0

  // ---- 1. Unit-merged duplicates aggregate correctly ------------------------
  console.log('\n[1] cross-unit, cross-day duplicate ingredients merge into one line')
  const mealPools = {
    breakfast: [{ slot: 'breakfast' as const, name: 'Oats Bowl', macros: targets, tags: [], ingredients: [
      { name: 'oats', quantity: 80, unit: 'g' },
      { name: 'olive oil', quantity: 1, unit: 'tbsp' }, // 15g by food-db's water-density default
    ] }],
    lunch: [{ slot: 'lunch' as const, name: 'Chicken Salad', macros: targets, tags: [], ingredients: [
      { name: 'olive oil', quantity: 10, unit: 'g' },
      { name: 'chicken breast', quantity: 150, unit: 'g' },
    ] }],
  }
  const genResult = await generateGroceryList({ profileId, mealPools, targets, days: 2 })
  check('generation reports 3 new lines added (oats, olive oil, chicken breast)', genResult.added === 3, genResult)
  await flushPending()
  const afterGen = await getAllItems(profileId)
  const oats = afterGen.find(i => i.canonical_key === 'oats')
  const oil = afterGen.find(i => i.canonical_key === 'olive oil')
  const chicken = afterGen.find(i => i.canonical_key === 'chicken breast')
  check('oats: 80g x 2 days = 160g', oats?.quantity === 160, oats)
  check('olive oil: (14g tbsp [food-db override] + 10g) x 2 days = 48g — cross-unit AND cross-slot merge in one line', oil?.quantity === 48, oil)
  check('chicken breast: 150g x 2 days = 300g', chicken?.quantity === 300, chicken)
  check('generated rows land in the fake DB via the local-first flush (not just the local merged view)', db.grocery_items.length === 3, db.grocery_items)

  // Regression: a chat add with no stated unit landing on an EXISTING
  // gram-based generated row must merge into that one row (the DB's
  // UNIQUE(profile_id, canonical_key) forbids a second row for the same
  // ingredient) rather than attempt a duplicate insert that gets silently
  // dead-lettered — the exact bug caught live: "add spinach" (default unit
  // 'whole') after generation had already produced a gram-based spinach line.
  // Isolated to its own profile so it doesn't disturb the main flow's state
  // (a regenerate reconciles ALL of a profile's generated rows, not just the
  // ones in the pools passed to it).
  const spinachProfileId = crypto.randomUUID()
  const spinachPools = { lunch: [{ slot: 'lunch' as const, name: 'Spinach Side', macros: targets, tags: [], ingredients: [{ name: 'spinach', quantity: 100, unit: 'g' }] }] }
  await generateGroceryList({ profileId: spinachProfileId, mealPools: spinachPools, targets, days: 1 })
  await flushPending()
  const beforeChatSpinach = await getAllItems(spinachProfileId)
  const rowCountBefore = beforeChatSpinach.filter(i => i.canonical_key === 'spinach').length
  check('exactly one spinach row exists after generation', rowCountBefore === 1, beforeChatSpinach)
  const chatSpinach = addItemLocal({ profileId: spinachProfileId, name: 'spinach', quantity: 1, unit: 'whole', source: 'chat', currentItems: beforeChatSpinach })
  check('the mismatched-unit chat add merges onto the existing row rather than creating a new one', !chatSpinach.created, chatSpinach)
  await flushPending()
  const afterChatSpinach = await getAllItems(spinachProfileId)
  check('still exactly one spinach row — no duplicate canonical_key insert, no dead-letter silent drop', afterChatSpinach.filter(i => i.canonical_key === 'spinach').length === 1, afterChatSpinach)
  check('merged quantity normalizes to grams (100g existing + ~1g from the 1:1 fallback for an unmapped count unit)', (afterChatSpinach.find(i => i.canonical_key === 'spinach')?.quantity ?? 0) > 100)

  // ---- 2. Regeneration preserves manual items + checked state --------------
  console.log('\n[2] regeneration preserves manual items and checked state; dropped meals remove their lines')
  const manualAdd = addItemLocal({ profileId, name: 'paper towels', quantity: 2, unit: 'rolls', source: 'manual', currentItems: afterGen })
  check('manual add created a fresh row', manualAdd.created, manualAdd)
  await flushPending()

  const beforeRegen = await getAllItems(profileId)
  const chickenBeforeRegen = beforeRegen.find(i => i.canonical_key === 'chicken breast')!
  setCheckedLocal(chickenBeforeRegen, true)
  await flushPending()

  // Regenerate WITHOUT the breakfast slot (oats/breakfast-olive-oil drop out of the horizon entirely).
  const mealPoolsNoBreakfast = { lunch: mealPools.lunch }
  const regenResult = await generateGroceryList({ profileId, mealPools: mealPoolsNoBreakfast, targets, days: 2 })
  check('regeneration reports the oats line removed (no longer in any selected meal)', regenResult.removed === 1, regenResult)
  check('regeneration reports the chicken/oil lines updated in place, not re-added', regenResult.updated === 2 && regenResult.added === 0, regenResult)
  await flushPending()

  const afterRegen = await getAllItems(profileId)
  check('oats line is gone', !afterRegen.some(i => i.canonical_key === 'oats'), afterRegen)
  check('olive oil survives (still sourced from lunch), recalculated to 10g x 2 = 20g', afterRegen.find(i => i.canonical_key === 'olive oil')?.quantity === 20, afterRegen)
  const chickenAfterRegen = afterRegen.find(i => i.canonical_key === 'chicken breast')
  check('chicken breast is the SAME row (id preserved) with checked state surviving the regenerate', chickenAfterRegen?.id === chickenBeforeRegen.id && chickenAfterRegen?.checked === true, chickenAfterRegen)
  const paperTowelsAfterRegen = afterRegen.find(i => i.canonical_key === 'manual:paper-towels')
  check('the manually-added paper towels line survives untouched (source=manual is never read by generation)', paperTowelsAfterRegen?.quantity === 2 && paperTowelsAfterRegen?.source === 'manual' && paperTowelsAfterRegen?.needs_review === true, paperTowelsAfterRegen)

  // ---- 3. Chat-added items land identically to manually-added ones ---------
  console.log('\n[3] a chat-sourced add produces the same row shape as a manual add, and generation never touches either')
  const chatAdd = addItemLocal({ profileId, name: 'milk', quantity: 1, unit: 'litre', source: 'chat', currentItems: afterRegen })
  await flushPending()
  const withChatItem = await getAllItems(profileId)
  const chatRow = withChatItem.find(i => i.id === chatAdd.row.id)!
  const manualRow = withChatItem.find(i => i.canonical_key === 'manual:paper-towels')!
  check('chat row has the identical field shape to the manual row (same keys)', JSON.stringify(Object.keys(chatRow).sort()) === JSON.stringify(Object.keys(manualRow).sort()), chatRow)
  check('chat row is tagged source=chat (provenance preserved, structure identical)', chatRow.source === 'chat')

  const regenAgain = await generateGroceryList({ profileId, mealPools: mealPoolsNoBreakfast, targets, days: 2 })
  check('a further regenerate touches neither the chat nor the manual row (only source=generated is ever written)', regenAgain.added === 0 && regenAgain.removed === 0)
  await flushPending()
  const afterSecondRegen = await getAllItems(profileId)
  check('chat-added milk still present, untouched', afterSecondRegen.some(i => i.id === chatAdd.row.id))
  check('manually-added paper towels still present, untouched', afterSecondRegen.some(i => i.canonical_key === 'manual:paper-towels'))

  // ---- 4. Undo removes exactly what was added -------------------------------
  console.log('\n[4] undo reverses exactly what addItemLocal did — a fresh insert deletes, a merge subtracts back out')
  const freshEggs = addItemLocal({ profileId, name: 'egg', quantity: 6, unit: 'whole', source: 'chat', currentItems: afterSecondRegen })
  check('fresh add created a new row', freshEggs.created)
  await flushPending()
  undoAddLocal(freshEggs.row, freshEggs.addedQuantity, freshEggs.created)
  await flushPending()
  const afterUndoFresh = await getAllItems(profileId)
  check('undoing a fresh add removes the row entirely', !afterUndoFresh.some(i => i.id === freshEggs.row.id), afterUndoFresh)

  const mergeEggs1 = addItemLocal({ profileId, name: 'egg', quantity: 6, unit: 'whole', source: 'chat', currentItems: afterUndoFresh })
  await flushPending()
  const afterFirstEggAdd = await getAllItems(profileId)
  const mergeEggs2 = addItemLocal({ profileId, name: 'egg', quantity: 6, unit: 'whole', source: 'chat', currentItems: afterFirstEggAdd })
  check('second add of the same item merges onto the existing row, not created fresh', !mergeEggs2.created && mergeEggs2.row.id === mergeEggs1.row.id, mergeEggs2)
  check('merged quantity summed to 12', mergeEggs2.row.quantity === 12, mergeEggs2.row)
  await flushPending()
  undoAddLocal(mergeEggs2.row, mergeEggs2.addedQuantity, mergeEggs2.created)
  await flushPending()
  const afterUndoMerge = await getAllItems(profileId)
  const eggAfterUndo = afterUndoMerge.find(i => i.id === mergeEggs1.row.id)
  check('undoing a merge subtracts exactly the added quantity back out (12 - 6 = 6), row survives', eggAfterUndo?.quantity === 6, eggAfterUndo)

  // Sanity on the other mutators while we're here (edit/delete/clear-checked).
  editItemLocal(eggAfterUndo!, { quantity: 12 })
  await flushPending()
  check('editItemLocal updates quantity in place', (await getAllItems(profileId)).find(i => i.id === eggAfterUndo!.id)?.quantity === 12)
  deleteItemLocal(eggAfterUndo!)
  await flushPending()
  check('deleteItemLocal removes the row', !(await getAllItems(profileId)).some(i => i.id === eggAfterUndo!.id))
  const beforeClear = await getAllItems(profileId)
  clearCheckedLocal(beforeClear)
  await flushPending()
  const afterClear = await getAllItems(profileId)
  check('clearCheckedLocal removed every checked row (chicken breast) and left unchecked rows alone', !afterClear.some(i => i.checked), afterClear)

  // ---- D2 reuse: the append-only chat door is gated identically to record_fact --
  console.log('\n[5] add_to_grocery_list/check_off_grocery_item reuse the same imperative gate as record_fact')
  const instructed = classifyImperative('add eggs and milk to my list', 'can you add eggs and milk to my list please')
  check('an explicit instruction to add passes the gate', instructed.imperative === true, instructed)
  const merelyStated = classifyImperative("we're out of eggs", "we're out of eggs, remind me later maybe")
  check('a mere low-stock statement with no instruction does NOT pass the gate (offer, not an action)', merelyStated.imperative === false, merelyStated)

  // ---- Summary -------------------------------------------------------------
  if (failures > 0) {
    console.error(`\n${failures} grocery check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll grocery checks passed.')
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exit(1)
})
