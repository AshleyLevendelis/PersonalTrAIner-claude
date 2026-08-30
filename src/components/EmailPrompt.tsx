import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { attachEmail, snoozeEmailPrompt } from '@/lib/auth'

// ---------------------------------------------------------------------------
// "Add an email so you don't lose this" — asked, not demanded.
//
// Audit §1.2. Before accounts existed, identity was one localStorage value.
// Clearing the browser destroyed everything, permanently, with no recovery
// and no second device — and iOS Safari clears it on its own after about a
// week of not opening the app.
//
// ASHLEY'S RULING, 30 Aug 2026, choosing between an invisible migration, a
// login wall, and this: "Ask for an email next time they open it." Existing
// users keep their plan, their history, everything. The next time they open
// the app they are asked to add an email and password. They can dismiss it
// and be asked again later, so nobody is locked out.
//
// SO EVERY LINE HERE IS SHAPED BY "DISMISSIBLE":
//   - "Not now" is a real button, the same size as the other one, not a grey
//     whisper in a corner.
//   - Nothing is gated behind it. Dismissing returns you to your plan.
//   - It comes back in a week, not in five minutes, and not never.
//   - It says what the email is FOR. "Create an account" is a chore; "so you
//     don't lose your training history" is a reason.
//
// The account itself already exists — anonymously, created on first load.
// This attaches an email to it, which keeps the same uid, so nothing is
// migrated, re-keyed or at risk of being orphaned by the attempt.
// ---------------------------------------------------------------------------

export function EmailPrompt({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const save = async () => {
    setSaving(true)
    setError(null)
    const result = await attachEmail(email, password)
    setSaving(false)
    if (!result.ok) { setError(result.error ?? 'That did not work.'); return }
    setDone(true)
  }

  const notNow = () => {
    snoozeEmailPrompt()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-prompt-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-5 space-y-4">
        {done ? (
          <>
            <h2 id="email-prompt-title" className="text-lg font-semibold">You're all set</h2>
            <p className="text-sm text-muted-foreground">
              Your plan and history are now tied to {email}. You can sign in with it on another
              phone, or get back in if this browser ever clears itself.
            </p>
            <Button className="w-full" onClick={onClose}>Back to my plan</Button>
          </>
        ) : (
          <>
            <h2 id="email-prompt-title" className="text-lg font-semibold">Add an email so you don't lose this</h2>
            {/* Says what is at stake, in the units the person cares about —
                their training history — rather than "secure your account". */}
            <p className="text-sm text-muted-foreground">
              Right now your plan, your weigh-ins and every set you've logged live only in this
              browser. If it clears its storage, or you get a new phone, there's no way to get
              them back. An email fixes that. Nothing changes about your plan.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="account-email">Email</Label>
                <Input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-password">Password</Label>
                <Input
                  id="account-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
            </div>

            {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}

            <div className="flex gap-2">
              {/* Equal weight, on purpose. A dismissal that looks like a
                  mistake is not really a dismissal. */}
              <Button variant="outline" className="flex-1" onClick={notNow} disabled={saving}>
                Not now
              </Button>
              <Button className="flex-1" onClick={save} disabled={saving || !email || !password}>
                {saving ? 'Saving...' : 'Save it'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              We'll ask again in a week. Nothing is locked either way.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
