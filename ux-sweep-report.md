# UX Sweep — Findings Report (2026-08-08)

**Method.** Live use of the app in a fresh browser tab at 375×812 (and 375×667 for scroll tests) against the dev server, on the real dev profile `81073dc9-2246-4b88-99c2-03d3db714fd2` (has history: Deadlift PR 67.5kg, Friday session logged). In parallel, nine code-audit agents traced every area's UX paths with file:line evidence. Findings marked **[live]** were reproduced by using the app; **[code]** were established by tracing the shipped code; many are both.

**Environment caveats** (not app bugs, but they limited some live checks):
- Radix dropdown menus (settings gear, exercise ⋯, day ⋮) do not open from synthetic events in the hidden browser pane, so Profile dialog / History dialog / Timers were exercised in earlier verified rounds + by code audit, not re-clicked live this round.
- The dev clock (used to reach a training day, Monday 2026-08-10) freezes `getAppNow`, so countdown/count-up values ("0m duration", static rest timer) were dev artifacts — excluded unless the defect exists without the dev clock.
- The hidden pane throttles `setTimeout`, making the typewriter crawl. Not a user bug per se, but it exposed that the reveal is tick-chained: a real user who backgrounds the app mid-reply returns to a still-typing message (the deadline-anchored timers don't have this problem).

**Test data written and cleaned up:** 2 sets + 1 session (dev-clock Monday), 5 phantom chat-logged sets + 1 session (Saturday), 1 cardio log, 41 grocery items, 16 chat messages, 1 cod dislike fact, breakfast/lunch swaps (reverted via the app's own paths), PR-cache squat entry, dev-clock/reveal-speed/chat-cache localStorage keys. Verified restored: porridge breakfast, cod lunch, empty grocery list, original PR cache.

---

## 0. Data loss & corruption (fix these first, regardless of how small they look)

1. **Confirmed meal swaps are never persisted — they silently revert on reload.** [live + code, broken]
   I swapped breakfast on the Meals tab and lunch via a chat proposal the user explicitly Confirmed (receipt: "Swapped lunch → Tuscan Grilled Chicken…"). Both apply on screen — and both live only in `manualMealPicks` React state. `swapPoolMeal` (meal-store.ts:307-328) writes nothing; `restoreSession` rebuilds today from `assembleDay(pools)`. Close the app, and the meal you confirmed is gone while the chat transcript still shows a "Swapped" receipt. The user watched a change apply on two tabs and the app threw it away.

2. **Chat logged five sets of a *guessed* exercise with no clarifying question — and no undo.** [live, broken]
   I sent "I did 5x5 at 80kg" with no exercise named. The coach immediately wrote **five Barbell Squats sets to the database** ("5 sets saved — I'll track your progression"), guessing squats from its own earlier (also wrong, see #4) context. The receipt has **no Undo button**, and on a recovery day there is no set grid to edit them in — the write is uncorrectable from anywhere in the UI. Expected: "Which exercise was that?" before committing, and an undo after.

3. **Undoing a chat-logged workout leaves the deleted sets visible everywhere else.** [code, broken]
   Where NL-log undo *does* exist, it calls `deleteSet` per row but never `refresh()`/`onLogsUpdated` — the ActiveSessionProvider's `logs` array (the read model for the dot ladder, TodayPanel progress, dock chip, dashboard) keeps the ghosts until a full reload. Undo says gone; four surfaces say still there.

4. **The PR cache never evicts deleted/undone sets — and chat-logged sets never enter it.** [live, broken]
   After I deleted my test squat sets from the DB, `pr_records_<pid>` in localStorage still held "Barbell Squats 60kg", and the coach then cited "your personal record of 60kg" in a progress answer. Meanwhile the chat-logged 80kg never updated the cache at all. Two write paths, one cache, no coherence — the coach quotes PRs that no longer exist and misses ones that do.

5. **"New Plan" is a one-tap, zero-confirmation wipe.** [code, broken]
   ProfileMenu's second item calls `handleReset` directly (App.tsx:1042): removes the profile pointer, **deletes the offline set-log queue** (unsynced logged sets are permanently discarded), and re-onboards into a brand-new profile row — orphaning every log, weigh-in, PR, memory fact, goal, and grocery list. A mis-tap one item below "Profile" destroys the account's history. Chat wraps a single exercise swap in propose→confirm; this has nothing.

6. **Goals/facts/context: one tap on a 24px trash icon permanently deletes, no confirmation, no undo.** [code, broken]
   The delete sits `gap-1` from the edit pencil (ProfileScreen.tsx:493-496). A fat-finger aimed at "edit my goal" permanently destroys the goal and its baseline/progress.

7. **First week of a program: typing reps and leaving the pre-filled weight placeholder silently discards the set.** [code, broken]
   The weight placeholder shows the prescribed load, implying "leave it and that's what logs." On save, empty weight only falls back to last session's ghost — which doesn't exist the first time — so the set writes as `weight_kg 0 / is_bodyweight false`, which `isMalformedZeroWeight` then filters out of summaries, progression, and history. The user's set is accepted and then invisibly thrown away — during the exact week (calibration) when every set matters most.

8. **Weight-only saves commit "0 reps" as a completed set; a bare tap on the pulsing save with a ghost commits last week's numbers wholesale; and no set can ever be deleted in the UI.** [code, confusing→data-integrity]
   Reps 0 passes validation (SetGrid.tsx:154,161), turns the row green, fills the dot ladder, and feeds 0-rep data into progression. With both fields empty and a ghost present, the most tap-inviting control on screen silently logs a full copy of last session's set.

9. **A failed meal regenerate blanks the plan you had.** [code, broken]
   `requestProposals` swallows all failures into `[]`, and `handleRegenerateAllMeals` sets state unconditionally (App.tsx:812) — on a dead connection the visible plan is replaced by the cold-start empty state telling an onboarded user to "Complete onboarding." The old rows still exist in the DB; the app just stops showing them until a *successful* regenerate.

10. **Grocery regenerate resurrects deliberately deleted items and clobbers user edits.** [code, rough edge]
    Delete "rice" because you have rice at home → next regenerate re-adds it. Rename/correct a generated row → regenerate overwrites your edit (grocery-store.ts:609-635).

11. **Profile/memory field saves are fire-and-forget.** [code, confusing]
    `void updateProfileField(...)` — an offline or failed write looks saved everywhere in-session, then silently reverts on next launch. The app that carefully queues offline *sets* drops offline *profile edits* on the floor.

12. **One accidental tap on the recovery-day "Log" button irreversibly logs a 35-minute cardio session.** [live, rough edge]
    "Log" → "Logged" instantly; the button becomes disabled — no confirmation before, no undo after.

13. **Offline/non-retryable chat errors are impersonated by a canned local reply styled as a real answer.** [code, confusing→trust]
    A fully offline "swap bench for incline" gets a generic template response persisted as `complete` — the user believes the coach heard them; nothing happened.

---

## 1. The three known issues — confirmed and diagnosed

### 1a. Chat input doesn't stay fixed — CONFIRMED [live + code]
At 375×667 the page has ~35px of scroll slack; scrolling moved the composer from y=590 to y=555 while the tab bar stayed fixed at 603 — a ~48px dead gap opens. **Root cause:** the composer's `sticky bottom-0` (ChatAssistant.tsx:2177) is mechanically inert — its nearest scroll ancestor is the card's `overflow-hidden` CardContent, which can never scroll, so sticky never engages; and sticky can't escape the 600px card anyway. The card (`h-[600px] max-h-[80dvh]`) sits in a document-scrolled `<main>` with 160px of fixed padding (`pt-12 pb-28`), so total page height exceeds the viewport on virtually every phone; the tab bar is the only genuinely `fixed` element, so any page scroll slides the whole card — composer included — up against it. Compounding: chat inherits the previous tab's scrollTop (opens pre-detached), `80dvh` resizes the card as the mobile URL bar collapses, the composer ignores the app's own `useViewportInset` hook on keyboard-open (BottomDock consumes it; ChatAssistant never imports it), and the composer's fade gradient feathers nothing since it never overlaps messages. Fix direction: viewport-fixed composer offset by `TAB_BAR_HEIGHT_PX` + insetPx, or make chat a full-viewport non-scrolling frame. A sticky inside a fixed-height card inside a scrollable page can never anchor to the viewport.

### 1b. Food dislike saves the fact but never notices the plan conflict — CONFIRMED [live + code]
Live: with "Lemon Herb Cod" as today's lunch, "I hate cod" → receipt "Saved: won't eat/do cod … **excluded from your meals**" — no mention of today's lunch, no offer. The explicit second message "can you swap today's lunch then?" produced a correct proposal card. **Root cause:** the model *does* see today's meals (CURRENT MEAL PLAN is in the prompt) but nothing asks it to cross-check, the server processes only the **first** function call per turn (record_fact + propose_meal_swap can't co-execute), and the record_fact branch discards all model prose — so even a model that noticed the conflict would have its warning deleted. The only actor holding both the new dislike and today's plan at save time is the client's `resolveAndSaveMemory` (ChatAssistant.tsx:1068-1107) — which checks conflicts against prior *facts* only, never against `mealPlan` sitting 14 lines away in the same scope. That's where the check belongs. Related rot: the receipt's "excluded from your meals" is false (exclusion only happens at the next manual regenerate — the hard_constraint branch already has honest "not yet applied" wording); a dislike defaulting to *soft* reaches **no** generation path at all; `swapPoolMeal` can re-serve the hated food (no dislike filter); and a server-side fix attaching an offer to the same turn would be silently dropped by the client's memoryIntent early-return.

### 1c. Onboarding weight never reaches the dashboard — CONFIRMED [live + code]
Live: this profile's dashboard computes 1979 kcal / 174g protein *from* the onboarding weight while the Progress section directly below says "Log a weigh-in to see your trend here." **Root cause:** onboarding writes `fitness_profiles.weight_kg` only (App.tsx:429); the trend pipeline reads exclusively `daily_metrics`, which nothing seeds. Same missing-fallback pattern on four more surfaces: chat literally asks "What's your current number?" for a weight goal while its own context payload contains the weight (self-contradicting conversation — the worst of the set); ProfileScreen shows "Current weight: Log a weigh-in on Dashboard" one row under "Onboarding weight: 82kg"; goal progress shows "current not yet known"; and the first-weigh-in nudge only fires for users who *already* weigh in 3+/14 days — the new-user cohort that most needs the nudge never gets it. One onboarding-dated seed row (or a `profile.weight_kg` fallback at the read sites) fixes the level without fabricating a trend rate.

---

## 2. Workout & session lifecycle

- **Every exercise in an implicitly-started session gets a fake "New PR" at Finish.** [code, broken] The PR baseline snapshot is captured only in `startSession`; logging-without-starting (a supported, silent flow) leaves it empty, and `computeSessionPRs` treats missing entries as 0kg — so the summary trophies every lift. I saw the adjacent version live: a calibration work-up single celebrated as "NEW PRS: Barbell Squats 60kg."
- **The bodyweight set vanished from the session summary count.** [live] I logged 2 sets (Broad Jumps BW×8 + Squats 60×8); the DB had both rows; the summary said **"1/17 SETS"**. Volume excluding BW is defensible; the *set count* losing a set reads as data loss.
- **The rest timer keeps running after "Finish session."** [live + code] Post-finish, the dock still counted down "1:30 · rest · Barbell Squats"; when it expires it chimes and offers "Start next set ▸" for a session that no longer exists — and tapping through silently *reopens* the finished session.
- **Reopening the app hours later same-day resurrects a dead rest timer, chiming immediately.** [code, confusing] `restEndsAt` persists forever until explicitly dismissed; hydration restores it regardless of session status; the dock's chime ref fires instantly on mount for an already-expired deadline. Train at 8am, open the app at 6pm → rest-complete chime.
- **The 6h auto-close is completely silent — the summary moment is permanently lost.** [code, confusing] Forget to tap Finish and you never see duration/volume/PRs/next-session for that workout; the day just shows "Start session" again with no acknowledgment anything ended.
- **Start→Finish with zero sets sails through:** "Session complete, 0m, 0kg, 0/17" plus next-session progression advice derived from a *previous* session, and the DB row is flagged completed. [code]
- **Re-tapping Start after Finish produces distorted stats** (full-day volume over a minutes-long duration) and the first summary is unrecoverable. [code]
- **"Finish session" is only reachable by scrolling back to the top** of a multi-screen exercise list, and the dock deliberately refuses to offer it — the natural end of a workout is at the *bottom*. Predictable result: sessions never finished, funneling users into the silent auto-close above. [code]
- **The empty-reps save silently no-ops.** [live] With 60kg entered and reps blank, the save button is enabled; tapping it does nothing — no error, no hint (the rowErrors mechanism exists but isn't used here).
- **Session dock chip frozen at "0:00" for implicitly-started sessions** until a reload (React state `startedAtIso` never set by logSet). [code]
- **Refresh mid-session is genuinely good** — status, logged sets, progress badges, and the exact rest deadline all survive [live] — but typed-but-unsaved inputs and "Add Set" rows are lost, and Add-Set rows also vanish on mere row collapse (SetGrid state, unmounted when collapsed). [code]
- **Exercise row headers are `div cursor-pointer`, not buttons** — not keyboard-reachable, no role; the set-save button has no aria-label. [live]
- **Rest prescriptions read oddly short**: 20s after a power movement (Broad Jumps), 60s base on the main lift. [live, rough edge]
- **Peek-day label mismatch:** Step-Ups shows "3×11-15" with four per-set load chips S1–S4 (the pattern-balance bump edits sets without the label following). "Plank 3×33-48s" is percentage-math precision leaking into copy. [live, cosmetic]

## 3. Chat

- **Confirm on an expired proposal silently does nothing, forever.** [code, broken] Cards never show the 10-minute validity, never expire visually; `already_resolved`/`not_found` outcomes fall through with no UI change — button flashes "Applying…" and reverts, indefinitely re-tappable.
- **A bare "ok"/"yes" anywhere is hijacked by any old unanswered proposal.** [code, broken] The affirmative-scan finds the most recent locally-'pending' proposal with no recency/expiry check — "ok" in reply to something else executes a forgotten plan mutation 20 messages up, off-screen, with no assistant reply at the bottom.
- **A second clarification question renders with its answer buttons permanently hidden** (component-local `resolved` flag survives the in-place message update) — user stranded. [code, broken]
- **Undo triple-fault:** the 10-minute window is stated nowhere; the button outlives the window and then silently no-ops; and after a *successful* undo the receipt still reads "Swapped …" — I hit this live: undone lunch, receipt unchanged, no "Undone" state anywhere. [live + code]
- **Reload strips proposal cards, receipts, and Undo buttons from restored history** — inconsistently, depending on conversation length (cards live only in the localStorage cache; DB rows don't carry them). An unanswered proposal degrades to dangling text "I can swap **X** for **Y**:" with nothing to tap. [code]
- **Preconditions are a hardcoded `async () => true`.** The fingerprint data is captured and never checked; ban/regenerate/adaptations don't sweep stale proposals — Confirm can execute against a reshaped plan (wrong exIndex). [code]
- **The coach fabricates and compounds workout claims.** [live] Greeting asserted "You actually already logged a set of 10 bodyweight Barbell Squats earlier today" (nothing was logged today; the phrasing matched no real row), then re-referenced "those squats" in two later replies, then used its own guess to log the 5×5 (finding #2). Confidently-wrong data references poison everything downstream.
- **The coach refers users to features that don't exist.** [live] "Head into your calendar controls in the app to shift Monday's session" — there are no calendar controls; it then followed up later asking if the user had done it.
- **Two identical "Response failed — tap to retry" buttons do different things** (one resends, one only restores the composer text); the failure copy references a "Retry" label that no control has. [code]
- **Greeting goes stale:** an untouched greeting-only chat restores yesterday's "today's session" verbatim on every open; the fresh-run opener also visibly rewrites itself up to 2.5s after mount. Plus the cardio-day template bug I hit live: "Today's Active Recovery + Cardio: **.** Feeling good for it?" — dangling colon from an empty exercise-list interpolation. [live + code]
- **First-ever opener presumes history on day zero** ("How'd it go?" for a session a brand-new user never did). [code]
- **"Load Previous Messages" can vanish without loading anything** (pagination cursor is `messages[0].created_at`, which the locally-built greeting doesn't have). [code]
- **Hold-to-talk on the mic opens a developer debug console** — the most ingrained voice gesture on mobile ships a raw event-trace overlay to production users; voice errors other than permission-denied are silent; a denied mic becomes a permanently dead-looking-but-enabled button. [code]
- **Clear chat:** native `window.confirm` (themed-app clash; suppressible in PWA contexts → button silently dead), fire-and-forget DB delete (a failure resurrects the "cleared" conversation on reload), not gated on isLoading (in-flight reply lands as an orphan in the fresh chat). [code]
- **No tap-to-skip on the typewriter, and quick replies are held hostage until it finishes** (~20s+ for a long reply at Normal). Backgrounding mid-reveal pauses it (tick-chained timers). [code + live artifact]
- **Up to 45s of "Thinking…" with no cancel**, and the thinking indicator itself waits on a Supabase insert round-trip before appearing. [code]
- Good news worth keeping: send-while-loading is correctly blocked with input preserved; double-tap Confirm executes exactly once; out-of-scope asks (presentation, crypto) are cleanly declined; refresh mid-reveal recovers the full text. [live]

## 4. Meals & grocery

- **There is no way to log a meal as eaten anywhere in the app.** [live + code, broken] The dashboard ring reads from a ledger (`recordMealEvent`) that has **zero callers**. The ring is permanently 0, "no meals logged yet" fires every day forever, the protein streak can never advance — and the dashboard's "Log a meal" CTA navigates to a tab where the action doesn't exist. I followed the CTA live; there is nothing to tap.
- **Meal swap is buried.** [live + code] Collapsed rows have no expand affordance (you tap a text row on faith); once open, "Swap · N options" is a non-interactive *label*, the actual swap is tapping an option card, and slot-regenerate is an unlabeled icon visually identical to "Regenerate all."
- **Swap options are duplicates and the count lies.** [live] Breakfast's pool offered "Greek Yoghurt Pancakes" twice (538/542 kcal — one distinct meal). After a swap round-trip the list showed **three** rows including the currently-chosen meal as an option for itself with a stale "+7 kcal" delta, under a header reading "Swap · 1 option" (then "2 options" for 3 rows).
- **"Regenerate all" destroys the current pool and every manual pick with zero confirmation** — hard-deletes slot rows, no undo, the AI may never re-propose the meal you liked. [code]
- **Internal tags leak into the meal detail UI.** [live] Chips render `slot_appropriate` and a raw ingredient name ("vanilla whey protein powder") alongside legit cuisine/time tags; grocery rows render a bare Badge reading `check`.
- **"ON THE NUMBER" headline sits beside 229/174g protein (32% over) and 143/197g carbs (27% under).** kcal-only "on the number" next to visibly-off macros reads as the app grading itself on a curve. [live]
- **Grocery list diverges silently from the plan** (no auto-refresh, no staleness cue, "from N meals" attributes items to deleted meals), **ignores manual picks** (shops for auto-assembled day-0 meals the user swapped away), and assembles days 2+ with a variety the visible plan doesn't have. [code]
- **Grocery categorization/naming a shopper trips on immediately:** whey protein powder + kidney beans + black beans under MEAT & FISH; "~500g water" as a purchasable item; "jerk paste" and "jerk seasoning paste" as separate rows; "2 eggsegg" run-together; "milk skimmed"; liquids sold in grams ("~1.2kg milk"); the editor behind "26 eggs" is a bare unitless field containing grams (correct it to "12" and you've set 12 *grams*). [live + code]
- **Quick-adding into an already-checked row is invisible** (merges into the greyed struck-through line at the bottom — in-store users will assume it failed and double it). [code]
- **3d/7d/14d horizon buttons look like filters but change nothing until Regenerate.** [code]
- **The grocery card kept the pre-redesign chrome** the meals section above it just shed — one screen, two design generations — and is permanently expanded despite its own header describing it as collapsible/secondary. [code]

## 5. Dashboard

- **Dashboard and Exercise tab disagree about what today is.** [live, confusing] Dashboard: "Rest day — Nothing planned today." Exercise tab, same moment: "Active recovery · Saturday" with a 35-minute Zone-2 prescription and a Log button. A dashboard-reading user skips a planned session. ("Tomorrow: Rest" was also shown while tomorrow's strip glyph said rest — but *today* was mislabeled.)
- **The rest-day hero is a dead end** — no tap target at all, while the Exercise tab's rest-day card has log-a-walk/peek/train-anyway one tab away. [live + code]
- **Streak shown twice; PR shown twice** (hero chip + footer line; coach tip + Progress line) on one screen. [live]
- **Dashboard doesn't refresh its own aggregates after a weigh-in logged on the Dashboard** (effect deps omit macros/weigh-ins — numbers update only after leaving and returning to the tab). [code]
- **A brand-new profile mid-week is scolded with "missed" for days before the plan existed** ("Monday: missed" aria-labels, "0 of 3 sessions done" — minutes after onboarding). [code]
- **A profile whose plan fails to restore renders as an eternal "Rest day"** — plan-loss is indistinguishable from a normal rest day, on both dashboard and Exercise tab. [code]

## 6. Profile & settings

- **Free-text tags are coached into values the enforcement silently ignores.** [code, broken] Placeholders suggest "e.g. Lower Back" / "e.g. Vegetarian" (display labels), but enforcement matches codes (`lower_back`, `vegetarian`) — type exactly what the placeholder shows and a self-declared vegetarian keeps getting meat meals, a flagged back injury keeps getting back-loading exercises, with zero feedback.
- **Profile edits are a silent no-op for the plan and macros.** [code] Changing equipment/experience/days/goal-relevant fields changes nothing, ever — no plan-regeneration feature exists (the promised "takes effect on your next plan regeneration" points at a mechanism that isn't in the app; the only "New Plan" is the destructive reset). Editing injuries here does nothing while telling the *chat* the same thing adapts the plan on the spot — the official editor is strictly worse than chatting.
- **The fitness goal — the most consequential setting — cannot be viewed or changed anywhere in Profile.** [code]
- **Editing a memory fact/goal rewrites only its label** — behavior stays on the old resolved target/value; the card then displays a target contradicting the text the user just wrote. [code]
- **Numeric fields silently snap back on invalid input** (and valid saves are equally silent — "saved" and "reverted" look identical). Tag input text is discarded on dialog close; case-variant duplicate chips allowed. [code]
- **Receipt deep-links race a 150ms timer against three fetches** and usually land at the top of the dialog (on Appearance) instead of the target section — precisely on the first, slow-network open. [code]
- **The Appearance card's "Both apply instantly" copy sits above three controls** (reveal speed was added under it), and chat typing speed is filed under "Appearance" as the first thing in a dialog titled "Profile." [code, cosmetic]

## 7. Cross-surface consistency

- **The chat greeting and NL-log plan-matching read a frozen week-1 plan** (`exercisePlan` set once at restore, never updated by swaps/bans/adaptations) — after a confirmed swap, logging the *new* exercise by name resolves as off-plan even though it's on today's screen. [code]
- **Profile edits that feed targets desync chat mid-conversation** (context computes BMR/TDEE live from the edited profile while sending the stale macros in the same payload — the coach can quote a TDEE contradicting the calorie target it was handed). [code]
- **Chat's grocery answers ignore Meals-tab activity this session** ("what's left on my list?" repeats items checked off minutes ago, one tab away). [code]
- Verified working cross-surface [live]: chat meal-swap → Meals tab reflects immediately (within the session); adaptation confirm → Exercise tab plan updates; auto-revert restores + banners fire; week-strip ◐ progress updates after logging.

## 8. Cosmetic / copy grab-bag

- "won't eat/do cod" — the fact template's "eat/do" slash leaks into receipts and Profile. [live]
- Empty first assistant bubble briefly rendered above the greeting during load. [live]
- "1 DAY STREAK" hero + "Streak: 1 day on plan" footer (duplication also flagged above). [live]
- Exercise-history dialog with no history: three stacked "nothing" messages + an empty-state flash before Loading. [code]
- First-run grocery empty state: "tap **Re**generate" for something never generated, and the tap can silently produce nothing over empty pools. [code]
- Meals-tab empty state tells an onboarded user to "Complete onboarding"; its retry fails silently on repeat failure. [code]
- Water receipt button says bare "View" (siblings say "View in profile"/"View list"); partial-failure receipts list failed ops with a Retry mechanism that's never wired. [code]

---

## Coverage notes
- Injury and equipment/travel chat adaptations were exercised end-to-end (including auto-revert and banners) in this same session's earlier rounds and re-verified working; their two live bugs found then (imperative-verb gap, revert race) were already fixed and are not re-reported here.
- Not live-clickable this round (environment): ProfileScreen editing, History/Timers dialogs, ⋯/⋮ menus — covered by code audit above and by prior verified rounds.
- Full code-audit detail with file:line evidence for every [code] item: workflow output at `tasks/wgm36lcmm.output` (9 agents, 69 findings + 3 root-cause diagnoses).
