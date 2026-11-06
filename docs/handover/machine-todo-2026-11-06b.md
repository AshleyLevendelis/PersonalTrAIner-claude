# The warm coach who teaches: measure it, then put it live (6 Nov 2026)

Paste the block below into Claude Code in VS Code, in the PersonalTrAIner-claude folder. It covers BOTH changes on the
branch: "the coach texts you" (docs/handover/machine-todo-2026-11-06.md) and the warm coach. Do this one; the 6 Nov
"texts you" prompt's deploy steps are folded in here. Steps marked (Ashley types) need the yes-production phrase.

```
GOAL: measure whether the coach got warmer and teaches more, then put it live. You are on Ashley's machine; a cloud
session wrote this and cannot see your environment, so verify every step yourself and report what you saw.

WHY: on 6 Nov 2026 Ashley asked for a coach that is "warmer, friendlier, more encouraging, but also more human-like",
that "proactively reach[es] out" and educates people about "the reasons behind why we eat certain foods or do certain
exercises", "informative, but not long-winded". Earlier attempts failed. Her four rulings that day:
- "Warm coach": earned praise tied to a fact, never empty praise; one emoji at most.
- "A why on every answer": a short reason on every piece of advice, plus lessons that build over time (one a day at
  most, chosen from her own week, never repeated).
- "Coach writes, app checks": reminders and the chat opener are written fresh by the coach and checked by the app
  (no number it wasn't given, no food named, no wrong claim about her day); a warm fixed sentence goes if a check fails.
- "Add two new marks": the coach exam now marks `warm` and `teaches` beside the six it had.
The coach exam is the ONLY thing that can say whether the model obeys. It has not run since 26 Sep (voice was 1.75 of
3, the lowest mark). The cloud session has no keys, so it could not run it.

WHAT YOU CANNOT DO: anything needing the typed phrase yes-production. Prepare it and tell Ashley what to type.
Never print or ask for a secret. The exam costs money (one call per turn plus the judge): run each run ONCE.

STEP 1. Before: the current coach, on main (optional but it is the only fair comparison)
  git fetch origin && git checkout main && git pull origin main
  npm run coach-exam:run && npm run coach-exam:grade
  VERIFY: coach-exam-report.txt names a judge and "marked N of N"; if it says the judge was NOT RUN, the
  ANTHROPIC_API_KEY is missing or wrong (it 401'd on 23 and 25 Sep): stop and tell Ashley.
  Copy coach-exam-report.txt and coach-exam-scores.json to a folder OUTSIDE the repo as "before", then
  git checkout -- coach-exam-report.txt coach-exam-scores.json  (and any transcript files it rewrote).

STEP 2. The branch, deployed to TEST (you can)
  git checkout claude/coach-empty-text-fix-2c4bzv && git pull origin claude/coach-empty-text-fix-2c4bzv
  VERIFY: git log --oneline -8 shows "The chat opener in the coach's own words" and "Lessons that build over time".
  On Windows, if a deploy refuses a _shared copy as STALE, run npm run sync:shared and confirm git diff is empty.
  npm run deploy:functions:test
  VERIFY: it names vswuurrtbzbrgubddefv and lists chat-gemini and coach-reach-out as deployed.

STEP 3. After: the new coach on TEST
  npm run coach-exam:run && npm run coach-exam:grade
  VERIFY: 38 cases, eight dimensions (correct, specific, asks, scope, honest, voice, warm, teaches), judge marked all.
  Report to Ashley, from the two reports: each dimension before and after (warm and teaches have no before), the
  hard-rule breaches, and for the four new cases (warm-a-personal-best, warm-week-fell-apart, teach-protein-spread,
  warm-then-thanks) the coach's replies word for word. A move smaller than about 0.05 is the judge's own spread.
  Commit the new coach-exam-report.txt and coach-exam-scores.json (and transcripts) to the branch and push: these
  are the evidence, and test:coach-exam-fresh goes green only with them.

STEP 4. Live (only after Ashley says "merge" and has read STEP 3)
  The app part goes live with the merge (Vercel). Then (Ashley types): npm run deploy:functions:prod
  VERIFY with her: it names sdkhuczcfnqqimdgfiks before the phrase and lists chat-gemini and coach-reach-out after.
  VERIFY: curl the PRODUCTION ?vapid endpoint as on 5 Nov: still 200 with a publicKey.

STEP 5. On her phone (Ashley does this; nothing for you to run)
  a) Clear the chat (bin, tap twice): the first message should read like the coach, not a template, within a few
     seconds. Open the chat and ask "what should I have for dinner?": the answer should carry a short why.
  b) The next reminder should read like a text from the coach, in different words from the old fixed ones, and be
     in the chat when she taps it.
  c) Send a question, leave the app at once: the reply pings, titled "Trainer".
  If a reminder or opener looks wrong, the Supabase logs for coach-reach-out / chat-gemini say
  "fixed sentence used: <why>" or "opener: fixed one used: <why>": report those lines word for word.

DONE MEANS: the after-run's eight marks reported with the before beside them; both functions on TEST and PRODUCTION;
a coach-written opener and reminder seen on her phone. Report each as seen, or not yet.
```
