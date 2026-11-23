// ---------------------------------------------------------------------------
// WHO THIS IS — audit §1.1 / §1.2.
//
// Until now the app had no account at all. Identity was one localStorage
// value, `fitplan_profile_id`. Clear the browser and every weigh-in, logged
// set and conversation was gone, with no recovery and no second device —
// and on iPhone, Safari clears it on its own after about a week of not
// opening the app. Meanwhile every table was readable by anyone holding the
// anon key, which ships inside the app's JavaScript because it has to.
//
// ANONYMOUS SIGN-IN IS THE BRIDGE. It creates a real auth.users row with no
// screen, no email and no interruption, which gives the database something
// to scope rows to. The property that makes it safe is that
// `updateUser({ email, password })` converts THAT SAME ROW into a permanent
// account — the uid never changes — so adding an email later cannot orphan
// anything. That is what lets Ashley's ruling ("ask for an email next time
// they open it", 30 Aug 2026) be implemented without a login wall.
//
// FAILING TO SIGN IN IS NOT SILENT. Before RLS the app read rows without an
// identity and worked; after it, an unsigned client reads nothing and every
// screen is empty for no visible reason. So the failure is returned, not
// swallowed, and App.tsx says so on screen.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

/** Set once the person has said "not now" to adding an email. Per-browser, deliberately — it is a nudge, not a decision to remember forever. */
const EMAIL_PROMPT_DISMISSED_KEY = 'fitplan_email_prompt_dismissed_until'

/** How long "not now" lasts. Long enough not to nag, short enough that an account still gets attached before a browser clear-out. */
const SNOOZE_DAYS = 7

export interface SignInResult {
  userId: string | null
  /** Null on success. A human-readable reason otherwise — shown, not logged and forgotten. */
  error: string | null
  /** True when this call created the anonymous account rather than resuming one. */
  isNew: boolean
  /** The account's email, or null while it is still anonymous. Decides whether this session is one somebody deliberately signed into. */
  email: string | null
}

/**
 * Resume the session if there is one, otherwise create an anonymous account.
 *
 * Idempotent and safe to call on every load: `getSession()` first means a
 * returning user is not handed a second identity, which would leave their
 * profile owned by an account they are no longer signed into — unrecoverable,
 * because the claim only works on unowned rows.
 */
export async function ensureSignedIn(): Promise<SignInResult> {
  try {
    const { data: existing } = await supabase.auth.getSession()
    if (existing?.session?.user?.id) {
      return {
        userId: existing.session.user.id,
        error: null,
        isNew: false,
        email: existing.session.user.email ?? null,
      }
    }

    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) return { userId: null, error: error.message, isNew: false, email: null }
    return {
      userId: data.user?.id ?? null,
      error: data.user ? null : 'No account came back.',
      isNew: true,
      email: data.user?.email ?? null,
    }
  } catch (err) {
    return { userId: null, error: err instanceof Error ? err.message : String(err), isNew: false, email: null }
  }
}

export interface SignInFailure {
  /** What to tell the person, in terms of what they can do about it. */
  message: string
  /** False when retrying cannot possibly help — a server setting, not a bad moment. */
  retryable: boolean
}

/**
 * Turn a sign-in error into something true.
 *
 * WHY THIS EXISTS. The screen used to say "this browser just couldn't reach
 * the server ... check your connection and try again" for EVERY failure. The
 * first real one in the wild was `Anonymous sign-ins are disabled` — a server
 * setting, reached perfectly well over a working 5G connection. So the app
 * blamed the phone's network, and offered a Try again button that could never
 * work no matter how many times it was pressed.
 *
 * That is the same defect this codebase keeps finding in other clothes: a
 * confident sentence that is not about what actually happened. A connection
 * problem and a configuration problem need different words because they need
 * different actions from different people.
 */
export function describeSignInFailure(error: string): SignInFailure {
  if (/anonymous sign-?ins? are disabled/i.test(error)) {
    return {
      retryable: false,
      message:
        'The app is set up to sign you in automatically, and that is switched off on the server. ' +
        'Nothing is wrong with your phone or your connection, and trying again will not help until ' +
        'it is turned on — Anonymous Sign-Ins, in the Supabase dashboard under Authentication.',
    }
  }
  if (/signups? (are )?(not allowed|disabled)/i.test(error)) {
    return {
      retryable: false,
      message:
        'New accounts are switched off on the server, so the app cannot create the one it needs. ' +
        'That is a setting, not a fault on your end.',
    }
  }
  if (/failed to fetch|network|timeout|offline|econn/i.test(error)) {
    return {
      retryable: true,
      message:
        'Your plan is safe — this browser could not reach the server to prove it is you, so nothing ' +
        'can be loaded yet. Check your connection and try again.',
    }
  }
  return {
    retryable: true,
    message:
      'Your plan is safe — the app could not confirm who you are, so nothing has been loaded yet. ' +
      'The exact reason is below.',
  }
}

