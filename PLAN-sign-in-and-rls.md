# Plan — sign-in, and closing the database (audit §1.1, §1.2)

Written before building. This is the largest change of the session, it
touches every live user's access to their own data, and **this sandbox cannot
reach either database, so I cannot run it even once.** That combination is
why the plan is this specific about what could go wrong.

Ashley's ruling, 30 Aug 2026, on what happens to people already using the
app: **"Ask for an email next time they open it."** Chosen over an invisible
migration (which fixes the security hole but leaves account-loss unsolved)
and over a hard wall (which puts a login screen between someone and a
training block they're mid-way through). Everything below follows from that.

## The two problems, and why they are one change

**§1.1** — all 112 policies across 28 tables are `TO anon USING (true)`.
Anyone with the anon key, which ships in the app bundle because it has to,
can read or delete every user's weight history, injuries, allergies and chat
transcripts.

**§1.2** — there is no account. Identity is one localStorage value. Clear it
and everything is gone, with no recovery and no second device. On iPhone,
Safari can clear it on its own after about a week of not opening the app.

They are one change because closing §1.1 requires an identity to scope rows
to, and that identity is what fixes §1.2.

## The shape

### 1. Anonymous auth as the bridge

Supabase anonymous sign-in creates a real `auth.users` row. Crucially,
`updateUser({ email, password })` later converts that same row to a permanent
account — **the uid never changes**, so attaching an email cannot orphan
anything. That property is the whole reason this approach is safe, and it is
what makes Ashley's "ask later, don't block" ruling implementable at all.

Sequence on load:

1. If there is a session, use it.
2. Otherwise `signInAnonymously()`. Invisible; no screen, no interruption.
3. If a legacy profile id is in localStorage, **claim** it (below).
4. If the account has no email yet, show a dismissible prompt to add one.

### 2. The claim, and why it is an RPC rather than a policy

The obvious version — let a caller read rows where `owner_id IS NULL` so they
can adopt their own — reopens the hole it is closing: unowned rows would be
readable by anyone until claimed.

Instead `claim_profile(p_profile_id uuid)` is `SECURITY DEFINER`, and:

- sets `owner_id = auth.uid()` **only where `owner_id IS NULL`**,
- returns whether it claimed anything,
- is the ONLY way an unowned row can be attached.

So the read policy is strictly `owner_id = auth.uid()`, with no
`OR owner_id IS NULL` anywhere. Unowned rows are readable by nobody.

**The residual risk, stated plainly.** Someone who knows a specific profile's
UUID could claim it before its real owner next opens the app. That requires
knowing a v4 UUID that is no longer listable — and today the same person can
read every row without knowing anything at all. It is a large, bounded
improvement, not perfection, and the window closes per user the moment they
open the app. Worth naming in the release notes rather than discovering later.

### 3. One helper, not 28 subqueries

Every child table keys on `profile_id`. Rather than a correlated subquery in
112 policies, one `STABLE SECURITY DEFINER` function:

```sql
owns_profile(p uuid) RETURNS boolean
  -- true when p belongs to a profile whose owner_id = auth.uid()
```

Policies become `USING (owns_profile(profile_id))`. One place to audit, one
place to fix, and an index on `fitness_profiles(owner_id)` behind it.

`exercise_set_logs`, `workout_logs` and `cardio_logs` key on `user_id`
instead — same function, different column, and the gate checks every table
uses the column that actually exists on it.

### 4. What stays open, deliberately

- `nutrition_cache` — a shared ingredient lookup with no user data in it.
  Keeping it readable avoids every client re-deriving the same macros.
- `ai_usage_daily` — already closed to everyone; service-role only.

Both are named in the migration so "not scoped" is a decision on the record.

## What could go wrong, and what stops it

| Failure | What stops it |
|---|---|
| Existing users locked out on deploy | The claim runs before any read, and legacy rows keep working until claimed. `db:push-both` pushes TEST first. |
| A table missed, leaving a hole | The gate enumerates every table from the migrations and fails on any that is still `USING (true)` or has no policy. |
| A table over-scoped, breaking a feature | Every policy uses the column that table actually has; the gate checks each against the schema. |
| Edge functions break | They use the service-role key and bypass RLS. Unchanged. |
| Someone claims a profile they don't own | Needs the exact UUID; window closes on first open. Stated above. |
| I cannot test it | TEST first, then a verification script Ashley runs against TEST before PROD. |

## What I will NOT do

- Run the migration. `npm run db:push-both` is Ashley's, every time.
- Deploy anything.
- Force anyone to sign in. Dismissible, and it comes back later.
- Delete the localStorage profile id. It stays as the claim key and as a
  fallback until an account exists.

## Verification

- `test:rls-local` — applies all 51 migrations to a REAL PostgreSQL (one is
  installed in the build sandbox) with a faithful Supabase stub, then tries to
  read other people's data. Everything it reports was executed, not read.
- `test:auth-and-rls` — the client half, which the database cannot see: sign-in
  before any read, the claim before the read, `owner_id` stamped on insert, and
  the prompt actually being dismissible.
- `npm run verify:rls` — Ashley runs this against TEST with the app's own anon
  key. It refuses to call an empty database a pass.
- `test:audit`, `test:user-data`, `test:reset-clears-draft` stay green.

## What running it changed — three defects the plan did not predict

Written before the build, so this section is the correction. All three were
found by executing the migration rather than reading it, and the first two
would have shipped.

**1. `chat_messages` policies are named `anon_select_messages`.** Not
`anon_select_chat_messages`. The first draft built its `DROP POLICY` names
from the table name, so the drops were silent no-ops, the old `USING (true)`
policies survived, and permissive policies OR together — every user's chat
transcript would have stayed world-readable after the migration that existed
to stop exactly that. The generator now reads the real policy names out of the
migrations. A gate mutation restoring the guessed name turns three checks red.

**2. `set_logs.user_id` is `text`.** It is a pre-C0 table nothing in `src/`
reads any more. `owns_profile(user_id)` on it is not a weak policy, it is
`function owns_profile(text) does not exist` — the whole migration fails on
apply. It is now CLOSED instead: RLS on, no policy, reachable by the service
role only. Any future table arriving with no uuid path to a profile gets the
same treatment, which is the safe default.

**3. The spend cap's counter was callable by anyone.** Not part of this plan at
all — found because the harness runs migrations with Supabase's real privilege
setup. `20260830090000` closed `increment_ai_usage` with `REVOKE ALL … FROM
PUBLIC`, which reads as airtight and is not: Supabase grants `anon` and
`authenticated` privileges on new objects through DEFAULT PRIVILEGES, and
those are DIRECT grants that revoking from PUBLIC does not touch. Anyone with
the anon key could call `increment_ai_usage('profile:<someone-else>', …)` in a
loop and lock that person out of their coach for the day, or drive the
`global` scope and take the coach down for everybody. Fixed in
`20260830130000` by naming the roles. **This is a correction to §1.3, which I
reported as done earlier in this session — it was done, and it had a hole.**

## One behaviour change I did NOT make, for Ashley

"New Plan" abandons the current profile without deleting it. With ownership,
that abandoned row is still owned by the same account — so the database
fallback that finds "the profile this account owns" would have restored the
plan the user had just replaced. It is guarded (the fallback only runs for an
account with an email, which is the second-device case), so nothing regresses.

But it leaves a real question that is Ashley's, not mine: **should "New Plan"
delete the old one?** Today it keeps it forever, invisible. Logged in
BACKLOG.md rather than decided here.

## Checked against the live databases, 30 Aug 2026

Read-only, both projects, after the build. Everything the plan assumed from
the migration files is true of the real schemas — and two things are worth
writing down rather than remembering.

| | TEST | PRODUCTION |
|---|---|---|
| Latest applied migration | `20260828140000` | `20260828140000` |
| Policies in `public` | 112 | 112 |
| Profiles stored | 10 | **70** |
| Chat messages stored | — | **407** |
| Logged sets stored | — | **207** |
| `owner_id` exists yet | no | no |
| `ai_usage_daily` exists yet | no | no |

**The rows are real; the users are not.** 70 profiles, 407 chat messages and
207 logged sets sit behind `USING (true)` right now, readable by anyone
holding a key that ships in the app bundle — but Ashley confirmed on 30 Aug
2026 that **nobody else is using the app yet; all of it is her own testing.**

I had written this section as though third parties were exposed, which
overstated the urgency. The hole is real and worth closing before anyone else
arrives; it is not a live breach today, and the deploy order below is
therefore a convenience question rather than an incident-response one.

**Every live policy is `TO {anon, authenticated} USING (true)`, and there are
no extra policies created by hand in the dashboard.** That was the one risk
the generator could not see: a policy that exists in the database but in no
migration file would survive the migration and keep the hole open. There are
none. The drop list covers all 112.

**`set_logs.user_id` really is `text` on production, and the table has 0
rows.** Closing it costs nothing, and had the first draft shipped, the whole
migration would have failed on apply.

**Three migrations are pending, not one:** `20260830090000` (the usage
counter), `20260830120000` (scoping), `20260830130000` (the counter's grants).

**Supabase's own security advisor reports zero issues on production.** It
checks that RLS is enabled, which it is — on every table, all of them with a
policy that permits everything. Worth knowing that a clean dashboard was never
evidence of anything here.

**GoTrue supports anonymous sign-in** (the `is_anonymous` column is present on
`auth.users`) and no anonymous user has ever been created. So step 0 below is
a toggle, not an upgrade — but it is still a toggle nobody has flipped.

## Deploy, in order — and the order is not optional

**Stakes, given there are no users yet:** getting this order wrong costs
Ashley a broken test app until she finishes the remaining steps. It is not an
outage. Do it in order anyway — it is two minutes either way — but nothing
here needs to be treated as risky.

**0. TURN ON ANONYMOUS SIGN-INS IN THE SUPABASE DASHBOARD. Both projects.**
Authentication → Sign In / Providers → Anonymous Sign-Ins → enable. It is OFF
by default, and I cannot set it from here.

This is the one step that takes the app down if it is skipped. Nothing in the
code can detect it in advance; `signInAnonymously()` simply returns "Anonymous
sign-ins are disabled", and because every read is now scoped, the app shows
*"We couldn't sign you in"* to every user, new and returning. Do TEST first
and open the app there before touching production.

1. `npm run db:push-both` — TEST first, then PROD on the typed confirmation.
   TWO migrations go with this change (`20260830120000`, `20260830130000`),
   plus the earlier `20260830090000` if it has not been pushed yet.
2. `npm run verify:rls` against TEST, with the service key in the environment
   so the result is not vacuous.
3. Only then push to `main` → Vercel.

**Why that order.** The new client stamps `owner_id` on every profile it
creates, so shipping it before the migration means onboarding fails on a
column the database does not have. The database going first is harmless in the
other direction: `owner_id` sits there NULL, every existing policy still
applies, and nobody notices until the client arrives to claim it.

4. Edge functions need no redeploy for this, but do for §2.5 and §1.3.

## If it goes wrong

The migration is reversible in the sense that matters: `owner_id` is additive
and nothing is deleted or re-keyed. Reverting the FRONTEND alone (Vercel's
previous deployment) puts the old client back against a scoped database, which
reads nothing — so a rollback has to be the policies, not the client. Keep the
`anon_*` policy definitions from before this migration to hand before pushing
to production, in case that is ever needed in a hurry.
