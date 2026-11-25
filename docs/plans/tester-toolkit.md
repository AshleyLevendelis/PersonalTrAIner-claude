# The tester toolkit (25 Nov 2026)

Ashley, 25 Nov 2026: *"can we add logging for when real users are testing the app so we can automatically pick up
whats happening or not working while they use the app"* and *"can we add reporting buttons so testers can easily
report bugs with chat, meals, exercises, functions etc."*

## His four rulings (asked together, each from options)

| Question | Options | His choice |
|---|---|---|
| What is recorded automatically | Errors + actions (recommended) / Errors only / Everything | **Everything** |
| Where testers report | Both (recommended) / One button everywhere / Per item only | **Both** |
| A picture of the screen | Yes, they can untick (recommended) / No | **Yes, they can untick** |
| How he hears | Email + daily summary (recommended) / Email every one / A page in the app | **Email + daily summary** |

## What it is

- **Consent.** Profile, "Personal TrAIner & app", **Help test the app**. Off by default. The sheet says, before the
  tap, everything recorded and that a password or email address never is. Agreeing saves `fitness_profiles.tester_since`;
  "Stop recording" clears it, stops at once and drops anything waiting. An invite link: the app's address with
  `?tester=1` opens that sheet.
- **What is recorded** (`src/lib/tester-log.ts`, table `tester_events`): the app opening, each screen, each button
  tapped (its words), what was typed (never a password, an email address or a box marked `data-no-log`), crashes and
  uncaught errors, anything written to the console as an error, a failed request to the database or the coach (path
  and status only), and a failure message on screen (an alert or status line in failure words). The coach messages are
  already in the chat history and are not copied. Sent in batches; kept on the phone when there is no signal (last 400).
- **Reporting**: a bug button beside the gear on every screen; "Report a problem" in every exercise's ⋮ (today's card
  and the week view); a flag on each meal's sheet; the coach-reply flag already existed. One sheet: the area (picked from
  the screen he is on), what happened, and a picture of the screen taken before the sheet opened, with a tick to leave
  it out. The last 30 things he did go with it. A report that cannot be saved says so and keeps the sheet.
- **Email** (`report-email`): each report as it arrives, its picture attached; at 07:17 UTC a summary of the last 24
  hours, each problem one line with its count, testers and screens, most testers affected first. No testers active: no
  email.

## Decided here, mechanical

- The report sheet and the screenshot library load only for a tester, on the tap (`TesterButtons.tsx`): nobody else
  downloads them (+20 kB in the total, +3 kB in the main chunk).
- The picture is a JPEG data URL in the report row, not Supabase Storage: no bucket or storage policies to set up, and
  the email attaches it straight from the row. Capped at 900 kB (a second, smaller try, else no picture, said).
- A read of the profile that does not carry `tester_since` (before the migration, or the copy kept for a fast open)
  changes nothing, so a waiting record is never dropped by a read that simply did not say.

## Limits, named

- The picture is of the page as drawn; an inner scrolled list may show from its top.
- Typing is recorded when the box is left, Enter is pressed or a button is tapped, not keystroke by keystroke.
- Nothing is shown to Ashley in the app: the database (tester_events, tester_reports) and the emails are the record.
- Needs migration `20261125120000_tester_toolkit.sql` and the `report-email` deploy; the Resend key and the Vault
  secrets are the ones the coach-reply report already uses.
