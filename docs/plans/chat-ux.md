# Coach chat: the best user experience — plan

## Context
Ashley asked how to improve the chat for the best user experience. His 16 Nov screenshot (sweet-potato swap) showed the
coach putting his words in its own bubble, inventing "2 large", warning about a day that was on target, and re-planning a
breakfast at 8pm. Read-only exploration of the chat screen and the coach found the deeper causes:

- **Slow, and then slower on purpose.** No streaming: one request, the full answer, up to 45s of "Thinking..."
  (ChatAssistant.tsx:2607-2666), then a word-by-word replay of text that has already arrived (TypewriterMarkdown.tsx:54-58,
  50ms a word). Each turn sends ~154K characters of prompt + 127K of tool definitions (58 tools), uncached, and runs 1-4
  model calls one after another (main, refusal retry, voice-pass edit, answer-first). Database reads are awaited before the
  request even starts.
- **Offers read like forms, not texts.** A one-food meal edit prints 5 change rows, implications, a rationale line, 2 buttons
  and up to 3 "Or swap in" chips. His own words are printed as the coach's last line in 8 builders (meal-food-edit.ts:205,
  meal-food-add.ts:162, custom-meal.ts:135, ChatAssistant.tsx refit/top-up/pregnancy sites, rendered ProposalCard.tsx:155).
  The "Just today" alternative is added even to changes that are already today-only (meal-tradeoff.ts:132). The fat-loss
  warning fires at any overshoot, inside the app's own ±5% "on target" band (meal-tradeoff.ts:256 vs
  meal-generation.ts DAY_CALORIE_TOLERANCE), and is computed off the screen's day, not the trial day the card describes.
  The replace builder accepts any amount the coach invents as "his" (meal-food-edit.ts:395).
- **It can't see.** No photo path anywhere, while the prompt tells the coach to handle a menu photo the user "sends"
  (chat-gemini index.ts:2942). BACKLOG :865, :958 NOT BUILT.
- **It forgets.** The coach sees the last 20 messages plus saved facts; nothing summarises older chats.
- **The prompt is past the point where rules hold.** 791 lines, ~132 "never"; the repo's own notes say prompt rules were
  ignored and code checks had to be added after the fact.
- **Quality is unmeasured on the live coach.** Last exam 14 Nov: 2.33/3 overall, warm 2.03 lowest, voice 2.14; 10+ coach
  commits since; ~20 coach features wait on a `chat-gemini` deploy.
- Small: no starter suggestions on an empty or cleared chat; Clear chat deletes everything with no Undo; the "Session done"
  pill does nothing when tapped.

## His answers so far (17 Nov 2026)
- **Order: "1,2,3 then 4"**: offer card, then speed, then photos, then memory. Prompt slimming (5) is unordered.
- **"Don't build anything just plan."** This is a plan only. Nothing is built until he says "build it" for a step.
- Still open, his to decide before step 1 is built: (a) earlier meals when one meal changes (leave alone / same dishes
  resized / as now); (b) the short offer shape with the numbers one tap away; (c) whether the word-by-word replay stays.

## Before building: the other chat (checked read-only, 17 Nov 2026)
- Another session is actively changing the coach and the chat: branch `claude/coach-empty-text-fix-2c4bzv`, merged to
  `main` as PR #27 at 11:08 today ("Coach never answers a save with nothing", reminders, YouTube button), touching
  `chat-gemini` and the chat screen. `main` is now `32bad05`; this checkout is on the older `8e8c18c`.
- So: start each step only after that session has merged and paused; `git fetch origin main` and restart this branch from
  it before the first edit; re-read the files step 1 touches, because line numbers above will have moved.
- One `chat-gemini` deploy at a time, from the newest `main`, so neither session's coach changes are overwritten.

## Recommended approach, in order (each a separate build, each on his "build it")

### 1. Fix the offer card (screen; cheapest, every meal offer pays for it)
- Stop printing his quote as `rationale` in all 8 builders (meal-food-edit.ts, meal-food-add.ts, custom-meal.ts, the
  ChatAssistant.tsx sites). Gate: a source check across `src/` (comments stripped) that no `rationale` is built from
  `origin_verbatim_quote`, plus a `verify:` read of a meal-edit bubble's last line.
