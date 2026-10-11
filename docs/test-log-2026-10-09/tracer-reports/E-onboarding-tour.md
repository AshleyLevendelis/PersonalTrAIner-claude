# E · Conversational onboarding and the first-run tour — root-cause report

Tracer: read-only. Bugs: H14, M1, M2, M3, M4, M5 (storage side), M6, L1–L8, plus the
equipment-mapping question for the equipment tracer.

## How to read this

- **VERIFIED** = I read the code path end to end, or ran it. **INFERRED** = the code
  makes it possible/likely but the live turn that produced it was not captured.
- One thing was run: a read-only `npx tsx` script (scratchpad, not the repo) that feeds
  the real `resolveReply` the two-leg shape behind H14. Output is quoted under H14.
- Nothing under `/home/claude/app` was edited. No git state changed.
- Files are quoted `path:line` against branch `claude/test-log-fixes-oct9`.

### The files that matter

| File | Role |
|---|---|
| `supabase/functions/onboarding-chat/index.ts` | The onboarding prompt + tool declarations. One Gemini call per turn, then `resolveReply`. Holds no state. |
| `supabase/functions/onboarding-chat/reply-resolver.ts` | Guarantees non-empty reply text by running up to 3 more model legs and MERGING their tool calls. |
| `src/components/onboarding/ConversationalOnboarding.tsx` | The client: validates every `set_slot`, decides which message hosts the chips, review card, edit rows. |
| `src/lib/onboarding-slots.ts` | Every question, its options, `assembleProfile`. |
| `src/lib/app-tour-steps.ts` + `src/components/AppTour.tsx` | The product tour (words / behaviour). `.tour-harness/` is only the test harness. |

### Two rulings that are NOT in the repo

M1 (defer off-topic) and M3 (remove combat) are both cited by the tester as Ashley's
August decisions. **Neither is written in `BACKLOG.md`, `CLAUDE.md`, `VISION.md` or
`docs/`.** Grepped: `defer`, `deferr`, `detour`, `creatine`, `off-topic`, `off topic`,
`get to know you first`, `being handled`, `mid-onboarding`; and `combat` (every hit read),
`fight-ready`, `remove combat`, `combat.*picker`, `style picker`. The only record is
Ashley's saved conversation notes for the onboarding thread (Aug 2026), which say:

> "Off-topic mid-onboarding (e.g. "what does creatine do"): prefer deferring with a reason
> — get to know you first, then come back to it — over answering in full. Claude's added
> caution she accepted: cap the deferrals so it doesn't feel like being handled."

> "Decision: remove combat from the picker for now and backlog it properly. It's a real
> audience Ashley wants to come back to, but not at this stage. Removal must handle
> existing profiles that already have combat set."

So both are real decisions with no decision-log entry. Whoever builds these should add
the BACKLOG entry CLAUDE.md asks for ("Keep a decision log… in TWO places").

---

### H14 · Coach asked age/height/weight above "2 meals / 3 meals / 4 meals" chips; the real meals question later had no chips

- **Status:** CONFIRMED IN CODE (mechanism verified by reading + one run; the exact live
  turn is INFERRED, since it was seen once and not captured).

