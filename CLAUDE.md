# Standing conventions

These apply to every session in this repo. They exist so they stop being restated per-prompt.

## Instruction handling

- "Report only", "investigate", "propose", "don't build" mean exactly that. Wait for an explicit "build it". An acknowledgement, a thumbs-up, or encouraging prose around a prompt is NOT approval.
- If a prompt's code block and its surrounding prose conflict, the code block wins. Ask rather than resolve it yourself.
- Flag any deviation from an instruction and why, in the report, unprompted.

## Git and deploy

- Commit, never push, unless explicitly told to push.
- Do not trust or report "N commits ahead of origin" without verifying against origin — that line has been wrong repeatedly.
- Frontend ships via push → Vercel. `chat-gemini` is a Supabase edge function needing its own separate deploy. Note which is needed.

## Database

- Local dev and production share ONE Supabase database. There is no scratch or staging instance.
- All DB access select-only unless explicitly told otherwise.
- Never create, modify, or delete profiles or user rows to test something. If a check requires test data, say so and stop — don't manufacture it.

## Safety-adjacent work

- Dietary enforcement, injury filtering, and load prescription always get a plan before a build, even when the fix looks obvious.

## Reporting

- Report the verified state, not that a command exited 0. Say what was proven live versus proven by construction or by test.
- The browser harness in this project cannot register synthetic clicks. Say so plainly rather than describing an interaction as verified.
- If a metric's scale, denominator, or threshold changes, say so — prior numbers stop being comparable.
- If you retract or correct an earlier claim, say how you reached the wrong one — which file you read, what you skimmed, what you assumed. The correction is worth more than the retraction: it tells us whether the same error shape is sitting in other conclusions.
