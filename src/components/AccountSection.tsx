import { useState } from 'react'
import type { AccountStatus } from '@/lib/auth'
import { AttachEmailForm, savedAccountLine } from '@/components/EmailPrompt'

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
  if (status.kind === 'saved') {
    return (
      <div className="space-y-2 text-sm" data-account-state="saved">
        <p>Signed in as <span className="font-semibold break-all">{status.email}</span>.</p>
        <p className="text-muted-foreground">
          Your plan and history are tied to this email. To get back in on a new phone, or if this browser ever clears
          itself, open the app and tap "Already have an account? Sign in".
        </p>
      </div>
    )
  }
  if (status.kind === 'confirming') {
    return (
      <p className="text-sm text-muted-foreground" data-account-state="confirming">
        We've sent a link to <span className="font-semibold text-foreground break-all">{status.email}</span>. Tap it to
        finish: until you do, the email isn't saved and your progress still lives only on this phone.
      </p>
    )
  }
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
    </div>
  )
}
