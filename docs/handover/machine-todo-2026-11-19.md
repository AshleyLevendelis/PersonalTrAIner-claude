# For Ashley's machine, after the merges of 19-20 Nov 2026 (main at the merge of PR #35)

Paste the block below into Claude Code on your machine AFTER you have told the cloud session "Merge" and it has
merged the branch into `main`. It does the safe half (pull, prove the right code is there, run the exam, report);
the three steps that reach the live app are yours to type, because they ask for a typed phrase and refuse without a
terminal.

```
Three jobs after the merges of 19-20 Nov 2026 (main ends at the merge of pull request #35). You may READ production (sdkhuczcfnqqimdgfiks) and run the coach exam.
You may NOT deploy, push migrations or write SQL: those steps ask for a typed phrase and refuse without a terminal,
so Ashley runs them himself, in the order below. Paste every answer back to the cloud session word for word.

WHY. A cloud session changed how the coach talks: its instructions (how a reply ends, when it asks, offering a
change instead of announcing one, a pause is not a kit change) and a clean-up step on the coach's server that takes
out stock phrases, internal names, stray tags and emoji on advice. None of that is live until the coach is deployed.
The SETUP coach shares two of the edited rules, so it needs deploying as well. The same merge holds the 1 to 10
"how hard was it" rating, which needs one database column that production does not have yet.
What a cloud session cannot know, and you must find out: whether the deployed coach actually talks better. That is
what the exam is for. On 18 Nov it scored 2.33 of 3, with "asks" lowest at 1.71.

== PART 1: the right code ==
1. git checkout main && git pull
   `git log --oneline -1` must show "Merge pull request #35". Report the line.
2. Prove the checkout holds the work (a deploy from an older checkout prints the same success line):
     ls supabase/functions/chat-gemini/stock-phrases.ts supabase/functions/_shared/plan-promise.ts
     grep -c "1b-ii. HOW A REPLY ENDS" supabase/functions/chat-gemini/index.ts        (must print 1)
     grep -c "3h. A PAUSE, AND COMING BACK" supabase/functions/chat-gemini/index.ts   (must print 1)
     grep -c "and stop. Tie it to them only when the tie is real" supabase/functions/_shared/coach-rules.ts   (must print 1)
     grep -c "MY CARDIO IS BAD" supabase/functions/chat-gemini/index.ts                (must print 1)
     grep -c "OFFER_BUTTONS" supabase/functions/chat-gemini/stock-phrases.ts          (must print 2)
     ls supabase/migrations/20261118140000_add_session_effort.sql
   If any is missing or prints 0, STOP and report: the merge is not in this checkout.
3. npm run test:functions-parse
   MUST print "5 checks ran" and end "Every edge function file parses." If it fails, STOP and report the output.
4. npm run test:coach-rules-sync
   MUST end "All coach-rule constants in sync." (the two coaches share four blocks of rules word for word).

== PART 2: the three steps that are Ashley's to type (tell him, do not run them) ==
A. The database column for the 1 to 10 rating:
     npm run db:push-both
   It pushes to TEST first, then asks for the typed phrase and pushes to PRODUCTION, then relinks to TEST.
   AFTER he has run it, YOU verify (read only): npm run test:schema-parity must pass, and the output of db:push-both
   must have NAMED 20261118140000_add_session_effort as applied (or as already applied) on both. "Remote database is
   up to date" on its own proves nothing: the same line prints when the file is missing from the checkout.
B. The coach:
     npm run deploy:functions:prod -- chat-gemini
C. The setup coach:
     npm run deploy:functions:prod -- onboarding-chat
   For B and C, AFTER he has run them, report the version number each printed and the project it named. The project
   must be sdkhuczcfnqqimdgfiks.

== PART 3: the exam, against the coach that was just deployed ==
5. npm run coach-exam:run && npm run coach-exam:grade        (about 20 minutes; 64 conversations now (the 64th is his Muay Thai chat of 19 Nov))
   VERIFY in coach-exam-report.txt:
   - "judge:" names claude-fable-5-2 and "marked 64 of 64 case(s)". If it says NOT RUN, the ANTHROPIC_API_KEY is
     missing or rejected: report that line word for word and stop.
   - "transcripts were produced by:" shows ONE fingerprint, not "mixed".
6. Report back, word for word:
   - the "Tier A" and "Tier B" summary lines, and the average for each of the eight marks (correct, specific, asks,
     scope, honest, voice, warm, teaches);
   - every case listed under "TIER A — HARD RULES";
   - the whole "THE APP CAUGHT" section. It now also counts turns where the APP asked a question in place of the
     coach's offer (lines reading "asked first: dislike / usual_meal / race_date"). Those are not breaches.
   - the marks and the judge's note for these seven cases: talk-offer-then-yes, talk-complete-answer-just-ends,
     talk-picks-up-the-thread, talk-away-train-or-pause, holiday-pause, ask-cant-face-it, muay-thai-cardio-rounds.
7. Four things to look for in coach-exam/transcripts/*.json and report as counts (the cloud session will compare
   them with 18 Nov, when they were 2, 1, about 12, and 11):
   - replies containing an underscore word such as propose_schedule_change        (expect 0: the server removes them)
   - replies containing a square-bracket tag other than QUICK_REPLIES, LESSON, ACTION   (expect 0)
   - replies longer than 160 characters that contain an emoji                       (expect 0)
   - replies whose last sentence is "How does that sound?", "Sound good?", "Does that make sense?" or
     "What do you think?" with NO [QUICK_REPLIES] line under it                     (expect 0)
   If any is not 0, quote the reply: either the deploy did not take, or the clean-up missed a shape.
8. npm run test:coach-exam-fresh      (must pass: it proves the scores belong to this coach and these questions)
9. Commit coach-exam/, coach-exam-report.txt and coach-exam-scores.json and push to the branch
   claude/coach-empty-text-fix-2c4bzv. Never to main.

== What "done" looks like ==
The column is on both databases, both coaches are deployed on production, the exam is marked 64 of 64 and pushed,
and the four counts in step 7 are in your reply.
```

## What is proven here, and what only that run can prove

Proven in this session by checks and a real browser: the clean-up step does what it says on the 64 real replies of
18 Nov; a promise with no offer behind it is sent back; the pause wording; the chat's own logging line; a past day's
session goes on the past day; the session-length Undo works.

Not proven until the run above: anything the coach's model now writes. The instructions were rewritten to stop
contradicting themselves, and that is the likeliest cause of the padding and the advice-before-asking, but a
likeliest cause is not a measured one.
