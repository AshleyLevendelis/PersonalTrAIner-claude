import { anchorNowMs } from './anchor.mjs'
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

/**
 * Milliseconds to hold every read before answering — `?slow=800` in the URL.
 *
 * Added 7 Sep 2026. The fake answered in the same microtask, which is fine for
 * "does this screen render" and useless for the whole class of bug Ashley
 * reported from her phone: the chat announcing a rest day because the plan had
 * not arrived, and Home blank for seconds on a tab switch. Both are about the
 * window BEFORE the data lands, and a fake with no window has no way to show
 * one.
 *
 * Zero by default, so every existing harness run is unchanged.
 */
const SLOW_MS = (() => {
  try {
    const n = Number(new URLSearchParams(location.search).get('slow'))
    return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 0
  } catch {
    return 0
  }
})()

/**
 * A CONNECTION THAT IS UP BUT DEAD — `window.__netDown = true`, or `?netdown=1`
 * to start that way. Added 9 Oct 2026 for H20.
 *
 * Every request, read or write, comes back the way the real client reports a
 * dead network: RESOLVED, with `{ data: null, error }` and an empty `code` —
 * not thrown (postgrest-js, read in the installed package). `navigator.onLine`
 * is left alone on purpose: the bug is the case where the browser never learns
 * it is offline, so the app's `online`/`offline` guards cannot help.
 *
 * Until this existed the fake always answered, and that is why no driver had
 * ever seen a logged set read back as "0 logged": a fake that cannot fail a
 * read cannot show what a failed read does to the screen. Off by default, so
 * every existing run is unchanged. Combine with `?slow=` for the seconds a real
 * dead read takes to give up.
 */
const NET_DOWN_AT_START = (() => {
  try { return new URLSearchParams(location.search).get('netdown') === '1' } catch { return false }
})()
if (NET_DOWN_AT_START) (window as unknown as { __netDown?: boolean }).__netDown = true
const netDown = () => (window as unknown as { __netDown?: boolean }).__netDown === true
const DEAD = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } })

/**
 * THE COLUMNS POSTGRES HOLDS AS WHOLE NUMBERS — and refuses anything else for.
 *
 * WHY, 9 Oct 2026 (the test log's M21). The favourite heart had never saved a
 * real meal: it wrote the meal's protein, carbs and fat with one decimal
 * (46.6) into `integer` columns, and PostgREST does not round — it rejects the
 * row (22P02, "invalid input syntax for type integer"). Every check of the
 * heart ran against this fake, which took 46.6 without a word, so the browser
 * driver showed a heart filling in while the real one did nothing. "A fake
 * must fill what the database fills" has a twin: A FAKE MUST REFUSE WHAT THE
 * DATABASE REFUSES, or the whole class is invisible.
 *
 * Read off supabase/migrations (every `integer`/`smallint`/`bigint` column of
 * a CREATE TABLE or an ADD COLUMN) and written out here, because this file is
 * bundled for the browser and cannot read SQL. test:meal-favourite section 9
 * re-derives the list from the migrations and fails when the two differ, so a
 * new integer column cannot be forgotten.
 *
 * Only NUMBERS are judged. null is allowed (nullability is a different
 * constraint), and a whole number is allowed whatever its size.
 */
export const INTEGER_COLUMNS: Record<string, readonly string[]> = {
  ai_usage_daily: ['requests'],
  cardio_logs: ['avg_heart_rate', 'duration_minutes', 'intensity_rpe'],
  coach_moment_facts: ['streak_days'],
  daily_nutrition_targets: ['calculated_bmr', 'calculated_tdee', 'estimated_eee', 'target_calories', 'target_carbs_g', 'target_fats_g', 'target_protein_g'],
  daily_steps: ['steps'],
  exercise_plans: ['sets', 'week_number'],
  exercise_set_logs: ['drop_index', 'reps_completed', 'set_number', 'week_number'],
  favorite_meals: ['calories', 'carbs', 'fat', 'protein', 'times_used'],
  fitness_profiles: ['age', 'daily_step_target', 'meals_per_day', 'water_target_ml'],
  load_suggestions: ['block_number', 'exercise_index'],
  meal_plan_slots: ['pool_index'],
  meal_plans: ['calories', 'carbs', 'fat', 'protein', 'sub_calories', 'sub_carbs', 'sub_fat', 'sub_protein'],
  mesocycle_weeks: ['block_number', 'week_in_block', 'week_number'],
  nutrition_cache: ['calories', 'carbs', 'fat', 'protein'],
  pending_actions: ['payload_version'],
  set_logs: ['reps_completed', 'set_number', 'week_number'],
  water_logs: ['amount_ml'],
  weight_basis_offers: ['applied_from_week'],
  workout_exercises: ['execution_order', 'rest_seconds', 'rpe_target', 'sets', 'tier'],
  workout_logs: ['reps_completed', 'set_number'],
  workout_sessions: ['duration_minutes', 'week_number'],
}

