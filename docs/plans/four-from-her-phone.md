# Four from her phone

*3 Sep 2026. Ashley used the live app and reported four things. Two dead
controls, and two writes that landed with no visible consequence.*

## The shared lesson

Two of the four were **not** the app claiming something false. The receipts
were honest: the rest day really was written to `workout_sessions`, and the
steak really was inserted into `meal_plan_slots`. The receipt framework does
what it promises — it never claims a write that did not happen.

**What it does not promise is that anyone ever SEES the result.** Both reports
came from that gap: a correct write, an honest receipt, and a screen that went
on showing the old state. From the user's side that is indistinguishable from
a lie, which is why it has to be treated as the same severity.

## 1. "How to do it" did nothing

`ExerciseTab.tsx` returns from two places. The Full Program branch rendered
`<ExerciseDetailDialog>`; the **session branch** passed `onOpenDetail` to
`TodayPanel` — so the menu item appeared and set `detailTarget` — and rendered
no dialog. State set, nothing listening. Dead on the one screen where a form
cue is most wanted: mid-set.

Fixed by rendering the dialog in that branch too, matching how the file
already duplicates `SwapDialog` and `ExerciseHistoryDialog`.

## 2. Meal names were unreadable

`MealPlan.tsx` applied Tailwind `truncate` — one line, hard ellipsis — to the
meal name in **both** collapsed and expanded states, so opening the card did
not reveal it either. Alternatives in the swap list had the same. Now the name
wraps when expanded and clamps to two lines when collapsed.

## 3. Rest day marked, strip unchanged

`useTrainingWeek`'s refresh was `useCallback(…, [profileId, sessionDate])`.
Nothing re-ran it after a chat write, and `onLogsUpdated`'s `logsVersion` went
only to `ActiveSessionProvider`. Added a `refreshToken` param — the idiom that
provider already uses — threaded from App through Dashboard.

## 4. The steak

**(a) Never rendered.** `mealPools` was refilled on load, generation,
regenerate and reset — never after a chat addition. So the pick pointed at a
meal the component did not hold, `mealPools[slot]?.find(…)` returned
`undefined`, and the slot kept its old dinner. Only a full reload would have
shown it. Now the handler re-reads pools via the existing `getPools`, so what
renders is exactly what was stored.

**(b) Then wiped.** `persistPools` deletes a slot's rows before inserting the
new ones. **Ashley's ruling, asked and answered: meals she asked for survive.**
Chat-added options now carry `USER_REQUESTED_TAG`; `persistPools` reads them
out before the delete and re-appends them after. Fixed in that one function on
purpose — it is the only place the delete happens, so regenerate-all and
regenerate-one-slot both inherit the rule rather than one honouring it.

## Gates, and three checks that were wrong first

- `test:exercise-detail`: every branch that sets `detailTarget` also renders a
  dialog driven by it.
- `test:dashboard`: the refresh token reaches the hook's deps; App feeds it;
  the meal handler re-reads the pool; the marker exists, is written, is read
  before the delete and re-inserted after; the name is not hard-truncated.

Six mutations, all red — **after two of the checks were rewritten**, which is
the part worth keeping:

| first version | why it passed a broken app |
|---|---|
| counted `<ExerciseDetailDialog>` vs `setDetailTarget` file-wide | deleting the session branch's dialog left the other one, and only that branch sets the state — right things counted in the wrong scope |
| tested `/keptRows/` over `persistPools` | stripping `...keptRows` from the insert left the declaration sitting above it, doing nothing — presence is not use |

Both were found by running the mutations, not by reading the checks. That is
now three times in two days that a first-draft check was satisfied by
something other than the behaviour it named.

## Verification, and its limit

`npm run build`, `tsc --noEmit`, and nine neighbouring gates pass.

`test:meal-quality` fails — **and it fails identically on a clean tree**,
verified by stashing every change and re-running: `pools={}` for every
profile, because it needs a live meal-generation call the sandbox cannot make.
Pre-existing and unrelated; recorded rather than fixed here.

**None of these four can be proven from here.** All are render and refresh
behaviour, the sandbox cannot reach Supabase, and headless rendering stops at
the sign-in screen. The gates prove the wiring; only a tap proves the dialog
opens and the strip repaints. Handed over, not claimed.
