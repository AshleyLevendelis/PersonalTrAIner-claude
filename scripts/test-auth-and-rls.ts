// ---------------------------------------------------------------------------
// Gate: the client half of closing the database.
//
// scripts/test-rls-local.mjs proves what PostgreSQL does. It cannot see the
// app, and the app is where this change can go wrong in the ways that hurt
// most — because the failure mode is not an error, it is EMPTINESS. With
// row-level security on, a client that reads before it signs in gets zero
// rows back and no error at all, which from inside the app is
// indistinguishable from "this person is new". A returning user would be
// silently walked back through onboarding, on top of a plan that is still
// sitting in the database.
//
// So the ordering checks below are not style. Each one is a way a user loses
// their training history without anything appearing to be wrong.
//
// Sections 1-4 execute the real auth module against a stubbed client.
// Section 5 reads App.tsx, with comments stripped first — this session has
// been bitten repeatedly by checks satisfied by their own explanation.
// ---------------------------------------------------------------------------

import { execFileSync } from 'child_process'
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

// --- a stub Supabase, recording what the module asks it to do ---------------

const calls: string[] = []
let session: { user: { id: string; email?: string } } | null = null
let anonSignInCount = 0
let rpcResult: unknown = true
let updateUserError: string | null = null
let orderedBy: { column: string; ascending?: boolean } | null = null
let ownedRows: { id: string }[] = []

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const fakeClient = {
  auth: {
    getSession: async () => { calls.push('getSession'); return { data: { session }, error: null } },
    getUser: async () => { calls.push('getUser'); return { data: { user: session?.user ?? null }, error: null } },
    signInAnonymously: async () => {
      calls.push('signInAnonymously')
      anonSignInCount++
      session = { user: { id: 'anon-uid-1' } }
      return { data: { user: session.user }, error: null }
    },
    updateUser: async (patch: { email?: string; password?: string }) => {
      calls.push(`updateUser:${patch.email}`)
      if (updateUserError) return { data: null, error: { message: updateUserError } }
      if (session) session.user.email = patch.email
      return { data: { user: session?.user }, error: null }
    },
    signInWithPassword: async () => ({ data: null, error: null }),
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push(`rpc:${name}:${JSON.stringify(args)}`)
    return { data: rpcResult, error: null }
  },
  from: (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      order: (column: string, opts: { ascending?: boolean }) => { orderedBy = { column, ...opts }; return api },
      limit: () => api,
      maybeSingle: async () => { calls.push(`select:${table}`); return { data: ownedRows[0] ?? null, error: null } },
    }
    return api
  },
}

const { setSupabaseClient } = await import('../src/lib/supabase')
setSupabaseClient(fakeClient as never)
const auth = await import('../src/lib/auth')

console.log('\n1. Signing in resumes; it does not hand out a second identity')
{
  session = null
  calls.length = 0
  const first = await auth.ensureSignedIn()
  check('with no session, it signs in anonymously', first.userId === 'anon-uid-1' && first.isNew, first)
  check('...with no email yet', first.email === null, first)

  // THE ONE THAT MATTERS MOST. A second anonymous sign-in for someone who
  // already has a session gives them a new uid — and their profile is owned
  // by the OLD one. claim_profile only touches unowned rows, so that profile
  // becomes permanently unreachable. Not an error; just gone.
  calls.length = 0
  const second = await auth.ensureSignedIn()
  check('called again, it resumes rather than creating another account',
    second.userId === 'anon-uid-1' && !second.isNew, second)
  check('...and did not sign in anonymously a second time', anonSignInCount === 1, anonSignInCount)
  check('...having checked for an existing session FIRST', calls[0] === 'getSession', calls)

  session = { user: { id: 'u2', email: 'a@example.test' } }
  const withEmail = await auth.ensureSignedIn()
  check('an account with an email reports it', withEmail.email === 'a@example.test', withEmail)
}

console.log('\n2. Failing to sign in is reported, never swallowed')
{
  const broken = {
    ...fakeClient,
    auth: { ...fakeClient.auth, getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: async () => ({ data: { user: null }, error: { message: 'network down' } }) },
  }
  setSupabaseClient(broken as never)
  const result = await auth.ensureSignedIn()
  check('the reason comes back', result.error === 'network down', result)
  check('...and no user id is invented', result.userId === null, result)
  setSupabaseClient(fakeClient as never)
}