/**
 * Defaults the real table fills in that a writer then READS BACK and does
 * arithmetic on. One so far: a favourite's `times_used` (DEFAULT 1 in the
 * migration). The heart's second tap adds one to it; with no default here that
 * was `undefined + 1`, and the whole-number check above — correctly — refused
 * the NaN. Found the first time the heart's update path was run at all.
 */
const COLUMN_DEFAULTS: Record<string, Row> = {
  favorite_meals: { times_used: 1 },
}

/** The first value in `row` that an integer column would refuse, or null. */
export function integerViolation(tableName: string, row: Row): { column: string; value: number } | null {
  for (const column of INTEGER_COLUMNS[tableName] ?? []) {
    const value = row[column]
    if (typeof value === 'number' && !Number.isInteger(value)) return { column, value }
  }
  return null
}

/** Every write this fake refused for a non-integer, so a driver can ask "did anything else trip?" (window.__intRejects). */
const rejectAsPostgres = (tableName: string, v: { column: string; value: number }) => {
  try {
    const w = window as unknown as { __intRejects?: { table: string; column: string; value: number }[] }
    ;(w.__intRejects ??= []).push({ table: tableName, ...v })
  } catch { /* no window: a logic gate is calling this directly */ }
  return { data: null, error: { code: '22P02', message: `invalid input syntax for type integer: "${v.value}"`, details: null, hint: null } }
}

