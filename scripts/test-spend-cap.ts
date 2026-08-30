// ---------------------------------------------------------------------------
// Gate: the AI functions cannot run up an unbounded bill.
//
// Audit §1.3. All four edge functions are gated by one thing — a valid key —
// and the only key is the anon key that ships inside the app's JavaScript,
// because it has to. Anyone who opens the app and copies one string could
// call the coach in a loop, and there was no rate limit, per-user quota or
// spend cap anywhere in any of them.
//
// The two layers fail in opposite directions on purpose, and that is the
// property most worth holding still:
//
//   - the BURST limiter needs no storage, so it is still standing when the
//     database is slow or down — which is exactly when a storage-backed
//     limiter fails open;
//   - the DAILY limiter is the real ceiling, and fails OPEN, because
//     refusing every request whenever a count can't be read turns a
//     transient blip into "your coach is broken" for every user at once.
//
// Section 1 exercises the real burst limiter through real Requests. The rest
// scan source with comments stripped.
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
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// The module is Deno-flavoured (Deno.env, .ts import specifiers). Give it a
// Deno global with no env set, so the durable layer is skipped and section 1
// measures the burst layer alone — which is also the exact configuration a
// deployment has before the migration is applied.
;(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } }

const cap = await import('../supabase/functions/_shared/spend-cap.ts')
const CORS = { 'Access-Control-Allow-Origin': '*' }

const request = (bytes = 100, ip = '203.0.113.7') =>
  new Request('https://example.test/fn', {
    method: 'POST',
    headers: { 'content-length': String(bytes), 'x-forwarded-for': ip },
  })

console.log('\n1. The burst limiter works with no storage at all')
{
  const config = { ...cap.CHAT_CAP, functionName: `burst-test-${Math.random()}`, burstMax: 3, burstWindowMs: 60_000 }

  const verdicts: (number | null)[] = []
  for (let i = 0; i < 5; i++) {
    const r = await cap.checkSpendCap(request(), config, CORS, 'profile-a')
    verdicts.push(r.response?.status ?? null)
  }
  check('the first three go through', verdicts.slice(0, 3).every(v => v === null), verdicts)
  check('the fourth is refused', verdicts[3] === 429, verdicts)
  check('...and so is the fifth', verdicts[4] === 429, verdicts)

  // A limit that pooled every caller together would throttle a whole office
  // off one person's use.
  const other = await cap.checkSpendCap(request(), config, CORS, 'profile-b')
  check('a different profile is unaffected — the window is per caller', other.response === null)

  const refused = await cap.checkSpendCap(request(), config, CORS, 'profile-a')
  check('the refusal carries Retry-After, so a client can back off properly',
    refused.response?.headers.get('Retry-After') === '60', refused.response?.headers.get('Retry-After'))
  const body = await refused.response!.json()
  check('...and says something a person can read, not a status code',
    typeof body.error === 'string' && body.error.length > 20 && !/429|rate.?limit/i.test(body.error), body)
}

console.log('\n2. An oversized request is refused before anything is spent')
{
  const config = { ...cap.CHAT_CAP, functionName: `size-test-${Math.random()}`, maxBodyBytes: 1000 }
  const big = await cap.checkSpendCap(request(5000), config, CORS, 'profile-c')
  check('a body over the limit is refused', big.response?.status === 413, big.response?.status)
  const ok = await cap.checkSpendCap(request(500), config, CORS, 'profile-c')
  check('a normal one is not', ok.response === null)

  const src = stripComments(readFileSync(join(ROOT, 'supabase/functions/_shared/spend-cap.ts'), 'utf8'))
  check('the size check reads the header rather than the body, so a huge payload costs nothing to reject',
    /content-length/.test(src) && !/await req\.text\(\)/.test(src))
}

console.log('\n3. No profile means no free pass — it falls back to the caller address')
{
  const config = { ...cap.CHAT_CAP, functionName: `ip-test-${Math.random()}`, burstMax: 2 }
  const a1 = await cap.checkSpendCap(request(100, '198.51.100.1'), config, CORS)
  const a2 = await cap.checkSpendCap(request(100, '198.51.100.1'), config, CORS)
  const a3 = await cap.checkSpendCap(request(100, '198.51.100.1'), config, CORS)
  check('an anonymous caller is still limited', a1.response === null && a2.response === null && a3.response?.status === 429)
  const b1 = await cap.checkSpendCap(request(100, '198.51.100.2'), config, CORS)
  check('...and a different address is counted separately', b1.response === null)
}