/**
 * Attach the profile already in localStorage to the account that just signed in.
 *
 * Server side this is `claim_profile`, a SECURITY DEFINER function that only
 * touches rows whose owner_id is still NULL. It has to be a function rather
 * than a policy: a policy permissive enough to let a client FIND its own
 * unowned row would leave every unclaimed profile readable by anyone, which
 * is the hole the whole change exists to close.
 *
 * Returns true only when this call actually took ownership. False covers both
 * "already yours" (returning user — nothing to do) and "someone else's", and
 * the caller cannot tell those apart, on purpose: reporting which is which
 * would answer "does this UUID exist and is it taken" for anyone who asks.
 */
export async function claimProfile(profileId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('claim_profile', { p_profile_id: profileId })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

/**
 * HAS THIS PHONE ALREADY READ THIS PROFILE BACK? (31 Oct 2026, app start.) A row can only be read once it is owned
 * (row-level security), so after one successful read the claim above can only ever answer "nothing to do", and it was
 * a round trip on every open, ahead of every other read. Storage that fails answers "no", which just claims again.
 */
export function hasClaimedOnThisPhone(profileId: string): boolean {
  try { return localStorage.getItem(`fitplan_claimed:${profileId}`) === '1' } catch { return false }
}
export function markClaimedOnThisPhone(profileId: string): void {
  try { localStorage.setItem(`fitplan_claimed:${profileId}`, '1') } catch { /* claims again next time, as before */ }
}

/** True when the signed-in account is still anonymous — no email, so nothing to recover it with. */
export async function needsEmail(): Promise<boolean> {
  // NOT WHILE A LINK IS WAITING (23 Nov 2026, his report "several times it's asked me to change my password"). An
  // address waiting on its link is `new_email` with `email` still empty, so this used to say yes, the prompt came
  // back every week, and every "Save it" set the password again. Waiting is its own state: Profile, Account offers
  // Resend there, and nothing asks for the password twice.
  return (await readAccountStatus()).kind === 'not-saved'
}

/**
 * What Profile's Account row says (his request 20 Nov 2026, "Build the account row": the email prompt could be
 * snoozed for a week and there was nowhere else to save an email).
 *
 * THREE STATES, NOT TWO. Supabase may hold a new address as `new_email` until the link in its email is tapped:
 * the address is not the account's yet, so "saved" would promise a recovery that cannot happen. A user the app
 * could not read is `unknown`, never "not saved" (a failed read is not an answer, the boot-cache rule).
 */
export type AccountStatus =
  | { kind: 'saved'; email: string }
  | { kind: 'confirming'; email: string }
  | { kind: 'not-saved' }
  | { kind: 'unknown' }

function accountStatusOf(user: { email?: string | null; new_email?: string | null } | null | undefined): AccountStatus {
  if (!user) return { kind: 'unknown' }
  if (user.email) return { kind: 'saved', email: user.email }
  if (user.new_email) return { kind: 'confirming', email: user.new_email }
  return { kind: 'not-saved' }
}

export async function readAccountStatus(): Promise<AccountStatus> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) return { kind: 'unknown' }
    return accountStatusOf(data?.user as { email?: string | null; new_email?: string | null } | null)
  } catch {
    return { kind: 'unknown' }
  }
}

/** The row's one-line value. */
export function accountRowValue(status: AccountStatus | null): string {
  if (!status) return '…'
  switch (status.kind) {
    case 'saved': return status.email
    case 'confirming': return 'Check your email'
    case 'not-saved': return 'Not saved yet'
    case 'unknown': return 'Couldn’t check'
  }
}

/** True when the prompt should be shown now: no email, and not snoozed. */
export async function shouldAskForEmail(): Promise<boolean> {
  if (isEmailPromptSnoozed()) return false
  return needsEmail()
}

export function isEmailPromptSnoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(EMAIL_PROMPT_DISMISSED_KEY) ?? '0')
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

/** "Not now." Comes back in a week — Ashley's ruling was ask again later, not never. */
export function snoozeEmailPrompt(): void {
  try {
    localStorage.setItem(EMAIL_PROMPT_DISMISSED_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000))
  } catch { /* a browser refusing storage just means it gets asked again sooner */ }
}

export interface AttachResult {
  ok: boolean
  error?: string
}

/**
 * Turn the anonymous account into a real one.
 *
 * updateUser keeps the same uid, so every row already claimed stays claimed —
 * nothing is moved, re-keyed or re-owned. That is the entire reason the
 * anonymous account exists in the first place.
 */
