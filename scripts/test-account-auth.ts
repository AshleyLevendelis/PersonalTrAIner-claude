// test:account-auth — THE REST OF AN ACCOUNT (23 Nov 2026, docs/plans/account-signin.md).
//
// His report: "I didn't receive a proper email to confirm my email address, and there's no way to sign out and sign
// back in with the email. Several times, it's asked me to change my password." The screens are driven by
// verify:account-row; this holds the logic under them, and App's half (a reset link opens "Set a new password"
// INSTEAD of the start), which no harness page reaches because none boots App with a link in the address.
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// A phone's storage, for the functions that read it.
class MemStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
;(globalThis as { localStorage?: unknown }).localStorage = new MemStorage()

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const auth = await import('../src/lib/auth')

  console.log('\n1. Waiting on the link is not "no email" (the prompt that kept asking for the password)')
  let user: Record<string, unknown> | null = { id: 'u1', email: null, new_email: 'sam@example.com' }
  setSupabaseClient({ auth: { getUser: async () => ({ data: { user }, error: null }) } } as never)
  check('1a. an address waiting on its link does not raise the email prompt', (await auth.needsEmail()) === false)
  check('1b. ...nor does shouldAskForEmail', (await auth.shouldAskForEmail()) === false)
  user = { id: 'u1', email: null }
  check('1c. no email at all does', (await auth.needsEmail()) === true)
  user = { id: 'u1', email: 'sam@example.com' }
  check('1d. a saved one does not', (await auth.needsEmail()) === false)
  setSupabaseClient({ auth: { getUser: async () => ({ data: { user: null }, error: { message: 'down' } }) } } as never)
  check('1e. an account the app cannot read is not asked about', (await auth.needsEmail()) === false)

  console.log('\n2. Every emailed link comes back to the app, and a different address never resets the password')
  const calls: { name: string; args: unknown[] }[] = []
  const rec = (name: string) => async (...args: unknown[]) => { calls.push({ name, args }); return { data: {}, error: null } }
  setSupabaseClient({ auth: { updateUser: rec('updateUser'), resend: rec('resend'), resetPasswordForEmail: rec('resetPasswordForEmail'), signOut: rec('signOut') } } as never)
  ;(globalThis as { location?: unknown }).location = { origin: 'https://app.example' }
  await auth.attachEmail('sam@example.com', 'longenough')
  check('2a. the first save names the app as where the link lands', JSON.stringify(calls.at(-1)?.args[1]) === JSON.stringify({ emailRedirectTo: 'https://app.example/' }), calls.at(-1))
  await auth.changePendingEmail('sam2@example.com')
  check('2b. a different address writes the address alone, with the same landing', JSON.stringify(calls.at(-1)?.args) === JSON.stringify([{ email: 'sam2@example.com' }, { emailRedirectTo: 'https://app.example/' }]), calls.at(-1))
  await auth.resendConfirmation('sam@example.com')
  check('2c. Resend sends the change-of-email link again, to that address', JSON.stringify(calls.at(-1)?.args[0]) === JSON.stringify({ type: 'email_change', email: 'sam@example.com', options: { emailRedirectTo: 'https://app.example/' } }), calls.at(-1))
  await auth.sendPasswordReset('sam@example.com')
  check('2d. a reset link lands on the app', JSON.stringify(calls.at(-1)?.args) === JSON.stringify(['sam@example.com', { redirectTo: 'https://app.example/' }]), calls.at(-1))
  const before = calls.length
  check('2e. a reset with no address typed asks for one and sends nothing', (await auth.sendPasswordReset('')).error === 'Type your email above first.' && calls.length === before)
  check('2f. the phone app, whose address an email cannot open, lands on the live app', auth.appAddress('capacitor://localhost') === auth.LIVE_APP_ADDRESS && auth.appAddress('https://x.vercel.app') === 'https://x.vercel.app/')

  console.log('\n3. Signing out never loses unsent work, and forgets the last person but not the sign-in')
  check('3a. one set waiting refuses, in words', auth.signOutBlockedBy({ sets: 1, planChange: false }) === "1 set hasn't reached the server yet, and signing out would lose it. Open the app with signal so it sends, then sign out.")
  check('3b. a plan change waiting refuses', /A plan change hasn't reached the server/.test(auth.signOutBlockedBy({ sets: 0, planChange: true }) ?? ''))
  check('3c. two sets say "them"', /2 sets haven't .* lose them/.test(auth.signOutBlockedBy({ sets: 2, planChange: false }) ?? ''))
  check('3d. nothing waiting lets it go ahead', auth.signOutBlockedBy({ sets: 0, planChange: false }) === null)
  const n0 = calls.length
  const refused = await auth.signOutOfThisPhone({ sets: 3, planChange: false })
  check('3e. a refused sign-out never reaches the server', !refused.ok && calls.length === n0)
  const ls = new MemStorage()
  ls.setItem('fitplan_profile_id', 'p1'); ls.setItem('sb-abc-auth-token', 't'); ls.setItem('fitplan_appearance', 'dark'); ls.setItem('fitplan_boot_v1', '{}')
  auth.clearThisPhone(ls as unknown as Storage)
  check('3f. the plan and its kept copy go; the sign-in and the look stay', ls.getItem('fitplan_profile_id') === null && ls.getItem('fitplan_boot_v1') === null && ls.getItem('sb-abc-auth-token') === 't' && ls.getItem('fitplan_appearance') === 'dark')
  const ok = await auth.signOutOfThisPhone({ sets: 0, planChange: false })
  check('3g. with nothing waiting, it signs this phone out only', ok.ok && JSON.stringify(calls.at(-1)) === JSON.stringify({ name: 'signOut', args: [{ scope: 'local' }] }), calls.at(-1))

  console.log('\n4. What a link brought him back with')
  const L = auth.readAuthLink
  check('4a. a reset link', L('https://app.example/#access_token=a&refresh_token=b&type=recovery')?.kind === 'recovery')
  check('4b. a confirmation link', L('https://app.example/#access_token=a&type=email_change')?.kind === 'email-confirmed')
  check('4c. ...and the newer sign-up kind', L('https://app.example/?code=x&type=signup')?.kind === 'email-confirmed')
  const failed = L('https://app.example/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  check('4d. a spent link says so in plain words', failed?.kind === 'link-failed' && failed.message === 'That link has expired or was already used. Ask for a new one.', failed)
  check('4e. an ordinary address is no link', L('https://app.example/#/tab/exercise') === null && L('https://app.example/?type=recovery') === null)

  console.log('\n5. Supabase’s sentences in plain words')
  const D = auth.describeAuthError
  check('5a. a taken address', /already has an account/.test(D('A user with this email address has already been registered')))
  check('5b. too many emails', /Wait a few minutes/.test(D('email rate limit exceeded')) && /Wait a few minutes/.test(D('For security purposes, you can only request this after 42 seconds.')))
  check('5c. an unconfirmed address at sign-in', /hasn't been confirmed yet/.test(D('Email not confirmed')))
  check('5d. a wrong password', D('Invalid login credentials') === "That email and password don't match an account. Check them and try again.")
  check('5e. a weak password', /at least 8 characters/.test(D('Password should be at least 6 characters.')))
  check('5f. no connection', /Couldn't reach the server/.test(D('Failed to fetch')))
  check('5g. an unknown sentence passes through unchanged', D('Something new') === 'Something new')

  console.log('\n6. App: a reset link opens "Set a new password" instead of the start')
  const app = readFileSync('src/App.tsx', 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  check('6a. the recovery state is read off the link the page opened with', /useState\(AUTH_LINK_AT_LOAD\?\.kind === 'recovery'\)/.test(app))
  const effect = app.match(/useEffect\(\(\) => \{\s*if \(recoveryOpen\) return\s*restoreSession\(\)/)
  check('6b. the start does not run while it is open', !!effect)
  const gate = app.indexOf('if (recoveryOpen) {'), restoring = app.indexOf('if (isRestoring) {')
  check('6c. the screen is drawn before the loading screen', gate > 0 && restoring > 0 && gate < restoring && /<SetNewPasswordScreen /.test(app.slice(gate, restoring)))
  check('6d. a confirmed or spent link is said once on the app', /AUTH_LINK_AT_LOAD\?\.kind === 'email-confirmed'/.test(app) && /AUTH_LINK_AT_LOAD\?\.kind === 'link-failed'/.test(app) && /data-testid="account-notice"/.test(app))
  const profile = readFileSync('src/components/ProfileScreen.tsx', 'utf-8')
  check('6e. Profile reads the account again every time it opens', /if \(!open\) return\s*let live = true\s*void readAccountStatus\(\)[\s\S]{0,120}\}, \[open\]\)/.test(profile))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('test:account-auth passed.')
}

main().catch(err => { console.error(err); console.log(`\n${ran} checks ran.`); process.exit(1) })
