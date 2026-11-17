# After every coach deploy: the exam, and what the app caught

Stage 2 of `docs/plans/coach-reaches-everything.md` (his "start step 2", 17 Nov 2026). This is the STANDING prompt:
paste it into Claude Code on Ashley's machine every time `chat-gemini` has just been deployed. The cloud session cannot
run it (it needs the Gemini and Anthropic keys and the live function).

```
The coach (the chat-gemini function) has just been deployed to production. Your job is to run the coach exam
against it, mark it, and push the results so the cloud session can read them. You change NOTHING on production.

Why: the coach's mistakes used to reach Ashley's phone before any test saw them. The exam is a fixed set of
realistic conversations (scripts/exam-cases/, one per report since September), played against the deployed coach
and marked against docs/coach-exam-rubric.md. Since 17 Nov 2026 it also counts THE APP CAUGHT: offers the coach
reached for that his words did not allow (a lasting change off "tonight", a today-only change asked for "from now
on", something put on a day off a "maybe"). The app refuses those before a card is built, so they never reach him,
but each one is the coach choosing wrongly and is the prompt work list.

1. Make sure you are on the code that was just deployed:
     git fetch origin && git status
   The branch must match what was deployed (main, unless told otherwise). Report the commit.

2. Run the exam and mark it (about 15 minutes; it calls the real coach and the judge):
     npm run coach-exam:run && npm run coach-exam:grade
   VERIFY in coach-exam-report.txt:
   - "judge:" names a model and "marked N of N case(s)". If it says NOT RUN, the ANTHROPIC_API_KEY is missing or
     rejected: report that line word for word and stop.
   - the line "transcripts were produced by:" shows ONE fingerprint (not "mixed").

3. Report back, word for word:
   - the "Tier A" and "Tier B" summary lines at the end of the grade output;
   - the whole "THE APP CAUGHT" section of coach-exam-report.txt (which tools the coach misused, in which cases);
   - every case listed under "TIER A — HARD RULES".

4. Then: npm run test:coach-exam-fresh   (must pass: it proves the scores belong to this coach and these questions)

5. Commit coach-exam/ (transcripts, report, scores) and push to the working branch you were given. Never to main.

Optional, the live count (READ ONLY): Supabase dashboard, PRODUCTION project (sdkhuczcfnqqimdgfiks), Edge Functions,
chat-gemini, Logs. Search for: offer-check refused
Each line names only the tool and the rule ("offer-check refused tool=propose_concurrent_activity rule=standing"),
never what anyone typed. Report how many lines there are for each tool over the last 7 days.
```

What "done" looks like: scores pushed, `test:coach-exam-fresh` green, and the two lists (hard-rule breaches, the app
caught) in the reply. A tool that appears under THE APP CAUGHT twice or more is the next prompt fix.
