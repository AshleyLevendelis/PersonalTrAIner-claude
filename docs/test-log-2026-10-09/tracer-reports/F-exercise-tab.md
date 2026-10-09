# F · The Exercise tab — logging, session lifecycle, history, connection loss

Read-only trace. Nothing under `/home/claude/app` was edited. Three small scripts were run from
the scratchpad (they only read and print): a replay of the real `computeStreak`, a replay of the
real `getAdditionCandidates` on a generated Sam-like plan, and a standalone Chromium page (not
the app) to test one layout mechanism. Where a claim rests on one of those, it says so.

**Everything below ships with the frontend build. No edge-function deploy and no migration is
needed for any fix in this report.**

Legend: VERIFIED = read in code or run. INFERRED = follows from the code but not observed.

---

## Part 1 · Cardio never reaches the record

### H7 · Unplanned cardio ("skipping rope, 12 min, Steady") closes the panel and appears nowhere
- Status: CONFIRMED IN CODE — **it is saved, and nothing on a training day reads it back.**
- Root cause:
  - The write happens. `UnplannedCardioEntry.handleSave` calls the store and only then closes:
    `src/components/exercise/CardioSetRow.tsx:470-484` — `const view = saveCardioLog({ userId: profileId, date, activityName, durationMinutes: mins, intensityRpe: rpeToStore(effort, chosen?.rpe), notes })` … `onLogged?.(view)`.
    The store queues it locally and inserts into **`cardio_logs`** with columns
    `user_id, date, activity_name, duration_minutes, intensity_rpe, avg_heart_rate, notes, completed_at`
    (`src/lib/cardio-log-store.ts:292-301`). No code path drops it; a failure would surface as the
    red "didn't save" pill, which the tester did not see on Thursday.
  - The training-day screen has no reader. `TodayPanel` mounts the sheet with no callback and no
    receipt list: `src/components/exercise/TodayPanel.tsx:1222-1226` —
    `<AddUnplannedWork open={unplannedWorkOpen} onOpenChange={setUnplannedWorkOpen} hideTrigger />`.
    `AddUnplannedWork` then does `onLogged={() => { onCardioLogged?.(); reset() }}`
    (`AddUnplannedWork.tsx:182`) — the panel shuts and nothing is drawn.
  - The only cardio read-back on a training day is `PlannedCardioRow`, which matches **by the
    plan's own activity string**: `CardioSetRow.tsx:321` —
    `logs.find(l => l.activity_name === prescription.activity …)`. "skipping rope" matches nothing.
  - The rest-day card already solves this exactly: it lists every un-claimed log for today as a
    receipt with Undo (`RestDayCard.tsx:142-166`, `receipts = live.filter(l => !taken.has(l))`).
    The training day simply never got the same block. Compare "Additional work" for lifts, which
    does render (`AdditionalWorkSection.tsx`).
  - Every reader of `cardio_logs` in the repo (grepped the table name across `src` and
    `supabase/functions`):
    | Reader | File | Shows unplanned cardio? |
    |---|---|---|
    | Exercise tab, training day | `CardioSetRow.tsx:321` (planned rows only) | **No** |
    | Exercise tab, rest day | `RestDayCard.tsx:116` | Yes |
    | Session complete card | `SessionSummaryDialog.tsx` — no cardio field at all | **No** |
    | Session history | `exercise-history.ts:331-371` reads `workout_sessions` + set logs only | **No** |
    | Home "today" | `Dashboard.tsx` — zero mentions of cardio (grepped) | **No** |
    | Week strip glyph | `useTrainingWeek.ts:137` (`loggedWork` counts cardio) | counts, not shown |
    | Streak / week pace | `dashboard-data.ts:344-348, 410` | counts, not shown |
    | Coach context | `ChatAssistant.tsx:1388-1393` → `cardio_log_history` → `chat-gemini/index.ts:2661` | Yes (server rows only) |
    | Phone notifications | `coach-reach-out/index.ts:103` | dates only |
  - The coach's "it hasn't been written down yet": the coach is handed
    `getRecentCardioLogs` (`daily-tracking.ts:660-677`), which reads the **server only**, not the
    pending queue, so a log that has not synced is invisible to it. Whether that or the model's
    own wording produced that sentence cannot be told from code (INFERRED; the loop itself is H8,
    another tracer's).
- Prior rulings: "Cardio is logged like a lifting set, on every screen that logs it … a read-back
  with Undo ('✓ Walk · 20 min · Easy')" — `CLAUDE.md` (Across all three, 24 Sep 2026). The
  ruling promises a read-back; the unplanned path on a training day has none. Also
  `AddUnplannedWork.tsx:10-15`: "a declared lift just adds a name to today's session record".
  No ruling says cardio should be absent from the summary or history (grepped BACKLOG/CLAUDE/docs
  for "cardio" with "summary", "history", "Session complete").
- Fix: see **the one fix for H7 + H21** under H21.
- Class: MECHANICAL (the read-back is already ruled). One small OWNER DECISION rides along — see H21.
- Ships via: frontend
- Gates: touch this code — `test:cardio-log`, `test:cardio-effort`, `test:round-logging`,
  `test:rest-day-card`, `test:bounds-and-boundaries`, `test:silent-writes`, `verify:finisher`,
  `verify:rest-day`. None asserts that a log is *visible* after the sheet closes
  (`test:round-logging` checks the timer hand-off wiring). New: a `verify:` driver that logs
  "Other → skipping rope" on a training day and asserts the receipt is on screen, in the Finish
  card and in history.
- Risk: double-drawing a planned finisher (once in its own row, once as a receipt). The rest-day
  card's `claimed` list is the existing guard; reuse it rather than re-deriving.
- Confidence: high that it is saved-and-unread (every hop read). Medium on the live row itself —
  the production database cannot be queried from here.

### H21 · The planned finisher logs with a tick and Undo, then is missing from Session complete and Session history
- Status: CONFIRMED IN CODE
- Root cause: the same hole from the other side. The planned row writes and reads itself back
  (`CardioSetRow.tsx:334-346`, `:321`), so the tick is real. But:
  - `SessionSummaryData` is `{ summary, prs, progressions }` (`SessionSummaryDialog.tsx:16-27`) and
    `handleFinish` builds it from set logs only: `TodayPanel.tsx:227-252` —
    `computeSessionSummary(logs, plannedExercises, …)`, where `logs` is `ExerciseSetLog[]`.
  - `getSessionHistory` selects `workout_sessions` then `getSetsForSession(row.id)`
    (`exercise-history.ts:332-362`). `cardio_logs` has no `session_id`; it is keyed on
    `(user_id, date)`, and nothing joins it.
- Prior rulings: as H7. `types.ts:843` — "instead goes to cardio_logs, not here — one fact, one home".
- Fix (one fix for H7 + H21, no migration — join on `date`):
  1. **One reader.** Lift `RestDayCard`'s receipt logic into a tiny shared piece, e.g.
     `useCardioReceiptsToday(claimed: string[])` beside `useCardioLogsToday` in `CardioSetRow.tsx`.
     `claimed` on a training day = `[workout.recommendedCardio?.activity, workout.mobilityFiller?.activity]`.
  2. **Exercise tab.** Under `AdditionalWorkSection` render the un-claimed logs as `CardioReadback`
     rows headed "Cardio" (same component, so Undo works the same way).
  3. **Session complete.** Add `cardio: { activity; minutes; rpe }[]` to `SessionSummaryData`; in
     `handleFinish` read `getCardioLogsForDateMerged(profileId, today)` and render a "Cardio" block
     with `cardioReadback(...)` lines. Do **not** add minutes into the lifting Duration tile.
  4. **Session history.** In `getSessionHistory` add ONE ranged `cardio_logs` read
     (`select('*')`, date ≥ oldest row) and attach `cardio[]` per date; a date with cardio and no
     lifting session becomes its own entry ("Football · 60 min · Hard").
  5. **Coach.** Have `loadWorkoutLogs` use the merged (server + pending) read so "did that get
     logged?" is answered from what the phone knows.
  ```ts
  // sketch — SessionHistoryEntry gains: cardio: { activity: string; minutes: number; rpe: number }[]
  const { data: cardio } = await supabase.from('cardio_logs').select('*')
    .eq('user_id', userId).gte('date', oldestDate)
  const byDate = groupBy(cardio ?? [], c => c.date)
  ```
- Class: MECHANICAL, plus one OWNER DECISION:
  **"When you log cardio or 'did something else', where should it show afterwards?"**
  (a) In the session's finish card and in history, as its own line — *recommended; it is what the
  tester expected and what a coach's notebook would hold.* (b) Also as a line on Home's "today".
  (c) History only. Either way nothing is lost; this decides how visible it is.
- Ships via: frontend
- Gates: `test:session-derive`, `test:exercise-history`, `test:overlay-artifacts`,
  `test:tools-grid`, `test:silent-writes`, `test:bodyweight-progress` read the dialogs.
  New checks: `getSessionHistory` returns a cardio line for a date with a cardio row (fake
  Supabase, the house pattern in `test:cardio-log`); `verify:finisher` extended to tap Finish and
  read the card.
- Risk: `getSessionHistory` is also called by `ToolsTab.tsx:119` for the "N sessions" subtitle —
  adding cardio-only entries changes that count unless the count is taken from lifting entries.
- Confidence: high.

---

## Part 2 · Connection loss

### H20 · After a connection drop, logged sets render as "0 logged"; raw "TypeError: Failed to fetch" on an unreadable card
- Status: CONFIRMED IN CODE — four separate causes, all VERIFIED by reading.
- Root cause:
  1. **A failed read returns "nothing", not "failed".** `getSetsForDate`
     (`src/lib/set-log-store.ts:914-936`) says "Never throws: offline returns the pending view"
     and destructures only `data`:
     `const { data: session } = await supabase.from('workout_sessions')…maybeSingle()` /
     `if (session) { const { data } = await supabase.from('exercise_set_logs')… }`.
     The `try/catch` around it never fires, because this Supabase client does not throw on a dead
     network — it resolves with `{ data: null, error: { message: "TypeError: Failed to fetch" }, status: 0 }`
     (VERIFIED in `node_modules/@supabase/postgrest-js/dist/index.mjs:326-366`, v2.110.0). So
     `synced = []` and the function returns **pending rows only**.
  2. **There is no cache of sets that already synced.** A set leaves the queue the moment it
     syncs — `set-log-store.ts:793` `savePending(loadPending().filter(o => clientIdOf(o) !== clientId))`
     — and lives nowhere else on the phone. The six sets that had synced therefore have no local
     copy to fall back on.
  3. **The screen replaces good data with the empty answer.** `useActiveSession.refresh`
     (`src/hooks/useActiveSession.tsx:316-331`) does `getSetsForDate(...).then(rows => { setLogs(rows); setReady(true) })`.
     `refresh()` runs on mount **and after every `logSet`** (`:441`). So during the outage each
     tap on ✓ re-read, got pending-only, and wiped the synced sets off the screen — that is the
     "for minutes", not only the reload.
  4. **Loading, failed and empty are the same pixels.** `logs` starts as `[]` and `ready` as
     `false` (`:274-275`), but no component under `src/components/exercise/` reads `ready`
     (grepped: only `Dashboard.tsx:240` waits on it). `ExerciseRow.tsx:296` prints
     `{ex.sets} working sets · {completedSets} logged` from that empty array. Hence "0 logged"
     for the 5 seconds after reload too.
  5. **A set that gives up retrying disappears from the grid.** Network failures count toward
     `MAX_SYNC_ATTEMPTS = 5` (`set-log-store.ts:31`, `:803-814`) with backoff 2/4/8/16/32 s
     (`:543`), so on a connection that is *up but dead* (the browser still says online — the
     `navigator.onLine` guard at `:558` only helps when the phone knows it is offline) a set is
     moved to the dead-letter store after about a minute. `mergePendingForDate` (`:889-911`)
     merges the pending queue only, so the set vanishes from the screen while sitting safely in
     `fitplan_setlog_deadletter_v1`. That is "Floor Press set 4".
  6. **The raw error is printed.** `moveToDeadLetter` stores
     `(error as { message?: string })?.message ?? String(error)` (`set-log-store.ts:226`) and the
     review card prints it verbatim: `src/components/OfflineStatusIndicator.tsx:96` —
     `<p className="text-[0.625rem] text-red-700 dark:text-red-400">{item.errorMessage}</p>`.
     `queue-health.ts:47` already says "The underlying failure, for the details line. Never the
     primary message" — the card ignores its own rule.
  7. **The colours.** The card is `border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20`
     with `text-muted-foreground` labels (`OfflineStatusIndicator.tsx:88-95`). The `dark:` halves
     never apply: `src/index.css:665-669` — "Nothing in the app ever adds this class —
     [data-theme] is the real axis." So every theme gets the light-mode pink (`red-50`) under the
     theme's own muted lilac (`--muted-foreground: #9A93C9` in Nightshift, `index.css:190`).
     The pill at `:141` and the sync badges at `:158`, `:170` have the same inert `dark:` classes.
  - The retry queue the tester asked about: `fitplan_setlog_pending_v1` (queue),
    `fitplan_setlog_deadletter_v1` (gave up), `fitplan_setlog_sessions_v1` (session ids), all in
    `set-log-store.ts:24-26`; read for the pill through `queue-health.ts`. Cardio has its own
    (`fitplan_cardio_pending_v1`) and the same blanking — `getCardioLogsForDateMerged` falls back
    to pending-only on a failed read (`cardio-log-store.ts:337-350`), so a logged finisher would
    look un-logged too.
- Prior rulings: the principle is already house law and was simply not applied to this read —
  `set-log-store.ts:1139-1146` (same file): "A query error must never look like 'genuinely zero
  sets'". `CLAUDE.md` "Every write succeeds or says it did not". `SessionSummaryDialog.tsx:53-60`
  already uses the wanted tone: "Your sets are saved. Finishing the session hasn't synced yet".
  `coach-voice.ts:609-659` holds the plain-language failure phrasebook. No ruling says a failed
  load should show as empty.
- Fix:
  1. `getSetsForDate` returns `{ rows, source: 'server' | 'cache' }` and **checks `error`** on
     both queries.
  2. Keep a last-known-good snapshot per `(user, date)` in localStorage, written on every
     successful server read; on a failed read merge pending onto the snapshot instead of `[]`.
  3. Merge dead-lettered upserts into the day's view flagged `syncStatus: 'failed'`, so a set
     never leaves the grid; the row shows "Not saved yet · Retry".
  4. `useActiveSession` exposes `loadState: 'loading' | 'ready' | 'stale'` and never overwrites
     non-empty `logs` with a cache-miss result. `TodayPanel` shows a skeleton while loading and a
     quiet line while stale: "Reconnecting — your sets are safe on this phone."
  5. Network-class failures stop counting toward the give-up limit (keep backing off; only a
     rejected write is dead-lettered).
  6. One `plainSyncError(message)` in `coach-voice.ts` ("Failed to fetch" / "NetworkError" /
     "Load failed" → "There was no connection when this was saved."); the card shows that, never
     `item.errorMessage`.
  7. Card and pill move to the theme's own tokens (`--role-warn-bg` / `--role-warn-text`, as
     `InsightBanner` does) and the dead `dark:` classes go.
  ```ts
  // sketch
  const { data: session, error: sErr } = await supabase.from('workout_sessions')…maybeSingle()
  if (sErr) return { rows: mergePendingForDate(userId, date, readSnapshot(userId, date)), source: 'cache' }
  ```
