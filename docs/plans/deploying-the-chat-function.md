# Deploying the chat function — and proving it took

Written 8 Sep 2026, after finding that the deploy of 7 Sep shipped stale code.

## Why this document exists

Three fixes Ashley reported from her own phone are built, merged to `main`, and
**not live**. They live in the `chat-gemini` Supabase edge function, and a
`git push` does not deploy it:

1. **The honey question** — she asked a plain macro question and the coach
   answered as a refusal to log it.
2. **Meal logging** — the coach now asks first and writes only when she taps
   confirm.
3. **Which day it is** — the prompt half of the 7 Sep fix. (The data half
   shipped with the frontend and is already live.)

## The deploy of 7 Sep ran, and shipped stale code

Verified read-only against the live project `sdkhuczcfnqqimdgfiks` on 8 Sep:

| | |
|---|---|
| `chat-gemini` version | **70** |
| published | **2026-09-07 17:25:58 UTC** — about five minutes after the merge |
| contains `Meal logging arrives in the next update` | **yes** — absent from this repo since 5 Sep |
| contains `propose_meal_log` | **no** |
| contains `humanSlot` | **no** |
| contains `Cross-reference this with the user's exercise plan` | **yes** — the line replaced on 7 Sep |

`propose_meal_log` is a string literal in the response payload, so minification
cannot explain its absence. The deploy ran, reported success, and named the
right project. It uploaded an old copy of the file. **The command was right and
the checkout was stale.**

This is the third recurrence of the incident CLAUDE.md's 1 Sep handover rule was
written after — *"a production deploy reported success while shipping code three
merges old"*. Hence the rule this document adds: **prove the checkout before
deploying, and prove the upload afterwards. Neither is an assumption.**

## Why "it said it deployed" is not evidence

`scripts/deploy-functions.mjs` prints `== Deployed to PRODUCTION (ref) ==` on
every successful upload, whatever the file contained. The script's own design is
sound — it links and deploys in one command, passes `--project-ref` on the
deploy itself, and always relinks to TEST afterwards — so the *target* cannot be
wrong. Nothing in it can know whether the *content* is current. Only a grep can.

## The prompt for Ashley's local session

Kept verbatim in this repo so it survives a session ending. Paste the fenced
block below into Claude Code in VS Code, against the local clone.

````
I'm Ashley. This is the PersonalTrAIner repo. I need the `chat-gemini` Supabase
edge function deployed to PRODUCTION, and I need you to make sure the CURRENT
code goes up rather than whatever happens to be sitting on my disk.

WHY THIS MATTERS. Three fixes I reported from my phone are built, merged to
main, and still not live, because they live in the edge function and a git push
does not deploy it:
  1. I asked a simple question about honey and the coach answered as though I'd
     asked it to log the honey.
  2. The coach couldn't log a meal at all. It now asks first and logs when I
     tap confirm.
  3. The coach called Tuesday's bench "today's", and offered a session I'd
     already finished as something to head in for "this morning", at 6:33 PM.

THIS HAS ALREADY GONE WRONG ONCE, AND THAT IS WHY THIS PROMPT EXISTS. Version
70 of the function was published at 17:25 UTC on 7 Sep, about five minutes
after the merge — and the code that went up still contains the string
"Meal logging arrives in the next update", which has not been in this repo
since 5 Sep. The deploy ran, reported success, and named the right project. It
uploaded an old copy of the file. The command was right; the checkout was
stale.

STEP 1 — YOU DO THIS. Get main, and prove the working copy is really current:

  git checkout main && git pull origin main
  git log --oneline -1
  grep -c "propose_meal_log" supabase/functions/chat-gemini/index.ts
  grep -c "humanSlot" supabase/functions/chat-gemini/index.ts
  grep -c "is NOT today's, however well it fits" supabase/functions/chat-gemini/index.ts

