// ---------------------------------------------------------------------------
// An in-memory stand-in for the Supabase client, for driving the REAL screens
// in a browser.
//
// WHY. The tour's targets live inside Dashboard, NutritionDisplay, MealPlan,
// WeekContextRow, SetGrid, ToolsTab and BottomTabBar, and most of those load
// their own data in a useEffect. Without a client they sit in their loading
// state forever — and a tour that spotlights a skeleton looks like it works.
// `*.supabase.co` is unreachable from the sandbox, so the choice is a fake or
// no real screens at all.
//
// It goes in through src/lib/supabase.ts's OWN test seam
// (`setSupabaseClient`), the one test-logging-roundtrip.ts already uses —
// not a vite alias — so nothing about the app's module graph changes for the
// harness. The app under test is the app.
//
// The query-builder surface is copied from the fakes those scripts already
// carry, minus their schema-specific constraint checks: those exist to prove
// writes are rejected correctly, which is not what this is for. Reads are
// what matter here.
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>
export type Db = Record<string, Row[]>

const cmp = (a: unknown, b: unknown): number =>
  a === b ? 0 : (a as never) < (b as never) ? -1 : 1

export function makeFakeSupabase(db: Db) {
  const table = (name: string) => (db[name] ??= [])

  const from = (name: string) => {
    let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
    let payload: Row[] = []
    let updateObj: Row = {}
    let onConflict: string[] | null = null
    let single = false
    let limitN: number | null = null
    const filters: ((r: Row) => boolean)[] = []
    const orders: [string, boolean][] = []

    const exec = () => {
      const rows0 = table(name)
      if (op === 'insert' || op === 'upsert') {
        // RETURN THE STORED ROWS, not the payload. The payload has no `id` —
        // Postgres generates it — so returning it made `.insert().select()
        // .single()` hand back a row with no id, and every caller that needs
        // one silently gave up. That is what made the tour's gated set stop
        // look like a tour bug: the ✓ was tapped, saveSet could not resolve
        // its workout_sessions id, nothing saved, and the tour sat waiting
        // for an attribute that was never going to clear.
        const stored: Row[] = []
        for (const raw of payload) {
          const existing = onConflict ? rows0.find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
          if (existing) { Object.assign(existing, raw); stored.push(existing) }
          else { const row = { id: crypto.randomUUID(), ...raw }; rows0.push(row); stored.push(row) }
        }
        const out = stored.map(r => ({ ...r }))
        return { data: single ? (out[0] ?? null) : out, error: null }
      }
      if (op === 'update') {
        for (const r of rows0) if (filters.every(f => f(r))) Object.assign(r, updateObj)
        return { data: null, error: null }
      }
      if (op === 'delete') {
        db[name] = rows0.filter(r => !filters.every(f => f(r)))
        return { data: null, error: null }
      }
      let rows = rows0.filter(r => filters.every(f => f(r)))
      for (const [col, asc] of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
      }
      if (limitN != null) rows = rows.slice(0, limitN)
      return { data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null }
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
      neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return api },
      gt: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) > 0); return api },
      gte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) >= 0); return api },
      lt: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) < 0); return api },
      lte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) <= 0); return api },
      is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return api },
      in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
      match: (obj: Row) => { for (const [c, v] of Object.entries(obj)) filters.push(r => r[c] === v); return api },
      order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
      limit: (n: number) => { limitN = n; return api },
      maybeSingle: () => { single = true; return api },
      single: () => { single = true; return api },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve().then(() => resolve(exec()), reject),
    }
    return api
  }

  return {
    from,
    // Nothing in the tour path uses these, but a component reaching for one
    // should get a shape rather than a crash that reads like a tour bug.
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  }
}