- `assessMealEdit` (meal-tradeoff.ts): tier-1 calorie warning only past `DAY_CALORIE_TOLERANCE`; a `oneDay` flag in
  `MealEditContext` drops the "Just today" alternative and the "just for today" closers for today-only edits (detect via
  `isPinOnly` from meal-new-from.ts on the built option).
- Judge the day the card describes: record the knock-on trial in `processResponseInner` (the three `await mealKnockOn(...)`
  sites, ChatAssistant.tsx ~6245/6335/6359) and pass its `after`/`before` served day (`ServedDay.day.totals`,
  meal-rotation.ts:794) into `adviseMealEdit`.
- Amount in his words: `buildMealFoodReplaceProposal` takes `userSaid` (already in `processResponseInner`); an amount not
  in his message is sized by the app to keep the removed food's main macro, reusing the sizing in `suggestReplacements`
  (meal-food-edit.ts:280-300), with a line saying so; outside the 0.5-2.5x band it asks "How much?".
- Dish name strips raw/dry from the removed food (`foodNameOf`, meal-food-edit.ts:106).
- Food figures: sweet potato large/small from USDA (food-db.ts:1175) — check `test:food-figures` first.
- Shorter shape (his call, see question): one summary line ("Sweet potato in for the potato · day still on target"),
  the macro rows behind "See the numbers".
- Breakfast-at-8pm: pending his A/B/C answer from the last message.

### 2. Make it fast (coach function + client)
- Measure first: per-turn timings (pre-reads, each model call) logged from the client and the function.
- Run the pre-request database reads in parallel and give them a time limit.
- Cache the fixed prompt and tool definitions (Gemini context caching; fetch current docs via Context7 before writing).
- Send only the tool groups a message can need (a small router over the existing 58), so each call carries far less.
- Show the reply as soon as it is final: drop the replay delay or make it near-instant (his call — it is how the coach
  "sounds").
- Streaming is the last step, only after the post-checks (plan-claim, voice pass) can run on a finished text without the
  user seeing a version that gets withdrawn.

### 3. Photos: a meal, a menu, a label (new capability)
- Image input in the composer (camera or library), sent as Gemini inline image data; the coach estimates and the app's
  existing card shows the assumption before Apply (his 15 Nov "Estimate when asked" shape). Never an allergen verdict from a
  photo (existing allergen-honesty block). Needs his rulings on wording; no migration if images are not stored.

### 4. Remembers past conversations
- A rolling summary of older chat, written by the coach's short-call path and stored per profile, sent beside the 20-message
  window. Needs a migration (his word) and the deploy.

### 5. A smaller prompt
- Split the 791-line prompt into a core and per-topic sections sent only when relevant; move rules already enforced in code
  out of the prompt. Judged only by the coach exam before and after.

### Always: ship and measure
- One release day on his machine (deploys + migrations), then the coach exam on the live coach; every step above is judged
  by the exam and by the timings, not by reading.

## Small extras (fold into step 1)
- Starter chips on an empty or cleared chat from today's state (e.g. "Swap tonight's dinner", "Only 30 minutes today").
- Clear chat: an Undo line (his 8 Nov "Undo line" pattern).
- "Session done" pill opens Exercise like the other pills.

## Verification
- Each change: affected `test:` gates derived from `git diff --name-only` (grep scripts/ for each file), new gates
  mutation-tested, `npx tsc --noEmit`, `test:bundle` and `test:no-dead-code` on any `src/` change.
- Visible changes: a `verify:` driver at 390x844 with screenshots read (chat harness `.tour-harness/chat.tsx`,
  `meal-food-edit.mjs`, `meal-tradeoff.mjs`), every state including failed and stale.
- Coach changes: `coach-exam-fresh` red until the exam is re-run on his machine; timings compared before/after.
- BACKLOG entry per step; push to the working branch; name the `chat-gemini` deploy each needs.
