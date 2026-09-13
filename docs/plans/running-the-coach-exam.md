# Running the coach exam for the first time

Written 13 Sep 2026, the day the exam was built. It has never been run.

## Why this document exists

The app claims the coach gives best-in-class advice. Nothing has ever checked
that. There are three probes measuring the coach's VOICE — whether it replied
at all, whether it opened with a verdict, whether it wrote more than a text
message — and nothing at all measuring whether what it said was RIGHT.

The exam closes that: 20 fixed conversations, each drawn from a line VISION.md
already rules on, played against the real coach and marked two ways. Eight hard
rules are checked in code (never says a food is safe, never claims a food is
absent, never routes anyone to a screen that does not exist, never contradicts
the person's own numbers, and so on). Five dimensions — correct, specific,
asks, scope, honest — are marked 0-3 by Claude against a written rubric.

**It cannot be run from a cloud session.** That container's `.env.local` is a
harness stub with a 34-character anon key, and there is no Gemini key and no
Anthropic key. So the exam was built, its rules were fixture-tested and its
report was exercised end to end on synthetic transcripts — and the score is
still unknown. This is the run that changes that.

## What the result is worth

The first run sets the baseline and nothing else. Its numbers become the
proposal for where the floor goes; the floor is Ashley's to set, from real
figures rather than a number picked in advance. That is the same way
`test:quality`'s 7.2 was arrived at.

## The prompt for Ashley's local session

Paste the fenced block below into Claude Code in VS Code, against the local
clone.

````
I'm Ashley. This is the PersonalTrAIner repo. I want to run the coach exam for
the first time. It has never been run, so nobody — including me — knows whether
the coach's advice is actually any good.

WHAT THE EXAM IS. 20 fixed conversations played against the real coach, marked
against docs/coach-exam-rubric.md. It calls the chat function on the TEST
project (vswuurrtbzbrgubddefv), creates no profiles and writes no rows. It
costs real model calls: about 37 Gemini turns plus 20 Claude gradings. Pennies,
but not nothing.

STEP 1 — PROVE THE CHECKOUT. The exam is only as honest as the code it plays
against, and a deploy from a stale checkout has already burned this project
once. Run:

  git checkout main && git pull origin main
  git log --oneline -1
  ls scripts/exam-cases/*.json | wc -l
  grep -c "Shopping list: its own full screen" supabase/functions/chat-gemini/index.ts
  npx tsx scripts/run-coach-exam.mts --dry

Expected: 20 case files, the grep returns 1, and the dry run prints
"cases: 20  turns: 37" and the project ref vswuurrtbzbrgubddefv.

If the grep returns 0, STOP and tell me. The coach prompt on disk is not the
one that was merged, and running the exam against it would measure the wrong
coach. Do not edit the file to make the grep pass.

STEP 2 — DEPLOY THE CHAT FUNCTION TO TEST. YOU CAN DO THIS ONE. Only the
PRODUCTION deploy stops for a typed phrase; the TEST target does not:

  npm run deploy:functions:test -- chat-gemini

The exam plays against what is deployed, not what is on disk, so skipping this
would score a coach from whenever TEST was last updated while labelling the
result with today's code. That mislabelling is the whole failure this project
keeps hitting.

STEP 3 — RUN IT.

  export ANTHROPIC_API_KEY=...       # if you have one; see the note below
  npx tsx scripts/run-coach-exam.mts
  npm run coach-exam:grade

Without an Anthropic key the eight hard rules still run and the five judged
dimensions come back unmarked. That is a real half-result, not a failure — tell
me if that is what happened, and I will decide whether to get a key.

STEP 4 — READ THESE BACK TO ME, and nothing else. Not the whole report.

  - The line "transcripts were produced by: <hash>" and the line above it,
    "coach fingerprint (on disk): <hash>". THEY MUST MATCH. If they do not, the
    exam played against a different coach than the one in the repo and the run
    is void — say so rather than reading me numbers from it.
  - "TIER A — HARD RULES: N of 20 case(s) breached one", and for each breach,
    the rule name and the quoted sentence.
  - The dimension averages block and the OVERALL line.
  - Any case marked "not marked" and why.

STEP 5 — ONE LIVE CHECK I CARE ABOUT SPECIFICALLY. In the transcripts, find the
case "where-is-the-shopping-list" and read me the coach's answer verbatim. The
shopping list moved off the Tools tab on 12 Sep and the coach's own description
of the app was still saying it was there. It is fixed in this code — so if the
answer sends me to Tools, step 2 did not take and everything above is measuring
an old function.

THEN COMMIT. coach-exam-report.txt and coach-exam-scores.json are both tracked;
the scores file is what test:coach-exam-fresh reads to decide whether the exam
has gone stale, so a run that is not committed may as well not have happened.

  git add coach-exam-report.txt coach-exam-scores.json coach-exam/transcripts
  git commit -m "Coach exam: first real run"
  npm run test:coach-exam-fresh

That last command should now print a plain "up to date" rather than the
"NEVER BEEN RUN" banner. If it still shows the banner, the scores file did not
get written — tell me.

Do not change any application code, do not tune the rubric to make a score look
better, and do not deploy to production. This task is: prove the checkout,
deploy to TEST, run the exam, read me the numbers.
````

## The separate thing that still needs Ashley herself

The PRODUCTION deploy of `chat-gemini` — for her phone, not for the exam. It
carries the three meal-editing tools from 12 Sep and the corrected
Tools/shopping-list description from 13 Sep. It stops for a typed
`yes-production` and Claude Code cannot run it:

    npm run deploy:functions:prod -- chat-gemini

## What proves the exam actually ran

- `coach-exam-scores.json` loses `baselinePending` and gains a `ranAt`, an
  `overall` and 20 case entries.
- `npm run test:coach-exam-fresh` prints "up to date" instead of the banner.
- The fingerprint on the report matches the fingerprint of the code in the
  repo. That equality is the whole claim: these scores describe THIS coach.
