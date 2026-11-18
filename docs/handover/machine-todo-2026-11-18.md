```
Three jobs after the merges of 18 Nov 2026 (main is at ce7e6de6 or later; the second merge added the allergy card,
the weight history and the leftovers). You may READ production
(sdkhuczcfnqqimdgfiks) and run the exam; you may NOT deploy, push migrations, or write SQL: those steps ask for a
typed phrase and refuse without a terminal, so Ashley runs them himself. Paste every answer back to the cloud
session word for word.

WHY. A cloud session merged a pass on meals, the coach and plans. The frontend ships itself on merge. The coach
(the chat-gemini function) does not: it needs its own deploy, and until then the chat runs the OLD coach while the
app has the new screens. Two more facts you need:
  - From 17 Nov until this merge, main's supabase/functions/chat-gemini/index.ts DID NOT PARSE (one stray
    "` : ''}" in the coach's instructions). A deploy from the old main would have failed at the bundle, or looked
    fine while leaving the old coach running. So step 2 proves the file parses BEFORE anyone deploys.
  - The coach exam's judge changed to claude-fable-5-2 (Ashley's ruling, 17 Nov), three exam questions are new and
    one was edited. So the saved scores are stale on four counts and the exam must be run in full, not re-graded.

== PART 1: the right code, and it parses ==
1. git checkout main && git pull
   `git log --oneline -1` must show ce7e6de6 or later. Report the line.
2. npm run test:functions-parse
   MUST print "5 checks ran" and end "Every edge function file parses." (one of its lines says the coach's file
   is the big one, over 3,000 lines, so it read the real thing). If it fails, STOP and report the output: do not
   let Ashley deploy.

== PART 2: what is not live yet ==
3. Server functions:
     npx supabase functions list --project-ref sdkhuczcfnqqimdgfiks
   Report the UPDATED date of each. The last change on main to each (it needs a deploy if its date is earlier):
     chat-gemini        18 Nov 2026   <- certainly needs one
     onboarding-chat    16 Nov 2026
     generate-meals     18 Nov 2026   <- certainly needs one (the allergy rules)
     coach-reach-out    15 Nov 2026
     macro-calibration   6 Nov 2026
   For each that is older, tell Ashley to run in his own terminal (it asks him to type yes-production):
     npm run deploy:functions:prod -- <name>
   On Windows run `npm run sync:shared` first if the deploy calls a shared file STALE.
   VERIFY after he has: run the list again and report chat-gemini's UPDATED time. A deploy that prints success and
   an UPDATED date that did not move is NOT a deploy.
4. Database changes. Read PRODUCTION's own record in the dashboard SQL editor (a read):
     select version from supabase_migrations.schema_migrations order by version desc limit 15;
   Compare with supabase/migrations. The newest; report any missing from PRODUCTION:
     20261118120000_add_allergies (NEW, on main since ce7e6de6: the allergy card on Profile needs it),
     20261117120000_add_chat_summary, 20261115120000_add_due_date, 20261114180000_add_plan_paused_since,
     20261114150000_health_conditions, 20261114120000_running_goal, 20261113140000_flexible_nutrition,
     20261113130000_enjoyed_activities, 20261113120000_coach_moment_log, 20261111120000_add_meals_elsewhere,
     20261109120000_add_date_of_birth
   If any are missing, Ashley runs `npm run db:push-both` himself (typed confirmation), then you run
   `npm run test:schema-parity` and report its last lines. The allergies one is certainly missing; the rest are
   listed because nobody has confirmed them.

== PART 3: the exam, ONLY after chat-gemini's UPDATED time has moved ==
5. npm run coach-exam:run && npm run coach-exam:grade      (about 15-20 minutes; real coach, real judge)
   VERIFY in coach-exam-report.txt:
   - "judge:" names claude-fable-5-2 and "marked N of N case(s)". If it says NOT RUN, or names another model, the
     ANTHROPIC_API_KEY is missing, rejected, or cannot reach that model: report that line word for word and stop.
   - "transcripts were produced by:" shows ONE fingerprint (not "mixed").
   - these three cases were answered: sport-what-transfers-from-my-plan, sport-making-weight-is-not-coached,
     level-beginner-gets-plain-words.
6. Report back, word for word:
   - the "Tier A" and "Tier B" summary lines at the end of the grade output (the judged marks now include warm and
     teaches; marks from before 17 Nov were given by a different judge and are not comparable);
   - the whole "THE APP CAUGHT" section of coach-exam-report.txt;
   - every case listed under "TIER A — HARD RULES", with the coach's reply for each.
7. npm run test:coach-exam-fresh      (must pass: it proves the scores belong to this coach, judge and questions)
8. Commit coach-exam/ (transcripts, report, scores) and push to the branch claude/coach-empty-text-fix-2c4bzv
   (git fetch origin first; it has been moved up to main). NEVER to main.

DONE MEANS: step 2 passed; the function dates before and after; any missing migrations named; the exam's two
summary lines, THE APP CAUGHT and the hard-rule list pasted back; test:coach-exam-fresh green; scores pushed to the
branch. Nothing on production changed by you.
```

What the cloud session does with the answer: a tool listed twice or more under THE APP CAUGHT, and any hard-rule
breach, is the next coach fix; the three new cases say whether the level and sport sections (prompt 1g, 1h) work.
