# Standing conventions

These apply to every session in this repo. They exist so they stop being restated per-prompt.

## Product vision

- Full product vision, standards, and shipping bar: see [VISION.md](VISION.md). Safety-adjacent and architecture-level decisions should be checked against it.

## Instruction handling

- "Report only", "investigate", "propose", "don't build" mean exactly that. Wait for an explicit "build it". An acknowledgement, a thumbs-up, or encouraging prose around a prompt is NOT approval.
- If a prompt's code block and its surrounding prose conflict, the code block wins. Ask rather than resolve it yourself.
- Flag any deviation from an instruction and why, in the report, unprompted.

## Asking

- Work autonomously by default. When a decision genuinely is Ashley's to make, ask her directly in the conversation — don't guess and don't wait for it to arrive secondhand.
- ASK when the decision is about how the app behaves: what a coach should do in a situation, what the app is allowed to claim, what a user should see or be told, a trade-off between two defensible behaviours, or anything safety-adjacent (allergens, injuries, medical, mental health).
- PROCEED WITHOUT ASKING on anything mechanical: bugs, tests, refactors, measurement, data consistency, performance — anything that has a right answer.
- How to ask, which matters as much as when:
  - Ashley is non-technical. Never ask about a function, field, or file.
  - Translate to the product question underneath. Not "should coherenceGroupOf key on substitution_group" but "should the app compare shrug weights against lateral raise weights, or treat them separately?"
  - Give 2-4 concrete options and a recommendation with a one-line reason.
  - Say what happens either way, in plain terms.
  - One question at a time. Don't batch several and stall.
  - If she picks something that seems wrong, say so once, then do it.
- Keep a decision log: every judgment call, the options, what was chosen, why, and whether she answered or it was decided unprompted.
- Still stop and wait, even with a good default in hand: anything affecting live users, anything that changes what a metric measures, anything in the allergen or safety path.

## Git and deploy

- Commit, never push, unless explicitly told to push.
- Do not trust or report "N commits ahead of origin" without verifying against origin — that line has been wrong repeatedly.
- Frontend ships via push → Vercel. The Supabase edge functions (`chat-gemini`, `generate-meals`, `macro-calibration`, `onboarding-chat`) each need their own separate deploy: `npm run deploy:functions:prod -- <name>`, which asks for the `yes-production` phrase and names the target on the deploy itself. Note which is needed.

## Database

- Two Supabase projects since 11 Aug 2026: TEST (`vswuurrtbzbrgubddefv`, the CLI's default link) and PRODUCTION (`sdkhuczcfnqqimdgfiks`, live users' data). Before that date, dev and prod shared one database with no scratch instance — that constraint no longer holds; don't rely on old notes that assume it does.
- The CLI defaults to TEST. Reaching production requires `npm run db:link-prod`, which demands typing `yes-production` — a wrong-target command should cost deliberate effort, not just a missing argument. Run `npm run db:link-test` to return to the safe default when done.
- Migrations: never run a bare `supabase db push` by hand. Use `npm run db:push-both` — the only sanctioned path. It pushes to TEST first, then (after the same typed confirmation) to PRODUCTION, and always relinks back to TEST when it finishes, success or failure. `npm run test:schema-parity` verifies both projects have applied the identical migration set; run it if drift is ever suspected.
- All DB access select-only on PRODUCTION unless explicitly told otherwise. The TEST project exists specifically so this restriction can be relaxed there — creating profiles, writing data, and running full end-to-end flows (including through the actual onboarding UI) is fine on TEST.
- Never create, modify, or delete profiles or user rows on PRODUCTION to test something. If a check needs real interaction, use TEST instead of manufacturing prod data.
- Both projects are free-tier and pause after ~7 days with no API activity. A paused project fails every request (CLI and app alike) until restored — there is no way to wake it via traffic. Restore from the Supabase dashboard: open the project, its paused banner has a "Restore project" button. Check this first if a TEST-project command fails with a connection/timeout error after a quiet stretch.

## Safety-adjacent work

- Dietary enforcement, injury filtering, and load prescription always get a plan before a build, even when the fix looks obvious.

## Reporting

- Report the verified state, not that a command exited 0. Say what was proven live versus proven by construction or by test.
- Browser-harness clicks: verified working 11 Aug 2026 (field focus, typing, and two state-changing clicks all registered correctly). History: this harness failed to register synthetic clicks for an extended prior period, the cause was never root-caused, and the recovery is unexplained. Treat "working" as the current observed state, not a permanent fix — if clicks stop registering again, re-test before concluding anything, rather than assuming either "still broken" or "still fixed."
- If a metric's scale, denominator, or threshold changes, say so — prior numbers stop being comparable.
- If you retract or correct an earlier claim, say how you reached the wrong one — which file you read, what you skimmed, what you assumed. The correction is worth more than the retraction: it tells us whether the same error shape is sitting in other conclusions.
