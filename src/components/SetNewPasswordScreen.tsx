import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clearThisPhone, reloadApp, setNewPassword } from '@/lib/auth'

// ---------------------------------------------------------------------------
// THE PAGE A "RESET YOUR PASSWORD" LINK OPENS (23 Nov 2026, docs/plans/account-signin.md). There was no forgot
// password at all, so a tester who forgot theirs had no way back to their plan.
//
// App shows this INSTEAD of starting, when the page opened from a reset link: the link signs the page in as the
// account it was sent to, and starting first would read this phone's old plan under that account. After the save,
// the phone forgets the last person and opens afresh as the account, so the plan read is the account's own.
// ---------------------------------------------------------------------------

export function SetNewPasswordScreen({ onCancel }: { onCancel: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError(null)
    const result = await setNewPassword(password)
    if (!result.ok) { setBusy(false); setError(result.error ?? "That didn't work."); return }
    clearThisPhone()
    reloadApp()
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="set-new-password">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a new password for your account. Then the app opens with your plan.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password" type="password" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
        <Button className="w-full min-h-[44px]" onClick={save} disabled={busy || !password} data-new-password-save>
          {busy ? 'Saving...' : 'Save password'}
        </Button>
        <Button variant="outline" className="w-full min-h-[44px]" onClick={onCancel} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  )
}