console.log('\n3. Claiming is a server-side RPC, and answers honestly')
{
  calls.length = 0
  rpcResult = true
  check('claiming an unowned profile succeeds', (await auth.claimProfile('p-1')) === true)
  check('...through claim_profile, with the profile id',
    calls.some(c => c.startsWith('rpc:claim_profile:') && c.includes('p-1')), calls)

  rpcResult = false
  check('a profile it could not claim reports false', (await auth.claimProfile('p-2')) === false)

  // A claim that reported "already owned" separately from "not yours" would
  // answer "does this UUID exist and is it taken" for anyone who asked.
  rpcResult = null
  check('anything other than a clear yes is a no', (await auth.claimProfile('p-3')) === false)
  rpcResult = true
}

console.log('\n4. The email prompt asks, snoozes, and comes back')
{
  store.clear()
  session = { user: { id: 'anon-uid-1' } }
  check('an anonymous account is asked', (await auth.shouldAskForEmail()) === true)

  auth.snoozeEmailPrompt()
  check('"not now" stops it being asked again straight away', (await auth.shouldAskForEmail()) === false)
  check('...and that is recorded as an expiry, not a permanent refusal',
    auth.isEmailPromptSnoozed() === true)

  // Ashley's ruling was "asked again later", not "never asked again".
  const raw = Number(store.get('fitplan_email_prompt_dismissed_until'))
  const daysOut = (raw - Date.now()) / (24 * 60 * 60 * 1000)
  check('...expiring in days, not never', daysOut > 1 && daysOut < 60, daysOut)

  store.clear()
  session = { user: { id: 'u3', email: 'has@example.test' } }
  check('an account that already has an email is never asked', (await auth.shouldAskForEmail()) === false)

  session = { user: { id: 'anon-uid-1' } }
  const bad = await auth.attachEmail('not-an-email', 'longenough')
  check('a malformed address is refused before the network', !bad.ok && /email address/.test(bad.error ?? ''), bad)
  const short = await auth.attachEmail('a@b.co', 'abc')
  check('...and so is a password too short to be worth having', !short.ok, short)

  calls.length = 0
  const good = await auth.attachEmail(' me@example.test ', 'a-real-password')
  check('a good one is attached to the SAME account, keeping its uid',
    good.ok && calls.some(c => c === 'updateUser:me@example.test'), { good, calls })
  check('...and the snooze is cleared, since there is nothing left to ask',
    !auth.isEmailPromptSnoozed())

  updateUserError = 'email already registered'
  const clash = await auth.attachEmail('taken@example.test', 'a-real-password')
  check('a rejected email reports why', !clash.ok && clash.error === 'email already registered', clash)
  updateUserError = null
}

console.log('\n5. Restoring a profile picks the newest, not an arbitrary one')
{
  // "New Plan" abandons a profile without deleting it, so one account can own
  // several. An unordered limit(1) would restore whichever the planner
  // reached first — possibly a plan the user walked away from months ago.
  orderedBy = null
  ownedRows = [{ id: 'newest' }]
  check('it returns the owned profile', (await auth.findOwnedProfileId()) === 'newest')
  check('...ordered by creation date, newest first',
    orderedBy?.column === 'created_at' && orderedBy?.ascending === false, orderedBy)
}

