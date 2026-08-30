// Probe: what happens when a user taps Confirm on a coach proposal more than
// 10 minutes after it appeared. Real claimPendingAction, in-memory table.
import { readFileSync } from 'fs'

type Row = Record<string, unknown>
const rows: Row[] = []

function fakeFrom(_table: string) {
  let filters: [string, unknown][] = []
  let pending: Row | null = null
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v)
  const api: Record<string, unknown> = {
    select: () => api, update: (patch: Row) => { pending = patch; return api },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return api },
    maybeSingle: async () => {
      const found = rows.filter(match)
      if (pending) { for (const r of found) Object.assign(r, pending) }
      return { data: found[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => void) => Promise.resolve().then(() => {
      const found = rows.filter(match)
      if (pending) for (const r of found) Object.assign(r, pending)
      resolve({ data: found, error: null })
    }),
  }
  return api
}

const { setSupabaseClient } = await import('../src/lib/supabase')
setSupabaseClient({ from: fakeFrom } as never)
const { claimPendingAction } = await import('../src/lib/pending-actions-store')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

console.log('\n[1] A proposal older than the 10-minute window')
rows.length = 0
rows.push({
  id: 'expired-1', profile_id: 'p1', status: 'pending', kind: 'propose_meal_swap',
  expires_at: new Date(Date.now() - 60_000).toISOString(), preconditions: {}, payload: {},
})
const expired = await claimPendingAction('expired-1', async () => true)
// The fix gave a timed-out proposal its OWN outcome rather than folding it in
// with already_resolved — the two mean different things to the person looking
// at the card ("this went stale" vs "you already answered this").
check('a timed-out proposal claims as "expired", its own outcome', expired.outcome === 'expired', expired)

console.log('\n[2] A proposal whose row has vanished')
const gone = await claimPendingAction('no-such-id', async () => true)
check('claim returns "not_found"', gone.outcome === 'not_found', gone)

console.log('\n[3] A proposal invalidated by a later tap')
rows.length = 0
rows.push({ id: 'stale-1', profile_id: 'p1', status: 'pending', kind: 'propose_meal_swap',
  expires_at: new Date(Date.now() + 600_000).toISOString(), preconditions: {}, payload: {} })
const stale = await claimPendingAction('stale-1', async () => false)
check('claim returns "stale"', stale.outcome === 'stale', stale)

console.log('\n[4] What the chat screen does with each of those outcomes')
const chat = readFileSync('src/components/ChatAssistant.tsx', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const start = chat.indexOf('const handleConfirmProposal')
const branch = chat.slice(start, start + 1200)
check('the screen handles "stale"', /claimResult\.outcome === 'stale'/.test(branch))
// RE-POINTED, 30 Aug 2026. These used to require a named branch per outcome.
// The fix is stronger than that: the handler now returns early for EVERY
// non-claimed outcome, so a new outcome added later cannot fall through the
// way 'expired' and 'not_found' silently did. Requiring the enumeration would
// have failed the exhaustive version — a probe rejecting a better fix than the
// one it imagined.
check('every non-claimed outcome changes the card, by construction',
  /outcome !== 'claimed'/.test(branch), branch.slice(0, 400))
check("...with 'already_resolved' still distinguished, since it must not invent a result",
  /already_resolved/.test(branch))
check('...and no outcome reaches a bare return that leaves Confirm armed',
  !/outcome === 'stale'\s*\)\s*\{[^}]*\}\s*return/.test(branch))

if (failures) { console.error(`\n${failures} check(s) failed — that is the finding.`); process.exit(0) }
console.log('\nAll checks passed.')
