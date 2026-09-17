# Tools, frame 4a — one card, and the protocols beside it

Ashley sent `design_handoff_tools_grocery` again on 13 Sep 2026 and said "implement this".
The archive was named *Chat layout improvements* and did not contain the chat handoff; asked
which she meant, she chose **build the Tools timer screen**.

## What was already built, measured before starting

Most of this handoff shipped on 12 Sep. Present and correct: `RoundCard` with the derived
phase colours sharing one map with `RoundField`; full screen opt-in behind `roundFullScreen`;
grocery gone from Tools, with its own route, the aisle groups, the trolley row, the Home
shop-day card and the `shopDay` preference.

What is NOT built is the part frame **4a** added after 2a, and the README says so plainly:
*"4a supersedes 2a for the Tools layout: no 'Change the intervals' row, no Stopwatch/Lap/Round
tab strip, one card always present."* The tab still has the row (`ToolsTab.tsx`), the strip
(`TimersPanel.tsx`), and a card that renders only while a round is live.

## The four things 4a asks for

1. **The card is always there.** Idle it holds the total time — "Ready · 8 rounds", `3:50`,
   "20s work · 10s rest", dim pips, **Start** + **Full screen**. Starting swaps the clock in and
   nothing moves.
2. **Protocol chips directly under it**, always visible, replacing the row: Tabata · 8×20/10,
   40/20 · 8 rds, 30/30 · 10 rds, Boxing · 3×3 min, EMOM · 10 min, Custom · the user's saved
   values. Today's conditioning, when it parses, is the first chip with a star.
3. **A tap while running QUEUES.** The chip takes an amber "from round N+1" badge, the card
   grows a strip — "Switching to 40/20 at round 4" with **Undo** — and nothing about the round
   in progress changes.
4. **Custom opens in place**, beneath the chips, above a hairline: Work / Rest / Rounds chip
   groups and "Saved as your Custom chip" ↔ **Done**. The card's total re-reads live.

## The one real engineering problem, and the decision

The timer engine's single hard-won property is that **everything derives from one immutable
anchor**: round, phase and remaining are all `(now − startedAt)` against `(rounds, work, rest)`.
Its header records that a stored per-phase deadline is what corrupted it before.

A queued switch breaks that in the obvious implementation, because "rounds 4 to 8 at 40/20"
is two schedules in one block. Restarting with the new protocol is trivial and wrong: the card
would say "Round 1 of 5" one second after promising "at round 4".

**Decided: carry the completed part, don't re-anchor the meaning.** `RoundConfig` gains ONE
optional, display-only field:

```ts
carried?: { rounds: number; seconds: number }
```

— what this session already did before this block began. The switch starts a genuinely new
block (new anchor, new config, `leadInSeconds: 0` so there is no second countdown) whose
`rounds` is only what remains, and every display function reads the session through two
helpers, `sessionTotalRounds` and `sessionRoundNumber`, so the numbering stays continuous.
`totalRoundSeconds` deliberately does NOT count `carried` — it is what `useTimers` banks into
`accumulatedMs` to hold the finished state, and that is a fact about the current block's
schedule.

`roundLogSummary` DOES count it, because the cardio log is about the session: eight rounds
were done, and a log saying five would be the app disbelieving her — the same defect its own
header was written about.

Rejected: a second anchor per segment (the corruption the engine was rewritten to remove); a
`switchedAt` flag on the record (a second source of truth for a number the config already
carries).

## State

Two additions to the persisted timer record, both cleared by reset:
- `selectedRoundConfig` — what **Start** would run, so the idle card and the chips agree and
  survive a tab switch. Provider-owned for the reason `roundFullScreen` already is.
- `queuedRoundConfig` — the pending switch, applied by the boundary watcher in the provider,
  cleared by **Undo**.

No new stores, no migration: the record is device-local `localStorage`.

## Verification

- `test:round-timer` — the carry arithmetic: a switch at round 3 of 8 leaves five rounds, the
  headline reads "Round 4 of 8", the pips total 8, and the logged duration covers both halves.
- `test:round-presets` — the chip row is derived from `ROUND_PRESETS` (not a second table), the
  numeric suffix comes from the config, and today's conditioning leads when it parses.
- `test:tools-grid` — RE-ANCHORED. It currently pins `data-change-intervals`, which 4a deletes;
  the property is that the interval choice is ON the tab rather than behind a second screen,
  read from whatever control carries it.
- `verify:tools-timer` — at 390×844: run a Tabata, screenshot work, rest and finished; confirm
  Pause is amber on rest and the card turns red at the end; confirm a running round no longer
  hides the tab; tap a different protocol mid-round and read the queued strip off the screen,
  then Undo it.
- Every new check mutation-tested, tried/caught reported.

## Deploys

Frontend on merge. No edge function, no migration.