- Class: MECHANICAL. (The sentence "Reconnecting — your sets are safe" is the tester's wording
  and matches the existing "Your sets are saved" line; if Ashley wants different words it is a
  one-line change.)
- Ships via: frontend
- Gates: `test:logging-roundtrip`, `test:silent-writes`, `test:queue-listeners`,
  `test:no-forked-state`, `test:session-continuity`, `test:replace-without-losing`,
  `test:drop-sets`. None simulates a read that *fails*: the fake Supabase in those gates always
  answers. New: a logic gate whose fake returns `{ data: null, error }` for reads after N sets
  have synced and asserts the day still returns N rows; a `verify:` driver that logs sets, cuts
  the fake's network, reloads, and reads "N logged" plus the reconnecting line. Per CLAUDE.md
  ("A fake that ignores filters cannot see a missing filter") the fake must be able to fail.
- Risk: a stale snapshot showing a set that was deleted on another device — bounded by always
  preferring a successful server read and by keying the snapshot to one date. Item 5 changes
  when the red pill appears (later, and only for genuinely rejected writes).
- Confidence: high on causes 1-4, 6, 7 (read line by line; client behaviour read in the installed
  package). Medium on the exact one-minute timing in 5 — it assumes the browser reported itself
  online throughout, which the tester's own caveat makes likely but not certain.

### M29 · Error banners render at the top of the page, out of view, and follow you between tabs
- Status: CONFIRMED IN CODE
- Root cause: one shared slot, mounted in normal flow above the tabs.
  `src/App.tsx:3069-3081` — `<main …>{writeError && (<InsightBanner tone="warning" …><span>{writeError}</span>…Dismiss…</InsightBanner>)}<Tabs …>`.
  It sits before `<Tabs>`, so it is at the top of whichever tab is open and is only cleared by
  Dismiss or by the next successful write (`setWriteError(null)` at `:2440`, `:2508`). Writers:
  ban (`:2437`, `:2467`), swap (`:2516`), re-price (`:2565`), rebuild (`:2581`, `:2597`).