export function makeFakeSupabase(db: Db) {
  const table = (name: string) => (db[name] ??= [])

  const from = (name: string) => {
    let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
    let payload: Row[] = []
    let updateObj: Row = {}
    let onConflict: string[] | null = null
    let single = false
    let limitN: number | null = null
    let wantCount = false
    const filters: ((r: Row) => boolean)[] = []
    const orders: [string, boolean][] = []

    const exec = () => {
      if (netDown()) return DEAD()
      const rows0 = table(name)
      // A WRITE A DRIVER WANTS TO FAIL. Opt-in: a driver sets window.__failWrite
      // to a predicate over (table, operation, row); nothing sets it by
      // default, so every other run is unchanged. It is how a half-saved swap
      // is proved put back, which no happy path can show.
      const failWrite = (window as unknown as { __failWrite?: (t: string, o: string, r: Row) => boolean }).__failWrite
      if (failWrite && (op === 'insert' || op === 'upsert' || op === 'delete') && (op === 'delete' ? failWrite(name, op, {}) : payload.some(r => failWrite(name, op, r)))) {
        return { data: null, error: { code: '08006', message: 'simulated write failure' } }
      }
      // A DECIMAL IN A WHOLE-NUMBER COLUMN IS REFUSED, AS POSTGRES REFUSES IT
      // (INTEGER_COLUMNS above). Before anything is stored: a rejected insert
      // leaves no row, and a rejected update changes none.
      for (const row of op === 'insert' || op === 'upsert' ? payload : op === 'update' ? [updateObj] : []) {
        const bad = integerViolation(name, row)
        if (bad) return rejectAsPostgres(name, bad)
      }
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
          // AND `created_at`, which Postgres also fills in. Found 27 Sep 2026:
          // a grocery row synced here with no created_at, the store's read
          // sorts on it, and the sort threw — so the list read back EMPTY
          // while the table held every row. Read off the harness's one clock,
          // not the machine's, so a run gives the same answer on a Tuesday.
          // A DRIVER MAY CHOOSE ONE INPUT OF A NEW ROW (9 Oct 2026):
          // `window.__rowPatch = { pending_actions: () => ({ expires_at }) }`.
          // An offer's window is ten real minutes and no driver can wait that
          // long; this lets one be made eight seconds from its end, so the
          // card's OWN timer is what is watched. Opt-in, applied to inserts
          // only, and absent on every run that does not set it.
          // ...AND THE COLUMN DEFAULTS A WRITER RELIES ON (COLUMN_DEFAULTS below).
          else {
            const patch = (window as unknown as { __rowPatch?: Record<string, (row: Row) => Row> }).__rowPatch?.[name]
            const row = { id: crypto.randomUUID(), created_at: new Date(anchorNowMs()).toISOString(), ...(COLUMN_DEFAULTS[name] ?? {}), ...raw, ...(patch ? patch(raw) : {}) }
            rows0.push(row); stored.push(row)
          }
        }
        const out = stored.map(r => ({ ...r }))
        return { data: single ? (out[0] ?? null) : out, error: null }
      }
      if (op === 'update') {
        // RETURN THE UPDATED ROWS — the same lesson the insert branch above
        // learned, one operation later, and it cost more.
        //
        // FOUND 15 Sep 2026 while writing the first driver that ever tapped
        // Apply on a coach proposal. `data: null` made
        // `.update().select().maybeSingle()` answer null, and
        // claimPendingAction reads exactly that to decide who won the claim:
        //   if (error || !data) return { outcome: 'already_resolved' }
        // So every confirm in this harness wrote status='claimed' to the row
        // and then returned 'already_resolved' to its caller, which returns
        // early. The card stayed on screen, nothing executed, and no error was
        // raised anywhere.
        //
        // WHAT THAT MEANS FOR EVERY DRIVER BEFORE THIS ONE: not one of them
        // could have confirmed a proposal, so "the coach's confirm path works"
        // was never proven on a real screen — the chat drivers all stop at the
        // card. That is not a fact about this change; it is a hole in what the
        // harness was able to prove at all.
        const hit: Row[] = []
        for (const r of rows0) if (filters.every(f => f(r))) { Object.assign(r, updateObj); hit.push(r) }
        const out = hit.map(r => ({ ...r }))
        return { data: single ? (out[0] ?? null) : out, error: null }
      }
      if (op === 'delete') {
        db[name] = rows0.filter(r => !filters.every(f => f(r)))
        return { data: null, error: null }
      }
      let rows = rows0.filter(r => filters.every(f => f(r)))
      for (const [col, asc] of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
      }
      // The MATCHING row count, before the limit — which is what
      // `{ count: 'exact' }` means and what the fake silently omitted until
      // 7 Sep 2026. loadChatHistory reads it to decide whether this is a
      // brand-new account, so an absent count made every seeded conversation
      // look like a first-ever chat, and every feature gated on "they have
      // talked to the coach before" was unreachable in the harness.
      const total = rows.length
      if (limitN != null) rows = rows.slice(0, limitN)
      return {
        data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })),
        error: null,
        ...(wantCount ? { count: total } : {}),
      }
    }

    const api: Record<string, unknown> = {
      select: (_cols?: string, opts?: { count?: string }) => { if (opts?.count) wantCount = true; return api },
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
      // `.not('felt', 'is', null)` — session-feel.ts's answered-sessions query.
      // Absent until 7 Sep 2026, so that query threw, loadFeelContext's
      // .catch(() => {}) swallowed it, and feelContext stayed null forever:
      // every screen that waits for it (the opener, and now coach-nudge.ts)
      // sat waiting on a fake that could not answer.
      not: (c: string, op: string, v: unknown) => {
        filters.push(r => (op === 'is' ? (r[c] ?? null) !== v : r[c] !== v))
        return api
      },
      in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
      // SQL LIKE — `%` any run, `_` one character, everything else literal.
      // Missing until 9 Oct 2026, so the one production query that uses it
      // (sweepStaleForTarget, after a tap-swap) threw here and read as "that
      // swap didn't save": a fake must answer what the database answers.
      like: (c: string, pattern: string) => {
        const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$')
        filters.push(r => typeof r[c] === 'string' && re.test(r[c] as string))
        return api
      },
      match: (obj: Row) => { for (const [c, v] of Object.entries(obj)) filters.push(r => r[c] === v); return api },
      order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
      limit: (n: number) => { limitN = n; return api },
      maybeSingle: () => { single = true; return api },
      single: () => { single = true; return api },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        (SLOW_MS > 0
          ? new Promise<void>(r => setTimeout(r, SLOW_MS))
          : Promise.resolve()
        ).then(() => resolve(exec()), reject),
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