- **Root cause — two independent defects, one per half of the symptom.**

  **(a) Wrong chips: the question text and the chip slot are produced by two different
  model calls and stapled together with no agreement check.**

  1. The client never derives chips from the question. Chips appear only when the model
     calls the `present_slot` tool with a `slot_key`
     (`index.ts:54-66`). The prompt *asks* the model to keep them aligned — "The one hard
     rule: the slot_key MUST be the exact question your sentence just asked. Options
     under the wrong question are worse than none" (`index.ts:56`, repeated at `:272`) —
     and nothing enforces it.
  2. Gemini answers a tool-using turn with tool calls and **no prose** — the file's own
     measurement: "across a full 15-turn scripted onboarding, EVERY turn came back with
     zero text" (`index.ts:362-365`). A free-text answer always triggers `set_slot`, so
     for a typed answer this is the normal path, not an edge case.
  3. `resolveReply` then runs a SECOND call to get the words
     (`reply-resolver.ts:218-226`). The first leg's calls are kept
     (`:176-179`), the second leg's are merged in (`:183-193`), and the function returns
     one flat list with no record of which leg produced what.
  4. The second leg is told only "those are recorded… If your turn asks a closed-set
     question, call present_slot for it in this same turn"
     (`RECORDED_NUDGE`, `reply-resolver.ts:63-64`). The tool result it is shown for the
     first leg's `present_slot` is just `{ status: "recorded" }` (`:205-209`). Nothing
     tells it "chips for X are already going on screen, so your sentence must ask X".
  5. On the client, the chips are attached to "the last non-receipt assistant message of
     this turn" — i.e. the second leg's sentence — whatever it says:
     `ConversationalOnboarding.tsx:969-973`
     ```ts
     const host = [...ws.newMessages].reverse()
       .find(m => m.role === 'assistant' && !m.isReceipt && !m.slotCard && m.content.trim())
     if (host) { host.slotCard = key }
     ```
  6. If BOTH legs call `present_slot`, the client keeps the FIRST and drops the rest
     (`presentedThisTurn`, `:958-959`) — so the leg whose words are *not* shown wins over
     the leg whose words *are*.

  **Ran it** (real `resolveReply`, mocked legs, Sam's state at that moment):
  ```
  STILL UNKNOWN sent to the model: recoveryCapacity, age, heightCm, weightKg, gender, mealsPerDay, dietaryPreferences, dislikedFoods
  reply  : Decent sleep goes a long way. How old are you, and what are your current height and weight?
  actions: [set_slot recoveryCapacity=moderate, present_slot mealsPerDay]
  variant (leg 2 also presents gender): actions: [..., present_slot mealsPerDay, present_slot gender]
  ```
  That is the tester's screen exactly: recovery answered in free text → age/height/weight
  sentence → meals chips. Why the first leg picked `mealsPerDay` is INFERRED: the prompt
  says numeric asks "have no chips at all, which is exactly why they group so easily"
  and "at most ONE of them gets chips" (`index.ts:272`), which invites planning "numbers
  + the next tappable question" in one turn; the second leg then wrote only the numbers.
  A single leg emitting mismatched text+call is also possible and is caught by the same
  fix.

  **(b) Missing chips two turns later: a guard that drops a re-ask while an older card
  for the same slot is still unanswered.** The wrong `mealsPerDay` card from (a) was never
  tapped, so it stayed "live" further up the transcript. When the coach finally asked
  about meals and called `present_slot('mealsPerDay')`:
  `ConversationalOnboarding.tsx:950-953`
  ```ts
  const alreadyLive = [...messages, ...ws.newMessages].some(
    m => m.slotCard === key && !m.slotCardResolved && !ws.resolveCards.has(key))
  if (alreadyLive && !ws.corrected.has(key)) continue
  ```
  The new request is discarded. The chips stay on the old message. **This is the same
  line that causes M2.**

  **Two stale comments that hide the gap.** `index.ts:423-425` says
  "ConversationalOnboarding.tsx carries a deterministic backstop for the turn where the
  model forgets", and `reply-resolver.ts:66-68` says "Chips are recovered downstream by
  index.ts's chip-recovery leg". Neither exists: the chip-recovery leg was deleted
  (`index.ts:396`, "THE FORCED-CHIPS LEG USED TO LIVE HERE") and the client has no
  "model forgot" backstop — only the "I don't know" rescue (`:1219-1238`) and the
  stall-breaker after 4 dead turns (`:1257-1290`). Grepped the client for
  `forget|chip-recovery|backstop`.

- **Prior rulings:**
  - Chips on every closed-set question is Ashley's (third ruling of three):
    `scripts/test-onboarding-chips.ts:357-361` — "Actually the quick replies on the
    onboarding are better for all questions."
  - The one-call-per-turn shape is deliberate (`index.ts:420-426`): the forced second
    call was removed because it "was the questionnaire".
  - The `alreadyLive` guard is deliberate (commit `44169b51`, 16 Aug 2026): "present_slot
    is ignored when that slot already has a live, unresolved card on screen… including a
    genuine re-ask arriving while the first card is still unanswered." It fixed chips
    rendering twice. Dropping the *new* card instead of moving it is the unintended half.

- **Fix — a deterministic guarantee in three layers. Chips can be MISSING (safe; the
  composer still works) but never WRONG.**

  1. **Same-leg rule (edge function, `resolveReply`).** A `present_slot` only counts if it
     came from the leg that produced the reply text. When the first leg has no text, strip
     its `present_slot` calls before the follow-up and answer them with
     `{ status: "not shown — ask the question in words and call present_slot again in this
     same turn" }`. Keep `set_slot`/`record_*` as now. The floor (`floorReply`) already
     pins its own question to its own slot.
  2. **Agreement check (client, the actual guarantee).** Give each chippable `SlotDef` an
     `asksPattern` (one regex per slot, in `onboarding-slots.ts`, e.g.
     `mealsPerDay: /\bmeals?\b|times a day.*eat/i`, `sessionDuration: /how long|minutes|\bmins?\b/i`,
     `trainingDays: /which days|what days|days (a|per) week/i`). Before `host.slotCard = key`:
     ```ts
     const q = lastQuestionSentence(host.content)
     if (!def.asksPattern.test(q)) {
       const better = openChippableSlots.filter(s => s.asksPattern.test(q))
       key = better.length === 1 ? better[0].key : undefined   // none → no chips
     }
     ```
     A false negative costs the chips for one turn; a false positive needs the sentence to
     name the wrong topic, which is the rare direction. Fixture for the gate: the H14
     sentence must refuse `mealsPerDay`.
  3. **A re-ask MOVES the card** (fixes (b) and M2). When a new `present_slot(key)` passes
     the check and an older live card for `key` exists, mark the old one superseded and
     attach to the new host. Use a flag (`slotCardSuperseded`), do not delete `slotCard`:
     the stall-breaker counts `priorMessages.filter(m => m.slotCard === canonicalNext)`
     (`:1262`) and would stop tripping. Add the flag to `toDraftMessages` — that mapper
     has dropped a field before (`:133-139`).

  Prefer leg-2's `present_slot` over leg-1's if both survive (reverse the
  `presentedThisTurn` preference). Delete the two stale comments.

- **Class:** MECHANICAL.
- **Ships via:** frontend (layers 2–3) **and** edge function `onboarding-chat` (layer 1).
  Layers 2–3 alone already stop wrong chips; layer 1 restores *right* chips.
- **Gates:** existing — `test:reply-guarantee` (reads the resolver; line 121 asserts a
  round-trip `present_slot` IS merged, and must be updated), `test:onboarding-chips`,
  `test:onboarding-conversational` (only asserts the prompt *says* wrong chips are worse
  than none — source-pinned), `test:onboarding-corrections` (**line 80-81 pins the literal
  `if (alreadyLive && !ws.corrected.has(key)) continue` — it will go red on the correct
  fix; re-anchor on the property**). New: (i) a `test:` case in `reply-guarantee` for
  "leg-1 present_slot + leg-2 text about another slot → no leg-1 chips"; (ii) a `verify:`
  driver on `.onb-harness` (it mounts the real component) with `fetch` stubbed to return
  scripted `{reply, actions}` — assert the card under the age question is not
  `mealsPerDay`, and that a second `present_slot` moves the card to the newest message
  and is inside the viewport.
- **Risk:** an over-tight `asksPattern` hides chips on a correctly-asked question (looks
  like the old "sometimes they come up and sometimes they don't" complaint). Mitigate by
  measuring patterns against the persona transcripts before shipping, and log every
  refusal to the console so the miss rate can be seen.
- **Confidence:** high on the mechanism (ran it; single code path attaches chips to model
  text); medium on which variant fired live.

---

### M1 · "What does creatine actually do, should I take it?" mid-flow is answered in full

- **Status:** CONFIRMED IN CODE (prompt). The deferral rule exists but does not cover
  the question Ashley ruled on.

- **Root cause.** The rule sits under the heading "OFF-TOPIC DURING ONBOARDING" and is
  scoped to one category — `index.ts:290-292`:
  > "Onboarding adjustment for FACTUAL questions only: prefer deferring with a reason —
  > "good one — let me get to know you first and I'll answer that properly once we're set
  > up" — over answering in full. Defer at most TWICE in the whole conversation… NEVER
  > defer anything covered by the scope rules or allergen rules below — those are
  > answered or redirected immediately, every time."

  "FACTUAL questions" is defined by the shared block it follows
  (`_shared/coach-rules.ts:16`): "A quick FACTUAL question (capital of France, ml in a
  cup, what's the weather)". A creatine question is not that. It is on-topic coaching,
  and two neighbouring rules tell the model to answer it:
  - `_shared/coach-rules.ts:37` (interpolated at `index.ts:298` under the heading
    "SCOPE — WHEN TO REDIRECT (never deferred, never softened)"): "You're genuinely useful
    on training and nutrition… Answer substantively and practically".
  - The deferral paragraph's own last sentence: never defer "anything covered by the scope
    rules". The scope rules' first line covers nutrition questions.
  - `VISION.md:113-114` lists **supplements** as on topic.

  So the model did what the prompt literally says. The ruling was about *detours during
  setup*; it was written down as a rule about *off-topic trivia*.

- **Prior rulings:** Ashley's saved notes (quoted at the top; not in the repo). In the
  repo the only trace is the prompt line above, added in commit `1f0c576f` (16 Aug 2026).
  `VISION.md:116-118` covers main-chat off-topic only.

- **Fix (prompt only).** Rename the block "DETOURS DURING ONBOARDING" and make the trigger
  "any question that is not part of answering what you asked — including a perfectly good
  training, nutrition or supplement question". Keep: one warm line + the reason + back to
  the question; at most two deferrals, then answer briefly. Keep the hard exceptions and
  list them by name so they are not swallowed: pain, medication, extreme numbers,
  allergens, and a question *about the question* ("why do you need my weight?") — that one
  must be answered because it is how they decide to answer. Narrow the "never defer
  anything covered by the scope rules" sentence to the redirect cases.
  **Make the promise real:** on a deferral, call `record_context_fact` ("asked during
  setup what creatine does and whether to take it — owed an answer"), so the main chat
  has it. Today "I'll answer that properly once we're set up" is kept by nothing — the
  same shape as H12.

- **Class:** OWNER DECISION — it is "what the app says / how much it asks before acting",
  and the test log puts it to her as decision #6.
  - *Question for Ashley:* "During setup, if someone asks a real fitness question like
    'should I take creatine?', what should the coach do?"
    - A. Answer it properly, then carry on (what it does now).
    - B. Park it with a reason — "good one, let me finish getting to know you and I'll
      answer it properly" — at most twice, then answer briefly. **(your August choice;
      recommended)**
    - C. One-sentence answer now, the full answer after setup.
  - Either way pain, medication and allergy questions are answered at once.
  - If B: should the coach bring the parked question back itself in the first chat after
    setup? (Recommended yes — otherwise it is a promise the app does not keep.)
- **Ships via:** edge function `onboarding-chat`. (Bringing it back in the first chat
  would also touch `chat-gemini` / the opener.)
- **Gates:** `test:coach-rules-sync` (shared block must stay verbatim — do not edit
  `OFF_TOPIC_RULES` itself; edit the onboarding-only paragraph), `test:onboarding-style`,
  `test:onboarding-conversational`. **Nothing checks whether the model obeys**: the coach
  exam runs against `chat-gemini`, not `onboarding-chat`; `scripts/probe-onboarding-tone.mts`
  is manual. New: a source check that the deferral rule names on-topic questions and the
  exceptions; behaviour needs a scripted persona turn on her machine.
- **Risk:** deferring something that should be answered now (a safety question phrased
  casually). The explicit exception list is the mitigation.
- **Confidence:** high.

---

### M2 · After a detour the question is re-asked but its chips are not shown again

- **Status:** CONFIRMED IN CODE.
- **Root cause:** the `alreadyLive` guard, `ConversationalOnboarding.tsx:950-953` (quoted
  under H14). The session-length card was shown, the user typed the creatine question
  instead of tapping, so the card is still unresolved. The coach's re-ask calls
  `present_slot('sessionDuration')`; the guard sees a live card for that slot and
  `continue`s. The only chips are on the earlier message, now above the user's question
  and the coach's long answer.
  The file already knows cards go stale — the composer placeholder ignores a card once the
  coach has asked something newer ("staleCard", `:1525-1532`) — but the card itself is
  never moved.
- **Prior rulings:** deliberate guard, commit `44169b51` (16 Aug 2026), quoted under H14.
  It was written to stop duplicate chip grids, not to pin chips to the first asking.
- **Fix:** layer 3 of H14 — a valid re-ask supersedes the older card and attaches to the
  new message. One live card per slot, always on the newest message that asks it.
- **Class:** MECHANICAL.
- **Ships via:** frontend.
- **Gates:** `test:onboarding-corrections` (pins the literal line — re-anchor),
  `test:onboarding-chips`, `verify:composer`, `verify:onboarding-walk`. New: the stubbed
  `.onb-harness` driver from H14 — ask, detour, re-ask; assert exactly one visible card
  for the slot and that it is below the detour and inside the viewport.
- **Risk:** the stall-breaker and "turns since last confirmation" both read `slotCard`
  off old messages (`:1262`, `:434`) — use a superseded flag, not deletion. A multi-select
  half-filled on the old card keeps its picks (they live in `values`, not in the card).
- **Confidence:** high.

---

### M3 · "Combat / conditioning — Fight-ready fitness" is still offered

- **Status:** CONFIRMED IN CODE. The decision was never built, and never logged in the
  repo.
- **Root cause / where it is still offered:**
  - `src/lib/onboarding-slots.ts:136` — `{ value: 'combat', icon: '🥊', label: 'Combat / conditioning', description: 'Fight-ready fitness' }` in `STYLE_OPTIONS`.
  - `offeredOptionsFor` — the choke point built for exactly this — filters nothing
    (`onboarding-slots.ts:916-918`: "Nothing is filtered today. Kept as the single choke
    point so that if a value ever needs hiding until the engine can honour it… it happens
    in one place").
  - `src/components/ProfileScreen.tsx:1149` — the Style picker passes `STYLE_OPTIONS`
    directly.
  - `supabase/functions/chat-gemini/index.ts:1217-1218` — `propose_style_change` enum
    `["functional","bodybuilding","combat","hybrid"]` and its description "combat =
    fight-ready conditioning, heavy main lifts". So the coach can still move someone onto
    it. `ChatAssistant.tsx:3521` resolves the value against `STYLE_OPTIONS`.
- **What else references it (so removal is safe):**
  - Engine: `exercise-plan.ts:309-315` (`STYLE_CONFIGS.combat` — 3-5 main lifts, 75/60/45s
    rests, required `core`+`carry`), `:1213` (supersets on any length), `:1644-1650` (its
    own split names). `exercise-db.ts` carries 85 `'combat'` style tags.
    `dev-constraint-audit.ts:112,177`. `types.ts:263`.
  - Gates and measurements that build combat plans on purpose: `test:quality`/`test:audit`
    grids (the 9,216 profiles include it), `test:pattern-floor:184-187` (its four pinned
    offenders are all combat), `test:rest-floors`, `test:block-phases`, `test:frozen-weeks`,
    `test:rehab-order`, `test:swap-style`, `test:pending-actions:539`.
  - **So: stop OFFERING it; leave the type, the engine config, the catalogue tags and the
    gates alone.** Existing combat profiles then keep generating exactly as today, which is
    the "must handle existing profiles" clause.
- **Prior rulings:** Ashley's saved notes, quoted at the top. Not in the repo. Note
  `docs/plans/change-your-style-in-chat.md:45` still shows "Training style: Combat /
  conditioning" as a receipt example.
- **Fix:**
  1. `offeredOptionsFor`: hide `combat` for `trainingStyle`. That removes it from the
     chips (`SlotChipsCard.tsx:64`) and from the catalogue the model is sent
     (`onboarding-slots.ts:1201`), in one place.
  2. `applySlot` currently validates with `isOneOf(STYLE_OPTIONS)`, which still accepts
     `combat` if the model guesses it for "I box". Validate NEW answers against the
     offered set; keep the wider set only for reading stored values.
  3. Profile: offer the offered set **plus the person's current value**, so someone
     already on combat sees their style named and can keep it, and nobody else can pick it.
  4. `chat-gemini`: drop `combat` from the enum and description; in `ChatAssistant` refuse
     a style that is not offered.
  5. One prompt line for the person who says "I fight / box": pick the closest style
     (functional or hybrid), say plainly there is no fight-specific programme yet, and
     `record_context_fact`. Wording is hers.
- **Class:** MECHANICAL to apply (the decision is made). One small OWNER DECISION inside
  it: *"When a new user says they train for boxing or MMA, what should the coach say?"*
  A: put them on Functional and say a fight-specific plan isn't built yet (recommended —
  honest, VISION "only offer what's built"). B: say nothing and map quietly.
- **Ships via:** frontend + edge function `chat-gemini` (enum). `onboarding-chat` only if
  the prompt line in step 5 is added.
- **Gates:** will go red by design and need re-anchoring, not weakening:
  `test:onboarding-slots:242` ("offeredOptionsFor hides nothing today"),
  `test:onboarding-chips` (option counts / shape), possibly `verify:onboarding-walk` and
  `coach-parity` (screen options vs tool enum). New: "no surface offers a style the picker
  hides" — derive from `offeredOptionsFor`, check the Profile picker and the chat enum
  against it, and a fixture proving an existing `combat` profile still loads, displays and
  regenerates.
- **Risk:** a resumed onboarding draft holding `combat` would fail the tighter validation
  and be re-asked (acceptable; say so). Do not touch `STYLE_CONFIGS` — the quality floor
  and four gates depend on it.
- **Confidence:** high.

---

### M4 · Tapping a row under "Tap anything above to change it" looks dead; reply lands above the summary, one duplicate per tap

- **Status:** CONFIRMED IN CODE.
- **Root cause:** three things, all in `ConversationalOnboarding.tsx`.
  1. **Order.** The review card is rendered AFTER the whole transcript:
     `messages.map(...)` at `:1668-1725`, then `{reviewOpen && (<Card …>` at `:1760`.
     `handleEditSlot` appends its prompt to `messages` (`:1402-1414`), so it renders
     *above* the card it was tapped from.
  2. **Scroll.** The only scroll is "stick to the bottom" (`scrollToBottom`, `:679-687`,
     driven by a ResizeObserver on the content, `:689-695`). The bottom is the review
     card. For Sam the card is ~20 rows of ≥32px plus notes and the button, taller than
     the screen, so the new chips sit off the top.
  3. **No dedupe.** `handleEditSlot` guards only on `busy` (`:1399`). Every tap appends
     another "Sure — pick a different …" message with another card.
  Secondary: answering the re-opened card goes through `handleResolveSingle` →
  `sendMessage` (`:1319`), a full model round trip whose reply (possibly a new question)
  is also appended above the still-open review.
- **Prior rulings:** none found for the placement (grepped BACKLOG for `handleEditSlot`,
  "Tap anything above", "review card"). Keeping the slot `confirmed` while editing is
  deliberate (`:1382-1397`) so Generate is not silently disabled — keep that.
- **Fix:** an `editingKey` state.
  - While it is set, hide the review card (and gate the auto-open effect at `:719-735` on
    `!editingKey`, or it reopens at once because `readyToGenerate` stays true). The edit
    prompt is then the last thing on screen; force the scroll (`scrollToBottom(true)`).
  - A second tap on the same row does nothing new; a tap on a different row replaces the
    open edit card instead of stacking.
  - On answer: write through `applySlot`, clear `editingKey`, show the card again with the
    new value. Skip the model round trip unless the edit opened a new required question
    (equipment → working lifts); the card's "Still to answer:" line (`:1852-1859`) already
    names those.
- **Class:** MECHANICAL.
- **Ships via:** frontend.
- **Gates:** nothing covers this path. `test:no-question-beside-generate` touches
  `slotCardEditing` only as data. `verify:onboarding-walk` and `verify:composer` never open
  the review. New `verify:` driver on `.onb-harness`: seed a complete draft, open review,
  tap a row → the edit control is inside the viewport; tap again → still one control;
  answer → the row shows the new value and Generate is reachable. (CLAUDE.md: "A message is
  only shown if it is on screen where the tap was.")
- **Risk:** hiding the card while editing must never strand the user — clearing
  `editingKey` on answer, on a different-row tap, and on a plain "cancel" must all be
  covered, since onboarding owns the whole screen.
- **Confidence:** high.

---

### M5 · "40 minutes tops, hard stop" → stored as the 30–45 bucket (storage side)

- **Status:** CONFIRMED IN CODE as a schema limit, not a mapping error. 30–45 is the right
  bucket; the app has nowhere to put "40".
- **Root cause:**
  - Session length is a four-value closed set — `onboarding-slots.ts:101-106`:
    `'30-45' | '45-60' | '60-90' | '90+'` (type at `types.ts:266`). The slot validates
    with `isOneOf(DURATION_OPTIONS)` (`:781`), so a number can never be stored.
  - What the bucket means to the engine — `session-duration.ts`: target midpoint
    `'30-45': 37 * 60` (`:28`), minimum `30 * 60` (`:51`), and the hard ceiling
    `'30-45': 45 * 60` (`:72`, "This is the number nothing may exceed"). So Sam's plan
    aims at 37 minutes and is allowed to reach 45. The add-exercise warning reads the same
    ceiling: `TodayPanel.tsx:547` `capMinutes = getSessionMaximumSeconds(...)/60`.
- **Could a precise cap be stored with the existing schema? Not safely.** The column is
  free text with no CHECK — migration `20260709190815`:
  `ADD COLUMN session_duration_preference text DEFAULT '45-60'` (the only migration that
  names it) — so the database would accept `"40"`. But every reader indexes a
  `Record<SessionDuration, …>` and falls back to the 45–60 row on a miss
  (`session-duration.ts:35,58,76`; `App.tsx:887` `|| '45-60'`; `exercise-plan.ts:1693`
  switch). A stored "40" would silently become a 45–60 plan — longer, the opposite of what
  was asked. Nothing would fail.
- **Prior rulings:** time cap kept and shortfalls explained (CLAUDE.md "The time cap is
  kept"); session length rebuild ruling 16 Sep 2026; "I only have 45 minutes today" is
  today-only (`propose_session_shorten`). None on a precise standing cap (grepped
  `session_cap`, `hard stop`, `minute cap`).
- **Fix options:**
  - A. New nullable column `session_cap_minutes`, read in ONE function
    (`getSessionMaximumSeconds(profile)` → `min(bucketMax, cap)`; budget →
    `min(bucketBudget, cap − margin)`), a volunteered-only onboarding slot like the load
    ceilings (never asked; number must be in the user's words — copy
    `ceilingIsInUserWords`). Needs a migration.
  - B. No migration: say it honestly at capture — "closest setting is 30–45: I aim for
    about 37 and never go past 45" — and `record_context_fact`. The engine still allows 45.
  - C. A new bucket. No migration, but every `Record<SessionDuration>` table and the
    9,216-profile grid gain a row. Not recommended.
- **CSCS note (delegated call):** a hard stop is a real constraint, and 45 against a
  stated 40 is a 12% overrun on the days that reach the ceiling. The 37-minute target
  already sits under 40, so most days fit; the breach is the ceiling and every warning
  measured against it. A coach would honour the number, so A is the right end state.
- **Class:** OWNER DECISION (needs a migration, and changes what onboarding captures).
  - *Question for Ashley:* "When someone gives an exact limit like '40 minutes, hard
    stop', should the app keep that exact number?"
    - A. Yes — store it and never plan past it. Needs a database change. **(recommended)**
    - B. Not yet — keep the four ranges, but have the coach say plainly that the closest
      setting can run to 45.
    - C. Leave as is.
- **Ships via:** B = edge function `onboarding-chat` (prompt). A = migration + frontend
  (+ `chat-gemini` if `propose_session_length` should accept minutes). Per CLAUDE.md, the
  onboarding INSERT in `App.tsx` is column-by-column and must name any new column.
- **Gates:** `test:session-length`, `session-length-change`, `test:quality` time-fit,
  `verify:setup-answers` §6. New for A: a constructed over-cap day proving nothing exceeds
  the stated cap, on a fixture where the cap actually binds.
- **Risk:** A tightens the tightest sessions; CLAUDE.md's "never below three exercises"
  floor and the pattern floor must still hold at 40 — measure, do not assume.
- **Confidence:** high.

---

### M6 · Tour step 7 "Your turn — log a set" logs a real set and starts a session

- **Status:** DELIBERATE DESIGN — with a real gap the design did not consider.
- **Root cause (what happens, VERIFIED):**
  - The tour is an overlay over the real screen; the spotlight lets the real ✓ take the
    tap. `AppTour.tsx:26-30`: "THE TAPS ARE REAL… the set stop advances because the row
    actually saved. Nothing is simulated… the set logged at stop 7 is a genuine week-1
    calibration set, which is the point rather than a side effect."
  - The step: `app-tour-steps.ts:123-125` — teaser "Your turn — log a set.", copy
    "Logged — that easy. Leave the fields blank and I'll take the prescribed numbers".
    So the row is saved at the PRESCRIBED weight and the bottom of the rep range, by
    someone who lifted nothing.
  - Saving any set opens a session: `useActiveSession.tsx:434-440` — "Forgiving by design:
    a logged set with no session open silently opens one" →
    `patchRecord({ status: 'running', … }); setStatus('running')`.
  - That path does not call `setStartedAtIso` (only `startSession` does, `:457`), and the
    pill computes `startedAtIso ? now − startedAt : 0` (`BottomDock.tsx:172`). This is very
    likely M7's "Session running · 0:00" (M7 belongs to another tracer; flagged as a lead).
- **Prior rulings:**
  - `BACKLOG.md:13972` — "The set at stop 7 is a genuine week-1 calibration set — the
    point, not a side effect." ("From Ashley's design handoff".)
  - Commit `03146cf9` (27 Aug 2026): the logging capability "is now asserted against the
    tour, which teaches it by having the user log a real set."
  - Ashley ruled on this stop's wording on 24 Sep 2026 without objecting to the real log
    (CLAUDE.md, "a tour line is only true on the day it is shown").
  - Against it, from the same file family — `useActiveSession.tsx:430-432`: "the app must
    not record work off an action that logged nothing."
- **Does the complaint stand?** Yes, as a gap. The design assumes the user is about to
  train. The tour starts the moment the plan is built, whatever the hour (Sam: 21:53). The
  copy never says the set counts. The result is a recorded set nobody lifted, at the app's
  own guess, in the calibration week whose job is to replace that guess; an open session;
  and (INFERRED, for the Home tracer) a likely source of M16's "New PR this week: Standing
  Band Hip Abduction at 0kg" and the day-one streak.
- **CSCS view (delegated):** a calibration set must be a set that was performed. One
  phantom set is small, but it "confirms" the estimate it was meant to test and it is the
  first PR the app celebrates. A coach would not write down a set the client did not do.
- **Fix options:**
  - A. Keep the real tap, say so, and offer the way out on the very next card:
    "That one's real — it's in today's log. Not training right now? **Undo it**" (delete
    the row; if no sets remain, return the session to idle). Smallest change.
    **(recommended)**
  - B. Keep the real tap but remove the set automatically when the tour ends, unless the
    user logs a second set.
  - C. Make the stop a look-don't-touch stop on days/times nobody is training.
- **Class:** OWNER DECISION — *"The tour has people tick off a real set. If they're on the
  sofa rather than in the gym, that leaves a set in their history they never did. What
  should happen?"* A / B / C above, A recommended.
- **Ships via:** frontend.
- **Gates:** `test:app-tour` (targets and honesty scan — any new line must live in
  `app-tour-steps.ts` to be scanned), `verify:tour` (stub targets; asserts "the set stop
  advances only on a real save"), `verify:tour-real`. New: after the tour's Undo the set
  log is empty and session status is idle, read from the store, not the screen.
- **Risk:** an Undo must follow CLAUDE.md's rule ("An undo is a write, and it asks before
  it offers") and must not delete a set the user logged for real afterwards.
- **Confidence:** high on behaviour; the PR/streak link is a lead.

---

### L1 · Confirmation ticks for typed answers, none for chip answers

- **Status:** DELIBERATE DESIGN.
- **Root cause:** `applySlot(…, showReceipt)` — `ConversationalOnboarding.tsx:440-451`:
  "a receipt is owed when a MAPPING happened… When they tapped a chip, no mapping
  happened: they picked the value, and their own message bubble already says exactly what
  was recorded." Taps pass `false` (`handleResolveSingle` `:1317`, `handleResolveMulti`
  `:1328`, numeric card `:1358` unless a unit was converted). Model `set_slot` passes
  `true` (`:854`).
- **Prior rulings:** commit `b48616b9` (16 Aug 2026), answering Ashley's "it still reads
  very much like a questionnaire": "Confirmation lines only where a MAPPING happened."
  A session design choice made for her complaint, not a ruling she gave on ticks.
- **Does it stand?** Mildly. The inconsistency reads as "some answers saved, some not".
  The review card lists everything before Generate, which is the real safety net.
- **Fix:** none recommended. If she wants consistency: ticks everywhere, or ticks only
  when the stored value differs from what the user literally typed.
- **Class:** OWNER DECISION (appearance). Recommend leaving it.
- **Ships via:** frontend. **Gates:** `test:onboarding-conversational`, `test:silent-writes`.
- **Confidence:** high.

### L2 · Ticks carry no units ("Heaviest dumbbells — 24", "Height — 178", "Weight — 82")

- **Status:** CONFIRMED IN CODE.
- **Root cause:** `displayValueFor` returns `String(v)` for a numeric slot
  (`ConversationalOnboarding.tsx:143-156`), and the receipt is
  `` `${def.shortLabel} — ${displayValueFor(...)}` `` (`:479`). `SlotDef` has no unit. The
  numeric card has its own private unit map (`SlotNumericCard.tsx:43-50`) that also omits
  the three load ceilings. The same unit-less string feeds the review rows (`:1780`) and
  the `filled` list sent to the model (`:772`).
- **Prior rulings:** CLAUDE.md, "A NUMBER NEVER REACHES A SCREEN WITHOUT ITS UNIT… the
  KIND travels with the value". Profile already says "Heaviest dumbbell (per hand)"
  (`ProfileScreen.tsx:1031`).
- **Fix:** add `unit` to `SlotDef` (`age` → none or "years", `heightCm` → "cm",
  `weightKg` → "kg", three lifts → "kg", `maxDumbbellKg` → "kg per hand",
  `maxSingleImplementKg`/`maxImprovisedKg` → "kg"); `displayValueFor` appends it;
  `SlotNumericCard` reads the same field instead of its own map.
- **Class:** MECHANICAL. **Ships via:** frontend.
- **Gates:** `test:onboarding-slots`; new check: every numeric slot's displayed value
  carries its unit (call `displayValueFor`, do not grep for it).
- **Risk:** the model now sees "82 kg" in ALREADY ANSWERED — harmless, arguably better.
- **Confidence:** high.

### L3 · Wording: "Nut-free will be kept out of every meal", "type what you'd like foods to avoid to be instead", "pick a different equipment"

- **Status:** CONFIRMED IN CODE — three template strings.
- **Root cause:**
  - `:1085` `` `✓ Flagged as a hard restriction, not just a preference — ${labels} will be kept out of every meal.` ``
    where `labels` is the diet TAG's label ("Nut-free"), not the food. So the sentence says
    the absence will be kept out.
  - `:1409` `` `Sure — type what you'd like ${def.shortLabel.toLowerCase()} to be instead.` ``
    → "…foods to avoid to be instead."
  - `:1410` `` `Sure — pick a different ${def.shortLabel.toLowerCase()}.` `` → "a different
    equipment", and equally "a different training days", "a different niggles",
    "a different meals a day".
- **Prior rulings:** for the first string, the allergen-honesty rule the coach is held to
  (`_shared/coach-rules.ts:44+`): say what the app did ("your plan excludes X"), never a
  guarantee. The app's own receipt says "will be kept out of every meal" — a guarantee, in
  the app's voice, on the same screen as the "we can't check brands or cross-contamination"
  note (`SlotChipsCard.tsx:169-175`). This is the deterministic twin of H13.
- **Fix:** per-slot `editPrompt` strings on `SlotDef` (written, not templated); a per-tag
  food phrase for the allergen receipt ("peanuts and tree nuts") and wording in the
  allowed shape, e.g. "✓ Nut-free filter on — meals are built without anything tagged as
  peanuts or tree nuts. It's a tag check, so still read labels."
- **Class:** the two edit prompts are MECHANICAL. The allergen receipt is
  **SAFETY-ADJACENT + OWNER** (allergen band: what the app claims) — plan first, her words.
- **Ships via:** frontend.
- **Gates:** `test:coach-voice` holds app-written sentences; none reads these three. New:
  render every slot's edit prompt and fail on "a different <plural>"/"to be instead";
  scan the allergen receipt with the same banned-claim patterns the exam uses.
- **Confidence:** high.

### L4 · Coach promised "a focused, high-intensity dumbbell circuit"; said "you know your way around a gym" to a home trainer

- **Status:** PARTLY (model wording; the prompt permits it).
- **Root cause:** the onboarding prompt asks for "a one-line warm recap of the shape of
  what you'll build" (`index.ts:307`) and gives the model nothing about what the plan will
  actually contain, and no ban on naming a training format. `APP_REALITY` (`:295`) covers
  screens, not plan content. The engine does the opposite of what was promised for fat
  loss — `goal-policies.ts:204-209`: "not to turn the session into circuits"; its own coach
  note: "Weights stay real weights… conditioning is appended on top, never substituted for
  lifting." (The only "circuits" in `exercise-plan.ts` are optional conditioning finishers,
  `:4770`, `:4787`.) "Your way around a gym" is the model reading "intermediate, three
  years" and ignoring the equipment answer it was given.
- **Prior rulings:** VISION.md:124-125 "Never claims a capability it doesn't have";
  Ashley's saved notes: the pre-plan narration "describes the SHAPE only — phases, days,
  emphasis — never specific exercise names" and "must read phase names from the engine's
  own definitions, never from the chat prompt".
- **Fix:** prompt — the recap may name only facts already recorded (days, length, goal,
  where they train); never a session format (circuit, HIIT, superset, Tabata, AMRAP) or an
  exercise; never "gym" unless equipment is full gym. Better: send the engine's own
  one-line goal note (`GOAL_POLICIES[goal].coachNote`) in `state` so the recap quotes the
  engine instead of improvising.
- **Class:** MECHANICAL (applying a standing rule). Whether the model obeys is unguarded.
- **Ships via:** edge function `onboarding-chat` (+ frontend if the goal note is added to
  `state`).
- **Gates:** `test:onboarding-style`, `test:onboarding-conversational` (source). New:
  source check for the rule; a banned-format scan of the recap in the persona probe.
- **Confidence:** medium (prompt gap is certain; the live sentence is model behaviour).

### L5 · "3 meals and one snack" ticked as "Meals a day — 3 meals"; the plan did include the snack

- **Status:** CONFIRMED IN CODE. The snack was the default, not the captured answer.
- **Root cause:** `includeSnacks` starts `true` (`onboarding-slots.ts:460`) and is a
  never-blocking slot (`:951`), so it is written to the profile whether or not anyone
  recorded it (`assembleProfile` `:1090`). Had the model called
  `set_slot(includeSnacks, true)` a receipt "✓ Snacks — Snacks too" would have printed
  (`applySlot` shows one on a first confirmation even when the value equals the default,
  `:464-474`). It did not, so only the meals tick appeared. The review card hides the row
  too — it lists only required or confirmed slots (`:1767-1768`).
  **The dangerous direction is the mirror:** "3 meals, no snacks" with the same missed
  call gives a plan WITH a snack and nothing on screen saying so.
- **Prior rulings:** prompt: "NEGATIONS ARE ANSWERS… 'No snacks' → the matching false
  option" (`index.ts:268`); "ONE ANSWER PER set_slot, AND ONE PER THING THEY TOLD YOU"
  (`:264`).
- **Fix:** (1) deterministic backstop beside the allergen one, on typed text:
  `/\bno snacks?\b|without snacks?|meals only/` → false;
  `/\b(and|plus|with|\+)\s+(a|one|two|\d)?\s*snacks?\b/` → true; print the receipt.
  (2) always show the Snacks row on the review card, since it carries a real default.
- **Class:** MECHANICAL. **Ships via:** frontend.
- **Gates:** `test:onboarding-slots`; new fixtures "3 meals and one snack" / "3 meals, no
  snacks" → value and receipt.
- **Confidence:** high on the mechanism; that the model skipped the call is inferred from
  the missing receipt.

### L6 · Body-fat goal inferred but stated, not confirmed; two near-identical goals saved from one sentence

- **Status:** PARTLY. The duplicate is CONFIRMED IN CODE. The "not confirmed" half is
  DELIBERATE for a goal that names its own direction.
- **Root cause:**
  - *Not confirmed.* Two prompt rules, the later one wins for this case. `index.ts:281`:
    "CONFIRM it in one line before calling set_slot for fitnessGoal… Never write an
    inferred goal unconfirmed." `index.ts:285` (commit `31563bf6`, 27 Aug 2026, from
    Ashley's phone): "A TARGET THAT NAMES ITS OWN DIRECTION NEEDS NO CONFIRMATION. 'Get to
    12% body fat'… set_slot straight away… Asking 'does that sound right?' about a goal
    they just stated plainly reads as not having listened". But `record_goal`'s own tool
    description still says "AFTER the user has confirmed any inference" (`index.ts:119`) —
    the two were never reconciled.
  - *Silent write.* `record_goal` queues the goal and pushes nothing to the transcript
    (`ConversationalOnboarding.tsx:894-908`), and the review card lists slots only. So a
    recorded goal is invisible until Profile — against this file's own contract, "never a
    silent write" (`:68-71`).
  - *Duplicates.* (i) Client dedupe is exact text only: `!ws.pendingGoals.some(g =>
    g.displayText === displayText)` (`:897`). (ii) The model is never told what it already
    recorded — `buildState` sends `slotCatalog`, `filled`, `remaining` and nothing else
    (`:762-780`) — so a later turn can record the same goal reworded. (iii) The tool's
    metric is `body_weight_kg | directional` only (`index.ts:123`); a body-fat target can
    only be "directional", so one sentence can yield a directional goal and a second,
    near-identical one. (iv) The flush inserts every queued goal as its own row
    (`App.tsx:1723-1741`; `createGoal` has no dedupe, `memory-store.ts:205-231`).
    (Cross-leg duplication is NOT the cause: `mergeCalls` drops a second `record_goal`
    from a later leg because its key is `(name, slot_key=undefined)`,
    `reply-resolver.ts:188-191` — which also silently drops a legitimately different
    second fact from that leg; worth knowing.)
- **Prior rulings:** as quoted. Ashley's saved notes: "Confirm the inference rather than
  assume it" (Aug), narrowed by the 27 Aug rule.
- **Fix:** (1) dedupe on `rawPhrase` as well as text — two goals from one sentence share
  it — keeping the measurable one; one `body_weight_kg` goal at a time (replace).
  (2) Send already-noted goals/facts in `state` and list them under ALREADY ANSWERED.
  (3) A receipt for a recorded goal ("✓ Goal — get to 12% body fat") and a Goals line on
  the review card with a remove control. (4) Numbers in `target_value`/`baseline_value`
  must appear in the user's own words that turn (copy `ceilingIsInUserWords`).
  (5) Reconcile the `record_goal` description with `index.ts:285`.
- **Class:** MECHANICAL for 1, 2, 4, 5. Item 3 adds an on-screen line — small OWNER call
  (recommended: yes, it is the existing "never a silent write" rule).
- **Ships via:** frontend (1–4) + edge function `onboarding-chat` (2, 5).
- **Gates:** `test:memory`, `test:silent-writes`, `test:onboarding-handover`. New: two
  `record_goal` calls with one `raw_phrase` → one queued goal.
- **Confidence:** high on the code; medium on which duplicate route fired.

### L7 · Tour step 2 "Home shows; it never logs" vs step 3 water, steps and weigh-in "are logged right here"

- **Status:** CONFIRMED IN CODE. Step 2 is the stale one.
- **Root cause:** `app-tour-steps.ts:82` (hero): "…Start session hands you to Exercise,
  where every set gets logged. Home shows; it never logs." `app-tour-steps.ts:90` (tiles):
  "Water, steps and your weigh-in are logged right here." Home does log all three —
  `Dashboard.tsx:322` "WATER AND STEPS ARE LOGGED HERE NOW", `:337-350`, `:791-793`.
  History: "never logs" was written 3 Sep 2026 (`1405a77c`) when Home was a read-out;
  "logged right here" arrived 6 Sep (`d066db71`, "Home becomes the day"). The first
  sentence was never revisited. The comment above step 3 (`:86-89`) is stale as well.
- **Why the gate missed it:** `test:app-tour` §9 treats "Home shows; it never logs" as part
  of a signpost and skips it (`scripts/test-app-tour.ts:627-632`), and it matches
  *positive* claims of an action; a negative claim ("never logs") is not parsed.
- **Prior rulings:** `app-tour-steps.ts:55-57` "Copy and order are FINAL — signed off on the
  prototype". CLAUDE.md: the tour is "GUARDED for this class of claim" — this is a hole in
  that guard.
- **Fix:** scope the sentence to what is true: "…where every set gets logged. Home shows
  your training; it never logs a set." (or drop the sentence). Fix the stale comment.
- **Class:** MECHANICAL (a factual contradiction); the exact words are hers to approve
  since the copy is marked final.
- **Ships via:** frontend.
- **Gates:** `test:app-tour` (extend §9: no stop may say a tab "never logs"/"doesn't log"
  while that tab's own files call a log function — derived from the same tab→files map),
  `verify:tour-real`.
- **Confidence:** high.

### L8 · Seconds after sign-up at 21:53: "You're about 1850ml behind on water for this time of day"

- **Status:** CONFIRMED IN CODE (my part only: does Home know the account is new?).
- **Answer: Home knows, and the water rule is not told.** `Dashboard` receives
  `planCreatedAt={mesocycleCreatedAt ?? profile.created_at}` (`App.tsx:2995`, `:3093`) and
  `dashboard-data.ts:401` derives `planStartStr` from it — already used to keep pre-plan
  days out of the streak and plan-week counts (`:380-402`). But `CoachTipContext` has no
  such field (`coach-tips.ts:19-47`), and `water_pace` pro-rates from 08:00 whatever
  happened (`coach-tips.ts:122-140`): at hour 21, `expected = target × 13/14`; a 2,000 ml
  target and 0 logged gives 1,857 → "1850ml". The hour itself is read from the machine
  clock (`dashboard-data.ts:491`).
- **Prior rulings:** the rule is Ashley's own example (`coach-tips.ts:101`); the file's
  header: "If nothing specific and true can be said, show nothing". Being "behind" on a day
  that started 60 seconds ago is not true.
- **Fix (for the pacing tracer to fold in):** pass the plan-start hour when
  `planStartStr === todayStr` and pro-rate from `max(8, startHour)`, or simply skip
  `water_pace` on the plan's first day.
- **Class:** MECHANICAL. **Ships via:** frontend.
- **Gates:** `test:dashboard` reads `coach-tips`; new case: plan created today at 21:50 →
  no water tip.
- **Confidence:** high.

---

## For the equipment tracer — how the free-text answer becomes a tier

**It is a model-extracted enum. There are no keyword rules.**

1. The model is sent the four tier values and told to map free text itself. The prompt
   even hard-codes the example that produced Sam's result — `onboarding-chat/index.ts:261`:
   > "They answered in free text and the mapping is CERTAIN ("just some dumbbells at home"
   > → equipment=minimalist, because minimalist already assumes dumbbells, kettlebells,
   > bands, a pull-up bar and a weighted bag; home_gym assumes a barbell, a rack and a
   > bench on top of all that) → call set_slot with the exact allowed value."
2. The client's only check is membership — `onboarding-slots.ts:755`
   `validate: isOneOf(EQUIPMENT_OPTIONS)`, applied in `applySlot`
   (`ConversationalOnboarding.tsx:462`). Any of the four values passes.
3. The four options (`picker-options.ts:20-25`): `home_gym` = "Barbell, rack, bench,
   dumbbells, kettlebells, bands, pull-up bar, weighted bag"; `minimalist` = "Dumbbells,
   kettlebells, bands, pull-up bar, weighted bag — no barbell or bench". "Dumbbells and a
   flat bench, no barbell or pull-up bar" fits neither: the only tier with a bench assumes
   a barbell and rack. The model took the no-barbell one, as the prompt's example teaches.
4. The receipt shows the tier's NAME only — "✓ Equipment — Minimalist"
   (`displayValueFor` returns the label, `:151-154`) — never what the tier assumes. So the
   promise that the user "can catch a wrong mapping" (`index.ts:274`) is hollow here: there
   is nothing on screen saying "this assumes kettlebells, bands, a pull-up bar and a bag,
   and no bench".
5. "24kg" is separate and worked: `set_slot(maxDumbbellKg=24)`, allowed only because the
   message contains both "dumbbell" and "24" (`onboarding-ceiling-capture.ts:52-62`).
6. The bench, "no pull-up bar", "no bands" have **no slot at all**. At best they become a
   `record_context_fact`, which is memory only and never read by the plan. The one prompt
   rule about odd kit (`index.ts:287`, "Mixed equipment access") is about gym-some-days,
   not about owning part of a tier.
7. Standing ruling: Ashley chose "FIX THE WORDS" over a checklist on 9 Sep 2026
   (`onboarding-slots.ts:119-122`). The tester's decision #1 would reopen that.

---

## Adjacent findings (not on my list; for whoever owns them)

- **The onboarding prompt contradicts itself on allergens.** The shared
  `ALLERGEN_HONESTY_BLOCK` (interpolated at `index.ts:300`) says "Only SEVEN allergens have
  any real tag check… Celery, sesame, mustard, lupin, and sulphites have NO tag mechanism
  at all". Four lines later the onboarding-specific text says those five "now have real
  tags too… All twelve are enforced" (`index.ts:304`). One of them is stale.
  SAFETY-ADJACENT — needs a plan, and `test:coach-rules-sync` holds the shared block
  verbatim against `chat-gemini`.
- **M7 lead:** a set logged without Start workout never sets `startedAtIso` in React state
  (`useActiveSession.tsx:434-441` vs `:457`), so the pill reads 0:00.
- **`mergeCalls` drops every later-leg `record_context_fact`/`record_goal`**, even a
  different one, because its dedupe key is `(tool, slot_key)` and those tools have no
  `slot_key` (`reply-resolver.ts:188-191`). A volunteered fact can be lost silently.

---

## Shared choke points

1. **`alreadyLive` drops a re-asked card instead of moving it**
   (`ConversationalOnboarding.tsx:950-953`) → M2 and the second half of H14. One fix.
2. **Chips and question text come from different model legs with no agreement check**
   (`reply-resolver.ts` merge + `:969-973` host) → first half of H14. The stubbed
   `.onb-harness` driver built for this also covers M2 and M4.
3. **`displayValueFor` + `shortLabel` templating** → L2 (no units), L3 (two of the three
   strings). A `unit` and an `editPrompt` on `SlotDef` close both.
4. **The model's extra tool calls are trusted without a visible receipt or a memory of
   what was already recorded** → L5 (snack not recorded, default hides it), L6 (silent,
   duplicated goals). Same family as H12.
5. **Two August rulings were never written into the repo** → M1, M3. Process, not code.
6. **The tour's real set** → M6, and probably M7 / M16 (first-day PR and streak).

## Suggested build order

1. **M2 + H14** together (frontend first: card-move + agreement check; then the
   `onboarding-chat` same-leg rule). Build the stubbed `.onb-harness` driver first — it is
   the only way to see these without a model. Re-anchor `test:onboarding-corrections:80`.
2. **M4** (same file, same driver).
3. **L2, L3 (edit prompts), L5, L6 dedupe** — small, frontend, mechanical.
4. **L7, L8** — two-line fixes with a gate case each.
5. **M3** — once the BACKLOG entry for the August ruling is written; frontend +
   `chat-gemini` deploy.
6. **M1, L4** — one `onboarding-chat` prompt pass after Ashley confirms M1.
7. **M6** — after her answer.
8. **M5** — honest wording now (rides with step 6); the exact-minutes column only on her
   word, since it needs a migration.
9. **L3 allergen receipt** — plan first (safety-adjacent), with the H13 owner.

Deploys: steps 1, 5, 6 need an edge-function deploy (`onboarding-chat`; `chat-gemini` for
M3). Everything else ships with the web build. Only M5 option A needs a migration.

## Owner decisions, in one place

| # | Bug | Question | Recommended |
|---|---|---|---|
| 1 | M1 | Park a real fitness question during setup, or answer it? | Park it with a reason, twice at most (her August choice) — and bring it back after setup |
| 2 | M6 | The tour's "log a set" writes a real set. Keep, undo, or make it look-only? | Keep it real, say so, offer Undo on the next card |
| 3 | M5 | Keep an exact "40 minutes" limit? | Yes, with a database change; honest wording until then |
| 4 | M3 | What does the coach say to someone who trains for boxing/MMA? | Closest style + plainly "no fight-specific plan yet" |
| 5 | L3 | Wording of the allergy tick (it currently promises "kept out of every meal") | "Filter on… it's a tag check, still read labels" |
| 6 | L1 | Ticks for tapped answers too? | Leave as is |
| 7 | L6 | Show a tick and a review line when a goal is noted? | Yes |
