# The second pass, fixed: deploy it to TEST and run the exam once more (7 Nov 2026)

```
GOAL: measure the coach again on TEST after two fixes to this morning's exam findings, then put it live only if
Ashley says go. You are on Ashley's machine; a cloud session wrote this and cannot see your environment, so verify
every step yourself and report what you saw.

WHY: this morning's exam on TEST (overall 2.19, voice 2.03, warm 1.97, teaches 2.00, hard rules 6) showed the
"second pass" edit working on 18 replies and skipped on 18 as "safety wording". Two causes, both fixed on the
branch claude/coach-empty-text-fix-2c4bzv (NOT on main):
1. The safety-word list was read off both her message and the coach's draft and was too wide: "numb" matched
   "numbers", "chest" matched a press cue, "injury" matched a reply about exercise order. Now the skip is read off
   what SHE said (pain, symptoms, injury, allergy, medical, medication, eating very little) or a draft that refers her
   to a doctor, physio, pharmacist or dietitian; inside an edited reply, every warning sentence ("stop if you feel a
   sharp pain") must come back word for word or the edit is refused.
2. When the coach saved something about her ("it's been a rough few weeks", the 90 minutes of compensatory cardio),
   it sent an EMPTY reply and only the save receipt showed. Now the coach answers beside the save.

WHAT YOU CANNOT DO: anything needing the typed phrase yes-production. Never print or ask for a secret. The exam
costs money: run it ONCE.

STEP 1. The branch, deployed to TEST (you can)
  git fetch origin && git checkout claude/coach-empty-text-fix-2c4bzv && git pull origin claude/coach-empty-text-fix-2c4bzv
  VERIFY: git log --oneline -3 shows "Second pass: safety words read off her message; a save still gets a reply".
  On Windows, if a deploy refuses a _shared copy as STALE, run npm run sync:shared and confirm git diff is empty.
  npm run deploy:functions:test
  VERIFY: it names vswuurrtbzbrgubddefv and lists chat-gemini as deployed.

STEP 2. The exam against it
  npm run coach-exam:run && npm run coach-exam:grade
  VERIFY: the judge marked 38 of 38 and there are eight dimensions. If the judge was NOT RUN, stop and tell Ashley.
  Report to Ashley each of the eight marks beside THIS MORNING's (overall 2.19, correct 2.32, specific 2.11, asks
  1.91, scope 2.50, honest 2.72, voice 2.03, warm 1.97, teaches 2.00) and the hard-rule breaches (6 this morning).
  A move smaller than about 0.05 is the judge's own spread.
  Quote word for word: the replies to scope-disordered-eating turn 2 and ask-cant-face-it turn 2 (both were EMPTY
  this morning), voice-how-to-short-steps turn 1, and contradiction-my-numbers turn 1.
  In the TEST chat-gemini logs during the run: count "voice-pass source=edited", "source=skipped" and
  "source=draft" with their why= reasons (this morning: 18 edited, 18 skipped "safety wording", 0 draft), and
  "tool-reply tool=record_context_fact source=..." lines.
  Commit coach-exam-report.txt, coach-exam-scores.json and transcripts to a new branch exam-results-nov7 and push it
  (never to main, never to the claude/ branch).

STEP 3. Nothing live yet. Production stays on the 6 Nov coach until Ashley has read STEP 2, said "merge" to the cloud
  session, and then said go for: (Ashley types) npm run deploy:functions:prod, verifying sdkhuczcfnqqimdgfiks.

DONE MEANS: the eight marks reported beside this morning's; the two once-empty replies quoted; the voice-pass and
save-reply log counts; the results on exam-results-nov7.
```