Expected: the log line shows d64a505 (or newer), and the three greps return
1, 2 and 1.

If ANY grep returns 0, STOP and tell me. The file on disk is not the file that
was merged, and deploying it would repeat the last failure exactly. Do not
"fix" it by editing the file — the file is correct on main; a zero means the
checkout is wrong.

STEP 2 — YOU CANNOT DO THIS. Hand it back to me. The command is:

  npm run deploy:functions:prod -- chat-gemini

It stops and waits for a person to type `yes-production`. `confirmProduction()`
in scripts/db-target.mjs exits immediately when stdin is not a terminal — on
purpose — and scripts/test-deploy-path.ts fails if that check is removed. So
print the command, tell me to run it in my own terminal, and wait for me. Do
not pipe the phrase in, do not `echo yes-production |`, do not edit the script.

STEP 3 — AFTER I SAY IT'S DONE, CHECK WHAT ACTUALLY SHIPPED. "== Deployed to
PRODUCTION ==" prints identically whether the new file went up or an old one
did, so that line is not proof of anything. Read back to me:
  - the project ref on the Supabase line (it must be sdkhuczcfnqqimdgfiks)
  - whether the run ended with "CLI relinked to TEST"
  - `git status --short` — it must be empty

Then tell me to check it on my phone. Open the chat and ask:
  "how many calories in 20g of honey?"
A reply that gives the numbers and never mentions logging means the new
function is live. Any reply about not being able to log food means it is not,
and we go again.

Do not change any application code. This task is only: pull, prove the
checkout, hand me the command, verify what shipped.
````

## How it gets confirmed afterwards

Two checks, and the second is the one that settles it.

- **On her phone**, the honey question. It is the exact symptom she reported and
  it cannot pass against the old function.
- **From a session with read-only Supabase access**, fetch the deployed
  `chat-gemini` source for `sdkhuczcfnqqimdgfiks` and grep it for
  `propose_meal_log`, `humanSlot` and `is NOT today's, however well it fits`,
  plus the ABSENCE of `Meal logging arrives in the next update`. That is exactly
  what caught the stale deploy, so it proves a good one the same way.

## What was deliberately not done

- **Deploying from a cloud session.** Three routes were checked and all are
  blocked or unacceptably risky: the TTY guard; no `SUPABASE_ACCESS_TOKEN` in
  that environment; and deploying via MCP would mean re-uploading ~290KB inline
  with a real fidelity risk.
- **Weakening the typed-phrase gate.** It exists so a wrong-target command costs
  deliberate effort, and `test:deploy-path` fails if it is removed.

## v73 — the coach speaks after a tool runs (Phase 2 of the 8 Sep plan)

Same procedure as above; the pre-greps that must be non-zero in the checkout
BEFORE typing the phrase, and in the live source AFTER it:

| grep | what it proves is on board |
|---|---|
| `resolveToolReply` | the second pass exists (tool-reply.ts) |
| `userNamedFood` | log_meal reads whether SHE named the food |
| `isEvaluationQuestion` | "was that a good idea?" gets a verdict |
| `nothingIdentified` | "roughly 0 kcal … 0%" is unreachable |
| `statedDurationsMinutes` | a swap logs only a duration she stated |
| `WHEN ONE SENTENCE SAYS BOTH` | a move-plus-activity sentence becomes a move card |

Phone check, her three 8 Sep sentences verbatim: *"What should I eat before a
big muay thai session to give me energy?"* → advice in words, no macros, one
"Say 'add it'" line. *"I had 2 rice cakes with dark chocolate and hot chocolate
before. Was that a good idea?"* → a verdict in words, never "0 kcal". *"I
missed today's weight session. Move it to tomorrow"* → the coach's sentence
naming the day above a move card. The function logs carry one line per tool
turn, `tool-reply tool=<name> source=first_leg|round_trip|floor legs=<n>`, so
how often the model spoke versus the template is measurable after the fact.
