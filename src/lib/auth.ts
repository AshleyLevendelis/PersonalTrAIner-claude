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

/** True when the signed-in account is still anonymous — no email, so nothing to recover it with. */
export async function needsEmail(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser()
    return !!data?.user && !data.user.email
  } catch {
    return false
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
    const { error } = await supabase.auth.updateUser({ email: trimmed, password })
    if (error) return { ok: false, error: error.message }
    clearEmailPromptSnooze()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function clearEmailPromptSnooze(): void {
  try { localStorage.removeItem(EMAIL_PROMPT_DISMISSED_KEY) } catch { /* nothing to clear */ }
}

/** Sign back in on another device, or after a browser clear-out — the whole point of attaching an email. */
export async function signInWithEmail(email: string, password: string): Promise<AttachResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { ok: false, error: error.message }
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
