// HOW HARD WAS IT, 1 TO 10 (his ruling 18 Nov 2026, "Build the 1–10"). Run: npm run test:session-effort
import { readFileSync } from 'fs'
import { effortWord, effortToFelt, validEffort, feelRun, buildFeelBrief, recordSessionEffort, readSessionEffort, loadFeelContext } from '../src/lib/session-feel'
import { setSupabaseClient } from '../src/lib/supabase'

let ran = 0, failures = 0
function ok(label: string, cond: boolean, extra?: unknown) {
  ran++
  if (cond) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)) }
}

console.log('§1 the bands')
ok('1-3 Easy, 4-6 Moderate, 7-8 Hard, 9-10 All-out', [1, 3, 4, 6, 7, 8, 9, 10].map(effortWord).join() === 'Easy,Easy,Moderate,Moderate,Hard,Hard,All-out,All-out', [1, 3, 4, 6, 7, 8, 9, 10].map(effortWord))
ok('feel word: 1-3 easy, 4-8 good, 9-10 hard', [1, 3, 4, 7, 8, 9, 10].map(effortToFelt).join() === 'easy,easy,good,good,good,hard,hard', [1, 3, 4, 7, 8, 9, 10].map(effortToFelt))
ok('never "rough": an effort number cannot say a session felt bad in himself', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(n => effortToFelt(n) !== 'rough'))
ok('only whole numbers 1 to 10 are kept', [0, 11, 7.5, -1, NaN].every(n => validEffort(n) === null) && validEffort('8') === null && validEffort(1) === 1 && validEffort(10) === 10)

console.log('§2 what the chat does with it (CSCS: 7-8 is a normal hard day, only 9-10 runs count towards easing off)')
const run = (efforts: number[]) => feelRun(efforts.map((e, i) => ({ date: `2026-11-1${i}`, felt: effortToFelt(e), effort: e })))
ok('three sessions at 8 do NOT make the coach offer to ease off', run([8, 8, 8]).needsBackoff === false)
ok('three at 9 or 10 do', run([9, 10, 9]).needsBackoff === true)
ok('two at 10 and one at 6 do not', run([10, 6, 10]).needsBackoff === false)
const brief = buildFeelBrief(null, run([8, 6, 9]))
ok('the coach is told the numbers he gave, most recent first', brief.includes('SESSION EFFORT HE RATED (1-10, most recent first): 8, 6, 9.'), brief)
const mixed = buildFeelBrief(null, feelRun([{ date: 'a', felt: 'good', effort: 7 }, { date: 'b', felt: 'hard', effort: null }]))
ok('...a session answered in the chat, with no number, says "not rated", never a made-up one', mixed.includes('7, not rated.'), mixed)
ok('...and no effort line at all when none was ever given', !buildFeelBrief(null, feelRun([{ date: 'a', felt: 'good' }])).includes('SESSION EFFORT'))

console.log('§3 saving')
type Row = Record<string, unknown>
function fake(rows: Row[], opts: { noEffortColumn?: boolean; failUpdate?: boolean } = {}) {
  const calls: Row[] = []
  const from = () => {
    let filters: [string, unknown][] = []
    let patch: Row | null = null
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return api },
      is: () => api, not: () => api, gte: () => api, lte: () => api, order: () => api, limit: () => api, in: () => api,
      update: (p: Row) => { patch = p; return api },
      maybeSingle: async () => ({ data: rows.find(r => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => {
        if (patch) {
          calls.push({ ...patch })
          if (opts.failUpdate) return Promise.resolve(res({ error: { message: 'network' } }))
          if (opts.noEffortColumn && 'effort' in patch) return Promise.resolve(res({ error: { code: 'PGRST204', message: "Could not find the 'effort' column of 'workout_sessions' in the schema cache" } }))
          const r = rows.find(x => filters.every(([c, v]) => x[c] === v)); if (r) Object.assign(r, patch)
        }
        return Promise.resolve(res(patch ? { error: null } : { data: rows.filter(r => filters.every(([c, v]) => r[c] === v)), error: null }))
      },
    }
    return api
  }
  return { client: { from } as never, calls }
}
const main = async () => {
  const rows: Row[] = [{ id: 's1', profile_id: 'p', date: '2026-11-18' }]
  let f = fake(rows); setSupabaseClient(f.client)
  ok('a tap of 8 is saved with its feel word', (await recordSessionEffort('p', '2026-11-18', 8)) === true && rows[0].effort === 8 && rows[0].felt === 'good', rows[0])
  ok('...and read back', (await readSessionEffort('p', '2026-11-18')) === 8)
  ok('a number outside 1-10 is never written', (await recordSessionEffort('p', '2026-11-18', 11)) === false && rows[0].effort === 8)
  const safe = async (fn: () => Promise<boolean>) => { try { return await fn() } catch { return 'threw' as const } }
  ok('no session that day: nothing is invented, and it says no', (await safe(() => recordSessionEffort('p', '2026-11-17', 5))) === false && rows.length === 1)
  const rows2: Row[] = [{ id: 's2', profile_id: 'p', date: '2026-11-18' }]
  f = fake(rows2, { noEffortColumn: true }); setSupabaseClient(f.client)
  ok('before the database has the column: the feel word is still saved, so the chat stops asking', (await recordSessionEffort('p', '2026-11-18', 9)) === true && rows2[0].felt === 'hard' && !('effort' in rows2[0]), rows2[0])
  ok('...by trying once with the number and once without', f.calls.length === 2 && 'effort' in f.calls[0] && !('effort' in f.calls[1]), f.calls)
  f = fake([{ id: 's3', profile_id: 'p', date: '2026-11-18' }], { failUpdate: true }); setSupabaseClient(f.client)
  ok('a failed save says so, so the screen can say "Couldn\'t save that"', (await recordSessionEffort('p', '2026-11-18', 6)) === false)

  setSupabaseClient(fake([{ id: 'a', profile_id: 'p', date: '2026-11-18', felt: 'good', effort: 7 }, { id: 'b', profile_id: 'p', date: '2026-11-16', felt: 'hard', effort: null }]).client)
  const ctx = await loadFeelContext('p', '2026-11-18')
  ok('the chat reads the numbers back from past sessions', JSON.stringify(ctx.run.efforts) === JSON.stringify([7, null]), ctx.run)

  console.log('§4 where it is drawn')
  const dialog = readFileSync('src/components/exercise/SessionSummaryDialog.tsx', 'utf8')
  ok('the summary saves through recordSessionEffort and shows the saved number', /recordSessionEffort\(profileId, date, n\)/.test(dialog) && /readSessionEffort\(profileId, date\)/.test(dialog))
  ok('a failed save is said on screen', dialog.includes("Couldn't save that. Check your connection and tap a number again."))
  ok('both places that open the summary say whose day it is', /effortFor=\{profileId && !summaryNothingLogged/.test(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8')) && /effortFor=\{profile\.id \?/.test(readFileSync('src/components/Dashboard.tsx', 'utf8')))
  const reader = readFileSync('src/lib/session-feel.ts', 'utf8')
  ok('the chat\'s read of past sessions cannot break before the migration (select *)', /\.select\('\*'\)\s*\.eq\('profile_id', profileId\)\s*\.not\('felt', 'is', null\)/.test(reader))
  ok('the migration allows only 1 to 10', /CHECK \(effort IS NULL OR \(effort >= 1 AND effort <= 10\)\)/.test(readFileSync('supabase/migrations/20261118140000_add_session_effort.sql', 'utf8')))

  console.log(`\n${ran} checks ran, ${failures} failed`)
  if (failures > 0) process.exit(1)
}
main()
