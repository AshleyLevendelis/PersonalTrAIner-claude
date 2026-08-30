// ---------------------------------------------------------------------------
// Gate: a coach proposal you can no longer apply must SAY so.
//
// THE BUG. Proposals expire after ten minutes. handleConfirmProposal asked
// claimPendingAction to claim one, got back one of four outcomes, and had a
// branch for exactly one of them ('stale'). Every other outcome fell through
// to a bare `return`, so the card was never updated: still showing Confirm,
// no message, no error. The button did nothing, and kept doing nothing
// however many times it was pressed. Ten minutes is short — read a coach
// message, get distracted, come back — and it survived a reload, because the
// chat is restored from a local cache with the card still armed.
//
// Two halves have to hold together, which is why they are gated together:
//   1. the STORE must distinguish the outcomes (an expired row is not the
//      same event as one you already answered), and
//   2. the SCREEN must have a branch for every one of them, and the card
//      must render a line rather than silently dropping its buttons.
//
// Section 1 runs the real claimPendingAction against an in-memory table.
// Sections 2-3 scan source with comments stripped, so this file's own
// explanation of the rule can never be what satisfies it.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// --- an in-memory pending_actions table -------------------------------------

type Row = Record<string, unknown>
const rows: Row[] = []

function fakeFrom(_table: string) {
  const filters: [string, unknown][] = []
  let patch: Row | null = null
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v)
  const apply = () => {
    const found = rows.filter(match)
    if (patch) for (const r of found) Object.assign(r, patch)
    return found
  }
  const api: Record<string, unknown> = {
    select: () => api,
    update: (p: Row) => { patch = p; return api },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return api },
    maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve().then(() => resolve({ data: apply(), error: null })),
  }
  return api
}

const { setSupabaseClient } = await import('../src/lib/supabase')
setSupabaseClient({ from: fakeFrom } as never)
const { claimPendingAction } = await import('../src/lib/pending-actions-store')

const seed = (over: Row = {}) => {
  rows.length = 0
  rows.push({
    id: 'p-1', profile_id: 'prof-1', status: 'pending', kind: 'propose_meal_swap',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    preconditions: {}, payload: {}, ...over,
  })
}

console.log('\n1. The store tells the four outcomes apart')
{
  seed({ expires_at: new Date(Date.now() - 60_000).toISOString() })
  const expired = await claimPendingAction('p-1', async () => true)
  check('a proposal past its window claims as "expired"', expired.outcome === 'expired', expired)
  check('...and the row is marked expired, not left pending', rows[0].status === 'expired', rows[0].status)

  seed()
  const gone = await claimPendingAction('nope', async () => true)
  check('a proposal whose row has gone claims as "not_found"', gone.outcome === 'not_found', gone)

  seed()
  const stale = await claimPendingAction('p-1', async () => false)
  check('a proposal invalidated by a later tap claims as "stale"', stale.outcome === 'stale', stale)

  seed({ status: 'done' })
  const resolved = await claimPendingAction('p-1', async () => true)
  check('a proposal answered already claims as "already_resolved"', resolved.outcome === 'already_resolved', resolved)

  seed()
  const ok = await claimPendingAction('p-1', async () => true)
  check('a live proposal still claims normally', ok.outcome === 'claimed', ok.outcome)

  // The exactly-once guarantee this all sits on top of, re-checked here
  // because the branch above is one `if` away from it.
  const second = await claimPendingAction('p-1', async () => true)
  check('...and a second tap on the same one does not claim twice', second.outcome === 'already_resolved', second)
}

console.log('\n2. The screen has a branch for every outcome it can be handed')
{
  const chat = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  const start = chat.indexOf('const handleConfirmProposal')
  check('handleConfirmProposal exists', start >= 0)
  // Slice the real handler body, not a guessed window: from its declaration
  // to the next top-level `const ` at the same indent.
  const rest = chat.slice(start)
  const endRel = rest.slice(1).search(/\n  const /)
  const body = endRel > 0 ? rest.slice(0, endRel + 1) : rest

  check('it handles "stale"', /'stale'/.test(body))
  check('it handles "already_resolved" — a proposal answered elsewhere', /already_resolved/.test(body))
  check('it re-reads the row rather than guessing what happened to it',
    /already_resolved[\s\S]{0,220}getPendingAction/.test(body))
  // The two remaining outcomes ('expired', 'not_found') share a fallback, so
  // what matters is that SOMETHING sets the card's status on every
  // non-claimed path — never a bare `return` that leaves it armed.
  const nonClaimed = body.slice(body.indexOf("outcome !== 'claimed'"))
  const guardBlock = nonClaimed.slice(0, nonClaimed.indexOf('\n      return'))
  check('every non-claimed outcome updates the card instead of returning silently',
    /setMessages/.test(guardBlock), guardBlock.slice(0, 300))
  check('...and the fallback status is "expired"', /'expired'/.test(guardBlock))

  check('the expiry sweep is actually called on chat load',
    /expireOldPendingActions\(/.test(chat.slice(0, chat.indexOf('const handleConfirmProposal'))))
}

console.log('\n3. A card that cannot be acted on says why')
{
  const card = stripComments(readFileSync(join(ROOT, 'src/components/chat/ProposalCard.tsx'), 'utf8'))
  check('an expired card renders a line of copy', /status === 'expired' \?\s*["']/.test(card))
  check('...and a declined one', /status === 'declined' \?\s*['"]/.test(card))
  check('...and a failed one', /status === 'failed' \?\s*["']/.test(card))
  // The regression this replaces: `isTerminal ? null :` dropped the buttons
  // and rendered nothing at all.
  check('a terminal card no longer renders nothing at all', !/isTerminal \? null/.test(card))
  check('the note is actually placed in the output', /terminalNote &&\s*<p/.test(card))
  // The copy must not name the internal state — it is read by someone who
  // has never heard the word "pending action".
  // Both quote styles, and a string may legitimately contain the other
  // quote character ("This one's timed out") — an earlier version of this
  // regex used a backreference with a [^"'] body and silently matched only
  // the apostrophe-free half of the copy.
  const copy = [...card.matchAll(/status === '(?:expired|declined|failed|done)'[^?]*\?\s*(?:"([^"]+)"|'((?:[^'\\]|\\.)+)')/g)]
    .map(m => m[1] ?? m[2])
  check('copy exists for every terminal state that can render', copy.length >= 3, copy)
  check('...and none of it leaks internal vocabulary',
    !copy.some(c => /pending.?action|claim|precondition|payload|scope_key/i.test(c)), copy)
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll proposal-expiry checks passed.')
