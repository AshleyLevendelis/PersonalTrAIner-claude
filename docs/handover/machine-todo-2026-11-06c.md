# The second pass: deploy it to TEST, measure it, then put it live (6 Nov 2026)

```
GOAL: measure whether the coach's "second pass" makes its replies read like short texts, then put it live. You are on
Ashley's machine; a cloud session wrote this and cannot see your environment, so verify every step yourself and report
what you saw.

WHY: after the warm-coach change (exam run earlier today on TEST: overall 2.27, voice 1.94, warm 2.00, teaches 2.09),
Ashley said the chat is "better but not perfect". The coach takes on warmth and a why, but ignores the length and
shape rules. Her ruling, 6 Nov 2026, "Second pass + checks": an advice reply is edited by a separate short call into
two to four short lines, one option, one question at most. The edit is checked (the app's markers kept, no new number
or food, the claim checks still pass, the shape right); if it fails, one retry, then the original draft stands.
Safety, medical and allergy wording is never edited. This is now on main. The exam is the only thing that can say
whether it worked.

WHAT YOU CANNOT DO: anything needing the typed phrase yes-production. Prepare it and tell Ashley what to type.
Never print or ask for a secret. The exam costs money: run it ONCE.

STEP 1. Main, deployed to TEST (you can)
  git fetch origin && git checkout main && git pull origin main
  VERIFY: git log --oneline -5 shows "The second pass: the coach drafts, a short checked edit makes it a text".
  On Windows, if a deploy refuses a _shared copy as STALE, run npm run sync:shared and confirm git diff is empty.
  npm run deploy:functions:test
  VERIFY: it names vswuurrtbzbrgubddefv and lists chat-gemini and coach-reach-out as deployed (both read the shared
  Gemini helper, which changed).

STEP 2. The exam against the new coach on TEST
  npm run coach-exam:run && npm run coach-exam:grade
  VERIFY: coach-exam-report.txt names a judge and marked every case, eight dimensions. If the judge was NOT RUN,
  the ANTHROPIC_API_KEY is missing or wrong: stop and tell Ashley.
  Report to Ashley each of the eight marks beside this morning's after-run (overall 2.27, correct, specific, asks,
  scope, honest from that report, voice 1.94, warm 2.00, teaches 2.09), and the hard-rule breaches (5 this morning).
  A move smaller than about 0.05 is the judge's own spread. Quote three replies word for word: the longest advice
  reply, warm-week-fell-apart, and teach-protein-spread.
  In the Supabase dashboard, TEST project, chat-gemini logs: count the lines "voice-pass source=edited" and
  "voice-pass source=draft" (with their "why=" reasons) during the run. Report the counts and the reasons.
  Commit the new coach-exam-report.txt, coach-exam-scores.json and transcripts to a new branch
  exam-results-nov6b and push it (never to main).

STEP 3. Live (only after Ashley has read STEP 2 and says go)
  (Ashley types): npm run deploy:functions:prod
  VERIFY with her: it names sdkhuczcfnqqimdgfiks before the phrase and lists chat-gemini and coach-reach-out after.

STEP 4. On her phone (Ashley does this)
  Ask the coach "what should I have for dinner?" and "how do I do a Romanian deadlift?": each answer should be two to
  four short lines, with a why, and at most one question.

DONE MEANS: the eight marks reported beside this morning's; the voice-pass counts reported; the results on their own
branch; both functions on TEST, and on PRODUCTION once she says go.
```
