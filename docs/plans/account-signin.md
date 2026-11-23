# Email sign-up, sign-in and sign-out: what is broken and the fix (23 Nov 2026)

His report, 23 Nov 2026: *"I didn't receive a proper email to confirm my email address, and there's no way to sign
out and sign back in with the email. Several times, it's asked me to change my password."* Live testers start in a
few days. Investigation only; nothing built.

## How it works today

- First open: the app silently creates an ANONYMOUS account (`ensureSignedIn`, `src/lib/auth.ts`).
- "Add an email" (the weekly prompt, `EmailPrompt.tsx`, and Profile's Account row) calls
  `supabase.auth.updateUser({ email, password })` on that anonymous account.
- The only sign-in screen (`SignInScreen.tsx`) appears ONLY when the phone has no plan at all, before setup.
- There is no sign-out anywhere (`signOut` is called nowhere in `src/`), and no "forgot password".
- The project's auth settings (confirm email, Site URL, redirect URLs, SMTP, templates) live in the Supabase
  dashboard: the repo has no `supabase/config.toml` and no email templates, and this cloud session cannot reach
  either project (proxy refuses `*.supabase.co`; the Supabase connector needs signing in). **Every server-side point
  below is inferred from the code and Supabase's defaults, not read off the project.**

## What is wrong

1. **The confirmation email (server side, the likeliest cause, NOT verified).**
   - With "Confirm email" on, `updateUser` holds the address as `new_email` and sends Supabase's stock
     **"Confirm Change of Email"** message, from Supabase's own sender. This is the "not a proper email" one: wrong
     wording for a sign-up, with no app name.
   - Supabase's built-in sender is for testing only. It sends **only to addresses in the project's team** and only a
     couple of emails an hour. **Every tester's email would silently never arrive.** This is the blocker for live
     users.
   - The link goes to the dashboard's **Site URL**, because the app passes no `emailRedirectTo`. Supabase's default
     Site URL is `http://localhost:3000`. If it was never changed, tapping the link opens a dead page and the address
     is never confirmed.
2. **The password prompt keeps coming back (code).**
   - `needsEmail()` asks only "is `user.email` empty?". While the address waits for its link it IS empty, so the
     weekly prompt keeps asking.
   - Every "Save it" calls `updateUser` with a password again. That changes the password each time, and the phone's
     password manager offers to "update" the saved one.
   - The Account row (`accountStatusOf`) already knows the pending state ("Check your email"). The prompt does not.
3. **No way out, no way back in (code).**
   - No Sign out exists.
   - Sign in is reachable only from a phone with no plan. So on a phone that has a plan, an emailed account can
     never be signed into.
   - An unconfirmed address cannot be signed in with at all, because `user.email` is still empty.
4. **No forgot-password (code).** A tester who forgets a password has no route back.
5. **Smaller (code).**
   - An address already on another account shows Supabase's raw English error.
   - Nothing listens for the session changing (`onAuthStateChange`), so returning from the email link does not
     refresh the Account row until Profile is reopened.

## Proposed fix

App (this session can build and drive it in the browser harness):

- **A. The pending state is respected everywhere.**
  - The prompt never re-asks while a link is waiting.
  - The Account row shows "Check your email at X", with **Resend link** and **Use a different email**.
  - Neither of those asks for the password again.
- **B. The password is set once.** Resend uses `auth.resend({ type: 'email_change' })`. A changed address sends
  `{ email }` only.
- **C. The link comes back to the live app.**
  - Pass `emailRedirectTo` with the app's own address, back to the Account row.
  - Listen for `onAuthStateChange` so "Check your email" turns into "Saved" the moment the link is tapped.
  - Show a plain line if the link has expired.
- **D. Sign out**, on Profile's Account row, only for an account with a saved email.
  - It asks first, and says that the plan stays on the account.
  - It signs out, clears this phone's copy, and returns to the Sign in / I'm new screen.
- **E. Sign in from anywhere.**
  - The Account row of an anonymous account offers "Already have an account? Sign in".
  - It warns that the plan on this phone (no email) will be left behind.
- **F. Forgot password.**
  - `resetPasswordForEmail` with a redirect back.
  - A "Set a new password" screen when the app opens from that link (`PASSWORD_RECOVERY`).
- **G. Plain words** for every Supabase error the flows can return (address taken, rate limit, weak password,
  expired link).
- Gates: a `test:` on the state logic and a `verify:` driver for every screen, with a fake auth client. Every check
  is mutation-tested.

Dashboard (his, production; a handover prompt for the parts his local session can do):

- **Custom SMTP** (Resend, which `report-email` already needs a key for).
  - Without it, testers get no email at all.
  - A sending domain verified in Resend.
- **Site URL** = `https://personal-tr-a-iner-claude-yco8.vercel.app`, and **Redirect URLs** to include it.
- **Email templates:** "Confirm Change of Email" and "Reset Password" in the app's own words.
- Then a real end-to-end test on his phone with an address that is not his. That is the only proof the email
  arrives.

## Open (his)

- Whether to build A-G now.
- The sender name and address, and the email wording (proposed in the build).