- Prior rulings: `App.tsx:234-248` explains why it is its own slot ("a failure is not a coaching
  insight … a single slot, not a queue"). Nothing rules on *where* it sits. CLAUDE.md, 27 Sep
  2026: "A MESSAGE IS ONLY SHOWN IF IT IS ON SCREEN WHERE THE TAP WAS" — this is that rule,
  unapplied here.
- Fix: render the same single slot as a fixed bar above the tab bar (the position `BottomDock`
  and the Start button already use, `bottom: calc(TAB_BAR_HEIGHT_PX + safe-area + dock)`), with
  `role="alert"`, cleared on tab change. Where the caller is a sheet that is still open (swap,
  ban from the ⋮ menu) prefer returning the sentence to the sheet, as `applySessionEdit` already
  does (`TodayPanel.tsx:319-336` returns a string the sheet shows).
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:silent-writes`, `test:audit-fixes` read these branches by source. New: a driver
  check that the message's box is inside the viewport when the page is scrolled (the 27 Sep rule
  says assert position, not presence).
- Risk: a fixed bar stacking with the rest timer and the Start button — it must publish its
  height the way the dock does (`useBottomDockHeight`).
- Confidence: high.

---

## Part 3 · Session lifecycle

### M7 (+ correction) · "Session running · 0:00" never moves when the session was started by ticking a set
- Status: CONFIRMED IN CODE
- Root cause: the start time is written to storage but never to the screen's state on that path.
  There are **three** ways a session's start gets stamped:
  1. **Start workout** — `useActiveSession.tsx:447-462`: `patchRecord({ status: 'running', startedAtIso: now, …, prSnapshotAtStart: getPRCache(...) })`, then `setStatus('running')` **and `setStartedAtIso(now)`**, then creates the database row.
  2. **First ticked set** — `:424-444`: `patchRecord({ status: 'running', finishedAtIso: undefined })` then `setStatus('running')`. `patchRecord` fills the record's `startedAtIso: existing?.startedAtIso ?? now` (`:417`), but **`setStartedAtIso` is never called**, and no PR snapshot is taken.
  3. **Anything else that saves to the record first** — typing a digit (`saveSetDraft`, `:595-598`), "Anything feeling tight?" (`:614-617`), "Add Set" (`:619-627`), an unplanned lift (`:629-631`): all go through `patchRecord`, whose defaults are `status: existing?.status ?? 'running'` and `startedAtIso: existing?.startedAtIso ?? now` (`:416-417`). So the stored session quietly opens at the first keystroke; the screen only finds out on the next reload (hydration at `:308-312`).
  The pill reads the React value: `src/components/BottomDock.tsx:172` —
  `const elapsedMs = startedAtIso ? getAppNow(profileId).getTime() - new Date(startedAtIso).getTime() : 0`.
  Null → 0 → "0:00" until a reload. (M6, the tour doing path 2, is another tracer's.)
- Prior rulings: path 2 is deliberate — `:434-438` "Forgiving by design: a logged set with no
  session open silently opens one". The frozen clock is not.
- Fix: in `logSet`, after `patchRecord`, mirror the record: `setStartedAtIso(prev => prev ?? getActiveSessionRecord(profileId, date)?.startedAtIso ?? null)`, and take the PR snapshot when the record has none (see M12). Stop `patchRecord` defaulting `status` to `'running'` for non-session patches (default to `existing?.status ?? 'idle'` and leave `startedAtIso` unset until a start or a set).
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:session-derive` covers only the pure halves (duration maths `:280-288`, staleness
  `:323-326`); `test:session-continuity`, `test:no-forked-state`, `test:one-today` read the hook
  by source. Nothing drives `logSet`. New: a driver that ticks a set without Start and reads the
  pill twice a few seconds apart (CLAUDE.md: "a control that writes and does not redraw … no
  gate and no type can see it").
- Risk: changing `patchRecord`'s default status touches the stale-session sweep
  (`isSessionStale` only acts on `'running'`), which currently also tidies these accidental
  records — check `test:session-continuity` after.
- Confidence: high.

### M12 · Finish session ends at once at 9 of 24 sets; summary lists five "New PRs", all first-ever logs
- Status: CONFIRMED IN CODE (two different things)
- Root cause:
  - **No check.** `TodayPanel.tsx:1052` `<Button … onClick={handleFinish}>Finish session</Button>`;
    `handleFinish` (`:213-254`) calls `finishSession()` immediately. The only guard is for zero
    sets (`:1057-1061`, `useActiveSession.tsx:476-481`).
  - **PRs, cause A (a plain bug): a session started by ticking a set has no baseline.**
    `finishSession` returns `prSnapshotAtStart: record?.prSnapshotAtStart ?? {}` (`:495`), and
    only `startSession` ever writes that field (`:454`). `computeSessionPRs({}, logs)` compares
    every lift against `EMPTY_PR_RECORD` (`src/lib/pr-engine.ts:401`), so **every exercise is a
    "New PR", every time, whatever the history** — Thursday's five.
  - **PRs, cause B (a definition): a first log beats an empty record.** `comparePR`
    (`pr-engine.ts:255-290`) returns a hit whenever the set exceeds `existing`, and `existing` is
    all zeros for a lift never logged. Friday (started properly) still showed first-logs as PRs.
- Prior rulings:
  - Finish: the design already has a pre-finish sheet — `docs/LAYOUT-DESIGN.md:725-759`: "**Finish**
    … opens `FinishSessionSheet` … `Unlogged: OHP S3 · Fly S2, S3` … `[ Finish session ]` … the
    sheet's partial variant lists the unlogged remainder and skipped stops without judgment."
    Designed (phase P3), never built. Ashley's 3 Sep ruling covers only the empty case.
  - PRs: none on first logs. Found and quoted: 16 Sep "the record at bodyweight is MOST REPS IN
    ONE SET" (`BACKLOG.md:6527-6537`), 17 Sep best-set wording, 19 Sep drops are not PRs —
    all about *what kind* of record, none about *whether a first log is one*.
    `SetGrid.tsx:128-133` records the open question: "what that moment should actually show a
    trainee is a product decision". CLAUDE.md delegates the rule itself: "what counts as a
    personal best and how progress is measured" is decided as a CSCS, not asked.
- Fix:
  - Cause A (MECHANICAL): take the snapshot on the implicit path too (in `logSet` when
    `existing?.prSnapshotAtStart == null`). Also add the missing drop exclusion in
    `computeSessionPRs` — it skips warm-ups (`pr-engine.ts:383`) but not `drop_index > 0`, and
    `TodayPanel.tsx:228` hands it the raw `logs`. That is a ninth place a drop can take a best
    (CLAUDE.md lists eight).
  - Cause B (COACHING, decided): **a first log is a baseline, not a personal record.** A PR is an
    improvement on a prior performance; with no prior there is nothing to beat. Implement once,
    in `comparePR`: return null when the existing record has no value for that metric
    (`maxWeight === 0 && maxE1RM === 0` for load, `maxReps === 0` for reps, `maxAddedLoad === 0`
    for added load). The three callers (`checkForPR`, `getTopPRSet`, `computeSessionPRs`) follow.
    For the cache-driven lists see L9/M16.
  - Finish check: build the designed sheet's partial variant — shown **only when working sets
    remain**: "9 of 24 sets logged · Finish anyway / Keep going".
- Class: MECHANICAL (A) + COACHING (B) + OWNER DECISION (the finish check and the first-log words):
  1. **"If you tap Finish with sets still to do, should the app check first?"** (a) Yes, one
     small sheet listing what's left, with Finish anyway — *recommended; it is what the layout
     design already drew, and one mis-tap currently ends a session.* (b) No check, but an Undo
     on the finish card. (c) Leave as it is.
  2. **"What should the app say the first time you log an exercise?"** (a) Nothing special —
     *recommended.* (b) A quiet "Starting point logged" line, no trophy. (c) Keep calling it a PR.
- Ships via: frontend
- Gates: `test:session-derive` §21, `test:bodyweight-progress`, `test:logging-roundtrip`.
  **Two existing checks pin today's behaviour and will go red by design**:
  `scripts/test-bodyweight-progress.ts:173` calls `computeSessionPRs({}, …)` and expects hits;
  the SetGrid PR-badge checks expect a badge on a first bodyweight set. Re-anchor them on a
  second session beating a first. New: "started by a set, then finished → PR list is empty for a
  repeat of last week's numbers".
- Risk: `bodyweight-progress` was built so a kit-less trainee *sees* progress; with baselines not
  counting, their first week shows no trophies — correct, but check `verify:bodyweight-progress`.
- Confidence: high (both causes read end to end).

### L29 · "80m · 710kg · 7/9": the 9 leaves out the added exercise, the 80 minutes includes the outage
- Status: CONFIRMED IN CODE; the counting half is DELIBERATE DESIGN that reads wrong
- Root cause:
  - Sets: `computeSessionSummary` folds off-plan work in "with setsPrescribed: 0 so the totals
    still count it honestly" (`src/lib/session-derive.ts:650-652`, `:686-693`). So the numerator
    counts every logged set (planned, extra rows, unplanned lifts) and the denominator counts
    planned sets only. `SessionSummaryDialog.tsx:80` prints them as one fraction.
    The same file already holds the better rule for the per-exercise track: "TOTALS ARE THE
    LARGER OF PRESCRIBED AND DONE" (`session-derive.ts:273-275`).
  - Minutes: `durationMinutes = finishedAtIso − startedAtIso` wall clock (`:696-699`), and
    `startedAtIso` can be earlier than the first set (M7, path 3). Session history shows a
    different figure again — the server's `finished_at − started_at` (`daily-tracking.ts:81-84`).
- Prior rulings: `LAYOUT-DESIGN.md:743` "Duration from `startedAtIso → getAppNow`" — wall clock is
  the design. None on the fraction.
- Fix: show planned work as its own fraction and extras beside it — "6/9 sets · +1 extra" — by
  summing `setsCompleted` only where `setsPrescribed > 0` for the fraction. Duration (COACHING):
  a session's length is first working set to last working set plus its rest, not the time the
  screen was open; use `max(completed_at) − min(completed_at)` of today's working sets plus the
  last set's prescribed rest, and label the tile "Training time". Write the same figure to
  `workout_sessions.duration_minutes` so the card and history agree.
- Class: MECHANICAL (fraction) + COACHING (what "duration" measures). CLAUDE.md: a metric whose
  meaning changes must say so — earlier durations are not comparable.
- Ships via: frontend
- Gates: `test:session-derive` `:281-282` **pins the current fraction** ("setsCompleted counts
  every logged set incl. off-plan" / "setsPrescribed counts only the planned baseline") and
  `:280` pins wall-clock duration — both need re-anchoring.
- Risk: none beyond the two pinned checks.
- Confidence: high.

### L16 · "Rest complete — re…" is cut off and stays up after the session is finished
- Status: CONFIRMED IN CODE
- Root cause: `src/components/BottomDock.tsx:209-212` — the sentence is
  `<p className="text-sm font-medium truncate">Rest complete — ready for set {n}?</p>` beside two
  `shrink-0` buttons ("Start next set ▸", "Dismiss") in a dock capped at `md:w-96` (384px) on
  desktop; the text gets what is left. It stays because finishing never clears the rest:
  `finishSession` (`useActiveSession.tsx:464-496`) does not call `dismissRest`, and the dock's
  rest branch is not gated on session status (`BottomDock.tsx:50-51`). It clears itself after
  five minutes (`REST_OVERRUN_GRACE_MS`, `:175`).
- Prior rulings: 8 Sep 2026 — Ashley reported it "does not clear after a rest period" and "clips
  the chat box"; the five-minute auto-clear was the answer (`useActiveSession.tsx:736-750`).
- Fix: `finishSession` clears the rest (state and record) on both of its exits; shorten the line
  to "Ready for set 3?" and let it wrap (`truncate` → two lines) or drop "Dismiss" to an ✕.
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:exercise-today`, `test:no-forked-state`, `test:timer-intent-copy`, `verify:chat-bubbles`
  read the dock. New: driver — log last set, Finish, assert no rest bar.
- Risk: none.
- Confidence: high.

---

## Part 4 · Personal records, Home lines, streak

### L9 · Home reads "romanian deadlifts from 16 kg" after 30 was logged; Recent PRs lists three warm-up moves and no loaded lift
- Status: CONFIRMED IN CODE (three causes)
- Root cause:
  - **Lower case:** `src/components/Dashboard.tsx:133-135` —
    `return LIFT_SHORT_NAME[name] ?? name.toLowerCase()`. The table's key is `'Romanian Deadlift'`
    (`:128`) but the catalogue's name is `'Romanian Deadlifts'` (VERIFIED: 0 matches for the
    singular in `exercise-db.ts`, 1 for the plural). Three of the eight keys match nothing
    (`Romanian Deadlift`, `Front Squat`, `Incline Barbell Press`), so they fall to the
    lower-cased full name.
  - **"from 16 kg":** `leadLift` is the heaviest *planned* number, never a logged one
    (`src/lib/dashboard-data.ts:261-264`), and the same sentence is built when the session is
    done (`Dashboard.tsx:439-443` — every status except `in_progress` takes the "from" branch).
    It also prints a per-hand number with a bare "kg" (`${kg} kg`), against the "14kg per hand"
    ruling, and ranks a per-hand 16 against totals.
  - **Recent PRs:** `dashboard-data.ts:333-341` takes every PR-cache entry dated in the last 7
    days and sorts by date only. On day one every lift has the same date, so the order is the
    database's row order — the session's first exercises, i.e. the warm-up primers — and
    `Dashboard.tsx:824` shows the first three. With "first log = record" (M12 cause B) every
    exercise qualifies.
- Prior rulings: `BACKLOG.md:13865` "HALF THE WEIGHTS IN A PLAN SAID THE WRONG THING … Wording is
  Ashley's: '14kg per hand'" and its gate "nobody hand-rolls a kg string" (`test:load-display`).
  `Dashboard.tsx:431-438` records a deliberate choice not to say "next". None on which PRs headline.
- Fix: fix the three dead keys and fall back to the catalogue name as written (not lower-cased);
  format the load through `formatLoad(kg, labelModeForEntry(entry))`; once sets exist for the
  lead lift today show what was lifted ("Romanian Deadlifts · 30 kg per hand today") and drop the
  plan figure when the session is done. Recent PRs (COACHING, decided): only real improvements
  (date later than the lift's first logged date), never `mechanics_tier === 'primer'`, loaded
  lifts before bodyweight ones, then by size of improvement.
- Class: MECHANICAL (name, unit, done-state) + COACHING (which records headline — basis: a
  record is progress on a trained lift; a warm-up drill's rep count is not a training outcome)
- Ships via: frontend
- Gates: `test:dashboard`, `test:load-display` (does not currently read `Dashboard.tsx`'s glance
  line — add it), `test:plan-unknown`. New: a check that every `LIFT_SHORT_NAME` key exists in
  the catalogue (it would have caught this).
- Risk: none.
- Confidence: high.

### M16 (PR half) + L32 (PR-at-0kg) · "New PR this week: Standing Band Hip Abduction at 0kg"
- Status: CONFIRMED IN CODE
- Root cause: the record's kind is dropped on the way to the sentence.
  `dashboard-data.ts:485` — `recentPRs: recentPRs.map(p => ({ exerciseName: p.exerciseName, weightKg: p.weightKg }))`
  — and `src/lib/coach-tips.ts:96-97` — ``return `New PR this week: ${pr.exerciseName} at ${pr.weightKg}kg.` ``.
  A bodyweight record legitimately has `weightKg: 0` (`dashboard-data.ts:90-92` says so). It is
  `recentPRs[0]`, i.e. the first primer (see L9). The same unit-less shape is live in three more
  places: `src/lib/coach-nudge.ts:182` and `:217` (`at ${input.recentPR.weightKg}kg`) and the
  text handed to the coach, `src/components/ChatAssistant.tsx:1667`
  (`` `${pr.exerciseName} ${pr.weightKg}kg (${pr.date})` ``). Two neighbours in the same file were
  fixed (`ChatAssistant.tsx:1030`, `:1220` use `personalBest(bestReadingOf(...))`).
- Prior rulings: CLAUDE.md — "A NUMBER NEVER REACHES A SCREEN WITHOUT ITS UNIT … the KIND travels
  with the value and the renderer has no default branch: `personalBest(metric, value)` in the
  phrasebook". This is that ruling, unapplied at four sites.
- Fix: pass `metric` and `value` through `CoachTipContext` and `coach-nudge`'s input; build all
  four sentences with `personalBest(bestReadingOf(pr.metric, pr.value))`. Then the L9 filter stops
  a primer being chosen at all.
- Class: MECHANICAL (the ruling exists)
- Ships via: frontend (the coach's context string is built in the browser)
- Gates: `test:dashboard`, `test:coach-nudge`, `test:coach-voice`, `test:bodyweight-progress`.
  New: grep-style gate "no `weightKg}kg` template outside the phrasebook" plus a behavioural
  check feeding a reps record through each of the four builders.
- Risk: none.
- Confidence: high.

### M16 (streak half) + M31 · "2 days streak" half an hour after sign-up, and still "2" after a second day's workout
- Status: CONFIRMED IN CODE and REPRODUCED by replaying the real `computeStreak`
  (`scratchpad/streak-sim.ts`): first workout only → **1**; plus the Tuesday "football" entry →
  **2**; plus Friday's workout → **2**; Friday without the football entry → **1**.
- Root cause — the streak counts *scheduled weekdays that have a log*, read from the plan's
  weekday pattern and nothing else (`src/lib/dashboard-data.ts:356-379`, `src/lib/streak.ts:57-86`):
  1. **Why 2 on day one.** "I did something else instead" was recorded for Tuesday 6 October —
     two days before Sam's plan existed. That sheet offers the verb on any past day
     (`WhatHappenedSheet.tsx:144` `if ((isPast || isToday) && !declared.swapped) out.push('something_else')`,
     no plan-start test) and writes a cardio log dated that day (`:251`). The streak reads cardio
     dates (`dashboard-data.ts:348`) and Tuesday is a scheduled weekday, so it scored: Thursday + Tuesday = 2.
  2. **Why still 2 on day two.** Friday is not one of Sam's weekdays, so
     `if (!day.scheduled) continue` (`streak.ts:64-67`) skips it — the workout he did on Friday
     (Monday's session, moved) is invisible to the streak. `loadDashboardData` is handed `moves`
     (`:182`, `:194`) and uses them for today's card, but the streak loop never looks at them.
  3. **The promise this breaks.** The move card says "won't count as a missed session, and it
     won't count against your week" (`ChatAssistant.tsx:3112`, `:3166`, `:3364-3392`). In the
     streak a moved-from day *is* a miss — it spends that week's one make-up token
     (`streak.ts:77-80`) — and the day the work was done earns nothing. Two moved sessions in one
     plan week, both completed, break the streak. A chosen rest day is also scored as a miss.
  4. The label says "days" (`Dashboard.tsx:516-517`) for a count of sessions.
- Prior rulings: `streak.ts:2-5` quotes the spec — "a day counts if any set or cardio was logged;
  rest days are transparent; the streak breaks on a scheduled training day with nothing logged;
  one make-up token per plan week" — and `:13-20` records that freezing "was this day scheduled"
  per session "isn't built this round". `useTrainingWeek.ts:181-186` (Ashley's call): days before
  the plan "are not part of the plan and are not counted". `:84-87` leaves "does a swapped day
  count as done" explicitly open for her. No ruling on moves in the streak.
- Fix (COACHING for the rule, decided as a CSCS — the unit of consistency is the planned session,
  wherever in the week it was done):
  - Build the streak's `scheduled` flag per **date** with the resolver every screen already uses,
    `sessionForDate({ date, plan, moves })`: a moved-from day is transparent, the day it landed on
    is scheduled. Needs the moves for the whole 35-day window (`getSessionMovesInRange`), not just
    this week's.
  - Dates before `planStartStr` are transparent (neither count nor break) — the rule
    `useTrainingWeek` already applies to the strip.
  - A chosen rest day is transparent; a day marked missed is a miss.
  - Do not offer "I missed it" / "I did something else" on days before the plan started.
  ```ts
  const resolved = sessionForDate({ date: dateStr, plan: exercisePlan, moves: allMoves })
  const scheduled = dateStr >= planStartStr && !resolved.movedTo && isScheduledDay(resolved.day)
  ```
- Class: COACHING (the rule) + OWNER DECISION (the words):
  **"What should the streak on Home count?"** (a) Planned sessions done in a row, labelled
  "2 sessions in a row" — *recommended; it is what the number already is, and it stops a rest
  day looking like a broken streak.* (b) Calendar days with anything logged. (c) Weeks in which
  every planned session was done.
- Ships via: frontend
- Gates: `test:dashboard` §streak (`:155-200`), `test:activity-streak`, `test:local-dates`,
  `test:session-move`, `test:coach-moments` (the streak is also sent to the phone-notification
  facts, `Dashboard.tsx:269-272`). None builds the streak input with a move or a pre-plan log.
  New: the four rows of the replay above as fixtures, plus "two completed moves in one week keep
  the streak".
- Risk: this changes what the streak measures — numbers before and after are not comparable
  (CLAUDE.md's rule; there are no live users). `consistency` and `session_pace` share
  `streakDays` (`dashboard-data.ts:405-416`) and will move with it; that is the intent but must be
  re-read.
- Confidence: high on the mechanism (reproduced). Medium that the football entry preceded the
  first look at Home on Thursday — the log does not give the order, but nothing else in the code
  can produce a 2.

---

## Part 5 · Session history and "what happened"

### M15 + M30 · History counts "swapped · 0m · 0kg · 0 sets" and "moved" rows; "5 sessions · 7 PRs" after two workouts; a future-dated entry; mixed titles
- Status: CONFIRMED IN CODE — and the arithmetic matches exactly
- Root cause:
  - **Day flags live in the sessions table.** Marking a day rest / moved / missed / swapped
    inserts a `workout_sessions` row when none exists: `src/lib/daily-tracking.ts:136-145`
    (`split_type: 'rest'`), `:245-255` (`'moved'`), `:301-309` (`'missed'`), `:350-357`
    (`'swapped'`), each with `duration_minutes: 0, is_completed: false`.
  - **History lists every row.** `src/lib/exercise-history.ts:332-337` selects
    `workout_sessions` by profile with no filter, and `ToolsTab.tsx:124` counts
    `rows.length`. Sam's rows: Thu 8 (real), Fri 9 (real), Mon 5 (moved → Fri), Tue 6 (swapped,
    football), Sat 10 (moved → Sun) = **5**. Thursday night it was Thu + Tue + Mon = **3** (M15).
  - **The future date.** A move is stored on the *origin* day (`daily-tracking.ts:151-153` "ONE
    COLUMN, ON THE ORIGIN ROW"), so Saturday's move to Sunday is a row dated Saturday 10 October.
  - **"7 PRs"** is `Object.keys(getPRCache(profileId)).length` (`ToolsTab.tsx:124`) — the number
    of exercises ever logged, not records.
  - **The titles.** `SessionHistoryDialog.tsx:91` prints `{entry.day ?? entry.splitType} · {entry.date}`.
    `day` is only filled when the row is created by the first *set*: `set-log-store.ts:397-407`
    stores `{ startedAt, weekNumber, day }` for the date, and `ensureSessionSynced` inserts
    `day: entry?.day ?? null` (`:498-509`). When **Start workout** is pressed first,
    `startSession` calls `ensureSessionSynced` before any set exists (`useActiveSession.tsx:461`),
    so the row is inserted with `day: null, week_number: null` and is never corrected (the
    fill-blanks branch only runs `if (!existing.started_at …)`, `:489-496`). Thursday was started
    by a set ("Thursday"); Friday by the button ("training"). This matches the M7 correction on
    both days.
- Prior rulings: `daily-tracking.ts:139-140` "Names what this row is rather than borrowing a
  training split it never had" — the placeholder split is deliberate; listing those rows as
  sessions is not. `SessionHistoryDialog.tsx:80` already calls the list "completed sessions"
  in its empty state. None found on titles or date format (L24 is another tracer's).
- Fix:
  - History = rows with at least one working set (or `is_completed`), never a row whose only
    content is a day flag. Count the same set in `ToolsTab`.
  - Title from data that always exists: the weekday and a readable date derived from `date`
    ("Thu 8 Oct"), plus the plan focus when it can be read from the set rows' own
    `week_number`/`day` (which are always written, `set-log-store.ts:635-636`). Stop reading
    `workout_sessions.day` for display.
  - Pass the day through on the Start path too (`ensureSessionSynced` takes `dayName`/`liveWeek`
    from the caller) so `workout_sessions.day` is never null — the coach's "how did Friday's
    session feel" reads that column (`session-feel.ts:186`, `:214`).
  - "N PRs" counts records under the M12 definition, or the subtitle drops it.
  - A swapped day with a cardio log appears as an activity entry (the H21 fix supplies it).
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:exercise-history`, `test:tools-grid`, `test:overlay-artifacts`,
  `test:what-happened`, `test:training-week`. New: fake-Supabase check — a moved row, a swapped
  row and one real session return exactly one history entry; and "Start then log" writes a
  non-null `day`.
- Risk: `block-consistency.ts:64-67` treats "a real workout_sessions row per date" as *attended*
  — it has the same blind spot (a moved/rest/missed row reads as attendance). Not in this
  tracer's list; flagged for whoever owns block review.
- Confidence: high.

### M14 · "I did something else instead" (football, 60 min, Hard) leaves only a ⇄; the day card and programme still show the planned session
- Status: PARTLY — the glyph and the uncounted session are DELIBERATE DESIGN; the silent day card is a gap
- Root cause:
  - The write is complete: `WhatHappenedSheet.tsx:245-254` sets `swapped_for_activity` and saves
    the cardio log. The strip shows ⇄ because `classifyDay` returns `'swapped'`
    (`useTrainingWeek.ts:167`).
  - On **today**, the card says so: `TodayPanel.tsx:993-999` "You swapped today for {activity}.
    This session is still here if you want it." On a **peeked** day (which a past Tuesday always
    is) the branch at `:911-946` handles moved-away and rest, then falls straight to
    `<PeekPanel workout={peekWorkout} …>` — `peekCell.state === 'swapped'` and
    `peekCell.swappedForActivity` are in hand and unused. So the card shows Back & Biceps with no
    mention of football.
  - The programme view reads the plan only; a swap is a fact about a date, not a plan edit
    (the same reason a moved day does not edit the plan).
  - Tuesday 6 October was before Sam's plan existed; the verb should not have been on offer
    (see the streak finding).
- Prior rulings: `useTrainingWeek.ts:78-87` — a swapped day is left out of the session tally on
  purpose, "one entry in this predicate if Ashley prefers it". `TodayPanel.tsx:976-980` — "The
  list stays visible — she may still want to train — but the screen has to say what it knows
  first." `CLAUDE.md`: "Swap the session for an activity — both, and it asks first".
- Fix: on a peeked swapped day, show the same banner in the past tense with the activity's own
  line ("You did football instead · 60 min · Hard") above a dimmed planned list; the strip cell's
  label/aria says the activity. Leave the programme view alone.
- Class: MECHANICAL (apply the existing today-card rule to the peek). No new ruling needed.
- Ships via: frontend
- Gates: `test:what-happened`, `verify:what-happened`, `verify:swapped-day`, `test:training-week`.
  `verify:swapped-day` drives today's card; add the peeked-past-day case.
- Risk: none.
- Confidence: high.

---

## Part 6 · Logging controls

### M10 · "Ban exercise" fires instantly — no confirm, no message, no undo
- Status: CONFIRMED IN CODE; the fix is already DESIGNED and unbuilt
- Root cause: the menu item calls straight through — `ExerciseRow.tsx:421`
  `<DropdownMenuItem variant="destructive" disabled={banBusy} onClick={onBan}>` →
  `TodayPanel.handleBan` (`:742-749`) → `App.handleBanExercise` (`App.tsx:2406-2470`), which
  writes the preference, rewrites every week (`banExerciseFromMesocycle`) and saves. Success
  says nothing (`setWriteError(null)`); only failure speaks. Deleting one set, by contrast, is
  tap-then-confirm (`SetGrid.tsx:715-722`).
- Prior rulings: `docs/LAYOUT-DESIGN.md:874-883` — "Today ban is a one-tap, no-confirm, no-undo
  destructive act … It becomes propose-and-confirm everywhere it exists: the `⋯` entry opens a
  confirm card stating blast radius ('removes {name} from your whole plan and future suggestions;
  slots refill with the best alternative'), and the receipt carries the durable Undo".
  `docs/VISION-ARCHITECTURE.md:838` — "Direct manipulation stays immediate except for
  high-blast-radius actions (ban, regenerate, reset)". The coach's ban already asks first
  (`CLAUDE.md`, "Ban it from every future plan — both"). So the screen is the odd one out.
- Fix: route the ⋮ item through a confirm step naming how many sessions change and what replaces
  it (the coach's card already computes this), then a receipt line. Undo only if both writes can
  be reversed (delete the `user_facts` row and restore the pre-ban weeks); otherwise no Undo
  button, as the design says ("never a dead Undo button").
- Class: MECHANICAL (ruled in the design docs)
- Ships via: frontend
- Gates: `test:audit-fixes`, `test:silent-writes`, `test:session-edit`, `verify:session-edit`
  §1f-1h, `verify:coach-ban`. New: driver — tap Ban, assert nothing was written before confirm.
- Risk: `PeekPanel` and `ProgramBrowse` call the same handler; all three must get the confirm.
- Confidence: high.

### M11 · Weight typed on set 1 does not carry to set 2; ticking a blank set saves "Bodyweight"
- Status: CONFIRMED IN CODE
- Root cause: a blank weight falls back to *typed → last week → the plan*, never to the set just
  done. `SetGrid.tsx:564-566` —
  `parseFloat(input.weight || (ghost ? String(ghost.weight_kg) : defaultWeightFor(ref))) || 0`.
  For a movement with no planned weight that can be done unloaded (Box Squat),
  `defaultWeightFor` ends `return catalogEntryIsLoaded ? '' : '0'` (`:444`), and then
  `const isBodyweight = input.isBodyweight || (weight === 0 && isBodyweightCapable)` (`:573`)
  files it as bodyweight. The "same · 14 / +2 · 16" chips the tester liked exist only in
  calibration week on lifts that carry a planned weight (`:1085`, `calibrationProbe` at `:191`).
- Prior rulings: 18 Sep 2026 "mark them 'last time'" — faint numbers must say whose they are.
  `SetGrid.tsx:438-444` — never invent 0 for a movement that needs a weight. None on carrying a
  weight down within a session.
- Fix (COACHING, decided: straight sets repeat the load unless the plan says otherwise): when a
  row has no per-set prescription of its own (`perSetLoadKg?.[n-1] == null`) and the previous
  working set **today** was logged with a weight, that weight (and its bodyweight flag) is the
  row's default, shown as the placeholder and marked "same as set 1" — ahead of last week's
  ghost. A ramped prescription keeps its own numbers. A row whose previous set was weighted can
  no longer silently become bodyweight.
- Class: COACHING (basis: within-session load is held constant across straight sets; the app
  recording a 22.5 kg set as bodyweight understates the work and feeds progression a false zero)
- Ships via: frontend
- Gates: `test:logging-roundtrip`, `test:set-plausibility`, `test:calibration-search`,
  `test:one-day-one-look`, `verify:one-number` §8 ("last time"), `verify:absurd-weight`.
  New: driver — type 22.5 on set 1, blank-tick set 2, read "22.5kg" on the receipt.
- Risk: calibration week deliberately has **no** default on sets 2+ (`:428-434`) — the carry must
  not apply there; and a hint and a record must not look alike, so the placeholder needs its marker.
- Confidence: high.

### M9 · "Anything feeling tight?" → Hips adds moves already in the warm-up, says "do these first", lists them last
- Status: CONFIRMED IN CODE
- Root cause:
  - No comparison with the warm-up it is added to. `TodayPanel.tsx:187-190` —
    `tightnessWarmup(tightAreas, profile?.injuries ?? [])` — and `src/lib/tightness.ts:118-123`
    picks from the whole drill catalogue (`drillsPreparing`, `warmup.ts:706-723`) with no
    knowledge of `workout.warmup`. A hip-heavy leg day already holds the best hip drills, so the
    top three are duplicates.
  - The sentence and the layout disagree. `tightness.ts:138-140` — ``…you said felt tight — do
    these first.`` — but `WarmupSection.tsx:69-102` renders General, then Mobility, then the
    "For what feels tight" block.
  - 6 → 10 minutes is the duplicates being added in full (`WarmupSection.tsx:56`, `:64`).
- Prior rulings: `CLAUDE.md` (15 Sep 2026): "up to three mobility drills go in at the **front** of
  TODAY's warm-up, with a line saying why and an honest account of anything it could not cover."
  The build put them at the back.
- Fix (COACHING, decided): pass the day's warm-up names in; a drill already present is not added
  again — it is *named* ("Your warm-up already has World's Greatest Stretch for your hips — give
  it an extra round") and adds no minutes; only genuinely new drills are added. Order: general
  pulse-raiser first, then the tight-area drills, then the session's own mobility. Change the
  line to match what is on screen ("do these straight after the general warm-up").
- Class: COACHING (basis: raise temperature before targeted mobility; never programme the same
  drill twice in one warm-up; extra mobility should cost minutes only where it adds something)
- Ships via: frontend
- Gates: `test:tightness`, `verify:tightness`, `test:bundle`. New: a fixture day whose warm-up
  already holds the top hip drill → zero duplicates; and a render-order check anchored on the
  rendered blocks (CLAUDE.md: "a declaration is not a render").
- Risk: `uncoveredNote`'s three states (`tightness.ts:152-166`) gain a fourth — "already covered".
- Confidence: high.

### M13 · "Add an exercise" on leg day suggests Arm Circles and two band moves: "Your shoulders gets the least work in this session"
- Status: CONFIRMED IN CODE and REPRODUCED — 8 of 8 generated Sam-like leg days
  (`scratchpad/add-sim.ts`: minimalist, shoulder flag, Mon/Tue/Thu/Sat). Seed b printed exactly
  the tester's screen: *Arm Circles, Band Face Pulls, Band Pull-Aparts — "Your shoulders gets the
  least work in this session — 2 sets. This adds more."*
- Root cause:
  - The session's "theme" is built from every row on the day, including the warm-up primers:
    `src/lib/exercise-add-candidates.ts:60-71` (`dayMuscleSets` loops `day.exercises`). A user
    with a shoulder flag gets a shoulder-care primer on every day (Wall Slides / Band Dislocates,
    2 sets) — so on leg day "shoulders" is a muscle the day "trains", with the fewest sets.
  - The ranking then rewards exactly that: `:117-119` `score = 2 + (leadSets <= leastInDay ? 2 : 0) + (!isMainLift ? 1 : 0)`.
    The file's own header (`:20-31`) records the first version offering squats on a bench day and
    switching to "overlap"; the primer slips through that fix.
  - Primers are themselves offered as additions (no `mechanics_tier` filter), and because the
    pool is injury-filtered (`getConstrainedPool`), the only shoulder moves left for this user
    *are* primers and bands.
  - Grammar: `:122` ``Your ${leads} gets the least work`` with a plural group name.
- Prior rulings: 13 Sep 2026 — "show everything, warn me" (suggested list = constrained pool;
  search reaches the catalogue). `exercise-add-candidates.ts:92-99` — "it has to train something
  this session already trains". Neither intends warm-up drills to define the session.
- Fix (COACHING, decided): build the theme from working exercises only (skip
  `mechanics_tier === 'primer'` and finishers); never suggest a primer as an addition (search
  still reaches it); with a flagged area, do not rank that area up as "least worked". Verb
  agreement by group ("shoulders get", "chest gets").
- Class: COACHING (basis: an added exercise extends the session's training stimulus; movement
  prep is not volume, and a flagged joint is not a gap to fill)
- Ships via: frontend
- Gates: `test:exercise-add`, `test:edit-keeps-the-bar`, `verify:exercise-add`. The existing
  fixture is a full-gym, no-injury push day — comfortable, so it never reaches this. Pin a leg
  day from an injured, limited-kit profile (the replay names eight).
- Risk: the coach's "add an exercise" uses `resolveAdditionRequest`, not this ranking — unaffected.
- Confidence: high.

### M8 · Kit-swap dialog overflows sideways with clipped cards; the old red error survives Back
- Status: CONFIRMED IN CODE (stale error VERIFIED; overflow mechanism read, not rendered)
- Root cause:
  - **Overflow:** the kit choices are shared `Button`s whose base class forbids wrapping —
    `src/components/ui/button.tsx:7` `"inline-flex … whitespace-nowrap … shrink-0"` — holding a
    label plus a one-line description (`EditReasonStep.tsx:115-128`, class
    `CHIP = 'w-full min-h-[44px] justify-start text-left'`). The descriptions are long:
    "Dumbbells, kettlebells, bands, pull-up bar, weighted bag — no barbell or bench" (79
    characters, `picker-options.ts:23`) and the home-gym one (77). Unwrappable, they are wider
    than the dialog (`sm:max-w-lg`, 512px less padding; ~340px on a phone), so the dialog body
    scrolls sideways and the buttons clip. The reason and hurt chips share the pattern.
  - **Stale error:** the refusal is held by the parent — `SwapDialog.tsx:76`, set at `:152`,
    drawn at `:188` — while "Back" only changes the child's own step
    (`EditReasonStep.tsx:130` `onClick={() => setKitting(false)}`). Nothing tells the parent to
    clear it. `RemoveExerciseSheet` takes the same shape (M26's "red error text from one step
    stays on screen through the next").
- Prior rulings: none on layout. The picker itself is designed (`EditReasonStep.tsx:105-110`).
  What the kit answer *does* (H2) is another tracer's.
- Fix: `CHIP` adds `h-auto whitespace-normal py-2` and the text column `min-w-0`; the step
  component owns its error (or calls an `onStepChange` the parent clears on).
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:overlay-artifacts`, `test:swap-style`, `test:exercise-detail`, `verify:hurts`,
  `verify:session-edit` §3c. `EditReasonStep` is read by **no** registered gate by name. New:
  driver overflow check (`scrollWidth <= clientWidth` on the dialog at 390px) — the pattern
  `verify:finisher` already uses.
- Risk: none.
- Confidence: high on the stale error; medium-high on the overflow (the classes and string
  lengths are certain; no browser was pointed at the real dialog).

### L10 · Number spinner covers the digits on desktop; Enter does not log a set
- Status: CONFIRMED IN CODE
- Root cause: the boxes are bare `type="number"` inputs with no spinner styling and no key
  handler — weight `SetGrid.tsx:908-920`, reps `:954-966`, cardio minutes
  `CardioSetRow.tsx:243-255` (a 72px box, `grid-cols-[4.5rem_1fr_auto]`). `src/index.css` has no
  `::-webkit-inner-spin-button` / `appearance: textfield` rule (grepped). There is no `<form>`
  and no `onKeyDown` on any of them; only the unplanned-lift name box handles Enter
  (`AddUnplannedWork.tsx:166`).
- Prior rulings: none.
- Fix: one global rule hiding the native spinners on number inputs; `inputMode="decimal"` on
  weight and `"numeric"` on reps; `onKeyDown` Enter → `handleSaveSet(ref)` (and `onSave` in the
  cardio row). INFERRED extra, worth checking while there: a focused `type="number"` box changes
  its value on mouse-wheel in Chrome, which on desktop can silently alter a weight.
- Class: MECHANICAL
- Ships via: frontend
- Gates: `verify:tap-targets`, `test:bounds-and-boundaries`, `test:a11y`. New: driver — type, press Enter, read the receipt.
- Risk: Enter in calibration week must respect the same refusals as the tick (it calls the same function, so it does).
- Confidence: high.

### L11 · An "Add a drop" row cannot be removed and stops a finished exercise collapsing
- Status: PARTLY — removal CONFIRMED; the collapse is a different mechanism
- Root cause:
  - **Cannot be removed:** `handleAddDrop` appends to the persisted extras
    (`SetGrid.tsx:750-755`); the only delete control is inside `isSaved && …` (`:1014-1036`), so
    an un-logged added row — drop, "Add Set" or "Add warm-up" alike — has no way off the screen,
    and it survives a reload (`useActiveSession.tsx:619-627`). The file header admits it:
    "'Remove this set' doesn't ship until P3's active mode" (`:10-13`).
  - **Will not collapse:** which card is open is "the first incomplete exercise" unless the user
    has tapped a header, and that manual choice is never released:
    `TodayPanel.tsx:1324`, `:1353-1354` (`exIndex in expandOverrides ? expandOverrides[exIndex] : defaultExpanded`).
    "Add a drop" only appears under the last *logged* set (`SetGrid.tsx:822`), so to add one
    after the final set you must re-open a card that has already auto-closed — which pins it
    open. The empty drop row is a passenger, not the cause. (INFERRED: the sequence fits; it was
    not driven.)
- Prior rulings: drops are the lifter's own choice, never pre-drawn (`SetGrid.tsx:262-271`);
  `session-derive.ts:509-516` reserves `removedSetNumbers` for exactly this.
- Fix: an ✕ on any un-logged added row (removes the number from the extras record); drop the
  manual open/closed override for an exercise when it becomes complete.
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:drop-sets`, `verify:drop-sets`, `test:session-continuity`. New: driver — add a drop, remove it, count rows.
- Risk: never reissue a removed set number (`session-derive.ts:540-556` already guards "Add Set").
- Confidence: high on removal; medium on the collapse explanation.

### L13 · Focusing a field scrolls the page about 60px, so the next tap lands on the row below
- Status: CONFIRMED IN CODE (deliberate on a phone, wrong on desktop)
- Root cause: every weight and reps box centres itself on focus —
  `SetGrid.tsx:36-39` `e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })`,
  wired at `:917` and `:964`. With no on-screen keyboard there is nothing to dodge, so the page
  slides under a stationary cursor and the ✓ now under it belongs to another row. (The
  standalone page showed the same slide on a field focus.)
- Prior rulings: `LAYOUT-DESIGN.md §7.6` — keep the edited row above the soft keyboard; that is
  what this is for.
- Fix: only do it when a soft keyboard is in play (`matchMedia('(pointer: coarse)')`, or the
  existing `useViewportInset().isKeyboardOpen`), and use `block: 'nearest'` so a row already in
  view does not move.
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:session-continuity`, `verify:tap-targets`. New: driver at desktop width — focus a field, assert `scrollY` unchanged.
- Risk: on phones the row must still clear the keyboard — re-run `verify:tap-targets` and read a phone-size screenshot (CLAUDE.md names a `verify:walk`; no script by that name is registered in `package.json`).
- Confidence: high.

### L27 · Exercise cards shift 8px sideways and clip the title to "3and Tricep Kickback"
- Status: PARTLY — the 8px of hidden overflow is VERIFIED; the app's own trigger was not reproduced
- Root cause:
  - **Why the card can scroll at all.** The open card is
    `'relative overflow-hidden rounded-[18px] pt-4 space-y-2.5'` with no side padding
    (`ExerciseRow.tsx:154`). Its "⋮" is a 28px button flush against the right edge (`:371`,
    `size-7`), and every small button carries an invisible 44px tap area
    (`button.tsx:31-36` + `index.css:925-932`, `width: max(44px, 100%)` centred) — 8px past each
    side. `overflow: hidden` still makes a scrollable box, so the card is 8px wider inside than
    out. A standalone page with those exact rules measured `scrollWidth 1160 / clientWidth 1152`
    — the same +8 the tester saw (1128 / 1120).
  - **What moves it.** In that page, clicking, typing, Tab, programmatic focus, the menu button
    and the app's own `scrollIntoView({ block: 'center' })` all left `scrollLeft` at 0. Only a
    scroll request that centres **horizontally** moved it to exactly 8
    (`scrollIntoView({ block: 'center', inline: 'center' })`). The app never asks for that; a
    browser-automation "scroll to element" does, and so may a phone browser revealing a field
    above the keyboard (not tested). So in the tester's session the likeliest trigger is the
    testing tool itself — but once moved, nothing in the app moves it back, and a real phone may
    do the same.
- Prior rulings: `CardioSetRow.tsx:234-236` records the same 8px tap-area overhang being found and
  padded on the cardio row ("measured by verify:finisher's overflow check"). The lift card never
  got the check. The `overflow-hidden` was for the top "sweep hairline", removed 19 Sep
  (`ExerciseRow.tsx:158-163`).
- Fix: `overflow-hidden` → `overflow-clip` on the card (clips without creating a scroll box), or
  remove it now the hairline is gone, and give the header `pr-2` so the tap area sits inside.
- Class: MECHANICAL
- Ships via: frontend
- Gates: `verify:finisher` has the overflow check for its own row; extend the same assertion
  (`scrollWidth === clientWidth`) to an open exercise card in `verify:tap-targets`.
- Risk: none — `overflow: clip` is supported by every browser the app targets.
- Confidence: high that the fix removes the symptom; **low-medium on who triggers it for a real user.**

### L15 · Volume counts a per-hand load once: 30 kg per hand shows 30, not 60
- Status: CONFIRMED IN CODE; no ruling covers it
- Root cause: the log stores the number as typed, and the app asks for it per hand —
  `SetGrid.tsx:771-774` header "Log weight · per hand". Volume then multiplies that number by reps:
  `session-derive.ts:673` and `:692` (`s.weight_kg * s.reps_completed`), `exercise-history.ts:325`.
  Nothing consults the implement.
- Prior rulings: `BACKLOG.md:13865-13867` — "HALF THE WEIGHTS IN A PLAN SAID THE WRONG THING …
  Wording is Ashley's: **'14kg per hand'** … The logging column mattered most … `exercise_set_logs`
  carries no unit of its own to catch a 2× mistake with." That ruling fixed what the number is
  *called*; it says nothing about volume, so this stands as a gap, not a decision. The engine
  already knows the answer elsewhere: `load-prescription.ts:2047` —
  `return isPerSideLoad(entry) ? load.starting_weight_kg * 2 : load.starting_weight_kg` ("double
  it back to total load moved, the quantity that actually matters").
- Fix (COACHING, decided): volume load is total external load × reps. For a dumbbell **pair**
  (`loadingMode(entry) === 'dumbbell'`) multiply by 2; a one-arm or one-leg movement stays as
  logged. One helper (`volumeKgOf(log)`) used by the finish card, history and any future chart.
- Class: COACHING (basis: volume load = sets × reps × total load; counting one dumbbell of two
  makes a dumbbell day look half the work of a barbell day). CLAUDE.md's rule applies: this
  changes what the number measures — earlier volumes are not comparable (no live users).
- Ships via: frontend
- Gates: `test:session-derive` `:284` pins `60*8*2 + 0 + 20*12` on unnamed exercises — still
  true; add a dumbbell-pair case. `test:per-side-load`, `test:load-display`.
- Risk: PR and progression maths must **not** change — they compare per-hand to per-hand.
- Confidence: high.

### L32 (Tab order) · Tab from the weight field goes to the plate-calculator icon, not reps
- Status: CONFIRMED IN CODE (and seen in the standalone page: Tab went weight → plate → reps → ✓)
- Root cause: source order. Inside a row the elements are weight input (`SetGrid.tsx:908`), plate
  calculator button (`:931-942`), BW button (`:943-953`), reps input (`:954`), ✓ (`:985`).
- Prior rulings: 14 Sep 2026 — the plate calculator "stays on the row" because it is reached
  mid-set. It also exists as a text link on the card (`ExerciseRow.tsx:357-366`).
- Fix: keep the visual grid, change focus order — place weight, reps, ✓ first in the DOM with
  explicit `col-start` classes, calculator and BW after; or `tabIndex={-1}` on the in-row
  calculator icon (its text twin stays reachable).
- Class: MECHANICAL
- Ships via: frontend
- Gates: `test:a11y`, `test:load-display`. New: driver — Tab from weight, assert the active element is the reps box.
- Risk: screen-reader order follows the DOM; keep each row reading number → weight → reps → save.
- Confidence: high.

---

## Shared choke points

1. **One reader for cardio.** H7 and H21 are one missing reader, and the rest-day card already
   has it (`RestDayCard.tsx:142-166`). Build it once (`useCardioReceiptsToday` + one ranged read
   in `getSessionHistory`); the Exercise tab, the finish card, history and M14's activity line
   all draw from it.
2. **`getSetsForDate` and the `logs` state** (`set-log-store.ts:914-936`,
   `useActiveSession.tsx:316-331`). One function that cannot say "I failed", feeding one state
   that cannot say "I'm loading". Fixing those two places fixes "0 logged" on reload, the
   mid-session wipe, and the vanishing dead-lettered set. The same shape sits in
   `getCardioLogsForDateMerged`.
3. **`comparePR` and the PR cache** (`pr-engine.ts:255-290`, `:158-225`). "A first log is a
   baseline" decided once there removes the five false PRs on the finish card, the trophy badge
   on a first set, the warm-up moves in Recent PRs, "7 PRs" in Tools, and the coach's
   "nice PR on Standing Band Hip Abduction" opener.
4. **The "0kg" sentence** — one missing field (`metric`) at `dashboard-data.ts:485`, read by four
   builders (`coach-tips.ts:97`, `coach-nudge.ts:182`, `:217`, `ChatAssistant.tsx:1667`).
5. **`logSet` vs `startSession`** (`useActiveSession.tsx:424-462`). The two start paths differ in
   three things the rest of the app assumes are the same: the clock on screen (M7), the PR
   baseline (M12 cause A), and the session row's `day` (M15/M30 titles — there it is the *button*
   path that is short). Make both paths stamp the same four facts.
6. **Day flags stored as session rows** (`daily-tracking.ts:136-357`). Every reader of
   `workout_sessions` must say whether it wants *sessions* or *days*: history and the Tools count
   (M15/M30) do not; `block-consistency.ts:64-67` has the same blind spot.
7. **`sessionForDate` is the answer to "what runs on this date" — the streak never asks it**
   (`dashboard-data.ts:356-379`). M16/M31, and the unkept "won't count as missed" promise.
8. **The 44px tap-area overhang inside clipped boxes** (`index.css:925-932`). L27 here; already
   patched once on the cardio row. One overflow assertion in `verify:tap-targets` covers every card.
9. **Step sheets whose parent holds the error** (`SwapDialog.tsx:76/188`, `RemoveExerciseSheet`).
   M8's stale red line and M26's (another tracer) are the same wiring.

## Suggested build order

| # | Slice | Bugs | Class | Suggested model · effort |
|---|---|---|---|---|
| 1 | Sets never look lost: failed-read handling, last-known snapshot, loading/stale states, dead-lettered sets stay visible, plain error words, theme-token colours | H20 | Mechanical | Opus · high (data-loss-adjacent; needs a failing fake and a browser driver) |
| 2 | One cardio reader: receipts on the training day, in the finish card, in history; coach reads pending too | H7, H21, M14 (activity line) | Mechanical + 1 owner question | Sonnet · high |
| 3 | Session start parity: clock, PR baseline, `day` on the row; rest bar cleared on finish | M7, M12 (cause A), M30 (titles), L16 | Mechanical | Sonnet · medium |
| 4 | What a PR is: baseline rule in `comparePR`, cache/Recent PRs filter, unit-carrying sentences, drop exclusion in the session list | M12 (cause B), L9, M16, L32 | Coaching + 1 owner question (first-log words) | Opus · medium (re-anchors two existing gates) |
| 5 | History and streak tell the truth: history lists sessions only; streak uses dated sessions, moves and plan start; no day verbs before the plan | M15, M30, M16, M31 | Mechanical + Coaching + 1 owner question (streak label) | Sonnet · high |
| 6 | Finish check and summary numbers: partial-finish sheet, planned/extra fraction, training time, per-hand volume | M12 (check), L29, L15 | Owner question + Coaching | Sonnet · medium |
| 7 | Plan-edit manners: ban confirm + receipt, error bar where the tap was, stale step errors, kit-chip wrapping | M10, M29, M8 | Mechanical | Sonnet · medium |
| 8 | Coaching details: carry the weight down, tightness dedupe and order, add-exercise theme | M11, M9, M13 | Coaching | Sonnet · medium |
| 9 | Desktop and polish: spinners, Enter, focus scroll, card clip, Tab order, removable added rows, Home lift line | L10, L13, L27, L32, L11, L9 (name/unit) | Mechanical | Haiku · low (L11 and L9: Sonnet · low) |

Owner questions, in the order they block work: (1) check before finishing with sets left;
(2) where logged cardio shows; (3) what the first log of an exercise says; (4) what the streak
counts and is called. Every one has a recommendation above and a safe default if unanswered
(1a, 2a, 3a, 4a).

Slices 4, 5 and 6 each change what a number on screen *means* (PR count, streak, volume,
duration). CLAUDE.md asks that such changes are said out loud; there are no live users, so no
transition is needed, but the BACKLOG entries should say prior figures are not comparable.