console.log('\n6. The app signs in BEFORE it reads, and stamps what it writes')
{
  const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))

  // Slice the real function, so nothing elsewhere in a 2,300-line file can
  // satisfy an ordering check about this one.
  const start = app.indexOf('const restoreSession = async () => {')
  const restore = app.slice(start, app.indexOf('\n  }', start))
  check('restoreSession exists to check', start > 0)

  const signInAt = restore.indexOf('ensureSignedIn(')
  const claimAt = restore.indexOf('claimProfile(')
  const firstReadAt = restore.indexOf(".from('fitness_profiles')")
  check('it signs in before reading anything', signInAt > 0 && signInAt < firstReadAt, { signInAt, firstReadAt })
  check('...and claims the stored profile before reading it', claimAt > signInAt && claimAt < firstReadAt,
    { claimAt, firstReadAt })
  check('a sign-in failure stops the restore rather than showing an empty app',
    /if \(signIn\.error\) \{[\s\S]{0,200}setAuthError/.test(restore))

  // Without this guard, "New Plan" would restore the plan it just replaced.
  check('the database fallback only runs for an account with an email',
    /signIn\.email \? await findOwnedProfileId\(\)/.test(restore), restore.slice(0, 0))

  // The insert policy is `WITH CHECK (owner_id = auth.uid())`. A profile
  // created without it is refused outright — the user finishes onboarding and
  // has nothing saved.
  const insertAt = app.indexOf(".from('fitness_profiles')\n      .insert({")
  const insert = app.slice(insertAt, insertAt + 400)
  check('a new profile is stamped with its owner', /owner_id: signIn\.userId/.test(insert), insert.slice(0, 200))
  check('...from a sign-in performed first', app.lastIndexOf('ensureSignedIn(', insertAt) > 0)

  check('the app shows a reason when sign-in fails, rather than an empty screen',
    /We couldn't sign you in/.test(app))
  check('the email prompt is rendered, and closeable', /<EmailPrompt onClose=/.test(app))
}

console.log('\n7. The prompt is dismissible, in the way that word implies')
{
  const prompt = stripComments(readFileSync(join(ROOT, 'src/components/EmailPrompt.tsx'), 'utf8'))
  check('there is a "not now"', /Not now/.test(prompt))
  check('...which snoozes rather than doing nothing', /snoozeEmailPrompt\(\)/.test(prompt))
  check('...and closes the prompt', /snoozeEmailPrompt\(\)[\s\S]{0,60}onClose\(\)/.test(prompt))
  // A dismissal styled as an afterthought is not really a dismissal.
  check('both buttons carry the same weight', (prompt.match(/className="flex-1"/g) ?? []).length >= 2)
  check('it says what the email is for, not just "create an account"',
    /lose/.test(prompt) && /weigh-ins/.test(prompt))
  check('nothing is gated behind it — no plan, no screen is withheld',
    !/disabled=\{!email/.test(prompt.replace(/<Button className="flex-1" onClick=\{save\}[\s\S]*?\/Button>/, '')))
}

console.log('\n8. The migration is generated, and still matches the schema')
{
  const migration = readFileSync(
    join(ROOT, 'supabase/migrations/20260830120000_scope_every_table_to_its_owner.sql'), 'utf8')

  // The header used to name a generator that did not exist. A comment that
  // lies about where a file came from is worse than no comment: the next
  // person regenerates from nothing and edits by hand.
  const named = /scripts\/(generate-rls-migration\.[a-z]+)/.exec(migration)
  check('the migration names the generator that wrote it', named !== null, named?.[1])
  if (named) {
    const generatorPath = join(ROOT, 'scripts', named[1])
    let exists = true
    try { readFileSync(generatorPath, 'utf8') } catch { exists = false }
    check('...and that generator is actually on disk', exists, named[1])

    // Existing is not enough. "Regenerate rather than edit by hand" is only
    // true while the checked-in file still equals what the generator emits —
    // otherwise the next regeneration silently reverts somebody's hand edit.
    if (exists) {
      let inSync = true
      let why = ''
      try { execFileSync('node', [generatorPath, '--check'], { encoding: 'utf8' }) }
      catch (err) { inSync = false; why = String((err as { stdout?: string; stderr?: string }).stderr ?? '').trim() }
      check('...and the migration still equals what it emits', inSync, why)
    }
  }

  // Not a policy in sight that is unconditional, outside the shared cache.
  const openPolicies = [...migration.matchAll(/CREATE POLICY "([^"]+)" ON (\w+)[\s\S]{0,200}?USING \(true\)/g)]
    .map(m => `${m[2]}.${m[1]}`)
  check('no policy it creates is USING (true)', openPolicies.length === 0, openPolicies)

  check('the claim only ever touches unowned rows',
    /UPDATE fitness_profiles[\s\S]{0,200}AND owner_id IS NULL;/.test(migration))
  check('...and refuses a caller with no account at all',
    /IF auth\.uid\(\) IS NULL THEN[\s\S]{0,60}RETURN false/.test(migration))
  check('reading a profile requires a non-null owner that is you',
    /owner_id IS NOT NULL AND owner_id = auth\.uid\(\)/.test(migration))
  check('creating one requires stamping yourself as the owner',
    /FOR INSERT\s*\n\s*TO anon, authenticated WITH CHECK \(owner_id = auth\.uid\(\)\)/.test(migration))

  // chat_messages' policies are named anon_*_messages. Dropping the name a
  // table-driven loop would guess is a silent no-op, and permissive policies
  // OR together, so the old open policy would survive the migration.
  check('it drops chat_messages\' policies by their REAL names',
    /DROP POLICY IF EXISTS "anon_select_messages" ON chat_messages;/.test(migration))
}

console.log('\n9. A failed sign-in says what actually went wrong')
{
  // FOUND IN THE WILD, 30 Aug 2026. The screen said "this browser just
  // couldn't reach the server ... check your connection and try again" for a
  // failure that was neither: `Anonymous sign-ins are disabled`, returned
  // perfectly promptly over a working 5G connection. The app blamed the
  // phone's network for a server setting, and offered a Try again button
  // that could never work however many times it was pressed.
  const disabled = auth.describeSignInFailure('Anonymous sign-ins are disabled')
  // Tests the INSTRUCTION, not the word. The copy does mention the connection
  // — to rule it out — and an earlier version of this check failed on that,
  // which would have pushed the fix back toward saying less rather than more.
  check('a disabled server setting does not send them to check their connection',
    !/check your connection/i.test(disabled.message), disabled.message)
  check('...it rules the connection OUT rather than staying silent about it',
    /nothing is wrong with your phone or your connection/i.test(disabled.message), disabled.message)
  check('...and says it is a setting, not a fault on their end',
    /switched off on the server/.test(disabled.message), disabled.message)
  check('...and does NOT offer a retry that cannot work', disabled.retryable === false, disabled)

  const offline = auth.describeSignInFailure('TypeError: Failed to fetch')
  check('a real network failure DOES mention the connection', /connection/i.test(offline.message), offline.message)
  check('...and offers a retry, because retrying is the fix', offline.retryable === true, offline)

  const unknown = auth.describeSignInFailure('some unmapped server error')
  check('an unrecognised failure still offers a retry rather than a dead end', unknown.retryable === true, unknown)
  check('...without inventing a cause it does not know',
    !/connection/i.test(unknown.message) && !/switched off/.test(unknown.message), unknown.message)

  const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
  check('the screen uses the classified message, not one fixed sentence',
    /\{signInFailure\.message\}/.test(app))
  check('...and hides Try again when retrying cannot help',
    /signInFailure\.retryable && \(/.test(app))
}

console.log('\n10. An attached email can actually sign you back in')
{
  // The email prompt shipped first and on its own did NOTHING: it let
  // somebody attach an account, and there was nowhere to use it. Clear the
  // browser and the app signed you in anonymously as somebody new, with the
  // email stored and unreachable — promising a recovery it could not perform.
  const screen = stripComments(readFileSync(join(ROOT, 'src/components/SignInScreen.tsx'), 'utf8'))
  check('there is a sign-in screen', screen.length > 0)
  check('...that actually calls the sign-in path', /signInWithEmail\(email, password\)/.test(screen))
  check('...and says what signing in gets you back',
    /plan/.test(screen) && /logged/.test(screen))
  // Supabase returns the same error for a wrong password and an unknown
  // address. Passing that through verbatim is unhelpful.
  check('...and turns the server\'s error into something a person can act on',
    /don't match an account/.test(screen))

  const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
  check('it is reachable at the moment it is needed — before onboarding',
    /Already have an account\? Sign in/.test(app))
  check('...and is NOT a wall in front of onboarding',
    /onCancel=\{\(\) => setSignInOpen\(false\)\}/.test(app))
  check('...with a successful sign-in restoring the session rather than onboarding',
    /onSignedIn=\{\(\) => \{ setSignInOpen\(false\); setIsRestoring\(true\); void restoreSession\(\) \}\}/.test(app))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll auth and RLS client checks passed.')
