import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendPasswordReset, signInWithEmail } from '@/lib/auth'

// ---------------------------------------------------------------------------
// SIGNING BACK IN — the half of the account that was missing.
//
// Audit §1.2. The email prompt shipped first: it lets somebody attach an
// email and password to the anonymous account they already have, so their
// plan and history stop living only in one browser. That is the right half to
// build first, and on its own it does nothing.
//
// Because there was nowhere to USE it. Clear your browser, or pick up a new
// phone, and the app signs you in anonymously as somebody new — a fresh
// account, an empty plan, no route back to the one you attached an email to.
// The email was stored and unusable, which is arguably worse than not asking
// for it: it promises a recovery the app could not perform.
//
// So this is deliberately reachable at exactly the moment it is needed: the
// app has no profile for this browser and is about to start onboarding. That
// is the only moment somebody could be looking at a fresh app and thinking
// "but I already have an account."
//
// NOT A WALL. Ashley's ruling stands — nobody is forced to sign in. This is
// offered beside onboarding, not in front of it, and dismissing it starts a
// new plan exactly as before.
// ---------------------------------------------------------------------------

export function SignInScreen({ onSignedIn, onCancel, cancelLabel = "I'm new — start a plan" }: { onSignedIn: () => void; onCancel: () => void; cancelLabel?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // FORGOT PASSWORD (23 Nov 2026). The same answer whether or not the address has an account, so this screen cannot
  // be used to ask which addresses do.
  const forgot = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    const result = await sendPasswordReset(email)
    setBusy(false)
    if (!result.ok) { setError(result.error ?? "That didn't work."); return }
    setNote(`If ${email.trim()} has an account, we've sent it a link to set a new password. Check your spam folder too.`)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await signInWithEmail(email, password)
    setBusy(false)
    if (!result.ok) {
      // The words come from describeAuthError: Supabase says "Invalid login credentials" for a wrong password and an
      // address never registered alike, and it is right not to tell them apart.
      setError(result.error ?? "That didn't work.")
      return
    }
    onSignedIn()
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">Sign back in</h1>
          <p className="text-sm text-muted-foreground">
            If you added an email to this app before, sign in and your plan, your weigh-ins and
            everything you've logged come back.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="signin-email">Email</Label>
            <Input
              id="signin-email" type="email" autoComplete="email" inputMode="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signin-password">Password</Label>
            <Input
              id="signin-password" type="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
        {note && <p className="text-sm text-muted-foreground break-words" data-signin-note>{note}</p>}

        <Button className="w-full" onClick={submit} disabled={busy || !email || !password}>
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
        {/* Equal prominence, same reasoning as the email prompt: a way out
            that looks like a mistake is not really a way out. */}
        <Button variant="outline" className="w-full" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <button type="button" className="w-full min-h-[44px] text-sm text-primary underline-offset-2 hover:underline disabled:opacity-50"
          onClick={forgot} disabled={busy} data-signin-forgot>
          Forgot your password?
        </button>
      </div>
    </div>
  )
}