export async function attachEmail(email: string, password: string): Promise<AttachResult> {
  const trimmed = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "That doesn't look like an email address." }
  }
  // Supabase's own floor is 6. Saying the rule up front beats bouncing them
  // off a server error that names a constraint they never saw.
  if (password.length < 8) {
    return { ok: false, error: 'Use at least 8 characters, so this is worth having.' }
  }

  try {
    const { error } = await supabase.auth.updateUser({ email: trimmed, password }, { emailRedirectTo: appAddress() })
    if (error) return { ok: false, error: describeAuthError(error.message) }
    clearEmailPromptSnooze()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: describeAuthError(err instanceof Error ? err.message : String(err)) }
  }
}

function clearEmailPromptSnooze(): void {
  try { localStorage.removeItem(EMAIL_PROMPT_DISMISSED_KEY) } catch { /* nothing to clear */ }
}

/** Sign back in on another device, or after a browser clear-out — the whole point of attaching an email. */
export async function signInWithEmail(email: string, password: string): Promise<AttachResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { ok: false, error: describeAuthError(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * The id of the profile this account owns, asked of the database rather than
 * of localStorage — for someone signing in on a second device, where there is
 * no stored id and the profile is still theirs.
 *
 * NEWEST FIRST, and that ordering is load-bearing. "New Plan" abandons the
 * current profile without deleting it, so one account can own several. An
 * arbitrary `limit(1)` would hand a returning user whichever row the planner
 * happened to reach first — quite possibly a plan they walked away from
 * months ago, presented as their current one.
 *
 * Callers must NOT use this to decide what to restore on the device that made
 * the reset: see the guard in App.tsx's restoreSession for why.
 */
export async function findOwnedProfileId(): Promise<string | null> {
  try {
    // RLS already restricts this to rows this account owns, so the ordering is
    // the only thing this query has to get right.
    const { data, error } = await supabase
      .from('fitness_profiles')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    return data?.id ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// THE REST OF AN ACCOUNT (23 Nov 2026, his report: "I didn't receive a proper email to confirm my email address,
// and there's no way to sign out and sign back in with the email. Several times, it's asked me to change my
// password." Live testers in days; docs/plans/account-signin.md).
// ---------------------------------------------------------------------------

/** The live app's address: where every emailed link brings him back to. */
export const LIVE_APP_ADDRESS = 'https://personal-tr-a-iner-claude-yco8.vercel.app/'

/**
 * Where an emailed link should land. The page's own address when it is a web page (so a preview or the live app
 * each come back to themselves), the live app from the phone app, whose address is not a web address an email
 * can open. A link to an address the project does not allow falls back to the project's Site URL.
 */
export function appAddress(origin: string | null = typeof location !== 'undefined' ? location.origin : null): string {
  return origin && /^https?:\/\//.test(origin) ? `${origin}/` : LIVE_APP_ADDRESS
}

/**
 * Supabase's error sentences, in words a person can act on. Unknown ones pass through unchanged: a message we
 * have not seen is still more use than a guess.
 */
export function describeAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match an account. Check them and try again."
  if (/email not confirmed/i.test(message)) return "That email hasn't been confirmed yet. Tap the link in the email we sent, then sign in."
  if (/already (been )?registered|already (in use|exists)|email_exists/i.test(message)) {
    return 'That email already has an account. Sign in with it instead, or use a different email.'
  }
  if (/rate limit|too many|for security purposes|only request this after/i.test(message)) {
    return 'Too many emails were sent just now. Wait a few minutes, then try again.'
  }
  if (/password/i.test(message) && /(at least|characters|weak|short|should contain)/i.test(message)) {
    return 'Choose a longer password: at least 8 characters.'
  }
  if (/same.*password|different from the old/i.test(message)) return 'That is the password you already have. Choose a new one.'
  if (/expired|invalid.*(link|token|otp)|otp_expired|session missing|missing.*session/i.test(message)) {
    return 'That link has expired or was already used. Ask for a new one.'
  }
  if (/unable to validate email|invalid.*email|email.*invalid/i.test(message)) return "That doesn't look like an email address."
  if (/failed to fetch|network|timeout|offline|econn/i.test(message)) return "Couldn't reach the server. Check your connection and try again."
  return message
}

/** Send the confirmation link again, to the address waiting on it. The password is never asked for twice. */
export async function resendConfirmation(email: string): Promise<AttachResult> {
  try {
    const { error } = await supabase.auth.resend({ type: 'email_change', email: email.trim(), options: { emailRedirectTo: appAddress() } })
    if (error) return { ok: false, error: describeAuthError(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: describeAuthError(err instanceof Error ? err.message : String(err)) }
  }
}

/** A different address while one is waiting: the address only, so the password set the first time stands. */
export async function changePendingEmail(email: string): Promise<AttachResult> {
  const trimmed = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, error: "That doesn't look like an email address." }
  try {
    const { error } = await supabase.auth.updateUser({ email: trimmed }, { emailRedirectTo: appAddress() })
    if (error) return { ok: false, error: describeAuthError(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: describeAuthError(err instanceof Error ? err.message : String(err)) }
  }
}

/** "Forgot your password?" Always answered the same way, so it cannot be used to ask whether an address has an account. */
export async function sendPasswordReset(email: string): Promise<AttachResult> {
  const trimmed = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, error: 'Type your email above first.' }
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: appAddress() })
    if (error) return { ok: false, error: describeAuthError(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: describeAuthError(err instanceof Error ? err.message : String(err)) }
  }
}

/** The new password, from the reset link's page. */
export async function setNewPassword(password: string): Promise<AttachResult> {
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters, so this is worth having.' }
  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, error: describeAuthError(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: describeAuthError(err instanceof Error ? err.message : String(err)) }
  }
}