console.log('\n4. All four functions are behind it')
{
  const surfaces: [string, string][] = [
    ['chat-gemini', 'CHAT_CAP'],
    ['onboarding-chat', 'ONBOARDING_CAP'],
    ['generate-meals', 'MEALS_CAP'],
    ['macro-calibration', 'CALIBRATION_CAP'],
  ]
  for (const [fn, capName] of surfaces) {
    const src = stripComments(readFileSync(join(ROOT, `supabase/functions/${fn}/index.ts`), 'utf8'))
    check(`${fn} imports the cap`, new RegExp(`checkSpendCap, ${capName}`).test(src))
    check(`${fn} calls it, and returns its refusal`,
      /const cap = await checkSpendCap\(/.test(src) && /if \(cap\.response\) return cap\.response/.test(src))
    // Ordering is the whole point: a cap checked after the model call has
    // already spent the money it exists to save.
    const capAt = src.indexOf('checkSpendCap(')
    const geminiAt = src.search(/generativelanguage|GEMINI_MODEL|callGemini/)
    check(`${fn} checks it BEFORE any model call`, capAt > 0 && (geminiAt < 0 || capAt < geminiAt || src.indexOf('Deno.serve') < capAt),
      { capAt, geminiAt })
  }
}

console.log('\n5. The counter store is the one table anon cannot touch')
{
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20260830090000_create_ai_usage_daily.sql'), 'utf8')
  check('RLS is enabled on it', /ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY/.test(sql))
  // Every other table in this database is `TO anon USING (true)`. This one
  // must not be: a spend cap the caller can read, reset or inflate is not a
  // spend cap.
  check('no anon policy grants access to it', !/CREATE POLICY[\s\S]*ai_usage_daily[\s\S]*TO anon/.test(sql))
  check('the increment is one atomic statement, not read-then-write',
    /ON CONFLICT[\s\S]{0,200}requests = ai_usage_daily\.requests \+ 1/.test(sql))
  check('...returning the new value, so the caller compares the real count',
    /RETURNING requests INTO new_count/.test(sql))
  check('the function pins its search_path', /SET search_path = public/.test(sql))
  // Two separate statements, checked separately — an earlier single regex
  // spanned both with a character budget that the real signature overran,
  // so it failed on correct SQL.
  check('execute is revoked from everyone by default',
    /REVOKE ALL ON FUNCTION increment_ai_usage\(text, text\) FROM PUBLIC/.test(sql))
  check('...and granted only to the service role the functions use',
    /GRANT EXECUTE ON FUNCTION increment_ai_usage\(text, text\) TO service_role/.test(sql))
  check('...and never to anon', !/GRANT EXECUTE ON FUNCTION increment_ai_usage[^;]*anon/.test(sql))

  // REVOKE ... FROM PUBLIC READS AIRTIGHT AND IS NOT, on Supabase. Supabase
  // hands anon and authenticated privileges on new objects in `public` via
  // DEFAULT PRIVILEGES, and those land as DIRECT grants — which revoking from
  // PUBLIC does not touch. Proven by running the migrations against a real
  // PostgreSQL with that setup (scripts/test-rls-local.mjs), where anon could
  // still call the counter and push any profile it named over its daily cap.
  const hardened = readFileSync(
    join(ROOT, 'supabase/migrations/20260830130000_close_the_usage_counter_to_anon.sql'), 'utf8')
  check('the revoke names the roles that actually hold the grant',
    /REVOKE ALL ON FUNCTION increment_ai_usage\(text, text\) FROM PUBLIC, anon, authenticated;/.test(hardened))
  check('...and the service role keeps it, or the cap counts nothing at all',
    /GRANT EXECUTE ON FUNCTION increment_ai_usage\(text, text\) TO service_role;/.test(hardened))
}

console.log('\n6. The two layers fail in the directions they were designed to')
{
  const src = stripComments(readFileSync(join(ROOT, 'supabase/functions/_shared/spend-cap.ts'), 'utf8'))
  check('an unreachable counter store returns null rather than throwing', /catch \{\s*return null/.test(src))
  check('...and null means allowed, so a database blip never breaks the coach',
    /callerCount != null &&/.test(src) && /globalCount != null &&/.test(src))
  check('the burst layer runs before the store is consulted',
    src.indexOf('burstExceeded(') < src.indexOf('incrementDaily('))
  // Per-caller limits alone bound nothing: a thousand fabricated profile ids
  // each stay under their own quota. The global row is what actually caps the
  // bill, so check it is COUNTED and COMPARED, not merely named — the first
  // version of this check tested for the string "dailyGlobal" and stayed
  // green when the field was renamed out of use.
  check('a global counter is incremented under its own scope',
    /incrementDaily\([^)]*'global'/.test(src))
  check('...and compared against the configured ceiling',
    /globalCount > config\.dailyGlobal/.test(src))
  check('...and refusing over it returns a service status, not a client one',
    /globalCount > config\.dailyGlobal[\s\S]{0,200}deny\(503/.test(src))
  // Copy check: a service-wide ceiling is not the user's fault.
  check('the global refusal does not blame the user',
    /temporarily unavailable/.test(src) && !/you.{0,20}used too much/i.test(src))
  check('the in-memory map is bounded, or a long-lived isolate leaks',
    /hits\.size > \d+/.test(src) && /hits\.delete\(k\)/.test(src))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll spend-cap checks passed.')
