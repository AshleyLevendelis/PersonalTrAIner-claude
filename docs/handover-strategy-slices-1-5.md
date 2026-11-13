# For Ashley's machine: strategy slices 1-5 (13 Nov 2026)

Paste the block below into Claude Code in VS Code. Nothing here is on `main` yet. Merging, the database step and the
deploys each still need your word, and the two typed confirmations are yours to type.

```
Context: branch claude/coach-empty-text-fix-2c4bzv holds slices 1-5 of Ashley's 13 Nov 2026 strategy
(measurement, the coach's rhythm, the walking pathway with home strength, flexible nutrition, eating out).
Every check that reads the changed files passed in a cloud session, except two that cannot pass there:
test:coach-exam-fresh (the coach changed, so the exam must be re-run here) and the database checks.
Nothing has been merged, deployed or migrated. Do NOT merge to main unless Ashley says so in this session.

1. git fetch origin && git checkout claude/coach-empty-text-fix-2c4bzv && git pull
   Verify: `git log -1 --oneline` shows 18687065 or later.
2. Three new migrations are on the branch:
   20261113120000_coach_moment_log.sql, 20261113130000_enjoyed_activities.sql, 20261113140000_flexible_nutrition.sql.
   You cannot run `npm run db:push-both` yourself (it needs a typed confirmation). Tell Ashley to run it in his own
   terminal, then run `npm run test:schema-parity` and confirm it says both projects have the same migrations,
   including those three names.
3. Three edge functions changed: chat-gemini, onboarding-chat, coach-reach-out. Ashley runs each himself:
   `npm run deploy:functions:prod -- chat-gemini` (then onboarding-chat, then coach-reach-out).
   Verify each deploy printed the production project and the function name; a deploy from an old checkout prints the
   same, so confirm step 1 first.
4. Re-run the coach exam against the deployed coach (it needs the keys on this machine):
   `npm run coach-exam:run`, then `npm run coach-exam:grade`, then `npm run test:coach-exam-fresh` must pass. Five questions are new or unanswered:
   eating-out-asks-size, meal-cooked-for-me, out-no-compensation, out-suggested-orders, usual-meal-ask-then-card.
   Read back the hard-rule breaches and the voice / warm / teaches marks, and commit the scores to the branch.
Done = schema parity green with the three migrations, three deploys named correctly, exam fresh and its scores pushed.
```
