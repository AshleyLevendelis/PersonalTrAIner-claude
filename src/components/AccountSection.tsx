import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  changePendingEmail, readAccountStatus, reloadApp, clearThisPhone, resendConfirmation, signOutOfThisPhone, type AccountStatus,
} from '@/lib/auth'
import { getSyncState } from '@/lib/set-log-store'
import { hasKeptPlanWeeks } from '@/lib/mesocycle-persistence'
import { AttachEmailForm, savedAccountLine } from '@/components/EmailPrompt'
import { SignInScreen } from '@/components/SignInScreen'

// ---------------------------------------------------------------------------
// Profile, Account (his request 20 Nov 2026, "Build the account row").
//
// The email prompt could be snoozed for a week and there was nowhere else to
// save an email, so somebody worried about losing their progress had no way
// to act on it. This is the same form, always reachable, and it says plainly
// which of three states the account is in: saved, waiting for the link in the
// email to be tapped, or not saved. Only "saved" promises a way back in.
// ---------------------------------------------------------------------------

export function AccountSection({ status, onChanged, onClose }: {
  status: AccountStatus | null
  onChanged: (status: AccountStatus) => void
  onClose: () => void
}) {
  const [justSaved, setJustSaved] = useState<{ status: AccountStatus; email: string } | null>(null)

  if (justSaved) {
    return <p className="text-sm text-muted-foreground" data-account-state="just-saved">{savedAccountLine(justSaved.status, justSaved.email)}</p>
  }
  if (status == null) return <p className="text-sm text-muted-foreground">Checking…</p>
  if (status.kind === 'saved') return <SavedAccount email={status.email} />
  if (status.kind === 'confirming') return <WaitingOnLink email={status.email} onChanged={onChanged} />
  if (status.kind === 'unknown') {
    return (
      <p className="text-sm text-muted-foreground" data-account-state="unknown">
        The app couldn't check your account just now. Try again when you have signal.
      </p>
    )
  }
  return (
    <div className="space-y-4" data-account-state="not-saved">
      <p className="text-sm text-muted-foreground">
        Your plan, your weigh-ins and every set you've logged live only on this phone until you add an email. If the
        browser clears its storage, or you get a new phone, there's no way to get them back. Nothing changes about your
        plan.
      </p>
      <AttachEmailForm
        secondary={{ label: 'Cancel', onClick: onClose }}
        onSaved={(next, email) => { setJustSaved({ status: next, email }); onChanged(next) }}
      />
      <SignInElsewhere />
    </div>
  )
}

// SIGNED IN: SIGN OUT (23 Nov 2026). Asked first, and never with work still on the phone that has not reached the
// server, because that work lives only here. After it, this phone forgets the plan and opens as new.
function SavedAccount({ email }: { email: string }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signOut = async () => {
    setBusy(true); setError(null)
    const result = await signOutOfThisPhone({ sets: getSyncState().queuedCount, planChange: hasKeptPlanWeeks() })
    if (!result.ok) { setBusy(false); setError(result.error ?? "That didn't work."); return }
    reloadApp()
  }
  return (
    <div className="space-y-3 text-sm" data-account-state="saved">
      <p>Signed in as <span className="font-semibold break-all">{email}</span>.</p>
      <p className="text-muted-foreground">
        Your plan and history are tied to this email. To get back in on a new phone, or if this browser ever clears
        itself, open the app and tap "Already have an account? Sign in".
      </p>
      {!asking ? (
        <Button variant="outline" className="w-full min-h-[44px]" onClick={() => { setError(null); setAsking(true) }} data-account-signout>
          Sign out of this phone
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border p-3" data-account-signout-ask>
          <p>Sign out? Your plan and everything you've logged stay on your account. Sign back in with {email} and it all comes back.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setAsking(false)} disabled={busy}>Stay signed in</Button>
            <Button className="flex-1 min-h-[44px]" onClick={signOut} disabled={busy} data-account-signout-yes>
              {busy ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-destructive break-words">{error}</p>}
    </div>
  )
}

// WAITING ON THE LINK (23 Nov 2026). The password was set with the address; nothing here asks for it again. Resend
// sends the same link; a different address changes the address alone.
function WaitingOnLink({ email, onChanged }: { email: string; onChanged: (status: AccountStatus) => void }) {
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const [next, setNext] = useState('')
  const resend = async () => {
    setBusy(true); setError(null); setNote(null)
    const r = await resendConfirmation(email)
    setBusy(false)
    if (!r.ok) { setError(r.error ?? "That didn't work."); return }
    setNote(`Sent again to ${email}. It can take a few minutes, and check your spam folder too.`)
  }
  const change = async () => {
    setBusy(true); setError(null); setNote(null)
    const r = await changePendingEmail(next)
    if (!r.ok) { setBusy(false); setError(r.error ?? "That didn't work."); return }
    const status = await readAccountStatus()
    setBusy(false); setChanging(false); setNext('')
    onChanged(status)
    setNote(`We've sent a link to ${next.trim()}.`)
  }
  return (
    <div className="space-y-3 text-sm" data-account-state="confirming">
      <p className="text-muted-foreground">
        We've sent a link to <span className="font-semibold text-foreground break-all">{email}</span>. Tap it to
        finish: until you do, the email isn't saved and your progress still lives only on this phone. Can't see it?
        Check your spam folder.
      </p>
      {!changing ? (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => { setError(null); setNote(null); setChanging(true) }} disabled={busy} data-account-change>
            Use a different email
          </Button>
          <Button className="flex-1 min-h-[44px]" onClick={resend} disabled={busy} data-account-resend>
            {busy ? 'Sending...' : 'Resend link'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="account-new-email">New email</Label>
          <Input id="account-new-email" type="email" autoComplete="email" inputMode="email" value={next}
            onChange={e => setNext(e.target.value)} placeholder="you@example.com" />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setChanging(false)} disabled={busy}>Cancel</Button>
            <Button className="flex-1 min-h-[44px]" onClick={change} disabled={busy || !next} data-account-change-save>
              {busy ? 'Sending...' : 'Send the link'}
            </Button>
          </div>
        </div>
      )}
      {note && <p className="text-muted-foreground" data-account-note>{note}</p>}
      {error && <p role="alert" className="text-destructive break-words">{error}</p>}
    </div>
  )
}

// ALREADY HAVE AN ACCOUNT, ON A PHONE THAT STARTED A NEW ONE (23 Nov 2026). The sign-in used to be reachable only
// from a phone with no plan. Here the plan on this phone has no email, so it is said plainly that it stays behind;
// nothing changes until the sign-in works, and then the phone opens as that account.
function SignInElsewhere() {
  const [asking, setAsking] = useState(false)
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-background" data-account-signin-screen>
        <SignInScreen
          cancelLabel="Cancel"
          onCancel={() => setOpen(false)}
          onSignedIn={() => { clearThisPhone(); reloadApp() }}
        />
      </div>
    )
  }
  return (
    <div className="space-y-2 text-sm">
      {!asking ? (
        <button type="button" className="w-full min-h-[44px] text-primary underline-offset-2 hover:underline" onClick={() => setAsking(true)} data-account-signin>
          Already have an account? Sign in
        </button>
      ) : (
        <div className="space-y-2 rounded-md border p-3" data-account-signin-ask>
          <p>The plan on this phone isn't saved to an email, so signing in to another account leaves it behind for good.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setAsking(false)}>Keep this plan</Button>
            <Button className="flex-1 min-h-[44px]" onClick={() => { setAsking(false); setOpen(true) }} data-account-signin-yes>Sign in</Button>
          </div>
        </div>
      )}
    </div>
  )
}