/**
 * Forget everything this phone holds about the last person, keeping the sign-in itself (Supabase's own `sb-` keys)
 * and the look of the app. Used after a sign-out and after signing into a different account, followed by a fresh
 * load, so not one screen can keep the old person's plan in memory ("Start a new plan carries nothing of the last
 * person", 14 Nov 2026).
 */
export function clearThisPhone(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  if (!storage) return
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k) keys.push(k) }
    for (const k of keys) if (!k.startsWith('sb-') && !/appearance/i.test(k)) storage.removeItem(k)
  } catch { /* a phone refusing storage has nothing kept to clear */ }
}

/** Load the app afresh at its own address, with nothing of a link left in it. */
export function reloadApp(): void {
  try { window.location.replace(`${window.location.origin}${window.location.pathname}${window.location.search}`) } catch { /* nothing to do */ }
}

/** What would be lost by signing out now: sets or a plan change made with no signal that have not reached the server. */
export interface UnsentWork { sets: number; planChange: boolean }

/** Why a sign-out is refused, or null when it may go ahead. Never with unsent work on the phone: it lives only here. */
export function signOutBlockedBy(unsent: UnsentWork): string | null {
  if (unsent.sets === 0 && !unsent.planChange) return null
  const what = unsent.sets > 0
    ? `${unsent.sets} set${unsent.sets === 1 ? '' : 's'}${unsent.planChange ? ' and a plan change' : ''}`
    : 'A plan change'
  const one = unsent.sets + (unsent.planChange ? 1 : 0) === 1
  return `${what} ${one ? "hasn't" : "haven't"} reached the server yet, and signing out would lose ${one ? 'it' : 'them'}. ` +
    `Open the app with signal so ${one ? 'it sends' : 'they send'}, then sign out.`
}

/** Sign out of this phone. The account and everything on it stay on the server. */
export async function signOutOfThisPhone(unsent: UnsentWork): Promise<AttachResult> {
  const blocked = signOutBlockedBy(unsent)
  if (blocked) return { ok: false, error: blocked }
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) return { ok: false, error: describeAuthError(error.message) }
    clearThisPhone()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: describeAuthError(err instanceof Error ? err.message : String(err)) }
  }
}

/**
 * WHAT AN EMAILED LINK BROUGHT HIM BACK WITH, read off the address the page opened at, before anything changes it.
 * Supabase puts the outcome in the address: `type=recovery` from a reset link, `type=email_change` (or `signup`)
 * from a confirmation, `error_description` when the link was spent or expired. Reading is all this does: Supabase
 * itself takes the sign-in out of the same address.
 */
export type AuthLink =
  | { kind: 'recovery' }
  | { kind: 'email-confirmed' }
  | { kind: 'link-failed'; message: string }

export function readAuthLink(href: string | null): AuthLink | null {
  if (!href) return null
  let url: URL
  try { url = new URL(href) } catch { return null }
  const params = new URLSearchParams(url.search)
  new URLSearchParams(url.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v))
  const err = params.get('error_description') ?? params.get('error_code') ?? params.get('error')
  if (err) return { kind: 'link-failed', message: describeAuthError(err) }
  // Only with the sign-in the link carries: a bare "type=" in an address is somebody's typing, not a link.
  const type = params.get('type')
  const signedIn = params.has('access_token') || params.has('code') || params.has('token_hash')
  if (!signedIn) return null
  if (type === 'recovery') return { kind: 'recovery' }
  if (type === 'email_change' || type === 'signup' || type === 'email') return { kind: 'email-confirmed' }
  return null
}

/** The link this page opened with, read once at load. */
export const AUTH_LINK_AT_LOAD: AuthLink | null = readAuthLink(typeof location !== 'undefined' ? location.href : null)
